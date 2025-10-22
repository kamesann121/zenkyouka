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
  const avatarSelect = document.getElementById("avatar-select");
  const topBanner = document.getElementById("top-banner");
  const topBannerWrap = document.getElementById("top-banner-wrap");

  // state
  let emeralds = Number(localStorage.getItem("score") || 0);
  let clickPower = 1;
  let upgrades = [];
  let bannedUsers = [];
  let playerNameMap = {};
  let playerName = localStorage.getItem("playerName") || prompt("あなたの名前を入力してください:") || "Guest";
  localStorage.setItem("playerName", playerName);

  // available avatars (files should exist under public/)
  const availableAvatars = [
    "ez1izKc3TZEiHqBRrfeSg.png",
    "coin-green.png",
    "coin-blue.png",
    "avatar1.png",
    "avatar2.png",
    "avatar3.png"
  ];

  // avatar state: prefer image then color
  let avatarImage = localStorage.getItem("avatarImage") || null;
  let avatarColor = localStorage.getItem("avatarColor") || null;

  // socket
  const socket = window.io ? io() : null;

  // utilities
  function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function updateDisplay() { if (countDisplay) countDisplay.textContent = emeralds; }
  function saveScore() { localStorage.setItem("score", emeralds); if (socket) socket.emit("score_update", { score: emeralds }); }

  // --- Top banner and avatar initialization and helpers ---
  // Prefer localStorage.topBannerImage -> localStorage.avatarImage -> availableAvatars[0]
  function setTopBannerImage(filename) {
    if (!topBanner) return;
    const fn = filename || localStorage.getItem("topBannerImage") || avatarImage || availableAvatars[0] || "";
    topBanner.src = fn;
    localStorage.setItem("topBannerImage", fn);
  }

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
    // If you want to sync banner with avatar image selection, uncomment:
    // if (avatarImage) setTopBannerImage(avatarImage);
  }

  (function initBannerAndAvatar() {
    // set avatarImage/avatarColor from localStorage if present
    avatarImage = localStorage.getItem("avatarImage") || avatarImage;
    avatarColor = localStorage.getItem("avatarColor") || avatarColor;
    // set top banner
    const saved = localStorage.getItem("topBannerImage");
    if (saved) setTopBannerImage(saved);
    else setTopBannerImage(avatarImage || availableAvatars[0]);
  })();

  // populate avatar select UI
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
    optGroupImg.label = "画像（publicフォルダ）";
    availableAvatars.forEach(fn => {
      const o = document.createElement("option");
      o.value = `img:${fn}`;
      o.textContent = fn;
      if (avatarImage === fn) o.selected = true;
      optGroupImg.appendChild(o);
    });
    avatarSelect.appendChild(optGroupImg);

    // if color selected previously, select that
    if (avatarColor && !avatarImage) {
      const v = `color:${avatarColor}`;
      for (const opt of avatarSelect.options) if (opt.value === v) opt.selected = true;
    }
  }

  // --- Ranking render ---
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

  // --- Shop & Upgrades (total 14 items) ---
  upgrades = [
    { id: "click2", name: "一タップ2エメラルド", cost: 50, effect: () => clickPower = Math.max(2, clickPower), toggle: false },
    { id: "auto1", name: "オート +1/秒", cost: 1000, effect: () => {}, toggle: true, active: false, rate: 1 },
    { id: "auto5", name: "オート +5/秒", cost: 3000, effect: () => {}, toggle: true, active: false, rate: 5 },
    { id: "boost", name: "エメラルド倍増イベント", cost: 5000, effect: () => clickPower *= 2, toggle: true, active: false },

    { id: "miner", name: "小型採掘機 +2/秒", cost: 1200, effect: () => {}, toggle: true, active: false, rate: 2 },
    { id: "drill", name: "高速ドリル +10/秒", cost: 8000, effect: () => {}, toggle: true, active: false, rate: 10 },
    { id: "magnet", name: "マグネット収集 +3/クリック", cost: 700, effect: () => clickPower += 3, toggle: false },
    { id: "lucky", name: "ラッキーチャーム（10%で倍）", cost: 2500, effect: () => {}, toggle: true, active: false, rate: 0 },
    { id: "bank", name: "銀行利子 +1%/分", cost: 5000, effect: () => {}, toggle: true, active: false, rate: 0 },
    { id: "factory", name: "工場 +50/分", cost: 30000, effect: () => {}, toggle: true, active: false, rate: 50 },
    { id: "gembox", name: "宝箱（即時 +500）", cost: 5000, effect: () => { emeralds += 500; }, toggle: false },
    { id: "staff", name: "助手（自動収集 +8/秒）", cost: 12000, effect: () => {}, toggle: true, active: false, rate: 8 },
    { id: "rocket", name: "ロケットブースト（クリック+50）", cost: 15000, effect: () => clickPower += 50, toggle: false },
    { id: "event", name: "イベントパス（全ての収益+20%）", cost: 20000, effect: () => {}, toggle: true, active: false }
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
        try { up.effect(); } catch (e) {}
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
      if (bannedUsers.includes(playerName)) { alert("あなたはBANされています。"); return; }
      const lucky = upgrades.find(u => u.id === "lucky" && u.active);
      let gained = clickPower;
      if (lucky && Math.random() < 0.10) gained *= 2;
      emeralds += gained;
      updateDisplay();
      saveScore();
    });
  }

  // --- Avatar rendering helpers ---
  function createAvatarElement(avatar) {
    let a = avatar || (avatarImage ? avatarImage : (avatarColor ? `color:${avatarColor}` : null));
    if (!a) {
      const el = document.createElement("div");
      el.className = "avatar";
      el.style.background = "#ddd";
      return el;
    }
    // strip prefix
    if (a.startsWith("img:")) a = a.replace("img:", "");
    if (a.startsWith("color:")) a = a.replace("color:", "");
    if (/\.(png|jpg|jpeg|gif|webp)$/i.test(a)) {
      const img = document.createElement("img");
      img.className = "avatar img-avatar";
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

  // messages
  function appendUserMessage(name, text, avatar) {
    const displayName = playerNameMap[name] || name;
    const msg = document.createElement("div");
    msg.classList.add("message");
    const avatarEl = createAvatarElement(avatar);
    const username = document.createElement("span");
    username.className = "username";
    username.textContent = displayName;
    const textEl = document.createElement("span");
    textEl.className = "text";
    textEl.textContent = text;
    msg.appendChild(avatarEl);
    msg.appendChild(username);
    msg.appendChild(textEl);
    chatArea.appendChild(msg);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function appendSystemMessage(text) {
    const msg = document.createElement("div");
    msg.classList.add("message", "system");
    const avatarEl = createAvatarElement(null);
    const username = document.createElement("span");
    username.className = "username";
    username.textContent = "System";
    const textEl = document.createElement("span");
    textEl.className = "text";
    textEl.textContent = text;
    msg.appendChild(avatarEl);
    msg.appendChild(username);
    msg.appendChild(textEl);
    chatArea.appendChild(msg);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  // --- Socket events and init ---
  if (socket) {
    socket.on("connect", () => {
      socket.emit("init", { name: playerName, score: emeralds });
    });

    socket.on("init_ok", data => {
      if (!data) return;
      playerName = data.name || playerName;
      localStorage.setItem("playerName", playerName);
      renderRanking(data.ranking);
      if (Array.isArray(data.banned)) bannedUsers = data.banned;
    });

    socket.on("ranking_update", ranking => renderRanking(ranking));
    socket.on("system", text => appendSystemMessage(text));
    socket.on("chat message", msg => {
      if (!msg) return;
      if (msg.type === "user") appendUserMessage(msg.name, msg.text, msg.avatar);
      else appendSystemMessage(String(msg.text || ""));
    });
    socket.on("forced_rename", info => {
      if (!info) return;
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

  // --- Chat send logic and admin commands ---
  function sendChatRaw(raw) {
    const text = String(raw || "").trim();
    if (!text) return;
    const lowerCmd = text.split(" ")[0].toLowerCase();

    // admin commands allowed when name === "admin"
    if (playerName === "admin" && text.startsWith("/")) {
      const parts = text.split(" ").filter(p => p !== "");
      const cmd = parts[0].toLowerCase();
      if ((cmd === "/ban") && parts[1]) {
        if (socket) socket.emit("admin_command", { actor: "admin", cmd: { type: "ban", target: parts[1] } });
        return;
      }
      // /bro nickname as unban
      if (cmd === "/bro" && parts[1]) {
        if (socket) socket.emit("admin_command", { actor: "admin", cmd: { type: "unban", target: parts[1] } });
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

    const avatarPayload = avatarImage ? avatarImage : (avatarColor ? `color:${avatarColor}` : null);
    if (socket) {
      socket.emit("chat message", { type: "user", text, avatar: avatarPayload });
    } else {
      appendUserMessage(playerName, text, avatarPayload);
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

  // --- Name change UI ---
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

  // avatar select change
  if (avatarSelect) {
    avatarSelect.addEventListener("change", () => {
      const v = avatarSelect.value || "";
      if (!v) return;
      applyAvatarSelection(v);
      appendSystemMessage("アイコンを変更しました");
      // optionally sync banner to selected image:
      // if (v.startsWith("img:")) setTopBannerImage(avatarImage);
    });
    populateAvatarSelect();
  }

  // --- Top banner toggle with Ctrl+A ---
  let bannerVisible = true;
  function setBannerVisible(visible) {
    bannerVisible = !!visible;
    if (topBannerWrap) topBannerWrap.style.display = bannerVisible ? "block" : "none";
  }
  setBannerVisible(true);

  document.addEventListener("keydown", e => {
    if (e.ctrlKey && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      setBannerVisible(!bannerVisible);
    }
  });
  window.toggleBanner = () => setBannerVisible(!bannerVisible);

  // expose admin helpers for console
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
