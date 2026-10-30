# Auditoría de la espera de Estados Unidos — 29/10/2026

Auditoría técnica sin cambios operativos. Horas en Europe/Madrid (CET, UTC+1). Evidencias locales conservadas en `private_backups/auditoria-us-cuotas-20261029/`, excluidas de Git. No se han hecho peticiones a APIs financieras, activado proveedores, adquirido bloqueos de país, modificado recuperadores, cuotas, checkpoints, datos originales ni fórmulas. Las páginas públicas de documentación sí se han consultado.

## Resultado principal

La cola de 5.751 empresas está esperando principalmente por **FinDataEngine/asreported.io**. No ha agotado el límite local de 5.000 intentos diarios: el contador registra **128**. El transporte conserva un bloqueo después de HTTP 429 hasta **01/11/2026 01:00:16,970**. El número exacto del cupo real de la cuenta no está registrado.

El despertar del lote a **30/10/2026 00:59:59,999** procede de elegir la fecha mínima entre los proveedores deshabilitados: Alpha Vantage tiene esa fecha; FinDataEngine, la del 1 de noviembre. Ese despertar **no demuestra que FDE vuelva a estar disponible**. Mi explicación anterior indicaba correctamente la hora programada del lote, pero faltaba esta distinción respecto al bloqueo de FDE.

No existe un bloqueo global del coordinador: Japón sigue descargando e incorporando datos y las auditorías periódicas continúan. Los pases SEC de extracción estándar y mapeo ya terminaron; no están suspendidos por una cuota SEC.

## 1. Proveedores realmente presentes

| Proveedor | Integración y situación actual | Información y ejercicios 2022–2025 | Cuota/uso verificable | Licencia y limitaciones |
|---|---|---|---|---|
| **SEC EDGAR** | Fuente principal operativa. Bulk, identidad CIK, submissions, CompanyFacts, comparativos, extracción V1 y mapeo V2 ejecutados. Los pases de 8.017 empresas están terminados. | Estados, hechos estándar, fechas y accesiones históricas. Los originales HTML/iXBRL permiten investigar datos que CompanyFacts excluye; esa extracción contable general del documento no está encadenada en el plan actual. | No requiere API key. Contador HTTP local: 7 intentos del 29/10; no incluye necesariamente los ZIP masivos ni otros importadores. Tope local 12.000/día e intervalo 350 ms: son políticas propias, no un cupo de cuenta SEC. Saldo diario de proveedor: no aplicable/no existe uno observado. Respetar el límite agregado de acceso de la SEC. | Fuente pública autorizada para esta recuperación; mantener identificación y política de acceso justo. CompanyFacts sólo agrega taxonomías estándar y hechos del emisor completo. Un campo ausente ahí no implica ausencia en la presentación original. |
| **FinDataEngine / asreported.io** | Complemento integrado y usado: el pase V5 registró 27 operaciones PCV nuevas posteriores al inicio de esta intervención. Ahora bloqueado. Una sola clave configurada. | Perfil por CIK, tres estados, conceptos XBRL y consultas `point-in-time`. El pase utiliza `as_of` de la presentación y valida acceso, cierre y emisor; admite 2022–2025 cuando el servicio contiene el hecho. | 128 intentos locales del día; 5.000/día y 2.200 ms son límites locales. `remaining` y `monthlyRemaining` están en NULL. Un 429 originó `blockedUntil=2026-11-01T00:00:16.970Z`. No hay prueba del tamaño numérico del cupo remoto ni del saldo consumido fuera de este contador. | El proveedor declara origen SEC/dominio público y datos libremente redistribuibles. Su página anuncia cupo mensual, pero no publica aquí su tamaño. La fecha del bloqueo sugiere una ventana de reinicio mensual; la causa exacta no se puede certificar sin las cabeceras/cuerpo originales o el panel de la cuenta. |
| **Alpha Vantage** | Existe adaptador de estados, pero el pase activo lo limita a revisión diagnóstica y prohíbe incorporaciones canónicas sin enlace histórico. Está marcado como bloqueado. Hay dos valores de clave distintos: `ALPHAVANTAGE_API_KEY` y `EC_ALPHA_VANTAGE_API_KEY`; el segundo pertenece al módulo de eventos corporativos y no al fallback financiero activo. | Ingresos, balance, flujo, perfil; hay series anuales históricas. No está acreditada en esta cuenta la entrega completa de 2022–2025 ni su enlace a la publicación/accesión histórica requerida. | Free público: 25 solicitudes/día. El transporte usa 24/día y 13 s entre peticiones. Contador local: 1 intento del 29/10; bloqueo local hasta el fin de ese día UTC. **No se deduce que queden 23 o 24 solicitudes reales**: el código convierte cualquier `Note`/`Information` en bloqueo y no conserva su texto; otros consumidores pueden no estar contabilizados. No se suman las dos claves. | Los términos estándar son personales/no comerciales salvo acuerdo escrito. También falta la vinculación documental. Aunque otro token respondiera, no constituiría por sí mismo una fuente autorizada de PCV históricos. |
| **FMP** | Conector de diagnóstico independiente del escritor PCV. Primera clave: perfil 401; segunda: perfil y tres estados anuales de AAPL 200. Sin ingestión canónica. | AAPL devolvió cierres 2022–2025. No se ha probado acceso para todo US. Las consultas de Japón y Taiwán dieron 402. La muestra AAPL validada no coincide con ninguna de las 5.751 empresas de esta cola. | Basic público: 250 llamadas/día, con restricciones de símbolos y endpoints. Consta 1 intento del diagnóstico nuevo de la primaria, además del sondeo 401 anterior; 6 solicitudes en la secundaria (4 US y 2 regionales). Son observaciones locales, no un contador exhaustivo de cuenta. Sin cabecera de saldo verificable. | La licencia personal no acredita el uso comercial del proyecto. El normalizado examinado no aporta por sí solo accesi​ón, inicio anual, unidad/multiplicador ni consolidación completos. No se habilita una fuente sólo porque responda 200. |
| **Finnhub** | Configurado en importadores de perfiles, países, sectores y cotizaciones. Dos valores de clave distintos para módulos diferentes. **No existe una ruta de sus estados financieros en el recuperador PCV activo.** Autenticación, plan y permisos actuales no se han probado en esta auditoría. | El proveedor documenta estados normalizados e históricos `as-reported`, con filtros por CIK, accesi​ón y fechas. Eso no demuestra entitlement gratuito para nuestras claves. | El importador de cotizaciones aplica 55 solicitudes/minuto como límite local. El proveedor documenta límites de acceso separados para fundamentales/mercado y un máximo general de 30/s. Cupo contratado, usados y remanentes: no verificables con los registros actuales. | Los planes personales no autorizan uso empresarial ni redistribución sin aprobación escrita. No se cuenta como alternativa financiera disponible hoy. |
| **Alpaca** | Integrado para cotizaciones y eventos corporativos; la clave principal se reutiliza en ambos módulos (dos nombres de configuración, un valor de clave). No hay importador Alpaca de los 22 PCV anuales. | Precios y acciones corporativas históricas pueden abarcar esos años; un dividendo anunciado/por acción no equivale al total contable anual de dividendos pagados. | Referencia Basic publicada: 200 peticiones históricas/minuto, feed limitado. No se verificó el plan de esta cuenta ni hay saldo centralizado registrado. El tamaño de lote de 200 símbolos del código no es un contador de cuota. | Acceso y uso dependen de plan/feed y derechos de mercado. No resuelve balance, resultados y cash flow de este pipeline. |
| **Twelve Data** | Configurado como fallback de cotizaciones US/JP. Una clave US configurada. No hay integración de sus estados contables en el recuperador PCV. | El proveedor ofrece fundamentales históricos, pero no deben confundirse con el endpoint de cotizaciones integrado. | Basic publicado: 8 créditos/minuto y 800/día. Un estado financiero tiene peso de 100 créditos por símbolo; los 800 créditos diarios no prueban capacidad gratuita de consultar balances. Plan, consumo y saldo de esta cuenta: no verificados. | La documentación impone niveles y derechos de uso distintos para fundamentales, pruebas y producción. No hay acceso/licencia acreditados para esta recuperación. |
| **FRED / ALFRED** | Configurado para tipos de interés y datos macroeconómicos/rating. Una clave. No es proveedor de estados contables de emisores. | Las series macro pueden cubrir 2022–2025, pero no aportan los 22 PCV por empresa. | Sin ledger de uso de la cuenta en esta intervención; saldo desconocido. | Derechos por serie: algunas tienen restricciones de terceros. No utilizar una licencia de una serie como autorización global. |
| **NYU / Damodaran** | Ficheros auxiliares de primas de riesgo y beta por país/sector. Sin API key. | Ayudan a costes de capital; no son los tres estados de cada empresa/año. | Descargas públicas; no se midió cupo ni consumo contractual. | Su disponibilidad no los convierte en datos contables equivalentes. |

Además existen Yahoo Finance para cotizaciones de TW/JP; FinMind para TW; EDINET/EDINET DB y J-Quants para JP; TWSE/TPEx para TW; y registros de instrumentos alojados en GitHub. No están conectados como alternativas de los PCV estadounidenses. No se han inventariado como fuentes US nuevas por el mero hecho de existir un token o URL en el repositorio. No se encontró un conector activo US de Polygon/Massive, Tiingo, EODHD, SimFin, Quandl/Nasdaq Data Link o Marketstack en los módulos inspeccionados.

## 2. Qué detiene exactamente la cola

1. El 29/10 a las **14:43:22,954** el pase V5 detectó que Alpha Vantage ya estaba marcado como bloqueado desde una ejecución anterior. El archivo de cuota Alpha se había actualizado a las **01:01:05,623**.
2. A las **14:48:00,973** registró `PROVIDER_PAUSED / CUOTA_AGOTADA_FINDATAENGINE`; el archivo de cuota FDE se actualizó en el mismo instante y conserva un 429 y la fecha del 1/11.
3. Al terminar el recorrido a las **14:52:12,040**, quedaron **5.751** empresas en `retryCompanies`.
4. `deferred_until` se elige mediante el mínimo de las fechas de los proveedores deshabilitados: por eso conserva el fin del día UTC de Alpha, no el fin del bloqueo FDE.
5. El supervisor respeta esa espera antes de lanzar de nuevo el escritor. Al cambiar de día, el transporte conserva los `blockedUntil` futuros: un contador local FDE reiniciado no elimina el bloqueo del 1/11.

Los 21.052 últimos eventos empresa/año de cuota FDE no son 21.052 llamadas de red. El bloqueo se reutiliza localmente y puede generar muchos eventos con sólo 128 intentos contabilizados.

## 3. Alcance del bloqueo y defectos de coordinación

- **No hay suspensión global.** Japón y las auditorías siguen ejecutándose. SEC estándar/mapeo están terminados, y no hay una nueva fase general de extracción HTML/iXBRL SEC en el grafo.
- **Sí existe dependencia innecesaria entre complementos.** En el pase US se consulta FDE antes de Alpha. Una excepción FDE salta al `catch` del informe y evita llegar al bloque Alpha. Esto es un problema de separación de responsabilidades aunque hoy Alpha tampoco tenga demostrados cupo, licencia y contexto suficientes.
- **La caché tiene prioridad sobre la cuota**, lo cual es correcto: una respuesta FDE ya observada se puede leer sin red. Sin embargo, si un estado está en caché y otro requerido no, la excepción del segundo aborta la combinación/persistencia del primero. No hay un carril independiente para todos los datos parcialmente descargados.
- **Hay reintentos que FDE no puede resolver con su mapeo actual.** Se detectaron 50 informes, de 23 empresas, cuyo ?nico hueco es `ACCIONES_EN_CIRCULACION`. FDE no mapea ese concepto. En 6 empresas, todos sus informes aplazados por cuota est?n en ese caso. Consultar su perfil antes de evaluar la cobertura de campos puede gastar cuota sin posibilidad de completar ese PCV. Esos casos deben conservarse como pendientes de otra ruta, no darse por recuperados.
- **El despertar es demasiado grueso.** La unidad de reintento es empresa, no proveedor/ejercicio/campo. Despertar por Alpha no permite completar los 5.751 casos que siguen dependiendo de FDE. Tampoco constituye una promesa de nuevas incorporaciones a esa hora.
- **Telemetría de cuenta insuficiente.** Sólo EDINET DB conserva saldos de cabeceras en el transporte común. FDE no los conserva; Alpha trata `Note`/`Information` indistintamente y descarta el detalle. Las cuotas locales tampoco incluyen todos los importadores y aplicaciones que pueden usar credenciales.
- **Las claves no se rotan en el lote US activo.** FMP sólo usa sondeos independientes ya conservados. La segunda clave Alpha del módulo de eventos no se utiliza para eludir el bloqueo financiero.

## 4. Las 5.751 empresas: datos y potencial inmediato

Se inspeccionaron las **5751 empresas**, leyendo exclusivamente el estado original, registros y cachés, y ejecutando parsers puros sobre una instantánea SQL de solo lectura del **29/10/2026, 16:20:49**. No se llamó a funciones de persistencia, ni siquiera con rollback. El acceso HTTP del proceso auditor estaba deshabilitado. El análisis terminó en **29/10/2026, 16:50:56**.

| Evidencia de la cola | Resultado |
|---|---:|
| Empresas con un CIK inequívoco | 5751 |
| Empresas con submissions y CompanyFacts locales | 5751 |
| Informes anuales seleccionados | 21.460 |
| Combinaciones empresa/año sin informe seleccionado | 1544 |
| Informes con los 22 conceptos ya presentes | 307 |
| Informes con contexto primario válido para analizar complementos | 21.052 |
| Empresas con perfil FDE local | 64 |
| Empresas con alguna respuesta de estados FDE en caché | 0 |
| De las anteriores, sin más estados requeridos pendientes de descargar | 0 |
| Empresas con nuevos PCV/KPI calculables mediante el parser SEC actual y sin red | 0 |
| PCV / KPI nuevos SEC candidatos sin red | 0 / 0 |
| Empresas con candidatos adicionales válidos desde la caché FDE | 0 |
| PCV / KPI adicionales FDE candidatos sin red | 0 / 0 |
| Solicitudes FDE distintas aún necesarias para el recorrido analizado, no ejecutadas | 52.809 |
| Empresas de la cola con acceso remoto alternativo, licencia y contexto completos demostrados | 0 |

No se encontr? una respuesta contable FDE requerida que est? descargada y esperando persistencia en este grupo: hay 64 perfiles, pero cero estados requeridos en cach?. No hay, por tanto, un lote financiero FDE listo que baste con desbloquear localmente.

Se detect? un posible rec?lculo de `MARGEN_EBITDA` en un KPI no NULL ya existente: la diferencia bruta es aproximadamente 5 ? 10??? y afecta a la ?ltima cifra de su representaci?n decimal. No es un PCV nuevo ni un KPI ausente, no aumenta la cobertura y no se ha aplicado. Conviene revisar la comparaci?n y redondeo a precisi?n MySQL antes de contar ese tipo de operaci?n como progreso.

La cifra final de empresas listas para nuevas incorporaciones **con los conectores, permisos y cachés hoy acreditados** es **0**. No es una estimación de cuántas cifras existen en el universo ni una declaración de imposibilidad: los informes originales SEC y los endpoints no verificados mantienen potencial de investigación, sin una cantidad de PCV recuperables garantizada. No se incluyen revisiones que exigirían cambiar un KPI no NULL original sin revisión.

La muestra histórica AAPL accesible en FMP tiene **cero coincidencias** con estas 5.751 empresas. No permite atribuir acceso financiero probado al resto del mercado. Finnhub/Twelve carecen de integración contable y permisos comprobados; Alpaca/FRED/NYU no aportan los estados requeridos. Probar o activar cualquiera de ellos para descubrir su cobertura efectiva queda fuera de esta auditoría.

## 5. Descargado, procesado, certificado e inaccesible

El corte de certificación reutilizado es del **29/10/2026 16:02:34,950**; US no tuvo incorporaciones posteriores durante esta auditoría. Su subgrupo es la cola de 5.751 empresas, **no** todo el universo US de 8.017.

| Año | Informes seleccionados | PCV presentes | PCV certificados en ese corte | KPI presentes | KPI certificados en ese corte |
|---|---:|---:|---:|---:|---:|
| 2022 | 5.110 | 81.981 | 32.418 | 51.989 | 16.736 |
| 2023 | 5.378 | 87.304 | 29.046 | 56.205 | 14.700 |
| 2024 | 5.514 | 89.343 | 29.527 | 57.178 | 14.777 |
| 2025 | 5.458 | 88.428 | 27.028 | 56.780 | 13.377 |

- **Descargado y procesado:** el bulk SEC está materializado y los pases estándar V1/V2 recorrieron 8.017 empresas. `done` significa barrido finalizado, no 100 % de cobertura. La auditoría identifica por separado las empresas de la cola con ambos archivos y sus candidatos nuevos.
- **Descargado pendiente de procesar:** se ha contado la disponibilidad real de caché FDE y simulado sus campos independientes; no se presupone que un fichero descargado aporte un PCV nuevo. No se repiten descargas ni se reejecutan importaciones.
- **Pendiente de descargar:** quedan las solicitudes FDE distintas indicadas en la tabla y la investigación de documentos originales SEC no cubierta por los parsers actuales. El número de solicitudes no equivale a empresas ni a conceptos recuperables.
- **Presente pendiente de certificación:** en esta cola hay **229.037 PCV y 162.562 KPI** almacenados que aún no están certificados en ese corte. Algunos tienen conflictos de periodo ya diagnosticados; no se etiquetan todos como falsos ni se consideran huecos rellenables.
- **Ausente en la base:** las 1.544 combinaciones sin informe y los campos NULL/ausentes de los informes existentes son huecos del sistema. No prueban que no exista la información en la fuente.
- **Inaccesible temporalmente para nuestra cuenta:** FDE según su fecha de bloqueo, Alpha según el estado conservado; FMP primaria por autenticación y FMP regional por 402. No es ausencia histórica de datos.
- **Realmente inexistente o imposible en todas las fuentes:** ninguna de las 5.751 empresas ha sido demostrada como tal. No se convierten errores, moneda retenida o falta de etiquetas estándar en una ausencia real de información.

## 6. Duplicados, límites y contexto contable

Se observan medidas útiles: bulk SEC único, caché por proveedor/URL sin claves, consultas FDE fijadas a la publicación, saltos de estados no necesarios, comprobación de CIK, preservación de PCV no NULL, firma de checkpoints, un escritor financiero por país y protección de los KPI con deuda incompleta.

Quedan límites relevantes: los procesos legacy de perfiles/cotizaciones/eventos no comparten necesariamente el contador de la recuperación; un límite por proceso no prueba cumplimiento agregado de cuenta/IP. La caché de FDE permite evitar red antes del bloqueo, pero la secuencia de estados aborta el progreso parcial. No se cambian `as_of`, fecha, unidad o definición para ahorrar peticiones: sustituir el histórico por el último dato restated introduciría sesgo retrospectivo.

## 7. Cambios recomendados antes de ejecutarlos

1. **Separar calendario y estado por proveedor, empresa, ejercicio y conjunto de campos.** Registrar `blocked_until`, causa y si existe trabajo local ejecutable. Comprobar que el proveedor cubre el campo antes de pedir siquiera su perfil: los 50 informes se?alados no justifican pedir a FDE las acciones que su adaptador no ofrece. Mantener una sola autoridad financiera US y la reanudación actual hasta aprobar un plan de migración de checkpoints.
2. **Procesar primero toda evidencia local utilizable por campo.** Validar cada estado cacheado sin exigir que todos los otros endpoints respondan. Sólo persistir candidatos nuevos, coherentes y trazables. La cifra de recuperación inmediata es la medida arriba; no se promete un rendimiento que la caché no haya demostrado.
3. **Priorizar el siguiente incremento gratuito en SEC.** Construir, a partir de submissions ya descargadas y de los huecos reales, una cola de documentos originales 10-K/20-F/40-F y enmiendas. Extraer XBRL/iXBRL, contextos, dimensiones, moneda, unidad y cierre; incorporar extensiones sólo con equivalencia semántica probada. Respetar la tasa agregada SEC y reutilizar cualquier documento observado. Esa vía necesita trabajo técnico nuevo; no está activa ni se cuantifica como datos ya recuperados.
4. **Conservar FDE como complemento selectivo.** Esperar su ventana real, capturar cuota/cabeceras sanitizadas y solicitar sólo los estados y fechas requeridos por campos todavía ausentes. No pagar, crear claves ni cambiar el periodo para sortear el límite. No confundir 5.000 locales con la cuenta real.
5. **Mantener cerrados Alpha/FMP/Finnhub/Twelve mientras falten los permisos o la vinculación documental necesarios.** Verificar después, con sondeos mínimos autorizados, el entitlement exacto, la independencia de cuenta y el uso permitido. Claves diferentes no implican cupos agregables. Las fuentes de cotizaciones no se convierten en PCV.
6. **Mejorar la observabilidad sin secretos.** Guardar código HTTP, motivo saneado, contadores y fecha de reset originales, contador local frente a remoto, respuesta/caché identificada por hash y motivos por campo. Clasificar autenticación, plan, cuota, moneda, contexto y ausencia por separado. Evitar miles de mensajes que parecen llamadas cuando sólo reflejan un bloqueo reutilizado.
7. **Separar conciliación de recuperación.** Los valores originales no NULL con otro periodo no se arreglan rellenando huecos. Comparar resultados a precisi?n de almacenamiento debe evitar contabilizar cambios ?nfimos de redondeo como nueva cobertura. Cualquier revisión/versionado debe ser explícito y revisable, conservando originales, fórmulas y los denominadores de cobertura. No se garantiza 85 % manteniendo esos conflictos sin conciliar.

**No se ha ejecutado ninguno de esos cambios.** Se conserva el despertar US existente y los recuperadores japoneses en marcha. No se han reiniciado servicios ni contratado planes.

## Referencias verificables

- Código: `server/scripts/recuperar-complementos-sec-v5.cjs`, líneas 12–13 (ventanas/caché), 31–36 (FDE), 41–43 (Alpha y captura), 47 (mínimo del aplazamiento).
- Transporte: `server/scripts/pcv-http.cjs`, líneas 5 (política local), 19 (guardas), 23 (cabeceras sólo EDINET DB), 24 (429), 30 (Note/Information).
- Supervisión: `server/scripts/recuperar-pcv-watch.cjs`, línea 15 (respeta aplazamiento antes de arrancar); grafo de `server/scripts/recuperar-pcv-plan.cjs`.
- [SEC API y alcance de CompanyFacts](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [política de acceso SEC](https://www.sec.gov/about/privacy-information#security).
- [FinDataEngine: producto, histórico, cuota y dominio público](https://asreported.io/), [OpenAPI](https://asreported.io/openapi.json), [referencia de términos](https://asreported.io/terms).
- [Alpha Vantage: cuota gratuita](https://www.alphavantage.co/support/), [licencia](https://www.alphavantage.co/terms_of_service/).
- [FMP: precios](https://site.financialmodelingprep.com/developer/docs/pricing), [FAQ](https://site.financialmodelingprep.com/faqs), [términos](https://site.financialmodelingprep.com/terms-of-service).
- [Finnhub: términos y límites](https://finnhub.io/terms-of-service), [especificación oficial de estados](https://github.com/Finnhub-Stock-API/finnhub-go/blob/master/api/openapi.yaml).
- [Alpaca: alcance y límites Basic](https://docs.alpaca.markets/us/docs/about-market-data-api), [Twelve Data: créditos y planes](https://twelvedata.com/pricing), [FRED: alcance](https://fred.stlouisfed.org/docs/api/fred/) y [derechos por serie](https://fred.stlouisfed.org/docs/api/terms_of_use.html).
- Evidencias de diagnóstico FMP y evolución de cobertura: [INFORME_FMP_COMPLEMENTARIO.md](INFORME_FMP_COMPLEMENTARIO.md) e [INFORME_RECUPERACION_US_JP_TW.md](INFORME_RECUPERACION_US_JP_TW.md).

Los registros privados permiten reconstruir la selección sin publicar claves, nombres empresariales, accesiones privadas de trabajo ni importes financieros.
