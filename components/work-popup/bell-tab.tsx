"use client";
/**
 * แท็บ "กระดิ่ง" ในศูนย์แจ้งเตือน — แจ้งเตือนที่ยังไม่อ่าน (ตัวดึงกลาง useNotificationFeed · ข้อมูลชุดเดียวกับกระดิ่งบนแถบ ไม่ยิงซ้ำ)
 * โชว์เฉพาะประเภทที่เปิด "โชว์ในศูนย์" (ตั้งค่าการแจ้งเตือน · lib/notify-sources) · กด = อ่านแล้ว + ไปหน้านั้น
 */
import { Icon } from "@/components/icon";
import { relTime } from "@/components/notification-bell";
import { pushCategoryIcon } from "@/lib/push-categories";
import type { Notification } from "@/app/api/notifications/route";

export function BellTab({ items, onOpen, onReadAll }: { items: Notification[]; onOpen: (n: Notification) => void; onReadAll: () => void }) {
  if (!items.length) return (
    <div className="rounded-xl bg-emerald-50 p-5 text-center text-sm text-emerald-700">อ่านแจ้งเตือนครบแล้ว</div>
  );
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" onClick={onReadAll} className="text-xs text-blue-700 hover:underline">อ่านทั้งหมด</button>
      </div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {items.map((n) => (
          <button key={n.id} type="button" onClick={() => onOpen(n)} className="flex w-full gap-2.5 p-2.5 text-left hover:bg-slate-50">
            <span className="mt-0.5 shrink-0 text-base leading-none"><Icon value={pushCategoryIcon(n.event_type)} /></span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm ${n.priority === "high" ? "font-semibold text-rose-700" : "font-medium text-slate-800"}`}>{n.title}</span>
              {n.body && <span className="mt-0.5 line-clamp-3 block whitespace-pre-line text-xs text-slate-500">{n.body}</span>}
              <span className="mt-0.5 block text-[10px] text-slate-400">{relTime(n.created_at)}</span>
            </span>
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          </button>
        ))}
      </div>
    </div>
  );
}
