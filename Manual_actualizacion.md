# HANDOVER.md
# SKU Data Manager - Documentación de Traspaso

Autor original: Sofía G.
Fecha: Julio 2026

---

# Introducción

Este documento tiene como objetivo facilitar la continuidad del proyecto para cualquier desarrollador que deba mantener o actualizar la aplicación.

La aplicación se encuentra actualmente funcionando en un servidor Ubuntu mediante Docker y Nginx.

Actualmente el acceso se realiza mediante la IP del servidor (aún no existe un dominio asociado).

---

# Repositorio

Repositorio oficial

https://github.com/AelStGermain/Sku-data-manager

---

# Tecnologías utilizadas

- Node.js
- Express
- Docker
- Docker Compose
- Nginx
- Firebase Admin SDK
- Firestore
- HTML / CSS / JavaScript

---

# Arquitectura

```
GitHub
     │
     ▼
Servidor Ubuntu
     │
     ▼
Docker
     │
     ▼
Node.js
     │
     ▼
Firestore
```

Los datos persistentes se almacenan fuera del contenedor Docker.

---

# Rutas importantes

Código fuente

```
/opt/master-data-followup
```

Datos persistentes

```
/var/lib/master-data-followup
```

Contenedor Docker

```
master-data-followup
```

---

# IMPORTANTE

Nunca eliminar la carpeta

```
/var/lib/master-data-followup
```

Allí se encuentran:

- firebase-key.json
- catálogos
- sincronizaciones
- datos persistentes

La aplicación puede reinstalarse completamente y seguirá funcionando mientras esa carpeta permanezca intacta.

---

# Actualización del proyecto

Actualmente el servidor **NO** está conectado directamente al repositorio mediante Git.

Por ese motivo las actualizaciones se realizan manualmente.

---

## Paso 1

Entrar al repositorio

https://github.com/AelStGermain/Sku-data-manager

Descargar

```
Code

↓

Download ZIP
```

---

## Paso 2

Copiar el ZIP al servidor Ubuntu.

---

## Paso 3

Ir al directorio donde se encuentra instalado el proyecto

```
cd /opt
```

---

## Paso 4

Respaldar la versión anterior (opcional pero recomendado)

```
sudo mv master-data-followup master-data-followup_backup
```

---

## Paso 5

Descomprimir el ZIP

```
sudo unzip Sku-data-manager-main.zip
```

Renombrar

```
sudo mv Sku-data-manager-main master-data-followup
```

---

## Paso 6

Reconstruir Docker

```
cd /opt/master-data-followup

docker compose build
```

---

## Paso 7

Levantar nuevamente la aplicación

```
docker compose up -d
```

---

## Paso 8

Verificar

```
docker ps
```

Debe aparecer

```
master-data-followup

STATUS

Up (healthy)
```

---

## Paso 9

Revisar logs

```
docker logs -f master-data-followup
```

La inicialización correcta muestra algo similar a

```
Firebase Admin SDK inicializado

Consultando Firebase

No hay nuevos datos
```

---

## Paso 10

Abrir la aplicación desde el navegador

```
http://IP_DEL_SERVIDOR
```

Verificar:

- carga correctamente
- búsqueda funciona
- sincronización funciona

---

# Problemas frecuentes

## Docker no inicia

Revisar

```
docker ps -a
```

Luego

```
docker logs master-data-followup
```

---

## Error Firebase

Verificar que exista

```
/var/lib/master-data-followup/firebase-key.json
```

y que corresponda al proyecto correcto.

---

## El contenedor aparece "Exited"

Reconstruir

```
docker compose build

docker compose up -d
```

---

## Error de imágenes

Las imágenes provienen directamente desde la CDN de Falabella.

Es normal que algunas devuelvan 403 o 404.

No corresponde a un problema del servidor.

---

# Mejoras recomendadas

Actualmente las actualizaciones se realizan descargando manualmente el ZIP del repositorio.

Esto funciona correctamente, pero no es el método ideal.

La mejora recomendada consiste en conectar el servidor directamente al repositorio GitHub mediante autenticación SSH.

Con ello bastaría ejecutar

```
git pull

docker compose build

docker compose up -d
```

reduciendo la actualización a pocos comandos.

---

# Recomendación para el repositorio

Actualmente el repositorio pertenece a mi cuenta personal.

Si el proyecto continuará desarrollándose, se recomienda:

- mover el repositorio a una organización GitHub de la empresa

o bien

- agregar como colaboradores a los desarrolladores que continuarán el proyecto.

---

# Comandos útiles

Ver contenedores

```
docker ps
```

Ver todos

```
docker ps -a
```

Ver logs

```
docker logs -f master-data-followup
```

Reiniciar

```
docker compose up -d
```

Reconstruir

```
docker compose build
```

Reconstruir e iniciar

```
docker compose up -d --build
```

Estado de nginx

```
sudo systemctl status nginx
```

---

# Contacto

Durante el período de práctica cualquier duda puede resolverse revisando este documento y los logs del contenedor.

La aplicación quedó desplegada y operativa al momento del traspaso.

```
Versión entregada:

Julio 2026
```
