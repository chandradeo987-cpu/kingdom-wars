const express=require('express'),http=require('http'),crypto=require('crypto');
const {Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server);
app.use(express.static('public'));
app.get('/health',(_,res)=>res.json({ok:true}));
const rooms=new Map(),COLORS=['#64d8cb','#f2bd65','#b39aff','#f28c9d','#9bd17d','#77b7f5','#f5a66b','#91c7a5'];
const actions=['farm','mine','lumber','trade','build','train','festival','expand','battle'];
const id=()=>crypto.randomBytes(3).toString('hex').toUpperCase();
const name=n=>String(n||'Ruler').trim().slice(0,18)||'Ruler';
function state(r){return {code:r.code,phase:r.phase,round:r.round,hostId:r.hostId,winnerId:r.winnerId,
 players:[...r.players.values()].map(p=>({...p})),log:r.log.slice(-18),chat:r.chat.slice(-30)}}
function log(r,s){r.log.push(s);r.log=r.log.slice(-40)}
function emit(r){io.to(r.code).emit('state',state(r))}
function join(s,r,n){
 if(r.phase!=='lobby')return s.emit('notice','This match has already started.');
 if(r.players.size>=8)return s.emit('notice','Room is full (maximum 8 rulers).');
 const nm=name(n),i=r.players.size;
 r.players.set(s.id,{id:s.id,name:nm,kingdom:nm+"'s Realm",color:COLORS[i%8],
 resources:{gold:12,food:10,wood:8,stone:5},crowns:0,castle:1,army:3,land:1,
 ready:false,connected:true,lastAction:'Preparing the kingdom',alliance:null});
 s.join(r.code);s.data.roomCode=r.code;log(r,nm+' joined the realm.');emit(r);
}
function create(s,n){let code;do{code=id()}while(rooms.has(code));
 const r={code,phase:'lobby',round:1,hostId:s.id,players:new Map(),orders:new Map(),log:[],chat:[],winnerId:null};
 rooms.set(code,r);join(s,r,n)}
function resolve(r){
 r.phase='resolving';const ps=[...r.players.values()];
 for(const p of ps){const o=r.orders.get(p.id)||{type:'farm'},x=p.resources;
  if(o.type==='farm'){x.food+=5;x.gold++;p.lastAction='Expanded the farms'}
  if(o.type==='mine'){x.stone+=3;x.gold+=2;p.lastAction='Worked the stone mines'}
  if(o.type==='lumber'){x.wood+=4;x.food++;p.lastAction='Gathered timber'}
  if(o.type==='trade'){if(x.food>=2){x.food-=2;x.gold+=4}else x.gold++;p.lastAction='Traded at the market'}
  if(o.type==='build'){if(x.wood>=3&&x.stone>=2&&x.gold>=3){x.wood-=3;x.stone-=2;x.gold-=3;p.castle++;p.crowns+=2;p.lastAction='Improved the castle (+2 crowns)'}else p.lastAction='Build failed: gather materials'}
  if(o.type==='train'){if(x.food>=3&&x.gold>=3){x.food-=3;x.gold-=3;p.army+=2;p.lastAction='Strengthened the kingdom guard'}else p.lastAction='Training failed: need food and gold'}
  if(o.type==='festival'){if(x.food>=4){x.food-=4;x.gold+=2;p.crowns++;p.lastAction='Held a festival (+1 crown)'}else p.lastAction='Festival cancelled: not enough food'}
  if(o.type==='expand'){if(x.food>=3&&x.wood>=2&&x.gold>=3){x.food-=3;x.wood-=2;x.gold-=3;p.land++;p.crowns++;p.lastAction='Expanded territory (+1 land, +1 crown)'}else p.lastAction='Expansion failed: need food, wood and gold'}
 }
 for(const p of ps){const o=r.orders.get(p.id);if(!o||o.type!=='battle'||!o.targetId)continue;
  const t=r.players.get(o.targetId);if(!t||t.id===p.id||p.alliance===t.id||t.alliance===p.id){p.lastAction='Choose a rival outside your alliance';continue}
  if(p.id>t.id)continue;if(p.army<2){p.lastAction='Not enough guard points';continue}
  const a=p.army+p.castle+Math.floor(Math.random()*4),b=t.army+t.castle+Math.floor(Math.random()*4);
  if(a>b&&t.land>1){p.army=Math.max(1,p.army-1);t.army=Math.max(0,t.army-2);p.land++;t.land--;p.crowns+=2;p.lastAction='Won a territory contest against '+t.name;t.lastAction='Lost one territory to '+p.name;log(r,p.name+' won a territory contest against '+t.name+'.')}
  else{p.army=Math.max(1,p.army-2);t.army=Math.max(1,t.army-1);p.lastAction='Contest with '+t.name was unsuccessful;t.lastAction='Held the realm against '+p.name;log(r,t.name+' held the realm against '+p.name+'.')}
 }
 for(const p of ps){p.resources.food=Math.max(0,p.resources.food-Math.ceil(p.army/5));p.crowns+=Math.floor(p.land/3);p.ready=false}
 r.orders.clear();const rank=ps.slice().sort((a,b)=>b.crowns-a.crowns),winner=rank.find(p=>p.crowns>=15);
 if(winner){r.phase='gameover';r.winnerId=winner.id;log(r,winner.name+' wins the crown!')}
 else if(r.round>=15){r.phase='gameover';r.winnerId=rank[0]?.id||null;log(r,'The 15-round season has ended.')}
 else{log(r,'Round '+r.round+' resolved. Next council forming.');r.round++;r.phase='playing'}
 emit(r)
}
function order(r,p,type,targetId){if(r.phase!=='playing'||!actions.includes(type)||r.orders.has(p.id))return;
 r.orders.set(p.id,{type,targetId});p.ready=true;p.lastAction='Order submitted: '+type;
 log(r,p.name+' submitted an order ('+r.orders.size+'/'+r.players.size+').');
 if(r.orders.size===r.players.size)resolve(r);else emit(r)}
io.on('connection',s=>{
 s.on('createRoom',({name:n}={})=>create(s,n));
 s.on('joinRoom',({code,name:n}={})=>{const r=rooms.get(String(code||'').trim().toUpperCase());if(!r)return s.emit('notice','Room code not found.');join(s,r,n)});
 s.on('startGame',()=>{const r=rooms.get(s.data.roomCode);if(!r)return;if(s.id!==r.hostId)return s.emit('notice','Only the host can start.');if(r.players.size<2)return s.emit('notice','Invite another ruler first.');r.phase='playing';log(r,'The council is open. Round 1 begins!');emit(r)});
 s.on('order',({type,targetId}={})=>{const r=rooms.get(s.data.roomCode),p=r?.players.get(s.id);if(r&&p)order(r,p,type,targetId)});
 s.on('chat',({text}={})=>{const r=rooms.get(s.data.roomCode),p=r?.players.get(s.id),msg=String(text||'').trim().slice(0,180);if(!r||!p||!msg)return;const m={name:p.name,text:msg};r.chat.push(m);r.chat=r.chat.slice(-50);io.to(r.code).emit('chatMessage',m)});
 s.on('allianceInvite',({targetId}={})=>{const r=rooms.get(s.data.roomCode),p=r?.players.get(s.id),t=r?.players.get(targetId);if(!r||!p||!t||p.alliance||t.alliance)return s.emit('notice','Alliance unavailable.');io.to(t.id).emit('allianceRequest',{fromId:p.id,fromName:p.name});s.emit('notice','Alliance invitation sent.')});
 s.on('allianceRespond',({fromId,accept}={})=>{const r=rooms.get(s.data.roomCode),p=r?.players.get(s.id),t=r?.players.get(fromId);if(!r||!p||!t)return;if(accept&&!p.alliance&&!t.alliance){p.alliance=t.id;t.alliance=p.id;log(r,p.name+' and '+t.name+' formed an alliance.')}emit(r)});
 s.on('disconnect',()=>{const r=rooms.get(s.data.roomCode),p=r?.players.get(s.id);if(p){p.connected=false;log(r,p.name+' disconnected.');emit(r)}});
});
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Kingdom Wars online'));
