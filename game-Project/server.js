// server.js (Node + Express + socket.io)
// Minimal demo server. For production, add auth, validation, rate limits, XSS prevention, persistence.

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const PUBLIC = path.join(__dirname, 'public');
app.use(express.static(PUBLIC, { index: false, maxAge: '1d' }));
app.use('/images', express.static(path.join(PUBLIC, 'images'), { maxAge: '1d' }));

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.get('*', (req, res, next) => {
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) return res.sendFile(path.join(PUBLIC, 'index.html'));
  next();
});

// socket.io with path '/s' and polling transport only
const io = new Server(server, {
  path: '/s',
  transports: ['polling'],
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// in-memory state
const players = new Map(); // socketId -> { name, score, avatar }
const banned = new Set();

function getRanking() {
  const map = new Map();
  for (const [, p] of players.entries()) {
    if (!p || !p.name) continue;
    const prev = map.get(p.name) || 0;
    map.set(p.name, Math.max(prev, Number(p.score || 0)));
  }
  const arr = [...map.entries()].map(([name, score]) => ({ name, score }));
  arr.sort((a, b) => b.score - a.score);
  return arr.slice(0, 50);
}

function emitAll(longName, shortName, payload) {
  io.emit(longName, payload);
  if (shortName && shortName !== longName) io.emit(shortName, payload);
}

io.on('connection', socket => {
  console.log('conn', socket.id);

  const handleInit = (data) => {
    const name = String((data && data.name) || `Guest-${socket.id.slice(0,4)}`).slice(0,32);
    const score = Math.max(0, Number((data && data.score) || 0));
    if (banned.has(name)) {
      socket.emit('banned');
      return;
    }
    players.set(socket.id, { name, score, avatar: (data && data.avatar) || null });
    socket.emit('init_ok', { name, ranking: getRanking(), banned: Array.from(banned) });
    emitAll('ranking_update', 'rank', getRanking());
    socket.broadcast.emit('sys', `${name} が参加しました`);
  };

  socket.on('init', handleInit);
  socket.on('init_v2', handleInit);

  socket.on('score_update', data => {
    const p = players.get(socket.id);
    if (!p) return;
    p.score = Math.max(0, Number((data && data.score) || 0));
    players.set(socket.id, p);
    emitAll('ranking_update', 'rank', getRanking());
  });
  socket.on('score_v2', (d) => { /* compat */ });

  socket.on('name_change', data => {
    const newName = String((data && data.name) || '').trim().slice(0,32);
    if (!newName) return;
    if (banned.has(newName)) {
      socket.emit('name_change_failed', { reason: 'banned' });
      return;
    }
    const p = players.get(socket.id) || { name: newName, score: 0 };
    const oldName = p.name;
    p.name = newName;
    players.set(socket.id, p);
    emitAll('system', 'sys', `${oldName || '誰か'} は ${newName} に名前変更しました`);
    emitAll('ranking_update', 'rank', getRanking());
  });

  // operator commands (actor must be 'operator' for this simple demo)
  socket.on('operator_cmd', data => {
    if (!data || !data.cmd) return;
    const actor = data.actor || '';
    if (actor !== 'operator') return;
    const cmd = data.cmd;
    if (cmd.type === 'ban' && cmd.target) {
      banned.add(String(cmd.target));
      for (const [sid, p] of players.entries()) {
        if (p.name === cmd.target) io.to(sid).emit('banned');
      }
      emitAll('system', 'sys', `${cmd.target} を利用制限しました`);
      emitAll('ranking_update', 'rank', getRanking());
    } else if (cmd.type === 'unban' && cmd.target) {
      banned.delete(String(cmd.target));
      emitAll('system', 'sys', `${cmd.target} の利用制限を解除しました`);
      emitAll('ranking_update', 'rank', getRanking());
    } else if (cmd.type === 'forceRename' && cmd.oldName && cmd.newName) {
      for (const [sid, p] of players.entries()) {
        if (p.name === cmd.oldName) {
          p.name = cmd.newName;
          players.set(sid, p);
          io.to(sid).emit('forced_rename', { newName: cmd.newName });
        }
      }
      emitAll('system', 'sys', `${cmd.oldName} を強制的に ${cmd.newName} に変更しました`);
      emitAll('ranking_update', 'rank', getRanking());
    }
  });

  // accept both talk_message and msg (compat)
  socket.on('talk_message', msg => {
    if (!msg || msg.type !== 'user') return;
    const p = players.get(socket.id);
    if (!p) return;
    if (banned.has(p.name)) {
      socket.emit('banned');
      return;
    }
    const name = String(p.name).slice(0,32);
    const text = String(msg.text || '').slice(0,500);
    const avatar = msg.avatar || p.avatar || null;
    const payload = { type: 'user', name, text, avatar };
    emitAll('talk_message', 'msg', payload);
  });

  socket.on('msg', (m) => { /* compat: handled above via emitAll */ });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    emitAll('ranking_update', 'rank', getRanking());
    console.log('disc', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`listening ${PORT}`));
