# Integración PCV/KPI de Estados Unidos y Japón — 28/10/2026

## Trabajo retomado

Repositorio principal `G2EXCHANGE`, rama encontrada `g2-pcv-supplement-20261028`, HEAD inicial `85901d6`. Copilot había modificado dos importadores y dejado sin seguimiento auditoría, recuperación primaria, smoke EDINET, helper de inserción y tests. Se conservaron sus originales en el directorio privado `private_backups/copilot-original/`, se reutilizó su auditoría y no se tocó el repositorio anidado. El frontend queda fuera del cambio.

El backup previo de Copilot, `g2-2026-10-28T17-58-31-790Z.sql`, se comparó con su restauración `g2_recovery_20261028_validation`: todas las tablas coincidían antes de importar. La auditoría inicial existente se conservó y la repetición `pcv-kpi-audit-baseline-verified-2022-2025.json` obtuvo los mismos porcentajes para los ocho períodos.

## Implementación y seguridad de datos

El worker recomendado es `server/scripts/recuperar-pcv-proveedores.cjs`. Flujo US: SEC → FinDataEngine → Alpha Vantage. Flujo JP: EDINET oficial → EDINET DB. Taiwán queda excluido. Las tres claves complementarias se configuran únicamente en `.env` con los nombres de `.env.example`.

Se aplicó la migración aditiva 16 (`pcv_import_evidence`), ensayada dos veces en la copia y después aplicada dos veces sin modificar las tablas originales. Conserva el estado anterior y posterior, fuente, concepto, documento, contexto, moneda/unidad, política y hash de respuesta. Las inserciones de PCV, cálculo de KPI y ledger comparten una transacción por informe. La fila de informe bloqueada serializa la importación; no se elimina ni se colapsa ningún duplicado histórico. Un PCV no nulo nunca se sobrescribe. Un único PCV NULL puede completarse conservando su estado original en el ledger; NULL no se convierte automáticamente en cero.

Los KPI usan `kpiCalcularInforme` sin modificar sus fórmulas. Se insertan los que ahora pueden calcularse y se recalculan los existentes cuando nuevos PCV afectan al informe, conservando el valor anterior. Los conflictos de normalización dejan el cálculo pendiente. No se lanza el endpoint universal de KPI sobre todos los países.

Correcciones verificables:

- SEC: no se usa el prefijo del accession como CIK del emisor, pues puede corresponder al agente presentador. Directorio de tickers y registro histórico oficiales resuelven el CIK; CompanyFacts y, cuando hace falta, submissions confirman identidad y nombres anteriores con su intervalo de fechas. Se exige documento, cierre, duración anual y unidad exactos. HELIX, posteriormente renombrada, sirvió como ensayo real de los cuatro ejercicios: 74 PCV y 58 KPI nuevos; repetición sin duplicados.
- EDINET: XML XBRL del documento oficial valida código bursátil, código EDINET, cierre y consolidación mediante DEI. Los contextos anteriores, segmentos, unidades incompatibles y mezclas de consolidado/no consolidado se excluyen. Se corrigieron también BOM/TSV del parser CSV heredado y la admisión de contextos anteriores. El worker utiliza el camino XBRL estricto.
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

Validación ejecutada: 20 tests de motor, 46 de backend y 3 de integración MySQL aprobados; compilación completa aprobada. Las pruebas PCV cubren rollback con fallo inyectado después de escribir, conservación de originales, NULL completado con evidencia, repetición sin duplicados, CIK/nombres históricos, períodos, unidades, perímetro, TSV/BOM, cuotas y reintentos. El lote japonés se interrumpió y reanudó realmente desde su checkpoint; la integridad se comparó con la copia inicial.

Compilar antes de ejecutar. Instalar dependencias desde la rama actual y mantener `.env`, dumps, cachés, logs y checkpoints en privado. No compartir directorios de checkpoints. El script de primarias dejado por Copilot ahora delega al worker seguro, con escritura explícita y un directorio por país; su checkpoint antiguo se conserva y no se interpreta como si tuviera el formato nuevo.

```powershell
npm.cmd --prefix server run build
node server/scripts/recuperar-pcv-proveedores.cjs --country US --limit 1 --directory private_backups/piloto-us
node server/scripts/recuperar-pcv-proveedores.cjs --country JP --limit 1 --directory private_backups/piloto-jp
node server/scripts/recuperar-pcv-proveedores.cjs --country US --write --primary-only --directory private_backups/pcv-us-primary-full --resume
node server/scripts/recuperar-pcv-watch.cjs --country JP --write --directory private_backups/pcv-jp-full
```

El supervisor detecta el checkpoint sin requerir `--resume`. Para una pasada US con complementarios, después de terminar la primaria:

```powershell
node server/scripts/recuperar-pcv-watch.cjs --country US --write --directory private_backups/pcv-us-complementarios
```

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

`verificar-pcv-integridad` exige cero PCV originales no nulos alterados, cero filas perdidas, trazabilidad de todos los nuevos PCV/KPI y cambios de KPI, y conservación de empresas, informes, versiones, snapshots, runs, resultados y taxonomías. Comprueba también que no se cambia PCV fuera de US/JP 2022–2025. La reparación de fechas y la actualización de versiones financieras usadas por valoraciones son fases separadas; no se han relanzado valoraciones con hipótesis para aumentar cobertura.

El estado de los procesos y la comparación actualizada se generan en `RESULTADOS_PROVEEDORES_20261028.md`. Si hay cuotas pendientes o un barrido en curso, se declara expresamente allí: implementación, pruebas y recuperación parcial no equivalen a cobertura completa.
