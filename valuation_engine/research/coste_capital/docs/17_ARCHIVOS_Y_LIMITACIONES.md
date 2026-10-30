# Archivos, compatibilidad y cierre

Inventario de esta implementación, separado de las fases 1/2 y de cambios operativos ajenos. No se han hecho commits ni restauraciones que sobrescriban trabajo del usuario.

## Creados

- `client/src/CapitalApp.jsx`
- `client/src/capital.css`
- `server/scripts/capital-build.cjs`
- `server/scripts/capital-client-qa.cjs`
- `server/scripts/capital-dev.cjs`
- `server/scripts/capital-entrega.cjs`
- `server/scripts/capital-load.cjs`
- `server/scripts/capital-manifest.cjs`
- `server/scripts/capital-pdf-qa.cjs`
- `server/scripts/capital-provider-probe.cjs`
- `server/scripts/capital-quarantine.cjs`
- `server/scripts/capital-reconcile.cjs`
- `server/scripts/capital-replay-analysis.cjs`
- `server/scripts/capital-replay-runtime.cjs`
- `server/scripts/capital-rollback.cjs`
- `server/scripts/capital-smoke.cjs`
- `server/scripts/capital-status.cjs`
- `server/scripts/capital-test.cjs`
- `server/scripts/capital-verify.cjs`
- `server/sql/20_capital_v2.sql`
- `server/sql/21_capital_identidad.sql`
- `server/sql/22_capital_model_version.sql`
- `server/sql/23_capital_json_exacto.sql`
- `server/src/capital/api.ts`
- `server/src/capital/corrientesSec.ts`
- `server/src/capital/datos.ts`
- `server/src/capital/estimacion.ts`
- `server/src/capital/fecha.ts`
- `server/src/capital/finanzas.ts`
- `server/src/capital/historico.ts`
- `server/src/capital/indicadores.ts`
- `server/src/capital/main.ts`
- `server/src/capital/manifiesto.ts`
- `server/src/capital/proveedores.ts`
- `server/src/capital/regresion.ts`
- `server/src/capital/reportes.ts`
- `server/tests/capitalFinanzas.test.cjs`
- `server/tests/capitalMysql.test.cjs`
- `server/tests/capitalPlantillas.test.cjs`
- `server/tsconfig.capital.json`
- `valuation_engine/research/coste_capital/docs/15_IMPLEMENTACION_Y_RESULTADOS.md`
- `valuation_engine/research/coste_capital/docs/16_USO_Y_OPERACION.md`
- `valuation_engine/research/coste_capital/docs/17_ARCHIVOS_Y_LIMITACIONES.md`
- `valuation_engine/research/coste_capital/fase3/README.md`

## Modificados

- `.gitignore`
- `client/index.html`
- `client/src/main.jsx`
- `client/vite.config.js`
- `server/insercionDatos/insercionDatosCotizacionDiaria.ts`
- `server/insercionDatos/insercionDatosInstrumento.ts`
- `server/insercionDatos/insercionDatosValuationInputVersion.ts`
- `server/insercionDatos/listaSeguimiento.ts`
- `server/package.json`
- `server/src/valoracion/datos.ts`
- `server/tsconfig.json`
- `valuation_engine/research/coste_capital/README.md`

## Generados

- `valuation_engine/research/coste_capital/fase3/evidencias/alpaca-probe.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/api-smoke.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/archivos-entrega.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/build-capital.txt`
- `valuation_engine/research/coste_capital/fase3/evidencias/carga-tpex-1793311519532.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/carga-tpex-1793340883994.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/carga-twse-1793306810052.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/carga-twse-1793310403669.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/carga-twse-1793311175692.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/carga-twse-1793311353235.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/carga-twse-1793340863034.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/cierre.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/cliente-dom.html`
- `valuation_engine/research/coste_capital/fase3/evidencias/cliente-dom.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/conciliacion-sec.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/copia.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/estado-final.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/identidad-bloqueada.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/migration23-g2_capital_dev_20261029-verificada.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/migration23-g2_capital_dev_pruebas_20261029-verificada.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/migration23-g2_capital_dev_rollback_24704-verificada.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/pdf-render.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/pruebas-capital.txt`
- `valuation_engine/research/coste_capital/fase3/evidencias/pruebas-resumen.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/regresion-backend-previo.txt`
- `valuation_engine/research/coste_capital/fase3/evidencias/regresion-modulos-previos.txt`
- `valuation_engine/research/coste_capital/fase3/evidencias/replay-capital-v2.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/replay-node22-linux.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/replay.json`
- `valuation_engine/research/coste_capital/fase3/evidencias/typecheck-backend.txt`
- `valuation_engine/research/coste_capital/fase3/evidencias/verificacion-real.json`
- `valuation_engine/research/coste_capital/fase3/salida/diagnostico.json`
- `valuation_engine/research/coste_capital/fase3/salida/diagnostico.pdf`
- `valuation_engine/research/coste_capital/fase3/salida/diagnostico.xlsx`
- `valuation_engine/research/coste_capital/fase3/salida/simulacion.json`
- `valuation_engine/research/coste_capital/fase3/salida/simulacion.pdf`
- `valuation_engine/research/coste_capital/fase3/salida/simulacion.xlsx`

También se generaron los directorios compilados/QA y paquetes de código indicados en fase3/evidencias/archivos-entrega.json; están excluidos de Git. Las herramientas temporales libres de QA (jsdom, PDF.js y canvas) no se añadieron a las dependencias del producto.

## Cambios que no son de esta implementación

- `server/docs/INFORME_COBERTURA_85.md`
- `server/docs/INFORME_FMP_COMPLEMENTARIO.md`
- `server/docs/INFORME_RECUPERACION_US_JP_TW.md`
- `server/docs/RESULTADOS_PROVEEDORES_20261028.md`
- `server/docs/AUDITORIA_ESPERA_US_20261029.md`

Se conservaron esas modificaciones de procesos/trabajos anteriores. No se cambiaron scripts de recuperación financiera ni sus tareas programadas ni los originales de las 16 plantillas. El hash del motor legado y los maestros se verifica en las pruebas/evidencias.

## Estado exacto de entrega

- Producción: sin migración, sin primas nuevas, sin reescritura de valoraciones ni snapshots.
- Desarrollo: MySQL, proveedores abiertos controlados, API, React, decisiones y simulaciones ejecutados.
- Amihud: recorrido MySQL/API probado con serie hipotética completa; 0 empresas reales cumplen condiciones.
- Capitalización: productos parciales y controles implementados; 0 validadas en la cohorte; no se afirma una conciliación real inexistente.
- Calibración: OLS experimental e infraestructura; no existe prima real aprobada ni backtest suficiente.
- Modelos: 16 probados con entradas hipotéticas; no 16 empresas reales sectoriales certificadas.
- Interfaz: compilación y DOM de prueba contra API real; revisión visual nativa del navegador no realizada.
- PDF: render e inspección visual de muestras realizados; soporte CJK completo no certificado.
- Nuevas valoraciones definitivas desde datos frescos: bloqueadas por datos y aprobación; no confundir las simulaciones sobre runs congelados con su activación.

Los resultados completos y las acciones realmente ejecutadas están en 15_IMPLEMENTACION_Y_RESULTADOS.md; el procedimiento de uso está en 16_USO_Y_OPERACION.md.
