# Instrucciones del proyecto

Leé `README.md` y `docs/updates.md` antes de modificar respaldos, el actualizador o el proceso de publicación. La guía de publicación contiene los comandos y el procedimiento completo.

## Actualizaciones y publicaciones

- El actualizador ya está configurado para `huelmoandres/cristian-automoviles`. Conservá el endpoint de GitHub Releases, la clave pública existente y `requireSignedVersion: true`. Reutilizá la clave de firma persistente; no generes una nueva para cada versión.
- La primera instalación compatible se hace manualmente. Después, el usuario elige **Configuración → Actualizaciones → Buscar actualizaciones → Descargar e instalar** y confirma. La app descarga, verifica la firma, instala y se reinicia conservando los datos. Este flujo requiere la acción del usuario; no es una actualización silenciosa al iniciar.
- Para publicar una versión nueva, aumentá el número y mantenelo coincidente en `package.json`, `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json`. Mantené los archivos de bloqueo correspondientes actualizados.
- El workflow **Windows release** (`.github/workflows/release.yml`) se ejecuta manualmente. Compila Windows x64 y prepara una release **en borrador** con el instalador `.exe`, su `.sig` y `latest.json`. Publicar el borrador habilita la versión para los clientes.
- Un commit o push de código no actualiza las instalaciones. Al informar resultados, distinguí código subido, compilación aprobada, borrador creado y release publicada. No sobrescribas una versión ya publicada; prepará una versión superior.
- Las claves privadas y sus contraseñas se conservan fuera del repositorio y en los secretos `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` de GitHub Actions. No las incluyas en código, logs, artifacts ni respaldos de clientes. La app distribuida usa la clave pública y no lleva tokens de GitHub.

## Datos y respaldos

- Conservá `identifier = com.cristianautomoviles.app`, el modo de instalación `currentUser` y el almacenamiento de datos fuera del directorio del programa. Una actualización debe preservar la base `cristian.db` y `vehicle-images`.
- Los respaldos portátiles incluyen un snapshot SQLite coherente con WAL, las fotos y sus miniaturas. No reemplaces este mecanismo por una copia directa de la base abierta.
- Preservá la validación y el staging antes de restaurar, la copia de recuperación de instalaciones existentes y la restauración segura de base y fotos. La importación debe estar disponible en el primer inicio sin crear un usuario descartable; al terminar se cierra la sesión y se ingresa con el usuario del respaldo.

## Verificación

- Para cambios de aplicación, ejecutá `npm run check` y las comprobaciones adicionales pertinentes al cambio.
- Para cambios de publicación, ejecutá `node --test scripts/updater-utils.test.mjs scripts/prepare-github-release.test.mjs`.
- Un cambio exclusivamente de documentación no requiere aumentar la versión ni generar otro instalador.
