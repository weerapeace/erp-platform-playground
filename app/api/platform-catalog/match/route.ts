/**
 * จับคู่สินค้าบนแพลตฟอร์มกับสินค้าใน ERP ด้วยมือ — /api/platform-catalog/match  (products.platforms.edit)
 *  POST { listing_id, parent_sku_id }               ตัวเดียว (parent_sku_id ว่าง/null = ยกเลิกจับคู่)
 *  POST { items: [{ listing_id, parent_sku_id }] }   หลายตัวพร้อมกัน ≤500 (ปุ่ม "ยืนยันทั้งหมดที่รหัสตรงกัน")
 *  → { ok, updated, results: [{ listing_id, matched_parent_sku_id, matched_code, matched_name }] }
 *    ตัวเดียวคืน matched_* ที่ระดับบนด้วย (หน้าจอเดิมอ่านแบบนี้)
 *  audit ทุกตัว: คู่เดิม → คู่ใหม่ (source: manual | bulk)
 *  จับคู่ตัวที่กด "ไม่ต้องจับคู่" ไว้ → ล้างสถานะข้ามให้เอง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditMany } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ITEMS = 500;
type Item = { listing_id: string; parent_sku_id: string | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; parent_sku_id?: string | null; items?: { listing_id?: string; parent_sku_id?: string | null }[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const bulk = Array.isArray(body.items);
  const raw = bulk ? body.items ?? [] : [{ listing_id: body.listing_id, parent_sku_id: body.parent_sku_id }];
  const items: Item[] = raw
    .map((it) => ({ listing_id: String(it?.listing_id ?? "").trim(), parent_sku_id: String(it?.parent_sku_id ?? "").trim() || null }))
    .filter((it) => it.listing_id);
  if (items.length === 0) return NextResponse.json({ error: "ต้องระบุ listing_id" }, { status: 400 });
  if (items.length > MAX_ITEMS) return NextResponse.json({ error: `จับคู่ได้ครั้งละไม่เกิน ${MAX_ITEMS} รายการ` }, { status: 400 });

  const admin = supabaseAdmin();
  // ตรวจว่า parent มีจริง + เอา code/name มาโชว์
  const parentIds = [...new Set(items.map((it) => it.parent_sku_id).filter(Boolean) as string[])];
  const pMap = new Map<string, { code: string | null; name: string | null }>();
  for (let i = 0; i < parentIds.length; i += 200) {
    const { data } = await admin.from("parent_skus_v2").select("id, code, name_th").in("id", parentIds.slice(i, i + 200));
    for (const p of (data ?? []) as { id: string; code: string | null; name_th: string | null }[]) pMap.set(p.id, { code: p.code, name: p.name_th });
  }
  if (parentIds.some((id) => !pMap.has(id))) return NextResponse.json({ error: "ไม่พบ Parent SKU ที่เลือก" }, { status: 400 });

  // คู่เดิม (ไว้เก็บประวัติ "เดิม → ใหม่")
  const listingIds = [...new Set(items.map((it) => it.listing_id))];
  const before = new Map<string, { matched_parent_sku_id: string | null; sku_code: string | null; title: string | null }>();
  for (let i = 0; i < listingIds.length; i += 200) {
    const { data } = await admin.from("platform_catalog_listings").select("id, matched_parent_sku_id, sku_code, title").in("id", listingIds.slice(i, i + 200));
    for (const r of (data ?? []) as { id: string; matched_parent_sku_id: string | null; sku_code: string | null; title: string | null }[]) before.set(r.id, r);
  }
  if (!bulk && !before.has(items[0].listing_id)) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });

  const now = new Date().toISOString();
  const results: { listing_id: string; matched_parent_sku_id: string | null; matched_code: string | null; matched_name: string | null }[] = [];
  const errors: string[] = [];
  const todo = items.filter((it) => before.has(it.listing_id));
  for (let i = 0; i < todo.length; i += 20) {
    await Promise.all(todo.slice(i, i + 20).map(async (it) => {
      // จับคู่ตัวที่เคยกด "ไม่ต้องจับคู่" → ล้างสถานะข้ามด้วย (ยกเลิกคู่ไม่แตะ)
      const clearIgnore = it.parent_sku_id ? { match_ignored: false, match_ignore_reason: null, match_ignored_at: null } : {};
      const { error } = await admin.from("platform_catalog_listings").update({ matched_parent_sku_id: it.parent_sku_id, ...clearIgnore, updated_at: now }).eq("id", it.listing_id);
      if (error) { errors.push(error.message); return; }
      const p = it.parent_sku_id ? pMap.get(it.parent_sku_id) : null;
      results.push({ listing_id: it.listing_id, matched_parent_sku_id: it.parent_sku_id, matched_code: p?.code ?? null, matched_name: p?.name ?? null });
    }));
  }
  if (results.length === 0 && errors.length) return NextResponse.json({ error: errors[0] }, { status: 400 });

  await writeAuditMany(admin, results.map((r) => {
    const old = before.get(r.listing_id);
    return {
      action: "update", entityType: "platform_catalog", entityId: r.listing_id, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: {
        manual_match: r.matched_parent_sku_id, from: old?.matched_parent_sku_id ?? null, to: r.matched_parent_sku_id,
        matched_code: r.matched_code, sku_code: old?.sku_code ?? null, title: old?.title ?? null, source: bulk ? "bulk" : "manual",
      },
    };
  }));

  const first = results[0];
  return NextResponse.json({
    ok: true, updated: results.length, results,
    skipped: items.length - todo.length, failed: errors.length,
    ...(bulk ? {} : { matched_parent_sku_id: first?.matched_parent_sku_id ?? null, matched_code: first?.matched_code ?? null, matched_name: first?.matched_name ?? null }),
    error: null,
  });
}
