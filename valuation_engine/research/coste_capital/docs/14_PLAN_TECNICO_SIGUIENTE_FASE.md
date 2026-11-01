# Fase 2 — plan técnico siguiente, sin ejecución

## Decisión recomendada

**Priorizar identidad y fechas antes de alimentar el módulo o recuperar masivamente precios.** Hay 13.194 empresas, pero no una base homogénea validada para primas. Resolver primero las incidencias observadas y especificar cómo conservar histórico diario. No modificar el WACC ni activar cuantificación: Amihud y tamaño residual siguen sin datos de mercado suficientes.

## P0 — conservar y conciliar sin corregir históricos automáticamente

1. Revisar en una copia autorizada los 299 instrumentos TW/Tokyo/TWD de 294 empresas y sus 1.176 informes EDINET. Conciliar país de empresa, bolsa, moneda real, código local, ISIN, emisor legal y documento original. Investigar colisión de tickers numéricos, sin darla por causa demostrada. La UNIQUE global de ticker es un riesgo confirmado; no cambiarla antes del inventario de consumidores.
2. Revisar las 88.464 fechas VIV desplazadas un día. Distinguir error de serialización de discrepancia real de periodo. Preparar una solución versionada que conserve valores/fechas originales y soporte replay, no un UPDATE general de +1 día. Los cuatro casos coincidentes y las distintas rutas de importación deben formar parte de la validación.
3. Recuperar publicación original de los informes FINMIND y evidencias de consolidación/moneda/escala. Para propuestas históricas, una fecha supuesta o descargada hoy no equivale a disponibilidad original. No completar NULL por calendario.
4. Separar en el futuro adaptador de investigación las observaciones bloqueadas, pendientes y validadas sin borrar información, alterar valores de producción o cambiar los recuperadores en esta fase. No usar las 294 empresas TW como comparables por tener números completos.

Reutilizar empresa/instrumento/mercado, taxonomía, classification_evidence, financial_report_evidence, pcv_import_evidence y pcv_verification_evidence. Las evidencias actuales ya contienen parte de lo necesario: no crear otra capa de identidad paralela sin examinarla.

## P1 — especificar y ensayar la conservación diaria

La única tabla bursátil canónica encontrada es cotizacion_diaria. Antes de proponer otra tabla, ensayar cómo ampliar esta manteniendo id/instrumento/fecha/precio y los lectores del último precio. Diseño candidato sujeto a revisión: clave única instrumento+sesión (y feed/versión si el requisito lo exige), índice para último/rango, columnas nullable de volumen de acciones e importe negociado, moneda/feed/fuente, fecha real de observación, ajuste y estado de calidad. No escribir volumen=0 cuando no se obtuvo dato.

El escritor actual solo actualiza el precio en conflicto. La especificación futura deberá distinguir misma sesión/revisión y un nuevo día, preservar la fecha correcta y registrar procedencia. Las filas legacy precio-fecha no reconciliadas requieren un tratamiento explícito; no se insertan en un backtest como si estuvieran fechadas correctamente. Cambiar la UNIQUE no recupera precios perdidos.

Dependencias: prepararInstrumento (asOf/último precio/perfil rating/pesos), guardarCotizacionesUSA/Taiwan/Japon, ruta de actualización USA, consulta de seguimiento y lectores de snapshots/ejecuciones. Probar además supuestos de herramientas operativas y la consulta de seguimiento con columnas hoy ausentes. No eliminar ni sustituir la tabla actual. Todo DDL, cambio de escritor o programación queda **pendiente de aprobación de otra fase**.

## P2 — fuentes y consistencia de series

Reutilizar primero proveedores ya integrados y sus datos existentes con licencia compatible. TWSE ofrece una vía oficial para volumen/importe histórico; en US evaluar históricos diferidos del feed Alpaca existente y sus derechos; Japón conserva un bloqueo real de disponibilidad/licencia a 0 €. No usar la API personal J-Quants como fuente corporativa. No contratar una solución alternativa para cerrar la tarea.

Definir, antes de calcular: sesión/bolsa/calendario, cobertura del feed, precios ajustados/no ajustados, splits/dividendos, volumen de acciones frente a moneda, cero negociado confirmado frente a ausencia, exclusiones y número de observaciones. Un día sin fila no significa iliquidez. Una aproximación cierre×volumen requiere etiqueta, validación y no se presenta como importe transado observado.

## P3 — capitalización por instrumento y emisor

Usar precio y acciones en circulación de la misma clase/fecha/base; acciones emitidas menos propias cuando corresponda, sin sustituir por promedio diluido. Documentar acciones emitidas JP actualmente almacenadas, cambios de capital, ADR, clases múltiples, ISIN y número de acciones. No sumar instrumentos de un emisor duplicando capitalización.

El resultado futuro debe distinguir precio/acciones disponibles, conciliados y bloqueados. Hoy hay 6.269 parejas numéricas parciales, cero conciliaciones integrales acreditadas automáticamente y 6.925 empresas sin pareja admisible. Ninguna de esas cifras autoriza calcular un size premium.

## P4 — reutilizar indicadores e incorporar controles de calidad

Reutilizar PCV/taxonomía y KPI existentes cuando los insumos estén acreditados. No confiar en la etiqueta ALTA o en la moneda VIV sin contrastar. La deuda requiere CP/LP o una definición financiera total completa y conciliada; no pasivos. FCF legacy requiere conciliación de signo/CFO/CAPEX. Completar AC/PC/prepagos a partir de documentos ya disponibles antes de añadir fuentes innecesarias. Bancos/seguros requieren sus indicadores propios.

La auditoría exhaustiva de disponibilidad no es una auditoría de cada JSON contable. Para ampliar la certificación de calidad, priorizar campos/empresas concretos con lectura por IDs e índices; si se requiere revisar masivamente varios GB, usar una copia de solo lectura autorizada o ventana acordada, sin competir con recuperación. No ejecutar un JOIN JSON global sobre toda la evidencia. Los conteos de muestra no se extrapolan.

## P5 — comparables y adaptador al módulo de fase 1

Reutilizar clasificación aceptada HIGH y mapeo sectorial ya existentes, pero mantener N/A y familia pendiente visibles. No elegir la plantilla general para ocultar la falta de sector. El detalle por país/sector/bolsa/familia está en cobertura_resumen.json; no hay subsector normalizado. Los 32 grupos con al menos dos observaciones consolidadas de tamaño básico solo son candidatos descriptivos: comprobar actividad, duración, año fiscal, moneda/base y fuente antes de compararlos.

Preparar posteriormente un **adaptador de lectura** pequeño al contrato Dato/PeriodoFinanciero/Empresa/Benchmark de research/coste_capital/src. Debe aportar valor, unidad y escala real, moneda, fecha, conocidoDesde, fuente y validación; nunca convertir NULL a cero, completar fechas con defaults ni mezclar PCV/VIV desalineados. Mantener distintos conceptos de liquidez financiera, bursátil, insolvencia y comerciabilidad. No llamar escritores o importar módulos backend con efectos de conexión/persistencia para calcular ratios.

Para Amihud, alimentar sesiones con retorno ajustado e importe monetario validado, calendario y cobertura. Para tamaño, primero capitalización conciliada y controles de calidad, negocio, rentabilidad, deuda y liquidez; después investigación residual con retornos/factores adecuados. Con los datos actuales ese último paso sigue bloqueado. No convertir percentiles o medianas en primas. Referencias actuales de ERP total ya contienen país; no duplicarlo.

## Criterios de aceptación de una fase futura

- Identidad/país/bolsa/moneda y periodos reconciliados con evidencia, preservando originales.
- Serie diaria verificable con fuente/feed/ajustes, huecos y ceros identificados; sin afirmar amplitud suficiente solo porque se almacenó una ventana.
- Capitalización por clase y emisor documentada, con acciones propias/splits/ADR y fecha apropiada.
- Indicadores con estados VERDE/AMARILLO/ROJO/GRIS y denominadores; desconocidos sin cuantificar.
- Comparables con miembros explícitos, fuentes, corte, base, selección/exclusiones y versión, sin sesgo futuro.
- Adaptador interno probado sin conexiones de escritura, con pruebas de fechas, monedas, unidades, duplicados y familias.
- Producción, WACC/DCF, 16 maestros y valoraciones anteriores inalterados; cualquier nueva fórmula/modelo requerirá validación y aprobación separadas.

**No se han ejecutado estos pasos de implementación.** Esta fase entrega diagnóstico, consultas auditables y propuestas. No contiene una migración ejecutable nueva, recuperador, endpoint, activación o estimación de primas.

## Archivos nuevos y reproducción

Los cinco informes nuevos son docs/10_AUDITORIA_MYSQL_REAL.md, 11_AUDITORIA_COTIZACIONES.md, 12_COBERTURA_LIQUIDEZ_TAMANO.md, 13_FUENTES_GRATUITAS_PENDIENTES.md y 14_PLAN_TECNICO_SIGUIENTE_FASE.md. Los informes 01–09 y README de fase 1 no se sobrescriben.

fase2/auditar_mysql.cjs permite lectura por fases --metadatos, --contexto, --financieros y --final; utiliza dependencias existentes y controles de sesión/SQL. resumir_datos.cjs agrega localmente resultados y generar_informes.cjs genera estos informes con protección de no sobrescritura. Los logs conservan también el intento parcial que se detuvo por límite; no se usa como cobertura final.

Repetir la auditoría carga otra vez datos y puede dar cifras distintas por recuperación activa. Para consultar la entrega no hace falta volver a conectarse: usar los informes y evidencias ya conservados. No ejecutar los scripts de migración, reparación, estado/escritura o recuperación del repositorio como parte de esta lectura.

La comprobación final de integridad de archivos se registra por separado en fase2/evidencias/integridad_final.json. No se comparan checksums de tablas reales: las recuperaciones autorizadas pueden cambiar sus filas mientras la auditoría solo lee. La trazabilidad de SQL y los controles READ ONLY acreditan que esta intervención no ejecutó escrituras.

## Estado final verificable de esta entrega

La auditoría utiliza lecturas y agregaciones sobre MySQL real, sin código de modificación SQL. El guard de SQL y los logs se validan con fase2/verificar_entrega.cjs, **sin conectar de nuevo**. Este control comprueba denominadores, unicidad de informes después de subdividir bloques, conciliación de totales por país, corte temporal, DDL real frente al versionado, muestra explícita y preservación de fuentes/plantillas/manifiesto.

Las observaciones masivas y un checkpoint de la auditoría permanecen localmente bajo fase2/evidencias y se excluyen de commits mediante un .gitignore nuevo de esa carpeta; no se eliminan. Los agregados, consultas y documentos permiten revisar la entrega sin ejecutar recuperaciones o nuevas lecturas. Tres informes operativos preexistentes cambiaron fuera de esta intervención durante la sesión, con hashes registrados; no se sobrescribieron. Los informes 01–09, README y módulo de fase 1 quedan intactos.
