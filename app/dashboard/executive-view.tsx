"use client";

// ============================================================
// มุมมองผู้บริหาร (Executive Command Center) — เห็นสุขภาพธุรกิจทั้งบริษัทในหน้าเดียว
// self-contained: โหลด /api/dashboard/executive เอง (gate admin ที่ server)
// ป้ายสถานะข้อมูล: 🟢 = ข้อมูลจริงพร้อม · 🟡 = ต้องเชื่อมเพิ่ม/ชุดตัวอย่าง
// ============================================================
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { ExecutiveResponse, ExecutiveSummary } from "@/app/api/dashboard/executive/route";
import type { DeptOverview } from "@/app/api/dashboard/dept-overview/route";

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

export function ExecutiveView({ salesTrend = [] }: { salesTrend?: { d: string; sales: number }[] }) {
  const [data, setData]       = useState<ExecutiveSummary | null>(null);
  const [dept, setDept]       = useState<DeptOverview | null>(null);   // สรุปต่อแผนก (ของกลาง)
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState<string | null>(null);

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

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />)}
        </div>
        <div className="h-40 bg-white rounded-xl border border-slate-200 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />)}
        </div>
      </div>
    );
  }
  if (err) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <div className="text-3xl mb-2 opacity-60">🔒</div>
        <p className="text-sm text-red-700">{err}</p>
        <button onClick={load} className="mt-3 text-xs text-red-600 underline">ลองใหม่</button>
      </div>
    );
  }
  if (!data) return null;

  const f = data.finance, s = data.sales, o = data.ops;
  const odPct = data.finance.od_limit > 0 ? Math.min(100, Math.round((f.od_used / f.od_limit) * 100)) : 0;

  return (
    <div className="space-y-5">
      {/* legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><Dot real /> ข้อมูลจริงพร้อม</span>
        <span className="inline-flex items-center gap-1.5"><Dot real={false} /> ต้องเชื่อมข้อมูลเพิ่ม / ชุดตัวอย่าง</span>
        <span className="ml-auto text-slate-400 hidden sm:inline">
          อัปเดต {new Date(data.as_of).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} · เรต ¥1 = ฿{data.fx_rate}
        </span>
      </div>

      {/* ---- KPI ผลประกอบการ ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon="💰" label="ยอดขายวันนี้"      value={bahtC(s.today)} real={false} hint="ทุกช่องทางรวมกัน" />
        <Kpi icon="📈" label="ยอดขายเดือนนี้"     value={bahtC(s.month)} real={false}
             hint={`ภายใน ${bahtC(s.internal_month)} · ออนไลน์ ${bahtC(s.marketplace_month)}`} />
        <Kpi icon="📊" label="กำไรขั้นต้น (เดือนนี้)" value={bahtC(data.profit.gross_est_month)} real={false}
             hint={`ประมาณ · มาร์จินเฉลี่ย ${pct(data.profit.margin_pct)}`} />
        <Kpi icon="🏦" label="ภาระหนี้รวม"        value={bahtC(f.loan_outstanding + f.od_used)} real
             hint="เงินกู้ + OD ที่ใช้ไป" />
      </div>

      {/* ---- กราฟยอดขาย 14 วัน ---- */}
      <SalesBars data={salesTrend} />

      {/* ---- แยกตามแผนก (ตัวเลขสำคัญ + กดเจาะเข้าดู) ---- */}
      <SectionLabel>แยกตามแผนก</SectionLabel>
      <DeptGrid s={s} f={f} o={o} dept={dept} />

      {/* ---- การเงิน ---- */}
      <SectionLabel>การเงิน</SectionLabel>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      <p className="text-[11px] text-slate-400 pt-1">
        🟡 = ค่าประมาณหรือชุดตัวอย่าง (ยอดขาย/กำไร/ลูกหนี้/OD/สต๊อก) — จะแม่นขึ้นเมื่อป้อนข้อมูลจริงครบ · เฉพาะแอดมินเห็นหน้านี้
      </p>
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

// ---- การ์ดแผนก (ของกลาง): หัวข้อ + ปุ่มเจาะเข้าดู + ตัวเลขสำคัญ ----
type DeptStat = { v: React.ReactNode; l: string; tone?: "danger" | "warning" };

function DeptCard({ icon, title, href, stats }: { icon: string; title: string; href: string; stats: DeptStat[] }) {
  const toneColor = (t?: DeptStat["tone"]) =>
    t === "danger" ? "text-red-600" : t === "warning" ? "text-amber-600" : "text-slate-800";
  return (
    <Link href={href} className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg leading-none">{icon}</span>
        <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{title}</span>
        <span className="text-xs text-blue-600 shrink-0">ดูทั้งหมด →</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((st, i) => (
          <div key={i}>
            <div className={`text-xl font-bold tabular-nums ${toneColor(st.tone)}`}>{st.v}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{st.l}</div>
          </div>
        ))}
      </div>
    </Link>
  );
}

// ---- 6 การ์ดแผนก: ผลิต / ซื้อ / ขาย / QC / Design / จัดการงาน ----
function DeptGrid({ s, f, o, dept }: {
  s: ExecutiveSummary["sales"]; f: ExecutiveSummary["finance"]; o: ExecutiveSummary["ops"];
  dept: DeptOverview | null;
}) {
  const p = dept?.production, pu = dept?.purchasing, sa = dept?.sales, q = dept?.qc, d = dept?.design, t = dept?.tasks;
  const n  = (x?: number) => (x ?? 0).toLocaleString("th-TH");
  const gt0 = (x?: number) => (x ?? 0) > 0;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <DeptCard icon="🏭" title="ผลิต" href="/master/production-dashboard" stats={[
        { v: n(p?.in_production), l: "กำลังผลิต (ใบ)" },
        { v: n(p?.unassigned),   l: "ยังไม่แจกงาน" },
        { v: n(o.mo_overdue),    l: "เลยกำหนด", tone: gt0(o.mo_overdue) ? "danger" : undefined },
        { v: bahtC(p?.labor_month ?? 0), l: "ค่าแรงเดือนนี้" },
      ]} />
      <DeptCard icon="🛒" title="ซื้อ (จัดซื้อ)" href="/purchasing/dashboard" stats={[
        { v: n(o.pr_waiting),       l: "ขอซื้อรออนุมัติ", tone: gt0(o.pr_waiting) ? "warning" : undefined },
        { v: n(pu?.awaiting_goods), l: "รอของเข้า" },
        { v: bahtC(f.ap_unpaid),    l: "ค้างจ่าย", tone: gt0(f.ap_unpaid) ? "danger" : undefined },
        { v: bahtC(pu?.spend_month ?? 0), l: "ยอดซื้อเดือนนี้" },
      ]} />
      <DeptCard icon="💰" title="ขาย" href="/sales-orders" stats={[
        { v: bahtC(s.internal_month), l: "ยอดขายเดือนนี้" },
        { v: n(f.ar_count),           l: "ใบวางบิลค้าง", tone: gt0(f.ar_count) ? "warning" : undefined },
        { v: n(sa?.orders_month),     l: "ออเดอร์เดือนนี้" },
        { v: bahtC(f.ar_due),         l: "ลูกหนี้ค้างเก็บ" },
      ]} />
      <DeptCard icon="✅" title="QC" href="/master/qc-warehouse" stats={[
        { v: n(o.qc_defect),      l: "ของเสียค้าง", tone: gt0(o.qc_defect) ? "danger" : undefined },
        { v: n(q?.pending_check), l: "งานรอตรวจ", tone: gt0(q?.pending_check) ? "warning" : undefined },
      ]} />
      <DeptCard icon="🎨" title="Design (ออกแบบ)" href="/master/design-dashboard" stats={[
        { v: n(d?.due_soon),  l: "ใกล้ครบกำหนด", tone: gt0(d?.due_soon) ? "danger" : undefined },
        { v: n(d?.designing), l: "กำลังออกแบบ" },
        { v: n(d?.quoted),    l: "รอส่งลูกค้า" },
        { v: n(d?.revising),  l: "กำลังแก้ไข" },
      ]} />
      <DeptCard icon="🗂️" title="จัดการงาน" href="/tasks" stats={[
        { v: n(t?.total_active),   l: "งานทั้งหมด" },
        { v: n(t?.review_pending), l: "รอตรวจ/อนุมัติ", tone: gt0(t?.review_pending) ? "warning" : undefined },
        { v: n(t?.overdue),        l: "เกินกำหนด", tone: gt0(t?.overdue) ? "danger" : undefined },
        { v: n(t?.done_month),     l: "เสร็จเดือนนี้" },
      ]} />
    </div>
  );
}

// ---- กราฟแท่งยอดขาย 14 วัน (reuse ข้อมูล /api/dashboard/sales-trend) ----
function SalesBars({ data }: { data: { d: string; sales: number }[] }) {
  const vals = data.map((x) => Number(x.sales) || 0);
  const total = vals.reduce((s, v) => s + v, 0);
  const max = Math.max(1, ...vals);
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-700">ยอดขายออนไลน์ 14 วันล่าสุด</span>
        <span className="text-xs text-slate-400">รวม {baht(total)}</span>
      </div>
      {vals.length === 0 || total === 0 ? (
        <div className="text-xs text-slate-300 py-6 text-center">ยังไม่มีข้อมูลยอดขายรายวัน (ป้อนไฟล์ยอดขายที่หน้าการตลาด)</div>
      ) : (
        <>
          <div className="flex items-end gap-1 h-24">
            {vals.map((v, i) => (
              <div key={i} className="flex-1 bg-blue-500/80 hover:bg-blue-600 rounded-t transition-colors"
                style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
                title={`${data[i] ? new Date(data[i].d).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : ""}: ${baht(v)}`} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>{data[0] && new Date(data[0].d).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
            <span>{data[data.length - 1] && new Date(data[data.length - 1].d).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
          </div>
        </>
      )}
    </div>
  );
}
