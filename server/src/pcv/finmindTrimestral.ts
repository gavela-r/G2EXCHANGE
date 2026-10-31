// FinMind `TaiwanStockFinancialStatements` publica importes de TRIMESTRE AISLADO: la fila con fecha de cierre del
// ejercicio (31-12) es sólo el cuarto trimestre. Guardarla como anual produce ingresos, márgenes y beneficio de
// ~25-32 % del real (comprobado contra estados anuales de terceros, ver PCV_KPI_STATUS.md). El estado de flujos
// (`TaiwanStockCashFlowsStatement`) es acumulado y su fila de cierre sí es anual.
//
// Regla: el anual de un concepto de resultados de ese dataset es la suma de los 4 trimestres del ejercicio con el
// MISMO `type`. Si falta algún trimestre o hay valores contradictorios en una fecha, se omite (null, nunca 0).
// El EPS no es aditivo (el número de acciones cambia): no se deriva de los trimestres.
export const DATASET_TRIMESTRAL = "TaiwanStockFinancialStatements";
export const NO_ADITIVOS = new Set(["EPS_DILUIDO"]);

export interface HechoFinMind { dataset: string; date: string; type: string; value: number }

// Cierres de los 4 trimestres que terminan en `fin` (último día de mes, AAAA-MM-DD).
export function cierresTrimestrales(fin: string): string[] {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fin);
    if (!m) throw new Error("Fecha de cierre no válida");
    const out: string[] = [];
    for (let k = 9; k >= 0; k -= 3) {
        const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - k, 0));   // día 0 del mes siguiente = fin de mes
        out.push(d.toISOString().slice(0, 10));
    }
    if (out[3] !== fin) throw new Error("El cierre debe ser fin de mes");
    return out;
}

export function anualDesdeTrimestres(codigo: string, hecho: HechoFinMind, porFecha: Map<string, HechoFinMind[]>, fin: string): number | null {
    if (hecho.dataset !== DATASET_TRIMESTRAL) return hecho.value;
    if (NO_ADITIVOS.has(codigo)) return null;
    let suma = 0;
    for (const fecha of cierresTrimestrales(fin)) {
        const valores = new Set((porFecha.get(fecha) ?? []).filter(h => h.dataset === DATASET_TRIMESTRAL && h.type === hecho.type && Number.isFinite(h.value)).map(h => h.value));
        if (valores.size !== 1) return null;
        suma += [...valores][0];
    }
    return Number.isFinite(suma) && Math.abs(suma) <= Number.MAX_SAFE_INTEGER ? suma : null;
}
