/**
 * 문제 생성 CLI
 * 사용: npm run factory:gen -- --course mijeokbun1 --count 5 [--difficulty 2] [--seed 42]
 * 출력: out/{YYYY-MM-DD}_{course}.jsonl
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { loadTemplates, generateProblem, mulberry32, FACTORY_ROOT, type GenFailure } from "./engine.js";
import type { GeneratedProblem } from "./schema.js";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1] ?? "";
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const course = args.course ?? "mijeokbun1";
const count = Number(args.count ?? 5);
const difficulty = args.difficulty ? Number(args.difficulty) : undefined;
const seed = args.seed ? Number(args.seed) : Date.now() % 2 ** 31;

const all = loadTemplates(path.join(FACTORY_ROOT, "templates", course));
const eligible = all.filter(
  (t) => !t.needs_figure && (difficulty === undefined || t.difficulty === difficulty)
);
if (eligible.length === 0) {
  console.error(`생성 가능한 템플릿이 없습니다 (course=${course}, difficulty=${difficulty ?? "any"})`);
  process.exit(1);
}

const rnd = mulberry32(seed);
// 템플릿 순서를 셔플한 뒤 round-robin으로 유형이 겹치지 않게 뽑는다
const order = [...eligible];
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
}

const problems: GeneratedProblem[] = [];
const failures: GenFailure[] = [];
let cursor = 0;
let guard = 0;
while (problems.length < count && guard < count * 10) {
  guard++;
  const t = order[cursor % order.length];
  cursor++;
  const { problem, failure } = generateProblem(t, rnd, problems.length + 1);
  if (problem) problems.push(problem);
  else if (failure) failures.push(failure);
}

const date = new Date().toISOString().slice(0, 10);
const outDir = path.join(FACTORY_ROOT, "out");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${date}_${course}.jsonl`);
fs.writeFileSync(outPath, problems.map((p) => JSON.stringify(p)).join("\n") + "\n", "utf-8");

console.log(`✔ ${problems.length}문제 생성 → ${path.relative(process.cwd(), outPath)}`);
console.log(`  seed=${seed}, course=${course}, difficulty=${difficulty ?? "any"}, 사용 템플릿 풀=${eligible.length}개`);
for (const p of problems) {
  console.log(`  - ${p.problem_id} (난이도 ${p.difficulty}) 정답: ${p.answer_value} [${["①", "②", "③", "④", "⑤"][p.answer_index]}]`);
}
if (failures.length > 0) {
  console.warn(`⚠ 생성 실패 템플릿 flag:`);
  for (const f of failures) console.warn(`  - ${f.template_id}: ${f.reason}`);
  process.exitCode = 2;
}
