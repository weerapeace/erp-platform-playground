/**
 * ใบลดหนี้ — เปลี่ยนสถานะ
 *   issue  = ออกเอกสาร (ร่าง → ออกแล้ว) · ได้เลขที่จริงจากชุดเลขของบริษัทนั้น · หลังจากนี้แก้ไม่ได้
 *   cancel = ยกเลิก (ออกแล้ว → ยกเลิก) · เอกสารภาษีลบไม่ได้ ต้องเก็บเลขไว้ให้ตรวจสอบได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { validateBeforeIssue } from "@/lib/credit-note";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { action?: string; reason?: string; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "");

  // ออกเอกสาร = สิทธิ์สร้าง · ยกเลิก = สิทธิ์ยกเลิก (เจ้าของกำหนดให้ admin + ผู้จัดการ)
  const denied = await guardApi(request, action === "cancel" ? "cn.cancel" : "cn.create");
  if (denied) return denied;

  const admin = supabaseAdmin();
  const { data: doc } = await admin.from("erp_playground_credit_notes").select("*").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "ไม่พบใบลดหนี้" }, { status: 404 });
  const row = doc as Record<string, unknown>;
  const status = String(row.status ?? "draft");

  if (action === "issue") {
    if (status !== "draft") return NextResponse.json({ error: "ออกเอกสารได้เฉพาะใบร่าง" }, { status: 400 });

    const problem = validateBeforeIssue({
      ref_invoice_no: row.ref_invoice_no as string,
      reason: row.reason as string,
      diff_amount: num(row.diff_amount),
      original_amount: num(row.original_amount),
    });
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    // เลขที่เอกสาร:
    //   พิมพ์เลขเองไว้แล้ว → ใช้เลขนั้น (ตัวนับไม่ขยับ)
    //   ไม่ได้พิมพ์          → ออกจากชุดเลข 'cn' (CN-{ปี}-{เดือน}-{ลำดับ} เริ่ม 001 ใหม่ทุกเดือน)
    // ⚠️ ถ้าเลขที่ออกได้ชนกับใบที่พิมพ์เลขเองไว้ ให้ขยับไปเลขถัดไป (กันเลขซ้ำในเอกสารภาษี)
    let cnNumber = String(row.cn_number ?? "").trim() || null;
    if (!cnNumber) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const { data: n, error: numErr } = await admin.rpc("erp_next_number", { p_key: "cn", p_branch: null });
        if (numErr || !n) {
          return NextResponse.json({ error: `ออกเลขเอกสารไม่สำเร็จ — ตรวจกฎเลขที่ "cn" (${numErr?.message ?? "ไม่มีกฎ"})` }, { status: 500 });
        }
        const candidate = String(n);
        const { data: dup } = await admin.from("erp_playground_credit_notes")
          .select("id").eq("cn_number", candidate).maybeSingle();
        if (!dup) { cnNumber = candidate; break; }
      }
      if (!cnNumber) return NextResponse.json({ error: "ออกเลขเอกสารไม่สำเร็จ — เลขชนกับใบเดิมหลายครั้ง ตรวจตัวนับเลขที่ตั้งค่าระบบ" }, { status: 500 });
    } else {
      const { data: dup } = await admin.from("erp_playground_credit_notes")
        .select("id").eq("cn_number", cnNumber).neq("id", id).maybeSingle();
      if (dup) return NextResponse.json({ error: `เลขที่ ${cnNumber} ถูกใช้กับใบลดหนี้ใบอื่นแล้ว` }, { status: 400 });
    }

    const { error } = await admin.from("erp_playground_credit_notes").update({
      status: "issued", cn_number: cnNumber, issued_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit(admin, {
      action: "issue", entityType: "erp_playground_credit_note", entityId: id, actorName: body.actor ?? null,
      metadata: { cn_number: cnNumber, ref_invoice_no: row.ref_invoice_no, grand_total: num(row.grand_total) },
    });
    return NextResponse.json({ status: "issued", cn_number: cnNumber, error: null });
  }

  if (action === "cancel") {
    if (status === "cancelled") return NextResponse.json({ error: "ใบนี้ยกเลิกไปแล้ว" }, { status: 400 });
    const reason = String(body.reason ?? "").trim();
    if (!reason) return NextResponse.json({ error: "ต้องระบุเหตุผลที่ยกเลิก" }, { status: 400 });

    const { error } = await admin.from("erp_playground_credit_notes").update({
      status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: reason, updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit(admin, {
      action: "cancel", entityType: "erp_playground_credit_note", entityId: id, actorName: body.actor ?? null,
      metadata: { cn_number: row.cn_number, reason },
    });
    return NextResponse.json({ status: "cancelled", error: null });
  }

  return NextResponse.json({ error: `ไม่รู้จักคำสั่ง ${action}` }, { status: 400 });
}
