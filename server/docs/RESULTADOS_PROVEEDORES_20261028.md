# Resultados de recuperación PCV/KPI — 28/10/2026

Generado: 2026-10-28T19:18:16.297Z. Auditoría consistente: 2026-10-28T19:17:04.922Z.

Estado: **recuperación en curso o cuotas pendientes; comparación provisional**. No se presentan estimaciones como resultados.

## Cobertura real por país y ejercicio

| Período | PCV antes | PCV después | Δ pp | KPI antes | KPI después | Δ pp |
|---|---:|---:|---:|---:|---:|---:|
| US-2022 | 79,5266% | 79,6305% | 0,1039 | 72,0934% | 72,1791% | 0,0857 |
| US-2023 | 80,5767% | 80,7116% | 0,1349 | 73,4642% | 73,5743% | 0,1101 |
| US-2024 | 79,8313% | 79,9616% | 0,1303 | 72,4034% | 72,5065% | 0,1031 |
| US-2025 | 79,6570% | 79,7845% | 0,1275 | 71,8574% | 71,9605% | 0,1031 |
| JP-2022 | 90,9163% | 90,9163% | 0,0000 | 93,3371% | 93,3371% | 0,0000 |
| JP-2023 | 91,1000% | 91,1000% | 0,0000 | 93,2054% | 93,2054% | 0,0000 |
| JP-2024 | 91,0629% | 91,0629% | 0,0000 | 93,1341% | 93,1341% | 0,0000 |
| JP-2025 | 91,0938% | 91,0957% | 0,0019 | 93,1329% | 93,1353% | 0,0024 |

Los denominadores son los informes anuales disponibles y el catálogo de 22 PCV/17 KPI; no todas las empresas tienen informe de cada año. Presencia no equivale a datos auditados ni a aplicabilidad universal de los conceptos. Véase la definición completa en `INTEGRACION_PROVEEDORES_20261028.md`.

## Agregados y ejercicios completos

| País | PCV antes → después | KPI antes → después | Empresas con cuatro informes | Cuatro ejercicios con núcleo de 17 PCV antes → después |
|---|---:|---:|---:|---:|
| US | 79,9053% → 80,0302% | 72,4556% → 72,5567% | 2955 | 204 → 204 |
| JP | 91,0723% → 91,0729% | 93,1715% → 93,1722% | 630 | 341 → 341 |

## Contribución registrada

| Proveedor/proceso | Tipo | Filas | Informes | Empresas | Filas insertadas (otras son NULL completados o KPI recalculados) |
|---|---|---:|---:|---:|---:|
| EDINET_DB | PCV | 1 | 1 | 1 | 1 |
| FORMULA_EXISTENTE | KPI | 325 | 29 | 9 | 325 |
| SEC_EDGAR | PCV | 499 | 28 | 8 | 499 |
| FINDATAENGINE | PCV | 0 | 0 | 0 | 0 |
| ALPHAVANTAGE | PCV | 0 | 0 | 0 | 0 |
| EDINET | PCV | 0 | 0 | 0 | 0 |

La contribución cuenta las operaciones confirmadas por el ledger en todos los informes anuales procesados; la cobertura selecciona un informe por empresa/año. Los contadores dry-run no se incluyen. No se atribuyen PCV del legado a estos proveedores.
Empresas beneficiadas JP: 1; informes con PCV añadidos/completados: 1.
Empresas beneficiadas US: 8; informes con PCV añadidos/completados: 28.

## Procesos y continuidad

- pcv-us-primary-full: empresas procesadas 1732, cursor 2485, barrido completo false, terminado false, aplazadas 0.
- pcv-us-complementarios: no iniciado.
- pcv-jp-full: empresas procesadas 74, cursor 10526, barrido completo false, terminado false, aplazadas 0.

Los aplazamientos por cuota se reintentan con el supervisor después del reinicio diario UTC. Los informes sin identidad, período, moneda o perímetro suficientemente verificables permanecen pendientes. Los conflictos originales no se sobreescriben. Los datos ausentes por falta de documento o no aplicabilidad no se convierten en cero.

Eventos pendientes observados (puede haber varios por empresa y repeticiones idempotentes):

- PERIMETRO_O_UNIDAD_CONTRADICTORIA_INGRESOS: 4601.
- SEC_IDENTIDAD_PENDIENTE: 1091.
- PERIMETRO_O_UNIDAD_CONTRADICTORIA_ACTIVOS_TOTALES: 215.
- HTTP_SEC_EDGAR_404: 1.

Comandos exactos, pruebas, integridad, backup inicial y condiciones de uso: `INTEGRACION_PROVEEDORES_20261028.md`. Los archivos privados de auditoría conservan los recuentos completos por país/año, PCV/KPI ausentes y conflictos; no se publican datos financieros de las empresas.
