# G2EXCHANGE — motor de valoración v1.5, 100 % TypeScript

## CAMBIO IMPORTANTE RESPECTO A v1.4

**NO instalar ni ejecutar las carpetas `engine/` y `generator/` de v1.4, ni ningún `.py` o script LibreOffice.**
Esta versión ya contiene los componentes TypeScript para calcular el WACC y la valoración, generar Excel, PDF, JSON y ZIP en **Windows + Node.js**. NO se necesita Python ni LibreOffice.

**No hay migración SQL automática, ni carga automática a MySQL, ni borrados.**

## Qué copiar

Si ya copiasteis las carpetas v1.4, antes de usar v1.5:
1. Deteneos; **no ejecutéis nada de v1.4**.
2. Renombrad `valuation_engine` a `valuation_engine_v14_ARCHIVO` (sin borrar nada).
3. Copiad **esta carpeta completa** a `G2EXCHANGE/valuation_engine` al mismo nivel que `server`.
4. `server` y vuestra base de datos quedan intactos.

Árbol:

```text
G2EXCHANGE/
  server/                   <- código actual de la aplicación; NO sustituir
  valuation_engine/         <- copiar TODO lo que contiene este ZIP
    src/                   <- motor de cálculo, riesgos, integración y salida
      integracion/         <- lectura SELECT MySQL y persistencia OPT-IN
      reportes/            <- Excel/PDF TypeScript
    generator/             <- comprobador/copiador TS y 16 configuraciones
      sector_configs/      <- una configuración JSON por plantilla
    templates/             <- las 16 plantillas XLSX originales v1.4
    config/                <- política de riesgo DRAFT
    schema/                <- contratos JSON de entrada/salida
    sql/                   <- inspección SOLO LECTURA; migración comentada
    tests/                 <- pruebas Node TypeScript
    ejemplos/              <- datos ficticios para la prueba
    docs/                  <- guías, metodología y advertencias
    package.json
    tsconfig.json
```

## Arranque - una vez que la carpeta está copiada

Abrir **PowerShell** en `G2EXCHANGE/valuation_engine`:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd test
npm.cmd run templates:check
npm.cmd run demo
```

La prueba `demo` genera `salida_demo/G2_DEMO_....xlsx`, `.pdf`, `.json` y `.zip` usando una **empresa ficticia**, sin acceder a MySQL. Abrid primero el PDF y el JSON. Excel recalcula sus fórmulas heredadas cuando se abra con Excel, pero **los valores de salida generados por el motor TypeScript** están congelados en `14_MOTOR_TS`, `10_RESULTADO` y `11_OUTPUT_API`.

## Antes de valorar empresas reales

- `src/integracion/mysql_readonly.ts` es un **adaptador de lectura** que acepta la conexión de `server/conexion/bd.ts`; no ejecuta consultas hasta que la aplicación lo invoque.
- Requiere confirmación expresa de unidades de dinero/acciones (UNITS/MILLIONS), divisa, cambios de capital circulante no monetario (`changeNwcMillions`), elección de plantilla y fuentes verificables para las primas automáticas. Nunca inventa un NWC faltante.
- El adaptador exige un `valuation_run` existente en PREPARANDO. No crea runs ni snapshots automáticamente.
- `src/integracion/mysql_persist_optin.ts` es **escritura deshabilitada** por defecto. No llamar hasta revisar `sql/03_MIGRACION_OPCIONAL_REVISION.sql` y realizar prueba en entorno de pruebas con backup. No modifica valoraciones anteriores.
- Para bancos/aseguradoras/REIT se requieren datos adicionales auditados. Sin ellos el resultado aparece **BLOCKED/DATA_PENDING**, no un valor fabricado.
- Las reglas automáticas de iliquidez, tamaño y concentración son **DRAFT**. Generan informes en **REVIEW**, nunca una aprobación financiera automática.
- Eventos de noticias: se calculan solo para entradas explícitas y previamente verificadas con fuentes; este ZIP **no busca noticias en Internet**.

## Limitaciones honestas de la v1.5

El núcleo TS calcula por sí solo WACC, proyecciones y valoración sin ejecutar fórmulas Excel. Los modelos simplificados TS no son siempre idénticos a las fórmulas antiguas de las hojas `08_PROYECCIONES`/`09_VALORACION`: se conservan para referencia visual/contraste, mientras que `14_MOTOR_TS`, `10_RESULTADO`, `11_OUTPUT_API` y JSON son el resultado TS. Antes de producción, vuestra integración debe validar la equivalencia con la metodología elegida y una muestra de empresas reales. No se afirma que Excel/TypeScript puedan recalcular todas las fórmulas de los libros igual.

Seguridad: las contraseñas y claves API del `server.zip` proporcionado **NO se distribuyen** en este paquete. Si había claves incrustadas en el código del servidor, rotarlas antes de compartirlo.

Para instalación ilustrada ver `docs/MANUAL_INSTALACION_TYPESCRIPT_v1_5.pdf`.
