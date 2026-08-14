/**
 * 사람(교사) 검토용 리포트 생성
 * 사용: npm run factory:review [-- --course mijeokbun1 --seed 777]
 * 출력: review/REVIEW_{course}_v0_1.md
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { loadTemplates, generateProblem, mulberry32, isGenerable, FACTORY_ROOT } from "./engine.js";
import type { ProblemTemplate, ParamSpec } from "./schema.js";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1] ?? "";
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const course = args.course ?? "mijeokbun1";
const seed = Number(args.seed ?? 777);

const all = loadTemplates(path.join(FACTORY_ROOT, "templates", course));
const generable = all.filter(isGenerable);
const deferred = all.filter((t) => !isGenerable(t));
const withFigure = all.filter((t) => isGenerable(t) && t.figure);

const reviewDir = path.join(FACTORY_ROOT, "review");
const figDir = path.join(reviewDir, "figures");
fs.mkdirSync(figDir, { recursive: true });

function paramLine(p: ParamSpec): string {
  const bits: string[] = [`\`${p.name}\`: ${p.type}`];
  if (p.range) bits.push(`범위 [${p.range[0]}, ${p.range[1]}]`);
  if (p.choices) bits.push(`선택지 {${p.choices.join(", ")}}`);
  if (p.exclude && p.exclude.length) bits.push(`제외 {${p.exclude.join(", ")}}`);
  return bits.join(", ");
}

const CIRCLED = ["①", "②", "③", "④", "⑤"];
const L: string[] = [];
L.push(`# REVIEW — ${course} 문제 템플릿 v0.1`);
L.push(``);
L.push(`- 생성일: ${new Date().toISOString().slice(0, 10)} / 샘플 seed: ${seed}`);
L.push(`- 템플릿 ${all.length}개 (생성 대상 ${generable.length}개, 그중 그림 자동 생성 ${withFigure.length}개 / 그림 스펙 없어 보류 ${deferred.length}개)`);
L.push(`- 각 템플릿마다 자동 생성 샘플 2문항을 보기·정답과 함께 표시했다. 수식은 LaTeX 원문이다.`);
L.push(``);
L.push(`검토 방법: 각 템플릿의 체크박스 4개를 확인해 주세요.`);
L.push(``);
L.push(`---`);

for (let ti = 0; ti < all.length; ti++) {
  const t = all[ti];
  L.push(``);
  L.push(`## ${t.template_id} — ${t.title}`);
  L.push(``);
  const figNote = t.needs_figure ? (t.figure ? ` / **그림 자동 생성(SVG)**` : ` / **needs_figure: 생성 보류**`) : ``;
  L.push(`- 원본 카드: \`${t.card_id}\` / 단원: ${t.unit} / 난이도: ${t.difficulty}` + figNote);
  L.push(`- **curriculum_check**: ${t.curriculum_check}`);
  L.push(`- 파라미터:`);
  for (const p of t.params) L.push(`  - ${paramLine(p)}`);
  if (t.constraints.length) L.push(`- 제약: ${t.constraints.map((c) => `\`${c}\``).join(" · ")}`);
  L.push(`- 오답 설계 (mistake_type):`);
  for (let i = 0; i < t.distractors.length; i++) {
    L.push(`  ${i + 1}. \`${t.distractors[i].expr}\` — ${t.distractors[i].mistake_type}`);
  }

  if (isGenerable(t)) {
    const rnd = mulberry32(seed + ti * 104729);
    for (let s = 0; s < 2; s++) {
      const { problem } = generateProblem(t, rnd, s + 1);
      L.push(``);
      if (!problem) {
        L.push(`### 샘플 ${s + 1}: ⚠ 생성 실패 (selftest 리포트 참조)`);
        continue;
      }
      L.push(`### 샘플 ${s + 1}`);
      L.push(``);
      L.push(`> $${problem.stem_latex}$`);
      L.push(`>`);
      if (problem.figure_svg) {
        const figName = `${t.template_id}_s${s + 1}.svg`;
        fs.writeFileSync(path.join(figDir, figName), problem.figure_svg, "utf-8");
        L.push(`> ![${figName}](figures/${figName})`);
        L.push(`>`);
      }
      for (let c = 0; c < 5; c++) {
        const mark = c === problem.answer_index ? " **← 정답**" : "";
        L.push(`> ${CIRCLED[c]} $${problem.choices[c]}$${mark}`);
      }
      L.push(`>`);
      L.push(`> 파라미터: \`${JSON.stringify(problem.params_used)}\``);
    }
  } else {
    L.push(``);
    L.push(`### 샘플: 생성 보류 (그림 필요)`);
    L.push(``);
    L.push(`> stem 초안: $${t.stem_latex}$`);
  }

  L.push(``);
  L.push(`**검토 체크리스트**`);
  L.push(``);
  L.push(`- [ ] 유형 적절`);
  L.push(`- [ ] 파라미터 범위 적절`);
  L.push(`- [ ] 오답이 실제 학생 실수`);
  L.push(`- [ ] 교육과정 준수`);
  L.push(``);
  L.push(`---`);
}

L.push(``);
L.push(`## needs_figure 템플릿 현황`);
L.push(``);
L.push(`### 그림 자동 생성으로 활성화됨 (${withFigure.length}개)`);
L.push(``);
if (withFigure.length === 0) L.push(`없음`);
for (const t of withFigure) L.push(`- **${t.template_id}** (${t.card_id}, ${t.title}) — 파라미터 기반 결정론적 SVG 렌더링 (\`figure\` 스펙)`);
L.push(``);
L.push(`### 그림 스펙이 없어 생성 보류 (${deferred.length}개)`);
L.push(``);
if (deferred.length === 0) L.push(`없음`);
for (const t of deferred) L.push(`- **${t.template_id}** (${t.card_id}, ${t.title})`);
L.push(``);
const outPath = path.join(reviewDir, `REVIEW_${course}_v0_1.md`);
fs.writeFileSync(outPath, L.join("\n"), "utf-8");
console.log(`✔ 검토 리포트 생성 → review/REVIEW_${course}_v0_1.md (템플릿 ${all.length}개)`);
