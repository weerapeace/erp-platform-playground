"use client";
/**
 * 🔔 การ์ดแจ้งเตือนลอย (ของกลาง) — ลอยมุมขวาล่าง (หรือขวาบน) ของทุกจอทำงาน ERP บนจอคอม
 * - ข้อมูลชุดเดียวกับกระดิ่ง (components/notification-bell/feed) → อ่านแล้วที่ไหน ตรงกันทุกที่ · ไม่ยิงซ้ำ
 * - ➖ ย่อเหลือปุ่มกระดิ่ง (มีตัวเลขยังไม่อ่าน · กระพริบเมื่อมีเรื่องใหม่) · ✕ ซ่อน → เปิดใหม่ที่เมนูโปรไฟล์ (NotifyFloatToggle)
 * - ไม่โผล่: ยังไม่ล็อกอิน · จอแคบกว่า 1280 (ใช้กระดิ่งเดิม/แอป /notify) · ในกรอบ iframe · หน้าที่ไม่ใช่จอทำงาน (lib/chromeless-routes) · /notify
 * mount ครั้งเดียวใน app/layout (NotificationFloatHost) · ค่าตั้งต่อคน = pref.ts (user_ui_prefs notify_float)
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { relTime } from "@/components/notification-bell";
import { useNotificationFeed } from "@/components/notification-bell/feed";
import { isChromelessPath } from "@/lib/chromeless-routes";
import { pushCategoryIcon } from "@/lib/push-categories";
import type { Notification } from "@/app/api/notifications/route";
import { useNotifyFloatPref, type NotifyFloatPosition, type NotifyFloatPref } from "./pref";

const MIN_WIDTH = 1280;          // ต่ำกว่านี้ ERP มีแถบเมนูล่าง/จอเล็ก → ไม่ลอย
const NEW_PULSE_MS = 10_000;

function useWideScreen(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MIN_WIDTH}px)`);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export function NotificationFloatHost() {
  const { user } = useAuth();
  const pathname = usePathname() ?? "";
  const wide = useWideScreen();
  const [pref, setPref] = useNotifyFloatPref();
  const [inFrame, setInFrame] = useState(true);
  useEffect(() => { setInFrame(window.self !== window.top); }, []);
  if (!user || !wide || inFrame || !pref.enabled || isChromelessPath(pathname, ["/notify"])) return null;
  return <FloatCard userId={user.id} pref={pref} setPref={setPref} />;
}

const POS: Record<NotifyFloatPosition, string> = { br: "bottom-4 right-4", tr: "top-16 right-4" };

function FloatCard({ userId, pref, setPref }: { userId: string; pref: NotifyFloatPref; setPref: (v: NotifyFloatPref) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { items, unread, loading, loaded, markRead, markAllRead } = useNotificationFeed(userId);
  const [pulse, setPulse] = useState(false);
  const prevUnread = useRef<number | null>(null);

  // มีเรื่องใหม่ (ยังไม่อ่านเพิ่มขึ้น) → กระพริบปุ่ม/หัวการ์ดสักพัก
  useEffect(() => {
    if (!loaded) return;
    if (prevUnread.current !== null && unread > prevUnread.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), NEW_PULSE_MS);
      prevUnread.current = unread;
      return () => clearTimeout(t);
    }
    prevUnread.current = unread;
  }, [unread, loaded]);

  const set = (patch: Partial<NotifyFloatPref>) => setPref({ ...pref, ...patch });
  const hide = () => {
    set({ enabled: false });
    toast.info("ซ่อนการ์ดแจ้งเตือนแล้ว — เปิดใหม่ได้ที่เมนูโปรไฟล์ (มุมขวาบน)");
  };
  const open = (n: Notification) => {
    void markRead(n);
    if (n.link_url) router.push(n.link_url);
  };
  const badge = unread > 99 ? "99+" : String(unread);

  if (pref.minimized) {
    return (
      <button type="button" onClick={() => set({ minimized: false })} aria-label={`แจ้งเตือน ยังไม่อ่าน ${unread}`} title="แจ้งเตือน — กดเพื่อกาง"
        className={`fixed ${POS[pref.position]} z-[45] w-12 h-12 rounded-full bg-white border border-slate-200 shadow-lg flex items-center justify-center text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-colors`}>
        {pulse && <span className="absolute inset-0 rounded-full bg-blue-400/40 animate-ping" aria-hidden />}
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">{badge}</span>
        )}
      </button>
    );
  }

  return (
    <div className={`fixed ${POS[pref.position]} z-[45] w-80 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden flex flex-col`}
      role="region" aria-label="การ์ดแจ้งเตือน">
      <div className={`flex items-center gap-2 px-3 h-10 border-b border-slate-100 ${pulse ? "bg-blue-50" : "bg-slate-50"} transition-colors`}>
        <span className="text-blue-600"><BellIcon size={16} /></span>
        <span className="text-sm font-semibold text-slate-800 flex-1">แจ้งเตือน{unread > 0 && <span className="ml-1.5 text-xs font-medium text-white bg-red-500 rounded-full px-1.5 py-0.5">{badge}</span>}</span>
        <button type="button" onClick={() => set({ minimized: true })} aria-label="ย่อ" title="ย่อเหลือปุ่มกระดิ่ง"
          className="w-7 h-7 rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700">－</button>
        <button type="button" onClick={hide} aria-label="ซ่อน" title="ซ่อน (เปิดใหม่ได้ที่เมนูโปรไฟล์)"
          className="w-7 h-7 rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700">✕</button>
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        {!loaded && loading ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">ยังไม่มีแจ้งเตือน</p>
        ) : items.map((n) => {
          const isUnread = !n.read_at;
          return (
            <button key={n.id} type="button" onClick={() => open(n)}
              className={`w-full text-left px-3 py-2.5 border-b border-slate-50 flex gap-2.5 hover:bg-slate-50 transition-colors ${isUnread ? "bg-blue-50/40" : ""}`}>
              <span className="text-base leading-none mt-0.5 w-5 text-center">{pushCategoryIcon(n.event_type)}</span>
              <span className="flex-1 min-w-0">
                <span className={`block text-[13px] leading-snug ${isUnread ? "font-semibold text-slate-900" : "text-slate-600"}`}>
                  {n.priority === "high" && <span className="text-red-600 mr-1">●</span>}{n.title}
                </span>
                {n.body && <span className="block text-xs text-slate-500 mt-0.5 line-clamp-2 whitespace-pre-line">{n.body}</span>}
                <span className="block text-[11px] text-slate-400 mt-0.5">{relTime(n.created_at)}</span>
              </span>
              {isUnread && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" aria-label="ยังไม่อ่าน" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between px-3 h-9 border-t border-slate-100 bg-slate-50">
        {unread > 0
          ? <button type="button" onClick={() => void markAllRead()} className="text-xs text-blue-600 hover:underline">อ่านหมด</button>
          : <span className="text-xs text-slate-400">อ่านครบแล้ว</span>}
        <Link href="/notify" className="text-xs font-medium text-blue-600 hover:underline">ดูทั้งหมด →</Link>
      </div>
    </div>
  );
}

function BellIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/** สวิตช์ในเมนูโปรไฟล์ — เปิด/ซ่อนการ์ด + เลือกมุม (ใช้ใน AccountMenu) */
export function NotifyFloatToggle() {
  const [pref, setPref] = useNotifyFloatPref();
  return (
    <div className="px-3 py-2 border-t border-slate-100">
      <label className="flex items-center gap-2 cursor-pointer">
        <span className="flex-1 text-xs text-slate-700">🔔 การ์ดแจ้งเตือนลอย <span className="text-[10px] text-slate-400">(จอคอม)</span></span>
        <input type="checkbox" className="sr-only peer" checked={pref.enabled}
          onChange={(e) => setPref({ ...pref, enabled: e.target.checked, minimized: false })} />
        <span aria-hidden className="relative w-9 h-5 rounded-full bg-slate-300 peer-checked:bg-blue-600 transition-colors after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
      </label>
      {pref.enabled && (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="text-[11px] text-slate-400 mr-1">ตำแหน่ง</span>
          {([["br", "↘ ขวาล่าง"], ["tr", "↗ ขวาบน"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPref({ ...pref, position: k })}
              className={`h-6 px-2 rounded-md border text-[11px] ${pref.position === k ? "border-blue-300 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}
