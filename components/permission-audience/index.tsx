"use client";
/**
 * PermissionAudienceButton — ของกลาง: ปุ่ม "👁 ใครเห็น" ตั้งว่าใครได้สิทธิ์ 1 ตัว (ตามตำแหน่ง + ยกเว้นรายคน)
 *
 * ใช้ทำอะไร: วางข้างส่วนที่ซ่อนตามสิทธิ์ (เช่น ต้นทุน/กำไร ในแท็บราคา) ให้แอดมินตั้งได้ตรงนั้น ไม่ต้องไปหาหน้าสิทธิ์
 * ทำงานบนของเดิมทั้งหมด (ไม่มีตาราง/สิทธิ์ใหม่):
 *   ตามตำแหน่ง = GET/PATCH /api/admin/roles (RPC erp_role_permission_toggle — ต้อง admin.roles · มีประวัติในตัว)
 *   ยกเว้นรายคน = UserPermOverrideButton (ของกลาง · erp_user_permissions grant/revoke — ต้อง admin.users)
 *   ผลจริงเช็กที่ erp_can (ผู้ดูแลระบบได้เสมอ · รายคนชนะตำแหน่ง) → มีผลทุกที่ที่ใช้สิทธิ์นี้
 * ใช้เมื่อ: อยากให้ตั้ง "ใครเห็น" ได้ตรงหน้าที่ใช้ · ห้ามใช้: ตั้งสิทธิ์หลายตัวพร้อมกัน (ใช้ /admin/role-board หรือ MenuPermissionMatrix)
 * คนไม่มีสิทธิ์ admin.roles = ไม่เห็นปุ่ม
 * ใช้ที่: แท็บราคา Parent SKU (products.cost.view — เจ้าของขอ 2026-11-12 "อยากให้ตั้งค่าได้ว่าใครเห็น")
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { UserPermOverrideButton } from "@/components/user-perm-override";

type Role = { key: string; label: string; active: boolean; sort_order: number };

export function PermissionAudienceButton({ permissionKey, label, note, className = "" }: {
  permissionKey: string;
  /** ชื่อสิทธิ์ภาษาคน เช่น "ดูต้นทุน / กำไร" */
  label: string;
  /** บอกว่ามีผลที่ไหนบ้าง */
  note?: string;
  className?: string;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const canRoles = can("admin.roles");
  const canPeople = can("admin.users");
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const j = await apiFetch("/api/admin/roles").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRoles(((j.roles ?? []) as Role[]).filter((r) => r.active).sort((a, b) => a.sort_order - b.sort_order));
      setGranted(new Set(((j.matrix ?? []) as { role_key: string; permission_key: string }[]).filter((m) => m.permission_key === permissionKey).map((m) => m.role_key)));
      // นับคนต่อตำแหน่ง (ต้องมีสิทธิ์ดูผู้ใช้ · ไม่มี = ไม่โชว์จำนวน)
      if (canPeople) {
        apiFetch("/api/admin/users").then((r) => r.json()).then((u) => {
          const c: Record<string, number> = {};
          for (const x of (u.data ?? []) as { role: string; active: boolean }[]) if (x.active !== false) c[x.role] = (c[x.role] ?? 0) + 1;
          setCounts(c);
        }).catch(() => {});
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดสิทธิ์ไม่สำเร็จ"); }
  }, [permissionKey, canPeople]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const toggle = async (role: Role) => {
    if (role.key === "admin" || busy) return;
    const next = !granted.has(role.key);
    const flip = (on: boolean) => setGranted((p) => { const s = new Set(p); if (on) s.add(role.key); else s.delete(role.key); return s; });
    setBusy(role.key); flip(next);
    try {
      const res = await apiFetch("/api/admin/roles", { method: "PATCH", body: JSON.stringify({ kind: "toggle", role_key: role.key, permission_key: permissionKey, granted: next }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || `บันทึกไม่สำเร็จ (${res.status})`);
      toast.success(next ? `${role.label} เห็น “${label}” แล้ว` : `${role.label} ไม่เห็น “${label}” แล้ว`);
    } catch (e) {
      flip(!next);
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setBusy(null); }
  };

  if (!canRoles) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={`ตั้งว่าใครเห็น “${label}”`}
        className={`h-7 px-2.5 text-xs rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1 ${className}`}>
        <Icon name="view" size={14} /> ใครเห็น
      </button>
      {open && (
        <ERPModal open onClose={() => setOpen(false)} size="md" title={`ใครเห็น “${label}”`}
          description={note ?? "ติ๊กแล้วบันทึกทันที · มีผลทุกที่ที่ใช้สิทธิ์นี้"}
          footer={<div className="flex justify-end w-full"><button onClick={() => setOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button></div>}>
          {err ? <ErrorState title="โหลดสิทธิ์ไม่สำเร็จ" hint={err} onRetry={() => void load()} />
            : !roles ? <LoadingState />
            : (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-[11.5px] font-semibold text-slate-500 mb-1">ตามตำแหน่ง</div>
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {roles.map((r) => {
                      const fixed = r.key === "admin";
                      const on = fixed || granted.has(r.key);
                      return (
                        <label key={r.key} className={`flex items-center gap-2 px-3 py-2 ${fixed ? "" : "cursor-pointer hover:bg-slate-50"}`}>
                          <input type="checkbox" checked={on} disabled={fixed || busy === r.key} onChange={() => void toggle(r)} />
                          <span className="flex-1">{r.label}{counts[r.key] != null && <span className="ml-1 text-xs text-slate-400">({counts[r.key]} คน)</span>}</span>
                          {fixed && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">เห็นเสมอ</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
                {canPeople && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11.5px] font-semibold text-slate-500">ยกเว้นรายคน</span>
                    <UserPermOverrideButton permissionKey={permissionKey} label={label} />
                    <span className="text-[11px] text-slate-400">เปิด/ปิดให้เฉพาะคน — ชนะค่าตามตำแหน่ง</span>
                  </div>
                )}
              </div>
            )}
        </ERPModal>
      )}
    </>
  );
}
