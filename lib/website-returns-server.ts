/**
 * ↩️ ขอคืน/เปลี่ยนสินค้า — ส่วนที่อ่าน/เขียนฐานข้อมูล + รูป (ฝั่งเซิร์ฟเวอร์เท่านั้น) · กฎอยู่ lib/website-returns.ts
 * ใช้ที่: /api/public/storefront/returns (ลูกค้า · ลิงก์มีลายเซ็นจากหน้าตามออเดอร์) · /api/website/returns (ERP)
 */
import { sniffImage } from "@/lib/website-payments";
import { r2DeleteObject, r2PutObject } from "@/lib/r2";
import { writeAudit } from "@/lib/audit";
import { readSiteInfo } from "@/lib/website-site-info";
import { OPEN_RETURN_STATUSES, RETURN_MAX_IMAGES, RETURN_MOVES, RETURN_STATUSES, returnDeadline, returnReasonLabel, type ReturnInput, type ReturnStatus } from "@/lib/website-returns";
import { lineTextToMember, notifyStaffReturn } from "@/lib/webshop-line";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

const MAX_BYTES = 6 * 1024 * 1024;
const extOf = (mime: string) => (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");

export interface ReturnableItem {
  itemId: string;
  name: string;
  variant: string | null;
  qty: number;
}
export interface ReturnPageData {
  orderNo: string;
  customerName: string;
  enabled: boolean;
  days: number;
  deadline: string | null;
  eligible: boolean;
  note: string;
  items: ReturnableItem[];
  /** คำขอล่าสุดของออเดอร์นี้ (ถ้ามี) */
  request: { id: string; status: ReturnStatus; kind: string; createdAt: string; staffNote: string | null } | null;
}

/** ข้อมูลหน้าขอคืน/เปลี่ยน (ออเดอร์ของลิงก์นี้ · ขอได้ไหม · ชิ้นที่ขอได้ · คำขอเดิม) */
export async function returnPageData(sb: Admin, orderId: string): Promise<{ shopId: string; data: ReturnPageData } | null> {
  const { data: o } = await sb.from("store_orders").select("id, shop_id, order_no, customer_name, status, created_at, completed_at").eq("id", orderId).maybeSingle();
  const order = o as { id: string; shop_id: string; order_no: string; customer_name: string; status: string; created_at: string; completed_at: string | null } | null;
  if (!order) return null;
  const [info, itemsRes, reqRes] = await Promise.all([
    readSiteInfo(sb, order.shop_id),
    sb.from("store_order_items").select("id, name, variant_label, qty").eq("order_id", order.id),
    sb.from("store_return_requests").select("id, status, kind, created_at, staff_note").eq("order_id", order.id).order("created_at", { ascending: false }).limit(1),
  ]);
  const deadline = returnDeadline(order, info.returns_days);
  const last = ((reqRes.data ?? []) as { id: string; status: ReturnStatus; kind: string; created_at: string; staff_note: string | null }[])[0] ?? null;
  const open = !!last && OPEN_RETURN_STATUSES.includes(last.status);
  return {
    shopId: order.shop_id,
    data: {
      orderNo: order.order_no,
      customerName: order.customer_name,
      enabled: info.returns_enabled,
      days: info.returns_days,
      deadline: deadline?.toISOString() ?? null,
      eligible: info.returns_enabled && !!deadline && deadline.getTime() >= Date.now() && !open,
      note: info.returns_note,
      items: ((itemsRes.data ?? []) as { id: string; name: string; variant_label: string | null; qty: number }[]).map((i) => ({ itemId: i.id, name: i.name, variant: i.variant_label, qty: Number(i.qty) || 0 })),
      request: last ? { id: last.id, status: last.status, kind: last.kind, createdAt: last.created_at, staffNote: last.staff_note } : null,
    },
  };
}

/** บันทึกคำขอ (ตรวจสิทธิ์/ชิ้น/จำนวนกับออเดอร์จริง · อัปรูปไม่เกิน 3 · มีคำขอเปิดอยู่ = ขอซ้ำไม่ได้) */
export async function submitReturn(
  sb: Admin,
  orderId: string,
  input: ReturnInput,
  files: File[],
  lang: "th" | "en",
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string; errorEn: string }> {
  const page = await returnPageData(sb, orderId);
  if (!page) return { ok: false, status: 404, error: "ไม่พบออเดอร์", errorEn: "Order not found" };
  const d = page.data;
  if (!d.enabled) return { ok: false, status: 409, error: "ร้านยังไม่เปิดรับคำขอคืน/เปลี่ยนทางเว็บ — ทักแชทร้านได้เลย", errorEn: "This shop doesn't accept online return requests — please contact the shop." };
  if (d.request && OPEN_RETURN_STATUSES.includes(d.request.status)) return { ok: false, status: 409, error: "ออเดอร์นี้มีคำขอที่ร้านกำลังดำเนินการอยู่แล้ว", errorEn: "There's already an open request for this order." };
  if (!d.eligible) return { ok: false, status: 409, error: `เลยกำหนดขอคืน/เปลี่ยนแล้ว (ภายใน ${d.days} วันหลังได้รับสินค้า) — ทักแชทร้านได้`, errorEn: `The return window has passed (${d.days} days after delivery) — please contact the shop.` };
  const byId = new Map(d.items.map((i) => [i.itemId, i]));
  const items = [];
  for (const it of input.items) {
    const src = byId.get(it.itemId);
    if (!src) return { ok: false, status: 400, error: "สินค้าที่เลือกไม่อยู่ในออเดอร์นี้", errorEn: "That item isn't in this order." };
    items.push({ itemId: src.itemId, name: src.name, variant: src.variant, qty: Math.min(src.qty, it.qty) });
  }
  // รูป: ตรวจชนิดจากหัวไฟล์จริง · ใหญ่เกิน/ไม่ใช่รูป = ไม่รับทั้งคำขอ (ลบรูปที่อัปไปแล้ว)
  const keys: string[] = [];
  for (const f of files.slice(0, RETURN_MAX_IMAGES)) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (!bytes.length) continue;
    const mime = sniffImage(bytes);
    if (bytes.length > MAX_BYTES || !mime) {
      await Promise.all(keys.map((k) => r2DeleteObject(k).catch(() => undefined)));
      return { ok: false, status: 400, error: "รูปต้องเป็น JPG/PNG/WEBP ไม่เกิน 6MB", errorEn: "Photos must be JPG/PNG/WEBP under 6MB." };
    }
    const key = `storefront-returns/${page.shopId}/${new Date().toISOString().slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extOf(mime)}`;
    await r2PutObject(key, bytes, mime);
    keys.push(key);
  }
  const { data, error } = await sb
    .from("store_return_requests")
    .insert({ shop_id: page.shopId, order_id: orderId, kind: input.kind, reason: input.reason, detail: input.detail, items, images: keys, lang })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    await Promise.all(keys.map((k) => r2DeleteObject(k).catch(() => undefined)));
    return { ok: false, status: 500, error: "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่", errorEn: "Couldn't send your request. Please try again." };
  }
  const id = (data as { id: string }).id;
  await writeAudit(sb, { action: "create", entityType: "store_return_requests", entityId: id, actorId: null, actorName: `ลูกค้า (ออเดอร์ ${d.orderNo})`, metadata: { shop_id: page.shopId, order_no: d.orderNo, kind: input.kind, reason: input.reason, items: items.length } });
  await notifyStaffReturn(sb, page.shopId, d.orderNo, input.kind, returnReasonLabel(input.reason));
  return { ok: true, id };
}

/** ร้านเปลี่ยนสถานะคำขอ (ตามลำดับที่อนุญาต) + หมายเหตุถึงลูกค้า + audit */
export async function decideReturn(
  sb: Admin,
  id: string,
  next: ReturnStatus,
  staffNote: string,
  actor: { id: string | null; name: string | null },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data } = await sb.from("store_return_requests").select("id, shop_id, order_id, status, kind").eq("id", id).maybeSingle();
  const row = data as { id: string; shop_id: string; order_id: string; status: ReturnStatus; kind: string } | null;
  if (!row) return { ok: false, status: 404, error: "ไม่พบคำขอ" };
  if (!RETURN_MOVES[row.status]?.includes(next)) return { ok: false, status: 409, error: "เปลี่ยนเป็นสถานะนี้ไม่ได้จากสถานะปัจจุบัน" };
  const note = staffNote.trim().slice(0, 1000) || null;
  const { error } = await sb
    .from("store_return_requests")
    .update({ status: next, staff_note: note, decided_by_name: actor.name, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", row.status);
  if (error) return { ok: false, status: 500, error: "บันทึกไม่สำเร็จ" };
  await writeAudit(sb, { action: next === "rejected" ? "reject" : next === "approved" ? "approve" : "update", entityType: "store_return_requests", entityId: id, actorId: actor.id, actorName: actor.name, metadata: { shop_id: row.shop_id, order_id: row.order_id, from: row.status, to: next, note } });
  // 💬 แจ้งลูกค้าทาง LINE (สมาชิกเข้าด้วย LINE + ร้านเปิด) — ข้อความสั้น + หมายเหตุร้าน
  const { data: ord } = await sb.from("store_orders").select("order_no, customer_id, lang").eq("id", row.order_id).maybeSingle();
  const oo = ord as { order_no: string; customer_id: string | null; lang: string | null } | null;
  if (oo?.customer_id) {
    const st = RETURN_STATUSES.find((s) => s.key === next);
    const en = oo.lang === "en";
    const head = en ? `Your ${row.kind === "exchange" ? "exchange" : "return"} request for order ${oo.order_no}: ${st?.en ?? next}` : `คำขอ${row.kind === "exchange" ? "เปลี่ยน" : "คืน"}สินค้า ออเดอร์ ${oo.order_no}: ${st?.label ?? next}`;
    await lineTextToMember(sb, row.shop_id, oo.customer_id, note ? `${head}\n${note}` : head);
  }
  return { ok: true };
}
