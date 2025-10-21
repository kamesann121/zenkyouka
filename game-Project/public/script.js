// クライアント側スクリプト（public/script.js）
(() => {
  // 初期状態
  let emeralds = 0;
  let clickPower = 1;
  let upgrades = [];
  let bannedUsers = [];
  let playerNameMap = {};
  let playerName = prompt("あなたの名前を入力してください:") || "Guest";

  // DOM 要素取得
  const countDisplay = document.getElementById("emerald-count");
  const emeraldImage = document.getElementById("emerald-image");
  const shopArea = document.getElementById("shop");
  const inventoryArea = document.getElementById("inventory");
  const rankingArea = document.getElementById("ranking");
  const chatArea = document.getElementById("messages");
  const chatInput = document.getElementById("chat-input");

  // Socket.IO クライアント接続（サーバーに socket.io が導入されている想定）
  const socket = io();

  socket.on("connect", () => appendSystemMessage("サーバーに接続しました"));
  socket.on("disconnect", () => appendSystemMessage("サーバーから切断されました"));
  socket.on("chat message", data => {
    if (!data) return;
    data.type === "system" ? appendSystemMessage(data.text) : appendUserMessage(data.name, data.text);
  });

  // ユーティリティ
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // 表示更新
  function updateDisplay() { countDisplay.textContent = emeralds; }

  // ランキング（localStorage）
  function loadRanking() { return JSON.parse(localStorage.getItem("ranking") || "[]"); }
  function saveRanking(r) { localStorage.setItem("ranking", JSON.stringify(r)); }
  function renderRanking() {
    const ranking = loadRanking();
    rankingArea.innerHTML = "<ol></ol>";
    const ol = rankingArea.querySelector("ol");
    ranking.forEach(r => {
      const displayName = playerNameMap[r.name] || r.name;
      const li = document.createElement("li");
      li.textContent = `${displayName}：${r.score}`;
      ol.appendChild(li);
    });
  }
  function saveAndRenderRanking() {
    let ranking = loadRanking();
    const idx = ranking.findIndex(r => r.name === playerName);
    if (idx >= 0) ranking[idx].score = emeralds; else ranking.push({ name: playerName, score: emeralds });
    ranking.sort((a, b) => b.score - a.score);
    ranking = ranking.slice(0, 10);
    saveRanking(ranking);
    renderRanking();
  }
  function applyForcedRename(oldName, newName) {
    let ranking = loadRanking();
    if (newName === null) {
      ranking = ranking.filter(r => r.name !== oldName);
    } else {
      const oldIdx = ranking.findIndex(r => r.name === oldName);
      const newIdx = ranking.findIndex(r => r.name === newName);
      if (oldIdx >= 0) {
        if (newIdx >= 0) {
          ranking[newIdx].score = Math.max(ranking[newIdx].score, ranking[oldIdx].score);
          ranking.splice(oldIdx, 1);
        } else {
          ranking[oldIdx].name = newName;
        }
      }
    }
    ranking.sort((a, b) => b.score - a.score);
    ranking = ranking.slice(0, 10);
    saveRanking(ranking);
    renderRanking();
  }

  // アップグレード定義とショップ生成
  upgrades = [
    { id: "click2", name: "一タップ2エメラルド", cost: 50, effect: () => clickPower = 2, toggle: false },
    { id: "auto1", name: "オート +1/秒", cost: 1000, effect: () => {}, toggle: true, active: false, rate: 1 },
    { id: "auto5", name: "オート +5/秒", cost: 3000, effect: () => {}, toggle: true, active: false, rate: 5 },
    { id: "boost", name: "エメラルド倍増イベント", cost: 5000, effect: () => clickPower *= 2, toggle: true, active: false }
  ];

  function createShop() {
    shopArea.innerHTML = "";
    upgrades.forEach(up => {
      const btn = document.createElement("button");
      btn.id = up.id;
      btn.textContent = `${up.name}（${up.cost}）`;
      btn.addEventListener("click", () => {
        if (emeralds < up.cost) { alert("エメラルドが足りないよ！"); return; }
        emeralds -= up.cost;
        up.effect();
        btn.disabled = true;
        btn.textContent += " ✅";
        if (up.toggle) {
          up.active = true;
          addToInventory(up);
        }
        updateDisplay();
        saveAndRenderRanking();
      });
      shopArea.appendChild(btn);
    });
  }

  function addToInventory(up) {
    if (document.getElementById(`inv-${up.id}`)) return;
    const invBtn = document.createElement("button");
    invBtn.id = `inv-${up.id}`;
    invBtn.textContent = up.name;
    invBtn.classList.add("active");
    invBtn.addEventListener("click", () => {
      up.active = !up.active;
      invBtn.classList.toggle("active", up.active);
      invBtn.classList.toggle("inactive", !up.active);
    });
    inventoryArea.appendChild(invBtn);
  }

  // 自動増加
  setInterval(() => {
    upgrades.forEach(up => {
      if (up.toggle && up.active && up.rate) emeralds += up.rate;
    });
    updateDisplay();
    saveAndRenderRanking();
  }, 1000);

  // クリックで増やす
  emeraldImage.addEventListener("click", () => {
    if (bannedUsers.includes(playerName)) { alert("あなたはBANされています。"); return; }
    emeralds += clickPower;
    updateDisplay();
    saveAndRenderRanking();
  });

  // チャット入力処理
  chatInput.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const raw = chatInput.value.trim();
    if (!raw) return;
    chatInput.value = "";

    if (playerName === "admin" && raw.startsWith("/")) {
      const parts = raw.split(" ").filter(p => p !== "");
      const cmd = parts[0];
      if (cmd === "/BAN" && parts[1]) {
        const target = parts[1];
        if (!bannedUsers.includes(target)) {
          bannedUsers.push(target);
          socket.emit("chat message", { type: "system", text: `${target} をBANしました` });
        } else {
          socket.emit("chat message", { type: "system", text: `${target} は既にBANされています` });
        }
        return;
      }
      if (cmd === "/bro" && parts[1]) {
        const target = parts[1];
        bannedUsers = bannedUsers.filter(u => u !== target);
        socket.emit("chat message", { type: "system", text: `${target} のBANを解除しました` });
        return;
      }
      if (cmd === "/ニックネーム") {
        if (parts[1] === "erase" && parts[2]) {
          const target = parts[2];
          delete playerNameMap[target];
          applyForcedRename(target, null);
          socket.emit("chat message", { type: "system", text: `${target} をランキングから削除しました` });
          return;
        }
        if (parts[1] && parts[2]) {
          const oldName = parts[1];
          const newName = parts[2];
          playerNameMap[oldName] = newName;
          applyForcedRename(oldName, newName);
          socket.emit("chat message", { type: "system", text: `${oldName} を強制的に ${newName} に変更しました` });
          if (oldName === playerName) {
            playerName = newName;
            socket.emit("chat message", { type: "system", text: `あなたの名前を ${playerName} に変更しました` });
            saveAndRenderRanking();
          }
          return;
        }
        socket.emit("chat message", { type: "system", text: "使い方: /ニックネーム oldName newName または /ニックネーム erase targetName" });
        return;
      }
      socket.emit("chat message", { type: "system", text: "不明なコマンドまたは引数が足りません" });
      return;
    }

    if (bannedUsers.includes(playerName)) { alert("あなたはBANされています。"); return; }
    socket.emit("chat message", { type: "user", name: playerName, text: raw });
  });

  // メッセージ表示
  function appendUserMessage(name, text) {
    const displayName = playerNameMap[name] || name;
    const msg = document.createElement("div");
    msg.classList.add("message");
    msg.innerHTML = `
      <div class="avatar"></div>
      <span class="username">${escapeHtml(displayName)}</span>
      <span class="text">${escapeHtml(text)}</span>
    `;
    chatArea.appendChild(msg);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function appendSystemMessage(text) {
    const msg = document.createElement("div");
    msg.classList.add("message");
    msg.innerHTML = `
      <div class="avatar"></div>
      <span class="username">System</span>
      <span class="text">${escapeHtml(text)}</span>
    `;
    chatArea.appendChild(msg);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  // 初期化
  createShop();
  updateDisplay();
  saveAndRenderRanking();
  appendSystemMessage(`ようこそ ${playerName} さん！`);
})();
