# Transición v1.4 Python -> v1.5 TypeScript

V1.4 Python NO se debe ejecutar. V1.5 tiene cero archivos Python y no requiere LibreOffice.

Archivo central: `src/modelo.ts` calcula las 3 valoraciones; `src/wacc.ts` calcula el CAPM / WACC; `src/riesgo.ts` las primas automáticas DRAFT y manuales; `src/noticias.ts` aplica noticias previamente aprobadas; `src/reportes/` genera reportes; `src/cli.ts` arranca el caso JSON.

`generator/check_templates.ts` revisa los 16 .xlsx y, con --out, copia versiones verificadas sin alterar los originales. Los 16 libros siguen basados en v1.4; su cálculo heredado puede diferir del motor TS: la salida validada TS aparece en hoja 14, 10 y 11, además del JSON y PDF.

**Cambios financieros**: EBITDA/FCFF ratios por sector, CAPM ERP Total incluido riesgo país, beta sin dividir, E capitalización bursátil, D deuda con coste, Kd por rating 3 escenarios, impuestos sobre Kd, primas adicionales en pp, casos BANK/INSURANCE/REIT no tratados como FCFF estándar.

**No incluido aún en primera integración**: importador universal de noticias de APIs; conversión FX heterogénea; auditoría de políticas automáticas; equivalencia de todas las fórmulas heredadas Excel con TS; persistencia automática a `valuation_run_resultado`; validación completa con DB real y muestras cotizadas; versiones históricas de `coste_capital_referencia` previas al primer snapshot congelado.
