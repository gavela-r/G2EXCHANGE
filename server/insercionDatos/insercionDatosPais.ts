import conexion from '../conexion/bd';


interface EmpresaSEC{
    cick_str: number;
    ticker: string;
    title: string;
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

insercionDatos()