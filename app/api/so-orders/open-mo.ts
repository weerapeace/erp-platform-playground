/**
 * "ยืนยันใบสั่งขาย → เปิดใบสั่งผลิต" (เจ้าของสั่ง: ทำได้ทั้ง 2 แบบ)
 *   • บรรทัดที่ดึงมาจากใบสั่งผลิตอยู่แล้ว → แค่ผูกใบนั้นเข้ากับใบสั่งขาย + เปลี่ยนสถานะเป็น "เปิดใบสั่งขายแล้ว"
 *   • บรรทัดที่ยังไม่มีใบสั่งผลิต       → เปิดใบสั่งผลิตใหม่ให้ (กางสูตร BOM หลักของสินค้านั้นให้ด้วย)
 *
 * ของกลางที่ใช้: erp_next_number (เลข MO) · explodeBom (กางสูตร ตัวเดียวกับหน้าใบสั่งผลิต)
 * ⚠️ ไม่แตะใบสั่งผลิตที่ผูกกับใบสั่งขายใบอื่นอยู่แล้ว
 * ชุด: รายการที่มี mo_group_id → ใบสั่งผลิตเข้ากลุ่มนั้นให้เอง (opts.onlyGroupId = เปิดเฉพาะรายการของชุดนั้น)
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

export async function openMoForOrder(
  admin: Admin, orderId: string, actorId: string | null,
  opts?: {
    onlyGroupId?: string;
    /** เปิด/ผูกเฉพาะรายการนี้ (ปุ่มต่อรายการในหน้าสถานะ) */
    onlyLineId?: string;
    /** ผูกเฉพาะรายการที่อ้างใบสั่งผลิตอยู่แล้ว ไม่เปิดใบใหม่ (หลังบันทึกแก้ไขใบ) */
    linkOnly?: boolean;
  },
): Promise<{ created: number; linked: number; grouped?: number }> {
  const { data: order } = await admin.from("so_orders")
    .select("id, order_no, due_date, order_date, status").eq("id", orderId).maybeSingle();
  if (!order) return { created: 0, linked: 0 };
  const o = order as { id: string; order_no: string | null; due_date: string | null; order_date: string; status: string };
  if (o.status === "cancelled") return { created: 0, linked: 0 };

  let lq = admin.from("so_order_lines")
    .select("id, sku, product_name, qty, due_date, mo_id, mo_no, mo_group_id").eq("order_id", orderId).order("line_no");
  if (opts?.onlyGroupId) lq = lq.eq("mo_group_id", opts.onlyGroupId);
  if (opts?.onlyLineId) lq = lq.eq("id", opts.onlyLineId);
  const { data: lines } = await lq;

  let created = 0, linked = 0;
  const toGroup: GroupAdd[] = [];                 // ใบที่ต้องเอาเข้าชุดของรายการ
  for (const raw of (lines ?? []) as { id: string; sku: string | null; product_name: string; qty: number; due_date: string | null; mo_id: string | null; mo_no: string | null; mo_group_id: string | null }[]) {
    const due = raw.due_date || o.due_date || null;

    // (1) มีใบสั่งผลิตอยู่แล้ว → ผูก + เปลี่ยนสถานะ (ไม่แย่งใบที่ผูกใบสั่งขายอื่นไว้)
    if (raw.mo_id) {
      const { data: mo } = await admin.from("manufacturing_orders").select("id, mo_no, so_order_id, due_date, status").eq("id", raw.mo_id).maybeSingle();
      const cur = mo as { id: string; mo_no: string; so_order_id: string | null; due_date: string | null; status: string | null } | null;
      if (cur && (!cur.so_order_id || cur.so_order_id === orderId)) {
        // แก้เฉพาะที่ต้องแก้ — ห้ามเขียนทับสถานะที่ไปไกลกว่า "ร่าง" แล้ว (บันทึกใบซ้ำ ๆ ต้องไม่ดึงสถานะใบผลิตถอยหลัง)
        const fresh = cur.so_order_id !== orderId;
        const patch: Record<string, unknown> = {};
        if (fresh) { patch.so_order_id = orderId; patch.so_order_no = o.order_no; }
        if (!cur.status || cur.status === "draft") patch.status = "confirmed";
        if (!cur.due_date && due) patch.due_date = due;   // ใบสั่งผลิตยังไม่มีกำหนดส่ง → ใช้ของใบสั่งขาย
        if (Object.keys(patch).length) await admin.from("manufacturing_orders").update(patch).eq("id", raw.mo_id);
        if (raw.mo_group_id && cur.mo_no) toGroup.push({ groupId: raw.mo_group_id, moNo: cur.mo_no, existing: true });
        if (fresh) linked++;
      }
      continue;
    }

    // (2) ยังไม่มี → เปิดใบสั่งผลิตใหม่ให้ (ยกเว้นโหมดผูกอย่างเดียว)
    if (opts?.linkOnly) continue;
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
    if (raw.mo_group_id) toGroup.push({ groupId: raw.mo_group_id, moNo, existing: false });
    created++;
  }

  const grouped = await addMosToGroups(admin, toGroup);

  if (created + linked > 0) {
    await admin.from("so_orders").update({ mo_opened_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", orderId);
    await admin.from("audit_logs").insert({
      actor_user_id: actorId, action: "so_order.open_mo", entity_type: "so_order", entity_id: orderId,
      metadata: { order_no: o.order_no, created, linked, grouped, only_group: opts?.onlyGroupId ?? null, only_line: opts?.onlyLineId ?? null, link_only: !!opts?.linkOnly },
    }).then(() => {}, () => {});
  }
  return { created, linked, grouped };
}

type GroupAdd = { groupId: string; moNo: string; existing: boolean };

/**
 * เอาใบสั่งผลิตเข้าชุด (mo_groups.mo_nos) ตามรายการในใบสั่งขาย
 *   • ใบที่เพิ่งเปิดให้ → เข้าชุดเลย
 *   • ใบเดิมที่ดึงมาผูก → เข้าชุดเฉพาะใบที่ "ยังไม่อยู่กลุ่มไหน" (ไม่แย่งใบที่จัดกลุ่มไว้แล้ว — 1 ใบหลายกลุ่ม = หน้าจองง)
 */
async function addMosToGroups(admin: Admin, adds: GroupAdd[]): Promise<number> {
  if (adds.length === 0) return 0;
  const { data } = await admin.from("mo_groups").select("id, mo_nos").eq("is_active", true);
  const groups = ((data ?? []) as { id: string; mo_nos: unknown }[])
    .map((g) => ({ id: g.id, mo_nos: Array.isArray(g.mo_nos) ? (g.mo_nos as unknown[]).map(String) : [] }));
  const inAnyGroup = new Set(groups.flatMap((g) => g.mo_nos));
  const byGroup = new Map<string, string[]>();
  for (const a of adds) {
    if (a.existing && inAnyGroup.has(a.moNo)) continue;
    (byGroup.get(a.groupId) ?? byGroup.set(a.groupId, []).get(a.groupId)!).push(a.moNo);
  }
  let n = 0;
  for (const [groupId, moNos] of byGroup) {
    const g = groups.find((x) => x.id === groupId);
    if (!g) continue;                                  // ชุดถูกลบไปแล้ว
    const next = [...new Set([...g.mo_nos, ...moNos])];
    const { error } = await admin.from("mo_groups").update({ mo_nos: next, updated_at: new Date().toISOString() }).eq("id", groupId);
    if (!error) n += next.length - g.mo_nos.length;
  }
  return n;
}
