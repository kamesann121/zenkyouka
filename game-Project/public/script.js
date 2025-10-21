// ===============================
// 初期設定
// ===============================
let emeralds = 0;
let clickPower = 1;
let upgrades = [];
let bannedUsers = [];
let playerNameMap = {};  // 強制名前変更マップ

// プレイヤー名の入力（任意にローカル保存したい場合は localStorage を使う実装に置換可）
let playerName = prompt("あなたの名前を入力してください:");
if (!playerName) playerName = "Guest";

// DOM要素取得（index.html の id に合わせる）
const countDisplay   = document.getElementById("emerald-count");
const emeraldImage   = document.getElementById("emerald-image");
const shopArea       = document.getElementById("shop");
const inventoryArea  = document.getElementById("inventory");
const rankingArea    = document.getElementById("ranking");
const chatArea       = document.getElementById("messages");
const chatInput      = document.getElementById("chat-input");

// ===============================
// ユーティリティ
// ===============================
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ===============================
// 表示更新
// ===============================
function updateDisplay() {
  countDisplay.textContent = emeralds;
}

// ===============================
// ランキング管理（localStorage使用）
// ===============================
function loadRanking() {
  return JSON.parse(localStorage.getItem("ranking") || "[]");
}

function saveRanking(ranking) {
  localStorage.setItem("ranking", JSON.stringify(ranking));
}

function renderRanking() {
  let ranking = loadRanking();

  // ランキング上の名前に force map を反映（表示名のみ）
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
  if (idx >= 0) {
    ranking[idx].score = emeralds;
  } else {
    ranking.push({ name: playerName, score: emeralds });
  }
  ranking.sort((a, b) => b.score - a.score);
  ranking = ranking.slice(0, 10);
  saveRanking(ranking);
  renderRanking();
}

// Helper: 強制リネームをランキングデータに反映（内部キー名の置換）
function applyForcedRename(oldName, newName) {
  let ranking = loadRanking();
  // if erase command used, newName === null -> remove entries with oldName
  if (newName === null) {
    ranking = ranking.filter(r => r.name !== oldName);
  } else {
    // find if oldName exists and rename its key; if newName already exists, merge scores (keep higher)
    const oldIdx = ranking.findIndex(r => r.name === oldName);
    const newIdx = ranking.findIndex(r => r.name === newName);
    if (oldIdx >= 0) {
      if (newIdx >= 0) {
        // merge: keep higher score
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

// ===============================
// アップグレード定義 ＆ ショップ生成
// ===============================
upgrades = [
  {
    id: "click2",
    name: "一タップ2エメラルド",
    cost: 50,
    effect: () => clickPower = 2,
    toggle: false
  },
  {
    id: "auto1",
    name: "オートエメラルド +1/秒",
    cost: 1000,
    effect: () => {},
    toggle: true,
    active: false,
    rate: 1
  },
  {
    id: "auto5",
    name: "オートエメラルド +5/秒",
    cost: 3000,
    effect: () => {},
    toggle: true,
    active: false,
    rate: 5
  },
  {
    id: "boost",
    name: "エメラルド倍増イベント",
    cost: 5000,
    effect: () => clickPower *= 2,
    toggle: true,
    active: false
  }
];

upgrades.forEach(up => {
  const btn = document.createElement("button");
  btn.id = up.id;
  btn.textContent = `${up.name}（${up.cost}エメラルド）`;
  btn.addEventListener("click", () => {
    if (emeralds < up.cost) {
      alert("エメラルドが足りないよ～！");
      return;
    }
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

function addToInventory(up) {
  // すでにあれば追加しない
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

// ===============================
// 自動でエメラルド増加（秒間）
// ===============================
setInterval(() => {
  upgrades.forEach(up => {
    if (up.toggle && up.active && up.rate) {
      emeralds += up.rate;
    }
  });
  updateDisplay();
  saveAndRenderRanking();
}, 1000);

// ===============================
// クリックでエメラルド増加
// ===============================
emeraldImage.addEventListener("click", () => {
  if (bannedUsers.includes(playerName)) {
    alert("あなたはBANされています。");
    return;
  }
  emeralds += clickPower;
  updateDisplay();
  saveAndRenderRanking();
});

// ===============================
// チャット機能 ＆ 管理者コマンド
// ===============================
chatInput.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const raw = chatInput.value.trim();
  if (!raw) return;
  chatInput.value = "";

  // 管理者コマンド（playerName が "admin" のときのみ有効）
  if (playerName === "admin" && raw.startsWith("/")) {
    const parts = raw.split(" ").filter(p => p !== "");
    const cmd = parts[0];
    if (cmd === "/BAN" && parts[1]) {
      const target = parts[1];
      if (!bannedUsers.includes(target)) {
        bannedUsers.push(target);
        appendSystemMessage(`${target} をBANしました`);
      } else {
        appendSystemMessage(`${target} は既にBANされています`);
      }
      return;
    }
    if (cmd === "/bro" && parts[1]) {
      const target = parts[1];
      bannedUsers = bannedUsers.filter(u => u !== target);
      appendSystemMessage(`${target} のBANを解除しました`);
      return;
    }
    if (cmd === "/ニックネーム" && parts[1]) {
      const oldName = parts[1];

      // erase コマンド: /ニックネーム erase targetName
      if (parts[1] === "erase" && parts[2]) {
        const target = parts[2];
        // 削除対象はランキングと強制マップから除去
        delete playerNameMap[target];
        applyForcedRename(target, null); // null => erase from ranking
        appendSystemMessage(`${target} をランキングから削除しました`);
        return;
      }

      // 通常の /ニックネーム old new
      if (parts[2]) {
        const newName = parts[2];
        playerNameMap[oldName] = newName;
        applyForcedRename(oldName, newName);
        appendSystemMessage(`${oldName} を強制的に ${newName} に変更しました`);
        // 自分自身が対象なら playerName を更新してランキングにも反映
        if (oldName === playerName) {
          playerName = newName;
          appendSystemMessage(`あなたの名前を ${playerName} に変更しました`);
          saveAndRenderRanking();
        }
        return;
      }

      appendSystemMessage("使い方: /ニックネーム oldName newName または /ニックネーム erase targetName");
      return;
    }

    appendSystemMessage("不明なコマンドまたは引数が足りません");
    return;
  }

  // BAN中ユーザーはメッセージ送信不可
  if (bannedUsers.includes(playerName)) {
    alert("あなたはBANされています。");
    return;
  }

  // 通常メッセージ
  appendUserMessage(playerName, raw);
});

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

// ===============================
// 初回レンダリング
// ===============================
updateDisplay();
saveAndRenderRanking();
appendSystemMessage(`ようこそ ${playerName} さん！`);
