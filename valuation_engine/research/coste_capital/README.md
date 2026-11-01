> Actualización ejecutada: [primas automáticas y Excel](fase4/README.md), con resultados reales, 0 operativo separado de NO_ESTIMABLE y fórmulas conectadas a las 16 plantillas. No existen primas reales calibradas. La integración anterior está en [fase 3](fase3/README.md). El contenido siguiente conserva el informe histórico de la fase 1; no describe el estado actual.

# Ajustes bidireccionales de coste de capital — fase interna 1

**Resultado:** auditoría y módulo de diagnóstico operativo, con cálculos puros, comparables, trazabilidad, control de duplicidades y pruebas. **No hay ninguna prima real de liquidez o tamaño calibrada/autorizada.** El módulo permanece fuera de producción, sin endpoint, importador, adaptador MySQL o integración DCF. La única función que produce un WACC candidato es una simulación expresamente hipotética para probar la ponderación matemática.

Se ha trabajado con presupuesto cero, dependencias instaladas y fuentes públicas. No se han cambiado fórmulas, frontend, esquemas SQL, recuperadores, tareas, contratos públicos, plantillas ni valoraciones. La auditoría detecta problemas existentes y propone correcciones futuras sin aplicarlas. Hay límites verificables: no se consultó MySQL vivo ni se encontró el Excel de Inditex solicitado.

## Entregables

| Nº | Entregable | Ubicación |
|---|---|---|
| 1 | Auditoría CAPM/WACC/DCF, funciones, fórmulas, riesgos, escenarios, reportes/versiones y mapa previo | [01_AUDITORIA_MOTOR](docs/01_AUDITORIA_MOTOR.md) |
| 2 | Mapa de datos, unidades, fuentes, disponibilidad/ausencia y limitaciones | [02_MAPA_DATOS](docs/02_MAPA_DATOS.md), [diccionario de 25 tablas](docs/02_DICCIONARIO_SQL.md) |
| 3 | Informe de liquidez y evidencia académica verificable | [03_LIQUIDEZ_Y_EVIDENCIAS](docs/03_LIQUIDEZ_Y_EVIDENCIAS.md) |
| 4 | Informe de tamaño, exposición residual y límites de primas | [04_TAMANO_Y_EVIDENCIAS](docs/04_TAMANO_Y_EVIDENCIAS.md) |
| 5 | Selección, estadística, fuentes y trazabilidad de comparables | [05_COMPARABLES_Y_DUPLICIDADES](docs/05_COMPARABLES_Y_DUPLICIDADES.md) |
| 6 | Matriz de doble contabilización por riesgo/canal | [05_COMPARABLES_Y_DUPLICIDADES](docs/05_COMPARABLES_Y_DUPLICIDADES.md) |
| 7 | Módulo TypeScript independiente | [src/index.ts](src/index.ts), descripción técnica abajo |
| 8 | Pruebas automatizadas y alcance de validación | [07_PRUEBAS_Y_ESTADO](docs/07_PRUEBAS_Y_ESTADO.md), [registro ejecutado](evidencias/pruebas_modulo.txt) |
| 9 | Arquitectura y migración futura propuesta, sin DDL ejecutable nuevo | [06_INTEGRACION_FUTURA](docs/06_INTEGRACION_FUTURA.md) |
| 10 | Integración futura con maestros, DCF y diseño de UI | [06_INTEGRACION_FUTURA](docs/06_INTEGRACION_FUTURA.md) |
| 11 | Lista exacta de archivos creados/modificados y generados | [08_ARCHIVOS](docs/08_ARCHIVOS.md) |
| 12 | Decisiones previas a cualquier activación | [09_DECISIONES_PENDIENTES](docs/09_DECISIONES_PENDIENTES.md) |

## Arquitectura técnica

Se conserva la convención TypeScript estricto/CommonJS y pruebas `node:test` del motor. La carpeta `research/coste_capital` queda fuera del `include` de sus builds y del manifiesto de fuentes/binarios de producción. **No ejecutar `npm run build` para usar este módulo.** Su tsconfig produce únicamente su propio `dist`, ignorado por Git, y usa el TypeScript ya instalado en valuation_engine. No hay nuevos paquetes ni archivos de lock modificados.

| Archivo | Funcionalidad implementada |
|---|---|
| `src/tipos.ts` | Contratos de empresas/familias, indicadores/datos con fechas y fuente, benchmarks, incorporación por componente, propuestas y estados independientes |
| `src/indicadores.ts` | Caja/deuda bruta/neta; current/quick/cash ratio; cobertura; deuda neta/EBITDA; CFO/FCF y FCF/deuda; volatilidad muestral FCF; ingresos/EBITDA/activos reportados; capitalización de una clase conciliada; medidas de negociación/turnover/free float/spread cotizado/Amihud/días sin negociación/CV de volumen con inputs completos |
| `src/comparables.ts` | Selección explícita, exclusiones, controles de fechas/unidades/periodos/familias, mismo mercado/calendario para bursátiles, media/mediana/percentiles y dispersión, sin reglas de primas |
| `src/evaluacion.ts` | Dirección y estado de ajuste separados, contraste con referencia, origen/limitaciones/confianza cualitativa, evidencia de incorporación total/parcial y advertencias de solapamiento; registro cerrado sin calibraciones autorizadas |
| `src/simulacion.ts` | Solo aritmética hipotética de ΔKe/ΔKd ponderados, fiscalidad, unidades y reducciones ligadas a prima base del mismo riesgo; rechaza modelos equity y duplicidad de ID/riesgo |
| `src/index.ts` | Exportaciones internas; ningún módulo de producción lo importa |

La capitalización observada usa acciones en circulación y fecha/clase/splits conciliados. Una base de acciones diluidas no pasa como capitalización convencional. La valoración por acción plenamente diluida es otro cálculo y no se implementa aquí. Los importes son unidades monetarias y acciones en unidades; nunca se deduce un multiplicador de un número. El adaptador futuro debe validar la escala original antes de marcar un `Dato` como validado. Fuentes y clasificación de la empresa deben corresponder al corte histórico; los tipos no acreditan la verdad de un dato declarado.

La función de FCF utiliza CFO−CAPEX positivo con evidencia; no reemplaza FCFF del motor. Existe `kpiCalcularInforme` en backend, pero su archivo importa conexión MySQL y aplica reglas de signos/disponibilidad distintas. No se carga ese archivo ni se extrae/copía su implementación. El módulo calcula identidades diagnósticas con un contrato estricto de datos fechados, conserva ausencias y no crea otra taxonomía ni calculador CAPM. Un adaptador futuro debe reutilizar observaciones/KPI normalizados existentes **si se acredita su contexto**, evitando recalcular o persistir datos históricos innecesariamente.

No están implementados: magnitud empírica de primas; estimación LCAPM/FF; regresión de tamaño residual; reconstrucción histórica de datos/universos; previsión de déficit/vencimientos; DLOM; valoración de bancos/seguros; efectos sobre estructura/FCFF/equity o valor intrínseco; aprobación/persistencia/UI. Los indicadores de esos ámbitos sin definición/datos devuelven ausencia y explicación. No confundir los contratos preparados con cálculos ya disponibles.

## Semántica

`FAVORABLE/DESFAVORABLE/NEUTRAL/DESCONOCIDO` describen el diagnóstico. `POSITIVO/NEGATIVO/CERO/NO_ESTIMABLE/NO_APLICABLE/YA_INCORPORADO` describen el ajuste. Todos los resultados llevan `aplicableProduccion:false`.

- Datos faltantes o sin calibración → `NO_ESTIMABLE`, importe `null`.
- Familia incompatible → `NO_APLICABLE`, importe `null`.
- Riesgo concreto conciliado como totalmente incluido → `YA_INCORPORADO`, ajuste **adicional** 0, sin borrar la dirección observada.
- Cobertura parcial → no cuantificar el residual.
- Igualdad exacta con benchmark válido → `CERO` incremental, sin afirmar que el riesgo absoluto sea nulo.
- Ser grande/pequeña no determina dirección del riesgo. Se informa la diferencia de escala, con `DESCONOCIDO` si no hay relación monotónica válida.
- `POSITIVO/NEGATIVO` no son salidas de primas reales en v1: se verifican como estados de efectos hipotéticos en las pruebas de aritmética. No existe método autorizado que genere esa magnitud para una empresa real.

`METODOLOGIAS` no contiene números ni flags editables de aprobación. Incorporar un modelo cuantitativo futuro exigirá un cambio revisado, evidencias/calibración y versión nueva; no basta pasar un coeficiente o cambiar un dato. Las incorporaciones TOTAL/PARCIAL son evidencias documentales suministradas por un auditor/consumidor validado, no inferencias automáticas de la aplicación.

## Ejecución local y ejemplos

Desde la raíz G2EXCHANGE, usando Node ya instalado (validado con Node 24):

```powershell
node valuation_engine/research/coste_capital/tests/ejecutar.cjs
```

Compila únicamente este módulo, ejecuta casos A–H/validaciones y compara archivos/manifiesto/DCF original con la evidencia inicial. No instala nada ni conecta con MySQL. Escribe solo resultados de pruebas del módulo y su dist. La evidencia inicial **no se recaptura para hacer pasar una prueba**.

Ejemplos sintéticos, guardados exclusivamente dentro de tests:

```powershell
node valuation_engine/research/coste_capital/dist/tests/ejemplos.js
```

Produce JSON de un tamaño grande sin dirección de riesgo inferida y de liquidez favorable sin prima autorizada. Los escenarios A–G adicionales y la simulación Ke/Kd se encuentran en `tests/modulo.test.ts`. No son datos reales ni parámetros de producción. Los URLs `example.invalid` pertenecen exclusivamente a fixtures de pruebas.

Para repetir inspecciones de lectura del DDL/maestros: `tests/inspeccionar_esquema.cjs` y `tests/inspeccionar_excel.cjs`. Escriben documentos/evidencias de este módulo; no ejecutan SQL ni exportan libros. Al retirar esta carpeta desaparece la funcionalidad experimental; no hay hooks que desactivar en producción. Conservar los documentos/evidencias para revisión antes de retirarla.
