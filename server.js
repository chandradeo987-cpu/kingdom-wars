const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));
app.get('/health', (_req, res) => res.json({ ok: true }));

const rooms = new Map();
const COLORS = ['#63d6c5', '#f4bd67', '#a997ff', '#f17e91', '#8bc56e', '#70a9f5'];
const makeId = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const cleanName = n => String(n || 'Ruler').trim().slice(0, 18) || 'Ruler';
function publicRoom(room) {
  return {
    code: room.code, phase: room.phase, round: room.round, hostId: room.hostId,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, kingdom: p.kingdom, color: p.color, resources: p.resources, crowns: p.crowns, castle: p.castle, army: p.army, ready: p.ready, connected: p.connected, lastAction: p.lastAction })),
    log: room.log.slice(-12), winnerId: room.winnerId
  };
}
function emitRoom(room) { io.to(room.code).emit('state', publicRoom(room)); }
function addLog(room, message) { room.log.push(message); room.log = room.log.slice(-30); }
function createRoom(socket, name) {
  const code = makeId();
  const room = { code, phase: 'lobby', round: 1, hostId: socket.id, players: new Map(), orders: new Map(), log: [], winnerId: null };
  rooms.set(code, room); joinRoom(socket, room, name); return room;
}
function joinRoom(socket, room, name) {
  if (room.phase !== 'lobby') return socket.emit('notice', 'This kingdom match has already started.');
  if (room.players.size >= 6) return socket.emit('notice', 'This room is full (maximum 6 rulers).');
  if (room.players.has(socket.id)) return;
  const index = room.players.size;
  room.players.set(socket.id, { id: socket.id, name: cleanName(name), kingdom: `${cleanName(name)}'s Realm`, color: COLORS[index % COLORS.length], resources: { gold: 10, food: 8, wood: 6, stone: 4 }, crowns: 0, castle: 1, army: 2, ready: false, connected: true, lastAction: 'Preparing the kingdom', order: null });
  socket.join(room.code); socket.data.roomCode = room.code;
  addLog(room, `${cleanName(name)} joined the realm.`); emitRoom(room);
}
function startGame(room, socket) {
  if (socket.id !== room.hostId) return socket.emit('notice', 'Only the host can start the match.');
  if (room.players.size < 2) return socket.emit('notice', 'Invite at least one more ruler to start multiplayer.');
  room.phase = 'playing'; room.round = 1; addLog(room, 'The council is open. Round 1 begins!'); emitRoom(room);
}
function resolve(room) {
  room.phase = 'resolving';
  for (const p of room.players.values()) {
    const o = room.orders.get(p.id) || { type: 'farm' };
    const r = p.resources;
    if (o.type === 'farm') { r.food += 5; r.gold += 1; p.lastAction = 'Expanded the farms'; }
    if (o.type === 'mine') { r.stone += 3; r.gold += 2; p.lastAction = 'Worked the stone mines'; }
    if (o.type === 'lumber') { r.wood += 4; r.food += 1; p.lastAction = 'Gathered timber'; }
    if (o.type === 'trade') { if (r.food >= 2) { r.food -= 2; r.gold += 4; } else { r.gold += 1; } p.lastAction = 'Traded at the market'; }
    if (o.type === 'build') {
      if (r.wood >= 3 && r.stone >= 2 && r.gold >= 3) { r.wood -= 3; r.stone -= 2; r.gold -= 3; p.castle += 1; p.crowns += 2; p.lastAction = 'Built a castle wing (+2 crowns)'; }
      else p.lastAction = 'Could not build: not enough materials';
    }
    if (o.type === 'train') {
      if (r.food >= 3 && r.gold >= 3) { r.food -= 3; r.gold -= 3; p.army += 2; p.lastAction = 'Trained 2 guards'; }
      else p.lastAction = 'Could not train: not enough food or gold';
    }
    if (o.type === 'festival') { if (r.food >= 4) { r.food -= 4; p.crowns += 1; r.gold += 2; p.lastAction = 'Held a festival (+1 crown)'; } else p.lastAction = 'Festival cancelled: not enough food'; }
    // Kingdom upkeep
    if (p.army > 0) { r.food = Math.max(0, r.food - Math.ceil(p.army / 4)); }
    p.crowns += Math.floor(p.castle / 3);
    room.orders.delete(p.id);
  }
  const ranking = [...room.players.values()].sort((a,b) => b.crowns - a.crowns);
  const winner = ranking.find(p => p.crowns >= 12);
  if (winner) { room.phase = 'gameover'; room.winnerId = winner.id; addLog(room, `${winner.name}'s kingdom reached 12 crowns and wins the realm!`); }
  else if (room.round >= 12) { room.phase = 'gameover'; room.winnerId = ranking[0]?.id || null; addLog(room, 'The 12-round season has ended. The highest-scoring kingdom wins!'); }
  else { addLog(room, `Round ${room.round} resolved. The next council is forming.`); room.round += 1; room.phase = 'playing'; }
  emitRoom(room);
}
function submitOrder(room, player, type) {
  if (room.phase !== 'playing') return;
  const allowed = ['farm','mine','lumber','trade','build','train','festival'];
  if (!allowed.includes(type)) return;
  room.orders.set(player.id, { type }); player.ready = true; player.lastAction = `Order submitted: ${type}`;
  const count = room.orders.size;
  addLog(room, `${player.name} submitted a kingdom order (${count}/${room.players.size}).`);
  if (count === room.players.size) resolve(room); else emitRoom(room);
}
io.on('connection', socket => {
  socket.on('createRoom', ({ name } = {}) => createRoom(socket, name));
  socket.on('joinRoom', ({ code, name } = {}) => {
    const room = rooms.get(String(code || '').trim().toUpperCase());
    if (!room) return socket.emit('notice', 'Room code not found. Check the code and try again.');
    joinRoom(socket, room, name);
  });
  socket.on('startGame', () => { const room = rooms.get(socket.data.roomCode); if (room) startGame(room, socket); });
  socket.on('order', ({ type } = {}) => {
    const room = rooms.get(socket.data.roomCode); const player = room?.players.get(socket.id);
    if (!room || !player) return;
    if (room.phase !== 'playing') return socket.emit('notice', 'Orders are only available during the Playing phase.');
    if (room.orders.has(player.id)) return socket.emit('notice', 'Your order is already locked for this round.');
    submitOrder(room, player, type);
  });
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode); if (!room) return;
    const player = room.players.get(socket.id); if (player) { player.connected = false; addLog(room, `${player.name} disconnected.`); }
    if (room.players.size === 0) rooms.delete(room.code); else emitRoom(room);
  });
});
server.listen(PORT, () => console.log(`Kingdom Wars running on http://localhost:${PORT}`));
