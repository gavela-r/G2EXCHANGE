# Cobertura de partidas/KPI, DFN/EBITDA y desbloqueo de Taiwán — 05/11/2026

Intervención sobre la base local (`mysql_valoracion`, BD `2GB`, copia anterior a la de producción del 01/11).
Backup previo: `private_backups/g2-local-antes-cobertura-20261105.sql.gz` (privado, fuera de Git).
Ningún importe se ha inventado: solo se selecciona, suma o reconstruye lo que publica la fuente,
y cada regla queda trazada en `calidad`/`advertencias` o en `nivel_confianza`.

## 1. KPI DFN/EBITDA

`DEUDA_NETA_SOBRE_EBITDA` (veces) = (deuda CP + deuda LP − efectivo) / (EBIT + D&A).

- Solo con EBITDA > 0; una DFN negativa (caja neta) es válida.
- La deuda total exige **ambos** componentes (regla ya vigente en los recuperadores, ahora dentro de la fórmula).
- Persistido en `kpi_financiero_informe` (17.745 informes al recalcular), taxonomía `server/sql/25_kpi_dfn_ebitda.sql`.
- Screener: filtro, columna, orden y CSV (`dfnEbitda`). Ficha de empresa: fila "DFN / EBITDA".

## 2. Diagnóstico de cobertura: el problema era de conceptos, no (solo) de proveedores

`server/scripts/diagnosticar-normalizacion.cjs` pasa los anuales 2022–2025 por el normalizador real.
Cuando varios conceptos de origen estaban mapeados al mismo concepto estándar con importes distintos,
`normalizarPartidas` lanzaba `TAXONOMIA_AMBIGUA` y el informe entero quedaba inutilizable.

| País | Informes ambiguos antes | Después | Núcleo de valoración completo antes | Después |
|---|---:|---:|---:|---:|
| US | 3.457 | 0 | 3.657 | 4.820 |
| JP | 3.151 | 20 | 4.080 | 5.735 |
| TW | 394 | 1 | (datos FinMind erróneos, ver §3) | reconstruido |

Errores de mapeo comprobados y ahora excluidos (`server/src/valoracion/resolucionConceptos.ts`):
pasivo total (`Liabilities`) como deuda LP (1.236 informes FinMind); `UnearnedRevenue`, `CostOfSales` como ingresos;
`NonOperatingIncome` como EBIT; `IncomeBeforeIncomeTaxes` como impuesto; parte corriente de préstamos como deuda LP;
arrendamientos puros fuera de la deuda financiera.

Reglas de resolución: prioridad de agregados publicados (p. ej. `DepreciationDepletionAndAmortization` > `Depreciation`;
estado principal EDINET > `SummaryOfBusinessResults`), suma de líneas de balance disjuntas (deuda JGAAP, existencias JGAAP,
depreciación + amortización), `LongTermDebt` total − `LongTermDebtCurrent`. Una combinación sin regla contrastada **sigue bloqueando**.

KPI recalculados (`server/scripts/recalcular-kpi-normalizacion-v2.cjs`): 19.388 nuevos, 17.760 corregidos, 54.607 retirados
por no reproducibles (≈12.000 deudas calculadas con un solo componente).

## 3. Taiwán: tres defectos que bloqueaban todo el país

1. **Choque de tickers TW↔JP** (`instrumento.ticker` UNIQUE global): 299 empresas TW —incluida TSMC 2330— usaban el
   instrumento de Tokio con su precio e informes EDINET japoneses. Migración 12 aplicada (`UNIQUE(mercado_id,ticker)`);
   `server/scripts/reparar-identidad-tw.cjs`: 287 instrumentos devueltos a su empresa japonesa por código EDINET oficial,
   3 japonesas creadas con su nombre oficial, 9 sin identidad verificable desvinculadas (sin inventar); 1.405 informes EDINET
   reasignados; 241 instrumentos TWSE/TPEx creados y 35 corregidos de mercado; precio oficial TWSE/TPEx del 04/11/2026.
2. **"Anuales" FinMind con la cuenta de resultados del 4º trimestre aislado** (FinMind publica resultados trimestrales no
   acumulados) mezclada con flujos anuales y balance de cierre. Ej.: Hon Hai 2024 figuraba con 2,13 billones TWD de ingresos
   (real: 6,86). Los 3.306 informes antiguos quedan como `ANUAL_Q4_INVALIDO` (conservados, fuera del uso anual).
3. **Sin fecha de publicación**: el motor exige `fecha_publicacion <= fecha de valoración`; ningún informe TW podía usarse.
4. **Empresas fusionadas por pinyin**: `empresa` es única por (nombre, país) y el nombre TW se guardaba en pinyin sin tonos
   (欣興 3037 y 新興 2605 eran ambas "xin xing"). `server/scripts/separar-empresas-tw-pinyin.cjs`: 49 filas que agrupaban
   100 tickers separadas en 51 empresas nuevas "<pinyin> (<ticker>)", con 85 informes, versiones y evidencias movidos;
   las 2 valoraciones del día hechas sobre datos mezclados quedan en estado ERROR con su causa.

Reconstrucción (`server/scripts/importar-finmind-tw-anual.cjs`, reanudable, por capitalización): resultados = suma de los 4
trimestres; flujos = acumulado Q4; balance = cierre; acciones = capital social / nominal oficial; publicación = plazo legal
(art. 36: FY+1-03-31, cota superior sin información futura). Contrastes obligatorios por ejercicio: activo = pasivo + patrimonio
(±0,5 %), bruto = ingresos − coste (±1 %), BPA × acciones ≈ beneficio atribuible (±15 %). Deuda no presentada en un balance
completo = 0 marcado `CERO_NO_PRESENTADO_BALANCE_COMPLETO`. Verificado con TSMC 2024 (ingresos 2,894 billones, beneficio
atribuible 1,173, BPA 45,26) y Hon Hai 2024 (ingresos 6,86 billones, beneficio atribuible 152,7 mil M).

FinMind sin token admite ~300 peticiones/hora (3 por empresa): la cola completa (~1.430 empresas con precio) tarda horas.
Estado: `private_backups/tw-finmind-anual-checkpoint.json`. Con `FINMIND_TOKEN` en `.env` el script lo usa.
Licencia FinMind: el plan gratuito es para uso no comercial; un uso comercial requiere plan Sponsor Pro.

## 4. Clasificación y perfil de rating

- TW: código de industria oficial (產業別) de TWSE/TPEx → `server/scripts/clasificar-tw-oficial.cjs` (784 aceptadas).
- JP: sector oficial TSE-33 de la lista EDINET, con ticker y nombre oficial coincidentes → `server/scripts/clasificar-jp-tse33.cjs` (1.489 aceptadas).
- Categorías amplias o mixtas quedan PENDING; una PENDING nueva no oculta una ACCEPTED previa.
- Perfil de rating (umbral Damodaran 5.000 M USD) para JP/TW con tipos H.10 de la Reserva Federal (`tipo_cambio_referencia`,
  `server/sql/24_tipo_cambio_referencia.sql`, `server/scripts/cargar-tipos-cambio-h10.cjs`). Solo clasifica tamaño; no convierte estados.
- US: la clasificación SIC pendiente requiere `node server/scripts/clasificar-sec.cjs` con el contacto SEC del propietario.

## 5. Comandos

```powershell
node server/scripts/diagnosticar-normalizacion.cjs
node server/scripts/recalcular-kpi-normalizacion-v2.cjs --write
node server/scripts/reparar-identidad-tw.cjs ruta-fuentes --write
node server/scripts/importar-finmind-tw-anual.cjs ruta-fuentes --write
node server/scripts/clasificar-tw-oficial.cjs ruta-fuentes --write
node server/scripts/clasificar-jp-tse33.cjs ruta-fuentes --write
node server/scripts/cargar-tipos-cambio-h10.cjs
npm.cmd run valuation -- --mode incremental --write --directory server/resultados_valoraciones/barrido
```

`ruta-fuentes` contiene `twse_list.json` (t187ap03_L), `tpex_list.json` (mopsfin_t187ap03_O), `twse_close.json` (STOCK_DAY_ALL),
`tpex_close.json` (tpex_mainboard_daily_close_quotes) y `edinet/EdinetcodeDlInfo.csv`, todas descargas públicas sin clave.
