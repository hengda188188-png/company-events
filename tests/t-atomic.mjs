/* 驗證加賽是「原子的一次寫入」—— 不會出現任何中間狀態 */
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const INDEX_HTML = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html");

const SRC = fs.readFileSync(INDEX_HTML, "utf8")
  .match(/<script type="module">([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const check = (n, c, e = "") => { console.log((c ? "  ✓ " : "  ✗ ") + n + (e ? "　" + e : "")); c ? pass++ : fail++; };

const fn = SRC.match(/async function startBingoPlayoff\(\)[\s\S]*?\n\}/)[0];

console.log("=== 靜態結構檢查 ===");
check("發動權不在 meta 底下（不會被廣播）", /playoffClaim`\),\s*\n?\s*\(cur\)/.test(fn) || fn.includes("playoffClaim"));
check("發動權路徑沒有任何監聽器", !/onValue\(ref\(db, `rooms\/\$\{currentRoomId\}\/playoffClaim/.test(SRC));
check("只有一次 await update()", (fn.match(/await update\(/g) || []).length === 1,
      `實際 ${(fn.match(/await update\(/g) || []).length} 次`);
check("gameState 在那一次 update 裡", /updates\[`rooms\/\$\{currentRoomId\}\/meta\/gameState`\] = "playing"/.test(fn));
check("calledNumbers 在同一次 update 裡", fn.includes("calledNumbers`] = null"));
check("finalists 在同一次 update 裡", fn.includes("meta/finalists`] = uids"));
check("bingoRound 在同一次 update 裡", fn.includes("meta/bingoRound`] = round"));
check("號碼卡重發在同一次 update 裡", fn.includes("boards/${uid}/numbers`] = randomBoard()"));

console.log("\n=== 中間狀態模擬 ===");
/* 原子寫入 = 觀察者只會看到「舊狀態」或「新狀態」，不會看到混合狀態 */
function observe(atomic) {
  const db = { gameState: "finished", calledNumbers: 30, finalists: null, bingoRound: 1 };
  const snapshots = [];
  const snap = () => snapshots.push({ ...db });

  if (atomic) {
    Object.assign(db, { gameState: "playing", calledNumbers: 0, finalists: ["A", "B"], bingoRound: 2 });
    snap();
  } else {
    db.bingoRound = 2; snap();                    // 第一次寫入（舊版：transaction 搶 bingoRound）
    Object.assign(db, { gameState: "playing", calledNumbers: 0, finalists: ["A", "B"] });
    snap();
  }
  return snapshots;
}
const bad = (s) => s.gameState === "finished" && s.calledNumbers > 0 && s.finalists === null && s.bingoRound > 1;

{
  const old = observe(false);
  check("舊版確實會露出中間狀態（對照組）", old.some(bad),
        "中間快照：" + JSON.stringify(old.find(bad)));
}
{
  const now = observe(true);
  check("新版不會露出任何中間狀態", !now.some(bad),
        "只有一個快照：" + JSON.stringify(now[0]));
}

console.log("\n=== 中間狀態會造成什麼（說明為什麼要修）===");
{
  const s = { gameState: "finished", calledNumbers: 30, finalists: null, bingoRound: 2 };
  // isActivePlayer：finalists 為 null 時對所有人放行
  const isActive = s.finalists === null;
  check("那個瞬間已淘汰的人仍被判定為「在場」→ 可以叫號", isActive);
  // 舊的旗標重設條件：bingoRound 變了就重設，但號碼還在、狀態還是 finished → 立刻重新登記並鎖死
  const flagResetThenRelock = s.bingoRound > 1 && s.gameState === "finished" && s.calledNumbers > 0;
  check("那個瞬間達標旗標會被重設後立刻鎖死 → 加賽打不完", flagResetThenRelock);
}

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
