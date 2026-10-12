import * as motorServicio from "./src/valoracion/motorServicio";

async function main(): Promise<void> {
    console.log("==================================");
    console.log("G2EXCHANGE - SERVICIO DE VALORACIÓN");
    console.log("==================================");

    const exportaciones = Object.entries(motorServicio);

    for (const [nombre, valor] of exportaciones) {
        console.log(
            `${nombre}: ${typeof valor}`
        );
    }

    const funciones = exportaciones
        .filter(([, valor]) => typeof valor === "function")
        .map(([nombre]) => nombre);

    console.log("\nFUNCIONES DISPONIBLES:");
    console.log(funciones);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
