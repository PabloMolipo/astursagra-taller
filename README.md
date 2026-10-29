# AsturSagra · Taller

Marca en `frontend/public/brand/`: logo (`astursagra-logo.svg`, `-negativo.svg` para fondos oscuros), símbolo e icono de app, más PNG, favicon y `manifest.webmanifest`. Colores: azul `#1E4E8C`, oro `#F2B705`, ocre `#C98A2B`. Tipografía: Montserrat 800.

- `backend/` — ASP.NET Core Web API (.NET 10) + EF Core (Npgsql)
- `frontend/` — Angular 21
- `docker-compose.yml` — PostgreSQL 17

## Arrancar en local

```bash
docker compose up -d
dotnet run --project backend/Taller.Api --launch-profile http
npm start --prefix frontend
```

- API: http://localhost:5078 (OpenAPI en `/openapi/v1.json`)
- Web: http://localhost:4200 (proxy `/api` y `/media` → API)

En desarrollo la API aplica las migraciones pendientes al arrancar. La primera vez crea también el contenido inicial de la web (datos del taller y 6 servicios).

## Áreas

| Ruta | Área | Quién |
|---|---|---|
| `/`, `/servicios`, `/trabajos`, `/contacto` | Web pública | Cualquiera |
| `/acceso` | Inicio de sesión | — |
| `/mi-area` | Vehículos e intervenciones del cliente (solo lectura, sin costes ni notas internas) | Rol `Cliente` |
| `/gestion` | Tablero del taller (página de inicio), órdenes, clientes, vehículos y contenido de la web | Rol `Taller` |

### Tablero del taller (página de inicio de Gestión)

Kanban con los coches del taller por estado: Recibido → En diagnóstico → Presupuestado → En reparación → Listo para recoger → Entregados (últimos 7 días, se puede ocultar). Las canceladas no salen.

- Cada tarjeta: nº de orden, días en el taller, matrícula, vehículo (y tipo si no es turismo), cliente, motivo, servicios, fecha de entrada y fecha prevista: **rojo** si va con retraso, **ámbar** si es para hoy o mañana. Lo más urgente, arriba.
- Se cambia el estado arrastrando la tarjeta a otra columna, o con las flechas ◀ ▶ (en el móvil). Pasar a Entregado pide confirmación. Un clic abre la orden.
- Indicadores: en el taller, retrasados, para hoy, listos para recoger y entregados en la semana. Búsqueda por matrícula, cliente, vehículo o motivo. Se actualiza solo cada minuto.

### Usuarios

- **Taller**: se crean desde consola. Genera una contraseña temporal que hay que cambiar al entrar. Si ya existe, la restablece.
  ```bash
  dotnet run --project backend/Taller.Api --launch-profile http -- crear-usuario-taller <usuario>
  ```
- **Clientes**: desde Gestión → ficha del cliente → "Acceso al área de clientes". Se genera una contraseña temporal para pasársela al cliente; desde ahí también se restablece o se quita.

Seguridad: ASP.NET Core Identity con cookie `HttpOnly` + `SameSite=Strict`; contraseñas de 8+ caracteres con minúscula y número; bloqueo de 10 minutos tras 5 fallos; al restablecer una contraseña se cierran las sesiones abiertas. Toda la API exige sesión salvo lo marcado como público (`/api/publico`, `/api/auth/login`, `/api/health`).

### Diagnóstico (Gestión → Diagnóstico y ficha de cada orden)

- **Ficha de diagnosis** por orden: síntomas, códigos leídos, mediciones, pruebas, conclusión y adjuntos privados (PDF/imagen, 25 MB). Los adjuntos se guardan en `backend/Taller.Api/privado/` (configurable con `Privado:Ruta`) y solo se descargan con un usuario del taller.
- **Códigos de avería**: biblioteca de ~150 códigos genéricos SAE en español (se crea al arrancar), decodificador estructural para el resto y códigos o notas propios. Cada código muestra los casos del taller en los que apareció.
- **Valores de referencia**: ~45 valores genéricos orientativos (eléctrico, turbo, rail, caudalímetro, compresiones, resistencias, A/A…) más los que añada el taller por marca o motor. Los genéricos se pueden corregir pero no borrar. Comparación al momento; en la ficha, cada medición se enlaza a una referencia y el resultado se calcula solo; en datos en vivo se muestran los enlazados por PID; el asistente los consulta con `consultar_valores_referencia`.
- **Documentación técnica** (Diagnóstico → Documentación): biblioteca privada de esquemas, manuales, procedimientos y boletines (PDF o imagen) clasificada por marca, modelo, código de motor, años y sistema. Cada vehículo y cada orden muestran los documentos compatibles (el vehículo tiene campo «código de motor») y los **portales** configurados, con `{vin}`, `{matricula}`, `{marca}` y `{modelo}` sustituidos. El asistente recibe documentos adjuntos (📎) y puede buscarlos y abrirlos con `listar_documentacion` y `ver_documento`; un documento usado en una consulta no se puede borrar hasta borrar esa consulta.
- **Despieces y esquemas** (catálogos gratuitos de otras webs): cada vehículo y cada orden muestran botones a los catálogos que cubren su marca, abiertos ya en su modelo por el bastidor: **RealOEM** (BMW y MINI, con los 7 últimos caracteres), **PartSouq** (muchas marcas, bastidor completo) y **7zap** (unas 70 marcas; abre la marca y el bastidor queda copiado para pegarlo). También buscan una referencia de pieza (sin espacios ni puntos). Su contenido no se copia ni se incrusta: esas webs no tienen API, bloquean el acceso automatizado y sus condiciones no lo permiten. Se configuran en Diagnóstico → Documentación (añadir otros, cambiar direcciones, marcas o alias, desactivar), con `{vin}`, `{vin7}`, `{marca}`, `{marca-slug}`, `{modelo}`, `{matricula}` y `{referencia}`. El asistente da esos enlaces con `buscar_despieces`; en sus respuestas los enlaces se abren en otra pestaña y muestran siempre el dominio.
- **Lector OBD**: ELM327 por USB o Bluetooth (emparejado como puerto COM) desde Chrome o Edge (Web Serial; requiere `localhost` o HTTPS). VIN, códigos almacenados, pendientes y permanentes, borrado y datos en vivo. Tiene un **modo demostración** sin adaptador.
- **Asistente IA** (Claude Opus 5.5, `claude-opus-5-5`): conversación por orden; recibe la ficha (sin datos del cliente) y consulta el historial, los valores de referencia, la documentación y los catálogos de despieces con sus herramientas (`buscar_casos_similares`, `consultar_codigo`, `consultar_valores_referencia`, `listar_documentacion`, `ver_documento`, `buscar_despieces`, `buscar_piezas_oem`). Respuesta en streaming (SSE), razonamiento adaptativo resumido, esfuerzo alto, caché automática del prompt y *fallback* del servidor (`fallbacks: "default"`) si un filtro de seguridad rechaza la petición. Cada turno se guarda completo o no se guarda.

Configurar la clave de la API de Anthropic (no va en el código):

```bash
dotnet user-secrets set "Anthropic:ApiKey" "sk-ant-..." --project backend/Taller.Api
```

En producción, usa la variable de entorno `Anthropic__ApiKey`. Sin clave, el asistente aparece como «no configurado» y el resto funciona igual. `Anthropic:BaseUrl` permite apuntar a un servidor de pruebas.

### Contabilidad (Gestión → Contabilidad)

Gestión interna de ingresos y gastos (no emite facturas legales ni lleva libros fiscales).

- **Resumen** por periodo (este mes, mes anterior, trimestre, año, año anterior o fechas): facturado (órdenes entregadas), cobrado (órdenes pagadas), gastos, resultado (cobrado − gastos), pendiente de cobro (órdenes listas o entregadas sin pagar, de cualquier fecha) y margen de las órdenes (mano de obra y piezas sin IVA − coste de las piezas). Gráfico de los últimos 12 meses (con vista de tabla), gastos por categoría, facturado por servicio, mejores clientes y listas de órdenes. `GET /api/contabilidad/resumen?desde=&hasta=`.
- **Gastos**: fecha, categoría, concepto, proveedor (sugeridos), importe, forma de pago, notas, orden opcional (compras de piezas para una reparación) y ticket o factura adjunta (foto o PDF, almacén privado). `/api/gastos` (CRUD, `?desde=&hasta=&categoria=&ordenId=&q=`, `/{id}/adjunto`). En cada orden, «Compras para esta orden» lista sus compras y permite añadir otra.
- **Beneficio**: cobrado − coste real de las piezas de las órdenes cobradas (el «Coste» de sus líneas) − gastos generales; las compras ligadas a una orden no se restan otra vez, porque su coste ya va en las líneas.
- **Con o sin IVA**: un selector en el Resumen muestra los importes de las órdenes con IVA o sin él (`?conIva=false`, base imponible); los gastos son siempre el importe pagado y el margen de las órdenes va siempre sin IVA. Se recuerda en cada navegador.
- **Ajustes**: IVA por defecto de las líneas nuevas (`/api/contabilidad/ajustes`; 21 % salvo que se cambie, 0 si no se aplica).
- **Presupuesto y proforma**: botones en la ficha de la orden que abren `/imprimir/orden/{id}/presupuesto|proforma`, una página A4 lista para imprimir o guardar como PDF con los datos del taller, del cliente y del vehículo, los conceptos y el total (el IVA solo aparece si alguna línea lo lleva). La proforma indica que no es una factura.
- **Factura**: «🧾 Emitir factura» en la ficha de la orden le asigna el siguiente número correlativo del año (`F2026-0001`, `F2026-0002`…) con la fecha que elijas al lado del botón (por defecto, la de entrega o hoy; para órdenes antiguas, una pasada, pero nunca anterior a la última factura de ese año) y guarda una copia fija de los datos del taller, del cliente y de los conceptos (`/imprimir/orden/{id}/factura` la muestra siempre igual, aunque luego cambien la ficha del cliente o del taller). Requiere el titular y el NIF del taller (Contabilidad → Ajustes, donde también va el texto opcional del pie) y la dirección (Web → Datos del taller). Sin NIF del cliente se emite como factura simplificada, solo hasta 400 € con IVA. Una vez emitida, la orden no se puede borrar ni cambiar sus conceptos (solo el coste de compra, que no se factura). «🔄 Reemitir» vuelve a generar la copia con los datos actuales del cliente, del vehículo y del taller (para corregir errores), conservando número, fecha e importes; no hay facturas rectificativas ni envío a Verifactu.

### Pago de las órdenes

**Histórico:** la fecha de entrada puede ser cualquier día pasado (desde el año 2000). En una orden entregada se puede cambiar la **fecha de entrega** (`PUT /api/ordenes/{id}/salida`) y, si está pagada, la **fecha de pago** (`PUT /api/ordenes/{id}/pagado` con `fecha`); ninguna puede ser futura ni anterior a la entrada. Así las órdenes antiguas cuentan en la contabilidad de su mes.

Cada orden tiene «Pagado» (sí/no, con la fecha en que se marcó), que se cambia en la ficha de la orden (`PUT /api/ordenes/{id}/pagado`). Se ve en la lista de órdenes (columna «Pago» y filtro «Sin cobrar», `?pagado=false`, sin canceladas), en el tablero (aviso en las listas y entregadas), en la visión 360 del vehículo (importe sin cobrar) y en el área del cliente («Pagado» / «Pendiente de pago»). Las órdenes anteriores a este cambio empiezan como no pagadas.

### Vista previa del área de un cliente

En la ficha de un cliente, «👁 Ver su área de cliente» abre Mi área con sus datos, tal como la ve el cliente, sin entrar con su usuario y sin cambiar la sesión del taller. Una franja indica que es una vista previa y «Salir de la vista previa» vuelve a la ficha. Funciona con la cookie `astursagra.vista` (id del cliente), que el servidor solo tiene en cuenta para usuarios del taller: un cliente que la ponga a mano sigue viendo solo lo suyo. Es de solo lectura, como el portal.

### Ficha del vehículo: visión 360

La ficha de cada vehículo abre con el vehículo en el centro y la información agrupada a su alrededor (`GET /api/vehiculos/{id}/resumen`):

- **Identificación**: bastidor, código de motor, año y, si se ha consultado la matrícula, motorización, versión y fecha de matriculación.
- **Propietario**: contacto, población, cliente desde y nº de vehículos.
- **Uso**: kilómetros (u horas en tractores y maquinaria) leídos en cada visita, en gráfica, y el uso anual estimado.
- **Historial**: visitas, última, facturado y margen (sin canceladas); la orden abierta, si la hay.
- **Diagnóstico**: códigos sin resolver de la última ficha de diagnosis y los repetidos en varias visitas.
- **Electrónica / REPRO**: reprogramaciones vinculadas.
- Debajo, accesos a fotos y vídeos (abre la última orden con alguno), documentación, despiece OEM y mecánico virtual.

Los datos editables (cliente, matrícula, motor, notas…) quedan en «Datos de la ficha» → «Editar ficha».

**En el área del cliente** (Mi área → vehículo) hay una visión 360 de solo lectura encima de las intervenciones (`GET /api/portal/vehiculos/{id}/resumen` e `/imagen`): imagen o silueta, identificación y color, uso, historial con el total invertido, la reparación en curso y las fotos y vídeos marcados como visibles para el cliente. No muestra márgenes, diagnóstico, REPRO ni herramientas del taller; cada cliente solo ve sus vehículos. En cada orden, el cliente ve además la **ficha de diagnosis**: síntomas, códigos de avería con su estado (los que no tienen descripción toman la de la biblioteca), mediciones con valor esperado y resultado, pruebas y conclusión; sin las notas internas. También ve las **fotos y vídeos** de la orden y los **documentos** (adjuntos de la diagnosis: informes PDF, capturas), que se descargan por `GET /api/portal/documentos/{id}` comprobando que la orden es suya. Todo lo que se sube es visible para el cliente por defecto; en la orden se puede ocultar cada foto, vídeo o documento («Visible para el cliente» / «Visible cliente», `PUT /api/diagnosis/adjuntos/{id}/visible`), y un aviso permite hacer visibles de golpe las fotos ocultas.

**Imagen del vehículo**: «Generar imagen con IA» pide a Gemini (`Gemini:ModeloImagen`, por defecto `gemini-3.1-flash-image`) una ilustración de perfil del modelo sobre fondo negro con el filo lima del portal, en el **color** que se elija (muestras de colores habituales o texto libre; se guarda como color del vehículo y, si no hay, gris grafito); solo se envían tipo, marca, modelo y año (nunca matrícula ni cliente). Se genera una vez, se guarda en el almacén privado y se puede regenerar, sustituir por una foto real («Subir foto», JPG/PNG/WebP hasta 10 MB) o quitar. Sin imagen se muestra una silueta del tipo de vehículo. **Requiere facturación activa** en el proyecto de Google AI Studio de la clave: el nivel gratuito no permite generar imágenes (cada una cuesta unos céntimos).

### Mecánico virtual (Gemini)

Gestión → «Mecánico virtual»: chat para dudas de mecánica, electricidad, averías y procedimientos con un modelo económico de Google, **Gemini 3.1 Flash-Lite** (`gemini-3.1-flash-lite`, configurable en `Gemini:Modelo`). Es independiente del asistente de diagnóstico (Claude, ligado a cada orden): no accede a los datos del taller.

- Conversaciones guardadas por usuario (cada uno ve solo las suyas), con título automático de la primera pregunta. Respuesta en streaming; se reenvían como mucho los 40 últimos mensajes, razonamiento bajo y 4.096 tokens de salida máximos, para mantener el coste en céntimos.
- Cada turno se guarda entero o no se guarda (si falla o se pulsa «Parar», la pregunta vuelve al cuadro de texto).
- **Burbuja en cada orden**: botón flotante «Mecánico virtual» abajo a la derecha de la ficha de la orden (a pantalla completa en el móvil). Abre la última conversación del usuario para esa orden (o una nueva con «＋») y en cada pregunta el servidor añade a las instrucciones los datos actuales de la orden, el vehículo (incluido el código de motor) y la ficha de diagnosis —la misma ficha que usa el asistente de diagnóstico, sin datos del cliente—. Esas conversaciones aparecen también en Gestión → Mecánico virtual marcadas como «Orden» y se borran al borrar la orden.
- Configuración: crea una clave en [Google AI Studio](https://aistudio.google.com/apikey) (mejor dentro del proyecto `astursagra`, con facturación, para que Google no use las conversaciones para entrenar como en el nivel gratuito) y guárdala:
  ```bash
  dotnet user-secrets set "Gemini:ApiKey" "<clave>" --project backend/Taller.Api
  ```
  En producción, secreto `gemini-api-key` (el script de despliegue lo pasa como `Gemini__ApiKey` si existe). `Gemini:BaseUrl` permite apuntar a un servidor de pruebas.

### Bastidor y datos por matrícula (MatriculaAPI, de pago)

En la ficha del vehículo, junto a la matrícula, «🔎 Buscar bastidor y datos» consulta [MatriculaAPI](https://www.matriculaapi.com/) (operación `CheckSpain`, o `CheckMotorBikeSpain` si el tipo es Moto). Muestra bastidor, marca, modelo, versión, fecha de matriculación y motor, y «Aplicar a la ficha» rellena bastidor, marca, modelo y año (hay que revisar y guardar). El servicio no siempre devuelve el bastidor: conviene comprobarlo con el del permiso de circulación o el del coche.

- Cuesta unos 0,20 € por consulta (bloques de 100; la cuenta de prueba trae 10 gratis). Cada matrícula consultada se guarda en la base de datos y se reutiliza sin coste; «Repetir la consulta» vuelve a pagar. Los errores no se guardan.
- Configuración: crea la cuenta en matriculaapi.com y guarda su nombre de usuario, que hace de clave:
  ```bash
  dotnet user-secrets set "MatriculaApi:Usuario" "<usuario>" --project backend/Taller.Api
  ```
  En producción, `MatriculaApi__Usuario`. Sin usuario, el botón no aparece. `MatriculaApi:Url` permite apuntar a un servidor de pruebas.

### Despiece original por bastidor (Vinalfa, de pago)

Con [Vinalfa](https://vinalfa.com/) configurado, el bloque «Despieces y esquemas» del vehículo y de la orden muestra «🔧 Despiece original», que abre `/gestion/vehiculos/{id}/despiece` dentro de la aplicación: identifica el vehículo por el bastidor de su ficha (o por los 7 últimos en BMW/MINI, o el FRAME en japoneses), deja elegir variante si hay varias, navega por grupos y secciones, busca por nombre o referencia y muestra el esquema con sus posiciones (al pulsar una se resalta su pieza) y la tabla de referencias, cantidades y notas. El asistente puede buscar referencias originales del bastidor de la orden con `buscar_piezas_oem`.

- Se usa la API de servidor V2 (`https://api.vinalfa.com/oem/v2`) a través de la API del taller: el token no sale del servidor y solo se aceptan bastidores y hash de catálogo (32 hexadecimales). Las imágenes de los esquemas son públicas (SVG de vinalfa.com) y se cargan directamente.
- La API no publica el formato detallado de sus respuestas: `core/vinalfa.ts` lo interpreta según respuestas reales (documentado en su cabecera) y, si algo no se reconoce, el visor enseña los «datos sin formato».
- Los nombres de grupos y piezas vienen en inglés aunque se pidan en español: busca en inglés («oil filter», «brake pad») o por referencia.
- Coste: cada bastidor cuenta una vez por día natural en el límite de la suscripción (plan Start: 36 $ cada 30 días, 100 bastidores; prueba de 5 días con 10). Navegar por su catálogo no vuelve a contar.
- Configuración: en la cuenta de Vinalfa, emite el **token de API** (no el token público del widget) y guárdalo:
  ```bash
  dotnet user-secrets set "Vinalfa:Token" "<token de API>" --project backend/Taller.Api
  ```
  En producción, `Vinalfa__Token`. Sin token, el botón no aparece. `Vinalfa:Url` permite apuntar a un servidor de pruebas.

### SharePoint (documentación y reprogramaciones)

Site https://palvarez.sharepoint.com/sites/Taller, dos bibliotecas. La sincronización es incremental (consulta *delta* de Microsoft Graph), automática cada 30 minutos y manual desde Diagnóstico → Documentación; cada biblioteca va por separado (si falla una, la otra sigue). Acceso de solo lectura. Como las consultas delta no traen la ruta de cada elemento, el árbol de carpetas se guarda por id (`CarpetasSharePoint`) y la ruta se reconstruye subiendo por los padres.

- **Documentación** (`SharePoint:Biblioteca`; vacía = la biblioteca principal): copia los PDF e imágenes (hasta 25 MB) a la biblioteca técnica. Si la primera carpeta empieza por una marca —«Seat Ibiza 6J», «VW Golf V», «Mercedes Sprinter»; alias y marcas conocidas en `Infrastructure/Marcas.cs` más las de los vehículos del taller— el documento es de esa marca y modelo (y la subcarpeta, el sistema); si no —«Common Rail», «Genéricos/Climatización»— es **genérico** de esa temática: está en la biblioteca y el asistente lo ve con `listar_documentacion`. Lo borrado en SharePoint se borra aquí (salvo si lo usa una consulta del asistente: se conserva marcado); los datos editados a mano no se pisan.
- **REPRO** (`SharePoint:BibliotecaRepro`, p. ej. `REPRO`; vacía = no se indexa): cada carpeta de primer nivel es una **reprogramación** hecha a un vehículo de un cliente. Se indexan sus archivos (de cualquier tipo y subcarpeta) **sin copiarlos**: al verlos se leen de SharePoint en el momento (`GET /api/repro/archivos/{id}/contenido`, con Range). Se vincula sola con el vehículo si su matrícula o su bastidor aparecen en el nombre de la carpeta; si no, se vincula a mano (y entonces la sincronización ya no la toca). Diagnóstico → **Reprogramaciones** (búsqueda por nombre, matrícula, cliente o modelo; filtro «sin vincular») y tarjeta «Reprogramaciones» en la ficha del vehículo. Visores: PDF, imagen, vídeo y texto integrados; Word/Excel en Office Online; el resto (`.bin`, `.ori`, `.mod`, `.frf`…) en un **visor hexadecimal** que pide solo la página que muestra (4 KB) y permite saltar a un offset; y **comparación** de dos binarios (original/modificado, detectados por el nombre): bytes y zonas cambiadas, y los dos archivos lado a lado con las diferencias resaltadas (hasta 64 MB). Los archivos se sirven con `nosniff` y, salvo los PDF, con CSP `sandbox`.

1. En [Entra ID](https://entra.microsoft.com) → *Registros de aplicaciones* → *Nuevo registro* (p. ej. «AsturSagra SharePoint», solo cuentas de este directorio, sin URI de redirección). Apunta el **Id. de aplicación (cliente)** y el **Id. de directorio (inquilino)**.
2. *Certificados y secretos* → *Nuevo secreto de cliente*. Copia el **valor** (solo se ve una vez) y anota cuándo caduca.
3. *Permisos de API* → *Microsoft Graph* → *Permisos de aplicación* → **Sites.Selected** → *Conceder consentimiento de administrador*.
4. Dale acceso de lectura **solo a ese site** (con Sites.Selected no basta el paso 3). Por ejemplo, con PnP PowerShell como administrador:
   ```powershell
   Grant-PnPAzureADAppSitePermission -AppId <ClientId> -DisplayName "AsturSagra" -Site https://palvarez.sharepoint.com/sites/Taller -Permissions Read
   ```
   (Alternativa más sencilla pero más amplia: usar **Sites.Read.All** en el paso 3 y saltarse este paso; la aplicación podría leer todos los sites.)
5. Configura la API (fuera del código):
   ```bash
   dotnet user-secrets set "SharePoint:TenantId" "<id-inquilino>" --project backend/Taller.Api
   dotnet user-secrets set "SharePoint:ClientId" "<id-aplicacion>" --project backend/Taller.Api
   dotnet user-secrets set "SharePoint:ClientSecret" "<valor-del-secreto>" --project backend/Taller.Api
   dotnet user-secrets set "SharePoint:SiteUrl" "https://palvarez.sharepoint.com/sites/Taller" --project backend/Taller.Api
   dotnet user-secrets set "SharePoint:BibliotecaRepro" "REPRO" --project backend/Taller.Api
   ```
   Opcionales: `SharePoint:Biblioteca` (nombre de la biblioteca de documentación si no es la principal), `SharePoint:Carpeta` (solo una carpeta de la documentación) y `SharePoint:IntervaloMinutos`. En producción: secretos `sharepoint-tenant-id`, `sharepoint-client-id` y `sharepoint-client-secret` (el script de despliegue los pasa si existen) y las variables `SharePoint__SiteUrl` y `SharePoint__BibliotecaRepro`.
6. Reinicia la API: la primera sincronización empieza a los 30 segundos.

También se puede lanzar desde consola, sincronizando las dos bibliotecas y terminando: `dotnet run --project backend/Taller.Api -- sincronizar-sharepoint`. En Cloud Run (que se apaga sin uso y apenas da CPU fuera de las peticiones) la sincronización automática del servicio se desactiva con `SharePoint:Automatica=false` y la hace un trabajo de Cloud Run programado que ejecuta ese comando.

Estado de la primera sincronización real (19/10/2026): Documentos, 2.061 PDF/imágenes copiados (2.026 de «pinouts») y 151 omitidos (otros formatos o > 25 MB); REPRO, 17 reprogramaciones, 1 vinculada sola («BMW 745D 1016GST»). La biblioteca MULTIMEDIA del site no se sincroniza.

### Fotos y vídeos de las órdenes

En cada orden, bloque «Fotos y vídeos»: se eligen la etapa (recepción, diagnóstico, reparación, entrega u otro) y si el cliente puede verlo. Botones: «📷 Foto» y «🎥 Vídeo» abren la cámara del móvil o tableta; «📁 Archivos» elige fotos o vídeos ya hechos; «🖥️ Cámara del equipo» hace fotos y graba vídeo con la webcam dentro de la página (navegador con permiso de cámara; graba MP4 o WebM según el navegador). Al **abrir una orden** también se pueden añadir: quedan pendientes y se suben a la etapa «Recepción» en cuanto se crea (si alguno falla, la orden se queda abierta y se ve el motivo). Con «Gestionar» se cambian la descripción, la etapa y la visibilidad, o se borran.

- Formatos: fotos JPG, PNG o WebP y vídeos MP4, MOV (iPhone) o WebM, de hasta 300 MB, comprobando el contenido del archivo. Las fotos HEIC del iPhone se rechazan con instrucciones (Ajustes → Cámara → Formatos → «Más compatible»), porque la mayoría de navegadores no las muestran.
- Se guardan en `backend/Taller.Api/privado/multimedia/` (configurable con `Multimedia:Ruta`), fuera de lo público: se sirven por `/api/multimedia/{id}/archivo` comprobando la sesión, y con rangos para poder avanzar en los vídeos.
- El cliente ve en «Mi área» solo lo marcado como visible de sus propias órdenes. Por defecto nada es visible.
- Al borrar una orden se borran sus archivos. La carpeta no va a git: en producción hay que incluirla en las copias de seguridad. Si se publica detrás de un proxy (nginx, IIS), hay que subir allí también el límite de tamaño de petición.

### Visitas a la web (Gestión → Web → Visitas)

Cada página vista de la web (no las llamadas a la API ni los archivos; los robots no cuentan) se anota con la fecha, la ruta, el tipo de visitante (público, cliente o taller, según la sesión), si es móvil, el dominio de origen y la **zona aproximada** (país, comunidad autónoma con código INE, ciudad y coordenadas redondeadas). **No se guarda la IP**: se usa en el servidor para ubicar la zona con una base de datos local y para una huella diaria del visitante (HMAC de IP + navegador + día), que permite contar visitantes únicos sin seguir a nadie de un día a otro.

- La pantalla muestra un mapa de España por comunidades (Canarias en recuadro) con las ciudades, visitantes por día, países, páginas más vistas y de dónde llegan (`GET /api/estadisticas/visitas?desde=&hasta=&tipo=Publico|Cliente|Taller|todos`).
- Geolocalización: base de datos gratuita DB-IP «IP to City Lite» (formato MaxMind, CC BY 4.0; se actualiza cada mes en download.db-ip.com). Ruta en `GeoIp:Ruta`: en local `backend/Taller.Api/geoip/dbip-city-lite.mmdb` (fuera del despliegue) y en producción `/datos/geoip/dbip-city-lite.mmdb` (bucket). Sin el archivo, las visitas se guardan sin zona.
- El contorno de las comunidades está en `frontend/public/geo/comunidades.json` (simplificado de un GeoJSON con los códigos INE).

### Fotos de la web

Se guardan en `backend/Taller.Api/media/` (configurable con `Media:Ruta`) y se sirven en `/media` (con rangos, para poder avanzar en los vídeos). Fotos JPG, PNG o WebP de hasta 10 MB y **vídeos MP4, MOV o WebM de hasta 300 MB**, comprobando el contenido del archivo (las fotos HEIC del iPhone se rechazan con instrucciones). En cada trabajo (Gestión → Web → Trabajos) se suben con los botones Foto, Vídeo, Archivos y Cámara del equipo, con su progreso. La portada es la primera foto; si el trabajo solo tiene vídeos, el primer vídeo. En la web, las tarjetas con vídeo llevan una marca ▶ y la galería reproduce los vídeos. Esa carpeta no va a git: en producción hay que incluirla en las copias de seguridad.

## Modelo

- **Cliente** (particular o empresa) → tiene **Vehículos**
- **Vehículo**: turismo, moto, furgoneta, camión, tractor, maquinaria agrícola… Se identifica por matrícula o por nº de bastidor (agrícolas sin matrícula). Uso en km u horas.
- **Orden de trabajo**: entrada de un vehículo al taller (fecha de entrada editable, por defecto hoy, nunca futura; se guarda en hora de España), con servicios (mecánica, electromecánica, programación, chapa y pintura…) y estado (Recibido → En diagnóstico → Presupuestado → En reparación → Listo → Entregado / Cancelado).
- **Línea de trabajo**: mano de obra (horas) o pieza, con precio, descuento e IVA. Los totales se calculan en la API.

## API

| Recurso | Endpoints |
|---|---|
| Clientes | `GET/POST /api/clientes`, `GET/PUT/DELETE /api/clientes/{id}` (`?q=` busca por nombre, NIF o teléfono) |
| Vehículos | `GET/POST /api/vehiculos`, `GET/PUT/DELETE /api/vehiculos/{id}` (`?q=`, `?clienteId=`, `?tipo=`), `GET /api/vehiculos/{id}/resumen`, `GET/POST/DELETE /api/vehiculos/{id}/imagen`, `POST /api/vehiculos/{id}/imagen/generar` |
| Órdenes | `GET/POST /api/ordenes`, `GET/PUT/DELETE /api/ordenes/{id}`, `PUT /api/ordenes/{id}/estado`, `PUT /api/ordenes/{id}/pagado`, `GET /api/ordenes/tablero` (`?diasEntregados=7`) (`?q=`, `?estado=`, `?abiertas=true`) |
| Líneas | `POST /api/ordenes/{id}/lineas`, `PUT/DELETE /api/ordenes/{id}/lineas/{lineaId}` |
| Fotos y vídeos | `GET/POST /api/ordenes/{id}/multimedia` (multipart), `PUT/DELETE /api/multimedia/{id}`, `GET /api/multimedia/{id}/archivo` |
| Vinalfa | `GET /api/vinalfa/estado`, `GET /api/vinalfa/vehiculos/{id}?identificador=`, `GET /api/vinalfa/catalogo/{hash}/grupos`, `GET /api/vinalfa/catalogo/{hash}/buscar?q=`, `GET /api/vinalfa/secciones/{hash}/subsecciones`, `GET /api/vinalfa/secciones/{hash}/piezas?vehiculo=` |
| Mecánico virtual | `GET /api/mecanico/estado`, `GET/POST /api/mecanico/conversaciones`, `GET/DELETE /api/mecanico/conversaciones/{id}`, `POST /api/mecanico/conversaciones/{id}/mensajes` (SSE), `POST /api/mecanico/ordenes/{ordenId}/conversacion?nueva=` |
| Reprogramaciones | `GET /api/repro?q=&sinVincular=`, `GET /api/repro/{id}`, `PUT /api/repro/{id}/vehiculo`, `PUT /api/repro/{id}/notas`, `GET /api/repro/archivos/{id}/contenido?descargar=` (Range), `GET /api/vehiculos/{id}/repro` |
| Matrícula | `GET /api/matricula/estado`, `POST /api/matricula/consultar` (`{ matricula, moto, repetir }`) |
| Catálogos de despieces | `GET/POST /api/catalogos`, `PUT/DELETE /api/catalogos/{id}`, `GET /api/catalogos/referencia?q=&vehiculoId=` (los del vehículo van en `GET /api/vehiculos/{id}/documentacion`) |

## Migraciones

`dotnet-ef` está como herramienta local (`dotnet-tools.json`):

```bash
dotnet tool restore
dotnet ef migrations add <Nombre> --project backend/Taller.Api -o Data/Migrations
dotnet ef database update --project backend/Taller.Api
```

## Importar el histórico del Excel

La hoja "Taller" de `Facturas2018.xlsx` (un trabajo por fila) se importa con:

```bash
dotnet run --project backend/Taller.Api --launch-profile http -- importar-excel "C:/ruta/Facturas2018.xlsx" --simular
dotnet run --project backend/Taller.Api --launch-profile http -- importar-excel "C:/ruta/Facturas2018.xlsx"
```

- `--simular` muestra el resumen (totales, marcas no reconocidas, clientes parecidos, avisos) sin guardar nada.
- `--reemplazar` borra lo importado antes y vuelve a importar. Sin esta opción el importador se niega si ya hay datos importados.
- `--anio 2026` importa solo las filas con fecha de recepción (o recogida) de ese año. Las filas sin fecha se descartan.
- `--sin-agrupar` crea un cliente y un vehículo por cada fila, aunque el nombre se repita.
- Cada fila da lugar a una orden "Entregado". Lo cobrado (D) se reparte en una línea de piezas (precio = coste = E) y otra de mano de obra (D − E), con IVA 0 %, así que el total y el margen coinciden con el Excel.
- Clientes y vehículos se agrupan por nombre y texto del coche. La marca y el tipo se deducen del texto (`Importacion/DeduccionVehiculo.cs`). Los vehículos se importan sin matrícula.
- Las filas sin fecha reciben el 01/01/2025 y una nota. Los años "2925" se corrigen a 2025.
- Todo lo importado lleva la marca "Importado de Excel" en Notas u Observaciones, con la fila de origen.

## Despliegue en GCP

Proyecto `astursagra` (cuenta pablomolipo@gmail.com), servicio de Cloud Run en `europe-west1` (Bélgica, la región más cercana que admite dominios propios); base de datos, bucket y trabajos en `europe-southwest1` (Madrid). Configuración de gcloud aparte, «taller», para no mezclarla con otras (`export CLOUDSDK_ACTIVE_CONFIG_NAME=taller` o `--configuration=taller`).

| Pieza | Servicio | Notas |
|---|---|---|
| Web + API | Cloud Run `taller` | Una sola imagen (`Dockerfile`): Angular compilado en `wwwroot` y la API sirviéndolo. Se apaga sin uso (mín. 0, máx. 2 instancias). HTTP/2 hasta la aplicación (`--use-http2` + Kestrel en HTTP/2), porque en HTTP/1 Cloud Run corta las subidas a 32 MB y los vídeos llegan a 300 MB. |
| Base de datos | Cloud SQL PostgreSQL 17 `taller-db` | La instancia compartida más pequeña, copia de seguridad diaria. Conexión por socket (`/cloudsql/...`). Las migraciones se aplican al arrancar (`BaseDatos:MigrarAlArrancar`). |
| Archivos | Cloud Storage `astursagra-datos` | Montado en `/datos`: fotos de la web, adjuntos, documentación, fotos y vídeos de órdenes, y las claves de las cookies de sesión (`DataProtection:Ruta`). Privado. |
| Secretos | Secret Manager | `taller-db-conexion` y, si existen, `vinalfa-token`, `matriculaapi-usuario`, `anthropic-api-key`, `sharepoint-*`. |
| SharePoint | Trabajo de Cloud Run `sincronizar-sharepoint` + Cloud Scheduler (europe-west1, cada hora a y cuarto, hora de Madrid) | Ejecuta el comando `sincronizar-sharepoint` con la misma imagen, base de datos, bucket y secretos (`sharepoint-tenant-id`, `sharepoint-client-id`, `sharepoint-client-secret`). El servicio tiene `SharePoint:Automatica=false` y solo sincroniza a petición (botón «Sincronizar ahora»). El script de despliegue actualiza su imagen. |
| Identidad | Cuenta de servicio `taller-run` | Solo cliente de Cloud SQL, lectura de esos secretos y escritura en el bucket. |

Dirección: **https://www.astursagra.es** (y https://astursagra.es; también https://taller-927789730620.europe-west1.run.app). Dominio comprado en GoDaddy; certificados HTTPS gestionados por Google (asignación de dominio de Cloud Run: `gcloud beta run domain-mappings create --service taller --domain www.astursagra.es --region europe-west1`, tras verificar el dominio con `gcloud domains verify astursagra.es`; en el DNS del registrador, `www` como CNAME a `ghs.googlehosted.com.` y el dominio raíz con los registros A/AAAA que indique la asignación). `IMAGEN=<imagen> bash deploy/desplegar.sh` despliega una imagen ya construida.

Volver a desplegar tras un cambio (en Git Bash; el script evita que Git Bash convierta `/datos` en una ruta de Windows):

```bash
bash deploy/desplegar.sh --quiet
```

Crear o restablecer un usuario del taller en producción: el trabajo de Cloud Run `crear-usuario` ejecuta el comando `crear-usuario-taller` con la misma imagen y base de datos. La contraseña temporal queda en el registro de esa ejecución (Cloud Logging), solo visible para el proyecto, y hay que cambiarla al entrar:

```bash
gcloud run jobs execute crear-usuario --args crear-usuario-taller,<usuario> --wait --configuration=taller
```

El trabajo usa la imagen del primer despliegue: tras cambios en la base de datos, actualízalo con `gcloud run jobs update crear-usuario --image <imagen actual del servicio>`.

Al apagarse sin uso, la sincronización con SharePoint solo corre mientras hay alguna instancia encendida; se puede lanzar a mano desde Diagnóstico → Documentación.

## Notas del entorno

- Angular 21 requiere Node ≥ 20.19 / 22.12. Las versiones más nuevas de la CLI piden Node ≥ 22.22.
- npm 9.x falla al instalar (`Cannot read properties of null (reading 'edgesOut')`); usa npm ≥ 11: `npx npm@11 install`.
