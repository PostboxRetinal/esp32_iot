#!/usr/bin/env bash
# Verifica estado de MySQL + Node-RED para este proyecto.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

MYSQL_CONTAINER="mysql-ciudad-inteligente"
NODERED_CONTAINER="nodered-hotel"
MYSQL_ROOT_PWD="${MYSQL_ROOT_PASSWORD:-}"
MYSQL_USER="${MYSQL_USER:-nodered_user}"
MYSQL_PWD="${MYSQL_PASSWORD:-}"
MYSQL_DB="${MYSQL_DATABASE:-ciudad_inteligente}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_result() {
  if [[ "$1" -eq 0 ]]; then
    echo -e "${GREEN}OK${NC} $2"
  else
    echo -e "${RED}FAIL${NC} $2"
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo -e "${RED}FAIL${NC} Comando requerido no encontrado: $1"
    exit 1
  fi
}

require_cmd docker

if [[ -z "$MYSQL_ROOT_PWD" ]]; then
  echo -e "${RED}FAIL${NC} MYSQL_ROOT_PASSWORD no esta definido en .env"
  exit 1
fi

echo "=============================================="
echo "Verificacion MySQL + Node-RED"
echo "=============================================="
echo

echo "1. Verificando contenedores en ejecucion..."
RUNNING_MYSQL=$(docker ps --filter "name=$MYSQL_CONTAINER" --filter "status=running" -q | wc -l)
if [[ "$RUNNING_MYSQL" -eq 1 ]]; then
  print_result 0 "MySQL container corriendo"
else
  print_result 1 "MySQL container NO corriendo"
  echo "   Ejecuta: docker compose up -d"
  exit 1
fi

RUNNING_NODERED=$(docker ps --filter "name=$NODERED_CONTAINER" --filter "status=running" -q | wc -l)
if [[ "$RUNNING_NODERED" -eq 1 ]]; then
  print_result 0 "Node-RED container corriendo"
else
  print_result 1 "Node-RED container NO corriendo"
fi

echo
echo "2. Verificando healthcheck de MySQL..."
HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "$MYSQL_CONTAINER" 2>/dev/null || echo "unknown")
if [[ "$HEALTH" == "healthy" ]]; then
  print_result 0 "MySQL healthcheck: healthy"
elif [[ "$HEALTH" == "starting" ]]; then
  echo -e "${YELLOW}!${NC} MySQL aun inicializando"
else
  echo -e "${YELLOW}!${NC} MySQL health status: $HEALTH"
fi

echo
echo "3. Probando conexion MySQL root..."
if docker exec "$MYSQL_CONTAINER" mysqladmin ping -h localhost -u root -p"$MYSQL_ROOT_PWD" --silent >/dev/null 2>&1; then
  print_result 0 "Conexion root exitosa"
else
  print_result 1 "No se puede conectar a MySQL con root"
fi

echo
echo "4. Verificando base de datos '$MYSQL_DB'..."
DB_EXISTS=$(docker exec "$MYSQL_CONTAINER" mysql -u root -p"$MYSQL_ROOT_PWD" -N -e "SHOW DATABASES LIKE '$MYSQL_DB';" 2>/dev/null | grep -c "$MYSQL_DB" || true)
if [[ "$DB_EXISTS" -eq 1 ]]; then
  print_result 0 "Base de datos '$MYSQL_DB' existe"
else
  print_result 1 "Base de datos '$MYSQL_DB' NO existe"
fi

echo
echo "5. Verificando tablas principales..."
TABLES=("mediciones_brutas" "estados_medicion" "eventos_actuadores" "incidencias" "analisis_mediciones")
TABLE_ERRORS=0
for T in "${TABLES[@]}"; do
  EXISTS=$(docker exec "$MYSQL_CONTAINER" mysql -u root -p"$MYSQL_ROOT_PWD" "$MYSQL_DB" -N -e "SHOW TABLES LIKE '$T';" 2>/dev/null | grep -c "$T" || true)
  if [[ "$EXISTS" -eq 1 ]]; then
    COUNT=$(docker exec "$MYSQL_CONTAINER" mysql -u root -p"$MYSQL_ROOT_PWD" "$MYSQL_DB" -N -e "SELECT COUNT(*) FROM $T;" 2>/dev/null || echo "error")
    print_result 0 "Tabla '$T' existe (registros: $COUNT)"
  else
    TABLE_ERRORS=1
    print_result 1 "Tabla '$T' NO existe"
  fi
done

echo
echo "6. Verificando usuario '$MYSQL_USER'..."
USER_EXISTS=$(docker exec "$MYSQL_CONTAINER" mysql -u root -p"$MYSQL_ROOT_PWD" -N -e "SELECT COUNT(*) FROM mysql.user WHERE User='$MYSQL_USER';" 2>/dev/null || echo "0")
if [[ "$USER_EXISTS" -ge 1 ]]; then
  print_result 0 "Usuario '$MYSQL_USER' existe"
else
  print_result 1 "Usuario '$MYSQL_USER' NO existe"
fi

echo
echo "7. Verificando Node-RED..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:1880/ 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
  print_result 0 "Node-RED respondiendo (HTTP 200)"
else
  print_result 1 "Node-RED no responde (HTTP $HTTP_CODE)"
fi

echo
echo "8. Ultimos registros consolidados (vista)..."
docker exec "$MYSQL_CONTAINER" mysql -u root -p"$MYSQL_ROOT_PWD" "$MYSQL_DB" -e "SELECT id, id_habitacion, contexto_hotel, limpio, estado_riesgo, razon_riesgo, color_alerta, timestamp_origen FROM vw_mediciones_estado ORDER BY id DESC LIMIT 5;" 2>/dev/null || echo "No se pudieron obtener registros"

echo
echo "9. Ultimas incidencias de calidad..."
docker exec "$MYSQL_CONTAINER" mysql -u root -p"$MYSQL_ROOT_PWD" "$MYSQL_DB" -e "SELECT id, medicion_id, id_habitacion, tipo_incidencia, detalle_incidencia, created_at FROM vw_incidencias_medicion ORDER BY id DESC LIMIT 5;" 2>/dev/null || echo "No se pudieron obtener incidencias"

echo
echo "10. Resumen"
echo "=============================================="
echo "Node-RED UI:     http://localhost:1880"
echo "MySQL (host):    localhost:${MYSQL_PORT:-3306}"
echo "MySQL (docker):  mysql:3306"
echo
echo "Credenciales MySQL:"
echo "  Root:     root / (tomada de .env)"
echo "  Node-RED: $MYSQL_USER / (tomada de .env)"
echo "  Database: $MYSQL_DB"
echo "=============================================="

if [[ "$HEALTH" != "healthy" || "$DB_EXISTS" != "1" || "$TABLE_ERRORS" != "0" ]]; then
  echo
  echo "Logs recientes de MySQL:"
  echo "------------------------"
  docker compose -f "$ROOT_DIR/docker-compose.yml" logs --tail=20 mysql 2>/dev/null || docker logs --tail=20 "$MYSQL_CONTAINER" 2>/dev/null || echo "No se pudieron obtener logs"
fi

echo
echo "Script completado."
