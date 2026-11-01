# Uso de la implementación Capital v2

## Actualización: primas automáticas y Excel

La entrada React incluye **Calcular primas automáticas y exportar** al seleccionar una ejecución. El resultado conserva `primaCalculada` separada de `ajusteOperativo`: sin datos/metodología, la primera es nula y el segundo 0 %, con estado NO_ESTIMABLE. No es una prima estimada de cero. Las evaluaciones sin run también incluyen ambos resultados, sin inventar Ke/WACC.

Nuevas rutas: `GET /api/capital/companies/:id/premiums?asOf=YYYY-MM-DD` y `POST /api/capital/runs/:id/automatic-premiums` con cuerpo vacío y token de revisión. Los coeficientes, exposiciones, evidencias y aprobaciones proceden exclusivamente del servidor. Las primas calculadas no nulas requieren revisión individual antes de aplicarse.

Los Excel nuevos añaden `Primas_auto` y conectan los campos de liquidez/tamaño y las fórmulas afectadas de `07_WACC` con esa hoja. Contiene fórmulas de descuento sobre flujos y numerador terminal congelados, y `10_RESULTADO` muestra la simulación nueva. Modificar primas en un Excel es una hipótesis manual: no actualiza la evidencia, aprobación ni base de datos. Las hojas legadas `08/09` se conservan como referencia y no son el resultado nuevo. [Resultados y límites de esta actualización](18_PRIMAS_AUTOMATICAS_RESULTADOS.md).

Comprobación acotada real: `node server/scripts/capital-primas-real.cjs`. QA opcional: `node server/scripts/capital-primas-excel-qa.cjs`; requiere las herramientas temporales libres indicadas en el informe, no añade dependencias al producto. Para guardar los logs de pruebas nuevos sin sustituir los de la fase anterior:

```powershell
$env:CAPITAL_TEST_OUTPUT='valuation_engine/research/coste_capital/fase4/evidencias'
node server/scripts/capital-test.cjs
```

## Entorno y arranque

Destino creado y migrado: `g2_capital_dev_20261029`. Se copiaron las dimensiones reales y las ejecuciones/snapshots congelados; los informes y evidencias financieras se copiaron para las empresas con snapshots/runs. **No es una réplica financiera completa de las 13.194 empresas.** El manifiesto de copia y su alcance están en `fase3/evidencias/copia.json`.

Las credenciales siguen procediendo del `.env` existente. No se imprimen, duplican ni incluyen en los archivos de resultados. `CAPITAL_DB_NAME` permite otra copia cuyo nombre empiece por `g2_capital_dev_`; el runner y el servicio rechazan la base operativa. No ejecutar el build general del backend para probar este módulo: puede reemplazar los compilados utilizados por recuperadores activos. Se utiliza `dist-capital`, independiente de `server/dist` y del motor archivado.

```powershell
npm.cmd --prefix server run capital:build
npm.cmd --prefix client run build
npm.cmd --prefix server run capital:start
```

Entrada real: `client/src/main.jsx` → `CapitalApp.jsx`. El servidor sirve `client/dist` y la API en **http://127.0.0.1:3100**. Para desarrollo React: `npm.cmd --prefix client run dev`; Vite dirige `/api/capital` al servicio 3100. No se ha desplegado un frontend de producción ni cambiado los contenedores operativos.

## Uso funcional

1. Buscar por nombre/ticker y seleccionar una empresa. Las empresas sin informes siguen visibles.
2. Elegir fecha de evaluación y cierre financiero. Los datos sin publicación o contexto acreditados permanecen desconocidos.
3. Revisar indicadores, fuentes, conciliaciones, familia financiera y estado de capitalización. Los datos bursátiles se separan por fuente/feed y estado de validación.
4. Comparar con el sector. El criterio estricto exige periodo coincidente. La alternativa explícita `ANNUAL_CLOSE_YEAR` sólo agrupa informes anuales con cierre en el mismo año natural; conserva las fechas y advierte que no son TTM simultáneos. Las dos políticas tienen exclusiones y denominadores registrados.
5. Guardar evaluación y, cuando corresponda, rechazar su aplicación. Las propuestas no estimables no se aprueban. Los porcentajes enviados por un cliente no autorizan una prima.
6. Seleccionar una ejecución congelada y simular deltas de Ke/Kd en **puntos básicos**. Se comparan tres escenarios manteniendo los flujos originales. Las hipótesis manuales nunca se convierten en primas aprobadas.
7. Descargar Excel, PDF o JSON y consultar historial. La referencia y cada decisión quedan independientes de `valuation_run`.

Ejemplo comprobado: NVIDIA, cierre `2025-01-26`, fecha `2026-10-29`. El valor por defecto del cierre más reciente no se reemplaza automáticamente por otro más completo. La simulación de referencia comprobada utiliza el run congelado 533; la UI ofrece los runs de cada empresa seleccionada.

## API

Prefijo `/api/capital`:

| Método | Ruta | Uso |
|---|---|---|
| GET | `/session` | Modo y nonce efímero de revisión local; no registrarlo en logs |
| GET | `/companies?q=...` | Búsqueda real, máximo 50 resultados |
| GET | `/companies/:id?asOf=...&periodEnd=...` | Datos, cobertura, liquidez, tamaño, evidencias y propuestas diagnósticas |
| GET | `/companies/:id/comparables?asOf=...` | Consulta estricta, sin persistencia |
| POST | `/companies/:id/benchmarks` | Construcción y conservación del benchmark, con política explícita de periodos |
| POST | `/companies/:id/evaluations` | Evaluación inmutable y versionada |
| GET | `/companies/:id/proposals` | Propuestas cuantitativas almacenadas; actualmente ninguna real |
| GET | `/companies/:id/history` | Evaluaciones y decisiones sucesivas |
| GET | `/methodologies`, `/providers` | Catálogo y estados reales |
| POST | `/analyses/:id/decisions` | Aprobar/rechazar; el servidor comprueba evidencia, método, universo, fecha y componente |
| GET | `/runs/:id` | Referencia congelada y comparación neutra |
| POST | `/runs/:id/simulations` | Hipótesis manuales: únicamente `keBps`, `kdBps` |
| POST | `/runs/:id/authorized-simulations` | Sólo IDs de propuestas aprobadas del servidor; nunca tasas aportadas por el cliente |
| GET | `/analyses/:id/export/xlsx`, `/pdf`, `/json` | Documentos y trazabilidad completa |

Las escrituras requieren `X-Capital-Review-Token`, origen permitido y una decisión idempotente con UUID y última decisión conocida. El actor se obtiene en el servidor. **La revisión local no es un sistema de autenticación de producción**: requiere integrar identidad/RBAC antes de exponer el servicio fuera del equipo. No existe endpoint público para registrar una metodología como aprobada.

## Cargas y conciliaciones

```powershell
node server/scripts/capital-load.cjs TWSE 5
# Continuar por el último instrumento devuelto, sin carga masiva:
node server/scripts/capital-load.cjs TWSE 5 7887
node server/scripts/capital-load.cjs TPEX 3
node server/scripts/capital-load.cjs JP
node server/scripts/capital-reconcile.cjs 5
node server/scripts/capital-quarantine.cjs
```

TWSE/TPEx incorporan capturas diarias oficiales permitidas por sus conjuntos abiertos; no reconstruyen cotizaciones eliminadas. Los reintentos, límites y respuestas incompletas son explícitos. TWSE conserva checkpoints y aliases acreditados; TPEx mantiene sus observaciones no conciliadas mientras no exista contraste suficiente del registro emisor.

Alpaca dispone de adaptador paginado e incremental y la prueba SIP diferida devolvió HTTP 200. **No se almacenaron sus precios**: falta acreditar autorización compatible con el uso corporativo/redistribución de esta aplicación. J-Quants personal se excluye; Japón devuelve ausencia explícita. No introducir credenciales ni habilitar derechos mediante un payload del cliente.

`capital-reconcile` reutiliza exclusivamente la caché oficial SEC existente: no descarga, no cambia PCV ni versiones antiguas. Acredita AC/PC/prepagos cuando existen tags totales exactos y conserva las fechas originales. El gasto combinado de prepagos y otros activos no se convierte en prepagos; los campos no disponibles continúan nulos.

## Pruebas y operación segura

```powershell
node server/scripts/capital-test.cjs
node server/scripts/capital-smoke.cjs
node server/scripts/capital-status.cjs
node server/scripts/capital-verify.cjs
```

`capital-test` usa una base **de pruebas** distinta y casos hipotéticos identificados; no escribe en la base operativa. La regresión histórica sólo lee inputs, outputs y código archivados. Los archivos archivados del módulo y sus hashes permiten conservar la versión efectiva; no contienen `.env`.

Migraciones: `capital-dev.cjs --migrate` comprueba nombre de destino y huellas, y aplica 20/21/22/23 idempotentemente en desarrollo. No usar `--create` sobre una base existente. `--resume` sólo completa una copia interrumpida sin sustituir filas existentes. La 23 conserva los snapshots/calibraciones nuevos como texto JSON exacto con JSON_VALID: evita la normalización de números de doble precisión del JSON nativo de MySQL. Respalda y verifica las filas de investigación antes/después; los análisis previos se conservan como codificación 1, los nuevos como codificación 2.

El build aislado genera un manifiesto de fuentes y compilados. Las escrituras y el arranque rechazan un manifiesto desactualizado: después de modificar código debe recompilarse y reiniciarse el servicio. `node server/scripts/capital-replay-analysis.cjs` reproduce simulaciones guardadas desde su código compilado archivado y snapshot exacto, sin escribir en MySQL. No se presentan los análisis previos a la codificación 2 como reproducciones exactas.

Excel es un informe versionado con resultados TypeScript y fórmulas Ke/Kd/WACC contrastadas. No contiene un nuevo motor DCF interactivo: para modificar hipótesis y recalcular el impacto debe usarse la interfaz/API y regenerarse el archivo. El PDF conserva estados y evidencias; su fuente latina no certifica la representación completa de caracteres CJK.

Con datos, el rollback consiste en retirar el servicio conservando las estructuras y evidencias. `capital-rollback.cjs --apply-empty` sólo permite una reversión de tablas vacías, y rechaza restaurar el ticker global si existen tickers legítimos repetidos entre mercados. Su reinstalación se ha probado en una base vacía dedicada. No elimina valoraciones ni históricos para facilitar la reversión.

No se han activado cron, integraciones japonesas falsas, cargas generales ni nuevas valoraciones definitivas. El despliegue operativo debe coordinar esquema, aliases y escritores/lectores; no sustituir los compilados bajo recuperadores activos.
