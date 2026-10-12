# Informe de implementación — 12/10/2026

Documento histórico de la segunda intervención. El estado actual de producción está en [TERCERA_INTERVENCION.md](TERCERA_INTERVENCION.md).

El backend, el motor y la automatización compilan. El flujo de preparación, cálculo, persistencia transaccional y replay se ha comprobado en tablas temporales aisladas de MySQL. Se completó un barrido de lectura de los 8.417 instrumentos reales y una prueba de escala con 10.000 IDs sintéticos sin datos financieros.

La escritura en la base real y el servicio periódico no están activados. No se aplicaron migraciones ni se modificaron los históricos originales. La base real conserva 532 runs y cero resultados. No se declara que todas las empresas sean actualmente valorables: faltan clasificación, datos y evidencias de hipótesis.

## 1. Archivos modificados

Configuración y ejecución:

- `.gitignore`: excluye archivos generados de motores históricos; requieren respaldo independiente.
- `package.json`: comandos de build, test y valoración desde la raíz.
- `server/package.json`, `server/tsconfig.json`: compilación común, rutas y comandos.
- `server/valoracionAutomatica.ts`: sustituido el ejecutable de prueba por CLI general por instrumento.
- `server/conexion/bd.ts`: DATE como cadena civil, zona del driver y puerto configurable.
- `server/src/index.ts`: replay congelado, plantilla del run y versión real en la respuesta.
- `server/src/valoracion/motorServicio.ts`, `mapeoSectores.ts`: adaptador común y clasificación conservadora.

Importación, normalización y snapshots:

- `server/insercionDatos/insercionDatosValuationInputVersion.ts`
- `server/insercionDatos/insercionKPIInformeFinanciero.ts`
- `server/insercionDatos/insercionDatosKPIFinancieroInforme.ts`
- `server/insercionDatos/insercionInformeFinanciero.ts`
- `server/insercionDatos/insercionPartidaContable.ts`
- `server/insercionDatos/insercionDatosValuationInputSnapshot.ts`
- `server/insercionDatos/insercionDatosValuatioInputSnapshotDetalle.ts`
- `server/insercionDatos/insercionaDatosValuationInputSnapshotCompleto.ts`
- `server/insercionDatos/insercionDatosMainSnapshot.ts`
- `server/insercionDatos/insercionDatosValuationRun.ts`

Motor:

- `valuation_engine/package.json`, `package-lock.json`, `tsconfig.json`
- `valuation_engine/src/integracion/mysql_readonly.ts`
- `valuation_engine/src/modelo.ts`, `riesgo.ts`, `tipos.ts`, `wacc.ts`
- `valuation_engine/ejemplos/DEMO_NO_REAL.json`: fixture explícitamente sintético, nunca usado como cuentas reales.

Se conservaron las modificaciones previas del usuario, incluidos los cambios existentes en dependencias/lock del servidor. No se añadieron dependencias, APIs de pago ni cambios de frontend.

## 2. Archivos creados

- `server/src/valoracion/rutas.ts`: ubicación estable y comprobación del motor en memoria.
- `server/src/valoracion/datos.ts`: identidad, calidad, hipótesis, rating y huella.
- `server/src/valoracion/repositorio.ts`: transacciones, idempotencia y resultados.
- `server/src/valoracion/lotes.ts`: paginación, incidencias, checkpoint y reanudación.
- `server/src/valoracion/watch.ts`: reconciliación periódica incremental.
- `server/src/valoracion/replay.ts`: reproducción con el motor archivado, sin escritura.
- `server/src/valoracion/informeClasificacion.ts`: informe paginado de clasificación.
- `valuation_engine/src/integracion/calidad.ts`: fechas civiles y números sin ceros fabricados.
- `valuation_engine/scripts/manifest.cjs`: manifiesto y archivo de código/configuración por huella.
- `valuation_engine/tests/integridad.test.ts`
- `server/tests/valoracion.test.cjs`
- `server/tests/mysqlValoracion.integration.cjs`
- `server/sql/10_valoracion_reproducible.sql`
- `server/sql/11_rollback_valoracion_reproducible.sql`
- `server/sql/12_ticker_por_mercado.sql`
- `server/sql/13_fechas_historicas_precheck.sql`
- `server/sql/14_reparacion_fechas_copia.sql`
- `server/docs/VALORACION_AUTOMATICA.md` y este informe.

Evidencias generadas en `server/resultados_valoraciones/verificacion`: `integracion.json`, `escala.json`, `masivo.json`, `elegibilidad_resumen.json`, `clasificacion_resumen.json`, `clasificacion_pendiente.jsonl`, `reconciliacion.json`, checkpoints y diarios. Los builds también conservan el motor en `valuation_engine/archives/<manifest_hash>`.

## 3. Errores corregidos

- El ejecutable entra en TypeScript, utiliza CommonJS y localiza el motor desde el módulo, sin depender de la terminal.
- Se compila primero el motor, se comprueba su manifiesto y se bloquea un worker que siga usando módulos antiguos tras recompilar.
- Se elimina la asignación FCFF por defecto cuando el sector necesita evidencia. BANK y PHARMA resuelven sus familias existentes.
- El instrumento seleccionado determina precio, moneda, empresa y evidencia; el ticker no es la identidad del proceso.
- NULL/ausencia se conservan. Los conflictos de partidas bloquean y las reconstrucciones contables registran componentes.
- D&A de Komatsu: `ReversalOfReserveForSpecialDepreciation`, informe EDINET S100QYNI de 31/03/2023, es una reversión de reserva, no depreciación operativa. Se excluye el importe de -24.000.000 JPY y se restringe el mapeo japonés; no se aplica valor absoluto ni cero.
- Las nuevas lecturas DATE usan cadenas civiles. Se reproduce el mecanismo de error de convertir medianoche local a UTC: 31/12/2025 a +01:00 se convierte en 30/12/2025 UTC. No hay logs suficientes para atribuir cada fila histórica a un proceso concreto; la protección nueva elimina esa conversión y los binarios obsoletos.
- Una sola resolución de rating utiliza perfil, intervalo activo, fecha y columnas reales. Interés cero/ausente no crea cobertura 999.
- SYSTEM_DEFAULT_ZERO es hipótesis identificada, reproducible y REVIEW; no se convierte en MANUAL_APPROVED ni sustituye riesgos aportados.
- El motor 1.5.1 exige su propia model_version; nunca utiliza el ID de 1.2 como si fuera la versión actual.
- Snapshot, detalles, run, tres resultados y evidencia se guardan en una transacción. Los fallos revierten todas las filas.
- El replay usa el input y configuración congelados. La salida se conserva como JSON textual validado: MySQL JSON produjo diferencias de un último bit en pruebas, incompatibles con comparación exacta.
- El crecimiento TTM anualizado ya interviene en el peso reciente; WACC <= crecimiento terminal bloquea el cálculo. Son las dos correcciones de fórmula, con regresiones específicas.
- El checkpoint reintenta bloqueos transitorios de Windows y existe desde antes del primer instrumento.

## 4. Pruebas ejecutadas

```powershell
# En G2EXCHANGE
npm.cmd test
npm.cmd --prefix server run test:integration
```

También se ejecutaron los comandos de desarrollo desde raíz y `server`, el compilado por lotes, reanudación real y dos ciclos de reconciliación en dry-run. El barrido completo usó `FULL`, fecha 12/10/2026 y páginas de 100; la prueba sintética usó 10.000 instrumentos pendientes.

La integración copia cuatro VIV reales a tablas TEMPORARY de una conexión y crea allí snapshot, detalles, runs, resultados, versión y evidencia. Los nombres temporales ocultan únicamente en esa conexión las tablas reales. Las claves foráneas no se pueden conservar en estas tablas temporales; se verifican las relaciones mediante el servicio. Se destruye la conexión al finalizar. El DDL real con sus claves foráneas queda pendiente de aplicación autorizada.

## 5. Resultados

| Comprobación | Resultado |
|---|---|
| Motor | 20 pruebas aprobadas, cero fallos |
| Backend | 20 pruebas aprobadas, cero fallos |
| Integración MySQL | 2 pruebas aprobadas, cero fallos; múltiples comprobaciones dentro de ellas |
| Persistencia aislada | Tres escenarios; repetir reutiliza run; cambio explícito de RF produce otro run y conserva seis resultados |
| Replay FULL | Salida completa exactamente igual; una salida alterada se rechaza |
| Archivo del motor | Carga por huella e igualdad completa con la ejecución persistida |
| Rollback | Tras crear run y al insertar segundo escenario: snapshots, detalles, runs, resultados y evidencia vuelven a sus recuentos anteriores |
| Resultado bloqueado | Se guarda evidencia con NULL y estado BLOQUEADA; cero filas ficticias en fair_value NOT NULL |
| Concurrencia | Dos conexiones serializan el mismo instrumento mediante GET_LOCK |
| Escala sintética | 10.000 procesados, página máxima 100, una conexión activa; crecimiento de heap por debajo de 64 MiB |
| Barrido real | 8.417 procesados, checkpoint terminado, cero errores técnicos registrados por instrumento |
| Reanudación real | Se recuperó desde cursor 1.819; completó los 6.598 instrumentos restantes |
| Memoria real | Heap muestreado máximo 18.890.816 bytes, RSS 74.387.456 bytes durante la sesión reanudada |
| Base original | Antes/después: 532 runs y cero resultados; no hubo escrituras permanentes |

El diario real contiene 8.418 entradas para 8.417 instrumentos: una incidencia se había escrito antes del fallo del checkpoint y se volvió a registrar al reanudar. El diario conserva ambos eventos; el cursor y sus contadores no duplican el instrumento. La persistencia SQL tiene protección independiente por huella.

## 6. Empresas con cálculo comprobado

NVIDIA, instrumento 2308, USD: se preparó desde las partidas reales y se persistieron los tres escenarios en aislamiento. Se aportó GRANDE_NO_FINANCIERA como hipótesis explícita de diagnóstico, no como clasificación aprobada.

| Escenario | Valor por acción USD | WACC |
|---|---:|---:|
| CONSERVATIVE | 74,521782 | 13,442485% |
| BASE | 83,909684 | 13,442366% |
| OPTIMISTIC | 94,064638 | 13,442296% |

Son resultados técnicos REVIEW/LOW, con primas adicionales cero, acciones en circulación como proxy y límites de calidad indicados en la salida. No son precios objetivo auditados. El input completo de la antigua referencia 198,2118 / 212,9297 / 228,4465 no se encontró; no se inventó una regresión que reprodujera esos números.

## 7. Empresas pendientes y motivos

| Muestra real | Resultado |
|---|---|
| US Bancorp, instrumento 7787 | Sector N/A: clasificación pendiente, sin asignar FCFF |
| Vertex, instrumento 3415 | Sector N/A: clasificación pendiente, sin asignar FCFF |
| Komatsu, instrumento 5101, JPY | Taxonomía conflictiva; además, reversión de reserva excluida de D&A |
| Yoshitake, instrumento 5198 / ticker 6488, JPY | Importes incompatibles de CUENTAS_COBRAR |
| Taiwán, instrumento 3614 / ticker 1419, TWD | VIV registra JPY: no hay conversión FX verificable |
| Recurso/metal, instrumento 2 / ticker AA, USD | EBIT ausente en informe 9208 |

Sin hipótesis externas de perfil, los 8.417 instrumentos del barrido quedan pendientes. Es el resultado real; no se forzaron cifras para incrementar cobertura:

| Primer bloqueo detectado | Instrumentos |
|---|---:|
| Clasificación pendiente | 7.208 |
| Perfil de rating pendiente | 436 |
| Taxonomía ambigua | 386 |
| Cuatro ejercicios insuficientes | 253 |
| Partida requerida ausente/incompatible | 99 |
| Moneda/FX pendiente | 23 |
| Precio pendiente | 7 |
| Periodos anuales inconsistentes | 3 |
| Versión financiera pendiente | 2 |

Son primeros bloqueos; resolver uno puede revelar otro. MySQL tiene 13.194 empresas; 8.278 cuentan con instrumento y 4.916 no lo tienen. El informe de clasificación identifica 11.469 empresas que requieren evidencia, incluyendo sectores REVISAR además de las 10.431 N/A. Clasificación suficiente por sí sola no acredita elegibilidad financiera.

## 8. Persistencia MySQL

**Implementada y probada en aislamiento. Pendiente de autorización en la base real.** Los resultados completos utilizan las columnas existentes; la tabla aditiva conserva input, salida completa, valor empresa/patrimonio, fuentes, advertencias, instrumento, versión y huella. Los valores pendientes no se convierten en cero. COMPLETADO es estado técnico; BLOQUEADA y COMPLETA_CON_ADVERTENCIAS son estados financieros distintos.

Los 532 runs PREPARANDO anteriores se conservan. No se reinterpretan como ejecuciones del motor nuevo ni se reconstruyen con parámetros actuales.

## 9. Actualización incremental

**Implementada y probada.** La huella incluye valores/versiones/informes anuales, KPI, precio/fecha del mismo instrumento, parámetros, rating/spreads, moneda, hipótesis, configuración y motor. Un equivalente reutiliza el histórico; un cambio relevante puede crear otro run. FULL recalcula equivalentes para comprobar replay. INCREMENTAL evita el motor cuando la huella ya existe.

La fecha operativa de lanzamiento no crea por sí sola otro DCF: el motor actual no aplica envejecimiento diario de flujos. El precio sí interviene en los pesos del WACC y recalcula cuando cambia. Los pendientes se reconsideran en barridos posteriores.

Reconciliación: dos ciclos dry-run comprobaron reanudación de 2 a 4 instrumentos. El temporizador está implementado, con parada y checkpoint, pero **no se activó un daemon ni se probó su funcionamiento durante días**. No se añadieron triggers ni tareas de Windows.

## 10. Reanudación

**Implementada y probada con mocks y datos reales.** Checkpoint atómico, diario acumulativo, firma de modo/fecha/hipótesis, lock por directorio, recuperación de PID muerto, cursor por ID y reintentos acotados de errores transitorios. No se reinicia un checkpoint incompleto sin --resume.

## 11. Funcionalidades pendientes o no implementadas

- No implementado: construcción automática de TTM desde trimestrales; la automatización utiliza cuatro ejercicios anuales.
- No implementado: conversión FX verificada, clasificación por una fuente externa, prueba completa de dilución/splits/ADRs y metodología adicional para otros mercados.
- No implementado: recuperación reproducible de los runs legacy sin input completo.
- Pendiente de evidencia: perfiles de rating, reclasificaciones, ROIC terminal y variables de los modelos especializados. No se inventaron umbrales ni datos.
- Implementado pero no probado en producción: daemon prolongado, persistencia permanente, claves foráneas de la migración aplicada y evolución entre distintas versiones de Node/dependencias.
- Los importadores compilan y sus normalizadores tienen regresiones; no se ejecutó una descarga/reimportación externa completa, que habría escrito partidas históricas.

## 12. Migraciones que requieren autorización

SQL exacto: [10](../sql/10_valoracion_reproducible.sql), [reversión 11](../sql/11_rollback_valoracion_reproducible.sql), [índice 12](../sql/12_ticker_por_mercado.sql), [precheck 13](../sql/13_fechas_historicas_precheck.sql), [copia de fechas 14](../sql/14_reparacion_fechas_copia.sql). Ninguna fue aplicada.

La 10 crea valuation_execution y registra model_version 1.5.1. Es el único cambio necesario para activar el flujo nuevo; antes se deben verificar backup, esquema y un ensayo permanente pequeño autorizado. Reversión conservadora: detener workers, archivar la tabla mediante RENAME y desactivar --write, conservando runs/resultados/versiones. MySQL DDL no se revierte con ROLLBACK.

La 12 propone unicidad mercado+ticker. No es necesaria para el proceso por instrumento_id. Antes de aplicarla deben adaptarse los importadores que aún resuelven ticker global; si luego hay duplicados internacionales, restaurar la unicidad global no es una reversión válida sin perder representación.

La 14 propone nuevas versiones para 88.464 discrepancias de -1 día entre 88.468 VIV, usando informe_financiero.fecha_fin_periodo y comprobando vínculo empresa/informe. Los originales y enlaces históricos quedan intactos. Ledger, hash etiquetado y ROLLBACK de ensayo incluidos. Se debe probar primero un lote pequeño, igualdad de todos los importes y referencias. Después de COMMIT, una nueva versión referenciada se conserva; no se borra para revertir. La reparación de fecha no sanea taxonomía ni ceros anteriores.

## 13. Comandos reales

Desde `G2EXCHANGE`:

```powershell
npm.cmd run build
npm.cmd test
npm.cmd --prefix server run test:integration
npm.cmd run valuation -- --mode full --dry-run --batch-size 100 --as-of 2026-10-12 --directory server/resultados_valoraciones/nuevo_barrido
npm.cmd run valuation -- --mode full --dry-run --resume --batch-size 100 --as-of 2026-10-12 --directory server/resultados_valoraciones/nuevo_barrido
npm.cmd run valuation:dev -- --dry-run --limit 20 --directory server/resultados_valoraciones/desarrollo_nuevo
npm.cmd --prefix server run valuation:classification
npm.cmd run valuation:watch -- --dry-run
npm.cmd --prefix server run valuation:replay -- <run_id_congelado>
```

Las hipótesis por instrumento se suministran con `--hypotheses <archivo.json>` y necesitan fuente/fecha; formato y políticas en [manual](VALORACION_AUTOMATICA.md). Desde server funcionan sus comandos equivalentes. Para futuro ensayo de escritura, **solo después de autorizar/aplicar la 10**: `npm.cmd run valuation -- --write --instrument-id <id_verificado> --limit 1 --hypotheses <archivo-validado> --directory <directorio-nuevo>`.

## 14. Límites financieros

Todos los resultados necesitan revisión profesional. Acciones en circulación no acreditan acciones plenamente diluidas; la salida advierte explícitamente del proxy. Moneda y unidades dependen de metadata financiera existente, con verificación original pendiente. No hay FX improvisado. La cobertura de intereses puede proceder de un informe anterior al cierre más reciente: se identifica fecha/fuente y se advierte.

BANK/INSURANCE/REIT son modelos simplificados existentes. PHARMA/RESOURCE usan FCFF sectorial y no incorporan por sí solos pipeline probabilístico ni agotamiento de reservas. Sin ROIC terminal documentado se mantiene LEGACY_FCFF con advertencia. MID_YEAR no se modificó y sigue necesitando revisión metodológica.

Los modelos especializados se prueban con fixtures claramente sintéticos; no se certificó una empresa real con cada familia. Los datos faltantes y las clases inciertas se bloquean. Las diferencias de versiones del entorno pueden impedir igualdad numérica exacta aunque se conserve el código; el replay compara y falla sin sobrescribir.

## 15. Siguientes acciones necesarias

1. Revisar y autorizar la migración 10 con su reversión; las 12 y 14 se deciden por separado.
2. Respaldar base y archivos del motor; aplicar la 10 en entorno de ensayo autorizado y verificar claves foráneas.
3. Aportar evidencia de perfiles y clasificación para candidatos del informe, empezando por las 436 incidencias de perfil; revisar también dilución, unidades y moneda.
4. Autorizar un único instrumento revisado, comprobar snapshot/run/tres resultados/replay y repetición idempotente en persistencia permanente.
5. Escalar a lotes pequeños antes de activar escrituras masivas o reconciliación continua.

El código y el plan están preparados. La operación permanente se ha detenido en el punto de autorización indicado por el usuario.
