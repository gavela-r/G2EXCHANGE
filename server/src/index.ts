import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Router } from "express";
import {actualizarCotizacionesUSA} from "../insercionDatos/insercionDatosCotizacionDiaria"

dotenv.config();

const app = express();
const router = Router();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
    res.json({
        message: "Backend funcionando correctamente"
    });
});

router.post(
    "/insercionDatos/usa/actualizar", actualizarCotizacionesUSA
)

app.use(router)

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
});

