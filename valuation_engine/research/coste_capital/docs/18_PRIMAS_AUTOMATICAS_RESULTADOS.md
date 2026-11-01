# Primas automáticas y conexión con Excel — ejecución del 30 de octubre de 2026

**Conexión automática implementada y probada. No existe todavía una prima real calibrada y aplicable. No se declara completada la estimación financiera de primas.** Con la información y métodos registrados actualmente, los ejemplos reales devuelven dos ajustes operativos del 0 %, con estimaciones nulas, estado NO_ESTIMABLE y motivos visibles. No se han registrado coeficientes inventados.

## Resultados reales

Fecha de ejecución: 2026-10-30T07:48:15.819Z. Destino: g2_capital_dev_20261029. Universo de esta comprobación: **tres empresas seleccionadas**, no las 13.194 empresas. Las muestras japonesas/taiwanesas no tienen ejecución congelada en esta copia ni informes financieros copiados; sus tasas/valor intrínseco no se rellenan por inferencia. El registro de metodologías de desarrollo contiene 0 métodos, 0 aprobados.

| Empresa / mercado | Liquidez calculada | Liquidez operativa | Estado liquidez | Tamaño calculado | Tamaño operativo | Estado tamaño | Fórmula aplicada | Fuente coeficientes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ADVANCED MICRO DEVICES INC / US | NO_ESTIMABLE | 0.000000 % | NO_ESTIMABLE | NO_ESTIMABLE | 0.000000 % | NO_ESTIMABLE | Ajuste operativo = 0; no se estima prima | No hay coeficientes autorizados |
| TOYOTA MOTOR CORPORATION / JP | NO_ESTIMABLE | 0.000000 % | NO_ESTIMABLE | NO_ESTIMABLE | 0.000000 % | NO_ESTIMABLE | Ajuste operativo = 0; no se estima prima | No hay coeficientes autorizados |
| GOGOLOOK / TW | NO_ESTIMABLE | 0.000000 % | NO_ESTIMABLE | NO_ESTIMABLE | 0.000000 % | NO_ESTIMABLE | Ajuste operativo = 0; no se estima prima | No hay coeficientes autorizados |

| Empresa | Ke base | Ke ajustado | WACC base | WACC ajustado | Valor original / acción | Valor ajustado / acción | Impacto absoluto / acción |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ADVANCED MICRO DEVICES INC | 13.457726 % | 13.457726 % | 13.436738 % | 13.436738 % | 10.522526 USD | 10.522526 USD | 0.000000 |
| TOYOTA MOTOR CORPORATION | NO DISPONIBLE | NO DISPONIBLE | NO DISPONIBLE | NO DISPONIBLE | NO DISPONIBLE | NO DISPONIBLE | NO DISPONIBLE |
| GOGOLOOK | NO DISPONIBLE | NO DISPONIBLE | NO DISPONIBLE | NO DISPONIBLE | NO DISPONIBLE | NO DISPONIBLE | NO DISPONIBLE |

AMD: fecha de valoración 2026-10-12, run 533; impacto porcentual **0 %**. Toyota y GOGOLOOK: diagnóstico a 2026-10-30; impacto porcentual **NO DISPONIBLE**, no 0 %. Se exportaron los tres diagnósticos/modelos nuevos en Excel, PDF y JSON. Para Toyota/GOGOLOOK, el Excel es de diagnóstico, no un modelo sectorial ficticio completado sin inputs.

**Empresas con alguna prima realmente estimada: 0/3. Con las dos primas estimadas: 0/3. Con dos ceros operativos provisionales: 3/3.** No se confunde un cero provisional con CERO estimado.

## Cálculo automático ejecutable

La fórmula admitida por esta implementación es una diferencia de exposición con coeficiente anual **externamente calibrado, validado y aprobado**:

`Delta K = lambda_anual × (x_empresa − x_referencia)`.

Para liquidez, `x = media(|retorno diario ajustado| / importe monetario diario)`. Para tamaño, `x = ln(capitalización conciliada en unidades monetarias)`, con controles de liquidez, riesgo operativo, endeudamiento, rentabilidad, calidad y mercado. Es una regla de aplicación condicional de un modelo validado, **no una calibración nueva ni un coeficiente académico universal**. Una regresión univariante o el OLS experimental existente no la habilitan.

El registro interno debe acreditar: fórmula ejecutable, coeficiente y unidad de tasa anual por unidad de exposición, mercado, moneda, dominio de estimación, familia, referencia fechada y con evidencia, ventana/feed cuando corresponda, inferencia robusta, estabilidad y validación de rentabilidad exigida. La exposición y la referencia deben corresponder a la misma fecha final. La no incorporación exige evidencia ligada al hash exacto de la base financiera de la empresa. No se extrapola fuera del dominio ni se elige silenciosamente entre calibraciones ambiguas.

Una prima negativa exige además el libro conciliado de primas ya contenidas en Ke/Kd base; la reducción no puede superar esa prima. Con incorporación parcial o desconocida no se concede prima incremental. Tamaño y liquidez mantienen controles de solapamiento. Las primas calculadas no nulas generan propuestas inmutables del servidor y permanecen con ajuste operativo 0 hasta revisión individual. Una propuesta ya aprobada se recalcula y verifica antes de aplicarse. Los porcentajes y coeficientes enviados por el cliente se rechazan.

Cuando no hay método/datos, el contrato devuelve `primaCalculada: null`, `ajusteOperativo: 0`, `estadoFinanciero: NO_ESTIMABLE`, `estadoAplicacion: BLOQUEADO` y el motivo. Si una exposición identificada produce diferencia cero, devuelve `primaCalculada: 0` y `estadoFinanciero: CERO`. Si un riesgo ya está incorporado se mantiene YA_INCORPORADO.

## Fórmulas financieras y Excel

- `Ke ajustado = Ke base + suma de primas operativas autorizadas en KE`.
- `Kd ajustado = Kd base + suma de primas operativas autorizadas en KD`.
- `WACC ajustado = Ke ajustado × E/(E+D) + Kd ajustado × (1−T) × D/(E+D)`.
- Si no hay ajustes autorizados, WACC ajustado = WACC base financiero. Un WACC histórico que contuviera DRAFT se conserva como referencia distinta; no se certifican esas primas antiguas.
- BANK/INSURANCE/REIT utilizan Ke para el descuento y muestran WACC NO_APLICABLE. No se impone una fórmula FCFF a esas familias.

Las **16 plantillas** se conectan en el exportador nuevo. Los maestros originales se conservan con su hash verificado. Se añade Primas_auto con tres escenarios y valores numéricos operativos en filas 14/19, estados en 15/20, estimaciones en 16/21, componentes, motivos, fuentes y aprobación. La hoja 07_WACC toma esas celdas: primas en H/J/L30–31, estados adyacentes, Ke/Kd ajustados y WACC recalculado por componentes. Concentración de clientes se excluye de nuevas primas.

Primas_auto contiene fórmulas del descuento de los cinco FCFF y del numerador terminal congelados, puente EV/Equity y valor por acción. Las familias equity usan su relación terminal con Ke. Se comprueba tasa > crecimiento. 10_RESULTADO y los campos afectados de 11_OUTPUT_API muestran el cálculo nuevo. 14_MOTOR_TS se identifica como referencia histórica; las hojas 08/09 conservan sus fórmulas legadas y no se presentan como el resultado nuevo. La simulación no reproyecta el negocio.

Modificar una prima operativa en una copia Excel recalcula matemáticamente las fórmulas enlazadas, pero **es una hipótesis manual fuera del servidor**: no cambia el estado/aprobación, ni crea una metodología autorizada, ni actualiza MySQL. Para generar una valoración autorizada debe utilizarse la ruta del servidor. No se presenta el archivo como sistema de aprobación seguro.

## Por qué no se han obtenido primas reales

La comprobación dirigida reutiliza la investigación anterior. Amihud requiere series de retornos y volumen monetario: el [trabajo del autor en NYU, versión 2000](https://archive.nyu.edu/jspui/bitstream/2451/27420/2/S-AM-00-10.pdf), previo al artículo de 2002, estudia acciones NYSE de 1964–1997. No aporta un coeficiente automáticamente transportable a US/JP/TW actuales. No se reproduce su texto ni se copian sus coeficientes.

La alternativa de [Roll (1984)](https://doi.org/10.1111/j.1540-6261.1984.tb03897.x) estima un spread implícito bajo supuestos con covarianza de cambios consecutivos de precio. Requiere una serie; la última cotización legacy no basta. Tampoco transforma por sí sola un spread en tasa anual de Ke. Los ratios de caja/cobertura miden otros riesgos. Los [descuentos por falta de comerciabilidad tratados por Damodaran](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/illiquiddisc.htm) se refieren al valor/condiciones de venta y no son una tasa anual intercambiable con la prima bursátil solicitada.

El [trabajo de Asness y colaboradores](https://www.aqr.com/Insights/Research/Working-Paper/Size-Matters-If-You-Control-Your-Junk) muestra la importancia de controlar calidad para estudiar tamaño. No justifica derivar una prima individual universal de ingresos/activos. Las rentabilidades de un factor SMB tampoco proporcionan la exposición residual de una empresa con un único precio. Ésta es la razón por la que las alternativas no han autorizado un porcentaje real.

## Verificación ejecutada

- **206 pruebas superadas, 0 fallidas**: 133 Capital y 73 de regresión previa. Incluyen 16 plantillas con prima positiva y negativa hipotéticas, cero provisional, cero estimado, doble contabilización, fechas, coeficientes no autorizados, mercado/moneda, API y conservación histórica.
- **51 libros recalculados** con HyperFormula 3.5.0 GPLv3, sólo en QA temporal: tres ejemplos reales y 16 × tres signos/casos hipotéticos. Se compararon fórmulas con resultados TypeScript y se modificó una prima para comprobar la reacción de Ke/WACC/valor intrínseco sin cambiar FCFF. No es una certificación de Excel nativo.
- **11 comprobaciones React** con bundle real, DOM en memoria y API real, incluyendo el botón de cálculo automático. Compilación y lint del cliente correctos. Sin inspección visual de navegador real.
- Vistas derivadas de celdas de los XLSX renderizadas e inspeccionadas: tres ejemplos, WACC de AMD y ejemplos hipotéticos FCFF/banco. Artifact Tool no está instalado en el runtime; se documenta el uso alternativo de HyperFormula/canvas. No se certifican objetos/gráficos/formato nativo de Excel.
- Reproducción independiente desde código compilado archivado y snapshots exactos: nuevas simulaciones automáticas con EXACT_MATCH, además de las reproducciones previas. Detalle en fase4/evidencias/replay.json.
- **60 ejecuciones congeladas intactas**: hashes antes/después cb0a95e394950608f4b3b310a2604a65a4eae0134ffc8d229b9a9e0efc51087e; fuente y copia coinciden. No se modificaron sus parámetros, snapshots ni resultados.

Incidencias corregidas en esta ejecución: una extracción de fixtures incluyó por error tests en el módulo auxiliar y causó dos fallos de carga; se separaron correctamente. El motor alternativo de fórmulas redondeaba a diez dígitos por defecto; se configuró precisión 15 sin smart rounding antes de verificar los resultados. No se alteraron cifras financieras para hacer pasar las comprobaciones. Los resultados finales son los indicados arriba.

## Uso

Abrir http://127.0.0.1:3100/, seleccionar empresa/run y pulsar **Calcular primas automáticas y exportar**. La tabla muestra prima estimada, ajuste operativo, estado y motivo. Descargar Excel/PDF desde la evaluación resultante.

API: GET /api/capital/companies/:id/premiums?asOf=YYYY-MM-DD; POST /api/capital/runs/:id/automatic-premiums con cuerpo vacío y token local de revisión. El endpoint usa datos y métodos del servidor, conserva el resultado y crea propuestas si hay cuantificación defendible. Sin run, guardar una evaluación produce un Excel de diagnóstico con dos ceros operativos y tasas desconocidas explícitas.

No se ejecutaron migraciones nuevas ni escrituras operativas en esta intervención. No se cambiaron recuperadores ni tareas. Se reinició únicamente el servicio local Capital v2. Las dependencias del producto siguen intactas; HyperFormula sólo está en .verification/capital-qa. La funcionalidad financiera no estimable continúa bloqueada; esta entrega implementa su tratamiento automático y el recorrido de Excel, no sustituye datos inexistentes por coeficientes.
