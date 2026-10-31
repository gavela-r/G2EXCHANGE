# Base de datos

MySQL 8, base operativa `DB_NAME` (en la instalación original, `2GB` en el contenedor `mysql_valoracion`, puerto 3307). Esquema base: `server/sql/00_schema.sql`. Las migraciones se aplican en orden numérico y cada una con datos tiene su rollback.

## 1. Tablas principales
| Tabla | Contenido | Identidad |
|---|---|---|
| `pais`, `empresa`, `sector`, `mercado`, `instrumento` | universo de empresas (US, JP, TW) e instrumentos cotizados | `instrumento` = ticker + mercado; la empresa debe ser del país del mercado |
| `informe_financiero` | un documento financiero: tipo de periodo (`ANUAL`), cierre, publicación, `fuente` (SEC_EDGAR / EDINET / FINMIND / MOPS) e `identificador_fuente` (accesión SEC, docID EDINET…) | documento + periodo |
| `taxonomia_concepto` | conceptos estándar (INGRESOS, EBIT, EFECTIVO, `CAJA_Y_DEPOSITOS`…) con alias por proveedor | `concepto_estandar` único |
| `partida_contable_valor` (PCV) | observaciones contables: informe, concepto estándar, **etiqueta de origen** (`concepto`), importe | `identidad_observacion` (migración 33) |
| `pcv_verification_evidence` | evidencias de verificación por informe y concepto: `INSERTED`, `NULL_FILLED`, `VERIFIED_EXISTING`, `CONFLICT_PRESERVED`, `CONFLICT_RESOLVED`… con el JSON completo del candidato y su contexto | (informe, concepto, proveedor, hash) |
| `pcv_import_evidence`, `financial_report_evidence` | procedencia de importaciones y documentos | |
| `kpi_financiero_informe` | KPI calculados por informe | (informe, kpi) |
| `pcv_correccion_auditoria` | auditoría de cada corrección de PCV (migración 31): valor anterior, nuevo, regla y versión | |
| `identidad_reasignacion_auditoria`, `informe_identidad_cuarentena` | reasignaciones y cuarentena de identidad cruzada (migración 32) | |
| `valuation_*`, `capital_*` | valoraciones (las 60 históricas están congeladas) y módulo Capital | |

## 2. Capas de una observación
| Capa | Dónde | Regla |
|---|---|---|
| **Original** | filas de `partida_contable_valor` tal como se recuperaron (incluidos duplicados históricos) | nunca se borran; las correcciones guardan el valor anterior en `pcv_correccion_auditoria` |
| **Normalizada** | `normalizarPartidas` (`server/src/valoracion/datos.ts`): signos de salida de caja, D&A válido, movimientos excluidos de saldos | determinista |
| **Certificada** | una fila con evidencia primaria `INSERTED`/`NULL_FILLED`/`VERIFIED_EXISTING` (`record_id(s)`) y sin `CONFLICT_PRESERVED` pendiente (o resuelto por una regla versionada) | certificación solo con fuente primaria (SEC, EDINET, MOPS) |
| **Seleccionada** | `SELECCION_OBSERVACIONES_V1` (`server/src/pcv/seleccionObservaciones.ts`), usada por el cálculo de KPI | ver §3 |

## 3. Selección de observaciones (`SELECCION_OBSERVACIONES_V1`)
Cuando un informe tiene varias filas para un concepto:
1. Si las filas certificadas por la fuente primaria tienen un único importe, se seleccionan esas.
2. Si no hay certificación, la etiqueta del estado financiero principal prevalece sobre la sección resumen del mismo documento (`*SummaryOfBusinessResults`) y sobre las extensiones propias de la empresa.
3. Si siguen quedando importes distintos, el concepto queda **sin resolver**, se excluye del cálculo y bloquea solo los KPI que lo usan.

La selección nunca elige por el valor: ni el mayor, ni el menor, ni el más reciente. Los movimientos (deterioros, reversiones, variaciones) no cuentan como magnitud de saldo, y las reservas o reversiones no cuentan como D&A.

## 4. Certificación y conflictos
- **Celda certificada**: hay un PCV no nulo, una prueba certificadora y ningún conflicto sin resolver.
- **Conflictos**: un `CONFLICT_PRESERVED` deja de bloquear solo si todos los de la celda tienen un `CONFLICT_RESOLVED` de una regla versionada que los referencia (`resolves` = `evidence_hash`).
- **Reglas versionadas** (migración 31, `sectorial/app/tools/diagnostico_conflictos.cjs`):
  - `US_PERIODO_V1`: el PCV guardado era el comparativo de 1–3 ejercicios anteriores del mismo 10-K.
  - `JP_RESUMEN_MISMO_DOC_V1`: el mismo importe en la sección resumen del mismo documento.
  - `JP_SIGNO_CANONICO_V1`: CAPEX con signo opuesto y la misma etiqueta.
  - `JP_EFECTIVO_EQUIVALENTES_V1`: EFECTIVO es efectivo y equivalentes; caja y depósitos pasa a `CAJA_Y_DEPOSITOS`.
  - `TW_ANUAL_TRIMESTRAL_V1`: el anual de FinMind es la suma T1–T4.
- **Adaptador DCF** (`sectorial/app/adapter.cjs`): valida fila a fila con la prueba certificadora (importe, documento, etiqueta, moneda, perímetro y fechas). `CONFLICT_RESOLVED` por sí solo nunca certifica.

## 5. Identidad e idempotencia
- **Migración 33**:
  - `identidad_observacion` = `SHA2(CONCAT_WS('|', informe_id, concepto_estandar_id, concepto), 256)`, con índice único;
  - los duplicados históricos conservan `NULL` y solo la fila más antigua de cada grupo recibe la identidad.
- **Cargadores** (SEC/EDINET verificados, «solo ausentes» y FinMind): escriben la identidad. Repetir una recuperación actualiza la misma observación y nunca toca otro informe ni otro período (`server/tests/pcvIdempotencia.integration.cjs`).
- **Identidad empresarial**:
  - el mercado «TSE» se resuelve según el país (`server/src/pcv/mercados.ts`);
  - un instrumento no puede enlazarse con una empresa de otro país;
  - la medición y el adaptador usan solo informes de la fuente del país (US: SEC_EDGAR; JP: EDINET; TW: FINMIND/MOPS).

## 6. Perímetro de beneficio y patrimonio
`perimetroDeEtiqueta` clasifica cada observación de BENEFICIO_NETO y PATRIMONIO_NETO según su etiqueta XBRL:
- **DOMINANTE**: `NetIncomeLoss`, `StockholdersEquity`, `*AttributableToOwnersOfParent`.
- **TOTAL**: `ProfitLoss`, `NetAssets`, `EquityIFRS`, `*IncludingPortionAttributableToNoncontrollingInterest`, `IncomeAfterTaxes`/`Equity` de FinMind.

ROE solo se calcula si los dos perímetros coinciden. Definición efectiva por país:
- **EE. UU.**: BENEFICIO_NETO es el atribuible a la dominante.
- **Japón y Taiwán**: es el consolidado.

El margen neto usa BENEFICIO_NETO tal como lo define el país.

## 7. Migraciones
| Nº | Contenido | Estado en la base operativa |
|---|---|---|
| 00–23 | esquema base, valoración reproducible, evidencias, Capital v2 | aplicadas antes de esta fase |
| 30 | taxonomía sectorial (25 conceptos inactivos) | preparada, **no aplicada** |
| 31 | auditoría de correcciones, `CONFLICT_RESOLVED`, `CAJA_Y_DEPOSITOS` | **aplicada y verificada** (31/10/2026); datos en `private_backups/reparacion-aislada/31_datos_b071eb37281c.sql` + rollback |
| 32 | cuarentena y reasignación de identidad cruzada | **aplicada y verificada** |
| 33 | identidad de observación e índice único | ver `HANDOFF.md` (estado exacto en el momento de la entrega) |

Procedimiento obligatorio para cualquier migración con datos (`OPERATIONS.md`): copia, restauración en un MySQL aislado, ensayo, rollback, reaplicación, pausa de los escritores incompatibles, aplicación y verificación.
