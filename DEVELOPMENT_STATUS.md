# Estado técnico (31/10/2026)

| Componente | Estado | Evidencia |
|---|---|---|
| Backend operativo (`server/`) compila | COMPLETADO Y VERIFICADO | `npm --prefix server run build` tras `npm ci` limpio; `npm --prefix server test`: 228 superadas, 0 fallos, 1 omitida (integración Capital con escritura en MySQL de desarrollo, opcional con `CAPITAL_DB_TESTS=1`) |
| Motor de valoración (`valuation_engine/`) | COMPLETADO Y VERIFICADO | `npm test`: 20/20 |
| Módulo Capital v2 compila | COMPLETADO Y VERIFICADO | `npm --prefix server run capital:build` (sourceHash 615ec055…) |
| Frontend existente (`client/`) compila | COMPLETADO Y VERIFICADO | `npm --prefix client run build` |
| Motor sectorial: 16 modelos, 3 escenarios, calendarios, fiscalidad, NWC, flujos, valor terminal | COMPLETADO Y VERIFICADO (técnico) | Regresión 39/39; 4.293 identidades independientes con y sin eventos de activos; transmisión de 66 drivers; motor `3b76805d…` reproducido byte a byte en esta rama |
| Excel nativo, exportador principal (Artifact Tool, formato Inditex) | COMPLETADO Y VERIFICADO | 16/16 VALIDADO, 117.621 comprobaciones, sin reparación: `sectorial/evidence/excel_nativo_final_16_sectores.json` |
| Excel nativo, exportador portable (SheetJS) | COMPLETADO Y VERIFICADO | 16/16 VALIDADO, 117.621: `sectorial/evidence/excel_nativo_portable_16_sectores.json` |
| Presentación Excel (inspección visual) | FUNCIONAL CON DEFECTOS MENORES | Capturas en `sectorial/evidence/capturas_excel/`. Pendiente: filas 71-74 visibles (ocultas en el maestro), "(0,00)" por residuos de coma flotante, NWC desagregado vacío en el bloque FCFF, tipo impositivo sin formato %, "####" con importes grandes en JPY, primer período parcial sin rótulo |
| API sectorial + modo mock | COMPLETADO Y VERIFICADO | `api_mock.test.cjs` 12/12; prueba de humo `npm run sectorial:mock`; API real contra MySQL 24/24 (`sectorial/evidence/api_v3.json`) |
| PCV/KPI: contratos de consulta, estados de certificación, cobertura | COMPLETADO Y VERIFICADO | `/companies/{id}/pcv`, `/kpis`, `/coverage`; `PCV_KPI_STATUS.md` |
| Cobertura PCV/KPI ≥ 85 % | **NO ALCANZADA** — correcciones preparadas, no ejecutadas | Oficial: US 15–18,5 % PCV / 10–12,6 % KPI; JP 50–68 % / 28–52 %; TW 0 %. Tras aplicar la migración 31 (simulado): US 43–46 % / 29–31 %; JP 58–70 % / 48–58 %; TW 0 % (`PCV_KPI_STATUS.md`) |
| Diagnóstico de conflictos SEC/EDINET y reglas versionadas | COMPLETADO Y VERIFICADO (diagnóstico); migración PREPARADA | `sectorial/app/tools/diagnostico_conflictos.cjs`, `correcciones.test.cjs` (8/8); `server/sql/31_*` no ejecutada |
| Guardián HTTP global (FinMind, J-Quants, Eulerpool) | COMPLETADO Y VERIFICADO | `server/src/proveedores/guardiaHttp.ts`; `guardiaHttp.test.cjs` 14/14 |
| Conectores J-Quants V2 y Eulerpool | COMPLETADO Y VERIFICADO (corroboración, no certifican) | `server/src/proveedores/conectores.ts`; `conectores.test.cjs` 4/4; llamadas reales registradas en `INFORME_INTEGRACION_PCV_KPI.md` |
| Taiwán: anual de resultados desde 4 trimestres (FinMind) | IMPLEMENTADO Y PROBADO; datos guardados PENDIENTES DE REPROCESO | `server/src/pcv/finmindTrimestral.ts`; `finmindTrimestral.test.cjs` 5/5 |
| Taiwán: identidad cruzada (documentos EDINET en empresas TW) | DETECTADO; cuarentena PREPARADA, no ejecutada | `server/sql/32_*`; `tools/cuarentena_identidad.cjs` |
| Taiwán: verificación oficial | BLOQUEADO POR CONDICIONES DEL PROVEEDOR (descarga automatizada de MOPS no permitida); verificador manual IMPLEMENTADO Y PROBADO | `tools/verificar_mops_local.cjs` |
| Taxonomía sectorial (banca, seguros, REIT, utilities, farma, energía/minería, fiscalidad) | IMPLEMENTADO PERO NO VERIFICADO con datos reales | Contrato `/taxonomy`; migración `server/sql/30_*` generada y no ejecutada |
| Primas de liquidez y tamaño | PENDIENTE DE CALIBRACIÓN (conexión técnica y simulación verificadas) | `RISK_PREMIUM.md` |
| Valoraciones de empresas reales | BLOQUEADO POR DATOS | Censo de las 40 empresas con más verificaciones: ninguna tiene los 4 históricos exigidos certificados (`sectorial/evidence/censo_real_2026-10-30.json`). AMD, Toyota y Microsoft siguen bloqueadas |
| Aprobación financiera de los modelos | PENDIENTE DE APROBACIÓN FINANCIERA | `financialApproval: PENDIENTE` en toda ejecución |
| Integración en producción | PENDIENTE DE DESPLIEGUE | `DEPLOYMENT_PLAN.md` |

## Qué falta para desbloquear una valoración real

Para una empresa no financiera: (1) los 4 cierres con los conceptos de `requiredHistory` en estado VALIDADO; (2) clasificación resuelta o declarada; (3) puente de apertura a la fecha de valoración con saldos fiscales acreditados; (4) cohortes de activos (saldos, vidas, residuales, fechas) y CapEx futuro citados; (5) política contable de perímetro completo; (6) hipótesis citadas para los tres escenarios; (7) política terminal documentada. La API devuelve exactamente qué falta en `issues` y `requiredInputs`.

## Reproducir las comprobaciones

```bash
npm run setup && npm --prefix server run build && npm --prefix client run build
npm test                          # valuation_engine + server
npm run sectorial:test            # motor sectorial, API mock, React SSR, bloqueos, transmisión, contratos
npm run sectorial:qa:excel        # sólo Windows con Microsoft Excel y Artifact Tool (validación nativa de los 16 sectores)
node sectorial/app/tests/qa_portable.mjs 1 2 … 16   # sólo Windows con Excel (exportador portable)
npm run sectorial:coverage        # necesita .env con MySQL (sólo lectura)
```
