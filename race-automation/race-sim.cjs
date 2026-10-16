// Offline physics recording. The public player only reads this fixed record.
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('three');
const R = require('@dimforge/rapier3d-compat');
const {PRIZES} = require('./lib/weekly-race-state');
function random(seed) { let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}; }
async function generate(seed=20261017, entrants=null) {
 await R.init();
 const world=new R.World({x:0,y:-9.81,z:0});world.timestep=1/120;
 const rng=random(seed), q=new THREE.Quaternion(),axis=new THREE.Vector3(0,1,0);
 const decks=[{y:18.4,z:0,length:23,slope:.17,width:10},{y:9,z:18,length:32,slope:.12,width:16},{y:3.6,z:50,length:24,slope:.11,width:16}];
 const shapes=[],rotors=[];
 function transform(d,x,h,s){const a=Math.atan(d.slope),c=Math.cos(a),n=Math.sin(a);return{x,y:d.y+h*c-s*n,z:d.z+h*n+s*c};}
 function box(p,size,rotation,kind='wood',body=null){
  const collider=R.ColliderDesc.cuboid(...size.map(n=>n/2)).setFriction(.32).setRestitution(.12);
  if(body)world.createCollider(collider,body);else world.createCollider(collider.setTranslation(p.x,p.y,p.z).setRotation(rotation));
  const out={p:Object.values(p),size,q:[rotation.x,rotation.y,rotation.z,rotation.w],kind};shapes.push(out);return out;
 }
 function deckBox(di,x,h,s,size,angle=0,kind='wood'){
  const d=decks[di],rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.atan(d.slope));
  rotation.multiply(new THREE.Quaternion().setFromAxisAngle(axis,angle));return box(transform(d,x,h,s),size,rotation,kind);
 }
 for(let di=0;di<decks.length;di++){
  const d=decks[di];deckBox(di,0,-.24,d.length/2,[d.width+.5,.48,d.length]);
  for(const x of [-d.width/2-.2,d.width/2+.2])deckBox(di,x,1.4,d.length/2,[.35,3.6,d.length],0,'rail');
  if(di===1)deckBox(di,0,1.4,-.3,[d.width+.5,3.6,.35],0,'rail');
 }
 // Peg garden: staggered cylinders with rounded tops and real rigid collisions.
 const pins=[];
 for(let row=0;row<5;row++)for(let col=0;col<5;col++){
  const x=-3.9+col*1.9+(row%2?.8:0);if(x>4)continue;
  const p=transform(decks[0],x,.55,5+row*2.7),radius=.25;
  const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.atan(decks[0].slope));
  world.createCollider(R.ColliderDesc.cylinder(.65,radius).setTranslation(p.x,p.y,p.z).setRotation(rotation).setRestitution(.45).setFriction(.18));
  pins.push({p:Object.values(p),q:rotation.toArray(),radius});
 }
 // A genuine open conical funnel: the hole is not capped by the collider.
 const funnel={x:0,z:25.8,topY:13.9,bottomY:10.2,radius:7.5,hole:.9};
 const verts=[],indices=[],segments=64;
 for(const [r,y] of [[funnel.hole,funnel.bottomY],[funnel.radius,funnel.topY]])for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;verts.push(Math.cos(a)*r,y,Math.sin(a)*r+funnel.z);}
 for(let i=0;i<segments;i++){const a=i,b=i+1,c=i+segments+1,d=c+1;indices.push(a,c,b,b,c,d);}
 world.createCollider(R.ColliderDesc.trimesh(new Float32Array(verts),new Uint32Array(indices)).setFriction(.1).setRestitution(.06));
 for(let i=0;i<64;i++){
  const a=i/64*Math.PI*2;if(Math.sin(a)<-.55)continue;const rotation=new THREE.Quaternion().setFromAxisAngle(axis,-a);
  box({x:Math.cos(a)*7.5,y:14.8,z:25.8+Math.sin(a)*7.5},[.22,2.2,.8],rotation,'glass');
 }
 // Guide the first tray into the near edge of the funnel.

 function rotor(di,x,s,length,speed,phase){
  const p=transform(decks[di],x,.4,s),slopeQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.atan(decks[di].slope));
  const body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x,p.y,p.z));
  world.createCollider(R.ColliderDesc.cuboid(length/2,.28,.17).setFriction(.2).setRestitution(.1),body);
  const def={p:Object.values(p),baseQ:slopeQ.toArray(),length,speed,phase};rotors.push({body,def,slopeQ});
 }
 rotor(1,-3.4,15,6,.85,0);rotor(1,3.4,22,6,-.85,1.2);rotor(2,0,14,9,.75,.6);
 // Alternating banks make the final run visibly change direction.
 deckBox(2,-2.8,.38,4,[8.5,.8,.3],-.22,'bumper');deckBox(2,2.8,.38,9,[8.5,.8,.3],.22,'bumper');
 // Catch basin after the finish line.
 box({x:0,y:-.55,z:73},[17,.5,10],new THREE.Quaternion(),'wood');
 for(const x of [-8.3,8.3])box({x,y:1,z:73},[.4,3.6,10],new THREE.Quaternion(),'rail');
 box({x:0,y:.1,z:68},[17,.8,.35],new THREE.Quaternion(),'rail');
 box({x:0,y:1,z:78},[17,3.6,.4],new THREE.Quaternion(),'rail');
 const colors=['#fb686d','#4cd6af','#ffce52','#4cabef','#b489ec','#ff9c54','#ed85be','#71d6dd','#b4cf61','#a4a0ed','#ebc08a','#8acbb5'];
 const participants=['あおい','こむぎ','まる','ひなた','みどり','ぽん','もち','ゆず','そら','りん','なぎ','ふう'].map((name,i)=>({id:'preview_'+i,name,color:colors[i],number:i+1}));
 if(entrants)participants.splice(0,participants.length,...entrants.map((p,i)=>({...p,color:colors[i%colors.length],number:i+1})));
 const extra=Math.max(0,Math.ceil(participants.length/6)-2)*.85;
 if(extra){const d=decks[0];deckBox(0,0,-.24,-extra/2,[10.5,.48,extra]);for(const x of [-5.2,5.2])deckBox(0,x,1.4,-extra/2,[.35,3.6,extra],0,'rail');}
 const slots=participants.map((_,i)=>i);for(let i=slots.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
 const balls=participants.map((p,i)=>{
  const slot=slots[i],pos=transform(decks[0],-3.7+(slot%6)*1.48+(rng()-.5)*.18,.38,1+(1-Math.floor(slot/6))*.85);
  const b=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos.x,pos.y,pos.z).setCcdEnabled(true).setLinearDamping(.015).setAngularDamping(.02));
  world.createCollider(R.ColliderDesc.ball(.29).setDensity(1).setFriction(.38).setRestitution(.18),b);return b;
 });
 const frames=[],finish=[],done=new Set(),fps=30,countdown=3;let cutoff=Infinity;
 if(!participants.length){world.free();return {schema:1,seed,fps,countdown,duration:0,participants,finish,frames,course:{decks,shapes,pins,funnel,rotors:rotors.map(r=>r.def),finishZ:70.6,radius:.29}};}
 const capture=()=>frames.push(balls.flatMap(b=>{const p=b.translation(),r=b.rotation();return[p.x,p.y,p.z,r.x,r.y,r.z,r.w].map(v=>Math.round(v*10000)/10000);}));
 for(let step=0;step<120*(180+participants.length*.5);step++){
  const time=step/120;
  for(const rotor of rotors){q.copy(rotor.slopeQ).multiply(new THREE.Quaternion().setFromAxisAngle(axis,time*rotor.def.speed+rotor.def.phase));rotor.body.setNextKinematicRotation(q);}
  if(time>=countdown)world.step();
  for(let i=0;i<balls.length;i++){const p=balls[i].translation();if(p.z>=70.6&&!done.has(i)){done.add(i);finish.push({id:participants[i].id,time,rank:finish.length+1});
 const rb=balls[i];rb.setBodyType(R.RigidBodyType.Fixed,true);rb.collider(0).setSensor(true);
 if(finish.length===Math.min(3,participants.length))cutoff=Math.ceil(time*fps)/fps;}}
  if(step%4===0&&time<=cutoff+1/fps)capture();
  if(done.size===balls.length&&time>=cutoff)break;
 }
 const last=balls.map(b=>b.translation());
 if(finish.length<Math.min(3,participants.length))throw new Error('Podium did not finish');
 // A marble can remain wedged against a peg. Never teleport it across the goal:
 // after the time limit, non-finishers are placed by actual downhill progress.
 const progress=p=>p.y>14.4&&p.z<24?p.z:p.y>=10&&p.z<34?23+(13.9-p.y)*2:p.z<50?32+Math.max(0,p.z-25.8):56.2+p.z-50;
 participants.map((p,i)=>({id:p.id,i,progress:progress(last[i])})).filter(p=>!done.has(p.i)).sort((a,b)=>b.progress-a.progress||slots[a.i]-slots[b.i]).forEach(p=>finish.push({id:p.id,time:null,rank:finish.length+1,finished:false}));
 world.free();
 return{schema:1,seed,physics:'Rapier 0.21.0 / fixed 120 Hz',fps,countdown,duration:(frames.length-1)/fps,participants,finish,frames,prizes:PRIZES,course:{decks,shapes,pins,funnel,rotors:rotors.map(r=>r.def),finishZ:70.6,radius:.29}};
}
module.exports={generate};


