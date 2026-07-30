# Smart Shelf — SKU Data Manager

Aplicación web para administrar un catálogo maestro de SKU, relaciones por holding,
staging, importaciones y sincronización opcional con Firebase. Node.js/Express sirve
la SPA y mantiene los archivos JSON de `local_data/` como fuente oficial de verdad.
Los Excel se procesan y descartan: nunca se almacenan en el backend.

## Requisitos e instalación

- Node.js 22 LTS (Node 20 o superior también es compatible).
- npm.
- Un directorio persistente con permisos de escritura para los JSON.

```bash
cp .env.example .env
npm ci
npm test
npm start
```

La aplicación queda disponible en `http://localhost:3000` y el healthcheck en
`http://localhost:3000/health`.

## Arquitectura

```text
src/
  config/       configuración y valores iniciales
  controllers/  adaptación HTTP
  docs/         contrato OpenAPI
  errors/       errores de aplicación
  middleware/   seguridad, validación, logging y errores
  routes/       definición de endpoints
  services/     negocio, Firebase, auditoría y APIs externas
  storage/      única capa con conocimiento de archivos físicos
  utils/        utilidades puras
```

`src/server.js` gestiona el ciclo de vida; `src/app.js` construye Express sin abrir
puertos; y `StorageService` concentra lectura, caché, escritura atómica y rutas. Los
catálogos existentes no cambian de nombre ni de formato.

## Variables de entorno

Use `.env.example` como referencia. Las opciones principales son:

| Variable                |                        Predeterminado | Uso                                           |
| ----------------------- | ------------------------------------: | --------------------------------------------- |
| `PORT` / `HOST`         |                    `3000` / `0.0.0.0` | Escucha HTTP                                  |
| `DATA_DIR`              |                          `local_data` | Única raíz de persistencia                    |
| `LOG_LEVEL`             | `debug` desarrollo, `info` producción | Nivel Pino                                    |
| `CORS_ORIGINS`          |                                   `*` | Orígenes separados por coma                   |
| `TRUST_PROXY`           |                                   `1` | Saltos de proxy confiables                    |
| `JSON_BODY_LIMIT`       |                                `50mb` | Límite de requests JSON                       |
| `RATE_LIMIT_MAX`        |                                 `600` | Requests por ventana/IP                       |
| `MAX_IMPORT_RECORDS`    |                              `100000` | Registros máximos por lote                    |
| `STORAGE_CACHE_TTL_MS`  |                                `5000` | TTL de caché JSON                             |
| `FIREBASE_ENABLED`      |                                `true` | Activa Firebase si existe credencial          |
| `DISABLE_FIREBASE_SYNC` |                                   `0` | Switch heredado; `1` desactiva                |
| `FIREBASE_PROJECT_ID`   |                       Credencial JSON | Proyecto esperado; detecta claves incorrectas |
| `FIREBASE_DATABASE_ID`  |                           `(default)` | Base Firestore que se debe consultar          |
| `EXTERNAL_API_URL`      |                       Open Food Facts | Servicio de enriquecimiento                   |
| `OPEN_PRODUCTS_API_URL` |                   Open Products Facts | Enriquecimiento alternativo                   |
| `SOLOTODO_API_URL`      |                  API pública SoloTodo | Búsqueda exacta de EAN                        |

No guarde secretos en `.env.example`. La credencial Firebase debe existir, por
defecto, en `DATA_DIR/firebase-key.json`, con permisos solo para el usuario del
servicio. Si Firebase se desactiva o la credencial no existe, la aplicación continúa
sin errores ni intentos de sincronización.

Para comprobar la configuración del servidor antes del corte DNS:

```bash
curl -s http://127.0.0.1:3000/api/last-sync
```

Cuando Firebase está activo, la respuesta incluye `projectId` y `databaseId`. Un error
Firestore `NOT_FOUND` suele indicar que el proceso desplegado apunta a otro proyecto o
base. Confirme que `FIREBASE_PROJECT_ID` coincide con `project_id` dentro de la
credencial, que `FIREBASE_DATABASE_ID` identifica una base existente y reinicie el
contenedor/servicio después de modificar `.env`.

## API

Las respuestas normales usan `{ "success": true, "data": ... }`; los errores usan
`{ "success": false, "error": "..." }`. Nunca se expone un stack trace. El contrato
completo está en `GET /api/openapi.json`.

Endpoints principales:

- `GET|POST|DELETE /api/products`
- `POST /api/products/bulk`
- `GET|POST /api/holdings`
- `DELETE /api/holdings/:id`
- `GET|POST /api/stores`
- `GET|POST /api/category-hierarchy`
- `GET|POST /api/staging/:key`
- `POST /api/sync-firebase` y `GET /api/last-sync`
- `GET /api/import-history`

El historial de importaciones almacena solo fecha, cantidad de registros, usuario
opcional, duración y resultado. Está limitado a las últimas
`IMPORT_HISTORY_LIMIT` entradas.

## Docker

```bash
docker build -t sku-data-manager:latest .
docker run -d --name sku-data-manager \
  --env-file .env \
  -p 127.0.0.1:3000:3000 \
  -v /srv/sku-data/local_data:/app/local_data \
  --restart unless-stopped \
  sku-data-manager:latest
```

La imagen es multi-stage, ejecuta como usuario no root, excluye datos y credenciales,
y contiene healthcheck. Prepare el volumen:

```bash
sudo install -d -o 1000 -g 1000 -m 750 /srv/sku-data/local_data
```

## Ubuntu con systemd

Instale Node.js LTS, clone en `/opt/sku-data-manager`, ejecute `npm ci --omit=dev`,
copie `.env.example` a `.env` y configure un servicio:

```ini
[Unit]
Description=Smart Shelf SKU Data Manager
After=network-online.target

[Service]
Type=simple
User=sku-data
Group=sku-data
WorkingDirectory=/opt/sku-data-manager
EnvironmentFile=/opt/sku-data-manager/.env
ExecStart=/usr/bin/node /opt/sku-data-manager/server.js
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

Después: `sudo systemctl daemon-reload && sudo systemctl enable --now sku-data-manager`.

## Nginx

No requiere cambios en la aplicación. Mantenga `TRUST_PROXY=1` para un único Nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
    client_max_body_size 50m;
}
```

Termine TLS en Nginx y limite el puerto 3000 a localhost/firewall.

## Backups y restauración

Detenga escrituras o el servicio durante el snapshot y copie todo `DATA_DIR`; no
seleccione archivos individuales porque catálogo y relaciones forman una unidad:

```bash
sudo systemctl stop sku-data-manager
sudo tar -C /srv/sku-data -czf "/srv/backups/sku-data-$(date +%F-%H%M).tgz" local_data
sudo systemctl start sku-data-manager
```

Para restaurar, detenga el servicio, conserve una copia del estado actual, extraiga
el backup sobre `DATA_DIR`, verifique propietario/permisos y arranque. Pruebe backups
periódicamente. Nunca incluya Excel en el volumen.

## Calidad y operación

```bash
npm run test:install-browsers # una vez: instala Chromium para Playwright
npm test          # sintaxis, ESLint, Jest/Supertest y Playwright
npm run test:jest # sólo pruebas unitarias, integración API y regresión
npm run test:e2e  # sólo recorridos End-to-End en Chromium
npm run format    # Prettier
npm run dev       # reinicio automático local
```

Las pruebas no usan `local_data/`: Jest crea directorios temporales y Playwright
levanta un backend aislado en el puerto `4173`, desactiva Firebase y elimina sus
datos al terminar. Consulte [TESTING.md](TESTING.md) para ver todos los scripts,
la organización de la suite, cobertura, ejecución headed y solución de problemas.

La aplicación registra JSON estructurado por stdout. En producción use el recolector
de Docker/journald y no archivos internos de log. `SIGTERM` y `SIGINT` detienen nuevas
conexiones, esperan escrituras pendientes y liberan timers.
