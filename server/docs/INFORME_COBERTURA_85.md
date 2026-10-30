# G2EXCHANGE: auditoría y recuperación hacia el 85 %

Generado: 2026-10-30T22:29:43.728Z. Corte SQL actualizado: 2026-10-30T21:55:18.741Z. Corte inicial congelado: 2026-10-29T08:12:14.053Z.
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
| EDINET | 2026-10-30 | 1426 | no determinado | no determinado |
| FINDATAENGINE | 2026-10-29 | 128 | no determinado | no determinado |
| ALPHAVANTAGE | 2026-10-29 | 1 | no determinado | no determinado |
| EDINET_DB | 2026-10-30 | 96 | 4 | 6 |

## 7. Correcciones implementadas

Registro histórico CIK y descargas masivas SEC; históricos y formularios anuales completos; comparativos explícitos; reconstrucción verificable de identidad JP; procesamiento por campos; evidencia aditiva por PCV y KPI; fuentes a fecha de presentación; preservación de 2022–2025; reintentos de transacciones completas ante deadlock; aislamiento READ COMMITTED con bloqueos de empresa/informe; y checkpoints inmutables por versión. Se usa un solo coordinador y un bloqueo financiero por país.

## 8. PCV recuperados por proveedor

La tabla cuenta filas distintas del ledger posteriores a la copia inicial de esta intervención. Una operación puede llenar un NULL o insertar una fila. No se atribuyen a los complementarios los datos que ya existían.

| País | Proveedor | PCV distintos recuperados | Operaciones PCV | Informes beneficiados | Empresas beneficiadas |
|---|---|---:|---:|---:|---:|
| US | SEC_EDGAR | 113.437 | 113.437 | 8291 | 2846 |
| US | FINDATAENGINE | 27 | 27 | 19 | 11 |
| US | ALPHAVANTAGE | 0 | 0 | 0 | 0 |
| JP | EDINET | 63.978 | 63.978 | 6165 | 2223 |
| JP | EDINET_DB | 280 | 280 | 145 | 50 |

## 9. KPI calculados y recalculados

| País | KPI distintos con operación confirmada | Operaciones de cálculo/recalculo | Informes |
|---|---:|---:|---:|
| US | 58.878 | 58.879 | 8229 |
| JP | 41.590 | 41.590 | 4462 |

Control de requisitos: 4390 resultados nuevos con deuda incompleta retirados del cálculo canónico mediante valor NULL, conservando filas y evidencia; 0 resultados iniciales restaurados. Ambos componentes requieren prueba independiente; un cero explícito sí es válido. Las operaciones revertidas no se cuentan como recuperación legítima.
El conteo de KPI no equivale a nuevos slots: incluye recálculos de filas existentes. Su procedencia conserva todos los inputs; una operación que combina fuentes no se atribuye íntegramente a cada proveedor. Se distinguen inputs ausentes/denominador cero, cálculo ausente, discrepancia de resultado y resultado almacenado no reproducible. No se excluyen supuestos “no aplicables” sin prueba financiera.

## 10. Antes y después: indicador histórico de presencia

| País/año | PCV inicial % | PCV actual % | Mejora pp | KPI inicial % | KPI actual % | Mejora pp |
|---|---:|---:|---:|---:|---:|---:|
| US-2022 | 30,1938 | 47,9838 | 17,79 | 27,3734 | 39,5879 | 12,2145 |
| US-2023 | 35,1792 | 51,0336 | 15,8544 | 32,0694 | 42,7085 | 10,6391 |
| US-2024 | 36,0801 | 52,1897 | 16,1096 | 32,7165 | 43,4144 | 10,6979 |
| US-2025 | 37,1455 | 51,723 | 14,5775 | 33,5009 | 43,148 | 9,6471 |
| JP-2022 | 53,2761 | 82,2129 | 28,9368 | 53,1482 | 77,1917 | 24,0435 |
| JP-2023 | 63,0334 | 83,8694 | 20,836 | 64,448 | 81,3476 | 16,8996 |
| JP-2024 | 63,1629 | 83,104 | 19,9411 | 64,5515 | 80,7251 | 16,1736 |
| JP-2025 | 63,2632 | 75,1136 | 11,8504 | 64,6336 | 74,0477 | 9,4141 |

## 11. Universo fijo y certificación de fuente

El universo se mantiene en US 8.017 y JP 3.581. Los denominadores por año son 176.374 PCV/136.289 KPI para US y 78.782/60.877 para JP. El objetivo ampliado exige 24 celdas; esta tabla detalla las 16 US/JP; el indicador histórico no certifica el objetivo real. La tabla siguiente cuenta únicamente el contraste de fuentes completado hasta este corte, con moneda, periodo y consolidación coherentes.

| País/año | PCV certificados % del fijo | KPI certificados % del fijo | PCV almacenados todavía no certificados | KPI almacenados todavía no certificados |
|---|---:|---:|---:|---:|
| US-2022 | 18,543 | 12,3987 | 51.926 | 37.056 |
| US-2023 | 16,6051 | 10,8732 | 60.723 | 43.388 |
| US-2024 | 16,8642 | 10,9143 | 62.305 | 44.294 |
| US-2025 | 15,4399 | 9,8841 | 63.994 | 45.335 |
| JP-2022 | 67,8137 | 58,1287 | 11.344 | 11.605 |
| JP-2023 | 66,7234 | 57,1612 | 13.508 | 14.724 |
| JP-2024 | 65,8133 | 56,371 | 13.622 | 14.826 |
| JP-2025 | 57,2605 | 49,1499 | 14.065 | 15.157 |

La certificación inicial completa no estaba medida en el indicador heredado. No se presenta un cero de auditoría como cero de datos reales. El antes/después histórico está congelado y es comparable; el contraste retrospectivo de la calidad inicial se informa separadamente.

## 12. Universo elegible separado

YES exige identidad oficial y evidencia anual del ejercicio. UNKNOWN no se convierte en NO y permanece en el fijo. Una IPO posterior a 2022 puede tener comparativos; una baja bursátil puede mantener documentos históricos. No se excluyen fondos, emisores extranjeros o duplicados sin evidencia de la obligación/posibilidad concreta. Al quedar población desconocida, el tamaño elegible total y su porcentaje no se determinan; se muestra sólo el subconjunto confirmado.

| País/año | Elegibles confirmados | Elegibilidad desconocida | Presencia PCV % en confirmados | Presencia KPI % en confirmados | PCV certificados % en confirmados | KPI certificados % en confirmados |
|---|---:|---:|---:|---:|---:|---:|
| US-2022 | 5600 | 2417 | 68,6396 | 56,6303 | 26,5463 | 17,75 |
| US-2023 | 5868 | 2149 | 69,6706 | 58,3063 | 22,6862 | 14,8552 |
| US-2024 | 6052 | 1965 | 69,0838 | 57,4696 | 22,3397 | 14,458 |
| US-2025 | 6200 | 1817 | 66,8306 | 55,7533 | 19,9648 | 12,7808 |
| JP-2022 | 3500 | 81 | 84,0896 | 78,9529 | 69,3831 | 59,4739 |
| JP-2023 | 3450 | 131 | 87 | 84,3819 | 69,2569 | 59,3316 |
| JP-2024 | 3412 | 169 | 87,1163 | 84,6218 | 69,0731 | 59,1632 |
| JP-2025 | 3352 | 229 | 80,0553 | 78,9151 | 61,1724 | 52,5077 |

## 13. Déficit individual hasta el 85 %

| País/año | Distancia PCV presencia pp | Distancia KPI presencia pp | PCV ausentes | KPI ausentes | Slots PCV faltantes para 85 % de presencia | Slots KPI faltantes para 85 % de presencia | Slots PCV pendientes de certificar para 85 % real | Slots KPI pendientes de certificar para 85 % real |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| US-2022 | 37,0162 | 45,4121 | 91.743 | 82.335 | 65.287 | 61.892 | 117.213 | 98.948 |
| US-2023 | 33,9664 | 42,2915 | 86.364 | 78.082 | 59.908 | 57.639 | 120.631 | 101.027 |
| US-2024 | 32,8103 | 41,5856 | 84.325 | 77.120 | 57.869 | 56.677 | 120.174 | 100.971 |
| US-2025 | 33,277 | 41,852 | 85.148 | 77.483 | 58.692 | 57.040 | 122.686 | 102.375 |
| JP-2022 | 2,7871 | 7,8083 | 14.013 | 13.885 | 2196 | 4754 | 13.540 | 16.359 |
| JP-2023 | 1,1306 | 3,6524 | 12.708 | 11.355 | 891 | 2224 | 14.399 | 16.948 |
| JP-2024 | 1,896 | 4,2749 | 13.311 | 11.734 | 1494 | 2603 | 15.116 | 17.429 |
| JP-2025 | 9,8864 | 10,9523 | 19.606 | 15.799 | 7789 | 6668 | 21.854 | 21.825 |

| País/año | Empresas sin anual registrado | Empresas con incidencia/déficit técnico observado | Identidad | Moneda | Dataset/etiqueta estándar | Índice anual/comparativo | Cuota | Déficit sin diagnóstico concluido |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| US-2022 | 2761 | 1 | 48 | 345 | 1032 | 1396 | 5014 | 85 |
| US-2023 | 2488 | 1 | 52 | 352 | 1029 | 1124 | 5251 | 101 |
| US-2024 | 2351 | 1 | 53 | 315 | 1085 | 971 | 5417 | 84 |
| US-2025 | 2385 | 1 | 56 | 200 | 1343 | 868 | 5370 | 91 |
| JP-2022 | 112 | 10 | 72 | 0 | 0 | 0 | 2971 | 341 |
| JP-2023 | 156 | 14 | 26 | 0 | 0 | 0 | 2872 | 499 |
| JP-2024 | 196 | 10 | 36 | 0 | 0 | 0 | 2825 | 531 |
| JP-2025 | 577 | 293 | 100 | 0 | 0 | 0 | 2470 | 552 |

Las incidencias son el último evento con empresa y ejercicio, no todos los intentos acumulados. Un fallo de compañía sin año no se imputa artificialmente a cuatro años. Estas categorías no demuestran ausencia real. La principal acción US es completar el pase oficial, contrastar el periodo heredado y continuar mapeos/complementarios; JP debe terminar las fechas históricas, las nuevas identidades y los ZIP pendientes. Se conservan los conflictos por separado.

## 14. Empresas con los cuatro ejercicios

| País | Cuatro informes al inicio | Cuatro informes actuales | Cuatro años con 22 PCV presentes | Cuatro años con 17 KPI presentes | Cuatro años con ambos conjuntos certificados |
|---|---:|---:|---:|---:|---:|
| US | 2955 | 4957 | 78 | 225 | 0 |
| JP | 1894 | 2976 | 146 | 1073 | 0 |

## 15. Pruebas y verificaciones

Última suite completa registrada del backend: 120 pruebas superadas. Motor: 20 pruebas previamente superadas, sin modificación de sus fórmulas. Integración MySQL: 6 pruebas superadas con tablas temporales. Se comprueban rollback de informe/PCV/evidencia, preservación de originales, NULL sin convertir a cero, precisión, recálculo e idempotencia. Los nuevos pases exigen piloto real con dry-run, commit y repetición sin cambios antes de su primera recuperación efectiva. Una fase sin inserciones todavía no declara ese piloto superado.

## 16. Backups e integridad

Último paquete alineado validado: 2026-10-30T02:39:09.149Z. Restauración en base nueva: true. SQL y configuración extraídos: true. Replay 533 desde el paquete extraído: true. SHA-256 SQL: `4b6b47a70da389360e76220be742475a010f8160e3f93f9516a578b03096aeab`. SHA-256 paquete privado: `6f09c62322973bd17981bd3780f8d8da0f3aae1be844ea6e3a7d23b03d63e99f`.

Se conservaron los volúmenes, backups y datos originales. El paquete privado contiene SQL, configuración, fuentes observadas, checkpoints y código compilado; no se publica. Los hashes grandes se calculan en streaming para no fallar al superar 2 GB. La integridad de las tablas originales y el replay se comprueban antes de snapshots alineados. La automatización de valoraciones permanece detenida durante esta recuperación.

## 17. Coordinador automático

Propietario observado vivo al generar este informe: true. Estado persistido: MAINTENANCE. Objetivo 85 certificado por el coordinador: false. Un proceso vivo no implica que todos sus jobs hayan terminado. Los checkpoints antiguos retirados se conservan sin forzar su firma ni marcarlos como recuperados.

| Fase | Cursor | Barrido completo | Terminada | Espera a | Cola aplazada |
|---|---:|---|---|---|---:|
| us-bulk | no determinado | true | true | — | 0 |
| us-verified | 8017 | true | true | — | 0 |
| us-transient | 42 | true | true | — | 0 |
| us-mapping | 8017 | true | true | — | 0 |
| us-complement | 8017 | true | false | — | 5751 |
| jp-cached | 11.381 | true | true | — | 0 |
| jp-prefetch | no determinado | true | true | — | 0 |
| jp-identity-cached | 1642 | true | true | — | 0 |
| jp-discover | 1642 | true | true | — | 0 |
| jp-identity-discover | 1642 | true | true | — | 0 |
| jp-identity-existing | 2604 | true | true | — | 0 |
| jp-existing | 10.860 | true | true | — | 0 |
| jp-complement | 3581 | true | false | — | 3099 |

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
