/**
 * ไอคอน PNG ของ "แอปหน้าเดียว" — /api/page-icon/<path ของหน้า>?s=192|512&m=1
 *   รูปไอคอนเมนูที่อัปโหลดไว้ (R2) → ครอปจัตุรัส · ไม่มี = วาดไอคอนเส้นของเมนู (เช่น ✂️ → กรรไกร) สีขาวบนพื้นสีของแอป
 *   m=1 = แบบ maskable (Android ตัดขอบเป็นวงกลม → เต็มพื้น เว้นขอบ)
 *   ไอคอนที่ตั้งเองของแอปหน้าเดียว (ของกลางไอคอนแอป key "page:<path>") มาก่อน · d=1 = ไอคอนตั้งต้น (ไม่สนที่ตั้งเอง — ตัวอย่างในตัวแก้ไอคอน) · v= เลขรุ่น กันแคช
 * สาธารณะ (เครื่องต้องดึงได้ตอนติดตั้งแอป) · กติกา lib/solo-page.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2GetObject } from "@/lib/r2";
import { DEFAULT_ICON_SETTINGS, resolveIcon } from "@/lib/icon-registry";
import { erpIconDef } from "@/lib/erp-icons";
import { pagePathFromSegments } from "@/lib/solo-page";
import { loadSoloPageInfo } from "@/lib/solo-page-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;
const HEADERS = { "Content-Type": "image/png", "Cache-Control": "public, max-age=300, s-maxage=300", "X-Content-Type-Options": "nosniff" };

/** ไอคอนเส้น (path ชุด 24×24) จากค่าไอคอนของเมนู · หาไม่ได้ = ตาราง (layout-grid) */
function linePaths(icon: string | null): string[] {
  const r = icon ? resolveIcon({ value: icon }, { ...DEFAULT_ICON_SETTINGS, mode: "line" }, "line") : null;
  if (r?.kind === "line") return r.d;
  return erpIconDef("layout-grid")?.d ?? [];
}

function drawSvg(size: number, theme: string, paths: string[], maskable: boolean): string {
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const glyph = size * (maskable ? 0.46 : 0.56);
  const off = (size - glyph) / 2;
  const scale = glyph / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<rect width="${size}" height="${size}" rx="${radius}" fill="${theme}"/>`
    + `<g transform="translate(${off} ${off}) scale(${scale})" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">`
    + paths.map((d) => `<path d="${d.replace(/"/g, "")}"/>`).join("")
    + `</g></svg>`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await params;
  const pagePath = pagePathFromSegments(path);
  if (!pagePath) return NextResponse.json({ error: "invalid page" }, { status: 400 });
  const sp = new URL(request.url).searchParams;
  const size = Number(sp.get("s")) > 256 ? 512 : 192;
  const maskable = sp.get("m") === "1";
  const forceDefault = sp.get("d") === "1";
  const sharp = (await import("sharp")).default;

  try {
    const info = await loadSoloPageInfo(supabaseAdmin(), pagePath, { ignoreCustom: forceDefault });
    if (info.iconUrl && SAFE_KEY.test(info.iconUrl)) {
      try {
        const obj = await r2GetObject(info.iconUrl);
        if (obj) {
          const src = Buffer.from(await new Response(obj.body).arrayBuffer());
          const inner = maskable ? Math.round(size * 0.8) : size;
          const img = await sharp(src).resize(inner, inner, { fit: "cover" }).png().toBuffer();
          const body = maskable
            ? await sharp({ create: { width: size, height: size, channels: 4, background: info.theme } }).composite([{ input: img, gravity: "center" }]).png().toBuffer()
            : img;
          return new Response(new Uint8Array(body), { headers: HEADERS });
        }
      } catch (e) {
        console.warn(`[page-icon] อ่านรูปไอคอนเมนู ${pagePath} ไม่ได้ วาดไอคอนเส้นแทน:`, e instanceof Error ? e.message : e);
      }
    }
    const body = await sharp(Buffer.from(drawSvg(size, info.theme, linePaths(info.icon), maskable))).png().toBuffer();
    return new Response(new Uint8Array(body), { headers: HEADERS });
  } catch (e) {
    console.error(`[page-icon] ${pagePath}:`, e);
    return Response.redirect(new URL(size > 192 ? "/icon-512.png" : "/icon-192.png", request.url), 302);
  }
}
