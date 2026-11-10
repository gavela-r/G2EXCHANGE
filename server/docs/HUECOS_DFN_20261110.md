# Huecos en partidas y KPI DFN/EBITDA — 10/11/2026

Base local `mysql_valoracion` (BD `2GB`). Alcance: informes `ANUAL` con cierre 2022–2025.
Diagnóstico reproducible (solo lectura): `node server/scripts/diagnosticar-huecos-dfn.cjs [--pais US|JP|TW] [--json salida.json]`.
Backup previo de KPI: `private_backups/kpi-antes-nomenclatura-20261110.sql` (privado, fuera de Git).

## 1. Campos vacíos

`partida_contable_valor` (2,35 M filas) y `kpi_financiero_informe` (611 k filas) no tienen ningún campo NULL
(informe, concepto, concepto estándar, importe, confianza / kpi, unidad, valor, confianza). El hueco real son
**partidas que no existen** para un informe y, por tanto, **KPI que no se pueden calcular**.

## 2. Por qué falta DFN/EBITDA

DFN/EBITDA = (deuda CP + deuda LP − efectivo) / (EBIT + D&A), solo con EBITDA > 0 y ambos componentes de deuda.
Cada informe sin el KPI se clasifica con el normalizador y la fórmula reales:

| Causa | Significado |
|---|---|
| `SINTETICO_NO_PERSISTIDO` | Las partidas permiten calcularlo pero no está guardado (fallo sintético) |
| `MAPEO_DESCARTADO:<k>` | La partida existe pero la resolución la descarta (nomenclatura/mapeo) |
| `AUSENTE:<k>` | El concepto no está en PCV para ese informe |
| `EBITDA_NO_POSITIVO` | Entradas completas, EBITDA ≤ 0: exclusión válida |
| `AMBIGUO` | Combinación de conceptos sin regla contrastada |

**Fallos sintéticos: 0.** Ningún informe tenía las entradas sin el KPI, y ningún KPI guardado era irreproducible.

## 3. Fallos de nomenclatura corregidos

1. **D&A de EE. UU.** `DepreciationAmortizationAndAccretionNet` (agregado US-GAAP del estado de flujos en
   eléctricas y energía) figuraba como agregado preferido en la resolución, pero el filtro genérico del motor lo
   rechazaba por contener "accretion". Al elegirse antes que `Depreciation`, el informe se quedaba sin D&A.
   Ahora se acepta ese nombre exacto (incluye la acreción de obligaciones de retiro, cargo operativo no monetario)
   y queda trazado como `AGREGADO_SEC_INCLUYE_ACRECION`. `AccretionExpense` sola sigue rechazada.
   (`server/src/valoracion/datos.ts`)
2. **Partes corrientes mapeadas como deuda LP** (`CurrentPortionOfLongTermLoansPayable`, `CurrentPortionOfBonds`,
   `ShortTermBondsPayable`, `LongTermDebtCurrent`…): se descartaban. Ahora se reclasifican a deuda CP salvo que esa
   misma línea ya figure en CP (sin doble cómputo). (`server/src/valoracion/resolucionConceptos.ts`)

Recálculo (`recalcular-kpi-normalizacion-v2.cjs --write`): 845 KPI nuevos (348 EBITDA, 328 margen EBITDA,
169 DFN/EBITDA), 50 actualizados (10 deudas JP completadas con su parte corriente), 0 eliminados.

## 4. Cobertura DFN/EBITDA

| País | Antes | Después | Empresas con DFN |
|---|---:|---:|---:|
| US | 3.890 / 13.800 (28,2 %) | 3.999 / 13.800 (29,0 %) | 1.342 → 1.372 |
| JP | 5.969 / 9.013 (66,2 %) | 5.969 / 9.013 (66,2 %) | 2.064 |
| TW | 1.061 / 1.161 (91,4 %) | sube con la importación en curso (§5) | 280 → 282 |

Causas restantes:

- **US**: deuda CP ausente en 5.132 informes, LP en 4.099, EBIT en 3.013, EBITDA ≤ 0 en 1.641. El único concepto
  US-GAAP de EBIT es `OperatingIncomeLoss`; bancos, aseguradoras y REIT no lo publican (DFN/EBITDA no aplica).
  Las deudas ausentes no se pueden distinguir entre "sin deuda" y "deuda con otro nombre" sin volver a la fuente:
  requiere descargar `companyfacts`/`submissions` de la SEC, que exige `SEC_USER_AGENT` con un contacto del
  propietario (pendiente). Sin él la mayoría de empresas US quedan además con sector `N/A`.
- **Arrendamientos financieros** (`FinanceLeaseLiability*`, 787 CP / 526 LP en US; `LeaseObligations*` en JP)
  siguen fuera de la deuda financiera por política vigente. Incluirlos es una decisión de criterio, no un error.
- **JP**: la deuda LP ausente corresponde sobre todo a empresas sin préstamos a largo plazo en el balance.
- **TW**: los 52 informes sin EBIT son holdings financieros (金控, 28xx/5880): no aplica.

## 5. Taiwán: importación reanudada

`importar-finmind-tw-anual.cjs` (checkpoint `private_backups/tw-finmind-anual-checkpoint.json`) estaba en 319 de
1.430 empresas: la sesión anterior se cerró, no hubo bloqueos de cuota. Mejoras:

- Caché de respuestas en `private_backups/finmind-tw-cache`: un corte no repite peticiones ya hechas.
- Ante 402/429 espera creciente (15, 30, 45, 60 min) en vez de reintentar cada 10 min.
- Parada limpia creando `private_backups/tw-finmind-anual.stop`.
- Se lanza como proceso independiente (no depende de la sesión):

```powershell
Start-Process cmd.exe -ArgumentList '/c','node server/scripts/importar-finmind-tw-anual.cjs private_backups/fuentes-tw-20261110 --write >> private_backups\tw-finmind-anual.log 2>&1' -WindowStyle Hidden
```

Ritmo sin token: 12,5 s por petición (~288/h, bajo el límite de 300/h), 3 peticiones por empresa → ~95 empresas/h.
Con `FINMIND_TOKEN` en `.env` el límite es mayor y se puede reducir `FINMIND_TW_SPACING_MS`.
Al terminar: `recalcular-kpi-normalizacion-v2.cjs --write --pais TW` no es necesario (el importador ya calcula los KPI),
pero sí relanzar la valoración incremental.

## 6. Deuda total publicada (US) y fondo de maniobra — segunda intervención 10/11

**Causa de los huecos de deuda US** (`node server/scripts/diagnosticar-deuda-us.cjs`): no es de proveedor (todo viene
del XBRL de la SEC). De 5.919 anuales sin deuda CP, 2.576 publican gasto por intereses: la deuda existe pero se publica
en **una sola línea total** (balances sin clasificar: aseguradoras, REIT, U-Haul...), y la fórmula exigía CP y LP.
2.174 no tienen ninguna evidencia de deuda (probablemente sin deuda; confirmarlo requiere la SEC).

- **Regla `AGREGADO_SEC_CORRIENTE_Y_NO_CORRIENTE`** (`datos.ts`, solo `SEC_EDGAR`): si la única línea de deuda es un
  agregado US-GAAP definido como corriente + no corriente (`LongTermDebt`, `NotesPayable`, `SeniorNotes`,
  `ConvertibleNotesPayable`, `SecuredDebt`, `UnsecuredDebt`, `LongTermLoansPayable`, `LongTermNotesPayable`,
  `DebtLongtermAndShorttermCombinedAmount`) y no hay ninguna línea de deuda corriente, ese importe es la deuda total.
  No se supone cero en el CP. KPI de deuda con confianza MEDIA. La valoración (`gross_debt_fy0`) también lo usa.
- **Doble cómputo corregido**: `LongTermDebt` como única línea LP con `LongTermDebtCurrent` en CP sumaba la parte
  corriente dos veces; ahora se resta (152 informes).
- Recálculo: 10.321 KPI nuevos (2.446 deudas totales, 622 DFN/EBITDA), 661 actualizados, 0 eliminados.

**Fondo de maniobra** = activo corriente total − pasivo corriente total (no depende del desglose de la deuda).
Taxonomía `server/sql/26_fondo_maniobra.sql` (`ACTIVOS_CORRIENTES`, `PASIVOS_CORRIENTES`, `FONDO_MANIOBRA`), mismos
nombres que el módulo de capital. Se muestra en el histórico de la ficha.

- TW: el importador ya guarda `CurrentAssets`/`CurrentLiabilities`; `server/scripts/completar-corrientes-tw.cjs`
  rellena los anuales ya importados (caché sin cuota; `--fetch` pide solo el balance). Encadenado tras la importación.
- JP: EDINET publica los totales, pero hay que volver a extraerlos (la PCV solo guardó conceptos mapeados).
- US: `AssetsCurrent`/`LiabilitiesCurrent` requieren descargar de la SEC (pendiente de contacto).

| País | Empresas con DFN/EBITDA | Núcleo valoración | Fundamentales | 100 % |
|---|---:|---:|---:|---:|
| US | 1.342 → 1.476 | 1.341 → 1.472 | 304 | 125 |
| JP | 2.064 | 1.969 | 1.496 | 1.265 |
| TW (importación en curso) | 280 → 441 | 438 | 387 | 380 |

`node server/scripts/cobertura-empresas.cjs` mide las tres últimas columnas (deuda total por componentes o agregado).
En US el 100 % sigue bajo porque exige los 18 KPI: capital circulante operativo (sin existencias en bancos/servicios)
y cobertura de intereses no aplican a muchas empresas.