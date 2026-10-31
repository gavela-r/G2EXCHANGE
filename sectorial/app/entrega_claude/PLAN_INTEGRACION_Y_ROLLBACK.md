# Plan de integración reversible y rollback — módulo sectorial G2EXCHANGE

Estado de partida: el módulo sectorial vive sólo en `sectoriales_auditoria_20261030/integracion_v02` y en el servicio aislado `127.0.0.1:3200`. No hay ningún cambio en `G2EXCHANGE/`, en MySQL operativo, en el módulo Capital operativo ni en las 60 ejecuciones congeladas. Nada de lo descrito aquí se ha ejecutado: requiere autorización expresa.

## Principios

1. **Aditivo**: el módulo entra como un subdirectorio y una ruta nuevos; no sustituye `server/src/valoracion/*`, `servicioValoracion.ts`, `valuation_engine/` ni el cliente actual.
2. **Sólo lectura** sobre las tablas financieras: el adaptador usa `START TRANSACTION READ ONLY`, sólo `SELECT/SHOW`, `MAX_EXECUTION_TIME` y un pool de 2 conexiones.
3. **Persistencia separada**: las ejecuciones sectoriales siguen en JSON versionado e inmutable (`runs/<sha256>.json` + `engines/<hash>/`). Una eventual tabla MySQL sería nueva (`sectorial_run`), en un esquema de desarrollo primero y jamás sobre `valuation_execution`.
4. **Sin valoraciones automáticas**: no se programan lotes ni watchers; cada cálculo es una petición explícita con sesión local.
5. **Feature flag**: la ruta y la pestaña sólo existen si `G2_SECTORIAL_ENABLED=1`.

## Fases

| Fase | Acción | Verificación de salida | Rollback |
|---|---|---|---|
| 0. Congelación | Etiquetar el repositorio operativo (`git tag pre-sectorial-<fecha>`) sin tocar los cambios pendientes de commit; copiar `integracion_v02` a un paquete con hash. | `integridad_claude.cjs`: 228 archivos, 16 maestros, 60 ejecuciones. | No aplica. |
| 1. Rama | Crear `feature/sectorial-v02` y copiar el módulo a `server/src/sectorial/` (engine/dist o compilación TS propia, adapter, workflow, registry, calendario, store, exporter, native-qa) y `client/src/sectorial/`. | `node --test` de las 9 suites del módulo; compilación TS sin errores; ningún archivo existente modificado salvo el registro de ruta. | Borrar la rama. |
| 2. Montaje detrás de flag | Registrar `/api/sectorial/*` en el servidor operativo sólo con el flag; reutilizar el pool en modo lectura vía el envoltorio `readOnly`. | Mismo `api_v3.cjs` contra el puerto operativo de desarrollo; flag apagado ⇒ 404. | Apagar el flag (inmediato) o revertir el commit de montaje. |
| 3. Cliente | Añadir pestaña "Valoración sectorial" que monte `client/src/sectorial/App.jsx`; no recompilar `client/dist` operativo hasta aprobar. | Pruebas SSR (`react_ssr.test.mjs`) y revisión visual. | Revertir commit de cliente. |
| 4. Excel | Mantener el worker (máx. 1) y la regla "sólo se descarga lo validado en Excel nativo". En servidores sin Excel, la descarga queda en 409 (diagnóstico). | `qa_api_final.mjs` en la máquina con Excel. | Desactivar `/export`. |
| 5. Revisión financiera | Expedientes reales con datos acreditados, revisados por analista; primas WACC calibradas (fase propia). | Informe de revisión por empresa. | Los runs son inmutables: basta con no aprobarlos. |
| 6. Producción | Despliegue con el flag apagado; encendido controlado. | Smoke + integridad. | Apagar flag; `git revert` del merge; las tablas existentes no cambian, por lo que no hay migración inversa. |

## Rollback del entorno aislado

- Punto de recuperación anterior a Claude Code: `checkpoints/integracion_v02_pre_claude_20261030.tar.gz` (sha256 `7c175950…14e6`).
- Paquete final de esta fase: ver `CHECKPOINT_CLAUDE.md` (nombre y hash).
- Servicio aislado: detener sólo el PID registrado en `evidencias/servicio_v3.json` (y siguientes); no afecta a 3000/3100 ni a los recuperadores.
- Restauración: extraer el tar en una carpeta nueva y comparar; nunca sobre la carpeta viva sin copia.

## Dependencias que deben resolverse antes de producción

- Ampliar `taxonomia_concepto` y la recuperación con conceptos prudenciales (préstamos, depósitos, provisiones ECL, inversiones, pasivos por contratos de seguro): fase PCV.
- Calibración de primas (fase WACC). Hasta entonces las primas son `NO_ESTIMABLE` con ajuste operativo 0.
- Excel nativo en el servidor de despliegue o un validador equivalente acordado; sin él, sólo diagnóstico.
- Revisión financiera de cada metodología sectorial (ver `INFORME_SECTORES.md`).
