import { Router } from "express";
import conexion from "../conexion/bd";

// ============================================================
// G2EXCHANGE — DATOS DE LA LANDING (solo lectura)
//
// GET /api/landing/empresas          watchlist por defecto
// GET /api/landing/empresas/:id      ficha de un instrumento
// GET /api/landing/buscar?q=texto    buscador por nombre o ticker
//
// Todo se calcula con lo que hay en MySQL. Lo que no existe
// (cambio diario, consenso de analistas) se devuelve como null.
// ============================================================

const TAMANO_WATCHLIST = 5;
const MERCADOS_USA = [1, 2, 3];
const CACHE_DESTACADAS_MS = 60 * 60 * 1000;

// Conceptos de taxonomia_concepto
const CONCEPTOS = {
    INGRESOS: 1,
    BENEFICIO_NETO: 4,
    EPS_DILUIDO: 8,
    ACTIVOS_TOTALES: 10,
    PASIVOS_TOTALES: 11,
    ACCIONES_EN_CIRCULACION: 13,
    DIVIDENDOS_PAGADOS: 21
} as const;

const BOLSAS: Record<string, { corto: string; tradingView: string }> = {
    "NASDAQ Stock Market": { corto: "NASDAQ", tradingView: "NASDAQ" },
    "New York Stock Exchange": { corto: "NYSE", tradingView: "NYSE" },
    "NYSE American": { corto: "NYSE American", tradingView: "AMEX" },
    "Tokyo Stock Exchange": { corto: "TSE", tradingView: "TSE" },
    "Taiwan Stock Exchange": { corto: "TWSE", tradingView: "TWSE" },
    "Taipei Exchange": { corto: "TPEx", tradingView: "TPEX" }
};

const CONFIANZA: Record<string, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

type Partidas = Partial<Record<keyof typeof CONCEPTOS, number>>;

const numero = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const limitar = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

const media = (valores: (number | null)[]) => {
    const xs = valores.filter((v): v is number => v !== null);
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
};

const SELECT_INSTRUMENTO = `
    SELECT i.id, i.ticker, i.moneda, e.id AS empresa_id, e.nombre_empresa,
           m.nombre_bolsa, s.nombre_sector, c.fecha, c.precio_cierre
    FROM instrumento i
    JOIN empresa e ON e.id = i.empresa_id
    LEFT JOIN mercado m ON m.id = i.mercado_id
    LEFT JOIN sector s ON s.id = e.sector_id
    LEFT JOIN cotizacion_diaria c ON c.instrumento_id = i.id`;

function datosBolsa(nombre: string | null) {
    return (nombre && BOLSAS[nombre]) || { corto: nombre ?? "—", tradingView: "" };
}

// Varias partidas pueden mapear al mismo concepto: se elige la de mayor confianza.
async function partidasPorInforme(informeIds: number[]) {
    const resultado = new Map<number, Partidas>();
    if (!informeIds.length) return resultado;

    const [filas]: any = await conexion.query(
        `SELECT informe_id, concepto_estandar_id, importe, nivel_confianza
         FROM partida_contable_valor
         WHERE informe_id IN (?) AND concepto_estandar_id IN (?)`,
        [informeIds, Object.values(CONCEPTOS)]
    );

    const elegidas = new Map<string, { importe: number; rango: number }>();
    for (const f of filas) {
        const importe = numero(f.importe);
        if (importe === null) continue;
        const clave = `${f.informe_id}:${f.concepto_estandar_id}`;
        const rango = CONFIANZA[String(f.nivel_confianza).toUpperCase()] ?? 3;
        const actual = elegidas.get(clave);
        if (!actual || rango < actual.rango) elegidas.set(clave, { importe, rango });
    }

    for (const [clave, { importe }] of elegidas) {
        const [informeId, conceptoId] = clave.split(":").map(Number);
        const nombre = (Object.keys(CONCEPTOS) as (keyof typeof CONCEPTOS)[])
            .find(k => CONCEPTOS[k] === conceptoId)!;
        const partidas = resultado.get(informeId) ?? {};
        partidas[nombre] = importe;
        resultado.set(informeId, partidas);
    }
    return resultado;
}

async function ficha(instrumento: any) {
    const bolsa = datosBolsa(instrumento.nombre_bolsa);
    const precio = numero(instrumento.precio_cierre);

    const [informes]: any = await conexion.query(
        `SELECT id, fecha_fin_periodo, tipo_documento
         FROM informe_financiero
         WHERE empresa_id = ? AND tipo_periodo = 'ANUAL'
         ORDER BY fecha_fin_periodo DESC
         LIMIT 2`,
        [instrumento.empresa_id]
    );

    const [actual, anterior] = informes as any[];
    const partidas = await partidasPorInforme(informes.map((i: any) => i.id));
    const p: Partidas = actual ? partidas.get(actual.id) ?? {} : {};
    const pAnterior: Partidas = anterior ? partidas.get(anterior.id) ?? {} : {};

    const kpis: Record<string, number> = {};
    if (actual) {
        const [filas]: any = await conexion.query(
            `SELECT kpi, valor FROM kpi_financiero_informe
             WHERE informe_id = ? AND kpi IN ('ROE', 'MARGEN_NETO')`,
            [actual.id]
        );
        for (const f of filas) {
            const v = numero(f.valor);
            if (v !== null) kpis[f.kpi] = v;
        }
    }

    // ---------------- Métricas de mercado ----------------
    const acciones = p.ACCIONES_EN_CIRCULACION ?? null;
    const capitalizacion = precio !== null && acciones ? precio * acciones : null;
    const eps = p.EPS_DILUIDO ?? null;
    const per = precio !== null && eps !== null && eps > 0 ? precio / eps : null;
    const dividendos = p.DIVIDENDOS_PAGADOS !== undefined ? Math.abs(p.DIVIDENDOS_PAGADOS) : null;
    const rentabilidadDividendo =
        capitalizacion && dividendos !== null ? (dividendos / capitalizacion) * 100 : null;

    // ---------------- Fortaleza financiera ----------------
    const crecimientoIngresos =
        p.INGRESOS && pAnterior.INGRESOS ? (p.INGRESOS / pAnterior.INGRESOS - 1) * 100 : null;
    const roe = kpis.ROE ?? null;
    const margenNeto = kpis.MARGEN_NETO ?? null;
    const pasivoSobreActivos =
        p.PASIVOS_TOTALES && p.ACTIVOS_TOTALES ? (p.PASIVOS_TOTALES / p.ACTIVOS_TOTALES) * 100 : null;

    const puntuaciones = {
        Crecimiento: crecimientoIngresos === null ? null : limitar(50 + 2 * crecimientoIngresos),
        Rentabilidad: media([
            roe === null ? null : limitar(roe * 2.5),
            margenNeto === null ? null : limitar(margenNeto * 2.5)
        ]),
        Solvencia: pasivoSobreActivos === null ? null : limitar(100 - pasivoSobreActivos),
        Valoración: eps !== null && eps <= 0 ? 0 : per === null ? null : limitar(100 - (per - 10) * 1.5)
    };
    const total = media(Object.values(puntuaciones));

    return {
        id: instrumento.id,
        ticker: instrumento.ticker,
        nombre: instrumento.nombre_empresa,
        bolsa: bolsa.corto,
        simboloTradingView: bolsa.tradingView ? `${bolsa.tradingView}:${instrumento.ticker}` : null,
        sector: instrumento.nombre_sector,
        moneda: instrumento.moneda,
        precio,
        fechaPrecio: instrumento.fecha ?? null,
        cambioDiario: null, // solo hay un cierre por instrumento
        informe: actual
            ? { fechaFin: actual.fecha_fin_periodo, documento: actual.tipo_documento }
            : null,
        metricas: {
            capitalizacion,
            accionesEnCirculacion: acciones,
            per,
            epsDiluido: eps,
            rentabilidadDividendo,
            crecimientoIngresos,
            roe,
            margenNeto,
            pasivoSobreActivos
        },
        fortaleza: { total, puntuaciones },
        consenso: null // no existe en la base de datos
    };
}

// Empresas destacadas = mayor capitalización (último cierre × acciones del último informe anual).
// Solo se comparan instrumentos en USD de bolsas de EE. UU. (no hay tipos de cambio en la BD) y
// se descartan datos incoherentes:
//  - acciones en circulación que no cuadran (±25 %) con beneficio neto / BPA (errores de unidades);
//  - PER fuera de 1–1000, típico de ADRs cuyo BPA está en moneda local por acción ordinaria.
// La consulta tarda varios segundos, así que el resultado se guarda en memoria.
let destacadas: { ids: number[]; caduca: number } | null = null;

async function idsDestacadas(): Promise<number[]> {
    if (destacadas && destacadas.caduca > Date.now()) return destacadas.ids;
    const [filas]: any = await conexion.query(
        `WITH inf AS (
            SELECT id, empresa_id,
                   ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY fecha_fin_periodo DESC) rn
            FROM informe_financiero WHERE tipo_periodo = 'ANUAL'
         ), p AS (
            SELECT inf.empresa_id,
                   MAX(CASE WHEN pc.concepto_estandar_id = ? THEN pc.importe END) acciones,
                   MAX(CASE WHEN pc.concepto_estandar_id = ? THEN pc.importe END) beneficio,
                   MAX(CASE WHEN pc.concepto_estandar_id = ? THEN pc.importe END) eps
            FROM inf
            JOIN partida_contable_valor pc ON pc.informe_id = inf.id AND pc.concepto_estandar_id IN (?, ?, ?)
            WHERE inf.rn = 1
            GROUP BY inf.empresa_id
         ), r AS (
            SELECT i.id, c.precio_cierre * p.acciones cap,
                   ROW_NUMBER() OVER (PARTITION BY i.empresa_id ORDER BY c.precio_cierre DESC, i.id) dup
            FROM p
            JOIN instrumento i ON i.empresa_id = p.empresa_id AND i.mercado_id IN (?) AND i.moneda = 'USD'
            JOIN cotizacion_diaria c ON c.instrumento_id = i.id
            WHERE p.acciones > 0 AND p.eps <> 0
              AND p.beneficio / p.eps / p.acciones BETWEEN 0.75 AND 1.25
              AND ABS(c.precio_cierre / p.eps) BETWEEN 1 AND 1000
         )
         SELECT id FROM r WHERE dup = 1 ORDER BY cap DESC LIMIT ?`,
        [
            CONCEPTOS.ACCIONES_EN_CIRCULACION, CONCEPTOS.BENEFICIO_NETO, CONCEPTOS.EPS_DILUIDO,
            CONCEPTOS.ACCIONES_EN_CIRCULACION, CONCEPTOS.BENEFICIO_NETO, CONCEPTOS.EPS_DILUIDO,
            MERCADOS_USA, TAMANO_WATCHLIST
        ]
    );
    const ids = filas.map((f: any) => Number(f.id));
    destacadas = { ids, caduca: Date.now() + CACHE_DESTACADAS_MS };
    return ids;
}

export const landingRouter = Router();

landingRouter.get("/api/landing/empresas", async (_req, res) => {
    try {
        const ids = await idsDestacadas();
        if (!ids.length) {
            res.json({ ok: true, empresas: [] });
            return;
        }
        const [filas]: any = await conexion.query(`${SELECT_INSTRUMENTO} WHERE i.id IN (?)`, [ids]);
        filas.sort((a: any, b: any) => ids.indexOf(a.id) - ids.indexOf(b.id));
        res.json({ ok: true, empresas: await Promise.all(filas.map(ficha)) });
    } catch (error) {
        console.error("[landing] empresas:", error);
        res.status(500).json({ ok: false, error: "No se pudieron cargar las empresas" });
    }
});

landingRouter.get("/api/landing/empresas/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ ok: false, error: "id debe ser un entero positivo" });
        return;
    }
    try {
        const [filas]: any = await conexion.query(`${SELECT_INSTRUMENTO} WHERE i.id = ?`, [id]);
        if (!filas.length) {
            res.status(404).json({ ok: false, error: "Empresa no encontrada" });
            return;
        }
        res.json({ ok: true, empresa: await ficha(filas[0]) });
    } catch (error) {
        console.error("[landing] ficha:", error);
        res.status(500).json({ ok: false, error: "No se pudo cargar la empresa" });
    }
});

landingRouter.get("/api/landing/buscar", async (req, res) => {
    const texto = String(req.query.q ?? "").trim().slice(0, 60);
    if (texto.length < 1) {
        res.json({ ok: true, resultados: [] });
        return;
    }
    const patron = `%${texto.replace(/[\\%_]/g, c => `\\${c}`)}%`;
    try {
        const [filas]: any = await conexion.query(
            `${SELECT_INSTRUMENTO}
             WHERE i.ticker LIKE ? OR e.nombre_empresa LIKE ?
             ORDER BY (i.ticker = ?) DESC, (c.precio_cierre IS NULL), e.nombre_empresa
             LIMIT 10`,
            [patron, patron, texto.toUpperCase()]
        );
        res.json({
            ok: true,
            resultados: filas.map((f: any) => ({
                id: f.id,
                ticker: f.ticker,
                nombre: f.nombre_empresa,
                bolsa: datosBolsa(f.nombre_bolsa).corto,
                precio: numero(f.precio_cierre),
                fechaPrecio: f.fecha ?? null
            }))
        });
    } catch (error) {
        console.error("[landing] buscar:", error);
        res.status(500).json({ ok: false, error: "No se pudo realizar la búsqueda" });
    }
});

// Precalcula las destacadas al arrancar para que la primera visita no espere la consulta.
idsDestacadas().catch(error => console.error("[landing] precálculo de destacadas:", error));
