"use client";

// ============================================================
// Dashboard widgets (ชุดใหญ่) — reuse ข้อมูลเดิม (แจ้งเตือน/ทีม/กิจกรรม/ตัวเลขจริง)
// ใช้กับหน้าแดชบอร์ดต่อตำแหน่ง (เฟส 3 Role Board) — page ส่งข้อมูลที่ต้องใช้เข้ามา
// ============================================================
import Link from "next/link";
import { ActivityFeed, type ActivityEntry } from "@/components/activity-feed";
import { colorForSystem } from "@/lib/dashboard-systems";
import type { Notification, TeamNotification } from "@/app/api/notifications/route";
import type { SystemApp } from "./system-cards";

const snoozed = (n: Notification) => !!n.snoozed_until && new Date(n.snoozed_until).getTime() > Date.now();
const isOverdue = (n: Notification) => !!n.due_at && new Date(n.due_at).getTime() < Date.now();
function dueLabel(iso: string): string {
  const d = new Date(iso).getTime(), now = Date.now();
  const days = Math.round((d - now) / 86_400_000);
  if (d < now) { const ad = Math.abs(days); return ad ? `เกิน ${ad} วัน` : "เกินกำหนด"; }
  if (days === 0) return "วันนี้";
  if (days === 1) return "พรุ่งนี้";
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function Card({ icon, title, action, children }: { icon: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base leading-none">{icon}</span>
        <span className="text-sm font-semibold text-slate-800 flex-1">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function NotifRows({ list, onOpen, team, showDue }: { list: Notification[]; onOpen: (n: Notification) => void; team?: boolean; showDue?: boolean }) {
  return (
    <div className="space-y-1">
      {list.map((n) => (
        <button key={n.id} onClick={() => onOpen(n)} className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-slate-50">
          <span className="text-sm shrink-0">{n.pinned_at ? "📌" : "•"}</span>
          <span className="flex-1 min-w-0 text-[13px] text-slate-700 truncate">
            {n.title}
            {team && (n as TeamNotification).recipient_name && <span className="text-slate-400"> · {(n as TeamNotification).recipient_name}</span>}
          </span>
          {showDue && n.due_at && <span className={`text-[11px] shrink-0 ${isOverdue(n) ? "text-red-600 font-medium" : "text-slate-400"}`}>{dueLabel(n.due_at)}</span>}
        </button>
      ))}
    </div>
  );
}

// 📌 งานปักหมุด
export function PinnedWidget({ items, onOpen }: { items: Notification[]; onOpen: (n: Notification) => void }) {
  const list = items.filter((n) => n.pinned_at).slice(0, 5);
  if (!list.length) return null;
  return <Card icon="📌" title="งานปักหมุด"><NotifRows list={list} onOpen={onOpen} showDue /></Card>;
}

// 🔔 แจ้งเตือนล่าสุด
export function RecentWidget({ items, onOpen }: { items: Notification[]; onOpen: (n: Notification) => void }) {
  const list = [...items].filter((n) => !snoozed(n)).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);
  if (!list.length) return null;
  return <Card icon="🔔" title="แจ้งเตือนล่าสุด"><NotifRows list={list} onOpen={onOpen} /></Card>;
}

// 📅 ครบกำหนดสัปดาห์นี้
export function AgendaWidget({ items, onOpen }: { items: Notification[]; onOpen: (n: Notification) => void }) {
  const in7 = Date.now() + 7 * 86_400_000;
  const list = items.filter((n) => n.due_at && !n.read_at && new Date(n.due_at).getTime() <= in7)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()).slice(0, 6);
  if (!list.length) return null;
  return <Card icon="📅" title="ครบกำหนดสัปดาห์นี้"><NotifRows list={list} onOpen={onOpen} showDue /></Card>;
}

// 💰 การเงินสรุป (ต่ออายุ subscription + รายการการเงิน)
export function FinanceWidget({ items, onOpen }: { items: Notification[]; onOpen: (n: Notification) => void }) {
  const list = items.filter((n) => /subscription|loan|od|finance|renewal/i.test(n.event_type) && !n.read_at).slice(0, 5);
  if (!list.length) return null;
  return <Card icon="💰" title="การเงินสรุป"><NotifRows list={list} onOpen={onOpen} showDue /></Card>;
}

// 🕐 กิจกรรมล่าสุด (audit)
export function ActivityWidget({ activity }: { activity: ActivityEntry[] }) {
  return <Card icon="🕐" title="กิจกรรมล่าสุด"><ActivityFeed entries={activity.slice(0, 8)} compact showEntityName emptyMessage="ยังไม่มีกิจกรรม" /></Card>;
}

// 👥 ภาพรวมทีม (งานค้างต่อคน)
export function TeamWidget({ teamItems }: { teamItems: TeamNotification[] }) {
  const by = new Map<string, { name: string; color: string | null; n: number }>();
  for (const t of teamItems) {
    if (t.read_at || snoozed(t)) continue;
    const k = t.recipient_name || "—";
    const cur = by.get(k) ?? { name: k, color: t.recipient_color, n: 0 };
    cur.n++; by.set(k, cur);
  }
  const rows = [...by.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  return (
    <Card icon="👥" title="ภาพรวมทีม">
      {rows.length === 0 ? <div className="text-xs text-slate-300 py-2">ไม่มีงานค้างในทีม (หรือไม่มีสิทธิ์ดูทีม)</div> : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium text-white shrink-0" style={{ background: r.color || "#94a3b8" }}>{r.name.slice(0, 1)}</span>
              <span className="flex-1 text-[13px] text-slate-700 truncate">{r.name}</span>
              <span className="text-xs text-slate-500"><b className="text-slate-800">{r.n}</b> งานค้าง</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ⚡ ทางลัดแอป
export function ShortcutsWidget({ apps }: { apps: SystemApp[] }) {
  return (
    <Card icon="⚡" title="ทางลัด">
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {apps.slice(0, 12).map((a) => (
          <Link key={a.key} href={`/app/${a.key}`} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-slate-50 text-center">
            {a.icon_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/api/r2-image?key=${encodeURIComponent(a.icon_url)}&w=64`} alt="" className="w-6 h-6 rounded object-contain" />
              : <span className="text-2xl leading-none">{a.icon ?? "🧩"}</span>}
            <span className="text-[10px] text-slate-500 leading-tight line-clamp-1">{a.label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// 📦 สต๊อกใกล้หมด / 🏭 สถานะผลิต — การ์ดตัวเลขเดี่ยว
export function StatWidget({ icon, title, value, unit, href, hint }: { icon: string; title: string; value: number; unit: string; href?: string; hint?: string }) {
  const body = (
    <div className="flex items-baseline gap-2">
      <span className="text-3xl font-semibold text-slate-800">{value}</span>
      <span className="text-sm text-slate-500">{unit}</span>
      {href && <span className="ml-auto text-xs text-blue-600">ดูทั้งหมด →</span>}
    </div>
  );
  return <Card icon={icon} title={title}>{href ? <Link href={href} className="block hover:opacity-80">{body}</Link> : body}{hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}</Card>;
}

// 📈 กราฟยอดขาย (14 วัน)
export function SalesChartWidget({ data }: { data: { d: string; sales: number }[] }) {
  if (!data.length) return <Card icon="📈" title="กราฟยอดขาย"><div className="text-xs text-slate-300 py-3">ยังไม่มีข้อมูลยอดขาย</div></Card>;
  const vals = data.map((x) => Number(x.sales) || 0);
  const max = Math.max(1, ...vals);
  const total = vals.reduce((s, v) => s + v, 0);
  const w = 300, h = 60;
  const pts = vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <Card icon="📈" title="ยอดขาย 14 วัน" action={<span className="text-xs text-slate-500">รวม {total.toLocaleString("th-TH")}</span>}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: 60 }}>
        <polyline points={pts} fill="none" stroke="#1D9E75" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>{data[0] && new Date(data[0].d).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
        <span>{data[data.length - 1] && new Date(data[data.length - 1].d).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
      </div>
    </Card>
  );
}
