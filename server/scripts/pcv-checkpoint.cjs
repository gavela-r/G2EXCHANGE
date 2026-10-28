const fs=require('node:fs');
function renombrarPcvAtomico(tmp,file,io=fs,pause=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms)){
 for(let attempt=0;attempt<8;attempt++){
  try{io.renameSync(tmp,file);return;}
  catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code)||attempt===7)throw e;pause(Math.min(250,25*2**attempt));}
 }
}
function guardarEstadoPcv(file,state,io=fs,pause){const tmp=file+'.tmp';io.writeFileSync(tmp,JSON.stringify(state,null,2));renombrarPcvAtomico(tmp,file,io,pause);}
module.exports={guardarEstadoPcv,renombrarPcvAtomico};
