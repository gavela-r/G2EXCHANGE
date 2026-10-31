# Estado individual de los 16 modelos sectoriales

Leyenda de estados:
- **IMPLEMENTADO Y PROBADO**: la parte técnica está terminada y verificada con expedientes QA sintéticos completos que recorren la ruta exacta de la API. Esto **no es una aprobación financiera**.
- **BLOQUEADO POR DATOS**: hoy ninguna empresa real de MySQL aporta los datos acreditados que exige el modelo.
- **PENDIENTE DE REVISIÓN FINANCIERA**: la metodología no la ha revisado ningún analista con una empresa real.

Todos los modelos comparten la misma base: cuatro históricos y cinco proyecciones con calendario fiscal real (incluido un primer período parcial desde la fecha de valoración), cohortes de activos con eventos dentro del año (altas con pago diferido, anticipos, bajas, deterioros, revisiones de vida), NWC conciliado, fiscalidad devengada frente a pagada, ledger de otras partidas, tesorería obtenida de los flujos (nunca como partida de ajuste), tres escenarios y paridad Excel/TS nodo a nodo. La columna "Drivers" lista los que la prueba `transmision_sectorial.test.mjs` perturba uno a uno. En todos ellos se comprueba que el cambio llega a los estados y al valor por acción, salvo las exenciones (*) que se justifican al pie.

| # | Modelo | Familia / método | Mecanismo propio | Drivers sectoriales | Técnico | Datos reales |
|---|---|---|---|---|---|---|
| 01 | Defensa y aeroespacial | FCFF | Cartera (backlog) + contratos nuevos → reconocimiento; activos/pasivos contractuales | bookings, recognition | Implementado y probado | Bloqueado por datos |
| 02 | Software y SaaS | FCFF | ARR con churn/expansión y fracción fiscal; ingreso por ARR medio; pasivos contractuales (diferidos); software capitalizado vía cohortes INTANGIBLE | churn, expansion, newArr | Implementado y probado | Bloqueado por datos |
| 03 | Semiconductores y hardware | FCFF | Capacidad × utilización × ASP; fábricas y equipos como cohortes PPE con vidas cortas | capacity, utilization, asp | Implementado y probado | Bloqueado por datos (AMD: conflictos y calendario 52/53 semanas) |
| 04 | Industria y fabricación | FCFF | **Nuevo**: equipo nuevo (volumen × precio) + posventa sobre base instalada (altas = unidades, retiros por tasa) | volume, price, aftermarketPerUnit, retirementRate | Implementado y probado | Bloqueado por datos |
| 05 | Automoción y componentes | FCFF | **Nuevo**: producción del mercado servido × cuota × contenido por vehículo × factor acumulado de reducciones de precio contractuales | vehicleProduction, share, contentPerVehicle, priceDown | Implementado y probado | Bloqueado por datos (Toyota: faltan ingresos, CapEx, NWC, cohortes) |
| 06 | Retail | FCFF | Tiendas (aperturas, cierres, rampa) × ventas comparables; inventario por DIO | openings, closures, sameStoreGrowth, firstYearRamp | Implementado y probado | Bloqueado por datos |
| 07 | Consumo básico | FCFF | **Nuevo**: base de ingresos acreditada × (1+volumen orgánico) × (1+precio/mix), anualizada y prorrateada por fracción fiscal | volumeGrowth, priceMix | Implementado y probado | Bloqueado por datos |
| 08 | Petróleo y gas | FCFF, horizonte finito | Producción limitada por reservas; agotamiento por unidades de producción (cohortes AGOTABLE); liquidación explícita | production, price, reserveAdditions* | Implementado y probado | Bloqueado por datos |
| 09 | Minería y materiales | FCFF, horizonte finito | Igual que 08 + ley × recuperación | production, price, reserveAdditions*, gradeRecovery | Implementado y probado | Bloqueado por datos |
| 10 | Utilities e infraestructura | FCFF | RAB × retorno permitido + depreciación y opex regulados; **nuevo**: la inversión admitida en RAB no puede superar las altas reconocidas (bloquea si se supera) | allowedReturn, regulatoryDepreciation, allowedOpex, eligibleInvestment, unregulatedRevenue | Implementado y probado | Bloqueado por datos |
| 11 | Telecomunicaciones | FCFF | Abonados medios × ARPU mensual; red (PPE) y espectro (INTANGIBLE o NO_DEPRECIABLE) como cohortes | netAdds, arpu | Implementado y probado | Bloqueado por datos |
| 12 | Farma y biotecnología | FCFF | Ventas comercializadas + pipeline ponderado por probabilidad; **nuevo**: I+D como gasto explícito, no proporcional a ventas (el desarrollo capitalizado va como cohorte INTANGIBLE) | marketedSales, pipelineGrossSales, pipelineProbability, rdExpense | Implementado y probado | Bloqueado por datos |
| 13 | Banca | FCFE con capital regulatorio, Ke | Préstamos/depósitos/ECL; RWA × objetivo CET1 + deducciones; FCFE = beneficio − Δcapital requerido; **nuevo**: RWA de otros activos y rendimiento de tesorería; ponderaciones > 100 % admitidas | 17 drivers (payout*, equityIssue*) | Implementado y probado | **Bloqueado por datos: la taxonomía no tiene conceptos prudenciales** |
| 14 | Seguros | FCFE con capital de solvencia, Ke | Rollforward agregado del pasivo por contratos; rendimiento de inversiones; **nuevo**: rendimiento del float en tesorería | 15 drivers (payout*, equityIssue*) | Implementado y probado; **no es IFRS 17 completo** | **Bloqueado por datos: sin conceptos de inversiones ni de pasivos de seguros** |
| 15 | Inmobiliario y REIT | AFFO descontado a Ke + NAV separado | Superficie × renta × ocupación; NOI; AFFO sin plusvalías; NAV con tasación externa | area, rent, occupancy, appraisal* | Implementado y probado | Bloqueado por datos |
| 16 | General no financiero | FCFF | Volumen × precio | volume, price | Implementado y probado | Bloqueado por datos |

(*) Exenciones metodológicas, sin efecto en el valor por diseño:
- 08/09 `reserveAdditions`: con horizonte finito y liquidación explícita, las reservas sólo limitan la producción. Si la producción las supera, se bloquea.
- 13/14 `payout` y `equityIssue`: el valor es el capital distribuible por encima del requerido. El payout sólo fija el dividendo efectivo, y una aportación de capital no crea valor.
- 15 `appraisal`: alimenta el NAV, no el AFFO descontado.

## Limitaciones conocidas (documentadas, sin coeficientes inventados)

1. **Semiconductores (03)**: la capacidad es un driver independiente del CapEx de fábricas. La coherencia entre capacidad y cohortes PPE la acredita el analista y el motor no la verifica.
2. **Telecomunicaciones (11)**: no hay modelo de renovación de licencias de espectro. Se declaran como cohortes con su vida o como no depreciables.
3. **Seguros (14)**: rollforward agregado. Sin CSM, ajuste de riesgo ni separación LRC/LIC: no equivale a IFRS 17.
4. **Banca (13)**: RWA simplificado (préstamos netos + otros activos con su ponderación). No modela riesgo operacional ni de mercado.
5. **REIT (15)**: activos a coste en el rollforward contable; el valor razonable sólo entra en el NAV.
6. **Primas de riesgo**: no están calibradas. Se muestran como `NO_ESTIMABLE` con ajuste operativo 0 (módulo Capital vigente, sin cambios).
7. **Impuesto operativo de caja** (`tax.operatingPaid`): es una hipótesis explícita. No se deduce del gasto por impuestos.

## Evidencia por sector

- Identidades independientes (balance, caja, roll-forward del inmovilizado, CapEx→CFI, EBITDA/EBIT, NWC, impuesto pagado = corriente + Δactivo − Δpasivo, VP, Gordon, EV→equity, CAPM, WACC): `qa_api_final/qa_api_16_ts.json` y `qa_api_final_eventos/qa_api_16_ts.json`.
- Transmisión de drivers: `evidencias/transmision_sectorial.json`.
- Excel nativo con el motor final: `qa_api_final/qa_api_16.json` (por sector: hash del motor, de entradas y de resultado, sha256 del XLSX y número de comprobaciones de fórmulas).
