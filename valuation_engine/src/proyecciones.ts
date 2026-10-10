import type { Finanzas } from "./tipos";

export interface AnalisisCrecimiento {
    historical_growth_rates: number[];
    historical_cagr: number;
    weighted_growth: number;
    trend: "ACCELERATING" | "DECELERATING" | "STABLE";
}

export function analizarCrecimiento(
    financials: Finanzas[]
): AnalisisCrecimiento {

    if (financials.length !== 4) {
        throw new Error("Se necesitan exactamente cuatro ejercicios.");
    }

    const ingresos = financials.map(f => f.revenue);

    if (ingresos.some(v => !Number.isFinite(v) || v <= 0)) {
        throw new Error("Los ingresos deben ser positivos y válidos.");
    }

    for (let i = 1; i < financials.length; i++) {
        if (financials[i].fiscal_year <= financials[i - 1].fiscal_year) {
            throw new Error("Los ejercicios deben estar ordenados cronológicamente.");
        }
    }

    const tasas: number[] = [];

    for (let i = 1; i < ingresos.length; i++) {
        tasas.push(ingresos[i] / ingresos[i - 1] - 1);
    }

    // Crecimiento anual compuesto de los tres intervalos.
    const cagr = Math.pow(
        ingresos[3] / ingresos[0],
        1 / 3
    ) - 1;

    // Ponderación: 20 % antiguo, 30 % intermedio, 50 % reciente.
    const weightedGrowth =
        tasas[0] * 0.20 +
        tasas[1] * 0.30 +
        tasas[2] * 0.50;

    // Tendencia basada en la evolución de las tasas.
    const diferencia = tasas[2] - tasas[0];

    let trend: AnalisisCrecimiento["trend"] = "STABLE";

    if (diferencia > 0.05) {
        trend = "ACCELERATING";
    } else if (diferencia < -0.05) {
        trend = "DECELERATING";
    }

    return {
        historical_growth_rates: tasas,
        historical_cagr: cagr,
        weighted_growth: weightedGrowth,
        trend
    };
}