/**
 * /api/taobao-products — กล่องพัก "สินค้าจาก Taobao"
 *
 * ของที่เครื่องมือ taobao-catalog ดูดมา (ชื่อจีน/ชื่อไทย/ราคา ¥/ลิงก์/รูป/ตัวเลือก)
 * พักไว้ที่ตาราง taobao_products — ยังไม่เข้า skus_v2 จนกว่าจะกด "จับคู่และเพิ่ม"
 *
 * GET    ?status=new|matched|rejected|all &search= &limit= &offset=  → รายการ + จำนวนแต่ละสถานะ
 * PATCH  {id, status?, note?, translated_name?, price_rmb?, matched_sku_id?, matched_parent_sku_id?, supplier_item_id?}
 * DELETE ?id=...   (ลบจริง — เป็นแค่กล่องพัก ไม่ใช่ข้อมูลหลัก)
 *
 * ของกลาง: guardApi (products.view/edit) · supabaseAdmin · writeAudit
 * การจับคู่ราคาร้านจีน ใช้ API เดิม /api/purchasing/sku-suppliers (ไม่เขียน supplier_items ซ้ำที่นี่)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type TaobaoVariant = { originalName?: string; translatedName?: string };
export type TaobaoCard = {
  id: string;
  original_name: string | null;
  translated_name: string | null;
  price_text: string | null;
  price_rmb: number | null;
  taobao_url: string | null;
  image_url: string | null;
  variants: TaobaoVariant[];
  note: string | null;
  status: "new" | "matched" | "rejected";
  matched_sku_id: string | null;
  matched_parent_sku_id: string | null;
  matched_label: string | null;   // "รหัส · ชื่อ" ของ SKU/Parent ที่จับคู่ไว้ (ไว้โชว์บนการ์ด)
  supplier_item_id: string | null;
  created_at: string | null;
};

const SELECT =
  "id, original_name, translated_name, price_text, price_rmb, taobao_url, image_url, variants, note, status, " +
  "matched_sku_id, matched_parent_sku_id, supplier_item_id, created_at";

const STATUSES = new Set(["new", "matched", "rejected"]);

function shape(r: Record<string, unknown>, labels: Map<string, string>): TaobaoCard {
  const skuId    = r.matched_sku_id ? String(r.matched_sku_id) : null;
  const parentId = r.matched_parent_sku_id ? String(r.matched_parent_sku_id) : null;
  return {
    id: String(r.id),
    original_name:   (r.original_name as string) ?? null,
    translated_name: (r.translated_name as string) ?? null,
    price_text:      (r.price_text as string) ?? null,
    price_rmb:       r.price_rmb == null ? null : Number(r.price_rmb),
    taobao_url:      (r.taobao_url as string) ?? null,
    image_url:       (r.image_url as string) ?? null,
    variants:        Array.isArray(r.variants) ? (r.variants as TaobaoVariant[]) : [],
    note:            (r.note as string) ?? null,
    status:          (STATUSES.has(String(r.status)) ? String(r.status) : "new") as TaobaoCard["status"],
    matched_sku_id:    skuId,
    matched_parent_sku_id: parentId,
    matched_label:   (skuId && labels.get(skuId)) || (parentId && labels.get(parentId)) || null,
    supplier_item_id: r.supplier_item_id ? String(r.supplier_item_id) : null,
    created_at:      (r.created_at as string) ?? null,
  };
}

// ── GET — รายการการ์ด + จำนวนแต่ละสถานะ ──
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const sp     = new URL(request.url).searchParams;
  const status = sp.get("status") ?? "new";
  const search = (sp.get("search") ?? "").trim();
  const limit  = Math.min(Number(sp.get("limit")) || 60, 200);
  const offset = Number(sp.get("offset")) || 0;
  const admin  = supabaseAdmin();

  let q = admin.from("taobao_products").select(SELECT, { count: "exact" });
  if (STATUSES.has(status)) q = q.eq("status", status);
  if (search) {
    const s = search.replace(/[,()%*]/g, " ").trim();
    q = q.or(`translated_name.ilike.%${s}%,original_name.ilike.%${s}%,taobao_url.ilike.%${s}%`);
  }

  const [listRes, countRes] = await Promise.all([
    q.order("created_at", { ascending: false }).range(offset, offset + limit - 1),
    admin.from("taobao_products").select("status"),   // นับแยกสถานะ (ตารางพัก ข้อมูลไม่เยอะ)
  ]);
  if (listRes.error) return NextResponse.json({ data: [], error: listRes.error.message }, { status: 500 });

  const rows = (listRes.data ?? []) as unknown as Record<string, unknown>[];

  // ชื่อ SKU/Parent ที่จับคู่ไว้ — ดึงรอบเดียว (ไว้โชว์บนการ์ด)
  const skuIds    = [...new Set(rows.map((r) => r.matched_sku_id).filter(Boolean).map(String))];
  const parentIds = [...new Set(rows.map((r) => r.matched_parent_sku_id).filter(Boolean).map(String))];
  const labels = new Map<string, string>();
  await Promise.all([
    skuIds.length
      ? admin.from("skus_v2").select("id, code, name").in("id", skuIds).then(({ data }) => {
          for (const s of (data ?? []) as Record<string, unknown>[]) labels.set(String(s.id), `${s.code ?? ""} · ${s.name ?? ""}`.trim());
        })
      : Promise.resolve(),
    parentIds.length
      ? admin.from("parent_skus_v2").select("id, code, name").in("id", parentIds).then(({ data }) => {
          for (const s of (data ?? []) as Record<string, unknown>[]) labels.set(String(s.id), `${s.code ?? ""} · ${s.name ?? ""}`.trim());
        })
      : Promise.resolve(),
  ]);

  const counts = { new: 0, matched: 0, rejected: 0 };
  for (const r of (countRes.data ?? []) as { status: string }[]) {
    if (r.status === "new" || r.status === "matched" || r.status === "rejected") counts[r.status]++;
  }

  return NextResponse.json({
    data: rows.map((r) => shape(r, labels)),
    total: listRes.count ?? rows.length,
    counts,
    error: null,
  });
}

// ── PATCH — แก้รายการในกล่องพัก (สถานะ / โน้ต / ชื่อไทย / ราคา / ผลจับคู่) ──
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // รับได้ทั้ง id เดี่ยว และ ids หลายตัว (bulk ตีตก/กู้คืน)
  const ids = Array.isArray(b.ids) ? b.ids.map(String).filter(Boolean)
            : typeof b.id === "string" ? [b.id] : [];
  if (ids.length === 0) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.status === "string") {
    if (!STATUSES.has(b.status)) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    patch.status = b.status;
    if (b.status === "matched") { patch.matched_at = new Date().toISOString(); patch.matched_by = user?.email ?? null; }
    if (b.status === "new")     { patch.matched_at = null; patch.matched_by = null; patch.matched_sku_id = null; patch.matched_parent_sku_id = null; patch.supplier_item_id = null; }
  }
  if ("note" in b)            patch.note            = typeof b.note === "string" ? b.note : null;
  if ("translated_name" in b) patch.translated_name = typeof b.translated_name === "string" ? b.translated_name : null;
  if ("price_rmb" in b)       patch.price_rmb       = b.price_rmb === "" || b.price_rmb == null ? null : Number(b.price_rmb);
  if ("matched_sku_id" in b)        patch.matched_sku_id        = typeof b.matched_sku_id === "string" ? b.matched_sku_id : null;
  if ("matched_parent_sku_id" in b) patch.matched_parent_sku_id = typeof b.matched_parent_sku_id === "string" ? b.matched_parent_sku_id : null;
  if ("supplier_item_id" in b)      patch.supplier_item_id      = typeof b.supplier_item_id === "string" ? b.supplier_item_id : null;

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("taobao_products").update(patch).in("id", ids).select(SELECT);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(admin, {
    action: "update", entityType: "taobao_products", entityId: ids[0],
    actorId: user?.id, actorName: user?.user_metadata?.name as string | undefined,
    metadata: { ids, changes: patch },
  });

  const labels = new Map<string, string>();
  return NextResponse.json({ data: ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => shape(r, labels)), error: null });
}

// ── DELETE — ลบออกจากกล่องพัก ──
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  const sp  = new URL(request.url).searchParams;
  const ids = (sp.get("ids") ?? sp.get("id") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("taobao_products").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, {
    action: "delete", entityType: "taobao_products", entityId: ids[0],
    actorId: user?.id, actorName: user?.user_metadata?.name as string | undefined, metadata: { ids },
  });
  return NextResponse.json({ data: { ids }, error: null });
}
