# Informe de cobertura PCV/KPI 2022–2025

Medido directamente en MySQL operativo, en solo lectura, el 2026-11-01 04:12 UTC, después de todas las escrituras verificadas (lote 3 de Taiwán y las dos pasadas de la reparación global de KPI persistidos, que no cambian la cobertura certificada: ésta se mide desde PCV certificados con el mismo criterio que la API) (`npm run sectorial:coverage`; datos en `sectorial/app/coverage/cobertura_final_entrega.json`).

## Definición
- **Universo**: todas las empresas del país, sin exclusiones, congelado con sha256 por país (US `9e0113d3`, JP `32a2836f`, TW `e7cb71fb`).
- **Denominador**: universo × 17 conceptos núcleo (PCV) y universo × 17 KPI.
- **Informe**: el último informe anual de cada empresa y año, de la fuente primaria del país (SEC_EDGAR / EDINET / FINMIND·MOPS).
- **Celda certificada**: PCV no nulo, prueba primaria (`INSERTED`/`NULL_FILLED`/`VERIFIED_EXISTING`) y sin conflicto sin resolver.
- **KPI certificado**: todas sus entradas certificadas en el mismo informe y, para el ROE, beneficio y patrimonio de perímetro conocido e igual: el mismo criterio que la API sectorial (`kpi.cjs`).

## Matriz
| País | Año | Universo | Informe anual válido | PCV esperados | PCV presentes | PCV certificados | Cobertura PCV (30/10 → final) | KPI esperados | KPI certificados | Cobertura KPI (30/10 → final) |
|---|---|---|---|---|---|---|---|---|---|---|
| US | 2022 | 8017 | 5585 | 136289 | 68962 | 61954 | 18.5 % → **45.46 %** | 136289 | 41926 | 12.58 % → **30.76 %** |
| US | 2023 | 8017 | 5866 | 136289 | 73043 | 65012 | 16.44 % → **47.7 %** | 136289 | 44040 | 11.08 % → **32.31 %** |
| US | 2024 | 8017 | 5981 | 136289 | 74218 | 65199 | 16.64 % → **47.84 %** | 136289 | 43970 | 11.09 % → **32.26 %** |
| US | 2025 | 8017 | 5839 | 136289 | 72369 | 63052 | 15.23 % → **46.26 %** | 136289 | 42394 | 10.04 % → **31.11 %** |
| JP | 2022 | 3581 | 3470 | 60877 | 52000 | 44506 | 68.19 % → **73.11 %** | 60877 | 35141 | 52.33 % → **57.72 %** |
| JP | 2023 | 3581 | 3430 | 60877 | 52958 | 43225 | 60.01 % → **71 %** | 60877 | 33664 | 35.35 % → **55.3 %** |
| JP | 2024 | 3581 | 3385 | 60877 | 52362 | 42586 | 58.99 % → **69.95 %** | 60877 | 33181 | 34.53 % → **54.5 %** |
| JP | 2025 | 3581 | 3113 | 60877 | 48989 | 37138 | 50.16 % → **61 %** | 60877 | 28867 | 27.68 % → **47.42 %** |
| TW | 2022 | 1596 | 820 | 27132 | 11060 | 0 | 0 % → **0 %** | 27132 | 0 | 0 % → **0 %** |
| TW | 2023 | 1596 | 824 | 27132 | 11076 | 0 | 0 % → **0 %** | 27132 | 0 | 0 % → **0 %** |
| TW | 2024 | 1596 | 825 | 27132 | 11105 | 0 | 0 % → **0 %** | 27132 | 0 | 0 % → **0 %** |
| TW | 2025 | 1596 | 825 | 27132 | 11080 | 0 | 0 % → **0 %** | 27132 | 0 | 0 % → **0 %** |

## Empresas con información suficiente
| País | Empresas con 4 informes anuales | Con los 9 conceptos del DCF certificados en 2022–2025 | Con 3 de 4 años |
|---|---|---|---|
| US | 5183 | **1322** | 444 |
| JP | 3084 | **2195** | 436 |
| TW | 814 | **0** | 0 |

- **Conceptos del DCF**: ingresos, EBIT, beneficio neto, efectivo, activos, pasivos, patrimonio, flujo operativo y CAPEX.
- **Diferencia con «empresas valorables»**: tener estos datos no basta para ejecutar un DCF. El motor exige además una clasificación sectorial resuelta, un contexto financiero estable entre cierres, publicación anterior a la fecha de valoración e hipótesis citadas para los tres escenarios. Casos reales en `sectorial/app/coverage/cadena_casos_reales_20261031.json`:
  - **Apple**: 4 ejercicios con 10 de 10 campos validados.
  - **ASML**: 4 ejercicios con 10 de 10, en EUR (es un ADR: falta ratio y tipo de cambio para valorarlo en USD).
  - **Microsoft**: el contexto cambia entre cierres, así que queda bloqueada.
  - **Toyota y Sony**: 6 de 10, porque faltan conceptos IFRS en el verificador EDINET.
  - **Taiwán**: sin fecha de publicación, así que el DCF queda bloqueado.

## Indicadores de capital circulante derivados (aparte de la cobertura KPI oficial)
Porcentaje del universo de empresas con el indicador certificado en el último informe anual de cada año (todas sus entradas certificadas). Se derivan al vuelo de PCV certificados (`VALUATION_ENGINE.md` §4 bis); **no** forman parte de los 17 KPI de la tabla anterior. ΔNWC es una cota superior (NWC certificado en el año y en el anterior, sin comprobar aquí el contexto); 2022 no tiene saldo de 2021 en la ventana.

| País | Año | DSO | DPO s/ventas | Días inventario s/ventas | CCC s/ventas | DIO s/coste | CCC convencional | NWC | ΔNWC |
|---|---|---|---|---|---|---|---|---|---|
| US | 2022 | 35,41 % | 30,85 % | 27,77 % | 16,94 % | 19,23 % | 11,87 % | 18,72 % | — |
| US | 2023 | 37,33 % | 32,64 % | 29,57 % | 17,29 % | 20,44 % | 12,22 % | 19,15 % | 17,25 % |
| US | 2024 | 38,99 % | 34,23 % | 30,47 % | 17,91 % | 21,16 % | 12,67 % | 19,85 % | 18,1 % |
| US | 2025 | 37,52 % | 33,85 % | 28,93 % | 17,7 % | 19,86 % | 12,4 % | 19,72 % | 18,3 % |
| JP | 2022 | 64,06 % | 76,63 % | 12,59 % | 5,61 % | 11,45 % | 5,45 % | 5,67 % | — |
| JP | 2023 | 55,21 % | 73,92 % | 9,94 % | 4,55 % | 9,22 % | 4,55 % | 4,72 % | 4,36 % |
| JP | 2024 | 53,95 % | 72,86 % | 9,94 % | 4,5 % | 9,16 % | 4,5 % | 4,64 % | 4,5 % |
| JP | 2025 | 44,79 % | 63,36 % | 8,68 % | 3,88 % | 7,96 % | 3,88 % | 4,02 % | 3,77 % |
| TW | 2022 | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % | — |
| TW | 2023 | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % |
| TW | 2024 | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % |
| TW | 2025 | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % |

- **Limitante**: el inventario certificado. En Japón solo el 9–13 % de las empresas lo tiene (muchas no tienen existencias o usan etiquetas sin verificar), así que CCC y NWC quedan en el 4–6 %; sin inventario no se calculan (no se usa cero).
- **Activos contractuales**: 0 % certificados en los tres países, así que la métrica ampliada no se puede calcular hoy.
- **Taiwán**: 0 % (sin evidencia primaria).

## Por qué no se llega al 65–70 % en todos los casos
- **EE. UU.**: la cobertura bruta es del 50,6–54,5 %.
  - 879 empresas no tienen datos XBRL en la SEC (ADR sin informe anual, emisores de 6-K, fondos).
  - Unas 730 al año no tienen hechos anuales estándar localizables.
  - Entre 6.278 y 8.478 PCV al año están presentes pero sin verificación primaria.
- **Japón**: en 2025 hay menos informes. Además, la taxonomía IFRS de emisores como Toyota (ingresos, beneficio bruto, CAPEX, acciones) no está mapeada en el verificador.
- **Taiwán**: no existe una fuente primaria automatizable autorizada (las condiciones de TWSE prohíben la descarga automatizada de MOPS). Los datos de FinMind están recuperados y normalizados (anual = suma T1–T4), pero **no están certificados**.

## Taiwán: estado de los datos
| Estado | Situación |
|---|---|
| Recuperado (FinMind) | 820–825 empresas con informe anual al año |
| Normalizado | 33.096 PCV de resultados de 2.598 informes y 666 empresas corregidos de T4 a anual (lotes 1–3; descarga FinMind 906/906); el EPS sigue siendo trimestral y no se deriva |
| Contrastado (Eulerpool) | `sectorial/app/coverage/contraste_tw_eulerpool.json` |
| Certificado | **0** (sin documento primario MOPS incorporado) |
