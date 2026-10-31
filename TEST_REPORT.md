# Informe de pruebas (31/10/2026)

Entorno: Windows 11, Node 24.19.0, MySQL 8 (contenedor `mysql:8`), Microsoft Excel 365. Rama `entrega/frontend-handoff-20261031`.

| Suite | Comando | Resultado |
|---|---|---|
| Motor de valoración | `npm --prefix valuation_engine test` | **20/20** |
| Backend (unitarias, incluye guardián HTTP, conectores, selección de observaciones, perímetro de ROE, periodo SEC, identidad por país, FinMind trimestral, moneda SEC) | `npm --prefix server test` | **266/267**, 0 fallos, 1 omitida* |
| Regresión del motor sectorial | `node --test sectorial/app/engine/probar.cjs` | **39/39** |
| Integración sectorial (API mock, bloqueos, transmisión, contratos, versiones, SSR, clasificación, reglas de corrección, adaptador con correcciones) | `npm run sectorial:test` | **101/101** |
| Validación nativa de Excel (16 plantillas, exportador portable, motor `684a9340…`) | `npm run sectorial:qa:excel:portable` | **16/16 VALIDADO**, 117.621 comprobaciones de fórmulas, 0 referencias rotas, 0 aperturas en modo reparación |
| Integración MySQL: idempotencia de recuperaciones (FinMind, SEC/EDINET verificada, «solo ausentes») | `npm run test:integration:mysql` contra la copia aislada | **2/2** |
| Instalación limpia (clon nuevo sin `.env` ni datos privados): `setup`, `build`, `capital:build`, `npm test`, `sectorial:test` | ver `SETUP.md` | **todo correcto**; mismos resultados que arriba |
| Integridad de producción | `integracion_v02/tests/integridad_claude.cjs` | 228 archivos operativos sin cambios, 16 maestros, **60 valoraciones congeladas idénticas** (sha256 `cb0a95e3…`) |

\* La omitida es la integración de Capital con escritura en un MySQL de desarrollo, opcional con `CAPITAL_DB_TESTS=1`. No es un fallo.

## Verificaciones de datos en producción (MySQL operativo)
| Comprobación | Resultado |
|---|---|
| Migración 31 | 582.430 correcciones de periodo; 23.096 reclasificaciones; 8.528 inserciones; 0 filas con valor distinto del aplicado; las 1.923.026 filas fuera del registro de correcciones, idénticas por sha256 |
| Migración 32 | 112 instrumentos y 298 informes reasignados; 1.160 en cuarentena; 0 discrepancias |
| Taiwán, lotes 1 y 2 | 28.892 PCV corregidos (suma T1–T4); 0 discrepancias; huellas idénticas a las del ensayo |
| Migración 33 | hash de las 2.552.116 filas de PCV idéntico antes y después; 0 identidades mal calculadas; índice único activo |
| Recálculo de KPI | 25.950 + 906 informes; 0 informes bloqueados enteros; cada KPI retirado con su causa |
| Recuperadores tras las reparaciones | 0 conflictos nuevos en celdas corregidas |
| Rollbacks | todos ensayados en la copia aislada con huella idéntica al estado previo |

## Casos reales a través del adaptador DCF (`sectorial/app/coverage/cadena_casos_reales_20261031.json`)
| Empresa | Resultado |
|---|---|
| Apple | 4 ejercicios (FY2022–FY2025), 10 de 10 campos `VALIDADO` y sin incidencias; los valores coinciden con la SEC (por ejemplo, ingresos de FY2025: 416.161 M$) |
| Microsoft | 3 ejercicios con 10 de 10; FY2026 sin validar y contexto cambiante, así que `BLOQUEADO` con causa |
| ASML (20-F) | 4 ejercicios con 10 de 10 en EUR; es un ADR y falta ratio y tipo de cambio para valorarlo en USD |
| Toyota y Sony (IFRS) | 6 de 10: faltan ingresos, beneficio bruto, CAPEX y acciones en el verificador EDINET |
| Otake (JGAAP) | 8 de 10; EFECTIVO = CashAndCashEquivalents y caja y depósitos reclasificada |
| TSMC, MediaTek | sin informes de fuente taiwanesa (los documentos japoneses están en cuarentena); 0 certificados |
| Hon Hai | datos de FinMind corregidos (ingresos de 2024: 6.859.615.493.000 TWD); sin fecha de publicación, así que el DCF queda bloqueado; 0 certificados |
