// server.js
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// public を静的配信
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// サーバ内状態（メモリ保持）
const players = new Map(); // socket.id -> { name, score }
const bannedNames = new Set();

function getRankingArray() {
  const map = new Map();
  for (const [, p] of players) {
    if (!p || !p.name) continue;
    const prev = map.get(p.name) || 0;
    map.set(p.name, Math.max(prev, p.score || 0));
  }
  const arr = [...map.entries()].map(([name, score]) => ({ name, score }));
  arr.sort((a, b) => b.score - a.score);
  return arr.slice(0, 50);
}

io.on("connection", socket => {
  console.log("connect:", socket.id);

  socket.on("init", data => {
    const name = String(data && data.name || `Guest-${socket.id.slice(0,4)}`).slice(0,32);
    const score = Math.max(0, Number(data && data.score) || 0);
    if (bannedNames.has(name)) {
      socket.emit("banned");
      return;
    }
    players.set(socket.id, { name, score });
    socket.emit("init_ok", { name, ranking: getRankingArray(), banned: Array.from(bannedNames) });
    io.emit("ranking_update", getRankingArray());
  });

  socket.on("score_update", data => {
    const p = players.get(socket.id);
    if (!p) return;
    const newScore = Math.max(0, Number(data && data.score) || 0);
    p.score = newScore;
    players.set(socket.id, p);
    io.emit("ranking_update", getRankingArray());
  });

  socket.on("name_change", data => {
    const newName = String(data && data.name || "").trim().slice(0,32);
    if (!newName) return;
    if (bannedNames.has(newName)) {
      socket.emit("name_change_failed", { reason: "banned" });
      return;
    }
    const p = players.get(socket.id) || { name: newName, score: 0 };
    const oldName = p.name;
    p.name = newName;
    players.set(socket.id, p);
    io.emit("system", `${oldName || "Unknown"} は ${newName} に名前を変更しました`);
    io.emit("ranking_update", getRankingArray());
  });

  socket.on("admin_command", data => {
    if (!data || typeof data !== "object") return;
    const { cmd, actor } = data;
    if (actor !== "admin") return;
    if (cmd.type === "ban" && cmd.target) {
      bannedNames.add(cmd.target);
      for (const [sid, p] of players.entries()) {
        if (p.name === cmd.target) {
          io.to(sid).emit("banned");
        }
      }
      io.emit("system", `${cmd.target} をBANしました`);
      io.emit("ranking_update", getRankingArray());
    } else if (cmd.type === "unban" && cmd.target) {
      bannedNames.delete(cmd.target);
      io.emit("system", `${cmd.target} のBANを解除しました`);
      io.emit("ranking_update", getRankingArray());
    } else if (cmd.type === "forceRename" && cmd.oldName && cmd.newName) {
      for (const [sid, p] of players.entries()) {
        if (p.name === cmd.oldName) {
          p.name = cmd.newName;
          players.set(sid, p);
          io.to(sid).emit("forced_rename", { newName: cmd.newName });
        }
      }
      io.emit("system", `${cmd.oldName} を強制的に ${cmd.newName} に変更しました`);
      io.emit("ranking_update", getRankingArray());
    }
  });

  socket.on("chat message", data => {
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
      const avatar = data.avatar || null;
      io.emit("chat message", { type: "user", name, text, avatar });
    }
  });

  socket.on("disconnect", reason => {
    players.delete(socket.id);
    io.emit("ranking_update", getRankingArray());
    console.log("disconnect:", socket.id, reason);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
