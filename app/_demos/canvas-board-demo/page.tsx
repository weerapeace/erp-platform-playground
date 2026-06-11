"use client";

// ============================================================
// CanvasBoard Demo — หน้าทดลองของกลาง "กระดาน Section + การ์ด"
// ลากการ์ดข้ามโซนได้ (mock data — ไม่บันทึกจริง)
// ของจริงใช้ที่: /master/design-sheets (โซน = แบรนด์)
// ============================================================

import { useState } from "react";
import { CanvasBoard, type CanvasZone } from "@/components/canvas-board";

type DemoItem = { id: string; zone: string; title: string; status: string; due: string | null };

const ZONES: CanvasZone[] = [
  { id: "good-goods", title: "Good Goods", color: "#16a34a", hint: "ลากการ์ดมาวาง = ย้ายโซน" },
  { id: "brand-b", title: "Brand B", color: "#2563eb" },
  { id: "no-brand", title: "ไม่ระบุแบรนด์", color: null },
];

const INITIAL: DemoItem[] = [
  { id: "1", zone: "good-goods", title: "กระเป๋าผ้าแคนวาสรุ่นใหม่", status: "ออกแบบ", due: "2026-06-12" },
  { id: "2", zone: "good-goods", title: "เข็มขัดหนังลายใหม่", status: "เสนอราคา", due: "2026-06-09" },
  { id: "3", zone: "brand-b", title: "พวงกุญแจตัวการ์ตูน", status: "อนุมัติ", due: null },
  { id: "4", zone: "no-brand", title: "งานตัวอย่างลูกค้าใหม่", status: "ออกแบบ", due: "2026-06-25" },
];

export default function CanvasBoardDemo() {
  const [items, setItems] = useState<DemoItem[]>(INITIAL);
  const [log, setLog] = useState<string[]>([]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">🗂 CanvasBoard — ของกลาง</h1>
      <p className="text-sm text-slate-500 mb-5">
        กระดานแบ่งโซน (section) + การ์ดลากข้ามโซนได้ — โมดูลส่งหน้าตาการ์ดเอง (renderCard) ·
        ใช้จริงที่ <a href="/master/design-sheets" className="text-blue-600 hover:underline">Design Sheets</a> · doc: docs/canvas-board.md
      </p>

      <CanvasBoard<DemoItem>
        zones={ZONES} items={items}
        getItemId={(it) => it.id}
        getZoneId={(it) => it.zone}
        onMove={(it, to) => {
          setItems((list) => list.map((x) => (x.id === it.id ? { ...x, zone: to } : x)));
          setLog((l) => [`ย้าย "${it.title}" → ${ZONES.find((z) => z.id === to)?.title ?? to}`, ...l].slice(0, 5));
        }}
        onCardClick={(it) => setLog((l) => [`คลิกการ์ด "${it.title}"`, ...l].slice(0, 5))}
        renderCard={(it, dragging) => (
          <div className={`bg-white rounded-lg border border-slate-200 p-2.5 shadow-sm ${dragging ? "shadow-xl ring-2 ring-blue-300 rotate-1" : "hover:border-blue-300"}`}>
            <p className="text-[13px] font-medium text-slate-700 leading-snug line-clamp-2 mb-1">{it.title}</p>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{it.status}</span>
              <span>{it.due ?? "—"}</span>
            </div>
          </div>
        )}
      />

      <div className="mt-5 p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <p className="text-xs font-semibold text-slate-500 mb-1">เหตุการณ์ล่าสุด</p>
        {log.length === 0
          ? <p className="text-xs text-slate-300">— ลองลากการ์ดข้ามโซน หรือคลิกการ์ด —</p>
          : log.map((l, i) => <p key={i} className="text-xs text-slate-500">• {l}</p>)}
      </div>
    </div>
  );
}
