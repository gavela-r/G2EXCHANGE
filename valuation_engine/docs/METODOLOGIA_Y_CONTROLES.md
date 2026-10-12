# Metodología G2EXCHANGE v1.5 - cálculo independiente TypeScript

## Unidades

- En MySQL `pais.interes_bono_10_ano=4.68` se interpreta como `4,68 %`; exportar a `risk_free_rate=0.0468`.
- En MySQL `pais.prima_riesgo_mercado=4.46` se interpreta como `4,46 %`; exportar a `equity_risk_premium=0.0446`.
- `sector.sensibilidad_al_mercado=2.1258` no se divide entre 100.
- Spreads de `rating_sintetico` se dividen entre 100 si se almacenaron en puntos porcentuales. Confirmar en vuestra base de datos.
- Importes contables, deuda financiera y acciones diluidas van en **millones de su misma moneda**. El precio es moneda/acción.
- El conversor MySQL requiere las unidades definidas explícitamente y puede bloquearse ante campos faltantes.

## CAPM y WACC

`Ke = Rf + beta * ERP_total_Damodaran`.

La prima **Total Equity Risk Premium** de Damodaran incorpora riesgo país. **No añadir `riesgo_extra_por_pais` ni una segunda prima país al Ke o WACC**.

`E = precio_actual * acciones_diluidas` (capitalización bursátil, no patrimonio del balance).

`D = deuda_financiera_con_coste` (no pasivo total).

Por escenario: `Kd = Rf + spread_crediticio_escenario`, `Kd_neto=Kd*(1-T)`,
`WACC_financiero = Ke*E/(E+D) + Kd_neto*D/(E+D)`.

`WACC_ajustado = WACC_financiero + prima_iliquidez + prima_tamano + prima_concentracion + otros_ajustes`.

Las primas son puntos de tasa expresados en **fracciones** (0.01 = 1 pp); pueden ser cero, positivos o negativos, con fuente y fecha. No duplicar riesgo ya recogido en flujos o en beta. El mercado conserva Ke constante entre escenarios, aunque Kd y primas cambien.

## Criterios automáticos DRAFT

La política de `config/risk_policy_v15.json` contiene **umbrales ilustrativos**, no evidencia empírica. Requiere tres métricas con fecha/fuente: market cap USD, volumen efectivo diario mediano 90d USD, cuota del principal cliente. Cada escenario multiplica una prima base; la suma está limitada. **Todo cálculo automático DRAFT sale REVIEW** y exige aprobación independiente.

## Proyecciones y especificidad sectorial

- Familias no financieras: DCF FCFF a 5 años con crecimiento/margen/reglas parametrizadas en `generator/sector_configs/`. Valor terminal Gordon, Ke/Kd/WACC calculados en TypeScript.
- 13 Banca y 14 Seguros: DDM de dividendos **solo con datos adicionales**; descuento a Ke ajustado, no a WACC corporativo.
- 15 REIT: AFFO-Gordon simplificado **solo con AFFO auditado**; resultado sujeto a revisión.
- En ausencia de entradas sectoriales no se publica fair value: `DATA_PENDING` / `BLOCKED`.
- Plantillas heredadas `08_PROYECCIONES`, `09_VALORACION` se mantienen como referencia con fórmulas anteriores; pueden diferir del motor TS. Hoja autoritativa: `14_MOTOR_TS` y resultado JSON.

## Tratamiento de noticias

No hay crawler ni fuentes automáticas en el ZIP. Noticias solo se aplican desde `news_events` explicitamente suministradas con aprobación, materialidad, confianza, fuentes y vigencia. Puede alterar crecimiento, CAPEX, dilución y, si el riesgo es sistemático NO duplicado, un ajuste auditado. La quiebra queda pendiente del módulo probabilístico de recuperaciones.

## Persistencia histórica

Se entregan parámetros inmutables en JSON/XLSX/PDF por run/snapshot. En SQL la persistencia opt-in inserta una vez tres escenarios dentro de una transacción; **no hace UPSERT ni UPDATE del histórico**. La tabla de MySQL puede requerir **tres columnas adicionales** (`prima_tamano`, `otros_ajustes_wacc`, `auditoria_ajustes_json`) mediante revisión de la migración comentada. No ejecutar ninguna migración sin backup/QA.

## Barreras de seguridad

El CLI no usa credenciales ni conecta a MySQL; falla con no cero si faltan unidades o primas. No sobrescribe nombres de salida. No declara `APPROVED` por defecto. Las cotizaciones y ratios de ejemplo son ficticios. Revisar beta sectorial apalancada/desapalancada, spreads de rating, deuda leasing, elección de divisa y calidad de fuentes antes de producción.
