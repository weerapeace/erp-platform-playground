// ============================================================
// erp-img — ตัวเสิร์ฟรูปบน Cloudflare (เจ้าของอนุมัติ 2026-11-10 "ย้ายรูปไป Cloudflare")
//
// ทำไม: เดิมทุกรูป (ERP + เว็บร้าน) วิ่ง R2 → เซิร์ฟเวอร์ Vercel → คนดู · Vercel ล้างแคชทุก deploy (~43 ครั้ง/วัน)
//       → รูปถูกดึง+ย่อใหม่ทั้งวัน = ค่าส่งข้อมูล 38.7 GB/9 วัน + ค่า CPU (memory vercel_cost_breakdown)
//
// GET /api/r2-image?key=<r2 key>[&w=&q=&sq=1&pad=34][&meta=1]   (ช่องเหมือนแอปทุกตัว — สลับที่อยู่ได้เลย)
//   - ไม่ย่อ / วิดีโอ / GIF / SVG → อ่านจาก R2 ตรง (รองรับ Range — วิดีโอกรอได้) · R2 ไม่คิดค่าส่งข้อมูลออก
//   - ย่อ (?w=) → หาในที่เก็บรูปย่อ `_variants/<key>/<etag>/...` ใน R2 ก่อน
//       ไม่มี → ขอแอป (Vercel /api/r2-image ย่อด้วย sharp เหมือนเดิม) ครั้งเดียว แล้วเก็บไว้ใน R2 → ครั้งต่อไปไม่แตะ Vercel
//       ต้นฉบับถูกเขียนทับ = etag ใหม่ = ย่อใหม่เอง
//   - imgset/<id> (ชุดรูปกลาง — อยู่ในฐานข้อมูล) / meta=1 → ส่งต่อให้แอปตอบ (ไม่เก็บ)
// ⚠️ Cache API ใช้ไม่ได้บน *.workers.dev (Cloudflare docs) จึงเก็บรูปย่อใน R2 แทน · เบราว์เซอร์เก็บเอง 1 วัน
//
// แอปส่งเบราว์เซอร์มาที่นี่: next.config redirects (เฉพาะคำขอ Sec-Fetch-Dest: image) · เว็บร้านชี้ตรงด้วย NEXT_PUBLIC_ERP_IMAGE_BASE
// Deploy: .github/workflows/deploy-img.yml (push workers/img/** บน feat/host-portable) · กติกา pure: ./rules.ts
// ============================================================
import { canTransform, contentTypeOf, IMGSET_RE, imageHeaders, isSafeKey, originQuery, transformOf, variantKey, VIDEO_TYPE } from "./rules";

/* ---- ชนิดขั้นต่ำของ R2 (ไม่พึ่ง @cloudflare/workers-types) ---- */
interface R2Range { offset?: number; length?: number; suffix?: number }
interface R2ObjectLike {
  key: string; size: number; etag: string; httpEtag: string; uploaded: Date;
  httpMetadata?: { contentType?: string };
  range?: R2Range;
  body?: ReadableStream;
}
interface R2BucketLike {
  head(key: string): Promise<R2ObjectLike | null>;
  get(key: string, opts?: { range?: Headers; onlyIf?: Headers }): Promise<R2ObjectLike | null>;
  put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
}
interface Ctx { waitUntil(p: Promise<unknown>): void }
export interface Env { IMAGES: R2BucketLike; ORIGIN: string }

const MAX_STORE = 20 * 1024 * 1024;   // รูปย่อใหญ่เกินนี้ไม่เก็บ (ปกติไม่กี่ร้อย KB)
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });

/** ส่งไฟล์จาก R2 ตรง ๆ — รองรับ Range (206) และ If-None-Match (304) */
async function serveOriginal(env: Env, key: string, req: Request): Promise<Response> {
  const head = req.method === "HEAD";
  const obj = head ? await env.IMAGES.head(key) : await env.IMAGES.get(key, { range: req.headers, onlyIf: req.headers });
  if (!obj) return json(404, { error: "ไม่พบไฟล์", key });
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const ct = contentTypeOf(key, obj.httpMetadata?.contentType ?? (VIDEO_TYPE[ext] ?? null));
  const base = imageHeaders(ct, { ETag: obj.httpEtag, "Accept-Ranges": "bytes", "X-Img-Source": "r2" });
  if (head) return new Response(null, { status: 200, headers: { ...base, "Content-Length": String(obj.size) } });
  if (!obj.body) return new Response(null, { status: 304, headers: base });   // onlyIf ไม่ผ่าน = เบราว์เซอร์มีตัวล่าสุดแล้ว
  const r = obj.range;
  if (r && req.headers.has("range")) {
    const start = r.offset ?? (r.suffix != null ? obj.size - r.suffix : 0);
    const len = r.length ?? (r.suffix ?? obj.size - start);
    return new Response(obj.body, { status: 206, headers: { ...base, "Content-Length": String(len), "Content-Range": `bytes ${start}-${start + len - 1}/${obj.size}` } });
  }
  return new Response(obj.body, { status: 200, headers: { ...base, "Content-Length": String(obj.size) } });
}

/** ส่งต่อให้แอปตอบ (ชุดรูปกลาง / meta) — ไม่เก็บ · 302 ชี้ path เดิม (relative) จึงวนกลับมาที่นี่เอง */
async function passToOrigin(env: Env, url: URL): Promise<Response> {
  const res = await fetch(`${env.ORIGIN}/api/r2-image${url.search}`, { headers: { "x-img-worker": "1" }, redirect: "manual" });
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.delete("set-cookie");
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/health") return new Response("erp-img ok", { headers: { "Content-Type": "text/plain" } });
    if (url.pathname !== "/api/r2-image") return json(404, { error: "not found" });
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Allow-Headers": "Range, If-None-Match", "Access-Control-Max-Age": "86400" } });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return json(405, { error: "method not allowed" });

    const key = url.searchParams.get("key");
    if (!isSafeKey(key)) return json(400, { error: "invalid key" });

    try {
      if (IMGSET_RE.test(key) || url.searchParams.get("meta") === "1") return await passToOrigin(env, url);

      const t = transformOf(url.searchParams);
      if (!t) return await serveOriginal(env, key, req);

      // ย่อ: ต้นฉบับต้องมีจริง + ชนิดที่ย่อได้ (GIF/SVG/วิดีโอ = ส่งตัวเต็มเหมือนแอป)
      const src = await env.IMAGES.head(key);
      if (!src) return json(404, { error: "ไม่พบรูป", key });
      if (!canTransform(contentTypeOf(key, src.httpMetadata?.contentType ?? null))) return await serveOriginal(env, key, req);

      const vkey = variantKey(key, src.etag, t);
      const hit = req.method === "HEAD" ? await env.IMAGES.head(vkey) : await env.IMAGES.get(vkey, { onlyIf: req.headers });
      if (hit) {
        const ct = hit.httpMetadata?.contentType ?? "image/webp";
        const h = imageHeaders(ct, { ETag: hit.httpEtag, "Content-Length": String(hit.size), "X-Img-Source": "r2-variant" });
        if (req.method === "HEAD") return new Response(null, { status: 200, headers: h });
        if (!hit.body) return new Response(null, { status: 304, headers: h });
        return new Response(hit.body, { status: 200, headers: h });
      }

      // ยังไม่เคยย่อขนาดนี้ → ให้แอปย่อ (sharp) ครั้งเดียว แล้วเก็บไว้
      const res = await fetch(`${env.ORIGIN}/api/r2-image?${originQuery(key, t)}`, { headers: { "x-img-worker": "1" } });
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || !(ct.startsWith("image/") || ct.startsWith("video/"))) {
        const h = new Headers(res.headers); h.set("Access-Control-Allow-Origin", "*"); h.set("Cache-Control", "no-store");
        return new Response(res.body, { status: res.ok ? 502 : res.status, headers: h });
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 0 && buf.byteLength <= MAX_STORE) {
        ctx.waitUntil(env.IMAGES.put(vkey, buf, { httpMetadata: { contentType: ct }, customMetadata: { src: key } }).catch(() => undefined));
      }
      const h = imageHeaders(ct, { "Content-Length": String(buf.byteLength), "X-Img-Source": "origin" });
      return new Response(req.method === "HEAD" ? null : buf, { status: 200, headers: h });
    } catch (e) {
      return json(502, { error: "ดึงรูปไม่สำเร็จ", detail: String((e as Error)?.message ?? e).slice(0, 200) });
    }
  },
};
