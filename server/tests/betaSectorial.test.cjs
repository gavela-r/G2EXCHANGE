const test = require("node:test");
const assert = require("node:assert/strict");

const { calcularBetaPonderada } = require("../insercionDatos/betaSectorial.cjs");

const semiconductores = [
    { industria: "Semiconductor", betaApalancada: 1.8767658886551528, numeroEmpresas: 675 },
    { industria: "Semiconductor Equip", betaApalancada: 2.1257667102617472, numeroEmpresas: 391 }
];

test("La beta ponderada no depende del orden de las industrias", () => {
    const resultado1 = calcularBetaPonderada(semiconductores);
    const resultado2 = calcularBetaPonderada([...semiconductores].reverse());

    assert.ok(Math.abs(resultado1 - resultado2) < 1e-12);
});

test("La beta ponderada de semiconductores es aproximadamente 1,9681", () => {
    const resultado = calcularBetaPonderada(semiconductores);

    assert.ok(Math.abs(resultado - 1.9681) < 0.0001);
});

test("Se rechazan datos financieros inválidos", () => {
    assert.throws(() => calcularBetaPonderada([]));
    assert.throws(() => calcularBetaPonderada([
        { betaApalancada: NaN, numeroEmpresas: 100 }
    ]));
    assert.throws(() => calcularBetaPonderada([
        { betaApalancada: 1.5, numeroEmpresas: 0 }
    ]));
    assert.throws(() => calcularBetaPonderada([
        { betaApalancada: 1.5 }
    ]));
});

const { agruparBetasPorSector } = require("../insercionDatos/betaSectorial.cjs");

test("Agrupa correctamente varias industrias en un mismo sector", () => {
    const mapeo = {
        Semiconductor: "Semiconductors",
        "Semiconductor Equip": "Semiconductors",
        "Bank (Money Center)": "Banking"
    };

    const datos = [
        ...semiconductores,
        {
            industria: "Bank (Money Center)",
            betaApalancada: 1.2,
            numeroEmpresas: 100
        }
    ];

    const resultado = agruparBetasPorSector(datos, mapeo);

    assert.equal(resultado.size, 2);
    assert.equal(resultado.get("Semiconductors").numeroEmpresas, 1066);
    assert.equal(resultado.get("Semiconductors").industrias.length, 2);
    assert.ok(
        Math.abs(resultado.get("Semiconductors").betaApalancada - 1.9681) < 0.0001
    );
    assert.equal(resultado.get("Banking").betaApalancada, 1.2);
});

test("La agrupación no depende del orden de las industrias", () => {
    const mapeo = {
        Semiconductor: "Semiconductors",
        "Semiconductor Equip": "Semiconductors"
    };

    const original = agruparBetasPorSector(semiconductores, mapeo);
    const invertido = agruparBetasPorSector(
        [...semiconductores].reverse(),
        mapeo
    );

    assert.ok(
        Math.abs(
            original.get("Semiconductors").betaApalancada -
            invertido.get("Semiconductors").betaApalancada
        ) < 1e-12
    );
});
test("El fallback calcula la beta ponderada de industrias equivalentes", () => {
    const equivalencias = [
        "Telecom (Wireless)",
        "Telecom. Services"
    ];

    const datos = [
        {
            industria: "Telecom (Wireless)",
            betaApalancada: 1.2,
            numeroEmpresas: 100
        },
        {
            industria: "Telecom. Services",
            betaApalancada: 1.8,
            numeroEmpresas: 500
        }
    ];

    const seleccionadas = datos.filter(fila =>
        equivalencias.includes(fila.industria)
    );

    const resultado = calcularBetaPonderada(seleccionadas);

    assert.ok(Math.abs(resultado - 1.7) < 1e-12);
});
