# Justificación de cambios para Pull Request

- **Arquitectura:** se redujo `server.js` a bootstrap y se separaron HTTP, negocio,
  almacenamiento, configuración y servicios externos. Esto permite probar y cambiar
  cada responsabilidad sin tocar las demás.
- **Persistencia:** `StorageService` es el único módulo que conoce rutas físicas.
  Conserva nombres y formato de los JSON, añade caché acotada y escrituras atómicas
  serializadas para reducir I/O y riesgo de corrupción.
- **Compatibilidad:** el cliente entiende el nuevo sobre uniforme de API y conserva
  soporte para respuestas directas antiguas/offline. No cambia ninguna interacción.
- **Seguridad:** Helmet, CORS configurable, rate limiting, límites de payload,
  validación Zod, rechazo de claves peligrosas y allow-list de staging.
- **Operación:** Pino reemplaza logs dispersos; Firebase opcional no genera fallos;
  hay healthcheck, apagado elegante, contenedor no root y guía Ubuntu/Nginx/backups.
- **Auditoría:** el lote registra metadatos mínimos en un JSON separado y rotado. No
  se almacena el Excel ni se altera el catálogo.
- **Dependencias:** se retiraron paquetes de servidor sin uso y las herramientas de
  importación/enriquecimiento quedaron fuera de las dependencias de la imagen. SheetJS
  0.18.5 sigue siendo una dependencia de desarrollo heredada; la migración a su
  distribución externa 0.20.3 requiere una aprobación explícita de cadena de suministro.
