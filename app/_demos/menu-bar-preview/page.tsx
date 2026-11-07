"use client";

// ตัวอย่างของกลาง MenuBar (แถบเมนูชี้แล้วเด้ง) — components/menu-bar · คู่มือ docs/menu-bar.md
import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { MenuBar, type MenuDef } from "@/components/menu-bar";

type Filter = "all" | "active" | "urgent" | "closed";

export default function MenuBarPreviewPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"board" | "gallery">("board");
  const [strip, setStrip] = useState(true);
  const [cols, setCols] = useState<Record<string, boolean>>({ new: true, design: true, done: true, cancelled: false });
  const [log, setLog] = useState<string[]>([]);
  const say = (s: string) => setLog((l) => [s, ...l].slice(0, 5));

  const FILTERS: { key: Filter; label: string; icon: string; count: number }[] = [
    { key: "all", label: "ทั้งหมด", icon: "list", count: 58 },
    { key: "active", label: "กำลังทำ", icon: "hourglass", count: 41 },
    { key: "urgent", label: "ด่วน", icon: "alert-triangle", count: 7 },
    { key: "closed", label: "ปิดงานแล้ว", icon: "circle-check", count: 17 },
  ];
  const cur = FILTERS.find((f) => f.key === filter)!;
  const menus: MenuDef[] = [
    { key: "filter", icon: "filter", label: filter === "all" ? "ตัวกรอง" : `ตัวกรอง: ${cur.label}`, active: filter !== "all", onClear: () => setFilter("all"),
      items: FILTERS.map((f) => ({ type: "radio" as const, key: f.key, label: f.label, icon: f.icon, checked: filter === f.key, onSelect: () => setFilter(f.key), hint: f.count })) },
    { key: "work", icon: "bolt", label: "ทำงาน", items: [
      { key: "board", icon: "presentation", label: "ส่งขึ้นกระดาน", onSelect: () => say("กด: ส่งขึ้นกระดาน") },
      { key: "order", icon: "shopping-cart", label: "ลงออเดอร์", onSelect: () => say("กด: ลงออเดอร์") },
      { type: "divider", key: "d" },
      { type: "submenu", key: "sum", icon: "file-text", label: "สรุปงาน", items: [
        { key: "new", icon: "plus", label: "สรุปใหม่", onSelect: () => say("กด: สรุปใหม่") },
        { key: "saved", icon: "history", label: "สรุปที่บันทึกไว้", onSelect: () => say("กด: สรุปที่บันทึกไว้") },
      ] },
    ] },
    { key: "view", icon: "layout-dashboard", label: "มุมมอง", items: [
      { type: "radio", key: "board", icon: "layout-kanban", label: "บอร์ดตามสถานะ", checked: view === "board", onSelect: () => setView("board") },
      { type: "radio", key: "gallery", icon: "photo", label: "การ์ดรูปใหญ่", checked: view === "gallery", onSelect: () => setView("gallery") },
      { type: "divider", key: "d" },
      { type: "submenu", key: "cols", icon: "columns", label: "คอลัมน์ที่โชว์", hint: `${Object.values(cols).filter(Boolean).length}/4`, render: () => (
        <div className="p-1">
          {Object.entries(cols).map(([k, on]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 hover:bg-slate-100">
              <input type="checkbox" checked={on} onChange={() => setCols((c) => ({ ...c, [k]: !c[k] }))} className="h-3.5 w-3.5" /> {k}
            </label>
          ))}
        </div>
      ) },
      { type: "toggle", key: "strip", icon: "color-swatch", label: "แถบสีแบรนด์", on: strip, onSelect: () => setStrip((s) => !s) },
    ] },
    { key: "settings", icon: "settings", label: "ตั้งค่า", items: [
      { key: "status", icon: "arrows-shuffle", label: "จัดการสถานะ", onSelect: () => say("กด: จัดการสถานะ") },
      { key: "brand", icon: "tag", label: "ตั้งค่าแบรนด์", onSelect: () => say("กด: ตั้งค่าแบรนด์") },
    ] },
  ];

  return (
    <PlaygroundShell>
      <div className="max-w-5xl space-y-4 px-8 py-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">แถบเมนูชี้แล้วเด้ง (MenuBar)</h1>
          <p className="mt-1 text-sm text-slate-500">ชี้เมาส์ที่หัวเมนู = รายการโผล่ · จอสัมผัสกดเปิด · เลือกตัวกรองแล้วหัวเมนูเป็นสีฟ้า กด × เพื่อล้าง</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <input placeholder="ค้นหา..." className="h-9 w-56 rounded-lg border border-slate-200 px-3 text-sm" />
          <MenuBar menus={menus} />
        </div>
        <div className="grid gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 md:grid-cols-2">
          <div>ตัวกรอง: <b>{cur.label}</b> · มุมมอง: <b>{view}</b> · แถบสีแบรนด์: <b>{strip ? "เปิด" : "ปิด"}</b></div>
          <div>คอลัมน์ที่โชว์: <b>{Object.entries(cols).filter(([, v]) => v).map(([k]) => k).join(", ")}</b></div>
          <div className="md:col-span-2 text-xs text-slate-400">ล่าสุด: {log.join(" · ") || "—"}</div>
        </div>
      </div>
    </PlaygroundShell>
  );
}
