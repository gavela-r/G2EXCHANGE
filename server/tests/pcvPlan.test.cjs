const {test}=require('node:test'),assert=require('node:assert/strict'),{eligibleJobs,sourceRecoveryComplete,cumpleObjetivo85,jobs,legacyJobs}=require('../scripts/recuperar-pcv-plan.cjs');
test('A finished first pass with a quota queue is not a completed source workflow',()=>{const states=Object.fromEntries(jobs.map(j=>[j.id,{done:true,scan_complete:true}]));assert.equal(sourceRecoveryComplete(states),false);states['tw-recovery']={financial_recovery_done:true};assert.equal(sourceRecoveryComplete(states),true);states['us-complement']={done:false,scan_complete:true,retryCompanies:[1]};assert.equal(sourceRecoveryComplete(states),false);});
test('JP identity recovery is serialized between cache, discovery, online and supplemental passes',()=>{
 assert.ok(eligibleJobs({}).includes('jp-cached'));assert.ok(!eligibleJobs({'jp-cached':{scan_complete:true,done:false}}).includes('jp-identity-cached'));
 assert.ok(eligibleJobs({'jp-cached':{done:true}}).includes('jp-identity-cached'));
 for(const [previous,next]of [['jp-identity-cached','jp-discover'],['jp-discover','jp-identity-discover'],['jp-identity-discover','jp-identity-existing'],['jp-identity-existing','jp-existing']]){
  assert.ok(!eligibleJobs({[previous]:{scan_complete:true,done:false}}).includes(next));assert.ok(eligibleJobs({[previous]:{done:true}}).includes(next));
 }
});

test('US extraction waits for bulk; supplements in both countries wait for their complete primary pass',()=>{
 assert.ok(eligibleJobs({}).includes('us-bulk'));assert.ok(!eligibleJobs({}).includes('us-verified'));assert.ok(eligibleJobs({'us-bulk':{done:true}}).includes('us-verified'));
 assert.ok(!eligibleJobs({'us-verified':{scan_complete:true,done:false}}).includes('us-transient'));assert.ok(eligibleJobs({'us-verified':{done:true}}).includes('us-transient'));assert.ok(!eligibleJobs({'us-verified':{done:true}}).includes('us-complement'));assert.ok(eligibleJobs({'us-transient':{done:true}}).includes('us-mapping'));assert.ok(!eligibleJobs({'us-transient':{done:true}}).includes('us-complement'));assert.ok(eligibleJobs({'us-mapping':{done:true}}).includes('us-complement'));
 assert.ok(!eligibleJobs({'jp-existing':{scan_complete:true,done:false}}).includes('jp-complement'));assert.ok(eligibleJobs({'jp-existing':{done:true}}).includes('jp-complement'));
});
test('Retired checkpoint queues are preserved rather than relaunched or declared done',()=>{for(const j of legacyJobs){assert.ok(j.reason.includes('preserved'));assert.ok(!jobs.some(n=>n.directory===j.directory));}});
test('The 85% target requires all twenty-four country/year/metric cells and measured finite source verification',()=>{
 const ps=Object.fromEntries(['US','JP','TW'].flatMap(c=>[2022,2023,2024,2025].map(y=>[c+'-'+y,{fixed_pcv_pct:85,fixed_kpi_pct:85,source_verified_pcv_pct:85,source_verified_kpi_pct:85}])));assert.equal(cumpleObjetivo85(ps),true);ps['JP-2022'].source_verified_kpi_pct=84.99;assert.equal(cumpleObjetivo85(ps),false);ps['JP-2022'].source_verified_kpi_pct=85;ps['TW-2022'].source_certification_measured=false;assert.equal(cumpleObjetivo85(ps),false);delete ps['TW-2022'].source_certification_measured;ps['TW-2022'].source_verified_pcv_pct=Infinity;assert.equal(cumpleObjetivo85(ps),false);delete ps['TW-2022'];assert.equal(cumpleObjetivo85(ps),false);
});
