/**
 * 밤샘 문제공장 GUI — 로컬 웹앱.
 * 실행하면 브라우저가 열리고, 단원·난이도·문항 수를 골라 문제지를 뽑은 뒤
 * [PDF로 저장/인쇄] 버튼(브라우저 인쇄 → PDF 저장)으로 구글 클래스룸에 올릴 PDF를 만든다.
 *
 * 개발: npm run factory:app  /  배포: exe로 패키징 (npm run build:exe)
 */
import * as http from "node:http";
import { exec } from "node:child_process";
import { formPage, makeWorksheet } from "./webapp.js";

const PORT = Number(process.env.PORT ?? 8977);

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(formPage());
    } else if (url.pathname === "/worksheet") {
      const r = makeWorksheet(url.searchParams);
      if ("error" in r) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        res.end(r.error);
      } else {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(r.html);
      }
    } else {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
    }
  } catch (e: any) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`오류: ${e.message}`);
  }
});

/** 주소창 없는 독립 앱 창(브라우저 --app 모드)으로 열기. 실패하면 기본 브라우저로 폴백 */
function openAppWindow(addr: string) {
  const fallback = () => {
    const cmd =
      process.platform === "win32" ? `start "" ${addr}` : process.platform === "darwin" ? `open ${addr}` : `xdg-open ${addr}`;
    exec(cmd, () => {});
  };
  if (process.platform === "win32") {
    exec(`start msedge --app=${addr}`, (e) => {
      if (e) exec(`start chrome --app=${addr}`, (e2) => e2 && fallback());
    });
  } else if (process.platform === "darwin") {
    exec(`open -na "Google Chrome" --args --app=${addr}`, (e) => e && fallback());
  } else {
    exec(`google-chrome --app=${addr} || chromium --app=${addr}`, (e) => e && fallback());
  }
}

server.listen(PORT, "127.0.0.1", () => {
  const addr = `http://localhost:${PORT}`;
  console.log(`밤샘 문제공장 실행 중 → ${addr}`);
  if (process.env.BAMSAM_NO_OPEN !== "1") {
    console.log(`이 검은 창은 프로그램 본체입니다. 닫으면 앱이 종료됩니다.`);
    openAppWindow(addr);
  }
});
