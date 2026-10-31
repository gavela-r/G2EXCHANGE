# Estado PCV / KPI 2022–2025 (Estados Unidos, Japón, Taiwán)

Medición reproducible con `npm run sectorial:coverage` (MySQL **sólo lectura**, `START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY`). Datos: `sectorial/app/coverage/cobertura_actual.json`.

**Resultado: no se alcanza el objetivo del 85 % en ninguna de las 12 combinaciones país-año, ni en PCV ni en KPI.** Todas las cifras son mediciones; ninguna se ha ajustado.

## Definición (congelada y trazable)

- **Universo**: todas las empresas del país en la tabla `empresa` en el momento de la medición, sin exclusiones. La lista ordenada de identificadores se congela con un sha256 por país (al pie de este documento).
- **Informe**: el último informe `ANUAL` de cada empresa por año de cierre (misma regla que `server/scripts/auditar-pcv-kpi-2022-2025.cjs`).
- **PCV esperados**: universo × 17 conceptos núcleo de Codex (INGRESOS, BENEFICIO_BRUTO, EBIT, BENEFICIO_NETO, GASTO_INTERESES, EFECTIVO, ACTIVOS_TOTALES, PASIVOS_TOTALES, PATRIMONIO_NETO, DEUDA_CORTO_PLAZO, DEUDA_LARGO_PLAZO, FLUJO_CAJA_OPERATIVO, CAPEX, DEPRECIACION_AMORTIZACION, INVENTARIOS, CUENTAS_COBRAR, CUENTAS_PAGAR).
- **Celda certificada**: hay un PCV no nulo y una prueba `INSERTED`/`NULL_FILLED`/`VERIFIED_EXISTING`, y no hay ninguna `CONFLICT_PRESERVED` (misma precedencia que el adaptador).
- **KPI esperados**: universo × 17 KPI de `insercionKPIInformeFinanciero.ts`. **KPI certificado**: todas sus entradas están certificadas en el mismo informe y no hay división por cero (`sectorial/app/kpi.cjs`). Se mide de forma independiente de los PCV.
- **No aplicables**: 0. No se ha implementado ninguna exclusión justificada (por ejemplo, INVENTARIOS en bancos), y el denominador no se ha reducido.

## Matriz país × año

| País | Año | Universo | Con informe | 4 ejercicios | PCV esperados | Presentes | Certificados | Conflictivos | Presentes sin verificar | Ausentes (sin informe / en informe) | No aplicables | Cobertura bruta | **PCV certificados** | **KPI certificados** | Empresas con 17 núcleo certificados |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| US | 2022 | 8017 | 5256 | 4957 | 136289 | 65800 | 25218 | 34304 | 6278 | 70489 (46937 / 23552) | 0 | 48.28 % | **18.5 %** | **12.58 %** | 9 |
| US | 2023 | 8017 | 5529 | 4957 | 136289 | 69742 | 22401 | 40114 | 7227 | 66547 (42296 / 24251) | 0 | 51.17 % | **16.44 %** | **11.08 %** | 5 |
| US | 2024 | 8017 | 5666 | 4957 | 136289 | 71097 | 22677 | 40214 | 8206 | 65192 (39967 / 25225) | 0 | 52.17 % | **16.64 %** | **11.09 %** | 2 |
| US | 2025 | 8017 | 5632 | 4957 | 136289 | 70395 | 20761 | 41142 | 8492 | 65894 (40545 / 25349) | 0 | 51.65 % | **15.23 %** | **10.04 %** | 2 |
| JP | 2022 | 3581 | 3469 | 2976 | 60877 | 51979 | 41515 | 3996 | 6468 | 8898 (1904 / 6994) | 0 | 85.38 % | **68.19 %** | **52.33 %** | 3 |
| JP | 2023 | 3581 | 3425 | 2976 | 60877 | 52873 | 36533 | 9093 | 7247 | 8004 (2652 / 5352) | 0 | 86.85 % | **60.01 %** | **35.35 %** | 3 |
| JP | 2024 | 3581 | 3385 | 2976 | 60877 | 52359 | 35914 | 9167 | 7278 | 8518 (3332 / 5186) | 0 | 86.01 % | **58.99 %** | **34.53 %** | 3 |
| JP | 2025 | 3581 | 3004 | 2976 | 60877 | 47223 | 30537 | 9065 | 7621 | 13654 (9809 / 3845) | 0 | 77.57 % | **50.16 %** | **27.68 %** | 1 |
| TW | 2022 | 1596 | 899 | 893 | 27132 | 12341 | 0 | 0 | 12341 | 14791 (11849 / 2942) | 0 | 45.49 % | **0 %** | **0 %** | 0 |
| TW | 2023 | 1596 | 1094 | 893 | 27132 | 15482 | 0 | 0 | 15482 | 11650 (8534 / 3116) | 0 | 57.06 % | **0 %** | **0 %** | 0 |
| TW | 2024 | 1596 | 1097 | 893 | 27132 | 15545 | 0 | 0 | 15545 | 11587 (8483 / 3104) | 0 | 57.29 % | **0 %** | **0 %** | 0 |
| TW | 2025 | 1596 | 1098 | 893 | 27132 | 15535 | 0 | 0 | 15535 | 11597 (8466 / 3131) | 0 | 57.26 % | **0 %** | **0 %** | 0 |


"Empresas con 4 ejercicios" = empresas con informe anual en los cuatro años. Cobertura por celdas ≠ cobertura de empresas completas (última columna).

## Causas, ordenadas por impacto en la cobertura certificada

| # | Causa (componente responsable) | Impacto medido | Estado |
|---|---|---|---|
| 1 | **US: conflictos con discrepancia real de valor** (importes heredados frente al candidato oficial de SEC companyfacts; en la muestra, el 97 % son "VALOR_DISTINTO", p. ej. un EPS de 2,54 frente a 2,82: otro período, reexpresión o etiqueta distinta). Componente: importadores heredados + `server/src/pcv/persistirRecuperacionVerificada.ts`, que conserva el conflicto, como debe | 34.304–41.142 celdas/año = 25,2–30,2 pp de la cobertura US | **Pendiente**: requiere conciliar período y contexto contra SEC y una observación versionada en MySQL (escritura no autorizada en esta sesión). Herramienta de diagnóstico: `tools/clasificar_conflictos.cjs` |
| 2 | **US: empresas del universo sin informe anual** (2.351–2.761 de 8.017 por año: entidades no obligadas o sin 10-K en ese año) | 29,3–34,4 % de las celdas esperadas US no tienen informe | Pendiente: hace falta una regla de no aplicabilidad justificada y contabilizada aparte. No se ha excluido nada |
| 3 | **TW: no existe verificación** (0 filas en `pcv_verification_evidence` para Taiwán; los PCV presentes provienen de proveedores sin certificador TWSE/MOPS) | 100 % de las celdas TW presentes sin verificar (12.341–15.545/año) | **Bloqueado por fuente**: MOPS/TWSE no ofrecen hoy en el proyecto una vía de extracción automática verificada. FinMind es un agregador (con token y cuota), no una fuente oficial que certifique |
| 4 | **JP: conflictos sin discrepancia de importe** (el proveedor complementario `EDINET_DB` corrobora el importe exacto de un registro con otra etiqueta XBRL; la política exige la misma etiqueta) | 1.891–5.408 celdas/año; +3,1 a +8,9 pp si se aprueba `CORROBORADO_IMPORTE_EXACTO` | **Diagnosticado y medido** (`tools/potencial_corroboracion.cjs`). No se aplica: cambiar la regla de certificación es una decisión financiera |
| 5 | **JP: PCV presentes sin verificar** | 6.468–7.621 celdas/año | Pendiente de un nuevo barrido de verificación EDINET (recuperadores activos; no se han tocado) |
| 6 | **JP: conflictos por signo en CAPEX** (convención de salida de caja negativa frente a positiva) | ≈ 2 % de la muestra JP | Regla de normalización propuesta: comparar \|CAPEX\|. Pendiente de aprobación |
| 7 | **KPI bloqueados por dependencias**: un solo PCV no certificado bloquea cada KPI que lo use (p. ej. INGRESOS bloquea 7 KPI) | KPI < PCV en todos los países | Coherente con la regla: no se certifica un ratio con entradas no acreditadas |

### Conflictos JP sin discrepancia de importe (exacto, no muestral)

|---|---|---|---|---|---|---|
| US | 2022 | 34304 | 2 | 34302 | 18.5 % | 18.5 % |
| US | 2023 | 40114 | 3 | 40111 | 16.44 % | 16.44 % |
| US | 2024 | 40214 | 3 | 40211 | 16.64 % | 16.64 % |
| US | 2025 | 41142 | 2 | 41140 | 15.23 % | 15.23 % |
| JP | 2022 | 4000 | 1891 | 2109 | 68.19 % | 71.3 % |
| JP | 2023 | 9093 | 5408 | 3685 | 60.01 % | 68.89 % |
| JP | 2024 | 9167 | 5400 | 3767 | 58.99 % | 67.86 % |
| JP | 2025 | 9065 | 5329 | 3736 | 50.16 % | 58.92 % |


### Cobertura certificada por concepto (2024)

|---|---|---|---|
| INGRESOS | 20.64 % | 26.36 % | 0 % |
| BENEFICIO_BRUTO | 13.28 % | 82.52 % | 0 % |
| EBIT | 21.78 % | 86.71 % | 0 % |
| BENEFICIO_NETO | 23.75 % | 89.36 % | 0 % |
| GASTO_INTERESES | 7.31 % | 76.85 % | 0 % |
| EFECTIVO | 20.59 % | 26.92 % | 0 % |
| ACTIVOS_TOTALES | 25.7 % | 89.28 % | 0 % |
| PASIVOS_TOTALES | 23.7 % | 89.28 % | 0 % |
| PATRIMONIO_NETO | 23.38 % | 89.08 % | 0 % |
| DEUDA_CORTO_PLAZO | 1.17 % | 1.06 % | 0 % |
| DEUDA_LARGO_PLAZO | 5.71 % | 0.98 % | 0 % |
| FLUJO_CAJA_OPERATIVO | 25.62 % | 29.52 % | 0 % |
| CAPEX | 16.5 % | 83.44 % | 0 % |
| DEPRECIACION_AMORTIZACION | 14.31 % | 89.92 % | 0 % |
| INVENTARIOS | 11.48 % | 10.78 % | 0 % |
| CUENTAS_COBRAR | 15.27 % | 55.35 % | 0 % |
| CUENTAS_PAGAR | 12.67 % | 75.51 % | 0 % |


## Qué se ha corregido en esta fase y qué no

- **Corregido en el software**: la cobertura se mide con un universo congelado y una regla idéntica a la del adaptador; los KPI se certifican desde los PCV con cadena de evidencia (`/companies/:id/kpis`); el estado de cada celda se expone por API (`/companies/:id/pcv`); se dispone de herramientas reproducibles de clasificación de conflictos y de potencial de corroboración.
- **No corregido**: ninguna escritura en MySQL operativo (restricción absoluta). Hay que planificar el aumento real de cobertura como una fase de recuperación con escritura en un entorno autorizado, en este orden: (1) conciliación SEC de conflictos US con selección de período; (2) regla de no aplicabilidad justificada; (3) aprobación de `CORROBORADO_IMPORTE_EXACTO`; (4) nuevo barrido de verificación EDINET; (5) fuente oficial para Taiwán.

## Universo congelado

universo {"US":{"companies":8017,"sha256":"9e0113d347d1ead0c3d43ef54480da2e8b2e82ba377e7e8dddfa2548d506bd08"},"JP":{"companies":3581,"sha256":"32a2836f6fed34a44dc59a60f178c54bce3f86be6e621d0a343b201158522278"},"TW":{"companies":1596,"sha256":"e7cb71fbb1d118e90f30a58504b63bca11b45851372dc9e81554fabd0064268e"}}
snapshot 2026-10-30 23:53:17.357099
