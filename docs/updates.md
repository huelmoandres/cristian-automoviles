# Publicar actualizaciones

En **Configuración → Actualizaciones**, el usuario puede buscar una versión, descargarla e instalarla. En Windows el instalador cierra la app; en macOS y Linux se reinicia al terminar. Las actualizaciones conservan la carpeta de datos de la aplicación. No cambies `identifier` (`com.cristianautomoviles.app`) ni el modo de instalación (`currentUser`).

Modificar el código local no actualiza las computadoras: cada versión debe compilarse, firmarse y publicarse. Una instalación anterior que todavía no tiene este sistema necesita instalar manualmente la primera versión que lo incluya.

## Configuración inicial

Elegí un destino HTTPS público para `latest.json` y los instaladores. Puede ser un servidor propio o un repositorio público de GitHub Releases. La app del cliente no debe llevar un token de GitHub. El código fuente puede estar en otro repositorio privado; solo los archivos de distribución necesitan estar disponibles para los clientes.

Generá la clave una sola vez, **fuera de este repositorio**, y guardá una copia segura de la clave privada y su contraseña:

```sh
npm run tauri signer generate -- -w /ruta/segura/cristian-updater.key
```

El comando crea la clave privada y `cristian-updater.key.pub`. Tauri exige una firma para las actualizaciones; conservar la misma clave privada permite seguir actualizando a los clientes instalados.

Configurá la dirección real del manifiesto y el archivo de clave **pública**:

```sh
node scripts/configure-updater.mjs \
  --endpoint "https://TU-SERVIDOR/latest.json" \
  --public-key /ruta/segura/cristian-updater.key.pub
```

Para GitHub Releases, la URL es `https://github.com/PROPIETARIO/REPOSITORIO/releases/latest/download/latest.json`. Reemplazá los nombres por los reales. El script guarda la clave pública y la URL en `src-tauri/tauri.conf.json`, y activa `requireSignedVersion` para que el cliente también compruebe la versión firmada. Todo queda incluido en el próximo instalador. No activa una URL de ejemplo ni genera claves por su cuenta.

## Compilar cada versión

1. Subí la versión en `package.json`, `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json`. Las tres deben coincidir y usar `X.Y.Z`; cada actualización debe ser mayor que la anterior.
2. Disponé la clave privada como variable de entorno `TAURI_SIGNING_PRIVATE_KEY` (acepta su ruta). Si tiene contraseña, usá `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. No guardes esos valores en archivos versionados ni los incluyas en mensajes o capturas.
3. Compilá con el script de publicación. Valida la configuración, la versión y la presencia de la clave; activa `createUpdaterArtifacts` mediante `src-tauri/tauri.updater.json`.

En Windows (PowerShell), con las herramientas de compilación de Tauri instaladas:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "C:\ruta-segura\cristian-updater.key"
# Si la clave tiene contraseña, definí TAURI_SIGNING_PRIVATE_KEY_PASSWORD en esta sesión.
node scripts/release-update.mjs --bundles nsis
```

Para generar el instalador de Windows desde macOS, con `cargo-xwin` y los requisitos del README:

```sh
export TAURI_SIGNING_PRIVATE_KEY="/ruta/segura/cristian-updater.key"
# Si la clave tiene contraseña, definí TAURI_SIGNING_PRIVATE_KEY_PASSWORD en esta sesión.
PATH="/opt/homebrew/opt/llvm/bin:$PATH" \
  node scripts/release-update.mjs \
  --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis
```

El build común `npm run tauri build` sigue disponible para desarrollo y no genera artefactos de actualización firmados por sí solo. Para publicar, usá siempre el script de release.

## Publicar el instalador y el manifiesto

El build de publicación genera el instalador `.exe` y su firma `.exe.sig`. En el build cruzado de Windows están en `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`; en un build nativo, en `src-tauri/target/release/bundle/nsis/`.

Generá el manifiesto con la ruta real del `.exe` y la URL HTTPS donde vas a subir **ese mismo archivo**:

```sh
node scripts/create-update-manifest.mjs \
  --installer "/ruta/al/instalador-setup.exe" \
  --url "https://TU-SERVIDOR/instalador-setup.exe"
```

Para GitHub Releases, la URL del archivo tiene la forma `https://github.com/PROPIETARIO/REPOSITORIO/releases/download/v0.1.1/NOMBRE-REAL-DEL-INSTALADOR.exe`. La versión del ejemplo debe coincidir con la release y el nombre con el archivo generado.

El script lee la firma de la ruta del instalador seguida de `.sig` y la verifica criptográficamente con la clave pública configurada. Comprueba tanto el contenido del instalador como la versión incluida en el comentario firmado; debe coincidir con las versiones de los tres archivos del proyecto. Así evita anunciar un instalador anterior con un número de versión nuevo. La verificación usa un hash por bloques, sin cargar todo el instalador en memoria.

Las firmas generadas por `tauri build` incluyen la versión automáticamente. Si firmás un archivo manualmente, usá `npm run tauri signer sign -- --app-version X.Y.Z RUTA_AL_ARCHIVO`; una firma sin versión o con una versión distinta se rechaza. También se requiere el formato prehash actual de Tauri (`ED`).

El resultado se escribe en `src-tauri/target/updates/latest.json`. Opcionalmente acepta `--notes /ruta/notas.txt` y `--output /ruta/latest.json`. El resultado debe conservar el nombre `latest.json` si esa es la URL configurada en la app.

Subí el instalador, su `.sig` y `latest.json` al destino. En un servidor propio, subí primero el instalador y publicá el manifiesto al final. En GitHub, cargá los tres archivos en una release borrador y publicala cuando estén completos. Los clientes usan el manifiesto para encontrar y verificar la descarga.

El script genera un manifiesto para una plataforma, `windows-x86_64` por defecto. Para otros sistemas permite `--platform darwin-aarch64`, `darwin-x86_64` o `linux-x86_64`, usando el archivo de actualización y la firma que genera Tauri para esa plataforma. Si distribuís varias plataformas desde el mismo manifiesto, reuní sus entradas en `platforms` antes de publicarlo; no reemplaces un manifiesto multiplataforma por uno con una sola entrada.

## Crear versiones desde GitHub Actions

El workflow **Windows release** (`.github/workflows/release.yml`) se ejecuta manualmente desde **Actions → Windows release → Run workflow**. Compila Windows x64, valida la firma y crea una release **en borrador** con el instalador, su `.sig` y `latest.json`. No se ejecuta con cada push ni publica el borrador automáticamente.

Antes de usarlo:

1. Configurá el endpoint real de GitHub Releases y la clave pública con `configure-updater.mjs`, y guardá esa configuración junto con el código. El endpoint debe coincidir con el repositorio destino.
2. En **Settings → Secrets and variables → Actions**, creá el secreto `TAURI_SIGNING_PRIVATE_KEY` con el **contenido** de la clave privada, no con una ruta de tu computadora. Si la clave tiene contraseña, creá también `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Conservá una copia segura de ambos fuera de GitHub.
3. El repositorio destino debe ser público y activo para que los clientes puedan descargar actualizaciones sin credenciales. Por defecto, se usa el mismo repositorio del código. Si el código queda privado, podés crear otro repositorio público con un README inicial y configurar la variable `RELEASES_REPOSITORY` (`propietario/nombre`) y el secreto `RELEASES_TOKEN`, con permiso de escritura **Contents** limitado al repositorio de distribución. La clave pública y el endpoint de la app deben apuntar a ese destino público.
4. Subí las tres versiones del proyecto a un número nuevo y ejecutá el workflow sobre el commit correspondiente. Si seleccionás un tag, debe llamarse `vX.Y.Z` y coincidir con la versión del proyecto.

El proceso verifica el destino público antes de compilar, ejecuta las comprobaciones de código y genera el instalador con los scripts de publicación existentes. Los archivos que adjunta tienen nombres ASCII, por ejemplo `cristian-automoviles_0.1.1_x64-setup.exe`, y el manifiesto apunta a la descarga de esa misma etiqueta.

Al terminar, abrí **Releases**, revisá el borrador y publicalo cuando quieras habilitar esa versión para los clientes. Podés repetir el workflow para reemplazar archivos de un borrador; si la versión ya está publicada, el proceso se detiene y exige aumentar la versión. Para un repositorio de distribución separado, el tag se crea sobre su rama predeterminada; el código privado no se adjunta a la release.

Si falla el último paso de GitHub, el instalador firmado queda disponible durante 14 días en los **Artifacts** de la ejecución. Se conservan únicamente el instalador, su firma y el manifiesto cuando pudo generarse; las claves privadas y contraseñas no se incluyen. La caché de Rust también se guarda aunque falle un paso posterior, para reutilizar la compilación al volver a ejecutar el workflow.

La primera versión con el endpoint y la clave pública configurados debe instalarse manualmente en cada PC. Las siguientes versiones publicadas con la misma clave podrán instalarse desde **Buscar actualizaciones**.

## Verificación antes de distribuir

- Instalá manualmente la primera versión con updater, después publicá una versión superior firmada con la misma clave.
- Desde esa primera instalación, usá **Buscar actualizaciones → Descargar e instalar**.
- Comprobá la nueva versión y que sigan presentes los clientes, vehículos, fotos, ventas y pagos.
- Probá sin conexión: debe mostrar un error de consulta, no afirmar que ya está actualizada.

Referencia: [Updater de Tauri](https://v2.tauri.app/plugin/updater/).

La verificación de firmas se puede probar sin claves privadas ni publicaciones: `node --test scripts/updater-utils.test.mjs`. Los tests usan el vector público de prueba del updater de Tauri, no una clave de producción.

El empaquetado y las protecciones del workflow se verifican sin acceder a GitHub con `node --test scripts/prepare-github-release.test.mjs`.
