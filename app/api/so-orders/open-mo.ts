/**
 * "ยืนยันใบสั่งขาย → เปิดใบสั่งผลิต" (เจ้าของสั่ง: ทำได้ทั้ง 2 แบบ)
 *   • บรรทัดที่ดึงมาจากใบสั่งผลิตอยู่แล้ว → แค่ผูกใบนั้นเข้ากับใบสั่งขาย + เปลี่ยนสถานะเป็น "เปิดใบสั่งขายแล้ว"
 *   • บรรทัดที่ยังไม่มีใบสั่งผลิต       → เปิดใบสั่งผลิตใหม่ให้ (กางสูตร BOM หลักของสินค้านั้นให้ด้วย)
 *
 * ของกลางที่ใช้: erp_next_number (เลข MO) · explodeBom (กางสูตร ตัวเดียวกับหน้าใบสั่งผลิต)
 * ⚠️ ไม่แตะใบสั่งผลิตที่ผูกกับใบสั่งขายใบอื่นอยู่แล้ว
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { explodeBom } from "@/app/api/mo/shared";

type Admin = ReturnType<typeof supabaseAdmin>;

async function nextMoNo(admin: Admin): Promise<string> {
  const { data, error } = await admin.rpc("erp_next_number", { p_key: "mo" });
  if (!error && data) return String(data);
  const yr = new Date().getFullYear();
  const { count } = await admin.from("manufacturing_orders").select("id", { count: "exact", head: true });
  return `MO-${yr}-${String((count ?? 0) + 1).padStart(5, "0")}`;
}

/** สูตรหลักของสินค้า (ใช้ตอนเปิดใบสั่งผลิตให้อัตโนมัติ) */
async function mainBomOf(admin: Admin, sku: string): Promise<string | null> {
  const { data } = await admin.from("bom_headers")
    .select("bom_code, updated_at").eq("product_sku", sku).eq("is_active", true)
    .order("updated_at", { ascending: false }).limit(1);
  const row = (data ?? [])[0] as { bom_code: string | null } | undefined;
  return row?.bom_code ?? null;
}

export async function openMoForOrder(admin: Admin, orderId: string, actorId: string | null): Promise<{ created: number; linked: number }> {
  const { data: order } = await admin.from("so_orders")
    .select("id, order_no, due_date, order_date, status").eq("id", orderId).maybeSingle();
  if (!order) return { created: 0, linked: 0 };
  const o = order as { id: string; order_no: string | null; due_date: string | null; order_date: string; status: string };
  if (o.status === "cancelled") return { created: 0, linked: 0 };

  const { data: lines } = await admin.from("so_order_lines")
    .select("id, sku, product_name, qty, due_date, mo_id, mo_no").eq("order_id", orderId).order("line_no");

  let created = 0, linked = 0;
  for (const raw of (lines ?? []) as { id: string; sku: string | null; product_name: string; qty: number; due_date: string | null; mo_id: string | null; mo_no: string | null }[]) {
    const due = raw.due_date || o.due_date || null;

    // (1) มีใบสั่งผลิตอยู่แล้ว → ผูก + เปลี่ยนสถานะ (ไม่แย่งใบที่ผูกใบสั่งขายอื่นไว้)
    if (raw.mo_id) {
      const { data: mo } = await admin.from("manufacturing_orders").select("id, so_order_id, due_date").eq("id", raw.mo_id).maybeSingle();
      const cur = mo as { id: string; so_order_id: string | null; due_date: string | null } | null;
      if (cur && (!cur.so_order_id || cur.so_order_id === orderId)) {
        await admin.from("manufacturing_orders").update({
          so_order_id: orderId, so_order_no: o.order_no, status: "confirmed",
          due_date: cur.due_date || due,        // ใบสั่งผลิตยังไม่มีกำหนดส่ง → ใช้ของใบสั่งขาย
        }).eq("id", raw.mo_id);
        linked++;
      }
      continue;
    }

    // (2) ยังไม่มี → เปิดใบสั่งผลิตใหม่ให้
    if (!raw.sku || !(Number(raw.qty) > 0)) continue;
    const moNo = await nextMoNo(admin);
    const bomCode = await mainBomOf(admin, raw.sku);
    const { data: mo, error } = await admin.from("manufacturing_orders").insert({
      mo_no: moNo, product_sku: raw.sku, product_name: raw.product_name || raw.sku,
      qty: Number(raw.qty) || 0, status: "confirmed",
      due_date: due, order_date: o.order_date,
      bom_code: bomCode, is_active: true,
      so_order_id: orderId, so_order_no: o.order_no,
      note: `จากใบสั่งขาย ${o.order_no ?? ""}`.trim(),
    }).select("id, mo_no").single();
    if (error || !mo) continue;
    await explodeBom(admin, bomCode, moNo, Number(raw.qty) || 0, null);
    await admin.from("so_order_lines").update({ mo_id: (mo as { id: string }).id, mo_no: moNo }).eq("id", raw.id);
    created++;
  }

  if (created + linked > 0) {
    await admin.from("so_orders").update({ mo_opened_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", orderId);
    await admin.from("audit_logs").insert({
      actor_user_id: actorId, action: "so_order.open_mo", entity_type: "so_order", entity_id: orderId,
      metadata: { order_no: o.order_no, created, linked },
    }).then(() => {}, () => {});
  }
  return { created, linked };
}
