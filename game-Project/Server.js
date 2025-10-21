// 必要なモジュールを読み込み
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 静的ファイルを配信（HTML, CSS, JSなど）
app.use(express.static(path.join(__dirname, "public"))); // publicフォルダにindex.htmlなどを置く

// クライアント接続時の処理
io.on("connection", socket => {
  console.log("ユーザーが接続しました");

  // メッセージ受信 → 全体に送信
  socket.on("chat message", data => {
    io.emit("chat message", data); // すべてのクライアントに送信
  });

  socket.on("disconnect", () => {
    console.log("ユーザーが切断しました");
  });
});

// サーバー起動
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`サーバー起動中！ http://localhost:${PORT}`);
});
