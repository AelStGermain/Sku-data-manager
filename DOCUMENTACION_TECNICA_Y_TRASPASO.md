# Smart Shelf SKU Data Manager

## Documentación técnica y guía de traspaso

- **Última revisión:** 30 de julio de 2026
- **Repositorio:** `Sku-data-manager`
- **Rama principal:** `main`
- **Runtime recomendado:** Node.js 22 LTS
- **Aplicación local:** `http://localhost:3000`
- **Healthcheck:** `http://localhost:3000/health`

---

## 1. Propósito del sistema

Smart Shelf SKU Data Manager es una aplicación web interna para centralizar y
mantener información maestra de productos o SKU. Sus funciones principales son:

- Mantener un catálogo maestro identificado principalmente por EAN.
- Relacionar un mismo producto con distintos holdings o retailers.
- Importar información desde CSV y Excel.
- Recibir y revisar levantamientos provenientes de Firebase/Firestore.
- Detectar registros sin EAN o con información incompleta.
- Homologar categorías y Customer ID por holding.
- Preparar tickets para Vispera y registrar el ID entregado por ese sistema.
- Exportar catálogos y lotes de trabajo a Excel.

La aplicación fue diseñada como una SPA de JavaScript clásico servida por un
backend Node.js/Express. En su implementación actual, la fuente oficial del
catálogo son archivos JSON persistentes en el servidor.

### Alcance actual

La aplicación funciona bien como herramienta interna desplegada en una sola
instancia. No debe considerarse todavía una plataforma multi-tenant o de alta
concurrencia.

No existe autenticación ni autorización por roles dentro de la aplicación. Si se
publica fuera de una red controlada, debe protegerse mediante un proxy, VPN,
SSO/gateway u otra capa de identidad.

---

## 2. Resumen de arquitectura

```text
┌──────────────────────────────────────────────────────────────┐
│ Navegador                                                    │
│                                                              │
│ HTML + CSS + JavaScript vanilla                              │
│ UI modules → DB client → fetch("/api/...")                   │
│                         │                                    │
│                         └─ memoria + localStorage (caché)     │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTP/JSON
┌──────────────────────────────▼───────────────────────────────┐
│ Backend Node.js + Express                                    │
│                                                              │
│ Routes → validación → controllers → services → storage       │
│                                             │                │
│                                             ▼                │
│                                   local_data/*.json          │
└──────────────────────────────┬───────────────────────────────┘
                               │ opcional
                 ┌─────────────┴─────────────┐
                 ▼                           ▼
        Firebase / Firestore        Catálogos externos
        levantamientos              OFF / OPF / SoloTodo
```

### Fuente de verdad

- **Fuente oficial de la aplicación:** archivos JSON bajo `DATA_DIR`.
- **Caché del servidor:** caché en memoria con TTL configurable.
- **Caché del navegador:** memoria y `localStorage`.
- **Fuente externa opcional:** Firebase/Firestore para levantamientos.
- **Enriquecimiento externo:** Open Food Facts, Open Products Facts y SoloTodo.

`localStorage` permite conservar cambios temporalmente si la API no está
disponible, pero no debe confundirse con persistencia central. Un cambio se
considera permanente y compartido sólo después de que el servidor lo confirma.

---

## 3. Stack tecnológico

| Capa           | Tecnología                       | Uso                                     |
| -------------- | -------------------------------- | --------------------------------------- |
| Runtime        | Node.js 22                       | Servidor y scripts                      |
| Backend        | Express 5                        | SPA, API REST y healthcheck             |
| Validación     | Zod                              | Variables de entorno y requests         |
| Seguridad HTTP | Helmet, CORS, express-rate-limit | Headers, orígenes y límites             |
| Logging        | Pino                             | Logs JSON estructurados                 |
| Frontend       | HTML, CSS, JavaScript vanilla    | SPA sin proceso de compilación          |
| CSV            | PapaParse                        | Lectura de archivos CSV                 |
| Excel          | SheetJS                          | Importación y exportación               |
| Imágenes Excel | JSZip                            | Extracción de imágenes incrustadas      |
| Gráficos       | Chart.js                         | Dashboard                               |
| Fechas         | Flatpickr                        | Controles de fecha                      |
| Firebase       | Firebase Admin SDK               | Sincronización opcional desde Firestore |
| Pruebas        | Jest, Supertest, Playwright      | Unidad, integración y E2E               |
| Contenedor     | Docker, Node Alpine              | Despliegue autocontenido                |

No hay React, Vue, Angular, TypeScript ni bundler. Los archivos del cliente se
cargan directamente desde `index.html`.

---

## 4. Estructura del repositorio

```text
.
├── server.js                    # Bootstrap mínimo
├── index.html                   # Shell de la SPA
├── css/
│   └── styles.css               # Estilos globales
├── js/                          # Frontend clásico
├── src/
│   ├── app.js                   # Construcción de Express
│   ├── server.js                # Lifecycle y apagado elegante
│   ├── container.js             # Inyección de dependencias
│   ├── config/                  # Variables de entorno y defaults
│   ├── controllers/             # Adaptación HTTP
│   ├── docs/                    # OpenAPI
│   ├── errors/                  # Errores operacionales
│   ├── middleware/              # Validación, seguridad y logging
│   ├── routes/                  # Endpoints
│   ├── services/                # Reglas de negocio e integraciones
│   ├── storage/                 # Persistencia física
│   ├── utils/                   # Funciones puras
│   └── validators/              # Esquemas Zod
├── local_data/                  # Datos persistentes
├── scripts/                     # Importación, migración y enriquecimiento
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── regression/
│   ├── e2e/
│   └── helpers/
├── Dockerfile
├── .env.example
├── README.md
└── TESTING.md
```

### Módulos principales del frontend

| Archivo                     | Responsabilidad                                              |
| --------------------------- | ------------------------------------------------------------ |
| `js/app.js`                 | Inicio, navegación por hash, tema, sidebar y utilidades      |
| `js/db.js`                  | Estado del cliente, caché, normalización y acceso a la API   |
| `js/api.js`                 | Consultas y combinación de catálogos externos                |
| `js/importer.js`            | Lectura, mapeo, conflictos y transformación de importaciones |
| `js/excel-image-parser.js`  | Extracción de imágenes desde Excel                           |
| `js/ui-dashboard.js`        | Indicadores y resumen                                        |
| `js/ui-catalog.js`          | Catálogo, filtros y búsqueda                                 |
| `js/ui-sheet.js`            | Ficha técnica de producto                                    |
| `js/ui-import.js`           | Asistente de importación                                     |
| `js/ui-bulk.js`             | Edición y exportación masiva                                 |
| `js/ui-retailers.js`        | Administración de holdings y relaciones                      |
| `js/ui-levantamiento.js`    | Registros provenientes de terreno                            |
| `js/ui-avistamientos.js`    | Resolución de productos detectados                           |
| `js/ui-staging.js`          | Revisión, sin EAN, tickets Vispera y pendientes              |
| `js/ui-category-manager.js` | Jerarquía y homologación de categorías                       |

Los módulos se exponen como objetos globales (`App`, `DB`, `UIStaging`, etc.). El
orden de los `<script>` de `index.html` es relevante.

---

## 5. Cómo iniciar el proyecto

### Requisitos

- Node.js 20 o superior; recomendado Node.js 22 LTS.
- npm.
- Permisos de lectura y escritura sobre `DATA_DIR`.
- Chromium de Playwright sólo si se ejecutarán pruebas E2E.

### Instalación local

```bash
npm ci
```

Crear `.env` a partir del ejemplo:

```bash
cp .env.example .env
```

En PowerShell:

```powershell
Copy-Item .env.example .env
```

Para desarrollo:

```bash
npm run dev
```

Para ejecución normal:

```bash
npm start
```

Comprobar:

```bash
curl http://localhost:3000/health
```

Respuesta esperada:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "uptimeSeconds": 10,
    "timestamp": "2026-07-30T20:30:00.000Z"
  }
}
```

---

## 6. Configuración

La configuración se valida al arrancar. Si una variable tiene un formato
inválido, el servidor no inicia.

### Variables principales

| Variable               |       Default | Descripción                                  |
| ---------------------- | ------------: | -------------------------------------------- |
| `NODE_ENV`             | `development` | `development`, `test` o `production`         |
| `HOST`                 |     `0.0.0.0` | Dirección de escucha                         |
| `PORT`                 |        `3000` | Puerto HTTP                                  |
| `DATA_DIR`             |  `local_data` | Directorio de persistencia                   |
| `LOG_LEVEL`            | Según entorno | Nivel de Pino                                |
| `STORAGE_CACHE_TTL_MS` |        `5000` | TTL de caché JSON del backend                |
| `CORS_ORIGINS`         |           `*` | Orígenes permitidos separados por coma       |
| `TRUST_PROXY`          |           `1` | Cantidad/configuración de proxies confiables |
| `JSON_BODY_LIMIT`      |        `50mb` | Tamaño máximo del body JSON                  |
| `RATE_LIMIT_WINDOW_MS` |      `900000` | Ventana del rate limiter                     |
| `RATE_LIMIT_MAX`       |         `600` | Requests por IP y ventana bajo `/api`        |
| `MAX_IMPORT_RECORDS`   |      `100000` | Máximo de registros por request masivo       |
| `IMPORT_HISTORY_LIMIT` |         `200` | Entradas conservadas en auditoría            |
| `SHUTDOWN_TIMEOUT_MS`  |       `10000` | Límite para apagado elegante                 |

### Firebase

| Variable                        | Descripción                                        |
| ------------------------------- | -------------------------------------------------- |
| `FIREBASE_ENABLED`              | Habilita o deshabilita la integración              |
| `DISABLE_FIREBASE_SYNC`         | Compatibilidad heredada; `1` la deshabilita        |
| `FIREBASE_PROJECT_ID`           | Proyecto esperado                                  |
| `FIREBASE_DATABASE_ID`          | Base Firestore, normalmente `(default)`            |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Archivo de cuenta de servicio dentro de `DATA_DIR` |
| `FIREBASE_COLLECTION`           | Colección consultada                               |
| `FIREBASE_PAGE_SIZE`            | Máximo de documentos por consulta                  |
| `FIREBASE_SYNC_INTERVAL_MS`     | Intervalo de sincronización                        |
| `FIREBASE_INITIAL_SINCE`        | Fecha inicial del primer sync                      |

La credencial se espera, por defecto, en:

```text
local_data/firebase-key.json
```

Nunca debe enviarse al repositorio, incluirse en una imagen Docker ni copiarse a
un canal no seguro.

---

## 7. Backend

### Ciclo de una solicitud

```text
Request
  → request ID y logging
  → parseo JSON
  → sanitización
  → rate limiting en /api
  → validación Zod
  → controller
  → service
  → StorageService
  → respuesta JSON uniforme
```

### Responsabilidades

#### `src/app.js`

- Crea la instancia Express.
- Aplica Helmet, CORS, logging, JSON parser y sanitización.
- Aplica rate limiting sólo bajo `/api`.
- Monta las rutas.
- Sirve exclusivamente los assets públicos previstos.
- No expone el repositorio completo.

#### `src/server.js`

- Construye dependencias y abre el puerto.
- Configura timeouts HTTP.
- Inicia Firebase si está habilitado.
- Atiende `SIGTERM` y `SIGINT`.
- Espera escrituras pendientes durante el apagado.

#### Controllers

Transforman HTTP a llamadas de servicios. No deberían contener reglas de negocio
complejas.

#### Services

- `ProductService`: listado, upsert individual/masivo y eliminación.
- `ReferenceDataService`: holdings, tiendas y jerarquías.
- `FirebaseService`: lectura incremental y combinación de Firestore.
- `ExternalCatalogService`: enriquecimiento externo y caché.
- `ImportAuditService`: historial compacto de importaciones.

#### `StorageService`

Es el único módulo que debe conocer rutas físicas. Proporciona:

- Lectura y escritura JSON.
- Caché con TTL.
- Clonado de valores para evitar mutaciones accidentales.
- Escrituras serializadas por archivo.
- Cola transaccional dentro de una instancia.
- Escritura atómica mediante archivo temporal y `rename`.
- Restricción de las rutas de staging.

La serialización funciona dentro de un único proceso Node.js. No coordina dos
contenedores o servidores distintos escribiendo sobre el mismo volumen.

---

## 8. API REST

Las respuestas exitosas utilizan normalmente:

```json
{
  "success": true,
  "data": {}
}
```

Los errores:

```json
{
  "success": false,
  "error": "Mensaje público",
  "code": "VALIDATION_ERROR",
  "details": []
}
```

No se devuelven stack traces al cliente.

### Endpoints

| Método   | Ruta                      | Uso                           |
| -------- | ------------------------- | ----------------------------- |
| `GET`    | `/health`                 | Estado del proceso            |
| `GET`    | `/api/openapi.json`       | Contrato OpenAPI              |
| `GET`    | `/api/products`           | Catálogo maestro y relaciones |
| `POST`   | `/api/products`           | Upsert de un producto         |
| `POST`   | `/api/products/bulk`      | Upsert masivo                 |
| `DELETE` | `/api/products`           | Eliminar por lista de EAN     |
| `GET`    | `/api/holdings`           | Listar holdings               |
| `POST`   | `/api/holdings`           | Reemplazar holdings           |
| `DELETE` | `/api/holdings/:id`       | Eliminar holding y relaciones |
| `GET`    | `/api/stores`             | Listar tiendas                |
| `POST`   | `/api/stores`             | Reemplazar tiendas            |
| `GET`    | `/api/category-hierarchy` | Obtener jerarquía             |
| `POST`   | `/api/category-hierarchy` | Reemplazar jerarquía          |
| `GET`    | `/api/staging/:key`       | Leer cola                     |
| `POST`   | `/api/staging/:key`       | Reemplazar cola               |
| `POST`   | `/api/sync-firebase`      | Ejecutar sincronización       |
| `GET`    | `/api/last-sync`          | Estado/checkpoint Firebase    |
| `GET`    | `/api/import-history`     | Auditoría resumida            |

Consultar el contrato vivo:

```bash
curl http://localhost:3000/api/openapi.json
```

### Ejemplo de upsert

```json
{
  "product": {
    "ean": "7791234567890",
    "product_name": "Bebida energética 250 ml",
    "brand": "Marca",
    "category_master": "DRINKS",
    "vispera_id": "1234",
    "status": "new"
  },
  "holdingRelations": [
    {
      "ean": "7791234567890",
      "retailer_id": "pronto",
      "internal_sku_id": "PC-100",
      "retailer_category": "BEBIDAS"
    }
  ]
}
```

---

## 9. Persistencia y modelo de datos

### Tipo de base de datos

La versión actual usa persistencia documental basada en archivos JSON. No usa
PostgreSQL ni otra base SQL como fuente primaria.

Firebase/Firestore es una fuente opcional de levantamientos. Supabase aparece en
componentes heredados descritos más adelante, pero no es la persistencia principal
del servidor Express actual.

### Archivos administrados formalmente por `StorageService`

| Archivo                   | Contenido                        |
| ------------------------- | -------------------------------- |
| `master_catalog.json`     | Productos maestros               |
| `retailer_catalog.json`   | Relaciones producto-holding      |
| `holdings.json`           | Holdings configurados            |
| `stores.json`             | Tiendas/sucursales               |
| `category_hierarchy.json` | Categorías universales y locales |
| `last_fb_sync.json`       | Checkpoint Firebase              |
| `import_history.json`     | Auditoría compacta               |
| `<staging-key>.json`      | Colas dinámicas de staging       |

### Colas de staging conocidas

- `ss_staging_levantamiento.json`
- `ss_staging_no_ean.json`
- `ss_staging_unmatched.json`
- `ss_vispera_batch.json`
- `ss_recent_matches.json`

### Volumen observado al redactar esta guía

Estas cifras son sólo una referencia del snapshot del 30 de julio de 2026:

| Conjunto               | Registros aproximados |
| ---------------------- | --------------------: |
| Productos maestros     |                26.316 |
| Relaciones por holding |                34.806 |
| Holdings               |                     5 |
| Tiendas                |                     5 |
| Registros sin EAN      |                 4.118 |
| Tickets Vispera        |                     2 |

No codificar lógica en función de estos números.

### Identidad y relaciones

- El identificador principal del producto es `ean`, tratado como string.
- Los espacios se eliminan en EAN numéricos para evitar duplicados.
- La relación por holding se identifica lógicamente por
  `(ean, retailer_id)`.
- `retailer_id` se normaliza a minúsculas.
- Al eliminar un producto, también se eliminan sus relaciones.
- Al eliminar un holding, también se eliminan sus relaciones.

### Convenciones de nombres

El frontend histórico usa principalmente camelCase:

```text
visperaId
imageUrl
dataSource
packageType
```

Los payloads y algunos archivos usan snake_case:

```text
vispera_id
image_url
data_source
package_type
```

`js/db.js` contiene la traducción y compatibilidad. Antes de añadir un campo,
definir:

1. Nombre canónico en persistencia.
2. Nombre en el modelo del navegador.
3. Conversión de lectura.
4. Conversión de escritura.
5. Prueba de round-trip.

Esto evita errores donde un campo aparece guardado localmente, pero no llega al
servidor.

---

## 10. Flujos de datos

### Inicio de la aplicación

```text
App.init()
  → DB.init()
  → carga holdings, tiendas, categorías y staging
  → GET /api/products
  → normaliza catálogo y relaciones
  → completa campos auxiliares desde caché local si corresponde
  → construye estado en memoria
  → renderiza la vista solicitada por el hash
```

Si el servidor no responde, el navegador puede operar con la última caché local.
Ese modo debe mostrarse como degradado/offline.

### Edición de un producto

```text
Usuario guarda ficha
  → objeto en memoria
  → caché local
  → POST /api/products
  → validación
  → ProductService.upsert()
  → escritura atómica de catálogo y relaciones
  → confirmación al navegador
```

Para flujos críticos, la UI debe diferenciar entre:

- Guardado confirmado por el servidor.
- Guardado sólo local.

### Importación CSV/Excel desde la interfaz

1. El navegador lee el archivo.
2. Detecta encabezados automáticamente.
3. El usuario confirma el mapeo de columnas.
4. Se normaliza el EAN.
5. Se muestran duplicados y vista previa.
6. El usuario elige:
   - rellenar vacíos;
   - sobrescribir;
   - omitir duplicados.
7. Opcionalmente se consultan catálogos externos.
8. Los registros normalizados se envían a `/api/products/bulk`.

El archivo original no se guarda en el backend.

### Firebase/Firestore

```text
Firestore collection
  → consulta incremental por fecha
  → normalización de holding y EAN
  ├─ EAN válido → alta/actualización en catálogo
  └─ sin EAN válido → ss_staging_no_ean
  → guarda checkpoint last_fb_sync.json
```

La sincronización:

- Puede ejecutarse al iniciar.
- Puede programarse por intervalo.
- Puede solicitarse con `POST /api/sync-firebase`.
- No bloquea el funcionamiento si Firebase está deshabilitado.
- Evita dos sincronizaciones simultáneas dentro del mismo proceso.

### Flujo Vispera

1. Un SKU sin Vispera ID se revisa.
2. Se confirma y se agrega a `ss_vispera_batch`.
3. El lote puede exportarse a Excel.
4. Al recibir el ID, se escribe y se pulsa **Listo**.
5. El producto queda con `vispera_id`, fecha y estado correspondiente.
6. La **×** sólo se habilita si el ID ya fue guardado.
7. La **×** cierra el ticket; no elimina ni devuelve el SKU a revisión.

---

## 11. Integraciones externas

### Open Food Facts y Open Products Facts

Se usan para completar datos faltantes como:

- Nombre.
- Marca.
- Imagen.
- Categoría sugerida.
- Peso o tipo de envase, según el flujo.

Las consultas tienen timeout y no deben sobrescribir datos manuales bloqueados.

### SoloTodo

El cliente contiene integración para buscar coincidencias exactas de EAN. No debe
aceptarse una coincidencia aproximada como si fuera el mismo producto.

### Firebase/Firestore

Usa Firebase Admin SDK y una cuenta de servicio del backend. La credencial nunca
debe exponerse al navegador.

### Componentes Supabase heredados

Existen tres elementos que no deben confundirse con la arquitectura principal:

- `scripts/enrich-cron.js`
- `.github/workflows/enrich-skus.yml`
- `api/webhook.js`

Estos componentes apuntan directamente a tablas Supabase y pertenecen a una etapa
anterior o a un flujo paralelo. El servidor Express actual persiste en JSON.

El nuevo encargado debe tomar una decisión explícita:

1. Retirar estos componentes si ya no se usan.
2. Adaptarlos para consumir la API Express.
3. Integrarlos formalmente si Supabase seguirá existiendo.

No activar el cron heredado sin confirmar cuál sistema contiene los datos
oficiales. De lo contrario se pueden mantener dos catálogos divergentes.

---

## 12. Pruebas y calidad

### Comandos

```bash
npm run check
npm run lint
npm run test:jest
npm run test:e2e
npm run test:coverage
```

La validación completa es:

```bash
npm test
```

### Capas de prueba

#### Unitarias

Cubren:

- Normalización y consolidación de EAN.
- `StorageService`.
- `ProductService`.
- Datos de referencia.
- Firebase.
- Catálogos externos.
- Middleware.
- Auditoría.

#### Integración

Supertest crea Express en memoria y verifica:

- API y respuestas.
- Persistencia.
- Relaciones.
- Staging.
- Validación.
- CORS.
- Rate limit.
- Ocultamiento de errores.

Cada prueba usa un `DATA_DIR` temporal y lo elimina al terminar.

#### Regresión del cliente

Ejecuta módulos del JavaScript clásico en un contexto VM y protege contratos
críticos, por ejemplo:

- Merge de enriquecimiento.
- Render de fichas.
- Persistencia del Vispera ID.
- Cierre seguro del ticket Vispera.
- Homologación sin datos inventados.

#### End-to-End

Playwright levanta un backend aislado en `127.0.0.1:4173` y prueba Chromium:

- Carga de la SPA y datos del backend.
- Búsqueda y ficha técnica.
- Navegación y tema.
- Filtros de levantamiento.
- Transferencia de Customer ID desde Avistamientos.

Las CDN externas se bloquean para que el resultado sea determinista.

### Estado verificado al redactar la guía

- 12 suites Jest aprobadas.
- 50 pruebas Jest aprobadas.
- 5 pruebas Playwright aprobadas.
- 55 pruebas automatizadas totales aprobadas.
- Sintaxis aprobada.
- ESLint aprobado.

Cobertura Jest:

| Métrica    | Cobertura |
| ---------- | --------: |
| Statements |   92,37 % |
| Líneas     |   92,37 % |
| Funciones  |   94,73 % |
| Branches   |   82,65 % |

Los umbrales obligatorios están en `jest.config.cjs`.

### Lo que no cubre completamente la suite

- Carga y estrés con múltiples usuarios.
- Dos procesos escribiendo sobre el mismo volumen.
- Integración periódica contra un Firebase real.
- Disponibilidad real de las APIs externas.
- Compatibilidad completa en todos los navegadores.

---

## 13. Despliegue

### Docker

```bash
docker build -t sku-data-manager:latest .
docker run -d \
  --name sku-data-manager \
  --env-file .env \
  -p 127.0.0.1:3000:3000 \
  -v /srv/sku-data/local_data:/app/local_data \
  --restart unless-stopped \
  sku-data-manager:latest
```

Puntos importantes:

- La imagen se ejecuta como usuario `node`, no root.
- `local_data` está excluido de la imagen.
- El volumen persistente es obligatorio en producción.
- El usuario del contenedor debe poder escribir en el volumen.
- La imagen incluye healthcheck.

Preparar el volumen:

```bash
sudo install -d -o 1000 -g 1000 -m 750 /srv/sku-data/local_data
```

### Ubuntu/systemd/Nginx

Hay dos guías específicas:

- `DEPLOYMENT_UBUNTU.md`
- `DEPLOYMENT_PUBLIC_UBUNTU_NO_AUTH.md`

Para una publicación real se recomienda:

```text
Internet
  → TLS/Nginx
  → autenticación o gateway
  → Node.js en 127.0.0.1:3000
  → volumen persistente protegido
```

No abrir directamente el puerto 3000 a Internet.

---

## 14. Operación

### Verificar servicio

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/api/last-sync
```

### Logs

El servidor escribe logs JSON estructurados por stdout. En producción deben
recogerse mediante:

- journald si se usa systemd;
- logs del runtime Docker;
- una plataforma central de observabilidad.

Cada request tiene un `x-request-id`, que también aparece en los logs.

### Backups

El catálogo y las relaciones forman una unidad. Respaldar todo `DATA_DIR`, no
archivos individuales.

Ejemplo:

```bash
sudo systemctl stop sku-data-manager
sudo tar -C /srv/sku-data \
  -czf "/srv/backups/sku-data-$(date +%F-%H%M).tgz" \
  local_data
sudo systemctl start sku-data-manager
```

Si no es posible detener el servicio, coordinar una ventana sin escrituras y
validar el snapshot. Copiar archivos mientras se modifican puede producir un
backup lógicamente inconsistente entre maestro y relaciones.

### Restauración

1. Detener el servicio.
2. Respaldar el estado actual.
3. Restaurar el directorio completo.
4. Verificar propietario y permisos.
5. Iniciar el servicio.
6. Consultar `/health`.
7. Comparar cantidades de productos y relaciones.
8. Ejecutar una prueba de lectura y escritura controlada.

### Verificar JSON

En Linux:

```bash
jq empty local_data/*.json
```

En Node.js:

```bash
node -e "const fs=require('fs'); for(const f of fs.readdirSync('local_data').filter(x=>x.endsWith('.json'))){JSON.parse(fs.readFileSync('local_data/'+f,'utf8')); console.log('OK',f)}"
```

---

## 15. Solución de problemas

### La UI indica “guardado sólo local”

1. Consultar `/health`.
2. Revisar consola del navegador y pestaña Network.
3. Revisar logs del backend usando el request ID.
4. Verificar permisos de escritura en `DATA_DIR`.
5. Confirmar que el volumen no está lleno o montado como sólo lectura.
6. Reintentar después de restaurar el servicio.

No asumir que un valor visible en el navegador ya está centralizado.

### Un ticket eliminado reaparece

La eliminación local pudo ocurrir sin que el servidor confirmara el POST de
staging. Revisar:

- `POST /api/staging/ss_vispera_batch`;
- permisos del archivo;
- logs;
- conectividad del navegador con el backend.

### El Vispera ID desaparece después de recargar

Comprobar que el producto persistido contiene:

```json
{
  "vispera_id": "1234",
  "vispera_assigned_at": "2026-07-30T20:25:09.745Z"
}
```

Si sólo existe `visperaId` en `localStorage`, el backend no confirmó el cambio.

### Firebase aparece deshabilitado

Comprobar:

- `FIREBASE_ENABLED=true`.
- `DISABLE_FIREBASE_SYNC=0`.
- Ruta y permisos de `firebase-key.json`.
- Coincidencia entre `FIREBASE_PROJECT_ID` y `project_id` de la credencial.
- Nombre correcto de `FIREBASE_DATABASE_ID`.
- Salida HTTPS desde el servidor.

Consultar:

```bash
curl http://127.0.0.1:3000/api/last-sync
```

### Error de JSON inválido al arrancar o leer

1. No sobrescribir el archivo defectuoso.
2. Copiarlo para análisis.
3. Validarlo con `jq` o Node.
4. Restaurar desde el último backup conocido.
5. Comparar con archivos relacionados.

`StorageService` informa el nombre del archivo inválido sin exponer internamente
el stack al cliente.

### La UI no refleja un cambio reciente de JavaScript

- Recargar forzadamente el navegador.
- Confirmar los parámetros `?v=` en `index.html`.
- Revisar caché de Nginx/CDN.
- En producción, los assets tienen caché de un día.

---

## 16. Seguridad

### Controles presentes

- Helmet.
- CORS configurable.
- Rate limiting.
- Límite de tamaño JSON.
- Validación Zod.
- Bloqueo de claves peligrosas como `__proto__`.
- Rechazo de bytes NUL.
- Restricción de rutas de staging.
- Errores internos ocultos al cliente.
- Servidor Docker no root.
- Sólo se publican assets expresamente permitidos.
- Credencial Firebase ignorada por Git y Docker.

### Riesgos pendientes

- No existe login.
- No existe RBAC.
- No hay auditoría individual de todas las ediciones.
- `CORS_ORIGINS` permite `*` por defecto si no se configura.
- La política CSP está deshabilitada por compatibilidad con scripts inline/CDN.
- El frontend carga dependencias desde CDN.
- Algunos catálogos JSON están versionados en Git; revisar si contienen datos
  operacionales o sensibles.
- La persistencia JSON no admite escalamiento horizontal seguro.

### Prioridades antes de exposición pública

1. Autenticación.
2. Roles y permisos.
3. CORS restrictivo.
4. TLS.
5. Secretos fuera del repositorio.
6. Política CSP compatible con assets locales.
7. Auditoría de cambios.
8. Revisión de datos versionados.
9. Backups cifrados y pruebas de restauración.

---

## 17. Deuda técnica y decisiones pendientes

### Persistencia JSON

Ventajas actuales:

- Sencillez operativa.
- Compatibilidad con los catálogos existentes.
- Fácil inspección y backup.
- No requiere servicio de base de datos.

Limitaciones:

- Las actualizaciones reescriben arrays completos.
- No hay índices ni consultas relacionales.
- El tamaño de los archivos ya es material.
- No existe coordinación entre varias instancias.
- Los backups deben tratar varios archivos como una unidad.

### Frontend global

El frontend funciona, pero depende de:

- Variables globales.
- Orden manual de scripts.
- Renderizado con templates HTML.
- Convenciones no comprobadas por tipos.

Evolución sugerida:

- Separar módulos ES.
- Introducir TypeScript gradualmente.
- Añadir una capa de componentes o framework sólo si el equipo/alcance lo exige.
- Mantener contratos de regresión durante la migración.

### Convenciones camelCase/snake_case

Hay compatibilidad heredada entre formatos. Toda incorporación de campos necesita
pruebas explícitas de lectura y escritura.

### Dependencias CDN

Una caída o bloqueo de CDN puede afectar importación, gráficos o fechas. Evaluar
servir versiones fijadas desde el propio backend.

### Flujos Supabase heredados

El cron y webhook Supabase pueden divergir del catálogo JSON. Deben retirarse,
adaptarse o formalizarse.

---

## 18. Ruta recomendada hacia PostgreSQL

La arquitectura ya encapsula gran parte de la persistencia en `StorageService`, por
lo que el frontend y la API pueden conservarse.

### Esquema inicial sugerido

```text
products
  ean PK
  product_name
  brand
  producer
  category_master
  image_url
  vispera_id
  status
  metadata JSONB
  created_at
  updated_at

holdings
  id PK
  name
  color

product_holdings
  ean FK → products
  holding_id FK → holdings
  internal_sku_id
  local_product_name
  retailer_category
  is_trained
  metadata JSONB
  PK (ean, holding_id)

stores
categories
staging_items
import_history
sync_checkpoints
```

### Etapas

1. Congelar y documentar el contrato actual de la API.
2. Definir esquema, claves, restricciones e índices.
3. Implementar un repositorio PostgreSQL detrás de la misma interfaz.
4. Usar transacciones para productos y relaciones.
5. Crear migración idempotente desde los JSON.
6. Generar reporte de duplicados y conflictos.
7. Comparar cantidades y checksums lógicos.
8. Ejecutar ambos lectores temporalmente en un ambiente de prueba.
9. Preparar backup y rollback.
10. Realizar corte en ventana sin escrituras.
11. Mantener JSON sólo como exportación/backup, no como segunda fuente viva.

La mayor dificultad será la limpieza y validación de datos, no la conexión a
PostgreSQL.

---

## 19. Flujo recomendado para realizar cambios

1. Confirmar el comportamiento esperado.
2. Crear una rama desde `main`.
3. No editar manualmente datos operacionales sin backup.
4. Implementar el cambio en la capa correcta.
5. Añadir una prueba que reproduzca el defecto o requisito.
6. Ejecutar:

```bash
npm run check
npm run lint
npm run test:jest
npm run test:e2e
```

7. Revisar que las pruebas no apunten a `local_data`.
8. Revisar cambios de payload camelCase/snake_case.
9. Documentar nuevas variables de entorno.
10. Preparar instrucciones de despliegue y rollback.

### Regla para defectos de persistencia

Siempre comprobar los cuatro niveles:

```text
valor visible en input
  → objeto en memoria
  → payload HTTP
  → dato recargado desde el servidor
```

Un test que sólo comprueba la interfaz antes de recargar no demuestra
persistencia.

---

## 20. Checklist de incorporación de un nuevo encargado

### Primer día

- [ ] Obtener acceso al repositorio.
- [ ] Identificar dónde corre la instancia activa.
- [ ] Obtener acceso a logs y backups.
- [ ] Confirmar ubicación real de `DATA_DIR`.
- [ ] Confirmar responsable de Firebase.
- [ ] Confirmar si Supabase sigue operativo.
- [ ] Levantar el proyecto localmente.
- [ ] Ejecutar Jest y Playwright.
- [ ] Leer `README.md`, `TESTING.md` y esta guía.

### Primera semana

- [ ] Restaurar un backup en un ambiente aislado.
- [ ] Ejecutar una importación controlada.
- [ ] Seguir un producto desde la UI hasta el JSON.
- [ ] Ejecutar una sincronización Firebase de prueba.
- [ ] Revisar permisos, CORS y exposición de red.
- [ ] Verificar que la cuenta Firebase no esté en Git.
- [ ] Definir política de datos JSON versionados.
- [ ] Decidir el futuro del cron/webhook Supabase.
- [ ] Documentar responsables y canales de incidentes.

---

## 21. Glosario

| Término          | Significado en el proyecto                    |
| ---------------- | --------------------------------------------- |
| SKU              | Producto administrado                         |
| EAN              | Identificador principal del producto          |
| Master Catalog   | Datos universales del SKU                     |
| Holding/Retailer | Cadena o grupo comercial                      |
| Customer ID      | Identificador interno del SKU para un holding |
| Homologación     | Relación entre dato universal y dato local    |
| Levantamiento    | Registro capturado en terreno                 |
| Avistamiento     | Producto observado que requiere resolución    |
| Staging          | Cola temporal de revisión                     |
| Vispera ID       | Identificador asignado por Vispera            |
| Ticket Vispera   | SKU preparado o pendiente de ID               |
| Fuente de verdad | Sistema cuyos datos prevalecen                |

---

## 22. Contactos y propiedad

Completar durante el traspaso:

| Rol               | Persona/equipo | Contacto  |
| ----------------- | -------------- | --------- |
| Product owner     | Pendiente      | Pendiente |
| Encargado técnico | Pendiente      | Pendiente |
| Infraestructura   | Pendiente      | Pendiente |
| Firebase          | Pendiente      | Pendiente |
| Datos/Vispera     | Pendiente      | Pendiente |
| Seguridad         | Pendiente      | Pendiente |

También registrar fuera del repositorio:

- URL de producción.
- Servidor o cluster.
- Ubicación de backups.
- Procedimiento de acceso.
- Proyecto y base Firebase.
- Dominio y renovación TLS.
- Secretos de CI/CD.
- Calendario de mantenimiento.

---

## 23. Documentos relacionados

- `README.md`: instalación, arquitectura y operación resumida.
- `TESTING.md`: guía detallada de pruebas.
- `DEPLOYMENT_UBUNTU.md`: despliegue Ubuntu.
- `DEPLOYMENT_PUBLIC_UBUNTU_NO_AUTH.md`: despliegue público sin autenticación
  interna; debe revisarse con especial cuidado.
- `Manual_actualizacion.md`: procedimiento operativo heredado para actualizar
  la instalación Ubuntu mediante ZIP y Docker.
- `.env.example`: catálogo de variables.
- `src/docs/openapi.js`: contrato de API.

---

## 24. Principio operativo final

El sistema debe mantener una sola fuente oficial de verdad. En la arquitectura
actual esa fuente son los JSON del servidor Express. Firebase es una entrada
opcional; `localStorage` es caché; Supabase es un componente heredado o paralelo.

Antes de incorporar otro almacenamiento o integración, definir explícitamente:

- quién escribe;
- quién lee;
- qué sistema prevalece;
- cómo se detectan conflictos;
- cómo se respalda;
- cómo se prueba la restauración;
- cómo se revierte un despliegue.

Esta definición evita que un dato parezca correcto en una pantalla, pero no sea
permanente ni compartido por el resto de los usuarios.
