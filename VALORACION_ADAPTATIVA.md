# Valoración adaptativa (01/11/2026)

Sistema que valora empresas reales con las 16 plantillas sectoriales a partir de los históricos acreditados disponibles, en lugar de exigir el 100 % de las celdas. Las fórmulas de las plantillas no cambian: la proyección automática se traduce a los impulsores de cada plantilla.

## 1. Piezas
| Pieza | Archivo | Función |
|---|---|---|
| Motor de proyección | `sectorial/app/proyeccion.cjs` | Tendencias, años atípicos, escenarios y reversión. Funciones puras. |
| Preparación | `sectorial/app/adaptativo.cjs` | Configura el flujo en modo `ADAPTATIVO`: apertura, otras partidas, cohortes, fiscalidad, capital e impulsores. |
| Flujo | `sectorial/app/workflow.cjs` (`modo:'ADAPTATIVO'`) | Admite 2–4 ejercicios; huecos no críticos como avisos; `NO_APLICABLE`; resultado `provisional`. |
| Adaptador | `sectorial/app/adapter.cjs` | Componentes, ausencias acreditadas, derivaciones trazables, clasificación por código oficial. |
| Excel | `exporter-portable.mjs` | Rótulo «VALORACIÓN PROVISIONAL» y hoja `S_Proyeccion` (técnica, años, pesos, atípicos, confianza, origen de cada hipótesis). |
| API | `GET /api/sectorial/companies/:id/adaptive?asOf=` | Preparación calculada en el servidor (bloqueos, configuración, trazabilidad). `POST …/evaluate` admite `modo`. |
| Herramientas | `npm run sectorial:historicos`, `sectorial:backtest`, `sectorial:cobertura:adaptativa`, `sectorial:valorar:adaptativo` | Extracto reproducible, validación retrospectiva, cobertura y ejecución real con Excel. |

## 2. Origen de cada cifra
`DATO_CERTIFICADO` (evidencia primaria) · `DATO_DERIVADO` (suma o diferencia de certificados, con la regla y los registros) · `NO_APLICABLE` (el documento original no presenta la partida: evidencia `NOT_PRESENTED`) · `INCLUIDO_EN_OTRAS_PARTIDAS` (no consta por separado; está dentro del total certificado) · `ESTIMACION_AUTOMATICA` · `POLITICA_EXPLICITA` · `REFERENCIA_MERCADO`. Un histórico ausente nunca se rellena: queda vacío. Una proyección nunca se presenta como dato.

## 3. Reglas del motor de proyección
- Sólo se usan tramos consecutivos de históricos acreditados.
  - Con 3 o más ejercicios hay tendencia propia.
  - Con 2, el análisis es condicionado (se mezcla con la referencia sectorial y se marca `TENDENCIA_NO_ROBUSTA`).
  - Con 1 no hay tendencia propia: se usa la referencia sectorial, calculada con datos del mismo período.
- **Años atípicos.** Se detectan dejando uno fuera: desviación respecto de la evolución del resto mayor que max(25 %, 4 × dispersión robusta).
  - Se califican siempre como `POSIBLE_EXTRAORDINARIO`, `POSIBLE_EXTRAORDINARIO_O_CAMBIO_DE_NIVEL` o `POSIBLE_CAMBIO_RECIENTE`.
  - Sólo pasan a `EXTRAORDINARIO_DOCUMENTADO` con fuente del analista.
  - Nunca se atribuyen a un acontecimiento por coincidencia temporal.
  - Los originales no se modifican: el ajuste es un peso 0 y se conservan la estimación ajustada y la sin ajustar.
- **Patrones:** crecimiento o decrecimiento sostenido, estable, aceleración, desaceleración, recuperación, salto inicial y estabilidad, alta volatilidad, divergencia con el sector.
- **Ingresos:** media ponderada reciente de las variaciones; mediana encogida hacia el sector si hay alta volatilidad. Con un posible atípico no se extrapola tendencia propia (regla validada, §5). Reversión gradual hacia el 2,5 % (φ 0,5 / 0,6 / 0,7).
- **Márgenes, CapEx sobre ingresos y días de circulante:** se proyectan como niveles, no con la tasa de los ingresos. Parten del último valor con reversión lenta (φ 0,85 / 0,9 / 0,95).
- **Escenarios** conservador, central y optimista: ± dispersión robusta.

## 4. Configuración automática (por empresa)
- **Apertura:** puente provisional con el último balance anual auditado publicado. Se declara que no incorpora los flujos del período transcurrido (la traza indica los meses).
  - **Tesorería del puente** = efectivo + valores negociables. Antes, el motor sólo sumaba caja al valor del accionista.
  - **Arrendamientos:** en US GAAP los operativos son gasto operativo y su pasivo va a otras partidas; en NIIF 16, financiación.
- **Otras partidas** = total acreditado − partidas modelizadas, con impulsor de saldo constante. Si la suma de las partidas modelizadas supera el total, la empresa se bloquea.
- **Cohortes:** inmovilizado material, intangibles, fondo de comercio y derecho de uso (NIIF) con el neto acreditado. La vida remanente implícita es (inmovilizado + intangibles) / D&A, acotada a [2, 40] años. El CapEx de cada año = ingresos × CapEx/ingresos proyectado.
- **Capital:** bono a 10 años y prima de mercado del país (`pais`, Damodaran), beta del sector (`sector.sensibilidad_al_mercado`; sector representativo de la plantilla si el de la empresa es «N/A») y último precio ≤ fecha de valoración (`cotizacion_diaria`).
  - Coste de la deuda = intereses / deuda media, acotado a [rf, rf + 6 %].
  - Peso del patrimonio a valor de mercado.
  - Tipo impositivo efectivo histórico o, si no, el legal.
- **Políticas explícitas:** deuda constante, sin pérdidas fiscales de apertura (0, conservador), crecimiento terminal 1,5 / 2,0 / 2,5 %, ROIC terminal acotado a [WACC + 1 %, 30 %].
- **Impulsores de ingresos:** representación agregada que reproduce la senda proyectada (unidades monetarias, sin datos operativos). Se declara en `S_Proyeccion`.
- **Plantillas sin proyección automática (con causa):**
  - 8/9: liquidación y reservas;
  - 13/14: expediente prudencial no disponible;
  - 15: AFFO/NAV con tasación externa.

## 5. Validación retrospectiva (sin información futura)
`npm run sectorial:backtest -- <historicos.json> <salida.json>`. Se predice el año T (2025 y 2024) sólo con ejercicios anteriores a T; la referencia sectorial usa sólo ejercicios ≤ T−1. Base: 133.580 predicciones con históricos acreditados de producción. Error mediano: ingresos en %, márgenes y CapEx en puntos porcentuales, días en días.

| Variable · historia | n | Último | Media | CAGR | Adaptativo | Mejor |
|---|---|---|---|---|---|---|
| ingresos · h=1 | 12605 | 9.29 | 9.29 | 9.29 | 8.31 | adaptativo |
| ingresos · h=2 | 10482 | 9.34 | 12.97 | 9.68 | 7.71 | adaptativo |
| ingresos · h=3 | 4146 | 9.43 | 16.73 | 9.58 | 7.32 | adaptativo |
| margenEbitda · h=1 | 8967 | 2.34 | 2.34 | 2.34 | 2.34 | último (empate) |
| margenEbitda · h=2 | 6963 | 2.49 | 2.98 | 3.68 | 2.53 | último |
| margenEbitda · h=3 | 2511 | 3.00 | 4.21 | 3.91 | 2.97 | adaptativo |
| margenEbit · h=2 | 9337 | 3.35 | 4.08 | 4.71 | 3.43 | último |
| margenEbit · h=3 | 3613 | 4.03 | 5.71 | 5.04 | 4.01 | adaptativo |
| capexSobreIngresos · h=3 | 2710 | 0.63 | 0.87 | 0.88 | 0.64 | último |
| diasCobro · h=3 | 2718 | 4.48 | 5.17 | 5.76 | 4.49 | último |
| diasInventario · h=3 | 1941 | 4.02 | 5.59 | 6.09 | 4.02 | empate |
| diasPago · h=3 | 2502 | 3.29 | 3.89 | 4.68 | 3.25 | adaptativo |

**Conclusiones:**
- **Ingresos: el método adaptativo mejora de forma consistente.**
  - Fuera de muestra en los dos años objetivo: T = 2025, 7,36 % frente a 8,94 % del último valor; T = 2024, 8,82 % frente a 10,04 %.
  - Mejora en 14 de 16 plantillas y en EE. UU. y Japón.
  - Pierde en automoción (7,23 % frente a 5,89 %) y, por poco, en petróleo y gas (13,29 % frente a 13,13 %).
- **Ratios: no hay mejora demostrada.** El último valor es el mejor predictor a un año, o empata.
  - La reversión rápida hacia la media (φ 0,6) añadía error y se sustituyó por una reversión lenta (φ elegido con T = 2024 y evaluado con T = 2025).
  - La reversión a 5 años de los ratios es una hipótesis: no puede validarse con 4 ejercicios.
- **Series con posible atípico** (1.172 casos): extrapolar cualquier tendencia propia empeoraba (25,2 % frente a 21,2 %). La regla validada (no extrapolar) da 20,9 %.
- Por tanto, el sistema **no** se declara más preciso en márgenes, CapEx ni días.

## 6. Cobertura real (13.194 empresas; extractos de producción en solo lectura)
Definición:
- cobertura histórica **aplicable** = (certificados + derivados) / aplicables, en los ejercicios consecutivos disponibles; lo `NO_APLICABLE` acreditado sale del denominador;
- críticos del último cierre: ingresos, EBIT, D&A, caja, deuda, arrendamientos, patrimonio, activo, pasivo, clientes, proveedores, inventario, inmovilizado y acciones;
- **candidata** = clasificación resuelta + plantilla con proyección automática + ≥ 85 % + críticos.

| | Antes | Después |
|---|---|---|
| Cobertura aplicable ≥ 85 % | 0 | **2.113** |
| — 100 % | 0 | 326 |
| — 90–99 % | 0 | 1.094 |
| — 85–89 % | 0 | 693 |
| Críticos suficientes | 0 | 461 |
| ≥ 85 % y críticos | 0 | 414 |
| Clasificación resuelta | 2.255 | 8.396 |
| Candidatas a valoración adaptativa | 0 | 367 |

Por país, después: US 2.113 / 367; **JP 0**: los componentes de EDINET requieren documentos XBRL que no están en local y la clave EDINET está comprometida; **TW 0**: sin fuente primaria.

## 7. Valoraciones ejecutadas realmente (producción, fecha de valoración 01/11/2026)
`npm run sectorial:valorar:adaptativo -- --ids-file <candidatas> --as-of 2026-11-01 --historicos <extracto>`. Una empresa sólo cuenta como valorada si el flujo calcula los tres escenarios **y** su Excel queda `VALIDADO` por la validación nativa de Microsoft Excel. Detalle por empresa (valores por escenario, precio de referencia, id de ejecución y archivo Excel) en `sectorial/app/coverage/valoraciones_adaptativas_20261101.json`.

| Resultado sobre las 367 candidatas | Empresas |
|---|---|
| **Valoradas con Excel validado** (valor central positivo) | **90** |
| Calculadas y con Excel validado, pero con valor central negativo: no utilizables sin hipótesis del analista | 13 |
| Bloqueadas por necesidad de financiación: la caja se vuelve negativa con deuda constante | 76 |
| Último informe anual publicado sin atestación (p. ej. NVIDIA FY2026, Microsoft FY2026) | 49 |
| Sin precio de referencia | 48 |
| Minoritarios o balance que no concilia (patrimonio temporal, NCI) | 73 |
| Ingresos o margen sin estimación defendible | 11 |
| Otras: perímetro solapado (2), moneda o ADR (3), historia no consecutiva (1), peso de patrimonio fuera de dominio (1) | 7 |

- Por plantilla, las 90 valoradas: 16 → 25, 02 → 16, 03 → 15, 12 → 15, 04 → 7, 06 → 5, 11 → 3, 05 → 2, 01 → 1, 07 → 1.
- Todas son de EE. UU.; 88 tienen 4 ejercicios y 2 tienen 3.
- **Ejemplos:** Apple, Arista Networks, Vertiv, Fortinet, Norfolk Southern, Northrop Grumman, Monolithic Power Systems, eBay, Edwards Lifesciences, MSCI, Fair Isaac, Incyte, Cognizant, PTC, Align Technology, Domino's Pizza, HubSpot, Qualys…
- **Lectura de los resultados.** La mediana de valor central / precio es 0,38 y sólo 14 empresas quedan por encima del precio. La descomposición (Apple: FCFF de 105–131 mil M$, WACC 10,6 %, EV 1,24 billones) muestra que no es un error de cálculo, sino el efecto de las hipótesis automáticas, deliberadamente conservadoras:
  - beta sectorial de la base (p. ej. «Technology» 1,354; «Semiconductors» 1,968), no específica de la empresa;
  - reversión del crecimiento al 2,5 % en cinco años;
  - ROIC terminal acotado.
- Son valoraciones **provisionales**: el Excel lo rotula y la API devuelve `provisional: true`; la vía sectorial no genera PDF y no recomendaciones. Requieren revisión del analista, sobre todo de beta, crecimiento y calendario.

## 8. Limitaciones que permanecen (dependencia exacta)
- **Japón** sin componentes: requiere documentos XBRL de EDINET; la clave está comprometida y no se reanudan recuperadores.
- **Taiwán** sin fuente primaria.
- **Banca y seguros** (13/14): requieren préstamos, depósitos, provisiones, capital regulatorio y pasivos de seguros, que no están en la taxonomía. Bloqueo conservado.
- **Último informe sin atestación** (49 candidatas, incluidas NVIDIA y Microsoft): requiere la recuperación SEC verificada de esos informes, que están en el volcado local del 29/10. No se ha ejecutado en esta fase.
- **Ausencia acreditada:** se basa en companyfacts, que no incluye extensiones propias del emisor. Si un concepto sólo se etiqueta con extensión propia, consta como «no presentado» (posible caso: arrendamientos operativos de ASML).
- **Puente de apertura** con el último balance auditado: no incorpora los meses transcurridos.
- **Pasivos no operativos** dentro de «otras partidas» (p. ej. pensiones) no se restan en el puente al accionista.
- **Minoritarios:** las empresas con participaciones no dominantes se bloquean, porque el puente no está implementado.
- Las plantillas 8/9/15 requieren hipótesis del analista (liquidación, reservas, tasación).
