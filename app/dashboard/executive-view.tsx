"use client";

// ============================================================
// มุมมองผู้บริหาร (Executive Command Center) — เห็นสุขภาพธุรกิจทั้งบริษัทในหน้าเดียว
// self-contained: โหลด /api/dashboard/executive เอง (gate admin ที่ server)
// ป้ายสถานะข้อมูล: 🟢 = ข้อมูลจริงพร้อม · 🟡 = ต้องเชื่อมเพิ่ม/ชุดตัวอย่าง
// รวม "การ์ดระบบ" เข้ามาแล้ว: งานค้าง (แจ้งเตือน) ของ 6 แผนกอยู่ในแท็บแผนก · ระบบอื่นอยู่ท้ายหน้า
// หน้าตา 3 แบบ (จอคอม/แท็บเล็ต/มือถือ) ตัดสินด้วย prop `layout` (ของกลาง device-view)
// ============================================================
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { ExecutiveResponse, ExecutiveSummary } from "@/app/api/dashboard/executive/route";
import type { DeptOverview } from "@/app/api/dashboard/dept-overview/route";
import type { DeptItemGroup } from "@/app/api/dashboard/dept-items/route";
import { ResizableModal } from "@/components/resizable-modal";
import { LineConsole } from "@/components/line-console";
import type { DeviceLayout } from "@/components/device-view";
import type { Notification } from "@/app/api/notifications/route";
import type { DashboardPanel } from "@/lib/dashboard-systems";
import { SystemCards, pendingBySystem, type SystemApp } from "./system-cards";
import { DeptTabs, type DeptDef, type DeptStat } from "./dept-tabs";

const baht  = (n: number) => "฿" + Math.round(n || 0).toLocaleString("th-TH");
const bahtC = (n: number) => {
  const v = n || 0;
  if (Math.abs(v) >= 1_000_000) return "฿" + (v / 1_000_000).toFixed(2) + "M";
  if (Math.abs(v) >= 100_000)   return "฿" + Math.round(v / 1_000).toLocaleString("th-TH") + "K";
  return baht(v);
};
const pct = (n: number) => Math.round((n || 0) * 100) + "%";

// จุดสถานะข้อมูล
function Dot({ real }: { real: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${real ? "bg-emerald-500" : "bg-amber-400"}`}
      title={real ? "ข้อมูลจริงพร้อมใช้" : "ต้องเชื่อมข้อมูลเพิ่ม หรือเป็นชุดตัวอย่าง"}
    />
  );
}

// งานค้าง (แจ้งเตือน) ต่อระบบ — ส่งมาจากหน้า dashboard (ชุดเดียวกับที่ "การ์ดระบบ" ใช้)
export type ExecutiveSystems = {
  apps: SystemApp[];
  list: Notification[];
  panels: Map<string, DashboardPanel>;
  metrics?: Record<string, number>;
  team?: boolean;
  onOpen: (n: Notification) => void;
  onDone?: (n: Notification) => void;
  onSeeAll?: (appKey: string) => void;
  onConfig?: (appKey: string) => void;
};

const DEPT_KEYS = ["production", "purchasing", "sales", "qc", "design", "tasks"];

export function ExecutiveView({ layout = "desktop", systems }: { layout?: DeviceLayout; systems?: ExecutiveSystems }) {
  const isPhone = layout === "phone";
  const isDesktop = layout === "desktop";
  const cols4 = isPhone ? "grid-cols-2" : "grid-cols-4";   // การ์ดตัวเลข: มือถือ 2 ต่อแถว · ที่เหลือ 4
  const gap = isPhone ? "gap-2" : "gap-3";
  const [activeDept, setActiveDept] = useState(DEPT_KEYS[0]);
  const [data, setData]       = useState<ExecutiveSummary | null>(null);
  const [dept, setDept]       = useState<DeptOverview | null>(null);   // สรุปต่อแผนก (ของกลาง)
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);
  const [openDept, setOpenDept] = useState<DeptDrill | null>(null);   // Popup mini-dashboard ต่อแผนก (KPI + รายการ)
  const [lineOpen, setLineOpen] = useState(false);                    // ศูนย์จัดการ LINE รวมทุกระบบ

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    Promise.all([
      apiFetch("/api/dashboard/executive").then((r) => r.json()) as Promise<ExecutiveResponse>,
      apiFetch("/api/dashboard/dept-overview").then((r) => r.json()).catch(() => ({ data: null })),
    ])
      .then(([j, d]) => {
        if (j.error) setErr(j.error); else setData(j.data);
        setDept((d?.data ?? null) as DeptOverview | null);
      })
      .catch(() => setErr("โหลดข้อมูลผู้บริหารไม่ได้ กรุณาลองใหม่"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  // งานค้างต่อระบบ (ของกลางเดียวกับการ์ดระบบ) + ระบบนอก 6 แผนกที่ยังมีงานค้าง
  const pending = useMemo(
    () => (systems ? pendingBySystem(systems.list, systems.panels) : new Map<string, Notification[]>()),
    [systems],
  );
  const otherApps = useMemo(
    () => (systems?.apps ?? []).filter((a) => !DEPT_KEYS.includes(a.key) && (pending.get(a.key)?.length ?? 0) > 0),
    [systems, pending],
  );
  const systemCards = (apps: SystemApp[], hideEmpty: boolean) => systems && (
    <SystemCards apps={apps} list={systems.list} panels={systems.panels} metrics={systems.metrics} team={systems.team} isAdmin
      layout={layout} hideEmpty={hideEmpty}
      onOpen={systems.onOpen} onDone={systems.onDone} onConfig={systems.onConfig} onSeeAll={systems.onSeeAll} />
  );

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className={`grid ${cols4} ${gap}`}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />)}
        </div>
        <div className="h-40 bg-white rounded-xl border border-slate-200 animate-pulse" />
        <div className={`grid ${cols4} ${gap}`}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />)}
        </div>
      </div>
    );
  }
  if (err || !data) {
    // โหลดตัวเลขผู้บริหารไม่ได้ → ยังต้องเห็นงานค้างตามระบบ (การ์ดระบบเดิม) ไม่ให้หน้าว่าง
    return (
      <div className="space-y-4">
        {err && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-sm text-red-700">{err}</p>
            <button onClick={load} className="mt-2 text-xs text-red-600 underline">ลองใหม่</button>
          </div>
        )}
        {systems && systemCards(systems.apps, false)}
      </div>
    );
  }

  const f = data.finance, s = data.sales, o = data.ops;
  const odPct = data.finance.od_limit > 0 ? Math.min(100, Math.round((f.od_used / f.od_limit) * 100)) : 0;

  const depts = buildDepts(s, f, o, dept);
  const asOf = `อัปเดต ${new Date(data.as_of).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} · เรต ¥1 = ฿${data.fx_rate}`;

  return (
    <div className={isPhone ? "space-y-4" : "space-y-5"}>
      {/* legend + ปุ่มศูนย์ LINE */}
      <div className={`flex items-center text-xs text-slate-500 ${isPhone ? "gap-x-3 gap-y-1.5 flex-wrap" : "gap-4"}`}>
        <span className="inline-flex items-center gap-1.5"><Dot real /> ข้อมูลจริงพร้อม</span>
        <span className="inline-flex items-center gap-1.5"><Dot real={false} /> {isPhone ? "ประมาณ / ชุดตัวอย่าง" : "ต้องเชื่อมข้อมูลเพิ่ม / ชุดตัวอย่าง"}</span>
        <div className={`flex items-center gap-3 ${isPhone ? "w-full justify-between" : "ml-auto"}`}>
          {isPhone && <span className="text-slate-400">{asOf}</span>}
          <button onClick={() => setLineOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors">
            🔔 ศูนย์ LINE
          </button>
          {!isPhone && <span className="text-slate-400">{asOf}</span>}
        </div>
      </div>

      {/* ---- KPI ผลประกอบการ ---- */}
      <div className={`grid ${cols4} ${gap}`}>
        <Kpi icon="💰" label="ยอดขายวันนี้"      value={bahtC(s.today)} real={false} hint="ทุกช่องทางรวมกัน" />
        <Kpi icon="📈" label="ยอดขายเดือนนี้"     value={bahtC(s.month)} real={false}
             hint={`ภายใน ${bahtC(s.internal_month)} · ออนไลน์ ${bahtC(s.marketplace_month)}`} />
        <Kpi icon="📊" label="กำไรขั้นต้น (เดือนนี้)" value={bahtC(data.profit.gross_est_month)} real={false}
             hint={`ประมาณ · มาร์จินเฉลี่ย ${pct(data.profit.margin_pct)}`} />
        <Kpi icon="🏦" label="ภาระหนี้รวม"        value={bahtC(f.loan_outstanding + f.od_used)} real
             hint="เงินกู้ + OD ที่ใช้ไป" />
      </div>

      {/* ---- แยกตามแผนก (แท็บ): ตัวเลขสำคัญ + งานค้างของแผนก + เปิดแดชบอร์ดแผนก ---- */}
      <SectionLabel>แยกตามแผนก</SectionLabel>
      <p className="text-[11px] text-slate-400 -mt-1 px-0.5">
        {isDesktop
          ? <>กดแท็บ = เปิดแดชบอร์ดเต็มของแผนกนั้นในหน้านี้เลย · &ldquo;⤢ เปิดในหน้าต่าง&rdquo; = ขยายเป็นหน้าต่างใหญ่</>
          : isPhone ? "แตะแท็บเพื่อดูตัวเลขและงานค้างของแผนก" : "แตะแท็บ = เปิดแดชบอร์ดเต็มของแผนกนั้นในหน้านี้เลย"}
      </p>
      <DeptTabs depts={depts} layout={layout} active={activeDept} onActive={setActiveDept}
        pending={pending} team={systems?.team}
        onOpenDashboard={(d) => setOpenDept({ key: d.key, label: d.label, icon: d.icon, stats: d.stats, embedUrl: d.href })}
        onOpen={systems?.onOpen} onDone={systems?.onDone} onSeeAll={systems?.onSeeAll} onConfig={systems?.onConfig} />

      {/* ---- การเงิน ---- */}
      <SectionLabel>การเงิน</SectionLabel>
      <div className={`grid ${cols4} ${gap}`}>
        <FinCard icon="🔺" iconTone="text-red-500" title="เจ้าหนี้ค้างจ่าย" real
          value={baht(f.ap_unpaid)} sub={`${f.ap_count} ใบ · จ่ายซัพพลายเออร์`} href="/purchasing/dashboard" />
        <FinCard icon="🔻" iconTone="text-emerald-500" title="ลูกหนี้ค้างเก็บ" real={false}
          value={baht(f.ar_due)} sub={`${f.ar_count} ใบ · เก็บจากลูกค้า`} href="/billing-notes" />
        <FinCard icon="🏛️" title="เงินกู้คงเหลือ" real
          value={bahtC(f.loan_outstanding)} sub={f.loan_due30 > 0 ? `ครบชำระ 30 วัน ${baht(f.loan_due30)}` : "ไม่มีครบกำหนดใน 30 วัน"}
          subTone={f.loan_due30 > 0 ? "text-red-600" : undefined} />
        <FinCard icon="💳" title="OD ใช้ไป" real={false}
          value={<>{bahtC(f.od_used)} <span className="text-xs text-slate-400 font-normal">/ {bahtC(f.od_limit)}</span></>}
          sub={`ใช้ ${odPct}% · ดอกเบี้ยเดือนนี้ ${baht(f.od_interest)}`}>
          <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
            <div className={`h-full rounded-full ${odPct >= 80 ? "bg-red-500" : odPct >= 50 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${odPct}%` }} />
          </div>
        </FinCard>
      </div>

      {/* ---- คลัง · ผลิต · จัดซื้อ ---- */}
      <SectionLabel>คลัง · ผลิต · จัดซื้อ</SectionLabel>
      <div className={`grid ${cols4} ${gap}`}>
        <FinCard icon="📦" title="มูลค่าสต๊อก" real={false}
          value={bahtC(data.stock.value)}
          sub={data.stock.low > 0 ? `⚠️ ของใกล้หมด ${data.stock.low} รายการ` : "สต๊อกปกติ"}
          subTone={data.stock.low > 0 ? "text-amber-600" : undefined} href="/inventory" />
        <FinCard icon="🏭" title="งานผลิตกำลังทำ" real
          value={`${o.mo_active} ใบ`}
          sub={o.mo_overdue > 0 ? `เลยกำหนด ${o.mo_overdue} ใบ` : "ไม่มีงานเลยกำหนด"}
          subTone={o.mo_overdue > 0 ? "text-red-600" : undefined} href="/master/production-dashboard" />
        <FinCard icon="🛒" title="ใบขอซื้อรออนุมัติ" real
          value={`${o.pr_waiting} ใบ`} sub="รอคุณอนุมัติ" href="/purchasing/dashboard" />
        <FinCard icon="🔍" title="QC ของเสีย" real
          value={`${o.qc_defect} รายการ`}
          sub={o.qc_defect > 0 ? "รอตรวจสอบ" : "ไม่มีของเสียค้าง"}
          subTone={o.qc_defect > 0 ? "text-amber-600" : undefined} href="/master/qc-warehouse" />
      </div>

      {/* ---- ระบบอื่น ๆ (นอก 6 แผนก) ที่ยังมีงานค้าง — การ์ดระบบเดิม ---- */}
      {otherApps.length > 0 && (
        <>
          <SectionLabel>ระบบอื่น ๆ ที่มีงานค้าง</SectionLabel>
          {systemCards(otherApps, true)}
        </>
      )}

      <p className="text-[11px] text-slate-400 pt-1">
        🟡 = ค่าประมาณหรือชุดตัวอย่าง (ยอดขาย/กำไร/ลูกหนี้/OD/สต๊อก) — จะแม่นขึ้นเมื่อป้อนข้อมูลจริงครบ · เฉพาะแอดมินเห็นตัวเลขส่วนนี้
      </p>

      {openDept && <DeptItemsModal dept={openDept} onClose={() => setOpenDept(null)} />}
      <LineConsole open={lineOpen} onClose={() => setLineOpen(false)} />
    </div>
  );
}

// ---- KPI ผลประกอบการ (การ์ดเน้นตัวเลขใหญ่) ----
function Kpi({ icon, label, value, hint, real }: { icon: string; label: string; value: string; hint?: string; real: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-lg leading-none">{icon}</span>
        <Dot real={real} />
      </div>
      <div className="text-2xl font-bold text-slate-800 tabular-nums mt-2">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-1 truncate" title={hint}>{hint}</div>}
    </div>
  );
}

// ---- การ์ดการเงิน / ops ----
function FinCard({
  icon, iconTone, title, value, sub, subTone, real, href, children,
}: {
  icon: string; iconTone?: string; title: string;
  value: React.ReactNode; sub?: string; subTone?: string; real: boolean; href?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <div className={`bg-white border border-slate-200 rounded-xl p-4 h-full ${href ? "hover:border-slate-300 hover:shadow-sm transition-all" : ""}`}>
      <div className="flex items-center gap-1.5 text-[13px] text-slate-600">
        <span className={iconTone}>{icon}</span>
        <span className="flex-1 truncate">{title}</span>
        <Dot real={real} />
      </div>
      <div className="text-xl font-bold text-slate-800 tabular-nums mt-1.5">{value}</div>
      {sub && <div className={`text-[11px] mt-0.5 ${subTone ?? "text-slate-400"}`}>{sub}</div>}
      {children}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] font-semibold text-slate-500 -mb-1 px-0.5">{children}</div>;
}

// ---- ข้อมูลเปิด Popup แดชบอร์ดแผนก (KPI+รายการ หรือ ฝังหน้าเต็ม) ----
type DeptDrill = { key: string; label: string; icon: string; stats: DeptStat[]; embedUrl?: string };
const statTone = (t?: DeptStat["tone"]) =>
  t === "danger" ? "text-red-600" : t === "warning" ? "text-amber-600" : "text-slate-800";

// ---- 6 แผนก: ผลิต / ซื้อ / ขาย / QC / Design / จัดการงาน (ตัวเลขสำคัญต่อแผนก) ----
function buildDepts(
  s: ExecutiveSummary["sales"], f: ExecutiveSummary["finance"], o: ExecutiveSummary["ops"], dept: DeptOverview | null,
): DeptDef[] {
  const p = dept?.production, pu = dept?.purchasing, sa = dept?.sales, q = dept?.qc, d = dept?.design, t = dept?.tasks;
  // tone (แดง/เหลือง) ติดเฉพาะเมื่อค่ามากกว่า 0
  const stat = (x: number | undefined, v: string, l: string, tone?: DeptStat["tone"]): DeptStat =>
    ({ v, l, n: x ?? 0, tone: (x ?? 0) > 0 ? tone : undefined });
  const num   = (x: number | undefined, l: string, tone?: DeptStat["tone"]) => stat(x, (x ?? 0).toLocaleString("th-TH"), l, tone);
  const money = (x: number | undefined, l: string, tone?: DeptStat["tone"]) => stat(x, bahtC(x ?? 0), l, tone);
  return [
    { key: "production", icon: "🏭", label: "ผลิต", short: "ผลิต", href: "/master/production-dashboard", stats: [
      num(p?.in_production, "กำลังผลิต (ใบ)"),
      num(p?.unassigned, "ยังไม่แจกงาน"),
      num(o.mo_overdue, "เลยกำหนด", "danger"),
      money(p?.labor_month, "ค่าแรงเดือนนี้"),
    ] },
    { key: "purchasing", icon: "🛒", label: "ซื้อ (จัดซื้อ)", short: "จัดซื้อ", href: "/purchasing/dashboard", stats: [
      num(o.pr_waiting, "ขอซื้อรออนุมัติ", "warning"),
      num(pu?.awaiting_goods, "รอของเข้า"),
      money(f.ap_unpaid, "ค้างจ่าย", "danger"),
      money(pu?.spend_month, "ยอดซื้อเดือนนี้"),
    ] },
    { key: "sales", icon: "💰", label: "ขาย", short: "ขาย", href: "/sales/dashboard", stats: [
      money(s.internal_month, "ยอดขายเดือนนี้"),
      num(f.ar_count, "ใบวางบิลค้าง", "warning"),
      num(sa?.orders_month, "ออเดอร์เดือนนี้"),
      money(f.ar_due, "ลูกหนี้ค้างเก็บ"),
    ] },
    { key: "qc", icon: "✅", label: "QC", short: "QC", href: "/master/qc-warehouse", stats: [
      num(o.qc_defect, "ของเสียค้าง", "danger"),
      num(q?.pending_check, "งานรอตรวจ", "warning"),
    ] },
    { key: "design", icon: "🎨", label: "Design (ออกแบบ)", short: "ออกแบบ", href: "/master/design-dashboard", stats: [
      num(d?.due_soon, "ใกล้ครบกำหนด", "danger"),
      num(d?.designing, "กำลังออกแบบ"),
      num(d?.quoted, "รอส่งลูกค้า"),
      num(d?.revising, "กำลังแก้ไข"),
    ] },
    { key: "tasks", icon: "🗂️", label: "จัดการงาน", short: "จัดการงาน", tiny: "งาน", href: "/tasks", stats: [
      num(t?.total_active, "งานทั้งหมด"),
      num(t?.review_pending, "รอตรวจ/อนุมัติ", "warning"),
      num(t?.overdue, "เกินกำหนด", "danger"),
      num(t?.done_month, "เสร็จเดือนนี้"),
    ] },
  ];
}

// ---- Popup: รายการที่ต้องจัดการ ต่อแผนก (กดจากการ์ด) ----
function DeptItemsModal({ dept, onClose }: { dept: DeptDrill; onClose: () => void }) {
  const router = useRouter();
  const [groups, setGroups] = useState<DeptItemGroup[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (dept.embedUrl) { setLoading(false); return; }   // โหมดฝังหน้า → ไม่ต้องดึงรายการ
    setLoading(true);
    apiFetch(`/api/dashboard/dept-items?dept=${dept.key}`)
      .then((r) => r.json())
      .then((j) => setGroups((j.data ?? []) as DeptItemGroup[]))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, [dept.key, dept.embedUrl]);

  const go = (link: string) => { onClose(); router.push(link); };
  const totalItems = (groups ?? []).reduce((sum, g) => sum + g.items.length, 0);

  // โหมดฝังหน้าเต็ม (iframe) — เปิดแดชบอร์ดจริงของแผนกใน Popup (shell ซ่อนเมนูให้เองด้วย ?embed=1)
  if (dept.embedUrl) {
    return (
      <ResizableModal onClose={onClose} storageKey="erp_dept_popup_size"
        title={<><span className="text-xl">{dept.icon}</span><span className="text-base font-semibold text-slate-800 truncate">{dept.label}</span></>}
        headerActions={<a href={dept.embedUrl} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline mr-1 shrink-0">เปิดเต็มจอ ↗</a>}>
        <iframe src={`${dept.embedUrl}?embed=1`} title={dept.label} className="w-full h-full border-0" />
      </ResizableModal>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
          <span className="text-xl">{dept.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-slate-800">{dept.label} — รายการที่ต้องจัดการ</div>
            {!loading && <div className="text-xs text-slate-400">{totalItems} รายการ</div>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center">✕</button>
        </div>

        {/* แถวตัวเลขสรุป (mini-dashboard ของแผนก) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 pt-3">
          {dept.stats.map((st, i) => (
            <div key={i} className="bg-slate-50 rounded-lg px-3 py-2">
              <div className={`text-lg font-bold tabular-nums ${statTone(st.tone)}`}>{st.v}</div>
              <div className="text-[11px] text-slate-500 leading-tight">{st.l}</div>
            </div>
          ))}
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">รายการที่ต้องจัดการ</div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />)}</div>
          ) : (groups ?? []).length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-10">ไม่มีรายการที่ต้องจัดการ 🎉</div>
          ) : (
            (groups ?? []).map((g) => (
              <div key={g.key}>
                <div className="flex items-center justify-between mb-1.5 px-0.5">
                  <span className="text-sm font-semibold text-slate-700">{g.label} <span className="text-slate-400 font-normal">({g.items.length})</span></span>
                  <button onClick={() => go(g.link)} className="text-xs text-blue-600 hover:underline shrink-0">เปิดหน้าเต็ม →</button>
                </div>
                {g.items.length === 0 ? (
                  <div className="text-xs text-slate-400 px-2 py-3 bg-slate-50 rounded-lg text-center">ไม่มี 🎉</div>
                ) : (
                  <div className="space-y-1">
                    {g.items.map((it, i) => (
                      <button key={i} onClick={() => go(it.link)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                        <div className="text-sm text-slate-800 truncate">{it.title}</div>
                        {it.subtitle && <div className="text-xs text-slate-400 truncate">{it.subtitle}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

