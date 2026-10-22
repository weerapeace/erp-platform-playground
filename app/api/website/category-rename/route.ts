/**
 * ✏️ เปลี่ยนรหัสหมวด (ลิงก์หน้าหมวด /c/<รหัส>) — /api/website/category-rename · ปุ่มในแท็บ 📂 หมวดหมู่
 *
 * GET  ?shopId=&from=&to= → ดูก่อนว่าจะแก้อะไรบ้าง (ไม่เขียน)
 * POST { shopId, from, to } → เปลี่ยนจริง: field_map + ธีม/หน้าแรก (ทั้งที่ใช้อยู่และร่าง) + สินค้า + หน้าเว็บ/มาใหม่/ธีมตั้งเวลา/โปร
 *        + ประวัติเวอร์ชัน/ธีมที่บันทึก/แม่แบบของร้านนี้ + ย้ายลิงก์เก่า /c/<เก่า> → /c/<ใหม่> + audit + ล้างแคชเว็บร้าน
 *
 * กติกาแก้รหัสใน JSON = lib/website-category-rename (pure + เทสต์) · แม่แบบที่ใช้ทุกร้าน (shop_id null) ไม่แตะ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { cleanCategoryKey, normalizeFieldMap } from "@/lib/website-field-map";
import { renameCategoryRefs, renameKeyInFieldMap, renameKeyInList, renameProblem, withCategoryRedirect } from "@/lib/website-category-rename";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;

/** ตารางที่เก็บ JSON อ้างรหัสหมวด (แถวของร้านนี้เท่านั้น) */
const SOURCES: { table: string; cols: string[]; label: string }[] = [
  { table: "store_pages", cols: ["layout", "draft_layout"], label: "หน้าเว็บ/บทความ" },
  { table: "store_new_drops", cols: ["layout", "draft_layout"], label: "หน้ามาใหม่" },
  { table: "store_theme_schedules", cols: ["theme", "layout", "look", "festive"], label: "ธีมตั้งเวลา" },
  { table: "store_promotions", cols: ["rule"], label: "โปรโมชัน" },
  { table: "store_home_versions", cols: ["layout"], label: "ประวัติหน้าแรก" },
  { table: "store_theme_versions", cols: ["theme"], label: "ประวัติธีม" },
  { table: "website_saved_themes", cols: ["theme"], label: "ธีมที่บันทึกไว้" },
  { table: "website_section_templates", cols: ["block"], label: "แม่แบบ Section" },
  { table: "website_menu_templates", cols: ["panel"], label: "แม่แบบเมนู" },
  { table: "website_canvas_templates", cols: ["data"], label: "แม่แบบผืนผ้าใบ" },
];

type Plan = {
  fieldMap: Record<string, unknown>;
  shopPatch: Record<string, unknown>;
  listings: { id: string; web_categories: string[] | null; web_category: string | null }[];
  rows: { table: string; label: string; id: string; patch: Record<string, unknown> }[];
  redirects: { before: string; after: string };
  summary: { label: string; count: number; unit: string }[];
};

async function buildPlan(sb: Admin, shopId: string, from: string, to: string): Promise<{ plan: Plan } | { error: string; status: number }> {
  const { data: shop } = await sb.from("shops").select("id, field_map, theme, theme_draft, home_layout, home_layout_draft").eq("id", shopId).maybeSingle();
  if (!shop) return { error: "ไม่พบร้าน", status: 404 };
  const s = shop as Record<string, unknown>;
  const raw = (s.field_map && typeof s.field_map === "object" ? s.field_map : {}) as Record<string, unknown>;
  const cats = normalizeFieldMap(raw).categories;
  const problem = renameProblem(cats, from, to);
  if (problem) return { error: problem, status: 400 };

  // ธีม (เมนู/หัว/ท้ายเว็บ) + หน้าแรก — ทั้งที่ใช้อยู่และฉบับร่าง
  const shopPatch: Record<string, unknown> = {};
  const hitsOf = (col: string) => {
    const r = renameCategoryRefs(s[col], from, to);
    if (r.hits) shopPatch[col] = r.value;
    return r.hits;
  };
  const themeHits = Math.max(hitsOf("theme"), hitsOf("theme_draft"));
  const homeHits = Math.max(hitsOf("home_layout"), hitsOf("home_layout_draft"));

  const { data: ls, error: lsErr } = await sb
    .from("store_listings")
    .select("id, web_categories, web_category")
    .eq("shop_id", shopId)
    .or(`web_categories.cs.{${from}},web_category.eq.${from}`)
    .limit(5000);
  if (lsErr) return { error: "อ่านสินค้าไม่สำเร็จ", status: 500 };
  const listings = ((ls ?? []) as Plan["listings"]).map((l) => ({
    id: l.id,
    web_categories: renameKeyInList(l.web_categories, from, to),
    web_category: l.web_category === from ? to : l.web_category,
  }));

  const rows: Plan["rows"] = [];
  const summary: Plan["summary"] = [
    { label: "🛍 สินค้าในหมวด", count: listings.length, unit: "รุ่น" },
    { label: "🧭 เมนู / หัว-ท้ายเว็บ", count: themeHits, unit: "จุด" },
    { label: "🏠 หน้าแรก", count: homeHits, unit: "จุด" },
  ];
  for (const src of SOURCES) {
    const { data, error } = await sb.from(src.table).select(["id", ...src.cols].join(", ")).eq("shop_id", shopId).limit(2000);
    if (error) continue; // ตารางที่ยังไม่มี/อ่านไม่ได้ = ข้าม (ไม่ทำให้เปลี่ยนรหัสไม่ได้)
    let n = 0;
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const patch: Record<string, unknown> = {};
      for (const col of src.cols) {
        const r = renameCategoryRefs(row[col], from, to);
        if (r.hits) patch[col] = r.value;
      }
      if (Object.keys(patch).length) {
        rows.push({ table: src.table, label: src.label, id: String(row.id), patch });
        n++;
      }
    }
    summary.push({ label: src.label, count: n, unit: "รายการ" });
  }

  const { data: red } = await sb.from("store_settings").select("value").eq("shop_id", shopId).eq("key", "redirects").maybeSingle();
  const before = String((red as { value?: string } | null)?.value ?? "");

  return {
    plan: {
      fieldMap: renameKeyInFieldMap(raw, cats, from, to),
      shopPatch,
      listings,
      rows,
      redirects: { before, after: withCategoryRedirect(before, from, to) },
      summary: summary.filter((x) => x.count > 0),
    },
  };
}

function readKeys(from: unknown, to: unknown) {
  return { from: cleanCategoryKey(from), to: cleanCategoryKey(to) };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const shopId = q.get("shopId") ?? "";
  const { from, to } = readKeys(q.get("from"), q.get("to"));
  if (!shopId || !from) return NextResponse.json({ error: "ต้องระบุ shopId + from" }, { status: 400 });
  const r = await buildPlan(supabaseAdmin(), shopId, from, to);
  if ("error" in r) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, from, to, summary: r.plan.summary, redirect: `/c/${from} → /c/${to}` });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { shopId?: string; from?: unknown; to?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { from, to } = readKeys(body.from, body.to);
  if (!body.shopId || !from) return NextResponse.json({ error: "ต้องระบุ shopId + from" }, { status: 400 });
  const shopId = body.shopId;

  const sb = supabaseAdmin();
  const r = await buildPlan(sb, shopId, from, to);
  if ("error" in r) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  const { plan } = r;
  const now = new Date().toISOString();
  const failed: string[] = [];

  // 1) รายการหมวด + ธีม + หน้าแรก — แถวเดียวกัน บันทึกพร้อมกัน (ไม่สำเร็จ = หยุด ยังไม่มีอะไรเปลี่ยน)
  const { error: shopErr } = await sb.from("shops").update({ field_map: plan.fieldMap, ...plan.shopPatch }).eq("id", shopId);
  if (shopErr) return NextResponse.json({ ok: false, error: "เปลี่ยนรหัสไม่สำเร็จ — ยังไม่มีอะไรเปลี่ยน ลองใหม่อีกครั้ง" }, { status: 500 });

  // 2) สินค้า
  let listingsOk = 0;
  for (let i = 0; i < plan.listings.length; i += 20) {
    const chunk = plan.listings.slice(i, i + 20);
    const res = await Promise.all(chunk.map((l) => sb.from("store_listings").update({ web_categories: l.web_categories, web_category: l.web_category, updated_at: now }).eq("id", l.id)));
    listingsOk += res.filter((x) => !x.error).length;
  }
  if (listingsOk < plan.listings.length) failed.push(`สินค้า ${plan.listings.length - listingsOk} รุ่น`);

  // 3) หน้าเว็บ/โปร/ประวัติ/แม่แบบ
  for (const row of plan.rows) {
    const { error } = await sb.from(row.table).update(row.patch).eq("id", row.id).eq("shop_id", shopId);
    if (error) failed.push(row.label);
  }

  // 4) ย้ายลิงก์เก่า → หน้าใหม่ (เว็บร้านหาหมวดไม่เจอ = เช็ครายการนี้ · src/app/c/[key] redirectOrNotFound)
  const { error: redErr } = await sb.from("store_settings").upsert({ shop_id: shopId, key: "redirects", value: plan.redirects.after, updated_at: now }, { onConflict: "shop_id,key" });
  if (redErr) failed.push("ย้ายลิงก์เก่า");

  await writeAudit(sb, {
    action: "update",
    entityType: "shop_field_map",
    entityId: shopId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { kind: "rename_web_category", from, to, summary: plan.summary, redirect: `/c/${from} -> /c/${to}`, failed },
  });
  const purged = await purgeStorefrontCache(sb, shopId);

  return NextResponse.json({ ok: !failed.length, from, to, summary: plan.summary, failed, purged, ...(failed.length ? { error: `เปลี่ยนแล้ว แต่บางจุดไม่สำเร็จ: ${[...new Set(failed)].join(", ")}` } : {}) });
}
