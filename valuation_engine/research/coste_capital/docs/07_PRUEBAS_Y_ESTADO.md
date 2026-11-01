# Pruebas ejecutadas y límites de la verificación

Fecha: 29/10/2026, contexto Europe/Madrid. Node 24.19.0 y TypeScript existente, sin instalaciones ni coste.

| Comprobación | Resultado | Alcance |
|---|---|---|
| Compilación aislada del módulo | Correcta | TS estricto, salida en research/coste_capital/dist |
| Pruebas nuevas, node:test | **26/26** | Casos A–H y validación de indicadores/benchmarks/simulación |
| Pruebas preexistentes del motor, binarios existentes | **20/20** | CAPM/WACC, FCFF, 16 modelos, DDM, terminal/TTM, CAPEX, escenarios, congelación de salida Excel/PDF sintéticos |
| Pruebas backend seleccionadas | **23/23** | betaSectorial, rating y valoración, con mocks y sin MySQL real; incluye prueba de escala de 10.000 IDs sintéticos |
| TypeScript de motor y backend, `--noEmit` | Correcto en ambos | No recompila ni cambia el motor de producción |
| Comparación hashes originales | **298/299 sin diferencias** | 299 archivos versionados de la línea base; diferencia documental concurrente explicada abajo |
| Manifiesto producción | Idéntico antes/después | sourceHash y compiledHash sin cambios; versión 1.5.1 |
| Resultado del DCF original | Hash idéntico | Fixture existente `DEMO_NO_REAL.json`; no es replay de cada run de MySQL |
| Maestros Excel | Hashes originales conservados | Lectura de 16 plantillas; no exportadas ni recalculadas por esta auditoría |
| Dependencias / locks / SQL / frontend / recuperadores | Sin cambios de esta intervención | Archivos originales protegidos y misma política de producción |

Total de pruebas automáticas de comportamiento ejecutadas: **69/69** (26+20+23). No se ha ejecutado la suite de integración de MySQL ni todos los tests del backend. No hay una certificación de producción o de precisión financiera de las primas a partir de estos tests.

## Casos y resultado esperado

| Caso | Verificación |
|---|---|
| A Grande/sólida/líquida | Caja neta y ratios favorables, liquidez favorable; ninguna prima negativa automática. Evidencia de riesgo ya incluido produce YA_INCORPORADO |
| B Pequeña/ilíquida/débil | Ratios/negociación desfavorables, alerta tamaño–liquidez, sin coeficientes |
| C Grande con bajo volumen | Tamaño elevado y desventaja bursátil simultáneos, sin compensación |
| D Pequeña/sólida | No penaliza tamaño; reconoce diagnóstico financiero favorable sin cuantificar una bonificación |
| E Insuficiente | Datos/volumen ausentes → null y NO_ESTIMABLE; no calcula Amihud de cierres |
| F Incorporado | Cobertura total en Ke/Kd/equity → ajuste adicional 0; parcial/futura no autoriza cero incorporado |
| G Aritmética | Ke +100 pb aporta 80 pb WACC si wE=0,8; Kd +100 pb aporta 15 pb si wD=0,2 y T=0,25. Negativos exigen prima en referencia del mismo riesgo/componente; ceros no cambian resultado; bps/decimales explícitos. **Todos estos datos son hipotéticos de pruebas** |
| H Compatibilidad | Registro sin cuantificación autorizada, flag producción false, motor/manifiesto/plantillas/paquetes intactos |

Pruebas adicionales cubren fechas civiles inválidas/futuras, publicación, unidades/monedas, ceros/NaN, denominadores, signos, series sin volumen monetario, calendario incompleto/duplicado, importes de negociación contradictorios, bid/ask sin simultaneidad, capitalización con fechas/clases/dilución diferentes, FCF volátil con bisiestos/solapamientos, familias financieras, comparables propios/duplicados/futuros/de otro mercado/moneda, mediana adulterada, conservación de exclusiones y ausencia de mutaciones en inputs.

## Comandos realmente utilizados

Desde G2EXCHANGE:

```powershell
node valuation_engine/research/coste_capital/tests/ejecutar.cjs
node --test valuation_engine/dist/tests/*.test.js
node valuation_engine/node_modules/typescript/bin/tsc -p valuation_engine/tsconfig.json --noEmit
node server/node_modules/typescript/bin/tsc -p server/tsconfig.json --noEmit
```

Pruebas backend con variables sintéticas **solo en el proceso de pruebas**:

```powershell
$env:DB_USER='SYNTHETIC_TEST_USER'
$env:DB_PASSWORD='SYNTHETIC_TEST_PASSWORD'
$env:DB_NAME='SYNTHETIC_TEST_DATABASE'
node --require ./server/tests/config.cjs --test server/tests/betaSectorial.test.cjs server/tests/rating.test.cjs server/tests/valoracion.test.cjs
```

Las pruebas de rating sustituyen fetch y el pool por mocks; las de lotes usan pools sintéticos y directorios temporales. El reporte habitual de escala quedó en `server/resultados_valoraciones/verificacion/escala.json` (ignorado por Git), con IDs/cifras sintéticos de prueba, no resultados reales. La prueba antigua de exportación escribe y elimina demo.xlsx/demo.pdf en un directorio temporal; no modifica las plantillas. No se ejecutaron npm build/install ni scripts de manifest/descargas/migración.

## Diferencia documental concurrente

Al iniciar, ya había modificaciones ajenas en cuatro informes de `server/docs` y un informe de auditoría sin seguimiento. Se preservaron. Durante el trabajo cambió además el hash de `server/docs/RESULTADOS_PROVEEDORES_20261028.md`, sin que esta intervención lo editara. No se conoce aquí qué proceso/usuario lo actualizó, y no se restaura ni sobrescribe. La primera comprobación estricta lo detectó y falló; se mantuvo la línea base y se separó esa diferencia documental de los archivos financieros protegidos. No se oculta con una nueva captura.

`evidencias/compatibilidad_inicial.json` conserva hashes iniciales; `compatibilidad_final.json` registra todas las diferencias, la categoría documental y la comparación de motor. `pruebas_modulo.txt` conserva el resultado del runner. La excepción documental no permite cambios de fórmulas, SQL, código, plantillas, paquetes o tareas. No puede atribuirse a esta intervención la edición preexistente o concurrente de esos informes.

## Qué queda sin probar

No hay conexión real, consultas de cobertura ni replay de runs de MySQL. La conclusión verificable es que no se ha escrito información financiera y que el código/configuración/binario/plantillas auditados permanecen iguales; no se ha recalculado ni cotejado toda la historia de la base. No se ha inspeccionado el Excel de Inditex ausente. No hay calibración, backtest, causalidad o estimación de prima real. La prueba de un ajuste hipotético con signo no acredita que deba aplicarse a una empresa.
