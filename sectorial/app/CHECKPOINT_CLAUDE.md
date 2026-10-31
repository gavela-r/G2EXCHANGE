# Checkpoint de continuación — Claude Code (30/10/2026, noche)

Continúa el trabajo de Codex. El CHECKPOINT.md de Codex (14:27) se conserva intacto; este archivo registra lo posterior.
Recuperación previa a cualquier cambio: `../checkpoints/integracion_v02_pre_claude_20261030.tar.gz`
(sha256 7c175950704a5f1674e1a8d84b333ccf66949137c5cde5771fb88407ee7314e6).

## Estado heredado verificado

- Corrección `SUM()` vacío: en `engine/src/grafo.ts` (`add()` sin argumentos → `0`, `mul()` → `1`) y compilada en `engine/dist/grafo.js`.
- Validación nativa de Codex (run e4a7fe48…, motor b5d6c35a…): abre sin reparación, 2.676 comprobaciones, Ke/WACC reaccionan, bloqueo Toyota mantenido. El servidor sólo sirve XLSX con `.validation.json` cuyo sha256 coincide.
- Después de esa validación Codex añadió `fiscalidad.ts`, `ledger.ts`, puente de apertura con saldos fiscales y política contable (`accountingPolicy`). Compila (tsc 0 errores). Regresión: 39/39 (`engine/probar.cjs`) y 15/15 (`tests/*.test.cjs`).

## Cambios de Claude Code

| Archivo | Cambio |
|---|---|
| workflow.cjs | `result.source` depende del snapshot (`MYSQL_SOLO_LECTURA` → `EMPRESA_MYSQL`; cualquier otro → `QA_SINTETICO_NO_EMPRESA`). Clasificación declarada por analista (`config.classification`), sólo si la acreditada no está resuelta; queda en `result.classification.declared` y `result.notices`. |
| exporter.mjs | Rótulo "PRUEBA SINTÉTICA QA — NO ES UNA EMPRESA" cuando la fuente no es MySQL; avisos exportados a la tabla de bloqueos de S_Control. |
| server.cjs | Admite `classification` en la configuración. |
| client/App.jsx (+ public/ recompilado) | Saldos fiscales de apertura en el puente; editor de perímetro contable y otras partidas con sus drivers; año de alta de cohortes y drivers `capex.<id>`; selector de clasificación declarada; avisos; botón "Excel de diagnóstico (no es valoración)" cuando está bloqueado. |
| tests/qa_api_16.mjs | Arnés: 16 sectores con expediente completo sintético por la ruta exacta de la API (evaluate → exportWorkbook → validateNative). Salida en `qa_api/`, nunca en data/runs. |
| tests/api_v3.cjs | Regresión API ampliada (Toyota, AMD, Microsoft, seguridad, exportación hasta descarga validada). |
| tests/clasificacion.test.cjs | 4 pruebas de la clasificación declarada. |
| tests/censo_real.cjs | Censo acotado sólo lectura de las 30 empresas con más partidas verificadas. |
| tests/integridad_claude.cjs | Integridad de producción (228 archivos, 16 maestros, 60 ejecuciones) sin sobrescribir evidencias previas. |

## Etapa 2 (31/10, madrugada) — mientras corría el lote nativo `qa_api/`

Cambios de motor (afectan a módulos compartidos ⇒ el lote `qa_api/` queda SUPERADO como evidencia del motor final):
- plan.ts: 04 base instalada + posventa; 05 producción × cuota × contenido × reducciones; 07 volumen orgánico × precio/mix; 12 I+D explícita (`rdExpense`); 13 RWA de otros activos (`otherRiskWeight`) y rendimiento de tesorería (`cashYield`), `riskWeight` admite > 100 %; 14 `cashYield`; 10 regla RAB ≤ altas reconocidas (indicador `rabAdditionsCheck` en la disponibilidad).
- registry.cjs y fixtures.ts acordes; engine/probar.cjs: expectativas independientes de 04/05/07 recalculadas a mano.
- client: entrada separada (`main.jsx`), `App` exportable con `initial` opcional (SSR); index.html → main.jsx.

Nuevas suites (todas sin Excel): bloqueos (18), transmisión sectorial (17; 66 drivers), contrato adaptador (5), versiones/exportación (8), React SSR (9), clasificación (4). Con las anteriores: 76/76 + 39/39.
Arnés final: `tests/qa_fixtures.mjs` + `tests/qa_api_final.mjs` (salida `qa_api_final/`, registra hashes).

## Etapa 3 (31/10 ~00:25) — validación final en curso

- Lote `qa_api/` terminado y VERIFICADO: 16/16 VALIDADO, 117.411 comprobaciones, pero con motor ebbcdbec (superado) → ver `qa_api/VERSION_ENSAYADA.md`.
- Motor final congelado: **3b76805dbd8d6fd8160009110a548d4126e748ae4463ca8488acdab928c7f424**. No editar engine/dist, adapter, workflow, registry, calendario, exporter, canonical ni vendor hasta cerrar la validación (cambiaría el hash).
- Servicio 3200 reiniciado con ese motor (PID en `evidencias/servicio_v4.json`). `tests/api_v3.cjs`: 24/24 (incluye exportación Toyota validada en Excel y descargada).
- Lote nativo final lanzado 00:24: `node tests/qa_api_final.mjs` → `qa_api_final/` (progreso en `progreso.json`, resumen `qa_api_16.json`).
- Git local en integracion_v02 (carpeta propiedad del usuario sandbox de Codex: usar `git -c safe.directory=<ruta>`). Commit 37231a2.
- Pendiente cosmético: filas 71-74 de 'Proyeciones INDITEX' (separadores vacíos ocultos en el maestro) se muestran con 15 pt; la 0.1 ya lo perdía. Corregir en exporter/canonical requiere nueva validación nativa.

Siguientes comandos seguros tras el lote (en este orden, nunca dos Excel a la vez):
1. `node -e "…"` revisar `qa_api_final/qa_api_16.json` (todos VALIDADO, engineHash = engineHashAtEnd = 3b76805d…).
2. `powershell -NoProfile -File tests/captura_excel.ps1 <xlsx> evidencias/capturas/<nombre>` para QA_SECTOR_04/13/15 y el XLSX de diagnóstico de Toyota.
3. `node tests/qa_api_final.mjs --eventos 4 8 15` (eventos de activos en Excel nativo).
4. `node tests/presentacion_ooxml.cjs qa_api_final evidencias/presentacion_ooxml.json`
5. `node tests/integridad_claude.cjs`, commit, paquete tar.gz en ../checkpoints.

## Servicio aislado

127.0.0.1:3200 reiniciado (PID anterior 22948 de Codex → nuevo, ver `evidencias/servicio_v3.json`). Si el código cambia, el servidor responde 503 hasta reiniciarlo (por diseño): reiniciar sólo ese PID.

## Reanudación

Ver la sección "Pendiente" del informe final `entrega_claude/INFORME_EJECUTIVO.md` cuando exista.
