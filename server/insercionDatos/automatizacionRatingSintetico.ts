import { RowDataPacket } from "mysql2";
import { Request, Response } from "express";
import conexion from "../conexion/bd";

type PerfilEmpreasa = "GRANDE_NO_FINANCIERA" | "PEQUENA_RIESGOSA" | "FINANCIERA";

interface RtingRow extends RowDataPacket {
    id: number;
    perfil_empresa: PerfilEmpreasa;
    conbertura_intereses_min_exclusiva: number | string;
    conbertura_intereses_max_inclusiva: number | string;
    rating_estimado: string;
    bucket_mercado: string;
    serie_fred: string | null;
    spread_damodaran: number | string;
    spread_credito_base: number | string;
    spread_credito_optimista: number | string;
    spread_credito_pesimista: number | string;
    fecha_datos_mercado: string | null;
}

interface FredObservation{
    date: string;
    value: string;
}


const SERIES_FRED: Record<string, string> = {
    AAA: "BAMLC0A1CAAA", 
    AA: "BAMLC0A2CAA", 
    A: "BAMLC0A3CA", 
    BBB: "BAMLC0A4CBBB", 
    BB: "BAMLH0A1HYBB", 
    B: "BAMLH0A2HYB", 
    CCC_OR_LOWER: "BAMLH0A3HYC" 
};


function numero(valor: unknown): number {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
}

function redondear(valor: number, decimales = 6): number {
    return Number(valor.toFixed(decimales));
}

function perfilValido(valor: unknown): valor is PerfilEmpreasa {
    return ["GRANDE_NO_FINANCIERA", "PEQUENA_RIESGOSA", "FINANCIERA"].includes(String(valor));
}

async function ultimaObservacionFred(serieId: string, apiKey: string): Promise<{ fecha: string; valor: number }> {
    const url = new URL(`https://api.stlouisfed.org/fred/series/observations`);
    url.searchParams.set("series_id", serieId);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", "1");

    const respuesta = await fetch(url);
    if(!respuesta.ok){
        throw new Error(`Fred ${serieId} respondio con HTTP ${respuesta.status}`);
    }

    const json = (await respuesta.json()) as {onbservations?: FredObservation[]};
    const observacion = (json.onbservations || []).find((item) => item.value !== "." && numero(item.value) !== 0);
    if(!observacion){
        throw new Error(`Fred ${serieId} no tiene observaciones validas`);
    }

    return {fecha: observacion.date, valor: Number(observacion.value)};
}

export async function sincronizarSpreadsRating(req: Request, res : Response): Promise<void> {
    const apiKey = "3b7d9daac80dd66bb98c249ab369ee90";
    if(!apiKey){
        res.status(500).json({ok: false, mensaje: "Falta la clave de API de FRED"});
        return;
    }

    const factorOptimista = numero(req.body?.factorOptimista) ?? numero(process.env.RATING_FACTOR_PESIMISTA) ?? 0.85;
    const factorPesimista = numero(req.body?.factorPesimista) ?? numero(process.env.RATING_FACTOR_PESIMISTA) ?? 1.25;

    if(factorOptimista <= 0 || factorOptimista > 1 ||factorPesimista < 1 ||factorPesimista > 1){
        res.status(400).json({
            ok: false,
            mensaje: "Los factores deben cumplir: 0 < optimista <= 1 y 1 <= pesimista <= 5"
        });
        return;
    }

    const conn = await (conexion as any).getConnection();
    let transaccion = false;

    try{
        const resultados = await Promise.all(
            Object.entries(SERIES_FRED).map(async ([bucket, serie]) =>({
                bucket,
                serie,
                ...(await ultimaObservacionFred(serie, apiKey))
            }))
        );

        await conn.beginTransaction();
        transaccion = true;

        for(const dato of resultados){
            const spreadBase = redondear(dato.valor);
            const spreadOptimista = redondear(spreadBase * factorOptimista);
            const spreadPesimista = redondear(spreadBase * factorPesimista);

            await conn.query(
                `
                UPDATE tabla_rating_sintetico 
                SET serie_fred = ?, spread_credito_base = ?, spread_credito_optimista = ?,
                spread_credito_pesimista = ?, fuente_spread_mercado = 'FRED_ICE_BOFA_OAS', 
                fecha_datos_mercado = ? 
                WHERE bucket_mercado = ? AND activo = TRUE `,
                [dato.serie, spreadBase, spreadOptimista, spreadPesimista, dato.fecha, dato.bucket]
            );
        }

        await conn.commit();
        transaccion = true;

        res.status(200).json({
            ok: true,
            mensaje: "Spreds de rating actualizados correctamente",
            unidad: "puntos porcentuales",
            factores: { optimista: factorOptimista, base: 1, pesimista: factorPesimista},
            series: resultados
        });
    }catch(error){
        if(transaccion) await conn.rollback();
        console.log(["RATING_SINTETICO Error de sincronizacion:", error]);
        res.status(500).json({
            ok: false,
            mensaje: "No se pudieron sincronizar los spreads.",
            error: error instanceof Error ? error.message : String(error)
        });
    } finally {
        conn.release();
    }
}




