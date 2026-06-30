"use client";

/**
 * AppAccessGate — guard กลาง "ใครเข้าแอปนี้ได้" สำหรับ standalone shell (Payroll ฯลฯ)
 *
 * ใช้กฎเดียวกับ PlaygroundShell (blockedAppLabel): แอปถูกล็อกเมื่อ erp_app_groups.permission_key มีค่า
 * → ต้องมีสิทธิ์นั้นถึงเข้าได้ · admin มีทุกสิทธิ์ในชุด perms อยู่แล้ว
 *
 * ทำไมต้องมี: หน้า /payroll/* ใช้ PayrollShell (ไม่ใช่ PlaygroundShell) เลยไม่มี guard
 * → เดิมพนักงานพิมพ์ URL/กดจาก launcher เข้าได้ทั้งที่แอปล็อกไว้. ของกลางตัวนี้อุดช่องนั้น
 * (ฝั่ง API ยังมี guardApi กันข้อมูลหลุดอีกชั้น — อันนี้กันระดับ "เข้าหน้า")
 */
import { useEffect, useState } from "react";
import { useAuth, AccessDenied, type Permission } from "@/components/auth";
import { cachedGetJson } from "@/lib/shell-cache";
import type { AppGroup } from "@/components/playground-shell";

/** เช็คสิทธิ์เข้าแอป appKey — อิงล็อกของ erp_app_groups (ของกลางเดียวกับ PlaygroundShell) */
export function useAppGuard(appKey: string): { blocked: boolean; appLabel: string | null } {
  const { user, ready, can, permsReady } = useAuth();
  const [apps, setApps] = useState<AppGroup[] | null>(null);

  useEffect(() => {
    let alive = true;
    cachedGetJson<{ data?: AppGroup[] }>("/api/menu/apps")
      .then((j) => { if (alive) setApps(Array.isArray(j.data) ? (j.data as AppGroup[]) : []); })
      .catch(() => { if (alive) setApps([]); });
    return () => { alive = false; };
  }, []);

  // ยังไม่ login / สิทธิ์ DB ยังโหลดไม่เสร็จ / ยังไม่ได้รายชื่อแอป → ไม่บล็อก
  // (กันบล็อกพลาดตอนใช้ค่าสำรอง — ข้อมูลยังปลอดภัยที่ API guard)
  if (!user || !ready || !permsReady || apps === null) return { blocked: false, appLabel: null };

  const ag = apps.find((a) => a.key === appKey);
  if (!ag?.permission_key) return { blocked: false, appLabel: null };   // ไม่ล็อก = ทุกคนเข้าได้
  return { blocked: !can(ag.permission_key as Permission), appLabel: ag.label };
}

/** ห่อเนื้อหา — ถ้าไม่มีสิทธิ์เข้าแอปนี้ โชว์ AccessDenied แทน */
export function AppAccessGate({ appKey, children }: { appKey: string; children: React.ReactNode }) {
  const { blocked, appLabel } = useAppGuard(appKey);
  if (blocked) return <AccessDenied message={`คุณไม่มีสิทธิ์เข้าถึงแอป "${appLabel}" — ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์`} />;
  return <>{children}</>;
}
