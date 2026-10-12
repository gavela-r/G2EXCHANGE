# Guía de integración a servidor TypeScript actual

El paquete se instala **como carpeta hermana de `server`**, no se fusiona en el servidor todavía. Dejar una copia de `valuation_engine_v14_ARCHIVO` si ya la habíais copiado.

### FASE A - Prueba aislada y sin riesgo

Desde `G2EXCHANGE/valuation_engine`, ejecutar `npm.cmd install`, `npm.cmd run build`, `npm.cmd test`, `npm.cmd run templates:check`, `npm.cmd run demo`. Inspeccionar cuatro ficheros en `salida_demo` y estado REVIEW.

### FASE B - Acordar el contrato financiero con backend

`src/tipos.ts` define el input en **fracciones** y cantidades en **millones**. Hay que suministrar 4 ejercicios, un RUN y un snapshot ya creados, país US/JP/TW, tipo de cambio 1 con moneda coincidente, WACC y datos para primas. Para valoración de bancos/seguros/REIT se requieren entradas específicas.

### FASE C - Montar una lectura sin escribir

Importar `exportarInputDesdeRun` desde `valuation_engine/src/integracion/mysql_readonly` **en el código del servidor**, pasando vuestro pool `conexion` desde `server/conexion/bd.ts`. NO importar `server.zip` dentro del motor. Confirmar nombres de columnas con `sql/01_PRECHECK_SOLO_LECTURA.sql` y ajustar el SELECT si vuestro esquema ha evolucionado.

La firma es:

```ts
const entrada = await exportarInputDesdeRun(pool, runId, {
  templateCode: '03',
  financialUnit: 'UNITS',   // confirmar en vuestra MySQL
  sharesUnit: 'UNITS',      // confirmar en vuestra MySQL
  changeNwcMillions: [/* FY-3 */, /* FY-2 */, /* FY-1 */, /* FY0 */],
  riskInputs: { /* 3 métricas con value, source, reference_date */ }
});
```

IMPORTANTE: **no inventar `changeNwcMillions`**; debe ser flujo de capital circulante no monetario, no saldo de capital circulante del balance. Sustituir todos los comentarios por números verificados antes de compilar.

### FASE D - Valoración y exportación

`valorar(entrada)` devuelve WACC y valor por escenario en memoria, **sin base de datos**. El CLI acepta ese JSON desde disco para generar XLSX/PDF/JSON/ZIP. Alternativamente importar `escribirExcel`, `escribirPdf` en la capa de servicio del backend.

### FASE E - Persistencia opt-in después de validar

No conectar automáticamente `mysql_persist_optin.ts`. Antes: confirmar `SHOW CREATE TABLE valuation_run_parametros`; revisar posible migración opcional; asegurar que el run está en `PREPARANDO`; pruebas de transacción/rollback; comprobar snapshots históricos; autorizar manualmente `persistirParametrosAprobados(pool,resultado,true)` **solo con primas MANUAL_APPROVED verificadas**. El archivo no actualiza `valuation_run_resultado`; su integración y transición de estados quedan sujetas a pruebas de vuestra aplicación. No modificar los 138 costes de capital existentes.

### FASE F - Producción

En un entorno de ensayo con copia de DB: elegir plantilla correcta por sector, reconciliar unidades y datos, comparar JSON/PDF/Excel/SQL y comprobar exactamente un resultado por escenario. Solo después activar flujo en la interfaz. NUNCA ejecutar los scripts legacy Python/SQL v1.4.
