/**
 * R2 Image Proxy — F15 + F21
 *
 * GET /api/r2-image?key=<r2_key>
 *   &w=<px>   ย่อให้กว้างไม่เกินนี้ (ไม่ขยาย · ถึง 3200) → webp
 *   &q=<50-92> คุณภาพ webp (ไม่ใส่ = 75) — รูปใหญ่เต็มจอ (แบนเนอร์/สไลด์) ขอ 85 ให้คม
 *   &meta=1   คืน JSON { width, height, bytes, type } ของไฟล์ต้นฉบับ (ฟอร์มเตือน "รูปเล็กไป")
 *
 * F21: ใช้ R2 native binding (env.R2_IMAGES.get) ตรงๆ — ไม่มี AWS SDK
 * → bundle เล็ก → ไม่ชน Worker 1102 + ไม่ต้อง sign URL
 *
 * Headers:
 *   Content-Type      = จาก R2 object metadata
 *   Cache-Control     = public, max-age=3600 (browser cache 1 ชม.)
 *   CDN-Cache-Control = public, max-age=86400 (Cloudflare edge cache 1 วัน)
 */

import { NextRequest } from "next/server";
import { r2GetObject } from "@/lib/r2";

const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;

const CACHE_HEADERS = {
  "Cache-Control":     "public, max-age=3600, stale-while-revalidate=86400",
  "CDN-Cache-Control": "public, max-age=86400",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
// edge cache ของ Cloudflare (caches.default) — รูปซ้ำ "ข้ามผู้ใช้" ไม่ต้องเรียก worker/อ่าน R2 ใหม่
// ปลอดภัย: ถ้าเข้าไม่ได้ → คืน null แล้วทำงานปกติ
async function getEdgeCache(): Promise<{ cache: any; waitUntil: (p: Promise<unknown>) => void } | null> {
  try {
    const cache = (globalThis as any).caches?.default;
    if (!cache) return null;
    const mod: any = await import(/* webpackIgnore: true */ ("@opennextjs/cloudflare" as string));
    const ctx = mod.getCloudflareContext ? mod.getCloudflareContext() : null;
    const wu = ctx?.ctx?.waitUntil;
    if (!wu) return null; // ไม่มี waitUntil → ข้าม (กัน put ครึ่งๆ กลางๆ)
    return { cache, waitUntil: wu.bind(ctx.ctx) };
  } catch { return null; }
}

export async function GET(request: NextRequest): Promise<Response> {
  // F17: ไม่ต้อง auth — Cloudflare Access protects URL (image proxy = read-only CDN)
  const key = new URL(request.url).searchParams.get("key");
  if (!key || !SAFE_KEY.test(key)) {
    return new Response(JSON.stringify({ error: "invalid key" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const edge = await getEdgeCache();
  if (edge) { try { const hit = await edge.cache.match(request); if (hit) return hit; } catch { /* miss */ } }

  try {
    const obj = await r2GetObject(key);
    if (!obj) {
      return new Response(JSON.stringify({ error: "ไม่พบรูป", key }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }

    // ── ย่อรูปตามขนาดที่ขอ (?w=) — เฉพาะที่ย่อได้ (Vercel/Node มี sharp) ──
    // ย่อไม่ได้ (เช่น Cloudflare ไม่มี sharp) → ส่ง "รูปเดิม" แทน (ปลอดภัย)
    const ct0 = obj.httpMetadata?.contentType ?? "image/jpeg";
    // 📏 ขนาดต้นฉบับ (ไม่ส่งรูป) — อ่านไม่ได้ (เช่น Cloudflare ไม่มี sharp / ไม่ใช่รูป) = {} เฉย ๆ
    if (new URL(request.url).searchParams.get("meta") === "1") {
      let info: Record<string, unknown> = {};
      try {
        if (ct0.startsWith("image/") && ct0 !== "image/svg+xml") {
          const sharp = (await import("sharp")).default;
          const m = await sharp(Buffer.from(await new Response(obj.body as ReadableStream).arrayBuffer())).metadata();
          // EXIF หมุน 90° (5–8) = กว้าง/สูงสลับกันตอนแสดงผล
          const swap = (m.orientation ?? 1) >= 5;
          info = { width: swap ? m.height : m.width, height: swap ? m.width : m.height, bytes: obj.size, type: ct0 };
        }
      } catch {
        /* ไม่รู้ขนาด */
      }
      return new Response(JSON.stringify(info), { status: 200, headers: { "Content-Type": "application/json", ...CACHE_HEADERS } });
    }
    const wParam = Number(new URL(request.url).searchParams.get("w") || 0);
    const qRaw = Number(new URL(request.url).searchParams.get("q") || 0);
    const quality = qRaw >= 50 && qRaw <= 92 ? Math.round(qRaw) : 75;
    // sq=1 → บังคับสี่เหลี่ยมจัตุรัส (1:1) แบบ contain + พื้นขาว (ไม่ครอปสินค้าหาย) — ใช้กับรูปตัวเลือก LINE ที่ต้อง 1:1
    const sq = new URL(request.url).searchParams.get("sq") === "1";
    // ไม่ย่อ GIF (sharp→webp จะได้เฟรมเดียว = ภาพนิ่ง) → เสิร์ฟตัวเต็มให้ยังขยับได้
    // ถึง 3200px: แบนเนอร์/สไลด์เต็มจอบนจอคมชัดสูง (Retina) ต้องการรูปกว้าง ~2,500–3,000px
    const canResize = wParam > 0 && wParam <= 3200 && ct0.startsWith("image/") && ct0 !== "image/svg+xml" && ct0 !== "image/gif";
    if (canResize) {
      try {
        const sharp = (await import("sharp")).default;
        const input = Buffer.from(await new Response(obj.body as ReadableStream).arrayBuffer());
        const pipeline = sharp(input).rotate();
        // sq (รูปตัวเลือก LINE): 1:1 + LINE ไม่รับ webp ("Unsupported media type") → ออกเป็น JPEG · โหมดย่อทั่วไป → webp (เบากว่า)
        const out = sq
          ? await pipeline.resize({ width: wParam, height: wParam, fit: "contain", background: { r: 255, g: 255, b: 255 } }).jpeg({ quality: 82 }).toBuffer()
          : await pipeline.resize({ width: wParam, withoutEnlargement: true }).webp({ quality }).toBuffer();
        const outType = sq ? "image/jpeg" : "image/webp";
        const body = new Uint8Array(out);   // Buffer → Uint8Array<ArrayBuffer> (BodyInit ที่ถูกชนิด)
        const res = new Response(body, {
          status: 200,
          headers: { "Content-Type": outType, "Content-Length": String(body.byteLength), ...CACHE_HEADERS },
        });
        if (edge) { try { edge.waitUntil(edge.cache.put(request, res.clone())); } catch { /* noop */ } }
        return res;
      } catch {
        // ย่อไม่ได้ → ดึงรูปเดิมใหม่ (stream เดิมอาจถูกอ่านไปแล้ว) แล้วส่ง original
        const fresh = await r2GetObject(key);
        if (fresh) {
          const res = new Response(fresh.body, {
            status: 200,
            headers: { "Content-Type": fresh.httpMetadata?.contentType ?? ct0, "Content-Length": String(fresh.size), ...CACHE_HEADERS },
          });
          if (edge) { try { edge.waitUntil(edge.cache.put(request, res.clone())); } catch { /* noop */ } }
          return res;
        }
      }
    }

    // 🎬 วิดีโอ (เช่น รูปเปิดหน้าสินค้า ≤ 4 MB): รองรับ Range — Safari/iPhone ขอไฟล์ทีละช่วง (206) ถ้าไม่รองรับจะไม่เล่นเลย
    // ไม่ให้ CDN เก็บ (206 ปน 200 แล้วเสิร์ฟผิดช่วงได้) · เบราว์เซอร์เก็บเองได้ 1 ชม.
    if (ct0.startsWith("video/")) {
      const vHeaders = { "Content-Type": ct0, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600", "CDN-Cache-Control": "no-store", Vary: "Range" };
      const buf = new Uint8Array(await new Response(obj.body as ReadableStream).arrayBuffer());
      const total = buf.byteLength;
      const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
      if (m && (m[1] || m[2])) {
        const start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
        const end = m[1] && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
        if (start >= total || start > end) {
          return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
        }
        return new Response(buf.slice(start, end + 1), {
          status: 206,
          headers: { ...vHeaders, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${total}` },
        });
      }
      return new Response(buf, { status: 200, headers: { ...vHeaders, "Content-Length": String(total) } });
    }

    const res = new Response(obj.body, {
      status: 200,
      headers: {
        "Content-Type":   ct0,
        "Content-Length": String(obj.size),
        ...CACHE_HEADERS,
      },
    });
    // เก็บลง edge cache เบื้องหลัง (ไม่หน่วง response) — รอบหน้าเสิร์ฟจาก edge ไม่แตะ worker
    if (edge) { try { edge.waitUntil(edge.cache.put(request, res.clone())); } catch { /* noop */ } }
    return res;
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
