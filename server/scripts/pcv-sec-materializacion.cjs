const fs=require('node:fs'),path=require('node:path');
// Portable backups retain original compressed SEC bytes, not duplicated JSON.
// A completed archive checkpoint is distinct from a materialized working cache.
function fuentesSecMaterializadas(directory,state){
 if(!state?.done)return false;
 for(const kind of ['submissions','companyfacts']){const expected=state.archives?.[kind]?.entries,dir=path.join(directory,kind);if(!Number.isSafeInteger(expected)||expected<1||!fs.existsSync(dir))return false;const files=fs.readdirSync(dir).filter(n=>/^CIK\d{10}(?:-submissions-\d+)?\.json$/.test(n));if(files.length<expected)return false;}
 return true;
}
module.exports={fuentesSecMaterializadas};
