import { Router } from "express";
import { gzipSync } from "node:zlib";
import conexion from "../conexion/bd";

// ============================================================
// G2EXCHANGE — SCREENER (solo lectura)
//
// GET /api/landing/screener
//
// Devuelve una fila por empresa con el último cierre, el último
// informe anual y la última valoración completada (escenario BASE).
// Los filtros se aplican en el navegador.
//
// Reglas de coherencia (las mismas que en las destacadas):
//  - PER solo si el BPA es positivo y precio / BPA está entre 1 y 1000
//    (fuera de ese rango suele ser un ADR con el BPA en moneda local).
//  - Capitalización solo si las acciones en circulación cuadran (±25 %)
//    con beneficio neto / BPA y el PER no es absurdo.
// La consulta tarda ~10 s: se guarda en memoria una hora.
// ============================================================

const CACHE_MS = 60 * 60 * 1000;

const CONSULTA = `
WITH inf AS (
  SELECT id, empresa_id, fecha_fin_periodo,
         ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY fecha_fin_periodo DESC) rn
  FROM informe_financiero WHERE tipo_periodo = 'ANUAL'
), p AS (
  SELECT inf.empresa_id,
    MAX(CASE WHEN inf.rn = 1 AND pc.concepto_estandar_id = 13 THEN pc.importe END) acciones,
    MAX(CASE WHEN inf.rn = 1 AND pc.concepto_estandar_id = 4 THEN pc.importe END) beneficio,
    MAX(CASE WHEN inf.rn = 1 AND pc.concepto_estandar_id = 8 THEN pc.importe END) eps,
    MAX(CASE WHEN inf.rn = 1 AND pc.concepto_estandar_id = 1 THEN pc.importe END) ingresos,
    MAX(CASE WHEN inf.rn = 2 AND pc.concepto_estandar_id = 1 THEN pc.importe END) ingresos_ant
  FROM inf
  JOIN partida_contable_valor pc ON pc.informe_id = inf.id AND pc.concepto_estandar_id IN (1, 4, 8, 13)
  WHERE inf.rn <= 2
  GROUP BY inf.empresa_id
), k AS (
  SELECT inf.empresa_id, MAX(inf.fecha_fin_periodo) fecha_informe,
    MAX(CASE WHEN k.kpi = 'ROE' THEN k.valor END) roe,
    MAX(CASE WHEN k.kpi = 'ROA' THEN k.valor END) roa,
    MAX(CASE WHEN k.kpi = 'MARGEN_NETO' THEN k.valor END) margen_neto,
    MAX(CASE WHEN k.kpi = 'MARGEN_FCF' THEN k.valor END) margen_fcf,
    MAX(CASE WHEN k.kpi = 'DEUDA_TOTAL' THEN k.valor END) deuda_total,
    MAX(CASE WHEN k.kpi = 'EBITDA' THEN k.valor END) ebitda,
    MAX(CASE WHEN k.kpi = 'COBERTURA_INTERESES' THEN k.valor END) cobertura,
    MAX(CASE WHEN k.kpi = 'CAPITAL_CIRCULANTE_OPERATIVO' THEN k.valor END) circulante
  FROM inf JOIN kpi_financiero_informe k ON k.informe_id = inf.id
  WHERE inf.rn = 1
  GROUP BY inf.empresa_id
), v AS (
  SELECT vr.empresa_id, r.fair_value, r.upside, r.decision, r.confidence, r.validation_status,
         ROW_NUMBER() OVER (PARTITION BY vr.empresa_id ORDER BY vr.fecha_fin DESC, vr.id DESC) rn
  FROM valuation_run vr
  JOIN valuation_run_resultado r ON r.valuation_run_id = vr.id AND r.escenario = 'BASE'
  WHERE vr.estado = 'COMPLETADO'
), base AS (
  SELECT i.id, i.ticker, e.nombre_empresa, pa.codigo_iso, m.nombre_bolsa, s.nombre_sector, i.moneda,
         c.precio_cierre, c.fecha, p.acciones, p.beneficio, p.eps, p.ingresos, p.ingresos_ant,
         k.fecha_informe, k.roe, k.roa, k.margen_neto, k.margen_fcf, k.deuda_total, k.ebitda,
         k.cobertura, k.circulante,
         v.fair_value, v.upside, v.decision, v.confidence, v.validation_status,
         ROW_NUMBER() OVER (PARTITION BY i.empresa_id
                            ORDER BY c.precio_cierre IS NULL, c.precio_cierre DESC, i.id) dup
  FROM instrumento i
  JOIN empresa e ON e.id = i.empresa_id
  LEFT JOIN pais pa ON pa.id = e.pais_id
  LEFT JOIN mercado m ON m.id = i.mercado_id
  LEFT JOIN sector s ON s.id = e.sector_id
  LEFT JOIN cotizacion_diaria c ON c.instrumento_id = i.id
  LEFT JOIN p ON p.empresa_id = e.id
  LEFT JOIN k ON k.empresa_id = e.id
  LEFT JOIN v ON v.empresa_id = e.id AND v.rn = 1
)
SELECT * FROM base WHERE dup = 1`;

const BOLSAS: Record<string, string> = {
    "NASDAQ Stock Market": "NASDAQ",
    "New York Stock Exchange": "NYSE",
    "NYSE American": "NYSE American",
    "Tokyo Stock Exchange": "TSE",
    "Taiwan Stock Exchange": "TWSE",
    "Taipei Exchange": "TPEx"
};

const numero = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const redondear = (v: number | null, d = 2) =>
    v === null ? null : Math.round(v * 10 ** d) / 10 ** d;

function mediana(valores: number[]) {
    if (!valores.length) return null;
    const xs = [...valores].sort((a, b) => a - b);
    const mitad = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[mitad] : (xs[mitad - 1] + xs[mitad]) / 2;
}

function agruparMedianas(filas: { clave: string | null; valor: number | null }[]) {
    const grupos = new Map<string, number[]>();
    for (const { clave, valor } of filas) {
        if (!clave || valor === null) continue;
        grupos.set(clave, [...(grupos.get(clave) ?? []), valor]);
    }
    return Object.fromEntries([...grupos].map(([k, xs]) => [k, redondear(mediana(xs))]));
}

async function construir() {
    const [filas]: any = await conexion.query(CONSULTA);

    const empresas = filas.map((f: any) => {
        const precio = numero(f.precio_cierre);
        const acciones = numero(f.acciones);
        const beneficio = numero(f.beneficio);
        const eps = numero(f.eps);
        const ingresos = numero(f.ingresos);
        const ingresosAnt = numero(f.ingresos_ant);
        const deuda = numero(f.deuda_total);
        const ebitda = numero(f.ebitda);

        const perBruto = precio !== null && eps ? precio / eps : null;
        const perSensato = perBruto !== null && Math.abs(perBruto) >= 1 && Math.abs(perBruto) <= 1000;
        const accionesCuadran = acciones && beneficio !== null && eps
            ? Math.abs(beneficio / eps / acciones - 1) <= 0.25 : false;

        return {
            id: f.id,
            ticker: f.ticker,
            nombre: f.nombre_empresa,
            mercado: f.codigo_iso,
            bolsa: BOLSAS[f.nombre_bolsa] ?? f.nombre_bolsa,
            sector: f.nombre_sector,
            moneda: f.moneda,
            precio,
            fechaPrecio: f.fecha,
            fechaInforme: f.fecha_informe,
            capitalizacion: precio !== null && acciones && accionesCuadran && perSensato
                ? Math.round(precio * acciones) : null,
            per: perSensato && eps! > 0 ? redondear(perBruto) : null,
            roe: redondear(numero(f.roe)),
            roa: redondear(numero(f.roa)),
            margenNeto: redondear(numero(f.margen_neto)),
            margenFcf: redondear(numero(f.margen_fcf)),
            deudaEbitda: deuda !== null && ebitda && ebitda > 0 ? redondear(deuda / ebitda) : null,
            cobertura: redondear(numero(f.cobertura)),
            capitalCirculante: numero(f.circulante),
            crecimiento: ingresos && ingresosAnt && ingresos > 0 && ingresosAnt > 0
                ? redondear((ingresos / ingresosAnt - 1) * 100) : null,
            valorRazonable: numero(f.fair_value),
            potencial: f.upside === null ? null : redondear(Number(f.upside) * 100),
            decision: f.decision ?? null,
            confianza: f.confidence ?? null,
            validacion: f.validation_status ?? null
        };
    });

    return {
        generado: new Date().toISOString(),
        // Clave mercado|sector: los PER de JP y TW no son comparables con los de US
        medianaPerSector: agruparMedianas(empresas.map((e: any) => ({ clave: e.sector && `${e.mercado}|${e.sector}`, valor: e.per }))),
        medianaPerMercado: agruparMedianas(empresas.map((e: any) => ({ clave: e.mercado, valor: e.per }))),
        empresas
    };
}

let cache: { json: string; gzip: Buffer; caduca: number } | null = null;
let enCurso: Promise<{ json: string; gzip: Buffer }> | null = null;

// Se guarda ya serializado y comprimido: son ~8.000 empresas (~4 MB sin comprimir, ~0,5 MB con gzip)
async function datosScreener() {
    if (cache && cache.caduca > Date.now()) return cache;
    // Si ya se está calculando (p. ej. al arrancar), se espera a ese cálculo en vez de repetirlo
    enCurso ??= construir()
        .then(datos => {
            const json = JSON.stringify({ ok: true, ...datos });
            cache = { json, gzip: gzipSync(json), caduca: Date.now() + CACHE_MS };
            return cache;
        })
        .finally(() => { enCurso = null; });
    return enCurso;
}

export const screenerRouter = Router();

screenerRouter.get("/api/landing/screener", async (req, res) => {
    try {
        const { json, gzip } = await datosScreener();
        res.type("application/json").vary("Accept-Encoding");
        if (req.acceptsEncodings("gzip")) res.set("Content-Encoding", "gzip").send(gzip);
        else res.send(json);
    } catch (error) {
        console.error("[screener]", error);
        res.status(500).json({ ok: false, error: "No se pudo cargar el screener" });
    }
});

datosScreener().catch(error => console.error("[screener] precálculo:", error));
