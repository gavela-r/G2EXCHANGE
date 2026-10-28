const { test } = require('node:test');
const assert = require('node:assert/strict');
const { insertarSoloPCVAusentes } = require('../dist/src/pcv/insertarSoloAusentes');

function fakePool(initial = []) {
  const rows = new Map(initial.map(r => [`${r.informe_id}|${r.concepto_estandar_id}`, { ...r }]));
  const duplicateKeys = new Set(initial.filter(r => r.duplicate).map(r => `${r.informe_id}|${r.concepto_estandar_id}`));
  let snapshot;
  let rollbacks = 0;
  let commits = 0;
  let failOnInsert = false;
  const conn = {
    async beginTransaction() { snapshot = new Map([...rows].map(([k, v]) => [k, { ...v }])); },
    async query(sql, params) {
      if (sql.startsWith('SELECT id FROM informe_financiero')) return [[{id: params[0]}], []];
      if (sql.startsWith('SELECT id,importe FROM partida_contable_valor')) {
        const row = rows.get(`${params[0]}|${params[1]}`);
        return [[...(row ? [{ id: row.id, importe: row.importe }, ...(duplicateKeys.has(`${params[0]}|${params[1]}`) ? [{id: row.id+10, importe: row.importe}] : [])] : [])], []];
      }
      if (sql.startsWith('UPDATE partida_contable_valor')) {
        const [concepto, importe, nivel_confianza, id] = params;
        const row = [...rows.values()].find(x => x.id === id);
        if (row && row.importe === null) Object.assign(row, { concepto, importe, nivel_confianza });
        return [{affectedRows: row ? 1 : 0}, []];
      }
      if (sql.startsWith('INSERT INTO partida_contable_valor')) {
        if (failOnInsert) throw new Error('injected insert failure');
        const [informe_id, concepto_estandar_id, concepto, importe, nivel_confianza] = params;
        rows.set(`${informe_id}|${concepto_estandar_id}`, { id: rows.size + 1, informe_id, concepto_estandar_id, concepto, importe, nivel_confianza });
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
    async commit() { commits++; snapshot = undefined; },
    async rollback() { rollbacks++; rows.clear(); for (const [k, v] of snapshot || []) rows.set(k, v); },
    release() {}
  };
  return { rows, pool: { async getConnection() { return conn; } }, setFailOnInsert(v) { failOnInsert = v; }, stats: () => ({ commits, rollbacks }) };
}
const row = (informeId, conceptId, importe, concept = 'us-gaap:Revenue') => ({ informeId, conceptoEstandarId: conceptId, conceptoOriginal: concept, importe, nivelConfianza: 'ALTA' });

test('provider PCV adds missing concepts and preserves existing values and NULL', async () => {
  const db = fakePool([
    { id: 11, informe_id: 7, concepto_estandar_id: 1, importe: 123, concepto: 'SEC:original', nivel_confianza: 'ALTA' },
    { id: 12, informe_id: 7, concepto_estandar_id: 2, importe: null, concepto: 'SEC:null-source', nivel_confianza: 'MEDIA' }
  ]);
  const inserted = await insertarSoloPCVAusentes(db.pool, [row(7, 1, 999), row(7, 2, 55), row(7, 3, 80), row(7, 3, 80)]);
  assert.equal(inserted, 2);
  assert.equal(db.rows.get('7|1').importe, 123);
  assert.equal(db.rows.get('7|2').importe, 55);
  assert.equal(db.rows.get('7|3').importe, 80);
  assert.deepEqual(db.stats(), { commits: 1, rollbacks: 0 });
});

test('provider PCV leaves duplicate historical rows untouched', async () => {
  const db = fakePool([{id: 5, informe_id: 7, concepto_estandar_id: 1, importe: null, concepto: 'old', nivel_confianza: 'MEDIA', duplicate: true}]);
  assert.equal(await insertarSoloPCVAusentes(db.pool, [row(7, 1, 50)]), 0);
  assert.equal(db.rows.get('7|1').importe, null);
});

test('provider PCV is idempotent and can resume after interruption', async () => {
  const db = fakePool();
  assert.equal(await insertarSoloPCVAusentes(db.pool, [row(8, 1, 10), row(8, 2, 20)]), 2);
  assert.equal(await insertarSoloPCVAusentes(db.pool, [row(8, 1, 11), row(8, 2, 22), row(8, 3, 30)]), 1);
  assert.equal(db.rows.size, 3);
  assert.equal(db.rows.get('8|1').importe, 10);
});

test('provider PCV transaction rolls back every insertion on failure', async () => {
  const db = fakePool();
  db.setFailOnInsert(true);
  await assert.rejects(() => insertarSoloPCVAusentes(db.pool, [row(9, 1, 10)]), /injected insert failure/);
  assert.equal(db.rows.size, 0);
  assert.deepEqual(db.stats(), { commits: 0, rollbacks: 1 });
});

test('provider PCV rejects non-finite amounts before opening a transaction', async () => {
  const db = fakePool();
  await assert.rejects(() => insertarSoloPCVAusentes(db.pool, [row(9, 1, NaN)]), /no finito/);
  assert.deepEqual(db.stats(), { commits: 0, rollbacks: 0 });
});

test('provider PCV rejects contradictory candidates rather than retaining the last value', async () => {
 const db=fakePool();await assert.rejects(()=>insertarSoloPCVAusentes(db.pool,[row(7,3,80),row(7,3,81)]),/contradictorios/);
 assert.deepEqual(db.stats(),{commits:0,rollbacks:0});
});
