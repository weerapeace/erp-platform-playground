/**
 * ของกลาง: รวมวัตถุดิบ "ทั้งรุ่น" (หลายใบสั่งผลิตของ Parent SKU เดียวกัน) เป็นการ์ดเดียวต่อวัตถุดิบ
 * ใช้ที่หน้าขอซื้อ แท็บใบสั่งผลิต มุมมอง "รวมตามรุ่น" (app/purchasing/mo-parent-group.tsx)
 *   → กด ✓ มีของแล้ว / 🔢 นับ / 🛒 ขอซื้อรวม ครั้งเดียวได้ทุกใบ
 *
 * ไม่คิดกติกาสถานะเอง: แต่ละบรรทัดมาจาก /api/mo/material-status (lib/mo-material-status) แล้วรวมยอดเท่านั้น
 *   ต้องซื้อรวม = ผลรวม "ต้องซื้อ" ของใบที่ยังสถานะต้องซื้อ · สถานะการ์ด = แย่สุดของใบในกลุ่ม (ต้องซื้อ > ขอแล้ว > สั่งแล้ว > ครบ)
 * ไฟล์ pure (ไม่ยิง DB) — ทดสอบได้ lib/__tests__/mo-group-materials.test.ts
 */
import type { MoMaterialStatus, MoMaterialStatusResult, MatStock } from "@/app/api/mo/material-status/route";

export type GroupMatStatus = "buy" | "requested" | "ordered" | "done";

/** วัตถุดิบตัวนี้ในใบสั่งผลิต 1 ใบ */
export type GroupMatMo = { mo_no: string; variant: string; due_date: string | null; it: MoMaterialStatus };

export type GroupMatRow = {
  key: string;
  code: string | null; name: string | null; image: string | null; uom: string | null; type: string | null;
  /** ทุกใบ (ในสีที่เลือก) ที่ใช้วัตถุดิบนี้ */
  mos: GroupMatMo[];
  /** ใบที่ยังต้องซื้อ — เป้าหมายของปุ่ม มีของแล้ว / นับ / ขอซื้อรวม */
  buy: GroupMatMo[];
  /** สี/SKU ที่ใช้วัตถุดิบนี้ (เรียงตามชื่อ) */
  variants: string[];
  /** ใช้ทุกสีที่เลือก (และเลือกมากกว่า 1 สี) = "ใช้ร่วม" · ไม่งั้น = "เฉพาะสี" */
  shared: boolean;
  required: number;
  remaining: number;
  counts: Record<GroupMatStatus, number>;
  status: GroupMatStatus;
  stock: MatStock | null;
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const RANK: Record<GroupMatStatus, number> = { buy: 0, requested: 1, ordered: 2, done: 3 };

export function groupStatusOf(it: MoMaterialStatus): GroupMatStatus {
  if (it.status === "buy") return "buy";
  if (it.status === "requested") return "requested";
  if (it.status === "ordered") return "ordered";
  return "done";
}

/**
 * รวมผลจาก /api/mo/material-status?mo_nos= → การ์ดละ 1 วัตถุดิบ
 * variantOf = ใบนี้เป็นสี/SKU ไหน · include = เฉพาะสีที่เลือก (ไม่ส่ง = ทุกสี)
 * เรียง: ยังต้องซื้อก่อน → ใช้ร่วมหลายใบก่อน → ชื่อ
 */
export function groupMaterials(
  results: MoMaterialStatusResult[],
  variantOf: (moNo: string) => string,
  dueOf: (moNo: string) => string | null = () => null,
  include?: Set<string>,
): GroupMatRow[] {
  const picked = results.filter((r) => !include || include.has(variantOf(r.mo_no)));
  const allVariants = new Set(picked.map((r) => variantOf(r.mo_no)));
  const map = new Map<string, GroupMatRow>();
  for (const r of picked) {
    const variant = variantOf(r.mo_no);
    for (const it of r.items) {
      const key = it.code ?? `nm:${it.name ?? ""}`;
      let g = map.get(key);
      if (!g) {
        g = { key, code: it.code, name: it.name, image: it.image, uom: it.uom, type: it.type, mos: [], buy: [], variants: [], shared: false,
          required: 0, remaining: 0, counts: { buy: 0, requested: 0, ordered: 0, done: 0 }, status: "done", stock: it.stock };
        map.set(key, g);
      }
      const row: GroupMatMo = { mo_no: r.mo_no, variant, due_date: dueOf(r.mo_no), it };
      const st = groupStatusOf(it);
      g.mos.push(row);
      g.counts[st] += 1;
      g.required = r4(g.required + it.required);
      if (st === "buy") { g.buy.push(row); g.remaining = r4(g.remaining + it.remaining); }
      if (RANK[st] < RANK[g.status]) g.status = st;
      if (!g.image && it.image) g.image = it.image;
      if (!g.variants.includes(variant)) g.variants.push(variant);
    }
  }
  const out = [...map.values()];
  for (const g of out) {
    g.variants.sort((a, b) => a.localeCompare(b));
    g.shared = allVariants.size > 1 && g.variants.length === allVariants.size;
    g.buy.sort(byDue);
  }
  return out.sort((a, b) => RANK[a.status] - RANK[b.status] || Number(b.shared) - Number(a.shared)
    || b.mos.length - a.mos.length || (a.name ?? "").localeCompare(b.name ?? "", "th"));
}

/** ใบที่ใกล้กำหนดส่งก่อน (ควรได้ของก่อน) → เลขใบ */
function byDue(a: GroupMatMo, b: GroupMatMo): number {
  return (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") || a.mo_no.localeCompare(b.mo_no);
}

/**
 * นับสต๊อกครั้งเดียว → แบ่งของให้ใบที่ยังต้องซื้อ เรียงใบใกล้กำหนดก่อน (ใบละไม่เกินที่ยังขาด)
 * available = ของที่ใช้ได้จริง (นับได้ − ที่แบ่งให้ใบอื่นไว้แล้ว)
 */
export function planStockUse(row: GroupMatRow, available: number): { summary_id: string; mo_no: string; qty: number; full: boolean }[] {
  let left = r4(Math.max(0, available));
  const out: { summary_id: string; mo_no: string; qty: number; full: boolean }[] = [];
  for (const m of row.buy) {
    if (left <= 0.0001) break;
    const want = m.it.remaining;
    if (want <= 0.0001) continue;
    const qty = r4(Math.min(want, left));
    out.push({ summary_id: m.it.summary_id, mo_no: m.mo_no, qty, full: qty >= want - 0.0001 });
    left = r4(left - qty);
  }
  return out;
}

/** ✓ มีของแล้ว ทุกใบที่ยังต้องซื้อ: มีอยู่ = ที่ต้องใช้ + ล้าง override · undo = ค่าเดิมทีละใบ (ไว้กดยกเลิก) */
export function haveItems(rows: GroupMatRow[]): {
  items: { id: string; on_hand_qty: number; purchase_override: null }[];
  undo: { id: string; on_hand_qty: number; purchase_override: number | null }[];
} {
  const buy = rows.flatMap((r) => r.buy);
  return {
    items: buy.map((m) => ({ id: m.it.summary_id, on_hand_qty: m.it.required, purchase_override: null })),
    undo: buy.map((m) => ({ id: m.it.summary_id, on_hand_qty: m.it.on_hand, purchase_override: m.it.to_purchase_stored })),
  };
}
