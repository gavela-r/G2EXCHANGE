# Primas de riesgo (liquidez y tamaño)

## Estado

| Componente | Estado | Evidencia |
|---|---|---|
| CAPM / Ke / Kd / WACC | COMPLETADO Y VERIFICADO | Identidades CAPM y WACC en los 16 sectores (`sectorial/app/tests/qa_fixtures.mjs`); Excel nativo: Ke/WACC reaccionan a las hipótesis (16/16) |
| Diagnóstico automático de primas (`server/src/capital/primas.ts`: LIQUIDEZ_BURSATIL, TAMANO_RESIDUAL) | IMPLEMENTADO (Codex) y conectado a cada escenario (`GET /runs/{id}/capital`) | `valuation_engine/research/coste_capital/docs/18_PRIMAS_AUTOMATICAS_RESULTADOS.md` |
| Calibración empírica | **PENDIENTE DE CALIBRACIÓN** | El registro de metodologías tiene 0 métodos y 0 aprobados. No hay coeficientes autorizados |
| Ajuste operativo | 0 con estado `NO_ESTIMABLE` (no es una estimación de riesgo cero) | `estadoFinanciero` en cada factor |
| Aprobación y ajuste bidireccional | IMPLEMENTADO (Codex): `primasConAprobados`; sólo aplica ajustes autorizados | `server/tests/capitalPrimas.test.cjs` |
| Simulación de impacto (riesgo → prima → Ke/WACC → 3 escenarios → valor) | COMPLETADO Y VERIFICADO | `POST /runs/{id}/premium-simulation`; pruebas `api_mock.test.cjs`: +1 % ⇒ ΔKe = +1 pp exacto y menor valor; −0,5 % ⇒ mayor valor; banca por Ke |
| Concentración de clientes | PENDIENTE DE DESARROLLO | — |

## Por qué no hay prima calibrada

Una prima defendible exige una regresión de rentabilidades o de costes de capital implícitos sobre medidas de liquidez (Amihud, rotación, horquilla) y de tamaño (capitalización, EV, activos, ingresos), por país y sector. Además requiere control de beta para no contar dos veces el mismo riesgo, validación fuera de muestra, error estándar e intervalo. El registro debe recoger fuente, período, muestra, variables, coeficientes, error, intervalo, fecha y versión. En esta sesión no había una muestra histórica con licencia adecuada ni precios ajustados completos para los tres países, así que no se ha calibrado nada. Los coeficientes no se inventan ni se fijan primas arbitrarias.

## Cómo se aplicará cuando exista calibración

1. Registrar la metodología (con su ventana fuera de muestra) en el registro de Capital.
2. Aprobarla mediante el flujo de aprobaciones de Capital.
3. `calcularPrimasAutomaticas` devolverá `estadoFinanciero` POSITIVO / NEGATIVO / CERO con intervalo, y `primasConAprobados` aplicará sólo lo aprobado sobre Ke (banca, seguros y REIT descuentan con Ke; FCFF, vía WACC).

## Simulación (no aprobada)

`POST /runs/{id}/premium-simulation` con `{factor, premium, reason}` suma la prima a Ke mediante Rf en los tres escenarios (Ke = Rf + β·ERP es aditiva; Kd no cambia). Devuelve Ke, WACC, tasa y valor por acción, base y simulados, con `status: SIMULACION_NO_APROBADA`, `approved: false` y `persisted: false`. No modifica la ejecución guardada (la prueba compara `resultHash`).
