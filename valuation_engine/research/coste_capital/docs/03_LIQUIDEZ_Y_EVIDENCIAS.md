# Liquidez: metodología y registro de evidencias

Consulta bibliográfica pública: 29/10/2026. No se han descargado bases de pago ni importado coeficientes al programa. Clasificación: **1 Consolidada**, **2 Evidencia empírica discutida**, **3 Experimental**, **4 Sin respaldo suficiente**. La consolidación de un indicador no valida una regla de conversión de ese indicador en puntos básicos.

## Cuatro objetos separados

| Objeto | Qué se observa | Tratamiento que se debe estudiar | Restricción |
|---|---|---|---|
| Liquidez financiera | Capacidad de atender pagos, caja disponible, circulante, CFO/FCF | Previsiones de caja, financiación, escenarios; Kd cuando quede riesgo incremental | Caja no implica reducción automática de Ke/WACC; comprobar su inclusión en equity |
| Liquidez bursátil | Coste y facilidad de negociar acciones; nivel y covariación con liquidez del mercado | Ke si existe un modelo aplicable de retornos exigidos y baseline conciliado | Volumen, spread y Amihud son diagnósticos; no primas por sí solos |
| Insolvencia/refinanciación | Cobertura, vencimientos, líneas, probabilidad y pérdidas en escenarios | Spread marginal de deuda, escenarios de distress o pérdidas esperadas coherentes | No repetir el mismo distress en flujos y tasas; rating actual ya recoge parte |
| Falta de comerciabilidad | Restricción de vender una participación concreta, plazo y derechos | Valor de esa participación o modelo explícito de coste de transacción | No aplicar un descuento genérico a toda empresa cotizada ni sumar descuento y prima por idéntico riesgo |

## L1. Amihud (2002)

**Autor:** Yakov Amihud. **Título:** *Illiquidity and stock returns: cross-section and time-series effects*. **Publicación:** Journal of Financial Markets 5(1), 31–56. **DOI:** [10.1016/S1386-4181(01)00024-6](https://doi.org/10.1016/S1386-4181(01)00024-6). El artículo documenta asociación entre iliquidez y retornos y mayor sensibilidad de acciones pequeñas. La versión de trabajo del autor estudia NYSE 1963–1997; no se adopta su periodo como calibración actual. [Versión del autor, agosto 2000](https://w4.stern.nyu.edu/finance/docs/WP/2000/pdf/wpa00041.pdf).

**Fórmula implementada del indicador:**

`ILLIQ_i,P = (1/N_i,P) Σ_d |r_i,d| / V_i,d`

`r`: retorno diario decimal ajustado y validado. `V`: importe negociado positivo en unidades monetarias. `N`: sesiones válidas con importe positivo, explícito en el resultado. No se divide por volumen en acciones. No hay factor de escala oculto. [NYU V-Lab](https://vlab.stern.nyu.edu/docs/liquidity/ILLIQ-HIST) documenta la misma razón y utiliza otro escalado; por tanto sus números no se comparan directamente sin normalizar.

**Clasificación:** 1 como indicador; 2 para extrapolar su relación de retornos. **Coeficiente de prima adoptado:** ninguno. **Aplicabilidad local:** función operativa para una serie externa validada; tablas actuales no aportan volumen ni serie diaria suficiente. **Límites:** moneda, ajustes corporativos, ceros negociados, cobertura, microestructura y ventana; precio de cierre×volumen no es necesariamente importe transado. El código exige importe explícito. Las sesiones de volumen monetario cero confirmado se excluyen de Amihud y permanecen en el calendario. Esa convención no reproduce todos los filtros muestrales del artículo ni estima su regresión.

**Inferencia para G2:** una diferencia Amihud sirve para diagnosticar mayor/menor iliquidez. Su magnitud no está expresada en rentabilidad anual y no se puede sumar a Ke ni WACC.

## L2. Acharya y Pedersen (2005)

**Autores:** Viral V. Acharya y Lasse Heje Pedersen. **Título:** *Asset pricing with liquidity risk*. **Publicación:** Journal of Financial Economics 77(2), 375–410. **DOI:** [10.1016/j.jfineco.2004.06.007](https://doi.org/10.1016/j.jfineco.2004.06.007). Modelo de equilibrio con rentabilidad neta del coste de iliquidez. La sensibilidad al mercado y a su liquidez se representa mediante covarianzas. [Descripción de los autores](https://www.aqr.com/Insights/Research/Journal-Article/Asset-Pricing-With-Liquidity-Risk): NYSE/AMEX 1963–1999; reconocen límites empíricos al separar canales y al explicar book-to-market.

**Representación de la ecuación, no implementada:**

`E[r_i]−Rf = E[c_i] + λ × Cov(r_i−c_i, r_M−c_M) / Var(r_M−c_M)`

`λ = E[r_M−c_M]−Rf`; `c` es coste de negociación proporcional, en el mismo periodo que los retornos. Descomposición de beta neta:

`βnet = β1 + β2 − β3 − β4`, donde el numerador de cada beta es, respectivamente, `Cov(r_i,r_M)`, `Cov(c_i,c_M)`, `Cov(r_i,c_M)`, `Cov(c_i,r_M)` y el denominador común `Var(r_M−c_M)`. [Texto del artículo alojado por el autor](https://docs.lhpedersen.com/liquidity_risk.pdf).

**Clasificación:** 1 como marco teórico; 2 para traslación empírica al coste de capital de un emisor. **Coeficientes adoptados:** ninguno; λ, costes esperados y covarianzas deben estimarse juntos con datos compatibles. **Datos faltantes en G2:** panel de retornos ajustados, costes/liquidez de acciones y mercado, horizonte, composición del mercado y referencia temporal. ILLIQ no es automáticamente `c`.

**Inferencia para G2:** el modelo admite diferencias positivas o negativas de rentabilidad respecto a una referencia valorada con la misma ecuación. No justifica restar una prima de nivel de liquidez a un CAPM cuya tasa no la contiene. Sustituir su beta neta/λ por beta sectorial/ERP total sin reconciliación sería otra metodología. No se implementa ni calibra LCAPM en v1.

## L3. Damodaran (2005): comerciabilidad

**Autor:** Aswath Damodaran. **Título:** *Marketability and Value: Measuring the Illiquidity Discount*. **Publicación:** trabajo de Stern School of Business, julio 2005; no atribuir revista ni DOI inexistente. [Documento original](https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/liquidity.pdf). Distingue instrumentos, restricciones e inversores; discute evidencia de acciones restringidas, negociación y aproximaciones de valoración.

**Representación para diseño:** `V_participacion = V_sin_restriccion − PV(costes incrementales de negociación/restricción)`, o `DLOM=1−V_restringido/V_sin_restriccion` si el modelo de ambos valores está identificado. Estas identidades no estiman por sí mismas el descuento. **Clasificación:** 2 para estimaciones empíricas; 3 para una adaptación pendiente al proyecto. **Coeficientes adoptados:** ninguno. Falta duración de restricción, titularidad, derechos, horizonte y costes de negociación. No se importan regresiones históricas ni porcentajes estándar. La menor restricción solo permite recuperar parte de un descuento previamente incluido y conciliado, no crear una bonificación gratuita.

## L4. Damodaran (2016): ubicación del riesgo

**Autor:** Aswath Damodaran. **Título:** *The Cost of Capital: The Swiss Army Knife of Finance*. **Publicación:** trabajo metodológico Stern, abril 2016. [Original](https://pages.stern.nyu.edu/adamodar/pdfiles/papers/costofcapital.pdf). Diferencia riesgo de mercado, riesgos específicos que afectan flujos y acontecimientos discretos que pueden modelarse con probabilidades y consecuencias de valor. **Clasificación:** 1 como principio de coherencia de valoración, no una fórmula de prima. **Aplicación propuesta:** elegir un canal financiero y documentar cualquier tratamiento simultáneo. Ningún coeficiente de ese trabajo está codificado.

## Reglas operativas de v1

Ratios con denominador cero/negativo no interpretable, ausencia de datos, moneda o fechas incompatibles devuelven valor `null`. Un interés inexistente no se transforma en 999 veces de cobertura. Una caja neta positiva/negativa es un saldo, no una autorización de prima. Los ratios de circulante no se aplican automáticamente a bancos y aseguradoras.

No se ha implementado una previsión de financiación, calendario de vencimientos, modelo de insolvencia o DLOM. Sus indicadores explican por qué no se estiman. Sí se han implementado ratios y medidas bursátiles descritos en README, validaciones y comparación con medianas; esto requiere entradas válidas, no nuevos recuperadores.

Una futura cuantificación exige: evidencia del canal adicional, modelo replicado y validado en mercado/periodo/horizonte pertinentes, estimación e incertidumbre de coeficientes, control de tamaño/calidad, prueba fuera de muestra, baseline compatible, ausencia de duplicidad y aprobación versionada. No hay reglas de percentil→pb. La función de simulación es únicamente una comprobación matemática hipotética.
