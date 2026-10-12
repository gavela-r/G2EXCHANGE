import conexion from "../conexion/bd";
import { Request, Response } from "express";
import crypto from "crypto";

// ============================================================================
// AJUSTES_NOTICIAS V7 - DEFINITIVO REVISADO
// USA + JAPON + TAIWAN (TWSE + TPEX)
// ============================================================================
//
// ESTA VERSION RESPETA EL SQL NUEVO:
//
// NOTICIA_EMPRESA
//   - scoring / trazabilidad / deduplicacion
//
// AJUSTES_NOTICIAS
//   - valuation_run_id
//   - empresa_id
//   - variable_code
//   - ajuste_propuesto
//   - ajuste_efectivo
//   - noticia_id
//   - confianza_modelo
//   - procesado
//   - estado
//   - validado_por_usuario_id
//   - fecha_validacion
//   - created_at / updated_at
//
// AJUSTES_NOTICIAS registra PROPUESTAS ligadas a una VALUATION_RUN.
// NO aplica automaticamente el ajuste efectivo.
//
// CORRECCIONES IMPORTANTES:
//
// 1) FECHAS
//    - soporta Date de JavaScript.
//    - soporta YYYY-MM-DD.
//    - Taiwan soporta Minguo con separadores: 115/08/19.
//    - Taiwan soporta Minguo compacto: 1150819.
//    - valida calendario real, no solo regex YYYY-MM-DD.
 //    - evita desplazamientos de dia por timezone en objetos Date.
//
// 2) JAPON
//    - NO usa replace(/\D/g,"").
//    - conserva codigos alfanumericos.
//    - normaliza secCode EDINET de 5 caracteres a 4:
//      13010 -> 1301
//      130A0 -> 130A
//
// 3) TAIWAN
//    - TWSE y TAIPEI EXCHANGE se cargan por fuentes separadas.
//    - TWSE  -> t187ap04_L.
//    - TPEx  -> mopsfin_t187ap04_O.
//    - evita el fallo anterior de meter Taipei Exchange dentro del mapa TWSE.
//
// 4) RED
//    - retry/backoff para HTTP 429.
//    - retry/backoff para HTTP 5xx.
//    - respeta Retry-After cuando existe.
//
// 5) SCORING
//    - M&A ya no queda con direccion=0 + score=0.
//    - mantiene propuestas humanas, no autoaplica.
//
// 6) CAMPOS TWSE/TPEX
//    - tolera claves con espacios invisibles, ej. "主旨 ".
//
// 7) IDEMPOTENCIA / AUDITORIA
//    - hash estable por fuente/id.
//    - no modifica propuestas ya APROBADAS/DESCARTADAS.
//
// 8) DIAGNOSTICO
//    - logs de cruces, fechas, filas y propuestas por mercado.
// ============================================================================


// ============================================================================
// CONFIGURACION
// ============================================================================

const AJN_EDINET_API_KEY =
    process.env.EDINET_API_KEY || "";

const AJN_SEC_USER_AGENT =
    process.env.SEC_USER_AGENT ||
    "G2EXCHANGE research admin@example.com";

const AJN_DAYS_BACK =
    Math.max(
        1,
        Number(
            process.env.AJUSTES_NOTICIAS_DAYS_BACK ||
            "7"
        )
    );

const AJN_SCORE_UMBRAL =
    Math.min(
        1,
        Math.max(
            0,
            Number(
                process.env.AJUSTES_NOTICIAS_SCORE_UMBRAL ||
                "0.40"
            )
        )
    );

const AJN_SEC_PAUSA_MS =
    Math.max(
        125,
        Number(
            process.env.AJUSTES_NOTICIAS_SEC_PAUSA_MS ||
            "150"
        )
    );

const AJN_EDINET_PAUSA_MS =
    Math.max(
        300,
        Number(
            process.env.AJUSTES_NOTICIAS_EDINET_PAUSA_MS ||
            "500"
        )
    );

const AJN_MAX_REINTENTOS =
    Math.max(
        1,
        Number(
            process.env.AJUSTES_NOTICIAS_MAX_REINTENTOS ||
            "5"
        )
    );


// ============================================================================
// TIPOS
// ============================================================================

interface AJNInstrumento {
    empresa_id: number;
    ticker: string;
    mercado: string;
}

interface AJNNoticiaNormalizada {
    empresaId: number;
    fecha: string;
    fuente: string;
    idFuente: string;
    url: string | null;
    titular: string;
    resumen: string | null;
    metadata: string;
    tipoEvento: string;
    relevancia: number;
    direccion: -1 | 0 | 1;
    intensidad: number;
    confianzaFuente: number;
    novedad: number;
    decaimiento: number;
    score: number;
}

interface AJNReglaAjuste {
    variableCode: string;
    maxDelta: number;
}

interface AJNClasificacion {
    tipoEvento: string;
    direccion: -1 | 0 | 1;
    intensidad: number;
    ajuste?: AJNReglaAjuste;
}


// ============================================================================
// UTILIDADES
// ============================================================================

function ajnSleep(
    ms: number
): Promise<void> {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}


function ajnClamp(
    n: number,
    min: number,
    max: number
): number {

    return Math.min(
        max,
        Math.max(
            min,
            n
        )
    );
}


function ajnTexto(
    v: unknown
): string {

    return String(
        v ?? ""
    )
        .normalize("NFKC")
        .trim();
}


function ajnTextoBusqueda(
    ...valores: unknown[]
): string {

    return valores
        .map(
            v =>
                ajnTexto(v)
                    .toLowerCase()
        )
        .join(" ");
}


// ============================================================================
// FECHA GENERAL
// ============================================================================

// Valida formato Y calendario real.
// Evita aceptar 2026-02-31 solo porque cumple la regex.
function ajnValidarFechaISO(
    fecha: string
): boolean {

    const m =
        fecha.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

    if (!m) {
        return false;
    }

    const year =
        Number(
            m[1]
        );

    const month =
        Number(
            m[2]
        );

    const day =
        Number(
            m[3]
        );

    const d =
        new Date(
            Date.UTC(
                year,
                month - 1,
                day
            )
        );

    return (
        d.getUTCFullYear() === year &&
        d.getUTCMonth() === month - 1 &&
        d.getUTCDate() === day
    );
}


function ajnFecha(
    v: unknown
): string | null {

    if (!v) {
        return null;
    }

    // IMPORTANTE:
    // No usamos toISOString() directamente con DATE de MySQL porque,
    // dependiendo de la zona horaria del proceso, un 2026-08-22 00:00 local
    // podria convertirse en 2026-08-21T22:00:00Z y desplazar el dia.
    if (
        v instanceof Date &&
        Number.isFinite(
            v.getTime()
        )
    ) {

        const year =
            v.getFullYear();

        const month =
            String(
                v.getMonth() + 1
            )
                .padStart(
                    2,
                    "0"
                );

        const day =
            String(
                v.getDate()
            )
                .padStart(
                    2,
                    "0"
                );

        return `${year}-${month}-${day}`;
    }


    const texto =
        ajnTexto(v);


    // YYYY-MM-DD y cadenas que empiecen por esa fecha.
    const m =
        texto.match(
            /^(\d{4}-\d{2}-\d{2})/
        );


    if (!m) {
        return null;
    }


    const fecha =
        m[1];


    return ajnValidarFechaISO(
        fecha
    )
        ?
        fecha
        :
        null;
}

function ajnFechaHaceDias(
    dias: number
): string {

    const d =
        new Date();


    d.setUTCDate(
        d.getUTCDate() -
        dias
    );


    return d
        .toISOString()
        .slice(
            0,
            10
        );
}


function ajnFechaHoy():
string {

    return new Date()
        .toISOString()
        .slice(
            0,
            10
        );
}


function ajnEnRango(
    fecha: string
): boolean {

    return (
        fecha >=
            ajnFechaHaceDias(
                AJN_DAYS_BACK
            )
        &&
        fecha <=
            ajnFechaHoy()
    );
}


// ============================================================================
// TICKER GENERAL
// ============================================================================

function ajnTickerBase(
    v: unknown
): string {

    return ajnTexto(v)
        .toUpperCase()
        .replace(
            /\.TW$/i,
            ""
        )
        .replace(
            /\.TWO$/i,
            ""
        )
        .replace(
            /\.T$/i,
            ""
        );
}


// ============================================================================
// JAPON - CODIGO ROBUSTO
// ============================================================================
//
// IMPORTANTE:
// NO eliminar letras.
// Japón ya tiene codigos alfanumericos.
//
// EDINET secCode puede venir en 5 caracteres:
// 13010 -> 1301
// 72030 -> 7203
// 130A0 -> 130A
// ============================================================================

function ajnCodigoJapon(
    v: unknown
): string {

    const codigo =
        ajnTexto(v)
            .toUpperCase()
            .replace(
                /[^0-9A-Z]/g,
                ""
            );


    // Solo retiramos el quinto caracter si es el sufijo 0 esperado.
    // Si alguna fuente entrega un codigo real de 5 caracteres que NO termina
    // en 0, se conserva y aparece en el log de NO CRUZA en vez de mutilarlo.
    if (
        codigo.length === 5 &&
        codigo.endsWith(
            "0"
        )
    ) {

        return codigo.slice(
            0,
            -1
        );
    }


    return codigo;
}

// ============================================================================
// TAIWAN - FECHAS ROBUSTAS
// ============================================================================

function ajnFechaTaiwan(
    v: unknown
): string | null {

    // 1) Date JS o YYYY-MM-DD.
    const directa =
        ajnFecha(v);


    if (
        directa
    ) {

        return directa;
    }


    if (!v) {
        return null;
    }


    const clean =
        ajnTexto(v)
            .replace(
                /[年月]/g,
                "/"
            )
            .replace(
                /日/g,
                ""
            )
            .replace(
                /\s+/g,
                ""
            )
            .trim();


    // ------------------------------------------------------------------------
    // Gregoriana con separadores:
    // 2026/08/19 -> 2026-08-19
    // 2026-08-19 ya fue capturada por ajnFecha(), pero se tolera aqui tambien.
    // ------------------------------------------------------------------------

    const gregSeparada =
        clean.match(
            /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/
        );


    if (
        gregSeparada
    ) {

        const fecha =
            `${gregSeparada[1]}-` +
            `${String(gregSeparada[2]).padStart(2,"0")}-` +
            `${String(gregSeparada[3]).padStart(2,"0")}`;


        return ajnValidarFechaISO(
            fecha
        )
            ?
            fecha
            :
            null;
    }


    // ------------------------------------------------------------------------
    // Gregoriana compacta:
    // 20260819 -> 2026-08-19
    // ------------------------------------------------------------------------

    const gregCompacta =
        clean.match(
            /^(\d{4})(\d{2})(\d{2})$/
        );


    if (
        gregCompacta
    ) {

        const fecha =
            `${gregCompacta[1]}-${gregCompacta[2]}-${gregCompacta[3]}`;


        return ajnValidarFechaISO(
            fecha
        )
            ?
            fecha
            :
            null;
    }


    // ------------------------------------------------------------------------
    // Minguo con separadores:
    // 115/08/19 -> 2026-08-19
    // 115-08-19 -> 2026-08-19
    // ------------------------------------------------------------------------

    const mSeparado =
        clean.match(
            /^(\d{2,3})[\/\-](\d{1,2})[\/\-](\d{1,2})$/
        );


    if (
        mSeparado
    ) {

        const year =
            Number(
                mSeparado[1]
            ) +
            1911;


        const month =
            String(
                mSeparado[2]
            )
                .padStart(
                    2,
                    "0"
                );


        const day =
            String(
                mSeparado[3]
            )
                .padStart(
                    2,
                    "0"
                );


        const fecha =
            `${year}-${month}-${day}`;


        return ajnValidarFechaISO(
            fecha
        )
            ?
            fecha
            :
            null;
    }


    // ------------------------------------------------------------------------
    // Minguo compacto:
    // 1150819 -> 2026-08-19
    // ------------------------------------------------------------------------

    const mCompacto =
        clean.match(
            /^(\d{3})(\d{2})(\d{2})$/
        );


    if (
        mCompacto
    ) {

        const year =
            Number(
                mCompacto[1]
            ) +
            1911;


        const fecha =
            `${year}-${mCompacto[2]}-${mCompacto[3]}`;


        return ajnValidarFechaISO(
            fecha
        )
            ?
            fecha
            :
            null;
    }


    return null;
}

function ajnCampo(
    obj: any,
    nombres: string[]
): any {

    if (
        !obj ||
        typeof obj !==
        "object"
    ) {

        return undefined;
    }


    // 1) Match exacto.
    for (
        const nombre
        of nombres
    ) {

        if (
            Object.prototype
                .hasOwnProperty
                .call(
                    obj,
                    nombre
                )
        ) {

            return obj[
                nombre
            ];
        }
    }


    // 2) Match normalizado.
    // TWSE ha devuelto historicamente claves como "主旨 " con un espacio
    // final invisible. Trim/NFKC evita que ese detalle deje el titulo vacio.
    const mapaClaves =
        new Map<
            string,
            string
        >();


    for (
        const clave
        of Object.keys(
            obj
        )
    ) {

        mapaClaves.set(
            ajnTexto(
                clave
            )
                .toUpperCase(),
            clave
        );
    }


    for (
        const nombre
        of nombres
    ) {

        const original =
            mapaClaves.get(
                ajnTexto(
                    nombre
                )
                    .toUpperCase()
            );


        if (
            original !==
            undefined
        ) {

            return obj[
                original
            ];
        }
    }


    return undefined;
}

function ajnHash(
    partes: unknown[]
): string {

    return crypto
        .createHash(
            "sha256"
        )
        .update(
            partes
                .map(
                    x =>
                        String(
                            x ?? ""
                        )
                            .trim()
                            .toLowerCase()
                )
                .join(
                    "|"
                )
        )
        .digest(
            "hex"
        );
}


// ============================================================================
// FETCH ROBUSTO
// ============================================================================

async function ajnFetchJson(
    url: string,
    opciones: any,
    etiqueta: string,
    intento = 0
): Promise<any> {

    const r =
        await fetch(
            url,
            opciones
        );


    // ------------------------------------------------------------------------
    // 429 - RATE LIMIT
    // ------------------------------------------------------------------------

    if (
        r.status === 429
    ) {

        if (
            intento >=
            AJN_MAX_REINTENTOS
        ) {

            const body =
                await r.text();


            throw new Error(
                `${etiqueta} HTTP 429 tras ${intento} reintentos: ` +
                body.slice(
                    0,
                    250
                )
            );
        }


        const retryAfterRaw =
            r.headers.get(
                "retry-after"
            );


        const retryAfter =
            retryAfterRaw
                ?
                Number(
                    retryAfterRaw
                )
                :
                NaN;


        const espera =
            Number.isFinite(
                retryAfter
            ) &&
            retryAfter > 0
                ?
                retryAfter *
                1000
                :
                Math.min(
                    30000 *
                    Math.pow(
                        2,
                        intento
                    ),
                    300000
                );


        console.warn(
            `[${etiqueta}] HTTP 429. ` +
            `Esperando ${(espera / 1000).toFixed(0)} s...`
        );


        await ajnSleep(
            espera
        );


        return ajnFetchJson(
            url,
            opciones,
            etiqueta,
            intento + 1
        );
    }


    // ------------------------------------------------------------------------
    // 5xx - ERROR TEMPORAL
    // ------------------------------------------------------------------------

    if (
        r.status >= 500 &&
        intento <
        AJN_MAX_REINTENTOS
    ) {

        const espera =
            Math.min(
                5000 *
                Math.pow(
                    2,
                    intento
                ),
                60000
            );


        console.warn(
            `[${etiqueta}] HTTP ${r.status}. ` +
            `Reintento en ${(espera / 1000).toFixed(0)} s...`
        );


        await ajnSleep(
            espera
        );


        return ajnFetchJson(
            url,
            opciones,
            etiqueta,
            intento + 1
        );
    }


    if (
        !r.ok
    ) {

        const body =
            await r.text();


        throw new Error(
            `${etiqueta} HTTP ${r.status}: ` +
            body.slice(
                0,
                300
            )
        );
    }


    return await r.json();
}


// ============================================================================
// UNIVERSO DESDE BD
// ============================================================================

async function ajnCargarInstrumentos():
Promise<AJNInstrumento[]> {

    const db =
        conexion as any;


    const [rows]:
        any =
        await db.query(
        `
        SELECT DISTINCT
            i.empresa_id,
            i.ticker,
            m.nombre_bolsa AS mercado

        FROM instrumento i

        INNER JOIN mercado m
            ON m.id =
               i.mercado_id

        WHERE i.empresa_id IS NOT NULL
          AND i.ticker IS NOT NULL
          AND TRIM(i.ticker) <> ''

          AND UPPER(m.nombre_bolsa) IN
          (
              'NASDAQ STOCK MARKET',
              'NEW YORK STOCK EXCHANGE',
              'NYSE AMERICAN',
              'TOKYO STOCK EXCHANGE',
              'TAIWAN STOCK EXCHANGE',
              'TAIPEI EXCHANGE'
          )
        `
    );


    return rows.map(
        (r: any) => ({

            empresa_id:
                Number(
                    r.empresa_id
                ),

            ticker:
                ajnTickerBase(
                    r.ticker
                ),

            mercado:
                ajnTexto(
                    r.mercado
                )
        })
    );
}


// ============================================================================
// CLASIFICACION
// ============================================================================

function ajnClasificar(
    textoRaw: string,
    fuente: string,
    metadata = ""
): AJNClasificacion {

    const t =
        ajnTextoBusqueda(
            textoRaw,
            metadata
        );


    // DISTRESS
    if (
        /(bankrupt|bankruptcy|chapter 11|chapter 7|receivership|delist|delisting|trading suspension|上場廃止|破産|民事再生|会社更生|停止交易|下市)/i
            .test(
                t
            )
    ) {

        return {
            tipoEvento:
                "DISTRESS",

            direccion:
                -1,

            intensidad:
                1.00,

            ajuste: {
                variableCode:
                    "probabilidad_quiebra",

                maxDelta:
                    0.15
            }
        };
    }


    // BUYBACK
    if (
        /(share repurchase|stock repurchase|buyback|repurchase program|treasury stock|自己株式|自己株券|庫藏股|買回.*股份)/i
            .test(
                t
            )
    ) {

        return {
            tipoEvento:
                "BUYBACK",

            direccion:
                1,

            intensidad:
                0.80,

            ajuste: {
                variableCode:
                    "acciones_en_circulacion",

                maxDelta:
                    -0.03
            }
        };
    }


    // AMPLIACION CAPITAL
    if (
        /(rights issue|public offering|stock offering|equity offering|capital increase|増資|新株発行|第三者割当|現金增資|增資)/i
            .test(
                t
            )
    ) {

        return {
            tipoEvento:
                "AMPLIACION_CAPITAL",

            direccion:
                -1,

            intensidad:
                0.75,

            ajuste: {
                variableCode:
                    "acciones_en_circulacion",

                maxDelta:
                    0.05
            }
        };
    }


    // GUIDANCE BAJA
    if (
        /(profit warning|guidance.*lower|lower.*guidance|cuts? forecast|downward revision|業績予想.*下方|下方修正|獲利預警|下修.*財測|調降.*財測)/i
            .test(
                t
            )
    ) {

        return {
            tipoEvento:
                "GUIDANCE_BAJA",

            direccion:
                -1,

            intensidad:
                0.90,

            ajuste: {
                variableCode:
                    "crecimiento_proyectado",

                maxDelta:
                    -0.02
            }
        };
    }


    // GUIDANCE ALZA
    if (
        /(raises? guidance|guidance.*higher|higher.*guidance|upward revision|業績予想.*上方|上方修正|上修.*財測|調升.*財測)/i
            .test(
                t
            )
    ) {

        return {
            tipoEvento:
                "GUIDANCE_ALZA",

            direccion:
                1,

            intensidad:
                0.85,

            ajuste: {
                variableCode:
                    "crecimiento_proyectado",

                maxDelta:
                    0.02
            }
        };
    }


    // M&A
    // CORRECCION:
    // antes direccion=0 => score=0 => nunca creaba propuesta.
    if (
        /(merger|acquisition|acquire|business combination|takeover|合併|買収|株式交換|收購|合併案)/i
            .test(
                t
            )
    ) {

        return {
            tipoEvento:
                "M_AND_A",

            direccion:
                1,

            intensidad:
                0.70,

            ajuste: {
                variableCode:
                    "capex",

                maxDelta:
                    0.03
            }
        };
    }


    // LITIGIO / REGULACION
    if (
        /(litigation|lawsuit|investigation|regulatory action|fine|penalty|sanction|訴訟|行政処分|調査|裁罰|罰款|重大訴訟)/i
            .test(
                t
            )
    ) {

        return {
            tipoEvento:
                "LITIGIO_REGULATORIO",

            direccion:
                -1,

            intensidad:
                0.80,

            ajuste: {
                variableCode:
                    "prima_riesgo_especifica",

                maxDelta:
                    0.01
            }
        };
    }


    // CAMBIO DIRECCION
    if (
        /(chief executive|chief financial|ceo|cfo|director resign|departure of director|appointment of.*director|代表取締役.*異動|社長.*交代|董事長.*異動|總經理.*異動)/i
            .test(
                t
            )
    ) {

        return {
            tipoEvento:
                "CAMBIO_DIRECCION",

            direccion:
                -1,

            intensidad:
                0.55,

            ajuste: {
                variableCode:
                    "prima_riesgo_especifica",

                maxDelta:
                    0.005
            }
        };
    }


    // DIVIDENDO
    if (
        /(dividend|distribution|配当|剰余金の配当|股利|股息)/i
            .test(
                t
            )
    ) {

        return {
            tipoEvento:
                "DIVIDENDO",

            direccion:
                1,

            intensidad:
                0.40
        };
    }


    // RESULTADOS
    if (
        /(results of operations|financial results|earnings|決算短信|業績|財務報告|營運結果|財報)/i
            .test(
                t
            )
    ) {

        return {
            tipoEvento:
                "RESULTADOS",

            direccion:
                0,

            intensidad:
                0.55
        };
    }


    // ------------------------------------------------------------------------
    // SEC 8-K - FALLBACK POR ITEM
    // ------------------------------------------------------------------------

    if (
        fuente ===
        "SEC_EDGAR"
    ) {

        if (
            metadata.includes(
                "1.03"
            )
        ) {

            return {
                tipoEvento:
                    "DISTRESS",

                direccion:
                    -1,

                intensidad:
                    1.00,

                ajuste: {
                    variableCode:
                        "probabilidad_quiebra",

                    maxDelta:
                        0.15
                }
            };
        }


        if (
            metadata.includes(
                "2.01"
            )
        ) {

            return {
                tipoEvento:
                    "M_AND_A",

                direccion:
                    1,

                intensidad:
                    0.70,

                ajuste: {
                    variableCode:
                        "capex",

                    maxDelta:
                        0.03
                }
            };
        }


        if (
            metadata.includes(
                "3.01"
            )
        ) {

            return {
                tipoEvento:
                    "DISTRESS",

                direccion:
                    -1,

                intensidad:
                    0.90,

                ajuste: {
                    variableCode:
                        "probabilidad_quiebra",

                    maxDelta:
                        0.10
                }
            };
        }


        if (
            metadata.includes(
                "5.02"
            )
        ) {

            return {
                tipoEvento:
                    "CAMBIO_DIRECCION",

                direccion:
                    -1,

                intensidad:
                    0.55,

                ajuste: {
                    variableCode:
                        "prima_riesgo_especifica",

                    maxDelta:
                        0.005
                }
            };
        }
    }


    return {
        tipoEvento:
            "OTRO",

        direccion:
            0,

        intensidad:
            0.25
    };
}


// ============================================================================
// SCORING
// ============================================================================

function ajnDecaimiento(
    fecha: string
): number {

    const hoy =
        new Date();


    const f =
        new Date(
            `${fecha}T00:00:00Z`
        );


    const dias =
        Math.max(
            0,
            (
                hoy.getTime() -
                f.getTime()
            ) /
            86400000
        );


    return ajnClamp(
        Math.exp(
            -dias /
            43.28
        ),
        0.05,
        1
    );
}


function ajnConstruirNoticia(
    params: {
        empresaId: number;
        fecha: string;
        fuente: string;
        idFuente: string;
        url?: string | null;
        titular: string;
        resumen?: string | null;
        metadata?: string;
        confianzaFuente: number;
    }
): AJNNoticiaNormalizada {

    const metadata =
        params.metadata ||
        "";


    const clasificacion =
        ajnClasificar(
            `${params.titular} ${params.resumen || ""}`,
            params.fuente,
            metadata
        );


    const relevancia =
        1.00;


    const novedad =
        1.00;


    const decaimiento =
        ajnDecaimiento(
            params.fecha
        );


    const confianzaFuente =
        ajnClamp(
            params.confianzaFuente,
            0,
            1
        );


    const score =
        clasificacion.direccion *
        relevancia *
        clasificacion.intensidad *
        confianzaFuente *
        novedad *
        decaimiento;


    return {
        empresaId:
            params.empresaId,

        fecha:
            params.fecha,

        fuente:
            params.fuente,

        idFuente:
            params.idFuente,

        url:
            params.url ||
            null,

        titular:
            params.titular,

        resumen:
            params.resumen ||
            null,

        metadata,

        tipoEvento:
            clasificacion.tipoEvento,

        relevancia,

        direccion:
            clasificacion.direccion,

        intensidad:
            clasificacion.intensidad,

        confianzaFuente,

        novedad,

        decaimiento,

        score
    };
}


// ============================================================================
// BD - NOTICIA_EMPRESA
// ============================================================================

async function ajnGuardarNoticia(
    n: AJNNoticiaNormalizada
): Promise<number | null> {

    const db =
        conexion as any;


    // Hash de IDENTIDAD estable.
    // No incluimos tipoEvento ni score: si mañana mejoramos el clasificador,
    // la misma noticia debe actualizarse, no duplicarse.
    const hash =
        ajnHash([
            n.empresaId,
            n.fuente,
            n.idFuente
        ]);


    await db.query(
        `
        INSERT INTO noticia_empresa
        (
            empresa_id,
            fecha,
            fuente,
            titular,
            resumen_ia,
            tipo_evento,
            id_fuente,
            url,
            relevancia,
            direccion,
            intensidad,
            confianza_fuente,
            novedad,
            decaimiento,
            score_noticia,
            hash_dedupe
        )

        VALUES
        (
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?
        )

        ON DUPLICATE KEY UPDATE
            titular =
                VALUES(titular),

            resumen_ia =
                VALUES(resumen_ia),

            tipo_evento =
                VALUES(tipo_evento),

            url =
                VALUES(url),

            relevancia =
                VALUES(relevancia),

            direccion =
                VALUES(direccion),

            intensidad =
                VALUES(intensidad),

            confianza_fuente =
                VALUES(confianza_fuente),

            novedad =
                VALUES(novedad),

            decaimiento =
                VALUES(decaimiento),

            score_noticia =
                VALUES(score_noticia)
        `,
        [
            n.empresaId,
            n.fecha,
            n.fuente,
            n.titular,
            n.resumen,
            n.tipoEvento,
            n.idFuente,
            n.url,
            n.relevancia,
            n.direccion,
            n.intensidad,
            n.confianzaFuente,
            n.novedad,
            n.decaimiento,
            n.score,
            hash
        ]
    );


    const [rows]:
        any =
        await db.query(
        `
        SELECT id

        FROM noticia_empresa

        WHERE hash_dedupe = ?

        LIMIT 1
        `,
        [
            hash
        ]
    );


    return rows[0]?.id
        ?
        Number(
            rows[0].id
        )
        :
        null;
}


// ============================================================================
// BD - VALUATION_RUN
// ============================================================================

async function ajnUltimaValuationRun(
    empresaId: number
): Promise<number | null> {

    const db =
        conexion as any;


    const [rows]:
        any =
        await db.query(
        `
        SELECT id

        FROM valuation_run

        WHERE empresa_id = ?

        ORDER BY id DESC

        LIMIT 1
        `,
        [
            empresaId
        ]
    );


    return rows[0]?.id
        ?
        Number(
            rows[0].id
        )
        :
        null;
}


// ============================================================================
// REGLA DE AJUSTE
// ============================================================================

function ajnReglaAjusteDesdeNoticia(
    n: AJNNoticiaNormalizada
): AJNReglaAjuste | null {

    const clasificacion =
        ajnClasificar(
            `${n.titular} ${n.resumen || ""}`,
            n.fuente,
            n.metadata
        );


    return clasificacion.ajuste ||
        null;
}


function ajnCalcularAjustePropuesto(
    n: AJNNoticiaNormalizada,
    regla: AJNReglaAjuste
): number {

    const fuerza =
        ajnClamp(
            Math.abs(
                n.score
            ),
            0,
            1
        );


    return Number(
        (
            regla.maxDelta *
            Math.max(
                0.25,
                fuerza
            )
        )
            .toFixed(
                10
            )
    );
}


// ============================================================================
// CREAR PROPUESTA AJUSTES_NOTICIAS
// ============================================================================

async function ajnCrearPropuesta(
    noticia:
        AJNNoticiaNormalizada,

    noticiaId:
        number
): Promise<number> {

    if (
        Math.abs(
            noticia.score
        ) <
        AJN_SCORE_UMBRAL
    ) {

        return 0;
    }


    const regla =
        ajnReglaAjusteDesdeNoticia(
            noticia
        );


    if (!regla) {
        return 0;
    }


    const valuationRunId =
        await ajnUltimaValuationRun(
            noticia.empresaId
        );


    // Sin valuation run:
    // guardamos NOTICIA_EMPRESA, pero no inventamos una valoración.
    if (
        !valuationRunId
    ) {

        return 0;
    }


    const ajuste =
        ajnCalcularAjustePropuesto(
            noticia,
            regla
        );


    const db =
        conexion as any;


    const [resultado]:
        any =
        await db.query(
        `
        INSERT INTO ajustes_noticias
        (
            valuation_run_id,
            empresa_id,
            variable_code,
            ajuste_propuesto,
            ajuste_efectivo,
            noticia_id,
            confianza_modelo,
            procesado,
            estado
        )

        VALUES
        (
            ?, ?, ?, ?, NULL, ?, ?, 0, 'PENDIENTE'
        )

        ON DUPLICATE KEY UPDATE
            empresa_id =
                VALUES(empresa_id),

            -- Una decision ya APROBADA/DESCARTADA no debe cambiar al
            -- reejecutar el proceso unos dias despues.
            ajuste_propuesto =
                IF(
                    estado = 'PENDIENTE',
                    VALUES(ajuste_propuesto),
                    ajuste_propuesto
                ),

            confianza_modelo =
                IF(
                    estado = 'PENDIENTE',
                    VALUES(confianza_modelo),
                    confianza_modelo
                ),

            updated_at =
                IF(
                    estado = 'PENDIENTE',
                    CURRENT_TIMESTAMP,
                    updated_at
                )
        `,
        [
            valuationRunId,
            noticia.empresaId,
            regla.variableCode,
            ajuste,
            noticiaId,
            Number(
                (
                    noticia.confianzaFuente *
                    100
                )
                    .toFixed(
                        2
                    )
            )
        ]
    );


    return Number(
        resultado?.affectedRows ||
        0
    );
}


async function ajnProcesar(
    noticia:
        AJNNoticiaNormalizada
): Promise<{
    noticia: number;
    propuesta: number;
}> {

    const noticiaId =
        await ajnGuardarNoticia(
            noticia
        );


    if (
        !noticiaId
    ) {

        return {
            noticia:
                0,

            propuesta:
                0
        };
    }


    const propuesta =
        await ajnCrearPropuesta(
            noticia,
            noticiaId
        );


    return {
        noticia:
            1,

        propuesta:
            propuesta > 0
                ?
                1
                :
                0
    };
}


// ============================================================================
// USA - SEC EDGAR
// ============================================================================

async function ajnSecFetch(
    url: string
): Promise<any> {

    return ajnFetchJson(
        url,
        {
            headers: {
                "User-Agent":
                    AJN_SEC_USER_AGENT,

                "Accept":
                    "application/json",

                "Accept-Encoding":
                    "gzip, deflate"
            }
        },
        "SEC"
    );
}


async function ajnSecMapaTickerCIK():
Promise<Map<string,string>> {

    const json =
        await ajnSecFetch(
            "https://www.sec.gov/files/company_tickers.json"
        );


    const mapa =
        new Map<
            string,
            string
        >();


    for (
        const item
        of Object.values(
            json ||
            {}
        ) as any[]
    ) {

        const ticker =
            ajnTickerBase(
                item?.ticker
            );


        const cik =
            String(
                item?.cik_str ||
                ""
            )
                .padStart(
                    10,
                    "0"
                );


        if (
            ticker &&
            cik
        ) {

            mapa.set(
                ticker,
                cik
            );
        }
    }


    return mapa;
}


function ajnSecUrlFiling(
    cik: string,
    accession: string,
    primaryDocument: string
): string {

    const cikNum =
        String(
            Number(
                cik
            )
        );


    const accessionSinGuiones =
        accession.replace(
            /-/g,
            ""
        );


    return (
        `https://www.sec.gov/Archives/edgar/data/` +
        `${cikNum}/${accessionSinGuiones}/${primaryDocument}`
    );
}


async function ajnCargarUSA(
    instrumentos:
        AJNInstrumento[]
): Promise<any> {

    console.log(
        "\n=============================================="
    );

    console.log(
        " AJUSTES_NOTICIAS - USA / SEC EDGAR"
    );

    console.log(
        "=============================================="
    );


    const mapaCIK =
        await ajnSecMapaTickerCIK();


    const empresas =
        new Map<
            number,
            {
                ticker: string;
                cik: string;
            }
        >();


    for (
        const i
        of instrumentos
    ) {

        if (
            ![
                "NASDAQ STOCK MARKET",
                "NEW YORK STOCK EXCHANGE",
                "NYSE AMERICAN"
            ]
                .includes(
                    i.mercado
                        .toUpperCase()
                )
        ) {

            continue;
        }


        if (
            empresas.has(
                i.empresa_id
            )
        ) {

            continue;
        }


        const cik =
            mapaCIK.get(
                i.ticker
            );


        if (!cik) {
            continue;
        }


        empresas.set(
            i.empresa_id,
            {
                ticker:
                    i.ticker,

                cik
            }
        );
    }


    console.log(
        `[AJN USA] Empresas con CIK: ${empresas.size}`
    );


    let empresasProcesadas =
        0;

    let filingsRecientes =
        0;

    let noticias =
        0;

    let propuestas =
        0;

    let errores =
        0;


    for (
        const [
            empresaId,
            e
        ]
        of empresas.entries()
    ) {

        try {

            const json =
                await ajnSecFetch(
                    `https://data.sec.gov/submissions/CIK${e.cik}.json`
                );


            const recent =
                json?.filings?.recent;


            if (
                !recent ||
                !Array.isArray(
                    recent.form
                )
            ) {

                empresasProcesadas++;

                await ajnSleep(
                    AJN_SEC_PAUSA_MS
                );

                continue;
            }


            for (
                let idx = 0;
                idx <
                recent.form.length;
                idx++
            ) {

                const form =
                    ajnTexto(
                        recent.form[
                            idx
                        ]
                    )
                        .toUpperCase();


                if (
                    ![
                        "8-K",
                        "8-K/A",
                        "6-K",
                        "10-Q",
                        "10-K",
                        "20-F",
                        "40-F"
                    ]
                        .includes(
                            form
                        )
                ) {

                    continue;
                }


                const fecha =
                    ajnFecha(
                        recent.filingDate?.[
                            idx
                        ]
                    );


                if (
                    !fecha ||
                    !ajnEnRango(
                        fecha
                    )
                ) {

                    continue;
                }


                filingsRecientes++;


                const accession =
                    ajnTexto(
                        recent.accessionNumber?.[
                            idx
                        ]
                    );


                const primaryDocument =
                    ajnTexto(
                        recent.primaryDocument?.[
                            idx
                        ]
                    );


                const description =
                    ajnTexto(
                        recent.primaryDocDescription?.[
                            idx
                        ]
                    );


                const items =
                    ajnTexto(
                        recent.items?.[
                            idx
                        ]
                    );


                const title =
                    description ||
                    `${form} ${items}` ||
                    form;


                const url =
                    accession &&
                    primaryDocument
                        ?
                        ajnSecUrlFiling(
                            e.cik,
                            accession,
                            primaryDocument
                        )
                        :
                        null;


                const noticia =
                    ajnConstruirNoticia({
                        empresaId,

                        fecha,

                        fuente:
                            "SEC_EDGAR",

                        idFuente:
                            accession ||
                            `${e.cik}-${fecha}-${form}-${idx}`,

                        url,

                        titular:
                            title,

                        resumen:
                            items
                                ?
                                `${form}; items ${items}`
                                :
                                form,

                        metadata:
                            `${form} ${items}`,

                        confianzaFuente:
                            1.00
                    });


                const pr =
                    await ajnProcesar(
                        noticia
                    );


                noticias +=
                    pr.noticia;


                propuestas +=
                    pr.propuesta;
            }


            empresasProcesadas++;


            if (
                empresasProcesadas %
                250 ===
                0
            ) {

                console.log(
                    `[AJN USA] ${empresasProcesadas}/${empresas.size}` +
                    ` | filings=${filingsRecientes}` +
                    ` | noticias=${noticias}` +
                    ` | propuestas=${propuestas}` +
                    ` | errores=${errores}`
                );
            }

        } catch (
            error
        ) {

            errores++;


            console.warn(
                `[AJN USA] ${e.ticker}: ` +
                (
                    error instanceof Error
                        ?
                        error.message
                        :
                        String(error)
                )
            );
        }


        await ajnSleep(
            AJN_SEC_PAUSA_MS
        );
    }


    return {
        empresas:
            empresas.size,

        empresasProcesadas,

        filingsRecientes,

        noticias,

        propuestas,

        errores
    };
}


// ============================================================================
// JAPON - EDINET API V2
// ============================================================================

async function ajnEdinetDia(
    fecha: string
): Promise<any[]> {

    if (
        !AJN_EDINET_API_KEY
    ) {

        throw new Error(
            "Falta EDINET_API_KEY."
        );
    }


    const url =
        `https://api.edinet-fsa.go.jp/api/v2/documents.json` +
        `?date=${encodeURIComponent(fecha)}` +
        `&type=2` +
        `&Subscription-Key=${encodeURIComponent(AJN_EDINET_API_KEY)}`;


    const json =
        await ajnFetchJson(
            url,
            {
                headers: {
                    "Accept":
                        "application/json"
                }
            },
            "EDINET"
        );


    return Array.isArray(
        json?.results
    )
        ?
        json.results
        :
        [];
}


async function ajnCargarJapon(
    instrumentos:
        AJNInstrumento[]
): Promise<any> {

    console.log(
        "\n=============================================="
    );

    console.log(
        " AJUSTES_NOTICIAS - JAPON / EDINET"
    );

    console.log(
        "=============================================="
    );


    const mapa =
        new Map<
            string,
            number
        >();


    for (
        const i
        of instrumentos
    ) {

        if (
            i.mercado
                .toUpperCase()
            !==
            "TOKYO STOCK EXCHANGE"
        ) {

            continue;
        }


        const codigo =
            ajnCodigoJapon(
                i.ticker
            );


        if (
            codigo
        ) {

            mapa.set(
                codigo,
                i.empresa_id
            );
        }
    }


    console.log(
        `[AJN JP] Instrumentos en mapa: ${mapa.size}`
    );


    let dias =
        0;

    let filasTotal =
        0;

    let documentos =
        0;

    let noticias =
        0;

    let propuestas =
        0;

    let sinEmpresa =
        0;

    let errores =
        0;

    let debugSinCruce =
        0;


    for (
        let offset = 0;
        offset <=
        AJN_DAYS_BACK;
        offset++
    ) {

        const fecha =
            ajnFechaHaceDias(
                offset
            );


        try {

            const filas =
                await ajnEdinetDia(
                    fecha
                );


            dias++;

            filasTotal +=
                filas.length;


            for (
                const fila
                of filas
            ) {

                const secCodeOriginal =
                    ajnTexto(
                        fila?.secCode
                    );


                const secCode =
                    ajnCodigoJapon(
                        secCodeOriginal
                    );


                const empresaId =
                    mapa.get(
                        secCode
                    );


                if (
                    !empresaId
                ) {

                    sinEmpresa++;


                    if (
                        debugSinCruce <
                        20 &&
                        secCode
                    ) {

                        console.log(
                            "[AJN JP DEBUG] NO CRUZA:",
                            {
                                secCodeOriginal,

                                secCodeNormalizado:
                                    secCode
                            }
                        );


                        debugSinCruce++;
                    }


                    continue;
                }


                const descripcion =
                    ajnTexto(
                        fila?.docDescription
                    );


                const motivo =
                    ajnTexto(
                        fila?.currentReportReason
                    );


                const docID =
                    ajnTexto(
                        fila?.docID
                    );


                if (
                    !docID
                ) {

                    continue;
                }


                const texto =
                    `${descripcion} ${motivo}`;


                const interesante =
                    /臨時報告書|自己株|大量保有|公開買付|有価証券届出書|業績予想|下方修正|上方修正|破産|民事再生|会社更生|訴訟|行政処分|合併|買収|増資|extraordinary|repurchase|tender offer|bankrupt|merger|acquisition|guidance|lawsuit|offering/i
                        .test(
                            texto
                        );


                if (
                    !interesante
                ) {

                    continue;
                }


                documentos++;


                const fechaDocumento =
                    ajnFecha(
                        fila?.submitDateTime
                    ) ||
                    fecha;


                const noticia =
                    ajnConstruirNoticia({
                        empresaId,

                        fecha:
                            fechaDocumento,

                        fuente:
                            "EDINET",

                        idFuente:
                            docID,

                        url:
                            "https://disclosure2.edinet-fsa.go.jp/",

                        titular:
                            descripcion ||
                            motivo ||
                            `EDINET ${docID}`,

                        resumen:
                            motivo ||
                            descripcion ||
                            null,

                        metadata:
                            `${ajnTexto(fila?.docTypeCode)} ${motivo}`,

                        confianzaFuente:
                            1.00
                    });


                const pr =
                    await ajnProcesar(
                        noticia
                    );


                noticias +=
                    pr.noticia;


                propuestas +=
                    pr.propuesta;
            }


        } catch (
            error
        ) {

            errores++;


            console.warn(
                `[AJN JP] ${fecha}: ` +
                (
                    error instanceof Error
                        ?
                        error.message
                        :
                        String(error)
                )
            );
        }


        await ajnSleep(
            AJN_EDINET_PAUSA_MS
        );
    }


    console.log(
        `[AJN JP] dias=${dias}` +
        ` | filas=${filasTotal}` +
        ` | documentos=${documentos}` +
        ` | noticias=${noticias}` +
        ` | propuestas=${propuestas}` +
        ` | sinEmpresa=${sinEmpresa}` +
        ` | errores=${errores}`
    );


    return {
        dias,

        filas:
            filasTotal,

        documentos,

        noticias,

        propuestas,

        sinEmpresa,

        errores
    };
}


// ============================================================================
// TAIWAN - MOTOR COMUN TWSE / TPEX
// ============================================================================

async function ajnCargarTaiwanFuente(
    params: {
        instrumentos:
            AJNInstrumento[];

        mercados:
            string[];

        url:
            string;

        fuente:
            string;

        urlPublica:
            string;
    }
): Promise<any> {

    const mapa =
        new Map<
            string,
            number
        >();


    for (
        const i
        of params.instrumentos
    ) {

        if (
            !params.mercados
                .includes(
                    i.mercado
                        .toUpperCase()
                )
        ) {

            continue;
        }


        mapa.set(
            ajnTickerBase(
                i.ticker
            ),
            i.empresa_id
        );
    }


    console.log(
        `[${params.fuente}] Instrumentos en mapa: ${mapa.size}`
    );


    const json =
        await ajnFetchJson(
            params.url,
            {
                headers: {
                    "Accept":
                        "application/json"
                }
            },
            params.fuente
        );


    const filas =
        Array.isArray(
            json
        )
            ?
            json
            :
            Array.isArray(
                json?.data
            )
                ?
                json.data
                :
                [];


    console.log(
        `[${params.fuente}] Filas recibidas: ${filas.length}`
    );


    if (
        filas.length >
        0
    ) {

        console.log(
            `[${params.fuente} DEBUG] Primera fila:`,
            filas[0]
        );

        console.log(
            `[${params.fuente} DEBUG] Claves:`,
            Object.keys(
                filas[0]
            )
        );
    }


    let noticias =
        0;

    let propuestas =
        0;

    let sinEmpresa =
        0;

    let sinFecha =
        0;

    let fueraRango =
        0;

    let sinTexto =
        0;

    let debugSinCruce =
        0;

    let debugSinFecha =
        0;


    for (
        const fila
        of filas
    ) {

        const ticker =
            ajnTickerBase(
                ajnCampo(
                    fila,
                    [
                        "公司代號",
                        "公司代码",
                        "CompanyCode",
                        "company_code",
                        "stock_id",
                        "Code",
                        "SecuritiesCompanyCode"
                    ]
                )
            );


        const empresaId =
            mapa.get(
                ticker
            );


        if (
            !empresaId
        ) {

            sinEmpresa++;


            if (
                debugSinCruce <
                20 &&
                ticker
            ) {

                console.log(
                    `[${params.fuente} DEBUG] NO CRUZA:`,
                    ticker
                );


                debugSinCruce++;
            }


            continue;
        }


        const rawFecha =
            ajnCampo(
                fila,
                [
                    "發言日期",
                    "发布日期",
                    "發布日期",
                    "日期",
                    "Date",
                    "date",
                    "PublishDate",
                    "出表日期",
                    "事實發生日"
                ]
            );


        const fecha =
            ajnFechaTaiwan(
                rawFecha
            );


        if (
            !fecha
        ) {

            sinFecha++;


            if (
                debugSinFecha <
                20
            ) {

                console.log(
                    `[${params.fuente} DEBUG] FECHA NO VALIDA:`,
                    {
                        ticker,
                        rawFecha
                    }
                );


                debugSinFecha++;
            }


            continue;
        }


        if (
            !/^\d{4}-\d{2}-\d{2}$/
                .test(
                    fecha
                )
        ) {

            sinFecha++;

            continue;
        }


        if (
            !ajnEnRango(
                fecha
            )
        ) {

            fueraRango++;

            continue;
        }


        const titular =
            ajnTexto(
                ajnCampo(
                    fila,
                    [
                        "主旨",
                        "主旨 ",
                        "重大訊息主旨",
                        "Title",
                        "title",
                        "Subject"
                    ]
                )
            );


        const descripcion =
            ajnTexto(
                ajnCampo(
                    fila,
                    [
                        "說明",
                        "Description",
                        "description",
                        "內容",
                        "Content"
                    ]
                )
            );


        if (
            !titular &&
            !descripcion
        ) {

            sinTexto++;

            continue;
        }


        const secuencia =
            ajnTexto(
                ajnCampo(
                    fila,
                    [
                        "序號",
                        "Seq",
                        "seq",
                        "Sequence"
                    ]
                )
            );


        // "序號" puede repetirse en días distintos.
        // Lo hacemos estable y global dentro de la fuente añadiendo ticker+fecha.
        const idFuente =
            secuencia
                ?
                `${ticker}-${fecha}-${secuencia}`
                :
                ajnHash([
                    ticker,
                    fecha,
                    titular,
                    descripcion
                ]);


        const noticia =
            ajnConstruirNoticia({
                empresaId,

                fecha,

                fuente:
                    params.fuente,

                idFuente,

                url:
                    params.urlPublica,

                titular:
                    titular ||
                    descripcion.slice(
                        0,
                        250
                    ),

                resumen:
                    descripcion ||
                    null,

                metadata:
                    params.fuente,

                confianzaFuente:
                    1.00
            });


        const pr =
            await ajnProcesar(
                noticia
            );


        noticias +=
            pr.noticia;


        propuestas +=
            pr.propuesta;
    }


    console.log(
        `[${params.fuente}] filas=${filas.length}` +
        ` | noticias=${noticias}` +
        ` | propuestas=${propuestas}` +
        ` | sinEmpresa=${sinEmpresa}` +
        ` | sinFecha=${sinFecha}` +
        ` | fueraRango=${fueraRango}` +
        ` | sinTexto=${sinTexto}`
    );


    return {
        filas:
            filas.length,

        noticias,

        propuestas,

        sinEmpresa,

        sinFecha,

        fueraRango,

        sinTexto
    };
}


// ============================================================================
// TAIWAN - TWSE LISTED
// ============================================================================

async function ajnCargarTaiwanTWSE(
    instrumentos:
        AJNInstrumento[]
): Promise<any> {

    console.log(
        "\n=============================================="
    );

    console.log(
        " AJUSTES_NOTICIAS - TAIWAN / TWSE"
    );

    console.log(
        "=============================================="
    );


    return ajnCargarTaiwanFuente({
        instrumentos,

        mercados: [
            "TAIWAN STOCK EXCHANGE"
        ],

        url:
            "https://openapi.twse.com.tw/v1/opendata/t187ap04_L",

        fuente:
            "TWSE_OPENAPI",

        urlPublica:
            "https://mops.twse.com.tw/"
    });
}


// ============================================================================
// TAIWAN - TPEX / TAIPEI EXCHANGE
// ============================================================================
//
// Endpoint oficial TPEx OpenAPI:
// GET /mopsfin_t187ap04_O
// ============================================================================

async function ajnCargarTaiwanTPEx(
    instrumentos:
        AJNInstrumento[]
): Promise<any> {

    console.log(
        "\n=============================================="
    );

    console.log(
        " AJUSTES_NOTICIAS - TAIWAN / TPEX"
    );

    console.log(
        "=============================================="
    );


    return ajnCargarTaiwanFuente({
        instrumentos,

        mercados: [
            "TAIPEI EXCHANGE"
        ],

        url:
            "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O",

        fuente:
            "TPEX_OPENAPI",

        urlPublica:
            "https://www.tpex.org.tw/"
    });
}


// ============================================================================
// MOTOR UNIVERSAL
// ============================================================================

export async function
ejecutarAjustesNoticias() {

    const inicio =
        Date.now();


    console.log(
        "\n======================================================"
    );

    console.log(
        " AJUSTES_NOTICIAS V7 - USA + JAPON + TAIWAN"
    );

    console.log(
        "======================================================"
    );


    console.log(
        `[AJN] Ventana: ultimos ${AJN_DAYS_BACK} dias`
    );


    console.log(
        `[AJN] Umbral propuesta: ${AJN_SCORE_UMBRAL}`
    );


    const instrumentos =
        await ajnCargarInstrumentos();


    console.log(
        `[AJN] Instrumentos cargados desde BD: ${instrumentos.length}`
    );


    const resumen:
        any =
        {};


    // USA
    try {

        resumen.usa =
            await ajnCargarUSA(
                instrumentos
            );

    } catch (
        error
    ) {

        resumen.usa = {
            error:
                error instanceof Error
                    ?
                    error.message
                    :
                    String(error)
        };


        console.error(
            "[AJN] USA:",
            resumen.usa.error
        );
    }


    // JAPON
    try {

        resumen.japon =
            await ajnCargarJapon(
                instrumentos
            );

    } catch (
        error
    ) {

        resumen.japon = {
            error:
                error instanceof Error
                    ?
                    error.message
                    :
                    String(error)
        };


        console.error(
            "[AJN] JAPON:",
            resumen.japon.error
        );
    }


    // TAIWAN TWSE
    try {

        resumen.taiwanTWSE =
            await ajnCargarTaiwanTWSE(
                instrumentos
            );

    } catch (
        error
    ) {

        resumen.taiwanTWSE = {
            error:
                error instanceof Error
                    ?
                    error.message
                    :
                    String(error)
        };


        console.error(
            "[AJN] TAIWAN TWSE:",
            resumen.taiwanTWSE.error
        );
    }


    // TAIWAN TPEX
    try {

        resumen.taiwanTPEx =
            await ajnCargarTaiwanTPEx(
                instrumentos
            );

    } catch (
        error
    ) {

        resumen.taiwanTPEx = {
            error:
                error instanceof Error
                    ?
                    error.message
                    :
                    String(error)
        };


        console.error(
            "[AJN] TAIWAN TPEX:",
            resumen.taiwanTPEx.error
        );
    }


    const duracionMs =
        Date.now() -
        inicio;


    resumen.duracionMs =
        duracionMs;


    console.log(
        "\n[AJN] RESUMEN FINAL"
    );


    console.log(
        resumen
    );


    console.log(
        `[AJN] Tiempo ${(duracionMs / 1000).toFixed(1)} s`
    );


    return resumen;
}


// ============================================================================
// EXPRESS - ACTUALIZAR
// ============================================================================
//
// POST /api/ajustes-noticias/actualizar
//
// ============================================================================

export async function
actualizarAjustesNoticias(
    _req: Request,
    res: Response
): Promise<void> {

    try {

        const resultado =
            await ejecutarAjustesNoticias();


        res.status(
            200
        )
            .json({
                ok:
                    true,

                mensaje:
                    "AJUSTES_NOTICIAS actualizado.",

                resumen:
                    resultado
            });


    } catch (
        error
    ) {

        console.error(
            "[AJN] ERROR CRITICO:",
            error
        );


        res.status(
            500
        )
            .json({
                ok:
                    false,

                mensaje:
                    "No se pudo actualizar AJUSTES_NOTICIAS.",

                error:
                    error instanceof Error
                        ?
                        error.message
                        :
                        String(error)
            });
    }
}


// ============================================================================
// EXPRESS - LISTAR PROPUESTAS
// ============================================================================
//
// GET /api/ajustes-noticias?empresa_id=482&estado=PENDIENTE
//
// ============================================================================

export async function
listarAjustesNoticias(
    req: Request,
    res: Response
): Promise<void> {

    try {

        const empresaId =
            req.query.empresa_id
                ?
                Number(
                    req.query.empresa_id
                )
                :
                null;


        const estado =
            ajnTexto(
                req.query.estado ||
                "PENDIENTE"
            )
                .toUpperCase();


        const permitidos =
            [
                "PENDIENTE",
                "APROBADO",
                "DESCARTADO"
            ];


        if (
            !permitidos.includes(
                estado
            )
        ) {

            res.status(
                400
            )
                .json({
                    ok:
                        false,

                    mensaje:
                        "estado no valido."
                });


            return;
        }


        const db =
            conexion as any;


        const where:
            string[] =
            [
                "aj.estado = ?"
            ];


        const args:
            any[] =
            [
                estado
            ];


        if (
            empresaId !== null &&
            Number.isFinite(
                empresaId
            ) &&
            empresaId > 0
        ) {

            where.push(
                "aj.empresa_id = ?"
            );


            args.push(
                empresaId
            );
        }


        const [rows]:
            any =
            await db.query(
            `
            SELECT
                aj.id,
                aj.empresa_id,
                aj.valuation_run_id,
                aj.variable_code,
                aj.ajuste_propuesto,
                aj.ajuste_efectivo,
                aj.confianza_modelo,
                aj.procesado,
                aj.estado,
                aj.validado_por_usuario_id,
                aj.fecha_validacion,
                aj.created_at,
                aj.updated_at,

                ne.id AS noticia_id,
                ne.fecha,
                ne.fuente,
                ne.titular,
                ne.resumen_ia,
                ne.tipo_evento,
                ne.url,
                ne.score_noticia

            FROM ajustes_noticias aj

            LEFT JOIN noticia_empresa ne
                ON ne.id =
                   aj.noticia_id

            WHERE
                ${where.join(
                    " AND "
                )}

            ORDER BY
                ne.fecha DESC,
                aj.id DESC
            `,
            args
        );


        res.status(
            200
        )
            .json({
                ok:
                    true,

                total:
                    rows.length,

                ajustes:
                    rows
            });


    } catch (
        error
    ) {

        res.status(
            500
        )
            .json({
                ok:
                    false,

                error:
                    error instanceof Error
                        ?
                        error.message
                        :
                        String(error)
            });
    }
}


// ============================================================================
// EXPRESS - APROBAR / DESCARTAR
// ============================================================================
//
// PATCH /api/ajustes-noticias/:id/decision
//
// Aprobar:
// {
//   "estado": "APROBADO",
//   "usuario_id": 3,
//   "ajuste_efectivo": -0.015
// }
//
// Descartar:
// {
//   "estado": "DESCARTADO",
//   "usuario_id": 3
// }
//
// ============================================================================

export async function
decidirAjusteNoticia(
    req: Request,
    res: Response
): Promise<void> {

    try {

        const id =
            Number(
                req.params.id
            );


        const estado =
            ajnTexto(
                req.body?.estado
            )
                .toUpperCase();


        const usuarioId =
            Number(
                req.body?.usuario_id
            );


        if (
            !Number.isFinite(
                id
            ) ||
            id <= 0 ||
            !Number.isFinite(
                usuarioId
            ) ||
            usuarioId <= 0 ||
            ![
                "APROBADO",
                "DESCARTADO"
            ]
                .includes(
                    estado
                )
        ) {

            res.status(
                400
            )
                .json({
                    ok:
                        false,

                    mensaje:
                        "Parametros invalidos."
                });


            return;
        }


        let ajusteEfectivo:
            number | null =
            null;


        if (
            estado ===
            "APROBADO"
        ) {

            const valor =
                Number(
                    req.body?.ajuste_efectivo
                );


            if (
                !Number.isFinite(
                    valor
                )
            ) {

                res.status(
                    400
                )
                    .json({
                        ok:
                            false,

                        mensaje:
                            "Para APROBADO se requiere ajuste_efectivo numerico."
                    });


                return;
            }


            ajusteEfectivo =
                valor;
        }


        const db =
            conexion as any;


        const [resultado]:
            any =
            await db.query(
            `
            UPDATE ajustes_noticias

            SET
                ajuste_efectivo = ?,
                procesado = 1,
                estado = ?,
                validado_por_usuario_id = ?,
                fecha_validacion = NOW()

            WHERE id = ?
              AND estado = 'PENDIENTE'
            `,
            [
                ajusteEfectivo,
                estado,
                usuarioId,
                id
            ]
        );


        res.status(
            resultado?.affectedRows
                ?
                200
                :
                404
        )
            .json({
                ok:
                    Boolean(
                        resultado?.affectedRows
                    ),

                mensaje:
                    resultado?.affectedRows
                        ?
                        "Decision registrada."
                        :
                        "Ajuste no encontrado o ya procesado."
            });


    } catch (
        error
    ) {

        res.status(
            500
        )
            .json({
                ok:
                    false,

                error:
                    error instanceof Error
                        ?
                        error.message
                        :
                        String(error)
            });
    }
}


// ============================================================================
// EJECUCION DIRECTA
// ============================================================================
//
// npx ts-node insercionAjustesNoticias.ts
//
// Comentar este bloque si solo se utiliza desde Express.
// ============================================================================

ejecutarAjustesNoticias()

    .then(
        resultado => {

            console.log(
                "\n=== AJUSTES_NOTICIAS FINALIZADO ==="
            );


            console.log(
                resultado
            );
        }
    )

    .catch(
        error => {

            console.error(
                "\n=== ERROR CRITICO AJUSTES_NOTICIAS ===",
                error
            );


            process.exitCode =
                1;
        }
    );
