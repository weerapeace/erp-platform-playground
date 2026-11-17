/**
 * 📏 "วางจริง" — ใช้ต่อใบจากการลองวางชิ้นบนผ้าจริง (ไม่มีหน้าจอ) — เจ้าของขอ 2026-11-17
 *   ตัวเลข "ใช้ต่อใบ ≈" ที่หัวกลุ่มตารางตีราคาประมาณจากพื้นที่ (lib/cost-usage) ยังไม่รวมการวางแบบจริง
 *   → ช่างลองวางแล้วพิมพ์ตัวเลขจริงต่อวัสดุ ต่อแท็บตีราคา เก็บที่ design_sheets.nest_usage
 *   รูปแบบ: { [parentKey ("" = ทั่วไป)]: { [item_id]: { qty, unit, note?, by?, at? } } }
 *   ไม่ใช้คิดต้นทุน (ยอดเงินในตารางยังมาจากบรรทัด) — ใช้เทียบ + แจ้งลูกค้า (notice-tab ดึงตัวนี้ก่อนค่าประมาณ)
 * ใช้ที่: components/design-sheet-detail/index.tsx (หัวกลุ่ม + การ์ดสรุป + บันทึก) · design-sheet-mobile/cost-tab.tsx
 *         · design-sheet-detail/notice-tab.tsx · app/api/design-sheets/[id]/route.ts (ตรวจค่าตอนบันทึก) · versions/route.ts (ย้ายตอนเปลี่ยนชื่อแท็บ)
 * เทส: lib/__tests__/nest-usage.test.ts
 */

export type NestEntry = { qty: number; unit: string; note?: string; by?: string; at?: string };
export type NestUsage = Record<string, Record<string, NestEntry>>;

const MAX_QTY = 100_000;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** ค่าที่ปลอดภัย — ตัดตัวเลขที่ไม่ใช่จำนวนบวก · ตัดข้อความยาว · แท็บ/วัสดุที่ว่างหายไป */
export function cleanNestUsage(raw: unknown): NestUsage {
  const out: NestUsage = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [pk, items] of Object.entries(raw as Record<string, unknown>)) {
    if (pk.length > 120 || !items || typeof items !== "object" || Array.isArray(items)) continue;
    const m: Record<string, NestEntry> = {};
    for (const [id, e] of Object.entries(items as Record<string, unknown>)) {
      if (!id || id.length > 64 || !e || typeof e !== "object") continue;
      const o = e as Record<string, unknown>;
      const qty = Math.round(Number(typeof o.qty === "string" ? o.qty.replace(",", ".") : o.qty) * 10000) / 10000;
      if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) continue;
      const ent: NestEntry = { qty, unit: str(o.unit, 20) };
      const note = str(o.note, 200), by = str(o.by, 80), at = str(o.at, 40);
      if (note) ent.note = note;
      if (by) ent.by = by;
      if (at) ent.at = at;
      m[id] = ent;
    }
    if (Object.keys(m).length) out[pk] = m;
  }
  return out;
}

/** ตั้ง/ลบค่า 1 วัสดุ (qty ว่าง/0 = ลบ) → ก้อนใหม่ (ไม่แก้ของเดิม) */
export function setNestEntry(map: NestUsage, parentKey: string, itemId: string, entry: NestEntry | null): NestUsage {
  const cur = { ...(map[parentKey] ?? {}) };
  if (entry && entry.qty > 0) cur[itemId] = entry; else delete cur[itemId];
  const next = { ...map };
  if (Object.keys(cur).length) next[parentKey] = cur; else delete next[parentKey];
  return next;
}

/** วางจริงต่างจากค่าประมาณกี่ % (ลบ = ประหยัด) · ไม่มีค่าประมาณ = null */
export function nestDiffPct(actual: number, estimate: number | null | undefined): number | null {
  if (!(actual > 0) || !estimate || !(estimate > 0)) return null;
  return Math.round(((actual - estimate) / estimate) * 100);
}

/** ข้อความป้ายส่วนต่าง: "ประหยัด 7%" / "ใช้มากกว่า 5%" / "เท่ากับที่ประมาณ" */
export function nestDiffLabel(pct: number | null, t: (th: string, en: string) => string): string {
  if (pct == null) return "";
  if (pct === 0) return t("เท่ากับที่ประมาณ", "Same as estimate");
  return pct < 0 ? t(`ประหยัด ${-pct}%`, `${-pct}% less`) : t(`ใช้มากกว่า ${pct}%`, `${pct}% more`);
}
