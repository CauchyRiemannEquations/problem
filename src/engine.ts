/**
 * 생성 엔진: 파라미터 샘플링 → 제약 검사 → 정답/오답 평가(mathjs Fraction 정밀 계산)
 * → 하드 검증(중복·유한성) → LaTeX 렌더링(플레이스홀더 치환 + 부호 정규화)
 */
import { create, all } from "mathjs";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProblemTemplate, ParamSpec, GeneratedProblem } from "./schema.js";
import { renderFigure } from "./figure.js";

export const math = create(all, {});

/** 생성 가능 여부: 그림이 필요 없거나, 그림 스펙이 있어 자동 렌더링 가능한 템플릿 */
export function isGenerable(t: ProblemTemplate): boolean {
  return !t.needs_figure || !!t.figure;
}

// ---------- RNG (재현 가능한 시드 기반) ----------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 값 처리 ----------
interface Frac {
  s: number; // 부호 (+1/-1)
  n: number; // 분자 (양수)
  d: number; // 분모 (양수)
}

/** mathjs 평가 결과(number | Fraction | ...)를 유한 유리수로 정규화. 실패 시 null */
export function asFrac(v: unknown): Frac | null {
  try {
    if (typeof v === "boolean") return null;
    const f: any = (math as any).fraction(v as any);
    const n = Number(f.n);
    const d = Number(f.d);
    const s = Number(f.s) < 0 ? -1 : 1;
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
    return { s, n: Math.abs(n), d: Math.abs(d) };
  } catch {
    return null;
  }
}

/** 값 동일성 비교용 키 */
export function fracKey(f: Frac): string {
  if (f.n === 0) return "0";
  return `${f.s < 0 ? "-" : ""}${f.n}/${f.d}`;
}

/** 보기/정답 표시용 LaTeX */
export function fracToLatex(f: Frac): string {
  if (f.d === 1) return String(f.s * f.n);
  return `${f.s < 0 ? "-" : ""}\\dfrac{${f.n}}{${f.d}}`;
}

/** stem 치환용(계수 자리): 정수는 그대로, 유리수는 \dfrac */
function fracToInline(f: Frac): string {
  return fracToLatex(f);
}

// ---------- 파라미터 샘플링 ----------
export function sampleParam(spec: ParamSpec, rnd: () => number): number | string {
  if (spec.type === "int") {
    const [lo, hi] = spec.range!;
    for (let i = 0; i < 1000; i++) {
      const v = lo + Math.floor(rnd() * (hi - lo + 1));
      if (!spec.exclude || !spec.exclude.includes(v)) return v;
    }
    throw new Error(`param ${spec.name}: exclude가 range를 전부 덮음`);
  }
  if (spec.type === "choice" || spec.type === "rational") {
    const cs = spec.choices!;
    return cs[Math.floor(rnd() * cs.length)];
  }
  throw new Error(`unknown param type: ${(spec as any).type}`);
}

/** 파라미터 원값 → mathjs 평가 scope (정밀 계산 위해 Fraction으로) */
function toScope(raw: Record<string, number | string>): Record<string, any> {
  const scope: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    scope[k] = typeof v === "number" ? (math as any).fraction(v) : (math as any).fraction(String(v));
  }
  return scope;
}

// ---------- stem 렌더링 ----------
/**
 * {…} 플레이스홀더 치환. 중괄호 안이 "파라미터 이름만으로 이루어진 mathjs 식"일 때만
 * 평가해 치환하고, LaTeX 고유 중괄호({cases}, {x}, 숫자 등)는 그대로 둔다.
 * 정규식은 중첩 없는 가장 안쪽 중괄호만 잡으므로 \lim_{x \to {p}} 같은 형태도 안전하다.
 */
export function renderStem(stem: string, raw: Record<string, number | string>): string {
  const paramNames = new Set(Object.keys(raw));
  const scope = toScope(raw);
  const out = stem.replace(/\{([^{}]+)\}/g, (whole, content: string) => {
    let node: any;
    try {
      node = math.parse(content);
    } catch {
      return whole;
    }
    const syms: string[] = [];
    node.traverse((n: any, _p: any, parent: any) => {
      if (n.isSymbolNode && !(parent && parent.isFunctionNode && parent.fn === n)) syms.push(n.name);
    });
    if (syms.length === 0) return whole; // 순수 숫자/기호 → LaTeX 그대로
    if (!syms.every((s) => paramNames.has(s))) return whole;
    try {
      const f = asFrac(math.evaluate(content, { ...scope }));
      if (!f) return whole;
      return fracToInline(f);
    } catch {
      return whole;
    }
  });
  return normalizeLatex(out);
}

/** 부호·계수 정규화: "+ -3" → "- 3", "- -3" → "+ 3", "1x" → "x" */
export function normalizeLatex(s: string): string {
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/\+\s*-\s*/g, "- ").replace(/-\s*-\s*/g, "+ ");
  }
  // 계수 1 생략: 숫자/소수점 뒤가 아닌 "1"이 문자·백슬래시 앞에 오면 제거 (예: "+ 1x" → "+ x", "-1\left|" → "-\left|")
  s = s.replace(/(^|[^\d.])1(?=[a-zA-Z\\])/g, "$1");
  return s;
}

// ---------- 문제 생성 ----------
export interface GenFailure {
  template_id: string;
  reason: string;
}

const MAX_TRIES = 200;

export function generateProblem(
  t: ProblemTemplate,
  rnd: () => number,
  serial: number
): { problem: GeneratedProblem | null; failure: GenFailure | null } {
  let lastReason = "unknown";
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const raw: Record<string, number | string> = {};
    for (const spec of t.params) raw[spec.name] = sampleParam(spec, rnd);
    const scope = toScope(raw);

    // 1) 제약 검사
    let ok = true;
    try {
      for (const c of t.constraints) {
        const v = math.evaluate(c, { ...scope });
        if (v !== true) {
          ok = false;
          lastReason = `constraint 불만족: ${c}`;
          break;
        }
      }
    } catch (e: any) {
      ok = false;
      lastReason = `constraint 평가 오류: ${e.message}`;
    }
    if (!ok) continue;

    // 2) 정답·오답 평가
    let answer: Frac | null = null;
    const dvals: (Frac | null)[] = [];
    try {
      answer = asFrac(math.evaluate(t.answer_expr, { ...scope }));
      for (const d of t.distractors) dvals.push(asFrac(math.evaluate(d.expr, { ...scope })));
    } catch (e: any) {
      lastReason = `식 평가 오류: ${e.message}`;
      continue;
    }

    // 3) 하드 검증: 유한성
    if (!answer || dvals.some((d) => d === null)) {
      lastReason = "정답 또는 오답이 유한한 수가 아님 (NaN/Infinity/0분모)";
      continue;
    }
    // 3) 하드 검증: 정답≠오답, 오답 상호 중복 없음
    const keys = [fracKey(answer), ...dvals.map((d) => fracKey(d!))];
    if (new Set(keys).size !== 5) {
      lastReason = `보기 중복 발생: [${keys.join(", ")}]`;
      continue;
    }

    // 4) 렌더링 + 셔플
    const stem = renderStem(t.stem_latex, raw);
    let figure_svg: string | undefined;
    if (t.figure) {
      try {
        figure_svg = renderFigure(t.figure, raw);
      } catch (e: any) {
        lastReason = `그림 렌더링 오류: ${e.message}`;
        continue;
      }
    }
    const entries = [
      { latex: fracToLatex(answer), origin: "answer" },
      ...dvals.map((d, i) => ({ latex: fracToLatex(d!), origin: t.distractors[i].mistake_type })),
    ];
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    const answer_index = entries.findIndex((e) => e.origin === "answer");

    const problem: GeneratedProblem = {
      problem_id: `${t.template_id}#${String(serial).padStart(4, "0")}`,
      template_id: t.template_id,
      card_id: t.card_id,
      course: t.course,
      unit: t.unit,
      difficulty: t.difficulty,
      stem_latex: stem,
      choices: entries.map((e) => e.latex),
      answer_index,
      answer_value: fracToLatex(answer),
      params_used: raw,
      choice_origins: entries.map((e) => e.origin),
      ...(figure_svg ? { figure_svg } : {}),
    };
    return { problem, failure: null };
  }
  return {
    problem: null,
    failure: { template_id: t.template_id, reason: `${MAX_TRIES}회 재샘플 실패. 마지막 사유: ${lastReason}` },
  };
}

// ---------- 템플릿 로딩 ----------
export function loadTemplates(courseDir: string): ProblemTemplate[] {
  const dir = path.resolve(courseDir);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map((f) => {
    const t = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as ProblemTemplate;
    for (const field of ["template_id", "card_id", "stem_latex", "answer_expr"] as const) {
      if (!t[field]) throw new Error(`${f}: 필수 필드 누락 ${field}`);
    }
    if (t.distractors.length !== 4) {
      throw new Error(`${f}: 오답은 정확히 4개여야 함 (현재 ${t.distractors.length})`);
    }
    return t;
  });
}

export const FACTORY_ROOT = (() => {
  try {
    // tsx/ESM 실행 시: src/의 부모 = factory 루트 (Windows 경로 호환을 위해 fileURLToPath 사용)
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  } catch {
    // 번들(CJS)에서는 import.meta가 없음 — 파일 로딩 대신 임베딩 데이터를 쓰므로 cwd로 충분
    return process.cwd();
  }
})();
