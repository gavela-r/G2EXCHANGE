# Cobertura PCV/KPI 2022–2025: reglas de auditoría

El objetivo se evalúa en dieciséis celdas: PCV y KPI por separado para US/JP y cada cierre de 2022, 2023, 2024 y 2025. El universo fijo permanece en **8.017 empresas US y 3.581 JP**. No se eliminan duplicados, empresas recientes, bajas ni entidades sin instrumento para elevar el porcentaje.

## Tres mediciones distintas

1. **Presencia histórica:** conceptos del catálogo con importe no NULL y finito, dividido entre todas las empresas del país × 22 PCV; KPI almacenados no NULL dividido entre todas las empresas × 17 KPI. Cada concepto cuenta una sola vez. Se selecciona un anual por empresa/año civil de cierre, ordenado por cierre, publicación e ID descendentes. Conserva el indicador anterior; la presencia no certifica corrección contable.
2. **Uso local:** PCV presentes que acepta el normalizador existente, aislando únicamente el concepto ambiguo. Los valores reconstruidos que no estén almacenados no cuentan como PCV presentes. Los KPI reproducibles se comparan con la misma fórmula y los mismos datos locales. Tampoco certifica identidad, moneda, consolidación o periodo de las filas heredadas.
3. **Procedencia comprobada:** requiere cotejo con la fuente oficial y el contexto financiero exacto. No se presenta la medición de uso local como si fuera esta certificación.

La cobertura documental no equivale a cobertura PCV/KPI. La existencia de un informe pone un límite superior a la cobertura contable del conjunto de documentos registrados, incluso si se completaran todos sus conceptos.

## Elegibilidad e incertidumbre

La clasificación tiene tres estados: `YES`, `NO` y `UNKNOWN`. La falta de un informe, un ticker o una correspondencia no prueba inelegibilidad. Una salida a bolsa posterior al ejercicio tampoco prueba ausencia de información histórica: puede haber comparativos posteriores o documentación de registro.

`YES` exige identidad oficial y evidencia anual del cierre: SEC, nombre legal/CIK y presentación anual; EDINET, registro oficial más metadatos anuales o DEI del documento. Sin prueba independiente suficiente, permanece `UNKNOWN`. El registro actual no acredita por sí solo la obligación de presentar un documento en un año pasado.

Se publica el tamaño del subconjunto elegible confirmado y su cobertura, rotulada expresamente como **subconjunto incompleto**. El porcentaje del universo elegible total queda sin determinar mientras haya casos desconocidos. No se usa el subconjunto como sustituto del universo fijo ni como prueba del objetivo del 85 %.

## Fases y límites de observación

Se distinguen informe registrado, documento oficial localizado, fuente descargada, procesamiento, PCV almacenados y KPI almacenados/reproducibles. En US, disponer de CompanyFacts del emisor no significa haber descargado el documento original de cada presentación. En JP se comprueba el ZIP del documento. Los datos de una caché acreditan una observación fechada, no necesariamente el estado actual de la fuente.

Los journals permiten diagnosticar cuotas, identidad, discrepancias y errores técnicos. Un evento de empresa sin ejercicio no acredita el estado de cada año; se identifica esta limitación. La ausencia real sólo se afirma con evidencia positiva suficiente, nunca por un 404 de un proveedor complementario ni por un resultado vacío de un único buscador.

## Defectos estructurales comprobados en el código heredado

- La carga US parte de instrumentos asociados y de su ticker. Las empresas sin instrumento siguen en el denominador, pero esa ruta no las investiga.
- El descubrimiento original SEC sólo toma `filings.recent`, 10-K y 10-Q. Omite archivos históricos, enmiendas y anuales 20-F/40-F.
- La selección/retención original conserva sólo cuatro anuales. La llegada de 2026 puede desplazar 2022. La presencia simultánea de 2026 y ausencia de 2022 es un indicio cuantificable; no demuestra por sí sola la causa histórica de cada caso.
- El auditor original cuenta importes almacenados, incluidos los conflictos, como presencia. Un conflicto al normalizar impide calcular cualquier KPI del informe en su diagnóstico, incluso los independientes del concepto conflictivo.
- La recuperación anterior aborta todo el informe ante una discrepancia en ingresos, activos, pasivos o CFO. La instrucción de esta intervención exige conservar el valor y continuar con las partidas independientes.
- El catálogo heredado contiene fallbacks que no siempre son equivalentes a un total: componentes de deuda, inventario, intereses, amortización, pagos de dividendos, pasivos devengados y saldos amplios de efectivo. Una coincidencia textual o numérica no demuestra equivalencia financiera. Las filas originales se conservan y no se certifican por ese motivo.

## Fuentes oficiales consultadas

La [documentación oficial SEC](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) describe los archivos históricos, formularios admitidos y descarga masiva nocturna. CompanyFacts agrega taxonomías estándar y contexto de entidad, y no incluye todas las extensiones propias. Por ello, que una etiqueta no aparezca en CompanyFacts no prueba que la magnitud falte en el informe original.

La [política de acceso SEC](https://www.sec.gov/about/privacy-information#security) establece un máximo de diez solicitudes por segundo por usuario. Los conectores deben identificarse y mantener sus límites compartidos; una descarga masiva oficial reduce solicitudes sin eludir cuotas.

Para Japón se usa el [registro EDINET oficial](https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip), la API oficial y las [taxonomías de la FSA](https://www.fsa.go.jp/search/EDINET_Taxonomy_All.html). Los complementarios mantienen sus límites de cuenta y condiciones ya documentados en la intervención anterior. No se autoriza por defecto la redistribución de sus datos: sólo se publican código y recuentos agregados; respuestas, discrepancias con importes y backups permanecen privados.

## Implementación de esta intervención

El coordinador conserva las colas antiguas como retiradas, con su motivo, sin marcar sus checkpoints como completados. Las reemplaza por pases verificados que cubren su ámbito: archivos SEC → todas las empresas US → reintento de fallos transitorios → complementarios; caché JP → descubrimiento e importación inmediata por fecha → documentos pendientes → complementario. El grupo US es el grupo histórico de la tabla `empresa`, no una certificación del domicilio estadounidense de cada emisor.

Los PCV originales no NULL permanecen intactos. La nueva tabla aditiva `pcv_verification_evidence` conserva cotejos y discrepancias. Cada KPI nuevo o recalculado usa únicamente valores almacenados contrastados con un mismo contexto; los demás inputs heredados no se presuponen válidos. Las fórmulas financieras se reutilizan sin cambios. Un componente de deuda almacenado pero sin verificar impide presentar la suma parcial como deuda total en ese recálculo.

Las observaciones comparativas llevan un identificador local explícito (`accesión@cierre` o `documento@cierre`) y conservan la cita del documento real y su fecha. No se presentan como otra presentación original. Los cuatro ejercicios de recuperación se conservan al llegar 2026; la retención destructiva de metadatos US/JP queda desactivada.

FinDataEngine se consulta [a la fecha de la presentación](https://asreported.io/openapi.json), en lugar de dar por equivalentes cifras reexpresadas posteriores. Sus candidatos deben coincidir en emisor, accesión, cierre y fecha de presentación. Los candidatos Alpha sin accesión o fecha histórica verificable quedan en revisión y no se insertan en una presentación anterior. La [cuota gratuita Alpha](https://www.alphavantage.co/support/) es de 25 solicitudes diarias; se conserva el límite local conservador de 24. EDINET DB mantiene sus contadores de cuenta y [condiciones de uso](https://edinetdb.com/legal/terms); no se elevan sus saldos ni se rotan claves al agotarse la cuota.

La adaptación operativa de MySQL mantiene los bloqueos de informe/empresa, las claves únicas y la transacción atómica. Usa `READ COMMITTED` para evitar conflictos entre rangos vacíos de KPI y reintenta la transacción completa como máximo tres veces ante deadlock o timeout de bloqueo. Una llamada anidada con conexión prestada devuelve el error a la transacción exterior: no se reintenta parcialmente. La prueba MySQL inyecta el fallo después de comenzar la escritura y comprueba que informe, PCV y procedencia se revierten juntos. La política operativa y los hashes financieros se registran aparte; no se fuerza la firma de los checkpoints financieros.

Los paquetes privados incluyen SQL, configuración, checkpoints, código compilado, archivos SEC comprimidos y las respuestas/ZIP realmente observados. El JSON SEC reextraíble se omite para evitar otra copia de varios GB; el coordinador comprueba su materialización y la reconstruye antes de continuar si falta. Los hashes de los paquetes grandes se calculan en streaming. El archivo privado contiene credenciales y datos; no forma parte de la publicación Git.

## Reconstrucción de identidades japonesas desde el origen

Se ha localizado el [archivo exacto de entrada del importador original](https://github.com/code4fukui/EDINET/commit/b2f09399dc3cd7d813417de97e9c9d37451566ef), fechado el 31/10/2023. El repositorio indica licencia MIT. Se conserva privadamente su CSV, licencia y hash; sólo sirve para reconstruir la identidad original, nunca como fuente de cifras. El importador separaba con `split(',')`: un nombre entrecomillado con coma desplazaba las columnas y perdía el código bursátil. Las 3.581 denominaciones almacenadas se reproducen exactamente con ese parser; las 3.577 únicas conservan además el mismo desplazamiento entre orden de entrada e identificador de inserción (10.432). Esta secuencia acredita el origen del conjunto y no se usa para resolver nombres ambiguos.

El nuevo vínculo exige fila original única, código EDINET, número de persona jurídica de 13 dígitos idéntico en el registro original y oficial actual, código bursátil original y ausencia de contradicción con instrumentos existentes. Una baja bursátil actual no invalida un documento histórico si permanece el mismo código EDINET y persona jurídica. Un cambio de nombre permite únicamente los nombres legales completos acreditados por ambos registros. Antes de aceptar cifras se comprueba además el nombre completo de la portada XBRL oficial y sus códigos DEI, fecha, moneda y consolidación. Las colisiones, cambios de persona jurídica o instrumentos en conflicto quedan pendientes. No se modifican empresas, instrumentos, sectores ni el universo.

El corte de validación encuentra 787 candidatos adicionales a los 2.764 vínculos anteriores: 3.551 empresas con una ruta de identidad, y 30 pendientes. Un candidato no cuenta como documento ni PCV recuperado hasta superar la prueba del documento oficial. El coordinador añade un pase de caché, otro de descubrimiento y otro de documentos existentes para estas identidades, siempre serializados con el resto de fases JP. Los checkpoints anteriores conservan sus firmas. Las pruebas cubren cambios de nombre, baja bursátil, colisiones, números jurídicos/bursátiles incompatibles, secuencia distinta y una falsa etiqueta bajo namespace del emisor.

La copia alineada de las 10:22 UTC del 29/10/2026 se restauró en una base nueva, con las 29 tablas verificadas. El paquete privado incluye las fuentes reales; se verificaron el SQL y la configuración extraídos y se reprodujo la valoración 533 desde ese código. Los hashes del SQL, incluidos futuros archivos de más de 2 GB, se calculan en streaming durante exportación, restauración y comprobación del paquete.

## Contraste de periodos de los PCV estadounidenses originales

La comparación de la copia inicial contra CompanyFacts oficial conserva la misma etiqueta, accesión, formulario, fecha y unidad. Cuenta una vez cada concepto del informe seleccionado, además de informar las filas duplicadas por separado. Para 2022, 50.949 de los 53.254 slots originales sólo encuentran el importe almacenado en otros cierres de esa misma presentación; otros 24 sólo coinciden con otra duración/contexto. Para 2023 los recuentos son 59.657 y 21; para 2024, 61.084 y 40; para 2025, 62.706 y 46. Un valor coincidente en el periodo esperado no certifica por sí solo la equivalencia del concepto; un caso sin coincidencia sigue sin resolver, sin atribuirle fabricación.

Ejemplo de contexto, sin publicar importes: una presentación anual con cierre 2022 contiene ingresos comparativos de 2020 y balances comparativos de 2021; varios PCV etiquetados localmente como 2022 coinciden exclusivamente con esos comparativos. El problema no se resuelve contando la existencia de la fila ni por tener la accesión correcta. La evidencia por fila, hash de fuente y periodos coincidentes permanece privada. No se cambia el valor original ni su asociación como consecuencia de esta auditoría.

Esto impide certificar un 85 % real bajo la política de conservar esos slots canónicos sin conciliarlos, aunque se rellenasen todas las ausencias: el bloqueo de periodos ya supera el 15 % del denominador fijo en cada ejercicio US. Es una cota condicionada a mantener la selección y los valores conflictivos, no una afirmación de imposibilidad global de obtener estados correctos. Una futura conciliación/versionado debe ser explícita, conservar los originales y acreditar el contexto correcto; no se crean informes duplicados para desplazar silenciosamente los conflictos.

El pase SEC V2 mantiene separadas las firmas activas. Añade continuidad de nombre acreditada por el mismo CIK en ambos datasets oficiales, CAPEX `PaymentsToAcquireProductiveAssets` y deuda no corriente `LongTermDebtAndCapitalLeaseObligations`, comprobados en la [documentación oficial FASB](https://xbrl.fasb.org/us-gaap/2024/elts/us-gaap-doc-2024.xml). Las monedas nativas distintas de USD se diagnostican por separado; no se introducen en el esquema heredado como si fueran dólares. El auditor actualizado cruza IDs de fila, importes normalizados y cohortes de documento/moneda/consolidación/inicio; un KPI sólo se certifica si las fórmulas originales reproducen el valor con esos inputs. La evidencia de un periodo incorrecto nunca se convierte en cobertura válida por coincidencia de etiqueta.

El paquete portable conserva también los dos cortes SQL de comparación, con sus hashes y comprobantes: el original del 28/10 a las 17:58 y el inicial de esta intervención del 29/10 a las 08:02 UTC. En un equipo nuevo se restauran con `restaurar-db.cjs`, exclusivamente si aún no existen, en `g2_recovery_20261028_validation` y `g2_recovery_85_initial_20261029`, respectivamente. La restauración principal utiliza otra base nueva; nunca se restaura encima de producción. El auditor retrospectivo puede leer esa copia inicial y contrastarla con evidencia de producción limitada a un ID máximo (`--evidence-database` y `--evidence-max-id`), sin trasladar filas ni importes entre bases. Los informes públicos son regenerables desde estos cortes y la evidencia privada.

## Requisitos completos para KPI de deuda

La función heredada de suma permite obtener un subtotal cuando sólo hay un componente de deuda. El primer filtro de esta intervención evitaba mezclar otro componente almacenado sin verificar, pero omitía el caso en que ese componente no estaba almacenado. Se corrige con una puerta de elegibilidad: deuda total, neta y sus dos ratios requieren ambos componentes verificados; un cero explícito sí completa el requisito. La función financiera original y los PCV permanecen sin cambios. Las firmas originales de checkpoint se conservan y la nueva política tiene un comprobante separado con hashes.

El ensayo identifica 4.390 resultados KPI nuevos afectados y ningún KPI del corte inicial. Antes de compensarlos se exige una copia alineada restaurada, hashes correctos y checksums de KPI/ledger idénticos al backup. Las filas nuevas se conservan con valor NULL y se añade una operación compensatoria; si apareciese un KPI inicial afectado, se restauraría su valor inicial. La corrección no toca PCV. Las operaciones revertidas se excluyen de la contribución legítima. El auditor clasifica el requisito incompleto separadamente, sin presentarlo como un cálculo válido pendiente de ejecución. Una prueba MySQL con tablas temporales comprueba dry/commit, idempotencia, un margen independiente y el cero de deuda reportado.
