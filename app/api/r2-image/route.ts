/**
 * R2 Image Proxy — F15 + F21
 *
 * GET /api/r2-image?key=<r2_key>
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
    const wParam = Number(new URL(request.url).searchParams.get("w") || 0);
    // ไม่ย่อ GIF (sharp→webp จะได้เฟรมเดียว = ภาพนิ่ง) → เสิร์ฟตัวเต็มให้ยังขยับได้
    const canResize = wParam > 0 && wParam <= 2000 && ct0.startsWith("image/") && ct0 !== "image/svg+xml" && ct0 !== "image/gif";
    if (canResize) {
      try {
        const sharp = (await import("sharp")).default;
        const input = Buffer.from(await new Response(obj.body as ReadableStream).arrayBuffer());
        const out = await sharp(input).rotate().resize({ width: wParam, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
        const body = new Uint8Array(out);   // Buffer → Uint8Array<ArrayBuffer> (BodyInit ที่ถูกชนิด)
        const res = new Response(body, {
          status: 200,
          headers: { "Content-Type": "image/webp", "Content-Length": String(body.byteLength), ...CACHE_HEADERS },
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
