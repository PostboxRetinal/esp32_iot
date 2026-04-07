#!/bin/bash
# ============================================================
# Script de Verificación - MySQL + Node-RED
# Ciudad Inteligente Hotel
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=============================================="
echo "Verificación MySQL + Node-RED"
echo "=============================================="
echo ""

# Variables
MYSQL_CONTAINER="mysql-ciudad-inteligente"
NODERED_CONTAINER="nodered-hotel"
MYSQL_ROOT_PWD="root_password_change_me"
MYSQL_USER="nodered_user"
MYSQL_PWD="nodered_password_change_me"
MYSQL_DB="ciudad_inteligente"

# Función para imprimir resultado
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
    fi
}

# 1. Verificar que los contenedores estén corriendo
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

# 2. Verificar healthcheck de MySQL
echo "2. Verificando healthcheck de MySQL..."
HEALTH=$(docker inspect --format='{{.State.Health.Status}}' $MYSQL_CONTAINER 2>/dev/null || echo "unknown")
if [ "$HEALTH" == "healthy" ]; then
    print_result 0 "MySQL healthcheck: healthy"
elif [ "$HEALTH" == "starting" ]; then
    print_result 1 "MySQL aún inicializando (puede tomar 25-30s)"
else
    echo -e "${YELLOW}!${NC} MySQL health status: $HEALTH"
fi
echo ""

# 3. Test de conexión MySQL
echo "3. Probando conexión MySQL..."
CONN_TEST=$(docker exec $MYSQL_CONTAINER mysqladmin ping -h localhost -u root -p$MYSQL_ROOT_PWD --silent 2>/dev/null || echo "failed")
if [ "$CONN_TEST" == "mysqld is alive" ]; then
    print_result 0 "Conexión root exitosa"
else
    print_result 1 "No se puede conectar a MySQL"
    echo "   Respuesta: $CONN_TEST"
fi
echo ""

# 4. Verificar base de datos
echo "4. Verificando base de datos '$MYSQL_DB'..."
DB_EXISTS=$(docker exec $MYSQL_CONTAINER mysql -u root -p$MYSQL_ROOT_PWD -N -e "SHOW DATABASES LIKE '$MYSQL_DB';" 2>/dev/null | grep -c "$MYSQL_DB" || echo "0")
if [ "$DB_EXISTS" -eq 1 ]; then
    print_result 0 "Base de datos '$MYSQL_DB' existe"
else
    print_result 1 "Base de datos '$MYSQL_DB' NO existe"
fi
echo ""

# 5. Verificar tabla sensores
echo "5. Verificando tabla 'sensores'..."
TABLE_EXISTS=$(docker exec $MYSQL_CONTAINER mysql -u root -p$MYSQL_ROOT_PWD $MYSQL_DB -N -e "SHOW TABLES LIKE 'sensores';" 2>/dev/null | grep -c "sensores" || echo "0")
if [ "$TABLE_EXISTS" -eq 1 ]; then
    print_result 0 "Tabla 'sensores' existe"
    
    # Contar registros
    COUNT=$(docker exec $MYSQL_CONTAINER mysql -u root -p$MYSQL_ROOT_PWD $MYSQL_DB -N -e "SELECT COUNT(*) FROM sensores;" 2>/dev/null || echo "error")
    echo "   Registros en tabla: $COUNT"
else
    print_result 1 "Tabla 'sensores' NO existe"
fi
echo ""

# 6. Verificar usuario Node-RED
echo "6. Verificando usuario '$MYSQL_USER'..."
USER_EXISTS=$(docker exec $MYSQL_CONTAINER mysql -u root -p$MYSQL_ROOT_PWD -N -e "SELECT COUNT(*) FROM mysql.user WHERE User='$MYSQL_USER';" 2>/dev/null || echo "0")
if [ "$USER_EXISTS" -ge 1 ]; then
    print_result 0 "Usuario '$MYSQL_USER' existe"
else
    print_result 1 "Usuario '$MYSQL_USER' NO existe"
fi
echo ""

# 7. Verificar Node-RED
echo "7. Verificando Node-RED..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:1880/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" == "200" ]; then
    print_result 0 "Node-RED respondiendo (HTTP 200)"
else
    print_result 1 "Node-RED no responde (HTTP $HTTP_CODE)"
fi
echo ""

# 8. Verificar último registro
echo "8. Últimos registros en sensores:"
docker exec $MYSQL_CONTAINER mysql -u root -p$MYSQL_ROOT_PWD $MYSQL_DB -e "SELECT id, habitacion, timestamp, temperatura_C, humedad_pct, estado_riesgo FROM sensores ORDER BY id DESC LIMIT 3;" 2>/dev/null || echo "No se pudieron obtener registros"
echo ""

# 9. Resumen de endpoints
echo "=============================================="
echo "Resumen de Endpoints"
echo "=============================================="
echo "Node-RED UI:     http://localhost:1880"
echo "MySQL (host):    localhost:3306"
echo "MySQL (docker): mysql:3306"
echo ""
echo "Credenciales MySQL:"
echo "  Root:     root / $MYSQL_ROOT_PWD"
echo "  Node-RED: $MYSQL_USER / $MYSQL_PWD"
echo "  Database: $MYSQL_DB"
echo ""
echo "=============================================="

# Mostrar logs recientes si hay errores
if [ "$HEALTH" != "healthy" ] || [ "$DB_EXISTS" != "1" ] || [ "$TABLE_EXISTS" != "1" ]; then
    echo ""
    echo "Logs recientes de MySQL:"
    echo "------------------------"
    docker compose logs --tail=10 mysql 2>/dev/null || docker logs --tail=10 $MYSQL_CONTAINER 2>/dev/null || echo "No se pudieron obtener logs"
fi

echo ""
echo "Script completado."
