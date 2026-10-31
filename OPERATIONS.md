# Operación

## 1. Repositorios y entorno
| Ruta (instalación original) | Qué es |
|---|---|
| `G2EXCHANGE/` | árbol de trabajo **operativo**: `.env` real, `private_backups/` (volcados, cachés de proveedores, checkpoints) y los recuperadores en ejecución. Está en la rama `g2-pcv-supplement-20261028`, con cambios de Codex sin commit. |
| `G2EXCHANGE_entrega/` | worktree de **entrega**, rama `entrega/frontend-handoff-20261031`. Es la fuente de verdad del código: contiene todo lo de la rama operativa más las correcciones posteriores. |
| `sectoriales_auditoria_20261030/` | entorno aislado del módulo sectorial (Codex y Claude), checkpoints y bundles Git |

Los recuperadores activos se ejecutan desde el árbol operativo, con su código de antes de esta entrega. Para que usen el código corregido (identidad de observación, selección de observaciones, perímetros, guardián FinMind), hay que pasar el árbol operativo a la rama de entrega tras una pausa segura (§3). Esto no se ha hecho para no interrumpir recuperaciones en curso.

## 2. Recuperadores
| Proceso | Comando | Estado y checkpoint |
|---|---|---|
| Coordinador | `node server/scripts/recuperar-pcv-plan.cjs --write --resume --resume-jobs` | `private_backups/pcv-orchestrator/plan-state.json`; relanza los vigilantes al retirar las pausas |
| SEC complementos (US) | `recuperar-pcv-watch.cjs --job complement-sec-v5 --country US --directory private_backups/pcv-us-complementos-v5 --write` | `checkpoint.json` y `journal.jsonl` del directorio |
| Identidad EDINET (JP) | `recuperar-pcv-watch.cjs --job complement-identity-jp --country JP --directory private_backups/pcv-jp-complementos-identidad-v5 --write` | ídem |
| Auditoría estructural | `server/scripts/auditar-cobertura-estructural.cjs --after` | solo lectura; mantiene una transacción larga (ver §4) |
| FinMind trimestral (TW) | `server/scripts/finmind-tw-trimestral.cjs --file <tickers> --dir private_backups/finmind-tw-trimestral` | se puede reanudar; no escribe en MySQL |

## 3. Pausas seguras
- **Pausar**: crear `stop.request` en el directorio del trabajo. El vigilante termina el informe en curso y sale; el coordinador no lo relanza mientras exista el archivo.
- **Reanudar**: renombrar el archivo (`stop.request.previous-<motivo>-<epoch>`); el coordinador relanza el vigilante.
- **Bloqueo exclusivo de EE. UU.**: los recuperadores de EE. UU. comparten `GET_LOCK('G2_PCV_RECOVERY_US')`. Para ejecutar otro recuperador de EE. UU., pausar antes `pcv-us-complementos-v5`.

## 4. Migraciones y DDL
1. Copia: `node server/scripts/backup-db.cjs` (`mysqldump --single-transaction`, sin bloqueo) → `private_backups/g2-<fecha>.sql` + `.sha256`.
2. Copia aislada: `docker run -d --name g2_reparacion_mysql -e MYSQL_ROOT_PASSWORD=… -p 127.0.0.1:3310:3306 mysql:8 --skip-log-bin`. Restaurar el volcado y comparar `CHECKSUM TABLE` con producción.
3. Ensayo: aplicar, verificar (`sectorial/app/tools/verificar_migracion_31.cjs` u otra huella), rollback, verificar el rollback, reaplicar y repetir para comprobar la idempotencia.
4. Producción: comprobar que coincide con la copia (misma huella), pausar los escritores incompatibles, aplicar, verificar y reanudar.
5. **DDL (`ALTER TABLE`)**: necesita el bloqueo de metadatos de la tabla. Una transacción larga abierta, como la auditoría estructural de §2, lo retiene. Mientras el `ALTER` espera, se bloquean todas las consultas nuevas sobre esa tabla. Hay que lanzar un DDL solo cuando no haya transacciones largas abiertas: consultar `information_schema.innodb_trx` y `performance_schema.metadata_locks`. Esto ocurrió con la migración 33 (`HANDOFF.md`).

## 5. Backups y restauración
| Elemento | Ubicación | Verificación |
|---|---|---|
| Volcado completo previo a las reparaciones | `private_backups/g2-2026-10-31T11-14-50-485Z.sql` (sha256 `5b43bb22…`) | restaurado en aislado: 29/29 tablas con `CHECKSUM` idéntico |
| Rollbacks de datos | `private_backups/reparacion-aislada/`, `reparacion-produccion-32/`, `reparacion-tw-lote1/` | probados en la copia aislada |
| Snapshots de KPI | `private_backups/reparacion-aislada/kpi_*snapshot*.ndjson` | `recalcular-kpi-correcciones.cjs --restaurar <archivo>` (probado) |
| Bundles Git | `sectoriales_auditoria_20261030/checkpoints/*.bundle` | `git bundle verify` |

## 6. Monitorización
| Qué comprobar | Cómo |
|---|---|
| Cobertura | `npm run sectorial:coverage` (MySQL, solo lectura) |
| Integridad de las 60 valoraciones | `node sectoriales_auditoria_20261030/integracion_v02/tests/integridad_claude.cjs` |
| Conflictos nuevos tras una reparación | contar `CONFLICT_PRESERVED` posteriores a la fecha de aplicación en celdas de `pcv_correccion_auditoria` |
| Guardián de proveedores | `private_backups/provider-guard/<proveedor>.json` (totales y circuito) |
