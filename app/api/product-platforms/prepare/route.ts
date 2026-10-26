/**
 * 📤 เตรียมลงสินค้า (บันทึกร่าง + ตรวจความครบ) หลายสินค้าพร้อมกัน — ไม่ส่งอะไรไปที่ร้าน
 * POST { platform_code, parent_sku_ids[] (≤200), price_rule?: {mode:'same'|'pct', pct}, overwrite?: boolean }
 *   → { results: [{ parent_sku_id, code, result: created|updated|skipped_listed|not_found, ready, blockers }], summary }
 *
 * - ข้ามสินค้าที่ลงบนร้านนั้นแล้ว (มีรหัสบนร้าน)
 * - มีร่างอยู่แล้ว: ค่าเริ่มต้นเติมเฉพาะช่องที่ยังว่าง · overwrite=true = ทับด้วยค่าจาก ERP
 * - เก็บผลตรวจไว้ใน platform_listing_drafts.validation · ประวัติ (audit) ต่อสินค้า (metadata.parent_sku_id)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAuditMany } from "@/lib/audit";
import { loadListingContexts } from "@/lib/product-listing-context";
import { prepareDraft, normalizePriceRule, type DraftLite } from "@/lib/platform-listing-builder";
import { loadPlatformByCode } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MAX = 200;

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const platform = await loadPlatformByCode(admin, body.platform_code);
  if (!platform) return NextResponse.json({ error: "ไม่พบแพลตฟอร์ม (หรือปิดใช้งานอยู่)" }, { status: 400 });
  const ids = Array.isArray(body.parent_sku_ids)
    ? [...new Set((body.parent_sku_ids as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean))] : [];
  if (!ids.length) return NextResponse.json({ error: "ยังไม่ได้เลือกสินค้า" }, { status: 400 });
  if (ids.length > MAX) return NextResponse.json({ error: `เตรียมได้ครั้งละไม่เกิน ${MAX} สินค้า` }, { status: 400 });
  const rule = normalizePriceRule(body.price_rule);
  const overwrite = body.overwrite === true;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = user?.email ?? null;
  const now = new Date().toISOString();
  const items = await loadListingContexts(admin, ids, platform.id);
  const byId = new Map(items.map((it) => [String(it.parent.id), it]));

  type Result = { parent_sku_id: string; code: string; result: "created" | "updated" | "skipped_listed" | "not_found" | "failed"; ready: boolean; blockers: string[]; error?: string };
  const results: Result[] = [];
  const rows: Record<string, unknown>[] = [];
  for (const id of ids) {
    const it = byId.get(id);
    if (!it) { results.push({ parent_sku_id: id, code: "", result: "not_found", ready: false, blockers: [] }); continue; }
    const d = it.draft as Record<string, unknown> | null;
    const code = String(it.parent.code ?? "");
    if (d?.platform_product_id) { results.push({ parent_sku_id: id, code, result: "skipped_listed", ready: true, blockers: [] }); continue; }
    const p = prepareDraft({
      platformCode: platform.code, parent: it.parent, variants: it.variants, imageKeys: it.images.map((i) => i.key),
      platformCategory: it.platformCategory, existing: d as DraftLite | null, rule, overwrite, preparedBy: actor, now,
    });
    rows.push({
      parent_sku_id: id, platform_id: platform.id, ...p.fields,
      validation: { platform: platform.code, checked_at: now, ready: p.ready, blockers: p.blockers, checks: p.checks },
      updated_by: user?.id ?? null, updated_at: now,
      ...(d ? {} : { created_by: user?.id ?? null }),
    });
    results.push({ parent_sku_id: id, code, result: d ? "updated" : "created", ready: p.ready, blockers: p.blockers });
  }

  // บันทึกเป็นชุด — ร่างใหม่กับร่างเดิมมีช่องไม่เท่ากัน (created_by) แยกก้อนกัน
  const fresh = rows.filter((r) => "created_by" in r), old = rows.filter((r) => !("created_by" in r));
  for (const group of [fresh, old]) {
    for (let i = 0; i < group.length; i += 100) {
      const part = group.slice(i, i + 100);
      const { error } = await admin.from("platform_listing_drafts").upsert(part, { onConflict: "parent_sku_id,platform_id" });
      if (error) {
        const failed = new Set(part.map((r) => String(r.parent_sku_id)));
        for (const r of results) if (failed.has(r.parent_sku_id)) { r.result = "failed"; r.error = "บันทึกร่างไม่สำเร็จ"; }
      }
    }
  }

  const done = results.filter((r) => r.result === "created" || r.result === "updated");
  await writeAuditMany(admin, done.map((r) => ({
    action: "prepare_listing", entityType: "platform_listing_draft", entityId: null,
    actorId: user?.id ?? null, actorName: actor,
    metadata: { parent_sku_id: r.parent_sku_id, platform: platform.code, result: r.result, ready: r.ready, blockers: r.blockers, price_rule: rule, overwrite },
  })));

  const summary = {
    created: results.filter((r) => r.result === "created").length,
    updated: results.filter((r) => r.result === "updated").length,
    skipped_listed: results.filter((r) => r.result === "skipped_listed").length,
    failed: results.filter((r) => r.result === "failed" || r.result === "not_found").length,
    ready: done.filter((r) => r.ready).length,
    not_ready: done.filter((r) => !r.ready).length,
  };
  return NextResponse.json({ results, summary, error: null });
}
