# Pruebas automatizadas

La suite está dividida por alcance:

- Jest prueba utilidades, servicios, middleware, persistencia y regresiones del
  JavaScript clásico del navegador.
- Supertest prueba la aplicación Express en memoria, sin reservar un puerto.
- Playwright prueba la SPA completa en Chromium contra un backend aislado.

Ninguna prueba escribe en `local_data/`, requiere credenciales Firebase ni consulta
catálogos externos.

## Preparación

Instale las dependencias y el navegador una vez:

```bash
npm ci
npm run test:install-browsers
```

En una imagen Linux mínima, Playwright también puede instalar las bibliotecas del
sistema:

```bash
npx playwright install --with-deps chromium
```

## Comandos

| Comando                         | Alcance                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `npm test`                      | Sintaxis, ESLint, toda la suite Jest y todos los E2E     |
| `npm run test:jest`             | Unidades, integración HTTP y regresiones del cliente     |
| `npm run test:unit`             | Sólo `tests/unit/`                                       |
| `npm run test:api`              | Sólo la API con Jest y Supertest                         |
| `npm run test:coverage`         | Jest con reporte de cobertura en `coverage/`             |
| `npm run test:e2e`              | Playwright headless en Chromium                          |
| `npm run test:e2e:headed`       | Playwright con navegador visible                         |
| `npm run test:install-browsers` | Instala la versión de Chromium compatible con Playwright |

Para ejecutar un archivo o filtrar por nombre:

```bash
npm run test:jest -- tests/unit/storage-service.test.js
npm run test:e2e -- --grep "abre su ficha"
```

## Organización

```text
tests/
  helpers/       logger y fábrica de aplicación aislada
  unit/          utilidades, servicios, almacenamiento y middleware
  integration/   contratos HTTP de todos los grupos de endpoints
  regression/    lógica heredada del cliente y flujos críticos
  e2e/           recorridos de navegador y lifecycle del servidor E2E
```

La integración crea un `DATA_DIR` único dentro del directorio temporal del sistema
para cada aplicación y lo elimina en `afterEach`. Firebase se desactiva y los
servicios externos se simulan.

El setup global de Playwright crea `tests/.tmp/e2e-data`, inicia Express en
`127.0.0.1:4173`, carga un producto controlado desde la API y limpia servidor y
archivos al finalizar. Las CDN de terceros se bloquean en los tests para que el
resultado sea determinista. Si el puerto está ocupado, seleccione otro:

```bash
E2E_PORT=4180 npm run test:e2e
```

En PowerShell:

```powershell
$env:E2E_PORT = "4180"
npm run test:e2e
```

## Evidencia de fallos

Playwright conserva captura, video y traza sólo cuando falla una prueba. Los
artefactos se guardan en `test-results/` y el reporte navegable en
`playwright-report/`. Para abrir el reporte:

```bash
npx playwright show-report
```

Jest escribe el reporte HTML de cobertura en `coverage/lcov-report/index.html` y
exige como mínimo global 85% de statements/líneas, 90% de funciones y 75% de
branches. Todos estos directorios están ignorados por Git.

## Ejecución en CI

Una secuencia reproducible es:

```bash
npm ci
npx playwright install --with-deps chromium
npm test
```

Con `CI=1`, Playwright prohíbe pruebas marcadas accidentalmente con `test.only`,
reintenta fallos hasta dos veces y genera un reporte HTML sin intentar abrirlo.

## Problemas frecuentes

- `Executable doesn't exist`: ejecute `npm run test:install-browsers`.
- Puerto `4173` ocupado: use `E2E_PORT` como se muestra arriba.
- Fallos que sólo ocurren con navegador visible: ejecute
  `npm run test:e2e:headed` y revise la traza.
- Una prueba deja datos: confirme que utiliza `createTestApp()` o el setup global
  E2E; nunca apunte `DATA_DIR` a `local_data/`.
