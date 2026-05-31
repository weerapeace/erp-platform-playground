"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Keyboard Shortcuts cheatsheet
 *
 * เปิดด้วย `?` (no shift, not in input) → modal cheatsheet
 * ESC ปิด
 */

type Shortcut = { keys: string[]; label: string };
type Section = { title: string; icon: string; items: Shortcut[] };

const SECTIONS: Section[] = [
  {
    title: "ทั่วระบบ", icon: "🌐",
    items: [
      { keys: ["⌘", "K"],      label: "เปิด Global Search" },
      { keys: ["Ctrl", "K"],   label: "เปิด Global Search (Win/Linux)" },
      { keys: ["/"],            label: "เปิด Global Search (เมื่อไม่อยู่ใน input)" },
      { keys: ["?"],            label: "เปิดหน้านี้ (Cheatsheet)" },
      { keys: ["Esc"],          label: "ปิด modal / dropdown / dialog" },
    ],
  },
  {
    title: "Picker / Dropdown", icon: "🔍",
    items: [
      { keys: ["↑"], label: "เลื่อนขึ้นในรายการ" },
      { keys: ["↓"], label: "เลื่อนลงในรายการ" },
      { keys: ["↵"], label: "เลือกรายการที่ highlight" },
      { keys: ["Tab"], label: "เลือก (สำหรับ mention)" },
    ],
  },
  {
    title: "Comment / Form", icon: "💬",
    items: [
      { keys: ["@"],                  label: "เปิด mention autocomplete" },
      { keys: ["⌘", "↵"],             label: "ส่ง comment" },
      { keys: ["Ctrl", "↵"],          label: "ส่ง comment (Win/Linux)" },
    ],
  },
  {
    title: "Table / DataTable", icon: "📊",
    items: [
      { keys: ["คลิกแถว"],            label: "เปิด detail drawer" },
      { keys: ["Shift", "คลิก"],     label: "Select range (ถ้าเปิด multi-select)" },
      { keys: ["ดับเบิลคลิก"],       label: "Inline edit (ถ้า field รองรับ)" },
    ],
  },
];

// ============================================================
// Modal component
// ============================================================

export function KeyboardShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (typeof window === "undefined" || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-slate-900/40 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden"
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">⌨️ Keyboard Shortcuts</h2>
          <button onClick={onClose} aria-label="ปิด"
            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            ×
          </button>
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          {SECTIONS.map(s => (
            <section key={s.title}>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span>{s.icon}</span>{s.title}
              </h3>
              <div className="space-y-1.5">
                {s.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-700">{item.label}</span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {item.keys.map((k, j) => (
                        <React.Fragment key={j}>
                          {j > 0 && <span className="text-slate-300">+</span>}
                          <kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-700 min-w-[20px] text-center">
                            {k}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 text-center">
          กด <kbd className="bg-white border border-slate-200 px-1 rounded">Esc</kbd> เพื่อปิด ·
          <kbd className="bg-white border border-slate-200 px-1 rounded ml-1">?</kbd> เพื่อเปิดอีกครั้ง
        </div>
      </div>
    </div>,
    document.body
  );
}
