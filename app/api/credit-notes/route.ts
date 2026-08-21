/**
 * ใบลดหนี้ (Credit Note) — รายการ + สร้างใหม่
 *
 * ใบลดหนี้ = เอกสารที่ออกเมื่อ "ออกใบกำกับภาษีไปแล้ว แต่ยอดต้องลดลง"
 * (ของส่งไม่ครบ / ของชำรุด / ลูกค้าคืนของ / ลดราคาให้ทีหลัง / คิดราคาเกิน)
 *
 * กติกาตัวเลข — ทุกยอดในหัวเอกสารเป็น "ยอดก่อน VAT":
 *   ผลต่าง         = ผลรวมของ (จำนวนเดิม − จำนวนที่ถูกต้อง) × ราคา/หน่วย ของทุกบรรทัด
 *   มูลค่าที่ถูกต้อง = มูลค่าตามเอกสารเดิม − ผลต่าง
 *   VAT            = ผลต่าง × อัตราภาษี   ·   ยอดลดหนี้รวม = ผลต่าง + VAT
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { computeCreditNote, type CreditNoteLine } from "@/lib/credit-note";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export type CreditNoteListItem = {
  id: string;
  cn_number: string | null;
  status: string;
  cn_date: string;
  company_code: string | null;
  ref_invoice_no: string | null;
  ref_invoice_date: string | null;
  customer_name: string | null;
  diff_amount: number;
  vat_amount: number;
  grand_total: number;
  reason: string | null;
  line_count: number;
};

export type CreditNoteDetail = CreditNoteListItem & {
  company_id: string | null;
  ref_so_id: string | null;
  customer_id: string | null;
  customer_code: string | null;
  customer_address: string | null;
  customer_tax_id: string | null;
  customer_phone: string | null;
  original_amount: number;
  correct_amount: number;
  vat_rate: number;
  note: string | null;
  cancel_reason: string | null;
  issued_at: string | null;
  created_by: string | null;
  lines: CreditNoteLine[];
  // เติมให้ตอนดึงรายละเอียด (ใช้ตอนพิมพ์)
  company_name_th?: string;
  company_name_en?: string;
  company_address?: string;
  company_phone?: string;
  company_tax_id?: string;
};

// ---------- GET: รายการ ----------
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "cn.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const limit = Math.min(500, Math.max(1, parseInt(sp.get("limit") ?? "200")));

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_playground_credit_notes")
    .select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = rows.map(r => String(r.id));
  const counts = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ls } = await admin.from("erp_playground_credit_note_lines")
      .select("credit_note_id").in("credit_note_id", ids.slice(i, i + 200));
    for (const l of (ls ?? []) as Record<string, unknown>[]) {
      const k = String(l.credit_note_id);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }

  const list: CreditNoteListItem[] = rows.map(r => ({
    id: String(r.id),
    cn_number: (r.cn_number as string) ?? null,
    status: String(r.status ?? "draft"),
    cn_date: String(r.cn_date ?? ""),
    company_code: (r.company_code as string) ?? null,
    ref_invoice_no: (r.ref_invoice_no as string) ?? null,
    ref_invoice_date: (r.ref_invoice_date as string) ?? null,
    customer_name: (r.customer_name as string) ?? null,
    diff_amount: num(r.diff_amount),
    vat_amount: num(r.vat_amount),
    grand_total: num(r.grand_total),
    reason: (r.reason as string) ?? null,
    line_count: counts.get(String(r.id)) ?? 0,
  }));
  return NextResponse.json({ data: list, error: null });
}

// ---------- POST: สร้างใบร่าง ----------
export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "cn.create"); if (denied) return denied;
  let body: { header?: Record<string, unknown>; lines?: CreditNoteLine[]; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const h = body.header ?? {};
  if (!String(h.ref_invoice_no ?? "").trim()) {
    return NextResponse.json({ error: "ต้องระบุเลขที่ใบกำกับภาษีเดิมที่อ้างอิง" }, { status: 400 });
  }
  const { rows, totals } = computeCreditNote(body.lines ?? [], num(h.original_amount), num(h.vat_rate ?? 7));

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("erp_playground_credit_notes").insert({
    status: "draft",
    company_id: h.company_id || null,
    company_code: h.company_code || null,
    ref_so_id: h.ref_so_id || null,
    ref_invoice_no: String(h.ref_invoice_no).trim(),
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
    created_by: body.actor ?? null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const id = String((data as { id: string }).id);
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
    action: "create", entityType: "erp_playground_credit_note", entityId: id, actorName: body.actor ?? null,
    metadata: { ref_invoice_no: h.ref_invoice_no, ...totals },
  });
  return NextResponse.json({ id, error: null });
}
