"use client";

/**
 * เมนู dropdown จัดการแม่แบบพิมพ์บาร์โค้ด — โหลด / ตั้งค่าเริ่มต้น(⭐) / เปลี่ยนชื่อ / ลบ
 * ย้ายปุ่มลบ-แก้ไขมาไว้ในเมนู (กันเผลอกดลบ) · ลบมี confirm ที่ฝั่ง parent
 * inline style — ใช้ได้ทั้งใน modal (tailwind) และหน้าพิมพ์ (inline)
 */
import { useState } from "react";
import type { SavedTemplate } from "./labels";

export function TemplateMenu({ templates, defaultTpl, onLoad, onSetDefault, onRename, onDelete }: {
  templates: SavedTemplate[];
  defaultTpl: string | null;
  onLoad: (name: string) => void;
  onSetDefault: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const iconBtn = { border: "none", background: "none", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 2 } as const;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ height: 32, padding: "0 10px", fontSize: 13, borderRadius: 8, border: "1px solid #e2e8f0",
          background: open ? "#f1f5f9" : "#fff", color: "#475569", cursor: "pointer" }}>⚙️ จัดการแม่แบบ ▾</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, marginTop: 4, minWidth: 260, maxHeight: 280, overflowY: "auto",
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.14)", padding: 6 }}>
            {templates.length === 0 && <div style={{ padding: 10, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>ยังไม่มีแม่แบบ</div>}
            {templates.map((t) => (
              <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 4px", borderRadius: 6 }}>
                <button type="button" onClick={() => onSetDefault(t.name)} title="ตั้งเป็นค่าเริ่มต้น (เปิดมาใช้เลย)"
                  style={{ ...iconBtn, color: defaultTpl === t.name ? "#f59e0b" : "#cbd5e1" }}>{defaultTpl === t.name ? "★" : "☆"}</button>
                <button type="button" onClick={() => { onLoad(t.name); setOpen(false); }} title="กดเพื่อโหลดแม่แบบนี้"
                  style={{ flex: 1, textAlign: "left", border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#334155", padding: "4px 2px",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.name}{defaultTpl === t.name && <span style={{ color: "#b45309", fontSize: 11 }}> (เริ่มต้น)</span>}
                </button>
                <button type="button" onClick={() => onRename(t.name)} title="เปลี่ยนชื่อ" style={{ ...iconBtn, color: "#64748b" }}>✏️</button>
                <button type="button" onClick={() => onDelete(t.name)} title="ลบ" style={{ ...iconBtn, color: "#ef4444" }}>🗑</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
