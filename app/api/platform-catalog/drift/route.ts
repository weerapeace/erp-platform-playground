/**
 * ร้านที่ลงขายแล้ว ตรงกับระบบไหม (รูป/รายละเอียด/ชื่อตัวเลือก/ราคา) — /api/platform-catalog/drift
 * ตัวตรวจ/ประกอบ = lib/platform-listing-drift-server (ของกลาง · cron ใช้ตัวเดียวกัน) — route นี้ไม่ยิงร้านเอง
 *
 *  GET ?parent_sku_id=            → ผลตรวจที่จดไว้ของทุกร้านที่ลงสินค้านี้ { rows: StoredDrift[] }   (products.platforms.view)
 *  GET ?listing_id=               → ตรวจสด 1 รายการ (ดึงจากร้าน + ระบบ) แล้วจด { check }            (products.platforms.view)
 *  GET ?listing_id=&part=variants → สีในระบบ (รหัส · ชื่อตัวเลือก · ราคา · รูป · สต๊อก) { variants } — แท็บตัวเลือกในลิ้นชัก (2026-11-24)
 *  POST { action:"recheck", parent_sku_id } → ตรวจสดทุกร้านที่ลงสินค้านี้ (หลังแก้สินค้า) { rows }     (products.platforms.view)
 *  POST { action:"build", listing_id, keys } → คำสั่งส่งของเรื่องที่ติ๊ก (หน้าเว็บยิงไป API แก้สินค้าบนร้านเดิม) { calls, skipped, items }
 *  POST { action:"mark", listing_id, keys }  → หลังส่งสำเร็จ: จำชุดรูปที่ส่ง + ตรวจใหม่ { check }
 *     build/mark = products.platforms.publish (นำไปสู่การแก้ร้านจริง · route ปลายทางตรวจสิทธิ์/ชนกัน/ลงประวัติเองอีกชั้น)
 *  POST { action:"adopt", listing_id, key }               → "ให้ระบบใช้ค่านี้": ค่าบนร้านตอนนี้ → ร่างของร้านนี้ (ชื่อ/รายละเอียด/ข้อมูลจำเพาะ) { before, after, label, check }
 *  POST { action:"adopt_undo", listing_id, key, before }  → ย้อนกลับค่าเดิมในร่าง { check }
 *     adopt/adopt_undo = products.platforms.edit (แก้ร่างในระบบ · ไม่แตะร้าน · ประวัติ auditDiff) — เจ้าของเลือก 2026-11-23 ข้อ 1
 * ไม่แตะสต๊อก
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { DRIFT_KEYS, type DriftKey } from "@/lib/platform-listing-drift";
import { adoptShopValue, buildDriftCalls, checkListingDrift, driftListingsOfParent, listingSysVariants, loadStoredDrift, markDriftSent, undoAdopt } from "@/lib/platform-listing-drift-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const cleanKeys = (v: unknown): DriftKey[] => (Array.isArray(v) ? v.filter((k): k is DriftKey => (DRIFT_KEYS as readonly string[]).includes(String(k))) : []);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const admin = supabaseAdmin();
  const parentId = (sp.get("parent_sku_id") ?? "").trim();
  if (parentId) return json({ rows: await loadStoredDrift(admin, [parentId], { items: true }), error: null });
  const listingId = (sp.get("listing_id") ?? "").trim();
  if (!listingId) return json({ error: "ต้องระบุ listing_id หรือ parent_sku_id" }, 400);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  // สีในระบบ (แท็บตัวเลือกในลิ้นชัก · 2026-11-24) — ไม่ดึงร้าน ไม่จดผลตรวจ
  if (sp.get("part") === "variants") {
    const v = await listingSysVariants(admin, listingId, user?.id ?? null);
    return v.ok ? json({ variants: v.variants, platform_code: v.platform_code, error: null }) : json({ variants: null, platform_code: null, error: v.error }, v.status);
  }
  const r = await checkListingDrift(admin, listingId, user?.id ?? null);
  return r.ok ? json({ check: r, error: null }) : json({ check: null, error: r.error }, r.status);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { action?: string; listing_id?: string; parent_sku_id?: string; keys?: unknown; key?: string; before?: unknown };
  try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const action = String(body.action ?? "");
  const perm = action === "recheck" ? "products.platforms.view" : action === "adopt" || action === "adopt_undo" ? "products.platforms.edit" : "products.platforms.publish";
  const denied = await guardApi(request, perm); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const userId = user?.id ?? null;

  if (action === "recheck") {
    const parentId = String(body.parent_sku_id ?? "").trim();
    if (!parentId) return json({ error: "ต้องระบุ parent_sku_id" }, 400);
    const ls = await driftListingsOfParent(admin, parentId);
    // ทีละ 2 ร้าน (แต่ละร้านดึงสดจากร้านจริง)
    for (let i = 0; i < ls.length; i += 2) await Promise.all(ls.slice(i, i + 2).map((l) => checkListingDrift(admin, l.id, userId)));
    return json({ rows: await loadStoredDrift(admin, [parentId], { items: true }), error: null });
  }

  const listingId = String(body.listing_id ?? "").trim();
  if (!listingId) return json({ error: "ต้องระบุ listing_id" }, 400);
  const keys = cleanKeys(body.keys);
  if (action === "adopt" || action === "adopt_undo") {
    const key = cleanKeys([body.key])[0];
    if (!key) return json({ error: "ไม่รู้ว่าเรื่องไหน" }, 400);
    const r = action === "adopt" ? await adoptShopValue(admin, listingId, key, userId) : await undoAdopt(admin, listingId, key, body.before ?? null, userId);
    if (!r.ok) return json({ error: r.error }, r.status);
    const { check, ...rest } = r;
    return json({ ...rest, check: check.ok ? check : null, error: null });
  }
  if (action === "build") {
    if (!keys.length) return json({ error: "เลือกเรื่องที่จะส่งก่อน" }, 400);
    const r = await buildDriftCalls(admin, listingId, keys, userId);
    return r.ok ? json({ ...r, error: null }) : json({ error: r.error }, r.status);
  }
  if (action === "mark") {
    const r = await markDriftSent(admin, listingId, keys, userId);
    return r.ok ? json({ check: r, error: null }) : json({ check: null, error: r.error }, r.status);
  }
  return json({ error: "ไม่รู้จักคำสั่งนี้" }, 400);
}
