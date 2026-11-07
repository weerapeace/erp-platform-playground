"use client";

// ตัวอย่างของกลาง DateCards (การ์ดวันสำคัญ + เส้นเวลา) — components/date-cards · คู่มือ docs/date-cards.md
import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DateCards } from "@/components/date-cards";

export default function DateCardsPreviewPage() {
  const [d, setD] = useState({ order: "2026-07-21", appt: "2026-11-12", due: "2026-11-05" });
  const [muted, setMuted] = useState(false);
  const items = [
    { key: "order", label: "วันที่สั่ง", icon: "cart", kind: "since" as const, value: d.order, onChange: (v: string) => setD({ ...d, order: v }) },
    { key: "appt", label: "วันนัด / ได้ตัวอย่าง", icon: "calendar", kind: "due" as const, value: d.appt, onChange: (v: string) => setD({ ...d, appt: v }) },
    { key: "due", label: "Deadline ส่งงาน", icon: "flag", kind: "due" as const, value: d.due, onChange: (v: string) => setD({ ...d, due: v }) },
  ];
  return (
    <PlaygroundShell>
      <div className="px-8 py-6 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">การ์ดวันสำคัญ (DateCards)</h1>
          <p className="text-sm text-slate-500 mt-1">กดการ์ดเพื่อเลือกวัน · ✕ ล้างวัน · ป้ายสี อีก/เลยกี่วัน · เส้นเวลาจากวันสั่งถึงกำหนด</p>
          <label className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} /> งานปิดแล้ว (ไม่เตือนสี)</label>
        </div>
        <section><h2 className="text-sm font-medium text-slate-600 mb-2">แบบการ์ด</h2><DateCards items={items} muted={muted} timeline={{ from: "order", to: ["due", "appt"] }} /></section>
        <section className="max-w-xs"><h2 className="text-sm font-medium text-slate-600 mb-2">แบบแถว (ที่แคบ)</h2><DateCards compact items={items} muted={muted} timeline={{ from: "order", to: ["due", "appt"] }} /></section>
        <section><h2 className="text-sm font-medium text-slate-600 mb-2">ดูอย่างเดียว + ยังไม่ตั้งวัน</h2><DateCards items={items.map((i) => ({ ...i, onChange: undefined, value: i.key === "appt" ? "" : i.value }))} /></section>
      </div>
    </PlaygroundShell>
  );
}
