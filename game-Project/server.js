// game-Project/server.js
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// public を静的配信
app.use(express.static(path.join(__dirname, "public")));

// Socket.IO で受け取ったメッセージを全員にブロードキャスト
io.on("connection", socket => {
  console.log("ユーザー接続:", socket.id);
  socket.on("chat message", data => {
    io.emit("chat message", data);
  });
  socket.on("disconnect", () => {
    console.log("ユーザー切断:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
