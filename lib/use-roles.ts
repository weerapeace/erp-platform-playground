"use client";

/**
 * useRoleOptions — ดึงรายชื่อ "ตำแหน่ง (role)" จากระบบ role กลาง (erp_roles)
 * ของกลาง: ใช้แทนการ hardcode รายชื่อ role ใน UI (field permission ฯลฯ)
 *
 * - ยิง /api/admin/roles ครั้งเดียว แล้ว cache ระดับ module → ทุกจุดที่เรียกใช้ร่วม fetch เดียว
 * - ตัด admin ออก (admin เห็น/แก้ได้ทุกอย่างเสมอ) + ตัด role ที่ปิดใช้งาน
 */
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export type RoleOption = { key: string; label: string };

let _cache: RoleOption[] | null = null;
let _inflight: Promise<RoleOption[]> | null = null;

function loadRoles(): Promise<RoleOption[]> {
  if (_cache) return Promise.resolve(_cache);
  if (!_inflight) {
    _inflight = apiFetch("/api/admin/roles")
      .then((r) => r.json())
      .then((j) => {
        const roles = ((j.roles ?? []) as { key: string; label: string; active?: boolean }[])
          .filter((r) => r.key && r.active !== false && r.key !== "admin")
          .map((r) => ({ key: r.key, label: r.label || r.key }));
        _cache = roles;
        return roles;
      })
      .catch(() => { _cache = []; return []; });
  }
  return _inflight;
}

export function useRoleOptions(): RoleOption[] {
  const [roles, setRoles] = useState<RoleOption[]>(_cache ?? []);
  useEffect(() => {
    let alive = true;
    loadRoles().then((r) => { if (alive) setRoles(r); });
    return () => { alive = false; };
  }, []);
  return roles;
}
