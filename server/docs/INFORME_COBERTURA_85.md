# G2EXCHANGE: auditoría y recuperación hacia el 85 %

Generado: 2026-10-29T14:56:06.399Z. Corte SQL actualizado: 2026-10-29T14:19:40.012Z. Corte inicial congelado: 2026-10-29T08:12:14.053Z.
Estado del objetivo: **NO ALCANZADO**. La intervención y los barridos pendientes se describen sin confundir procesamiento terminado con cobertura alcanzada.

## 1. Diagnóstico de la cobertura inicial

La ruta US heredada dependía de instrumentos/tickers: 3.796 de las 8.017 empresas carecen de instrumento. El registro oficial histórico permite investigar 8.005 filas con CIK único (8.004 CIK distintos; un grupo duplicado, sin fusionar empresas). Los archivos masivos oficiales evitan depender de consultas individuales y del historial reciente. El descubrimiento anterior omitía históricos y anuales 20-F/40-F y enmiendas. La retención de cuatro anuales podía desplazar 2022 al llegar 2026.

En la copia original del 28/10, 1.833 empresas JP tenían anual de 2026 y no de 2022; este patrón y el código de retención explican parte del desequilibrio, sin atribuir automáticamente esa causa a cada empresa. La recuperación anterior continuó después del corte provisional que citaba 47,34 % para JP 2022. Por eso el nuevo inicio comprobado es 53,2761 %, no aquel corte anterior. Se conserva esta diferencia de fechas.

## 2. Errores y límites de medición

El indicador histórico cuenta conceptos distintos con importe no NULL y finito en un informe seleccionado por empresa/año. No suma duplicados. Selecciona cierre, publicación e ID descendentes, y usa el año civil del cierre. Presencia no certifica emisor, contexto, equivalencia contable ni corrección de KPI. El diagnóstico anterior también podía perder todos los KPI de un informe ante un solo concepto ambiguo. Ahora se aísla el concepto y se comprueban los indicadores independientes.

Se publican por separado presencia, calidad local y certificación de fuente. La certificación es una cota inferior de lo efectivamente contrastado: lo no certificado no se declara inventado ni inexistente. No se mezclan los cortes temporales ni se sustituyen las combinaciones US/JP por una media.

## 3. Extracción y normalización

Se exige emisor, documento/accesión real, cierre, inicio anual de 350–380 días, unidad, moneda y consolidación. Los comparativos se citan explícitamente como observaciones de otro cierre dentro de un documento real. No se reutiliza FY como año civil. Los PCV originales no NULL permanecen intactos; se registran discrepancias y se recuperan los campos independientes. Las fórmulas originales calculan KPI únicamente con inputs atestados en una misma cohorte.

| US: ejercicio inicial | Slots originales examinados | Sólo otros cierres | Sólo otros periodos, incluidos otros cierres | Valor del contexto esperado encontrado |
|---|---:|---:|---:|---:|
| 2022 | 53.254 | 50.949 | 50.973 | 2213 |
| 2023 | 62.047 | 59.657 | 59.678 | 2299 |
| 2024 | 63.636 | 61.084 | 61.124 | 2426 |
| 2025 | 65.515 | 62.706 | 62.752 | 2657 |

La auditoría de periodos usa la copia inicial y la misma etiqueta, accesión, fecha, formulario y unidad del archivo SEC. Una cifra que sólo coincide en otro cierre no se certifica para el cierre asignado. Encontrar el valor del contexto esperado tampoco certifica que la etiqueta sea un total financiero equivalente. Los demás casos siguen como no resueltos, no como ausencia demostrada.

## 4. Correspondencia de empresas

El CSV japonés original contenía nombres entrecomillados con comas; el parser `split` cortaba el nombre y desplazaba el código bursátil. Se reproduce exactamente la entrada original de las 3.581 empresas. Sus 3.577 nombres únicos conservan el mismo orden de inserción. El nuevo vínculo exige fila original única, código EDINET, número jurídico de 13 dígitos estable, código bursátil compatible y nombre completo de la portada oficial, además de los DEI del documento. Los nombres ambiguos y los instrumentos en conflicto quedan retenidos. Los 787 candidatos adicionales amplían la ruta de identidad de 2.764 a 3.551 empresas; no equivalen a 787 informes recuperados.

En SEC, la nueva versión admite continuidad de nombres sólo cuando los dos conjuntos oficiales tienen el mismo CIK y cada nombre está acreditado como actual o anterior con fechas válidas. No se usa similitud textual, ticker compartido ni un CIK inferido de una accesión.

## 5. Nomenclatura contable

Se excluyen componentes de inventario, deuda o intereses que no representan el total requerido; saldos amplios de efectivo; dividendos anunciados frente a pagos; y acciones emitidas frente a acciones en circulación. No se cambia una definición financiera para obtener más cobertura. La [taxonomía oficial FASB 2024](https://xbrl.fasb.org/us-gaap/2024/elts/us-gaap-doc-2024.xml) acredita `PaymentsToAcquireProductiveAssets` como CAPEX de activos productivos y `LongTermDebtAndCapitalLeaseObligations` como saldo no corriente. Se añaden en una versión nueva, conservando las firmas anteriores. La [taxonomía EDINET 2022](https://www.fsa.go.jp/search/20211109.html) acredita la etiqueta de amortización de CFO ya admitida; no se añade una etiqueta supuesta por traducción.

## 6. Límites reales de proveedores

La [API SEC y sus archivos masivos](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) no contienen todas las extensiones personalizadas en CompanyFacts. Un dataset ausente o sin etiqueta estándar no demuestra que el informe carezca de la cifra. Los ficheros de submissions y CompanyFacts se conservaron comprimidos con sus hashes y se pueden rematerializar. Las monedas distintas de USD quedan retenidas en esta ruta: es una limitación del modelo de persistencia/FX actual, no una ausencia del proveedor. No se convierten monedas ni se mezclan sus magnitudes.

FinDataEngine se consulta [a la fecha de la presentación](https://asreported.io/openapi.json), con accesión y periodo exactos. Alpha ofrece [25 llamadas gratuitas al día](https://www.alphavantage.co/support/); se mantiene 24 como límite local. Sus candidatos sin fecha/accesión histórica verificable quedan en revisión y aportan cero PCV canónicos por esa vía. EDINET DB mantiene los límites compartidos de [su API](https://edinetdb.com/docs/api) y [sus condiciones](https://edinetdb.com/legal/terms); no se elevan saldos ni se rotan cuentas. Presupuesto de la intervención: 0 EUR. Sólo se publica código y agregados; las respuestas y cifras detalladas permanecen privadas.

| Cuenta | Día del contador | Solicitudes locales | Saldo diario observado | Saldo mensual observado |
|---|---|---:|---:|---:|
| SEC_EDGAR | 2026-10-29 | 7 | no determinado | no determinado |
| EDINET | 2026-10-29 | 2409 | no determinado | no determinado |
| FINDATAENGINE | 2026-10-29 | 128 | no determinado | no determinado |
| ALPHAVANTAGE | 2026-10-29 | 1 | no determinado | no determinado |
| EDINET_DB | 2026-10-29 | 2 | 0 | 102 |

## 7. Correcciones implementadas

Registro histórico CIK y descargas masivas SEC; históricos y formularios anuales completos; comparativos explícitos; reconstrucción verificable de identidad JP; procesamiento por campos; evidencia aditiva por PCV y KPI; fuentes a fecha de presentación; preservación de 2022–2025; reintentos de transacciones completas ante deadlock; aislamiento READ COMMITTED con bloqueos de empresa/informe; y checkpoints inmutables por versión. Se usa un solo coordinador y un bloqueo financiero por país.

## 8. PCV recuperados por proveedor

La tabla cuenta filas distintas del ledger posteriores a la copia inicial de esta intervención. Una operación puede llenar un NULL o insertar una fila. No se atribuyen a los complementarios los datos que ya existían.

| País | Proveedor | PCV distintos recuperados | Operaciones PCV | Informes beneficiados | Empresas beneficiadas |
|---|---|---:|---:|---:|---:|
| US | SEC_EDGAR | 113.437 | 113.437 | 8291 | 2846 |
| US | FINDATAENGINE | 27 | 27 | 19 | 11 |
| US | ALPHAVANTAGE | 0 | 0 | 0 | 0 |
| JP | EDINET | 14.410 | 14.410 | 928 | 744 |
| JP | EDINET_DB | 0 | 0 | 0 | 0 |

## 9. KPI calculados y recalculados

| País | KPI distintos con operación confirmada | Operaciones de cálculo/recalculo | Informes |
|---|---:|---:|---:|
| US | 58.878 | 58.879 | 8229 |
| JP | 9424 | 9424 | 937 |

Control de requisitos: 4390 resultados nuevos con deuda incompleta retirados del cálculo canónico mediante valor NULL, conservando filas y evidencia; 0 resultados iniciales restaurados. Ambos componentes requieren prueba independiente; un cero explícito sí es válido. Las operaciones revertidas no se cuentan como recuperación legítima.
El conteo de KPI no equivale a nuevos slots: incluye recálculos de filas existentes. Su procedencia conserva todos los inputs; una operación que combina fuentes no se atribuye íntegramente a cada proveedor. Se distinguen inputs ausentes/denominador cero, cálculo ausente, discrepancia de resultado y resultado almacenado no reproducible. No se excluyen supuestos “no aplicables” sin prueba financiera.

## 10. Antes y después: indicador histórico de presencia

| País/año | PCV inicial % | PCV actual % | Mejora pp | KPI inicial % | KPI actual % | Mejora pp |
|---|---:|---:|---:|---:|---:|---:|
| US-2022 | 30,1938 | 47,9838 | 17,79 | 27,3734 | 39,5879 | 12,2145 |
| US-2023 | 35,1792 | 51,0336 | 15,8544 | 32,0694 | 42,7085 | 10,6391 |
| US-2024 | 36,0801 | 52,1897 | 16,1096 | 32,7165 | 43,4144 | 10,6979 |
| US-2025 | 37,1455 | 51,723 | 14,5775 | 33,5009 | 43,148 | 9,6471 |
| JP-2022 | 53,2761 | 65,7295 | 12,4534 | 53,1482 | 63,5823 | 10,4341 |
| JP-2023 | 63,0334 | 67,3428 | 4,3094 | 64,448 | 68,0487 | 3,6007 |
| JP-2024 | 63,1629 | 64,6518 | 1,4889 | 64,5515 | 65,7753 | 1,2238 |
| JP-2025 | 63,2632 | 63,3025 | 0,0393 | 64,6336 | 64,6714 | 0,0378 |

## 11. Universo fijo y certificación de fuente

El universo se mantiene en US 8.017 y JP 3.581. Los denominadores por año son 176.374 PCV/136.289 KPI para US y 78.782/60.877 para JP. El objetivo ampliado exige 24 celdas; esta tabla detalla las 16 US/JP; el indicador histórico no certifica el objetivo real. La tabla siguiente cuenta únicamente el contraste de fuentes completado hasta este corte, con moneda, periodo y consolidación coherentes.

| País/año | PCV certificados % del fijo | KPI certificados % del fijo | PCV almacenados todavía no certificados | KPI almacenados todavía no certificados |
|---|---:|---:|---:|---:|
| US-2022 | 18,543 | 12,3987 | 51.926 | 37.056 |
| US-2023 | 16,6051 | 10,8732 | 60.723 | 43.388 |
| US-2024 | 16,8642 | 10,9143 | 62.305 | 44.294 |
| US-2025 | 15,4399 | 9,8841 | 63.994 | 45.335 |
| JP-2022 | 40,5334 | 34,8128 | 19.850 | 17.514 |
| JP-2023 | 9,6266 | 8,2675 | 45.470 | 36.393 |
| JP-2024 | 6,7909 | 5,8774 | 45.584 | 36.464 |
| JP-2025 | 5,354 | 4,7095 | 45.653 | 36.503 |

La certificación inicial completa no estaba medida en el indicador heredado. No se presenta un cero de auditoría como cero de datos reales. El antes/después histórico está congelado y es comparable; el contraste retrospectivo de la calidad inicial se informa separadamente.

## 12. Universo elegible separado

YES exige identidad oficial y evidencia anual del ejercicio. UNKNOWN no se convierte en NO y permanece en el fijo. Una IPO posterior a 2022 puede tener comparativos; una baja bursátil puede mantener documentos históricos. No se excluyen fondos, emisores extranjeros o duplicados sin evidencia de la obligación/posibilidad concreta. Al quedar población desconocida, el tamaño elegible total y su porcentaje no se determinan; se muestra sólo el subconjunto confirmado.

| País/año | Elegibles confirmados | Elegibilidad desconocida | Presencia PCV % en confirmados | Presencia KPI % en confirmados | PCV certificados % en confirmados | KPI certificados % en confirmados |
|---|---:|---:|---:|---:|---:|---:|
| US-2022 | 5600 | 2417 | 68,6396 | 56,6303 | 26,5463 | 17,75 |
| US-2023 | 5868 | 2149 | 69,6706 | 58,3063 | 22,6862 | 14,8552 |
| US-2024 | 6052 | 1965 | 69,0838 | 57,4696 | 22,3397 | 14,458 |
| US-2025 | 6200 | 1817 | 66,8306 | 55,7533 | 19,9648 | 12,7808 |
| JP-2022 | 3443 | 138 | 68,3125 | 66,0795 | 42,158 | 36,2082 |
| JP-2023 | 3441 | 140 | 69,9242 | 70,6566 | 10,0182 | 8,6039 |
| JP-2024 | 2087 | 1494 | 69,7086 | 70,6446 | 11,6522 | 10,0848 |
| JP-2025 | 286 | 3295 | 94,1831 | 96,4418 | 67,0375 | 58,9675 |

## 13. Déficit individual hasta el 85 %

| País/año | Distancia PCV presencia pp | Distancia KPI presencia pp | PCV ausentes | KPI ausentes | Slots PCV faltantes para 85 % de presencia | Slots KPI faltantes para 85 % de presencia | Slots PCV pendientes de certificar para 85 % real | Slots KPI pendientes de certificar para 85 % real |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| US-2022 | 37,0162 | 45,4121 | 91.743 | 82.335 | 65.287 | 61.892 | 117.213 | 98.948 |
| US-2023 | 33,9664 | 42,2915 | 86.364 | 78.082 | 59.908 | 57.639 | 120.631 | 101.027 |
| US-2024 | 32,8103 | 41,5856 | 84.325 | 77.120 | 57.869 | 56.677 | 120.174 | 100.971 |
| US-2025 | 33,277 | 41,852 | 85.148 | 77.483 | 58.692 | 57.040 | 122.686 | 102.375 |
| JP-2022 | 19,2705 | 21,4177 | 26.999 | 22.170 | 15.182 | 13.039 | 35.032 | 30.553 |
| JP-2023 | 17,6572 | 16,9513 | 25.728 | 19.451 | 13.911 | 10.320 | 59.381 | 46.713 |
| JP-2024 | 20,3482 | 19,2247 | 27.848 | 20.835 | 16.031 | 11.704 | 61.615 | 48.168 |
| JP-2025 | 21,6975 | 20,3286 | 28.911 | 21.507 | 17.094 | 12.376 | 62.747 | 48.879 |

| País/año | Empresas sin anual registrado | Empresas con incidencia/déficit técnico observado | Identidad | Moneda | Dataset/etiqueta estándar | Índice anual/comparativo | Cuota | Déficit sin diagnóstico concluido |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| US-2022 | 2761 | 1 | 48 | 345 | 1032 | 1396 | 5014 | 85 |
| US-2023 | 2488 | 1 | 52 | 352 | 1029 | 1124 | 5251 | 101 |
| US-2024 | 2351 | 1 | 53 | 315 | 1085 | 971 | 5417 | 84 |
| US-2025 | 2385 | 1 | 56 | 200 | 1343 | 868 | 5370 | 91 |
| JP-2022 | 890 | 525 | 0 | 0 | 0 | 0 | 48 | 2877 |
| JP-2023 | 897 | 59 | 0 | 0 | 0 | 0 | 0 | 3511 |
| JP-2024 | 1028 | 48 | 0 | 0 | 0 | 0 | 0 | 3521 |
| JP-2025 | 1096 | 0 | 0 | 0 | 0 | 0 | 0 | 3570 |

Las incidencias son el último evento con empresa y ejercicio, no todos los intentos acumulados. Un fallo de compañía sin año no se imputa artificialmente a cuatro años. Estas categorías no demuestran ausencia real. La principal acción US es completar el pase oficial, contrastar el periodo heredado y continuar mapeos/complementarios; JP debe terminar las fechas históricas, las nuevas identidades y los ZIP pendientes. Se conservan los conflictos por separado.

## 14. Empresas con los cuatro ejercicios

| País | Cuatro informes al inicio | Cuatro informes actuales | Cuatro años con 22 PCV presentes | Cuatro años con 17 KPI presentes | Cuatro años con ambos conjuntos certificados |
|---|---:|---:|---:|---:|---:|
| US | 2955 | 4957 | 78 | 225 | 0 |
| JP | 1894 | 2368 | 15 | 1037 | 0 |

## 15. Pruebas y verificaciones

Última suite completa registrada del backend: 120 pruebas superadas. Motor: 20 pruebas previamente superadas, sin modificación de sus fórmulas. Integración MySQL: 6 pruebas superadas con tablas temporales. Se comprueban rollback de informe/PCV/evidencia, preservación de originales, NULL sin convertir a cero, precisión, recálculo e idempotencia. Los nuevos pases exigen piloto real con dry-run, commit y repetición sin cambios antes de su primera recuperación efectiva. Una fase sin inserciones todavía no declara ese piloto superado.

## 16. Backups e integridad

Último paquete alineado validado: 2026-10-29T11:49:52.127Z. Restauración en base nueva: true. SQL y configuración extraídos: true. Replay 533 desde el paquete extraído: true. SHA-256 SQL: `1d4a1107c6d1e6d44578c81ecfc4242a5058541c0f10c3987fcf960624ba7187`. SHA-256 paquete privado: `1a7b7666d668a4ef796110ef6c18e73dbc4f9d19d3f37d34856abead55c8f952`.

Se conservaron los volúmenes, backups y datos originales. El paquete privado contiene SQL, configuración, fuentes observadas, checkpoints y código compilado; no se publica. Los hashes grandes se calculan en streaming para no fallar al superar 2 GB. La integridad de las tablas originales y el replay se comprueban antes de snapshots alineados. La automatización de valoraciones permanece detenida durante esta recuperación.

## 17. Coordinador automático

Propietario observado vivo al generar este informe: true. Estado persistido: RUNNING. Objetivo 85 certificado por el coordinador: false. Un proceso vivo no implica que todos sus jobs hayan terminado. Los checkpoints antiguos retirados se conservan sin forzar su firma ni marcarlos como recuperados.

| Fase | Cursor | Barrido completo | Terminada | Espera a | Cola aplazada |
|---|---:|---|---|---|---:|
| us-bulk | no determinado | true | true | — | 0 |
| us-verified | 8017 | true | true | — | 0 |
| us-transient | 42 | true | true | — | 0 |
| us-mapping | 8017 | true | true | — | 0 |
| us-complement | 8017 | true | false | — | 5751 |
| jp-cached | 11.381 | true | true | — | 0 |
| jp-prefetch | no determinado | false | false | — | 0 |
| jp-identity-cached | 1642 | true | true | — | 0 |
| jp-discover | 1125 | false | false | — | 0 |
| jp-identity-discover | no determinado | false | false | jp-discover | 0 |
| jp-identity-existing | no determinado | false | false | jp-identity-discover | 0 |
| jp-existing | no determinado | false | false | jp-identity-existing | 0 |
| jp-complement | no determinado | false | false | jp-existing | 0 |

La ejecución en segundo plano puede sobrevivir al cierre del IDE. No se ha instalado arranque automático de Windows: el equipo debe permanecer encendido y, tras reinicio, se reanuda el mismo coordinador. Las cuotas se esperan con checkpoints; no se contratan planes ni se crean cuentas adicionales. La auditoría y este informe se actualizan desde el mismo coordinador.

## 18. Pendientes y solución preparada

Terminar los barridos y reintentos ya encadenados; descargar los ZIP oficiales de las identidades reconstruidas; completar el contraste de los datos heredados; examinar extensiones personalizadas con prueba semántica; y revisar moneda nativa/FX antes de habilitar persistencia multimoneda. Los candidatos discrepantes quedan en evidencia privada con su procedencia para una conciliación posterior, sin sustituir los originales. No se altera el frontend ni se generan valoraciones aprobadas a partir de inputs sin versión.

## 19. Justificación del objetivo pendiente

Bajo la política actual de conservar sin conciliar los valores no NULL y mantener los informes seleccionados, los slots originales con otro periodo bloquean por sí solos más del 15 % de cada denominador US. Incluso suponiendo correctos todos los demás slots, la cota de certificación sería:

| US año | Slots originales bloqueados por periodo | Cota PCV % si todos los demás slots fueran válidos |
|---|---:|---:|
| 2022 | 50.973 | 71,0995 |
| 2023 | 59.678 | 66,1639 |
| 2024 | 61.124 | 65,3441 |
| 2025 | 62.752 | 64,4211 |

Esta cota es condicional al bloqueo y a la selección actuales: no demuestra imposibilidad de obtener estados correctos de las fuentes. Demuestra que rellenar ausencias, sin una conciliación/versionado explícitos de esos contextos, no puede certificar el 85 %. Los candidatos correctos quedan conservados en evidencia, sin crear duplicados para desplazar silenciosamente el original.

El 85 % no se ha alcanzado. El déficit es el de cada fila anterior, sin reducción del universo. Hay datos oficiales disponibles aún no procesados, periodos heredados que no corresponden al cierre asignado, conceptos no equivalentes, monedas retenidas y cuotas reales. No se declara una imposibilidad global mientras queden esas vías sin terminar. Tampoco se confunde “fuente inspeccionada” con “cifra certificada”. Alcanzar la meta exige recuperar y validar los slots indicados; conservar un dato conflictivo no autoriza a contarlo como correcto ni a sobrescribirlo para elevar el porcentaje.

Metodología ampliada: [AUDITORIA_COBERTURA_85.md](AUDITORIA_COBERTURA_85.md). Los cortes detallados y las evidencias se conservan privadamente; este documento contiene únicamente código, metodología y agregados.


Informe ampliado y actualizado de los tres países: [INFORME_RECUPERACION_US_JP_TW.md](INFORME_RECUPERACION_US_JP_TW.md).
