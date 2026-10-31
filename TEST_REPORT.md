# Informe de pruebas (01/11/2026, congelación del backend)

Entorno: Windows 11, Node 24.19.0, MySQL 8 (contenedor `mysql:8`), Microsoft Excel 365. Rama `entrega/frontend-handoff-20261031`.

| Suite | Comando | Resultado |
|---|---|---|
| Motor de valoración | `npm --prefix valuation_engine test` | **20/20** |
| Backend (unitarias, incluye guardián HTTP, conectores, selección de observaciones, perímetro de ROE, periodo SEC, identidad por país, FinMind trimestral, moneda SEC) | `npm --prefix server test` | **271/272**, 0 fallos, 1 omitida* (nuevas: participaciones no dominantes sin cero supuesto, bloqueo ADR 20-F, control de credenciales comprometidas en la transición) |
| Regresión del motor sectorial | `node --test sectorial/app/engine/probar.cjs` | **39/39** |
| Integración sectorial (API mock, bloqueos, transmisión, contratos, versiones, SSR, clasificación, reglas de corrección, adaptador con correcciones, **días de circulante, NWC y ΔNWC**) | `npm run sectorial:test` | **113/113** (nuevas: réplica del perímetro = backend; ROE `PERIMETRO_INCOMPATIBLE` en la capa sectorial) |
| Días de circulante (`sectorial/app/tests/circulante.test.cjs`, incluida arriba): fórmulas sobre ventas y convencionales, 365 días, saldos de cierre, activos contractuales sin doble cómputo, ausencia = NULL, división por cero, ΔNWC con signo, primer ejercicio sin saldo inicial, cambio de moneda o de base, ejercicios no consecutivos; motor (sectores 4, 6 y 16) con saldos = ingresos × días / 365, ΔNWC restado una vez en el FCFF (+10 días de cobro → −ingresos × 10 / 365 en FCFF), históricos con el mismo denominador; banca y seguros sin días | `node --test sectorial/app/tests/circulante.test.cjs` | **10/10** |
| Validación nativa de Excel (16 plantillas, exportador portable, motor `53e83446…`) | `npm run sectorial:qa:excel:portable` | **16/16 VALIDADO**, 118.293 comprobaciones de fórmulas (+672 por las filas de días históricos y drivers sobre ventas), 0 referencias rotas, 0 aperturas en modo reparación |
| Integración MySQL: idempotencia de recuperaciones (FinMind, SEC/EDINET verificada, «solo ausentes»); una recarga FinMind con otro importe no sobrescribe el existente | `npm run test:integration:mysql` contra la copia aislada | **2/2** |
| Instalación limpia (clon nuevo del commit `8f9e8eb` sin `.env` ni datos privados): `setup`, `build`, `capital:build`, `npm test`, `sectorial:test` | ver `SETUP.md` | **todo con código 0**; 20/20, 266/267, 39/39, 111/111 |
| Transición de recuperadores (worktree operativo) | `node server/scripts/transicion-recuperadores.cjs --comprobar` | código, migración 33 y checkpoints **OK**; rechaza las 20 variables comprometidas del `.env` antiguo; bloquea mientras quede un recuperador vivo o falte el `.env` nuevo (comportamiento esperado) |
| Lotes de Taiwán | `sectorial/app/tools/verificar_lotes_tw.cjs` | huella `509253268`; 21.643 + 7.249 + 4.204 vigentes, 0 discrepancias |
| Integridad de producción | `integracion_v02/tests/integridad_claude.cjs` | 228 archivos operativos sin cambios, 16 maestros, **60 valoraciones congeladas idénticas** (sha256 `cb0a95e3…`) |

\* La omitida es la integración de Capital con escritura en un MySQL de desarrollo, opcional con `CAPITAL_DB_TESTS=1`. No es un fallo.

## Verificaciones de datos en producción (MySQL operativo)
| Comprobación | Resultado |
|---|---|
| Migración 31 | 582.430 correcciones de periodo; 23.096 reclasificaciones; 8.528 inserciones; 0 filas con valor distinto del aplicado; las 1.923.026 filas fuera del registro de correcciones, idénticas por sha256 |
| Migración 32 | 112 instrumentos y 298 informes reasignados; 1.160 en cuarentena; 0 discrepancias |
| Taiwán, lotes 1–3 | 33.096 PCV corregidos (suma T1–T4) en 2.598 informes de 666 empresas; lote 3: 4.204 PCV (507 informes, 134 empresas), huella `509253268` idéntica a la del ensayo; 0 discrepancias en los tres lotes |
| Migración 33 | hash de las 2.552.116 filas de PCV idéntico antes y después; 0 identidades mal calculadas; índice único activo |
| Recálculo de KPI | 25.950 + 906 + 507 informes; 0 informes bloqueados enteros; cada KPI retirado con su causa (lote 3: 436 por `PRERREQUISITO_DEUDA_V2`) |
| Recuperadores tras las reparaciones | 0 conflictos nuevos en celdas corregidas |
| Rollbacks | todos ensayados en la copia aislada con huella idéntica al estado previo |

## Días de circulante con datos reales (`sectorial/app/coverage/circulante_casos_reales_20261031.json`)
| Empresa | Resultado |
|---|---|
| Apple (FY2022–FY2025) | DSO 26,1 / 28,1 / 31,2 / 34,9 días; DPO sobre ventas 59,4 / 59,6 / 64,4 / 61,3; CCC sobre ventas −28,7 / −25,5 / −26,4 / −21,4; convencional DPO sobre coste 104,7–119,7; ΔNWC +4.213 / −1.492 / +3.899 M$ (FY2022 sin saldo inicial) |
| Microsoft | FY2023–FY2025 certificados (DSO 83,9–90,6); FY2026 bloqueado por entradas pendientes |
| ASML | 4 ejercicios en EUR; días de inventario sobre ventas 117–141 y DIO sobre coste 241–289 (metodologías distintas, no comparables entre sí) |
| Toyota, Sony | bloqueados: ingresos, clientes y proveedores IFRS sin verificar |
| Otake | DSO y DPO certificados; inventario pendiente, así que DIO, CCC y NWC bloqueados (no se usa cero) |
| TSMC, Hon Hai, MediaTek | sin informes elegibles (sin fecha de publicación) |

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
