# Resultados de recuperación PCV/KPI — 28/10/2026

Generado: 2026-10-28T20:13:12.454Z. Auditoría consistente: 2026-10-28T20:04:12.814Z.

Estado: **recuperación en curso o cuotas pendientes; comparación provisional**. No se presentan estimaciones como resultados.

## Cobertura real por país y ejercicio

| Período | PCV antes | PCV después | Δ pp | KPI antes | KPI después | Δ pp |
|---|---:|---:|---:|---:|---:|---:|
| US-2022 | 79,5266% | 80,0487% | 0,5221 | 72,0934% | 72,5685% | 0,4751 |
| US-2023 | 80,5767% | 81,1817% | 0,6050 | 73,4642% | 73,9980% | 0,5338 |
| US-2024 | 79,8313% | 80,4156% | 0,5843 | 72,4034% | 72,9107% | 0,5073 |
| US-2025 | 79,6570% | 80,2503% | 0,5933 | 71,8574% | 72,3713% | 0,5139 |
| JP-2022 | 90,9163% | 90,9306% | 0,0143 | 93,3371% | 93,3371% | 0,0000 |
| JP-2023 | 91,1000% | 91,1257% | 0,0257 | 93,2054% | 93,2101% | 0,0047 |
| JP-2024 | 91,0629% | 91,0886% | 0,0257 | 93,1341% | 93,1341% | 0,0000 |
| JP-2025 | 91,0938% | 91,1268% | 0,0330 | 93,1329% | 93,1400% | 0,0071 |

## Recuentos por país y ejercicio

| Período | Empresas objetivo | Con informe anual | Con PCV | PCV presentes / esperados | PCV ausentes | Informes con núcleo 17 completo |
|---|---:|---:|---:|---:|---:|---:|
| US-2022 | 8017 | 3021 | 2994 | 53202 / 66462 | 13260 | 393 |
| US-2023 | 8017 | 3471 | 3441 | 61992 / 76362 | 14370 | 481 |
| US-2024 | 8017 | 3594 | 3561 | 63583 / 79068 | 15485 | 386 |
| US-2025 | 8017 | 3708 | 3674 | 65465 / 81576 | 16111 | 374 |
| JP-2022 | 3581 | 633 | 633 | 12663 / 13926 | 1263 | 394 |
| JP-2023 | 3581 | 2476 | 2476 | 49638 / 54472 | 4834 | 1609 |
| JP-2024 | 3581 | 2482 | 2482 | 49738 / 54604 | 4866 | 1586 |
| JP-2025 | 3581 | 2485 | 2485 | 49819 / 54670 | 4851 | 1597 |

| Período | KPI disponibles / esperados | KPI ausentes | Informes con núcleo incompleto | Conflictos de normalización |
|---|---:|---:|---:|---:|
| US-2022 | 37269 / 51357 | 14088 | 2628 | 750 |
| US-2023 | 43664 / 59007 | 15343 | 2990 | 863 |
| US-2024 | 44547 / 61098 | 16551 | 3208 | 906 |
| US-2025 | 45620 / 63036 | 17416 | 3334 | 937 |
| JP-2022 | 10044 / 10761 | 717 | 239 | 251 |
| JP-2023 | 39234 / 42092 | 2858 | 867 | 955 |
| JP-2024 | 39297 / 42194 | 2897 | 896 | 978 |
| JP-2025 | 39347 / 42245 | 2898 | 888 | 967 |

Los denominadores son los informes anuales disponibles y el catálogo de 22 PCV/17 KPI; no todas las empresas tienen informe de cada año. Presencia no equivale a datos auditados ni a aplicabilidad universal de los conceptos. Véase la definición completa en `INTEGRACION_PROVEEDORES_20261028.md`.

## Agregados y ejercicios completos

| País | PCV antes → después | KPI antes → después | Empresas con cuatro informes | Cuatro ejercicios con núcleo de 17 PCV antes → después |
|---|---:|---:|---:|---:|
| US | 79,9053% → 80,4836% | 72,4556% → 72,9644% | 2955 | 204 → 204 |
| JP | 91,0723% → 91,0993% | 93,1715% → 93,1751% | 630 | 341 → 341 |

## Contribución registrada

| Proveedor/proceso | Tipo | Filas | Informes | Empresas | Filas insertadas (otras son NULL completados o KPI recalculados) |
|---|---|---:|---:|---:|---:|
| EDINET | PCV | 42 | 42 | 16 | 42 |
| EDINET_DB | PCV | 6 | 6 | 3 | 6 |
| FINDATAENGINE | PCV | 3 | 3 | 3 | 3 |
| FORMULA_EXISTENTE | KPI | 1198 | 107 | 32 | 1198 |
| SEC_EDGAR | PCV | 1752 | 104 | 30 | 1752 |
| ALPHAVANTAGE | PCV | 0 | 0 | 0 | 0 |

La contribución cuenta las operaciones confirmadas por el ledger en todos los informes anuales procesados; la cobertura selecciona un informe por empresa/año. Los contadores dry-run no se incluyen. No se atribuyen PCV del legado a estos proveedores.
Empresas beneficiadas JP: 18; informes con PCV añadidos/completados: 47.
Empresas beneficiadas US: 30; informes con PCV añadidos/completados: 104.

## Procesos y continuidad

- pcv-us-primary-full: intentos de empresa procesados 3761, cursor 9509, barrido completo true, terminado true, aplazadas 0.
- pcv-us-complementarios-v2: intentos de empresa procesados 3761, cursor 9509, barrido completo true, terminado false, aplazadas 65.
- pcv-jp-full-v2: intentos de empresa procesados 236, cursor 10790, barrido completo false, terminado false, aplazadas 135.

Los aplazamientos por cuota se reintentan con el supervisor después del reinicio diario UTC. Los informes sin identidad, período, moneda o perímetro suficientemente verificables permanecen pendientes. Los conflictos originales no se sobreescriben. Los datos ausentes por falta de documento o no aplicabilidad no se convierten en cero.

Eventos pendientes observados (puede haber varios por empresa y repeticiones idempotentes):

- PERIMETRO_O_UNIDAD_CONTRADICTORIA_INGRESOS: 19243.
- SEC_IDENTIDAD_PENDIENTE: 3784.
- PERIMETRO_O_UNIDAD_CONTRADICTORIA_ACTIVOS_TOTALES: 2838.
- HTTP_SEC_EDGAR_404: 12.
- SEC_IDENTITY: 8.
- PERIMETRO_O_UNIDAD_CONTRADICTORIA_PASIVOS_TOTALES: 4.
- PERIMETRO_O_UNIDAD_CONTRADICTORIA_FLUJO_CAJA_OPERATIVO: 7.
- CUOTA_AGOTADA_ALPHAVANTAGE: 2.
- FDE_IDENTIDAD_PENDIENTE: 4.
- CUOTA_AGOTADA_EDINET_DB: 1.

Comandos exactos, pruebas, integridad, backup inicial y condiciones de uso: `INTEGRACION_PROVEEDORES_20261028.md`. Los archivos privados de auditoría conservan los recuentos completos por país/año, PCV/KPI ausentes y conflictos; no se publican datos financieros de las empresas.
