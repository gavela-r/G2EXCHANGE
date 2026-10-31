"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOLAPAMIENTOS = exports.VERSION = void 0;
exports.validarMetodo = validarMetodo;
exports.recalcularCapital = recalcularCapital;
exports.impactoDcf = impactoDcf;
exports.simularRun = simularRun;
exports.valorarConAprobados = valorarConAprobados;
const simulacion_1 = require("../../../valuation_engine/research/coste_capital/src/simulacion");
const fecha_1 = require("./fecha");
exports.VERSION = 'G2_CAPITAL_v2.0.0';
exports.SOLAPAMIENTOS = [
    ['TAMANO', 'LIQUIDEZ_BURSATIL'], ['ENDEUDAMIENTO', 'BETA_APALANCADA'], ['COBERTURA_INTERESES', 'SPREAD_CREDITICIO'],
    ['RIESGO_PAIS', 'ERP_TOTAL'], ['CAJA_EXCEDENTARIA', 'EQUITY_VALUE'], ['RIESGO_OPERATIVO', 'FCFF'], ['RIESGO_OPERATIVO', 'ESCENARIOS']
];
function validarMetodo(m, asOf, market) {
    for (const d of [asOf, m.inicio, m.fin, m.calibrado, m.fueraMuestra?.inicio])
        (0, fecha_1.fechaCivil)(d);
    if (!['LIQUIDEZ_BURSATIL', 'TAMANO_RESIDUAL'].includes(m.factor))
        throw Error('Factor fuera del alcance autorizado');
    if (!Array.isArray(m.componentesAprobados) || !m.componentesAprobados.length || m.componentesAprobados.some(c => !['KE', 'KD'].includes(c)))
        throw Error('Componente financiero de metodología no aprobado');
    if (m.estado !== 'APPROVED' || !m.aprobador || !m.fuente || !/^https:\/\//.test(m.fuente) || !/^[a-f0-9]{64}$/.test(m.evidenciaHash)
        || !m.formula || !m.universo?.length || !m.coeficientes || !Object.keys(m.coeficientes).length || !Object.values(m.coeficientes).every(Number.isFinite)
        || !m.fueraMuestra || m.fueraMuestra.n < 1 || !Number.isFinite(m.fueraMuestra.error) || m.fueraMuestra.error < 0
        || m.mercado !== market || m.fin > asOf || m.calibrado > asOf || m.inicio >= m.fin || m.fueraMuestra.inicio <= m.fin)
        throw Error('METODOLOGIA_NO_AUTORIZADA_O_NO_APLICABLE');
    if (m.factor === 'TAMANO_RESIDUAL' && !['LIQUIDEZ', 'RIESGO_OPERATIVO', 'ENDEUDAMIENTO', 'RENTABILIDAD', 'CALIDAD', 'MERCADO'].every(c => m.controles.includes(c)))
        throw Error('TAMAÑO_NO_RESIDUAL');
}
function recalcularCapital(b, ajustes, asOf, market) {
    const e = b.pesoPatrimonio, d = b.pesoDeuda, t = b.impuesto;
    if (![b.ke, b.kd, e, d, t].every(Number.isFinite) || b.ke < 0 || b.kd < 0 || [e, d, t].some(x => x < 0 || x > 1) || Math.abs(e + d - 1) > 1e-10)
        throw Error('Componentes base inválidos');
    let dk = 0, dd = 0;
    const exposures = new Set(), ids = new Set();
    for (const a of ajustes) {
        validarMetodo(a.metodo, asOf, market);
        if (!a.metodo.componentesAprobados.includes(a.componente))
            throw Error('COMPONENTE_NO_AUTORIZADO_POR_METODOLOGIA');
        (0, fecha_1.fechaCivil)(a.decision.fecha);
        if (!['KE', 'KD'].includes(a.componente) || a.factor !== a.metodo.factor || a.decision.estado !== 'APPROVED' || !a.decision.actor || a.decision.fecha > asOf || !a.evidencia.length || !a.exposiciones.length || ids.has(a.id))
            throw Error('Ajuste no aprobado o sin evidencia');
        if (a.incorporacion !== 'NO_INCORPORADO')
            throw Error('Incorporación parcial, total o desconocida impide prima incremental');
        if (['BANK', 'INSURANCE', 'REIT'].includes(b.familia) && a.componente !== 'KE')
            throw Error('NO_APLICABLE: modelo equity no utiliza Kd');
        for (const x of a.exposiciones) {
            if (exposures.has(x))
                throw Error('DOBLE_CONTABILIZACION');
            exposures.add(x);
        }
        ids.add(a.id);
        for (const [x, y] of exports.SOLAPAMIENTOS)
            if (exposures.has(x) && exposures.has(y)) {
                const residualSize = x === 'TAMANO' && y === 'LIQUIDEZ_BURSATIL' && ajustes.some(j => j.factor === 'TAMANO_RESIDUAL' && j.metodo.controles.includes('LIQUIDEZ'));
                if (!residualSize)
                    throw Error(`DOBLE_CONTABILIZACION_ECONOMICA:${x}:${y}`);
            }
        const delta = (0, simulacion_1.fraccion)(a.tasa);
        if (delta < 0 && (!a.referencia || a.referencia.componente !== a.componente || !a.exposiciones.includes(a.referencia.riesgo) || !a.referencia.evidencia || a.referencia.primaIncluida <= 0 || -delta > a.referencia.primaIncluida || a.referencia.primaIncluida > (a.componente === 'KE' ? b.ke : b.kd)))
            throw Error('Reducción sin riesgo incluido en referencia coherente');
        if (delta < 0 && !b.primasReferencia?.some(r => r.riesgo === a.referencia.riesgo && r.componente === a.componente && r.tasa === a.referencia.primaIncluida && r.evidencia === a.referencia.evidencia))
            throw Error('CAPM_BASE_SIN_PRIMA_REFERENCIA_CONCILIADA: no restar una prima que la base no contiene');
        if (a.componente === 'KE')
            dk += delta;
        else
            dd += delta;
    }
    if (b.ke + dk < 0 || b.kd + dd < 0)
        throw Error('Coste ajustado negativo');
    const base = b.ke * e + b.kd * (1 - t) * d, adjusted = (b.ke + dk) * e + (b.kd + dd) * (1 - t) * d;
    return { version: exports.VERSION, pesoPatrimonio: e, pesoDeuda: d, impuesto: t, keBase: b.ke, kdBase: b.kd, waccBase: base, keAjustado: b.ke + dk, kdAjustado: b.kd + dd, waccAjustado: ajustes.length ? adjusted : base,
        ajustesAprobados: ajustes, deltaWacc: ajustes.length ? adjusted - base : 0, familia: b.familia, waccAplicable: !['BANK', 'INSURANCE', 'REIT'].includes(b.familia) };
}
/** Redescuenta los mismos flujos y la misma caja terminal de una ejecución congelada. No reproyecta. */
function impactoDcf(original, input, waccNuevo, keNuevo) {
    if (original.fair_value == null || original.terminal_growth == null)
        return { estado: 'NO_ESTIMABLE', motivo: 'Escenario original bloqueado o sin datos terminales', original, ajustado: null };
    const g = original.terminal_growth, equityFamily = ['13', '14', '15'].includes(input.template_code);
    const originalWacc = input._waccOriginal;
    const rate0 = equityFamily ? originalWacc.ke + originalWacc.prima_total : original.wacc, rate1 = equityFamily ? keNuevo : waccNuevo;
    if (!Number.isFinite(rate0) || !Number.isFinite(rate1) || rate0 <= g || rate1 <= g)
        throw Error('TASA_TERMINAL_INVALIDA: tasa debe superar crecimiento perpetuo');
    if (rate0 === rate1)
        return { estado: 'CALCULADO', original, ajustado: { ...original }, diferenciaAbsoluta: 0, diferenciaPorcentual: 0 };
    let ev = null, eq, fair;
    if (equityFamily) {
        fair = original.fair_value * (rate0 - g) / (rate1 - g);
        eq = original.valor_patrimonio_millones == null ? NaN : original.valor_patrimonio_millones * (rate0 - g) / (rate1 - g);
    }
    else {
        const flows = original.proyeccion_fcff;
        if (!Array.isArray(flows) || flows.length !== 5 || !flows.every(Number.isFinite) || !Number.isFinite(original.valor_empresa_millones) || !Number.isFinite(original.valor_patrimonio_millones))
            throw Error('Flujos congelados incompletos');
        const convention = input.valuation_timing?.discount_convention ?? input.discount_convention ?? 'END_YEAR';
        const mid = convention === 'MID_YEAR';
        const pv = (rate) => flows.reduce((s, f, i) => s + f / (1 + rate) ** (i + 1 - (mid ? .5 : 0)), 0);
        const terminalCash = (original.valor_empresa_millones - pv(rate0)) * (1 + rate0) ** 5 * (rate0 - g);
        ev = pv(rate1) + terminalCash / (rate1 - g) / (1 + rate1) ** 5;
        eq = original.valor_patrimonio_millones + ev - original.valor_empresa_millones;
        const shares = originalWacc.equity_market_value_millions / input.price_per_share;
        if (!Number.isFinite(shares) || shares <= 0)
            throw Error('Acciones congeladas no conciliables con ejecución');
        fair = Math.max(0, eq) / shares;
    }
    if (!Number.isFinite(fair) || !Number.isFinite(eq))
        throw Error('Impacto no finito');
    const marginFactor = original.fair_value > 0 && Number.isFinite(original.max_buy_price) ? original.max_buy_price / original.fair_value : null;
    return { estado: 'CALCULADO', original, ajustado: { ...original, wacc: equityFamily ? original.wacc : waccNuevo, valor_empresa_millones: ev, valor_patrimonio_millones: eq, fair_value: fair,
            max_buy_price: marginFactor == null ? null : fair * marginFactor, upside: input.price_per_share > 0 ? fair / input.price_per_share - 1 : null, decision: 'REVIEW',
            terminal_value_weight: null, terminal_value_warning: 'SIMULACION: revisar concentración en valor terminal; no trasladar automáticamente el diagnóstico histórico' },
        diferenciaAbsoluta: fair - original.fair_value, diferenciaPorcentual: original.fair_value !== 0 ? fair / original.fair_value - 1 : null,
        evidencia: 'Flujos y numerador terminal congelados; exclusivamente cambia tasa de descuento' };
}
function simularRun(input, output, deltaKeBps = 0, deltaKdBps = 0) {
    if (![deltaKeBps, deltaKdBps].every(Number.isFinite))
        throw Error('Hipótesis no numérica');
    const family = { '13': 'BANK', '14': 'INSURANCE', '15': 'REIT' }[input.template_code] ?? 'FCFF';
    if (family !== 'FCFF' && deltaKdBps !== 0)
        throw Error('Kd no aplicable a esta familia');
    return { version: exports.VERSION, uso: 'MANUAL_HIPOTESIS_NO_ES_PRIMA', aplicableProduccion: false, runOriginal: input.valuation_run_id, empresaNombre: input.company_name, fechaValoracion: input.valuation_date, plantilla: input.template_code,
        escenarios: output.wacc_scenarios.map((w) => {
            const b = { ke: w.ke, kd: w.kd, pesoPatrimonio: w.peso_patrimonio, pesoDeuda: w.peso_deuda, impuesto: input.tax_rate, familia: family };
            const rates = recalcularCapital(b, [], input.valuation_date, input.market);
            const ke = w.ke + deltaKeBps / 10000, kd = w.kd + deltaKdBps / 10000;
            if (ke < 0 || kd < 0)
                throw Error('Hipótesis genera coste negativo');
            const adjusted = ke * b.pesoPatrimonio + kd * (1 - b.impuesto) * b.pesoDeuda;
            const v = output.valuations.find((x) => x.escenario === w.escenario);
            return { escenario: w.escenario, ...rates, waccHistorico: w.wacc_adjusted ?? w.wacc_ajustado ?? v.wacc, keAjustado: ke, kdAjustado: kd, waccAjustado: adjusted,
                ajustesPropuestos: [{ factor: 'LIQUIDEZ_BURSATIL', estado: 'NO_ESTIMABLE', valor: null }, { factor: 'TAMANO_RESIDUAL', estado: 'NO_ESTIMABLE', valor: null }],
                hipotesis: { keBps: deltaKeBps, kdBps: deltaKdBps }, impacto: impactoDcf(v, { ...input, _waccOriginal: w }, adjusted, ke) };
        }) };
}
function valorarConAprobados(input, output, ajustes) {
    const family = { '13': 'BANK', '14': 'INSURANCE', '15': 'REIT' }[input.template_code] ?? 'FCFF';
    return { version: exports.VERSION, uso: 'SOLO_AJUSTES_APROBADOS', runOriginal: input.valuation_run_id, empresaNombre: input.company_name, fechaValoracion: input.valuation_date, plantilla: input.template_code,
        escenarios: output.wacc_scenarios.map((w) => {
            const reference = input.cost_of_capital_reference?.[w.escenario];
            const ledger = reference?.status === 'RECONCILED' && reference.ke === w.ke && reference.kd === w.kd && reference.date <= input.valuation_date && reference.evidenceHash ? reference.includedPremiums : [];
            const rates = recalcularCapital({ ke: w.ke, kd: w.kd, pesoPatrimonio: w.peso_patrimonio, pesoDeuda: w.peso_deuda, impuesto: input.tax_rate, familia: family, primasReferencia: ledger }, ajustes, input.valuation_date, input.market);
            const v = output.valuations.find((x) => x.escenario === w.escenario);
            return { escenario: w.escenario, ...rates, waccHistorico: w.wacc_ajustado, impacto: impactoDcf(v, { ...input, _waccOriginal: w }, rates.waccAjustado, rates.keAjustado) };
        }) };
}
//# sourceMappingURL=finanzas.js.map