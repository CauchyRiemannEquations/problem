/**
 * templates/ 디렉토리의 모든 템플릿을 src/templates_data.ts로 임베딩.
 * exe 빌드 시 템플릿이 실행파일 안에 포함되도록 하기 위한 빌드 단계.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tplRoot = path.join(root, "templates");
const courses = fs.readdirSync(tplRoot).filter((d) => fs.statSync(path.join(tplRoot, d)).isDirectory());

const data: Record<string, unknown[]> = {};
for (const course of courses) {
  const dir = path.join(tplRoot, course);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  data[course] = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
}

const out = `// 자동 생성 파일 — 직접 수정하지 말 것. (scripts/embed_templates.ts)
import type { ProblemTemplate } from "./schema.js";

export const TEMPLATES: Record<string, ProblemTemplate[]> = ${JSON.stringify(data, null, 1)} as unknown as Record<string, ProblemTemplate[]>;
`;
fs.writeFileSync(path.join(root, "src", "templates_data.ts"), out, "utf-8");
const total = Object.values(data).reduce((a, v) => a + v.length, 0);
console.log(`✔ templates_data.ts 생성 (${courses.join(", ")} — 총 ${total}개 템플릿)`);
