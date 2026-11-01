// Clasificación sectorial por CÓDIGO OFICIAL DE ACTIVIDAD → plantilla del motor sectorial (1–16), sin red:
//  - US: SIC del archivo submissions SEC bulk local del CIK vinculado (bindings.json, candidato único).
//  - JP: 提出者業種 (sector TSE33) de la lista oficial de códigos EDINET local, con el vínculo EDINET existente
//    (nombre inglés exacto + código de valor; server/src/pcv/edinetRegistro.ts).
// Sólo cruces inequívocos (tablas explícitas abajo); los códigos ambiguos (p. ej. TSE «電気機器», «情報・通信業»,
// SIC de medios, holdings o finanzas no bancarias) NO se clasifican. Inserta únicamente evidencia ACCEPTED/HIGH con la
// plantilla explícita (criterios SEC_SIC_PLANTILLA_V1 / TSE33_PLANTILLA_V1); nunca evidencia pendiente que bloquee una
// clasificación ya resuelta. Si contradice otra evidencia aceptada, el adaptador lo detecta y bloquea (CONTRADICCION).
// Idempotente (huella única). Rollback: DELETE FROM classification_evidence WHERE criterion IN (los dos criterios).
// Uso: node scripts/clasificar-actividad-oficial.cjs --salida <informe.json> [--write]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Z=require('adm-zip'),root=path.resolve(__dirname,'../..');require('dotenv').config({path:path.join(root,'.env')});
const pool=require('../dist/conexion/bd').default,R=require('../dist/src/pcv/edinetRegistro');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d,write=args.includes('--write');
const bulk=path.resolve(arg('--source-directory',path.join(root,'private_backups/pcv-us-bulk-20261029'))),codigos=path.resolve(arg('--edinet-codes',path.join(root,'private_backups/edinet-codes-official-20261028.zip')));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// SIC (4 dígitos) → plantilla. Rangos inclusivos; el primero que coincide gana (excepciones antes que rangos amplios).
const SIC=[
 [3720,3729,1,'Aeronaves y partes'],[3760,3769,1,'Misiles y vehículos espaciales'],[3795,3795,1,'Tanques'],[3812,3812,1,'Sistemas de navegación y aeronáuticos'],
 [7370,7374,2,'Programación, software empaquetado, diseño de sistemas y proceso de datos'],[7379,7379,2,'Servicios informáticos'],
 [3570,3579,3,'Ordenadores y equipos de oficina'],[3661,3669,3,'Equipos de comunicaciones'],[3670,3679,3,'Componentes electrónicos y semiconductores'],[3825,3825,3,'Instrumentos de medida eléctrica y de semiconductores'],
 [3711,3711,5,'Vehículos de motor'],[3713,3716,5,'Carrocerías, partes y caravanas'],[3751,3751,5,'Motocicletas'],[3011,3011,5,'Neumáticos'],
 [1500,1799,4,'Construcción'],[3410,3499,4,'Productos metálicos'],[3500,3569,4,'Maquinaria industrial'],[3580,3599,4,'Maquinaria industrial'],[3610,3629,4,'Equipo eléctrico'],[3640,3649,4,'Iluminación'],[3690,3699,4,'Equipo eléctrico'],[3730,3749,4,'Barcos y equipo ferroviario'],[3820,3824,4,'Instrumentos industriales'],[3829,3829,4,'Instrumentos de medida'],
 [5200,5999,6,'Comercio minorista y restauración'],[7000,7099,6,'Hoteles'],[2300,2399,6,'Confección'],[3140,3149,6,'Calzado'],[3630,3639,6,'Electrodomésticos'],[3940,3949,6,'Juguetes y artículos deportivos'],[7900,7999,6,'Ocio'],[2510,2599,6,'Mobiliario'],
 [100,299,7,'Agricultura y ganadería'],[2000,2199,7,'Alimentación, bebidas y tabaco'],[2840,2844,7,'Higiene y cosmética'],
 [1300,1389,8,'Extracción y servicios de petróleo y gas'],[2900,2999,8,'Refino'],[4610,4619,8,'Oleoductos'],[5171,5172,8,'Distribución de petróleo'],
 [1000,1099,9,'Minería metálica'],[1400,1499,9,'Minerales no metálicos'],[2400,2499,9,'Madera'],[2600,2699,9,'Papel'],[2800,2829,9,'Química básica y plásticos'],[2850,2899,9,'Química'],[3200,3299,9,'Piedra, vidrio y cemento'],[3300,3399,9,'Metales primarios'],
 [4900,4949,10,'Electricidad, gas y agua'],[4961,4961,10,'Vapor y aire acondicionado'],
 [4810,4829,11,'Telecomunicaciones'],[4840,4849,11,'Cable y televisión de pago'],[4899,4899,11,'Servicios de comunicaciones'],
 [2830,2836,12,'Farmacéuticas y biotecnología'],[8731,8731,12,'Investigación biológica comercial'],
 [6021,6022,13,'Bancos comerciales'],[6029,6029,13,'Bancos comerciales'],[6035,6036,13,'Cajas de ahorro'],
 [6311,6311,14,'Seguros de vida'],[6321,6321,14,'Seguros de accidentes y salud'],[6324,6324,14,'Planes hospitalarios y médicos'],[6331,6331,14,'Seguros de daños'],[6351,6351,14,'Caución'],[6361,6361,14,'Seguros de títulos'],[6399,6399,14,'Aseguradoras'],
 [6798,6798,15,'Sociedades de inversión inmobiliaria (REIT)'],[6512,6513,15,'Arrendadores de inmuebles'],
 [3841,3845,16,'Instrumental y dispositivos médicos'],[3851,3851,16,'Óptica oftálmica'],[4000,4599,16,'Transporte'],[4700,4799,16,'Servicios de transporte'],[4950,4959,16,'Saneamiento y residuos'],[5000,5170,16,'Comercio mayorista'],[5173,5199,16,'Comercio mayorista'],
 [7200,7369,16,'Servicios personales y empresariales'],[7380,7389,16,'Servicios empresariales'],[7500,7699,16,'Reparación'],[8000,8099,16,'Servicios sanitarios'],[8100,8730,16,'Servicios profesionales'],[8732,8999,16,'Servicios profesionales']
];
const TSE33={'水産・農林業':7,'建設業':4,'食料品':7,'繊維製品':6,'パルプ・紙':9,'医薬品':12,'石油・石炭製品':8,'ガラス・土石製品':9,'鉄鋼':9,'非鉄金属':9,'金属製品':4,'機械':4,'輸送用機器':5,'電気・ガス業':10,'陸運業':16,'海運業':16,'空運業':16,'倉庫・運輸関連業':16,'卸売業':16,'小売業':6,'銀行業':13,'保険業':14,'不動産業':15,'サービス業':16};
const sicPlantilla=code=>{const n=Number(code);if(!Number.isInteger(n))return null;const r=SIC.find(([a,b])=>n>=a&&n<=b);return r?{plantilla:r[2],regla:r[0]+'-'+r[1]+' '+r[3]}:null;};
(async()=>{
 const hoy=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date()),filas=[],resumen={US:{vinculadas:0,sinSic:0,noMapeado:0,clasificadas:0,porPlantilla:{}},JP:{vinculadas:0,noMapeado:0,clasificadas:0,porPlantilla:{}},insertadas:0};
 // US
 const cp=JSON.parse(fs.readFileSync(path.join(bulk,'checkpoint.json'),'utf8')),bindings=JSON.parse(fs.readFileSync(path.join(bulk,'bindings.json'),'utf8'));
 if(sha(JSON.stringify(bindings))!==cp.bindings_sha256)throw Error('SEC_BINDINGS_MODIFICADOS');
 const [us]=await pool.query("SELECT e.id,e.nombre_empresa FROM empresa e JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso='US'"),usIds=new Set(us.map(x=>x.id));
 for(const b of bindings){if(!usIds.has(b.id)||b.candidates?.length!==1)continue;const file=path.join(bulk,'submissions','CIK'+b.candidates[0]+'.json');if(!fs.existsSync(file))continue;
  const bytes=fs.readFileSync(file),sub=JSON.parse(bytes.toString('utf8'));if(Number(sub.cik)!==Number(b.candidates[0]))continue;resumen.US.vinculadas++;
  if(!sub.sic){resumen.US.sinSic++;continue;}const m=sicPlantilla(sub.sic);if(!m){resumen.US.noMapeado++;continue;}
  resumen.US.clasificadas++;resumen.US.porPlantilla[m.plantilla]=(resumen.US.porPlantilla[m.plantilla]||0)+1;
  filas.push({empresa_id:b.id,source:'https://data.sec.gov/submissions/CIK'+b.candidates[0]+'.json',source_identifier:'CIK:'+Number(b.candidates[0]),criterion:'SEC_SIC_PLANTILLA_V1',evidence:{empresa_id:b.id,plantilla:m.plantilla,regla:m.regla,codigo:String(sub.sic),descripcionOficial:sub.sicDescription,cik:b.candidates[0],nombreOficial:sub.name,vinculo:b.criterion,submissionsSha256:sha(bytes),bulkSubmissionsSha256:cp.archives.submissions.sha256,reference_date:hoy}});
 }
 // JP
 const zip=fs.readFileSync(codigos),entry=new Z(zip).getEntries().find(e=>/\.csv$/i.test(e.entryName)),registro=R.leerRegistroEdinetCsv(R.decodificarRegistroEdinet(entry.getData()));
 const [jp]=await pool.query("SELECT e.id,e.nombre_empresa FROM empresa e JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso='JP' ORDER BY e.id"),[inst]=await pool.query("SELECT i.empresa_id,i.ticker FROM instrumento i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso='JP'");
 const vinculos=R.vincularRegistroEdinet(jp.map(c=>({...c,tickers:inst.filter(i=>i.empresa_id===c.id).map(i=>i.ticker)})),registro);
 for(const v of vinculos.values()){resumen.JP.vinculadas++;const p=TSE33[v.registro.sector];if(!p){resumen.JP.noMapeado++;continue;}resumen.JP.clasificadas++;resumen.JP.porPlantilla[p]=(resumen.JP.porPlantilla[p]||0)+1;
  filas.push({empresa_id:v.company.id,source:'https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip',source_identifier:'EDINET:'+v.registro.edinetCode,criterion:'TSE33_PLANTILLA_V1',evidence:{empresa_id:v.company.id,plantilla:p,regla:'TSE33 '+v.registro.sector,codigo:v.registro.sector,edinetCode:v.registro.edinetCode,securityCode:v.registro.securityCode,nombreOficial:v.registro.englishName,vinculo:v.criterion,codigosSha256:sha(zip),reference_date:hoy}});}
 if(write){for(const f of filas){const json=JSON.stringify(f.evidence),h=sha(json);const [r]=await pool.query('INSERT IGNORE INTO classification_evidence(empresa_id,sector_id,source,reference_date,source_identifier,criterion,confidence,status,evidence_hash,evidence_json) VALUES(?,?,?,?,?,?,?,?,?,?)',[f.empresa_id,null,f.source,hoy,f.source_identifier,f.criterion,'HIGH','ACCEPTED',h,json]);resumen.insertadas+=r.affectedRows;}}
 fs.writeFileSync(path.resolve(arg('--salida','clasificacion-actividad.json')),JSON.stringify({resumen,filas},null,1));console.log(JSON.stringify({write,...resumen}));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
