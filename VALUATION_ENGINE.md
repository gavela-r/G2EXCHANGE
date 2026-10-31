# Motor de valoración y KPI

Hay dos motores, alimentados ambos por observaciones **certificadas**:
1. **`valuation_engine/`**: el motor de valoración del backend. Lo usan las valoraciones automáticas (`server/valoracionAutomatica.ts`) y las 60 valoraciones históricas congeladas.
2. **`sectorial/app/engine/`**: los 16 modelos sectoriales con exportación a Excel (`VALUATION_MODELS.md`), servidos por la API sectorial (`API.md`).

## 1. Cadena de datos
fuente primaria → identidad empresarial (país, CIK/EDINET, mercado) → documento (`informe_financiero`) → ejercicio → concepto (`taxonomia_concepto`) → normalización → certificación → selección (`SELECCION_OBSERVACIONES_V1`) → KPI → CAPM/WACC → DCF → modelo sectorial → Excel → interfaz.

Garantías del adaptador (`sectorial/app/adapter.cjs`):
- **Fuente**: solo informes de la fuente del país.
- **Información futura**: solo informes publicados antes de la fecha de valoración (`fecha_publicacion ≤ asOf`). Un informe sin fecha de publicación (FinMind) no se usa.
- **Certificación**: una fila se valida únicamente con una prueba compatible en importe, documento, etiqueta, moneda, perímetro y fechas.
- **Contexto**: si cambia entre cierres o es incompleto, se emite `CONTEXTO_CAMBIA_ENTRE_CIERRES` o `CONTEXTO_FINANCIERO_INCOMPLETO`.
- **Bloqueo explícito**: si falta información, la ejecución queda `BLOQUEADO` con sus `issues` y `requiredInputs`. Nunca produce una valoración aparentemente precisa.
- **Moneda**: no se convierte ninguna moneda sin tipo de cambio acreditado. Los emisores extranjeros (20-F/40-F) se valoran en su moneda de presentación. Para un ADR faltan el ratio de representación y el tipo de cambio, así que su valoración en USD no está implementada.

## 2. Coste de capital
- **CAPM**: Ke = Rf + β · ERP (+ primas autorizadas). Rf y ERP salen de `coste_capital_referencia`; β es sectorial (`insercionDatos/betaSectorial.ts`).
- **WACC** = E/(D+E)·Ke + D/(D+E)·Kd·(1−t) (`valuation_engine/src/wacc.ts`). Banca, seguros y REIT descuentan con Ke.
- **Primas de liquidez y tamaño**: `NO_ESTIMABLE` (ajuste 0) hasta que haya una calibración aprobada (`RISK_PREMIUM.md`).

## 3. DCF
- **Proyecciones** en tres escenarios a partir de hipótesis citadas: `valuation_engine/src/proyecciones.ts` y `sectorial/app/engine/src/plan.ts`.
- **FCFF** = EBIT·(1−t) + D&A − CAPEX − ΔNWC, descontado con WACC.
- **Valor terminal**: Gordon.
- **Puente de valor**: EV → equity (deuda neta y otras partidas) → valor por acción.
- **Familias de modelo**: FCFF (general), FCFE con capital requerido (banca y seguros) y AFFO/NAV (REIT).

## 4. KPI (`server/insercionDatos/insercionKPIInformeFinanciero.ts`)
Todas las entradas de un KPI deben estar en el mismo informe. Los valores ausentes son NULL, nunca cero, y una división por cero hace el KPI no calculable.

| KPI | Fórmula | Notas |
|---|---|---|
| MARGEN_BRUTO | beneficio bruto / ingresos | |
| MARGEN_EBIT | EBIT / ingresos | |
| EBITDA / MARGEN_EBITDA | EBIT + D&A; / ingresos | D&A válido (sin reservas ni reversiones) |
| MARGEN_NETO | beneficio neto / ingresos | perímetro de BENEFICIO_NETO según el país (`DATABASE.md` §6) |
| ROA | beneficio neto / activos totales | |
| ROE | beneficio neto / patrimonio neto | **solo si ambos tienen el mismo perímetro** (dominante/dominante o total/total) |
| DEUDA_TOTAL / DEUDA_NETA | deuda CP + deuda LP; − efectivo | política `BOTH_VERIFIED_DEBT_COMPONENTS_REQUIRED_V2`: los dos componentes verificados |
| DEUDA_SOBRE_PATRIMONIO / DEUDA_SOBRE_ACTIVOS / PASIVO_SOBRE_ACTIVOS | cocientes respectivos | misma política de deuda |
| COBERTURA_INTERESES | EBIT / gasto por intereses | |
| FCF / MARGEN_FCF | flujo operativo − CAPEX; / ingresos | CAPEX en valor absoluto (salida de caja con alias exacto) |
| CAPITAL_CIRCULANTE_OPERATIVO (/ ingresos) | inventarios + cuentas a cobrar − cuentas a pagar | |

EPS: se usa el EPS diluido declarado (`EPS_DILUIDO`) y no se deriva de los trimestres.

**Recálculo**: `server/scripts/recalcular-kpi-correcciones.cjs` usa la fórmula sin cambios y la política vigente, guarda un snapshot reversible y registra la causa de cada KPI retirado:
- `PRERREQUISITO_DEUDA_V2`;
- `ENTRADA_SIN_RESOLVER`;
- `ENTRADA_AUSENTE_O_NULA`;
- `PERIMETRO_INCOMPATIBLE`.

## 5. Valoraciones congeladas
Las 60 valoraciones históricas están congeladas: su huella se comprueba con `sectoriales_auditoria_20261030/integracion_v02/tests/integridad_claude.cjs` (sha256 `cb0a95e3…`). Las ejecuciones sectoriales son inmutables y llevan el hash del motor que las produjo (`sectorial/app/store.cjs`).
