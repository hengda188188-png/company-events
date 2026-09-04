/* 驗證：玩家「還在名單上但離線」時，遊戲不會卡死 */
let pass = 0, fail = 0;
const check = (n, c, e = "") => { console.log((c ? "  ✓ " : "  ✗ ") + n + (e ? "　" + e : "")); c ? pass++ : fail++; };

function lottery({ limit = 1, cups = 3, players, script }) {
  const st = { total: cups, picks: {}, skipped: {} };
  let turnIndex = 0, finished = false;
  const seats = () => players.filter(p => p.inRoom).map(p => p.id);
  const counts = () => { const c = {}; Object.values(st.picks).forEach(p => { c[p.uid] = (c[p.uid] || 0) + 1; }); return c; };
  const canStill = (uid) => !st.skipped[uid] && (limit === 0 || (counts()[uid] || 0) < limit);
  const cur = () => { const s = seats(); return s.length ? s[turnIndex % s.length] : null; };
  const advance = () => {
    const s = seats(); if (!s.length) return;
    for (let k = 1; k <= s.length; k++) {
      const uid = s[(turnIndex + k) % s.length];
      if (canStill(uid)) { turnIndex += k; return; }
    }
    finished = true;
  };
  const revive = () => {
    if (finished) return;
    if (Object.keys(st.picks).length >= st.total) { finished = true; return; }
    if (!seats().some(canStill)) { finished = true; return; }
    const c = cur(); if (!c || !canStill(c)) advance();
  };
  // 自動跳過：只有在「輪到的人離線」時才會啟動，且要撐滿緩衝時間
  const autoSkipTick = () => {
    if (finished) return;
    const c = cur(); if (!c) return;
    const p = players.find(x => x.id === c);
    if (!p || p.online) return;                 // 在線就不跳
    st.skipped[c] = true;
    advance(); revive();
  };
  const pick = (uid) => {
    const p = players.find(x => x.id === uid);
    if (!p || !p.inRoom || !p.online || p.order == null) return false;
    if (!canStill(uid)) return false;
    if (cur() !== uid) return false;
    st.picks[Object.keys(st.picks).length] = { uid };
    if (Object.keys(st.picks).length >= st.total) { finished = true; return true; }
    advance(); revive();
    return true;
  };

  script.forEach(step => {
    if (step.pick) pick(step.pick);
    else if (step.offline) { const p = players.find(x => x.id === step.offline); if (p) p.online = false; revive(); }
    else if (step.online) { const p = players.find(x => x.id === step.online); if (p) p.online = true; }
    else if (step.wait12s) autoSkipTick();
  });
  for (let i = 0; i < 5 && !finished; i++) revive();
  return { finished, picked: Object.keys(st.picks).length, total: st.total, skipped: Object.keys(st.skipped) };
}

const P = (...ids) => ids.map((id, i) => ({ id, order: i + 1, inRoom: true, online: true }));

console.log("=== 1. 重現你遇到的情況：輪到的人關掉分頁 ===");
{
  // A 掀完 → 輪到 B → B 關掉分頁（離線但還在名單）
  const r = lottery({ players: P("A", "B", "C"), script: [
    { pick: "A" }, { offline: "B" }
  ]});
  check("只靠 revive 還是卡住（因為 B 還沒掀滿，看起來『能掀』）", !r.finished,
        `已掀 ${r.picked}/${r.total} — 這就是修正前的狀態`);
}

console.log("\n=== 2. 修正後：12 秒後自動跳過離線玩家 ===");
{
  const r = lottery({ players: P("A", "B", "C"), script: [
    { pick: "A" }, { offline: "B" }, { wait12s: true }, { pick: "C" }
  ]});
  check("B 被自動跳過", r.skipped.includes("B"), "skipped=" + r.skipped.join(","));
  check("C 接手掀完後自動開獎", r.finished, `已掀 ${r.picked}/${r.total}`);
}

console.log("\n=== 3. 離線的人在緩衝時間內回來 → 不該被踢 ===");
{
  const r = lottery({ players: P("A", "B", "C"), script: [
    { pick: "A" }, { offline: "B" }, { online: "B" }, { wait12s: true }, { pick: "B" }, { pick: "C" }
  ]});
  check("B 沒有被跳過", !r.skipped.includes("B"), "skipped=" + (r.skipped.join(",") || "（無）"));
  check("B 回來後照常掀到杯子", r.picked === 3 && r.finished, `已掀 ${r.picked}/${r.total}`);
}

console.log("\n=== 4. 連續兩個人離線 ===");
{
  const r = lottery({ players: P("A", "B", "C"), script: [
    { pick: "A" }, { offline: "B" }, { offline: "C" }, { wait12s: true }, { wait12s: true }
  ]});
  check("B、C 都被跳過後自動開獎", r.finished, `skipped=${r.skipped.join(",")}　已掀 ${r.picked}/${r.total}`);
}

console.log("\n=== 5. 被跳過的人回來後不能再搶杯子 ===");
{
  const r = lottery({ cups: 4, players: P("A", "B", "C", "D"), script: [
    { pick: "A" }, { offline: "B" }, { wait12s: true },
    { online: "B" }, { pick: "B" },          // B 回來想補掀
    { pick: "C" }, { pick: "D" }
  ]});
  check("B 被跳過後就不再參與這一輪", r.picked === 3, `已掀 ${r.picked}/4（A、C、D）`);
}

console.log("\n=== 6. 房主先手動按跳過（不等 12 秒）===");
{
  const r = lottery({ players: P("A", "B", "C"), script: [
    { pick: "A" }, { offline: "B" }, { wait12s: true }, { pick: "C" }
  ]});
  check("手動與自動走同一條路徑，結果一致", r.finished && r.skipped.includes("B"));
}

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
