import conexion from '../conexion/bd';


interface EmpresaSEC{
    cick_str: number;
    ticker: string;
    title: string;
}

interface RiesgoPaisFMP {
    country: string;
    countryRiskPremium: number | string | null;
}




const paises: Record<string, string> = {
    US: 'Estados Unidos',
    USA: 'Estados Unidos',

    JP: 'Japon',
    JPN: 'Japon',

    TW: 'Taiwan',
    TWN: 'Taiwan',
}

function obtenerNombrePais(codigo: string): string{
    return paises[codigo] || codigo;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function insertarPais(CountryCode: string){
    if(!CountryCode) return;

    const paisesPermitidos = ['US', 'USA', 'JP', 'JPN', 'TW', 'TWN'];
    if(!paisesPermitidos.includes(CountryCode)) return;

    const nombrePais = obtenerNombrePais(CountryCode);
    
    const sql = `INSERT INTO pais (nombre_pais, interes_bono_10_ano, riesgo_extra_por_pais, codigo_iso) VALUES (?, NULL, NULL, ?)
    ON DUPLICATE KEY UPDATE nombre_pais = VALUES(nombre_pais)`;

    try{
        await (conexion as any).query(sql, [nombrePais, CountryCode]);

    }catch(err){
        console.log(err);
    }
    
}

export async function insercionDatos(){
    try{
        const url = 'https://www.sec.gov/files/company_tickers.json';
        const response = await fetch(url);
        const data: Record<string, EmpresaSEC> = await response.json();
        
        for(const key in data){
            const empresa = data[key];
            const ticker = empresa.ticker;
            
            const finnhubUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=d9ktkghr01qshkro93ggd9ktkghr01qshkro93h0`;
            const finnHubResponse = await fetch(finnhubUrl);
            const finHubData = await finnHubResponse.json();
            
            if(!finHubData || !finHubData.country){
                console.log("No se encontro ningun pais");
                await delay(1000);
                continue;
            }
            
            await insertarPais(finHubData.country);

            console.log(`Pais insertado correctamente: ${finHubData.country}`);
        }

    }catch(error){

    }
}



async function insertarBono10AnosUS(){
    try{
        const url = 'https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=3b7d9daac80dd66bb98c249ab369ee90&file_type=json&sort_order=desc&limit=10';
        const response = await fetch(url);
        const data = await response.json();

        const ultimaObservacion = data.observations[0];

        if(!ultimaObservacion){
            console.log("Fredd no devolvio ninguna observacion");
            return;
        }

        const { date: fecha, value: valor} = ultimaObservacion;

        if(valor == '.'){
            console.log("sin datos validos");
            return;
        }

        const sql = "UPDATE pais SET interes_bono_10_ano = ?, fecha_publicacion_bono10 = ? WHERE codigo_iso = 'US'";

        await (conexion as any).query(sql, [valor, fecha])
        console.log(`Bono 10 años actualuzado correctamente: ${valor}%, ${fecha}`);

    }catch(error){
        console.error('Error al insertar bono de 10 años:', error);
    }
}

async function insertarTipoInrteresBancoCentralUS(){
    try{
        const url = 'https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARL&api_key=3b7d9daac80dd66bb98c249ab369ee90&file_type=json&sort_order=desc&limit=10';
        const response = await fetch(url);
        const data = await response.json();

        const ultimaObaservacion = data.observations[0];

        if(!ultimaObaservacion){
            console.log("Fred no devolvio ninguna observacion");
            return;
        }

        const { date: fecha, value: valor} = ultimaObaservacion;

        if(valor === '.'){
            console.log("sin datos vaidos");
            return;
        }

        const sql = "UPDATE pais SET tipo_interes_banco_central = ?, fecha_publicacion_banco_central = ? WHERE codigo_iso = 'US'";
        await (conexion as any).query(sql, [valor, fecha]);

        console.log(`Interes bannco central actualizado correctamente: ${valor}%, ${fecha}`);
    }catch(error){
        console.log("Erro al insertar ", error);
    }
}



async function insertarRiesgoExtraPorPais(){
    try{
        const url = 'https://financialmodelingprep.com/stable/market-risk-premium?apikey=VgUgu5TN5u9p1pqNvekk9CehtWUUOp1J';
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Financial Modeling Prep respondio con ${response.status}`);
        }

        const data: RiesgoPaisFMP[] = await response.json();

        if (!Array.isArray(data)) {
            throw new Error('Financial Modeling Prep no devolvio una lista de riesgos por pais');
        }

        // codigo_iso de la base de datos -> nombre que devuelve Financial Modeling Prep.
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
    }catch(error){
        console.log("Error al insertar el riesgo extra por pais:", error);
    }
}

async function insertarBono10AnosJP(){
    try{
        const url = "https://api.stlouisfed.org/fred/series/observations?series_id=IRLTLT01JPM156N&api_key=3b7d9daac80dd66bb98c249ab369ee90&file_type=json&sort_order=desc&limit=1";
        const response = await fetch(url);
        const data = await response.json();

        const ultimaObservacion = data.observations[0];

        if(!ultimaObservacion){
            console.log("Fred no devolvio ninguna onbservacion");
            return;
        }

        const {date: fecha, value: valor} = ultimaObservacion;

        if(valor === '.'){
            console.log("sin datos validos");
            return;
        }

        const sql = "UPDATE pais SET interes_bono_10_ano = ?, fecha_publicacion_bono10 = ? WHERE codigo_iso = 'JP'";

        await (conexion as any).query(sql, [valor, fecha]);
        console.log("interes actualizado correctamente");

    }catch(error){
        console.log("Error en el servidor, " + error);
    }
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

async function insertarTipoInteresBancoCentralJP(){
    try{
        const anoActual = new Date().getFullYear();

        const url = `https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en&db=IR01&startDate=${anoActual}01&endDate=${anoActual}12&code=MADR1Z@D`;

        const response = await fetch(url);

        if(!response.ok){
            throw new Error(`Banco de Japon respondio con ${response.status}`);
        }

        const data = await response.json();

        if(data.STATUS !== 200 || !Array.isArray(data.RESULTSET)){
            throw new Error(data.MESSAGE || 'El Banco de Japon no devolvio datos');
        }

        const serie = data.RESULTSET[0];

        if(!serie || !Array.isArray(serie.VALUES.VALUES) || !Array.isArray(serie.VALUES.SURVEY_DATES)){
            throw new Error('Formato de respuesta del Banco de Japon no valido');
        }

        let ultimoValor: number | null = null;
        let ultimaFecha: string | null = null;

        for(let i = serie.VALUES.VALUES.length - 1; i >= 0; i--){
            const valorOriginal = serie.VALUES.VALUES[i];

            if(valorOriginal === null || valorOriginal === ''){
                continue;
            }

            const valor = parseFloat(String(valorOriginal).replace(',', '.'));

            if(!Number.isNaN(valor)){
                ultimoValor = valor;
                ultimaFecha = String(serie.VALUES.SURVEY_DATES[i]);
                break;
            }
        }

        if(ultimoValor === null || !ultimaFecha){
            console.log('El Banco de Japon no devolvio ningun valor valido');
            return;
        }

        const fechaFormateada = `${ultimaFecha.slice(0, 4)}-${ultimaFecha.slice(4, 6)}-${ultimaFecha.slice(6, 8)}`;

        const sql = `
            UPDATE pais
            SET tipo_interes_banco_central = ?,
                fecha_publicacion_banco_central = ?
            WHERE codigo_iso IN ('JP', 'JPN')
        `;

        await (conexion as any).query(sql, [
            ultimoValor,
            fechaFormateada
        ]);

        console.log(
            `Tipo de interes del Banco de Japon actualizado: ${ultimoValor}%, ${fechaFormateada}`
        );

    }catch(error){
        console.error(
            'Error al insertar el tipo de interes del Banco de Japon:',
            error
        );
    }
}

insertarTipoInteresBancoCentralJP();


// insertarTipoInteresBancoCentralJP();
// insertarBono10AnosUS();
// insertarTipoInrteresBancoCentralUS();
// insercionDatos();
// insertarRiesgoExtraPorPais();
// insertarBono10AnosJP();

