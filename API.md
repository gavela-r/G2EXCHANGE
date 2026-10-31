# API sectorial — resumen

Base `http://127.0.0.1:3200/api/sectorial` · Especificación: `sectorial/app/contracts/openapi.yaml` · Tipos: `sectorial/app/contracts/api.d.ts` · Ejemplos reales: `sectorial/app/mocks/`.

**Autenticación (desarrollo local)**: `GET /session` devuelve un token aleatorio por arranque, que se envía como `X-Sectorial-Token` en todo `POST`. El servicio sólo escucha en 127.0.0.1, rechaza un `Host` distinto de 127.0.0.1/localhost y los `Origin` que no figuren en la lista blanca (`G2_SECTORIAL_CORS_ORIGINS`). **No es una autenticación de usuarios**: para exponerlo fuera de localhost hace falta un proxy autenticado (ver `DEPLOYMENT_PLAN.md`).

**Errores**: `{ "error": "<mensaje>", "code": "<CÓDIGO_ESTABLE>" }` con HTTP 400/403/404/409/413/429/503. **Cálculos imposibles**: HTTP 200 con `null` + `status`/`issues`/`cause`. Nunca se devuelven números ficticios.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado y fuente de datos (`MYSQL_SOLO_LECTURA` / `MOCK_SINTETICO`) |
| GET | `/session` | Token, hash del motor, `buildStale`, capacidades de exportación |
| GET | `/models`, `/models/{1..16}` | Modelos sectoriales: familia, método, drivers, constantes, históricos exigidos |
| GET | `/taxonomy` | Conceptos mapeados, derivados y ampliaciones propuestas (migración 30, no ejecutada) |
| GET | `/coverage` | Matriz PCV/KPI por país y año |
| GET | `/companies?q=&limit=1..40&offset=0..39` | Búsqueda por nombre o ticker |
| GET | `/companies/{id}?asOf=` | Snapshot (4 cierres publicados ≤ asOf, clasificación, procedencia) + evaluación sin hipótesis |
| GET | `/companies/{id}/pcv?asOf=` | PCV con estado de certificación y observaciones |
| GET | `/companies/{id}/kpis?asOf=` | KPI con `CERTIFICADO` / `BLOQUEADO_DEPENDENCIA` / `NO_CALCULABLE` y cadena de evidencia; incluye días operativos (unidad `DIAS`, campo `method`: `SOBRE_VENTAS` o `CONVENCIONAL`) y `DELTA_NWC` (`VALUATION_ENGINE.md` §4 bis) |
| GET | `/companies/{id}/history` | Ejecuciones locales previas |
| POST | `/companies/{id}/evaluate` | `{asOf, configuration}` → ejecución inmutable (id = sha256 de entradas + configuración + motor). `configuration.workingCapitalDays`: `SOBRE_VENTAS` (por defecto) o `CONVENCIONAL` |
| GET | `/examples/{sector}` | **Sólo mock**: configuración completa de ejemplo |
| GET | `/runs/{id}` · `/runs/{id}/json` | Resultado · expediente completo |
| GET | `/runs/{id}/capital` | Ke, Kd, WACC (null en banca, seguros y REIT), tasa de descuento, diagnóstico de primas |
| POST | `/runs/{id}/premium-simulation` | `{factor: LIQUIDEZ / TAMANO / OTRO, premium ∈ [-0.05, 0.10], reason}` → impacto en Ke/WACC/valor; `SIMULACION_NO_APROBADA` |
| POST | `/runs/{id}/export` | Encola XLSX + validación nativa (1 en curso, 4 en cola) |
| GET | `/runs/{id}/job` | `NO_SOLICITADO` / `PENDIENTE` / `GENERANDO` / `COMPLETADO` / `ERROR` (+`code`) |
| GET | `/runs/{id}/xlsx` | Descarga sólo si existe `.validation.json` con sha256 coincidente; si no, 409 `EXCEL_NO_DISPONIBLE` |

Paginación: la búsqueda devuelve como máximo 40 resultados por consulta (límite del adaptador); `limit`/`offset` se aplican dentro de ese máximo.

Servicios existentes compatibles (sin cambios): API de valoración `server/src` (puerto 3000) y Capital `server/src/capital` (`/api/capital`, puerto 3100).
