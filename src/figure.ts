/**
 * 파라미터 기반 결정론적 SVG 그림 생성기.
 * 외부 렌더링 엔진(GeoGebra 등) 없이 교과서 관례(좌표축 화살표, 뚫린 점/닫힌 점,
 * 점선 보조선, 축 눈금 라벨)를 SVG 프리미티브로 직접 그린다.
 */
import { create, all } from "mathjs";
import type { FigureSpec } from "./schema.js";

const fm = create(all, {});

const W = 340; // 전체 폭(px)
const H = 260; // 전체 높이(px)
const M = 36; // 여백(px)

function ev(expr: string, scope: Record<string, number>): number {
  const v = fm.evaluate(expr, { ...scope });
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`figure 식이 유한한 수가 아님: ${expr}`);
  return n;
}

function fmtNum(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 100) / 100);
}

/** 라벨 텍스트의 {식} 플레이스홀더를 평가값으로 치환 */
function evalText(text: string, scope: Record<string, number>): string {
  return text.replace(/\{([^{}]+)\}/g, (whole, content: string) => {
    try {
      return fmtNum(ev(content, scope));
    } catch {
      return whole;
    }
  });
}

export function renderFigure(spec: FigureSpec, rawParams: Record<string, number | string>): string {
  const scope: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) scope[k] = n;
  }

  const xmin = ev(spec.window.x[0], scope);
  const xmax = ev(spec.window.x[1], scope);
  const ymin = ev(spec.window.y[0], scope);
  const ymax = ev(spec.window.y[1], scope);
  if (!(xmax > xmin) || !(ymax > ymin)) throw new Error("figure window가 퇴화됨");

  const sx = (x: number) => M + ((x - xmin) / (xmax - xmin)) * (W - 2 * M);
  const sy = (y: number) => H - M - ((y - ymin) / (ymax - ymin)) * (H - 2 * M);
  const inWin = (x: number, y: number) =>
    x >= xmin - 1e-9 && x <= xmax + 1e-9 && y >= ymin - 1e-9 && y <= ymax + 1e-9;

  const P: string[] = [];
  P.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif" font-size="13" style="paint-order:stroke">`
  );
  P.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  P.push(
    `<defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="#333"/></marker></defs>`
  );

  // 좌표축 (0이 창 안에 있을 때만)
  const hasXAxis = ymin <= 0 && 0 <= ymax;
  const hasYAxis = xmin <= 0 && 0 <= xmax;
  if (hasXAxis) {
    P.push(
      `<line x1="${M - 14}" y1="${sy(0)}" x2="${W - M + 16}" y2="${sy(0)}" stroke="#333" stroke-width="1.2" marker-end="url(#arr)"/>`
    );
    P.push(`<text stroke="#ffffff" stroke-width="3" paint-order="stroke" x="${W - M + 18}" y="${sy(0) + 5}" fill="#333" font-style="italic">x</text>`);
  }
  if (hasYAxis) {
    P.push(
      `<line x1="${sx(0)}" y1="${H - M + 14}" x2="${sx(0)}" y2="${M - 16}" stroke="#333" stroke-width="1.2" marker-end="url(#arr)"/>`
    );
    P.push(`<text stroke="#ffffff" stroke-width="3" paint-order="stroke" x="${sx(0) - 4}" y="${M - 20}" fill="#333" font-style="italic">y</text>`);
  }
  if (hasXAxis && hasYAxis) {
    P.push(`<text stroke="#ffffff" stroke-width="3" paint-order="stroke" x="${sx(0) - 14}" y="${sy(0) + 16}" fill="#333" font-style="italic">O</text>`);
  }

  const dashAttr = ` stroke-dasharray="5 4"`;

  for (const el of spec.elements) {
    if (el.kind === "poly") {
      const coeffs = el.coeffs.map((c) => ev(c, scope));
      const f = (x: number) => coeffs.reduce((acc, c, i) => acc + c * x ** i, 0);
      let d0 = xmin;
      let d1 = xmax;
      if (el.domain) {
        d0 = el.domain[0] === "xmin" ? xmin : ev(el.domain[0], scope);
        d1 = el.domain[1] === "xmax" ? xmax : ev(el.domain[1], scope);
      }
      const N = 160;
      let seg: string[] = [];
      const flush = () => {
        if (seg.length > 1) {
          P.push(
            `<polyline points="${seg.join(" ")}" fill="none" stroke="#111" stroke-width="1.8"${el.dashed ? dashAttr : ""}/>`
          );
        }
        seg = [];
      };
      for (let i = 0; i <= N; i++) {
        const x = d0 + ((d1 - d0) * i) / N;
        const y = f(x);
        if (inWin(x, y)) seg.push(`${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
        else flush();
      }
      flush();
    } else if (el.kind === "segment") {
      const x1 = ev(el.from[0], scope);
      const y1 = ev(el.from[1], scope);
      const x2 = ev(el.to[0], scope);
      const y2 = ev(el.to[1], scope);
      P.push(
        `<line x1="${sx(x1).toFixed(1)}" y1="${sy(y1).toFixed(1)}" x2="${sx(x2).toFixed(1)}" y2="${sy(y2).toFixed(1)}" stroke="#666" stroke-width="1.1"${el.dashed ? dashAttr : ""}/>`
      );
    } else if (el.kind === "point") {
      const x = ev(el.at[0], scope);
      const y = ev(el.at[1], scope);
      P.push(
        `<circle cx="${sx(x).toFixed(1)}" cy="${sy(y).toFixed(1)}" r="4" fill="${el.open ? "#ffffff" : "#111"}" stroke="#111" stroke-width="1.6"/>`
      );
    } else if (el.kind === "xtick") {
      const v = ev(el.at, scope);
      const label = el.text ? evalText(el.text, scope) : fmtNum(v);
      const y0 = hasXAxis ? sy(0) : H - M;
      P.push(`<line x1="${sx(v)}" y1="${y0 - 4}" x2="${sx(v)}" y2="${y0 + 4}" stroke="#333" stroke-width="1.2"/>`);
      P.push(`<text stroke="#ffffff" stroke-width="3" paint-order="stroke" x="${sx(v)}" y="${y0 + 18}" text-anchor="middle" fill="#333">${label}</text>`);
    } else if (el.kind === "ytick") {
      const v = ev(el.at, scope);
      const label = el.text ? evalText(el.text, scope) : fmtNum(v);
      const x0 = hasYAxis ? sx(0) : M;
      P.push(`<line x1="${x0 - 4}" y1="${sy(v)}" x2="${x0 + 4}" y2="${sy(v)}" stroke="#333" stroke-width="1.2"/>`);
      P.push(`<text stroke="#ffffff" stroke-width="3" paint-order="stroke" x="${x0 - 7}" y="${sy(v) + 4}" text-anchor="end" fill="#333">${label}</text>`);
    } else if (el.kind === "label") {
      const x = ev(el.at[0], scope);
      const y = ev(el.at[1], scope);
      P.push(
        `<text stroke="#ffffff" stroke-width="3" paint-order="stroke" x="${sx(x).toFixed(1)}" y="${sy(y).toFixed(1)}" text-anchor="${el.anchor ?? "start"}" fill="#111" font-style="italic">${evalText(el.text, scope)}</text>`
      );
    }
  }

  P.push(`</svg>`);
  return P.join("");
}
