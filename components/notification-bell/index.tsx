"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth";
import type { Notification } from "@/app/api/notifications/route";
import { useNotificationFeed } from "./feed";

// ---- Event type → icon ----
const EVENT_ICON: Record<string, string> = {
  "pr.submitted": "🛒",
  "pr.approved":  "✓",
  "pr.rejected":  "✗",
  "pr.cancelled": "⊘",
};

export function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "เมื่อสักครู่";
  if (diff < 3600)  return `${Math.floor(diff/60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ชม.ที่แล้ว`;
  if (diff < 86400*7) return `${Math.floor(diff/86400)} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day:"numeric", month:"short" });
}

export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  // ข้อมูลจากตัวดึงกลาง (ถามทุก 30 วิเฉพาะตอนแท็บเปิด · ใช้ร่วมกับการ์ดแจ้งเตือนลอย ไม่ยิงซ้ำ)
  const { items, unread, loading, refresh, markRead: markReadFeed, markAllRead } = useNotificationFeed(user?.id);
  const [open,   setOpen]   = useState(false);
  const [openUp, setOpenUp] = useState(false);   // เด้งขึ้นบนถ้าที่ว่างด้านล่างไม่พอ (กระดิ่งอยู่ท้าย sidebar = ติดล่างจอ)
  const boxRef = useRef<HTMLDivElement>(null);

  // refresh เมื่อ user คลิกเปิด dropdown
  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  // เลือกทิศเปิด panel: ที่ว่างด้านล่างไม่พอ → เด้งขึ้นบน (ทำงานได้ทั้งกระดิ่งบน topbar และท้าย sidebar)
  useLayoutEffect(() => {
    if (!open) return;
    const el = boxRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    setOpenUp(spaceBelow < 460 && r.top > spaceBelow);
  }, [open]);

  // ปิดเมื่อคลิกข้างนอก
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const markRead = (n: Notification) => {
    void markReadFeed(n);   // optimistic ทุกตัวที่ใช้ตัวดึงกลาง
    if (n.link_url) {
      setOpen(false);
      router.push(n.link_url);
    }
  };

  if (!user) return null;

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={() => setOpen(o => !o)} aria-label="การแจ้งเตือน"
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="text-slate-600">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute right-0 z-40 w-96 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden ${openUp ? "bottom-full mb-2" : "top-full mt-2"}`}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-800">การแจ้งเตือน</h3>
            {unread > 0 && (
              <button onClick={markAllRead}
                className="text-xs text-blue-600 hover:underline">อ่านทั้งหมด</button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">กำลังโหลด...</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <div className="text-3xl mb-2 opacity-30">🔔</div>
                <p className="text-sm text-slate-400">ยังไม่มีการแจ้งเตือน</p>
              </div>
            ) : (
              items.map(n => {
                const icon = EVENT_ICON[n.event_type] ?? "🔔";
                const isUnread = !n.read_at;
                const priColor = n.priority === "high" ? "border-l-red-400"
                  : n.priority === "low" ? "border-l-slate-200" : "border-l-blue-400";
                return (
                  <button key={n.id} onClick={() => markRead(n)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-3 border-l-4 ${priColor} ${
                      isUnread ? "bg-blue-50/40" : ""
                    }`}>
                    <div className="text-lg leading-none mt-0.5">{icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm ${isUnread ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="text-xs text-slate-500 mt-0.5 whitespace-pre-line line-clamp-6">{n.body}</div>
                      )}
                      <div className="text-[10px] text-slate-400 mt-1">{relTime(n.created_at)}</div>
                    </div>
                    {isUnread && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <Link href="/dashboard" onClick={() => setOpen(false)}
              className="text-xs font-medium text-blue-600 hover:underline">ดูงานทั้งหมด →</Link>
            <Link href="/notify" onClick={() => setOpen(false)} title="ติดตั้งแอปแจ้งเตือนบนมือถือ · เด้งเตือนเข้าเครื่อง"
              className="text-xs font-medium text-slate-500 hover:text-blue-600 hover:underline">📱 แอปแจ้งเตือนบนมือถือ</Link>
          </div>
        </div>
      )}
    </div>
  );
}
