import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { cleanIds, isUuid, type MarketingSkuItem, type MarketingSkuLabel, type MarketingBrand } from "@/lib/marketing/sku-list";

export const dynamic = "force-dynamic";

// SKU การตลาด = ทุก Parent SKU ที่เปิดใช้งาน (view marketing_sku_overview) + ป้าย/หมายเหตุการตลาด (ตาราง marketing_skus)

type OverviewRow = {
  parent_sku_id: string; code: string | null; name_th: string | null; cover_image_r2_key: string | null; brand_id: string | null;
  label_id: string | null; note: string | null; marketing_updated_at: string | null; sku_total: number | null; sku_active: number | null;
};

const PAGE = 1000;   // PostgREST คืนได้สูงสุด 1000 แถวต่อครั้ง → ไล่ดึงเป็นหน้า

// GET → ทุกรุ่น + ป้าย + แบรนด์ (แท็บ)
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.view");
  if (denied) return denied;

  const admin = supabaseAdmin();
  const [labelsRes, brandsRes] = await Promise.all([
    admin.from("marketing_sku_labels").select("id, name, icon, color, description, sort_order, is_active").order("sort_order").order("name"),
    admin.from("brands").select("id, name, color").eq("is_active", true).order("name"),
  ]);
  if (labelsRes.error || brandsRes.error)
    return NextResponse.json({ data: null, error: "โหลดข้อมูลไม่สำเร็จ: " + (labelsRes.error || brandsRes.error)!.message }, { status: 500 });

  const rows: OverviewRow[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await admin.from("marketing_sku_overview")
      .select("parent_sku_id, code, name_th, cover_image_r2_key, brand_id, label_id, note, marketing_updated_at, sku_total, sku_active")
      .order("code").order("parent_sku_id").range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ data: null, error: "โหลดรายการรุ่นไม่สำเร็จ: " + error.message }, { status: 500 });
    rows.push(...((data ?? []) as OverviewRow[]));
    if (!data || data.length < PAGE) break;
  }

  const items: MarketingSkuItem[] = rows.map((r) => ({
    parent_sku_id: r.parent_sku_id,
    code: r.code ?? "",
    name: r.name_th ?? r.code ?? "",
    image_key: r.cover_image_r2_key,
    brand_id: r.brand_id,
    label_id: r.label_id,
    note: r.note,
    sku_total: Number(r.sku_total) || 0,
    sku_active: Number(r.sku_active) || 0,
    updated_at: r.marketing_updated_at,
  }));
  const usage = new Map<string, number>();
  for (const it of items) if (it.label_id) usage.set(it.label_id, (usage.get(it.label_id) ?? 0) + 1);
  const labels: MarketingSkuLabel[] = ((labelsRes.data ?? []) as MarketingSkuLabel[]).map((l) => ({ ...l, usage_count: usage.get(l.id) ?? 0 }));

  return NextResponse.json({ data: { items, labels, brands: (brandsRes.data ?? []) as MarketingBrand[] }, error: null });
}

// PATCH { parent_sku_ids: string[], label_id?: string|null, note?: string|null } → ติด/เปลี่ยน/ล้างป้าย หรือหมายเหตุ (หลายรุ่นพร้อมกันได้)
export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;

  let body: { parent_sku_ids?: unknown; label_id?: unknown; note?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }
  const ids = cleanIds(body.parent_sku_ids);
  if (ids.length === 0) return NextResponse.json({ data: null, error: "ยังไม่ได้เลือกรุ่น" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("label_id" in body) {
    if (body.label_id !== null && !isUuid(body.label_id)) return NextResponse.json({ data: null, error: "ป้ายไม่ถูกต้อง" }, { status: 400 });
    patch.label_id = body.label_id;
  }
  if ("note" in body) {
    const n = body.note == null ? "" : String(body.note).trim();
    if (n.length > 500) return NextResponse.json({ data: null, error: "หมายเหตุยาวเกิน 500 ตัวอักษร" }, { status: 400 });
    patch.note = n || null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ data: null, error: "ไม่มีอะไรให้แก้" }, { status: 400 });

  const admin = supabaseAdmin();
  if (patch.label_id) {
    const { data: lb } = await admin.from("marketing_sku_labels").select("id").eq("id", patch.label_id as string).maybeSingle();
    if (!lb) return NextResponse.json({ data: null, error: "ไม่พบป้ายที่เลือก (อาจถูกลบไปแล้ว)" }, { status: 400 });
  }
  // กันรหัสมั่ว: ต้องเป็น Parent SKU ที่มีอยู่จริง
  const { data: parents, error: pErr } = await admin.from("parent_skus_v2").select("id").in("id", ids);
  if (pErr) return NextResponse.json({ data: null, error: "ตรวจรุ่นไม่สำเร็จ: " + pErr.message }, { status: 500 });
  const valid = (parents ?? []).map((p) => p.id as string);
  if (valid.length === 0) return NextResponse.json({ data: null, error: "ไม่พบรุ่นที่เลือก" }, { status: 400 });

  const { data: before } = await admin.from("marketing_skus").select("parent_sku_id, label_id, note").in("parent_sku_id", valid);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const now = new Date().toISOString();
  // upsert: รุ่นที่ยังไม่มีแถว → สร้าง · มีแล้ว → อัปเดตเฉพาะช่องที่ส่งมา
  const { error } = await admin.from("marketing_skus")
    .upsert(valid.map((parent_sku_id) => ({ parent_sku_id, ...patch, updated_at: now })), { onConflict: "parent_sku_id" });
  if (error) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 500 });

  await writeAudit(admin, {
    action: "marketing.sku.update", entityType: "marketing_skus", entityId: valid.length === 1 ? valid[0] : null,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { parent_sku_ids: valid, changes: patch, before: before ?? [] },
  });
  return NextResponse.json({ data: { updated: valid.length, skipped: ids.length - valid.length }, error: null });
}
