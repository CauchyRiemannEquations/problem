/**
 * 자체 테스트: 템플릿당 50개 샘플 생성 → 하드 검증 통과율 측정 + 정답 분포 체크
 * 실패 템플릿은 review/failed_templates.md에 사유와 함께 격리 기록.
 * 사용: npm run factory:selftest [-- --course mijeokbun1 --n 50 --seed 1234]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { loadTemplates, generateProblem, mulberry32, FACTORY_ROOT } from "./engine.js";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1] ?? "";
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const course = args.course ?? "mijeokbun1";
const N = Number(args.n ?? 50);
const seedBase = Number(args.seed ?? 20260814);

const all = loadTemplates(path.join(FACTORY_ROOT, "templates", course));
const testable = all.filter((t) => !t.needs_figure);
const skipped = all.filter((t) => t.needs_figure);

interface Row {
  template_id: string;
  pass: number;
  fail: number;
  distinctAnswers: number;
  lastFailReason: string;
  warnings: string[];
}

const rows: Row[] = [];
for (let ti = 0; ti < testable.length; ti++) {
  const t = testable[ti];
  const rnd = mulberry32(seedBase + ti * 7919);
  const answerKeys = new Set<string>();
  let pass = 0;
  let fail = 0;
  let lastFailReason = "";
  for (let i = 0; i < N; i++) {
    const { problem, failure } = generateProblem(t, rnd, i + 1);
    if (problem) {
      pass++;
      answerKeys.add(problem.answer_value);
    } else {
      fail++;
      lastFailReason = failure?.reason ?? "unknown";
    }
  }
  const warnings: string[] = [];
  if (answerKeys.size === 1 && pass > 1) {
    warnings.push(`정답이 항상 같은 값(${[...answerKeys][0]}) — 파라미터 범위가 너무 좁다는 신호`);
  }
  rows.push({ template_id: t.template_id, pass, fail, distinctAnswers: answerKeys.size, lastFailReason, warnings });
}

// 콘솔 리포트
console.log(`\n=== selftest: ${course}, 템플릿당 ${N}회 (seed base ${seedBase}) ===`);
let allPass = true;
for (const r of rows) {
  const rate = ((r.pass / N) * 100).toFixed(1);
  const mark = r.fail === 0 ? "✔" : "✘";
  if (r.fail > 0) allPass = false;
  console.log(
    `${mark} ${r.template_id}  통과 ${r.pass}/${N} (${rate}%)  정답 종류 ${r.distinctAnswers}` +
      (r.warnings.length ? `  ⚠ ${r.warnings.join("; ")}` : "")
  );
  if (r.fail > 0) console.log(`    └ 마지막 실패 사유: ${r.lastFailReason}`);
}
console.log(`needs_figure로 생성 보류(테스트 제외): ${skipped.map((t) => t.template_id).join(", ") || "없음"}`);

// 실패 템플릿 격리 기록
const reviewDir = path.join(FACTORY_ROOT, "review");
fs.mkdirSync(reviewDir, { recursive: true });
const failedRows = rows.filter((r) => r.fail > 0);
const warnRows = rows.filter((r) => r.fail === 0 && r.warnings.length > 0);
const lines: string[] = [
  `# selftest 실패/경고 템플릿 (${course} v0.1)`,
  ``,
  `- 실행: 템플릿당 ${N}회 샘플 생성, seed base ${seedBase}`,
  `- 테스트 대상 ${testable.length}개 / needs_figure 보류 ${skipped.length}개`,
  ``,
];
if (failedRows.length === 0) {
  lines.push(`## 실패 템플릿`, ``, `없음 — 전 템플릿 하드 검증 통과율 100%`, ``);
} else {
  lines.push(`## 실패 템플릿 (생성 대상에서 격리할 것)`, ``);
  for (const r of failedRows) {
    lines.push(`- **${r.template_id}**: ${r.fail}/${N}회 실패. 사유: ${r.lastFailReason}`);
  }
  lines.push(``);
}
if (warnRows.length > 0) {
  lines.push(`## 경고 (생성은 가능)`, ``);
  for (const r of warnRows) lines.push(`- **${r.template_id}**: ${r.warnings.join("; ")}`);
  lines.push(``);
}
fs.writeFileSync(path.join(reviewDir, "failed_templates.md"), lines.join("\n"), "utf-8");
console.log(`\n리포트 → review/failed_templates.md`);
process.exitCode = allPass ? 0 : 1;
