# Acta técnica de comprobaciones v1.5 (código TS)

1. Se compiló el código TypeScript con `tsc -p tsconfig.json` sin errores.
2. Se ejecutaron pruebas Node sin base de datos: 9 pruebas satisfactorias (CAPM, WACC, unidades, 16 configuraciones sectoriales, bloqueos, salida PDF y Excel).
3. Se verificó que las 16 plantillas existentes contienen las hojas críticas y pueden cargarse con la librería xlsx.
4. Se generaron resultados DEMO con **empresa inventada**: JSON, Excel (14_MOTOR_TS), PDF y ZIP.
5. Los PDF son archivos PDF 1.4 válidos. Los ZIP no contienen servidor original, credenciales ni claves.

**Alcance:** estas son pruebas de componentes en entorno aislado, no pruebas de integración con la base real del usuario ni homologación económica de la política DRAFT. Además, no se ha verificado la equivalencia de todas las fórmulas Excel v1.4 con la nueva lógica TS. Excel 08/09 permanece como referencia histórica, no debe interpretarse como fuente autoritativa de valor si difiere de TS.

**Pruebas pendientes antes de producción:** comprobar saldo de deuda financiera y unidades; corregir el flujo NWC desde fuentes auditadas; mapping real de cada empresa a una de las 16 plantillas; datos bancarios/REIT especializados; trazabilidad de prima riesgo auto; test aislado de lectura MySQL con RUN PREPARANDO; prueba de esquema `valuation_run_parametros` y simulación de rollback si se va a habilitar escritura; comparar valoraciones ante casos de referencia validados financieramente; proteger beta/ERP históricos.
