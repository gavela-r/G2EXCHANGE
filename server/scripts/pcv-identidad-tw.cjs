const pinyinModule=require('../node_modules/pinyin'),pinyin=pinyinModule.default||pinyinModule.pinyin||pinyinModule;
const norm=s=>String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
function vincularTaiwan(company,instruments,master){
 const codes=[...new Set(instruments.map(i=>String(i.ticker||'').replace(/\.TW$/i,'')).filter(s=>/^\d{4}$/.test(s)))];
 if(codes.length!==1)return {verified:false,reason:'MISSING_OR_AMBIGUOUS_STOCK_CODE'};
 const matches=master.filter(r=>String(r['公司代號'])===codes[0]);if(matches.length!==1)return {verified:false,reason:'OFFICIAL_CURRENT_MASTER_NOT_UNIQUE'};
 const row=matches[0],short=row['公司簡稱'],romanized=short?pinyin(short,{style:pinyin.STYLE_NORMAL}).map(x=>x[0]).join(' '):'',aliases=[romanized,row['英文簡稱'],row['公司名稱'],short].filter(Boolean);
 if(!aliases.some(name=>norm(name)===norm(company.nombre_empresa)))return {verified:false,reason:'EXACT_ORIGINAL_NAME_BINDING_UNVERIFIED',stockId:codes[0]};
 return {verified:true,stockId:codes[0],officialChineseName:row['公司名稱'],legalNumber:row['營利事業統一編號'],policy:'EXACT_INSTRUMENT_AND_OFFICIAL_NAME_OR_ORIGINAL_PINYIN_V1'};
}
module.exports={vincularTaiwan};
