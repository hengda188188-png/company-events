/* 最終全面重測：從 index.html 抽出真正的實作來跑，而不是另外抄一份 */
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const INDEX_HTML = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html");

const SRC = fs.readFileSync(INDEX_HTML, "utf8")
  .match(/<script type="module">([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const check = (n, c, e = "") => { console.log((c ? "  ✓ " : "  ✗ ") + n + (e ? "　" + e : "")); c ? pass++ : fail++; };

/* 把純函式從原始碼抽出來執行，確保測的是真的實作 */
function extract(names) {
  const parts = [];
  for (const n of names) {
    const re = new RegExp(`(?:^|\\n)((?:async )?function ${n}\\s*\\([\\s\\S]*?\\n\\})`, "m");
    const m = SRC.match(re);
    if (!m) throw new Error("找不到函式 " + n);
    parts.push(m[1]);
  }
  return parts.join("\n");
}
const CONSTS = `
const GAME_TYPES = { bingo:{icon:"B",label:"賓果"}, password:{icon:"P",label:"終極密碼"}, lottery:{icon:"L",label:"抽獎"},
                     blackjack:{icon:"J",label:"21點"}, niuniu:{icon:"N",label:"牛牛"}, compare:{icon:"C",label:"比大小"} };
const CARD_GAMES = ["blackjack","niuniu","compare"];
const SUIT_CHARS = ["♠","♥","♦","♣"];
const RANK_CHARS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const cardFace=c=>c%52, cardSuit=c=>Math.floor(cardFace(c)/13), cardRank=c=>cardFace(c)%13;
const cardPips=c=>cardRank(c)+1, cardTen=c=>Math.min(cardRank(c)+1,10);
const cardPower=c=>cardPips(c)*4+(3-cardSuit(c));
let roomMeta={}, scores={}, players={};
`;
const fnNames = ["scheduleList","stageIndex","currentStage","stagePoints","roundInStage","totalRounds",
  "currentRoundNo","nextSchedulePosition","roundKey","scheduleStarted","lockedStageCount",
  "niuHandOf","handOfPlayer","handsUsedCards","drawCards","bjPoints","niuPoints","scoreHand","handTop","rankHands","topTied",
  "lotPrizeRows","lotPrizeList","maxCupCount","remainingPrizePool","makeCardState","cardsPerPlayer","deckCount"];
const mod = new Function(CONSTS + extract(fnNames) + `
  return { set:(m,sc,pl)=>{roomMeta=m||{};scores=sc||{};players=pl||{};},
           scheduleList,stageIndex,stagePoints,roundInStage,totalRounds,currentRoundNo,
           nextSchedulePosition,roundKey,lockedStageCount,drawCards,bjPoints,niuPoints,
           scoreHand,rankHands,topTied,niuHandOf,handOfPlayer,lotPrizeRows,lotPrizeList,maxCupCount,remainingPrizePool,cardsPerPlayer };
`)();

console.log("=== A. 賽程：邊界與相容性 ===");
mod.set({ schedule: [{ type: "newgame", rounds: 2, points: 5 }] });
let crashed = false;
try { mod.stagePoints(); } catch (e) { crashed = true; }
check("全部是未知遊戲類型時不會崩潰", !crashed && mod.scheduleList().length === 1, "退回 " + mod.scheduleList()[0].type);

mod.set({ schedule: [{ type: "bingo", rounds: 3 }] });
check("舊賽程沒有 points → 預設 1 分（不再靜默 0 分）", mod.stagePoints() === 1, "實際 " + mod.stagePoints());

mod.set({ schedule: [{ type: "bingo", rounds: 3, points: 0 }] });
check("明確寫 0 分才是不計分", mod.stagePoints() === 0);

mod.set({ schedule: [{ type: "bingo", rounds: 2, points: 5 }, { type: "niuniu", rounds: 1, points: 8 }], scheduleIndex: 99, roundInStage: 99 });
check("索引越界被夾回合法範圍", mod.stageIndex() === 1 && mod.roundInStage() === 1);

console.log("\n=== B. 賽程：進行中只能改後面 ===");
mod.set({ schedule: [{ type: "bingo", rounds: 2, points: 5 }, { type: "niuniu", rounds: 1, points: 8 }], scheduleIndex: 0, roundInStage: 1 }, {});
check("還沒開打 → locked = 0", mod.lockedStageCount() === 0);
mod.set({ schedule: [{ type: "bingo", rounds: 2, points: 5 }, { type: "niuniu", rounds: 1, points: 8 }], scheduleIndex: 0, roundInStage: 2 }, { c0s0r1: {} });
check("打完第 1 局 → locked = 1（鎖住進行中的階段）", mod.lockedStageCount() === 1);
mod.set({ schedule: [{ type: "bingo", rounds: 1, points: 5 }, { type: "niuniu", rounds: 1, points: 8 }, { type: "compare", rounds: 2, points: 3 }], scheduleIndex: 2, roundInStage: 1 }, { a: {}, b: {} });
check("進行到第 3 個階段 → locked = 3", mod.lockedStageCount() === 3);

console.log("\n=== C. 積分：局次 key 帶圈數，保留積分繼續累積不會蓋掉 ===");
mod.set({ schedule: [{ type: "bingo", rounds: 1, points: 5 }], scheduleIndex: 0, roundInStage: 1, scoreCycle: 0 });
const k0 = mod.roundKey();
mod.set({ schedule: [{ type: "bingo", rounds: 1, points: 5 }], scheduleIndex: 0, roundInStage: 1, scoreCycle: 1 });
const k1 = mod.roundKey();
check("第 2 圈的 key 與第 1 圈不同", k0 !== k1, `${k0} vs ${k1}`);

console.log("\n=== D. 賽程總積分預算仍精確 ===");
{
  const SCH = [{ type: "bingo", rounds: 2, points: 5 }, { type: "blackjack", rounds: 3, points: 8 }, { type: "compare", rounds: 1, points: 3 }];
  mod.set({ schedule: SCH, scheduleIndex: 0, roundInStage: 1 });
  const budget = SCH.reduce((n, s) => n + s.rounds * s.points, 0);
  let sum = 0, m = { schedule: SCH, scheduleIndex: 0, roundInStage: 1 };
  for (let i = 0; i < mod.totalRounds(); i++) {
    mod.set(m); sum += mod.stagePoints();
    const p = mod.nextSchedulePosition(); m = { ...m, scheduleIndex: p.index, roundInStage: p.round };
  }
  check(`跑完整份賽程發出 ${budget} 分`, sum === budget, "實際 " + sum);
}

console.log("\n=== E. 牌組：多副牌不重複、每局重洗 ===");
{
  mod.set({ cardDecks: 2, bjInitial: 2 }, {}, {});
  let dup = 0, outOfRange = 0;
  for (let t = 0; t < 20000; t++) {
    const hands = {};
    ["a", "b", "c", "d", "e", "f", "g", "h"].forEach(u => { hands[u] = mod.drawCards(hands, 5, 2); });
    const all = Object.values(hands).flat();
    if (new Set(all).size !== all.length) dup++;
    if (all.some(c => c < 0 || c >= 104)) outOfRange++;
  }
  check("8 人×5 張（2 副）從未發出重複牌號", dup === 0);
  check("牌號都在 0–103 內", outOfRange === 0);
}

console.log("\n=== F. 牌局計分與排名（已離開的玩家不列入） ===");
{
  mod.set({}, {}, { A: { name: "A" }, B: { name: "B" } });   // C 已離開
  const hands = { A: [12, 25], B: [0, 13], C: [11, 24] };
  const ranked = mod.rankHands("compare", { hands });   // rankHands 現在收整個 cardState
  check("排名不含已離開的 C", ranked.every(r => r.uid !== "C"), "名單 " + ranked.map(r => r.uid).join(","));
  check("仍能決出勝者", ranked.length === 2);
}
{
  check("21點：沒爆的一定贏過爆掉的", mod.scoreHand("blackjack", [12, 12, 12]).value < mod.scoreHand("blackjack", [0, 9]).value);
  const b1 = mod.scoreHand("blackjack", [12, 12, 12]);   // 30 點
  const b2 = mod.scoreHand("blackjack", [12, 12, 1]);    // 22 點
  check("都爆牌時較接近 21 的排前面", b2.value > b1.value, `${b2.label} > ${b1.label}`);
}
{
  const n = mod.niuPoints([9, 10, 11, 0, 1]);   // 10+J+Q=30 → 剩 A+2=3
  check("牛牛計算正確", n.niu === 3, n.label);
}

console.log("\n=== G. 抽獎：獎項展開、杯子上限、獎金發滿 ===");
{
  mod.set({ lotPrizeRows: [{ name: "頭獎", points: 10, qty: 1 }, { name: "二獎", points: 5, qty: 2 }] }, {}, { a: {}, b: {}, c: {}, d: {} });
  const list = mod.lotPrizeList();
  check("依數量展開成 3 個獎", list.length === 3, list.map(p => p.name).join(","));
  check("杯子上限 = 參加人數 4", mod.maxCupCount() === 4);
}
{
  // 杯數 = 人數，每人掀 1 杯 → 獎金一定發滿
  const rows = [{ name: "頭獎", points: 10, qty: 1 }, { name: "二獎", points: 5, qty: 2 }];
  mod.set({ lotPrizeRows: rows }, {}, {});
  const prizes = mod.lotPrizeList();
  const TOTAL = prizes.reduce((n, p) => n + p.points, 0);
  let bad = 0;
  for (let t = 0; t < 20000; t++) {
    const st = { total: 6, prizes }, picks = {};
    for (let i = 0; i < 6; i++) {
      const pool = mod.remainingPrizePool(st, picks);
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      const won = chosen === null ? null : prizes[chosen];
      picks[i] = { prizeIdx: chosen, blank: chosen === null, points: won ? won.points : 0 };
    }
    if (Object.values(picks).reduce((n, p) => n + p.points, 0) !== TOTAL) bad++;
  }
  check(`6 人 6 杯：每局都剛好發滿 ${TOTAL} 分`, bad === 0, bad ? bad + " 局失敗" : "");
}
{
  // 舊格式（字串陣列）不應該讓流程炸掉
  mod.set({ lotPrizes: "頭獎|10\n二獎|5\n參加獎" }, {}, {});
  const rows = mod.lotPrizeRows();
  check("舊文字格式仍可解析", rows.length === 3 && rows[0].points === 10 && rows[2].points === 0);
}

console.log("\n=== H. 靜態檢查 ===");
{
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(x => x[1]));
  const all = [...html.matchAll(/\sid="([^"]+)"/g)].map(x => x[1]);
  const used = [...new Set([...html.matchAll(/\$\("([^"]+)"\)/g)].map(x => x[1]))];
  check("所有 $() 參照的 id 都存在", used.every(u => ids.has(u)), used.filter(u => !ids.has(u)).join(","));
  check("沒有重複的 id", all.length === new Set(all).size);
  check("已移除 lastAwardSig（積分改用資料庫標記）", !SRC.includes("lastAwardSig"));
  // 獎項編輯器的守衛條件要抓得夠緊：只擋「在輸入框打字、且列數沒變」。
  // 放寬成「編輯器內有焦點就不重畫」的話，點刪除鈕（焦點在 button）也會被擋掉，
  // 畫面留著已刪除的那一列，各列事件閉包的索引就會錯位。
  check("編輯器守衛只擋 INPUT 打字", /active\.tagName === "INPUT"/.test(SRC));
  check("列數改變時一定重畫", /sameRowCount = lotPrizeEditor\.querySelectorAll\(["'`]\.prize-row["'`]\)\.length === rows\.length/.test(SRC));
  check("兩個條件必須同時成立才跳過", /if \(typing && sameRowCount\)/.test(SRC));
  check("skip 會標記 stood（21點不再死鎖）", /stood\[uid\] = true/.test(SRC));
  check("rankHands 過濾已離開玩家", /\.filter\(uid => players\[uid\]\)/.test(SRC));
  check("開局發牌有防重入", SRC.includes("let startingGame = false"));
  check("賓果加賽單次原子寫入", SRC.includes("async function startBingoPlayoff"));
}

console.log(`\n${"=".repeat(46)}\n總計：${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
