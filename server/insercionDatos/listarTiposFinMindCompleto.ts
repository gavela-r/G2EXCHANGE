// Recoge los nombres ("type") que usa FinMind para cada partida contable
// consultando VARIAS empresas, y lo guarda todo en tipos_finmind.txt (UTF-8).
//
// Sirve para rellenar alias_finmind en taxonomia_concepto de una sola vez.
//
// Ejecutar con:
// npx ts-node listarTiposFinMindCompleto.ts
//
// Opcional: si tienes token de FinMind, define la variable FINMIND_TOKEN
// (en PowerShell:  $env:FINMIND_TOKEN="tu_token"  antes de ejecutar).

import * as fs from "fs";

// ============================================================================
// 1. CONFIGURACION
// ============================================================================

// Empresas de sectores distintos para que aparezcan la mayoria de tipos posibles
const EMPRESAS: { id: string; nombre: string }[] = [
    { id: "2330", nombre: "TSMC (semiconductores)" },
    { id: "2317", nombre: "Hon Hai (electronica)" },
    { id: "2454", nombre: "MediaTek (semiconductores)" },
    { id: "1301", nombre: "Formosa Plastics (petroquimica)" },
    { id: "2412", nombre: "Chunghwa Telecom (telecomunicaciones)" },
    { id: "2603", nombre: "Evergreen Marine (transporte maritimo)" },
    { id: "1216", nombre: "Uni-President (alimentacion)" },
    { id: "2002", nombre: "China Steel (acero)" },
    { id: "1101", nombre: "Taiwan Cement (cemento)" },
    { id: "2308", nombre: "Delta Electronics (electronica)" },
    { id: "2609", nombre: "Yang Ming (transporte maritimo)" },
    { id: "3008", nombre: "Largan (opticas)" }
];

const DATASETS: { nombre: string; descripcion: string }[] = [
    { nombre: "TaiwanStockFinancialStatements", descripcion: "cuenta de resultados" },
    { nombre: "TaiwanStockBalanceSheet", descripcion: "balance" },
    { nombre: "TaiwanStockCashFlowsStatement", descripcion: "flujo de caja" }
];

const FECHA_INICIO = "2024-01-01";
const ARCHIVO_SALIDA = "tipos_finmind.txt";
const TOKEN = process.env.FINMIND_TOKEN ?? "";

// Palabras clave para destacar los tipos que interesan a los conceptos pendientes
const PALABRAS_CLAVE = /borrow|loan|debt|bond|dividend|share|capital|depreci|amortiz|interest|tax|note/i;

// ============================================================================
// 2. UTILIDADES
// ============================================================================

interface InfoTipo {
    empresas: Set<string>;
    nombresOriginales: Set<string>;
}

const esperar = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function pedirDataset(dataset: string, idEmpresa: string): Promise<any[]> {
    const url =
        `https://api.finmindtrade.com/api/v4/data` +
        `?dataset=${dataset}&data_id=${idEmpresa}&start_date=${FECHA_INICIO}`;

    const headers: Record<string, string> = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
    const respuesta = await fetch(url, { headers });
    const json: any = await respuesta.json();

    if (!json.data) {
        throw new Error(json.msg ?? "respuesta sin datos");
    }

    return json.data as any[];
}

// ============================================================================
// 3. PROCESO PRINCIPAL
// ============================================================================

async function main() {
    // dataset -> (type -> info)
    const resultados = new Map<string, Map<string, InfoTipo>>();
    const errores: string[] = [];

    for (const dataset of DATASETS) {
        resultados.set(dataset.nombre, new Map<string, InfoTipo>());
    }

    for (const dataset of DATASETS) {
        const tipos = resultados.get(dataset.nombre)!;

        for (const empresa of EMPRESAS) {
            try {
                const filas = await pedirDataset(dataset.nombre, empresa.id);

                for (const fila of filas) {
                    const tipo = String(fila.type);

                    // Los tipos acabados en _per son porcentajes del balance: se ignoran
                    if (tipo.endsWith("_per")) continue;

                    if (!tipos.has(tipo)) {
                        tipos.set(tipo, { empresas: new Set<string>(), nombresOriginales: new Set<string>() });
                    }

                    const info = tipos.get(tipo)!;
                    info.empresas.add(empresa.id);
                    if (fila.origin_name) info.nombresOriginales.add(String(fila.origin_name));
                }

                console.log(`OK    ${dataset.nombre} - ${empresa.id} ${empresa.nombre}`);
            } catch (error) {
                const mensaje = error instanceof Error ? error.message : String(error);
                errores.push(`${dataset.nombre} - ${empresa.id}: ${mensaje}`);
                console.error(`ERROR ${dataset.nombre} - ${empresa.id}: ${mensaje}`);
            }

            // Pausa para no saturar la API
            await esperar(400);
        }
    }

    // ------------------------------------------------------------------------
    // Construir el texto de salida
    // ------------------------------------------------------------------------

    const lineas: string[] = [];
    lineas.push("FINMIND - TIPOS DE PARTIDA POR DATASET");
    lineas.push(`Empresas consultadas (${EMPRESAS.length}): ` + EMPRESAS.map(e => e.id).join(", "));
    lineas.push(`Desde: ${FECHA_INICIO}`);
    lineas.push("Formato:  Tipo  [en cuantas empresas aparece]  ->  nombre original");
    lineas.push("");

    if (errores.length > 0) {
        lineas.push("--- ERRORES ---");
        lineas.push(...errores);
        lineas.push("");
    }

    const coincidencias: string[] = [];

    for (const dataset of DATASETS) {
        const tipos = resultados.get(dataset.nombre)!;

        const ordenados = Array.from(tipos.entries()).sort((a, b) => {
            const diferencia = b[1].empresas.size - a[1].empresas.size;
            return diferencia !== 0 ? diferencia : a[0].localeCompare(b[0]);
        });

        lineas.push(`=== ${dataset.nombre} (${dataset.descripcion}) - ${ordenados.length} tipos ===`);

        for (const [tipo, info] of ordenados) {
            const nombres = Array.from(info.nombresOriginales).slice(0, 3).join(" / ");
            const linea = `${tipo}  [${info.empresas.size}/${EMPRESAS.length}]  ->  ${nombres}`;
            lineas.push(linea);

            if (PALABRAS_CLAVE.test(tipo)) {
                coincidencias.push(`${dataset.nombre}: ${linea}`);
            }
        }

        lineas.push("");
    }

    lineas.push("=== TIPOS RELACIONADOS CON DEUDA, DIVIDENDOS, ACCIONES, INTERESES E IMPUESTOS ===");
    lineas.push(...coincidencias);
    lineas.push("");

    // BOM al inicio para que Windows muestre bien los caracteres chinos
    fs.writeFileSync(ARCHIVO_SALIDA, "\uFEFF" + lineas.join("\n"), { encoding: "utf8" });

    console.log(`\nListo. Resultado guardado en ${ARCHIVO_SALIDA}`);
    if (errores.length > 0) {
        console.log(`Hubo ${errores.length} errores: revisa la seccion ERRORES del fichero.`);
    }
}

main().catch(error => {
    console.error("Error critico:", error);
    process.exitCode = 1;
});
