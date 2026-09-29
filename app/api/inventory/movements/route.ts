import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export type StockMovement = {
  id:                 string;
  movement_number:    string | null;
  movement_type:      "in" | "out" | "transfer" | "adjust";
  movement_date:      string;
  product_id:         string;
  product_sku:        string | null;
  product_name:       string;
  from_warehouse_id:  string | null;
  from_warehouse_code: string | null;
  to_warehouse_id:    string | null;
  to_warehouse_code:  string | null;
  qty:                number;
  unit:               string;
  unit_cost:          number;
  total_cost:         number;
  reference_type:     string | null;
  reference_id:       string | null;
  reference_label:    string | null;
  performed_by:       string | null;
  note:               string | null;
  created_at:         string;
  total_count:        number;
};

export type MovementsResponse = { data: StockMovement[]; total: number; error: string | null };

// ---- GET ?type=&warehouse_id=&product_id=&search= ----
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_stock_movements_list", {
    p_search:        searchParams.get("search") || null,
    p_movement_type: searchParams.get("type") || null,
    p_warehouse_id:  searchParams.get("warehouse_id") || null,
    p_product_id:    searchParams.get("product_id") || null,
    p_limit:         Math.min(500, parseInt(searchParams.get("limit") ?? "200")),
    p_offset:        Math.max(0, parseInt(searchParams.get("offset") ?? "0")),
  });
  if (error) return NextResponse.json({ data: [], total: 0, error: error.message } satisfies MovementsResponse, { status: 500 });
  const rows = (data as StockMovement[]) ?? [];
  return NextResponse.json({ data: rows, total: Number(rows[0]?.total_count ?? 0), error: null } satisfies MovementsResponse);
}

// ---- POST create movement ----
type CreateBody = {
  movement_type: "in" | "out" | "transfer" | "adjust";
  movement_date?: string;
  product_id: string;
  from_warehouse_id?: string | null;
  to_warehouse_id?:   string | null;
  qty: number;
  unit_cost?: number;
  reference_type?: string;
  reference_id?: string;
  reference_label?: string;
  note?: string;
  actor?: string;
};

/**
 * ↩ กลับรายการที่ลงผิด — POST { action: "reverse", id, actor? }
 * สต๊อกเป็นสมุดบัญชี: ห้ามแก้/ลบประวัติ → ลงรายการตรงข้ามแทน (รับเข้า ↔ เบิกออก · โอน ↔ โอนกลับ)
 * ทำได้เฉพาะรายการที่ "ลงมือเอง" จากหน้านี้ (ไม่มีเอกสารอ้างอิง)
 * รายการที่มาจากใบรับของ / ใบสั่งผลิต / ใบนับสต๊อก ต้องแก้ที่เอกสารต้นทาง ไม่งั้นยอดในเอกสารกับสต๊อกจะไม่ตรงกัน
 */
async function reverseMovement(request: NextRequest, id: string, actor: string | null) {
  const denied = await guardApi(request, "stock.create"); if (denied) return denied;
  const admin = supabaseAdmin();

  const { data: m } = await admin.from("erp_playground_stock_movements")
    .select("id, movement_number, movement_type, product_id, from_warehouse_id, to_warehouse_id, from_warehouse_code, to_warehouse_code, qty, unit_cost, reference_type")
    .eq("id", id).maybeSingle();
  if (!m) return NextResponse.json({ error: "ไม่พบรายการเคลื่อนไหวนี้" }, { status: 404 });

  if (m.reference_type === "reversal") return NextResponse.json({ error: "รายการนี้เป็นรายการกลับอยู่แล้ว — ถ้ากลับผิด ให้ลงรายการใหม่แทน" }, { status: 400 });
  if (m.reference_type) return NextResponse.json({ error: "รายการนี้มาจากเอกสารอื่น (ใบรับของ / ใบสั่งผลิต / ใบนับสต๊อก) — ต้องแก้ที่เอกสารต้นทาง ไม่งั้นยอดจะไม่ตรงกัน" }, { status: 400 });
  if (m.movement_type === "adjust") return NextResponse.json({ error: "รายการ “ปรับยอด” กลับอัตโนมัติไม่ได้ (เป็นการตั้งยอดใหม่ ไม่ใช่บวก/ลบ) — ให้กด “ปรับยอด” อีกครั้งแล้วใส่ยอดที่ถูก" }, { status: 400 });

  const { data: done } = await admin.from("erp_playground_stock_movements")
    .select("movement_number").eq("reference_type", "reversal").eq("reference_id", id).limit(1);
  if (done && done.length > 0) return NextResponse.json({ error: `รายการนี้ถูกกลับไปแล้ว (${done[0].movement_number ?? "-"})` }, { status: 400 });

  const qty = Number(m.qty) || 0;
  // คลังที่ของจะ "ออก" ตอนกลับรายการ = คลังที่ของเคยเข้า → ต้องมีของเหลือพอ ไม่งั้นยอดติดลบ
  const takeFrom: string | null = m.movement_type === "out" ? null : (m.to_warehouse_id as string | null);
  if (takeFrom) {
    const { data: bal } = await admin.from("erp_playground_stock_balances")
      .select("qty_on_hand").eq("product_id", m.product_id).eq("warehouse_id", takeFrom).maybeSingle();
    const onHand = Number(bal?.qty_on_hand ?? 0);
    if (onHand < qty) {
      return NextResponse.json({ error: `กลับรายการไม่ได้ — คลัง ${m.to_warehouse_code ?? ""} เหลือของ ${onHand} แต่ต้องเอาออก ${qty} (ของถูกใช้/ย้ายไปแล้ว)` }, { status: 400 });
    }
  }

  const type = m.movement_type === "in" ? "out" : m.movement_type === "out" ? "in" : "transfer";
  const from = m.movement_type === "in" ? m.to_warehouse_id : m.movement_type === "out" ? null : m.to_warehouse_id;
  const to   = m.movement_type === "in" ? null : m.from_warehouse_id;

  // ยิงผ่านสิทธิ์ของผู้ใช้ (ฟังก์ชันใน DB เช็ก stock.create ซ้ำ + ลงประวัติให้เอง)
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_stock_movement_create", {
    p_movement_type:     type,
    p_movement_date:     null,
    p_product_id:        m.product_id,
    p_from_warehouse_id: from,
    p_to_warehouse_id:   to,
    p_qty:               qty,
    p_unit_cost:         Number(m.unit_cost) || 0,
    p_reference_type:    "reversal",
    p_reference_id:      m.id,
    p_reference_label:   `กลับรายการ ${m.movement_number ?? ""}`.trim(),
    p_note:              `กลับรายการ ${m.movement_number ?? ""} ที่ลงผิด`.trim(),
    p_actor:             actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data, error: null });
}

export async function POST(request: NextRequest) {
  let body: CreateBody & { action?: string; id?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (body.action === "reverse") {
    if (!body.id) return NextResponse.json({ error: "ต้องระบุรายการที่จะกลับ" }, { status: 400 });
    return reverseMovement(request, String(body.id), body.actor ?? null);
  }
  if (!body.movement_type || !body.product_id || !body.qty) {
    return NextResponse.json({ error: "movement_type, product_id, qty จำเป็น" }, { status: 400 });
  }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_stock_movement_create", {
    p_movement_type:    body.movement_type,
    p_movement_date:    body.movement_date ?? null,
    p_product_id:       body.product_id,
    p_from_warehouse_id: body.from_warehouse_id ?? null,
    p_to_warehouse_id:   body.to_warehouse_id ?? null,
    p_qty:              body.qty,
    p_unit_cost:        body.unit_cost ?? 0,
    p_reference_type:   body.reference_type ?? null,
    p_reference_id:     body.reference_id ?? null,
    p_reference_label:  body.reference_label ?? null,
    p_note:             body.note ?? null,
    p_actor:            body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
