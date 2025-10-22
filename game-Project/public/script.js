// public/script.js
(() => {
  // DOM
  const countDisplay = document.getElementById("emerald-count");
  const emeraldImage = document.getElementById("emerald-image");
  const shopArea = document.getElementById("shop");
  const inventoryArea = document.getElementById("inventory");
  const rankingArea = document.getElementById("ranking");
  const chatArea = document.getElementById("messages");
  const chatInput = document.getElementById("chat-input");
  const chatForm = document.getElementById("chat-form");
  const chatSendBtn = document.getElementById("chat-send");
  const nameInput = document.getElementById("name-input");
  const nameChangeBtn = document.getElementById("name-change-btn");
  const randomAvatarBtn = document.getElementById("random-avatar-btn");

  // state
  let emeralds = Number(localStorage.getItem("score") || 0);
  let clickPower = 1;
  let upgrades = [];
  let bannedUsers = [];
  let playerNameMap = {};
  let playerName = localStorage.getItem("playerName") || prompt("あなたの名前を入力してください:") || "Guest";
  localStorage.setItem("playerName", playerName);
  let avatarColor = localStorage.getItem("avatarColor") || (() => {
    const colors = ['#f39c12','#e74c3c','#2ecc71','#3498db','#9b59b6','#1abc9c','#34495e','#e67e22'];
    const c = colors[Math.floor(Math.random() * colors.length)];
    localStorage.setItem("avatarColor", c);
    return c;
  })();

  // socket
  const socket = window.io ? io() : null;

  // utilities
  function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function updateDisplay() { countDisplay.textContent = emeralds; }
  function saveScore() { localStorage.setItem("score", emeralds); if (socket) socket.emit("score_update", { score: emeralds }); }

  // ranking local fallback (kept for offline)
  function renderRanking(ranking) {
    rankingArea.innerHTML = "<ol></ol>";
    const ol = rankingArea.querySelector("ol");
    (ranking || []).forEach(r => {
      const li = document.createElement("li");
      li.textContent = `${r.name}：${r.score}`;
      ol.appendChild(li);
    });
  }

  // shop & upgrades
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
        saveScore();
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

  // auto increments
  setInterval(() => {
    upgrades.forEach(up => {
      if (up.toggle && up.active && up.rate) emeralds += up.rate;
    });
    updateDisplay();
    saveScore();
  }, 1000);

  // click handler
  if (emeraldImage) {
    emeraldImage.addEventListener("click", () => {
      if (bannedUsers.includes(playerName)) { alert("あなたはBANされています。"); return; }
      emeralds += clickPower;
      updateDisplay();
      saveScore();
    });
  }

  // message rendering
  function appendUserMessage(name, text, avatar) {
    const displayName = playerNameMap[name] || name;
    const msg = document.createElement("div");
    msg.classList.add("message");
    msg.innerHTML = `
      <div class="avatar" style="background:${escapeHtml(avatar || '#ddd')};"></div>
      <span class="username">${escapeHtml(displayName)}</span>
      <span class="text">${escapeHtml(text)}</span>
    `;
    chatArea.appendChild(msg);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function appendSystemMessage(text) {
    const msg = document.createElement("div");
    msg.classList.add("message", "system");
    msg.innerHTML = `
      <div class="avatar" style="background:#bbb;"></div>
      <span class="username">System</span>
      <span class="text">${escapeHtml(text)}</span>
    `;
    chatArea.appendChild(msg);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  // socket events and init
  if (socket) {
    socket.on("connect", () => {
      socket.emit("init", { name: playerName, score: emeralds });
    });

    socket.on("init_ok", data => {
      playerName = data.name;
      localStorage.setItem("playerName", playerName);
      renderRanking(data.ranking);
      if (Array.isArray(data.banned)) bannedUsers = data.banned;
    });

    socket.on("ranking_update", ranking => {
      renderRanking(ranking);
    });

    socket.on("system", text => appendSystemMessage(text));
    socket.on("chat message", msg => {
      if (!msg) return;
      if (msg.type === "user") appendUserMessage(msg.name, msg.text, msg.avatar);
      else appendSystemMessage(String(msg.text || ""));
    });

    socket.on("forced_rename", info => {
      playerName = info.newName;
      localStorage.setItem("playerName", playerName);
      appendSystemMessage(`あなたの名前が強制的に ${playerName} に変更されました`);
    });

    socket.on("banned", () => {
      alert("あなたはBANされました。ページの機能が制限されます。");
      bannedUsers.push(playerName);
    });

    socket.on("disconnect", () => appendSystemMessage("サーバーから切断されました"));
  } else {
    appendSystemMessage("リアルタイムチャットは利用できません（socket.io 未ロード）");
  }

  // chat send logic
  function sendChatRaw(raw) {
    const text = String(raw || "").trim();
    if (!text) return;
    if (playerName === "admin" && text.startsWith("/")) {
      const parts = text.split(" ").filter(p => p !== "");
      const cmd = parts[0].toLowerCase();
      if (cmd === "/ban" && parts[1]) {
        if (socket) socket.emit("admin_command", { actor: "admin", cmd: { type: "ban", target: parts[1] } });
        return;
      }
      if (cmd === "/unban" && parts[1]) {
        if (socket) socket.emit("admin_command", { actor: "admin", cmd: { type: "unban", target: parts[1] } });
        return;
      }
      if (cmd === "/forcerename" && parts[1] && parts[2]) {
        if (socket) socket.emit("admin_command", { actor: "admin", cmd: { type: "forceRename", oldName: parts[1], newName: parts[2] } });
        return;
      }
      appendSystemMessage("不明な管理コマンドです");
      return;
    }

    if (bannedUsers.includes(playerName)) { alert("あなたはBANされています。"); return; }

    if (socket) {
      socket.emit("chat message", { type: "user", text, avatar: avatarColor });
    } else {
      appendUserMessage(playerName, text, avatarColor);
    }
  }

  if (chatForm) {
    chatForm.addEventListener("submit", e => {
      e.preventDefault();
      const raw = chatInput.value || "";
      chatInput.value = "";
      sendChatRaw(raw);
    });
  }

  if (chatSendBtn) {
    chatSendBtn.addEventListener("click", () => {
      const raw = chatInput.value || "";
      chatInput.value = "";
      sendChatRaw(raw);
    });
  }

  // name change UI
  function changeNameTo(newName) {
    newName = String(newName || "").trim().slice(0,32);
    if (!newName) return;
    playerName = newName;
    localStorage.setItem("playerName", playerName);
    if (socket) socket.emit("name_change", { name: playerName });
    appendSystemMessage(`あなたの名前を ${playerName} に変更しました`);
    // update server-side score mapping as well
    if (socket) socket.emit("score_update", { score: emeralds });
  }

  if (nameChangeBtn) {
    nameChangeBtn.addEventListener("click", () => {
      const v = nameInput.value || "";
      if (!v.trim()) { alert("名前を入力してください"); return; }
      changeNameTo(v);
      nameInput.value = "";
    });
  }

  if (randomAvatarBtn) {
    randomAvatarBtn.addEventListener("click", () => {
      const colors = ['#f39c12','#e74c3c','#2ecc71','#3498db','#9b59b6','#1abc9c','#34495e','#e67e22'];
      avatarColor = colors[Math.floor(Math.random() * colors.length)];
      localStorage.setItem("avatarColor", avatarColor);
      appendSystemMessage("アイコンをランダムに変更しました");
    });
  }

  // expose admin helpers for console (optional)
  window._sendAdminBan = target => { if (socket) socket.emit("admin_command", { actor: "admin", cmd: { type: "ban", target } }); };
  window._sendAdminUnban = target => { if (socket) socket.emit("admin_command", { actor: "admin", cmd: { type: "unban", target } }); };
  window._sendForceRename = (oldName, newName) => { if (socket) socket.emit("admin_command", { actor: "admin", cmd: { type: "forceRename", oldName, newName } }); };

  // initialization
  createShop();
  updateDisplay();
  saveScore();
  if (socket) socket.emit("init", { name: playerName, score: emeralds });
  appendSystemMessage(`ようこそ ${playerName} さん！`);
})();
