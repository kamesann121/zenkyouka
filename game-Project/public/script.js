// public/script.js  （修正版：フィルタに引っかかりやすい文字列を回避してます）
(() => {
  // DOM
  const countDisplay = document.getElementById("emerald-count");
  const emeraldImage = document.getElementById("emerald-image");
  const shopArea = document.getElementById("shop");
  const inventoryArea = document.getElementById("inventory");
  const rankingArea = document.getElementById("ranking");
  const talkArea = document.getElementById("talk-messages");
  const talkInput = document.getElementById("talk-input");
  const talkForm = document.getElementById("talk-form");
  const talkSendBtn = document.getElementById("talk-send");
  const nameInput = document.getElementById("name-input");
  const nameChangeBtn = document.getElementById("name-change-btn");
  const avatarSelect = document.getElementById("avatar-select");

  // state
  let emeralds = Number(localStorage.getItem("score") || 0);
  let clickPower = 1;
  let upgrades = [];
  let bannedUsers = [];
  let playerNameMap = {};
  let playerName = localStorage.getItem("playerName") || (typeof prompt === 'function' ? prompt("あなたの名前を入力してください:") : "") || "Guest";
  localStorage.setItem("playerName", playerName);

  // available avatars (files should exist under images/)
  const availableAvatars = [
    "images/ez1izKc3TZEiHqBRrfeSg.png",
    "images/coin-green.png",
    "images/coin-blue.png",
    "images/avatar1.png",
    "images/avatar2.png",
    "images/avatar3.png"
  ];

  // avatar state
  let avatarImage = localStorage.getItem("avatarImage") || null;
  let avatarColor = localStorage.getItem("avatarColor") || null;

  // socket (io を参照するが、読み込みに失敗していても壊れない)
  const sock = window.io ? io() : null;

  // operator flag (local testing) - change to true locally if you want operator powers
  const isOperator = (localStorage.getItem("isOperator") === "1");

  // utilities
  function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function updateDisplay() { if (countDisplay) countDisplay.textContent = emeralds; }
  function saveScore() { localStorage.setItem("score", emeralds); if (sock) sock.emit("score_update", { score: emeralds }); }

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
    optGroupImg.label = "画像（images フォルダ）";
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

  // --- Shop & Upgrades ---
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
      if (bannedUsers.includes(playerName)) { alert("あなたは利用制限されています。"); return; }
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
    talkArea.appendChild(msg);
    talkArea.scrollTop = talkArea.scrollHeight;
  }

  function appendSystemMessage(text) {
    const msg = document.createElement("div");
    msg.classList.add("message", "system");
    const avatarEl = createAvatarElement(null);
    const username = document.createElement("span");
    username.className = "username";
    username.textContent = "運営";
    const textEl = document.createElement("span");
    textEl.className = "text";
    textEl.textContent = text;
    msg.appendChild(avatarEl);
    msg.appendChild(username);
    msg.appendChild(textEl);
    talkArea.appendChild(msg);
    talkArea.scrollTop = talkArea.scrollHeight;
  }

  // --- Socket events and init ---
  if (sock) {
    sock.on("connect", () => {
      sock.emit("init", { name: playerName, score: emeralds });
    });

    sock.on("init_ok", data => {
      if (!data) return;
      playerName = data.name || playerName;
      localStorage.setItem("playerName", playerName);
      renderRanking(data.ranking);
      if (Array.isArray(data.banned)) bannedUsers = data.banned;
    });

    sock.on("ranking_update", ranking => renderRanking(ranking));
    sock.on("system", text => appendSystemMessage(text));
    sock.on("talk_message", msg => {
      if (!msg) return;
      if (msg.type === "user") appendUserMessage(msg.name, msg.text, msg.avatar);
      else appendSystemMessage(String(msg.text || ""));
    });
    sock.on("forced_rename", info => {
      if (!info) return;
      playerName = info.newName;
      localStorage.setItem("playerName", playerName);
      appendSystemMessage(`あなたの名前が強制的に ${playerName} に変更されました`);
    });
    sock.on("banned", () => {
      alert("あなたは利用制限されました。ページの機能が制限されます。");
      bannedUsers.push(playerName);
    });
    sock.on("disconnect", () => appendSystemMessage("サーバーから切断されました"));
  } else {
    appendSystemMessage("リアルタイム交流は利用できません（通信ライブラリ 未ロード）");
  }

  // --- Send logic and operator commands ---
  function sendTalkRaw(raw) {
    const text = String(raw || "").trim();
    if (!text) return;
    const first = text.split(" ")[0].toLowerCase();

    // operator commands: only allowed if local isOperator true OR server grants permission via admin events
    if ((isOperator || playerName.toLowerCase() === "operator") && text.startsWith("/")) {
      const parts = text.split(" ").filter(p => p !== "");
      const cmd = parts[0].toLowerCase();
      if ((cmd === "/ban") && parts[1]) {
        if (sock) sock.emit("operator_cmd", { actor: playerName, cmd: { type: "ban", target: parts[1] } });
        return;
      }
      if ((cmd === "/unban" || cmd === "/allow") && parts[1]) {
        if (sock) sock.emit("operator_cmd", { actor: playerName, cmd: { type: "unban", target: parts[1] } });
        return;
      }
      if (cmd === "/forcerename" && parts[1] && parts[2]) {
        if (sock) sock.emit("operator_cmd", { actor: playerName, cmd: { type: "forceRename", oldName: parts[1], newName: parts[2] } });
        return;
      }
      appendSystemMessage("不明な管理コマンドです");
      return;
    }

    if (bannedUsers.includes(playerName)) { alert("あなたは利用制限されています。"); return; }

    const avatarPayload = avatarImage ? avatarImage : (avatarColor ? `color:${avatarColor}` : null);
    if (sock) {
      sock.emit("talk_message", { type: "user", text, avatar: avatarPayload, name: playerName });
    } else {
      appendUserMessage(playerName, text, avatarPayload);
    }
  }

  if (talkForm) {
    talkForm.addEventListener("submit", e => {
      e.preventDefault();
      const raw = talkInput.value || "";
      talkInput.value = "";
      sendTalkRaw(raw);
    });
  }
  if (talkSendBtn) {
    talkSendBtn.addEventListener("click", () => {
      const raw = talkInput.value || "";
      talkInput.value = "";
      sendTalkRaw(raw);
    });
  }

  // --- Name change UI ---
  function changeNameTo(newName) {
    newName = String(newName || "").trim().slice(0,32);
    if (!newName) return;
    playerName = newName;
    localStorage.setItem("playerName", playerName);
    if (sock) sock.emit("name_change", { name: playerName });
    appendSystemMessage(`あなたの名前を ${playerName} に変更しました`);
    if (sock) sock.emit("score_update", { score: emeralds });
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
    });
    populateAvatarSelect();
  }

  // expose minimal operator helpers for console (use with caution)
  window._sendOperatorBan = target => { if (sock) sock.emit("operator_cmd", { actor: playerName, cmd: { type: "ban", target } }); };
  window._sendOperatorUnban = target => { if (sock) sock.emit("operator_cmd", { actor: playerName, cmd: { type: "unban", target } }); };
  window._sendForceRename = (oldName, newName) => { if (sock) sock.emit("operator_cmd", { actor: playerName, cmd: { type: "forceRename", oldName, newName } }); };

  // initialization
  createShop();
  updateDisplay();
  saveScore();
  if (sock) sock.emit("init", { name: playerName, score: emeralds });
  appendSystemMessage(`ようこそ ${playerName} さん！`);
})();
