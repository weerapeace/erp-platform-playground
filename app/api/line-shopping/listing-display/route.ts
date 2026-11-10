/**
 * เปิด/ปิดขายสินค้าบน LINE จากหน้าสินค้าบนแพลตฟอร์ม — /api/line-shopping/listing-display
 *  POST { listing_ids: string[] (≤200), status: "onsale" | "hide" }  (products.platforms.publish — ส่งขึ้นร้านจริง)
 *   → ทีละ 4 รายการ: POST /products/{id}/display-status/{status} (lib/line-shopping lineSetDisplay)
 *   → สำเร็จ: แก้สำเนา raw.line.isDisplay ในระบบ + ประวัติ (audit) ต่อรายการ
 *  → { ok, updated, failed, results: [{ listing_id, ok, display, error? }] }
 *  ต่างจาก /set-display เดิม (ใช้เลขบนร้านจากร่างของ Parent SKU) — ตัวนี้ใช้เลขของรายการบนร้านโดยตรง (ไม่ต้องจับคู่ก่อน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditMany } from "@/lib/audit";
import { lineSetDisplay } from "@/lib/line-shopping";
import { lineApiKey } from "@/lib/line-shopping-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX = 200;
const POOL = 4;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_ids?: unknown; status?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const status = body.status === "onsale" || body.status === "hide" ? body.status : null;
  const ids = [...new Set((Array.isArray(body.listing_ids) ? body.listing_ids : []).map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (!status || ids.length === 0) return NextResponse.json({ error: "ต้องระบุรายการ + สถานะ (onsale / hide)" }, { status: 400 });
  if (ids.length > MAX) return NextResponse.json({ error: `ทำได้ครั้งละไม่เกิน ${MAX} รายการ` }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", "line_shopping").maybeSingle();
  const lineId = (pf as { id?: string } | null)?.id;
  const { data: rows } = await admin.from("platform_catalog_listings").select("id, platform_id, brand_id, external_product_id, title, raw").in("id", ids);
  type Row = { id: string; platform_id: string; brand_id: string | null; external_product_id: string | null; title: string | null; raw: Record<string, unknown> | null };
  const list = (rows ?? []) as Row[];

  const results: { listing_id: string; ok: boolean; display: boolean | null; error?: string }[] = [];
  const keys = new Map<string, { apiKey: string | null; error: string | null }>();
  const audits: { id: string; title: string | null; ext: string; before: unknown }[] = [];
  for (const id of ids) if (!list.some((r) => r.id === id)) results.push({ listing_id: id, ok: false, display: null, error: "ไม่พบรายการ" });

  const work = list.filter((r) => {
    if (r.platform_id !== lineId) { results.push({ listing_id: r.id, ok: false, display: null, error: "ไม่ใช่สินค้าบน LINE" }); return false; }
    if (!r.external_product_id) { results.push({ listing_id: r.id, ok: false, display: null, error: "ไม่มีเลขสินค้าบน LINE" }); return false; }
    return true;
  });
  for (let i = 0; i < work.length; i += POOL) {
    await Promise.all(work.slice(i, i + POOL).map(async (r) => {
      const bk = r.brand_id ?? "";
      if (!keys.has(bk)) keys.set(bk, await lineApiKey(admin, r.brand_id, r.platform_id));
      const key = keys.get(bk)!;
      if (!key.apiKey) { results.push({ listing_id: r.id, ok: false, display: null, error: key.error ?? "ไม่มีกุญแจร้าน" }); return; }
      const res = await lineSetDisplay(key.apiKey, String(r.external_product_id), status);
      if (!res.ok) { results.push({ listing_id: r.id, ok: false, display: null, error: res.error || `HTTP ${res.status}` }); return; }
      const line = (r.raw?.line && typeof r.raw.line === "object") ? r.raw.line as Record<string, unknown> : {};
      const before = line.isDisplay;
      await admin.from("platform_catalog_listings").update({ raw: { ...(r.raw ?? {}), line: { ...line, isDisplay: status === "onsale" } }, updated_at: new Date().toISOString() }).eq("id", r.id);
      results.push({ listing_id: r.id, ok: true, display: status === "onsale" });
      audits.push({ id: r.id, title: r.title, ext: String(r.external_product_id), before });
    }));
  }
  if (audits.length) {
    await writeAuditMany(admin, audits.map((a) => ({
      action: "update", entityType: "platform_catalog", entityId: a.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { source: "line_listing_display", status, external_product_id: a.ext, title: a.title, before_display: a.before ?? null, bulk: ids.length > 1 },
    })));
  }
  const updated = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: updated === ids.length, updated, failed: ids.length - updated, results, error: updated === ids.length ? null : `ทำไม่สำเร็จ ${ids.length - updated} รายการ` });
}
