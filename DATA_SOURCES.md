# Fuentes de datos

Regla general: **certifica solo la fuente primaria oficial** (SEC, EDINET y MOPS). Las demás sirven para recuperar, completar huecos y contrastar, nunca para certificar. Presupuesto: 0 €; no se usa ningún servicio de pago.

| Fuente | País | Función | Acceso y límites | Restricciones conocidas | Código |
|---|---|---|---|---|---|
| **SEC EDGAR** (`companyfacts`, `submissions`, archivos masivos) | US | primaria: informes 10-K, 10-K/A, 20-F y 40-F; certificación por etiqueta, unidad, período, accesión y CIK | gratuita; `SEC_USER_AGENT` obligatorio; acceso justo (≤ 10 peticiones/s); masivos locales en `private_backups/pcv-us-bulk-*` | 879 empresas del universo no tienen `companyfacts` (ADR sin informe anual, emisores de 6-K, fondos); los emisores extranjeros presentan en su moneda | `server/src/pcv/secAnualVerificado*.ts`, `insertarAnualSecVerificado.ts`, `scripts/recuperar-sec-verificado.cjs`, `recuperar-sec-moneda-extranjera.cjs` |
| **EDINET** (FSA) | JP | primaria: informes anuales (有価証券報告書), XBRL JGAAP/IFRS | API gratuita con clave (`EDINET_API_KEY*`) | la taxonomía IFRS de algunos emisores (p. ej. Toyota: ingresos, beneficio bruto, CAPEX, acciones) aún no está mapeada en el verificador | `server/src/pcv/edinetAnualVerificado.ts`, `edinetTaxonomia.ts`, `scripts/recuperar-edinet-*.cjs` |
| **EDINET DB** | JP | respaldo complementario | cuota diaria (`EDINETDB_API_KEY*`) | no certifica | `scripts/pcv-credenciales-complementarias.cjs` |
| **MOPS / TWSE** | TW | primaria oficial (TIFRS) | descarga **manual** únicamente | las condiciones de TWSE (§6) prohíben la descarga automatizada sin consentimiento; la Open Data de TWSE/TPEx solo publica el último período | `sectorial/app/tools/verificar_mops_local.cjs`, `server/src/pcv/mopsAnualVerificado.ts` |
| **FinMind** | TW | recuperación (no certifica) | token `FINMIND_TOKEN`; guardián global de 120 peticiones/h; bloqueo de IP de 30 min si recibe muchas 4xx | `TaiwanStockFinancialStatements` es trimestre aislado (anual = suma T1–T4); sin fecha de publicación | `server/src/proveedores/guardiaHttp.ts`, `server/src/pcv/finmindTrimestral.ts`, `scripts/finmind-tw-trimestral.cjs` |
| **J-Quants API V2** | JP | contraste (`/v2/fins/summary`) | `JQUANTS_API_KEY` en la cabecera `x-api-key`; plan Free: 2 años con 12 semanas de retraso, 60 peticiones/min en `fins/summary` | condiciones de JPX: uso personal, sin redistribución; `fins/details` es Premium (403) | `server/src/proveedores/conectores.ts`, `scripts/jquants-resumenes.cjs` |
| **Eulerpool** | TW (y otros) | contraste | `EULERPOOL_API_KEY` en `Authorization: Bearer`; 100.000 llamadas/mes | plan no comercial; los agregados de balance (`allAssets`, `equity`) no son fiables; sin documento ni fecha de publicación | `conectores.ts`, `scripts/eulerpool-taiwan.cjs` |
| **FinDataEngine** (asreported.io) | US | complemento derivado de la SEC | cuota mensual gratuita | no es independiente de la SEC | `scripts/pcv-http.cjs` |
| **Alpha Vantage** | US | contraste | 25 llamadas/día | no certifica | `normalizarProveedores.ts` |
| FMP | — | **no se usa** (HTTP 402) | — | — | — |

## Datos que no se distribuyen
Los volcados MySQL y las descargas de los proveedores (`private_backups/`, `G2EXCHANGE/private_backups/jquants-v2`, `eulerpool-tw`, `finmind-tw-trimestral`, `pcv-us-bulk-*`) **no** van a Git. Sus licencias no permiten redistribuirlos o son operativos. Se transfieren en privado (`HANDOFF.md`).

## Guardián HTTP
`server/src/proveedores/guardiaHttp.ts` aplica a FinMind, J-Quants y Eulerpool:
- límite por hora compartido entre procesos, persistente en `G2_PROVIDER_GUARD_DIR`;
- circuit breaker;
- sin reintentos ante 400, 401, 402 y 404 (memorizados);
- pausa de al menos 35 minutos ante el bloqueo de IP 403;
- `Retry-After` en 429;
- backoff limitado en 5xx;
- ningún secreto en logs, errores o estado.

## Taiwán: incorporar documentos oficiales MOPS (procedimiento manual)
1. Descargar a mano desde MOPS (公開資訊觀測站) el informe financiero consolidado anual en inline XBRL de cada empresa y ejercicio, conservando el nombre original del archivo (`tifrs-…-cr-<código>-<año>Q4.html`).
2. Guardarlo en un directorio privado con un `manifest.json` que recoja la fecha de publicación que muestra MOPS: `{"tifrs-…-cr-<código>-<año>Q4.html": {"publicationDate": "AAAA-MM-DD"}}`. No hay que inventar fechas: si se desconoce, se deja sin ella y el adaptador no usará el informe en un DCF histórico.
3. Descargar el maestro de empresas de la Open Data de TWSE (`https://openapi.twse.com.tw/v1/opendata/t187ap03_L`, licencia abierta).
4. Ejecutar `G2_PROJECT_ROOT=<proyecto con .env> node sectorial/app/tools/verificar_mops_local.cjs <dir> <maestro.json> salida.json`.

El verificador comprueba:
- la empresa (CompanyID y nombre oficial);
- el documento consolidado;
- el ejercicio, el concepto, la moneda (TWD), la escala y la norma TIFRS;
- la ausencia de dimensiones.

Después compara con MySQL en solo lectura. La inserción como evidencia primaria se hará con el mismo procedimiento auditado que las demás correcciones (`OPERATIONS.md` §4).
