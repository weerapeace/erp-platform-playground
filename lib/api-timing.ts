/**
 * ของกลาง — จับเวลา API (Performance timing) · Phase 0 ของ perf audit
 *
 * ใช้ครอบ route handler เพื่อ log: ชื่อ endpoint, query params, จำนวนแถว (ถ้ามี), duration_ms
 * เกณฑ์: >500ms = WARN · >1000ms = SLOW · >3000ms = CRITICAL (log เฉพาะที่ >500ms เพื่อไม่ให้ log รก)
 *
 * วิธีใช้ใน route.ts:
 *   export const GET = timeRoute("master-v2:list", _GET);
 * ถ้า handler อยากบอกจำนวนแถว ให้ใส่ header "x-row-count" ใน NextResponse (helper จะอ่านแล้วลบออก)
 */
import { NextResponse } from "next/server";

type Handler = (req: Request, ctx?: unknown) => Promise<Response> | Response;

export function timeRoute(name: string, handler: Handler): Handler {
  return async (req: Request, ctx?: unknown): Promise<Response> => {
    const start = Date.now();
    let status = 0;
    let rows = "";
    try {
      const res = await handler(req, ctx);
      status = res.status;
      rows = res.headers.get("x-row-count") ?? "";
      if (rows) {
        // ลบ header ภายในออกก่อนส่งกลับ client
        const h = new Headers(res.headers);
        h.delete("x-row-count");
        return new NextResponse(res.body, { status: res.status, headers: h });
      }
      return res;
    } catch (e) {
      status = 500;
      throw e;
    } finally {
      const ms = Date.now() - start;
      if (ms > 500) {
        const level = ms > 3000 ? "CRITICAL" : ms > 1000 ? "SLOW" : "WARN";
        let search = "";
        try { search = new URL(req.url).search; } catch { /* noop */ }
        console.warn(`[api-timing] ${level} ${name} ${ms}ms status=${status}${rows ? ` rows=${rows}` : ""} ${req.method} ${search}`);
      }
    }
  };
}
