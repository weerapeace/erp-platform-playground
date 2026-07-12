"use client";

// ============================================================
// SystemCards — โหมด "การ์ดระบบ" ของแดชบอร์ดรวมทุกระบบ
// จัดกลุ่มแจ้งเตือน (จาก erp_notifications) → การ์ดต่อระบบ (app_key)
// ระบบที่มีงานค้าง = การ์ดเต็ม · ระบบที่เคลียร์แล้ว = ยุบเป็นแถวเดียว
// ============================================================
import { systemForEvent, eventEnabled, colorForSystem, METRIC_LABEL, type DashboardPanel } from "@/lib/dashboard-systems";
import type { Notification, TeamNotification } from "@/app/api/notifications/route";

export type SystemApp = { key: string; label: string; icon: string | null; icon_url?: string | null };

const isSnoozed = (n: Notification) => !!n.snoozed_until && new Date(n.snoozed_until).getTime() > Date.now();
const isActionable = (n: Notification) => !n.read_at && !isSnoozed(n);
const isOverdue = (n: Notification) => !!n.due_at && new Date(n.due_at).getTime() < Date.now();

// คะแนนความด่วน — ใช้จัดอันดับงานเด่นในการ์ด + เรียงการ์ด
function urgency(n: Notification): number {
  let s = 0;
  if (n.pinned_at) s += 300;
  if (n.due_at) { const d = new Date(n.due_at).getTime(); if (d < Date.now()) s += 250; else if (d - Date.now() < 86_400_000) s += 120; }
  s += n.priority === "high" ? 100 : n.priority === "low" ? 0 : 10;
  return s;
}

function dueLabel(iso: string): string {
  const d = new Date(iso).getTime(); const now = Date.now();
  const days = Math.round((d - now) / 86_400_000);
  if (d < now) return `เกิน ${Math.abs(days) || ""} ${Math.abs(days) ? "วัน" : "กำหนด"}`.trim();
  if (days === 0) return "วันนี้";
  if (days === 1) return "พรุ่งนี้";
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

// ไอคอนต่อระบบ (รูปอัปโหลด > emoji)
function AppIco({ app, size = 20 }: { app: SystemApp; size?: number }) {
  if (app.icon_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/r2-image?key=${encodeURIComponent(app.icon_url)}&w=64`} alt="" className="rounded object-contain shrink-0" style={{ width: size, height: size }} />;
  }
  return <span className="shrink-0 leading-none" style={{ fontSize: size }}>{app.icon ?? "🧩"}</span>;
}

type Props = {
  apps: SystemApp[];              // ระบบที่ user เห็นได้ (page กรองสิทธิ์มาแล้ว)
  list: Notification[];           // งานของฉัน หรือ งานทีม (Notification-shaped)
  panels: Map<string, DashboardPanel>;
  metrics?: Record<string, number>;   // "งานค้างจริง" ต่อระบบ (เฟส 4) — เลขจริงจากตารางแต่ละระบบ
  team?: boolean;                 // โหมดทีม → โชว์ชื่อผู้รับ
  isAdmin?: boolean;
  onOpen: (n: Notification) => void;
  onDone?: (n: Notification) => void;  // ✓ ปิดงาน (mark read) — เฉพาะงานของฉัน
  onConfig?: (appKey: string) => void;
  onSeeAll?: (appKey: string) => void;
};

export function SystemCards({ apps, list, panels, metrics, team, isAdmin, onOpen, onDone, onConfig, onSeeAll }: Props) {
  // จัดกลุ่มแจ้งเตือน (เฉพาะงานค้าง) → ระบบ
  const bySystem = new Map<string, Notification[]>();
  for (const n of list) {
    if (!isActionable(n)) continue;
    const key = systemForEvent(n.event_type);
    if (!eventEnabled(panels.get(key), n.event_type)) continue;
    (bySystem.get(key) ?? bySystem.set(key, []).get(key)!).push(n);
  }

  const withItems = apps
    .map((app) => ({ app, items: (bySystem.get(app.key) ?? []).sort((a, b) => urgency(b) - urgency(a)) }))
    .filter((x) => x.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length);
  const cleared = apps.filter((app) => !(bySystem.get(app.key)?.length));

  if (withItems.length === 0) {
    return (
      <div className="text-center py-14 bg-white border border-slate-200 rounded-2xl">
        <div className="text-4xl mb-2">🎉</div>
        <div className="text-slate-700 font-medium">ทุกระบบเคลียร์แล้ว ไม่มีงานค้าง</div>
        <div className="text-slate-400 text-sm mt-1">เยี่ยมมาก! กลับมาดูใหม่ทีหลังได้เลย</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {withItems.map(({ app, items }) => {
          const overdue = items.filter(isOverdue).length;
          const top = items.slice(0, 3);
          return (
            <div key={app.key} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <AppIco app={app} size={22} />
                <span className="text-[15px] font-semibold text-slate-800 flex-1 truncate">{app.label}</span>
                {isAdmin && onConfig && (
                  <button onClick={() => onConfig(app.key)} title="ตั้งค่าระบบนี้"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:bg-slate-100 hover:text-slate-600">⚙️</button>
                )}
              </div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {metrics && metrics[app.key] != null && METRIC_LABEL[app.key] && (
                  <span className="inline-flex items-baseline gap-1.5 text-white text-xs px-2.5 py-1 rounded-full" style={{ background: colorForSystem(app.key) }} title="ตัวเลขจริงจากระบบ">
                    <b className="text-sm">{metrics[app.key]}</b> {METRIC_LABEL[app.key]}
                  </span>
                )}
                <span className="inline-flex items-baseline gap-1.5 bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-full" title="งานแจ้งเตือนที่ยังไม่จัดการ">
                  <b className="text-sm text-slate-800">{items.length}</b> แจ้งเตือน
                </span>
                {overdue > 0 && (
                  <span className="inline-flex items-baseline gap-1.5 bg-red-50 text-red-600 text-xs px-2.5 py-1 rounded-full">
                    <b className="text-sm">{overdue}</b> เกินกำหนด
                  </span>
                )}
              </div>
              <div className="space-y-1 flex-1">
                {top.map((n) => (
                  <div key={n.id} className="flex items-center gap-1 rounded-lg hover:bg-slate-50">
                    <button onClick={() => onOpen(n)} className="flex-1 min-w-0 flex items-center gap-2 text-left px-2 py-1.5">
                      <span className="text-sm shrink-0">{n.pinned_at ? "📌" : "•"}</span>
                      <span className="flex-1 min-w-0 text-[13px] text-slate-700 truncate">
                        {n.title}
                        {team && (n as TeamNotification).recipient_name && (
                          <span className="text-slate-400"> · {(n as TeamNotification).recipient_name}</span>
                        )}
                      </span>
                      {n.due_at && (
                        <span className={`text-[11px] shrink-0 ${isOverdue(n) ? "text-red-600 font-medium" : "text-slate-400"}`}>{dueLabel(n.due_at)}</span>
                      )}
                    </button>
                    {onDone && (
                      <button onClick={() => onDone(n)} title="ทำเสร็จแล้ว (เอาออกจากงานค้าง)"
                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:bg-emerald-100 hover:text-emerald-600">✓</button>
                    )}
                  </div>
                ))}
              </div>
              {onSeeAll && (
                <button onClick={() => onSeeAll(app.key)} className="text-xs text-blue-600 hover:underline mt-2 self-end">
                  ดูทั้งหมด ({items.length}) →
                </button>
              )}
            </div>
          );
        })}
      </div>

      {cleared.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 bg-emerald-50/60 border border-emerald-100 rounded-xl text-xs text-slate-500">
          <span className="text-emerald-600 font-medium">✓ เคลียร์แล้ว</span>
          {cleared.map((app) => (
            <span key={app.key} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded-full">
              <AppIco app={app} size={13} /> {app.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
