/**
 * ใบรับชำระจากลูกค้า — "ลูกค้าจ่ายเงินมาแล้ว"
 *
 *   GET    ?status=&from=&to=&customer_id=   → รายการใบรับชำระ (พร้อมบรรทัดที่ตัดยอด)
 *   GET    ?open_docs=1&customer_id=         → ใบขาย/ใบวางบิลที่ยังค้างรับของลูกค้ารายนั้น (ใช้ตอนสร้างใบ)
 *   POST   { customer_id, amount, lines[] }  → สร้างใบ + ตัดยอดค้างรับ
 *   PATCH  { id, ... }                       → แก้ใบ (ยกเลิกใช้ status: "cancelled")
 *
 * ทำไมต้องมี: ก่อนหน้านี้ระบบไม่มีที่บันทึกว่าเก็บเงินได้แล้ว ใบขายทุกใบเลยค้างรับเต็มจำนวนตลอดกาล
 * ทำให้หน้ากระแสเงินสดบอกได้แค่ "ประมาณการ" — ใบรับชำระคือสิ่งที่เปลี่ยนมันเป็นตัวเลขจริง
 *
 * หลักการสำคัญ: ยอดค้างรับ (amount_due) ของใบขาย/ใบวางบิล **คำนวณใหม่จากใบรับชำระเสมอ**
 * ไม่ใช่บวก/ลบทีละครั้ง — แก้ใบหรือยกเลิกกี่รอบยอดก็ไม่เพี้ยน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi, apiCan } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { SO_ACTIVE_STATUSES } from "@/lib/so-status";
import { isReceiptPaid, outstanding, settledAmount, validateAllocation } from "@/lib/receipts";
import { todayISO } from "@/lib/cashflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS = new Set(["transfer", "cash", "cheque", "card", "other"]);

export type ReceiptLine = {
  id?: string;
  so_id: string | null;
  so_number: string | null;
  billing_note_id: string | null;
  bill_number: string | null;
  amount: number;
  note: string | null;
  sort_order: number;
};

export type Receipt = {
  id: string;
  receipt_no: string;
  receipt_date: string;
  customer_id: string | null;
  customer_name: string | null;
  amount: number;
  wht_amount: number;
  fee_amount: number;
  method: string;
  bank_account: string | null;
  reference_no: string | null;
  status: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  lines: ReceiptLine[];
};

/** ใบขาย/ใบวางบิลที่ยังเก็บเงินไม่ครบ — ใช้เลือกตอนสร้างใบรับชำระ */
export type OpenDoc = {
  kind: "so" | "bn";
  id: string;
  number: string;
  date: string;
  customer_id: string | null;
  customer_name: string;
  grand_total: number;
  paid: number;
  outstanding: number;
};

const str = (v: unknown) => (v == null ? "" : String(v)).trim();
const money = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const uuidOrNull = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : null);

type Admin = ReturnType<typeof supabaseAdmin>;

// ============================================================
// คำนวณยอดค้างรับใหม่ (idempotent — รันซ้ำกี่รอบผลเท่าเดิม)
// ============================================================
async function recomputeDocs(admin: Admin, soIds: string[], bnIds: string[]): Promise<void> {
  const uniqSo = [...new Set(soIds.filter(Boolean))];
  const uniqBn = [...new Set(bnIds.filter(Boolean))];
  if (!uniqSo.length && !uniqBn.length) return;

  // ดึงบรรทัดรับชำระ "ทุกใบ" ที่แตะเอกสารเหล่านี้ แล้วนับเฉพาะใบที่รับเงินแล้ว
  const [soLineRes, bnLineRes] = await Promise.all([
    uniqSo.length
      ? admin.from("customer_receipt_lines").select("so_id, amount, receipt_id").in("so_id", uniqSo).limit(20000)
      : Promise.resolve({ data: [] as { so_id: string; amount: number; receipt_id: string }[] }),
    uniqBn.length
      ? admin.from("customer_receipt_lines").select("billing_note_id, amount, receipt_id").in("billing_note_id", uniqBn).limit(20000)
      : Promise.resolve({ data: [] as { billing_note_id: string; amount: number; receipt_id: string }[] }),
  ]);

  const touchedReceiptIds = [...new Set([
    ...((soLineRes.data ?? []) as { receipt_id: string }[]).map((l) => l.receipt_id),
    ...((bnLineRes.data ?? []) as { receipt_id: string }[]).map((l) => l.receipt_id),
  ])];

  const paidReceipts = new Set<string>();
  if (touchedReceiptIds.length) {
    const { data } = await admin.from("customer_receipts").select("id, status, is_active").in("id", touchedReceiptIds);
    for (const r of data ?? []) if (r.is_active && isReceiptPaid(r.status as string)) paidReceipts.add(String(r.id));
  }

  // ---- ใบขาย ----
  if (uniqSo.length) {
    const paidBySo = new Map<string, number>();
    for (const l of (soLineRes.data ?? []) as { so_id: string; amount: number; receipt_id: string }[]) {
      if (!paidReceipts.has(String(l.receipt_id))) continue;
      paidBySo.set(String(l.so_id), (paidBySo.get(String(l.so_id)) ?? 0) + money(l.amount));
    }
    const { data: sos } = await admin
      .from("erp_playground_sales_orders").select("id, grand_total, amount_due").in("id", uniqSo);
    for (const so of sos ?? []) {
      const next = outstanding(money(so.grand_total), paidBySo.get(String(so.id)) ?? 0);
      if (Math.abs(next - money(so.amount_due)) < 0.005) continue;   // ไม่เปลี่ยน — ไม่ต้องเขียน
      await admin.from("erp_playground_sales_orders").update({ amount_due: next }).eq("id", so.id);
    }
  }

  // ---- ใบวางบิล ----
  if (uniqBn.length) {
    const paidByBn = new Map<string, number>();
    for (const l of (bnLineRes.data ?? []) as { billing_note_id: string; amount: number; receipt_id: string }[]) {
      if (!paidReceipts.has(String(l.receipt_id))) continue;
      paidByBn.set(String(l.billing_note_id), (paidByBn.get(String(l.billing_note_id)) ?? 0) + money(l.amount));
    }
    const { data: bns } = await admin
      .from("erp_playground_billing_notes").select("id, grand_total, amount_due, paid_at").in("id", uniqBn);
    for (const bn of bns ?? []) {
      const paid = paidByBn.get(String(bn.id)) ?? 0;
      const next = outstanding(money(bn.grand_total), paid);
      const fullyPaid = next <= 0 && paid > 0;
      const patch: Record<string, unknown> = { amount_due: next };
      // เก็บเงินครบ → ประทับวันปิดยอด · ถ้าย้อนกลับ (ยกเลิกใบรับชำระ) → ล้างออก
      if (fullyPaid && !bn.paid_at) patch.paid_at = new Date().toISOString();
      if (!fullyPaid && bn.paid_at) patch.paid_at = null;
      await admin.from("erp_playground_billing_notes").update(patch).eq("id", bn.id);
    }
  }
}

/** อ่าน so_id / billing_note_id ทั้งหมดที่ใบรับชำระใบนี้เคยแตะ (ใช้ก่อน+หลังแก้ เพื่อคำนวณใหม่ให้ครบ) */
async function docsOfReceipt(admin: Admin, receiptId: string): Promise<{ soIds: string[]; bnIds: string[] }> {
  const { data } = await admin
    .from("customer_receipt_lines").select("so_id, billing_note_id").eq("receipt_id", receiptId).limit(500);
  return {
    soIds: (data ?? []).map((l) => l.so_id).filter(Boolean).map(String),
    bnIds: (data ?? []).map((l) => l.billing_note_id).filter(Boolean).map(String),
  };
}

// ============================================================
// GET
// ============================================================
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "receipts.view");
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const admin = supabaseAdmin();

  // ---- โหมด "ใบที่ยังค้างรับ" สำหรับหน้าจอเลือกเอกสาร ----
  if (sp.get("open_docs")) {
    const customerId = uuidOrNull(sp.get("customer_id"));
    const search = str(sp.get("q")).toLowerCase();

    let soQuery = admin
      .from("erp_playground_sales_orders")
      .select("id, so_number, order_date, customer_id, customer_name, grand_total, amount_due")
      .in("status", SO_ACTIVE_STATUSES).limit(2000);
    if (customerId) soQuery = soQuery.eq("customer_id", customerId);

    let bnQuery = admin
      .from("erp_playground_billing_notes")
      .select("id, bill_number, bill_date, customer_id, customer_name, grand_total, amount_due")
      .neq("status", "cancelled").limit(2000);
    if (customerId) bnQuery = bnQuery.eq("customer_id", customerId);

    // ใบขายที่ถูกดึงไปอยู่ในใบวางบิลแล้ว ให้เก็บเงินที่ใบวางบิลอย่างเดียว กันตัดยอดซ้ำ
    const [soRes, bnRes, bnLineRes] = await Promise.all([
      soQuery, bnQuery,
      admin.from("erp_playground_billing_note_lines").select("billing_note_id, so_id").limit(20000),
    ]);

    const liveBn = new Set((bnRes.data ?? []).map((b) => String(b.id)));
    const soInBn = new Set(
      (bnLineRes.data ?? [])
        .filter((l) => l.so_id && liveBn.has(String(l.billing_note_id)))
        .map((l) => String(l.so_id)),
    );

    const docs: OpenDoc[] = [];
    for (const b of bnRes.data ?? []) {
      const total = money(b.grand_total);
      const left = money(b.amount_due);
      if (left <= 0) continue;
      docs.push({
        kind: "bn", id: String(b.id), number: str(b.bill_number) || "(ไม่มีเลข)",
        date: str(b.bill_date), customer_id: b.customer_id as string | null,
        customer_name: str(b.customer_name), grand_total: total, paid: Math.max(0, total - left),
        outstanding: left,
      });
    }
    for (const s of soRes.data ?? []) {
      if (soInBn.has(String(s.id))) continue;
      const total = money(s.grand_total);
      const left = money(s.amount_due);
      if (left <= 0) continue;
      docs.push({
        kind: "so", id: String(s.id), number: str(s.so_number) || "(ไม่มีเลข)",
        date: str(s.order_date), customer_id: s.customer_id as string | null,
        customer_name: str(s.customer_name), grand_total: total, paid: Math.max(0, total - left), outstanding: left,
      });
    }

    const filtered = search
      ? docs.filter((d) => d.number.toLowerCase().includes(search) || d.customer_name.toLowerCase().includes(search))
      : docs;
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ data: filtered, error: null });
  }

  // ---- โหมดปกติ: รายการใบรับชำระ ----
  const status = str(sp.get("status"));
  const from = str(sp.get("from"));
  const to = str(sp.get("to"));
  const customerId = uuidOrNull(sp.get("customer_id"));

  let q = admin
    .from("customer_receipts")
    .select("id, receipt_no, receipt_date, customer_id, customer_name, amount, wht_amount, fee_amount, method, bank_account, reference_no, status, note, created_by, created_at")
    .eq("is_active", true)
    .order("receipt_date", { ascending: false })
    .order("receipt_no", { ascending: false })
    .limit(2000);
  if (status) q = q.eq("status", status);
  if (from) q = q.gte("receipt_date", from);
  if (to) q = q.lte("receipt_date", to);
  if (customerId) q = q.eq("customer_id", customerId);

  const { data: heads, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const ids = (heads ?? []).map((h) => String(h.id));
  const linesByReceipt = new Map<string, ReceiptLine[]>();
  if (ids.length) {
    const { data: lines } = await admin
      .from("customer_receipt_lines")
      .select("id, receipt_id, so_id, so_number, billing_note_id, bill_number, amount, note, sort_order")
      .in("receipt_id", ids).order("sort_order").limit(20000);
    for (const l of lines ?? []) {
      const key = String(l.receipt_id);
      const list = linesByReceipt.get(key) ?? [];
      list.push({
        id: String(l.id), so_id: l.so_id as string | null, so_number: l.so_number as string | null,
        billing_note_id: l.billing_note_id as string | null, bill_number: l.bill_number as string | null,
        amount: money(l.amount), note: l.note as string | null, sort_order: Number(l.sort_order ?? 0),
      });
      linesByReceipt.set(key, list);
    }
  }

  const data: Receipt[] = (heads ?? []).map((h) => ({
    ...(h as Omit<Receipt, "lines">),
    amount: money(h.amount), wht_amount: money(h.wht_amount), fee_amount: money(h.fee_amount),
    lines: linesByReceipt.get(String(h.id)) ?? [],
  }));
  return NextResponse.json({ data, error: null });
}

// ============================================================
// POST — สร้างใบรับชำระ
// ============================================================
export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "receipts.create");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const amount = money(body.amount);
  const wht = money(body.wht_amount);
  const fee = money(body.fee_amount);
  const rawLines = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]).slice(0, 200) : [];
  const lines = rawLines
    .map((l, i) => ({
      so_id: uuidOrNull(l.so_id),
      so_number: str(l.so_number) || null,
      billing_note_id: uuidOrNull(l.billing_note_id),
      bill_number: str(l.bill_number) || null,
      amount: money(l.amount),
      note: str(l.note) || null,
      sort_order: i,
    }))
    .filter((l) => l.amount > 0 && (l.so_id || l.billing_note_id));

  const invalid = validateAllocation(amount, wht, lines);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const method = METHODS.has(str(body.method)) ? str(body.method) : "transfer";
  const admin = supabaseAdmin();

  // เลขเอกสารจากระบบเลขกลาง (atomic กันเลขซ้ำ) — รูปแบบปรับได้ที่ /admin/numbering
  const { data: receiptNo, error: numErr } = await admin.rpc("erp_next_number", { p_key: "rc" });
  if (numErr || !receiptNo) {
    return NextResponse.json({ error: "ออกเลขใบรับชำระไม่สำเร็จ: " + (numErr?.message ?? "") }, { status: 500 });
  }

  const { data: head, error } = await admin
    .from("customer_receipts")
    .insert({
      receipt_no: String(receiptNo),
      receipt_date: str(body.receipt_date) || todayISO(),
      customer_id: uuidOrNull(body.customer_id),
      customer_name: str(body.customer_name) || null,
      amount, wht_amount: wht, fee_amount: fee, method,
      bank_account: str(body.bank_account) || null,
      reference_no: str(body.reference_no) || null,
      status: str(body.status) === "draft" ? "draft" : "confirmed",
      note: str(body.note) || null,
      company_id: uuidOrNull(body.company_id),
      created_by: user?.email ?? null,
      updated_by: user?.email ?? null,
    })
    .select("id, receipt_no")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const receiptId = String((head as { id: string }).id);

  const { error: lineErr } = await admin
    .from("customer_receipt_lines").insert(lines.map((l) => ({ ...l, receipt_id: receiptId })));
  if (lineErr) {
    await admin.from("customer_receipts").delete().eq("id", receiptId);   // ไม่ให้เหลือใบเปล่าค้างระบบ
    return NextResponse.json({ error: "บันทึกรายการที่ตัดยอดไม่สำเร็จ: " + lineErr.message }, { status: 400 });
  }

  await recomputeDocs(admin, lines.map((l) => l.so_id ?? ""), lines.map((l) => l.billing_note_id ?? ""));
  await writeAudit(admin, {
    action: "create", entityType: "customer_receipts", entityId: receiptId,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: {
      receipt_no: String(receiptNo), amount, wht, settled: settledAmount(amount, wht),
      docs: lines.map((l) => l.so_number ?? l.bill_number),
    },
  });

  return NextResponse.json({ data: { id: receiptId, receipt_no: String(receiptNo) }, error: null });
}

// ============================================================
// PATCH — แก้ / ยกเลิก
// ============================================================
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "receipts.edit");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const id = uuidOrNull(body.id);
  if (!id) return NextResponse.json({ error: "ไม่ระบุใบรับชำระ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: before } = await admin
    .from("customer_receipts").select("receipt_no, status, amount, wht_amount").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบใบรับชำระนี้" }, { status: 404 });

  const nextStatus = str(body.status);
  if (nextStatus === "cancelled" && before.status !== "cancelled") {
    if (!(await apiCan(request, "receipts.cancel"))) {
      return NextResponse.json({ error: "ต้องมีสิทธิ์ยกเลิกใบรับชำระ (receipts.cancel)" }, { status: 401 });
    }
  }
  if (before.status === "cancelled" && nextStatus !== "confirmed" && nextStatus !== "draft") {
    return NextResponse.json({ error: "ใบนี้ยกเลิกไปแล้ว — แก้ไม่ได้" }, { status: 400 });
  }

  // เอกสารที่ใบนี้เคยแตะ (ต้องคำนวณใหม่ด้วย แม้จะถูกเอาออกจากใบแล้ว)
  const beforeDocs = await docsOfReceipt(admin, id);

  const patch: Record<string, unknown> = { updated_by: user?.email ?? null };
  if (body.receipt_date !== undefined) patch.receipt_date = str(body.receipt_date) || todayISO();
  if (body.customer_id !== undefined) patch.customer_id = uuidOrNull(body.customer_id);
  if (body.customer_name !== undefined) patch.customer_name = str(body.customer_name) || null;
  if (body.method !== undefined) patch.method = METHODS.has(str(body.method)) ? str(body.method) : "transfer";
  if (body.bank_account !== undefined) patch.bank_account = str(body.bank_account) || null;
  if (body.reference_no !== undefined) patch.reference_no = str(body.reference_no) || null;
  if (body.note !== undefined) patch.note = str(body.note) || null;
  if (body.amount !== undefined) patch.amount = money(body.amount);
  if (body.wht_amount !== undefined) patch.wht_amount = money(body.wht_amount);
  if (body.fee_amount !== undefined) patch.fee_amount = money(body.fee_amount);
  if (nextStatus === "draft" || nextStatus === "confirmed" || nextStatus === "cancelled") patch.status = nextStatus;

  // แก้บรรทัด → ตรวจว่ายอดยังลงตัวกับยอดที่ลูกค้าชำระ
  const replaceLines = Array.isArray(body.lines);
  let lines: Omit<ReceiptLine, "id">[] = [];
  if (replaceLines) {
    lines = (body.lines as Record<string, unknown>[]).slice(0, 200)
      .map((l, i) => ({
        so_id: uuidOrNull(l.so_id), so_number: str(l.so_number) || null,
        billing_note_id: uuidOrNull(l.billing_note_id), bill_number: str(l.bill_number) || null,
        amount: money(l.amount), note: str(l.note) || null, sort_order: i,
      }))
      .filter((l) => l.amount > 0 && (l.so_id || l.billing_note_id));

    const amt = patch.amount !== undefined ? Number(patch.amount) : money(before.amount);
    const wht = patch.wht_amount !== undefined ? Number(patch.wht_amount) : money(before.wht_amount);
    const finalStatus = String(patch.status ?? before.status);
    if (finalStatus !== "cancelled") {
      const invalid = validateAllocation(amt, wht, lines);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    }
  }

  const { error } = await admin.from("customer_receipts").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (replaceLines) {
    await admin.from("customer_receipt_lines").delete().eq("receipt_id", id);
    if (lines.length) {
      const { error: lineErr } = await admin
        .from("customer_receipt_lines").insert(lines.map((l) => ({ ...l, receipt_id: id })));
      if (lineErr) return NextResponse.json({ error: "บันทึกรายการที่ตัดยอดไม่สำเร็จ: " + lineErr.message }, { status: 400 });
    }
  }

  const afterDocs = await docsOfReceipt(admin, id);
  await recomputeDocs(
    admin,
    [...beforeDocs.soIds, ...afterDocs.soIds],
    [...beforeDocs.bnIds, ...afterDocs.bnIds],
  );

  await writeAudit(admin, {
    action: nextStatus === "cancelled" ? "cancel" : "update",
    entityType: "customer_receipts", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { receipt_no: before.receipt_no, before, changed: Object.keys(patch).filter((k) => k !== "updated_by") },
  });

  return NextResponse.json({ data: { ok: true }, error: null });
}
