// public/script.js
(() => {
  // DOM
  const countDisplay = document.getElementById("emerald-count");
  const emeraldImage = document.getElementById("emerald-image");
  const shopArea = document.getElementById("shop");
  const inventoryArea = document.getElementById("inventory");
  const rankingArea = document.getElementById("ranking");
  const talkArea = document.getElementById("talk-messages");
  const msgInput = document.getElementById("msg-input");
  const msgForm = document.getElementById("msg-form");
  const msgSendBtn = document.getElementById("msg-send");
  const nameInput = document.getElementById("name-input");
  const nameChangeBtn = document.getElementById("name-change-btn");
  const avatarSelect = document.getElementById("avatar-select");

  // state
  let emeralds = Number(localStorage.getItem("score") || 0);
  let clickPower = 1;
  let upgrades = [];
  let bannedUsers = [];
  let playerName = localStorage.getItem("playerName") || (typeof prompt === 'function' ? prompt("あなたの名前を入力してください:") : "") || "Guest";
  localStorage.setItem("playerName", playerName);

  const availableAvatars = [
    "images/ez1izKc3TZEiHqBRrfeSg.png",
    "images/coin-green.png",
    "images/coin-blue.png",
    "images/avatar1.png",
    "images/avatar2.png",
    "images/avatar3.png"
  ];

  let avatarImage = localStorage.getItem("avatarImage") || null;
  let avatarColor = localStorage.getItem("avatarColor") || null;

  // connect to socket.io using same path and polling transport (if io is loaded)
  const socket = (window.io && typeof io === "function") ? io({ path: '/s', transports: ['polling'] }) : null;

  function updateDisplay() { if (countDisplay) countDisplay.textContent = emeralds; }
  function saveScore() { localStorage.setItem("score", emeralds); if (socket) socket.emit("score_update", { score: emeralds }); }

  function applyAvatarSelection(value) {
    if (!value) return;
    if (value.startsWith("color:")) {
      avatarColor = value.replace("color:", "");
      avatarImage = null;
      localStorage.setItem("avatarColor", avatarColor);
      localStorage.removeItem("avatarImage");
    } else if (value.startsWith("img:")) {
      avatarImage = value.replace("img:", "");
      avatarColor = null;
      localStorage.setItem("avatarImage", avatarImage);
      localStorage.removeItem("avatarColor");
    } else {
      avatarImage = value;
      avatarColor = null;
      localStorage.setItem("avatarImage", avatarImage);
      localStorage.removeItem("avatarColor");
    }
  }

  (function initAvatar() {
    avatarImage = localStorage.getItem("avatarImage") || avatarImage;
    avatarColor = localStorage.getItem("avatarColor") || avatarColor;
  })();

  function populateAvatarSelect() {
    if (!avatarSelect) return;
    avatarSelect.innerHTML = "";
    const colors = [
      { label: "色: 緑", value: "color:#2ecc71" },
      { label: "色: 青", value: "color:#3498db" },
      { label: "色: 橙", value: "color:#e67e22" }
    ];
    const optGroupColor = document.createElement("optgroup");
    optGroupColor.label = "色";
    colors.forEach(c => {
      const o = document.createElement("option");
      o.value = c.value;
      o.textContent = c.label;
      optGroupColor.appendChild(o);
    });
    avatarSelect.appendChild(optGroupColor);

    const optGroupImg = document.createElement("optgroup");
    optGroupImg.label = "画像（images）";
    availableAvatars.forEach(fn => {
      const o = document.createElement("option");
      o.value = `img:${fn}`;
      o.textContent = fn.replace(/^images\//, "");
      if (avatarImage === fn) o.selected = true;
      optGroupImg.appendChild(o);
    });
    avatarSelect.appendChild(optGroupImg);

    if (avatarColor && !avatarImage) {
      const v = `color:${avatarColor}`;
      for (const opt of avatarSelect.options) if (opt.value === v) opt.selected = true;
    }
  }

  // shop setup (same as your items)
  upgrades = [
    { id: "click2", name: "一タップ2エメラルド", cost: 50, effect: () => clickPower = Math.max(2, clickPower), toggle: false },
    { id: "auto1", name: "オート +1/秒", cost: 1000, toggle: true, active: false, rate: 1 },
    { id: "auto5", name: "オート +5/秒", cost: 3000, toggle: true, active: false, rate: 5 },
    { id: "boost", name: "エメラルド倍増イベント", cost: 5000, toggle: true, active: false },
    { id: "miner", name: "小型採掘機 +2/秒", cost: 1200, toggle: true, active: false, rate: 2 },
    { id: "drill", name: "高速ドリル +10/秒", cost: 8000, toggle: true, active: false, rate: 10 },
    { id: "magnet", name: "マグネット収集 +3/クリック", cost: 700, effect: () => clickPower += 3, toggle: false },
    { id: "lucky", name: "ラッキーチャーム（10%で倍）", cost: 2500, toggle: true, active: false },
    { id: "bank", name: "銀行利子 +1%/分", cost: 5000, toggle: true, active: false },
    { id: "factory", name: "工場 +50/分", cost: 30000, toggle: true, active: false, rate: 50 },
    { id: "gembox", name: "宝箱（即時 +500）", cost: 5000, effect: () => { emeralds += 500; }, toggle: false },
    { id: "staff", name: "助手（自動収集 +8/秒）", cost: 12000, toggle: true, active: false, rate: 8 },
    { id: "rocket", name: "ロケットブースト（クリック+50）", cost: 15000, effect: () => clickPower += 50, toggle: false },
    { id: "event", name: "イベントパス（全ての収益+20%）", cost: 20000, toggle: true, active: false }
  ];

  function createShop() {
    if (!shopArea) return;
    shopArea.innerHTML = "";
    upgrades.forEach(up => {
      const btn = document.createElement("button");
      btn.id = up.id;
      btn.textContent = `${up.name}（${up.cost}）`;
      btn.addEventListener("click", () => {
        if (emeralds < up.cost) { alert("エメラルドが足りないよ！"); return; }
        emeralds -= up.cost;
        try { if (up.effect) up.effect(); } catch (e) {}
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
    if (!inventoryArea) return;
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
    let gain = 0;
    upgrades.forEach(up => {
      if (up.toggle && up.active && up.rate) gain += up.rate;
    });
    const eventActive = upgrades.find(u => u.id === "event" && u.active);
    if (eventActive) gain = Math.floor(gain * 1.2);
    emeralds += gain;
    updateDisplay();
    saveScore();
  }, 1000);

  // click handler
  if (emeraldImage) {
    emeraldImage.addEventListener("click", () => {
      if (bannedUsers.includes(playerName)) { alert("あなたは利用制限されています。"); return; }
      const lucky = upgrades.find(u => u.id === "lucky" && u.active);
      let gained = clickPower;
      if (lucky && Math.random() < 0.10) gained *= 2;
      emeralds += gained;
      updateDisplay();
      saveScore();
    });
  }

  // avatar rendering
  function createAvatarElement(avatar) {
    let a = avatar || (avatarImage ? avatarImage : (avatarColor ? `color:${avatarColor}` : null));
    if (!a) {
      const el = document.createElement("div");
      el.className = "avatar";
      el.style.background = "#ddd";
      return el;
    }
    if (a.startsWith("img:")) a = a.replace("img:", "");
    if (a.startsWith("color:")) a = a.replace("color:", "");
    if (/\.(png|jpg|jpeg|gif|webp)$/i.test(a)) {
      const img = document.createElement("img");
      img.className = "img-avatar";
      img.src = a;
      img.alt = "avatar";
      img.width = 32;
      img.height = 32;
      return img;
    }
    if (/^#/.test(a)) {
      const el = document.createElement("div");
      el.className = "avatar";
      el.style.background = a;
      return el;
    }
    const el = document.createElement("div");
    el.className = "avatar";
    el.style.background = "#ddd";
    return el;
  }

  // message rendering
  function appendUserMessage(name, text, avatar) {
    const msg = document.createElement("div");
    msg.classList.add("msg");
    const avatarEl = createAvatarElement(avatar);
    const label = document.createElement("div");
    label.className = "user-label";
    label.textContent = name;
    const textEl = document.createElement("div");
    textEl.className = "text";
    textEl.textContent = text;
    msg.appendChild(avatarEl);
    msg.appendChild(label);
    msg.appendChild(textEl);
    talkArea.appendChild(msg);
    talkArea.scrollTop = talkArea.scrollHeight;
  }

  function appendSystemMessage(text) {
    const msg = document.createElement("div");
    msg.classList.add("msg", "system");
    const avatarEl = createAvatarElement(null);
    const label = document.createElement("div");
    label.className = "user-label";
    label.textContent = "運営";
    const textEl = document.createElement("div");
    textEl.className = "text";
    textEl.textContent = text;
    msg.appendChild(avatarEl);
    msg.appendChild(label);
    msg.appendChild(textEl);
    talkArea.appendChild(msg);
    talkArea.scrollTop = talkArea.scrollHeight;
  }

  // socket events
  if (socket) {
    socket.on("connect", () => {
      socket.emit("init", { name: playerName, score: emeralds, avatar: avatarImage });
    });

    socket.on("init_ok", data => {
      if (!data) return;
      playerName = data.name || playerName;
      localStorage.setItem("playerName", playerName);
      if (Array.isArray(data.banned)) bannedUsers = data.banned;
      if (data.ranking) renderRanking(data.ranking);
    });

    socket.on("rank", ranking => renderRanking(ranking));
    socket.on("ranking_update", ranking => renderRanking(ranking));

    socket.on("sys", text => appendSystemMessage(text));
    socket.on("system", text => appendSystemMessage(text));

    socket.on("msg", payload => {
      if (!payload) return;
      if (payload.type === "user") appendUserMessage(payload.name, payload.text, payload.avatar);
      else appendSystemMessage(String(payload.text || ""));
    });
    socket.on("talk_message", payload => {
      if (!payload) return;
      if (payload.type === "user") appendUserMessage(payload.name, payload.text, payload.avatar);
      else appendSystemMessage(String(payload.text || ""));
    });

    socket.on("forced_rename", info => {
      if (!info) return;
      playerName = info.newName;
      localStorage.setItem("playerName", playerName);
      appendSystemMessage(`あなたの名前が強制的に ${playerName} に変更されました`);
    });

    socket.on("banned", () => {
      alert("あなたは利用制限されました。ページの機能が制限されます。");
      bannedUsers.push(playerName);
    });

    socket.on("disconnect", () => appendSystemMessage("サーバーから切断されました"));
  } else {
    appendSystemMessage("リアルタイム交流は利用できません（通信ライブラリ 未ロード）");
  }

  // send logic (operator commands allowed only if name === 'operator' or local flag)
  function sendTalkRaw(raw) {
    const text = String(raw || "").trim();
    if (!text) return;

    if ((playerName.toLowerCase() === "operator") && text.startsWith("/")) {
      const parts = text.split(" ").filter(Boolean);
      const cmd = parts[0].toLowerCase();
      if ((cmd === "/ban") && parts[1]) {
        if (socket) socket.emit("operator_cmd", { actor: playerName, cmd: { type: "ban", target: parts[1] } });
        return;
      }
      if ((cmd === "/unban" || cmd === "/allow") && parts[1]) {
        if (socket) socket.emit("operator_cmd", { actor: playerName, cmd: { type: "unban", target: parts[1] } });
        return;
      }
      if (cmd === "/forcerename" && parts[1] && parts[2]) {
        if (socket) socket.emit("operator_cmd", { actor: playerName, cmd: { type: "forceRename", oldName: parts[1], newName: parts[2] } });
        return;
      }
      appendSystemMessage("不明な操作コマンドです");
      return;
    }

    if (bannedUsers.includes(playerName)) { alert("あなたは利用制限されています。"); return; }

    const avatarPayload = avatarImage ? avatarImage : (avatarColor ? `color:${avatarColor}` : null);
    if (socket) {
      socket.emit("talk_message", { type: "user", text, avatar: avatarPayload, name: playerName });
    } else {
      appendUserMessage(playerName, text, avatarPayload);
    }
  }

  if (msgForm) {
    msgForm.addEventListener("submit", e => {
      e.preventDefault();
      const raw = msgInput.value || "";
      msgInput.value = "";
      sendTalkRaw(raw);
    });
  }
  if (msgSendBtn) {
    msgSendBtn.addEventListener("click", () => {
      const raw = msgInput.value || "";
      msgInput.value = "";
      sendTalkRaw(raw);
    });
  }

  function changeNameTo(newName) {
    newName = String(newName || "").trim().slice(0,32);
    if (!newName) return;
    playerName = newName;
    localStorage.setItem("playerName", playerName);
    if (socket) socket.emit("name_change", { name: playerName });
    appendSystemMessage(`あなたの名前を ${playerName} に変更しました`);
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

  if (avatarSelect) {
    avatarSelect.addEventListener("change", () => {
      const v = avatarSelect.value || "";
      if (!v) return;
      applyAvatarSelection(v);
      appendSystemMessage("アイコンを変更しました");
    });
    populateAvatarSelect();
  }

  window._sendOperatorBan = target => { if (socket) socket.emit("operator_cmd", { actor: playerName, cmd: { type: "ban", target } }); };
  window._sendOperatorUnban = target => { if (socket) socket.emit("operator_cmd", { actor: playerName, cmd: { type: "unban", target } }); };
  window._sendForceRename = (oldName, newName) => { if (socket) socket.emit("operator_cmd", { actor: playerName, cmd: { type: "forceRename", oldName, newName } }); };

  function renderRanking(ranking) {
    if (!rankingArea) return;
    rankingArea.innerHTML = "<ol></ol>";
    const ol = rankingArea.querySelector("ol");
    (ranking || []).forEach(r => {
      const li = document.createElement("li");
      li.textContent = `${r.name}：${r.score}`;
      ol.appendChild(li);
    });
  }

  // init
  createShop();
  updateDisplay();
  saveScore();
  if (socket) socket.emit("init", { name: playerName, score: emeralds, avatar: avatarImage });
  appendSystemMessage(`ようこそ ${playerName} さん！`);
})();
