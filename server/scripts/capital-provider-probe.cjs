// Prueba técnica mínima. No almacena ni redistribuye precios Alpaca.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');require('./capital-dev.cjs');
const P=require('../dist-capital/server/src/capital/proveedores');
(async()=>{const result={at:new Date().toISOString(),provider:'ALPACA',feed:'sip',credentialsPresent:!!(process.env.ALPACA_KEY&&process.env.ALPACA_SECRET),storedObservations:0,corporateRedistributionAuthorized:false};
 if(result.credentialsPresent){try{const data=await P.obtenerJson('https://data.alpaca.markets/v2/stocks/AAPL/bars?timeframe=1Day&start=2026-09-01&end=2026-09-02&feed=sip&adjustment=all&limit=1',{'APCA-API-KEY-ID':process.env.ALPACA_KEY,'APCA-API-SECRET-KEY':process.env.ALPACA_SECRET});result.status='HTTP_200';result.barsReturned=data.bars?.length??0;result.fields=data.bars?.[0]?Object.keys(data.bars[0]):[];result.responseHash=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');}catch(e){result.status=e.message;}}
 else result.status='CREDENTIALS_ABSENT';
 fs.writeFileSync(path.resolve(__dirname,'../../valuation_engine/research/coste_capital/fase3/evidencias/alpaca-probe.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
