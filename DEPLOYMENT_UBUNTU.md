# Manual de instalación en Ubuntu Server

Este documento instala Smart Shelf como aplicación web interna usando Docker
Compose y Nginx. Está escrito para una instalación nueva y asume Ubuntu Server
24.04 LTS, una IP fija y acceso administrativo mediante `sudo`.

## 1. Datos que TI debe definir antes de comenzar

Solicitar y anotar:

- IP fija del servidor, por ejemplo `192.168.10.50`.
- Subred autorizada, por ejemplo `192.168.10.0/24`.
- Nombre DNS interno, por ejemplo `smart-shelf.empresa.local`.
- Repositorio o paquete desde el que se copiará el proyecto.
- Credencial de servicio Firebase `firebase-key.json`, si se usará la
  sincronización de levantamientos.
- Certificado TLS de la autoridad certificadora interna, si la empresa exige
  HTTPS.

Mientras no exista autenticación, el acceso debe limitarse por red. No se debe
publicar esta aplicación en Internet.

## 2. Requisitos de red

Los computadores usuarios deben poder resolver el nombre DNS interno y llegar a
los puertos 80 o 443 del servidor.

La aplicación actual también necesita salida HTTPS (TCP 443) desde los
navegadores hacia:

- `cdn.jsdelivr.net`
- `npmcdn.com`
- `fonts.googleapis.com` y `fonts.gstatic.com`
- `world.openfoodfacts.org`
- `world.openproductsfacts.org`
- `publicapi.solotodo.com`
- El dominio Supabase configurado en `js/db.js`

El servidor necesita salida HTTPS hacia Firebase y Open Food Facts. Si la red no
permite Internet, estas dependencias deben alojarse localmente antes de instalar.

## 3. Preparar Ubuntu

Actualizar el sistema e instalar herramientas básicas:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git nginx ufw openssh-server
sudo systemctl enable --now ssh nginx
```

Comprobar la IP:

```bash
hostname -I
ip address
```

Configurar una IP fija desde Netplan o mediante la herramienta corporativa de
red. No continuar usando una dirección entregada dinámicamente por DHCP, salvo
que exista una reserva permanente.

## 4. Instalar Docker desde el repositorio oficial

Eliminar paquetes incompatibles si existen:

```bash
sudo apt remove -y docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc
```

Agregar la clave y el repositorio oficial:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

Para un técnico novato se recomienda seguir usando `sudo docker`. Pertenecer al
grupo `docker` equivale prácticamente a tener privilegios de administrador.

## 5. Crear la ubicación de la aplicación

```bash
sudo mkdir -p /opt/smart-shelf
sudo chown "$USER":"$USER" /opt/smart-shelf
sudo install -d -m 750 -o root -g root /var/lib/smart-shelf
cd /opt/smart-shelf
```

Clonar el repositorio:

```bash
git clone https://github.com/AelStGermain/Sku-data-manager.git .
```

Inicializar el directorio persistente con los datos incluidos:

```bash
sudo rsync -a /opt/smart-shelf/local_data/ /var/lib/smart-shelf/
```

Si producción debe contener datos más recientes, copiarlos desde el equipo de
preparación a un directorio temporal del servidor y luego ejecutar:

```bash
sudo rsync -a --delete /ruta/temporal/local_data/ /var/lib/smart-shelf/
sudo ls -lh /var/lib/smart-shelf
```

No usar `--delete` salvo que la carpeta de origen sea una copia completa y
verificada. Nunca guardar `firebase-key.json` en Git.

## 6. Instalar la credencial Firebase

Si Firebase se utilizará, copiar la credencial a:

```text
/var/lib/smart-shelf/firebase-key.json
```

Proteger el archivo:

```bash
sudo chown root:root /var/lib/smart-shelf/firebase-key.json
sudo chmod 600 /var/lib/smart-shelf/firebase-key.json
```

Si todavía no existe una credencial, desplegar con
`DISABLE_FIREBASE_SYNC=1`. El resto de la aplicación seguirá funcionando, pero
no habrá sincronización de levantamientos desde Firebase.

## 7. Crear Docker Compose

Crear `/opt/smart-shelf/compose.yaml`:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: smart-shelf
    restart: unless-stopped
    init: true
    environment:
      NODE_ENV: production
      PORT: "3000"
      DISABLE_FIREBASE_SYNC: "0"
      TZ: America/Santiago
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - /var/lib/smart-shelf:/app/local_data
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:3000/api/holdings').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
```

Cambiar `DISABLE_FIREBASE_SYNC` a `"1"` si no se instaló la credencial. El
puerto 3000 queda ligado exclusivamente a `127.0.0.1`: los usuarios entrarán por
Nginx y no directamente al contenedor.

## 8. Validar y arrancar

```bash
cd /opt/smart-shelf
sudo docker compose config
sudo docker compose build --pull
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100 app
curl -I http://127.0.0.1:3000/
curl http://127.0.0.1:3000/api/holdings
```

El contenedor debe figurar como `running` y posteriormente `healthy`. Si aparece
`firebase-key.json no encontrado`, revisar el paso 6 o deshabilitar la
sincronización.

## 9. Configurar Nginx

Crear `/etc/nginx/sites-available/smart-shelf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name smart-shelf.empresa.local;

    client_max_body_size 50m;

    # Restricción temporal mientras no exista autenticación.
    allow 192.168.10.0/24;
    deny all;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

Reemplazar el nombre DNS y la subred. Activar el sitio:

```bash
sudo ln -s /etc/nginx/sites-available/smart-shelf /etc/nginx/sites-enabled/smart-shelf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 10. DNS interno y firewall

Solicitar a TI un registro DNS tipo `A`:

```text
smart-shelf.empresa.local  ->  192.168.10.50
```

Mientras se crea, se puede probar temporalmente agregando al archivo `hosts` del
PC cliente:

```text
192.168.10.50 smart-shelf.empresa.local
```

Configurar UFW sin perder el acceso SSH:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow from 192.168.10.0/24 to any port 80 proto tcp
sudo ufw enable
sudo ufw status numbered
```

No abrir el puerto 3000. Docker lo publica solamente en loopback.

## 11. HTTPS con certificado corporativo

Para una red interna se recomienda solicitar a TI un certificado emitido por la
CA corporativa para `smart-shelf.empresa.local`. Instalarlo, por ejemplo, en:

```text
/etc/ssl/certs/smart-shelf.crt
/etc/ssl/private/smart-shelf.key
```

La clave debe quedar protegida:

```bash
sudo chown root:root /etc/ssl/private/smart-shelf.key
sudo chmod 600 /etc/ssl/private/smart-shelf.key
```

Agregar un servidor HTTP que redirija y cambiar el bloque principal a 443:

```nginx
server {
    listen 80;
    server_name smart-shelf.empresa.local;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name smart-shelf.empresa.local;

    ssl_certificate /etc/ssl/certs/smart-shelf.crt;
    ssl_certificate_key /etc/ssl/private/smart-shelf.key;
    client_max_body_size 50m;

    allow 192.168.10.0/24;
    deny all;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

Validar, recargar y habilitar el firewall:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo ufw allow from 192.168.10.0/24 to any port 443 proto tcp
```

Los PCs deben confiar en la CA corporativa. Un certificado público de Let's
Encrypt normalmente requiere un dominio real controlado por la empresa; no se
debe usar para un nombre `.local`.

## 12. Prueba funcional de aceptación

Desde un PC de la red:

1. Abrir `http://smart-shelf.empresa.local` o la URL HTTPS configurada.
2. Confirmar que aparece “Servidor local activo”.
3. Abrir Catálogo y buscar un EAN conocido.
4. Crear o editar un SKU de prueba y recargar la página.
5. Comprobar que el cambio sigue presente.
6. Abrir Holdings, Revisión y Levantamiento.
7. Importar un archivo pequeño de prueba.
8. Exportar un reporte Excel.
9. Ejecutar la sincronización Firebase si fue habilitada.
10. Revisar la consola del navegador; no debe haber errores de CDN o red.

En el servidor:

```bash
sudo docker compose -f /opt/smart-shelf/compose.yaml ps
sudo docker compose -f /opt/smart-shelf/compose.yaml logs --tail=200 app
sudo journalctl -u nginx --since "15 minutes ago"
```

## 13. Respaldo obligatorio

Toda la información operacional reside en `/var/lib/smart-shelf`. Crear
un respaldo diario fuera del servidor.

Ejemplo de script `/usr/local/sbin/backup-smart-shelf`:

```bash
#!/usr/bin/env bash
set -euo pipefail
DEST="/var/backups/smart-shelf"
STAMP="$(date +%F_%H%M%S)"
mkdir -p "$DEST"
tar --exclude='firebase-key.json' -czf "$DEST/local_data_$STAMP.tar.gz" \
  -C /var/lib smart-shelf
find "$DEST" -type f -name 'local_data_*.tar.gz' -mtime +30 -delete
```

Instalar y programar:

```bash
sudo chmod 750 /usr/local/sbin/backup-smart-shelf
sudo crontab -e
```

Agregar esta línea para ejecutar a las 02:00:

```cron
0 2 * * * /usr/local/sbin/backup-smart-shelf
```

El respaldo local no basta: TI debe copiarlo después a NAS, almacenamiento de
backup o servidor distinto. Probar una restauración antes de declarar producción.

## 14. Actualizar la aplicación

Antes de actualizar:

```bash
sudo /usr/local/sbin/backup-smart-shelf
cd /opt/smart-shelf
git status
git pull --ff-only
sudo docker compose build --pull
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100 app
```

Los JSON y la credencial sobreviven porque `/var/lib/smart-shelf` está montado
desde el host. Nunca reemplazar ese directorio sin un respaldo verificado.

## 15. Diagnóstico rápido

Estado general:

```bash
sudo systemctl status docker nginx
sudo docker compose -f /opt/smart-shelf/compose.yaml ps
sudo docker compose -f /opt/smart-shelf/compose.yaml logs -f app
sudo nginx -t
curl -v http://127.0.0.1:3000/api/holdings
```

- `502 Bad Gateway`: el contenedor está detenido o no responde.
- `403 Forbidden`: la IP del cliente no pertenece a la subred permitida.
- La URL no resuelve: falta DNS o el registro apunta a otra IP.
- Funciones de Excel o gráficos no cargan: el navegador no llega a los CDN.
- Firebase falla: falta la credencial, es inválida o no tiene permisos.
- Los cambios desaparecen: revisar permisos, montaje de `local_data` y logs.
- Disco lleno: comprobar con `df -h` y limpiar imágenes no utilizadas solo
  después de revisar `docker system df`.

## 16. Criterio de puesta en producción

La instalación está lista cuando:

- La URL interna resuelve desde todos los equipos autorizados.
- Nginx es el único punto de entrada y el puerto 3000 no es accesible por red.
- El contenedor está `healthy` y reinicia tras reiniciar Ubuntu.
- Las operaciones crear, editar, importar y exportar fueron comprobadas.
- Firebase funciona o está explícitamente deshabilitado.
- Existe un respaldo externo y una restauración probada.
- TI conoce que la aplicación todavía no tiene autenticación y mantiene la
  restricción por subred hasta implementarla.
