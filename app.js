const socket = io();
let state = null;
let myId = null;
const $ = id => document.getElementById(id);
const entry = $('entry'), game = $('game');
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function name(){return $('playerName').value.trim() || 'Ruler'}
$('createBtn').onclick=()=>socket.emit('createRoom',{name:name()});
$('joinBtn').onclick=()=>socket.emit('joinRoom',{name:name(),code:$('roomCode').value.trim()});
$('roomCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
$('startBtn').onclick=()=>socket.emit('startGame');
$('copyCode').onclick=()=>{if(state?.code)navigator.clipboard?.writeText(state.code).then(()=>toast('Room code copied!')).catch(()=>toast('Room code: '+state.code));};
$('backBtn').onclick=()=>location.reload();
socket.on('connect',()=>{myId=socket.id;});
socket.on('notice',toast);
socket.on('state',s=>{state=s;entry.classList.add('hidden');game.classList.remove('hidden');render();});
function render(){if(!state)return;const me=state.players.find(p=>p.id===myId);$('roomCodeLabel').textContent=state.code;$('roundNumber').textContent=state.round;$('playerCount').textContent=`${state.players.length} / 6 RULERS`;$('phaseName').textContent=state.phase.toUpperCase();$('realmTitle').textContent=state.phase==='gameover'?'The crown is claimed':'Kingdom Council';
const notes={lobby:'Waiting for rulers to join…',playing:'Choose one order before the round resolves.',resolving:'The council is calculating every kingdom’s move…',gameover:'The season is complete. Long live the ruler!'};$('phaseNote').textContent=notes[state.phase];
document.querySelectorAll('.phase-step').forEach(el=>{el.classList.toggle('active',el.dataset.phase===state.phase)});
$('players').innerHTML=state.players.map(p=>`<div class="player-card"><div class="player-crest" style="color:${p.color}">♜</div><div><b>${esc(p.name)} ${p.id===state.hostId?'★':''} ${p.id===myId?'(YOU)':''}</b><small>${esc(p.kingdom)} · ${p.connected?'Online':'Offline'}</small></div><div class="score">${p.crowns}<small>CROWNS</small></div></div>`).join('');
$('lobbyControls').classList.toggle('hidden',state.phase!=='lobby');$('startBtn').disabled=state.players.length<2 || state.hostId!==myId;$('startBtn').textContent=state.hostId===myId?'Start the match →':'Waiting for host…';
$('actionsPanel').classList.toggle('hidden',state.phase!=='playing');const locked=!!(me&&me.ready);$('orderStatus').textContent=locked?'ORDER LOCKED':'ORDER OPEN';$('actionHint').textContent=locked?'Your order is locked. Waiting for the other rulers…':'Choose one action. Your order locks until the round resolves.';document.querySelectorAll('[data-order]').forEach(b=>{b.disabled=locked||!me;b.classList.toggle('selected',locked&&me?.lastAction?.toLowerCase().includes(b.dataset.order));b.onclick=()=>{socket.emit('order',{type:b.dataset.order});toast('Order submitted. Waiting for the other rulers…')}});
if(me){$('myKingdom').textContent=me.kingdom;$('gold').textContent=me.resources.gold;$('food').textContent=me.resources.food;$('wood').textContent=me.resources.wood;$('stone').textContent=me.resources.stone;$('castle').textContent=me.castle;$('army').textContent=me.army;$('crowns').textContent=me.crowns;}else{$('myKingdom').textContent='Spectating';['gold','food','wood','stone','castle','army','crowns'].forEach(id=>$(id).textContent='—')}
const ranked=[...state.players].sort((a,b)=>b.crowns-a.crowns);$('ranking').innerHTML=ranked.map((p,i)=>`<div class="rank-row"><span class="rank-num">${i+1}</span><span class="rank-dot" style="background:${p.color}"></span><span class="rank-name">${esc(p.name)}</span><span class="rank-score">${p.crowns} ♛</span></div>`).join('');$('log').innerHTML=state.log.slice().reverse().map(x=>`<p>${esc(x)}</p>`).join('');
$('winnerPanel').classList.toggle('hidden',state.phase!=='gameover');if(state.phase==='gameover'){const w=state.players.find(p=>p.id===state.winnerId);$('winnerName').textContent=w?`${w.name} is victorious!`:'Season complete';$('winnerText').textContent=w?`${w.kingdom} claims the crown with ${w.crowns} crowns.`:'The highest-scoring kingdom has won.';}}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
