/**
 * 생성된 JSONL을 사람이 풀 수 있는 HTML 문제지로 렌더링.
 * 수식은 서버사이드 MathJax(SVG)로 미리 변환해 완전 자립형 HTML을 만든다
 * (CDN·인터넷 불필요, 한글은 <text> 폴백으로 시스템 폰트 사용).
 *
 * 사용: npm run factory:html -- --in out/2026-08-14_mijeokbun1.jsonl [--title "문제지 제목"]
 * 출력: 같은 경로의 .html
 */
import * as fs from "node:fs";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import type { GeneratedProblem } from "./schema.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const texInput = new TeX({ packages: AllPackages });
const svgOutput = new SVG({ fontCache: "local" });
const mjDoc = mathjax.document("", { InputJax: texInput, OutputJax: svgOutput });

function tex2svg(tex: string, display = false): string {
  const node = mjDoc.convert(tex, { display });
  return adaptor.outerHTML(node);
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1] ?? "";
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const inPath = args.in;
if (!inPath) {
  console.error("--in <jsonl 경로> 를 지정하세요");
  process.exit(1);
}
const title = args.title ?? "밤샘 문제공장 — 생성 문제지";
const problems: GeneratedProblem[] = fs
  .readFileSync(inPath, "utf-8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const CIRCLED = ["①", "②", "③", "④", "⑤"];
const DIFF = { 1: "하", 2: "중", 3: "상" } as Record<number, string>;

const body: string[] = [];
for (let i = 0; i < problems.length; i++) {
  const p = problems[i];
  body.push(`<div class="problem">`);
  body.push(
    `<div class="phead"><span class="pno">${i + 1}.</span><span class="meta">난이도 ${DIFF[p.difficulty] ?? p.difficulty} · ${p.template_id}</span></div>`
  );
  body.push(`<div class="stem">${tex2svg(p.stem_latex, true)}</div>`);
  if (p.figure_svg) body.push(`<div class="fig">${p.figure_svg}</div>`);
  body.push(`<ol class="choices">`);
  for (let c = 0; c < 5; c++) {
    body.push(`<li>${CIRCLED[c]}&nbsp;${tex2svg(p.choices[c])}</li>`);
  }
  body.push(`</ol></div>`);
}

const keyRows = problems
  .map(
    (p, i) =>
      `<tr><td>${i + 1}</td><td>${CIRCLED[p.answer_index]}</td><td>${tex2svg(p.answer_value)}</td><td class="meta">${p.template_id}</td></tr>`
  )
  .join("");

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
<style>
body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; max-width: 780px; margin: 24px auto; padding: 0 16px; color: #1c1c1c; line-height: 1.65; }
h1 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 8px; }
.problem { margin: 26px 0; padding: 14px 16px; border: 1px solid #ddd; border-radius: 8px; page-break-inside: avoid; }
.phead { display: flex; justify-content: space-between; align-items: baseline; }
.pno { font-weight: 700; font-size: 16px; }
.meta { color: #999; font-size: 11px; }
.stem { margin: 10px 0 4px; }
.fig { margin: 8px 0; }
.choices { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-wrap: wrap; gap: 6px 30px; }
.choices li { min-width: 88px; display: flex; align-items: center; }
mjx-container, .stem svg, .choices svg { font-size: 115%; }
.stem mjx-container, .stem svg { max-width: 100%; height: auto; }
.stem mjx-container[display="true"] { display: block; margin: 0; text-align: left; }
.anskey { margin-top: 48px; page-break-before: always; }
.anskey table { border-collapse: collapse; }
.anskey td, .anskey th { border: 1px solid #bbb; padding: 4px 12px; text-align: center; }
</style></head><body>
<h1>${title}</h1>
<p class="meta">총 ${problems.length}문항 · 자동 생성(정답 코드 계산) · ${new Date().toISOString().slice(0, 10)}</p>
${body.join("\n")}
<div class="anskey"><h1>정답표</h1>
<table><tr><th>번호</th><th>정답</th><th>값</th><th>템플릿</th></tr>${keyRows}</table>
</div>
</body></html>`;

const outPath = inPath.replace(/\.jsonl$/, ".html");
fs.writeFileSync(outPath, html, "utf-8");
console.log(`✔ HTML 문제지 → ${outPath} (${problems.length}문항, 자립형 SVG 수식)`);
