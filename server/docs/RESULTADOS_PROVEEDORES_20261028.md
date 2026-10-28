# Resultados de recuperación PCV/KPI — 28/10/2026

Generado: 2026-10-28T21:28:34.269Z. Snapshot consistente: 2026-10-28T21:27:03.983Z.

Estado: **recuperación en curso o cuotas pendientes; comparación provisional**. Son mediciones del instante indicado, no una proyección del resultado final.

## Cobertura sobre informes disponibles

| Período | Informes antes → después | PCV antes → después | KPI antes → después |
|---|---:|---:|---:|
| US-2022 | 3021 → 3021 | 79,5266% → 80,0487% | 72,0934% → 72,5685% |
| US-2023 | 3471 → 3471 | 80,5767% → 81,1817% | 73,4642% → 73,9980% |
| US-2024 | 3594 → 3594 | 79,8313% → 80,4156% | 72,4034% → 72,9107% |
| US-2025 | 3708 → 3708 | 79,6570% → 80,2515% | 71,8574% → 72,3729% |
| JP-2022 | 633 → 674 | 90,9163% → 90,2145% | 93,3371% → 92,3110% |
| JP-2023 | 2476 → 2476 | 91,1000% → 91,1643% | 93,2054% → 93,2101% |
| JP-2024 | 2482 → 2482 | 91,0629% → 91,1307% | 93,1341% → 93,1341% |
| JP-2025 | 2485 → 2485 | 91,0938% → 91,1652% | 93,1329% → 93,1400% |

Cada informe disponible aporta 22 slots PCV y 17 KPI. Al recuperar informes ausentes aumenta también el denominador: el porcentaje puede bajar aunque aumenten los datos presentes. La siguiente comparación mantiene fijo el universo de empresas. Presencia no acredita auditoría de importes ni aplicabilidad universal por sector.

## Cobertura sobre universo fijo de empresas

| Período | Empresas objetivo | PCV antes → después | KPI antes → después |
|---|---:|---:|---:|
| US-2022 | 8017 | 29,9676% → 30,1643% | 27,1665% → 27,3456% |
| US-2023 | 8017 | 34,8861% → 35,1480% | 31,8067% → 32,0378% |
| US-2024 | 8017 | 35,7882% → 36,0501% | 32,4582% → 32,6857% |
| US-2025 | 8017 | 36,8427% → 37,1177% | 33,2353% → 33,4737% |
| JP-2022 | 3581 | 16,0709% → 16,9798% | 16,4988% → 17,3744% |
| JP-2023 | 3581 | 62,9890% → 63,0334% | 64,4447% → 64,4480% |
| JP-2024 | 3581 | 63,1159% → 63,1629% | 64,5515% → 64,5515% |
| JP-2025 | 3581 | 63,2137% → 63,2632% | 64,6287% → 64,6336% |

Denominador fijo por país/año: todas las empresas almacenadas × 22 PCV o × 17 KPI. Los años sin informe cuentan como ausencia; esto no implica que existiera obligación de presentar un informe en todos los años.

## Recuentos por país y ejercicio

| Período | PCV presentes / slots de informes | PCV ausentes | KPI presentes / slots de informes | KPI ausentes | Núcleo 17 completo | Conflictos |
|---|---:|---:|---:|---:|---:|---:|
| US-2022 | 53202 / 66462 | 13260 | 37269 / 51357 | 14088 | 393 | 750 |
| US-2023 | 61992 / 76362 | 14370 | 43664 / 59007 | 15343 | 481 | 863 |
| US-2024 | 63583 / 79068 | 15485 | 44547 / 61098 | 16551 | 386 | 906 |
| US-2025 | 65466 / 81576 | 16110 | 45621 / 63036 | 17415 | 374 | 937 |
| JP-2022 | 13377 / 14828 | 1451 | 10577 / 11458 | 881 | 411 | 251 |
| JP-2023 | 49659 / 54472 | 4813 | 39234 / 42092 | 2858 | 1609 | 955 |
| JP-2024 | 49761 / 54604 | 4843 | 39297 / 42194 | 2897 | 1586 | 978 |
| JP-2025 | 49840 / 54670 | 4830 | 39347 / 42245 | 2898 | 1597 | 967 |

## Agregados y cuatro ejercicios

| País | PCV disponibles antes → después | KPI disponibles antes → después | Cuatro informes antes → después | Cuatro ejercicios con núcleo 17 antes → después |
|---|---:|---:|---:|---:|
| US | 79,9053% → 80,4839% | 72,4556% → 72,9648% | 2955 → 2955 | 204 → 204 |
| JP | 91,0723% → 91,0754% | 93,1715% → 93,0908% | 630 → 664 | 341 → 356 |

## Contribución registrada

| Proveedor/proceso | Tipo | Operaciones | Informes | Empresas | Filas nuevas |
|---|---|---:|---:|---:|---:|
| EDINET | PCV | 821 | 154 | 85 | 821 |
| EDINET_DB | PCV | 6 | 6 | 3 | 6 |
| FINDATAENGINE | PCV | 4 | 4 | 4 | 4 |
| FORMULA_EXISTENTE | KPI | 1732 | 148 | 73 | 1732 |
| SEC_EDGAR | PCV | 1752 | 104 | 30 | 1752 |
| ALPHAVANTAGE | PCV | 0 | 0 | 0 | 0 |

Las operaciones confirmadas provienen del ledger; incluyen NULL completados y KPI recalculados. No cuentan ensayos revertidos ni se atribuyen datos del legado a los nuevos proveedores. La cobertura selecciona un informe por empresa/año; el ledger cuenta todas las operaciones confirmadas.
Empresas beneficiadas JP: 87; informes con PCV recuperados: 159.
Empresas beneficiadas US: 30; informes con PCV recuperados: 104.
Informes anuales nuevos JP-2022: 41; fuente EDINET; empresas 41.

## Procesos y continuidad

- pcv-us-primary-full: 3761 intentos (empresas), cursor 9509, barrido completo true, terminado true, aplazados 0, parada solicitada false.
- pcv-us-complementarios-v2: 3761 intentos (empresas), cursor 9509, barrido completo true, terminado false, aplazados 65, parada solicitada false.
- pcv-jp-full-v2: 288 intentos (empresas), cursor 10852, barrido completo false, terminado false, aplazados 185, parada solicitada true.
- pcv-jp-informes-jun2022: 61 intentos (reports), cursor 61, barrido completo false, terminado false, aplazados 60, parada solicitada false.

El supervisor respeta el bloqueo por país y reintenta cuotas tras el reinicio diario UTC. Los límites mensuales siguen vigentes. Los documentos sin identidad, período, moneda o perímetro verificados quedan pendientes. No se sobrescriben conflictos originales ni se sustituyen ausencias por cero.

Eventos observados con código (historial acumulado; puede incluir reintentos y casos ya resueltos):

- PERIMETRO_O_UNIDAD_CONTRADICTORIA_INGRESOS: 19250.
- SEC_IDENTIDAD_PENDIENTE: 3784.
- PERIMETRO_O_UNIDAD_CONTRADICTORIA_ACTIVOS_TOTALES: 2838.
- HTTP_SEC_EDGAR_404: 12.
- SEC_IDENTITY: 8.
- PERIMETRO_O_UNIDAD_CONTRADICTORIA_PASIVOS_TOTALES: 4.
- PERIMETRO_O_UNIDAD_CONTRADICTORIA_FLUJO_CAJA_OPERATIVO: 7.
- CUOTA_AGOTADA_ALPHAVANTAGE: 2.
- FDE_IDENTIDAD_PENDIENTE: 4.
- CUOTA_AGOTADA_EDINET_DB: 2.

Definiciones, comandos, pruebas y restauración: [INTEGRACION_PROVEEDORES_20261028.md](INTEGRACION_PROVEEDORES_20261028.md). Los archivos privados conservan los recuentos por concepto y las evidencias sin publicar datos financieros individuales.
