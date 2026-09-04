/* 改完 index.html 之後跑這支：node check.mjs
   會檢查幾件「不檢查就會整個網站掛掉」的事。推上線前跑一次。 */
import fs from "fs";

const FILE = "index.html";
let bad = 0;
const ok = (m) => console.log("  ✓ " + m);
const no = (m) => { console.log("  ✗ " + m); bad++; };

if (!fs.existsSync(FILE)) {
  console.log("找不到 " + FILE + " —— 請在專案資料夾裡執行這支腳本");
  process.exit(1);
}
const html = fs.readFileSync(FILE, "utf8");

console.log("=== 1. JavaScript 語法 ===");
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) {
  no("找不到 <script type=\"module\"> 區塊");
} else {
  const tmp = "_syntax_check_tmp.mjs";
  // import 那幾行指向網路上的 Firebase SDK，本機檢查時拿掉
  fs.writeFileSync(tmp, m[1].replace(/^import[\s\S]*?;\s*$/gm, ""));
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
    ok("語法沒問題");
  } catch (e) {
    no("語法有錯：\n" + String(e.stderr || e.message).split("\n").slice(0, 6).join("\n"));
  }
  fs.unlinkSync(tmp);
}

console.log("\n=== 2. HTML 元素對得上 ===");
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]);
const idSet = new Set(ids);
const used = [...new Set([...html.matchAll(/\$\("([^"]+)"\)/g)].map((x) => x[1]))];
const missing = used.filter((u) => !idSet.has(u));
missing.length
  ? no("程式抓不到這些 id（會讓整個程式載入時就掛掉）：" + missing.join(", "))
  : ok(`${used.length} 個 $() 參照的 id 都存在`);

const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
dup.length ? no("有重複的 id：" + dup.join(", ")) : ok("沒有重複的 id");

console.log("\n=== 3. 版本號 ===");
const ver = (html.match(/APP_VERSION = "([^"]+)"/) || [])[1];
if (!ver) no("找不到 APP_VERSION");
else {
  ok("目前版本 " + ver);
  console.log("     ↑ 改完功能記得加一號，否則之後分不清線上跑的是新版還是舊快取");
}

console.log("\n=== 4. 常見疏漏 ===");
const src = m ? m[1] : "";
const declared = [...src.matchAll(/^let\s+([A-Za-z_$][\w$]*)/gm)].map((x) => x[1]);
const resetFn = (src.match(/function resetRoomLocalState\(\)[\s\S]*?\n\}/) || [""])[0];
const roomScoped = ["roomMeta", "players", "calledNumbers", "myBoard", "pwState", "pwGuesses",
  "lotState", "cardState", "scores", "myWinRegistered", "bragState"];
const notReset = roomScoped.filter((v) => declared.includes(v) && !resetFn.includes(v));
notReset.length
  ? no("這些「屬於某一間房」的變數沒有在 resetRoomLocalState() 裡清除，會造成跨房污染：" + notReset.join(", "))
  : ok("房間狀態變數都有在切換房間時清除");

console.log("\n" + "=".repeat(40));
if (bad) {
  console.log(`✗ 有 ${bad} 個問題，修好再推上線`);
  process.exit(1);
}
console.log("✓ 全部通過，可以 git push 了");
