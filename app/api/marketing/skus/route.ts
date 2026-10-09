import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { cleanIds, isUuid, type MarketingSkuItem, type MarketingSkuLabel, type MarketingBrand, type MarketingSkuVariant } from "@/lib/marketing/sku-list";

export const dynamic = "force-dynamic";

type ParentRow = { id: string; code: string | null; name_th: string | null; cover_image_r2_key: string | null; brand_id: string | null; is_active: boolean | null };
type VariantRow = { parent_sku_id: string; code: string | null; color_th: string | null; color: string | null; is_active: boolean | null; cover_image_r2_key: string | null };
type Row = { id: string; parent_sku_id: string; label_id: string | null; note: string | null; created_at: string; updated_at: string; parent: ParentRow | null };

async function actor(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return { actorId: user?.id ?? null, actorName: user?.email ?? null };
}

// GET → รายการ SKU การตลาด + ป้าย + แบรนด์ (แท็บ)
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.view");
  if (denied) return denied;

  const admin = supabaseAdmin();
  const [itemsRes, labelsRes, brandsRes] = await Promise.all([
    admin.from("marketing_skus")
      .select("id, parent_sku_id, label_id, note, created_at, updated_at, parent:parent_skus_v2(id, code, name_th, cover_image_r2_key, brand_id, is_active)")
      .order("created_at", { ascending: false })
      .limit(5000),
    admin.from("marketing_sku_labels").select("id, name, icon, color, description, sort_order, is_active").order("sort_order").order("name"),
    admin.from("brands").select("id, name, color").eq("is_active", true).order("name"),
  ]);
  const err = itemsRes.error || labelsRes.error || brandsRes.error;
  if (err) return NextResponse.json({ data: null, error: "โหลดรายการไม่สำเร็จ: " + err.message }, { status: 500 });

  const rows = (itemsRes.data ?? []) as unknown as Row[];

  // SKU ย่อย (สี/แบบ) ของทุกรุ่นในรายการ → นับ "SKU ที่เหลือ" (ยังเปิดขาย) · ดึงเป็นก้อนกัน URL ยาวเกิน
  const parentIds = rows.map((r) => r.parent_sku_id);
  const variantsByParent = new Map<string, MarketingSkuVariant[]>();
  for (let i = 0; i < parentIds.length; i += 150) {
    const { data: vs, error: vErr } = await admin.from("skus_v2")
      .select("parent_sku_id, code, color_th, color, is_active, cover_image_r2_key")
      .in("parent_sku_id", parentIds.slice(i, i + 150)).order("code").limit(10000);
    if (vErr) return NextResponse.json({ data: null, error: "โหลด SKU ย่อยไม่สำเร็จ: " + vErr.message }, { status: 500 });
    for (const v of (vs ?? []) as VariantRow[]) {
      const list = variantsByParent.get(v.parent_sku_id) ?? [];
      list.push({ code: v.code ?? "", color: v.color_th || v.color || null, is_active: v.is_active !== false, image_key: v.cover_image_r2_key });
      variantsByParent.set(v.parent_sku_id, list);
    }
  }

  const items: MarketingSkuItem[] = rows.map((r) => ({
    id: r.id,
    parent_sku_id: r.parent_sku_id,
    code: r.parent?.code ?? "",
    name: r.parent?.name_th ?? r.parent?.code ?? "",
    image_key: r.parent?.cover_image_r2_key ?? null,
    brand_id: r.parent?.brand_id ?? null,
    label_id: r.label_id,
    note: r.note,
    is_active: r.parent?.is_active !== false,
    variants: variantsByParent.get(r.parent_sku_id) ?? [],
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
  const usage = new Map<string, number>();
  for (const it of items) if (it.label_id) usage.set(it.label_id, (usage.get(it.label_id) ?? 0) + 1);
  const labels: MarketingSkuLabel[] = ((labelsRes.data ?? []) as MarketingSkuLabel[]).map((l) => ({ ...l, usage_count: usage.get(l.id) ?? 0 }));

  return NextResponse.json({ data: { items, labels, brands: (brandsRes.data ?? []) as MarketingBrand[] }, error: null });
}

// POST { parent_sku_ids: string[], label_id?: string|null } → เพิ่มรุ่นเข้ารายการ (ตัวที่มีอยู่แล้วข้าม)
export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;

  let body: { parent_sku_ids?: unknown; label_id?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }
  const ids = cleanIds(body.parent_sku_ids);
  if (ids.length === 0) return NextResponse.json({ data: null, error: "ยังไม่ได้เลือกสินค้า" }, { status: 400 });
  const label_id = isUuid(body.label_id) ? body.label_id : null;

  const admin = supabaseAdmin();
  if (label_id) {
    const { data: lb } = await admin.from("marketing_sku_labels").select("id").eq("id", label_id).maybeSingle();
    if (!lb) return NextResponse.json({ data: null, error: "ไม่พบป้ายที่เลือก (อาจถูกลบไปแล้ว)" }, { status: 400 });
  }
  const { actorId, actorName } = await actor(request);
  const now = new Date().toISOString();
  const { data, error } = await admin.from("marketing_skus")
    .upsert(ids.map((parent_sku_id) => ({ parent_sku_id, label_id, created_by: actorId, created_at: now, updated_at: now })),
      { onConflict: "parent_sku_id", ignoreDuplicates: true })
    .select("id, parent_sku_id");
  if (error) return NextResponse.json({ data: null, error: "เพิ่มสินค้าไม่สำเร็จ: " + error.message }, { status: 500 });

  const added = data ?? [];
  await writeAudit(admin, {
    action: "marketing.sku.add", entityType: "marketing_skus", entityId: added.length === 1 ? added[0].id : null,
    actorId, actorName, metadata: { parent_sku_ids: added.map((r) => r.parent_sku_id), label_id, skipped: ids.length - added.length },
  });
  return NextResponse.json({ data: { added: added.length, skipped: ids.length - added.length }, error: null });
}

// PATCH { ids: string[], label_id?: string|null, note?: string|null } → เปลี่ยนป้าย/หมายเหตุ (หลายแถวพร้อมกันได้)
export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;

  let body: { ids?: unknown; label_id?: unknown; note?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }
  const ids = cleanIds(body.ids);
  if (ids.length === 0) return NextResponse.json({ data: null, error: "ยังไม่ได้เลือกรายการ" }, { status: 400 });

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
  const { data: before } = await admin.from("marketing_skus").select("id, parent_sku_id, label_id, note").in("id", ids);
  const { error } = await admin.from("marketing_skus").update({ ...patch, updated_at: new Date().toISOString() }).in("id", ids);
  if (error) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 500 });

  const { actorId, actorName } = await actor(request);
  await writeAudit(admin, {
    action: "marketing.sku.update", entityType: "marketing_skus", entityId: ids.length === 1 ? ids[0] : null,
    actorId, actorName, metadata: { ids, changes: patch, before: before ?? [] },
  });
  return NextResponse.json({ data: { updated: before?.length ?? 0 }, error: null });
}

// DELETE ?ids=a,b → เอาออกจากรายการการตลาด (ไม่แตะตัวสินค้า)
export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;

  const ids = cleanIds(new URL(request.url).searchParams.get("ids") ?? "");
  if (ids.length === 0) return NextResponse.json({ data: null, error: "ยังไม่ได้เลือกรายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: before } = await admin.from("marketing_skus").select("id, parent_sku_id, label_id, note").in("id", ids);
  const { error } = await admin.from("marketing_skus").delete().in("id", ids);
  if (error) return NextResponse.json({ data: null, error: "เอาออกไม่สำเร็จ: " + error.message }, { status: 500 });

  const { actorId, actorName } = await actor(request);
  await writeAudit(admin, {
    action: "marketing.sku.remove", entityType: "marketing_skus", entityId: ids.length === 1 ? ids[0] : null,
    actorId, actorName, metadata: { removed: before ?? [] },
  });
  return NextResponse.json({ data: { removed: before?.length ?? 0 }, error: null });
}
