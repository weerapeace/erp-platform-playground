"use client";

// ============================================================
// DeptTabs — "แยกตามแผนก" แบบแท็บ (หน้าภาพรวมผู้บริหาร)
// แท็บ 1 ใบ = 1 แผนก: โชว์ตัวเลขที่ต้องระวังที่สุดบนแท็บเลย (ไม่ต้องกดก็เห็น)
// กดแท็บ → แผงของแผนกนั้น: ตัวเลขสำคัญ + งานค้าง (แจ้งเตือน) ของแผนก + ปุ่มเปิดแดชบอร์ดแผนก
// รวม "การ์ดระบบ" เดิมเข้ามา: งานค้างต่อระบบใช้แถวเดียวกับการ์ดระบบ (SystemItemRow)
// ตัดสินหน้าตาด้วย `layout` (ของกลาง device-view) ไม่ใช้ sm:/lg: → พรีวิวแท็บเล็ต/มือถือตรงกับเครื่องจริง
// ============================================================
import Link from "next/link";
import type { DeviceLayout } from "@/components/device-view";
import type { Notification } from "@/app/api/notifications/route";
import { colorForSystem } from "@/lib/dashboard-systems";
import { SystemItemRow, countOverdue } from "./system-cards";

export type DeptStat = { v: React.ReactNode; l: string; tone?: "danger" | "warning"; n?: number };   // n = ค่าดิบ (ใช้เลือกตัวเลขขึ้นแท็บ)
export type DeptDef = {
  key: string;        // = app_key ของระบบ (production / purchasing / sales / qc / design / tasks)
  label: string;      // ชื่อเต็ม (หัวแผง)
  short: string;      // ชื่อสั้น (บนแท็บ)
  tiny?: string;      // ชื่อสั้นพิเศษ (แท็บบนแท็บเล็ต/มือถือ — ที่แคบ)
  icon: string;
  href: string;       // หน้าแดชบอร์ดเต็มของแผนก
  stats: DeptStat[];
};

const MAX_ROWS = 5;   // งานค้างที่โชว์ในแผง (ที่เหลือกด "ดูทั้งหมด")

const toneText = (t?: DeptStat["tone"]) =>
  t === "danger" ? "text-red-600" : t === "warning" ? "text-amber-600" : "text-slate-800";
const toneTile = (t?: DeptStat["tone"]) =>
  t === "danger" ? "bg-red-50 border-red-100" : t === "warning" ? "bg-amber-50 border-amber-100" : "bg-slate-50 border-slate-100";

// ตัวเลขที่ควรโชว์บนแท็บ: แดงก่อน → เหลือง → ตัวแรกที่ไม่เป็นศูนย์ → ตัวแรกของแผนก
const headlineOf = (stats: DeptStat[]): DeptStat | undefined =>
  stats.find((s) => s.tone === "danger") ?? stats.find((s) => s.tone === "warning")
  ?? stats.find((s) => (s.n ?? 0) > 0) ?? stats[0];

type Props = {
  depts: DeptDef[];
  layout: DeviceLayout;
  active: string;
  onActive: (key: string) => void;
  pending: Map<string, Notification[]>;      // งานค้างต่อระบบ (จาก pendingBySystem)
  team?: boolean;                            // โหมดทีม → โชว์ชื่อผู้รับ
  onOpenDashboard: (d: DeptDef) => void;     // จอคอม: เปิดแดชบอร์ดแผนกในหน้าต่าง
  onOpen?: (n: Notification) => void;
  onDone?: (n: Notification) => void;
  onSeeAll?: (appKey: string) => void;
  onConfig?: (appKey: string) => void;
};

export function DeptTabs({ depts, layout, active, onActive, pending, team, onOpenDashboard, onOpen, onDone, onSeeAll, onConfig }: Props) {
  const isPhone = layout === "phone";
  const isDesktop = layout === "desktop";
  const cur = depts.find((d) => d.key === active) ?? depts[0];
  if (!cur) return null;
  const items = pending.get(cur.key) ?? [];
  const overdue = countOverdue(items);

  // ลูกศรซ้าย/ขวา = เลื่อนแท็บ (คีย์บอร์ด)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = depts.findIndex((d) => d.key === cur.key);
    const next = depts[(i + (e.key === "ArrowRight" ? 1 : depts.length - 1)) % depts.length];
    onActive(next.key);
  };

  return (
    <div>
      {/* ---- แถบแท็บแผนก: จอคอม/แท็บเล็ต = แถวเดียว · มือถือ = 3 ต่อแถว (เห็นครบทุกแผนกไม่ต้องเลื่อน) ---- */}
      <div role="tablist" aria-label="แยกตามแผนก" onKeyDown={onKey}
        className={`grid ${isPhone ? "gap-1.5" : "gap-2"}`}
        style={{ gridTemplateColumns: `repeat(${isPhone ? 3 : depts.length}, minmax(0, 1fr))` }}>
        {depts.map((d) => {
          const on = d.key === cur.key;
          const head = headlineOf(d.stats);
          const count = pending.get(d.key)?.length ?? 0;
          return (
            <button key={d.key} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
              onClick={() => onActive(d.key)}
              className={`relative text-left rounded-xl border overflow-hidden transition-all ${isDesktop ? "px-2.5 pt-3 pb-2.5" : "px-2 pt-2.5 pb-2"} ${
                on ? "bg-white border-slate-300 shadow-sm" : "bg-white/60 border-slate-200 hover:bg-white hover:border-slate-300"}`}>
              {/* แถบสีประจำแผนก — ชัดเมื่อเลือก */}
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: colorForSystem(d.key), opacity: on ? 1 : 0.25 }} />
              <span className="flex items-center gap-1 min-w-0">
                <span className={`leading-none shrink-0 ${isPhone ? "text-sm" : "text-base"}`}>{d.icon}</span>
                <span className={`font-semibold truncate ${isPhone ? "text-xs" : "text-[13px]"} ${on ? "text-slate-900" : "text-slate-600"}`}>{isDesktop ? d.short : (d.tiny ?? d.short)}</span>
                {count > 0 && (
                  <span className="ml-auto shrink-0 min-w-[18px] text-center text-[10px] font-semibold leading-none px-1 py-1 rounded-full bg-blue-600 text-white"
                    title={`งานค้าง (แจ้งเตือน) ของแผนกนี้ ${count} รายการ`}>{count > 99 ? "99+" : count}</span>
                )}
              </span>
              <span className="flex items-baseline gap-1 mt-1.5 min-w-0">
                {head && <span className={`font-bold tabular-nums shrink-0 ${isPhone ? "text-sm" : "text-base"} ${toneText(head.tone)}`}>{head.v}</span>}
                {head && <span className="text-[10px] text-slate-500 truncate">{head.l}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {/* ---- แผงของแผนกที่เลือก ---- */}
      <div role="tabpanel" aria-label={cur.label} className="mt-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className={`flex items-center gap-2 border-b border-slate-100 ${isPhone ? "px-3 py-2.5" : "px-4 py-3"}`}>
          <span className="w-1.5 h-5 rounded-full shrink-0" style={{ background: colorForSystem(cur.key) }} />
          <span className="text-lg leading-none shrink-0">{cur.icon}</span>
          <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{cur.label}</span>
          {onConfig && (
            <button type="button" onClick={() => onConfig(cur.key)} title="ตั้งค่างานค้างของระบบนี้"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-slate-100 hover:text-slate-600 shrink-0">⚙️</button>
          )}
          {isDesktop && (
            <button type="button" onClick={() => onOpenDashboard(cur)}
              className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 shrink-0">
              ⤢ เปิดในหน้าต่าง
            </button>
          )}
          <Link href={cur.href}
            className={`inline-flex items-center rounded-lg text-xs font-medium shrink-0 ${isDesktop ? "h-8 px-1 text-blue-600 hover:underline" : "h-9 px-3 bg-slate-900 text-white"}`}>
            {isDesktop ? "ดูทั้งหมด →" : "เปิดแดชบอร์ด →"}
          </Link>
        </div>

        <div className={isPhone ? "p-3 space-y-3" : "p-4 space-y-4"}>
          {/* ตัวเลขสำคัญของแผนก */}
          <div className={`grid gap-2 ${isPhone ? "grid-cols-2" : "grid-cols-4"}`}>
            {cur.stats.map((st, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2.5 ${toneTile(st.tone)}`}>
                <div className={`font-bold tabular-nums ${isPhone ? "text-xl" : "text-2xl"} ${toneText(st.tone)}`}>{st.v}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">{st.l}</div>
              </div>
            ))}
          </div>

          {/* งานค้าง (แจ้งเตือน) ของแผนกนี้ — ส่วนที่ย้ายมาจาก "การ์ดระบบ" */}
          {onOpen && (
            <div>
              <div className="flex items-center gap-2 mb-1 px-0.5 flex-wrap">
                <span className="text-xs font-semibold text-slate-600">🔔 {team ? "งานค้างของทีม" : "งานค้างของฉัน"}ในแผนกนี้</span>
                {items.length > 0 && <span className="text-[11px] text-slate-400">{items.length} รายการ</span>}
                {overdue > 0 && <span className="text-[11px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">เกินกำหนด {overdue}</span>}
                {onSeeAll && items.length > 0 && (
                  <button type="button" onClick={() => onSeeAll(cur.key)} className="ml-auto text-xs text-blue-600 hover:underline shrink-0">
                    ดูทั้งหมด ({items.length}) →
                  </button>
                )}
              </div>
              {items.length === 0 ? (
                <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2.5">✓ ไม่มีงานค้างในแผนกนี้</div>
              ) : (
                <div className="space-y-0.5">
                  {items.slice(0, MAX_ROWS).map((n) => <SystemItemRow key={n.id} n={n} team={team} onOpen={onOpen} onDone={onDone} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
