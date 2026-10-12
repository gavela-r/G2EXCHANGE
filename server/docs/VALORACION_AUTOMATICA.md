# Valoración automática v2

Documento histórico de la segunda intervención. Las autorizaciones, activación y verificaciones posteriores se documentan en [TERCERA_INTERVENCION.md](TERCERA_INTERVENCION.md).

Estado: código implementado; escritura real desactivada hasta autorizar la migración. No se han cambiado datos históricos originales. Las pruebas SQL escriben únicamente tablas TEMPORARY de una conexión que se destruye al terminar.

## Compilación y comandos

Desde `G2EXCHANGE`:

```powershell
npm.cmd run build
npm.cmd test
npm.cmd --prefix server run test:integration
npm.cmd run valuation -- --dry-run --limit 20 --batch-size 100 --as-of 2026-10-12 --directory server/resultados_valoraciones/mi_prueba
npm.cmd run valuation -- --dry-run --resume --limit 20 --as-of 2026-10-12 --directory server/resultados_valoraciones/mi_prueba
npm.cmd run valuation:dev -- --dry-run --limit 20 --directory server/resultados_valoraciones/desarrollo
npm.cmd --prefix server run valuation:classification
# Run con evidencia congelada y motor archivado:
npm.cmd --prefix server run valuation:replay -- <run_id>
```

Desde `server`, los equivalentes son `npm.cmd run build`, `npm.cmd run valuation -- ...` y `npm.cmd run valuation:dev -- ...`. Desde cualquier carpeta: `node <ruta-proyecto>/server/dist/valoracionAutomatica.js ...`. Las rutas internas se resuelven desde el módulo, sin cwd ni rutas personales. Los directorios explícitos de CLI siguen las reglas normales de la terminal.

El build compila primero el motor y genera un manifiesto determinista de fuentes/configuraciones y JavaScript. Conserva fuentes, configuraciones y binarios en `valuation_engine/archives/<manifest_hash>`; verifica archivos existentes sin sobrescribirlos. Los archivos generados se excluyen de Git: requieren copia de seguridad independiente. El preparador rechaza binarios desactualizados y exige reiniciar el worker si se recompila durante su ejecución. TypeScript no emite si hay errores. No se añadieron dependencias.

`--write` es explícito y exige `valuation_execution` y la versión real 1.5.1 en `model_version`. No ejecutar en base real antes de aprobar `sql/10_valoracion_reproducible.sql`. `--dry-run` es el valor predeterminado y no hace INSERT/UPDATE en MySQL, aunque sí escribe informes locales.

## Datos, identidad y elegibilidad

La paginación usa `instrumento.id`. Ese ID determina empresa, mercado, ISIN, moneda y cotización. El mismo ID queda en input y evidencia SQL; no se selecciona el primer ticker. No hay empresas ni tickers fijos en el ejecutable. Los IDs concretos aparecen solo en pruebas.

Sectores `REVISAR` y desconocidos quedan pendientes. El preparador verifica que el nombre real corresponde al ID del mapeo. No hay datos adicionales en `empresa` que permitan deducir por sí solos la actividad de todas las compañías N/A. El informe de clasificación se genera por páginas de 500 filas.

Se toman cuatro informes ANUALES con fechas civiles y publicación <= valoración. Cada informe debe tener una versión VIV de la misma empresa. Los valores financieros se reconstruyen desde partidas de origen; no se confía en ceros rellenados de VIV. El input usa la fecha de `informe_financiero`, registra también la fecha discrepante de VIV y no modifica ninguna de las dos.

Identidades verificables: EBITDA=EBIT+D&A; deuda total=CP+LP; NWC=inventarios+cobrar-pagar; FCF=CFO-CAPEX; beneficio antes de impuestos=neto+impuesto. Solo se reconstruyen si están todos los componentes. Conflictos de taxonomía bloquean: nunca se elige el último valor arbitrariamente.

Komatsu: informe EDINET S100QYNI, 31/03/2023, tiene `ReversalOfReserveForSpecialDepreciation` (-24 millones JPY) erróneamente clasificado como D&A. Se excluye; el importador japonés ya no admite esa coincidencia por sufijo. También se excluyen movimientos de inventarios que no son saldos. No se reimportaron documentos ni corrigieron partidas originales.

El signo de CAPEX/dividendos se normaliza solo si el alias original coincide exactamente con el alias documentado del proveedor. La ausencia queda ausente; cero observado conserva su significado. Los KPI y nuevas VIV reutilizan la normalización común.

Moneda: la fuente registrada es VIV.moneda. No hay conversión FX implementada: diferencias de moneda producen FX_PENDIENTE. El generador de nuevas VIV no infiere moneda por SEC/EDINET/FinMind; conserva la moneda financiera registrada cuando es única, o NULL cuando falta evidencia. Para una empresa nueva se necesita registrar la moneda de cuentas a partir de sus unidades originales. El motor existente admite US/JP/TW y sus monedas aprobadas; ampliar esos mercados requiere metodología adicional.

## Hipótesis y rating

`--hypotheses archivo.json` acepta un objeto cuya clave es `instrumento_id`. Cada registro requiere `source` y `reference_date`; puede aportar `perfil_rating`, `reporting_currency`, `sector_id`, `sector_beta` con evidencia, `risk_inputs`, `wacc_adjustments`, `premium_methodology`, `company_assumptions` y `sector_specific`. No hay parámetros globales aplicados a todas las empresas. Ejemplo estructural (los marcadores deben sustituirse por evidencia real):

```json
{"<instrumento_id>":{"source":"<fuente verificable>","reference_date":"<YYYY-MM-DD>","perfil_rating":"<perfil verificado>"}}
```

La base tiene perfiles GRANDE_NO_FINANCIERA, PEQUEÑA_RIESGOSA y FINANCIERA. Sin evidencia del perfil se registra PERFIL_RATING_PENDIENTE; no se inventa un umbral de tamaño internacional. BANK/INSURANCE requieren FINANCIERA. La cobertura proviene del informe más reciente entre los cuatro con EBIT e intereses observados; su fecha y origen quedan congelados. Interés ausente o cero no se sustituye por cobertura 999. Se exige exactamente un tramo activo del perfil y spreads no futuros.

Cuando no hay risk_inputs ni ajustes personalizados, SYSTEM_DEFAULT_ZERO_V1 suministra cuatro ceros por escenario. Su fecha de política es 12/10/2026, constante para reproducibilidad. Es una hipótesis del sistema, siempre REVIEW, no MANUAL_APPROVED. El motor rechaza usarla para reemplazar risk_inputs. Los ajustes reales se conservan con su metodología y evidencia. Se mantienen los límites de ±0,10 por factor.

## Persistencia e histórico

Una conexión obtiene GET_LOCK por instrumento. Preparación en transacción READ ONLY consistente; luego una transacción única crea snapshot, cuatro detalles cronológicos, run EJECUTANDO, resultados y evidencia, y pasa a COMPLETADO. Cualquier fallo revierte todas las inserciones. La clave única de input_hash añade protección contra duplicados. No se reutilizan runs legacy sin input congelado.

`valuation_execution` conserva instrumento, huella, input completo, fuentes, calidad, configuración sectorial, política de riesgo, salida completa, estado financiero, versión y manifiesto. Los documentos se guardan como JSON canónico en LONGTEXT con CHECK JSON_VALID: en pruebas, la serialización del tipo JSON de MySQL alteró el último bit de algunos valores de coma flotante. El texto conserva su representación exacta y permite comparar todo el replay sin tolerancias que oculten diferencias. La configuración congelada evita releer las plantillas actuales. El servicio rechaza ejecutar un histórico con otro manifiesto/versión. Cambios de fórmula exigen conservar el motor histórico correspondiente.

`valuation:replay` verifica y carga el archivo correspondiente a la huella guardada, sin utilizar fórmulas actuales para un histórico distinto. Compara toda la salida y no escribe en MySQL. Probado con la ejecución NVIDIA aislada y el motor archivado actual; la compatibilidad entre distintas versiones de Node y futuras dependencias requiere conservar también el entorno. Los 532 runs legacy no tienen evidencia completa y siguen sin ser reproducibles.

Los tres resultados completos usan las columnas existentes de valuation_run_resultado. REVIEW no implica aprobación. Si faltan entradas BANK/INSURANCE/REIT, el motor devuelve BLOCKED/DATA_PENDING y valores NULL: se conserva el objeto completo en evidencia, se registra BLOQUEADA y no se insertan ceros en fair_value NOT NULL. COMPLETADO indica ejecución técnica terminada, no aprobación financiera. Un error técnico se registra en JSONL y no deja un run parcial.

## Full, incremental, reanudación y reconciliación

FULL revisa todos los instrumentos y vuelve a ejecutar inputs equivalentes para comparar el replay con su salida anterior; no duplica históricos. INCREMENTAL prepara la huella y reutiliza equivalentes sin recalcular el motor. Ambos usan páginas acotadas; solo permanece en memoria una preparación y su resultado.

La huella incluye identidad, versiones, valores normalizados, KPI, cotización/fecha, parámetros/evidencias, monedas, modelo, plantilla e hipótesis. Los IDs nuevos de run/snapshot y la fecha operativa de lanzamiento no alteran identidad por sí solos. El modelo no aplica envejecimiento diario de flujos, por lo que esa fecha se conserva de la primera ejecución equivalente. Nuevos precios sí recalculan: el precio interviene en los pesos del WACC actual.

Checkpoint atómico después de cada instrumento, JSONL acumulativo, archivo de resúmenes anteriores. No se vacía el diario. Una ejecución interrumpida requiere --resume; no se reinicia silenciosamente. Locks de procesos muertos se recuperan verificando el PID. Errores transitorios de lock/deadlock/conexión tienen tres intentos; los pendientes y errores definitivos se conservan y se reconsideran en el próximo barrido incremental.

Reconciliación periódica disponible (no activada):

```powershell
npm.cmd run valuation:watch -- --dry-run
# Tras autorización y ensayos: npm.cmd run valuation:watch -- --write --hypotheses <archivo-validado>
```

`G2_RECONCILIATION_MINUTES` configura intervalo (60 por defecto). Reanuda un barrido interrumpido. Detecta informes ANUALES/versiones, KPI, precios, parámetros, hipótesis y código/configuración por su huella. Las importaciones deben completar partidas/KPI/VIV antes del siguiente barrido. No se añadieron triggers ni servicios de Windows. El TTM automático a partir de informes trimestrales sigue pendiente: se evita anualizar datos ambiguos.

## Migraciones y reversión: requieren autorización

10: tabla aditiva valuation_execution y registro model_version 1.5.1. No altera históricos. SQL exacto en `sql/10_valoracion_reproducible.sql`. Reversión conservadora en 11: detener workers y archivar por RENAME; no borrar resultados ni versión del modelo. El DDL de MySQL no es reversible mediante ROLLBACK.

12: propuesta independiente del índice (mercado_id,ticker). No aplicada: antes hay que adaptar los importadores que resuelven conflictos de ticker y revisar claves nulas. Si posteriormente existen tickers globales repetidos, no se puede restaurar el índice global sin perder capacidad de representación; se detiene la reversión.

13/14: precheck y reparación de fechas por copia de versiones. Observadas 88.464 discrepancias exactas de -1 día. Fuente informe_financiero.fecha_fin_periodo, vínculo informe/empresa validado. Se crean nuevas versiones con hash de reparación etiquetado; no se cambian originales ni enlaces históricos. La propuesta incluye ledger y ROLLBACK de ensayo. No aplicar 88.464 inserciones sin validar antes lote pequeño, igualdad de campos, recuentos e impacto. Reversión posterior con referencias exige conservar las versiones nuevas; nunca borrar una versión referenciada. La reparación de fechas no valida ceros históricos ni la taxonomía.

## Validaciones y límites financieros

Pruebas: TypeScript, 16 plantillas, CAPM/WACC, CAPEX, NWC, DDM, calidad, rutas, fechas, escenario bloqueado, paginación/reanudación, persistencia temporal, rollback tras run y durante segundo escenario, idempotencia, nuevo run por cambio y replay, exclusión por instrumento y lock entre workers. Informe reproducible en resultados_valoraciones/verificacion.

Solo hay una sonda real con tres escenarios verificados técnicamente en esta intervención: NVIDIA, perfil de rating explícito de diagnóstico. Su resultado permanece REVIEW. USB y Vertex: N/A; Komatsu/Yoshitake: conflictos de taxonomía. Muestras TWD y recursos registran el resultado o motivo pendiente en el informe de integración. No se afirma que producir un número sea validación financiera auditada.

Acciones en circulación se usan como proxy del denominador del motor: no acreditan dilución completa. Se requiere revisar splits/ADRs y clases antes de aprobación. Los modelos bancario/asegurador/REIT existentes son simplificados; PHARMA/RESOURCE usan FCFF sectorial y no incorporan por sí solos pipeline probabilístico ni agotamiento de reservas. ROIC terminal documentado sigue siendo necesario para normalización; sin él el motor conserva LEGACY_FCFF con advertencia.

Cambios de fórmula justificados en esta intervención: el crecimiento TTM anualizado calculado se utiliza en el peso reciente (antes se duplicaba el crecimiento FY); WACC<=g se bloquea porque el terminal sería indefinido/incompatible. Se sube versión a 1.5.1. MID_YEAR no se modificó: su convención terminal requiere revisión metodológica.

La referencia NVIDIA 198,2118 / 212,9297 / 228,4465 y WACC ~9,5768% se conserva como referencia incompleta, no como test pasando: no se encontró el input original completo. No se inventaron sus hipótesis.
