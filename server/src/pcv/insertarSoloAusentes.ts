import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface PcvPendiente {
  informeId: number;
  conceptoEstandarId: number;
  conceptoOriginal: string;
  importe: number;
  nivelConfianza: string;
}

/** Inserts missing concepts, fills a single NULL, preserves non-NULL values and historical duplicates. */
export async function insertarSoloPCVAusentes(pool: Pick<Pool, 'getConnection'>, rows: PcvPendiente[]): Promise<number> {
  const unique = new Map<string, PcvPendiente>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.informeId) || row.informeId <= 0 || !Number.isSafeInteger(row.conceptoEstandarId) || row.conceptoEstandarId <= 0) {
      throw new Error('Identidad PCV inválida');
    }
    if (!Number.isFinite(row.importe)) throw new Error('Importe PCV no finito');
    const key = `${row.informeId}|${row.conceptoEstandarId}`;
    if (unique.has(key) && unique.get(key)!.importe !== row.importe) throw new Error('Candidatos PCV contradictorios');
    unique.set(key, row);
  }
  if (!unique.size) return 0;

  const connection: PoolConnection = await pool.getConnection();
  let inserted = 0;
  try {
    await connection.beginTransaction();
    for (const id of [...new Set(rows.map(r => r.informeId))].sort((a,b) => a-b)) {
      await connection.query('SELECT id FROM informe_financiero WHERE id=? FOR UPDATE', [id]);
    }
    for (const row of unique.values()) {
      const [existing] = await connection.query<RowDataPacket[]>(
        `SELECT id,importe FROM partida_contable_valor WHERE informe_id=? AND concepto_estandar_id=? ORDER BY id FOR UPDATE`,
        [row.informeId, row.conceptoEstandarId]
      );
      if (existing.length) {
        // A single stored NULL is missing data, not a valid value. Fill it
        // without changing non-NULL rows or collapsing historical duplicates.
        if (existing.length === 1 && existing[0].importe === null) {
          await connection.query<ResultSetHeader>(
            `UPDATE partida_contable_valor SET concepto=?,importe=?,nivel_confianza=? WHERE id=? AND importe IS NULL`,
            [row.conceptoOriginal, row.importe, row.nivelConfianza, existing[0].id]
          );
          inserted++;
        }
        continue;
      }
      await connection.query<ResultSetHeader>(
        `INSERT INTO partida_contable_valor (informe_id,concepto_estandar_id,concepto,importe,nivel_confianza) VALUES (?,?,?,?,?)`,
        [row.informeId, row.conceptoEstandarId, row.conceptoOriginal, row.importe, row.nivelConfianza]
      );
      inserted++;
    }
    await connection.commit();
    return inserted;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
