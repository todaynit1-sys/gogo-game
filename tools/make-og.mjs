// 공유용 썸네일과 아이콘 만들기: node tools/make-og.mjs
// tools/og.html 을 헤드리스 크롬으로 열어 찍고 public/og.png, public/icon.png 로 저장한다.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const page = pathToFileURL(path.join(root, "tools", "og.html")).href;
const chrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => existsSync(p));
if (!chrome) throw new Error("크롬(또는 엣지)을 찾지 못했어요");

function shot(query, w, h, out) {
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
    `--window-size=${w},${h}`, "--virtual-time-budget=8000", "--force-device-scale-factor=1",
    `--screenshot=${out}`, page + query,
  ], { stdio: "ignore" });
  const png = readFileSync(out);
  console.log(path.basename(out), png.readUInt32BE(16) + "×" + png.readUInt32BE(20), Math.round(png.length / 1024) + "KB");
}

shot("", 1200, 630, path.join(root, "public", "og.png"));
shot("?icon", 512, 512, path.join(root, "public", "icon.png"));
