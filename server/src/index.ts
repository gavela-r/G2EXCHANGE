import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Router } from "express";

import { actualizarCotizacionesUSA } from "../insercionDatos/insercionDatosCotizacionDiaria";

import {
    importarDatosValoracion,
    obtenerRutaMotor
} from "./valoracion/motorServicio";

dotenv.config();

const app = express();
const router = Router();

app.use(cors());
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
// 2. Aplica las sobrescrituras manuales del JSON.
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
            templateCode: "03",
            ...(opciones ?? {})
        };

        // ----------------------------------------------------
        // MYSQL + PRIORIDAD DE DATOS MANUALES
        // ----------------------------------------------------

        const input = await importarDatosValoracion(
            runId,
            opcionesImportacion,
            payload
        );

        // ----------------------------------------------------
        // CARGAR MOTOR FINANCIERO COMPILADO
        // ----------------------------------------------------

        const rutaMotor = obtenerRutaMotor();

        const motor = require(rutaMotor);

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
            motor: "G2EXCHANGE v1.5",
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

app.use(router);

// ============================================================
// INICIAR SERVIDOR
// ============================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(
        `Servidor escuchando en puerto ${PORT}`
    );
});