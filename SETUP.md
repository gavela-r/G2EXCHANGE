# Instalación y puesta en marcha

Todos los comandos se ejecutan desde la raíz del repositorio. Funcionan en Windows (Git Bash o PowerShell), Linux y macOS, salvo la validación nativa de Excel, que solo existe en Windows con Microsoft Excel.

## 1. Requisitos
| Componente | Versión | Uso |
|---|---|---|
| Node.js | ≥ 22 (probado con 24.19) | backend, motor, módulo sectorial, scripts |
| npm | el incluido con Node | dependencias (`package-lock.json` en cada paquete) |
| Docker + Docker Compose | cualquier versión reciente | MySQL 8 (`mysql:8`), backend y frontend en contenedores |
| Git | ≥ 2.30 | |
| Microsoft Excel (opcional, solo Windows) | 365 | validación nativa de las 16 plantillas |

No hace falta ningún servicio de pago. Las claves de proveedores son opcionales (`.env.example`).

## 2. Instalación desde cero
```bash
git clone <url-privada-del-repositorio> G2EXCHANGE && cd G2EXCHANGE
git checkout entrega/frontend-handoff-20261031
cp .env.example .env            # completar DB_*; el resto de claves es opcional
npm run setup                   # npm ci en valuation_engine, server y client
npm run build                   # backend (tsc) y frontend (vite)
npm --prefix server run capital:build
npm run sectorial:build         # motor sectorial y cliente de referencia
```

## 3. Comprobación sin base de datos
```bash
npm test                        # valuation_engine (20) + server (267; 1 omitida si no hay MySQL de desarrollo)
npm run sectorial:test          # regresión (39) + integración sectorial (111, incluye días de circulante)
npm run sectorial:mock          # API sectorial en http://127.0.0.1:3200 con datos sintéticos
```
O todo de una vez: `npm run verify`.

## 4. Base de datos
- **Base vacía**: `docker compose up -d mysql` y después aplicar `server/sql/00_schema.sql` y las migraciones en orden numérico (ver `DATABASE.md`).
- **Base operativa con datos**: se transfiere en privado (ver `HANDOFF.md`, §Transferencia privada). El volcado no se distribuye en Git.
- **Restauración de un volcado**:
  ```bash
  docker exec -i mysql_valoracion sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "CREATE DATABASE g2"'
  docker exec -i mysql_valoracion sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot g2' < g2-AAAA-MM-DD.sql
  ```
- **Pruebas de integración MySQL**: solo contra una copia aislada. Usan tablas `TEMPORARY` y no modifican datos.
  ```bash
  DB_HOST=127.0.0.1 DB_PORT=3310 DB_USER=root DB_PASSWORD=... DB_NAME=g2_ensayo npm run test:integration:mysql
  ```

## 5. Puesta en marcha
| Servicio | Comando | Puerto |
|---|---|---|
| Pila completa (MySQL, backend, frontend) | `docker compose up -d` | 3307 MySQL, 3000 backend, 5173 frontend |
| Backend en local | `npm --prefix server start` | 3000 |
| API sectorial (datos reales, solo lectura) | `npm run sectorial:start` | 3200 |
| API sectorial con mocks | `npm run sectorial:mock` | 3200 |
| Cobertura PCV/KPI e indicadores derivados (MySQL, solo lectura) | `npm run sectorial:coverage` | — |
| Días de circulante con empresas reales (solo lectura) | `G2_PROJECT_ROOT=<proyecto con .env> node sectorial/app/tools/circulante_casos_reales.cjs <asOf> <salida.json> "<nombre exacto>"` | — |

## 6. Validación nativa de Excel (Windows)
```bash
npm run sectorial:qa:excel:portable   # 16 plantillas; abre cada libro en Excel y compara cada fórmula con el motor TS
```
El exportador con formato corporativo (`@oai/artifact-tool`) es privado y no forma parte del repositorio. El exportador portable (SheetJS) produce libros equivalentes en fórmulas y es el que se valida en la rama.

## 7. Errores frecuentes
| Síntoma | Causa | Solución |
|---|---|---|
| `Configure DB_USER, DB_PASSWORD y DB_NAME` | falta `.env` o las variables | copiar `.env.example` y completar `DB_*` |
| `Cannot find package '@oai/artifact-tool'` | exportador privado no instalado | usar `sectorial:qa:excel:portable` |
| `requiere la migración 33` en `pcvIdempotencia` | base sin migración 33 | aplicar `server/sql/33_pcv_identidad_observacion.sql` en la copia |
| La API sectorial responde 503 tras cambiar código | el hash del motor cambió | reiniciar `sectorial:start` (comportamiento intencionado) |
| `WORKER_ACTIVO_US` | otro recuperador tiene el bloqueo de EE. UU. | ver `OPERATIONS.md`, §Pausas seguras |
| `TAXONOMIA_AMBIGUA` en valoraciones | un concepto contradictorio sin resolver | ver `DATABASE.md`, §Selección de observaciones |
