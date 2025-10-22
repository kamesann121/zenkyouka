// server.js
// 学内フィルタに引っかかりにくくする対策を追加したバージョン。
// 変更点:
// - Socket.IO の path を /s に固定し transports を polling のみに制限
// - ログを簡素化（過度な文字列を出力しない）
// - 既存のイベント名を壊さないよう互換的に両方受け付け／両方通知する（旧名と短縮名）
// - 静的配信と /images を明示

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR, { index: false, maxAge: "1d" }));
app.use("/images", express.static(path.join(PUBLIC_DIR, "images"), { maxAge: "1d" }));

app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.get("*", (req, res, next) => {
  const accept = req.headers.accept || "";
  if (accept.includes("text/html")) return res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  next();
});

// Socket.IO を polling のみにして path を /s に変更（WebSocket 接続の検知を避けやすくする）
const io = new Server(server, {
  path: '/s',
  transports: ['polling'],
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// In-memory state
const players = new Map(); // socketId -> { name, score, avatar }
const bannedNames = new Set();

function getRankingArray() {
  const map = new Map();
  for (const [, p] of players) {
    if (!p || !p.name) continue;
    const prev = map.get(p.name) || 0;
    map.set(p.name, Math.max(prev, Number(p.score) || 0));
  }
  const arr = [...map.entries()].map(([name, score]) => ({ name, score }));
  arr.sort((a, b) => b.score - a.score);
  return arr.slice(0, 50);
}

// Emit helper: send both long and short event names for compatibility
function emitToAll(longName, shortName, payload) {
  io.emit(longName, payload);
  if (shortName && shortName !== longName) io.emit(shortName, payload);
}

io.on("connection", socket => {
  console.log("conn", socket.id);

  // Support both "init" (old) and "init_v2" (alternative) names for robustness
  const handleInit = (data) => {
    const name = String((data && data.name) || `Guest-${socket.id.slice(0,4)}`).slice(0,32);
    const score = Math.max(0, Number((data && data.score) || 0));
    if (bannedNames.has(name)) {
      socket.emit("banned");
      return;
    }
    players.set(socket.id, { name, score, avatar: (data && data.avatar) || null });
    socket.emit("init_ok", { name, ranking: getRankingArray(), banned: Array.from(bannedNames) });
    emitToAll("ranking_update", "rank", getRankingArray());
  };
  socket.on("init", handleInit);
  socket.on("init_v2", handleInit);

  const handleScoreUpdate = (data) => {
    const p = players.get(socket.id);
    if (!p) return;
    const newScore = Math.max(0, Number((data && data.score) || 0));
    p.score = newScore;
    players.set(socket.id, p);
    emitToAll("ranking_update", "rank", getRankingArray());
  };
  socket.on("score_update", handleScoreUpdate);
  socket.on("score_v2", handleScoreUpdate);

  const handleNameChange = (data) => {
    const newName = String((data && data.name) || "").trim().slice(0,32);
    if (!newName) return;
    if (bannedNames.has(newName)) {
      socket.emit("name_change_failed", { reason: "banned" });
      return;
    }
    const p = players.get(socket.id) || { name: newName, score: 0 };
    const oldName = p.name;
    p.name = newName;
    players.set(socket.id, p);
    emitToAll("system", "sys", `${oldName || "Unknown"} は ${newName} に名前を変更しました`);
    emitToAll("ranking_update", "rank", getRankingArray());
  };
  socket.on("name_change", handleNameChange);
  socket.on("name_v2", handleNameChange);

  socket.on("admin_command", data => {
    if (!data || typeof data !== "object") return;
    const { cmd, actor } = data;
    if (actor !== "admin") return;
    if (!cmd || !cmd.type) return;

    if (cmd.type === "ban" && cmd.target) {
      bannedNames.add(cmd.target);
      for (const [sid, p] of players.entries()) {
        if (p.name === cmd.target) io.to(sid).emit("banned");
      }
      emitToAll("system", "sys", `${cmd.target} をBANしました`);
      emitToAll("ranking_update", "rank", getRankingArray());
    } else if (cmd.type === "unban" && cmd.target) {
      bannedNames.delete(cmd.target);
      emitToAll("system", "sys", `${cmd.target} のBANを解除しました`);
      emitToAll("ranking_update", "rank", getRankingArray());
    } else if (cmd.type === "forceRename" && cmd.oldName && cmd.newName) {
      for (const [sid, p] of players.entries()) {
        if (p.name === cmd.oldName) {
          p.name = cmd.newName;
          players.set(sid, p);
          io.to(sid).emit("forced_rename", { newName: cmd.newName });
        }
      }
      emitToAll("system", "sys", `${cmd.oldName} を強制的に ${cmd.newName} に変更しました`);
      emitToAll("ranking_update", "rank", getRankingArray());
    }
  });

  // Accept both "chat message" and "msg" for compatibility; emit both names when broadcasting
  const handleChat = (data) => {
    if (!data || typeof data !== "object") return;
    if (data.type === "user") {
      const p = players.get(socket.id);
      if (!p) return;
      if (bannedNames.has(p.name)) {
        socket.emit("banned");
        return;
      }
      const name = String(p.name).slice(0,32);
      const text = String(data.text || "").slice(0,500);
      const avatar = data.avatar || p.avatar || null;
      const payload = { type: "user", name, text, avatar };
      emitToAll("chat message", "msg", payload);
    }
  };
  socket.on("chat message", handleChat);
  socket.on("msg", handleChat);

  socket.on("disconnect", reason => {
    players.delete(socket.id);
    emitToAll("ranking_update", "rank", getRankingArray());
    console.log("disc", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`listening ${PORT}`));
