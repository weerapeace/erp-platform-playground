/**
 * "ไม่ต้องจับคู่ตัวนี้" — /api/platform-catalog/ignore  (products.platforms.edit)
 *  POST { listing_ids: string[] (≤500), ignored: boolean, reason?: string }
 *   ignored = true  → ข้าม (ต้องมีเหตุผล) · ตัวที่จับคู่อยู่แล้วข้ามไม่ได้ (ต้องยกเลิกคู่ก่อน) → นับเป็น skipped
 *   ignored = false → เลิกข้าม กลับไปรอจับคู่
 *  → { ok, updated, skipped, results: [{ listing_id, match_ignored, match_ignore_reason, match_ignored_at }] }
 *  audit ทุกตัว (entity_type = platform_catalog): match_ignored เดิม→ใหม่ + เหตุผล
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditMany } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ITEMS = 500;
type Row = { id: string; matched_parent_sku_id: string | null; match_ignored: boolean; match_ignore_reason: string | null; sku_code: string | null; title: string | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_ids?: unknown; ignored?: unknown; reason?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = [...new Set((Array.isArray(body.listing_ids) ? body.listing_ids : []).map((x) => String(x ?? "").trim()).filter(Boolean))];
  const ignored = body.ignored === true;
  const reason = String(body.reason ?? "").trim().slice(0, 200) || null;
  if (ids.length === 0) return NextResponse.json({ error: "ต้องเลือกสินค้าอย่างน้อย 1 รายการ" }, { status: 400 });
  if (ids.length > MAX_ITEMS) return NextResponse.json({ error: `ทำได้ครั้งละไม่เกิน ${MAX_ITEMS} รายการ` }, { status: 400 });
  if (ignored && !reason) return NextResponse.json({ error: "ต้องใส่เหตุผลที่ไม่ต้องจับคู่" }, { status: 400 });

  const admin = supabaseAdmin();
  const before = new Map<string, Row>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("platform_catalog_listings").select("id, matched_parent_sku_id, match_ignored, match_ignore_reason, sku_code, title").in("id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as Row[]) before.set(r.id, r);
  }
  // ข้ามได้เฉพาะตัวที่ยังไม่จับคู่ · เลิกข้ามได้เฉพาะตัวที่ข้ามอยู่
  const todo = ids.filter((id) => {
    const r = before.get(id);
    if (!r) return false;
    return ignored ? !r.matched_parent_sku_id : r.match_ignored;
  });
  const patch = ignored
    ? { match_ignored: true, match_ignore_reason: reason, match_ignored_at: new Date().toISOString() }
    : { match_ignored: false, match_ignore_reason: null, match_ignored_at: null };

  const done: string[] = [];
  for (let i = 0; i < todo.length; i += 200) {
    const chunk = todo.slice(i, i + 200);
    const { error } = await admin.from("platform_catalog_listings").update({ ...patch, updated_at: new Date().toISOString() }).in("id", chunk);
    if (error) {
      if (done.length === 0) return NextResponse.json({ error: error.message }, { status: 400 });
      break;
    }
    done.push(...chunk);
  }

  await writeAuditMany(admin, done.map((id) => {
    const old = before.get(id);
    return {
      action: "update", entityType: "platform_catalog", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: {
        match_ignored: { from: old?.match_ignored ?? false, to: ignored },
        reason: ignored ? reason : null, previous_reason: old?.match_ignore_reason ?? null,
        sku_code: old?.sku_code ?? null, title: old?.title ?? null, source: ids.length > 1 ? "bulk" : "manual",
      },
    };
  }));

  return NextResponse.json({
    ok: true, updated: done.length, skipped: ids.length - done.length,
    results: done.map((id) => ({ listing_id: id, ...patch })),
    error: null,
  });
}
