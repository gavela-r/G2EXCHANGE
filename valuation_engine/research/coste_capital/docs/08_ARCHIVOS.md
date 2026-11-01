# Relación exacta de archivos de esta intervención

Todos los archivos nuevos mantenidos están bajo `valuation_engine/research/coste_capital/`. No se ha editado ningún archivo fuente preexistente. Los cambios anteriores/concurrentes de informes operativos no pertenecen a este módulo y se documentan en 07_PRUEBAS_Y_ESTADO.

## Nuevos archivos de código, pruebas, configuración, documentación y evidencias

- `README.md`
- `docs/01_AUDITORIA_MOTOR.md`
- `docs/02_DICCIONARIO_SQL.md`
- `docs/02_MAPA_DATOS.md`
- `docs/03_LIQUIDEZ_Y_EVIDENCIAS.md`
- `docs/04_TAMANO_Y_EVIDENCIAS.md`
- `docs/05_COMPARABLES_Y_DUPLICIDADES.md`
- `docs/06_INTEGRACION_FUTURA.md`
- `docs/07_PRUEBAS_Y_ESTADO.md`
- `docs/08_ARCHIVOS.md`
- `docs/09_DECISIONES_PENDIENTES.md`
- `evidencias/compatibilidad_final.json`
- `evidencias/compatibilidad_inicial.json`
- `evidencias/plantillas_inspeccion.json`
- `evidencias/pruebas_modulo.txt`
- `src/comparables.ts`
- `src/evaluacion.ts`
- `src/index.ts`
- `src/indicadores.ts`
- `src/simulacion.ts`
- `src/tipos.ts`
- `tests/compatibilidad.cjs`
- `tests/ejecutar.cjs`
- `tests/ejemplos.ts`
- `tests/inspeccionar_esquema.cjs`
- `tests/inspeccionar_excel.cjs`
- `tests/inventario.cjs`
- `tests/modulo.test.ts`
- `tsconfig.json`

## Compilados generados solo dentro del módulo (ignorados por Git)

- `dist/src/comparables.d.ts`
- `dist/src/comparables.js`
- `dist/src/evaluacion.d.ts`
- `dist/src/evaluacion.js`
- `dist/src/index.d.ts`
- `dist/src/index.js`
- `dist/src/indicadores.d.ts`
- `dist/src/indicadores.js`
- `dist/src/simulacion.d.ts`
- `dist/src/simulacion.js`
- `dist/src/tipos.d.ts`
- `dist/src/tipos.js`
- `dist/tests/ejemplos.d.ts`
- `dist/tests/ejemplos.js`
- `dist/tests/modulo.test.d.ts`
- `dist/tests/modulo.test.js`

## Otros artefactos de prueba

- `server/resultados_valoraciones/verificacion/escala.json`: reporte sintético generado por una prueba backend existente, ignorado por Git. No es un resultado de valoración real.
- Las pruebas existentes de Excel/PDF usan archivos temporales que eliminan al terminar.

No se han añadido dependencias ni modificado package.json, locks, SQL, frontend, plantillas, recuperadores, programaciones, fórmulas, archivos de motor histórico o interfaces públicas. No se han realizado commits ni migraciones.
