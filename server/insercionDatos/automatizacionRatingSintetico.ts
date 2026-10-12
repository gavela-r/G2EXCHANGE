import { RowDataPacket } from "mysql2";
import { Request, Response } from "express";
import conexion from "../conexion/bd";

type PerfilEmpreasa = "GRANDE_NO_FINANCIERA" | "PEQUEÑA_RIESGOSA" | "FINANCIERA";

interface RatingRow extends RowDataPacket {
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


function numero(valor: unknown): number | null {
    if(valor===null||valor===undefined||valor===''||typeof valor==='boolean')return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

function redondear(valor: number, decimales = 6): number {
    return Number(valor.toFixed(decimales));
}

function perfilValido(valor: unknown): valor is PerfilEmpreasa {
    return ["GRANDE_NO_FINANCIERA", "PEQUEÑA_RIESGOSA", "FINANCIERA"].includes(String(valor));
}

export async function ultimaObservacionFred(serieId: string, apiKey: string): Promise<{ fecha: string; valor: number }> {
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

    const json = (await respuesta.json()) as {observations?: FredObservation[]};
    const observacion = (json.observations || []).find((item) => numero(item.value)!==null && Number(item.value)>=0 && /^\d{4}-\d{2}-\d{2}$/.test(item.date));
    if(!observacion){
        throw new Error(`Fred ${serieId} no tiene observaciones validas`);
    }

    return {fecha: observacion.date, valor: Number(observacion.value)};
}

export async function sincronizarSpreadsRating(req: Request, res : Response): Promise<void> {
    const apiKey = process.env.FRED_API_KEY;
    if(!apiKey){
        res.status(500).json({ok: false, mensaje: "Falta la clave de API de FRED"});
        return;
    }

    const factorOptimista = numero(req.body?.factorOptimista ?? process.env.RATING_FACTOR_OPTIMISTA ?? 0.85);
    const factorPesimista = numero(req.body?.factorPesimista ?? process.env.RATING_FACTOR_PESIMISTA ?? 1.25);

    if(factorOptimista===null||factorPesimista===null||factorOptimista <= 0 || factorOptimista > 1 ||factorPesimista < 1 ||factorPesimista > 5){
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
                UPDATE rating_sintetico 
                SET serie_fred = ?, spread_credito_base = ?, spread_credito_optimista = ?,
                spread_credito_pesimista = ?, fuente_spread_mercado = 'FRED_ICE_BOFA_OAS', 
                fecha_datos_mercado = ? 
                WHERE bucket_mercado = ? AND activo = TRUE `,
                [dato.serie, spreadBase, spreadOptimista, spreadPesimista, dato.fecha, dato.bucket]
            );
        }

        await conn.commit();
        transaccion = false;

        res.status(200).json({
            ok: true,
            mensaje: "Spreds de rating actualizados correctamente",
            unidad: "puntos porcentuales",
            factores: { optimista: factorOptimista, base: 1, pesimista: factorPesimista},
            series: resultados
        });
    }catch(error){
        if(transaccion) await conn.rollback();
        console.error("RATING_SINTETICO: sincronización fallida");
        res.status(500).json({
            ok: false,
            mensaje: "No se pudieron sincronizar los spreads.",
            error: error instanceof Error ? error.message : String(error)
        });
    } finally {
        conn.release();
    }
}

export async function calcularRatingSintetico(req: Request, res:Response): Promise<void>{
    const {ebit, gastoIntereses, coberturaIntereses, perfilEmpresa, tipoLibreRiesgo} = req.body ?? {};
    
    if(!perfilValido(perfilEmpresa)){
        res.status(400).json({ ok: false, mensaje: "perfilEmpresa no es valido"});
        return;
    }
    
    let cobertura = numero(coberturaIntereses);
    if(cobertura === null){
        const ebitNumero = numero(ebit);
        const interesesNumero = numero(gastoIntereses);
        
        if(ebitNumero === null || interesesNumero === null){
            res.status(400).json({ok: false, mensaje: "Enviar coberturaIntereses o bien ebit y gastoInteres"});
            return ;
        }

        if(interesesNumero < 0){
            res.status(400).json({ok: false, mensaje: "gastIntereses no puede ser negativo"});
            return;
        }

        if(interesesNumero === 0 ){
            res.status(422).json({ok:false,mensaje:'Cobertura no calculable con intereses cero'});return;
        }else{
            cobertura = ebitNumero / interesesNumero;
        }

    }
    if(cobertura===null||!Number.isFinite(cobertura)){res.status(400).json({ok:false,mensaje:'Cobertura inválida'});return;}
        const [filas] = await conexion.query<RatingRow[]>(
            `
                SELECT * FROM rating_sintetico 
                WHERE perfil_empresa = ? AND activo = TRUE
                    AND ? > conbertura_interes_min_exclusiva
                    AND ? <= cobertura_interes_max_inclusiva
                ORDER BY orden_riesgo
            `,
            [perfilEmpresa, cobertura, cobertura]
        );

        if(filas.length !== 1){
            res.status(422).json({
                ok: false,
                mensaje: "No existe un intervalo aplicable a la cobertura calculada",
                coberturaIntereses: cobertura,
                perfilEmpresa
            });
            return;
        }

        const fila = filas[0];
        const rf = numero(tipoLibreRiesgo);
        const respuesta: Record<string, unknown> = {
            ok: true,
            formulaCobertura: "EBIT / gasto_intereses",
            conberturaIntereses: redondear(cobertura),
            perfilEmpresa,
            ratingEstimado: fila.rating_estimado,
            bucketMercado: fila.bucket_mercado,
            spreadsCredito: {
                optimista: Number(fila.spread_credito_optimista),
                base: Number(fila.spread_credito_base),
                pesimista: Number(fila.spread_credito_pesimista),
                unidad: "puntos porcentuales"
            },
            referencia: {
                spreadDamodaran : Number(fila.spread_damodaran),
                seriesFred: fila.serie_fred,
                fechaDatosMercado: fila.fecha_datos_mercado
            }
        };

        if(rf !== null){
            respuesta.costeDeudaAntesImpuestos = {
                optimista: redondear(rf + Number(fila.spread_credito_optimista)),
                base: redondear(rf + Number(fila.spread_credito_base)),
                pesimista: redondear(rf + Number(fila.spread_credito_pesimista)),
                formula: "tipo_libre_riesgo + spread_credito",
                unidad: "puntos porcentuales"    
            };
        }

        res.status(200).json(respuesta);
}

export async function listarTablaRatingSintetico(req: Request, res: Response): Promise<void>{
    const perfil = req.query.perfilEmpresa;
    const condiciones: string[] = ["activo = TRUE"];
    const parametros: unknown[] =  [];

    if(perfil !== undefined){
        if(!perfilValido(perfil)){
            res.status(400).json({ok: false, mensaje: "perfilEmpresa no es valido"});
            return;
        }

        condiciones.push("perfil_empresa = ?");
        parametros.push(perfil);
    }


    const [filas] = await conexion.query<RatingRow[]>(
        `SELECT * FROM rating_sintetico WHERE ${condiciones.join(" AND ")} ORDER BY perfil_empresa, orden_riesgo`,
        parametros    
    );

    res.status(200).json({ok: true, total: filas.length, datos: filas});


}
