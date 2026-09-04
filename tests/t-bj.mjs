/* 驗證 21 點的兩項規則修正 */
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const INDEX_HTML = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html");

const SRC = fs.readFileSync(INDEX_HTML, "utf8")
  .match(/<script type="module">([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const check = (n, c, e = "") => { console.log((c ? "  ✓ " : "  ✗ ") + n + (e ? "　" + e : "")); c ? pass++ : fail++; };

/* 從原始碼抽出 cardVisibleTo 來測，確保測的是真的實作 */
const cardVisibleTo = new Function("return " + SRC.match(/function cardVisibleTo[\s\S]*?\n\}/)[0])();

console.log("=== 1. 蓋牌規則：只露第一張 ===");
{
  const other = (i) => cardVisibleTo("blackjack", "them", i, { mine: false, finished: false, shown: false });
  check("別人的第 1 張看得到", other(0));
  check("別人的第 2 張看不到", !other(1));
  check("別人的第 3 張看不到", !other(2));

  const me = (i) => cardVisibleTo("blackjack", "me", i, { mine: true, finished: false, shown: false });
  check("自己的牌全部看得到", [0, 1, 2, 3].every(me));

  const done = (i) => cardVisibleTo("blackjack", "them", i, { mine: false, finished: true, shown: false });
  check("開獎後別人的牌全部翻開", [0, 1, 2, 3].every(done));
}

console.log("\n=== 2. 牛牛／比大小維持原本的整手暗牌 ===");
{
  const before = (i) => cardVisibleTo("niuniu", "them", i, { mine: false, finished: false, shown: false });
  check("還沒開牌時一張都看不到（含第 1 張）", ![0, 1, 2, 3, 4].some(before));
  const after = (i) => cardVisibleTo("niuniu", "them", i, { mine: false, finished: false, shown: true });
  check("他按下開牌後全部看得到", [0, 1, 2, 3, 4].every(after));
}

console.log("\n=== 3. 點數不能洩漏（蓋牌才有意義）===");
{
  // 要抓到完整的 if / else if / else 鏈，不能在第一個 "    }" 就截斷
  const zone = SRC.match(/sc\.className = "sc";[\s\S]*?row\.appendChild\(sc\);/)[0];
  check("看不到全部牌時不顯示點數", zone.includes("if (allVisible) {"));
  check("21 點改顯示張數與是否已停手", zone.includes("張`") && zone.includes("・停"));
  check("不會提前顯示爆牌", !/sc\.textContent = s\.label[\s\S]{0,200}else if \(gt === "blackjack"\)[\s\S]{0,120}bust/.test(zone));
}

console.log("\n=== 4. 要牌不換人，停牌／爆牌才換 ===");
{
  const act = SRC.match(/async function blackjackAct[\s\S]*?\n\}/)[0];
  check("只有 stood 被寫入時才推進輪次", /if \(\(after\.stood \|\| \{\}\)\[myUid\]\) await advanceCardTurn/.test(act));
  check("不再無條件呼叫 advanceCardTurn", !/\n  await advanceCardTurn\(after\);/.test(act));
  check("爆牌會寫入 stood（所以會自動換人）", /if \(bjPoints\(s\.hands\[myUid\]\) > 21\) stood\[myUid\] = true;/.test(act));
  check("停牌會寫入 stood", /\} else \{\s*\n\s*stood\[myUid\] = true;/.test(act));
  check("已停牌就不能再要牌", /if \(stood\[myUid\]\) return;/.test(act));
}

console.log("\n=== 5. 爆牌的灰化效果不會提前洩漏 ===");
{
  check("變灰條件改成開獎後才套用",
        /gt === "blackjack" && finished && scoreHand\(gt, hand\)\.bust/.test(SRC) &&
        !/gt === "blackjack" && stood\[uid\] && scoreHand\(gt, hand\)\.bust/.test(SRC));
}

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
