// Control previo a la reanudación de recuperadores: credenciales comprometidas detectadas por huella SHA-256.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {credencialesComprometidas,leerEnv}=require('../scripts/transicion-recuperadores.cjs');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
test('detecta por huella las credenciales comprometidas, incluso reutilizadas en otra variable, sin exponer valores',()=>{
 const huellas=[{variable:'FINMIND_TOKEN',sha256:sha('valor-comprometido-123')}];
 const env={FINMIND_TOKEN:'valor-comprometido-123',FINMIND_TOKEN_4:'valor-comprometido-123',EDINET_API_KEY:'valor-nuevo-rotado-456',DB_NAME:'valor-comprometido-123',CORTA:'x'};
 assert.deepEqual(credencialesComprometidas(env,huellas),['FINMIND_TOKEN','FINMIND_TOKEN_4']);
 assert.deepEqual(credencialesComprometidas({FINMIND_TOKEN:'otro-valor-rotado-789'},huellas),[]);
});
test('lee .env con comillas y CRLF; ausente → null',()=>{
 const f=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'g2env-')),'.env');fs.writeFileSync(f,'A_KEY="abc"\r\nB_TOKEN=\'def\'\r\n# comentario\r\n');
 assert.deepEqual(leerEnv(f),{A_KEY:'abc',B_TOKEN:'def'});assert.equal(leerEnv(f+'.no'),null);
});
