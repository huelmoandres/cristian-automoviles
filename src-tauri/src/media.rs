//! Fotos de vehículos. Se importan desde un archivo elegido por el usuario, se normalizan
//! (orientación EXIF, tamaño máximo, JPEG) y se guardan en la carpeta de datos de la app.
//! La base de datos guarda solo el nombre del archivo de la portada.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::BufWriter;
use std::path::{Path, PathBuf};

use chrono::Utc;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageDecoder, ImageReader};

use crate::error::{AppError, AppResult};

/// Subcarpeta (dentro del directorio de datos) con las fotos. Debe coincidir con el
/// `assetProtocol.scope` de tauri.conf.json.
pub const VEHICLE_IMAGES_DIR: &str = "vehicle-images";

/// Formatos aceptados al importar.
pub const ALLOWED_EXTENSIONS: [&str; 4] = ["jpg", "jpeg", "png", "webp"];

const COVER_MAX_PX: u32 = 1600;
const THUMB_MAX_PX: u32 = 480;
const JPEG_QUALITY: u8 = 85;
const OUTPUT_EXTENSION: &str = "jpg";
const THUMB_SUFFIX: &str = "_thumb";

/// Nombre de la miniatura asociada a una portada: "abc.jpg" → "abc_thumb.jpg".
pub fn thumb_name(cover: &str) -> String {
    let stem = cover
        .strip_suffix(&format!(".{OUTPUT_EXTENSION}"))
        .unwrap_or(cover);
    format!("{stem}{THUMB_SUFFIX}.{OUTPUT_EXTENSION}")
}

/// Solo nombres simples generados por nosotros (sin rutas): evita salir de la carpeta.
pub(crate) fn is_safe_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
        && !name.starts_with('.')
}

fn image_error(err: image::ImageError) -> AppError {
    AppError::validation(format!("No se pudo procesar la imagen: {err}"))
}

fn io_error(err: std::io::Error) -> AppError {
    AppError::Internal(format!("archivo de imagen: {err}"))
}

pub struct MediaStore {
    dir: PathBuf,
}

impl MediaStore {
    pub fn new(dir: PathBuf) -> AppResult<Self> {
        fs::create_dir_all(&dir).map_err(io_error)?;
        Ok(Self { dir })
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn exists(&self, name: &str) -> bool {
        is_safe_name(name) && self.dir.join(name).is_file()
    }

    /// Importa una foto y devuelve el nombre de la portada generada.
    pub fn import(&self, source: &Path) -> AppResult<String> {
        let extension = source
            .extension()
            .and_then(|e| e.to_str())
            .map(str::to_lowercase)
            .unwrap_or_default();
        if !ALLOWED_EXTENSIONS.contains(&extension.as_str()) {
            return Err(AppError::validation(format!(
                "Formato no soportado. Usá {}",
                ALLOWED_EXTENSIONS.join(", ")
            )));
        }

        let mut decoder = ImageReader::open(source)
            .map_err(io_error)?
            .with_guessed_format()
            .map_err(io_error)?
            .into_decoder()
            .map_err(image_error)?;
        let orientation = decoder.orientation().map_err(image_error)?;
        let mut image = DynamicImage::from_decoder(decoder).map_err(image_error)?;
        image.apply_orientation(orientation);

        let name = format!("{}.{OUTPUT_EXTENSION}", Utc::now().format("%Y%m%d%H%M%S%f"));
        let cover = if image.width() > COVER_MAX_PX || image.height() > COVER_MAX_PX {
            image.resize(COVER_MAX_PX, COVER_MAX_PX, FilterType::Lanczos3)
        } else {
            image
        };
        self.save_jpeg(&cover, &name)?;
        self.save_jpeg(
            &cover.thumbnail(THUMB_MAX_PX, THUMB_MAX_PX),
            &thumb_name(&name),
        )?;
        Ok(name)
    }

    fn save_jpeg(&self, image: &DynamicImage, name: &str) -> AppResult<()> {
        let file = File::create(self.dir.join(name)).map_err(io_error)?;
        JpegEncoder::new_with_quality(BufWriter::new(file), JPEG_QUALITY)
            .encode_image(&image.to_rgb8())
            .map_err(image_error)
    }

    /// Borra una portada y su miniatura. Es "best effort": un archivo faltante no es error.
    pub fn remove(&self, cover: &str) {
        if !is_safe_name(cover) {
            return;
        }
        let _ = fs::remove_file(self.dir.join(cover));
        let _ = fs::remove_file(self.dir.join(thumb_name(cover)));
    }

    /// Borra las fotos que no usa ningún vehículo (p. ej. importadas en un formulario
    /// que se canceló). Devuelve cuántas portadas se eliminaron.
    pub fn remove_unreferenced(&self, referenced: &HashSet<String>) -> AppResult<usize> {
        let mut removed = 0;
        for entry in fs::read_dir(&self.dir).map_err(io_error)? {
            let name = entry
                .map_err(io_error)?
                .file_name()
                .to_string_lossy()
                .into_owned();
            let is_thumb = name.ends_with(&format!("{THUMB_SUFFIX}.{OUTPUT_EXTENSION}"));
            if !is_thumb && !referenced.contains(&name) {
                self.remove(&name);
                removed += 1;
            }
        }
        Ok(removed)
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;

    /// Carpeta temporal única por test.
    pub fn temp_store() -> MediaStore {
        let dir = std::env::temp_dir().join(format!(
            "cristian-media-test-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        MediaStore::new(dir).unwrap()
    }

    fn write_png(path: &Path, width: u32, height: u32) {
        image::RgbImage::from_pixel(width, height, image::Rgb([200, 20, 40]))
            .save(path)
            .unwrap();
    }

    #[test]
    fn thumb_name_adds_suffix() {
        assert_eq!(thumb_name("20261007.jpg"), "20261007_thumb.jpg");
    }

    #[test]
    fn rejects_unsafe_names() {
        assert!(!is_safe_name("../secret.jpg"));
        assert!(!is_safe_name("a/b.jpg"));
        assert!(!is_safe_name(".hidden"));
        assert!(is_safe_name("20261007123000123456.jpg"));
    }

    #[test]
    fn import_resizes_and_creates_thumbnail() {
        let store = temp_store();
        let source = store.dir().join("source.png");
        write_png(&source, 3200, 1600);
        let name = store.import(&source).unwrap();
        assert!(store.exists(&name));

        let cover = image::open(store.dir().join(&name)).unwrap();
        assert_eq!(
            (cover.width(), cover.height()),
            (COVER_MAX_PX, COVER_MAX_PX / 2)
        );
        let thumb = image::open(store.dir().join(thumb_name(&name))).unwrap();
        assert_eq!(thumb.width(), THUMB_MAX_PX);

        store.remove(&name);
        assert!(!store.exists(&name));
        assert!(!store.dir().join(thumb_name(&name)).exists());
    }

    #[test]
    fn import_rejects_other_formats() {
        let store = temp_store();
        let source = store.dir().join("doc.pdf");
        fs::write(&source, b"%PDF").unwrap();
        assert!(store.import(&source).is_err());
    }

    #[test]
    fn removes_only_unreferenced_covers() {
        let store = temp_store();
        let source = store.dir().join("source.png");
        write_png(&source, 100, 100);
        let kept = store.import(&source).unwrap();
        let orphan = store.import(&source).unwrap();
        fs::remove_file(&source).unwrap();

        let removed = store
            .remove_unreferenced(&HashSet::from([kept.clone()]))
            .unwrap();
        assert_eq!(removed, 1);
        assert!(store.exists(&kept));
        assert!(store.dir().join(thumb_name(&kept)).exists());
        assert!(!store.exists(&orphan));
    }
}
