function retryAfterUntil(value,now=Date.now()){if(!value)return null;const seconds=Number(value),until=Number.isFinite(seconds)?now+Math.max(0,seconds)*1000:Date.parse(value);return Number.isFinite(until)?new Date(Math.max(now,until)).toISOString():null;}
module.exports={retryAfterUntil};
