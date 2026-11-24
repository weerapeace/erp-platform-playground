"use client";
/**
 * 🏪 ศูนย์ร้านออนไลน์ — /master/channel-portal · หน้าแรกของแอป "ช่องทางขาย" (แทนการเข้า BigSeller)
 * รวมทุกร้านทุกแบรนด์: สถานะเชื่อมต่อ/วันต้องเชื่อมใหม่ · ดึงออเดอร์ล่าสุด · ยอดขายวันนี้ · รอจัดส่ง · งานที่ต้องทำ · ทางลัดทุกหน้า + หมุดของฉัน
 * เป็นแค่ทางเข้า — ไม่มีตรรกะของหน้าปลายทาง · ข้อมูล /api/channel-portal (อ่านอย่างเดียว) · แสดงผล components/channel-portal
 * คู่มือ docs/channel-portal.md
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/state-views";
import { ChannelPortalView } from "@/components/channel-portal/portal-view";
import type { PortalResponse } from "@/lib/channel-portal";

export default function ChannelPortalPage() {
  const [data, setData] = useState<PortalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const onReload = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setError(null);
    apiFetch("/api/channel-portal")
      .then(async (r) => (await r.json().catch(() => ({ ok: false, error: "ระบบตอบผิดพลาด" }))) as PortalResponse)
      .then((j) => { if (!alive) return; if (!j.ok) setError(j.error ?? "โหลดข้อมูลร้านไม่สำเร็จ"); else setData(j); })
      .catch(() => { if (alive) setError("โหลดข้อมูลร้านไม่สำเร็จ ลองใหม่อีกครั้ง"); });
    return () => { alive = false; };
  }, [reload]);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      {error && !data ? (
        <ErrorState title="โหลดข้อมูลร้านไม่สำเร็จ" hint={error} onRetry={onReload} />
      ) : !data ? (
        <LoadingState label="กำลังรวบรวมข้อมูลทุกร้าน…" />
      ) : (
        <ChannelPortalView data={data} onReload={onReload} />
      )}
    </div>
  );
}
