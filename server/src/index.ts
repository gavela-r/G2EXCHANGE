import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Router } from "express";

import { actualizarCotizacionesUSA } from "../insercionDatos/insercionDatosCotizacionDiaria";

import {
    importarDatosValoracion
} from "./valoracion/motorServicio";
import { cargarMotor } from "./valoracion/rutas";
import { landingRouter } from "./landing";
import { screenerRouter } from "./screener";

dotenv.config();

const app = express();
const router = Router();

// En el servidor público solo se acepta la web de Cloudflare Pages (ALLOWED_ORIGIN)
app.use(cors(process.env.ALLOWED_ORIGIN ? { origin: process.env.ALLOWED_ORIGIN } : undefined));
app.use(express.json({ limit: "2mb" }));

// ============================================================
// COMPROBACIÓN DEL SERVIDOR
// ============================================================

app.get("/", (_req, res) => {
    res.json({
        message: "Backend funcionando correctamente"
    });
});

// ============================================================
// ACTUALIZACIÓN DE COTIZACIONES
// Ruta original: se conserva sin modificaciones.
// ============================================================

router.post(
    "/insercionDatos/usa/actualizar",
    actualizarCotizacionesUSA
);

// ============================================================
// G2EXCHANGE — API DE VALORACIÓN DCF
//
// POST /api/valoracion
//
// 1. Lee los datos históricos de MySQL.
// 2. Comprueba identidad, versión y evidencia congelada.
// 3. Ejecuta el motor financiero.
// 4. Devuelve el resultado sin escribir en MySQL.
// ============================================================

router.post("/api/valoracion", async (req, res) => {

    try {

        const {
            runId,
            opciones,
            ...payload
        } = req.body ?? {};

        // ----------------------------------------------------
        // VALIDACIÓN DEL IDENTIFICADOR
        // ----------------------------------------------------

        if (
            !Number.isInteger(runId) ||
            runId <= 0
        ) {
            res.status(400).json({
                ok: false,
                error: "runId debe ser un entero positivo"
            });
            return;
        }

        // ----------------------------------------------------
        // CONFIGURACIÓN DE IMPORTACIÓN
        // ----------------------------------------------------

        const opcionesImportacion = {
            financialUnit: "UNITS" as const,
            sharesUnit: "UNITS" as const,
            ...(opciones ?? {})
        };

        // ----------------------------------------------------
        // INPUT HISTÓRICO CONGELADO
        // ----------------------------------------------------

        const input = await importarDatosValoracion(
            runId,
            opcionesImportacion,
            payload
        );

        // ----------------------------------------------------
        // CARGAR MOTOR FINANCIERO COMPILADO
        // ----------------------------------------------------

        const motor = cargarMotor();

        if (typeof motor.valorar !== "function") {
            throw new Error(
                "El motor financiero no exporta valorar()"
            );
        }

        // ----------------------------------------------------
        // EJECUTAR VALORACIÓN
        // ----------------------------------------------------

        const resultado = await motor.valorar(input);

        // ----------------------------------------------------
        // RESPUESTA
        // ----------------------------------------------------

        res.json({
            ok: true,
            runId,
            motor: resultado.motor,
            resultado
        });

    } catch (error: unknown) {

        const mensaje =
            error instanceof Error
                ? error.message
                : String(error);

        console.error(
            "[G2EXCHANGE] Error de valoración:",
            error
        );

        res.status(500).json({
            ok: false,
            error: mensaje
        });
    }
});

// ============================================================
// ACTIVAR RUTAS
// ============================================================

// Con SOLO_LECTURA=1 (servidor público) no se exponen las rutas que insertan datos o lanzan el motor
if (process.env.SOLO_LECTURA !== "1") {
    app.use(router);
}
app.use(landingRouter);
app.use(screenerRouter);

// ============================================================
// INICIAR SERVIDOR
// ============================================================

const PORT = Number(process.env.PORT || 3000);
// En la VM se pone HOST=127.0.0.1 para que la API solo sea accesible a través de Caddy
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
    console.log(
        `Servidor escuchando en puerto ${PORT}`
    );
});
