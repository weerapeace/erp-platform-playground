/**
 * 👥 หาผู้ใช้ที่มีสิทธิ์ (ตามตำแหน่ง + ยกเว้นรายคน · ผู้ดูแลระบบได้เสมอ · เฉพาะบัญชีที่ยังใช้งาน)
 *   ใช้หา "ใครควรได้แจ้งเตือน" เช่น คนที่เผยแพร่ดีไซน์เว็บได้ — ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น (supabaseAdmin)
 *   anyOf = มีอย่างน้อย 1 คีย์ · allOf = ต้องมีครบทุกคีย์
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;

export async function usersWithPerms(admin: Admin, anyOf: string[], allOf: string[] = []): Promise<string[]> {
  const keys = [...new Set([...anyOf, ...allOf])];
  if (!keys.length) return [];
  const [profs, rp, ov] = await Promise.all([
    admin.from("user_profiles").select("id, role").eq("active", true),
    admin.from("erp_role_permissions").select("role_key, permission_key").in("permission_key", keys),
    admin.from("erp_user_permissions").select("user_id, permission_key, mode").in("permission_key", keys),
  ]);
  const roleHas = new Set(((rp.data ?? []) as { role_key: string; permission_key: string }[]).map((r) => `${r.role_key}|${r.permission_key}`));
  const over = new Map(((ov.data ?? []) as { user_id: string; permission_key: string; mode: string }[]).map((o) => [`${o.user_id}|${o.permission_key}`, o.mode]));
  return ((profs.data ?? []) as { id: string; role: string | null }[])
    .filter((p) => {
      const has = (k: string) => {
        if (p.role === "admin") return true; // เหมือน erp_can: ผู้ดูแลระบบได้ทุกอย่างเสมอ
        const m = over.get(`${p.id}|${k}`);
        if (m) return m === "grant";
        return roleHas.has(`${p.role ?? ""}|${k}`);
      };
      return (!anyOf.length || anyOf.some(has)) && allOf.every(has);
    })
    .map((p) => p.id);
}
