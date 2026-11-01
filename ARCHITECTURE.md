# Arquitectura

```
client/ (Vite+React)            sectorial/app/client (UI de referencia sectorial)
        │ /api/capital                  │ /api/sectorial
server/src/capital (3100)        sectorial/app/server.cjs (3200, 127.0.0.1)
server/src (valoración, PCV)       ├─ adapter.cjs ── MySQL READ ONLY (o mock.cjs, sin MySQL)
valuation_engine/ (motor TS)       ├─ workflow.cjs ─ registry.cjs (16 modelos) ─ calendario.cjs
                                   ├─ engine/ (TS → dist): grafo, plan, activos, activosAvanzados, fiscalidad, ledger
                                   ├─ vendor/capital (funciones puras de Capital: CAPM, WACC, primas)
                                   ├─ kpi.cjs · taxonomy.cjs · store.cjs (runs + motores archivados)
                                   └─ export-worker.mjs → exporter.mjs (Artifact Tool) | exporter-portable.mjs (SheetJS)
                                                        → native-qa.cjs (Excel COM, sólo lectura)
```

## Principios

- **Grafo único**: cada partida es un nodo con una expresión. TypeScript lo evalúa y Excel recibe la misma expresión como fórmula, de modo que la paridad se comprueba nodo a nodo en los tres escenarios.
- **Datos acreditados o bloqueo**: el adaptador sólo admite observaciones con identidad, período, moneda, unidad y evidencia compatibles. NULL nunca es 0. Los conflictos quedan visibles. No se usa información posterior a la fecha de valoración.
- **Inmutabilidad y replay**: una ejecución es `runs/<sha256(entradas|configuración|motor)>.json`, y el código exacto se archiva en `engines/<hash>`. La exportación hace un replay con ese código; si no coincide, falla con `REPLAY_NO_COINCIDE`.
- **Excel**: el exportador principal (Artifact Tool, presentación Inditex) se usa si está instalado (`@oai/artifact-tool` es privado y no redistribuible). Si no, el exportador portable (SheetJS, Apache-2.0) escribe las mismas celdas y fórmulas. En ambos casos sólo se descarga un archivo validado en Microsoft Excel: apertura sin reparación, recálculo, paridad, Ke/WACC reactivos y bloqueo respetado. Los dos superan 16/16 (117.621 comprobaciones cada uno).
- **Capital**: se reutilizan las funciones puras del módulo Capital vigente (`vendor/capital`). Ninguna prima se activa sin una metodología calibrada y aprobada.
- **Producción**: el módulo nunca escribe en MySQL. Las migraciones se entregan como SQL no ejecutado.

## Relación con el resto del repositorio

- `server/src/pcv/*` y `server/scripts/recuperar-*`: recuperación y verificación de PCV. En el equipo original siguen en ejecución; no se han modificado.
- `server/src/capital/*` y `valuation_engine/research/coste_capital`: módulo Capital v2, versionado en esta rama (antes sólo existía sin commit).

## Capa de datos financieros y certificación (estado de entrega, 31/10/2026)
```
Proveedores (SEC · EDINET · FinMind · MOPS manual · J-Quants/Eulerpool solo para contraste)
   │  guardián HTTP compartido (server/src/proveedores/guardiaHttp.ts)
   ▼
Recuperadores (server/scripts/recuperar-*.cjs; coordinador recuperar-pcv-plan.cjs)
   │  identidad empresarial por país (src/pcv/mercados.ts; vinculador EDINET solo JP)
   ▼
informe_financiero ──► partida_contable_valor (ORIGINAL; identidad_observacion, migración 33)
   │                         │
   │                         ├─ normalización (src/valoracion/datos.ts)
   │                         ├─ certificación (pcv_verification_evidence; reglas versionadas, migración 31)
   │                         └─ selección SELECCION_OBSERVACIONES_V2 (src/pcv/seleccionObservaciones.ts)
   ▼
KPI (insercionKPIInformeFinanciero.ts; perímetro de ROE) ──► kpi_financiero_informe
   ▼
Adaptador DCF (sectorial/app/adapter.cjs: fuente del país, publicación ≤ fecha de valoración,
prueba certificadora por fila) ──► motor sectorial / valuation_engine ──► Excel ──► API / UI
```
Detalles en `DATABASE.md`, `DATA_SOURCES.md` y `VALUATION_ENGINE.md`.
