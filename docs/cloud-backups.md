# Respaldos diarios en Cloudflare R2

La base principal sigue siendo SQLite en la PC. La app crea el mismo snapshot coherente usado por el respaldo portátil, incluyendo los cambios confirmados del WAL, las fotos y sus miniaturas; cifra el archivo con una contraseña y lo sube a un bucket privado de R2. No hace falta Railway ni un servidor propio.

## Preparar Cloudflare

1. En la cuenta de Cloudflare, habilitá **R2 Object Storage** y creá un bucket dedicado, por ejemplo `cristian-automoviles-backups`, con clase **Standard**. Conservá deshabilitado el acceso público.
2. Desde **R2 → Manage API Tokens**, creá una credencial S3 con permiso **Object Read & Write**, limitada exclusivamente a ese bucket. La aplicación necesita subir, listar, descargar y eliminar las copias antiguas. No uses un token de administración de la cuenta.
3. Guardá el **Account ID**, el nombre del bucket, el **Access Key ID** y el **Secret Access Key** en un gestor de contraseñas. El secreto solo se muestra al crearlo. El Account ID tiene 32 caracteres hexadecimales; no es el correo ni una URL.
4. Elegí una contraseña exclusiva para cifrar los respaldos, de al menos 12 caracteres. Guardala en el mismo gestor, accesible fuera de la PC del negocio. La contraseña de ingreso a la aplicación es independiente.

La aplicación deriva el endpoint HTTPS a partir del Account ID; no permite destinos arbitrarios. Todos los objetos que administra tienen el prefijo `cristian-automoviles/` y extensión `.zip.age`.

## Conectar la aplicación

1. Ingresá a la app y abrí **Configuración → Respaldos en la nube**.
2. Completá los datos anteriores, repetí la contraseña de cifrado y confirmá que conservaste los datos de recuperación fuera de la PC.
3. Guardá la configuración y usá **Respaldar ahora** para verificar la primera subida.
4. Confirmá que aparece una fecha de respaldo exitoso y que la copia se puede listar en el historial remoto. Una configuración guardada por sí sola no demuestra que ya exista un respaldo.

Los secretos se guardan en Keychain de macOS, Credential Manager de Windows o el servicio de secretos persistente de Linux. Si el sistema no permite guardarlos de forma segura, la configuración falla: no se escriben en texto plano como alternativa. La configuración pública y el estado de la programación quedan fuera de `cristian.db`, para que importar un respaldo no reemplace las credenciales.

## Frecuencia, errores y espacio

- Se programa una copia cada **24 horas desde el último snapshot subido y confirmado**. La primera copia queda pendiente al activar la función.
- La programación funciona mientras el proceso de la app está abierto, incluso antes de iniciar sesión en una instalación ya configurada. No se crean respaldos de una instalación vacía.
- Al volver a abrir o reanudar la PC se comprueba si hay una copia pendiente. No se pueden subir archivos con la PC apagada.
- Los fallos se reintentan con espera. El estado de la última copia exitosa solo avanza después de confirmar la subida; la aplicación muestra los errores y permite reintentar manualmente.
- Se intenta conservar un máximo de **30 copias completas**, eliminando las más antiguas solo después de confirmar una nueva. Las copias manuales también cuentan. Desactivar los respaldos no elimina los objetos remotos.
- Cada copia completa ocupa espacio, incluyendo sus fotos. Revisá el uso de R2 de toda la cuenta: el cupo gratuito no corresponde a cada bucket. No se garantiza costo cero.
- Si configurás **bucket locks**, las reglas pueden impedir eliminar copias antiguas. Coordiná la retención del bucket con la de la app y revisá los avisos: pueden conservarse más de 30 copias mientras estén bloqueadas.

La app no mantiene dos PC sincronizadas y no debe usarse el mismo bucket como una base compartida. Si se pierde la PC, se recupera hasta el snapshot de la última copia confirmada. Puede faltar hasta un día de trabajo en condiciones normales, o más si la app estaba cerrada, no había conexión o fallaron las subidas.

## Recuperar otra computadora

1. Instalá una versión compatible de la app en la nueva PC.
2. En **Configuración inicial**, elegí **Recuperar desde la nube**, sin crear un usuario descartable.
3. Conectá el mismo Account ID y bucket, con las credenciales S3 y la contraseña de cifrado originales.
4. Cargá el historial, elegí una copia por fecha y confirmá la restauración. La app descarga y descifra antes de validar e instalar la base y las fotos.
5. Ingresá con el usuario y la contraseña de la aplicación incluidos en el respaldo.

También se puede restaurar desde Configuración en una instalación existente. Se exige iniciar sesión, se reemplazan los registros (no se combinan), se crea una copia local de recuperación y al finalizar se cierra la sesión. Guardá la ruta de esa copia antes de continuar.

Cambiar la contraseña de cifrado no vuelve a cifrar las copias anteriores. Conservá las contraseñas previas mientras necesites recuperar esas copias.

## Comprobación antes de confiar en el respaldo

Hacé una prueba con un bucket dedicado de prueba, sin modificar la instalación de producción:

1. Creá una copia que contenga clientes, una venta, un pago y fotos.
2. Listala desde otra instalación vacía y restaurala usando únicamente los datos conservados fuera de la primera PC.
3. Comprobá usuarios, importes, cuotas, pagos, fotos y miniaturas.
4. Probá una contraseña incorrecta y una descarga fallida: no deben reemplazar los datos de destino.
5. Cerrá y reabrí la app con un respaldo vencido; verificá que se haga la copia pendiente. Probá sin conexión y luego reconectá: el error no debe adelantar la fecha de éxito.

La verificación local de código no sustituye esta prueba con el bucket real. No compartas credenciales ni contraseñas en mensajes, capturas, registros o archivos del repositorio.

Referencias: [Configurar la API S3 de R2](https://developers.cloudflare.com/r2/get-started/s3/), [precios y cupo gratuito](https://developers.cloudflare.com/r2/pricing/), [bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/).
