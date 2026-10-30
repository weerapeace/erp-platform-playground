/**
 * API สาธารณะ — 🖨 ลายรีดบนกระเป๋า : /api/public/storefront/print-designs
 *
 * GET  ?shop=<slug>&product=<parent id>          → { ok, library:[{id,name,url,ar,extra,set}] }  คลังลายของรุ่นนี้ (โหลดตอนลูกค้าเปิดตัวออกแบบ)
 * GET  ?shop=<slug>&designs=<id,id…>            → { ok, designs: PrintDesignView[] }  ภาพแบบในตะกร้า/หน้าออเดอร์ (รูปลูกค้า = ลิงก์ 1 ชม.)
 * POST { shop, action:"upload", product, type, size, purpose? } → { ok, path, url, token }   ลิงก์อัปรูปลูกค้า/รูปข้อความ (purpose "text") ตรงเข้าที่เก็บส่วนตัว (2 ชม.)
 * POST { shop, product, optionId, placements, views } → { ok, design:{id,code,extra,count,label,hasUpload} }  บันทึกแบบตอนกดใส่ตะกร้า (views = URL รูปสีที่ลูกค้าเห็นต่อส่วนพิมพ์)
 * POST { shop, action:"reupload-url", design, orderNo, phone, type, size } → ลิงก์อัปรูปใหม่ (ร้านขอรูปใหม่ · ยืนยันด้วยเลขออเดอร์+เบอร์)
 * POST { shop, action:"reupload", design, orderNo, phone, index, upload }  → แทนรูปเดิม → กลับเป็นรอตรวจลาย
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา (ลูกค้าไม่ได้ล็อกอิน) + CORS · กันยิงรัวด้วย lib/rate-limit
 * ปลอดภัยเพราะ: รับเฉพาะรุ่นที่เผยแพร่ + เปิดลายรีด · ลายต้องอยู่ในชุดที่ร้านเลือก · รูปต้องอยู่ในโฟลเดอร์ของร้านจริง
 *   ราคาคิดใหม่ที่นี่ทุกครั้ง (lib/website-print-design) · ออเดอร์ใช้ราคาจากแถวแบบ ไม่เชื่อหน้าเว็บ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { overLimit } from "@/lib/rate-limit";
import { storefrontCors, corsPreflight, corsJson } from "@/lib/storefront-cors";
import { activeShopBySlug } from "@/lib/website-shop";
import { createPrintUpload, createReuploadUrl, printDesignViews, printLibraryFor, readListingPrint, replacePrintUpload, savePrintDesign } from "@/lib/website-print-design-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = storefrontCors("GET, POST");
export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}
const json = corsJson(CORS);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const sb = supabaseAdmin();
  const shop = await activeShopBySlug<{ id: string }>(sb, url.searchParams.get("shop"), "id");
  if (!shop) return json({ ok: false, error: "ไม่พบร้าน" }, 404);
  const ids = url.searchParams.get("designs");
  if (ids !== null) {
    const limited = await overLimit(request, [{ name: "print-view:ip", limit: 240, windowSec: 3600 }]);
    if (limited) return json({ ok: false, error: limited }, 429);
    // มีลิงก์รูปลูกค้าชั่วคราว — ห้ามแคชที่ CDN
    return json({ ok: true, designs: await printDesignViews(sb, shop.id, ids.split(","), url.origin) }, 200, "private, no-store");
  }
  const cfg = await readListingPrint(sb, shop.id, url.searchParams.get("product") ?? "");
  if (!cfg) return json({ ok: false, error: "สินค้านี้ยังไม่เปิดให้ออกแบบลาย" }, 404);
  const library = await printLibraryFor(sb, cfg, url.origin);
  // คลังลายเปลี่ยนไม่บ่อย — แคชสั้น ๆ ที่ CDN
  return json({ ok: true, library }, 200, "public, s-maxage=60, stale-while-revalidate=300");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, 400);
  }
  const upload = body.action === "upload" || body.action === "reupload-url";
  const limited = await overLimit(request, [upload ? { name: "print-upload:ip", limit: 60, windowSec: 3600 } : { name: "print-design:ip", limit: 40, windowSec: 3600 }]);
  if (limited) return json({ ok: false, error: limited }, 429);

  const sb = supabaseAdmin();
  const shop = await activeShopBySlug<{ id: string }>(sb, body.shop, "id");
  if (!shop) return json({ ok: false, error: "ไม่พบร้าน" }, 404);

  if (upload) {
    const r = body.action === "reupload-url" ? await createReuploadUrl(sb, shop.id, body) : await createPrintUpload(sb, shop.id, body);
    return r.ok ? json({ ok: true, path: r.path, url: r.url, token: r.token }, 201) : json({ ok: false, error: r.error }, r.status);
  }
  if (body.action === "reupload") {
    const r = await replacePrintUpload(sb, shop.id, body);
    return r.ok ? json({ ok: true }, 200) : json({ ok: false, error: r.error }, r.status);
  }
  const r = await savePrintDesign(sb, shop.id, body);
  return r.ok ? json({ ok: true, design: r.design }, 201) : json({ ok: false, error: r.error }, r.status);
}
