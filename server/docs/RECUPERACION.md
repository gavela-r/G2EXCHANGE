# Recuperación y portabilidad

GitHub contiene código, esquema sin datos, migraciones, documentación y fixtures sintéticos. No contiene dumps, claves, resultados reales, cachés de proveedores ni motores compilados históricos. No se ha verificado un permiso para redistribuir datos de FinMind ni los datos financieros originales; se conservan en privado. Los metadatos SEC se usan internamente. No se publican respuestas de proveedores.

## Backup privado

```powershell
node server/scripts/backup-db.cjs
node server/scripts/backup-db.cjs --schema
```

El primer comando crea un dump en `private_backups/` y un archivo `.sha256`. Usa el contenedor indicado por `G2_MYSQL_CONTAINER` (por defecto `mysql_valoracion`) y su contraseña ya configurada, sin mostrarla. Conserva esquema, datos, relaciones, triggers, rutinas y eventos; usa una vista consistente para InnoDB. No cambiar estructuras durante la exportación. El segundo comando exporta únicamente el esquema, sin filas, credenciales ni contadores AUTO_INCREMENT de producción.

Conservar por separado el dump final, su hash, `.env`, `valuation_engine/archives/` y `server/resultados_valoraciones/`. La configuración y los archivos de replay están también en `private_backups/replay-config-checkpoints.tar`. Transferir estos archivos por un canal privado protegido; no adjuntarlos a commits ni releases de GitHub. El backup sigue físicamente en este ordenador: GitHub por sí solo no permite recuperar la base real durante la ausencia.

## Restauración sin sobrescribir producción

En otro ordenador, instalar MySQL 8, clonar la rama segura, instalar dependencias y configurar `.env`. Arrancar un contenedor de recuperación con una contraseña elegida localmente y el puerto configurado. No cambiar contraseñas del contenedor original.

Con Docker Compose, configurar `G2_MYSQL_VOLUME=g2exchange-mysql-data` en la copia privada de `.env`, ejecutar `docker volume create g2exchange-mysql-data` y `docker compose up -d mysql`. El `.env` restaurado contiene el nombre del volumen del ordenador original: cambiarlo antes del arranque en un equipo diferente. No ejecutar `down -v` ni eliminar volúmenes. El contenedor original no se recreó durante esta intervención.

```powershell
node server/scripts/restaurar-db.cjs ruta-privada/backup.sql g2_recovery_nuevo
node server/scripts/estado-db.cjs g2_recovery_nuevo
```

La restauración verifica SHA-256 y exige una base nueva cuyo nombre comience por `g2_recovery_`. Rechaza `DB_NAME` y bases ya existentes. Después de comprobar tablas, relaciones y recuentos, cambiar `DB_NAME` para apuntar a la restauración. Restaurar también los motores archivados antes de ejecutar replay. Los archivos tar preservan los bytes originales: una recompilación o cambio de finales de línea puede producir otra huella, y no debe sustituir silenciosamente el motor histórico.

```powershell
tar -xf ruta-privada/replay-config-checkpoints.tar
npm.cmd run build
npm.cmd --prefix server run valuation:replay -- 533
```

El checkpoint puede trasladarse con sus datos privados. Si incluye un lock de otro equipo, comprobar primero que el worker anterior está detenido. Usar un directorio nuevo permite reconciliar con seguridad gracias a la idempotencia de MySQL; no borrar un lock perteneciente a un worker activo.

Backup final verificado: `private_backups/g2-2026-10-12T16-25-48-542Z.sql`, 298.305.198 bytes, SHA-256 `aa07bc26d0e7a0d64ac843804818a1278abefeb3a1de9b763b39139c6a58c6a5`. Restaurado en `g2_recovery_release_20261012`: todas las tablas coinciden por checksum con producción y el replay del run 533 devuelve `reproduced:true`. El tar privado tiene SHA-256 `dd4bc14e22a76e84bdd26a4761f7b35038e9991e8a0348e4641bf947882b103d`; contiene secretos y no debe publicarse.

## Migraciones y reversión

10 y 15 son aditivas e idempotentes respecto a objetos ya creados; además se verificó compatibilidad estructural y claves foráneas. Para detener persistencia, parar los workers y quitar `--write`. La migración 11 conserva evidencia al renombrar `valuation_execution`; se ensayó en la base aislada y **no se ejecutó en producción**. Antes del renombrado comprobar que el nombre de archivo no existe; para reactivar, renombrar la tabla conservada a su nombre original. No borrar runs ni model_version referenciadas.

La reparación 14 de fechas sigue pendiente en producción. El ensayo aislado copió 88.464 versiones, comparó todas las columnas de contenido con igualdad null-safe, comprobó pertenencia empresa/informe, fecha corregida y hashes, y revirtió la transacción. Para un ensayo nuevo usar una copia recién restaurada y `13_fechas_historicas_precheck.sql`; el SQL 14 termina en ROLLBACK. Para una aplicación posterior, conservar el ledger, verificar la misma integridad antes del COMMIT y no modificar versiones originales ni referencias de snapshots. No sustituir ROLLBACK por COMMIT sin completar estas verificaciones. DDL no se revierte mediante rollback de transacción.
