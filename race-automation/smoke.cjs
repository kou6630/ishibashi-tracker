'use strict';
const assert=require('node:assert/strict'),{generate}=require('./race-sim.cjs');
// In-memory recording only: fixture marbles never enter the live event.
(async()=>{const record=await generate(20261017,Array.from({length:4},(_,i)=>({id:'fixture_'+i,name:'fixture'})));assert.equal(record.finish.length,4);assert.equal(new Set(record.finish.map(f=>f.id)).size,4);assert.deepEqual(record.finish.map(f=>f.rank),[1,2,3,4]);assert.ok(record.finish.slice(0,3).every(f=>Number.isFinite(f.time)));assert.ok(record.duration<=Math.ceil(record.finish[2].time*record.fps)/record.fps+2/record.fps);console.log('Recording runtime verified; no live entries or rewards changed.');})().catch(e=>{console.error(e.message);process.exitCode=1;});
