/**
 * ความพร้อมลงร้านต่อแถว (แท็บแพลตฟอร์มของ Parent SKU) — pure + เทสต์ lib/__tests__/platform-create-readiness.test.ts
 * --------------------------------------------------------------------------
 * เจ้าของขอ 2026-11-15: "โชว์ว่าข้อมูลที่จำเป็นครบรึยัง (ขาดอะไร)"
 * ⚠️ ไม่ใช่ตัวตรวจตัวที่ 2 — ค่ามาจากตัวประกอบข้อมูลตัวเดียวกับตัวช่วยลงสินค้า (lib/<ร้าน>-create-plan ผ่าน load ของ
 *    /api/<ร้าน>/create-product) ที่ GET /api/product-platforms/create-readiness เรียกรวดเดียวทุกร้าน
 *    ไฟล์นี้แค่ "นับ/สรุปเป็นข้อความ" ให้ตรงกับที่ตัวช่วยนับ (ข้อที่ขาด + ด่านอื่น ยกเว้น "มีบน … แล้ว")
 * ห้าม import "@/..." (ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์)
 */

export type CreateReadiness = {
  code: string;
  /** มีบนร้านแล้ว (รหัสสินค้าบนร้าน) */
  on_shop: string | null;
  /** ข้อที่ต้องแก้ก่อนลง (ภาษาคน) — ว่าง = พร้อมลง */
  missing: string[];
  /** ค่าที่จะส่งจริง (ไว้โชว์สรุปในแถว) */
  title: string | null;
  category: string | null;
  images: number;
  /** ตรวจไม่สำเร็จ (เช่น ร้านตอบช้า) — ไม่ใช่ "ขาดข้อมูล" */
  error: string | null;
};

/** ข้อที่ขาด = นับแบบเดียวกับตัวช่วยลงสินค้า: ข้อมูลที่ขาด + ด่านอื่น (ไม่นับ "มีบน … แล้ว" — แยกเป็น on_shop) · ไม่ซ้ำ */
export function createMissingOf(missing: readonly string[] | null | undefined, blockers: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const m of [...(missing ?? []), ...(blockers ?? []).filter((b) => !/^มีบน\s/.test(b))]) {
    const t = String(m ?? "").trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** ข้อความป้ายในแถว: "พร้อมลง" / "ขาด N: a · b · c …" */
export function readinessText(r: Pick<CreateReadiness, "missing" | "error" | "on_shop">, max = 3): { tone: "ok" | "warn" | "error" | "shop"; text: string } {
  if (r.error) return { tone: "error", text: `ตรวจไม่สำเร็จ: ${r.error}` };
  if (r.on_shop) return { tone: "shop", text: "มีบนร้านแล้ว" };
  if (!r.missing.length) return { tone: "ok", text: "พร้อมลง" };
  const head = r.missing.slice(0, max).join(" · ");
  return { tone: "warn", text: `ขาด ${r.missing.length}: ${head}${r.missing.length > max ? " …" : ""}` };
}
