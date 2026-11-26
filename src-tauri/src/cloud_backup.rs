//! Daily encrypted R2 backups, with credentials kept outside portable snapshots.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use age::secrecy::SecretString;
use chrono::{DateTime, NaiveDateTime, TimeDelta, Utc};
use s3::{creds::Credentials, Bucket, Region};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tempfile::{NamedTempFile, TempDir};
use ts_rs::TS;
use uuid::Uuid;
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

use crate::commands::backup;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

const PREFIX: &str = "cristian-automoviles/";
const RETENTION: usize = 30;
const INTERVAL_HOURS: i64 = 24;
const RETRY_MINUTES: i64 = 15;
const MAX_CLOUD_BYTES: u64 = 9 * 1024 * 1024 * 1024;
const MAX_LIST_ENTRIES: usize = 100_000;
const KEYRING_SERVICE: &str = "com.cristianautomoviles.app.cloud-backup";
const CONFIG_FILE: &str = "cloud-backup.json";

#[derive(Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct CloudBackupInput {
    pub account_id: String,
    pub bucket: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub passphrase: String,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CloudBackupStatus {
    pub configured: bool,
    pub enabled: bool,
    pub in_progress: bool,
    pub account_id: Option<String>,
    pub bucket: Option<String>,
    pub last_success_at: Option<String>,
    pub next_backup_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CloudBackupEntry {
    pub key: String,
    pub created_at: String,
    #[ts(type = "number")]
    pub size_bytes: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    version: u8,
    account_id: String,
    bucket: String,
    credential_id: String,
    enabled: bool,
    last_success_at: Option<DateTime<Utc>>,
    last_attempt_at: Option<DateTime<Utc>>,
    last_error: Option<String>,
}

#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Secrets {
    access_key_id: String,
    secret_access_key: String,
    passphrase: String,
}

#[derive(Default)]
struct Runtime {
    config: Option<Config>,
    load_error: Option<String>,
}

pub struct CloudBackupState {
    directory: PathBuf,
    runtime: Mutex<Runtime>,
    busy: AtomicBool,
}

struct BusyGuard<'a>(&'a AtomicBool);

impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

fn storage_error() -> AppError {
    AppError::Internal("No se pudo guardar o leer la configuración del respaldo en la nube".into())
}

fn network_error() -> AppError {
    AppError::validation(
        "No se pudo completar la operación en Cloudflare R2. Revisá internet, la cuenta, el bucket y los permisos de la credencial.",
    )
}

fn credential_error() -> AppError {
    AppError::validation(
        "No se pudo acceder al almacén seguro del sistema. Volvé a configurar las credenciales del respaldo.",
    )
}

fn file_error() -> AppError {
    AppError::Internal("No se pudo leer o escribir el archivo temporal de respaldo".into())
}

fn has_user(state: &AppState) -> AppResult<bool> {
    state
        .conn()?
        .query_row("SELECT EXISTS(SELECT 1 FROM users)", [], |row| row.get(0))
        .map_err(Into::into)
}

/// Only an empty installation may configure recovery without a signed-in user.
fn may_access(state: &AppState) -> AppResult<()> {
    if has_user(state)? {
        state.require_auth()?;
    }
    Ok(())
}

fn validate_target(account_id: &str, bucket: &str) -> AppResult<()> {
    if account_id.len() != 32 || !account_id.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::validation(
            "El ID de cuenta de Cloudflare debe tener 32 caracteres hexadecimales",
        ));
    }
    if !(3..=63).contains(&bucket.len())
        || !bucket
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        || !bucket.as_bytes()[0].is_ascii_alphanumeric()
        || !bucket.as_bytes()[bucket.len() - 1].is_ascii_alphanumeric()
    {
        return Err(AppError::validation("El bucket debe tener entre 3 y 63 caracteres: letras minúsculas, números y guiones, sin guiones en los extremos"));
    }
    Ok(())
}

fn validate_input(input: &CloudBackupInput) -> AppResult<()> {
    validate_target(&input.account_id, &input.bucket)?;
    if input.access_key_id.len() != 32
        || !input.access_key_id.bytes().all(|c| c.is_ascii_hexdigit())
        || input.secret_access_key.len() != 64
        || !input
            .secret_access_key
            .bytes()
            .all(|c| c.is_ascii_hexdigit())
    {
        return Err(AppError::validation("Ingresá el Access Key ID y el Secret Access Key de R2, no un token general de Cloudflare"));
    }
    if !(12..=256).contains(&input.passphrase.chars().count())
        || input.passphrase.trim().chars().count() < 12
    {
        return Err(AppError::validation("La contraseña del respaldo debe tener entre 12 y 256 caracteres. Guardá una copia fuera de esta PC."));
    }
    Ok(())
}

fn keyring_entry(id: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, id).map_err(|_| credential_error())
}

fn load_secrets(config: &Config) -> AppResult<Secrets> {
    let encoded = Zeroizing::new(
        keyring_entry(&config.credential_id)?
            .get_password()
            .map_err(|_| credential_error())?,
    );
    serde_json::from_str(&encoded).map_err(|_| credential_error())
}

fn save_secrets(id: &str, secrets: &Secrets) -> AppResult<()> {
    let encoded = Zeroizing::new(serde_json::to_string(secrets).map_err(|_| credential_error())?);
    keyring_entry(id)?
        .set_password(&encoded)
        .map_err(|_| credential_error())
}

fn next_due(config: &Config, now: DateTime<Utc>) -> DateTime<Utc> {
    let daily = config
        .last_success_at
        .filter(|last| *last <= now)
        .map_or(now, |last| last + TimeDelta::hours(INTERVAL_HOURS));
    let retry = config
        .last_attempt_at
        .filter(|last| *last <= now)
        .map_or(daily, |last| last + TimeDelta::minutes(RETRY_MINUTES));
    daily.max(retry)
}

fn backup_key(now: DateTime<Utc>) -> String {
    format!(
        "{PREFIX}{}-{}.zip.age",
        now.format("%Y%m%dT%H%M%SZ"),
        Uuid::new_v4().simple()
    )
}

/// Strict ownership checks keep retention and restore away from unrelated bucket objects.
fn key_created_at(key: &str) -> Option<DateTime<Utc>> {
    let name = key.strip_prefix(PREFIX)?.strip_suffix(".zip.age")?;
    let (date, id) = name.split_once('-')?;
    if date.len() != 16 || id.len() != 32 || !id.bytes().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    NaiveDateTime::parse_from_str(date, "%Y%m%dT%H%M%SZ")
        .ok()
        .map(|dt| dt.and_utc())
}

fn retained_entries(mut entries: Vec<CloudBackupEntry>) -> Vec<CloudBackupEntry> {
    entries.retain(|entry| key_created_at(&entry.key).is_some());
    entries.sort_by(|a, b| b.key.cmp(&a.key));
    entries
}

trait CloudStore {
    fn upload(&self, key: &str, source: &Path) -> AppResult<()>;
    fn size(&self, key: &str) -> AppResult<u64>;
    fn list(&self) -> AppResult<Vec<CloudBackupEntry>>;
    fn download(&self, key: &str, writer: &mut (dyn Write + Send)) -> AppResult<()>;
    fn delete(&self, key: &str) -> AppResult<()>;
}

struct R2Store(Box<Bucket>);

impl R2Store {
    fn new(config: &Config, secrets: &Secrets) -> AppResult<Self> {
        validate_target(&config.account_id, &config.bucket)?;
        let credentials = Credentials::new(
            Some(&secrets.access_key_id),
            Some(&secrets.secret_access_key),
            None,
            None,
            None,
        )
        .map_err(|_| credential_error())?;
        let region = Region::Custom {
            region: "auto".into(),
            endpoint: format!("https://{}.r2.cloudflarestorage.com", config.account_id),
        };
        let bucket = Bucket::new(&config.bucket, region, credentials)
            .map_err(|_| network_error())?
            .with_path_style()
            .with_request_timeout(Duration::from_secs(120))
            .map_err(|_| network_error())?;
        Ok(Self(bucket))
    }
}

fn check_http(code: u16) -> AppResult<()> {
    if (200..300).contains(&code) {
        Ok(())
    } else {
        Err(network_error())
    }
}

impl CloudStore for R2Store {
    fn upload(&self, key: &str, source: &Path) -> AppResult<()> {
        let mut reader = File::open(source).map_err(|_| file_error())?;
        let result = self
            .0
            .put_object_stream(&mut reader, key)
            .map_err(|_| network_error())?;
        check_http(result)
    }

    fn size(&self, key: &str) -> AppResult<u64> {
        let (head, code) = self.0.head_object(key).map_err(|_| network_error())?;
        check_http(code)?;
        head.content_length
            .and_then(|value| u64::try_from(value).ok())
            .ok_or_else(network_error)
    }

    fn list(&self) -> AppResult<Vec<CloudBackupEntry>> {
        let mut token = None;
        let mut result = Vec::new();
        let mut inspected = 0;
        let mut pages = 0;
        loop {
            pages += 1;
            if pages > MAX_LIST_ENTRIES / 1000 {
                return Err(network_error());
            }
            let (page, code) = self
                .0
                .list_page(PREFIX.into(), None, token.clone(), None, Some(1000))
                .map_err(|_| network_error())?;
            check_http(code)?;
            inspected += page.contents.len();
            if inspected > MAX_LIST_ENTRIES {
                return Err(AppError::validation(
                    "El historial de R2 supera el límite de archivos permitido",
                ));
            }
            for object in page.contents {
                if let Some(date) = key_created_at(&object.key) {
                    result.push(CloudBackupEntry {
                        key: object.key,
                        created_at: date.to_rfc3339(),
                        size_bytes: object.size,
                    });
                }
            }
            if !page.is_truncated {
                break;
            }
            let next = page.next_continuation_token.ok_or_else(network_error)?;
            if token.as_ref() == Some(&next) || next.is_empty() {
                return Err(network_error());
            }
            token = Some(next);
        }
        Ok(retained_entries(result))
    }

    fn download(&self, key: &str, writer: &mut (dyn Write + Send)) -> AppResult<()> {
        let code = self
            .0
            .get_object_to_writer(key, writer)
            .map_err(|_| network_error())?;
        check_http(code)
    }

    fn delete(&self, key: &str) -> AppResult<()> {
        if key_created_at(key).is_none() {
            return Err(AppError::validation("Nombre de respaldo inválido"));
        }
        let result = self.0.delete_object(key).map_err(|_| network_error())?;
        check_http(result.status_code())
    }
}

struct LimitedWriter<W> {
    inner: W,
    written: u64,
    limit: u64,
}

impl<W: Write> Write for LimitedWriter<W> {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        if buffer.len() as u64 > self.limit.saturating_sub(self.written) {
            return Err(io::Error::other("El respaldo supera el tamaño permitido"));
        }
        let written = self.inner.write(buffer)?;
        self.written += written as u64;
        Ok(written)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

fn encrypt_file(source: &Path, destination: &Path, passphrase: &str) -> AppResult<()> {
    let mut input = File::open(source).map_err(|_| file_error())?;
    let output = File::create(destination).map_err(|_| file_error())?;
    let limited = LimitedWriter {
        inner: output,
        written: 0,
        limit: MAX_CLOUD_BYTES,
    };
    let encryptor = age::Encryptor::with_user_passphrase(SecretString::from(passphrase.to_owned()));
    let mut writer = encryptor.wrap_output(limited).map_err(|_| file_error())?;
    io::copy(&mut input, &mut writer).map_err(|_| file_error())?;
    writer
        .finish()
        .map_err(|_| file_error())?
        .inner
        .sync_all()
        .map_err(|_| file_error())
}

fn decrypt_file(source: &Path, destination: &Path, passphrase: &str) -> AppResult<()> {
    let decrypt_error = || {
        AppError::validation("No se pudo descifrar el respaldo. La contraseña es incorrecta o el archivo está dañado.")
    };
    let input = File::open(source).map_err(|_| file_error())?;
    let decryptor = age::Decryptor::new(input).map_err(|_| decrypt_error())?;
    if !decryptor.is_scrypt() {
        return Err(decrypt_error());
    }
    let mut identity = age::scrypt::Identity::new(SecretString::from(passphrase.to_owned()));
    identity.set_max_work_factor(20);
    let mut reader = decryptor
        .decrypt(std::iter::once(&identity as &dyn age::Identity))
        .map_err(|_| decrypt_error())?;
    let output = File::create(destination).map_err(|_| file_error())?;
    let mut writer = LimitedWriter {
        inner: output,
        written: 0,
        limit: MAX_CLOUD_BYTES,
    };
    io::copy(&mut reader, &mut writer).map_err(|_| decrypt_error())?;
    writer.inner.sync_all().map_err(|_| file_error())
}

fn upload_verified(store: &dyn CloudStore, key: &str, source: &Path) -> AppResult<()> {
    let size = fs::metadata(source).map_err(|_| file_error())?.len();
    if size == 0 || size > MAX_CLOUD_BYTES {
        return Err(AppError::validation(
            "El respaldo supera el tamaño permitido",
        ));
    }
    store.upload(key, source)?;
    if store.size(key)? != size {
        return Err(AppError::validation(
            "R2 no confirmó el tamaño completo del respaldo. Se volverá a intentar.",
        ));
    }
    Ok(())
}

fn prune(store: &dyn CloudStore, protected_key: &str) -> AppResult<()> {
    let entries = retained_entries(store.list()?);
    if !entries.iter().any(|entry| entry.key == protected_key) {
        return Err(network_error());
    }
    // A clock rollback must never cause retention to delete the just-confirmed snapshot.
    for entry in entries
        .into_iter()
        .filter(|entry| entry.key != protected_key)
        .skip(RETENTION - 1)
    {
        store.delete(&entry.key)?;
    }
    Ok(())
}

impl CloudBackupState {
    pub fn new(directory: PathBuf) -> Self {
        let path = directory.join(CONFIG_FILE);
        let runtime = match fs::read(&path) {
            Ok(bytes) => match serde_json::from_slice::<Config>(&bytes) {
                Ok(config) if config.version == 1 && validate_target(&config.account_id, &config.bucket).is_ok() && Uuid::parse_str(&config.credential_id).is_ok() => Runtime { config: Some(config), load_error: None },
                _ => Runtime { config: None, load_error: Some("La configuración de R2 está dañada. Volvé a configurarla para reanudar los respaldos.".into()) },
            },
            Err(error) if error.kind() == io::ErrorKind::NotFound => Runtime::default(),
            Err(_) => Runtime { config: None, load_error: Some(storage_error().to_string()) },
        };
        Self {
            directory,
            runtime: Mutex::new(runtime),
            busy: AtomicBool::new(false),
        }
    }

    fn runtime(&self) -> AppResult<MutexGuard<'_, Runtime>> {
        self.runtime.lock().map_err(|_| storage_error())
    }

    fn acquire(&self) -> AppResult<BusyGuard<'_>> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| {
                AppError::validation(
                    "Ya hay una operación de respaldo en curso. Esperá a que termine.",
                )
            })?;
        Ok(BusyGuard(&self.busy))
    }

    fn config(&self) -> AppResult<Config> {
        self.runtime()?
            .config
            .clone()
            .ok_or_else(|| AppError::validation("Configurá Cloudflare R2 antes de continuar"))
    }

    fn save(&self, config: &Config) -> AppResult<()> {
        fs::create_dir_all(&self.directory).map_err(|_| storage_error())?;
        let mut output = NamedTempFile::new_in(&self.directory).map_err(|_| storage_error())?;
        serde_json::to_writer_pretty(&mut output, config).map_err(|_| storage_error())?;
        output.as_file().sync_all().map_err(|_| storage_error())?;
        output
            .persist(self.directory.join(CONFIG_FILE))
            .map_err(|_| storage_error())?;
        let mut runtime = self.runtime()?;
        runtime.config = Some(config.clone());
        runtime.load_error = None;
        Ok(())
    }

    fn status(&self) -> AppResult<CloudBackupStatus> {
        let runtime = self.runtime()?;
        let config = runtime.config.as_ref();
        Ok(CloudBackupStatus {
            configured: config.is_some(),
            enabled: config.is_some_and(|c| c.enabled),
            in_progress: self.busy.load(Ordering::Acquire),
            account_id: config.map(|c| c.account_id.clone()),
            bucket: config.map(|c| c.bucket.clone()),
            last_success_at: config.and_then(|c| c.last_success_at.map(|date| date.to_rfc3339())),
            next_backup_at: config
                .filter(|c| c.enabled)
                .map(|c| next_due(c, Utc::now()).to_rfc3339()),
            last_error: config
                .and_then(|c| c.last_error.clone())
                .or_else(|| runtime.load_error.clone()),
        })
    }

    fn perform_backup(&self, state: &AppState, config: Config) -> AppResult<()> {
        self.perform_backup_using(state, config, |config| {
            let secrets = load_secrets(config)?;
            let store = R2Store::new(config, &secrets)?;
            Ok((secrets, Box::new(store)))
        })
    }

    fn reset_after_restore(&self, config: Option<Config>) {
        let Some(mut config) = config else {
            return;
        };
        config.last_success_at = None;
        config.last_attempt_at = None;
        config.last_error = None;
        // Data has already been restored; a settings write failure must not hide success.
        if self.save(&config).is_err() {
            config.last_error = Some("Los datos se restauraron, pero no se pudo guardar el estado del respaldo automático. Revisá la configuración de R2.".into());
            if let Ok(mut runtime) = self.runtime() {
                runtime.config = Some(config);
            }
        }
    }

    pub(crate) fn import_local(
        &self,
        state: &AppState,
        source: &Path,
    ) -> AppResult<Option<String>> {
        may_access(state)?;
        let _guard = self.acquire()?;
        let config = self.runtime()?.config.clone();
        let recovery = backup::import(state, source)?;
        self.reset_after_restore(config);
        Ok(recovery)
    }

    fn perform_backup_using<F>(
        &self,
        state: &AppState,
        mut config: Config,
        connect: F,
    ) -> AppResult<()>
    where
        F: FnOnce(&Config) -> AppResult<(Secrets, Box<dyn CloudStore>)>,
    {
        let snapshot_at = Utc::now();
        config.last_attempt_at = Some(snapshot_at);
        if let Err(error) = self.save(&config) {
            config.last_error = Some(error.to_string());
            self.runtime()?.config = Some(config);
            return Err(error);
        }
        let result: AppResult<()> = (|| {
            let (secrets, store) = connect(&config)?;
            let staging = TempDir::new().map_err(|_| file_error())?;
            let plain = staging.path().join("respaldo.zip");
            let encrypted = staging.path().join("respaldo.zip.age");
            // The database lock ends inside export_for_cloud, before encryption or networking.
            backup::export_for_cloud(state, &plain)?;
            encrypt_file(&plain, &encrypted, &secrets.passphrase)?;
            fs::remove_file(&plain).map_err(|_| file_error())?;
            let key = backup_key(snapshot_at);
            upload_verified(store.as_ref(), &key, &encrypted)?;
            config.last_success_at = Some(snapshot_at);
            config.last_error = None;
            // Persist success before pruning: retention failure must not conceal a valid backup.
            self.save(&config)?;
            if prune(store.as_ref(), &key).is_err() {
                config.last_error = Some("El respaldo se subió correctamente, pero no se pudieron eliminar las copias antiguas. Revisá los permisos y las reglas de retención de R2.".into());
                self.save(&config)?;
            }
            Ok(())
        })();
        if let Err(error) = &result {
            config.last_attempt_at = Some(Utc::now());
            config.last_error = Some(error.to_string());
            // Keep the retry delay in memory even if persisting the status also fails.
            if self.save(&config).is_err() {
                if let Ok(mut runtime) = self.runtime() {
                    runtime.config = Some(config);
                }
            }
        }
        result
    }

    /// Called at startup and while the app runs; no UI session is needed for an enabled schedule.
    pub fn tick(&self, state: &AppState) {
        if !has_user(state).unwrap_or(false) {
            return;
        }
        let Ok(_guard) = self.acquire() else {
            return;
        };
        let Ok(config) = self.config() else {
            return;
        };
        let now = Utc::now();
        if !config.enabled || now < next_due(&config, now) {
            return;
        }
        let _ = self.perform_backup(state, config);
    }
}

#[tauri::command(async)]
pub fn cloud_backup_status(
    state: State<'_, AppState>,
    cloud: State<'_, CloudBackupState>,
) -> AppResult<CloudBackupStatus> {
    may_access(&state)?;
    cloud.status()
}

#[tauri::command(async)]
pub async fn configure_cloud_backup(
    app: AppHandle,
    input: CloudBackupInput,
) -> AppResult<CloudBackupStatus> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let cloud = app.state::<CloudBackupState>();
        may_access(&state)?;
        validate_input(&input)?;
        let guard = cloud.acquire()?;
        let previous = cloud.runtime()?.config.clone();
        let secrets = Secrets {
            access_key_id: input.access_key_id,
            secret_access_key: input.secret_access_key,
            passphrase: input.passphrase,
        };
        let config = Config {
            version: 1,
            account_id: input.account_id.to_ascii_lowercase(),
            bucket: input.bucket,
            credential_id: Uuid::new_v4().to_string(),
            enabled: true,
            last_success_at: None,
            last_attempt_at: None,
            last_error: None,
        };
        // Read-only connectivity check before replacing a working configuration.
        R2Store::new(&config, &secrets)?.list()?;
        may_access(&state)?;
        save_secrets(&config.credential_id, &secrets)?;
        if let Err(error) = cloud.save(&config) {
            if let Ok(entry) = keyring_entry(&config.credential_id) {
                let _ = entry.delete_credential();
            }
            return Err(error);
        }
        if let Some(previous) = previous {
            if let Ok(entry) = keyring_entry(&previous.credential_id) {
                let _ = entry.delete_credential();
            }
        }
        drop(guard);
        cloud.status()
    })
    .await
}

#[tauri::command(async)]
pub fn disable_cloud_backup(
    state: State<'_, AppState>,
    cloud: State<'_, CloudBackupState>,
) -> AppResult<CloudBackupStatus> {
    may_access(&state)?;
    let guard = cloud.acquire()?;
    let mut config = cloud.config()?;
    config.enabled = false;
    cloud.save(&config)?;
    drop(guard);
    cloud.status()
}

#[tauri::command(async)]
pub async fn run_cloud_backup(app: AppHandle) -> AppResult<CloudBackupStatus> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let cloud = app.state::<CloudBackupState>();
        state.require_auth()?;
        let guard = cloud.acquire()?;
        cloud.perform_backup(&state, cloud.config()?)?;
        drop(guard);
        cloud.status()
    })
    .await
}

#[tauri::command(async)]
pub async fn list_cloud_backups(app: AppHandle) -> AppResult<Vec<CloudBackupEntry>> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let cloud = app.state::<CloudBackupState>();
        may_access(&state)?;
        let _guard = cloud.acquire()?;
        let config = cloud.config()?;
        let secrets = load_secrets(&config)?;
        R2Store::new(&config, &secrets)?.list()
    })
    .await
}

#[tauri::command(async)]
pub async fn restore_cloud_backup(app: AppHandle, key: String) -> AppResult<Option<String>> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        let cloud = app.state::<CloudBackupState>();
        may_access(&state)?;
        if key_created_at(&key).is_none() {
            return Err(AppError::validation(
                "El respaldo seleccionado no es válido",
            ));
        }
        let _guard = cloud.acquire()?;
        let config = cloud.config()?;
        let secrets = load_secrets(&config)?;
        let store = R2Store::new(&config, &secrets)?;
        restore_using(&cloud, &state, config, &secrets, &store, &key)
    })
    .await
}

/// Keep blocking HTTP, keychain and encryption work off the async command executor.
async fn run_blocking<T, F>(operation: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|_| {
            AppError::Internal("La operación de respaldo se interrumpió. Volvé a intentar.".into())
        })?
}

fn restore_using(
    cloud: &CloudBackupState,
    state: &AppState,
    config: Config,
    secrets: &Secrets,
    store: &dyn CloudStore,
    key: &str,
) -> AppResult<Option<String>> {
    may_access(state)?;
    if key_created_at(key).is_none() {
        return Err(AppError::validation(
            "El respaldo seleccionado no es válido",
        ));
    }
    let expected = store.size(key)?;
    if expected == 0 || expected > MAX_CLOUD_BYTES {
        return Err(AppError::validation(
            "El respaldo supera el tamaño permitido",
        ));
    }
    let staging = TempDir::new().map_err(|_| file_error())?;
    let encrypted = staging.path().join("respaldo.zip.age");
    let plain = staging.path().join("respaldo.zip");
    let output = File::create(&encrypted).map_err(|_| file_error())?;
    let mut writer = LimitedWriter {
        inner: output,
        written: 0,
        limit: expected,
    };
    store.download(key, &mut writer)?;
    if writer.written != expected {
        return Err(AppError::validation(
            "La descarga del respaldo está incompleta",
        ));
    }
    writer.inner.sync_all().map_err(|_| file_error())?;
    decrypt_file(&encrypted, &plain, &secrets.passphrase)?;
    may_access(state)?;
    let recovery = backup::import(state, &plain)?;
    cloud.reset_after_restore(Some(config));
    Ok(recovery)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, media, media::MediaStore};
    use argon2::{Argon2, PasswordHasher};
    use std::cell::RefCell;
    use std::collections::BTreeMap;
    use std::rc::Rc;

    fn config() -> Config {
        Config {
            version: 1,
            account_id: "a".repeat(32),
            bucket: "private-backups".into(),
            credential_id: Uuid::new_v4().to_string(),
            enabled: true,
            last_success_at: None,
            last_attempt_at: None,
            last_error: None,
        }
    }

    fn app_state(directory: &Path, populated: bool) -> AppState {
        fs::create_dir_all(directory).unwrap();
        let state = AppState::new(
            db::open(&directory.join("cristian.db")).unwrap(),
            MediaStore::new(directory.join(media::VEHICLE_IMAGES_DIR)).unwrap(),
        );
        if populated {
            let conn = state.conn().unwrap();
            conn.pragma_update(None, "wal_autocheckpoint", 0).unwrap();
            let hash = Argon2::default()
                .hash_password(b"secret123")
                .unwrap()
                .to_string();
            conn.execute(
                "INSERT INTO users(username,password_hash) VALUES ('owner',?1)",
                [hash],
            )
            .unwrap();
            conn.execute("INSERT INTO clients(first_name,last_name,document_number) VALUES ('Ana','Pérez','12345678')", []).unwrap();
            conn.execute("INSERT INTO vehicles(brand,model,year,condition,sale_price_cents,currency,cover_image) VALUES ('Toyota','Corolla',2020,'used',1200000,'USD','photo.jpg')", []).unwrap();
            fs::write(state.media.dir().join("photo.jpg"), b"photo-in-cloud").unwrap();
            fs::write(state.media.dir().join("photo_thumb.jpg"), b"thumb-in-cloud").unwrap();
        }
        state
    }

    fn secrets() -> Secrets {
        Secrets {
            access_key_id: "a".repeat(32),
            secret_access_key: "b".repeat(64),
            passphrase: "offline-recovery-passphrase".into(),
        }
    }

    #[derive(Clone, Default)]
    struct MemoryStore {
        objects: Rc<RefCell<BTreeMap<String, Vec<u8>>>>,
        fail_upload: bool,
    }

    impl CloudStore for MemoryStore {
        fn upload(&self, key: &str, source: &Path) -> AppResult<()> {
            if self.fail_upload {
                return Err(network_error());
            }
            self.objects
                .borrow_mut()
                .insert(key.into(), fs::read(source).map_err(|_| file_error())?);
            Ok(())
        }
        fn size(&self, key: &str) -> AppResult<u64> {
            self.objects
                .borrow()
                .get(key)
                .map(|bytes| bytes.len() as u64)
                .ok_or_else(network_error)
        }
        fn list(&self) -> AppResult<Vec<CloudBackupEntry>> {
            Ok(self
                .objects
                .borrow()
                .iter()
                .map(|(key, bytes)| CloudBackupEntry {
                    key: key.clone(),
                    created_at: key_created_at(key).unwrap().to_rfc3339(),
                    size_bytes: bytes.len() as u64,
                })
                .collect())
        }
        fn download(&self, key: &str, writer: &mut (dyn Write + Send)) -> AppResult<()> {
            writer
                .write_all(self.objects.borrow().get(key).ok_or_else(network_error)?)
                .map_err(|_| file_error())
        }
        fn delete(&self, key: &str) -> AppResult<()> {
            self.objects.borrow_mut().remove(key);
            Ok(())
        }
    }

    #[test]
    fn complete_backup_and_first_run_restore_preserve_wal_data_and_photos() {
        let directory = TempDir::new().unwrap();
        let source = app_state(&directory.path().join("source"), true);
        assert!(source.session().unwrap().is_none());
        let cloud = CloudBackupState::new(directory.path().join("cloud"));
        let store = MemoryStore::default();
        let upload_store = store.clone();
        cloud
            .perform_backup_using(&source, config(), |_| {
                Ok((secrets(), Box::new(upload_store)))
            })
            .unwrap();
        assert!(cloud.config().unwrap().last_success_at.is_some());
        assert!(cloud.config().unwrap().last_error.is_none());
        let key = store.list().unwrap()[0].key.clone();
        let destination = app_state(&directory.path().join("destination"), false);
        assert!(restore_using(
            &cloud,
            &destination,
            cloud.config().unwrap(),
            &secrets(),
            &store,
            &key
        )
        .unwrap()
        .is_none());
        let conn = destination.conn().unwrap();
        assert_eq!(
            conn.query_row("SELECT username FROM users", [], |row| row
                .get::<_, String>(0))
                .unwrap(),
            "owner"
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM clients", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        let photo: String = conn
            .query_row("SELECT cover_image FROM vehicles", [], |row| row.get(0))
            .unwrap();
        assert_eq!(
            fs::read(destination.media.dir().join(&photo)).unwrap(),
            b"photo-in-cloud"
        );
        assert_eq!(
            fs::read(destination.media.dir().join(media::thumb_name(&photo))).unwrap(),
            b"thumb-in-cloud"
        );
        assert!(destination.session().unwrap().is_none());
        assert!(cloud.config().unwrap().last_success_at.is_none());
    }

    #[test]
    fn failed_upload_preserves_last_confirmed_backup_and_records_retry() {
        let directory = TempDir::new().unwrap();
        let source = app_state(&directory.path().join("source"), true);
        let cloud = CloudBackupState::new(directory.path().join("cloud"));
        let mut config = config();
        let confirmed = Utc::now() - TimeDelta::hours(25);
        config.last_success_at = Some(confirmed);
        let store = MemoryStore {
            fail_upload: true,
            ..MemoryStore::default()
        };
        assert!(cloud
            .perform_backup_using(&source, config, |_| Ok((secrets(), Box::new(store))))
            .is_err());
        let saved = cloud.config().unwrap();
        assert_eq!(saved.last_success_at, Some(confirmed));
        assert!(saved.last_error.is_some());
        assert!(next_due(&saved, Utc::now()) > Utc::now() + TimeDelta::minutes(14));
    }

    #[test]
    fn local_import_is_exclusive_and_marks_restored_data_as_pending() {
        let directory = TempDir::new().unwrap();
        let source = app_state(&directory.path().join("source"), true);
        let archive = directory.path().join("local.zip");
        backup::export_for_cloud(&source, &archive).unwrap();
        let destination = app_state(&directory.path().join("destination"), false);
        let cloud = CloudBackupState::new(directory.path().join("cloud"));
        let mut config = config();
        config.last_success_at = Some(Utc::now());
        cloud.save(&config).unwrap();
        let busy = cloud.acquire().unwrap();
        assert!(cloud.import_local(&destination, &archive).is_err());
        assert!(!has_user(&destination).unwrap());
        drop(busy);
        assert!(cloud.import_local(&destination, &archive).is_ok());
        assert!(has_user(&destination).unwrap());
        assert!(cloud.config().unwrap().last_success_at.is_none());
    }

    #[test]
    fn wrong_password_never_installs_data_and_settings_failure_does_not_hide_successful_restore() {
        let directory = TempDir::new().unwrap();
        let source = app_state(&directory.path().join("source"), true);
        let cloud = CloudBackupState::new(directory.path().join("cloud"));
        let store = MemoryStore::default();
        let upload_store = store.clone();
        cloud
            .perform_backup_using(&source, config(), |_| {
                Ok((secrets(), Box::new(upload_store)))
            })
            .unwrap();
        let key = store.list().unwrap()[0].key.clone();
        let destination = app_state(&directory.path().join("destination"), false);
        let mut wrong = secrets();
        wrong.passphrase = "wrong-backup-password".into();
        assert!(restore_using(
            &cloud,
            &destination,
            cloud.config().unwrap(),
            &wrong,
            &store,
            &key
        )
        .is_err());
        assert!(!has_user(&destination).unwrap());
        let path = directory.path().join("config-is-a-file");
        fs::write(&path, b"not-a-directory").unwrap();
        let failed_settings = CloudBackupState::new(path);
        assert!(restore_using(
            &failed_settings,
            &destination,
            cloud.config().unwrap(),
            &secrets(),
            &store,
            &key
        )
        .is_ok());
        assert!(has_user(&destination).unwrap());
        assert!(failed_settings
            .status()
            .unwrap()
            .last_error
            .unwrap()
            .contains("se restauraron"));
    }

    #[test]
    fn daily_schedule_catches_up_and_waits_between_retries() {
        let now = DateTime::parse_from_rfc3339("2026-11-26T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let mut config = config();
        assert_eq!(next_due(&config, now), now);
        config.last_success_at = Some(now);
        config.last_attempt_at = Some(now);
        assert_eq!(next_due(&config, now), now + TimeDelta::hours(24));
        let overdue = now + TimeDelta::hours(25);
        assert!(next_due(&config, overdue) <= overdue);
        config.last_attempt_at = Some(overdue);
        assert_eq!(next_due(&config, overdue), overdue + TimeDelta::minutes(15));
        assert_eq!(config.last_success_at, Some(now));
        // An unbacked installation and one just restored must be due on their first tick.
        assert!(now >= next_due(&super::tests::config(), now));
        config.last_success_at = Some(now + TimeDelta::days(30));
        config.last_attempt_at = Some(now + TimeDelta::days(30));
        assert_eq!(next_due(&config, now), now);
        config.last_attempt_at = Some(now);
        assert_eq!(next_due(&config, now), now + TimeDelta::minutes(15));
    }

    #[test]
    fn rejects_arbitrary_endpoints_bucket_paths_and_weak_passphrases() {
        assert!(validate_target(&"a".repeat(32), "valid-bucket").is_ok());
        for account in [
            "localhost",
            "a.r2.cloudflarestorage.com",
            "https://example.com",
        ] {
            assert!(validate_target(account, "valid-bucket").is_err());
        }
        for bucket in [
            "../another",
            "A-bucket",
            "-bucket",
            "bucket-",
            "a",
            "bucket/path",
        ] {
            assert!(validate_target(&"a".repeat(32), bucket).is_err());
        }
        let mut input = CloudBackupInput {
            account_id: "a".repeat(32),
            bucket: "valid-bucket".into(),
            access_key_id: "b".repeat(32),
            secret_access_key: "c".repeat(64),
            passphrase: "long-secret-passphrase".into(),
        };
        assert!(validate_input(&input).is_ok());
        input.passphrase = "            ".into();
        assert!(validate_input(&input).is_err());
    }

    #[test]
    fn backup_names_are_unique_and_never_accept_foreign_objects() {
        let now = Utc::now();
        let key = backup_key(now);
        assert!(key_created_at(&key).is_some());
        assert_ne!(key, backup_key(now));
        for key in [
            "other/20261126T120000Z-a.zip.age",
            "cristian-automoviles/../../file.zip.age",
            "cristian-automoviles/readme.zip.age",
            "cristian-automoviles/20269999T120000Z-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.zip.age",
        ] {
            assert!(key_created_at(key).is_none());
        }
    }

    #[test]
    fn age_roundtrip_rejects_wrong_password_and_modified_ciphertext() {
        let dir = TempDir::new().unwrap();
        let source = dir.path().join("source.zip");
        let encrypted = dir.path().join("backup.age");
        let restored = dir.path().join("restored.zip");
        let data = vec![42; 80_000];
        fs::write(&source, &data).unwrap();
        encrypt_file(&source, &encrypted, "secret-kept-outside-this-pc").unwrap();
        decrypt_file(&encrypted, &restored, "secret-kept-outside-this-pc").unwrap();
        assert_eq!(fs::read(&restored).unwrap(), data);
        assert!(decrypt_file(&encrypted, &restored, "wrong-password").is_err());
        let mut bytes = fs::read(&encrypted).unwrap();
        *bytes.last_mut().unwrap() ^= 1;
        fs::write(&encrypted, bytes).unwrap();
        assert!(decrypt_file(&encrypted, &restored, "secret-kept-outside-this-pc").is_err());
    }

    struct FakeStore {
        size: u64,
        fail_upload: bool,
        deleted: RefCell<Vec<String>>,
        entries: Vec<CloudBackupEntry>,
    }
    impl CloudStore for FakeStore {
        fn upload(&self, _: &str, _: &Path) -> AppResult<()> {
            if self.fail_upload {
                Err(network_error())
            } else {
                Ok(())
            }
        }
        fn size(&self, _: &str) -> AppResult<u64> {
            Ok(self.size)
        }
        fn list(&self) -> AppResult<Vec<CloudBackupEntry>> {
            Ok(self.entries.clone())
        }
        fn download(&self, _: &str, _: &mut (dyn Write + Send)) -> AppResult<()> {
            unreachable!()
        }
        fn delete(&self, key: &str) -> AppResult<()> {
            self.deleted.borrow_mut().push(key.into());
            Ok(())
        }
    }

    #[test]
    fn upload_must_succeed_and_match_remote_size_before_retention() {
        let file = NamedTempFile::new().unwrap();
        fs::write(file.path(), b"encrypted-file").unwrap();
        let mut store = FakeStore {
            size: 14,
            fail_upload: true,
            deleted: RefCell::new(Vec::new()),
            entries: Vec::new(),
        };
        assert!(upload_verified(&store, &backup_key(Utc::now()), file.path()).is_err());
        store.fail_upload = false;
        store.size = 1;
        assert!(upload_verified(&store, &backup_key(Utc::now()), file.path()).is_err());
        assert!(store.deleted.borrow().is_empty());
        store.size = 14;
        assert!(upload_verified(&store, &backup_key(Utc::now()), file.path()).is_ok());
    }

    #[test]
    fn retention_keeps_thirty_newest_owned_backups_and_ignores_other_files() {
        let now = Utc::now();
        let mut entries: Vec<_> = (0..35)
            .map(|days| {
                let created = now - TimeDelta::days(days);
                CloudBackupEntry {
                    key: backup_key(created),
                    created_at: created.to_rfc3339(),
                    size_bytes: 1,
                }
            })
            .collect();
        entries.push(CloudBackupEntry {
            key: format!("{PREFIX}do-not-delete.txt"),
            created_at: now.to_rfc3339(),
            size_bytes: 1,
        });
        let store = FakeStore {
            size: 1,
            fail_upload: false,
            deleted: RefCell::new(Vec::new()),
            entries: entries.clone(),
        };
        prune(&store, &entries[0].key).unwrap();
        assert_eq!(store.deleted.borrow().len(), 5);
        for entry in &entries[..30] {
            assert!(!store.deleted.borrow().contains(&entry.key));
        }
        assert!(!store.deleted.borrow().contains(&entries[35].key));
    }

    #[test]
    fn retention_protects_new_snapshot_when_existing_keys_have_future_dates() {
        let now = Utc::now();
        let protected = backup_key(now);
        let mut entries: Vec<_> = (1..32)
            .map(|day| {
                let date = now + TimeDelta::days(day);
                CloudBackupEntry {
                    key: backup_key(date),
                    created_at: date.to_rfc3339(),
                    size_bytes: 1,
                }
            })
            .collect();
        entries.push(CloudBackupEntry {
            key: protected.clone(),
            created_at: now.to_rfc3339(),
            size_bytes: 1,
        });
        let store = FakeStore {
            size: 1,
            fail_upload: false,
            deleted: RefCell::new(Vec::new()),
            entries,
        };
        prune(&store, &protected).unwrap();
        assert_eq!(store.deleted.borrow().len(), 2);
        assert!(!store.deleted.borrow().contains(&protected));
    }

    #[test]
    fn exclusion_is_released_after_error_and_state_persists_without_secrets() {
        let directory = TempDir::new().unwrap();
        let state = CloudBackupState::new(directory.path().into());
        let guard = state.acquire().unwrap();
        assert!(state.acquire().is_err());
        drop(guard);
        assert!(state.acquire().is_ok());
        let mut config = config();
        config.last_success_at = Some(Utc::now() - TimeDelta::hours(25));
        state.save(&config).unwrap();
        let saved = fs::read_to_string(directory.path().join(CONFIG_FILE)).unwrap();
        assert!(!saved.contains("passphrase"));
        assert!(!saved.contains("secretAccessKey"));
        let reloaded = CloudBackupState::new(directory.path().into());
        assert!(next_due(&reloaded.config().unwrap(), Utc::now()) < Utc::now());
    }

    #[test]
    fn streaming_limits_reject_oversized_downloads() {
        let mut writer = LimitedWriter {
            inner: Vec::new(),
            written: 0,
            limit: 3,
        };
        writer.write_all(b"abc").unwrap();
        assert!(writer.write_all(b"d").is_err());
        assert_eq!(writer.inner, b"abc");
    }

    #[test]
    fn blocking_command_panic_returns_error_and_releases_busy_guard() {
        let directory = TempDir::new().unwrap();
        let state = std::sync::Arc::new(CloudBackupState::new(directory.path().into()));
        let operation_state = state.clone();
        let result: AppResult<()> = tauri::async_runtime::block_on(run_blocking(move || {
            let _guard = operation_state.acquire()?;
            panic!("simulated blocking operation failure");
        }));
        assert!(
            matches!(result, Err(AppError::Internal(message)) if message == "La operación de respaldo se interrumpió. Volvé a intentar.")
        );
        assert!(!state.busy.load(Ordering::Acquire));
        assert!(state.acquire().is_ok());
    }

    #[test]
    fn blocking_command_runs_on_another_thread_and_preserves_operation_errors() {
        let caller = std::thread::current().id();
        tauri::async_runtime::block_on(async {
            let worker = run_blocking(|| Ok(std::thread::current().id()))
                .await
                .unwrap();
            assert_ne!(worker, caller);
            let result: AppResult<()> =
                run_blocking(|| Err(AppError::validation("Error de prueba"))).await;
            assert_eq!(result.unwrap_err().to_string(), "Error de prueba");
        });
    }
}
