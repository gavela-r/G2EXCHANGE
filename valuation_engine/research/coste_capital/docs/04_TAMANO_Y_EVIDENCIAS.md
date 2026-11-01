# Efecto tamaño: evidencia y límites

Registro consultado el 29/10/2026. Las cifras retrospectivas de los artículos no se usan como parámetros. Se mantiene la clasificación 1–4 definida en el informe de liquidez.

## S1. Banz (1981)

**Autor:** Rolf W. Banz. **Título:** *The relationship between return and market value of common stocks*. **Publicación:** Journal of Financial Economics 9(1), 3–18. [DOI 10.1016/0304-405X(81)90018-0](https://doi.org/10.1016/0304-405X(81)90018-0). Encuentra retornos ajustados por riesgo mayores en pequeñas NYSE, concentrados en empresas muy pequeñas y no lineales respecto al tamaño. No identifica si tamaño es causa o proxy. El resumen editorial verifica un periodo de al menos cuarenta años; no se dispone aquí de réplica de su muestra original.

**Fórmula de uso local:** ninguna. Una regresión de retornos/control de beta no da un coeficiente universal de WACC por cada millón de capitalización. **Clasificación:** 2. **Mercado:** NYSE histórico; no autorización para US/JP/TW actuales ni empresas privadas. **Coeficientes adoptados:** ninguno. **Riesgo de extrapolación:** composición, microcaps, negociación y subperiodos. No prueba que medianas/grandes deban tener primas negativas.

## S2. Fama y French (1993)

**Autores:** Eugene F. Fama y Kenneth R. French. **Título:** *Common risk factors in the returns on stocks and bonds*. **Publicación:** Journal of Financial Economics 33(1), 3–56. [DOI 10.1016/0304-405X(93)90023-5](https://doi.org/10.1016/0304-405X(93)90023-5). Marco de factores de mercado, tamaño y valor para acciones, y de vencimiento/default para bonos. **Clasificación:** 1 como modelo de factores establecido; 2 para traducir SMB en coste de equity incremental de G2. **Mercado de origen:** EE. UU.; la validación local por fecha sigue pendiente.

**Representación de coste de equity esperado:** `Ke=Rf+b*E[MKT]+s*E[SMB]+h*E[HML]`. No se incluye alfa histórico automáticamente como rentabilidad exigida. **Coeficientes adoptados:** ninguno; b,s,h son exposiciones estimadas conjuntamente, no beta CAPM pegada a un suplemento de tamaño. La [descripción oficial de French](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_factors.html) define `SMB=(SmallValue+SmallNeutral+SmallGrowth)/3−(BigValue+BigNeutral+BigGrowth)/3`. El retorno SMB de un mes o su media histórica no es la prima de una empresa sin estimar exposición y expectativa.

**Inferencia para G2:** `s*λSMB` puede ser positivo o negativo en un modelo multifactorial validado. No se deriva el signo de ser grande. Comparar con un coste base sectorial requiere reconciliar también la exposición ya incluida, cambiar el modelo completo cuando corresponda y controlar liquidez/calidad. La serie de cierres actual no permite estimar estas exposiciones. V1 no implementa la regresión ni estima primas FF.

## S3. Asness y colaboradores (2018)

**Autores:** Clifford S. Asness, Andrea Frazzini, Ronen Israel, Tobias J. Moskowitz y Lasse H. Pedersen. **Título:** *Size matters, if you control your junk*. **Publicación:** Journal of Financial Economics 129(3), 479–509. [DOI 10.1016/j.jfineco.2018.05.006](https://doi.org/10.1016/j.jfineco.2018.05.006). [Descripción de los autores](https://www.aqr.com/insights/research/working-paper/size-matters-if-you-control-your-junk): el resultado de tamaño cambia al controlar calidad; revisan críticas de estabilidad, especificación y mercados. **Clasificación:** 2; réplica G2 futura sería 3. **Coeficientes adoptados:** ninguno.

La [explicación de Asness de 2015](https://www.aqr.com/insights/perspectives/quibble-fight) ilustra el working paper con EE. UU., julio 1957–diciembre 2012, antes de costes, usando exposiciones de muestra completa. No se atribuye ese gráfico a una calibración point-in-time de la publicación final de 2018 ni se exportan sus exposiciones a otras fechas. El artículo final incluye pruebas internacionales: no basta que un país esté representado para validar el coeficiente en una empresa concreta.

**Representación para diseño:** retornos/exposición tamaño condicionados a calidad, mercado y otros factores; no una tabla de tramos. **Aplicabilidad:** requiere datos comparables de rentabilidad/calidad e identificación temporal. **Límite:** una estrategia long-short con rebalanceo y costes no es directamente una tasa DCF de un emisor. No constituye una prima negativa automática para grandes ni positiva para pequeñas.

## S4. Damodaran: primas adicionales

**Autor:** Aswath Damodaran. **Título/recurso:** *Damodaran on Valuation, Discount Rates*, material docente de la segunda edición (2006). [Original, sección Small Firm and Other Premiums](https://pages.stern.nyu.edu/~adamodar/pdfiles/ovhds/dam2ed/discountrates.pdf). Cuestiona suplementos arbitrarios y propone identificar los riesgos subyacentes, como actividad y apalancamiento operativo. **Clasificación:** 1 para esa exigencia de coherencia; 4 para una regla automática que ignore causalidad. **Fórmula/coficientes locales:** ninguno.

## S5. Literatura profesional sobre size premium

**Entidad:** Kroll. **Recurso:** *Cost of Capital Glossary*, página profesional sin año editorial especificado, consultada en 2026. [Fuente oficial](https://www.kroll.com/en/tools-and-platforms/cost-of-capital/cost-of-capital-glossary). Define size premium a partir de la diferencia histórica entre exceso de retorno observado y predicho por beta atribuida al tamaño. No es prueba causal ni coeficiente disponible para nuestro mercado. **Clasificación:** 2 para estimaciones profesionales condicionadas a su metodología; 4 para copiar tablas sin datos, licencia y validación. No se usa Cost of Capital Navigator ni ningún producto de pago. **Coeficientes:** ninguno.

## Diseño propuesto para aislar tamaño residual

Esto es una propuesta propia para validación futura, no una réplica ya ejecutada:

1. Definir universo histórico por sector/modelo, región/país, bolsa y régimen de información. Mantener variación de tamaño dentro del universo; evitar truncarlo a compañías de capitalización casi idéntica.
2. Construir variables disponibles en cada fecha: log(capitalización verificada), liquidez bursátil, beta coherente, apalancamiento, rentabilidad/calidad, volatilidad operativa y exposiciones geográficas. Activos/ingresos son alternativas descriptivas de escala, no sustitutos mecánicos de capitalización.
3. Estimar conjuntamente exposición/retorno con controles. Una posible especificación de investigación: `r(i,t+1)−Rf(t+1)=a(t)+bS(t)*log(ME(i,t))+bL(t)*ILLIQ(i,t)+γ(t)'X(i,t)+ε(i,t+1)`. Otra es residualizar log(ME) frente a los controles y estudiar el residual. Especificación, errores, colinealidad, causalidad y prima esperada requieren validación; ninguna ecuación está implementada como prima.
4. Analizar cambios de signo/estabilidad por subperiodo/mercado, sesgos de selección, supervivencia, delistings y costes; separar significación estadística de utilidad económica. No fijar un corte universal de observaciones o significación para conceder primas.
5. Reconciliar efecto marginal con el modelo base. Si no se identifica una exposición residual remunerada, devolver `NO_ESTIMABLE`, o `YA_INCORPORADO` solo con evidencia de cobertura completa del riesgo concreto. No usar cero para ocultar desconocimiento.

La valoración grande/sólida puede presentar ventajas en ratios y negociación, pero **tamaño aislado tiene dirección de riesgo DESCONOCIDO**. El programa presenta importe, diferencia y posición relativa, sin convertirlos en penalización o bonificación. Beneficios por acceso al crédito ya reflejados en spread/rating no generan otra prima de tamaño. Un descuento de falta de comerciabilidad requiere una participación y restricción reales, no una etiqueta de empresa pequeña.

No existe, con los datos y calibraciones auditados, una magnitud positiva o negativa de prima de tamaño que este módulo pueda autorizar hoy.
