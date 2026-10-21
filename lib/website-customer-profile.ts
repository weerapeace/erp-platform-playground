/**
 * 👤 ประวัติลูกค้าหน้าเดียว (ชุด 8b) — กฎกลาง: จับคู่เบอร์ · สรุปยอด/ของที่ชอบ/ที่อยู่ที่เคยส่ง
 *
 * ลูกค้า 1 คน = สมาชิก (store_customers) และ/หรือ ออเดอร์แขกที่ใช้เบอร์เดียวกัน (ไม่ได้สมัครก็เห็นประวัติ)
 * เปิดจาก ERP › เว็บไซต์ › 👥 สมาชิก (กดแถว) · 🧾 ออเดอร์ (ปุ่ม "ประวัติลูกค้าคนนี้") — components/website-customer-profile.tsx
 * ข้อมูล /api/website/customer-profile (สิทธิ์ products.view เท่ากับแท็บสมาชิก/ออเดอร์)
 */

/** เบอร์ไทยหลายรูปแบบ (081-234-5678 · +66812345678 · 66812345678) → รูปแบบที่อาจเก็บไว้ทั้งหมด (ไว้ค้น) · สั้นเกิน = [] */
export function phoneVariants(raw: unknown): string[] {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length < 9) return [];
  const last9 = d.slice(-9);
  return [...new Set([d, `0${last9}`, `66${last9}`, `+66${last9}`])];
}

/** เบอร์สองเบอร์เป็นคนเดียวกันไหม (เทียบ 9 หลักท้าย) */
export function samePhone(a: unknown, b: unknown): boolean {
  const x = String(a ?? "").replace(/\D/g, "");
  const y = String(b ?? "").replace(/\D/g, "");
  return x.length >= 9 && y.length >= 9 && x.slice(-9) === y.slice(-9);
}

export interface ProfileOrderRow {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  grand_total: number | string;
  created_at: string;
  source: string | null;
  customer_name: string;
  ship_address_line: string | null;
  ship_subdistrict: string | null;
  ship_district: string | null;
  ship_province: string | null;
  ship_postal: string | null;
}
export interface ProfileItemRow {
  order_id: string;
  parent_code: string | null;
  name: string;
  qty: number | string;
}

export interface CustomerSummary {
  orders: number;
  cancelled: number;
  spent: number;
  avg: number;
  firstAt: string | null;
  lastAt: string | null;
  /** แหล่งที่มาของออเดอร์แรกที่รู้แหล่ง */
  firstSource: string | null;
  topItems: { code: string; name: string; qty: number }[];
  addresses: { text: string; count: number; lastAt: string }[];
  /** ชื่อที่ใช้สั่ง (ไม่ซ้ำ ล่าสุดก่อน) */
  names: string[];
}

const num = (v: unknown) => Number(v) || 0;
const money = (n: number) => Math.round(n * 100) / 100;

/** ออเดอร์ (เรียงใหม่→เก่า หรือไม่เรียงก็ได้) + รายการสินค้า → สรุปหน้าโปรไฟล์ · ยกเลิกไม่นับยอด/ของที่ชอบ */
export function summarizeCustomer(orders: ProfileOrderRow[], items: ProfileItemRow[]): CustomerSummary {
  const sorted = [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const live = sorted.filter((o) => o.status !== "cancelled");
  const spent = money(live.reduce((s, o) => s + num(o.grand_total), 0));
  const liveIds = new Set(live.map((o) => o.id));

  const top = new Map<string, { code: string; name: string; qty: number }>();
  for (const it of items) {
    if (!liveIds.has(it.order_id)) continue;
    const code = String(it.parent_code ?? "").toUpperCase() || it.name;
    const t = top.get(code) ?? { code, name: it.name, qty: 0 };
    t.qty += num(it.qty);
    top.set(code, t);
  }

  const addr = new Map<string, { text: string; count: number; lastAt: string }>();
  for (const o of sorted) {
    const text = [o.ship_address_line, o.ship_subdistrict, o.ship_district, o.ship_province, o.ship_postal].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
    if (!text) continue;
    const key = text.toLowerCase().replace(/\s+/g, " ");
    const a = addr.get(key);
    if (a) a.count += 1;
    else addr.set(key, { text, count: 1, lastAt: o.created_at });
  }

  const oldestWithSource = [...sorted].reverse().find((o) => o.source);
  return {
    orders: live.length,
    cancelled: sorted.length - live.length,
    spent,
    avg: live.length ? money(spent / live.length) : 0,
    firstAt: sorted.length ? sorted[sorted.length - 1].created_at : null,
    lastAt: sorted.length ? sorted[0].created_at : null,
    firstSource: oldestWithSource?.source ?? null,
    topItems: [...top.values()].sort((a, b) => b.qty - a.qty).slice(0, 6),
    addresses: [...addr.values()].slice(0, 5),
    names: [...new Set(sorted.map((o) => o.customer_name.trim()).filter(Boolean))].slice(0, 5),
  };
}
