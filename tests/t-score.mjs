/* 驗證修正後的積分冪等性：模擬多客戶端 + transaction 標記 */
const DB = { scores: {}, marks: {} };
const reset = () => { DB.scores = {}; DB.marks = {}; };

/* 對應修正後的 writeRoundAwards：先用 transaction 搶標記，搶到才寫分 */
function writeRoundAwards(key, awards, playersLoaded = true) {
  if (!playersLoaded) return "skip:players未載入";
  if (!awards || !Object.keys(awards).length) return "skip:無得分者";
  if (DB.marks[key]) return "skip:已結算過";      // transaction 搶不到
  DB.marks[key] = true;
  DB.scores[key] = DB.scores[key] || {};
  Object.entries(awards).forEach(([uid, p]) => { DB.scores[key][uid] = { pts: p }; });
  return "wrote";
}
const total = () => Object.values(DB.scores).reduce((n, r) => n + Object.values(r).reduce((m, a) => m + a.pts, 0), 0);
const holders = () => Object.values(DB.scores).flatMap(r => Object.keys(r));

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  console.log((cond ? "  ✓ " : "  ✗ ") + name + (extra ? "　" + extra : ""));
  cond ? pass++ : fail++;
};

console.log("=== 1. 多個客戶端同時結算同一局 ===");
reset();
const r1 = ["c1", "c2", "c3", "c4", "c5"].map(() => writeRoundAwards("s0r1", { A: 5 }));
check("只有一個客戶端寫入成功", r1.filter(x => x === "wrote").length === 1, r1.join(","));
check("總分是 5 不是 25", total() === 5, "實際 " + total());

console.log("\n=== 2. 房主歸零後，其他人重新整理不會把分寫回來 ===");
reset();
writeRoundAwards("s0r1", { A: 5 });
DB.scores = {};                                  // scoreResetBtn 只刪 scores，保留 marks
const after = ["c1", "c2", "c3"].map(() => writeRoundAwards("s0r1", { A: 5 }));
check("歸零後全部被標記擋下", after.every(x => x === "skip:已結算過"), after.join(","));
check("積分維持 0", total() === 0, "實際 " + total());

console.log("\n=== 3. 賓果加賽：撤銷首位達標者的分，改發給加賽勝者 ===");
reset();
writeRoundAwards("s0r1", { A: 5 });              // A 先達標，已結算
check("加賽前 A 有分", total() === 5 && holders().includes("A"));
// maybeBingoPlayoff 撤銷該局的分與標記
delete DB.scores["s0r1"]; delete DB.marks["s0r1"];
writeRoundAwards("s0r1", { B: 5 });              // 加賽由 B 勝出
check("加賽後只有 B 得分", holders().length === 1 && holders()[0] === "B", "得分者 " + holders().join(","));
check("這一局仍然只發出 5 分", total() === 5, "實際 " + total());

console.log("\n=== 4. 中止本局／抽獎重新設定（局次不變）不會重複發分 ===");
reset();
writeRoundAwards("s0r1", { 甲: 10 });
delete DB.scores["s0r1"]; delete DB.marks["s0r1"];   // resetRoomForNewRound(false) 撤銷
writeRoundAwards("s0r1", { 乙: 10 });                // 重抽後換乙中獎
check("甲的分被撤銷、只剩乙", holders().length === 1 && holders()[0] === "乙", "得分者 " + holders().join(","));
check("總分仍是 10", total() === 10, "實際 " + total());

console.log("\n=== 5. players 未載入時不會寫入空名字 ===");
reset();
check("players 空時跳過", writeRoundAwards("s0r1", { A: 5 }, false) === "skip:players未載入");
check("載入後正常寫入", writeRoundAwards("s0r1", { A: 5 }, true) === "wrote");

console.log("\n=== 6. 整份賽程的總額仍精確等於預算 ===");
reset();
const SCHEDULE = [
  { key: "s0r1", pts: 5 }, { key: "s0r2", pts: 5 },
  { key: "s1r1", pts: 8 }, { key: "s1r2", pts: 8 }, { key: "s1r3", pts: 8 },
  { key: "s2r1", pts: 3 }
];
const budget = SCHEDULE.reduce((n, x) => n + x.pts, 0);
SCHEDULE.forEach((x, i) => {
  // 每局都讓 3 個客戶端搶著結算，再模擬一次重整
  const w = "P" + (i % 4);
  ["c1", "c2", "c3"].forEach(() => writeRoundAwards(x.key, { [w]: x.pts }));
  writeRoundAwards(x.key, { [w]: x.pts });        // 重整後再試一次
});
check(`總額 = 預算 ${budget}`, total() === budget, "實際 " + total());
check("每一局都恰好一位得分者", Object.values(DB.scores).every(r => Object.keys(r).length === 1));

console.log("\n=== 7. 賽程跑完從頭再來：全部清空（含標記）===");
reset();
writeRoundAwards("s0r1", { A: 5 });
DB.scores = {}; DB.marks = {};                   // wrapped → scores 與 scoredRounds 都清
check("可以重新結算新的一輪", writeRoundAwards("s0r1", { B: 5 }) === "wrote");
check("總分 5", total() === 5);

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
