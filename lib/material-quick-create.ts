/**
 * ➕ เพิ่มวัสดุด่วน (วัสดุตีราคา design_price_items) — ส่วนที่ไม่ใช่หน้าจอ · เจ้าของขอ 2026-11-17
 *   similarMaterials = หาวัสดุชื่อคล้ายก่อนสร้าง (กันซ้ำ เช่น "ซับใน" กับ "ซับ ใน") · createDesignMaterial = สร้างผ่าน POST /api/master-v2/design-price-items
 *   (ด่านสิทธิ์ products.create + บันทึกประวัติ audit อยู่ที่ API กลางนั้นแล้ว)
 *   หน้าจอ: components/material-quick-create (MaterialAddSelect · MaterialQuickCreate) · เทสต์ lib/__tests__/material-quick-create.test.ts
 */
// apiFetch โหลดตอนสร้างจริง (ไฟล์นี้จะได้เทสต์ส่วนหาชื่อคล้ายได้โดยไม่ต้องต่อ Supabase)

export type QuickMaterial = { id: string; name: string; group?: string | null };

const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.,/()]+/g, "");

/** ระยะแก้คำ (Levenshtein) แบบสั้น ๆ — ใช้กับชื่อวัสดุ ไม่กี่สิบตัวอักษร */
function editDist(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * วัสดุในรายการที่ชื่อคล้ายกับชื่อที่จะสร้าง (เรียงคล้ายสุดก่อน · สูงสุด max ตัว)
 *   คล้าย = ชื่อเหมือนกันเมื่อไม่นับช่องว่าง/เครื่องหมาย · ชื่อหนึ่งอยู่ในอีกชื่อ (ยาว ≥ 2) · พิมพ์ต่างกัน 1 ตัว (ชื่อ ≥ 3) หรือ 2 ตัว (ชื่อ ≥ 7)
 */
export function similarMaterials<T extends { id: string; name: string }>(name: string, list: T[], max = 3): T[] {
  const k = norm(name); if (k.length < 2) return [];
  const scored: { m: T; s: number }[] = [];
  for (const m of list) {
    const n = norm(m.name); if (!n) continue;
    let s = -1;
    if (n === k) s = 0;
    else if (n.length >= 2 && (n.includes(k) || k.includes(n))) s = 1;
    else { const d = editDist(n, k), lim = Math.min(n.length, k.length) >= 7 ? 2 : Math.min(n.length, k.length) >= 3 ? 1 : 0; if (d <= lim) s = 1 + d; }
    if (s >= 0) scored.push({ m, s });
  }
  return scored.sort((a, b) => a.s - b.s || a.m.name.length - b.m.name.length).slice(0, max).map((x) => x.m);
}

/** สร้างวัสดุตีราคาใหม่ (ชื่อ + ชนิดถ้าเลือก) → คืน id/ชื่อ · ราคา/หน้ากว้างไปใส่ทีหลังที่หน้าวัสดุตีราคา */
export async function createDesignMaterial(name: string, groupId?: string | null): Promise<QuickMaterial> {
  const nm = name.trim().slice(0, 120);
  if (!nm) throw new Error("กรุณาใส่ชื่อวัสดุ");
  const { apiFetch } = await import("@/lib/api");
  const res = await apiFetch("/api/master-v2/design-price-items", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nm, ...(groupId ? { material_group_id: groupId } : {}) }) });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new Error("คุณไม่มีสิทธิ์เพิ่มวัสดุ — ให้หัวหน้าเพิ่มให้");
  if (!res.ok || j.error) throw new Error(typeof j.error === "string" ? j.error : "เพิ่มวัสดุไม่สำเร็จ กรุณาลองใหม่");
  const id = j.data?.id;
  if (typeof id !== "string") throw new Error("เพิ่มวัสดุไม่สำเร็จ กรุณาลองใหม่");
  return { id, name: typeof j.data?.name === "string" ? j.data.name : nm };
}
