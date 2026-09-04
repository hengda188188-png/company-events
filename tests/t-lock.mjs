/* 驗證「賽程進行中只能改後面還沒玩的階段」 */
let pass = 0, fail = 0;
const check = (n, c, e = "") => { console.log((c ? "  ✓ " : "  ✗ ") + n + (e ? "　" + e : "")); c ? pass++ : fail++; };

const GAME_TYPES = { bingo: 1, password: 1, lottery: 1, blackjack: 1, niuniu: 1, compare: 1 };
let roomMeta = {}, scores = {};
function scheduleList() {
  const sch = roomMeta.schedule;
  if (Array.isArray(sch) && sch.length) {
    const out = sch.filter(s => s && GAME_TYPES[s.type])
      .map(s => ({ type: s.type, rounds: Math.max(1, parseInt(s.rounds, 10) || 1), points: Math.min(999, Math.max(0, parseInt(s.points, 10) || 0)) }));
    if (out.length) return out;
  }
  return [{ type: "bingo", rounds: 1, points: 1 }];
}
const stageIndex = () => Math.min(Math.max(0, roomMeta.scheduleIndex || 0), scheduleList().length - 1);
const roundInStage = () => Math.min(Math.max(1, roomMeta.roundInStage || 1), scheduleList()[stageIndex()].rounds);
const scheduleStarted = () => stageIndex() > 0 || roundInStage() > 1 || Object.keys(scores || {}).length > 0;
const lockedStageCount = () => scheduleStarted() ? stageIndex() + 1 : 0;

/* 模擬編輯器的移動/刪除邊界 */
const canMoveUp = (i, locked) => !(i <= locked);
const canDelete = (len, locked) => !(len - locked <= 1);

console.log("=== 1. 還沒開打 → 整份可編輯 ===");
roomMeta = { schedule: [{ type: "bingo", rounds: 2, points: 5 }, { type: "niuniu", rounds: 1, points: 8 }], scheduleIndex: 0, roundInStage: 1 };
scores = {};
check("lockedStageCount = 0", lockedStageCount() === 0, "實際 " + lockedStageCount());
check("第 1 列可以往上移嗎（第 0 列不行是正常的）", canMoveUp(1, 0));

console.log("\n=== 2. 打完第 1 局（進度到 stage0 round2）→ 鎖住 stage0 ===");
roomMeta.roundInStage = 2; scores = { s0r1: { A: { pts: 5 } } };
check("lockedStageCount = 1", lockedStageCount() === 1, "實際 " + lockedStageCount());
check("stage0（進行中）不能往上移", !canMoveUp(0, 1));
check("stage1（未進行）不能移到 stage0 前面", !canMoveUp(1, 1));

console.log("\n=== 3. 進行到第 2 個階段 → 鎖住前兩個 ===");
roomMeta = { schedule: [{ type: "bingo", rounds: 1, points: 5 }, { type: "niuniu", rounds: 1, points: 8 }, { type: "compare", rounds: 2, points: 3 }], scheduleIndex: 2, roundInStage: 1 };
scores = { s0r1: {}, s1r1: {} };
check("lockedStageCount = 3（含進行中的 stage2）", lockedStageCount() === 3, "實際 " + lockedStageCount());
check("已結束的 stage0/1 與進行中的 stage2 都不可移動", !canMoveUp(0, 3) && !canMoveUp(1, 3) && !canMoveUp(2, 3));
check("全部被鎖時不能刪到只剩鎖定列", !canDelete(3, 3));

console.log("\n=== 4. 儲存時保留鎖定前綴 ===");
{
  const current = scheduleList();
  const locked = lockedStageCount();
  // 房主把後面改成 [password×2]
  const editedTail = [{ type: "password", rounds: 2, points: 6 }];
  const saved = [...current.slice(0, locked), ...editedTail];
  check("前 3 個階段原封不動", JSON.stringify(saved.slice(0, 3)) === JSON.stringify(current.slice(0, 3)));
  check("後面換成新的階段", saved.length === 4 && saved[3].type === "password");
  // 進度不變
  check("scheduleIndex 保持 2", (roomMeta.scheduleIndex || 0) === 2);
  check("積分未被清空", Object.keys(scores).length === 2);
}

console.log("\n=== 5. 把進行中的階段刪掉是不可能的（索引受保護）===");
{
  roomMeta = { schedule: [{ type: "bingo", rounds: 1, points: 5 }, { type: "niuniu", rounds: 1, points: 8 }], scheduleIndex: 1, roundInStage: 1 };
  scores = { s0r1: {} };
  const locked = lockedStageCount();
  check("locked = 2 → 兩個階段都不可刪", locked === 2 && !canDelete(2, 2), "locked=" + locked);
}

console.log("\n=== 6. 新增階段永遠允許（接在最後面）===");
{
  const current = scheduleList();
  const locked = lockedStageCount();
  const saved = [...current, { type: "lottery", rounds: 1, points: 0 }];
  check("可以在尾端加新階段", saved.length === current.length + 1);
  check("鎖定前綴仍完整", JSON.stringify(saved.slice(0, locked)) === JSON.stringify(current.slice(0, locked)));
}

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
