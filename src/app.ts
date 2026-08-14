/**
 * 밤샘 문제공장 GUI — 로컬 웹앱.
 * 실행하면 브라우저가 열리고, 단원·난이도·문항 수를 골라 문제지를 뽑은 뒤
 * [PDF로 저장/인쇄] 버튼(브라우저 인쇄 → PDF 저장)으로 구글 클래스룸에 올릴 PDF를 만든다.
 *
 * 개발: npm run factory:app  /  배포: exe로 패키징 (npm run build:exe)
 */
import * as http from "node:http";
import { exec } from "node:child_process";
import { TEMPLATES } from "./templates_data.js";
import { generateProblem, mulberry32, isGenerable } from "./engine.js";
import { buildWorksheetHTML } from "./worksheet.js";
import type { GeneratedProblem, ProblemTemplate } from "./schema.js";

const PORT = Number(process.env.PORT ?? 8977);
const COURSE_LABEL: Record<string, string> = { mijeokbun1: "미적분Ⅰ" };

function unitsOf(course: string): string[] {
  return [...new Set((TEMPLATES[course] ?? []).map((t) => t.unit))];
}

function formPage(): string {
  const courses = Object.keys(TEMPLATES);
  const courseOpts = courses
    .map((c) => `<option value="${c}">${COURSE_LABEL[c] ?? c}</option>`)
    .join("");
  const unitOpts = ['<option value="">전체 단원</option>']
    .concat(unitsOf(courses[0]).map((u) => `<option value="${u}">${u}</option>`))
    .join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>밤샘 문제공장</title>
<style>
body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; background: #f4f6f9; margin: 0; }
.card { max-width: 460px; margin: 48px auto; background: #fff; border-radius: 14px; padding: 28px 32px; box-shadow: 0 4px 18px rgba(0,0,0,.08); }
h1 { font-size: 21px; margin: 0 0 4px; } .sub { color: #888; font-size: 13px; margin-bottom: 22px; }
label { display: block; margin: 14px 0 6px; font-weight: 600; font-size: 14px; }
select, input[type=number] { width: 100%; padding: 9px 10px; border: 1px solid #ccc; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
.row { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
.row label { display: inline-flex; align-items: center; gap: 6px; margin: 0; font-weight: 400; }
button { width: 100%; margin-top: 24px; padding: 13px; font-size: 16px; font-weight: 700; color: #fff; background: #2b6cb0; border: none; border-radius: 10px; cursor: pointer; }
button:hover { background: #235a94; }
.hint { color: #999; font-size: 12px; margin-top: 14px; line-height: 1.6; }
</style></head><body>
<div class="card">
<h1>밤샘 문제공장</h1>
<div class="sub">템플릿+파라미터 생성 · 정답은 코드가 계산 (100% 보장)</div>
<form action="/worksheet" method="get" target="_blank">
  <label>과목</label><select name="course">${courseOpts}</select>
  <label>단원</label><select name="unit">${unitOpts}</select>
  <label>난이도</label>
  <div class="row">
    <label><input type="checkbox" name="d1" checked> 하</label>
    <label><input type="checkbox" name="d2" checked> 중</label>
    <label><input type="checkbox" name="d3"> 상</label>
  </div>
  <label>문항 수</label><input type="number" name="count" value="20" min="1" max="100">
  <div class="row" style="margin-top:16px">
    <label><input type="checkbox" name="key" checked> 정답표 포함 (별도 페이지)</label>
    <label><input type="checkbox" name="teacher"> 검수용 메타정보 표시</label>
  </div>
  <button type="submit">문제지 만들기</button>
</form>
<div class="hint">새 탭에 문제지가 열리면 우하단 <b>[PDF로 저장/인쇄]</b> 버튼 → 대상: "PDF로 저장" → 저장된 PDF를 구글 클래스룸에 업로드하세요.<br>같은 설정으로 다시 누르면 매번 새로운 문제가 나옵니다.</div>
</div></body></html>`;
}

function makeWorksheet(q: URLSearchParams): { html: string } | { error: string } {
  const course = q.get("course") ?? "mijeokbun1";
  const all = TEMPLATES[course];
  if (!all) return { error: `알 수 없는 과목: ${course}` };
  const unit = q.get("unit") || undefined;
  const diffs: number[] = [];
  if (q.get("d1")) diffs.push(1);
  if (q.get("d2")) diffs.push(2);
  if (q.get("d3")) diffs.push(3);
  if (diffs.length === 0) diffs.push(1, 2, 3);
  const count = Math.max(1, Math.min(100, Number(q.get("count") ?? 20)));

  const eligible = all.filter(
    (t: ProblemTemplate) =>
      isGenerable(t) && diffs.includes(t.difficulty) && (unit === undefined || t.unit.includes(unit))
  );
  if (eligible.length === 0) return { error: "선택한 조건에 맞는 문제 유형이 없습니다. 난이도나 단원을 넓혀 보세요." };

  const seed = q.get("seed") ? Number(q.get("seed")) : (Date.now() % 2 ** 31) ^ Math.floor(Math.random() * 2 ** 30);
  const rnd = mulberry32(seed);
  const order = [...eligible];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const problems: GeneratedProblem[] = [];
  const seen = new Set<string>(); // 같은 문제지 안에서 완전히 동일한 문제(템플릿+파라미터) 재출현 방지
  let cursor = 0;
  let guard = 0;
  while (problems.length < count && guard < count * 30) {
    guard++;
    const { problem } = generateProblem(order[cursor % order.length], rnd, problems.length + 1);
    cursor++;
    if (problem) {
      const key = problem.template_id + JSON.stringify(problem.params_used);
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push(problem);
    }
  }

  const dLabel = [diffs.includes(1) ? "하" : "", diffs.includes(2) ? "중" : "", diffs.includes(3) ? "상" : ""].filter(Boolean).join("·");
  const title = `${COURSE_LABEL[course] ?? course} ${unit ?? "전 단원"} — 연습 ${problems.length}제 (난이도 ${dLabel})`;
  const html = buildWorksheetHTML(problems, {
    title,
    teacher: !!q.get("teacher"),
    includeKey: !!q.get("key"),
    printButton: true,
  });
  return { html };
}

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
  console.log(`이 검은 창은 프로그램 본체입니다. 닫으면 앱이 종료됩니다.`);
  openAppWindow(addr);
});
