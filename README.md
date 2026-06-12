# Smart Shelf - Master Data Platform 📦

![Smart Shelf Logo](https://img.shields.io/badge/Smart_Shelf-Master_Data-005BAC?style=for-the-badge&logo=supabase)

**Autor:** Sofía Gómez (Estudiante de Técnico en Logística)  
**Proyecto de Integración:** Taller de Integración Técnico (Etapa 3)

## 📋 Descripción del Proyecto

**Smart Shelf - Master Data** es una plataforma centralizada (Single Page Application) orientada a resolver un dolor crítico en la logística del retail omnicanal: **la fragmentación e inconsistencia de los datos maestros (SKUs)** entre múltiples cadenas (Tottus, Jumbo, Unimarc).

Históricamente, la homologación de datos logísticos se ha manejado mediante planillas de cálculo (Excel) compartidas, lo que genera alta propensión a errores humanos, datos corruptos y, finalmente, discrepancias de inventario y quiebres de stock. Este proyecto reemplaza este flujo manual por una solución escalable en la nube, garantizando una **única fuente de la verdad (Single Source of Truth)**.

## 🏗️ Arquitectura Técnica y Stack

El proyecto fue construido priorizando la eficiencia operativa, evitando la sobrecarga de frameworks innecesarios en el frontend y apoyándose en un BaaS robusto para la capa de persistencia.

* **Frontend (Cliente):** Vanilla JavaScript (ES6+), HTML5 Semántico, y CSS3 (Variables, Flexbox/Grid). Se utiliza el patrón de diseño "Módulo (Module Pattern)" (IIFE) para encapsular la lógica de negocio y estado (ej. `DB.js`, `API.js`, `ui-catalog.js`).
* **Backend y Base de Datos (BaaS):** [Supabase](https://supabase.com/) (PostgreSQL). Actúa como gestor de datos relacionales, manejando la tabla `master_catalog` y las relaciones de los retailers a través de `retailer_catalog`.
* **Seguridad de Datos:** Se implementó configuración de **Row Level Security (RLS)** directamente en PostgreSQL para asegurar los endpoints de la API REST que expone Supabase.
* **Integración Externa (API):** Consumo automatizado de la API RESTful de [OpenFoodFacts](https://world.openfoodfacts.org/data) para el enriquecimiento asíncrono de SKUs (dimensiones, ingredientes e imágenes).

## 🚀 Características y Soluciones a Desafíos de Ingeniería

1. **Ingesta Masiva y Paginación en Bloques (Chunking):**  
   Al enfrentarnos al problema técnico de exceder el límite de carga útil (Payload too large) de la base de datos al subir miles de SKUs con imágenes pesadas codificadas en Base64, se diseñó un algoritmo de partición (chunking). El sistema divide y envía los datos en pequeños lotes, manteniendo la estabilidad de la red y evitando cuellos de botella en el servidor.

2. **Data Cleansing y Auditoría Continua:**  
   La plataforma cuenta con un "Modo Edición" especializado que permite filtrar productos inconsistentes (completitud menor al 50%, sin categoría) y aplicar herramientas masivas como *Buscar y Reemplazar* usando Expresiones Regulares (Regex) nativas para limpiar el texto proveniente de los Excels de proveedores.

3. **Manejo de Concurrencia y Resiliencia (Backoff):**  
   La conexión con las APIs de enriquecimiento implementa *Exponential Backoff* para gestionar automáticamente los límites de tasa (Rate Limits - Error 429) del servidor externo, asegurando que todos los productos seleccionados sean escaneados.

4. **Estado Híbrido (Local-First):**  
   La aplicación utiliza estrategias de caché en `localStorage` sincronizándose en segundo plano con Supabase, permitiendo que las búsquedas y filtros en la vista (sobre más de 1,600 nodos en el DOM) ocurran a 60fps sin latencia de red constante.

## ⚙️ Instalación y Uso Local

Al ser una arquitectura "Serverless / JAMstack", la instalación es sumamente sencilla:

1. Clona el repositorio:
   ```bash
   git clone https://github.com/AelStGermain/Sku-data-manager.git
   ```
2. No requiere Node.js ni compilación inicial (Webpack/Vite). Simplemente sirve el directorio raíz usando cualquier servidor HTTP local.
   * Usando Python: `python -m http.server 8000`
   * Usando Live Server (VSCode)
3. Abre `http://localhost:8000` en tu navegador.

## 🎓 Conclusión Académica

Si bien el enfoque de mi lugar de práctica ha sido en la Inteligencia Artificial y el reconocimiento visual, este proyecto demostró una hipótesis fundamental en la ciencia de datos y logística: **Ninguna IA ni algoritmo predictivo funcionará correctamente si la base de datos subyacente (el flujo digital) es inconsistente o basura.** Optimizar primero la captura, limpieza y estructuración de los Datos Maestros es el pilar para cualquier innovación tecnológica futura.
