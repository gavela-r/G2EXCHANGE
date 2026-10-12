// Conservative explicit crosswalk from official SEC SIC descriptions.
// Unlisted codes (including broad software/finance/holding buckets) stay pending.
export const SEC_SIC:Readonly<Record<string,number>>={
 '3674':19,'2834':137,'2836':23,'6021':16,'6022':16,'6029':16,
 '6311':12,'6321':12,'6324':12,'6331':12,'6351':12,'6361':12,
 '2000':181,'2011':181,'2013':181,'2015':181,'2020':181,'2024':181,
 '2030':181,'2033':181,'2040':181,'2050':181,'2052':181,'2060':181,'2070':181,'2090':181,'2092':181,
 '2080':160,'2082':160,'2086':160,'2111':266,
 '3711':9,'3714':65,'3721':25,'3724':25,'3728':25,'3760':25,
 '4512':176,'4513':176,'4400':131,'4412':131,
 '1000':10,'1040':10,'1090':10,'3312':10,'3334':10,
 '1311':6,'2911':6,'4911':4,'4922':4,'4923':4,'4924':4,'4931':4,'4941':4,
 '4812':62,'4813':62,'2300':56,'2320':56,'2330':56,'2340':56,
 '1520':31,'1531':31,'1540':31,'1600':31,'1623':31,'1700':31,
 '3510':20,'3523':20,'3524':20,'3531':20,'3532':20,'3533':20,'3537':20,'3541':20,'3542':20,'3550':20,'3560':20,
 '2650':97,'3411':97,'3412':97
};
export function identidadSecValida(dbName:string,ticker:string,cik:number,submission:{name:string;tickers?:string[];cik:number}):boolean {
 const normalized=(s:string)=>s.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');
 return Number(submission.cik)===cik&&!!submission.tickers?.includes(ticker)&&normalized(dbName)===normalized(submission.name);
}
