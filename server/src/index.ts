import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
    res.json({
        message: "Backend funcionando correctamente"
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
});