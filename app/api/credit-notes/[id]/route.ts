/**
 * ใบลดหนี้ — รายละเอียด / แก้ไข (เฉพาะร่าง) / ลบ (เฉพาะร่าง)
 *
 * ⚖️ ใบที่ "ออกเอกสาร" แล้วห้ามแก้และห้ามลบ (เป็นเอกสารภาษี) — ผิดต้องยกเลิกแล้วออกใบใหม่
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { companyHeader, customerHeader } from "@/lib/doc-parties";
import { computeCreditNote, type CreditNoteLine } from "@/lib/credit-note";
import type { CreditNoteDetail } from "../route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

// ---------- GET: รายละเอียด + รายการสินค้า + หัวบิล ----------
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "cn.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();

  const { data, error } = await admin.from("erp_playground_credit_notes").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ data: null, error: "ไม่พบใบลดหนี้" }, { status: 404 });
  const row = data as Record<string, unknown>;

  const { data: lineRows } = await admin.from("erp_playground_credit_note_lines")
    .select("*").eq("credit_note_id", id).order("sort_order", { ascending: true });

  const company = await companyHeader(admin, row.company_id as string | null);
  const customer = await customerHeader(admin, row.customer_id as string | null, {
    customer_name: (row.customer_name as string) ?? "",
    customer_code: (row.customer_code as string) ?? "",
    customer_address: (row.customer_address as string) ?? "",
    customer_phone: (row.customer_phone as string) ?? "",
    customer_tax_id: (row.customer_tax_id as string) ?? "",
  });

  const detail: CreditNoteDetail = {
    id: String(row.id),
    cn_number: (row.cn_number as string) ?? null,
    status: String(row.status ?? "draft"),
    cn_date: String(row.cn_date ?? ""),
    company_id: (row.company_id as string) ?? null,
    company_code: (row.company_code as string) ?? null,
    ref_so_id: (row.ref_so_id as string) ?? null,
    ref_invoice_no: (row.ref_invoice_no as string) ?? null,
    ref_invoice_date: (row.ref_invoice_date as string) ?? null,
    customer_id: (row.customer_id as string) ?? null,
    ...customer,
    original_amount: num(row.original_amount),
    correct_amount: num(row.correct_amount),
    diff_amount: num(row.diff_amount),
    vat_rate: num(row.vat_rate),
    vat_amount: num(row.vat_amount),
    grand_total: num(row.grand_total),
    reason: (row.reason as string) ?? null,
    note: (row.note as string) ?? null,
    cancel_reason: (row.cancel_reason as string) ?? null,
    issued_at: (row.issued_at as string) ?? null,
    created_by: (row.created_by as string) ?? null,
    line_count: (lineRows ?? []).length,
    lines: ((lineRows ?? []) as Record<string, unknown>[]).map(l => ({
      id: String(l.id),
      product_id: (l.product_id as string) ?? null,
      sku: (l.sku as string) ?? null,
      product_name: String(l.product_name ?? ""),
      note: (l.note as string) ?? null,
      unit: (l.unit as string) ?? null,
      unit_price: num(l.unit_price),
      qty_original: num(l.qty_original),
      qty_correct: num(l.qty_correct),
      qty_diff: num(l.qty_diff),
      amount_original: num(l.amount_original),
      amount_correct: num(l.amount_correct),
      amount_diff: num(l.amount_diff),
    })),
    ...(company ?? {}),
  };
  return NextResponse.json({ data: detail, error: null });
}

// ---------- PATCH: แก้ใบร่าง ----------
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "cn.create"); if (denied) return denied;
  const { id } = await params;
  let body: { header?: Record<string, unknown>; lines?: CreditNoteLine[]; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("erp_playground_credit_notes").select("status").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบลดหนี้" }, { status: 404 });
  if ((cur as { status: string }).status !== "draft") {
    return NextResponse.json({ error: "ใบที่ออกเอกสารแล้วแก้ไม่ได้ (เอกสารภาษี) — ต้องยกเลิกแล้วออกใบใหม่" }, { status: 400 });
  }

  const h = body.header ?? {};
  const { rows, totals } = computeCreditNote(body.lines ?? [], num(h.original_amount), num(h.vat_rate ?? 7));

  // เลขที่เอกสารพิมพ์เองได้ (ปล่อยว่าง = ให้ระบบออกให้ตอนกดออกเอกสาร)
  const manualNo = String(h.cn_number ?? "").trim();
  if (manualNo) {
    const { data: dup } = await admin.from("erp_playground_credit_notes")
      .select("id").eq("cn_number", manualNo).neq("id", id).maybeSingle();
    if (dup) return NextResponse.json({ error: `เลขที่ ${manualNo} ถูกใช้กับใบลดหนี้ใบอื่นแล้ว` }, { status: 400 });
  }

  const { error } = await admin.from("erp_playground_credit_notes").update({
    cn_number: manualNo || null,
    company_id: h.company_id || null,
    company_code: h.company_code || null,
    ref_so_id: h.ref_so_id || null,
    ref_invoice_no: String(h.ref_invoice_no ?? "").trim() || null,
    ref_invoice_date: h.ref_invoice_date || null,
    customer_id: h.customer_id || null,
    customer_name: h.customer_name || null,
    customer_code: h.customer_code || null,
    customer_address: h.customer_address || null,
    customer_tax_id: h.customer_tax_id || null,
    customer_phone: h.customer_phone || null,
    vat_rate: num(h.vat_rate ?? 7),
    ...totals,
    reason: h.reason || null,
    note: h.note || null,
    cn_date: h.cn_date || new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // รายการสินค้า: ลบทิ้งแล้วใส่ใหม่ทั้งชุด (ใบร่างเท่านั้น จึงปลอดภัย)
  await admin.from("erp_playground_credit_note_lines").delete().eq("credit_note_id", id);
  if (rows.length) {
    const { error: lineErr } = await admin.from("erp_playground_credit_note_lines").insert(
      rows.map(r => ({
        credit_note_id: id,
        product_id: r.product_id || null, sku: r.sku || null, product_name: r.product_name,
        note: r.note || null, unit: r.unit || null, unit_price: r.unit_price,
        qty_original: r.qty_original, qty_correct: r.qty_correct, qty_diff: r.qty_diff,
        amount_original: r.amount_original, amount_correct: r.amount_correct, amount_diff: r.amount_diff,
        sort_order: r.sort_order,
      })),
    );
    if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });
  }

  await writeAudit(admin, {
    action: "update", entityType: "erp_playground_credit_note", entityId: id, actorName: body.actor ?? null,
    metadata: { ...totals },
  });
  return NextResponse.json({ id, error: null });
}

// ---------- DELETE: ลบใบร่าง ----------
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "cn.create"); if (denied) return denied;
  const { id } = await params;
  const actor = new URL(request.url).searchParams.get("actor");

  const admin = supabaseAdmin();
  const { data: doc } = await admin.from("erp_playground_credit_notes").select("*").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "ไม่พบใบลดหนี้" }, { status: 404 });
  if ((doc as { status: string }).status !== "draft") {
    return NextResponse.json({ error: "ลบได้เฉพาะใบร่าง — ใบที่ออกเอกสารแล้วให้กดยกเลิกแทน" }, { status: 400 });
  }

  const { data: lines } = await admin.from("erp_playground_credit_note_lines").select("*").eq("credit_note_id", id);
  await writeAudit(admin, {
    action: "delete", entityType: "erp_playground_credit_note", entityId: id, actorName: actor,
    metadata: { snapshot: doc, lines: lines ?? [] },
  });

  const { error } = await admin.from("erp_playground_credit_notes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true, error: null });
}
