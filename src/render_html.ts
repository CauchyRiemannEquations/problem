/**
 * 생성된 JSONL을 HTML 문제지로 렌더링하는 CLI (worksheet.ts 사용).
 * 기본은 학생용(메타정보 숨김). --teacher 로 검수용 표시, --no-key 로 정답표 제외.
 *
 * 사용: npm run factory:html -- --in out/xxx.jsonl [--title "제목"] [--teacher] [--no-key]
 */
import * as fs from "node:fs";
import { buildWorksheetHTML } from "./worksheet.js";
import type { GeneratedProblem } from "./schema.js";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
function argVal(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

const inPath = argVal("in");
if (!inPath) {
  console.error("--in <jsonl 경로> 를 지정하세요");
  process.exit(1);
}
const problems: GeneratedProblem[] = fs
  .readFileSync(inPath, "utf-8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const html = buildWorksheetHTML(problems, {
  title: argVal("title") ?? "밤샘 문제공장 — 생성 문제지",
  teacher: flags.has("--teacher"),
  includeKey: !flags.has("--no-key"),
});

const outPath = inPath.replace(/\.jsonl$/, ".html");
fs.writeFileSync(outPath, html, "utf-8");
console.log(`✔ HTML 문제지 → ${outPath} (${problems.length}문항${flags.has("--teacher") ? ", 교사용" : ", 학생용"})`);
