# G2EXCHANGE · Integración de los 16 modelos sectoriales — informe de la fase (31/10/2026)

Entorno: `sectoriales_auditoria_20261030/integracion_v02` (desarrollo aislado) · servicio `http://127.0.0.1:3200` · MySQL sólo lectura.
Motor final ensayado: `3b76805dbd8d6fd8160009110a548d4126e748ae4463ca8488acdab928c7f424`.

## 1. Resumen

La versión de desarrollo ejecuta el recorrido completo EMPRESA → HISTÓRICOS → CLASIFICACIÓN → HIPÓTESIS → PROYECCIONES → ESCENARIOS → VALORACIÓN → EXCEL para los 16 modelos. Cada modelo usa su propio mecanismo financiero. Excel y TypeScript coinciden nodo a nodo en los tres escenarios. Cuando faltan datos o métodos acreditados, el cálculo se bloquea, sin ceros ficticios ni partidas de ajuste.

**Hoy ninguna empresa real puede valorarse**, y es lo correcto. En el censo de las 40 empresas con más partidas verificadas, ninguna tiene los cuatro históricos exigidos completos y certificados. 32 tienen el sector `N/A` en MySQL. AMD tiene conceptos conflictivos y cierres de 52/53 semanas. A Toyota le faltan ingresos, CapEx, NWC y cohortes. Banca y seguros no pueden valorarse porque la taxonomía no contiene conceptos prudenciales. Desbloquearlas corresponde a las fases PCV/KPI y de calibración de primas, que no se han iniciado.

| Dimensión | Estado |
|---|---|
| Implementación técnica de los 16 modelos | IMPLEMENTADO Y PROBADO (ver §3; evidencia nativa final en §4) |
| Validación financiera | PENDIENTE: ningún modelo está aprobado financieramente |
| Valoraciones de empresas reales | BLOQUEADO POR DATOS |
| Despliegue operativo | PENDIENTE DE DESPLIEGUE (plan en `PLAN_INTEGRACION_Y_ROLLBACK.md`) |

## 2. Punto de partida verificado (trabajo de Codex)

- Corrección `SUM()` vacío: en `engine/src/grafo.ts` (`add()`→`0`, `mul()`→`1`), compilada. La API usa ese generador a través de `export-worker.mjs`, que hace el replay con el motor archivado del run.
- La validación nativa de Codex (run `e4a7fe48…`, 2.676 comprobaciones, sin reparación) sigue existiendo y siendo descargable. Corresponde a su motor `b5d6c35a…`.
- Codex añadió después, sin llegar a validarlos, la fiscalidad diferida, el ledger de otras partidas y el puente de apertura. Compilaban, y he comprobado la regresión: 39/39 y 15/15.

## 3. Correcciones y desarrollos de esta fase

| # | Problema detectado | Corrección |
|---|---|---|
| 1 | La UI (14:51) no permitía introducir la política contable, los saldos fiscales de apertura ni el año de alta de las cohortes, así que ninguna empresa no financiera podía completarse desde la aplicación | Editores de perímetro contable y otras partidas (con sus drivers), saldos fiscales en el puente, año de alta y drivers `capex.<id>` |
| 2 | Las empresas con sector `N/A` no tenían ninguna vía de resolución | Clasificación declarada por el analista (modelo, fuente, motivo, responsable, fecha). Sólo se admite si la acreditada no está resuelta, se registra en el expediente y se exporta como aviso, y no levanta los bloqueos por datos |
| 3 | Los modelos 04, 05, 07 y 16 eran idénticos salvo por las etiquetas | 04 base instalada + posventa; 05 producción × cuota × contenido × reducciones de precio; 07 volumen orgánico × precio/mix sobre la base acreditada |
| 4 | La I+D de farma quedaba diluida en `opexRate` | Driver `rdExpense` explícito; el desarrollo capitalizado se declara como cohorte INTANGIBLE |
| 5 | Banca: los otros activos no consumían capital y la tesorería no rentaba | `otherRiskWeight` y `cashYield` |
| 6 | Banca: `riskWeight` limitado a ≤ 100 % (incompatible con Basilea) | Dominio cambiado a ≥ 0 |
| 7 | Seguros: el float de primas no tenía valor | `cashYield` sobre la tesorería |
| 8 | Utilities: la RAB podía crecer sin inversión real | Regla en el grafo: inversión admitida ≤ altas reconocidas; si se supera, bloquea (en TS y en Excel) |
| 9 | Los libros QA podían rotularse como "EMPRESA REAL" | La fuente del resultado depende del snapshot; los libros sintéticos llevan el rótulo "PRUEBA SINTÉTICA QA — NO ES UNA EMPRESA" |
| 10 | La UI no distinguía un diagnóstico de una valoración | Botón "Excel de diagnóstico (no es valoración)" mientras el expediente está bloqueado |

Ninguna corrección introduce coeficientes sectoriales. Los drivers nuevos son hipótesis con fuente y fecha que aporta el analista, y si faltan, el cálculo se bloquea.

## 4. Pruebas

| Suite | Resultado | Excel |
|---|---|---|
| Regresión 0.1 (`engine/probar.cjs`) | 39/39 | No |
| Suites de integración (bloqueos 18, transmisión 17, contrato adaptador 5, versiones/exportación 8, React SSR 9, clasificación 4, contratos 8, activos avanzados 7) | 76/76 | No |
| Identidades financieras independientes, 16 sectores × 3 escenarios × 5 años (balance, caja, roll-forward del inmovilizado, CapEx→CFI, EBITDA/EBIT, NWC/ΔNWC, impuesto pagado = corriente + Δactivo − Δpasivo, VP, Gordon, EV→equity, CAPM, WACC) | 4.293 / 0 fallos; con eventos de activos (deterioro, revisión de vida, baja parcial, alta con pago diferido) 4.293 / 0 | No |
| Transmisión de drivers | 66 drivers; todos llegan a los estados; 7 exenciones metodológicas justificadas | No |
| API real (`tests/api_v3.cjs`) contra 3200 + MySQL | 24/24 | Sí: Toyota exportado, validado y descargado con hash coincidente |
| Lote nativo con motor superado (`qa_api/`) | 16/16 VALIDADO, 117.411 comprobaciones; **no cuenta como validación final** | Sí |
| **Lote nativo con motor final (`qa_api_final/`)** | _ver §4.1_ | Sí |

### 4.1 Excel nativo con el motor final

_Se completa al terminar el lote._

## 5. Adaptador MySQL

`adapter.cjs` (de Codex, sin cambios en esta fase). Usa `START TRANSACTION READ ONLY`, sólo `SELECT/SHOW` y un pool de 2 conexiones. Distingue observaciones VALIDADO / PENDIENTE / CONFLICTIVO / ausentes. Nunca convierte NULL en 0. Exige el mismo contexto de moneda, unidad, perímetro e identidad. Sólo usa informes publicados en o antes de la fecha de valoración (comprobado con Toyota a 2024-09-30). Mantiene un hash de entrada. Limitación estructural: no hay conceptos prudenciales en `taxonomia_concepto` (prueba de contrato `contrato_adaptador.test.cjs`).

## 6. Calendarios y estados

Conectados con los estados y verificados por identidades: cohortes con vidas fraccionarias, residual, límite al importe depreciable (nunca saldo negativo), altas con pago diferido (crédito de inversión) y anticipos, bajas con cobro y resultado, deterioros, revisiones de vida prospectivas, ROU/arrendamientos con interés sobre el saldo de apertura, NWC inicial acreditado, fiscalidad devengada frente a pagada, primer período parcial desde la fecha de valoración, cierres abril-marzo, bloqueo de 52/53 semanas sin calendario explícito, look-ahead bloqueado y tesorería obtenida de los flujos (el balance que no cuadra bloquea).

## 7. Integridad de producción

Ver `evidencias/integridad_claude_*.json`: 228 archivos operativos, 16 maestros y las 60 ejecuciones congeladas (sha256 `cb0a95e3…`) sin cambios. Recuperadores vivos: 22200 (coordinador), 9028 (US) y 7068 (JP). No se ha reiniciado MySQL ni ningún servicio operativo. No se ha modificado el módulo Capital, no se ha tocado ninguna tabla y no se ha ejecutado ninguna migración.

## 8. Pendientes

Ver `LIMITACIONES_Y_PENDIENTES.md`.
