/**
 * Vercel 서버리스 엔트리 — 모든 경로를 이 함수로 rewrite (vercel.json).
 * 브라우저만 있으면 어떤 기기에서든 문제지를 만들 수 있는 웹 버전.
 */
import { formPage, makeWorksheet } from "../src/webapp.js";

export default function handler(req: any, res: any) {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/worksheet") {
      const r = makeWorksheet(url.searchParams);
      if ("error" in r) {
        res.statusCode = 400;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(r.error);
      } else {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(r.html);
      }
    } else {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(formPage());
    }
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(`오류: ${e.message}`);
  }
}
