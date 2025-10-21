// server.js（Node.js用）
const express = require("express");
const http = require("http");
const path = require("path");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// public フォルダを静的配信
app.use(express.static(path.join(__dirname, "public")));

// Socket.IO の接続処理
io.on("connection", socket => {
  console.log("ユーザーが接続しました");

  socket.on("chat message", data => {
    io.emit("chat message", data); // 全員にブロードキャスト
  });

  socket.on("disconnect", () => {
    console.log("ユーザーが切断しました");
  });
});

// Render が渡す PORT を使って起動
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`サーバー起動中！ポート: ${PORT}`);
});
