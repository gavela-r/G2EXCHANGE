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
