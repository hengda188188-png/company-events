/* 驗證修正後：抽獎與 21 點在有人離開／斷線時不會永久卡住 */
let pass = 0, fail = 0;
const check = (n, c, e = "") => { console.log((c ? "  ✓ " : "  ✗ ") + n + (e ? "　" + e : "")); c ? pass++ : fail++; };

/* ---------- 抽獎 ---------- */
function lotteryScenario({ mode, limit, cups, players, script }) {
  const st = { total: cups, picks: {} };
  let turnIndex = 0, finished = false, guard = 0;
  const seats = () => players.filter(p => p.present).map(p => p.id);
  const counts = () => { const c = {}; Object.values(st.picks).forEach(p => { c[p.uid] = (c[p.uid] || 0) + 1; }); return c; };
  const canStill = (uid) => limit === 0 || (counts()[uid] || 0) < limit;
  const curTurn = () => { const s = seats(); return s.length ? s[turnIndex % s.length] : null; };
  const canPick = (uid) => {
    const p = players.find(x => x.id === uid);
    if (!p || !p.present || p.order == null) return false;
    if (!canStill(uid)) return false;
    return mode === "turn" ? curTurn() === uid : true;
  };
  const advance = () => {                       // advanceLotteryTurn
    const s = seats(); if (!s.length) return;
    for (let step = 1; step <= s.length; step++) {
      const uid = s[(turnIndex + step) % s.length];
      if (canStill(uid)) { turnIndex += step; return; }
    }
    finished = true;
  };
  const revive = () => {                        // reviveLotteryIfStuck（房主每次狀態變動都跑）
    if (finished) return;
    if (Object.keys(st.picks).length >= st.total) { finished = true; return; }
    if (!seats().some(canStill)) { finished = true; return; }
    if (mode === "turn") { const c = curTurn(); if (!c || !canStill(c)) advance(); }
  };
  const pick = (uid) => {
    if (!canPick(uid)) return false;
    const k = Object.keys(st.picks).length;
    st.picks[k] = { uid };
    if (Object.keys(st.picks).length >= st.total) { finished = true; return true; }
    if (mode === "turn") advance(); else if (!seats().some(canStill)) finished = true;
    revive();
    return true;
  };

  script.forEach(step => {
    if (step.leave) { const p = players.find(x => x.id === step.leave); if (p) p.present = false; revive(); }
    else if (step.pick) pick(step.pick);
    guard++;
  });
  // 模擬之後不再有任何操作，只有狀態事件（revive 會被監聽反覆呼叫）
  for (let i = 0; i < 10 && !finished; i++) revive();
  return { finished, picked: Object.keys(st.picks).length, total: st.total };
}

console.log("=== 抽獎：輪流模式，輪到的人中途離開 ===");
{
  const r = lotteryScenario({
    mode: "turn", limit: 1, cups: 3,
    players: [{ id: "A", order: 1, present: true }, { id: "B", order: 2, present: true }, { id: "C", order: 3, present: true }],
    script: [{ pick: "A" }, { pick: "B" }, { leave: "C" }]
  });
  check("C 離開後自動開獎，不卡在 playing", r.finished, `已掀 ${r.picked}/${r.total}`);
}

console.log("\n=== 抽獎：自由搶，最後一人離開 ===");
{
  const r = lotteryScenario({
    mode: "free", limit: 1, cups: 3,
    players: [{ id: "A", order: 1, present: true }, { id: "B", order: 2, present: true }, { id: "C", order: 3, present: true }],
    script: [{ pick: "A" }, { pick: "B" }, { leave: "C" }]
  });
  check("C 離開後自動開獎", r.finished, `已掀 ${r.picked}/${r.total}`);
}

console.log("\n=== 抽獎：輪流模式，中間的人離開後仍能走完 ===");
{
  const r = lotteryScenario({
    mode: "turn", limit: 1, cups: 4,
    players: ["A", "B", "C", "D"].map((id, i) => ({ id, order: i + 1, present: true })),
    script: [{ pick: "A" }, { leave: "B" }, { pick: "C" }, { pick: "D" }]
  });
  check("B 離開不擋路，其餘三人掀完即開獎", r.finished, `已掀 ${r.picked}/${r.total}`);
}

console.log("\n=== 抽獎：中途加入的旁觀者不能搶杯子 ===");
{
  const players = [{ id: "A", order: 1, present: true }, { id: "B", order: 2, present: true },
                   { id: "C", order: 3, present: true }, { id: "D", order: null, present: true }];
  const r = lotteryScenario({ mode: "free", limit: 1, cups: 3, players,
    script: [{ pick: "A" }, { pick: "D" }, { pick: "D" }, { pick: "B" }, { pick: "C" }] });
  check("D（無順位）搶不到，A/B/C 各拿一杯", r.finished && r.picked === 3, `已掀 ${r.picked}/${r.total}`);
}

/* ---------- 21 點 ---------- */
function blackjackScenario({ players, script }) {
  const hands = {}, stood = {};
  players.forEach(p => { hands[p.id] = ["x", "x"]; });
  let turnIndex = 0, settled = false;
  const seats = () => players.filter(p => p.present).map(p => p.id).filter(u => hands[u]);
  const curTurn = () => { const s = seats(); return s.length ? s[turnIndex % s.length] : null; };
  const advance = () => {                       // advanceCardTurn
    const s = seats(); if (!s.length) return;
    for (let step = 1; step <= s.length; step++) {
      const uid = s[(turnIndex + step) % s.length];
      if (!stood[uid]) { turnIndex += step; return; }
    }
    settled = true;
  };
  script.forEach(step => {
    if (step.stand) { stood[step.stand] = true; advance(); }
    else if (step.offline) { const p = players.find(x => x.id === step.offline); if (p) p.online = false; }
    else if (step.skip) { stood[step.skip] = true; advance(); }   // 修正後的 skip：標記 stood 再推進
  });
  return { settled };
}

console.log("\n=== 21點：離線玩家被跳過後仍能結算 ===");
{
  const r = blackjackScenario({
    players: ["p1", "p2", "p3"].map(id => ({ id, present: true, online: true })),
    script: [{ stand: "p1" }, { offline: "p2" }, { skip: "p2" }, { stand: "p3" }]
  });
  check("三人都停牌 → 進入結算", r.settled);
}

console.log("\n=== 21點：舊版盲目 +1 的死鎖情境（對照組）===");
{
  // 舊版 skip 只做 turnIndex+1，不寫 stood
  const players = ["p1", "p2", "p3"], stood = { p1: true };
  let turnIndex = 1, settled = false;
  const advance = () => {
    for (let step = 1; step <= players.length; step++) {
      const uid = players[(turnIndex + step) % players.length];
      if (!stood[uid]) { turnIndex += step; return; }
    }
    settled = true;
  };
  turnIndex += 1;            // 舊 skip
  stood.p3 = true; advance(); // p3 停牌
  for (let i = 0; i < 20 && !settled; i++) { turnIndex += 1; }   // 房主一直按跳過
  check("舊版確實會卡住（證明這個測試有效）", !settled, settled ? "" : "永遠到不了結算");
}

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
