const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

(async () => {
  const key = process.env.EDINET_API_KEY || process.env.EDINET_API_KEY_1 || '';
  if (!key) throw new Error('No hay clave de EDINET oficial configurada en variables locales');
  const date = '2025-06-20';
  const url = new URL('https://api.edinet-fsa.go.jp/api/v2/documents.json');
  url.searchParams.set('date', date);
  url.searchParams.set('type', '2');
  url.searchParams.set('Subscription-Key', key);
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  const contentType = response.headers.get('content-type') || '';
  const body = await response.json().catch(() => null);
  const records = Array.isArray(body?.results) ? body.results : [];
  console.log(JSON.stringify({ provider: 'EDINET official', date, status: response.status, content_type: contentType, result_count: records.length, sample_fields: Object.keys(records[0] || {}).slice(0, 12), has_result_array: Array.isArray(body?.results) }));
  if (!response.ok) process.exitCode = 1;
})().catch(error => {
  console.error(JSON.stringify({ provider: 'EDINET official', error: error.name === 'AbortError' ? 'timeout' : 'request_failed' }));
  process.exitCode = 1;
});
