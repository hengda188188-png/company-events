/* 驗證新版牛牛：手牌 3 張 + 桌面共用公共牌挑 2 張 */
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const INDEX_HTML = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html");

const SRC = fs.readFileSync(INDEX_HTML, "utf8")
  .match(/<script type="module">([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const check = (n, c, e = "") => { console.log((c ? "  ✓ " : "  ✗ ") + n + (e ? "　" + e : "")); c ? pass++ : fail++; };

const grab = (name) => SRC.match(new RegExp(`function ${name}\\s*\\([\\s\\S]*?\\n\\}`))[0];
const mod = new Function(`
  const cardFace=c=>c%52, cardRank=c=>cardFace(c)%13;
  const cardTen=c=>Math.min(cardRank(c)+1,10);
  const cardSuit=c=>Math.floor(cardFace(c)/13);
  const cardPips=c=>cardRank(c)+1;
  const cardPower=c=>cardPips(c)*4+(3-cardSuit(c));
  ${grab("niuPoints")}
  ${grab("niuHandOf")}
  ${grab("niuBestPick")}
  ${grab("handsUsedCards")}
  ${grab("drawCards")}
  return { niuPoints, niuHandOf, niuBestPick, drawCards, handsUsedCards };
`)();

console.log("=== 1. 合併手牌：3 張手牌 + 桌面挑 2 張 ===");
{
  const st = { hands: { A: [0, 1, 2] }, table: [10, 11, 12, 13, 14], picks: { A: [1, 3] } };
  const h = mod.niuHandOf(st, "A");
  check("合併後是 5 張", h.length === 5, JSON.stringify(h));
  check("包含手牌 3 張", [0, 1, 2].every(c => h.includes(c)));
  check("包含桌面第 1、3 張", h.includes(11) && h.includes(13));
}
{
  const st = { hands: { A: [0, 1, 2] }, table: [10, 11], picks: {} };
  check("還沒選牌時只回傳手牌（不會湊出假的 5 張）", mod.niuHandOf(st, "A").length === 3);
}

console.log("\n=== 2. 桌面牌是共用的：多人可以挑到同樣的兩張 ===");
{
  const st = {
    hands: { A: [0, 1, 2], B: [3, 4, 5], C: [6, 7, 8] },
    table: [20, 21, 22, 23, 24],
    picks: { A: [0, 1], B: [0, 1], C: [0, 1] }   // 三個人都挑同樣兩張
  };
  const hands = ["A", "B", "C"].map(u => mod.niuHandOf(st, u));
  check("三個人都能用到桌面第 0、1 張", hands.every(h => h.includes(20) && h.includes(21)));
  check("每個人都是 5 張", hands.every(h => h.length === 5));
  // 三人各 5 張 = 15 張次，但實際只用到 9 張手牌 + 2 張共用桌面牌 = 11 種牌號
  const allCards = hands.flat();
  check("桌面牌被共用（15 張次，實際只用到 11 種牌號）",
        allCards.length === 15 && new Set(allCards).size === 11,
        `張次 ${allCards.length}、不重複 ${new Set(allCards).size}`);
}

console.log("\n=== 3. 自動配牌會挑出最佳組合 ===");
{
  let worse = 0;
  for (let t = 0; t < 20000; t++) {
    const pool = [];
    while (pool.length < 8) { const c = Math.floor(Math.random() * 52); if (!pool.includes(c)) pool.push(c); }
    const hand = pool.slice(0, 3), table = pool.slice(3);
    const best = mod.niuBestPick(hand, table);
    const bestNiu = mod.niuPoints([...hand, table[best[0]], table[best[1]]]).niu;
    // 窮舉所有挑法，確認沒有更好的
    for (let i = 0; i < table.length; i++) for (let j = i + 1; j < table.length; j++) {
      if (mod.niuPoints([...hand, table[i], table[j]]).niu > bestNiu) worse++;
    }
  }
  check("2 萬手牌，自動配牌都挑到最大牛", worse === 0, worse ? worse + " 次不是最佳" : "");
}

console.log("\n=== 4. 手動選錯就是無牛（不會被系統偷偷修正）===");
{
  // 找一手「有更好選擇但玩家挑錯」的牌
  let demo = null;
  for (let t = 0; t < 20000 && !demo; t++) {
    const pool = [];
    while (pool.length < 8) { const c = Math.floor(Math.random() * 52); if (!pool.includes(c)) pool.push(c); }
    const hand = pool.slice(0, 3), table = pool.slice(3);
    const best = mod.niuBestPick(hand, table);
    const bestNiu = mod.niuPoints([...hand, table[best[0]], table[best[1]]]).niu;
    for (let i = 0; i < table.length && !demo; i++) for (let j = i + 1; j < table.length; j++) {
      const n = mod.niuPoints([...hand, table[i], table[j]]).niu;
      if (bestNiu >= 5 && n === 0) { demo = { hand, table, best, bad: [i, j], bestNiu }; break; }
    }
  }
  check("找得到「配得出好牌卻挑成無牛」的情境", !!demo);
  if (demo) {
    const st = { hands: { A: demo.hand }, table: demo.table, picks: { A: demo.bad } };
    const got = mod.niuPoints(mod.niuHandOf(st, "A"));
    check("照玩家的錯誤選擇算出無牛", got.niu === 0, `最佳可到 牛${demo.bestNiu}，實際 ${got.label}`);
  }
}

console.log("\n=== 5. 發牌不會出現重複牌號（手牌與桌面互斥）===");
{
  let dup = 0;
  for (let t = 0; t < 20000; t++) {
    const table = mod.drawCards({}, 5, 1);
    const hands = {};
    ["A", "B", "C", "D"].forEach(u => { hands[u] = mod.drawCards(hands, 3, 1, table); });
    const all = [...table, ...Object.values(hands).flat()];
    if (new Set(all).size !== all.length) dup++;
  }
  check("4 人×3 張 + 桌面 5 張，從未重複", dup === 0, `17 張全不重複`);
}

console.log("\n=== 6. 靜態檢查：規則接線 ===");
{
  check("每人手牌改成 3 張", /if \(gt === "niuniu"\) return 3;/.test(SRC));
  check("桌面張數可由房主設定", SRC.includes("function niuTableCount"));
  check("排名使用合併後的手牌", /function handOfPlayer[\s\S]*?niuHandOf/.test(SRC));
  check("開牌時記錄用了桌面哪兩張", /picks\[myUid\] = \(s\.auto === false/.test(SRC));
  check("手動配牌有確認對話框", SRC.includes("確定用這個組合開牌嗎"));
  check("沒選滿兩張不能開牌", /const needPick = gt === "niuniu" && cardState\.auto === false && niuPick\.length !== 2/.test(SRC));
  check("牌量檢查含桌面牌", /gameType\(\) === "niuniu" \? niuTableCount\(\) : 0/.test(SRC));
}

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
