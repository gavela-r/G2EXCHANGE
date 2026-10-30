# Fase 2 — fuentes pendientes para carencias reales

Consulta documental pública: 29/10/2026. Se reutiliza la investigación de fase 1; no se repite bibliografía académica. Se consultaron especificaciones oficiales únicamente para relacionar las carencias verificadas con fuentes posibles. **No se instalaron clientes, llamaron nuevas APIs de datos, activaron proveedores o contrataron planes.** Las URLs de abajo son referencias para una fase futura.

## Prioridad cero: recuperar contexto existente antes de descargar más

Antes de incorporar más cifras, conciliar las fechas VIV (88.464 versiones desplazadas), el grupo de 294 empresas TW/Tokyo/EDINET y las publicaciones FINMIND ausentes. Hay información numérica ya almacenada y evidencias import/verification/report que deben aprovecharse. Una descarga nueva no demuestra que el instrumento viejo, moneda o emisor fueran correctos.

Para current/quick/cash ratio faltan AC/PC/prepagos normalizados, no necesariamente los documentos fuente. Priorizar los informes públicos ya descargados y los conectores SEC/EDINET/MOPS existentes, con contexto consolidado, unidad y periodo; no crear otra taxonomía o API. Para acciones hacen falta fecha del hecho, clase y acciones propias: no basta recuperar otra vez un total emitido.

## Estados Unidos

| Carencia real | Fuente candidata / reutilización | Condición y límite |
|---|---|---|
| Serie diaria, volumen y ajustes | Alpaca ya integrado; revisar históricos del feed contratado/gratuito existente | No se ha probado entitlement o licencia de esta cuenta. La consulta histórica debe declarar feed; el precio IEX no se mezcla con volumen SIP |
| Importe monetario y sesiones | Operaciones del mismo feed o campo oficial de importe; calendario de bolsa y reglas de sesión | Volumen de acciones no es importe. VWAP×volumen solo con filtros coincidentes; cierre×volumen es aproximación |
| Acciones, clase, autocartera, AC/PC y fecha de publicación | SEC EDGAR, ya integrado; informes y contextos XBRL del emisor | Reutilizar CIK/accesión/unidad/contexto. No usar promedio ponderado diluido como acciones en circulación |
| Free float y bid/ask | Declaraciones de emisor/SEC y cotizaciones del feed autorizado, cuando existan | No hay un free float universal diario en CompanyFacts; EntityPublicFloat es un valor de mercado no afiliado, no automáticamente una fracción de acciones. No se acredita aquí un histórico gratuito completo de spreads consolidados |

La [documentación oficial de Alpaca](https://docs.alpaca.markets/us/docs/market-data-faq) distingue IEX (una bolsa) de SIP (consolidado); describe acceso histórico SIP sin suscripción cuando el final consultado tiene el retraso requerido. La [tabla oficial de cobertura](https://docs.alpaca.markets/us/docs/about-market-data-api) también distingue las limitaciones de Basic. Son posibilidades documentales, **no comprobaciones de acceso, derechos comerciales o cobertura efectiva de la cuenta**. No se activó ninguna ruta. Para datos históricos de cierre, el acceso diferido merece evaluación antes de asumir que toda cobertura consolidada exige pago; para datos recientes rigen restricciones distintas.

SEC resuelve documentación financiera, no el volumen diario consolidado ni una base de microestructura. No se identifica como disponible a coste cero un almacén universal ya autorizado para cualquier uso de mercado US. La compatibilidad de uso debe quedar documentada antes de materializar datos de terceros en G2.

## Japón

| Carencia real | Fuente candidata / reutilización | Condición y límite |
|---|---|---|
| Precios diarios, volumen y valor transado | JPX/TSE: tabla oficial diaria y documentación de J-Quants | La publicación y la licencia de descarga/uso empresarial son cuestiones distintas; no se acredita una fuente masiva gratuita apta para G2 |
| Acciones emitidas menos propias, clase y fecha | EDINET/FSA y notas del emisor ya integradas; reutilizar documentos y registro | La ruta actual JP guarda acciones emitidas totales bajo un nombre de circulación; separar definición antes de usarla |
| AC/PC/prepagos, moneda/consolidación | Documentos EDINET ya descargados | Añadir mapeo/contexto en una fase autorizada, sin inferir saldos de movimientos |
| Free float, suspensiones y bid/ask histórico | Información oficial JPX/emisor y datos de mercado autorizados | No se ha identificado aquí una serie gratuita completa y empresarialmente compatible; dejar pendiente |

La [especificación oficial de datos de J-Quants](https://jpx-jquants.com/en/help/data) documenta Volume/Vo, TurnoverValue/Va, factores de ajuste y la distinción entre acciones emitidas y treasury shares. **No basta que exista Free:** sus [condiciones oficiales de uso](https://jpx-jquants.com/en/help/usage) limitan la API personal al uso privado de personas físicas y excluyen usos corporativos o aplicaciones con datos alojados por el operador. Por ello **no se propone J-Quants personal como proveedor gratuito utilizable por G2EXCHANGE**. La alternativa corporativa no se contrata en presupuesto cero. El [plan Free](https://jpx-jquants.com/en/help/plan), además, tiene retraso y vigencia limitados, lo que tampoco resuelve una serie actual completa.

Queda una carencia real de fuente japonesa de mercado a 0 € con derechos compatibles demostrados. No se cubre con una declaración de gratuidad ni con otra API no validada. Puede continuarse con estados y evidencia ya existentes mientras esa decisión sigue pendiente.

## Taiwán

| Carencia real | Fuente candidata / reutilización | Condición y límite |
|---|---|---|
| Precio diario, volumen en acciones e importe | TWSE oficial: STOCK_DAY_ALL y consulta histórica por valor; ya hay lector de cierres en el proyecto | El lector actual desecha otros campos. Validar TradeVolume/TradeValue, fechas ROC/ISO y unidad, sin desarrollar ahora |
| Datos de valores TPEx | TPEx: cotización/cierre oficial, ya referenciado por el recuperador | La documentación pública OpenAPI devolvió 403 a la herramienta de consulta; no se probó descarga ni cuota de datos. Verificar campos y cobertura antes de prometerlos |
| Publicación, consolidación, acciones propias/clase y AC/PC | MOPS/filings oficiales y datos públicos de emisores; reutilizar ruta de informes | Prioridad frente a aceptar EDINET como origen de empresas TW. Conciliar stock_id, identidad legal y documento |
| Free float, eventos y sesiones | Registros oficiales TWSE/TPEx y documentos del emisor | El volumen negociado no determina free float. Revisar unidad por lote/acción y cobertura de sesiones/operaciones |

TWSE publica la [consulta histórica de volumen/valor por instrumento](https://www.twse.com.tw/en/trading/historical/stock-day.html) con descarga CSV y periodo publicado desde 2010, y documenta los conjuntos en [su OpenAPI](https://openapi.twse.com.tw/). Esto da una vía oficial concreta para estudiar los huecos detectados. No demuestra derecho irrestricto de redistribución, acceso automatizado masivo sin límites ni una autorización comercial específica. Deben documentarse las condiciones del dataset y el alcance de operaciones incluidas. No usar estadísticas globales del mercado como volumen de cada acción ni confundir day trading con todo el volumen.

## Qué no se necesita contratar o integrar ahora

No hacen falta primas comerciales, tablas de size premium de pago, APIs de valoración o una segunda base contable. El ERP/beta y el módulo de fase 1 ya existen; el hueco está en identidad, fechas, calidad, precio/volumen y acciones. Los factores públicos French y los agregados de Damodaran no reparan esas carencias instrumentales y no aportan automáticamente una prima calibrada. No se realiza ninguna integración en esta fase.

Toda fuente futura debe conservar mercado/feed, moneda, instrumento/clase, fecha/sesión, ajustes, volumen e importe con sus unidades, publicación/disponibilidad, límites de uso y versión del dato. Si no hay fuente gratuita compatible demostrada, el indicador queda no disponible; no se sustituye por un coeficiente o un proxy silencioso.

## Precisión de la variable free float de SEC

La [definición SEC del elemento EntityPublicFloat](https://www.sec.gov/Archives/edgar/data/1514371/000122527912000078/R1.htm) lo describe como valor de mercado de equity común en manos de no afiliados. Su tipo es monetario y su fecha de referencia no es una serie diaria de acciones libres. Por eso no sustituye automáticamente a free_float como fracción o número de acciones del instrumento: requeriría conciliación adicional de precio, fecha, clases y alcance.
