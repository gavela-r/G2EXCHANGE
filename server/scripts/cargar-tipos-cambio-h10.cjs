// Carga los tipos de cambio H.10 de la Reserva Federal (CSV público de FRED, sin clave).
// Uso: node server/scripts/cargar-tipos-cambio-h10.cjs [desde=2021-01-01]
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');
const SERIES = { TWD: 'DEXTAUS', JPY: 'DEXJPUS' };
(async () => {
  const desde = process.argv[2] || '2021-01-01';
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  await db.query(require('node:fs').readFileSync(require('node:path').join(__dirname, '../sql/24_tipo_cambio_referencia.sql'), 'utf8').replace(/--.*$/gm, ''));
  for (const [moneda, serie] of Object.entries(SERIES)) {
    const csv = await (await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${serie}&cosd=${desde}`, { signal: AbortSignal.timeout(60000) })).text();
    const filas = csv.trim().split('\n').slice(1).map(l => l.split(',')).filter(([f, v]) => /^\d{4}-\d{2}-\d{2}$/.test(f) && Number(v) > 0)
      .map(([f, v]) => [moneda, f, Number(v), 'Federal Reserve H.10 (FRED)', serie]);
    if (filas.length) await db.query('INSERT INTO tipo_cambio_referencia (moneda,fecha,unidades_por_usd,fuente,serie) VALUES ? ON DUPLICATE KEY UPDATE unidades_por_usd=VALUES(unidades_por_usd)', [filas]);
    console.log(moneda, serie, filas.length, 'observaciones; última', filas.at(-1)?.slice(1, 3));
  }
  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
