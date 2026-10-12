import conexion from '../conexion/bd';

async function actualizarCosteCapitalReferencia(): Promise<void> {
    try {
        console.log('Iniciando actualización del coste de capital (CAPM)...');

        // Fórmula:
        // Ke = Rf + Beta × ERP
        //
        // Rf y ERP están almacenados como porcentajes.
        // Ke se almacena como decimal.
        //
        // Ejemplo:
        // Rf = 2.67
        // Beta = 1.2309
        // ERP = 5.142949
        // Ke = 0.0900 (9.00 %)

        const sql = `
            UPDATE coste_capital_referencia c
            INNER JOIN pais p
                ON c.pais_id = p.id
            INNER JOIN sector s
                ON c.sector_id = s.id
            SET
                c.ke_referencia = ROUND(
                    (
                        p.interes_bono_10_ano +
                        s.sensibilidad_al_mercado * p.prima_riesgo_mercado
                    ) / 100,
                    4
                ),
                c.equity_risk_premium = p.prima_riesgo_mercado,
                c.fecha_calculo = CURRENT_DATE()
            WHERE p.codigo_iso IN ('US', 'JP', 'TW')
              AND p.interes_bono_10_ano IS NOT NULL
              AND p.prima_riesgo_mercado IS NOT NULL
              AND s.sensibilidad_al_mercado IS NOT NULL
        `;

        const [resultado]: any = await conexion.query(sql);

        console.log('Actualización CAPM completada.');
        console.log(`Registros modificados: ${resultado.changedRows ?? resultado.affectedRows}`);

    } catch (error) {
        console.error('Error al actualizar el coste de capital:', error);
        process.exitCode = 1;
    }
}

actualizarCosteCapitalReferencia();