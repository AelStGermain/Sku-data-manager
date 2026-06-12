# Smart Shelf - Master Data Platform 

![Smart Shelf Logo](https://img.shields.io/badge/Smart_Shelf-Master_Data-005BAC?style=for-the-badge&logo=supabase)

**Autor:** Sofía Gómez (Estudiante de Técnico en Logística)  
**Proyecto de Integración:** Taller de Integración Técnico (Etapa 3)

##  Descripción del Proyecto

**Smart Shelf - Master Data** es una plataforma centralizada (Single Page Application) orientada a resolver un dolor crítico en la logística del retail omnicanal: **la fragmentación e inconsistencia de los datos maestros (SKUs)** entre múltiples cadenas (Tottus, Jumbo, Unimarc).

Históricamente, la homologación de datos logísticos se ha manejado mediante planillas de cálculo (Excel) compartidas, lo que genera alta propensión a errores humanos, datos corruptos y, finalmente, discrepancias de inventario y quiebres de stock. Este proyecto reemplaza este flujo manual por una solución escalable en la nube, garantizando una **única fuente de la verdad (Single Source of Truth)**.

##  Acceso en Vivo (Producción)

El proyecto se encuentra desplegado de forma continua en Vercel y puede ser accedido públicamente:
** [Visitar Smart Shelf - Master Data en Producción](https://sku-data-manager.vercel.app/)**

##  Arquitectura Técnica y Stack

El proyecto fue construido priorizando la eficiencia operativa, evitando la sobrecarga de frameworks innecesarios en el frontend y apoyándose en un BaaS robusto para la capa de persistencia.

* **Frontend (Cliente):** Vanilla JavaScript (ES6+), HTML5 Semántico, y CSS3 (Variables, Flexbox/Grid). Se utiliza el patrón de diseño "Módulo (Module Pattern)" (IIFE) para encapsular la lógica de negocio y estado (ej. `DB.js`, `API.js`, `ui-catalog.js`).
* **Integración Externa (API):** Consumo automatizado de la API RESTful de [OpenFoodFacts](https://world.openfoodfacts.org/data) para el enriquecimiento asíncrono de SKUs (dimensiones, ingredientes e imágenes).

##  Estructura de la Base de Datos (Supabase)

El backend opera bajo el modelo BaaS (Backend as a Service) utilizando **Supabase (PostgreSQL)**, lo cual elimina la necesidad de mantener un servidor web tradicional y confía la persistencia a un motor relacional de grado empresarial.

La base de datos se modeló principalmente sobre dos tablas fundamentales para mantener la **integridad referencial** del catálogo:

1. **`master_catalog` (El Catálogo Matriz):**
   * Es la fuente única de la verdad (Single Source of Truth). Almacena todos los SKUs de manera agnóstica al supermercado.
   * **Columnas principales:** `ean` (Primary Key), `product_name`, `brand`, `category_master`, `image_url`, `weight_g`, dimensiones, etc.
   * Todo el enriquecimiento mediante API recae sobre esta tabla.

2. **`retailer_catalog` (La Tabla de Relaciones):**
   * Almacena cómo cada supermercado o minorista (ej. Jumbo, Tottus, Unimarc) interpreta o registra ese producto en su sistema interno.
   * **Columnas principales:** `uuid` (Primary Key), `ean` (Foreign Key hacia `master_catalog`), `retailer_id`, `internal_sku_id` (Código interno del supermercado para ese EAN), `is_trained`.
   * Permite que un solo código EAN esté atado a tres supermercados diferentes sin duplicar el registro maestro.

**Seguridad de Datos:** Se implementó configuración de **Row Level Security (RLS)** directamente en PostgreSQL para asegurar los endpoints de la API REST que expone Supabase.

##  Características y Soluciones a Desafíos de Ingeniería

1. **Ingesta Masiva y Paginación en Bloques (Chunking):**  
   Al enfrentarnos al problema técnico de exceder el límite de carga útil (Payload too large) de la base de datos al subir miles de SKUs con imágenes pesadas codificadas en Base64, se diseñó un algoritmo de partición (chunking). El sistema divide y envía los datos en pequeños lotes, manteniendo la estabilidad de la red y evitando cuellos de botella en el servidor.

2. **Data Cleansing y Auditoría Continua:**  
   La plataforma cuenta con un "Modo Edición" especializado que permite filtrar productos inconsistentes (completitud menor al 50%, sin categoría) y aplicar herramientas masivas como *Buscar y Reemplazar* usando Expresiones Regulares (Regex) nativas para limpiar el texto proveniente de los Excels de proveedores.

3. **Manejo de Concurrencia y Resiliencia (Backoff):**  
   La conexión con las APIs de enriquecimiento implementa *Exponential Backoff* para gestionar automáticamente los límites de tasa (Rate Limits - Error 429) del servidor externo, asegurando que todos los productos seleccionados sean escaneados.

4. **Estado Híbrido (Local-First):**  
   La aplicación utiliza estrategias de caché en `localStorage` sincronizándose en segundo plano con Supabase, permitiendo que las búsquedas y filtros en la vista (sobre más de 1,600 nodos en el DOM) ocurran a 60fps sin latencia de red constante.

##  Despliegue e Instalación Local

Al ser una arquitectura "Serverless / JAMstack", la aplicación está alojada nativamente en la nube de **Vercel** para su entorno de producción.

Para ejecutar en un entorno local (Desarrollo):
1. Clona el repositorio:
   ```bash
   git clone https://github.com/AelStGermain/Sku-data-manager.git
   ```
2. No requiere Node.js ni compilación inicial (Webpack/Vite). Simplemente sirve el directorio raíz usando un servidor HTTP estático (ej. Live Server en VSCode o `python -m http.server`).

##  Conclusión Académica

Si bien el enfoque de mi lugar de práctica ha sido en la Inteligencia Artificial y el reconocimiento visual, este proyecto demostró una hipótesis fundamental en la ciencia de datos y logística: **Ninguna IA ni algoritmo predictivo funcionará correctamente si la base de datos subyacente (el flujo digital) es inconsistente o basura.** Optimizar primero la captura, limpieza y estructuración de los Datos Maestros es el pilar para cualquier innovación tecnológica futura.
