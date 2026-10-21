/**
 * POST /api/cashflow/assign-company — ตั้งบริษัทให้รายการเงินจากหน้ากระแสเงินสด
 *
 * body: { items: [{ source, docId }], company_id }
 *   ใช้ที่: ตาราง /cashflow (ติ๊กหลายใบ → แก้หลายรายการ → บริษัท) · ป๊อปรายละเอียดการ์ดบน /cashflow/board
 *
 * เขียนบริษัทลง "เอกสารต้นทาง" ตามทะเบียน COMPANY_ASSIGNABLE (ของกลาง lib/cashflow)
 *   ใบซื้อ / บิลจีน / OD / บัตร → เอกสารนั้นตรง ๆ
 *   งวดผ่อน → สัญญาเงินกู้ของงวดนั้น (ทุกงวดของสัญญาเปลี่ยนตาม)
 *   ใบขาย / ใบวางบิล / เงินเดือน / รายการประจำ → ไม่รับ (ต้องแก้ที่หน้าของมันเอง)
 *
 * ความปลอดภัย:
 *  - ต้องมีสิทธิ์ cashflow.manage
 *  - ชื่อตารางมาจากทะเบียนในโค้ด ไม่รับจากผู้ใช้ · บริษัทต้องมีอยู่ในทะเบียนจริง (checkCompanyId)
 *  - audit log ทุกเอกสาร พร้อมบริษัทเดิม → บริษัทใหม่
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditMany } from "@/lib/audit";
import { checkCompanyId } from "@/lib/company-check";
import { COMPANY_ASSIGNABLE, type CashflowSource } from "@/lib/cashflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AssignItem = { source: string; docId: string };
export type AssignResult = { updated: number; unchanged: number; failed: { docId: string; reason: string }[] };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { items?: AssignItem[]; company_id?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 1000);
  if (!items.length) return NextResponse.json({ error: "ไม่มีรายการที่จะตั้งบริษัท" }, { status: 400 });

  const admin = supabaseAdmin();
  const company = await checkCompanyId(admin, body.company_id);
  if ("error" in company) return NextResponse.json({ error: company.error }, { status: 400 });
  if (!company.companyId) return NextResponse.json({ error: "ต้องเลือกบริษัท" }, { status: 400 });
  const companyId = company.companyId;

  const failed: AssignResult["failed"] = [];

  // ---- จัดกลุ่มตามตาราง (งวดผ่อน → แปลงเป็นสัญญาก่อน) ----
  const byTable = new Map<string, { label: string; ids: Set<string> }>();
  const installmentIds: string[] = [];
  for (const it of items) {
    const docId = String(it?.docId ?? "");
    const cfg = COMPANY_ASSIGNABLE[String(it?.source) as CashflowSource];
    if (!cfg) { failed.push({ docId, reason: "รายการชนิดนี้เปลี่ยนบริษัทจากหน้านี้ไม่ได้" }); continue; }
    if (!UUID_RE.test(docId)) { failed.push({ docId, reason: "ไม่พบเอกสาร" }); continue; }
    if (cfg.viaInstallment) { installmentIds.push(docId); continue; }
    const g = byTable.get(cfg.table) ?? { label: cfg.label, ids: new Set<string>() };
    g.ids.add(docId);
    byTable.set(cfg.table, g);
  }
  if (installmentIds.length) {
    const cfg = COMPANY_ASSIGNABLE.loan!;
    const { data: inst } = await admin.from("loan_installments").select("id, loan_contract_id").in("id", installmentIds);
    const found = new Set<string>();
    const g = byTable.get(cfg.table) ?? { label: cfg.label, ids: new Set<string>() };
    for (const r of inst ?? []) {
      found.add(String(r.id));
      if (r.loan_contract_id) g.ids.add(String(r.loan_contract_id));
    }
    if (g.ids.size) byTable.set(cfg.table, g);
    for (const id of installmentIds) if (!found.has(id)) failed.push({ docId: id, reason: "ไม่พบงวดผ่อนนี้" });
  }

  // ---- เขียนทีละตาราง: อ่านค่าเดิมเก็บลงประวัติ แล้วอัปเดตเฉพาะที่เปลี่ยนจริง ----
  const audits: Parameters<typeof writeAuditMany>[1] = [];
  let updated = 0, unchanged = 0;
  for (const [table, g] of byTable) {
    const ids = [...g.ids];
    const { data: before, error: readErr } = await admin.from(table).select("id, company_id").in("id", ids);
    if (readErr) { for (const id of ids) failed.push({ docId: id, reason: readErr.message }); continue; }
    const prev = new Map<string, string | null>();
    for (const r of (before ?? []) as unknown as { id: string; company_id: string | null }[]) prev.set(String(r.id), r.company_id ?? null);

    const toChange = ids.filter((id) => prev.has(id) && prev.get(id) !== companyId);
    unchanged += ids.filter((id) => prev.get(id) === companyId).length;
    for (const id of ids) if (!prev.has(id)) failed.push({ docId: id, reason: "ไม่พบเอกสารในระบบ" });
    if (!toChange.length) continue;

    const { error } = await admin.from(table).update({ company_id: companyId }).in("id", toChange);
    if (error) { for (const id of toChange) failed.push({ docId: id, reason: error.message }); continue; }

    updated += toChange.length;
    for (const id of toChange) {
      audits.push({
        action: "update", entityType: table, entityId: id,
        actorId: user?.id ?? null, actorName: user?.email ?? null,
        metadata: { what: "ตั้งบริษัทจากหน้ากระแสเงินสด", label: g.label, field: "company_id", from: prev.get(id) ?? null, to: companyId },
      });
    }
  }

  if (audits.length) await writeAuditMany(admin, audits);
  return NextResponse.json({ data: { updated, unchanged, failed } satisfies AssignResult, error: null });
}
