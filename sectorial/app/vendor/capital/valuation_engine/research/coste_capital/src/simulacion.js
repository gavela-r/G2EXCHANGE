"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fraccion = fraccion;
exports.simularImpactoHipotetico = simularImpactoHipotetico;
function fraccion(t) {
    if (!Number.isFinite(t.valor))
        throw new Error('Tasa no finita');
    if (t.unidad === 'FRACCION_ANUAL')
        return t.valor;
    if (t.unidad === 'PUNTOS_BASICOS')
        return t.valor / 10000;
    throw new Error('Unidad de tasa desconocida; no inferir porcentajes');
}
function simularImpactoHipotetico(base, efectos) {
    if (base.uso !== 'PRUEBA_HIPOTETICA' || ['BANK', 'INSURANCE', 'REIT'].includes(base.familia))
        throw new Error('Solo simulación FCFF hipotética; familias equity requieren otro modelo');
    const { pesoPatrimonio: e, pesoDeuda: d, tasaImpositiva: t } = base;
    if (![e, d, t].every(x => Number.isFinite(x) && x >= 0 && x <= 1) || Math.abs(e + d - 1) > 1e-12)
        throw new Error('Pesos/fiscalidad inválidos');
    const ke = fraccion(base.ke), kd = fraccion(base.kd);
    if (ke < 0 || kd < 0)
        throw new Error('Coste base negativo no soportado');
    const risks = new Set(), ids = new Set();
    let deltaKe = 0, deltaKd = 0;
    const detalle = efectos.map(x => {
        if (!['KE', 'KD'].includes(x.componente) || !x.id.trim() || !x.riesgo.trim() || !x.evidenciaNoDuplicidad.trim()
            || risks.has(x.riesgo) || ids.has(x.id))
            throw new Error('Riesgo/ID duplicado o evidencia insuficiente');
        risks.add(x.riesgo);
        ids.add(x.id);
        const delta = fraccion(x.variacion);
        if (delta < 0) {
            const r = x.referencia;
            if (!r || r.riesgo !== x.riesgo || r.componente !== x.componente || !r.justificacion.trim()
                || fraccion(r.primaIncluida) <= 0 || fraccion(r.primaIncluida) > (x.componente === 'KE' ? ke : kd)
                || -delta > fraccion(r.primaIncluida) + 1e-12)
                throw new Error('Reducción sin prima base conciliada del mismo riesgo/componente');
        }
        if (x.componente === 'KE')
            deltaKe += delta;
        else
            deltaKd += delta;
        return { id: x.id, estado: delta > 0 ? 'POSITIVO' : delta < 0 ? 'NEGATIVO' : 'CERO',
            impactoWacc: x.componente === 'KE' ? delta * e : delta * d * (1 - t) };
    });
    const adjustedKe = ke + deltaKe, adjustedKd = kd + deltaKd;
    if (adjustedKe < 0 || adjustedKd < 0)
        throw new Error('Ajuste produce coste negativo no soportado');
    const original = ke * e + kd * (1 - t) * d;
    const adjusted = adjustedKe * e + adjustedKd * (1 - t) * d;
    if (![original, adjusted, adjustedKe, adjustedKd].every(Number.isFinite))
        throw new Error('Resultado numérico fuera de rango');
    return { uso: 'PRUEBA_HIPOTETICA', aplicableProduccion: false,
        waccOriginal: original, waccHipotetico: adjusted, deltaWacc: adjusted - original,
        keHipotetico: adjustedKe, kdHipotetico: adjustedKd, detalle };
}
//# sourceMappingURL=simulacion.js.map