import type { Pool, RowDataPacket } from "mysql2/promise";
// Como se calcula cada KPI a partir de las partidas contables sueltas.
// Ajustar los nombres de "concepto" a los que uses realmente en
// PARTIDA_CONTABLE_VALOR / TAXONOMIA_CONCEPTO.
type PartidasPorConcepto = Record<string, number>;
type FormulaKpi = (p: PartidasPorConcepto) => number;

const FORMULAS_KPI: Record<string, FormulaKpi> = {
  EBITDA: (p) => p.ebit + p.depreciacion_amortizacion,
  EBIT: (p) => p.ebit,
  INGRESOS: (p) => p.ingresos,
  BENEFICIO_NETO: (p) => p.beneficio_neto,
  DEUDA_NETA: (p) => p.deuda_financiera - p.caja,
  WORKING_CAPITAL: (p) => p.activo_corriente - p.pasivo_corriente,
  ACTIVOS_TOTALES: (p) => p.activos_totales,
  PATRIMONIO_NETO: (p) => p.patrimonio_neto,
};
async function calcularYGuardarKpis(pool: Pool, informeId: number): Promise<void> {
// 1. Traer todas las partidas de ese informe como un objeto {concepto: valor}
const [rows] = await pool.query<RowDataPacket[]>(
   "SELECT concepto, importe FROM partida_contable_valor WHERE informe_id = ?", [informeId]
);
const partidas: Record<string, number> = {};
    for (const row of rows) {
        partidas[row.concepto] = Number(row.importe);
    }
// 2. Calcular cada KPI y guardarlo (o actualizarlo si ya existia)
for (const [kpiCode, formula] of Object.entries(FORMULAS_KPI)) {
    try {
        const valor = formula(partidas);
        if (valor === undefined || Number.isNaN(valor)) continue;
        await pool.query(
        `INSERT INTO kpi_financiero_informe (informe_id, kpi_code, valor)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
        [informeId, kpiCode, valor]
        );
} catch {
// Faltan partidas necesarias para este KPI en concreto -> se omite,
// no bloquea el calculo del resto de KPIs.
continue;
}
}
}
export { calcularYGuardarKpis };