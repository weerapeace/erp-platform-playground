// ============================================================
// parse-pasted-codes — แยก "รหัสหลายตัว" จากข้อความที่วาง (คัดลอกคอลัมน์จาก Excel / พิมพ์คั่นด้วย , ;) (pure เทสต์ได้)
// ใช้ที่: ตัวเลือกหลาย SKU (components/sku-multi-picker) → POST /api/pickers/skus { codes }
// ============================================================

/** แยกรหัส: ขึ้นบรรทัด / แท็บ / , / ; · ตัดช่องว่างหัวท้าย + เครื่องหมายคำพูดจาก Excel · ไม่ซ้ำ (ไม่สนตัวเล็ก/ใหญ่) · ลำดับตามที่วาง */
export function parsePastedCodes(text: string, max = 500): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(text ?? "").split(/[\r\n\t,;]+/)) {
    const c = part.trim().replace(/^["']+|["']+$/g, "").trim();
    if (!c || c.length > 80) continue;
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** ข้อความที่วาง "ดูเป็นรายการรหัส" ไหม (≥ 2 ตัว คั่นบรรทัด/แท็บ/จุลภาค) — ตัวเดียว = ค้นหาปกติ */
export function looksLikeCodeList(text: string): boolean {
  return /[\r\n\t,;]/.test(String(text ?? "").trim()) && parsePastedCodes(text).length >= 2;
}
