"use client";

// ============================================================
// 📦 แพ็คสินค้า — /packing (ช่วงทดลอง · docs/packing-station.md)
// ยิงใบปะหน้า → เช็กของ → กล่อง/หมายเหตุ → กล้องอัด ≤ 60 วิ → จบเร็วด้วยใบถัดไป/การ์ด/แป้นเหยียบ/ปุ่มใหญ่
// ตัวสถานี = components/packing-station · กติกา = lib/packing · API = /api/packing
// ⚠️ ไม่ตัดสต๊อก ไม่ส่งสถานะไปร้านค้า · คลิปเก็บในเครื่องโต๊ะแพ็คจนกว่าจะเชื่อม NAS (§13)
// ============================================================

import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { LoadingState } from "@/components/state-views";
import { PackingStation } from "@/components/packing-station";

export default function PackingPage() {
  const { user, permsReady } = useAuth();
  const canPack = usePermission("packing.pack");
  return (
    <PlaygroundShell>
      <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4">
        <div className="mb-3">
          <h1 className="text-xl font-bold text-slate-900">แพ็คสินค้า</h1>
          <p className="text-sm text-slate-500">ยิงใบปะหน้า → เช็กของ → ปิดกล่อง · กล้องอัดคลิปไว้เป็นหลักฐาน · จับเวลาคนแพ็ค</p>
        </div>
        {!permsReady ? <LoadingState label="กำลังตรวจสิทธิ์…" />
          : !canPack ? <AccessDenied message="หน้านี้สำหรับผู้มีสิทธิ์แพ็คสินค้า (packing.pack)" />
          : <PackingStation packerName={user?.name || user?.email || "ไม่ทราบชื่อ"} />}
      </div>
    </PlaygroundShell>
  );
}
