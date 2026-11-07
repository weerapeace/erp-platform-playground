/**
 * Design Sheets — ส่งสินค้าจากใบงาน → ใบเสนอราคา (draft) ของระบบขาย
 *
 * POST /api/design-sheets/[id]/to-quotation
 *   body {
 *     target: "new" | "<quotation_id>",       // สร้างใบร่างใหม่ หรือ เพิ่มเข้าใบร่างเดิม
 *     line: { product_name, variation?, unit_price?, qty? }
 *   }
 *
 * - new: สร้างใบเสนอราคาสถานะ draft พร้อมบรรทัดนี้ 1 รายการ
 * - เดิม: ดึงบรรทัดเดิม + ต่อท้ายบรรทัดใหม่ แล้วอัปเดต (รวมหลายสินค้าใน 1 ใบ)
 * - variation เก็บที่ช่อง note ของบรรทัด · sku ใช้รหัสสินค้าจริงเท่านั้น
 * - ทุกครั้งผูกใบงาน ↔ ใบเสนอราคา ลงตาราง design_sheet_quotations (lib/design-sheet-quotations-db)
 * - new แต่งานนี้ยังมีใบที่เปิดอยู่ (ร่าง/ส่งแล้ว/ตอบรับ) → 409 { duplicate: true } จนกว่าจะส่ง force_new: true
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { duplicateQuoteWarning } from "@/lib/design-sheet-quotations";
import { loadSheetQuotations, linkSheetQuotations } from "@/lib/design-sheet-quotations-db";
import type { QuoteLine, QuoteDetail } from "../../../quotations/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LineIn = { product_name?: string; variation?: string | null; unit_price?: number | null; qty?: number | null; sku?: string | null; product_id?: string | null };
type Body = {
  target?: string;
  customer?: { id?: string; name?: string | null; code?: string | null } | null;
  line?: LineIn;      // ส่งทีละรายการ (เดิม)
  lines?: LineIn[];   // ส่งหลายรายการพร้อมกัน (เช่น ทั้งตารางตีราคาจากร้าน)
  force_new?: boolean; // ยืนยันเปิดใบใหม่ ทั้งที่งานนี้ยังมีใบเสนอราคาที่เปิดอยู่ (ไม่ส่ง = ตอบ 409 ให้ถามก่อน)
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const target = (body.target ?? "new").trim();
  // รับได้ทั้ง 1 รายการ (line) และหลายรายการ (lines) — รวมเป็นชุดเดียวแล้วตรวจทีเดียว
  const inLines: LineIn[] = (Array.isArray(body.lines) && body.lines.length ? body.lines : (body.line ? [body.line] : []))
    .filter((l) => (l?.product_name ?? "").trim());
  if (inLines.length === 0) return NextResponse.json({ error: "ต้องระบุชื่อสินค้า" }, { status: 400 });
  for (const l of inLines) {
    const p = l.unit_price != null ? Number(l.unit_price) : 0;
    if (!Number.isFinite(p) || p < 0) return NextResponse.json({ error: "ราคาต้องเป็นตัวเลขและไม่ติดลบ" }, { status: 400 });
  }
  const name = (inLines[0].product_name ?? "").trim();
  const price = inLines[0].unit_price != null ? Number(inLines[0].unit_price) : 0;

  // ใบเสนอราคาควรโชว์รหัสสินค้าจริงเท่านั้น ไม่เอารหัสใบงาน DS-... ไปออกเอกสาร
  const { data: sheet } = await supabaseAdmin()
    .from("design_sheets")
    .select("code, parent_sku_code")
    .eq("id", id)
    .maybeSingle();
  const productCode = (sheet?.parent_sku_code as string | undefined)?.trim() || null;
  // ถ้าเลือก SKU เจาะจงจากใบงาน (มี sku/product_id) → ใช้รหัสสินค้าจริงนั้น แทนรหัส Parent
  const newLines: QuoteLine[] = inLines.map((l) => ({
    sku: (l.sku ?? "").trim() || productCode,
    product_id: l.product_id ?? null,
    product_name: (l.product_name ?? "").trim(),
    qty: l.qty != null && Number(l.qty) > 0 ? Number(l.qty) : 1,
    unit: "ชิ้น",
    unit_price: l.unit_price != null ? Number(l.unit_price) : 0,
    note: l.variation?.trim() || null,
  }));

  const actor = user?.email ?? null;

  if (target === "new") {
    // ระบบขายบังคับต้องมีลูกค้า (RPC อ้างข้อมูลลูกค้า) — ไม่มี = ไม่ให้สร้าง
    const custId = (body.customer?.id ?? "").trim();
    if (!custId) return NextResponse.json({ error: "ต้องเลือกลูกค้าก่อนสร้างใบเสนอราคาใหม่" }, { status: 400 });
    // กันเปิดใบซ้ำ: งานนี้ยังมีใบที่เปิดอยู่ → ต้องยืนยัน (force_new) ก่อน · เช็กจากฐานข้อมูล ไม่ใช่ตะกร้าในเครื่อง
    if (!body.force_new) {
      const warn = duplicateQuoteWarning(await loadSheetQuotations(supabaseAdmin(), id).catch(() => []));
      if (warn) return NextResponse.json({ error: warn, duplicate: true }, { status: 409 });
    }
    const { data, error } = await client.rpc("erp_playground_quote_create", {
      p_header: { status: "draft", customer_id: custId, customer_name: body.customer?.name ?? null, customer_code: body.customer?.code ?? null },
      p_lines: newLines, p_actor: actor,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await linkSheetQuotations(supabaseAdmin(), [{ design_sheet_id: id, quotation_id: data as string, source: "send", created_by: user?.id ?? null, created_by_name: actor }]);
    await writeAudit(supabaseAdmin(), {
      action: "to_quotation", entityType: "design_sheet", entityId: id,
      actorId: user?.id ?? null, actorName: actor,
      metadata: { quotation_id: data, mode: "new", lines: newLines.length, product_name: name, unit_price: price },
    });
    return NextResponse.json({ quotation_id: data, mode: "new", lines: newLines.length, error: null });
  }

  // ---- เพิ่มเข้าใบเดิม: ดึงบรรทัดเดิม + ต่อท้าย ----
  const { data: detail, error: gErr } = await client.rpc("erp_playground_quote_get", { p_id: target });
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });
  const quote = detail as QuoteDetail | null;
  if (!quote) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });
  if (quote.status !== "draft") return NextResponse.json({ error: "เพิ่มได้เฉพาะใบที่เป็นร่าง (draft) เท่านั้น" }, { status: 400 });

  const lines: QuoteLine[] = [...(quote.lines ?? []).map((l) => ({
    id: l.id, product_id: l.product_id ?? null, sku: l.sku, product_name: l.product_name,
    qty: l.qty, unit: l.unit, unit_price: l.unit_price,
    discount_type: l.discount_type, discount_value: l.discount_value, tax_code: l.tax_code ?? null, note: l.note ?? null,
  })), ...newLines];

  const { data, error } = await client.rpc("erp_playground_quote_update", {
    p_id: target, p_header: null, p_lines: lines, p_actor: actor,   // null = ไม่แก้หัวใบ (ส่ง {} จะไปชนบั๊ก v_cust ในฟังก์ชัน)
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // ผูกใบงานนี้กับใบเดิม (ใบเดียวรวมหลายใบงานได้ — ผูกครบทุกใบงานที่หย่อนเข้ามา)
  await linkSheetQuotations(supabaseAdmin(), [{ design_sheet_id: id, quotation_id: target, source: "send", created_by: user?.id ?? null, created_by_name: actor }]);
  await writeAudit(supabaseAdmin(), {
    action: "to_quotation", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: actor,
    metadata: { quotation_id: target, mode: "append", lines: newLines.length, product_name: name, unit_price: price },
  });
  return NextResponse.json({ quotation_id: data ?? target, mode: "append", lines: newLines.length, error: null });
}
