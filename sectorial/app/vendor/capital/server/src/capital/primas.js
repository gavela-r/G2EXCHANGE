"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FACTORES = exports.VERSION_PRIMAS = void 0;
exports.calcularPrimasAutomaticas = calcularPrimasAutomaticas;
exports.primasConAprobados = primasConAprobados;
const finanzas_1 = require("./finanzas");
const simulacion_1 = require("../../../valuation_engine/research/coste_capital/src/simulacion");
const fecha_1 = require("./fecha");
exports.VERSION_PRIMAS = 'PRIMAS_AUTOMATICAS_1';
exports.FACTORES = ['LIQUIDEZ_BURSATIL', 'TAMANO_RESIDUAL'];
const pendientes = (factor, motivo) => ({ factor, primaCalculada: null, ajusteOperativo: 0, unidad: 'FRACCION_ANUAL',
    estadoFinanciero: 'NO_ESTIMABLE', estadoAplicacion: 'BLOQUEADO', componente: 'KE', formula: null, fuenteCoeficientes: null, metodologiaId: null, motivo, evidencia: [] });
function calcularPrimasAutomaticas(d, metodos, base) {
    const primas = exports.FACTORES.map(factor => {
        const result = pendientes(factor, 'No existe metodología calibrada, validada y aprobada aplicable. El 0 operativo no estima el riesgo.');
        if (d.bloqueo) {
            result.motivo = 'Identidad bloqueada: ' + d.bloqueo;
            return result;
        }
        if (!d.empresa.clasificacionResuelta || d.empresa.familia === 'INDETERMINADA') {
            result.motivo = 'Clasificación o familia sin resolver; no extrapolar calibraciones.';
            return result;
        }
        const incorporated = (d.incorporaciones ?? []).filter((i) => i.riesgo === (factor === 'TAMANO_RESIDUAL' ? 'TAMANO' : factor));
        if (incorporated.length) {
            result.motivo = 'Exposición ya incorporada o sin residual incremental conciliado.';
            if (incorporated.every((i) => i.cobertura === 'TOTAL')) {
                result.estadoFinanciero = 'YA_INCORPORADO';
                result.estadoAplicacion = 'SIN_AJUSTE';
            }
            return result;
        }
        const approved = metodos.filter(m => m.factor === factor && m.estado === 'APPROVED' && m.mercado === d.empresa.codigo_iso && m.universo?.includes(String(d.empresa.id)));
        if (!approved.length) {
            const inputs = factor === 'LIQUIDEZ_BURSATIL' ? ' Requiere precios ajustados, importe monetario y calendario completos; un ratio de caja no sustituye ese riesgo.' : ` Capitalización: ${d.capitalizacion?.estado ?? 'no disponible'}; ingresos/activos no se convierten en prima sin calibración residual.`;
            result.motivo += inputs;
            return result;
        }
        const candidates = [], errors = [];
        for (const m of approved)
            try {
                (0, finanzas_1.validarMetodo)(m, d.fecha, d.empresa.codigo_iso);
                const p = m.precioRiesgo;
                if (m.fueraMuestra.inicio > m.calibrado || m.fueraMuestra.inicio > d.fecha)
                    throw Error('Validación fuera de muestra aún no disponible');
                if (!p || p.formula !== 'DELTA_EXPOSICION_LINEAL_V1' || m.formula !== p.formula || p.unidadCoeficiente !== 'TASA_ANUAL_POR_UNIDAD_EXPOSICION' || !m.componentesAprobados.includes(p.componente))
                    throw Error('Falta fórmula ejecutable y coeficiente anual aprobado para el componente');
                if (!p.validacion?.rentabilidadExigida || !p.validacion.residual || !p.validacion.estabilidad || !p.validacion.inferenciaRobusta || p.validacion.evidenciaHash !== m.evidenciaHash)
                    throw Error('Sin validación de precio de riesgo, residual, inferencia o estabilidad');
                if (!p.familias.includes(d.empresa.familia) || !p.moneda || !p.referencia.id || !/^https:\/\//.test(p.referencia.fuente) || !/^[a-f0-9]{64}$/.test(p.referencia.evidenciaHash) || p.referencia.fecha > d.fecha)
                    throw Error('Familia, moneda o referencia no acreditadas');
                (0, fecha_1.fechaCivil)(p.referencia.fecha);
                if (['BANK', 'INSURANCE', 'REIT'].includes(d.empresa.familia) && p.componente === 'KD')
                    throw Error('NO_APLICABLE: familia equity no utiliza Kd');
                const incorporation = p.incorporacionPorEmpresa?.[String(d.empresa.id)];
                if (!base?.evidenciaBase || incorporation?.estado !== 'NO_INCORPORADO' || !incorporation.evidencia?.length || incorporation.baseHash !== base.evidenciaBase || incorporation.conocidoDesde > d.fecha)
                    throw Error('Incorporación incremental desconocida o base no conciliada');
                (0, fecha_1.fechaCivil)(incorporation.conocidoDesde);
                if (!Number.isFinite(p.dominio.min) || !Number.isFinite(p.dominio.max) || p.dominio.min >= p.dominio.max || !Number.isFinite(p.referencia.valor) || p.referencia.valor < p.dominio.min || p.referencia.valor > p.dominio.max)
                    throw Error('Dominio de calibración no acreditado');
                const beta = m.coeficientes[p.coeficiente];
                if (!Number.isFinite(beta))
                    throw Error('Coeficiente inexistente');
                let x, evidence;
                if (factor === 'LIQUIDEZ_BURSATIL') {
                    if (p.variable !== 'AMIHUD' || p.unidad !== 'INV_MONEDA' || !['MERCADO', 'TAMANO', 'RIESGO_OPERATIVO', 'ENDEUDAMIENTO', 'RENTABILIDAD', 'CALIDAD'].every(c => m.controles.includes(c)))
                        throw Error('Exposición/unidades o controles de liquidez incompatibles');
                    const windows = (d.bursatil ?? []).flatMap((s) => s.feed === p.feed ? s.ventanas.filter((w) => w.ventana === p.ventana && w.estado === 'CALCULABLE' && w.moneda === p.moneda && (!w.importeEstimado || p.permiteImporteEstimado === true)).map((w) => ({ s, w })) : []);
                    if (windows.length !== 1)
                        throw Error('Amihud compatible ausente o ambiguo por instrumento/feed');
                    if (windows[0].w.sesiones.at(-1)?.fecha !== p.referencia.fecha)
                        throw Error('La exposición y la referencia de liquidez no corresponden a la misma sesión final');
                    x = windows[0].w.amihud;
                    evidence = windows[0].w.sesiones.map((s) => `capital_daily_observation:${s.id}`);
                }
                else {
                    const cap = d.capitalizacion;
                    if (p.variable !== 'LOG_CAPITALIZACION' || p.unidad !== 'LOG_UNIDADES_MONETARIAS' || cap?.estado !== 'CAPITALIZACION_VALIDADA' || cap.moneda !== p.moneda || !(cap.valor > 0))
                        throw Error('Capitalización conciliada y compatible no disponible');
                    if (cap.fechaPrecio !== p.referencia.fecha)
                        throw Error('Capitalización y referencia no corresponden a la misma fecha');
                    x = Math.log(cap.valor);
                    evidence = cap.evidencia ?? [];
                }
                if (!Number.isFinite(x) || x < p.dominio.min || x > p.dominio.max || !evidence.length)
                    throw Error('Exposición sin evidencia o fuera del dominio; no extrapolar');
                const delta = beta * (x - p.referencia.valor);
                if (!Number.isFinite(delta))
                    throw Error('Prima no finita');
                const risk = factor === 'TAMANO_RESIDUAL' ? 'TAMANO' : factor;
                const reference = base?.primasReferencia?.find(r => r.riesgo === risk && r.componente === p.componente);
                if (delta < 0 && (!reference || reference.tasa <= 0 || -delta > reference.tasa))
                    throw Error('Reducción sin prima de referencia contenida y conciliada en la base');
                const proposal = { methodologyId: m.id, delta, component: p.componente, exposures: [risk], incorporacion: 'NO_INCORPORADO', market: d.empresa.codigo_iso, evidence: [...evidence, ...incorporation.evidencia, `base:${base.evidenciaBase}`, `calibration:${m.id}:${m.version}:${m.evidenciaHash}`, `reference:${p.referencia.id}:${p.referencia.evidenciaHash}`], reference: reference ? { riesgo: risk, componente: p.componente, primaIncluida: reference.tasa, evidencia: reference.evidencia } : undefined,
                    calculo: { version: exports.VERSION_PRIMAS, x, referencia: p.referencia.valor, coeficiente: beta, formula: p.formula, unidad: 'FRACCION_ANUAL' } };
                candidates.push({ ...result, primaCalculada: delta, estadoFinanciero: delta > 0 ? 'POSITIVO' : delta < 0 ? 'NEGATIVO' : 'CERO', estadoAplicacion: delta === 0 ? 'SIN_AJUSTE' : 'PENDIENTE_APROBACION', componente: p.componente, formula: 'Delta K = lambda_anual × (exposición_empresa - exposición_referencia)', fuenteCoeficientes: m.fuente, metodologiaId: m.id, motivo: delta === 0 ? 'Diferencia de exposición estimada igual a cero.' : 'Prima calculada; requiere aprobación individual antes de aplicarse.', evidencia: proposal.evidence, exposicion: x, referencia: p.referencia.valor, coeficiente: beta, propuesta: proposal });
            }
            catch (e) {
                errors.push(`${m.id}: ${e.message}`);
            }
        if (candidates.length !== 1) {
            result.motivo = candidates.length > 1 ? 'Más de una calibración aplicable sin selección autorizada; no escoger silenciosamente.' : errors.join('; ');
            return result;
        }
        return candidates[0];
    });
    return { version: exports.VERSION_PRIMAS, primas, ajusteOperativoKe: 0, ajusteOperativoKd: 0, estimadas: primas.filter(p => p.primaCalculada !== null).length,
        provisionales: primas.filter(p => p.estadoFinanciero === 'NO_ESTIMABLE').length, advertencia: 'Cero operativo por falta de datos/metodología no equivale a riesgo cero. Las primas no nulas calculadas requieren aprobación individual.' };
}
/** Aplicación exclusivamente de propuestas verificadas y aprobadas por el servidor. */
function primasConAprobados(primas, ajustes, base, asOf, market) {
    (0, finanzas_1.recalcularCapital)(base, ajustes, asOf, market);
    const result = primas.primas.map(p => {
        const matches = ajustes.filter(a => a.factor === p.factor);
        if (matches.length > 1)
            throw Error('Más de una prima por factor');
        if (!matches.length)
            return p;
        const a = matches[0];
        const delta = (0, simulacion_1.fraccion)(a.tasa);
        return { ...p, primaCalculada: delta, ajusteOperativo: delta, componente: a.componente, estadoFinanciero: delta > 0 ? 'POSITIVO' : delta < 0 ? 'NEGATIVO' : 'CERO', estadoAplicacion: 'APROBADO', formula: a.metodo.formula, fuenteCoeficientes: a.metodo.fuente, metodologiaId: a.metodo.id, evidencia: a.evidencia, motivo: 'Propuesta y metodología comprobadas por el servidor; ajuste aprobado.' };
    });
    return { ...primas, primas: result, ajusteOperativoKe: result.filter(p => p.componente === 'KE').reduce((s, p) => s + p.ajusteOperativo, 0), ajusteOperativoKd: result.filter(p => p.componente === 'KD').reduce((s, p) => s + p.ajusteOperativo, 0) };
}
//# sourceMappingURL=primas.js.map