"use strict";

function calcularBetaPonderada(industrias) {
    if (!Array.isArray(industrias) || industrias.length === 0) {
        throw new Error("No hay industrias para calcular la beta");
    }

    let sumaPonderada = 0;
    let totalEmpresas = 0;

    for (const industria of industrias) {
        const beta = industria.betaApalancada;
        const empresas = industria.numeroEmpresas;

        if (
            !Number.isFinite(beta) ||
            !Number.isSafeInteger(empresas) ||
            empresas <= 0
        ) {
            throw new Error("Datos de beta o número de empresas inválidos");
        }

        sumaPonderada += beta * empresas;
        totalEmpresas += empresas;
    }

    if (!Number.isSafeInteger(totalEmpresas)) {
        throw new Error("Número total de empresas fuera de rango");
    }

    return sumaPonderada / totalEmpresas;
}

module.exports = { calcularBetaPonderada };

function agruparBetasPorSector(betas, mapeoSectores) {
    const grupos = new Map();

    for (const fila of betas) {
        const sector = mapeoSectores[fila.industria];

        if (!sector) continue;

        if (!grupos.has(sector)) {
            grupos.set(sector, []);
        }

        grupos.get(sector).push(fila);
    }

    const resultados = new Map();

    for (const [sector, industrias] of grupos) {
        resultados.set(sector, {
            betaApalancada: calcularBetaPonderada(industrias),
            numeroEmpresas: industrias.reduce(
                (total, fila) => total + fila.numeroEmpresas,
                0
            ),
            industrias: industrias.map(fila => fila.industria)
        });
    }

    return resultados;
}

module.exports.agruparBetasPorSector = agruparBetasPorSector;
