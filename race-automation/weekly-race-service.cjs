'use strict';
const crypto=require('node:crypto'),W=require('./lib/weekly-race-state'),R=require('./lib/ranch-state');
const error=(code,message)=>Object.assign(Error(message),{code});
function pack(frames,index){const out=Buffer.alloc(frames.length*14);for(let f=0;f<frames.length;f++)for(let c=0;c<7;c++){const n=Math.round(frames[f][index*7+c]*(c<3?100:10000));if(n<-32768||n>32767)throw Error('Recorded position out of range');out.writeInt16LE(n,(f*7+c)*2);}return out;}
function create({db,stamp,simulate,clock=Date.now,seed=()=>crypto.randomInt(0,0x100000000)}){
 const race=id=>db.doc('weeklyRaces/'+id),entry=(id,uid)=>race(id).collection('entries').doc(uid),racer=(id,run,uid)=>race(id).collection('runs').doc(run).collection('racers').doc(uid),profile=uid=>db.doc('googleUsers/'+uid),save=uid=>db.doc('googleRanches/'+uid);
 function permit(p){const allowed=R.access(p);if(!allowed.ok||p?.kayoRanchUnlocked!==true)throw error(allowed.code||'ranch-locked',allowed.message||'牧場を解放してください。');}
 async function checked(uid){if(!uid)throw error('unauthenticated','Googleでログインしてください。');const p=await profile(uid).get();permit(p.exists?p.data():null);return p.data();}
 async function status(uid){await checked(uid);const p=W.period(clock());if(p.phase==='closed')return {...p,ok:true,eligible:true,entered:false,claimed:false,serverNow:clock()};const [e,r]=await Promise.all([entry(p.raceId,uid).get(),race(p.raceId).get()]);return {...p,ok:true,eligible:true,entered:e.exists,claimed:e.exists&&e.data().claimed===true,ready:r.exists&&r.data().status==='ready',serverNow:clock()};}
 async function enter(uid){
  if(!uid)throw error('unauthenticated','Googleでログインしてください。');
  return db.runTransaction(async tx=>{
   const p=W.period(clock()),[u,s,e,r]=await Promise.all([tx.get(profile(uid)),tx.get(save(uid)),tx.get(entry(p.raceId,uid)),tx.get(race(p.raceId))]);permit(u.exists?u.data():null);
   if(W.period(clock()).phase!=='entry'||W.period(clock()).raceId!==p.raceId)throw error('race-entry-closed','今週のエントリー受付は終了しました。');
   if(!s.exists||!R.snapshotResult(s.data()).stateJson)throw error('ranch-invalid-state','牧場の保存を完了してからエントリーしてください。');
   if(e.exists)return {ok:true,alreadyApplied:true};
   if(r.exists&&r.data().status!=='open')throw error('race-entry-closed','今週のエントリー受付は終了しました。');
   if(!r.exists)tx.set(race(p.raceId),{status:'open',start:p.start,resultsAt:p.resultsAt,expiresAt:p.expiresAt,createdAt:stamp()});
   tx.create(entry(p.raceId,uid),{uid,name:u.data().nickname,enteredAt:stamp(),claimed:false,claimId:''});return {ok:true};
  });
 }
 async function results(uid){
  await checked(uid);const p=W.period(clock());if(p.phase!=='results')throw error('race-expired','結果の公開・報酬受取期間は日曜日だけです。');
  const [e,r]=await Promise.all([entry(p.raceId,uid).get(),race(p.raceId).get()]);
  if(!e.exists)throw error('race-not-entered','今週はエントリーしていません。');
  if(!r.exists||r.data().status!=='ready')throw error('race-preparing','結果の映像を準備しています。少し待ってから開いてください。');
  const meta=r.data(),page=await race(p.raceId).collection('runs').doc(meta.run).collection('racers').get();
  const records=page.docs.map(d=>{const a=d.data();return {id:d.id,name:a.name,color:a.color,number:a.number,rank:a.rank,time:a.time,frames:a.frames,trajectory:a.trajectory.toString('base64')};}).sort((a,b)=>a.number-b.number);
  if(records.length!==meta.total)throw error('race-preparing','結果を確認しています。少し待ってから開いてください。');
  return {ok:true,raceId:p.raceId,uid,claimed:e.data().claimed===true,record:{schema:1,fps:meta.fps,duration:meta.duration,countdown:meta.countdown,course:meta.course,records},expiresAt:p.expiresAt,serverNow:clock()};
 }
 async function claim(uid,payload={}){
  if(!uid)throw error('unauthenticated','Googleでログインしてください。');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(payload.raceId||'')||!/^ranchrace_[a-f0-9]{32}$/.test(payload.opId||''))throw error('race-invalid','報酬の受取内容を確認できませんでした。');
  return db.runTransaction(async tx=>{
   const id=payload.raceId,[u,s,e,r]=await Promise.all([tx.get(profile(uid)),tx.get(save(uid)),tx.get(entry(id,uid)),tx.get(race(id))]);permit(u.exists?u.data():null);
   const previous=R.snapshotResult(s.exists?s.data():{});if(!previous.ok||!previous.stateJson)throw error('ranch-invalid-state','牧場の保存データを確認できませんでした。');
   if(!e.exists)throw error('race-not-entered','今週はエントリーしていません。');
   // A timed-out successful claim can be confirmed even after the deadline.
   if(e.data().claimed)return {...previous,alreadyApplied:true,rank:e.data().rank,rewards:e.data().rewards};
   const p=W.period(clock());if(p.phase!=='results'||p.raceId!==id||clock()>=p.expiresAt)throw error('race-expired',W.DEADLINE_NOTE+'。');
   if(!r.exists||r.data().status!=='ready')throw error('race-preparing','結果を準備しています。少し待ってから開いてください。');
   const b=await tx.get(racer(id,r.data().run,uid));if(!b.exists)throw error('race-preparing','結果を準備しています。少し待ってから開いてください。');
   if(clock()>=p.expiresAt)throw error('race-expired',W.DEADLINE_NOTE+'。');
   if(previous.version!==payload.baseVersion)throw error('ranch-conflict','別の端末で牧場が更新されました。保存済みの進捗を読み直してください。');
   const rank=b.data().rank,rewards=W.prize(rank),snapshot=JSON.parse(previous.stateJson),game=JSON.parse(snapshot.gameJson);
   for(const [key,amount]of Object.entries(rewards))game[key]+=amount;snapshot.gameJson=JSON.stringify(game);
   const stateJson=R.normalizeSnapshot(JSON.stringify(snapshot));if(!stateJson)throw error('ranch-invalid-state','報酬を保存できませんでした。');
   const version=previous.version+1;
   tx.set(save(uid),{ranchStateJson:stateJson,ranchStateVersion:version,ranchSaveId:payload.opId,ranchUpdatedAt:stamp()});
   tx.update(entry(id,uid),{claimed:true,claimId:payload.opId,claimedAt:stamp(),rank,rewards,version});
   return {ok:true,stateJson,version,saveId:payload.opId,rank,rewards,alreadyApplied:false};
  });
 }
 async function finalize(){
  const p=W.period(clock());if(p.phase!=='results')return {skipped:true};const id=p.raceId,lease=crypto.randomUUID();
  const acquired=await db.runTransaction(async tx=>{const doc=await tx.get(race(id));if(!doc.exists)return false;const old=doc.data();if(old.status==='ready'||old.status==='building'&&old.leaseUntil>clock())return false;tx.update(race(id),{status:'building',seed:old.seed??seed(),lease,leaseUntil:clock()+9*60000});return true;});
  if(!acquired)return {skipped:true};
  try{
   const [meta,page]=await Promise.all([race(id).get(),race(id).collection('entries').orderBy('__name__').get()]);
   const entrants=page.docs.map(d=>({id:d.id,name:d.data().name}));
   const record=await simulate(meta.data().seed,entrants),finished=new Map(record.finish.map(f=>[f.id,f]));
   if(record.participants.length!==entrants.length||record.finish.length!==entrants.length||new Set(record.finish.map(f=>f.id)).size!==entrants.length||record.finish.some(f=>!entrants.some(e=>e.id===f.id)))throw Error('Invalid race recording');
   // Immutable per-run paths: partial failed attempts cannot alter a published run.
   for(let offset=0;offset<record.participants.length;offset+=100){
    const batch=db.batch();record.participants.slice(offset,offset+100).forEach((a,j)=>{const f=finished.get(a.id);batch.set(race(id).collection('runs').doc(lease).collection('racers').doc(a.id),{name:a.name,color:a.color,number:a.number,rank:f.rank,time:f.time,frames:record.frames.length,trajectory:pack(record.frames,offset+j)});});await batch.commit();
   }
   await db.runTransaction(async tx=>{
    const latest=await tx.get(race(id));if(latest.data().lease!==lease)throw Error('Race lease superseded');
    // Publish one pointer only after every entrant's trajectory has been stored.
    tx.update(race(id),{status:'ready',run:lease,total:entrants.length,fps:record.fps,duration:record.duration,countdown:record.countdown,course:record.course,completedAt:stamp()});
   });
   return {ok:true,total:entrants.length};
  }catch(e){await db.runTransaction(async tx=>{const latest=await tx.get(race(id));if(latest.exists&&latest.data().lease===lease&&latest.data().status!=='ready')tx.update(race(id),{status:'failed',leaseUntil:0});});throw e;}
 }
 return {status,enter,results,claim,finalize};
}
module.exports={create,pack};
