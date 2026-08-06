// =====================================================================
// LISTA_SEGUIMIENTO — Archivo único, todo incluido
// =====================================================================
//
// PASO 1: Antes de nada, ejecutar este SQL contra la base de datos
// (crea las tablas `usuario` y `lista_seguimiento`). Requiere que la
// tabla `empresa` ya exista (id INT PK).
//
// -----------------------------------------------------------------
// CREATE TABLE IF NOT EXISTS usuario (
//   id            INT AUTO_INCREMENT PRIMARY KEY,
//   nombre        VARCHAR(100) NOT NULL,
//   email         VARCHAR(150) NOT NULL UNIQUE,
//   fecha_alta    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
// ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
//
// CREATE TABLE IF NOT EXISTS lista_seguimiento (
//   id              INT AUTO_INCREMENT PRIMARY KEY,
//   usuario_id      INT NOT NULL,
//   empresa_id      INT NOT NULL,
//   notas           VARCHAR(1000) NULL,
//   fecha_marcado   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
//
//   CONSTRAINT fk_lista_seguimiento_usuario
//     FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
//   CONSTRAINT fk_lista_seguimiento_empresa
//     FOREIGN KEY (empresa_id) REFERENCES empresa(id) ON DELETE CASCADE,
//
//   CONSTRAINT uq_lista_seguimiento_usuario_empresa
//     UNIQUE (usuario_id, empresa_id)
// ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
//
// CREATE INDEX idx_lista_seguimiento_usuario ON lista_seguimiento(usuario_id);
// -----------------------------------------------------------------
//
// PASO 2: guardar este archivo como backend/src/listaSeguimiento.ts
//
// PASO 3: instalar dependencias
//   npm install mysql2 express
//
// PASO 4: registrar el router en el servidor principal, por ejemplo:
//   import { listaSeguimientoRouter, ListaSeguimientoService } from "./listaSeguimiento";
//   app.use("/api", listaSeguimientoRouter(new ListaSeguimientoService(pool)));
//
// =====================================================================



// ---------------------------------------------------------------------
// TIPOS
// ---------------------------------------------------------------------

import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { Router, Request, Response } from 'express';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  fechaAlta: Date;
}

export interface ListaSeguimientoItem {
  id: number;
  usuarioId: number;
  empresaId: number;
  notas: string | null;
  fechaMarcado: Date;
}

// Fila enriquecida: la watchlist cruzada con el precio y la última valoración,
// que es lo que de verdad se pinta en el frontend.
export interface ListaSeguimientoConValoracion extends ListaSeguimientoItem {
  nombreEmpresa: string;
  ticker: string;
  decision: "BUY" | "WATCH" | "WAIT" | "DATA_PENDING" | null;
  valorEstimadoBase: number | null;
  precioActual: number | null;
}

export interface AgregarSeguimientoInput {
  usuarioId: number;
  empresaId: number;
  notas?: string;
}

export interface ActualizarNotaInput {
  usuarioId: number;
  empresaId: number;
  notas: string;
}

// ---------------------------------------------------------------------
// SERVICIO (acceso a datos)
// ---------------------------------------------------------------------

export class ListaSeguimientoService {
  constructor(private readonly pool: Pool) {}

  /**
   * Añade una empresa a la watchlist del usuario. Si ya estaba,
   * actualiza la nota en vez de fallar por duplicado (ver constraint
   * uq_lista_seguimiento_usuario_empresa en el SQL de arriba).
   */
  async agregar(input: AgregarSeguimientoInput): Promise<number> {
    const { usuarioId, empresaId, notas } = input;
    const [result] = await this.pool.query<ResultSetHeader>(
      `INSERT INTO lista_seguimiento (usuario_id, empresa_id, notas)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE notas = VALUES(notas)`,
      [usuarioId, empresaId, notas ?? null]
    );
    return result.insertId;
  }

  async quitar(usuarioId: number, empresaId: number): Promise<void> {
    await this.pool.query(
      `DELETE FROM lista_seguimiento WHERE usuario_id = ? AND empresa_id = ?`,
      [usuarioId, empresaId]
    );
  }

  async actualizarNota(input: ActualizarNotaInput): Promise<void> {
    const { usuarioId, empresaId, notas } = input;
    await this.pool.query(
      `UPDATE lista_seguimiento SET notas = ? WHERE usuario_id = ? AND empresa_id = ?`,
      [notas, usuarioId, empresaId]
    );
  }

  /**
   * Devuelve la watchlist del usuario, cruzada con el precio más reciente
   * y la última valoración en escenario BASE de cada empresa.
   *
   * Nota: los nombres exactos de columna (instrumento_principal, escenario,
   * decision...) deben ajustarse al esquema final una vez creadas esas
   * tablas — aquí se asume la convención ya fijada en el contrato técnico
   * (códigos en inglés: BUY/WATCH/WAIT/DATA_PENDING, escenario BASE).
   */
  async obtenerPorUsuario(usuarioId: number): Promise<ListaSeguimientoConValoracion[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT
         ls.id, ls.usuario_id AS usuarioId, ls.empresa_id AS empresaId,
         ls.notas, ls.fecha_marcado AS fechaMarcado,
         e.nombre_empresa AS nombreEmpresa,
         i.ticker AS ticker,
         vr.decision AS decision,
         vr.valor_estimado AS valorEstimadoBase,
         cd.precio_cierre AS precioActual
       FROM lista_seguimiento ls
       JOIN empresa e ON e.id = ls.empresa_id
       LEFT JOIN instrumento i
         ON i.empresa_id = e.id AND i.instrumento_principal = 1
       LEFT JOIN cotizacion_diaria cd
         ON cd.instrumento_id = i.id
         AND cd.fecha = (
           SELECT MAX(fecha) FROM cotizacion_diaria WHERE instrumento_id = i.id
         )
       LEFT JOIN valuation_run vr
         ON vr.empresa_id = e.id AND vr.escenario = 'BASE'
         AND vr.id = (
           SELECT MAX(id) FROM valuation_run
           WHERE empresa_id = e.id AND escenario = 'BASE'
         )
       WHERE ls.usuario_id = ?
       ORDER BY ls.fecha_marcado DESC`,
      [usuarioId]
    );
    return rows as ListaSeguimientoConValoracion[];
  }
}

// ---------------------------------------------------------------------
// RUTAS REST (Express)
// ---------------------------------------------------------------------

export function listaSeguimientoRouter(service: ListaSeguimientoService): Router {
  const router = Router();

  // GET /usuarios/:usuarioId/seguimiento
  router.get("/usuarios/:usuarioId/seguimiento", async (req: Request, res: Response) => {
    const usuarioId = Number(req.params.usuarioId);
    const items = await service.obtenerPorUsuario(usuarioId);
    res.json(items);
  });

  // POST /usuarios/:usuarioId/seguimiento/:empresaId   body: { notas?: string }
  router.post(
    "/usuarios/:usuarioId/seguimiento/:empresaId",
    async (req: Request, res: Response) => {
      const usuarioId = Number(req.params.usuarioId);
      const empresaId = Number(req.params.empresaId);
      const { notas } = req.body as { notas?: string };
      const id = await service.agregar({ usuarioId, empresaId, notas });
      res.status(201).json({ id });
    }
  );

  // PATCH /usuarios/:usuarioId/seguimiento/:empresaId   body: { notas: string }
  router.patch(
    "/usuarios/:usuarioId/seguimiento/:empresaId",
    async (req: Request, res: Response) => {
      const usuarioId = Number(req.params.usuarioId);
      const empresaId = Number(req.params.empresaId);
      const { notas } = req.body as { notas: string };
      await service.actualizarNota({ usuarioId, empresaId, notas });
      res.status(204).send();
    }
  );

  // DELETE /usuarios/:usuarioId/seguimiento/:empresaId
  router.delete(
    "/usuarios/:usuarioId/seguimiento/:empresaId",
    async (req: Request, res: Response) => {
      const usuarioId = Number(req.params.usuarioId);
      const empresaId = Number(req.params.empresaId);
      await service.quitar(usuarioId, empresaId);
      res.status(204).send();
    }
  );

  return router;
}
