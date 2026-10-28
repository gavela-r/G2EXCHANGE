# Integración PCV/KPI de Estados Unidos y Japón — 28/10/2026

## Trabajo retomado

Repositorio principal `G2EXCHANGE`, rama encontrada `g2-pcv-supplement-20261028`, HEAD inicial `85901d6`. Copilot había modificado dos importadores y dejado sin seguimiento auditoría, recuperación primaria, smoke EDINET, helper de inserción y tests. Se conservaron sus originales en el directorio privado `private_backups/copilot-original/`, se reutilizó su auditoría y no se tocó el repositorio anidado. El frontend queda fuera del cambio.

El backup previo de Copilot, `g2-2026-10-28T17-58-31-790Z.sql`, se comparó con su restauración `g2_recovery_20261028_validation`: todas las tablas coincidían antes de importar. La auditoría inicial existente se conservó y la repetición `pcv-kpi-audit-baseline-verified-2022-2025.json` obtuvo los mismos porcentajes para los ocho períodos.

Backup de avance adicional: `private_backups/g2-2026-10-28T19-26-00-710Z.sql`, SHA-256 `c8708d8d8234b60c027b58ede68753f1fe65746441f1819c213ffd3271ec9d3b`. Se capturó un manifiesto de recuentos/checksums con un bloqueo breve de escritura y se restauró en `g2_recovery_pcv_progress_20261028`: las 27 tablas coinciden y el run 533 se reproduce. Conserva el avance hasta ese instante; los workers continuaron después. No restaurar un checkpoint más reciente que el dump como si correspondieran al mismo punto: usar un directorio nuevo y la idempotencia cuando no estén alineados.

## Implementación y seguridad de datos

El worker recomendado es `server/scripts/recuperar-pcv-proveedores.cjs`. Flujo US: SEC → FinDataEngine → Alpha Vantage. Flujo JP: EDINET oficial → EDINET DB. Taiwán queda excluido. Las tres claves complementarias se configuran únicamente en `.env` con los nombres de `.env.example`.

Se aplicó la migración aditiva 16 (`pcv_import_evidence`), ensayada dos veces en la copia y después aplicada dos veces sin modificar las tablas originales. Conserva el estado anterior y posterior, fuente, concepto, documento, contexto, moneda/unidad, política y hash de respuesta. Las inserciones de PCV, cálculo de KPI y ledger comparten una transacción por informe. La fila de informe bloqueada serializa la importación; no se elimina ni se colapsa ningún duplicado histórico. Un PCV no nulo nunca se sobrescribe. Un único PCV NULL puede completarse conservando su estado original en el ledger; NULL no se convierte automáticamente en cero.

Los KPI usan `kpiCalcularInforme` sin modificar sus fórmulas. Se insertan los que ahora pueden calcularse y se recalculan los existentes cuando nuevos PCV afectan al informe, conservando el valor anterior. Los conflictos de normalización dejan el cálculo pendiente. No se lanza el endpoint universal de KPI sobre todos los países.

Correcciones verificables:

- SEC: no se usa el prefijo del accession como CIK del emisor, pues puede corresponder al agente presentador. Directorio de tickers y registro histórico oficiales resuelven el CIK; CompanyFacts y, cuando hace falta, submissions confirman identidad y nombres anteriores con su intervalo de fechas. Se exige documento, cierre, duración anual y unidad exactos. HELIX, posteriormente renombrada, sirvió como ensayo real de los cuatro ejercicios: 74 PCV y 58 KPI nuevos; repetición sin duplicados.
- EDINET: XML XBRL del documento oficial valida código bursátil, código EDINET, cierre y consolidación mediante DEI. Los contextos anteriores, segmentos, unidades incompatibles y mezclas de consolidado/no consolidado se excluyen. Se corrigieron también BOM/TSV del parser CSV heredado y la admisión de contextos anteriores. El worker utiliza el camino XBRL estricto.
- EPS diluido: se detectó que faltaba en los 8.076 informes japoneses del universo auditado. El alias oficial `DilutedEarningsPerShareSummaryOfBusinessResults` no estaba reconocido. Se añadió y se probó con datos reales y fixtures, separando JPY/shares de JPY. FinDataEngine y EDINET DB también admiten su campo explícito de EPS con unidad por acción; no se usa EPS básico como sustituto ni se recalcula EPS con acciones no diluidas. Los NULL y contextos no publicados permanecen pendientes. El esquema DECIMAL(24,4) no debe transformar un importe diminuto no nulo en cero: esos casos se mantienen pendientes y el ledger conserva la precisión persistida junto al valor de origen.
- FinDataEngine: CIK/nombre, período anual, fecha de cierre y accession exactos; moneda respaldada por hechos USD del documento SEC. Una fila de otra reformulación queda pendiente.
- Alpha Vantage: CIK de OVERVIEW y ticker, moneda USD y cierre exacto de annualReports. No se usan informes trimestrales como anuales.
- EDINET DB: código EDINET y docID exactos, año y perímetro iguales a los verificados en el documento primario. No se usan snapshots recientes de acciones ni se sustituye CAPEX de caja por el resumen de inversiones.
- Signos: los campos complementarios de salidas de caja tienen una lista explícita de normalización. No se aplica ABS indiscriminadamente ni se cambian las fórmulas financieras.

Una segunda revisión SEC (`recuperar-sec-vinculados.cjs`) examina los informes bloqueados por identidad. Solo expande abreviaturas legales explícitas (Co/Company, Corp/Corporation, Inc/Incorporated, Ltd/Limited), puntuación, “&/and”, artículo inicial y sufijo estatal SEC. No usa distancia de nombres ni elimina palabras de actividad o filial. Además exige el CIK del emisor, nombre legal completo actual o anterior con fecha válida, y el accession exacto con formulario, cierre y publicación iguales en submissions oficial, incluido su historial cuando procede. El prefijo del accession es únicamente un candidato que debe superar todas esas comprobaciones. La traza conserva ambos nombres y hashes de submissions/índice; los nombres en MySQL no cambian. La coherencia de importes principales sigue siendo obligatoria antes de consultar complementarios.

Los informes nuevos JP tienen una recuperación específica de acciones emitidas al cierre (`recuperar-acciones-jp.cjs`). El XBRL oficial publica `TotalNumberOfIssuedSharesSummaryOfBusinessResults` en el contexto individual del emisor, aunque prepare estados consolidados. Se exige namespace oficial, emisor, cierre exacto, unidad shares, entero no negativo y ausencia de clases/segmentos o contradicciones. La procedencia identifica capital del emisor y acciones emitidas, sin construir un recuento diluido. Se excluyen snapshots de fecha de presentación. El piloto real pasó rollback, inserción y repetición sin duplicados, usando exclusivamente el ZIP verificado en caché. `--follow` permite completar también los informes que entren después.

En una muestra inicial no probabilística de 100 informes SEC bloqueados, 92 superaron la comprobación documental y tenían alguna discrepancia numéricamente coincidente con otro cierre del emisor; ocho no se verificaron mediante el candidato usado en el diagnóstico. Esto es un indicio que requiere revisión, no prueba general de la causa. No se corrigieron ni sobrescribieron los importes heredados. La cobertura publicada mide presencia; no certifica exactitud de todos los datos originales.

## Cuotas, condiciones y automatización

Solo se usan accesos gratuitos. [SEC documenta](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) CompanyFacts, unidades y el historial de nombres. Se configura un User-Agent de contacto real. El intervalo EDINET de 3,5 segundos es una política local conservadora. La [FAQ oficial](https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0090_001.html) avisa de posibles restricciones por carga; no publica un umbral fijo. Un 429 no provoca rotación de claves para saltarse la espera.

[FinDataEngine](https://asreported.io/) anuncia acceso gratuito a fundamentales; las respuestas probadas indicaron 30 solicitudes por ventana de minuto. Se espacia el acceso, se limita el consumo del proceso y se respetan las respuestas de throttling; no se contrata ni activa un plan de pago. [Alpha Vantage](https://www.alphavantage.co/support/) documenta 25 consultas gratuitas al día: el proceso reserva un margen para la prueba inicial y conserva el contador. Sus [condiciones](https://www.alphavantage.co/terms_of_service/) limitan la licencia estándar al análisis privado individual; la integración se usa en privado, sin redistribuir datos ni habilitar un servicio comercial.

[EDINET DB](https://edinetdb.com/docs/api) documenta 100 consultas gratuitas diarias y un límite mensual dependiente del alta. La cuenta probada devolvió 100/día y 200/mes; se respeta el remanente real de cabeceras además del límite local. Sus [condiciones](https://edinetdb.com/legal/terms) permiten análisis y uso en aplicaciones, exigen atribución para mostrar datos públicamente y prohíben la redistribución masiva y eludir cuotas. No se publican sus respuestas ni la base privada. Los cachés JSON tienen vigencia de 24 horas; los documentos oficiales inmutables se reutilizan por docID.

El contador HTTP se comparte entre directorios de lotes y se guarda por proveedor, para que iniciar otro directorio no reinicie la cuota. Se reservan peticiones antes de enviarlas, hay timeouts y reintentos acotados, y se detectan mensajes de cuota incluso bajo HTTP 200. No se imprimen claves, cabeceras de autenticación ni URLs con credenciales. No ejecutar dos workers del mismo país: GET_LOCK impide esa concurrencia.

Checkpoint por empresa, registro JSONL por informe, transacciones por informe y cola de empresas aplazadas por cuota/error transitorio. El supervisor reanuda checkpoints incompletos y espera al siguiente reinicio diario UTC para la cola aplazada. Una interrupción durante una empresa repite esa empresa de forma idempotente. Un checkpoint incompatible no se fuerza. Los datos que una fuente no proporciona legítimamente permanecen ausentes.

Los directorios V2 vuelven a examinar los documentos en caché con la corrección EPS; los checkpoints anteriores se conservaron. Se reprodujo un EPERM de Windows al renombrar el checkpoint y se añadieron ocho reintentos acotados que conservan el archivo anterior. La transición de huella por esta corrección operativa verificó que solo cambiaba el guardado, que los demás archivos financieros coincidían con la huella previa y conservó copias de los dos checkpoints. Después se verificó parada limpia y reanudación mediante `stop.request`.

El objetivo temporal es 2022–2025 por el año de **fecha de cierre** fiscal. El worker PCV trabaja sobre informes existentes. El nuevo `recuperar-informes-jp.cjs` descubre documentos ausentes mediante las listas diarias oficiales y el [registro EDINET de emisores](https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip). La recogida de junio de 2022 encontró 1.679 candidatos; el estado de su importación aparece en resultados. Otra recogida abarca publicaciones de enero de 2022 a junio de 2026, admitiendo exclusivamente cierres 2022–2025. Listados y documentos quedan en caché privada con hash.

Se exige nombre legal inglés único, país y código bursátil compatible. Sin instrumento, solo se admite nombre legal exacto y único en el registro; no se crea un instrumento ni se inventa un ticker. Los nombres cortados por el antiguo parser CSV requieren además código bursátil independiente coincidente. El parser corregido conserva comas entre comillas; no se renombraron empresas existentes. Se rechazan documentos retirados, trimestrales, sin XBRL o fuera del período. El XBRL verifica emisor, cierre, duración y perímetro.

La migración aditiva 17 añade `financial_report_evidence`, ensayada dos veces en la copia antes de producción. Se verificó antes la restauración de las 27 tablas del backup `g2-2026-10-28T21-11-20-112Z.sql`, SHA-256 `ec57b58da784f4d080d413e4d92a3cdfee6da23c4e55b271154cf1caf5f683df`. Informe, PCV, KPI y ambas trazas se confirman en una única transacción; cero PCV válidos provoca rollback. Nunca se sustituye un informe anual existente para la misma empresa/año. El piloto real y su repetición comprobaron que la segunda ejecución no añade duplicados.

El barrido EDINET es lento por el tamaño de la cartera y el espaciamiento de peticiones: terminar un barrido no significa alcanzar el 100% de cobertura. El supervisor acepta `--job reports-jp`, conserva el checkpoint por documento y espera si otro lote JP mantiene el bloqueo.

## Auditoría y definición de cobertura

Para cada país/año se selecciona un informe anual por empresa, con cierre/publicación/id más recientes. PCV es presencia de importe finito en el catálogo activo con alias del proveedor principal (22 conceptos). KPI es presencia en las 17 fórmulas existentes. La primera tabla calcula porcentajes **sobre informes disponibles**: al añadir informes antes ausentes cambia el denominador y puede bajar el porcentaje aunque crezcan los datos presentes. La segunda usa denominador fijo: empresas objetivo × 22 PCV o × 17 KPI por año. Ninguna equivale a empresas con cuatro ejercicios auditados. Ausencias de informe, conflictos, conceptos potencialmente no aplicables y núcleo de 17 partidas se cuentan aparte. Ambas auditorías usan la misma regla de selección y snapshot consistente de MySQL.

| Período | PCV inicial | KPI inicial |
|---|---:|---:|
| US 2022 | 79,5266% | 72,0934% |
| US 2023 | 80,5767% | 73,4642% |
| US 2024 | 79,8313% | 72,4034% |
| US 2025 | 79,6570% | 71,8574% |
| JP 2022 | 90,9163% | 93,3371% |
| JP 2023 | 91,1000% | 93,2054% |
| JP 2024 | 91,0629% | 93,1341% |
| JP 2025 | 91,0938% | 93,1329% |

Agregados iniciales: US PCV 79,9053%, KPI 72,4556%; JP PCV 91,0723%, KPI 93,1715%. Universo: 8.017 empresas US y 3.581 JP. Con cuatro informes: 2.955 US y 630 JP. Con cuatro ejercicios y núcleo de 17 PCV presente: 204 US y 341 JP. No se consideran estas cifras una auditoría de importes o aplicabilidad por sector.

## Operación y recuperación

Validación ejecutada: motor (20 pruebas), backend (59 pruebas) y cuatro pruebas de integración MySQL aprobadas; compilación completa aprobada. Las pruebas cubren rollback con fallo después de escribir, conservación de originales, NULL completado con evidencia, repetición sin duplicados, CIK/nombres históricos y abreviaturas legales con documento exacto, períodos, unidades, perímetro, TSV/BOM, EPS, acciones emitidas del emisor, cuotas, reinicio diario sin perder el presupuesto mensual y reintentos de locks Windows. El lote japonés se interrumpió y reanudó realmente desde su checkpoint; la integridad se comparó con la copia inicial.

Un clon real de la rama publicada instaló dependencias, compiló y pasó las 77 pruebas unitarias sin `.env`. Se corrigieron tres dependencias con avisos nuevos de seguridad mediante actualizaciones compatibles; audit de servidor y motor sin vulnerabilidades conocidas en la comprobación ejecutada. El hash del esquema coincide también en el clon Windows. No se modificó el frontend.

Compilar antes de ejecutar. Instalar dependencias desde la rama actual y mantener `.env`, dumps, cachés, logs y checkpoints en privado. No compartir directorios de checkpoints. El script de primarias dejado por Copilot ahora delega al worker seguro, con escritura explícita y un directorio por país; su checkpoint antiguo se conserva y no se interpreta como si tuviera el formato nuevo.

```powershell
npm.cmd --prefix server run build
node server/scripts/recuperar-pcv-proveedores.cjs --country US --limit 1 --directory private_backups/piloto-us
node server/scripts/recuperar-pcv-proveedores.cjs --country JP --limit 1 --directory private_backups/piloto-jp
node server/scripts/recuperar-pcv-proveedores.cjs --country US --write --primary-only --directory private_backups/pcv-us-primary-full --resume
node server/scripts/recuperar-pcv-watch.cjs --country JP --write --directory private_backups/pcv-jp-full-v2
```

El supervisor detecta el checkpoint sin requerir `--resume`. Para una pasada US con complementarios, después de terminar la primaria:

```powershell
node server/scripts/recuperar-pcv-watch.cjs --country US --write --directory private_backups/pcv-us-complementarios-v2
node server/scripts/recuperar-pcv-watch.cjs --job sec-bound --directory private_backups/pcv-us-vinculados --write
```

Descubrimiento e importación de informes JP ausentes (la recogida debe terminar antes de importar):

```powershell
node server/scripts/recuperar-pcv-watch.cjs --job reports-jp --phase collect --from 2022-06-01 --to 2022-06-30 --directory private_backups/pcv-jp-documentos-jun2022
node server/scripts/recuperar-pcv-watch.cjs --job reports-jp --phase import --source-directory private_backups/pcv-jp-documentos-jun2022 --directory private_backups/pcv-jp-informes-jun2022 --write
node server/scripts/recuperar-pcv-watch.cjs --job reports-jp --phase collect --from 2022-01-01 --to 2026-06-30 --directory private_backups/pcv-jp-documentos-resto
node server/scripts/recuperar-pcv-watch.cjs --job reports-jp --phase import --source-directory private_backups/pcv-jp-documentos-resto --directory private_backups/pcv-jp-informes-resto --write
node server/scripts/recuperar-pcv-watch.cjs --job jp-issued-shares --directory private_backups/pcv-jp-acciones --write --follow
```

Para ensayar una importación, usar un directorio distinto y omitir `--write`; `--limit 1` acota el piloto. Las pruebas de inserción de informes no usan tablas permanentes. El esquema inicial incluye las migraciones 16 y 17; en una base existente se aplican de forma aditiva después de verificar backup y prueba aislada.

Para parar desde otra terminal, sin depender del PID ni interrumpir una transacción:

```powershell
node server/scripts/recuperar-pcv-watch.cjs --stop --directory private_backups/pcv-jp-full-v2
node server/scripts/recuperar-pcv-watch.cjs --stop --directory private_backups/pcv-us-complementarios-v2
```

Para reanudar, retirar únicamente el archivo de control `stop.request` de ese directorio y repetir el comando del supervisor. Conservar `checkpoint.json`, journals y cuotas. Un cambio de política financiera exige un directorio nuevo; no editar la firma para saltarse la comprobación. El supervisor y el ordenador deben seguir operativos: no se ha contratado alojamiento remoto.

Pruebas y comparación:

```powershell
npm.cmd test
npm.cmd --prefix server run test:integration
npm.cmd --prefix server run test:pcv:integration
node server/scripts/verificar-pcv-integridad.cjs g2_recovery_20261028_validation
node server/scripts/auditar-pcv-kpi-2022-2025.cjs --after
node server/scripts/informe-pcv-proveedores.cjs
node server/scripts/verificar-publicacion.cjs --history
node server/scripts/backup-db.cjs
```

Para verificar un backup tomado durante la recuperación activa, usar un manifiesto del mismo instante:

```powershell
node server/scripts/backup-pcv-consistente.cjs
node server/scripts/restaurar-db.cjs ruta-privada/backup.sql g2_recovery_nuevo
node server/scripts/verificar-backup-pcv.cjs ruta-privada/backup.sql g2_recovery_nuevo
```

Estos comandos nunca restauran encima de producción. El manifiesto y el dump permanecen privados. El bloqueo global del exportador se libera incluso si falla el proceso.

Para un paquete portátil alineado, detener antes los supervisores de proveedores mediante `stop.request`, esperar a que liberen los bloqueos, crear/restaurar/verificar el dump y ejecutar `node server/scripts/backup-controles-pcv.cjs ruta-privada/backup.sql`. El script rechaza checkpoints no pausados y una base que ya difiera del dump. Incluye `.env`, motores archivados, compilados, scripts, checkpoints, auditorías y cuotas. Omite las respuestas masivas en caché, que pueden descargarse de nuevo. El tar contiene credenciales y datos privados: se conserva fuera de GitHub. La reanudación se hace retirando únicamente los archivos `stop.request` de los trabajos elegidos.

`verificar-pcv-integridad` exige cero PCV originales no nulos alterados, cero filas perdidas, trazabilidad de nuevos PCV/KPI y cambios de KPI, y conservación de empresas, instrumentos, todos los informes originales, versiones, snapshots, runs, resultados y taxonomías. Cada informe nuevo debe tener su traza y pertenecer a JP 2022–2025. Comprueba también que no se cambia PCV ni KPI fuera de US/JP 2022–2025. La reparación de fechas y la actualización de versiones financieras usadas por valoraciones son fases separadas; no se han relanzado valoraciones con hipótesis para aumentar cobertura.

El estado de los procesos y la comparación actualizada se generan en `RESULTADOS_PROVEEDORES_20261028.md`. Si hay cuotas pendientes o un barrido en curso, se declara expresamente allí: implementación, pruebas y recuperación parcial no equivalen a cobertura completa.
