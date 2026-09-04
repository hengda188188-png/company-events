/* 跑完所有測試：node tests/run-all.mjs
   這些測試把 index.html 裡的純函式抽出來實際執行，不是另外抄一份，
   所以改壞了會真的被抓到。 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const SUITES = [
  ["t-final.mjs", "整體回歸：賽程邊界、積分預算、牌組、抽獎、靜態檢查"],
  ["t-score.mjs", "積分冪等：多端同時結算、歸零不被寫回、加賽撤銷"],
  ["t-lock.mjs", "賽程鎖定：進行中只能改後面的階段"],
  ["t-stuck.mjs", "死鎖：玩家離開房間後遊戲仍能結束"],
  ["t-offline.mjs", "離線：關掉分頁的人會被自動跳過，回來則不會"],
  ["t-flag.mjs", "賓果加賽：達標旗標不會被卡死"],
  ["t-atomic.mjs", "賓果加賽：單次原子寫入，不露中間狀態"],
  ["t-bj.mjs", "21點：蓋牌可見性、一路要到底"],
  ["t-niu.mjs", "牛牛：桌面公共牌共用、自動配最佳、手動選錯判無牛"],
];

let totalPass = 0, totalFail = 0, broken = 0;

for (const [file, desc] of SUITES) {
  const full = path.join(HERE, file);
  if (!fs.existsSync(full)) { console.log(`✗ 找不到 ${file}`); broken++; continue; }
  let out = "";
  try {
    out = execFileSync(process.execPath, [full], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    out = String(e.stdout || "") + String(e.stderr || "");
  }
  const m = out.match(/(?:總計|結果)：(\d+) 通過 \/ (\d+) 失敗/);
  if (!m) {
    console.log(`✗ ${file.padEnd(14)} 沒有跑出結果`);
    console.log(out.split("\n").slice(-6).join("\n"));
    broken++;
    continue;
  }
  const [, p, f] = m.map(Number);
  totalPass += p; totalFail += f;
  const mark = f ? "✗" : "✓";
  console.log(`${mark} ${file.padEnd(14)} ${String(p).padStart(3)} 通過 ${f ? String(f) + " 失敗" : "        "}  ${desc}`);
  if (f) out.split("\n").filter(l => l.includes("✗")).forEach(l => console.log("      " + l.trim()));
}

console.log("\n" + "=".repeat(60));
console.log(`總計 ${totalPass} 通過 / ${totalFail} 失敗` + (broken ? ` / ${broken} 支無法執行` : ""));
process.exit(totalFail || broken ? 1 : 0);
