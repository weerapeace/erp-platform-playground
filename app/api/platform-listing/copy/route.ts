/**
 * "ลงร้านอื่นจากรายการนี้" — ใช้รายการบนร้านหนึ่งเป็นต้นแบบ ลงสินค้าเดียวกันบนอีกร้าน (เฟส 1: ปลายทาง LINE SHOPPING)
 *
 *  GET  ?listing_id=&target=line_shopping   (products.platforms.view) → { plan } ตารางจับคู่ช่อง (ไม่เขียนอะไร)
 *  POST { listing_id, target, action: "apply", choices? }   (products.platforms.edit)
 *        → เขียนลง "ร่าง" ของร้านปลายทางเท่านั้น (ชื่อ/รายละเอียด/รูป/แบรนด์/น้ำหนัก ตามที่เลือก) → { plan }
 *  POST { listing_id, target, action: "fill_prices", sku_ids? }   (products.platforms.edit + products.edit)
 *        → เติมราคาลง SKU ในระบบ "เฉพาะช่องที่ยังว่าง" จากราคาร้านต้นทาง → { filled, plan }
 *
 * ไม่ส่งอะไรขึ้นร้าน — ลงจริงใช้ตัวสร้างสินค้าเดิมของร้าน (LINE: /api/line-shopping/create-product อ่านร่างนี้)
 * กฎ = lib/listing-copy-map (pure + เทสต์) · โหลด = ./load · ประวัติ (audit) ต่อสินค้า (metadata.parent_sku_id)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit, writeAuditMany } from "@/lib/audit";
import { applyCopyChoices, isCopyTarget, planCopy, priceFills, type CopyChoice, type CopyFieldKey, type CopyPlan } from "@/lib/listing-copy-map";
import { loadCopyContext } from "./load";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };
type Resp = { plan: CopyPlan | null; parent_id?: string; parent_code?: string; filled?: number; error: string | null };
const fail = (error: string, status: number) => NextResponse.json({ plan: null, error } satisfies Resp, { status, headers: NO_STORE });

const CHOICES = new Set<CopyChoice>(["source", "system", "keep"]);
const FIELDS = new Set<CopyFieldKey>(["title", "description", "images", "brand", "weight"]);
function cleanChoices(v: unknown): Partial<Record<CopyFieldKey, CopyChoice>> | null {
  if (!v || typeof v !== "object") return null;
  const out: Partial<Record<CopyFieldKey, CopyChoice>> = {};
  for (const [k, c] of Object.entries(v as Record<string, unknown>)) if (FIELDS.has(k as CopyFieldKey) && CHOICES.has(c as CopyChoice)) out[k as CopyFieldKey] = c as CopyChoice;
  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const listingId = (sp.get("listing_id") ?? "").trim();
  const target = (sp.get("target") ?? "line_shopping").trim();
  if (!listingId) return fail("ต้องระบุรายการต้นทาง", 400);
  if (!isCopyTarget(target)) return fail("ตอนนี้ลงร้านอื่นได้เฉพาะ LINE SHOPPING", 400);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const r = await loadCopyContext(supabaseAdmin(), listingId, target, user?.id ?? null);
  if (!r.ok) return fail(r.error, r.status);
  const plan = planCopy({ target, source: r.ctx.source, system: r.ctx.system, draft: r.ctx.draft });
  return NextResponse.json({ plan, parent_id: r.ctx.parentId, parent_code: r.ctx.parentCode, error: null } satisfies Resp, { headers: NO_STORE });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("อ่านข้อมูลไม่ได้", 400); }
  const listingId = String(body.listing_id ?? "").trim();
  const target = String(body.target ?? "line_shopping").trim();
  const action = body.action === "fill_prices" ? "fill_prices" : "apply";
  if (!listingId) return fail("ต้องระบุรายการต้นทาง", 400);
  if (!isCopyTarget(target)) return fail("ตอนนี้ลงร้านอื่นได้เฉพาะ LINE SHOPPING", 400);
  if (action === "fill_prices") { const d2 = await guardApi(request, "products.edit"); if (d2) return d2; }

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorId = user?.id ?? null; const actorName = user?.email ?? null;
  const admin = supabaseAdmin();
  const r = await loadCopyContext(admin, listingId, target, actorId);
  if (!r.ok) return fail(r.error, r.status);
  const { ctx } = r;
  const from = { platform: ctx.source.platformCode, listing_id: listingId, external_id: ctx.source.externalId };

  // ---------- เติมราคาลงระบบ (เฉพาะช่องที่ว่าง) ----------
  if (action === "fill_prices") {
    const plan0 = planCopy({ target, source: ctx.source, system: ctx.system, draft: ctx.draft });
    const ids = Array.isArray(body.sku_ids) ? (body.sku_ids as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean) : null;
    const fills = priceFills(plan0, ids);
    if (!fills.length) return fail("ไม่มีราคาที่ต้องเติม (ในระบบมีราคาครบแล้ว หรือร้านต้นทางไม่มีราคา)", 400);
    // กันทับ: อ่านค่าล่าสุดอีกรอบ เติมเฉพาะที่ยังว่างจริง
    const { data: cur } = await admin.from("skus_v2").select("id, code, parent_sku_id, fake_price, list_price").in("id", [...new Set(fills.map((f) => f.sku_id))]);
    const curBy = new Map(((cur ?? []) as Record<string, unknown>[]).map((x) => [String(x.id), x]));
    const done: typeof fills = [];
    for (const f of fills) {
      const row = curBy.get(f.sku_id);
      if (!row || String(row.parent_sku_id) !== ctx.parentId || Number(row[f.field]) > 0) continue;
      const { error } = await admin.from("skus_v2").update({ [f.field]: f.price }).eq("id", f.sku_id);
      if (error) return fail(`เติมราคา ${f.code} ไม่สำเร็จ: ${error.message}`, 400);
      done.push(f);
    }
    if (done.length) {
      await writeAuditMany(admin, done.map((f) => ({
        action: "update", entityType: "sku_price", entityId: f.sku_id, actorId, actorName,
        metadata: { field: f.field, old: curBy.get(f.sku_id)?.[f.field] ?? null, new: f.price, source: "copy_listing_price", parent_sku_id: ctx.parentId, sku_code: f.code, from },
      })));
    }
    const again = await loadCopyContext(admin, listingId, target, actorId);
    const plan = again.ok ? planCopy({ target, source: again.ctx.source, system: again.ctx.system, draft: again.ctx.draft }) : null;
    return NextResponse.json({ plan, parent_id: ctx.parentId, parent_code: ctx.parentCode, filled: done.length, error: null } satisfies Resp, { headers: NO_STORE });
  }

  // ---------- เขียนลงร่างของร้านปลายทาง ----------
  if (ctx.draftRow?.platform_product_id) return fail(`สินค้านี้มีบนร้านปลายทางแล้ว (#${String(ctx.draftRow.platform_product_id)}) — ไม่ต้องคัดลอก`, 409);
  const res = applyCopyChoices({ target, source: ctx.source, system: ctx.system, draft: ctx.draft, choices: cleanChoices(body.choices), by: actorName });
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { extra: res.extra, updated_by: actorId, updated_at: now };
  if ("title" in res) patch.title = res.title ?? null;
  if ("description" in res) patch.description = res.description ?? null;
  const q = ctx.draftRow
    ? admin.from("platform_listing_drafts").update(patch).eq("parent_sku_id", ctx.parentId).eq("platform_id", ctx.targetPlatformId)
    : admin.from("platform_listing_drafts").insert({ ...patch, parent_sku_id: ctx.parentId, platform_id: ctx.targetPlatformId, status: "draft", created_by: actorId });
  const { error } = await q;
  if (error) return fail(`บันทึกร่างไม่สำเร็จ: ${error.message}`, 400);

  const before: Record<string, unknown> = { title: ctx.draft.title, description: ctx.draft.description, ...pickExtra(ctx.draft.extra) };
  const after: Record<string, unknown> = { title: "title" in res ? res.title ?? null : ctx.draft.title, description: "description" in res ? res.description ?? null : ctx.draft.description, ...pickExtra(res.extra) };
  await writeAudit(admin, {
    action: "update", entityType: "platform_listing_draft", entityId: null, actorId, actorName,
    metadata: { parent_sku_id: ctx.parentId, platform_id: ctx.targetPlatformId, source: "copy_listing", from, used: res.used, changes: auditDiff(before, after) },
  });
  const draft = { ...ctx.draft, ...("title" in res ? { title: res.title ?? null } : {}), ...("description" in res ? { description: res.description ?? null } : {}), extra: res.extra };
  const plan = planCopy({ target, source: ctx.source, system: ctx.system, draft });
  return NextResponse.json({ plan, parent_id: ctx.parentId, parent_code: ctx.parentCode, error: null } satisfies Resp, { headers: NO_STORE });
}

/** ช่องใน extra ที่การคัดลอกแตะ (จดประวัติแบบอ่านง่าย) */
function pickExtra(extra: Record<string, unknown> | null | undefined) {
  const e = extra ?? {};
  return { line_images: e.line_images ?? null, brand: e.brand ?? null, weight: e.weight ?? null };
}
