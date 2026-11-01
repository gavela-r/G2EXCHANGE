# Referencias comparables y control de doble contabilización

## Selección reproducible

La comparación de diagnóstico requiere sector o modelo de negocio, familia de valoración, fecha y periodo explícitos. País/región, estructura financiera y régimen de mercado pueden delimitar el universo cuando exista justificación. No hay referencia universal. Sectores amplios o clasificaciones pendientes no se resuelven con un fallback silencioso a mercado total.

Para liquidez bursátil se debe conciliar bolsa, calendario, instrumento/clase, moneda e importe, fracción libre y ventana. Para ratios financieros, misma definición de deuda/caja/EBITDA, criterio contable, consolidación y duración. Para tamaño, conservar dispersión de capitalización/ventas/activos; controlar calidad, negocio y liquidez sin seleccionar exclusivamente emisores de tamaño idéntico. `variablesControl` no puede incluir literalmente `variableEstudiada`; una revisión humana sigue siendo necesaria para detectar controles equivalentes escritos con otro nombre.

La implementación `construirBenchmark` recibe observaciones ya normalizadas. Filtra identidad propia, familia/sector/subsector/país/región/mercado/modelo declarados, unidad/moneda, duración y periodo, publicación conocida <= fecha y evidencia válida. Las referencias bursátiles exigen mismo mercado y lista de sesiones esperadas, conservada en cada indicador. Excluye observaciones duplicadas de una empresa, en vez de escoger una versión posterior sin contexto. No tiene recuperador ni consulta MySQL. No hace emparejamiento por distancias, normalización de ratios ni regresiones multivariantes.

`Benchmark` conserva reglas/versiones, empresa objetivo, observaciones completas de cada comparable (empresa, periodo, fecha conocida, fuente, valor, fórmula, limitaciones), exclusiones y estadística. Calcula media no ponderada, mediana, p25/p75 por interpolación `(n−1)*p`, mínimo, máximo y desviación estándar **muestral** si n>=2. La posición del objetivo usa `(n_inferiores+0,5*n_iguales)/n*100`. Es una distribución empírica, no prueba de significación. No se afirma que dos observaciones sean una muestra adecuada porque permitan calcular mediana.

La evaluación reconstruye las estadísticas a partir de miembros y reglas, y no confía en una mediana suministrada. Exige compatibilidad con el objetivo. Las diferencias pequeñas no se etiquetan NEUTRAL por una tolerancia financiera inventada: solo igualdad exacta. Un criterio posterior de materialidad tendría que justificarse por precisión del dato y objetivo, sin convertirlo en regla de prima.

Una empresa con caja/ventas/capitalización absolutas superiores no tiene automáticamente menor riesgo. Esas magnitudes no tienen relación monotónica de riesgo definida. Los ratios de cobertura/negociación tienen una dirección descriptiva en su dimensión concreta, con advertencia de que no demuestra un óptimo empresarial ni una prima. No hay índice agregado que compense tamaño frente a liquidez.

## Fuentes y presupuesto cero

| Fuente | Uso posible y reutilización | Límites y decisión en esta fase |
|---|---|---|
| G2 actual | Prioridad: PCV, VIV, KPI, metadatos, classification_evidence, evidence y execution congeladas | El DDL demuestra capacidad, no cobertura completa; revisar contexto y fechas antes de formar una muestra |
| SEC EDGAR | Conector ya integrado; informes, CompanyFacts y submissions, conceptos de balance y acciones | [API oficial](https://www.sec.gov/search-filings/edgar-application-programming-interfaces): no requiere clave; CompanyFacts agrega hechos estándar de entidad completa, no toda nota o segmento. [Acceso justo](https://www.sec.gov/about/developer-resources). No aporta volumen/spread bursátil |
| EDINET/FSA | Reutilizar informes y contextos XBRL/registro integrados | [Documentación oficial](https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0090.html) y [especificación de autenticación](https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/download/ESE140206.pdf). API con clave de cuenta; no incrustarla. No es una fuente de volumen de mercado. Respetar [condiciones de API](https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0030.html) |
| TWSE y TPEx | Priorizar rutas oficiales ya usadas en cotizaciones y estados de Taiwán; MOPS para documentos | [TWSE OpenAPI](https://openapi.twse.com.tw/) documenta STOCK_DAY_ALL y otras estadísticas. Evaluar volumen/importe y calendario, unidades, continuidad histórica y derechos de uso del dataset concreto. El actual escritor solo conserva cierre; endpoint disponible no demuestra dato local |
| JPX / fuentes japonesas oficiales | Revisar datos públicos de mercado y emisiones, conciliados con EDINET | No se ha identificado aquí una serie gratuita completa de bid/ask ni una licencia empresarial de históricos JP para el proyecto. [J-Quants Free](https://jpx-jquants.com/en/help/plan) tiene retraso de 12 semanas y vigencia anual; su existencia no acredita derecho comercial ni resolución temporal suficiente. No contratar ni activar |
| Damodaran | Reutilizar ERP total/betas públicas y datos sectoriales para controles metodológicos | [Datos país](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html); guardar versión/fecha y definición. Agregados sectoriales no contienen empresas ni panel point-in-time local. El Rf soberano debe conciliarse con el modelo del proveedor |
| French Data Library | Factores de investigación US, Japón y otras regiones para investigación de un modelo multifactorial | [Biblioteca oficial](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html). Datos públicos no equivalen a coeficientes de un emisor. Archivar fichero y fecha de disponibilidad; cambio de metodología CRSP FIZ→CIZ desde 2025 y revisiones impiden tratar el fichero actual como el conocido históricamente |
| Proveedores actuales de precios | Reutilizar solo datos que ya existan y cuyo acceso/licencia permitan uso del proyecto | No activar planes, complementos ni claves. No asumir que Alpaca/Finnhub/Yahoo/FinMind/TwelveData permiten gratuitamente el histórico completo o redistribución; ninguna integración nueva en v1 |

No se promete una fuente gratuita oficial universal que suministre históricos completos de cotizaciones y microestructura US/JP/TW. El diseño funciona con evidencia suficiente; mientras no exista, liquidez bursátil queda no estimable con los datos actuales. La disponibilidad pública de un PDF/factor no sustituye las condiciones de uso del proveedor o del dataset de terceros.

## Evitar información futura

Conservar periodo económico, fecha de publicación original, fecha de observación y disponibilidad de cada revisión. No elegir la rectificación actual para una valoración anterior a su publicación. Clasificación de sector, universo, bajas de cotización, acciones, free float, composición del índice, FX y versiones de datasets también necesitan historia. V1 valida fechas de los datos y benchmarks recibidos, pero no reconstruye por sí misma un universo histórico ni prueba las fechas declaradas: esa responsabilidad deberá cubrirla un adaptador revisado con evidencias.

## Matriz de doble contabilización

| Riesgo o ventaja | Dónde puede estar ya incluido en G2 | Canal incremental a estudiar | Control exigido antes de cuantificar |
|---|---|---|---|
| Riesgo país | ERP **total** y posiblemente rendimiento soberano usado como Rf | Ke/FCFF según exposición geográfica en modelo coherente | No sumar CRP adicional; conciliar Rf libre de default y ERP |
| Apalancamiento financiero | Beta sectorial apalancada, spread y pesos D/E | Beta reapalancada/estructura y Kd coherentes | No añadir otra prima por el mismo D/E. Auditar beta sectorial vs deuda propia |
| Cobertura de intereses baja | Rating sintético y spread | Kd si diferencial incremental no recogido | Comparar cobertura/perfil/fecha/spread real usados, no solo el nombre del rating |
| Empresa pequeña y crédito | Perfil GRANDE/PEQUEÑA_RIESGOSA en US/USD | Efecto de tamaño **residual** en Ke si demostrado | No volver a cobrar el efecto ya en Kd ni usar el umbral rating como prima Ke |
| Caja neta elevada | Equity=EV−deuda+caja; deuda bruta en pesos; posiblemente beta/spread | Escenarios/caja libre y coste marginal deuda | No prima negativa por caja. Separar caja operativa/restringida/excedentaria |
| Déficit de circulante o refinanciación | NWC, FCFF, spread/rating, noticias aprobadas | Necesidad explícita de financiación o escenarios de distress | No duplicar déficit de caja vía FCFF y prima genérica |
| Menor volumen / mayor spread | ERP de mercado puede contener remuneración media; Ke manual previo | Diferencia de Ke dentro de referencia/modelo con liquidez calibrados | Conciliar qué prima contiene baseline; volumen bajo no permite fijar pb |
| Tamaño e iliquidez | Mismas microcaps, free float bajo, spread alto | Liquidez + tamaño residual estimados conjuntamente | No sumar dos regresiones univariantes o dos tablas de primas |
| Volatilidad y concentración operativa | Beta, márgenes/crecimiento, noticias, escenarios y concentración legacy | Flujos/escenarios si riesgo específico; tasa solo si riesgo remunerado adicional | Revisar intervención en cada hipótesis y no exigir dos veces la misma pérdida |
| Restricción de venta de una participación | Descuento de patrimonio o prima de Ke previa | DLOM de la participación concreta | Horizonte/derechos y calibración. No repetir prima bursátil sobre ese coste |
| Mayor calidad, escala o diversificación | Márgenes sostenibles, estabilidad, beta/rating, expectativas de flujos | Efecto residual si identificado | No bonificación automática por capitalización; controlar negocio/calidad |

`Incorporacion` exige riesgo concreto, lista de indicadores, componente, fuente, disponibilidad y justificación, con cobertura TOTAL/PARCIAL. La API no declara incorporado un riesgo por detectar caja, tamaño o rating sin conciliación. TOTAL válido → `YA_INCORPORADO`, ajuste incremental 0; PARCIAL → `NO_ESTIMABLE` hasta aislar residual. La lista de advertencias orienta revisión; no demuestra estadísticamente independencia. `detectarDuplicidades` identifica combinaciones a revisar y no autoriza sumas.
