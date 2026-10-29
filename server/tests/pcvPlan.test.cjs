const {test}=require('node:test'),assert=require('node:assert/strict'),{eligibleJobs,sourceRecoveryComplete,cumpleObjetivo85,jobs,legacyJobs}=require('../scripts/recuperar-pcv-plan.cjs');
test('A finished first pass with a quota queue is not a completed source workflow',()=>{const states=Object.fromEntries(jobs.map(j=>[j.id,{done:true,scan_complete:true}]));assert.equal(sourceRecoveryComplete(states),true);states['us-complement']={done:false,scan_complete:true,retryCompanies:[1]};assert.equal(sourceRecoveryComplete(states),false);});
test('JP streams discovery/import after its cache pass; online work waits for the complete date range',()=>{
 assert.ok(eligibleJobs({}).includes('jp-cached'));assert.ok(!eligibleJobs({'jp-cached':{scan_complete:true,done:false}}).includes('jp-discover'));
 assert.ok(eligibleJobs({'jp-cached':{done:true}}).includes('jp-discover'));assert.ok(!eligibleJobs({'jp-discover':{scan_complete:true,done:false}}).includes('jp-existing'));assert.ok(eligibleJobs({'jp-discover':{done:true}}).includes('jp-existing'));
});
test('US extraction waits for bulk; supplements in both countries wait for their complete primary pass',()=>{
 assert.ok(eligibleJobs({}).includes('us-bulk'));assert.ok(!eligibleJobs({}).includes('us-verified'));assert.ok(eligibleJobs({'us-bulk':{done:true}}).includes('us-verified'));
 assert.ok(!eligibleJobs({'us-verified':{scan_complete:true,done:false}}).includes('us-transient'));assert.ok(eligibleJobs({'us-verified':{done:true}}).includes('us-transient'));assert.ok(!eligibleJobs({'us-verified':{done:true}}).includes('us-complement'));assert.ok(eligibleJobs({'us-transient':{done:true}}).includes('us-complement'));
 assert.ok(!eligibleJobs({'jp-existing':{scan_complete:true,done:false}}).includes('jp-complement'));assert.ok(eligibleJobs({'jp-existing':{done:true}}).includes('jp-complement'));
});
test('Retired checkpoint queues are preserved rather than relaunched or declared done',()=>{for(const j of legacyJobs){assert.ok(j.reason.includes('preserved'));assert.ok(!jobs.some(n=>n.directory===j.directory));}});
test('The 85% target requires all sixteen cells, including source verification',()=>{
 const ps=Object.fromEntries(['US','JP'].flatMap(c=>[2022,2023,2024,2025].map(y=>[c+'-'+y,{fixed_pcv_pct:85,fixed_kpi_pct:85,source_verified_pcv_pct:85,source_verified_kpi_pct:85}])));assert.equal(cumpleObjetivo85(ps),true);ps['JP-2022'].source_verified_kpi_pct=84.99;assert.equal(cumpleObjetivo85(ps),false);delete ps['JP-2022'];assert.equal(cumpleObjetivo85(ps),false);
});
