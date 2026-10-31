# G2EXCHANGE — Reparación de datos contables y cobertura certificada PCV/KPI (31/10/2026)

Rama `entrega/frontend-handoff-20261031`. Continúa `INFORME_INTEGRACION_PCV_KPI.md`. **No se ha hecho push.** Todas las cifras de este informe se han medido directamente en MySQL operativo después de escrituras verificadas, salvo las marcadas como simuladas.

## Resumen
- **Reparaciones aplicadas en MySQL operativo**: cinco, todas ensayadas antes en una copia aislada, con rollback probado y verificadas después.
- **Cobertura certificada real** (2022–2025):

  | País | PCV certificados | KPI certificados |
  |---|---|---|
  | EE. UU. | 15–18,5 % → **45,5–47,8 %** | 10–12,6 % → **30,8–32,3 %** |
  | Japón | 50–68 % → **61,0–73,1 %** (≥ 65 % en 2022–2024) | 28–52 % → **47,4–57,7 %** |
  | Taiwán | 0 % (sin fuente primaria verificable) | 0 % |

- **Objetivo intermedio del 65–70 %**: se alcanza en PCV de Japón 2022–2024. No se alcanza en EE. UU., en Taiwán ni en los KPI; en §6 se explica por qué y con qué evidencia.
- **Empresas con los 9 conceptos básicos del DCF certificados en los 4 ejercicios** (`sectorial/app/coverage/empresas_dcf_20261031.json`): 1.322 en EE. UU., 2.195 en Japón y 0 en Taiwán.

## 1. Matriz final (medida en MySQL tras las escrituras)
Universo congelado (mismo sha256 por país que el 30/10: US `9e0113d3`, JP `32a2836f`, TW `e7cb71fb`). Denominador: universo × 17 conceptos núcleo, sin exclusiones. Sólo cuentan informes de la fuente del país (SEC_EDGAR / EDINET / FINMIND·MOPS). Datos: `sectorial/app/coverage/cobertura_real_20261031.json`.

| País | Año | Universo | Con informe anual válido (antes→ahora) | PCV esperados | PCV presentes | PCV certificados | Cobertura PCV (antes → ahora) | KPI esperados | KPI certificados | Cobertura KPI (antes → ahora) |
|---|---|---|---|---|---|---|---|---|---|---|
| US | 2022 | 8017 | 5256 → 5585 | 136289 | 68962 | 61954 | 18.5 % → **45.46 %** | 136289 | 41926 | 12.58 % → **30.76 %** |
| US | 2023 | 8017 | 5529 → 5866 | 136289 | 73043 | 65012 | 16.44 % → **47.7 %** | 136289 | 44040 | 11.08 % → **32.31 %** |
| US | 2024 | 8017 | 5666 → 5981 | 136289 | 74218 | 65199 | 16.64 % → **47.84 %** | 136289 | 43970 | 11.09 % → **32.26 %** |
| US | 2025 | 8017 | 5632 → 5839 | 136289 | 72369 | 63052 | 15.23 % → **46.26 %** | 136289 | 42394 | 10.04 % → **31.11 %** |
| JP | 2022 | 3581 | 3469 → 3470 | 60877 | 52000 | 44506 | 68.19 % → **73.11 %** | 60877 | 35141 | 52.33 % → **57.72 %** |
| JP | 2023 | 3581 | 3425 → 3430 | 60877 | 52958 | 43225 | 60.01 % → **71 %** | 60877 | 33664 | 35.35 % → **55.3 %** |
| JP | 2024 | 3581 | 3385 → 3385 | 60877 | 52362 | 42586 | 58.99 % → **69.95 %** | 60877 | 33181 | 34.53 % → **54.5 %** |
| JP | 2025 | 3581 | 3004 → 3113 | 60877 | 48989 | 37138 | 50.16 % → **61 %** | 60877 | 28867 | 27.68 % → **47.42 %** |
| TW | 2022 | 1596 | 899 → 820 | 27132 | 11060 | 0 | 0 % → **0 %** | 27132 | 0 | 0 % → **0 %** |
| TW | 2023 | 1596 | 1094 → 824 | 27132 | 11076 | 0 | 0 % → **0 %** | 27132 | 0 | 0 % → **0 %** |
| TW | 2024 | 1596 | 1097 → 825 | 27132 | 11105 | 0 | 0 % → **0 %** | 27132 | 0 | 0 % → **0 %** |
| TW | 2025 | 1596 | 1098 → 825 | 27132 | 11080 | 0 | 0 % → **0 %** | 27132 | 0 | 0 % → **0 %** |

En Taiwán, la columna «Con informe» baja porque ya no se cuentan los documentos EDINET de emisores japoneses que estaban asignados a empresas taiwanesas (§4).

## 2. Ejecutado en MySQL operativo
Procedimiento común:
1. Copia completa sin bloqueo (`g2-2026-10-31T11-14-50-485Z.sql`, 5,2 GB, sha256 `5b43bb22…`).
2. Restauración en un contenedor MySQL aislado (`g2_reparacion_mysql`, 127.0.0.1:3310): 29 de 29 tablas con `CHECKSUM` idéntico al de producción.
3. Ensayo en la copia: aplicación, verificación, rollback, verificación del rollback, reaplicación y prueba de idempotencia.
4. Comprobación de que producción seguía igual que la copia (misma huella de las filas afectadas).
5. Pausa solo de los escritores incompatibles, aplicación en producción, verificación y reanudación.

| Reparación | Qué cambia | Verificación en producción |
|---|---|---|
| **Migración 31** (`US_PERIODO_V1`, `JP_RESUMEN_MISMO_DOC_V1`, `JP_SIGNO_CANONICO_V1`, `JP_EFECTIVO_EQUIVALENTES_V1`) | <ul><li>582.430 PCV de EE. UU. con el comparativo de un ejercicio anterior pasan al valor primario de la SEC del ejercicio correcto</li><li>23.096 filas japonesas «現金及び預金» se reclasifican a `CAJA_Y_DEPOSITOS`</li><li>8.528 filas EFECTIVO nuevas (efectivo y equivalentes de EDINET)</li><li>198.242 `VERIFIED_EXISTING`, 420.451 `CONFLICT_RESOLVED` y 8.528 `INSERTED`</li></ul> | <ul><li>0 filas omitidas por las guardas y 0 con valor inesperado</li><li>las 1.923.026 filas fuera del registro de correcciones, idénticas (sha256)</li><li>628.970 auditorías con el valor anterior</li><li>ensayo: rollback exacto en 2,3 min, reaplicación idéntica, idempotente</li></ul> |
| **Recálculo de KPI** de los 22.488 informes corregidos (fórmula sin cambios y política de prerrequisitos vigente) | <ul><li>180.235 KPI cambian, 410 son nuevos y 26.248 se quedan iguales</li><li>se eliminan 12.196 KPI que la política vigente ya no admite, sobre todo de deuda sin sus dos componentes verificados</li><li>6.394 informes con importes contradictorios no se tocan</li></ul> | <ul><li>snapshot reversible (21 MB)</li><li>ensayo: la restauración devuelve un hash de contenido idéntico (313.109 KPI)</li></ul> |
| **Migración 32** (identidad cruzada) | <ul><li>112 instrumentos y 298 informes EDINET pasan de empresas taiwanesas a su emisor japonés real (registro oficial EDINET con código y nombre únicos)</li><li>1.160 informes en cuarentena</li><li>nada se borra</li></ul> | <ul><li>0 discrepancias con la auditoría</li><li>huella idéntica a la del ensayo</li><li>rollback probado</li></ul> |
| **Recuperación SEC de emisores extranjeros** (20-F/40-F en su moneda) | 385 empresas: **1.188 informes anuales nuevos** con PCV verificados por la SEC (ejemplo: ASML 2024, ingresos de 28.262,9 M€ y beneficio neto de 7.571,6 M€, en EUR) | Resultado idéntico al ensayo, de 61.104 a 62.292 informes |
| **Taiwán, lote 1** (`TW_ANUAL_TRIMESTRAL_V1`) | 21.643 PCV de resultados (360 empresas) pasan del T4 aislado a la suma T1–T4 de FinMind | <ul><li>21.643 auditorías y 0 discrepancias</li><li>ensayo: rollback exacto, idempotente</li><li>Hon Hai 2024: ingresos de 6.859.615.493.000 TWD (antes 2,13 billones)</li></ul> |

**Pausas**: los escritores de PCV 9028 (EE. UU.) y 7068 (Japón) se pausaron con su mecanismo `stop.request` mientras se aplicaba la migración 31. El de EE. UU. se volvió a pausar durante la recuperación de emisores extranjeros, porque comparte el bloqueo exclusivo de EE. UU. Al retirar las pausas, el coordinador 22200 los relanzó por sí solo, y siguen activos.

**Recuperadores tras la reanudación**: desde las 13:10 han añadido 15.036 `INSERTED` y 6.795 `VERIFIED_EXISTING`, y **0 conflictos nuevos en celdas corregidas**.

## 3. Correcciones de código
- **SEC**:
  - el selector actual ya elige el hecho por fecha de fin, duración, formulario y accesión; se ha añadido una regresión con un 10-K de tres ejercicios (`server/tests/secPeriodoReal.test.cjs`);
  - el extractor verificado y la inserción conservan la moneda de presentación de los emisores extranjeros y rechazan la ambigüedad de moneda.
- **Identidad**:
  - «TSE» se resuelve según el país (`server/src/pcv/mercados.ts`);
  - el cargador de instrumentos no mantiene vínculos con empresas de otro país;
  - el vinculador EDINET solo acepta empresas japonesas y descarta los tickers ambiguos;
  - el adaptador DCF solo usa informes de la fuente del país.
- **EDINET**: EFECTIVO es efectivo y equivalentes; «CashAndDeposits» pasa a `CAJA_Y_DEPOSITOS` en los extractores antiguos de Japón y Taiwán.
- **FinMind**: guardián global (120 peticiones por hora, sin reintentar respuestas 4xx, pausa de 35 minutos ante bloqueo de IP) y anual = suma de los cuatro trimestres.
- **Adaptador**: no se certifica nada por `CONFLICT_RESOLVED` por sí solo; una fila corregida se valida únicamente con una prueba compatible en valor, documento, moneda y fechas (`sectorial/app/tests/adaptador_correcciones.test.cjs`).
- **Comprobación del DCF**: Apple carga sus cuatro ejercicios `VALIDADO` sin incidencias (FY2022–FY2025: 394.328 / 383.285 / 391.035 / 416.161 M$); antes cada año tenía el dato de dos ejercicios anteriores.

## 4. Taiwán
- **Ejecutado**:
  - cuarentena de los documentos japoneses y reasignación inequívoca (§2);
  - corrección de los resultados trimestrales, lote 1.
- **En curso**: descarga de FinMind de las empresas restantes, que se puede reanudar (`server/scripts/finmind-tw-trimestral.cjs`), y después lote 2 con el mismo procedimiento.
- **EPS**: 4.399 filas siguen siendo trimestrales; no se pueden derivar y quedan señaladas.
- **Certificación 0 %**: no hay una fuente primaria autorizada y automatizable. Las condiciones de TWSE prohíben la descarga automatizada de MOPS y la Open Data solo publica el último período. Además, los informes de FinMind no tienen fecha de publicación, así que el adaptador no puede usarlos en un DCF a una fecha concreta sin arriesgarse a usar información futura. Hay un verificador para informes MOPS descargados manualmente (`tools/verificar_mops_local.cjs`).
- **Contraste con Eulerpool** (906 empresas, `coverage/contraste_tw_eulerpool.json`): el porcentaje de celdas de resultados en rango de trimestre aislado baja del 60–66 % al 35 % tras el lote 1.

## 5. Pruebas
- **Backend**:
  - `valuation_engine`: 20/20;
  - servidor: 259 pruebas, 258 superadas, 0 fallos y 1 omitida a propósito (Capital con MySQL).
- **Sectorial**: regresión 39/39 e integración 101/101.
- **Integración de la persistencia verificada** contra MySQL aislado: 1/1.
- **Validación nativa de Excel** con el motor nuevo `684a9340…` (exportador portable): **16/16**, 117.621 comprobaciones de fórmulas, 0 referencias rotas (`sectorial/evidence/excel_nativo_portable_16_sectores_motor_684a9340.json`). El exportador principal (Artifact Tool) no se puede ejecutar en la rama porque es privado.
- **Integridad**: 228 archivos operativos, 16 maestros y **60 valoraciones congeladas idénticas** (sha256 `cb0a95e3…`).
- **Regresiones reales**:
  - Apple (EE. UU.): 4 ejercicios validados;
  - OTAKE (Japón): EFECTIVO = CashAndCashEquivalents y caja y depósitos reclasificada;
  - Hon Hai (Taiwán): anual reconstruido.

## 6. Por qué no se llega al 65–70 % en todos los casos (después de las correcciones)
- **EE. UU.** (cobertura bruta 50,6–54,5 %): ninguna empresa sin informe es una ausencia supuesta; todas se han comprobado (`coverage/ausencias_us.json`):
  - 1.929 de las 2.082 empresas sin ningún informe son registrantes de la SEC con CIK vinculado;
  - 879 no tienen `companyfacts`: la SEC no publica datos XBRL de ellas (ADR sin informe anual, emisores de 6-K, fondos), así que la ausencia es real en la fuente;
  - unas 730 al año no tienen hechos anuales estándar localizables;
  - 385 se bloqueaban por la moneda y se han recuperado (§2);
  - además quedan 6.278–8.478 PCV presentes sin prueba de verificación al año.
- **KPI**: dependen de que todas sus entradas estén certificadas en el mismo informe. La política vigente exige además los dos componentes de la deuda verificados. 6.394 informes tienen duplicados contradictorios, filas repetidas por la falta de clave única en `partida_contable_valor`.
- **Taiwán**: §4.

## 7. Pendiente (no ejecutado)
1. Taiwán, lote 2, cuando termine la descarga de FinMind.
2. **BENEFICIO_NETO**: separar el consolidado (EDINET `ProfitLoss`) del atribuible a la dominante.
   - Hace falta un concepto nuevo, extracción en el verificador EDINET y nuevas fórmulas de EPS y ROE.
   - Hoy en EE. UU. es el atribuible y en Japón el consolidado.
   - No se ha tocado, para no invalidar verificaciones existentes.
3. Clave única y limpieza de duplicados en `partida_contable_valor` (Taiwán y Japón).
4. Emisores extranjeros con ADR: el DCF necesita tipo de cambio y ratio del ADR. Sus PCV se certifican en su moneda, pero no se valoran en USD.
5. Unas 730 empresas de EE. UU. al año sin hechos anuales estándar localizables; investigar formularios o taxonomías adicionales.
6. Rotar las claves de J-Quants y Eulerpool.

## 8. Estado de las migraciones y la reversión
| Operación | Estado | Reversión |
|---|---|---|
| Migración 31, esquema + datos (registro `b071eb37…`) | **APLICADA y verificada** | `private_backups/reparacion-aislada/31_datos_b071eb37281c.rollback.sql` (probada) y `server/sql/31_*.rollback.sql` |
| Recálculo de KPI | **APLICADO** | `recalcular-kpi-correcciones.cjs --restaurar private_backups/reparacion-aislada/kpi_snapshot_produccion.ndjson` (probado) |
| Migración 32, esquema + datos (lote `57747083…`) | **APLICADA y verificada** | `private_backups/reparacion-produccion-32/32_datos_57747083e27c.rollback.sql` (probada) |
| Recuperación SEC en moneda extranjera | **APLICADA** | inserciones auditadas del recuperador (`pcv_import_evidence`, journals en `G2EXCHANGE_entrega/private_backups/sec-moneda-produccion`) |
| Taiwán, lote 1 (`0314c499…`) | **APLICADO y verificado** | `private_backups/reparacion-tw-lote1/tw_trimestral_0314c4990758.rollback.sql` (probada) |
| Copia completa previa | `g2-2026-10-31T11-14-50-485Z.sql` (5b43bb22…) | restauración verificada 29/29 |

## 9. Commits locales nuevos
```
6ce839f Insert verified SEC reports in the filer's reporting currency; record native Excel validation for engine 684a9340
72098ac Value companies only with reports from their country's primary source
0e83fc8 Skip contradictory reports in KPI recomputation; add foreign-currency SEC and Taiwan quarterly correction runners
d659477 Recognise the cash-equivalents rule when measuring resolved conflicts
1ea847c Add cash-equivalents rule, SEC reporting currency, identity reassignment and KPI recomputation
ca5b52f Harden migration 31 and stop cross-country company binding
```
Sin push. Comando pendiente (sin `--force`; antes, comprobar que el repositorio es privado):
```
cd C:\Users\Juan\Desktop\G2_EXCHAGE\G2EXCHANGE_entrega
git push -u origin entrega/frontend-handoff-20261031
```
