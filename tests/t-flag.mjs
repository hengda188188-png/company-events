/* 重現並驗證：賓果加賽的兩段式寫入會不會把 myWinRegistered 卡死。
   關鍵是要區分「空窗期的誤登記」與「加賽中的真登記」—— 只看登記次數會被誤導。 */
let pass = 0, fail = 0;
const check = (n, c, e = "") => { console.log((c ? "  ✓ " : "  ✗ ") + n + (e ? "　" + e : "")); c ? pass++ : fail++; };

function client(resetMode) {
  return {
    myWinRegistered: false, prevBingoRound: 1, lines: 0,
    phase: "round1", log: [],           // 每次登記記下當時的階段
    onMeta(m) {
      if (resetMode === "old") {
        if (m.gameState === "lobby" || (m.bingoRound || 1) !== this.prevBingoRound) this.myWinRegistered = false;
      } else {
        if (m.gameState === "lobby") this.myWinRegistered = false;
      }
      this.prevBingoRound = m.bingoRound || 1;
      this.check(m);
    },
    onCalledNumbers(nums, m) {
      this.lines = nums.length >= 20 ? 12 : 0;
      if (resetMode === "new" && nums.length === 0) this.myWinRegistered = false;
      this.check(m);
    },
    check(m) {
      if (m.gameState !== "playing" && m.gameState !== "finished") return;
      if (this.lines >= m.bingoThreshold && !this.myWinRegistered) {
        this.myWinRegistered = true;
        this.log.push(this.phase);
      }
    }
  };
}

function runPlayoff(mode) {
  const c = client(mode);
  const meta = { gameState: "playing", bingoThreshold: 2, bingoRound: 1 };
  const nums = Array.from({ length: 30 }, (_, i) => i);

  c.phase = "round1";
  c.onCalledNumbers(nums, meta);
  meta.gameState = "finished";
  c.onMeta(meta);

  // ---- 加賽階段 1：transaction 只寫入 bingoRound（空窗開始）----
  c.phase = "空窗";
  meta.bingoRound = 2;
  c.onMeta(meta);                       // gameState 仍是 finished、號碼還沒清空

  // ---- 加賽階段 2：其餘欄位一次寫入 ----
  meta.gameState = "playing";
  c.onMeta(meta);
  c.onCalledNumbers([], meta);          // 號碼被清空 → 加賽正式開始

  // ---- 加賽進行中，又連到 12 條 ----
  c.phase = "加賽";
  c.onCalledNumbers(nums, meta);

  return c.log;
}

console.log("=== 修正前：靠 bingoRound 判斷（兩段式寫入有空窗）===");
{
  const log = runPlayoff("old");
  console.log("    登記發生的階段：" + log.join(" → "));
  check("空窗期發生了不該有的誤登記", log.includes("空窗"));
  check("加賽中無法登記 → 12 條也不會結束（重現你遇到的狀況）", !log.includes("加賽"));
}

console.log("\n=== 修正後：靠 calledNumbers 清空判斷 ===");
{
  const log = runPlayoff("new");
  console.log("    登記發生的階段：" + log.join(" → "));
  check("空窗期不會誤登記（旗標在號碼清空前維持鎖定）", !log.includes("空窗"));
  check("加賽中可以正常登記 → 遊戲會結束", log.includes("加賽"));
}

console.log("\n=== 連續三輪加賽，每一輪都要能結束 ===");
{
  const c = client("new");
  const meta = { gameState: "playing", bingoThreshold: 2, bingoRound: 1 };
  const nums = Array.from({ length: 30 }, (_, i) => i);
  let okRounds = 0;
  for (let round = 1; round <= 3; round++) {
    c.phase = "第" + round + "輪";
    c.onCalledNumbers(nums, meta);
    if (c.log.filter(x => x === "第" + round + "輪").length === 1) okRounds++;
    meta.gameState = "finished"; c.onMeta(meta);
    meta.bingoRound = round + 1; c.onMeta(meta);   // 空窗
    meta.gameState = "playing"; c.onMeta(meta);
    c.onCalledNumbers([], meta);                    // 清空號碼
  }
  check("三輪都能各自登記一次獲勝", okRounds === 3, `成功 ${okRounds}/3 輪`);
}

console.log("\n=== 回到大廳開新局也要能重新登記 ===");
{
  const c = client("new");
  const meta = { gameState: "playing", bingoThreshold: 2, bingoRound: 1 };
  const nums = Array.from({ length: 30 }, (_, i) => i);
  c.phase = "第1局"; c.onCalledNumbers(nums, meta);
  meta.gameState = "lobby"; c.onMeta(meta);
  c.onCalledNumbers([], meta);
  meta.gameState = "playing"; c.onMeta(meta);
  c.phase = "第2局"; c.onCalledNumbers(nums, meta);
  check("新的一局能重新登記", c.log.includes("第1局") && c.log.includes("第2局"), c.log.join(" → "));
}

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
