// 서버 번들 빌드 (Windows/리눅스 공통 — npm 스크립트 따옴표 문제 회피용)
import { build } from "esbuild";

await build({
  entryPoints: ["src/app.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  define: { PACKAGE_VERSION: "'3.2.1'" },
  outfile: "dist/app.cjs",
  logLevel: "info",
});
