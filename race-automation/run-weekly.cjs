'use strict';
const {initializeApp}=require('firebase-admin/app'),{getFirestore,FieldValue}=require('firebase-admin/firestore');
const {create}=require('./weekly-race-service.cjs'),{generate}=require('./race-sim.cjs'),W=require('./lib/weekly-race-state');
// Credentials come from GitHub's short-lived OIDC identity. No private key.
async function main(){
 const projectId=process.env.GOOGLE_CLOUD_PROJECT;if(projectId!=='ishibashi-tracker')throw Error('Expected race production project');
 initializeApp({projectId});const db=getFirestore();
 try{
  const result=await create({db,stamp:()=>FieldValue.serverTimestamp(),simulate:generate}).finalize();
  await db.doc('weeklyRaces/_automation').set({checkedAt:FieldValue.serverTimestamp(),raceId:W.period().raceId,healthy:true});
  console.log(JSON.stringify({ok:true,...result}));
 }finally{await db.terminate();}
}
main().catch(e=>{console.error('Race automation failed:',e.code||e.message);process.exitCode=1;});
