import conexion from '../conexion/bd';

/* ============================================================
   TIPOS
   ============================================================ */

interface EmpresaSEC {
    cick_str: number;
    ticker: string;
    title: string;
}

interface RiesgoPaisFMP {
    country: string;
    countryRiskPremium: number | string | null;
}

interface DatoPais {
    valor: number;
    fecha: string;
    fuente: string;
}

interface ObservacionFred {
    date: string;
    value: string;
}

interface RespuestaFred {
    observations?: ObservacionFred[];
    error_code?: number;
    error_message?: string;
}

interface RespuestaBOJ {
    STATUS: number;
    MESSAGE?: string;
    RESULTSET?: Array<{
        SERIES_CODE: string;
        SURVEY_DATES: Array<number | string>;
        VALUES: Array<number | string | null>;
    }>;
}

interface ConfiguracionFiscal {
    valor: number;
    fecha: string;
    fuente: string;
    descripcion: string;
}

interface ResultadoMysql {
    affectedRows?: number;
    changedRows?: number;
}

/* ============================================================
   UTILIDADES GENÉRICAS
   ============================================================ */

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_REINTENTOS = 3;
const TIMEOUT_MS = 20_000;

async function fetchConReintentos(
    url: string,
    init: RequestInit = {},
    reintentos = MAX_REINTENTOS
): Promise<Response> {
    let ultimoError: unknown;

    for (let intento = 1; intento <= reintentos; intento++) {
        const controlador = new AbortController();
        const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                ...init,
                signal: controlador.signal,
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'Radar-Global-Inversiones/1.0',
                    ...(init.headers ?? {}),
                },
            });

            clearTimeout(temporizador);

            if (response.status === 429 || response.status >= 500) {
                throw new Error(`HTTP ${response.status} en ${url}`);
            }

            if (!response.ok) {
                const cuerpo = await response.text();
                throw new Error(`HTTP ${response.status} en ${url}. Respuesta: ${cuerpo.slice(0, 500)}`);
            }

            return response;
        } catch (error) {
            clearTimeout(temporizador);
            ultimoError = error;

            if (intento < reintentos) {
                await delay(1000 * 2 ** (intento - 1));
            }
        }
    }

    throw ultimoError instanceof Error ? ultimoError : new Error(`No se pudo consultar ${url}`);
}

async function obtenerJson(url: string): Promise<unknown> {
    const response = await fetchConReintentos(url);
    const texto = await response.text();

    if (!texto.trim()) {
        throw new Error(`Respuesta vacia de ${url}`);
    }

    try {
        return JSON.parse(texto) as unknown;
    } catch {
        throw new Error(`La respuesta de ${url} no es JSON valido: ${texto.slice(0, 500)}`);
    }
}

function convertirNumero(valor: unknown): number | null {
    if (valor === null || valor === undefined) return null;

    if (typeof valor === 'number') {
        return Number.isFinite(valor) ? valor : null;
    }

    const texto = String(valor).replace(/,/g, '').replace(/%/g, '').trim();

    if (
        texto === '' || texto === '.' || texto === '-' || texto === '--' ||
        texto.toLowerCase() === 'null' || texto.toLowerCase() === 'na' || texto.toLowerCase() === 'nd'
    ) {
        return null;
    }

    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : null;
}

function validarPorcentaje(nombreDato: string, valor: number, minimo: number, maximo: number): void {
    if (valor < minimo || valor > maximo) {
        throw new Error(
            `${nombreDato}: el valor ${valor} está fuera del rango esperado (${minimo} a ${maximo}). ` +
            `Probablemente se ha parseado un campo incorrecto.`
        );
    }
}

function mostrarResultadoUpdate(nombre: string, resultado: ResultadoMysql): void {
    const encontradas = resultado?.affectedRows ?? 0;
    const modificadas = resultado?.changedRows ?? 0;

    console.log(`${nombre}: filas encontradas=${encontradas}, filas modificadas=${modificadas}`);

    if (encontradas === 0) {
        throw new Error(`${nombre}: no existe en la tabla pais ninguna fila con el codigo_iso esperado`);
    }
}

/* ============================================================
   PAÍSES (nombres + inserción inicial de filas)
   ============================================================ */

const paises: Record<string, string> = {
    US: 'Estados Unidos',
    USA: 'Estados Unidos',
    JP: 'Japon',
    JPN: 'Japon',
    TW: 'Taiwan',
    TWN: 'Taiwan',
};

function obtenerNombrePais(codigo: string): string {
    return paises[codigo] || codigo;
}

async function insertarPais(countryCode: string) {
    if (!countryCode) return;

    const paisesPermitidos = ['US', 'USA', 'JP', 'JPN', 'TW', 'TWN'];
    if (!paisesPermitidos.includes(countryCode)) return;

    const nombrePais = obtenerNombrePais(countryCode);

    const sql = `
        INSERT INTO pais (nombre_pais, interes_bono_10_ano, riesgo_extra_por_pais, codigo_iso)
        VALUES (?, NULL, NULL, ?)
        ON DUPLICATE KEY UPDATE nombre_pais = VALUES(nombre_pais)
    `;

    try {
        await (conexion as any).query(sql, [nombrePais, countryCode]);
    } catch (err) {
        console.log(err);
    }
}

export async function insercionDatos() {
    try {
        const url = 'https://www.sec.gov/files/company_tickers.json';
        const response = await fetch(url);
        const data: Record<string, EmpresaSEC> = await response.json();

        for (const key in data) {
            const empresa = data[key];
            const ticker = empresa.ticker;

            const finnhubUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${process.env.FINNHUB_API_KEY}`;
            const finnHubResponse = await fetch(finnhubUrl);
            const finHubData = await finnHubResponse.json();

            if (!finHubData || !finHubData.country) {
                console.log('No se encontro ningun pais');
                await delay(1000);
                continue;
            }

            await insertarPais(finHubData.country);
            console.log(`Pais insertado correctamente: ${finHubData.country}`);
        }
    } catch (error) {
        console.error('Error en insercionDatos:', error);
    }
}

async function insertarRiesgoExtraPorPais() {
    try {
        const url = `https://financialmodelingprep.com/stable/market-risk-premium?apikey=${process.env.FMP_API_KEY}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Financial Modeling Prep respondio con ${response.status}`);
        }

        const data: RiesgoPaisFMP[] = await response.json();

        if (!Array.isArray(data)) {
            throw new Error('Financial Modeling Prep no devolvio una lista de riesgos por pais');
        }

        const paisesPermitidos: Record<string, string> = {
            US: 'United States',
            JP: 'Japan',
            TW: 'Taiwan',
        };

        const sql = 'UPDATE pais SET riesgo_extra_por_pais = ? WHERE codigo_iso = ?';

        for (const [codigoIso, nombrePais] of Object.entries(paisesPermitidos)) {
            const riesgoPais = data.find(({ country }) => country === nombrePais);
            const riesgoExtra = Number(riesgoPais?.countryRiskPremium);

            if (!riesgoPais || !Number.isFinite(riesgoExtra)) {
                console.log(`No se encontro un riesgo extra valido para ${nombrePais}`);
                continue;
            }

            await (conexion as any).query(sql, [riesgoExtra, codigoIso]);
            console.log(`Riesgo extra actualizado para ${nombrePais}: ${riesgoExtra}%`);
        }
    } catch (error) {
        console.log('Error al insertar el riesgo extra por pais:', error);
    }
}

/* ============================================================
   FRED (fuente compartida por EEUU y Japón)
   ============================================================ */

async function obtenerUltimaObservacionFred(serie: string): Promise<DatoPais> {
    const apiKey = process.env.FRED_API_KEY;

    if (!apiKey) {
        throw new Error('Falta FRED_API_KEY');
    }

    const parametros = new URLSearchParams({
        series_id: serie,
        api_key: apiKey,
        file_type: 'json',
        sort_order: 'desc',
        limit: '30',
    });

    const url = `https://api.stlouisfed.org/fred/series/observations?${parametros.toString()}`;

    const data = await obtenerJson(url) as RespuestaFred;

    if (data.error_code || !Array.isArray(data.observations)) {
        throw new Error(data.error_message ?? `FRED no devolvio observations para ${serie}`);
    }

    const observacion = data.observations.find(elemento => convertirNumero(elemento.value) !== null);

    if (!observacion) {
        throw new Error(`FRED no devolvio ningun valor valido para ${serie}`);
    }

    const valor = convertirNumero(observacion.value)!;

    return {
        valor,
        fecha: observacion.date,
        fuente: `FRED ${serie}`,
    };
}

/* ============================================================
   EEUU
   ============================================================ */

async function insertarBono10AnosUS() {
    try {
        const { valor, fecha } = await obtenerUltimaObservacionFred('DGS10');

        const sql = 'UPDATE pais SET interes_bono_10_ano = ?, fecha_publicacion_bono10 = ? WHERE codigo_iso = \'US\'';
        await (conexion as any).query(sql, [valor, fecha]);

        console.log(`Bono 10 años EEUU actualizado correctamente: ${valor}%, ${fecha}`);
    } catch (error) {
        console.error('Error al insertar bono de 10 años de EEUU:', error);
    }
}

async function insertarTipoInteresBancoCentralUS() {
    try {
        const { valor, fecha } = await obtenerUltimaObservacionFred('DFEDTARL');

        const sql = 'UPDATE pais SET tipo_interes_banco_central = ?, fecha_publicacion_banco_central = ? WHERE codigo_iso = \'US\'';
        await (conexion as any).query(sql, [valor, fecha]);

        console.log(`Interes banco central EEUU actualizado correctamente: ${valor}%, ${fecha}`);
    } catch (error) {
        console.error('Error al insertar interes banco central de EEUU:', error);
    }
}

/* ============================================================
   JAPÓN
   ============================================================ */

async function insertarBono10AnosJP() {
    try {
        const { valor, fecha } = await obtenerUltimaObservacionFred('IRLTLT01JPM156N');

        const sql = `
            UPDATE pais
            SET interes_bono_10_ano = ?, fecha_publicacion_bono10 = ?
            WHERE codigo_iso IN ('JP', 'JPN')
        `;

        await (conexion as any).query(sql, [valor, fecha]);
        console.log(`Bono 10 años Japón actualizado correctamente: ${valor}%, ${fecha}`);
    } catch (error) {
        console.error('Error al insertar bono de 10 años de Japón:', error);
    }
}

async function insertarTipoInteresBancoCentralJP() {
    try {
        const anoActual = new Date().getFullYear();
        const url = `https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en&db=IR01&startDate=${anoActual}01&endDate=${anoActual}12&code=MADR1Z@D`;

        const data = await obtenerJson(url) as RespuestaBOJ;

        if (data.STATUS !== 200 || !Array.isArray(data.RESULTSET)) {
            throw new Error(data.MESSAGE || 'El Banco de Japon no devolvio datos');
        }

        const serie = data.RESULTSET[0];

        if (!serie || !Array.isArray(serie.VALUES) || !Array.isArray(serie.SURVEY_DATES)) {
            throw new Error('Formato de respuesta del Banco de Japon no valido');
        }

        let ultimoValor: number | null = null;
        let ultimaFecha: string | null = null;

        for (let i = serie.VALUES.length - 1; i >= 0; i--) {
            const valor = convertirNumero(serie.VALUES[i]);

            if (valor !== null) {
                ultimoValor = valor;
                ultimaFecha = String(serie.SURVEY_DATES[i]);
                break;
            }
        }

        if (ultimoValor === null || !ultimaFecha) {
            console.log('El Banco de Japon no devolvio ningun valor valido');
            return;
        }

        const fechaFormateada = `${ultimaFecha.slice(0, 4)}-${ultimaFecha.slice(4, 6)}-${ultimaFecha.slice(6, 8)}`;

        const sql = `
            UPDATE pais
            SET tipo_interes_banco_central = ?, fecha_publicacion_banco_central = ?
            WHERE codigo_iso IN ('JP', 'JPN')
        `;

        await (conexion as any).query(sql, [ultimoValor, fechaFormateada]);
        console.log(`Tipo de interes del Banco de Japon actualizado: ${ultimoValor}%, ${fechaFormateada}`);
    } catch (error) {
        console.error('Error al insertar el tipo de interes del Banco de Japon:', error);
    }
}

/* ============================================================
   TAIWÁN
   ============================================================ */

async function obtenerBono10AnosTW(): Promise<DatoPais> {
    const url = 'https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=EG43M01en';

    const data = await obtenerJson(url) as { data?: { dataSets?: Array<Array<string>> } };
    const filas = data.data?.dataSets;

    if (!Array.isArray(filas) || filas.length === 0) {
        throw new Error('EG43M01en no devolvió dataSets');
    }

    // Columna 20 (la última): "Bond market-10-year gov't bond rates in secondary market"
    const INDICE_BONO_10_ANOS_SECUNDARIO = 20;

    for (let i = filas.length - 1; i >= 0; i--) {
        const fila = filas[i];
        const periodo = fila[0]; // "2026M06"
        const valor = convertirNumero(fila[INDICE_BONO_10_ANOS_SECUNDARIO]);

        if (valor !== null) {
            validarPorcentaje('Bono taiwanés a 10 años (mercado secundario)', valor, -5, 20);

            const [anio, mes] = periodo.split('M');
            const fecha = `${anio}-${mes.padStart(2, '0')}-01`;

            return { valor, fecha, fuente: 'CBC Statistical Database EG43M01en (secondary market)' };
        }
    }

    throw new Error('EG43M01en no contiene ningún valor válido para el bono a 10 años');
}

async function insertarBono10AnosTW() {
    try {
        const { valor, fecha } = await obtenerBono10AnosTW();

        const sql = `
            UPDATE pais
            SET interes_bono_10_ano = ?, fecha_publicacion_bono10 = ?
            WHERE codigo_iso IN ('TW', 'TWN')
        `;

        await (conexion as any).query(sql, [valor, fecha]);
        console.log(`Bono 10 años Taiwán actualizado correctamente: ${valor}%, ${fecha}`);
    } catch (error) {
        console.error('Error al insertar bono de 10 años de Taiwán:', error);
    }
}

async function obtenerTipoInteresTW(): Promise<DatoPais> {
    const url = 'https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=EG2AM01en';

    const data = await obtenerJson(url) as { data?: { dataSets?: Array<Array<string>> } };
    const filas = data.data?.dataSets;

    if (!Array.isArray(filas) || filas.length === 0) {
        throw new Error('EG2AM01en no devolvió dataSets');
    }

    // Columna 1: "Discount rate"
    const INDICE_DISCOUNT_RATE = 1;

    for (let i = filas.length - 1; i >= 0; i--) {
        const fila = filas[i];
        const periodo = fila[0];
        const valor = convertirNumero(fila[INDICE_DISCOUNT_RATE]);

        if (valor !== null) {
            validarPorcentaje('Tipo de interés banco central Taiwán (Discount Rate)', valor, -5, 20);

            const [anio, mes] = periodo.split('M');
            const fecha = `${anio}-${mes.padStart(2, '0')}-01`;

            return { valor, fecha, fuente: 'CBC Statistical Database EG2AM01en (Discount Rate)' };
        }
    }

    throw new Error('EG2AM01en no contiene ningún valor válido para el Discount Rate');
}

async function insertarTipoInteresBancoCentralTW() {
    try {
        const { valor, fecha } = await obtenerTipoInteresTW();

        const sql = `
            UPDATE pais
            SET tipo_interes_banco_central = ?, fecha_publicacion_banco_central = ?
            WHERE codigo_iso IN ('TW', 'TWN')
        `;

        await (conexion as any).query(sql, [valor, fecha]);
        console.log(`Tipo de interés banco central Taiwán actualizado correctamente: ${valor}%, ${fecha}`);
    } catch (error) {
        console.error('Error al insertar tipo de interés banco central de Taiwán:', error);
    }
}

/* ============================================================
   TASAS IMPOSITIVAS
   ============================================================ */

const TASAS_IMPOSITIVAS_2026: Record<'US' | 'JP' | 'TW', ConfiguracionFiscal> = {
    US: {
        valor: 25.57,
        fecha: '2026-01-01',
        fuente: 'OECD Corporate Income Tax Statistics 2026',
        descripcion: 'Combined statutory corporate income tax rate',
    },
    JP: {
        valor: 29.74,
        fecha: '2026-01-01',
        fuente: 'OECD Corporate Income Tax Statistics 2026',
        descripcion: 'Combined statutory corporate income tax rate',
    },
    TW: {
        valor: 20.00,
        fecha: '2026-01-01',
        fuente: 'Taiwan Ministry of Finance',
        descripcion: 'Profit-Seeking Enterprise Income Tax general rate',
    },
};

async function actualizarTasaImpositivaPais(
    codigosIso: [string, string],
    configuracion: ConfiguracionFiscal
): Promise<void> {
    validarPorcentaje(`Tasa impositiva ${codigosIso[0]}`, configuracion.valor, 0, 100);

    const sql = 'UPDATE pais SET tasa_impositiva = ? WHERE codigo_iso IN (?, ?)';

    const [resultado] = await (conexion as any).query(sql, [
        configuracion.valor,
        codigosIso[0],
        codigosIso[1],
    ]);

    mostrarResultadoUpdate(`Tasa impositiva ${codigosIso[0]}`, resultado);
    console.log(`OK tasa impositiva ${codigosIso[0]}: ${configuracion.valor}% - ${configuracion.fuente}`);
}

export async function insertarTasasImpositivas(): Promise<void> {
    await actualizarTasaImpositivaPais(['US', 'USA'], TASAS_IMPOSITIVAS_2026.US);
    await actualizarTasaImpositivaPais(['JP', 'JPN'], TASAS_IMPOSITIVAS_2026.JP);
    await actualizarTasaImpositivaPais(['TW', 'TWN'], TASAS_IMPOSITIVAS_2026.TW);
}

/* ============================================================
   EJECUCIÓN
   ============================================================ */


    insercionDatos();
    insertarRiesgoExtraPorPais();

    insertarBono10AnosUS();
    insertarTipoInteresBancoCentralUS();

    insertarBono10AnosJP();
    insertarTipoInteresBancoCentralJP();

    insertarBono10AnosTW();
    insertarTipoInteresBancoCentralTW();

    insertarTasasImpositivas();
