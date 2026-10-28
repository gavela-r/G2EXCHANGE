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

## Cuotas, condiciones y automatización

Solo se usan accesos gratuitos. [SEC documenta](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) CompanyFacts, unidades y el historial de nombres. Se configura un User-Agent de contacto real. EDINET se limita globalmente a solicitudes espaciadas; un 429 no provoca rotación de claves para saltarse la espera.

[FinDataEngine](https://asreported.io/) anuncia acceso gratuito a fundamentales; las respuestas probadas indicaron 30 solicitudes por ventana de minuto. Se espacia el acceso, se limita el consumo del proceso y se respetan las respuestas de throttling; no se contrata ni activa un plan de pago. [Alpha Vantage](https://www.alphavantage.co/support/) documenta 25 consultas gratuitas al día: el proceso reserva un margen para la prueba inicial y conserva el contador. Sus [condiciones](https://www.alphavantage.co/terms_of_service/) limitan la licencia estándar al análisis privado individual; la integración se usa en privado, sin redistribuir datos ni habilitar un servicio comercial.

[EDINET DB](https://edinetdb.com/docs/api) documenta 100 consultas gratuitas diarias y un límite mensual dependiente del alta. La cuenta probada devolvió 100/día y 200/mes; se respeta el remanente real de cabeceras además del límite local. Sus [condiciones](https://edinetdb.com/legal/terms) permiten análisis y uso en aplicaciones, exigen atribución para mostrar datos públicamente y prohíben la redistribución masiva y eludir cuotas. No se publican sus respuestas ni la base privada. Los cachés JSON tienen vigencia de 24 horas; los documentos oficiales inmutables se reutilizan por docID.

El contador HTTP se comparte entre directorios de lotes y se guarda por proveedor, para que iniciar otro directorio no reinicie la cuota. Se reservan peticiones antes de enviarlas, hay timeouts y reintentos acotados, y se detectan mensajes de cuota incluso bajo HTTP 200. No se imprimen claves, cabeceras de autenticación ni URLs con credenciales. No ejecutar dos workers del mismo país: GET_LOCK impide esa concurrencia.

Checkpoint por empresa, registro JSONL por informe, transacciones por informe y cola de empresas aplazadas por cuota/error transitorio. El supervisor reanuda checkpoints incompletos y espera al siguiente reinicio diario UTC para la cola aplazada. Una interrupción durante una empresa repite esa empresa de forma idempotente. Un checkpoint incompatible no se fuerza. Los datos que una fuente no proporciona legítimamente permanecen ausentes.

Los directorios V2 vuelven a examinar los documentos en caché con la corrección EPS; los checkpoints anteriores se conservaron. Se reprodujo un EPERM de Windows al renombrar el checkpoint y se añadieron ocho reintentos acotados que conservan el archivo anterior. La transición de huella por esta corrección operativa verificó que solo cambiaba el guardado, que los demás archivos financieros coincidían con la huella previa y conservó copias de los dos checkpoints. Después se verificó parada limpia y reanudación mediante `stop.request`.

El objetivo temporal es 2022–2025 por el año de **fecha de cierre** fiscal. El worker recupera PCV en informes anuales que ya existen en MySQL; no crea informes anuales ficticios para los años sin documento. La ausencia de informe se muestra en cobertura y requiere una fase posterior de descubrimiento/importación de documentos verificables. El barrido EDINET es lento por el tamaño de la cartera y el espaciamiento de peticiones: terminar un barrido no significa alcanzar el 100% de cobertura.

## Auditoría y definición de cobertura

Para cada país/año se selecciona un informe anual por empresa, con cierre/publicación/id más recientes. PCV es presencia de importe finito en el catálogo activo con alias del proveedor principal (22 conceptos). KPI es presencia en las 17 fórmulas existentes. Estos porcentajes se calculan **sobre los informes disponibles**; no representan el porcentaje de todas las empresas con cuatro ejercicios auditados. Las empresas sin informe, los conflictos de normalización, los conceptos potencialmente no aplicables y el núcleo de 17 partidas se cuentan por separado. El informe final usa exactamente la misma selección y denominadores para antes/después; la lectura final se hace con snapshot consistente de MySQL.

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

Validación ejecutada: motor, backend y tres tests de integración MySQL aprobados; compilación completa aprobada. Las pruebas PCV cubren rollback con fallo inyectado después de escribir, conservación de originales, NULL completado con evidencia, repetición sin duplicados, CIK/nombres históricos, períodos, unidades, perímetro, TSV/BOM, EPS, cuotas, reinicio diario sin perder el presupuesto mensual y reintentos de locks Windows en checkpoints, cuotas y cachés. El lote japonés se interrumpió y reanudó realmente desde su checkpoint; la integridad se comparó con la copia inicial.

Un clon real de la rama publicada instaló dependencias, compiló y pasó los 66 tests unitarios sin `.env`. Se corrigieron tres dependencias con avisos nuevos de seguridad mediante actualizaciones compatibles; audit de servidor y motor sin vulnerabilidades conocidas en la comprobación ejecutada. No se modificó el frontend.

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
```

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
node server/scripts/backup-db.cjs
```

Para verificar un backup tomado durante la recuperación activa, usar un manifiesto del mismo instante:

```powershell
node server/scripts/backup-pcv-consistente.cjs
node server/scripts/restaurar-db.cjs ruta-privada/backup.sql g2_recovery_nuevo
node server/scripts/verificar-backup-pcv.cjs ruta-privada/backup.sql g2_recovery_nuevo
```

Estos comandos nunca restauran encima de producción. El manifiesto y el dump permanecen privados. El bloqueo global del exportador se libera incluso si falla el proceso.

`verificar-pcv-integridad` exige cero PCV originales no nulos alterados, cero filas perdidas, trazabilidad de todos los nuevos PCV/KPI y cambios de KPI, y conservación de empresas, informes, versiones, snapshots, runs, resultados y taxonomías. Comprueba también que no se cambia PCV fuera de US/JP 2022–2025. La reparación de fechas y la actualización de versiones financieras usadas por valoraciones son fases separadas; no se han relanzado valoraciones con hipótesis para aumentar cobertura.

El estado de los procesos y la comparación actualizada se generan en `RESULTADOS_PROVEEDORES_20261028.md`. Si hay cuotas pendientes o un barrido en curso, se declara expresamente allí: implementación, pruebas y recuperación parcial no equivalen a cobertura completa.
