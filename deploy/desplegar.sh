#!/usr/bin/env bash
# Despliega (o vuelve a desplegar) la aplicación en Cloud Run desde el código local.
# La infraestructura (Cloud SQL, bucket, cuenta de servicio, secretos) se crea una vez: ver README, «Despliegue en GCP».
# Uso: bash deploy/desplegar.sh                      (con la configuración de gcloud «taller»)
#      IMAGEN=<imagen> bash deploy/desplegar.sh      despliega una imagen ya construida en vez del código local.
# El servicio va en Bélgica (europe-west1), que admite dominios propios (www.astursagra.es); la base de datos,
# el bucket y los trabajos siguen en Madrid (europe-southwest1).
set -euo pipefail
cd "$(dirname "$0")/.."

# En Git Bash (Windows) evita que /datos se convierta en una ruta de Windows.
export MSYS2_ARG_CONV_EXCL="volume=;BaseDatos__"
export CLOUDSDK_ACTIVE_CONFIG_NAME="${CLOUDSDK_ACTIVE_CONFIG_NAME:-taller}"
PROYECTO="${PROYECTO:-astursagra}"
REGION="${REGION:-europe-west1}"
REGION_DATOS="${REGION_DATOS:-europe-southwest1}"
SERVICIO="${SERVICIO:-taller}"
INSTANCIA_SQL="$PROYECTO:$REGION_DATOS:taller-db"
BUCKET="${BUCKET:-$PROYECTO-datos}"
CUENTA="taller-run@$PROYECTO.iam.gserviceaccount.com"

if [ -n "${IMAGEN:-}" ]; then
  ORIGEN=(--image "$IMAGEN")
else
  ORIGEN=(--source .)
fi

# Secretos opcionales: solo se pasan los que existen en Secret Manager.
SECRETOS="ConnectionStrings__Taller=taller-db-conexion:latest"
for par in "Vinalfa__Token=vinalfa-token" "Gemini__ApiKey=gemini-api-key" "MatriculaApi__Usuario=matriculaapi-usuario" "Anthropic__ApiKey=anthropic-api-key" \
           "SharePoint__TenantId=sharepoint-tenant-id" "SharePoint__ClientId=sharepoint-client-id" "SharePoint__ClientSecret=sharepoint-client-secret"; do
  nombre="${par#*=}"
  if gcloud secrets describe "$nombre" --project "$PROYECTO" >/dev/null 2>&1; then
    SECRETOS="$SECRETOS,$par:latest"
  fi
done

gcloud run deploy "$SERVICIO" \
  --project "$PROYECTO" \
  --region "$REGION" \
  "${ORIGEN[@]}" \
  --service-account "$CUENTA" \
  --execution-environment gen2 \
  --add-cloudsql-instances "$INSTANCIA_SQL" \
  --add-volume "name=datos,type=cloud-storage,bucket=$BUCKET" \
  --add-volume-mount "volume=datos,mount-path=/datos" \
  --set-env-vars "BaseDatos__MigrarAlArrancar=true,Media__Ruta=/datos/media,Privado__Ruta=/datos/privado,Multimedia__Ruta=/datos/privado/multimedia,DataProtection__Ruta=/datos/claves,GeoIp__Ruta=/datos/geoip/dbip-city-lite.mmdb,Kestrel__EndpointDefaults__Protocols=Http2,Logging__LogLevel__Microsoft.EntityFrameworkCore.Database.Command=Warning,SharePoint__SiteUrl=https://palvarez.sharepoint.com/sites/Taller,SharePoint__BibliotecaRepro=REPRO,SharePoint__Automatica=false" \
  --set-secrets "$SECRETOS" \
  --use-http2 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2 \
  --cpu 1 \
  --memory 1Gi \
  --timeout 900 \
  --port 8080 \
  "$@"

# Los trabajos (crear usuarios y sincronizar SharePoint) usan la misma imagen: se actualizan a la recién desplegada.
IMAGEN_DESPLEGADA=$(gcloud run services describe "$SERVICIO" --project "$PROYECTO" --region "$REGION" --format="value(spec.template.spec.containers[0].image)")
for trabajo in crear-usuario sincronizar-sharepoint; do
  if gcloud run jobs describe "$trabajo" --project "$PROYECTO" --region "$REGION_DATOS" >/dev/null 2>&1; then
    gcloud run jobs update "$trabajo" --project "$PROYECTO" --region "$REGION_DATOS" --image "$IMAGEN_DESPLEGADA" --quiet >/dev/null && echo "Trabajo $trabajo actualizado."
  fi
done
