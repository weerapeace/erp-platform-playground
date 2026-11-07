"use client";

/**
 * LegacyMovedNotice — ของกลาง: หน้าแจ้ง "หน้านี้เลิกใช้แล้ว ย้ายไปที่ใหม่"
 *   ใช้กับหน้าระบบเก่าที่ปิดแล้ว แต่อาจมีคนบุ๊กมาร์กไว้ — บอกว่าไปใช้ที่ไหนแทน + ปุ่มพาไป
 *   ไม่ลบข้อมูลเก่าในฐานข้อมูล (ตารางยังอยู่) · ใช้ครั้งแรก 2026-11-07 ปิดระบบจัดซื้อชุดเก่า
 * ของกลางที่ใช้: PlaygroundShell · EmptyState · Icon
 */
import { useRouter } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { EmptyState } from "@/components/state-views";
import { Icon } from "@/components/icon";

export function LegacyMovedNotice({ title, to, toLabel, note }: {
  /** ชื่อหน้าเดิม เช่น "ใบขอซื้อ (ระบบเก่า)" */
  title: string;
  /** ที่อยู่หน้าใหม่ */
  to: string;
  /** ชื่อหน้าใหม่บนปุ่ม */
  toLabel: string;
  /** อธิบายเพิ่ม (ไม่บังคับ) */
  note?: string;
}) {
  const router = useRouter();
  return (
    <PlaygroundShell>
      <div className="max-w-xl mx-auto px-6 py-16">
        <EmptyState
          icon={<Icon value="i:archive" size={28} />}
          title={`${title} — เลิกใช้แล้ว`}
          hint={note ?? `หน้านี้เป็นระบบชุดเก่าที่ไม่มีใครใช้แล้ว ข้อมูลเดิมยังเก็บไว้ในฐานข้อมูล · งานใหม่ให้ใช้ "${toLabel}"`}
          action={{ label: `ไปที่ ${toLabel}`, onClick: () => router.push(to) }}
        />
      </div>
    </PlaygroundShell>
  );
}
