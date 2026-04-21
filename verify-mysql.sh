#!/bin/bash
# ============================================================
# Script de Verificacion - MySQL + Node-RED
# Flujo IoT normalizado
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=============================================="
echo "Verificacion MySQL + Node-RED"
echo "=============================================="
echo ""

MYSQL_CONTAINER="mysql-ciudad-inteligente"
NODERED_CONTAINER="nodered-hotel"
MYSQL_ROOT_PWD="root_password_change_me"
MYSQL_USER="nodered_user"
MYSQL_PWD="nodered_password_change_me"
MYSQL_DB="ciudad_inteligente"

print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}OK${NC} $2"
    else
        echo -e "${RED}FAIL${NC} $2"
    fi
}

echo "1. Verificando estado de contenedores..."
echo ""

RUNNING=$(docker ps --filter "name=$MYSQL_CONTAINER" --filter "status=running" -q | wc -l)
if [ "$RUNNING" -eq 1 ]; then
    print_result 0 "MySQL container corriendo"
else
    print_result 1 "MySQL container NO corriendo"
    echo "   Ejecuta: docker compose up -d"
    exit 1
fi

RUNNING=$(docker ps --filter "name=$NODERED_CONTAINER" --filter "status=running" -q | wc -l)
if [ "$RUNNING" -eq 1 ]; then
    print_result 0 "Node-RED container corriendo"
else
    print_result 1 "Node-RED container NO corriendo"
fi

echo ""
echo "2. Verificando healthcheck de MySQL..."
HEALTH=$(docker inspect --format='{{.State.Health.Status}}' $MYSQL_CONTAINER 2>/dev/null || echo "unknown")
if [ "$HEALTH" == "healthy" ]; then
    print_result 0 "MySQL healthcheck: healthy"
elif [ "$HEALTH" == "starting" ]; then
    print_result 1 "MySQL aun inicializando"
else
    echo -e "${YELLOW}!${NC} MySQL health status: $HEALTH"
fi

echo ""
echo "3. Probando conexion MySQL..."
CONN_TEST=$(docker exec $MYSQL_CONTAINER mysqladmin ping -h localhost -u root -p$MYSQL_ROOT_PWD --silent 2>/dev/null || echo "failed")
if [ "$CONN_TEST" == "mysqld is alive" ]; then
    print_result 0 "Conexion root exitosa"
else
    print_result 1 "No se puede conectar a MySQL"
fi

echo ""
echo "4. Verificando base de datos '$MYSQL_DB'..."
DB_EXISTS=$(docker exec $MYSQL_CONTAINER mysql -u root -p$MYSQL_ROOT_PWD -N -e "SHOW DATABASES LIKE '$MYSQL_DB';" 2>/dev/null | grep -c "$MYSQL_DB" || echo "0")
if [ "$DB_EXISTS" -eq 1 ]; then
    print_result 0 "Base de datos '$MYSQL_DB' existe"
else
    print_result 1 "Base de datos '$MYSQL_DB' NO existe"
fi

echo ""
echo "5. Verificando tablas normalizadas..."
TABLES=("mediciones_brutas" "estados_medicion" "eventos_actuadores")
TABLE_ERRORS=0
for T in "${TABLES[@]}"; do
    EXISTS=$(docker exec $MYSQL_CONTAINER mysql -u root -p$MYSQL_ROOT_PWD $MYSQL_DB -N -e "SHOW TABLES LIKE '$T';" 2>/dev/null | grep -c "$T" || echo "0")
    if [ "$EXISTS" -eq 1 ]; then
        COUNT=$(docker exec $MYSQL_CONTAINER mysql -u root -p$MYSQL_ROOT_PWD $MYSQL_DB -N -e "SELECT COUNT(*) FROM $T;" 2>/dev/null || echo "error")
        print_result 0 "Tabla '$T' existe (registros: $COUNT)"
    else
        TABLE_ERRORS=1
        print_result 1 "Tabla '$T' NO existe"
    fi
done

echo ""
echo "6. Verificando usuario '$MYSQL_USER'..."
USER_EXISTS=$(docker exec $MYSQL_CONTAINER mysql -u root -p$MYSQL_ROOT_PWD -N -e "SELECT COUNT(*) FROM mysql.user WHERE User='$MYSQL_USER';" 2>/dev/null || echo "0")
if [ "$USER_EXISTS" -ge 1 ]; then
    print_result 0 "Usuario '$MYSQL_USER' existe"
else
    print_result 1 "Usuario '$MYSQL_USER' NO existe"
fi

echo ""
echo "7. Verificando Node-RED..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:1880/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" == "200" ]; then
    print_result 0 "Node-RED respondiendo (HTTP 200)"
else
    print_result 1 "Node-RED no responde (HTTP $HTTP_CODE)"
fi

echo ""
echo "8. Ultimos registros consolidados (vista)..."
docker exec $MYSQL_CONTAINER mysql -u root -p$MYSQL_ROOT_PWD $MYSQL_DB -e "SELECT id, device_id, habitacion, estado_riesgo, nivel_alerta, timestamp_origen FROM vw_mediciones_estado ORDER BY id DESC LIMIT 5;" 2>/dev/null || echo "No se pudieron obtener registros"

echo ""
echo "9. Resumen de endpoints"
echo "=============================================="
echo "Node-RED UI:     http://localhost:1880"
echo "MySQL (host):    localhost:3306"
echo "MySQL (docker):  mysql:3306"
echo ""
echo "Credenciales MySQL:"
echo "  Root:     root / $MYSQL_ROOT_PWD"
echo "  Node-RED: $MYSQL_USER / $MYSQL_PWD"
echo "  Database: $MYSQL_DB"
echo "=============================================="

if [ "$HEALTH" != "healthy" ] || [ "$DB_EXISTS" != "1" ] || [ "$TABLE_ERRORS" != "0" ]; then
    echo ""
    echo "Logs recientes de MySQL:"
    echo "------------------------"
    docker compose logs --tail=15 mysql 2>/dev/null || docker logs --tail=15 $MYSQL_CONTAINER 2>/dev/null || echo "No se pudieron obtener logs"
fi

echo ""
echo "Script completado."