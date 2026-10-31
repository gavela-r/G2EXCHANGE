# G2EXCHANGE — Informe final de entrega (31/10/2026)

Rama: `entrega/frontend-handoff-20261031` (worktree `G2EXCHANGE_entrega`, creada desde `20e02b5`, rama `g2-pcv-supplement-20261028`). **No se ha hecho push.**

Leyenda: **CV** = completado y verificado · **INV** = implementado pero no verificado · **PARCIAL** = funcional con datos parciales · **EXT** = bloqueado por fuentes externas · **CAL** = pendiente de calibración · **APR** = pendiente de aprobación financiera · **DESP** = pendiente de despliegue.

## 1. Estado general
El backend compila, las pruebas críticas pasan desde un clon limpio, la API está documentada, tipada y simulada con mocks, y los 16 modelos son accesibles y están validados técnicamente en Excel nativo. El frontend puede desarrollarse sin MySQL ni credenciales. **No se alcanza la cobertura PCV/KPI del 85 %** (§7), las primas no están calibradas (§9) y ninguna empresa real puede valorarse todavía (§10).

## 2. Los 16 modelos — CV técnico · APR financiero
Detalle por sector en `VALUATION_MODELS.md`. En esta fase se han diferenciado de verdad 04 (base instalada + posventa), 05 (producción × cuota × contenido × reducciones), 07 (volumen × precio/mix), 10 (RAB ≤ altas reconocidas), 12 (I+D explícita), 13 (RWA de otros activos, tesorería remunerada, ponderaciones > 100 %) y 14 (float remunerado). Los 66 drivers sectoriales se transmiten a los estados y al valor, salvo 7 exenciones metodológicas justificadas.

## 3. Excel nativo — CV
- Motor congelado `3b76805dbd8d6fd8160009110a548d4126e748ae4463ca8488acdab928c7f424` (mismo hash al inicio y al final; la rama reproduce el motor byte a byte).
- Exportador principal (Artifact Tool): **16/16 VALIDADO**, 117.621 comprobaciones de fórmulas, sin reparación, 0 referencias rotas, paridad en 3 escenarios, Ke/WACC reactivos y bloqueo respetado → `sectorial/evidence/excel_nativo_final_16_sectores.json`.
- Exportador portable (SheetJS): **16/16 VALIDADO**, 117.621 → `sectorial/evidence/excel_nativo_portable_16_sectores.json`.
- El lote anterior (motor `ebbcdbec`) queda registrado como superado y no cuenta como validación.
- Inspección visual (capturas generadas por Excel en `sectorial/evidence/capturas_excel/`): se conserva el diseño Inditex. Hay defectos menores pendientes: filas 71-74 visibles, "(0,00)" por residuos de coma flotante, NWC desagregado vacío en el bloque FCFF, tipo impositivo sin %, "####" con importes grandes en JPY y primer período parcial sin rótulo.

## 4. Pruebas TS/Excel — CV
Regresión 39/39; integración sectorial 88/88 (bloqueos, transmisión, contrato del adaptador, versiones/descargas, React SSR, clasificación, API mock, activos avanzados); 4.293 identidades independientes (balance, caja, roll-forward del inmovilizado, CapEx→CFI, EBITDA/EBIT, NWC, impuesto devengado frente a pagado, VP, Gordon, EV→equity, CAPM, WACC), con y sin eventos de activos.

## 5. Backend — CV
En clon limpio sin `.env`: `npm run setup`, compilación de `server`, Capital y `client`; `npm test` → valuation_engine 20/20 y server 228 superadas, 0 fallos, 1 omitida (integración Capital con escritura en un MySQL de desarrollo, ahora opcional con `CAPITAL_DB_TESTS=1`). Corrección incluida: `server test` compila antes `dist-capital`.

## 6. API — CV
`sectorial/app/server.cjs` (G2_SECTORIAL_DEV_0.3): errores tipados, modo mock, CORS por lista blanca, validación de parámetros, paginación, endpoints de PCV/KPI/cobertura/taxonomía/capital/simulación de primas, exportación con descarga sólo validada. Contratos: `API.md`, `sectorial/app/contracts/openapi.yaml`, `api.d.ts` (tipado comprobado) y `mocks/*.json` generados por la propia API. Pruebas de seguridad (Host, Origin, token, identificadores, rutas, hash obsoleto): en verde. API real contra MySQL: 24/24 (`sectorial/evidence/api_v3.json`).

## 7. MySQL y cobertura PCV/KPI — PARCIAL / EXT
Sólo lectura en todo momento. Universo congelado (sha256 por país), sin exclusiones; datos en `PCV_KPI_STATUS.md` y `sectorial/app/coverage/cobertura_actual.json`.

| País | 2022 PCV / KPI | 2023 PCV / KPI | 2024 PCV / KPI | 2025 PCV / KPI |
|---|---|---|---|---|
| US | 18,50 % / 12,58 % | 16,44 % / 11,08 % | 16,64 % / 11,09 % | 15,23 % / 10,04 % |
| JP | 68,19 % / 52,33 % | 60,01 % / 35,35 % | 58,99 % / 34,53 % | 50,16 % / 27,68 % |
| TW | 0 % / 0 % | 0 % / 0 % | 0 % / 0 % | 0 % / 0 % |

Problemas por impacto: (1) 34–41 k conflictos US con discrepancia real de valor; (2) 29–34 % del universo US sin informe anual; (3) Taiwán sin ningún verificador; (4) JP: entre 1.891 y 5.408 conflictos al año que son sólo de etiqueta (+3 a +9 pp si se aprueba `CORROBORADO_IMPORTE_EXACTO`); (5) PCV JP presentes sin verificar; (6) signo de CAPEX; (7) KPI bloqueados por dependencias.

## 8. Correcciones de recuperación y certificación
- **Diagnosticado y medido** (no aplicado, porque cambia la política de certificación o requiere escribir en MySQL): conflictos JP sólo de etiqueta (`tools/potencial_corroboracion.cjs`); clasificación de conflictos US/JP (`tools/clasificar_conflictos.cjs`).
- **Implementado**: KPI certificados desde los PCV con cadena de evidencia; estado PCV por celda vía API; medición reproducible de la cobertura.
- **No ejecutado**: ninguna escritura en MySQL (restricción absoluta).

## 9. Taxonomías — INV
25 conceptos sectoriales (banca, seguros, REIT, utilities, farma, industriales/defensa, energía/minería, fiscalidad) con etiquetas XBRL candidatas: `sectorial/app/taxonomy.cjs`, `GET /taxonomy`, migración **no ejecutada** `server/sql/30_taxonomia_sectorial.sql` (inactiva) + rollback. Pendiente: extracción de esos PCV y ampliación de `MAP` en el adaptador, con nueva validación del motor. Banca y seguros reales siguen BLOQUEADOS POR DATOS.

## 10. Primas de riesgo — liquidez: CAL · tamaño: CAL
El módulo de Codex está conectado (diagnóstico por escenario, aprobaciones, ajuste bidireccional). Tiene 0 metodologías calibradas, así que `NO_ESTIMABLE` y ajuste 0. No hay calibraciones empíricas disponibles: no se han encontrado muestras con licencia adecuada ni precios completos en esta sesión. La simulación riesgo → prima → Ke/WACC → escenarios → valor está verificada (+1 % ⇒ ΔKe = +1 pp exacto; en banca, por Ke). Ver `RISK_PREMIUM.md`.

## 11. Valoraciones reales — EXT (bloqueado por datos)
En el censo de las 40 empresas con más verificaciones, ninguna tiene los 4 históricos exigidos certificados; 32 tienen el sector `N/A`. AMD (72 conflictos, 52/53 semanas), Toyota (faltan ingresos, CapEx, NWC, cohortes) y Microsoft (contexto) siguen bloqueadas. Los Excel de diagnóstico se rotulan como tales y no son valoraciones. Qué falta para desbloquear: `DEVELOPMENT_STATUS.md`.

## 12. Frontend — CV (base)
`client/` compila (monta hoy CapitalApp). La UI de referencia sectorial (`sectorial/app/client`) cubre el recorrido completo con datos mock; pruebas SSR 9/9. Guía: `FRONTEND_HANDOFF.md`.

## 13. GitHub — preparado, sin push
Commits (autor configurado en el repositorio: Juanolas):
```
4524c2f Build the Capital module before server tests so a clean clone passes
032aa02 Add frontend handoff docs, API contracts, portable exporter and coverage diagnostics
88581fd Add sectorial valuation module (16 models), mock API, KPI certification and coverage tooling
ce68381 Update coverage and provider reports (pre-existing uncommitted docs)
5953b63 Add Capital v2 module and its integration (pre-existing uncommitted work)
```
Comprobado: árbol limpio; sin `.env`; sin secretos en el diff (sólo la contraseña sintética de prueba ya existente); paquete Git 1,16 MiB; mayor archivo 1,5 MB (inventario de plantillas); `node_modules`, `dist`, datos de ejecución y artefactos de QA excluidos; las plantillas Excel van incluidas (4,9 MB). El árbol de trabajo original sigue intacto (misma rama y los mismos 51 cambios sin commit).

**Comando pendiente (ejecutar tras revisar):**
```bash
cd C:\Users\Juan\Desktop\G2_EXCHAGE\G2EXCHANGE_entrega
git push -u origin entrega/frontend-handoff-20261031
```
(`origin` = https://github.com/gavela-r/G2EXCHANGE.git, ya configurado. Sin `--force`. Antes de compartirlo, comprueba que el repositorio remoto es privado.)

## 14. Instalación
Ver `README.md` (sección inicial) y `FRONTEND_HANDOFF.md`. Verificado en un clon limpio sin `.env`: `npm run setup && npm run sectorial:build && npm run sectorial:test && npm test`.

## 15. Integridad de producción — CV
228 archivos operativos sin cambios, 16 maestros intactos, 60 ejecuciones congeladas idénticas (sha256 `cb0a95e3…`). Recuperadores 22200, 9028 y 7068 vivos. MySQL no se ha reiniciado. No se han modificado checkpoints de recuperación, colas, tablas, el módulo Capital operativo ni credenciales. No se ha ejecutado ninguna migración ni despliegue. Sólo se reinició el servicio aislado 3200 (PID 21324).

## 16. Limitaciones pendientes
Cobertura < 85 % (§7); conflictos US que requieren conciliación con escritura autorizada; Taiwán sin fuente oficial verificable; política `CORROBORADO_IMPORTE_EXACTO` pendiente de aprobación; taxonomía sin datos; primas sin calibrar; concentración de clientes no desarrollada; defectos visuales menores en Excel (§3); la sesión local de la API no es autenticación de usuarios; la descarga de Excel exige Microsoft Excel en Windows.

## 17. Siguientes pasos del desarrollador frontend
1. `npm run setup && npm run sectorial:build && npm run sectorial:mock`.
2. Generar los tipos del cliente a partir de `contracts/api.d.ts` y usar `mocks/*.json` en historias o pruebas.
3. Construir búsqueda → ficha (PCV con estados) → KPI → hipótesis (formularios guiados por `model.drivers`/`descriptions`) → escenarios → capital/primas (simulación) → exportación (estados de trabajo) → cobertura.
4. Respetar las reglas de presentación de `FRONTEND_HANDOFF.md` (null ≠ 0, bloqueos, datos sintéticos, aprobación pendiente).

## 18. Checkpoint de continuidad
`sectoriales_auditoria_20261030/integracion_v02/CHECKPOINT_CLAUDE.md` (entorno aislado) y este informe. Recuperación: `checkpoints/integracion_v02_pre_claude_20261030.tar.gz` (antes de Claude) y `checkpoints/entrega_frontend_20261031.bundle` (bundle Git de esta rama).
