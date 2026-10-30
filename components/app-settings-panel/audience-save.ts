/**
 * บันทึก "ใครเห็นเมนูไหน" (erp_menu_items.audience) ทีละเมนูที่แก้ — ใช้ร่วม 2 แท็บ: 👁 ใครเห็นเมนูไหน + 👤 ตามพนักงาน
 * PATCH /api/menu (ตรวจ admin.users + เขียนประวัติ menu.update ฝั่งเซิร์ฟเวอร์)
 */
import { apiFetch } from "@/lib/api";
import { cleanAudience, type MenuAudience } from "@/lib/menu-audience";

export const sameAudience = (a: MenuAudience | null, b: MenuAudience | null) => JSON.stringify(a) === JSON.stringify(b);

/** คืน { ok: จำนวนเมนูที่บันทึกได้, errs: ข้อความผิดพลาดต่อเมนู } */
export async function saveMenuAudiences(changed: { id: string; label: string }[], draft: Record<string, MenuAudience | null>) {
  let ok = 0;
  const errs: string[] = [];
  for (const it of changed) {
    try {
      const r = await apiFetch("/api/menu", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, patch: { audience: cleanAudience(draft[it.id]) } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      ok++;
    } catch (e) { errs.push(`${it.label}: ${e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"}`); }
  }
  return { ok, errs };
}
