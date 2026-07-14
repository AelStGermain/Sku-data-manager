# Smart Shelf — Multi-Holding Data Warehouse

![Smart Shelf Logo](https://img.shields.io/badge/Smart_Shelf-Multi--Holding_DW-005BAC?style=for-the-badge&logo=supabase)

**Autor:** Sofía Gómez (Estudiante de Técnico en Informática)  
**Proyecto de Integración:** Taller de Integración Profesional

## Descripción del Proyecto

**Smart Shelf — Multi-Holding Data Warehouse** es una plataforma centralizada (Single Page Application) orientada a resolver un dolor crítico en la logística del retail omnicanal: **la fragmentación e inconsistencia de los datos maestros (SKUs)** entre múltiples holdings (Tottus, Jumbo, Unimarc).

El sistema implementa una arquitectura **BigQuery Data Warehouse Multi-Holding** con un **Pipeline de Matching & Enrichment** automatizado para gestionar EANs que no existen en el catálogo maestro, enriquecerlos usando APIs externas (Open Food Facts / Open Products), y prepararlos para envío a Vispera.

## Acceso en Vivo (Producción)

El proyecto se encuentra desplegado de forma continua en Vercel:
**[Visitar Smart Shelf — Multi-Holding DW](https://sku-data-manager.vercel.app/)**

## Arquitectura Técnica

### BigQuery Data Warehouse (Modelo Conceptual)

El sistema implementa la siguiente estructura de datos:

```
┌──────────────────────────────────────────────────┐
│           BigQuery Data Warehouse                │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │  Universal Products (Master SKU)        │    │
│  │  ─ master_product_id (PK)              │    │
│  │  ─ ean (BK)                            │    │
│  │  ─ vispera_id (ALT BK)                │    │
│  │  ─ brand_id (FK)                       │    │
│  │  ─ producer_id (FK)                    │    │
│  │  ─ packaging_type, weight_gram         │    │
│  │  ─ product_image_url                   │    │
│  └─────────────┬───────────────────────────┘    │
│                │                                 │
│  ┌─────────────┴───────────┐  ┌──────────────┐ │
│  │ Holding SKU Catalog     │  │ Universal    │ │
│  │ ─ holding_product_id   │  │ Categories   │ │
│  │ ─ master_product_id(FK)│  │ (Vispera)    │ │
│  │ ─ ean                  │  │ 17 categorías│ │
│  │ ─ holding_internal_id  │  └──────────────┘ │
│  │ ─ local_product_name   │                    │
│  │ ─ local_category_name  │                    │
│  │ ─ is_active_holding    │                    │
│  └─────────────────────────┘                    │
└──────────────────────────────────────────────────┘
```

### Categorías Universales Vispera (17)

`GROCERY STORE` · `SWEET` · `ALCOHOL` · `CLEANING` · `DAIRYS` · `FROZEN` · `BREAKFAST` · `SNACKS` · `BABY` · `PET` · `DESSERT` · `CEREALS` · `CANNED FOOD` · `DETERGENTS` · `DRINKS` · `HEALTHY` · `PAPER ITEMS`

### Pipeline de Matching & Enrichment (4 Pasos)

1. **Comparar Staging EANs** contra el Master SKU EAN Index
2. **EANs no matcheados** → `staging_unmatched_eans`
3. **Enriquecer con APIs** (Open Food Facts / Open Products) → nombre, marca, peso, categoría
4. **Portal de Revisión Manual** (GUI) → aprobar e insertar en Universal Products

### Stack

* **Frontend (Cliente):** Vanilla JavaScript (ES6+), HTML5, CSS3
* **Backend (BaaS):** Supabase (PostgreSQL) simulando BigQuery Data Warehouse
* **APIs Externas:** Open Food Facts, Open Products Facts
* **Deploy:** Vercel (Serverless JAMstack)

## Estructura de la Base de Datos

### Tablas Principales

| Tabla | Descripción |
|---|---|
| `master_catalog` | **Universal Products** — fuente única de verdad para todos los SKUs |
| `retailer_catalog` | **Holding SKU Catalog** — datos específicos de cada holding |
| `universal_categories` | 17 categorías globales del modelo Vispera |
| `product_universal_category_mapping` | Mapeo producto ↔ categoría Vispera |
| `brands_producers` | Marcas y productores como entidad separada |

### Tablas de Staging

| Tabla | Descripción |
|---|---|
| `staging_levantamiento` | Datos crudos de la App de Levantamiento (DMU, EAN) |
| `staging_unmatched_eans` | EANs que no existen en el maestro, pendientes de enriquecimiento |
| `vispera_submission_batch` | Lotes agrupados listos para enviar a Vispera |

## Vistas de la Aplicación

| Vista | Descripción |
|---|---|
| **Catálogo** | Explorador de Universal Products con filtros por Holding y categoría |
| **Importar** | Ingesta masiva de SKUs desde CSV/Excel con auto-mapping |
| **Modo Edición** | Edición masiva con Buscar y Reemplazar (Regex) |
| **Holdings** | Gestión de Holdings (antes Retailers), sucursales físicas, planogramas |
| **Levantamiento** | App de captura de datos de terreno (DMU, EAN, Auditor) |
| **Pipeline** | Matching & Enrichment — staging, enriquecimiento API, revisión manual |
| **API / ETL** | Sandbox de webhook y endpoints de datos limpios |

## Despliegue Local

```bash
git clone https://github.com/AelStGermain/Sku-data-manager.git
```

