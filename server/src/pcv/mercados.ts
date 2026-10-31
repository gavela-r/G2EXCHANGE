// Resolución de mercado dependiente del país. «TSE» es ambiguo: Tokyo Stock Exchange en Japón y Taiwan Stock Exchange
// en Taiwán. Resolverlo sin el país asignó 299 instrumentos taiwaneses a la bolsa de Tokio y, con ellos, documentos
// EDINET de emisores japoneses a empresas de Taiwán (identidad cruzada).
export function normalizarMercado(mercado: unknown): string {
    return String(mercado || "").trim().toUpperCase();
}

export function normalizarNombreMercado(nombre: unknown, pais?: string): string {
    const mercado = normalizarMercado(nombre);
    const p = String(pais || "").trim().toUpperCase();
    if (mercado === "TSE" && ["TW", "TAIWAN", "TAIWÁN"].includes(p)) return "TAIWAN STOCK EXCHANGE";
    if (mercado === "TSE" && p && !["JP", "JAPON", "JAPÓN", "JAPAN"].includes(p)) return "";
    const equivalencias: Record<string, string> = {
        // Estados Unidos
        "NASDAQ": "NASDAQ STOCK MARKET",
        "NYSE": "NEW YORK STOCK EXCHANGE",
        "NYSE MKT": "NYSE AMERICAN",
        "NYSE AMERICAN": "NYSE AMERICAN",
        // Japón
        "TSE": "TOKYO STOCK EXCHANGE",
        "TOKYO": "TOKYO STOCK EXCHANGE",
        // Taiwán
        "TWSE": "TAIWAN STOCK EXCHANGE",
        "TPEX": "TAIPEI EXCHANGE"
    };
    return equivalencias[mercado] || mercado;
}
