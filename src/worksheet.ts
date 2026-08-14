/**
 * 문제지 HTML 빌더 (CLI·GUI 공용).
 * 수식은 서버사이드 MathJax(SVG)로 미리 변환해 완전 자립형 HTML을 만든다
 * (CDN·인터넷 불필요, 한글은 <text> 폴백으로 시스템 폰트 사용).
 *
 * 기본은 학생용: 문항 번호 외의 메타정보(난이도·템플릿 코드)는 표시하지 않는다.
 * teacher 옵션을 켜면 검수용 메타정보가 함께 표시된다.
 */
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

export interface WorksheetOptions {
  title: string;
  /** true면 난이도·템플릿 코드 등 검수용 메타정보 표시 (기본 false = 학생용) */
  teacher?: boolean;
  /** 정답표 포함 여부 (기본 true, 인쇄 시 별도 페이지) */
  includeKey?: boolean;
  /** 화면 우하단에 'PDF로 저장/인쇄' 버튼 표시 (인쇄물에는 안 나옴, 기본 true) */
  printButton?: boolean;
}

const CIRCLED = ["①", "②", "③", "④", "⑤"];
const DIFF = { 1: "하", 2: "중", 3: "상" } as Record<number, string>;

export function buildWorksheetHTML(problems: GeneratedProblem[], opts: WorksheetOptions): string {
  const teacher = opts.teacher ?? false;
  const includeKey = opts.includeKey ?? true;
  const printButton = opts.printButton ?? true;

  const body: string[] = [];
  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    body.push(`<div class="problem">`);
    const meta = teacher
      ? `<span class="meta">난이도 ${DIFF[p.difficulty] ?? p.difficulty} · ${p.template_id}</span>`
      : "";
    body.push(`<div class="phead"><span class="pno">${i + 1}.</span>${meta}</div>`);
    body.push(`<div class="stem">${tex2svg(p.stem_latex, true)}</div>`);
    if (p.figure_svg) body.push(`<div class="fig">${p.figure_svg}</div>`);
    body.push(`<ol class="choices">`);
    for (let c = 0; c < 5; c++) {
      body.push(`<li>${CIRCLED[c]}&nbsp;${tex2svg(p.choices[c])}</li>`);
    }
    body.push(`</ol></div>`);
  }

  let keySection = "";
  if (includeKey) {
    const keyRows = problems
      .map(
        (p, i) =>
          `<tr><td>${i + 1}</td><td>${CIRCLED[p.answer_index]}</td><td>${tex2svg(p.answer_value)}</td>${teacher ? `<td class="meta">${p.template_id}</td>` : ""}</tr>`
      )
      .join("");
    keySection = `<div class="anskey"><h1>정답표</h1>
<table><tr><th>번호</th><th>정답</th><th>값</th>${teacher ? "<th>템플릿</th>" : ""}</tr>${keyRows}</table>
</div>`;
  }

  const btn = printButton
    ? `<button class="noprint printbtn" onclick="window.print()">🖨 PDF로 저장 / 인쇄</button>`
    : "";

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${opts.title}</title>
<style>
@page { size: A4; margin: 14mm; }
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
.printbtn { position: fixed; right: 22px; bottom: 22px; padding: 12px 18px; font-size: 15px; border: none; border-radius: 10px; background: #2b6cb0; color: #fff; cursor: pointer; box-shadow: 0 3px 10px rgba(0,0,0,.25); }
.printbtn:hover { background: #235a94; }
@media print { .noprint { display: none !important; } .problem { border: none; padding: 6px 0; margin: 18px 0; } }
</style></head><body>
<h1>${opts.title}</h1>
<p class="meta">총 ${problems.length}문항</p>
${body.join("\n")}
${keySection}
${btn}
</body></html>`;
}
