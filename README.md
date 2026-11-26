# Cristian Automóviles

Aplicación de escritorio para la concesionaria: stock de vehículos, clientes, ventas financiadas en cuotas, cobranzas y recargos por mora.

**Stack:** Tauri 2 (Rust) · React 19 · TypeScript · Vite · Tailwind CSS v4 · SQLite (rusqlite) · react-hook-form + zod · TanStack Query · Radix.

Las [instrucciones para agentes](AGENTS.md) resumen las reglas para mantener los respaldos, las actualizaciones y las publicaciones.

## Desarrollo

```bash
npm install
npm run tauri dev      # abre la app con hot reload
npm run check          # typecheck + lint + clippy + tests de Rust
npm run bindings       # regenera los tipos TS (src/bindings) desde los structs de Rust
```

### Instalador de Windows (desde macOS)

Compilación cruzada con `cargo-xwin` (genera un instalador NSIS `.exe`):

```bash
# Una sola vez
brew install nsis llvm lld
rustup target add x86_64-pc-windows-msvc
cargo install --locked cargo-xwin   # descarga el SDK de Windows (licencia de Microsoft)

# Cada build
PATH="/opt/homebrew/opt/llvm/bin:$PATH" \
  npm run tauri build -- --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis
```

El instalador queda en `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. Se instala para el usuario actual, sin permisos de administrador. Como no está firmado digitalmente, Windows SmartScreen puede advertir: hay que elegir "Más información → Ejecutar de todas formas".

La base de datos vive en `~/Library/Application Support/com.cristianautomoviles.app/cristian.db` (macOS).

## Respaldos y cambio de computadora

En **Configuración → Respaldos → Crear respaldo**, elegí dónde guardar el archivo `.zip`. Incluye toda la base de datos (usuario, configuración, clientes, vehículos, planes, ventas, cuotas y pagos), las fotos y sus miniaturas. Se toma una copia coherente aunque la app esté abierta.

Para cambiar de computadora, instalá la app en la nueva PC y elegí **Importar respaldo** en la pantalla de configuración inicial, o desde Configuración si ya creaste un usuario. Después ingresá con el usuario y la contraseña guardados en el respaldo. La importación **reemplaza** la instalación; no combina registros. El archivo se valida antes de restaurarlo y, si había un usuario, se crea una copia previa en `recovery-backups` dentro de la carpeta de datos de la app. Al terminar se muestra la ruta de esa copia.

Los respaldos no están cifrados y contienen datos del negocio: guardalos en una ubicación privada, preferentemente fuera de la PC de trabajo. Los límites de importación son 512 MB de base de datos, 64 MB por imagen y 8 GB en total sin comprimir.

## Actualizaciones desde la app

**Configuración → Actualizaciones** muestra la versión instalada y permite buscar, descargar e instalar nuevas versiones firmadas. El destino configurado es [GitHub Releases de Cristian Automóviles](https://github.com/huelmoandres/cristian-automoviles/releases), con una clave pública propia. Cada PC necesita instalar manualmente la primera versión compatible; las siguientes se descargan desde la app cuando se publica una versión superior.

El workflow manual **Windows release** compila el instalador firmado y crea una release borrador con su firma y `latest.json`. La [guía de publicación](docs/updates.md) explica cómo ejecutarlo y publicar la versión después de revisar el borrador. Cambiar el código local por sí solo no actualiza las instalaciones de los clientes.

## Arquitectura

- **Rust (`src-tauri/src`)** tiene toda la lógica de negocio y el acceso a SQLite.
  - `domain/finance.rs`: cálculos puros (cronograma de cuotas, recargo de financiación, mora, estados). Con tests.
  - `domain/status.rs`: enums de estado (`VehicleStatus`, `SaleStatus`, `PaymentMethod`…). Se guardan como texto en SQLite y exportan su tipo TS.
  - `commands/*`: un módulo por área. Cada uno tiene funciones testeables (`create`, `list`…) y los `#[tauri::command]` que las exponen.
  - `db/migrations/*.sql`: migraciones versionadas (`rusqlite_migration`).
- **Frontend (`src`)**
  - `bindings/`: tipos generados por `ts-rs`, no se editan a mano.
  - `lib/`: `api.ts` (invoke tipado), `constants.ts`, `routes.ts`, `query-keys.ts`, `validation.ts` (bloques zod reutilizables), `format.ts`, `labels.ts`.
  - `components/ui`: componentes base. `components/form`: campos conectados a react-hook-form.
  - `features/<área>/`: `schema.ts` (zod + mappers form ↔ input), `hooks.ts` (queries y mutations), `components/` y la página.

### Convenciones

- Dinero en **centavos** (`i64`/`number`) y porcentajes en **puntos básicos** (2000 = 20%): sin errores de redondeo.
- Las ventas guardan una copia del recargo del plan, de la mora y de los días de gracia: cambiar la configuración no altera contratos existentes.
- Monedas fijas: **USD** (por defecto) y **UYU**, definidas como enum `Currency` en `domain/status.rs`. No hay otras.

## Logo y fotos

- Logo: `src/assets/logo.png` (fondo transparente, pensado para superficies oscuras `bg-ink`). Colores de marca en `src/index.css` (`--color-brand-*`, `brand-600` = rojo del logo).
- Ícono de la app: `npm run tauri icon ruta/al/icono.png` (imagen cuadrada de 1024×1024 o más).
- Fotos de vehículos: se guardan optimizadas (JPEG, portada máx. 1600 px + miniatura 480 px) en `<datos de la app>/vehicle-images/`. Las que no usa ningún vehículo se borran al iniciar la app.
