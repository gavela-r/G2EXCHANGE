# Fase 2 — disponibilidad real de liquidez y tamaño

## Qué significan los colores

**VERDE:** observación técnicamente cotejada con importe/registro/periodo/moneda/base y evidencia de publicación, para la definición examinada. **AMARILLO:** existe número o conjunto de insumos, pero falta conciliar calidad/semántica/contexto o completar datos. **ROJO:** falta información suficiente o hay una incompatibilidad de identidad/mercado que bloquea el uso. **GRIS:** definición industrial no aplicable al modelo, como ciertos ratios de bancos/aseguradoras.

Los colores se refieren al dato, nunca autorizan una prima. No hay una clasificación global VERDE de todos los importes por tener un campo no NULL. Se dan los conteos numéricos exhaustivos y, separadamente, una muestra cotejada. Las 121 empresas con familia BANK/INSURANCE resuelta se tratan como GRIS en los indicadores industriales no aplicables; las familias pendientes no se convierten en financieras ni industriales por defecto. Los conteos numéricos que siguen incluyen todos los modelos como inventario, no como aprobación de su uso.

## Método y denominadores

La población capturada es de 13.194 empresas y 41.758 informes ANUALES con cierre en 2022–2026. Cada empresa se cuenta como máximo una vez por indicador en el total y una vez por empresa/ejercicio en las tablas anuales. **No sumar las filas de años para obtener empresas únicas.** Un año se identifica por el año de cierre, no por el nombre fiscal del proveedor.

Presencia almacenada = importe numérico no ambiguo y con signos admisibles para la identidad diagnóstica, o KPI heredado explícitamente identificado. Derivación = todos los insumos en un mismo informe; no se usa pasivo total como deuda ni NULL como cero. Publicación admisible = fecha no NULL, >= cierre y <=29/10/2026, con cierre también <=corte. Esto es un filtro de metadatos, no validación oficial de la publicación. Las observaciones de un contexto individual se mantienen separadas de las consolidadas; las de contexto desconocido permanecen AMARILLAS.

La cobertura se calcula de PCV/KPI y se presenta VIV aparte porque sus fechas no concuerdan. Los datos físicos VIV no se mezclan con PCV para completar una fórmula. Las diferencias de importes en un mismo concepto/informe se bloquean; no se elige el mayor o más conveniente. Los KPI con insumos dudosos no se elevan a VERDE.

## Dieciséis indicadores financieros

En la tabla: “almacenada” y “con publicación” son **empresas únicas**; “informes numéricos” cuenta informes, no empresas; “verde muestra” son informes de la muestra limitada, no cobertura poblacional. PCV=partida_contable_valor unida a taxonomia_concepto; KPI=kpi_financiero_informe; IF=informe_financiero.

| Indicador | Estado agregado | Empresas almacenadas | Empresas con publicación / 13.194 | Informes numéricos | Verde en muestra / 60 | Origen | Fórmula/definición |
|---|---|---|---|---|---|---|---|
| Ingresos | AMARILLO | 9504 | 8820 (66,85 %) | 36.560 | 40 | PCV INGRESOS | Importe reportado ≥0 |
| EBITDA | AMARILLO | 8331 | 7661 (58,06 %) | 32.752 | 40 | PCV EBIT/D&A; KPI EBITDA | EBIT+D&A validada, o KPI existente identificado |
| EBIT | AMARILLO | 9184 | 8513 (64,52 %) | 35.821 | 40 | PCV EBIT | Importe reportado |
| Activos totales | AMARILLO | 10.350 | 9665 (73,25 %) | 40.723 | 40 | PCV ACTIVOS_TOTALES | Total reportado ≥0 |
| Efectivo | AMARILLO | 9970 | 9285 (70,37 %) | 39.104 | 38 | PCV EFECTIVO | Saldo reportado ≥0; restringida/operativa no separada |
| Deuda financiera CP+LP | AMARILLO | 5348 | 4754 (36,03 %) | 18.473 | 1 | PCV DEUDA_CORTO_PLAZO/DEUDA_LARGO_PLAZO | Deuda financiera CP+LP, ambos presentes ≥0 |
| Deuda neta | AMARILLO | 5342 | 4748 (35,99 %) | 18.445 | 1 | PCV deuda/caja | Deuda financiera−efectivo |
| Patrimonio neto contable | AMARILLO | 10.149 | 9464 (71,73 %) | 40.100 | 39 | PCV PATRIMONIO_NETO | Saldo contable; no capitalización |
| CFO | AMARILLO | 10.317 | 9629 (72,98 %) | 40.702 | 39 | PCV FLUJO_CAJA_OPERATIVO | Flujo operativo reportado |
| CAPEX | AMARILLO | 9122 | 8453 (64,07 %) | 34.997 | 32 | PCV CAPEX | Inversión reportada; conciliar signo |
| FCF | AMARILLO | 9092 | 8423 (63,84 %) | 34.664 | 32 | PCV CFO/CAPEX; KPI FCF | CFO−CAPEX de salida positivo; o KPI legacy identificado |
| Cobertura intereses | AMARILLO | 6586 | 6462 (48,98 %) | 22.859 | 18 | PCV EBIT/GASTO_INTERESES | EBIT/abs(gasto intereses), intereses≠0 |
| Deuda neta/EBITDA | AMARILLO | 4328 | 3743 (28,37 %) | 14.891 | 1 | PCV y, si corresponde, EBITDA KPI | (CP+LP−efectivo)/EBITDA, EBITDA>0 |
| Current ratio | ROJO | 0 | 0 (0,00 %) | 0 | 0 | AC/PC no normalizados | Activo corriente/pasivo corriente |
| Quick ratio | ROJO | 0 | 0 (0,00 %) | 0 | 0 | Faltan AC/PC/prepagos | (AC−inventarios−prepagos)/PC |
| Cash ratio | ROJO | 0 | 0 (0,00 %) | 0 | 0 | Falta PC, no basta deuda CP | Efectivo/PC |

La columna verde de muestra acredita únicamente los controles técnicos descritos, no una auditoría contable completa ni que la caja esté libre de restricciones. No se transforma EBITDA negativo en un ratio interpretable de deuda/EBITDA. CAPEX con convención no conciliada queda pendiente aunque pueda existir FCF calculado previamente. La precisión de comparación de la muestra utiliza la tolerancia de redondeo DECIMAL(24,4) del importador existente, no un umbral financiero.

| Indicador | US / 8.017 | JP / 3.581 | TW / 1.596 — bloqueado por procedencia |
|---|---|---|---|
| Ingresos | 5091 (63,50 %) | 3444 (96,17 %) | 285 (17,86 %) |
| EBITDA | 3972 (49,54 %) | 3398 (94,89 %) | 291 (18,23 %) |
| EBIT | 4848 (60,47 %) | 3382 (94,44 %) | 283 (17,73 %) |
| Activos totales | 5878 (73,32 %) | 3493 (97,54 %) | 294 (18,42 %) |
| Efectivo | 5498 (68,58 %) | 3493 (97,54 %) | 294 (18,42 %) |
| Deuda financiera CP+LP | 2193 (27,35 %) | 2312 (64,56 %) | 249 (15,60 %) |
| Deuda neta | 2187 (27,28 %) | 2312 (64,56 %) | 249 (15,60 %) |
| Patrimonio neto contable | 5678 (70,82 %) | 3492 (97,51 %) | 294 (18,42 %) |
| CFO | 5846 (72,92 %) | 3494 (97,57 %) | 289 (18,11 %) |
| CAPEX | 4812 (60,02 %) | 3360 (93,83 %) | 281 (17,61 %) |
| FCF | 4795 (59,81 %) | 3347 (93,47 %) | 281 (17,61 %) |
| Cobertura intereses | 3121 (38,93 %) | 3083 (86,09 %) | 258 (16,17 %) |
| Deuda neta/EBITDA | 1274 (15,89 %) | 2233 (62,36 %) | 236 (14,79 %) |
| Current ratio | 0 (0,00 %) | 0 (0,00 %) | 0 (0,00 %) |
| Quick ratio | 0 (0,00 %) | 0 (0,00 %) | 0 (0,00 %) |
| Cash ratio | 0 (0,00 %) | 0 (0,00 %) | 0 (0,00 %) |

TW: las empresas con publicación admisible coinciden con el grupo EDINET/Tokyo/TWD bloqueado. **No presentar esas columnas como cifras fiables de empresas de Taiwán.** FINMIND aporta números anuales a la población almacenada, pero sin publicación histórica acreditada. En ninguna columna se convierte una moneda por el país del emisor.

Problemas y solución: deuda requiere ambos componentes y definición de arrendamientos; intereses requieren gasto/periodo coherente; activos y caja requieren saldos, no movimientos; FCF requiere signo/definición; todos requieren procedencia/periodo/moneda/escala. Solución inicial: recuperar evidencia y reutilizar normalización/KPI existentes con validaciones, sin cambiar datos históricos. **Current/quick/cash ratio necesitan desarrollo adicional de extracción/mapeo de AC, PC y prepagos:** no existen columnas VIV, conceptos estándar o KPI guardados suficientes, ni se encontraron las etiquetas exactas inspeccionadas en las partidas del barrido. Eso no afirma que no aparezcan en los documentos originales.

## Cobertura temporal por empresa y ejercicio

Los porcentajes usan todas las empresas registradas del país en cada fila, incluidas las sin informe. Son disponibilidad de un ejercicio, no cobertura continua. Los trimestrales/semestrales no entran; 2026 está separado y no representa un año completo para todo el universo.

### US: denominador 8017 empresas registradas en cada ejercicio

| Ejercicio de cierre | Con informe anual | Con publicación admisible | Ingresos | EBITDA | Deuda CP+LP | Efectivo | CFO | Activos | Tamaño básico mismo informe |
|---|---|---|---|---|---|---|---|---|---|
| 2022 | 5256 (65,56 %) | 5256 (65,56 %) | 4337 (54,10 %) | 3359 (41,90 %) | 1359 (16,95 %) | 4749 (59,24 %) | 5154 (64,29 %) | 5067 (63,20 %) | 2991 (37,31 %) |
| 2023 | 5529 (68,97 %) | 5529 (68,97 %) | 4629 (57,74 %) | 3598 (44,88 %) | 1563 (19,50 %) | 4972 (62,02 %) | 5425 (67,67 %) | 5342 (66,63 %) | 3232 (40,31 %) |
| 2024 | 5666 (70,67 %) | 5666 (70,67 %) | 4746 (59,20 %) | 3721 (46,41 %) | 1597 (19,92 %) | 5142 (64,14 %) | 5561 (69,37 %) | 5585 (69,66 %) | 3397 (42,37 %) |
| 2025 | 5632 (70,25 %) | 5632 (70,25 %) | 4648 (57,98 %) | 3643 (45,44 %) | 1637 (20,42 %) | 5090 (63,49 %) | 5523 (68,89 %) | 5575 (69,54 %) | 3332 (41,56 %) |
| 2026 | 476 (5,94 %) | 476 (5,94 %) | 440 (5,49 %) | 416 (5,19 %) | 208 (2,59 %) | 466 (5,81 %) | 466 (5,81 %) | 469 (5,85 %) | 394 (4,91 %) |

### JP: denominador 3581 empresas registradas en cada ejercicio

| Ejercicio de cierre | Con informe anual | Con publicación admisible | Ingresos | EBITDA | Deuda CP+LP | Efectivo | CFO | Activos | Tamaño básico mismo informe |
|---|---|---|---|---|---|---|---|---|---|
| 2022 | 3424 (95,62 %) | 3424 (95,62 %) | 3361 (93,86 %) | 3273 (91,40 %) | 1621 (45,27 %) | 3416 (95,39 %) | 3420 (95,50 %) | 3416 (95,39 %) | 3236 (90,37 %) |
| 2023 | 3419 (95,48 %) | 3419 (95,48 %) | 3202 (89,42 %) | 3299 (92,13 %) | 1956 (54,62 %) | 3415 (95,36 %) | 3391 (94,69 %) | 3415 (95,36 %) | 3146 (87,85 %) |
| 2024 | 3250 (90,76 %) | 3250 (90,76 %) | 3032 (84,67 %) | 3140 (87,69 %) | 1932 (53,95 %) | 3246 (90,65 %) | 3221 (89,95 %) | 3246 (90,65 %) | 2985 (83,36 %) |
| 2025 | 2790 (77,91 %) | 2790 (77,91 %) | 2575 (71,91 %) | 2693 (75,20 %) | 1952 (54,51 %) | 2787 (77,83 %) | 2762 (77,13 %) | 2787 (77,83 %) | 2540 (70,93 %) |
| 2026 | 1836 (51,27 %) | 1836 (51,27 %) | 1668 (46,58 %) | 1715 (47,89 %) | 1426 (39,82 %) | 1836 (51,27 %) | 1811 (50,57 %) | 1836 (51,27 %) | 1598 (44,62 %) |

### TW: denominador 1596 empresas registradas en cada ejercicio

| Ejercicio de cierre | Con informe anual | Con publicación admisible | Ingresos | EBITDA | Deuda CP+LP | Efectivo | CFO | Activos | Tamaño básico mismo informe |
|---|---|---|---|---|---|---|---|---|---|
| 2022 | 899 (56,33 %) | 85 (5,33 %) | 82 (5,14 %) | 85 (5,33 %) | 66 (4,14 %) | 85 (5,33 %) | 84 (5,26 %) | 85 (5,33 %) | 82 (5,14 %) |
| 2023 | 1094 (68,55 %) | 292 (18,30 %) | 281 (17,61 %) | 288 (18,05 %) | 221 (13,85 %) | 292 (18,30 %) | 287 (17,98 %) | 292 (18,30 %) | 279 (17,48 %) |
| 2024 | 1097 (68,73 %) | 293 (18,36 %) | 282 (17,67 %) | 287 (17,98 %) | 225 (14,10 %) | 293 (18,36 %) | 288 (18,05 %) | 293 (18,36 %) | 278 (17,42 %) |
| 2025 | 1098 (68,80 %) | 294 (18,42 %) | 283 (17,73 %) | 288 (18,05 %) | 219 (13,72 %) | 294 (18,42 %) | 288 (18,05 %) | 294 (18,42 %) | 279 (17,48 %) |
| 2026 | 209 (13,10 %) | 209 (13,10 %) | 202 (12,66 %) | 202 (12,66 %) | 164 (10,28 %) | 209 (13,10 %) | 205 (12,84 %) | 209 (13,10 %) | 196 (12,28 %) |


En 2022–2025, **5.102** empresas tienen tamaño básico numérico en los cuatro ejercicios; solo **918** tienen además un contexto identificable de base común en los cuatro años. Para tamaño ampliado (añade EBIT, deuda, caja y patrimonio): **1.915** numéricas / **80** con contexto común. Para liquidez parcial: **1.198** / **42**. Esto tampoco coteja todos los importes con fuente ni demuestra suficiencia estadística. Ninguna tiene el conjunto de ratios de circulante completo con los insumos actuales.

## VIV: campos presentes no equivalen a datos conciliados

La última VIV aparece en 27.826 informes de la población, de los cuales 27.822 tienen fecha distinta. Presencia no NULL en esa última versión, sin certificar su vigencia:

| Columna VIV | Informes con valor |
|---|---|
| ingresos | 27.534 |
| ebitda | 27.412 |
| ebit | 27.528 |
| activos_totales | 27.807 |
| efectivo | 27.784 |
| deuda_corto_plazo | 26.484 |
| deuda_largo_plazo | 26.698 |
| deuda_total | 26.832 |
| deuda_neta | 26.823 |
| patrimonio_neto | 27.790 |
| flujo_caja_operativo | 27.798 |
| capex | 27.488 |
| fcf | 27.487 |
| cobertura_intereses | 25.763 |
| acciones_en_circulacion | 26.974 |
| gasto_intereses | 25.981 |

No utilizar estos números para aumentar la cobertura PCV ni pasar moneda/acciones al módulo sin reconciliar. La calificación ALTA de la fila no repara fechas, dilución, escala o identidad.

## Liquidez bursátil: clasificación A/B/C/D

A=almacenado en MySQL; B=derivable de datos suficientes existentes; C=requiere fuente externa autorizada; D=no disponible actualmente. Una variable puede ser A parcial y requerir C para completar lo perdido.

| Variable | Situación | Color | Disponibilidad real | Desarrollo adicional |
|---|---|---|---|---|
| Precio, fecha, instrumento | A parcial; C para histórico | AMARILLO | 8.241 filas/8.241 instrumentos; una fecha por instrumento, fecha-precio no conciliada | Conservar diario, fuente/feed y semántica del cierre |
| Moneda de negociación | A parcial | AMARILLO | instrumento.moneda existe; 299 TW/Tokyo/TWD requieren identidad y mercado | Conciliar instrumento/clase/feed; no inferir FX |
| Volumen en acciones | C + D actual | ROJO | 0 columnas/KPI de volumen en la estructura y datos tipificados examinados | Capturar volumen oficial con unidad y calendario |
| Volumen monetario | C + D actual | ROJO | No está almacenado; no derivable de un cierre aislado | Priorizar importe transado; cierre×volumen es aproximación, no dato observado |
| Retorno diario ajustado | C + D actual | ROJO | No hay serie por instrumento | Histórico y reglas de splits/dividendos coherentes |
| Free float | C + D actual | ROJO | Sin número/fracción libre fechada y conciliada | Fuente por clase y fecha; acciones totales no son free float |
| Bid-ask spread | C + D actual | ROJO | Sin bid/ask simultáneos | Solo cotizaciones verificadas; no proxy de cierre |
| Turnover | D; B solo tras nuevos insumos | ROJO | Faltan volumen y denominador de acciones/free float fechado | Definir tipo de turnover y universo |
| Número de sesiones negociadas / días sin negociación | D | ROJO | 104 fechas globales no prueban sesiones por instrumento | Calendario oficial y cero negociado confirmado, separado de dato ausente |
| Acciones corporativas | A parcial | AMARILLO | 20 splits/20 instrumentos; no cobertura integral ni precio ajustado acreditado | Conciliar ratios/fechas/clases, sin backfill inferido |
| Amihud | D | ROJO | 0 series actualmente suficientes en el almacén canónico | Requiere retornos e importe positivo diario, moneda/calendario comunes |

La fórmula futura sería media(|r diario|/importe monetario diario) sobre sesiones válidas. No se calculó Amihud ni una prima. Si se estima importe como precio×volumen en acciones, debe etiquetarse como **aproximado** y validar ambos insumos en la misma sesión/base. VWAP×volumen solo mejora la estimación si ambos campos cubren exactamente las mismas operaciones y filtros; tampoco se da por observado sin comprobarlo. Precios ajustados con volúmenes sin ajustar pueden producir otra incoherencia.

## Capitalización bursátil

Precio/fecha en cotizacion_diaria; acciones en PCV ACCIONES_EN_CIRCULACION y VIV.acciones_en_circulacion; fecha de referencia contable en IF y, cuando existe, fecha del hecho en evidencia; moneda en instrumento/VIV y evidencia. No hay clase de acción, base de acciones propias o conciliación universal de splits en columnas del instrumento. La etiqueta ACCIONES_EN_CIRCULACION incluye en la ruta JP una extracción de **acciones emitidas totales** (shareDefinition=TOTAL_ISSUED_SHARES_AT_FISCAL_YEAR_END); no se puede asumir que excluye autocartera.

| País | Pareja numérica precio+acciones (parcial) | Sin pareja admisible | Acciones publicadas antes del precio y moneda contextual compatible | Fecha de cierre de acciones exactamente igual al precio | Capitalización integral acreditada automáticamente |
|---|---|---|---|---|---|
| US | 3496 (43,61 %) | 4521 (56,39 %) | 1653 | 0 | 0 |
| JP | 2480 (69,25 %) | 1101 (30,75 %) | 285 | 0 | 0 |
| TW | 293 (18,36 %) | 1303 (81,64 %) | 0 | 0 | 0 |

Total: **6.269 parejas parciales** y **6.925 sin pareja admisible** bajo el filtro utilizado. No se ha multiplicado ninguna pareja para publicarla como capitalización fiable. “0 acreditadas automáticamente” no prueba que ninguna empresa pueda obtener una capitalización tras revisión individual: significa que no se demuestra la conciliación completa de emisor, clase, acciones efectivamente en circulación, autocartera, fecha, moneda y splits. Las 293 parejas TW parciales están además bloqueadas por identidad/procedencia. Patrimonio contable y acciones diluidas no sustituyen a capitalización observada. VIV solo puede aportar una candidata si coincide fecha con IF; no se corrige el desplazamiento de un día silenciosamente.

## Tamaño, familias y comparables

Existen 46 sectores y seis bolsas, pero no subsector normalizado. **10.431 empresas** tienen sector base N/A. Reutilizando la clasificación aceptada HIGH disponible a fecha de corte, quedan **10.001** con sector efectivo N/A (75,80 %). La familia sigue INDETERMINADA en **10.949** empresas; no se fuerza el modelo general para resolverlas.

Se obtuvieron **84 grupos país×sector efectivo**; 65 tienen mapeo sectorial conocido. Para ingresos+EBITDA+activos en 2025 y contexto consolidado identificado, 32 de esos 65 tienen al menos dos empresas, 9 tienen una y 24 ninguna. Dos observaciones permiten una mediana aritmética, **no demuestran comparabilidad económica ni suficiencia de una prima**. No se calculan coeficientes ni primas por percentil. Los grupos N/A y modelos/actividades amplias requieren resolver clasificación; bancos/seguros van aparte.

| País | Sector efectivo | Registradas | Tamaño básico numérico 2025 con contexto consolidado | Precios (empresas) | Capitalización fiable / Amihud |
|---|---|---|---|---|---|
| JP | Construction | 68 | 42 | 46 | 0 / 0 |
| US | Biotechnology | 105 | 27 | 86 | 0 / 0 |
| US | Pharmaceuticals | 109 | 22 | 88 | 0 / 0 |
| JP | Electrical Equipment | 112 | 21 | 61 | 0 / 0 |
| JP | Retail | 203 | 20 | 149 | 0 / 0 |
| JP | Commercial Services & Supplies | 172 | 20 | 110 | 0 / 0 |
| JP | Food Products | 34 | 17 | 22 | 0 / 0 |
| US | Energy | 60 | 13 | 27 | 0 / 0 |
| JP | Machinery | 90 | 12 | 62 | 0 / 0 |
| US | Electrical Equipment | 38 | 12 | 26 | 0 / 0 |
| US | Semiconductors | 39 | 11 | 32 | 0 / 0 |
| US | Retail | 30 | 9 | 16 | 0 / 0 |
| JP | Textiles, Apparel & Luxury Goods | 19 | 9 | 11 | 0 / 0 |
| JP | Packaging | 15 | 9 | 13 | 0 / 0 |
| JP | Metals & Mining | 51 | 6 | 43 | 0 / 0 |
| JP | Consumer Products | 35 | 6 | 28 | 0 / 0 |
| US | Food Products | 18 | 6 | 13 | 0 / 0 |
| JP | Automobiles | 37 | 5 | 28 | 0 / 0 |
| US | Machinery | 25 | 5 | 17 | 0 / 0 |
| US | Professional Services | 10 | 5 | 7 | 0 / 0 |

Son conteos de candidatos para descripción, no listas de comparables ya homologadas. La evidencia JSON conserva los 84 grupos y sus conteos. No se suman cantidades monetarias USD/JPY/TWD ni se mezclan bases individuales/consolidadas. En bancos, aseguradoras y empresas sin clasificación resuelta se requiere metodología específica. El análisis **residual** de tamaño está ROJO para calibración actual: faltan capitalización conciliada, liquidez bursátil y retornos/factores compatibles, aunque existan ingresos/activos.

## Muestra de calidad cotejada, sin extrapolación

Selección deliberada de 20 empresas/informes por país, no aleatoria. Resultado de cotejar PCV con candidato, IDs, periodo, moneda/base y publicación documental:

| Indicador | US: 20 informes | JP: 20 informes | TW: 20 informes |
|---|---|---|---|
| Ingresos | 20 | 20 | 0 |
| EBITDA | 20 | 20 | 0 |
| EBIT | 20 | 20 | 0 |
| Activos totales | 20 | 20 | 0 |
| Efectivo | 18 | 20 | 0 |
| Deuda financiera CP+LP | 1 | 0 | 0 |
| Deuda neta | 1 | 0 | 0 |
| Patrimonio neto contable | 19 | 20 | 0 |
| CFO | 19 | 20 | 0 |
| CAPEX | 13 | 19 | 0 |
| FCF | 13 | 19 | 0 |
| Cobertura intereses | 4 | 14 | 0 |
| Deuda neta/EBITDA | 1 | 0 | 0 |
| Current ratio | 0 | 0 | 0 |
| Quick ratio | 0 | 0 | 0 |
| Cash ratio | 0 | 0 | 0 |

VERDE solo describe esas observaciones y controles. El resto no se considera inexistente ni inválido por no estar en la muestra, pero permanece sin certificación individual. El número poblacional de indicadores completamente certificados no se presenta como una estimación estadística. Las 20 observaciones TW muestreadas no superan la evidencia requerida.

## Viabilidad actual

- Liquidez financiera: **AMARILLO parcial**, ROJO para ratios sin AC/PC; GRIS donde el modelo no aplica.
- Liquidez bursátil/Amihud: **ROJO** en el almacén actual.
- Tamaño operativo descriptivo: **AMARILLO**, con observaciones VERDES de la muestra y grupos candidatos limitados.
- Capitalización y tamaño residual calibrable: **ROJO para uso automático fiable**, aunque haya parejas numéricas parciales.
- No existe ninguna prima nueva de liquidez o tamaño autorizada, positiva, negativa o cero por efecto de esta auditoría. Un dato desconocido sigue desconocido; no se registra como prima cero.

Las consultas y resultados estructurados se conservan en `../fase2/evidencias/`. `metadatos.json` contiene columnas, tipos, PK/FK, UNIQUE, índices, CHECK y DDL leídos. `cobertura_resumen.json` contiene los conteos completos por empresa/ejercicio/país/sector/bolsa; `comprobaciones_finales.json` incluye la muestra de calidad. Los registros `consultas_*.json` conservan SQL, parámetros de IDs, duración y resultado de cada lectura, sin credenciales.

## Distribución adicional por bolsa y familia

Bolsa **registrada** en instrumento (no se da por reconciliada con el país del emisor):

| Bolsa registrada | Instrumentos | Empresas distintas | Instrumentos con precio |
|---|---|---|---|
| NASDAQ Stock Market | 2548 | 2517 | 2545 |
| New York Stock Exchange | 1569 | 1547 | 1564 |
| NYSE American | 157 | 157 | 156 |
| Tokyo Stock Exchange | 2796 | 2783 | 2790 |
| Taiwan Stock Exchange | 1303 | 1287 | 1145 |
| Taipei Exchange | 44 | 44 | 41 |

Las empresas pueden tener varios instrumentos o bolsas; **no sumar empresas de distintas bolsas** como universo de emisores únicos. Tokyo incluye 299 instrumentos de 294 empresas TW denominados en TWD, que deben conciliarse y no clasificarse como observaciones japonesas válidas. No se usaron como una fuente externa ni se convirtieron monedas.

| Familia resuelta | US | JP | TW |
|---|---|---|---|
| FCFF | 361 | 804 | 505 |
| RESOURCE | 117 | 53 | 40 |
| PHARMA | 222 | 22 | 0 |
| BANK | 92 | 3 | 0 |
| INSURANCE | 23 | 3 | 0 |
| REIT | 0 | 0 | 0 |
| INDETERMINADA | 7202 | 2696 | 1051 |

La ausencia de REIT resueltos no prueba que no existan compañías inmobiliarias; Real Estate está pendiente de clasificación específica en el mapeo. Un sector amplio revisable tampoco equivale a una familia validada.

**Rentabilidad disponible:** los KPI reales incluyen 58.127 registros ROA, 57.796 ROE y márgenes bruto/EBIT/EBITDA/neto/FCF, guardados como PORCENTAJE. Son filas de informe de todos los periodos, no empresas únicas ni cifras de cobertura anual 2022–2026. No se convierten en controles residuales validados por estar presentes. Para usarlos deberán acreditarse insumos, periodo, base y escala, con bancos/aseguradoras tratados según modelo. Los conteos empresariales exhaustivos de los 16 indicadores principales se mantienen separados de este inventario adicional.

**Básico no significa suficiente para una prima:** las 7.377 empresas con ingresos/EBITDA/activos no tienen por ello liquidez bursátil o capitalización conciliada. Tras apartar las 283 del grupo TW bloqueado, quedan 7.094 candidatas numéricas US/JP, no empresas universalmente certificadas. El conjunto con liquidez financiera parcial pasa de 3.325 a 3.101 si se apartan las 224 TW afectadas. Ninguno de esos ajustes al universo es una modificación de datos o valoración.
