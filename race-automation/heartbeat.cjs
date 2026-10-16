'use strict';
const W=require('./lib/weekly-race-state');
// One small weekly commit keeps the scheduled workflow active beyond 60 days.
// Only operational metadata goes into the public repo; no player information.
(async()=>{
 const token=process.env.GH_TOKEN,repo=process.env.GITHUB_REPOSITORY;
 if(repo!=='kou6630/ishibashi-tracker'||!token)throw Error('Expected automation repository');
 const url='https://api.github.com/repos/'+repo+'/contents/race-automation/last-run.json',headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};
 const r=await fetch(url,{headers});let current=null;
 if(r.ok)current=await r.json();else if(r.status!==404)throw Error('Cannot inspect heartbeat '+r.status);
 const p=W.period(),old=current?JSON.parse(Buffer.from(current.content,'base64').toString('utf8')):{};
 if(old.week===p.raceId){console.log('Weekly heartbeat already recorded.');return;}
 const content=Buffer.from(JSON.stringify({week:p.raceId,checkedAt:new Date().toISOString()},null,2)+'\n').toString('base64');
 const saved=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:'Record weekly race automation health [skip ci]',content,...(current?{sha:current.sha}:{})})});
 if(!saved.ok)throw Error('Cannot record heartbeat '+saved.status);console.log('Weekly automation heartbeat recorded.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
