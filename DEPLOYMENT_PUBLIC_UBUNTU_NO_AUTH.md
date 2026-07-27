# Despliegue público en Ubuntu sin autenticación

Este manual publica Smart Shelf en Internet desde el mismo PC Ubuntu on-premises.
El usuario abre una URL HTTPS y utiliza la aplicación inmediatamente, sin iniciar
sesión y sin conectarse a una red interna o VPN.

> ADVERTENCIA: la aplicación no tiene autenticación. Cualquier persona que
> conozca o encuentre la URL puede consultar, crear, modificar y eliminar datos,
> ejecutar sincronizaciones e importar archivos. HTTPS cifra la comunicación,
> pero no identifica ni autoriza usuarios. Este despliegue solo debe considerarse
> temporal y requiere aceptación formal del riesgo por parte de la empresa.

## 1. Información necesaria

Antes de comenzar, solicitar a TI:

- Un dominio o subdominio público, por ejemplo `smart-shelf.empresa.cl`.
- Una IP pública fija o una regla NAT permanente hacia el PC Ubuntu.
- Acceso al panel DNS del dominio.
- Acceso al router o firewall perimetral.
- IP fija privada para Ubuntu, por ejemplo `192.168.10.50`.
- Credencial Firebase `firebase-key.json`, si corresponde.
- Un correo para avisos de renovación del certificado TLS.

No sirve un nombre `.local`, una IP privada ni un nombre visible solamente en el
DNS corporativo. El dominio debe resolver desde cualquier conexión de Internet.

## 2. Comprobar que el enlace permite publicar

Desde Ubuntu, obtener la IP pública:

```bash
curl -4 https://icanhazip.com
```

Compararla con la dirección WAN mostrada por el router. Si son distintas, podría
existir CGNAT o un segundo router.

Si existe CGNAT, se debe solicitar una IP pública al proveedor de Internet. Sin
IP pública, NAT disponible o un túnel gestionado, este procedimiento no puede
publicar directamente el servidor.

Configurar Ubuntu con una IP privada fija o una reserva DHCP permanente. El
router debe reenviar:

```text
TCP público 80  -> 192.168.10.50:80
TCP público 443 -> 192.168.10.50:443
```

No reenviar el puerto 3000. No exponer SSH a todo Internet; si el acceso remoto
es indispensable, limitarlo por IP de administración y utilizar llaves SSH.

## 3. Preparar Ubuntu

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git nginx ufw openssh-server snapd
sudo systemctl enable --now ssh nginx
```

Comprobar hora, zona horaria y espacio:

```bash
sudo timedatectl set-timezone America/Santiago
timedatectl
df -h
```

Se recomienda un UPS y al menos 20 GB libres para aplicación, imágenes Docker,
catálogos, registros y respaldos.

## 4. Instalar Docker y Compose

Eliminar paquetes incompatibles:

```bash
sudo apt remove -y docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc
```

Agregar el repositorio oficial:

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

## 5. Instalar el proyecto y separar los datos

```bash
sudo mkdir -p /opt/smart-shelf
sudo chown "$USER":"$USER" /opt/smart-shelf
sudo install -d -m 750 -o root -g root /var/lib/smart-shelf

cd /opt/smart-shelf
git clone https://github.com/AelStGermain/Sku-data-manager.git .
sudo rsync -a local_data/ /var/lib/smart-shelf/
```

Si existe un catálogo más reciente, copiarlo completo a un directorio temporal y
luego sincronizarlo:

```bash
sudo rsync -a /ruta/temporal/local_data/ /var/lib/smart-shelf/
sudo ls -lh /var/lib/smart-shelf
```

Los datos productivos vivirán en `/var/lib/smart-shelf`; no deben vivir dentro
del repositorio.

## 6. Firebase

Si se utilizará la sincronización Firebase, instalar:

```text
/var/lib/smart-shelf/firebase-key.json
```

```bash
sudo chown root:root /var/lib/smart-shelf/firebase-key.json
sudo chmod 600 /var/lib/smart-shelf/firebase-key.json
```

Nunca subir esta credencial a Git, enviarla por correo ni dejarla en un
directorio servido por Nginx.

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

Usar `DISABLE_FIREBASE_SYNC: "1"` si no existe credencial Firebase.

Construir y arrancar:

```bash
cd /opt/smart-shelf
sudo docker compose config
sudo docker compose build --pull
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100 app
curl http://127.0.0.1:3000/api/holdings
```

No continuar hasta que el contenedor figure como `healthy`.

## 8. Crear el DNS público

En el proveedor DNS crear:

```text
Tipo: A
Nombre: smart-shelf
Valor: IP_PUBLICA_DEL_SERVIDOR
TTL: 300
```

El resultado será `smart-shelf.empresa.cl`. Si se usa IPv6, publicar un registro
`AAAA` únicamente cuando el firewall IPv6 también esté configurado.

Comprobar desde un PC externo o un teléfono usando datos móviles:

```bash
nslookup smart-shelf.empresa.cl
```

La respuesta debe ser la IP pública definida.

## 9. Configurar límites globales de Nginx

Crear `/etc/nginx/conf.d/smart-shelf-limits.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=smart_shelf_api:10m rate=10r/s;
limit_conn_zone $binary_remote_addr zone=smart_shelf_conn:10m;
```

Estos límites reducen abuso accidental, pero no sustituyen autenticación ni
impiden que una persona borre datos a una velocidad menor.

## 10. Configurar el sitio HTTP

Crear `/etc/nginx/sites-available/smart-shelf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name smart-shelf.empresa.cl;

    client_max_body_size 50m;
    limit_conn smart_shelf_conn 30;

    location /api/ {
        limit_req zone=smart_shelf_api burst=40 nodelay;
        limit_req_status 429;

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

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

Reemplazar el dominio. Activar:

```bash
sudo ln -s /etc/nginx/sites-available/smart-shelf /etc/nginx/sites-enabled/smart-shelf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 11. Firewall del servidor

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Sustituir 203.0.113.25 por la IP pública desde la que administra TI.
sudo ufw allow from 203.0.113.25 to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status numbered
```

Antes de cerrar la sesión SSH, abrir una segunda sesión y comprobar que la regla
administrativa funciona. Si TI no posee una IP fija de administración, debe
definir otro método seguro; no se recomienda abrir SSH globalmente.

También deben abrirse 80/443 en el firewall perimetral o router.

## 12. Instalar HTTPS público

Certbot necesita que el dominio ya resuelva y que el puerto 80 sea alcanzable
desde Internet.

```bash
sudo apt remove -y certbot
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d smart-shelf.empresa.cl
```

Durante el asistente:

1. Ingresar el correo de TI.
2. Aceptar los términos.
3. Elegir redirección automática de HTTP a HTTPS.

Comprobar la renovación:

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
sudo nginx -t
```

La URL final será:

```text
https://smart-shelf.empresa.cl
```

No poner la aplicación en operación usando solamente HTTP.

## 13. Cabeceras HTTPS recomendadas

Dentro del bloque HTTPS creado por Certbot, agregar:

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

No habilitar todavía una Content Security Policy estricta: la interfaz actual
usa scripts y estilos inline y dependencias CDN, por lo que una política
incorrecta dejaría funciones inutilizables.

Después:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 14. Prueba desde Internet

Desconectar un teléfono del Wi-Fi y usar datos móviles:

1. Abrir `https://smart-shelf.empresa.cl`.
2. Confirmar el candado HTTPS sin advertencias.
3. Confirmar “Servidor local activo”.
4. Abrir Dashboard y Catálogo.
5. Buscar un EAN conocido.
6. Crear un SKU de prueba y guardarlo.
7. Recargar y confirmar que el SKU persiste.
8. Importar un archivo pequeño.
9. Abrir Holdings, Levantamiento, Avistamientos y Revisión.
10. Exportar un Excel.
11. Probar Firebase, si fue habilitado.

En el servidor:

```bash
sudo docker compose -f /opt/smart-shelf/compose.yaml ps
sudo docker compose -f /opt/smart-shelf/compose.yaml logs --tail=200 app
sudo tail -n 100 /var/log/nginx/access.log
sudo tail -n 100 /var/log/nginx/error.log
```

## 15. Uso inmediato

No hay registro ni inicio de sesión. Para usar:

1. Abrir un navegador actualizado, preferentemente Chrome o Edge.
2. Ingresar `https://smart-shelf.empresa.cl`.
3. Esperar que el indicador muestre “Servidor local activo”.
4. Operar desde el menú lateral.

Todos los usuarios tienen los mismos permisos. Compartir la URL equivale a
entregar acceso total a la aplicación.

## 16. Respaldo diario

Crear `/usr/local/sbin/backup-smart-shelf`:

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

```bash
sudo chmod 750 /usr/local/sbin/backup-smart-shelf
sudo crontab -e
```

Agregar:

```cron
0 2 * * * /usr/local/sbin/backup-smart-shelf
```

TI debe copiar estos respaldos a otro equipo o NAS y probar una restauración.
Al estar la aplicación abierta a Internet, se recomienda aumentar la frecuencia
del respaldo según el volumen de cambios.

## 17. Actualización

```bash
sudo /usr/local/sbin/backup-smart-shelf
cd /opt/smart-shelf
git pull --ff-only
sudo docker compose build --pull
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100 app
```

Verificar nuevamente la URL pública después de cada actualización.

## 18. Diagnóstico

```bash
sudo systemctl status docker nginx
sudo docker compose -f /opt/smart-shelf/compose.yaml ps
sudo docker compose -f /opt/smart-shelf/compose.yaml logs -f app
sudo nginx -t
curl -I http://127.0.0.1:3000
curl -I https://smart-shelf.empresa.cl
sudo certbot certificates
```

- `502 Bad Gateway`: el contenedor no está funcionando.
- El dominio no abre: revisar DNS, NAT y firewall.
- Certificado inválido: revisar dominio, hora del servidor y Certbot.
- `429 Too Many Requests`: una IP excedió temporalmente el límite.
- Excel o gráficos no cargan: el navegador no alcanza los CDN externos.
- Firebase falla: revisar credencial, permisos y salida HTTPS.
- Cambios perdidos: revisar montaje y permisos de `/var/lib/smart-shelf`.

## 19. Criterio de apertura pública

Antes de entregar la URL:

- Dirección pública y DNS verificados desde datos móviles.
- HTTPS válido y renovación automática probada.
- Solo 80/443 expuestos al público; 3000 permanece en loopback.
- SSH restringido a administración.
- Contenedor `healthy` y reinicio automático comprobado.
- Operaciones de lectura y escritura verificadas.
- Respaldo externo y restauración probados.
- Monitoreo de logs asignado a una persona.
- Riesgo de operar sin autenticación aceptado formalmente.
- Fecha comprometida para implementar autenticación.

## 20. Recomendación técnica final

No existe una configuración de Nginx, Docker, firewall o HTTPS que transforme
una aplicación pública sin autenticación en una aplicación segura para datos
empresariales. Los controles de este manual reducen exposición técnica y abuso
masivo, pero no pueden impedir modificaciones realizadas mediante la propia API.
La autenticación y autorización siguen siendo el control prioritario pendiente.
