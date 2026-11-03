import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * POST /api/billing-notes/batch — เลือกใบกำกับหลายลูกค้าทีเดียว → ออกใบวางบิลแยกตามลูกค้า (เจ้าของสั่ง 2026-11-03)
 *   body: { so_ids, bill_date, due_date?, note?, due_by_customer?: { [customer_id]: "YYYY-MM-DD" }, actor? }
 *   จัดกลุ่มที่ server (ตัวจริง): ลูกค้า (แต่ละสาขา = คนละใบ) × บริษัทผู้ขายของเรา (หัวจดหมายต่างกันรวมใบเดียวไม่ได้)
 *   สร้างทุกใบใน transaction เดียว (RPC erp_playground_billing_note_create_batch) — ใบไหนไม่ผ่าน = ไม่สร้างเลยทั้งชุด
 *   คืน { data: [{ id, bill_number, customer_name, grand_total, so_count }] }
 */
type Body = {
  so_ids?: string[];
  bill_date?: string;
  due_date?: string | null;
  note?: string | null;
  due_by_customer?: Record<string, string | null>;
  actor?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SO = 300;

export async function POST(request: NextRequest) {
  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }

  // ตรวจตัวตนก่อนใช้สิทธิ์ระบบอ่านใบขาย (คนนอกห้ามใช้ถามข้อมูล) · สิทธิ์สร้างจริงตรวจซ้ำใน RPC (so.create)
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  const soIds = [...new Set((body.so_ids ?? []).map(String).filter((x) => UUID_RE.test(x)))];
  if (soIds.length === 0) return NextResponse.json({ data: null, error: "เลือกใบกำกับภาษีอย่างน้อย 1 ใบ" }, { status: 400 });
  if (soIds.length > MAX_SO) return NextResponse.json({ data: null, error: `เลือกได้ครั้งละไม่เกิน ${MAX_SO} ใบ` }, { status: 400 });
  const billDate = body.bill_date && DATE_RE.test(body.bill_date) ? body.bill_date : null;
  const dueDate = body.due_date && DATE_RE.test(body.due_date) ? body.due_date : null;

  const { data: sos, error: soErr } = await supabaseAdmin().from("erp_playground_sales_orders")
    .select("id, so_number, customer_id, customer_name, customer_code, company_id").in("id", soIds);
  if (soErr) return NextResponse.json({ data: null, error: soErr.message }, { status: 500 });
  const rows = (sos ?? []) as { id: string; so_number: string | null; customer_id: string | null; customer_name: string | null; customer_code: string | null; company_id: string | null }[];
  if (rows.length !== soIds.length) return NextResponse.json({ data: null, error: "ไม่พบใบกำกับบางใบ — ลองโหลดหน้าใหม่" }, { status: 400 });
  const noCust = rows.filter((r) => !r.customer_id);
  if (noCust.length) {
    return NextResponse.json({ data: null, error: `ใบกำกับไม่มีลูกค้า: ${noCust.map((r) => r.so_number ?? r.id).join(", ")}` }, { status: 400 });
  }

  // จัดกลุ่ม ลูกค้า × บริษัทผู้ขาย · เรียงตามชื่อลูกค้า แล้วเลขที่บิลน้อย→มาก (เลขใบวางบิลรันตามลำดับนี้)
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.customer_id}|${r.company_id ?? ""}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const num = (a: string | null, b: string | null) => String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true });
  const pGroups = [...groups.values()]
    .sort((a, b) => String(a[0].customer_name ?? "").localeCompare(String(b[0].customer_name ?? ""), "th") || num(a[0].so_number, b[0].so_number))
    .map((g) => {
      const first = g[0];
      const due = body.due_by_customer?.[String(first.customer_id)];
      return {
        header: {
          customer_id: first.customer_id, customer_name: first.customer_name, customer_code: first.customer_code,
          bill_date: billDate, due_date: due && DATE_RE.test(due) ? due : dueDate, note: body.note || null,
        },
        so_ids: [...g].sort((a, b) => num(a.so_number, b.so_number)).map((r) => r.id),
      };
    });

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_billing_note_create_batch", {
    p_groups: pGroups, p_actor: body.actor ?? null,
  });
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 });
  return NextResponse.json({ data, error: null });
}
