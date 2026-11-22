/**
 * 💳 จัดการเครดิตเทอม ลูกค้า / ร้านค้า (หน้า /cashflow/credit-terms — รวม 2 หน้าเดิมเป็นหน้าเดียว 2026-11-22)
 *
 *   GET   ?side=customer|supplier → ทุกรายของฝั่งนั้น + เครดิต · วงเงิน · ระยะส่งของ · ยอดค้าง · ครบกำหนด · ซื้อขายบ่อยแค่ไหน
 *   PATCH { side, items: [{ id, term?, limit?, lead? }] } → แก้หลายรายพร้อมกัน (ส่งเฉพาะช่องที่เปลี่ยน)
 *         คืนค่าเดิม (before) ให้หน้าจอกด "ย้อนกลับ" ได้ · ลง audit ทีละราย changes: auditDiff
 *   PUT   { templates: [{ term, label? }] } → บันทึกเทมเพลตเทอมที่ใช้บ่อย (ใช้ร่วมทั้งบริษัท · app_settings)
 *
 * เก็บที่ partners_v2 (ช่องเดิมทั้งหมด ไม่สร้างใหม่):
 *   ลูกค้า → sales_credit_term (ค่าเก่า payment_terms_days อ่านเป็นค่าสำรอง ไม่แตะ) · ร้านค้า → purchase_credit_term + purchase_lead_time
 *   วงเงิน → credit_limit (ช่องเดียวใช้ทั้งสองฝั่ง)
 *
 * สิทธิ์ (เครดิต/วงเงิน = ข้อมูลอ่อนไหว):
 *   ดู   = cashflow.view · หรือคนที่เคยตั้งเครดิตได้อยู่แล้วตามหน้าเดิม (ร้านค้า: products.edit · ลูกค้า: so.edit)
 *   แก้  = cashflow.manage · หรือ ร้านค้า: products.edit (เดิมตั้งที่ /purchasing/shop-terms) · ลูกค้า: so.edit (เดิมตั้งในใบวางบิล)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan } from "@/lib/api-auth";
import { auditDiff, auditRecordLabel, writeAudit, writeAuditMany, type AuditEntry } from "@/lib/audit";
import { parseCreditTerm, parseLeadTime, salesCreditTermOf } from "@/lib/credit-term";
import { isChinaPartner } from "@/lib/partner-data-check";
import { loadPartnerStats } from "@/lib/partner-insights-server";
import { cleanTemplates, DEFAULT_TERM_TEMPLATES, overLimit, topUsedTerms, type CreditTermTemplate } from "@/lib/partner-insights";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Side = "customer" | "supplier";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreditManageRow = {
  id: string; name: string; code: string | null; logo: string | null; isChina: boolean;
  /** เครดิตตอนนี้ (รูปแบบ lib/credit-term) · null = ยังไม่ตั้ง */
  term: string | null;
  /** ลูกค้า: เครดิตมาจากค่าเก่า (จำนวนวัน) ยังไม่เคยบันทึกช่องใหม่ */
  legacy: boolean;
  limit: number | null;
  lead: string | null;
  docCount: number; lastDate: string | null;
  openDocs: number; openAmount: number; nextDue: string | null; overdueDocs: number; overLimit: boolean;
};
export type CreditManageResponse = {
  rows: CreditManageRow[];
  templates: CreditTermTemplate[];
  /** เครดิตที่ใช้บ่อยในข้อมูลจริง (แนะนำเป็นเทมเพลต) */
  suggested: string[];
  canEdit: boolean;
  error: string | null;
};

async function perms(request: NextRequest, side: Side) {
  const [cfView, cfManage, prodEdit, soEdit] = await Promise.all([
    apiCan(request, "cashflow.view"), apiCan(request, "cashflow.manage"),
    apiCan(request, "products.edit"), apiCan(request, "so.edit"),
  ]);
  const sideEdit = side === "supplier" ? prodEdit : soEdit;
  return { view: cfView || cfManage || sideEdit, edit: cfManage || sideEdit, anyEdit: cfManage || prodEdit || soEdit };
}

const sideOf = (v: unknown): Side => (v === "supplier" ? "supplier" : "customer");
const num = (v: unknown): number | null => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

async function readTemplates(admin: ReturnType<typeof supabaseAdmin>): Promise<CreditTermTemplate[]> {
  const { data } = await admin.from("app_settings").select("credit_term_templates").eq("id", 1).maybeSingle();
  const t = cleanTemplates((data as { credit_term_templates?: unknown } | null)?.credit_term_templates);
  return t.length ? t : DEFAULT_TERM_TEMPLATES;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const side = sideOf(request.nextUrl.searchParams.get("side"));
  const p = await perms(request, side);
  if (!p.view) return NextResponse.json({ error: "ไม่มีสิทธิ์ดูเครดิตเทอม" }, { status: 403 });
  const admin = supabaseAdmin();

  const [{ data: pData, error }, stats, templates] = await Promise.all([
    admin.from("partners_v2")
      .select("id, code, display_name, name_th, name_en, logo_url, is_active, is_customer, is_supplier, is_taobao, shop_country, wechat_id, sale_name, sales_credit_term, payment_terms_days, purchase_credit_term, purchase_lead_time, credit_limit")
      .eq("is_active", true).limit(5000),
    loadPartnerStats(admin),
    readTemplates(admin),
  ]);
  if (error) return NextResponse.json({ rows: [], templates, suggested: [], canEdit: false, error: error.message }, { status: 500 });

  const rows: CreditManageRow[] = [];
  for (const r of (pData ?? []) as Record<string, unknown>[]) {
    const id = String(r.id);
    const st = stats.get(id);
    const sd = side === "supplier" ? st?.buy : st?.sell;
    // ฝั่งลูกค้า = ติดป้ายลูกค้า หรือมีใบขาย · ฝั่งร้าน = ติดป้ายผู้จำหน่าย หรือมีใบซื้อ/สินค้า
    const inSide = side === "supplier"
      ? r.is_supplier === true || (st?.buy.count ?? 0) > 0 || (st?.items ?? 0) > 0
      : r.is_customer === true || (st?.sell.count ?? 0) > 0;
    if (!inSide) continue;
    const term = side === "supplier" ? ((r.purchase_credit_term as string | null) || null) : salesCreditTermOf(r);
    const limit = num(r.credit_limit);
    const openAmount = sd?.open.openAmount ?? 0;
    rows.push({
      id, code: (r.code as string | null) ?? null,
      name: String(r.display_name || r.name_th || r.name_en || r.code || "(ไม่มีชื่อ)"),
      logo: (r.logo_url as string | null) || null,
      isChina: isChinaPartner(r),
      term, legacy: side === "customer" && !r.sales_credit_term && !!term,
      limit, lead: side === "supplier" ? ((r.purchase_lead_time as string | null) || null) : null,
      docCount: sd?.count ?? 0, lastDate: sd?.last ?? null,
      openDocs: sd?.open.openDocs ?? 0, openAmount, nextDue: sd?.open.nextDue ?? null, overdueDocs: sd?.open.overdueDocs ?? 0,
      overLimit: overLimit(openAmount, limit),
    });
  }
  // ซื้อขายบ่อยสุดก่อน (ตั้ง 10 รายแรกก็ครอบคลุมเอกสารส่วนใหญ่) → ยอดค้าง → ชื่อ
  rows.sort((a, b) => b.docCount - a.docCount || b.openAmount - a.openAmount || a.name.localeCompare(b.name, "th"));

  const body: CreditManageResponse = { rows, templates, suggested: topUsedTerms(rows.map((r) => r.term)), canEdit: p.edit, error: null };
  return NextResponse.json(body);
}

type Item = { id?: unknown; term?: unknown; limit?: unknown; lead?: unknown };

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: { side?: unknown; items?: Item[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const side = sideOf(body.side);
  const p = await perms(request, side);
  if (!p.edit) return NextResponse.json({ error: "ไม่มีสิทธิ์แก้เครดิตเทอมฝั่งนี้" }, { status: 403 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 500);
  if (!items.length) return NextResponse.json({ error: "ไม่มีรายการที่จะแก้" }, { status: 400 });

  const termCol = side === "supplier" ? "purchase_credit_term" : "sales_credit_term";
  // ตรวจทุกช่องที่ server ก่อนแตะข้อมูล (หน้าจอเช็กแล้วก็จริง แต่ค่าเพี้ยน = ปฏิทิน/กระแสเงินสดคิดวันไม่ได้)
  const patches: { id: string; patch: Record<string, unknown> }[] = [];
  const failed: { id: string; reason: string }[] = [];
  for (const it of items) {
    const id = typeof it.id === "string" && UUID_RE.test(it.id) ? it.id : null;
    if (!id) { failed.push({ id: String(it.id ?? ""), reason: "รหัสไม่ถูกต้อง" }); continue; }
    const patch: Record<string, unknown> = {};
    if ("term" in it) {
      const t = it.term === null || it.term === "" ? null : String(it.term);
      if (t !== null && !parseCreditTerm(t)) { failed.push({ id, reason: "รูปแบบเครดิตไม่ถูกต้อง" }); continue; }
      patch[termCol] = t;
    }
    if ("limit" in it) {
      const l = num(it.limit);
      if (l !== null && l < 0) { failed.push({ id, reason: "วงเงินติดลบไม่ได้" }); continue; }
      patch.credit_limit = l;
    }
    if ("lead" in it && side === "supplier") {
      const l = it.lead === null || it.lead === "" ? null : String(it.lead);
      if (l !== null && !parseLeadTime(l)) { failed.push({ id, reason: "ระยะส่งของไม่ถูกต้อง" }); continue; }
      patch.purchase_lead_time = l;
    }
    if (Object.keys(patch).length) patches.push({ id, patch });
  }
  if (!patches.length) return NextResponse.json({ data: { updated: 0, failed, before: [] }, error: failed.length ? "ไม่มีรายการที่บันทึกได้" : null });

  const admin = supabaseAdmin();
  const ids = patches.map((x) => x.id);
  const { data: snapRows } = await admin.from("partners_v2")
    .select("id, code, display_name, name_th, sales_credit_term, purchase_credit_term, purchase_lead_time, credit_limit").in("id", ids);
  const snap = new Map(((snapRows ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), r]));

  let updated = 0;
  const before: { id: string; term?: string | null; limit?: number | null; lead?: string | null }[] = [];
  const audits: AuditEntry[] = [];
  for (const { id, patch } of patches) {
    const old = snap.get(id);
    if (!old) { failed.push({ id, reason: "ไม่พบรายนี้" }); continue; }
    const { error } = await admin.from("partners_v2").update(patch).eq("id", id);
    if (error) { failed.push({ id, reason: "บันทึกไม่สำเร็จ" }); continue; }
    updated++;
    const b: (typeof before)[number] = { id };
    if (termCol in patch) b.term = (old[termCol] as string | null) ?? null;
    if ("credit_limit" in patch) b.limit = num(old.credit_limit);
    if ("purchase_lead_time" in patch) b.lead = (old.purchase_lead_time as string | null) ?? null;
    before.push(b);
    const changes = auditDiff(old, patch);
    if (changes.length) audits.push({
      action: "update", entityType: "partners_v2", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { via: "credit-terms", side, changes, ...auditRecordLabel(old) },
    });
  }
  if (audits.length) await writeAuditMany(admin, audits);
  return NextResponse.json({ data: { updated, failed, before }, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const p = await perms(request, "customer");
  if (!p.anyEdit) return NextResponse.json({ error: "ไม่มีสิทธิ์แก้เทมเพลต" }, { status: 403 });
  let body: { templates?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const templates = cleanTemplates(body.templates);
  const admin = supabaseAdmin();
  const old = await readTemplates(admin);
  const { error } = await admin.from("app_settings").update({ credit_term_templates: templates }).eq("id", 1);
  if (error) return NextResponse.json({ error: "บันทึกเทมเพลตไม่สำเร็จ" }, { status: 500 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "update", entityType: "app_settings", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { what: "เทมเพลตเครดิตเทอม", changes: auditDiff({ credit_term_templates: old }, { credit_term_templates: templates }) },
  });
  return NextResponse.json({ data: templates, error: null });
}
