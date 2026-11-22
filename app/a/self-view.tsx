"use client";

// ============================================================
// SelfView — หน้าเล็กของพนักงานในไลน์บริษัท (เปิดผ่าน LIFF /a?me=payslip|warning|piecework)
//   เช็กตัวตนจาก LINE ใหม่ทุกครั้ง (id_token) · ยังไม่ผูก / รอ HR ยืนยัน / ถูกระงับ = บอกเป็นภาษาคน ไม่โชว์ข้อมูล
//   กติกา + ตัวเลขสลิป: lib/line-self-view.ts · API: /api/employee-line/self
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { initLiffIdToken, type LiffSdk } from "@/lib/liff-client";
import {
  LINE_SELF_GATE_TEXT, LINE_SELF_PAGES, LINE_SELF_TITLE, WO_STATUS_TEXT,
  type LineSelfPage, type SelfSlipDetail, type SelfSlipSummary, type SelfWarning, type SelfWorkOrder,
} from "@/lib/line-self-view";

type Me = { code: string; name: string; lang: "th" | "en" };
type Data =
  | { gate: "not_linked" | "blocked" | "wait_hr" }
  | { gate: "ok"; page: "payslip"; me: Me; slips: SelfSlipSummary[]; slip: SelfSlipDetail | null }
  | { gate: "ok"; page: "warning"; me: Me; warnings: SelfWarning[] }
  | { gate: "ok"; page: "piecework"; me: Me; orders: SelfWorkOrder[]; wage_this_month: number; open_count: number };

const TAB_ICON: Record<LineSelfPage, string> = { payslip: "money", warning: "warning", piecework: "toolbox" };
const TAB_SHORT: Record<LineSelfPage, string> = { payslip: "เงินเดือน", warning: "ใบเตือน", piecework: "งานเหมา" };

const baht = (v: number) => v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const date = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00+07:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "-");

export function SelfView({ initial }: { initial: LineSelfPage }) {
  const [page, setPage] = useState<LineSelfPage>(initial);
  const [liff, setLiff] = useState<LiffSdk | null>(null);
  const [idToken, setIdToken] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    initLiffIdToken()
      .then((r) => { if (r && alive) { setLiff(r.liff); setIdToken(r.idToken); } })
      .catch((e: Error) => { if (alive) { setErr(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async (p: LineSelfPage, slipId?: string) => {
    if (!idToken) return;
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/employee-line/self", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id_token: idToken, page: p, slip_id: slipId }) });
      const j = await r.json().catch(() => ({ error: "โหลดไม่สำเร็จ กรุณาลองใหม่" }));
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ กรุณาลองใหม่");
      setData(j.data as Data);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, [idToken]);

  useEffect(() => { void load(page); }, [load, page]);

  const me = data && data.gate === "ok" ? data.me : null;

  return (
    <main className="mx-auto min-h-screen max-w-md bg-slate-50 pb-10">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 pt-4 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900">{LINE_SELF_TITLE[page]}</h1>
            {me && <p className="truncate text-xs text-slate-500">{me.name} · {me.code}</p>}
          </div>
          {liff?.closeWindow && (
            <button type="button" onClick={() => liff.closeWindow?.()} className="h-9 rounded-lg border border-slate-200 px-3 text-xs text-slate-600">ปิด</button>
          )}
        </div>
        <nav className="mt-3 grid grid-cols-3 gap-1">
          {LINE_SELF_PAGES.map((p) => (
            <button key={p} type="button" onClick={() => setPage(p)}
              className={`flex h-10 items-center justify-center gap-1 border-b-2 text-sm ${p === page ? "border-emerald-600 font-semibold text-emerald-700" : "border-transparent text-slate-500"}`}>
              <Icon name={TAB_ICON[p]} /> {TAB_SHORT[p]}
            </button>
          ))}
        </nav>
      </header>

      <div className="space-y-3 p-4">
        {err ? (
          <Box tone="danger" title="เปิดไม่สำเร็จ" body={err} action={idToken ? { label: "ลองใหม่", onClick: () => void load(page) } : undefined} />
        ) : loading && !data ? (
          <Skeleton />
        ) : !data ? null : data.gate !== "ok" ? (
          <Box tone={data.gate === "wait_hr" ? "warning" : "muted"} title={LINE_SELF_GATE_TEXT[data.gate].title} body={LINE_SELF_GATE_TEXT[data.gate].body} />
        ) : data.page !== page ? (
          <Skeleton />
        ) : data.page === "payslip" ? (
          <PayslipPage slips={data.slips} slip={data.slip} busy={loading} onPick={(id) => void load("payslip", id)} />
        ) : data.page === "warning" ? (
          <WarningPage warnings={data.warnings} />
        ) : (
          <PieceworkPage orders={data.orders} wage={data.wage_this_month} open={data.open_count} />
        )}
      </div>
    </main>
  );
}

function PayslipPage({ slips, slip, busy, onPick }: { slips: SelfSlipSummary[]; slip: SelfSlipDetail | null; busy: boolean; onPick: (id: string) => void }) {
  if (!slip) return <Box tone="muted" title="ยังไม่มีสลิปให้ดู" body="ฝ่ายบุคคลจะเปิดให้ดูสลิปหลังตรวจงวดเงินเดือนเสร็จ ถ้าสงสัยติดต่อฝ่ายบุคคล" />;
  const en = slip.lang === "en";
  return (
    <>
      {slips.length > 1 && (
        <select value={slip.id} disabled={busy} onChange={(e) => onPick(e.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
          {slips.map((s) => <option key={s.id} value={s.id}>{s.period_name}</option>)}
        </select>
      )}
      <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${busy ? "opacity-60" : ""}`}>
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
          <div>
            <div className="font-semibold text-slate-800">{slip.period_name}</div>
            <div className="text-xs text-slate-500">{date(slip.start_date)} – {date(slip.end_date)}</div>
          </div>
          <div className="text-right text-[11px] text-slate-400">{slip.payslip_no}{slip.work_days ? <div>{en ? "Work days" : "วันทำงาน"} {qty(slip.work_days)}</div> : null}</div>
        </div>
        <MoneyList title={en ? "Earnings" : "รายได้"} tone="text-emerald-700" rows={slip.earnings} total={slip.earnings_total} totalLabel={en ? "Total earnings" : "รวมรายได้"} />
        <MoneyList title={en ? "Deductions" : "รายการหัก"} tone="text-rose-700" rows={slip.deductions} total={slip.deduction_total} totalLabel={en ? "Total deductions" : "รวมหัก"} />
        <div className="mt-3 rounded-xl bg-slate-900 p-3 text-center text-white">
          <div className="text-xs text-slate-300">{en ? "Net pay" : "ยอดจ่ายสุทธิ"}</div>
          <div className="mt-0.5 text-2xl font-bold tracking-wider">{slip.net_display}</div>
          {slip.net_is_code && <div className="mt-0.5 text-[10px] text-slate-400">เข้ารหัสแบบเดียวกับสลิปกระดาษ</div>}
        </div>
      </section>
      <p className="text-center text-[11px] text-slate-400">ตัวเลขไม่ตรง แจ้งฝ่ายบุคคลได้เลย</p>
    </>
  );
}

function MoneyList({ title, tone, rows, total, totalLabel }: { title: string; tone: string; rows: { label: string; amount: number }[]; total: number; totalLabel: string }) {
  return (
    <div className="mt-3">
      <div className={`mb-1 text-xs font-semibold ${tone}`}>{title}</div>
      {rows.length === 0 ? <div className="text-xs text-slate-400">ไม่มีรายการ</div> : rows.map((r) => (
        <div key={r.label} className="flex justify-between py-0.5 text-sm text-slate-700"><span>{r.label}</span><span className="tabular-nums">{baht(r.amount)}</span></div>
      ))}
      <div className="mt-1 flex justify-between border-t border-dashed border-slate-200 pt-1 text-sm font-semibold text-slate-800"><span>{totalLabel}</span><span className="tabular-nums">{baht(total)}</span></div>
    </div>
  );
}

function WarningPage({ warnings }: { warnings: SelfWarning[] }) {
  const active = warnings.filter((w) => w.active).length;
  if (warnings.length === 0) return <Box tone="success" title="ไม่มีใบเตือน" body="ทำงานดีมากครับ" />;
  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">ใบเตือนที่ยังมีผล <b className={active ? "text-rose-600" : "text-emerald-600"}>{active}</b> ใบ{warnings.length > active ? ` · ยกเลิกแล้ว ${warnings.length - active} ใบ` : ""}</div>
      {warnings.map((w) => (
        <article key={w.id} className={`rounded-xl border bg-white p-3 ${w.active ? "border-rose-200" : "border-slate-200 opacity-60"}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold text-slate-800">{w.title || "ใบเตือน"}</div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${w.active ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}>{w.active ? (w.severity || "มีผล") : "ยกเลิกแล้ว"}</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">{date(w.warning_date)}</div>
          {w.detail && <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">{w.detail}</p>}
        </article>
      ))}
      <p className="text-center text-[11px] text-slate-400">มีข้อสงสัยเรื่องใบเตือน ติดต่อฝ่ายบุคคลหรือหัวหน้า</p>
    </>
  );
}

function PieceworkPage({ orders, wage, open }: { orders: SelfWorkOrder[]; wage: number; open: number }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">ค่าแรงที่ลงแล้วเดือนนี้</div><div className="text-xl font-bold text-emerald-700 tabular-nums">฿{baht(wage)}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">งานที่กำลังทำ</div><div className="text-xl font-bold text-slate-800">{open} <span className="text-sm font-normal">ใบ</span></div></div>
      </div>
      {orders.length === 0 ? <Box tone="muted" title="ยังไม่มีงานเหมาใน 4 เดือนนี้" body="ถ้ารับงานแล้วแต่ไม่ขึ้น แจ้งหัวหน้าให้ลงชื่อคุณในใบจ่ายงาน" /> : orders.map((o) => {
        const pct = o.qty > 0 ? Math.min(100, Math.round((o.received_qty / o.qty) * 100)) : 0;
        const late = o.status === "dispatched" && o.due_date && o.due_date < new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
        return (
          <article key={o.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="truncate font-semibold text-slate-800">{o.product || o.wo_no}</div><div className="text-xs text-slate-500">{o.wo_no}{o.stage ? ` · ${o.stage}` : ""}{o.people > 1 ? ` · ทำร่วม ${o.people} คน` : ""}</div></div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${o.status === "done" ? "bg-emerald-50 text-emerald-700" : late ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{late ? "เลยกำหนด" : WO_STATUS_TEXT[o.status] ?? o.status}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
            <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-slate-600">
              <span>รับคืนแล้ว {qty(o.received_qty)}/{qty(o.qty)} {o.uom}</span>
              <span>รับงาน {date(o.dispatch_date)}{o.due_date ? ` · ส่ง ${date(o.due_date)}` : ""}</span>
            </div>
            {(o.my_sent_qty > 0 || o.my_wage > 0) && (
              <div className="mt-1.5 flex justify-between rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-700"><span>ฉันส่งแล้ว {qty(o.my_sent_qty)} {o.uom}</span><span className="font-semibold tabular-nums">ค่าแรง ฿{baht(o.my_wage)}</span></div>
            )}
          </article>
        );
      })}
      <p className="text-center text-[11px] text-slate-400">ค่าแรงจริงตัดยอดตามสลิปเงินเดือน · ตัวเลขไม่ตรงแจ้งหัวหน้า</p>
    </>
  );
}

function Box({ tone, title, body, action }: { tone: "danger" | "warning" | "muted" | "success"; title: string; body: string; action?: { label: string; onClick: () => void } }) {
  const cls = { danger: "border-rose-200 bg-rose-50 text-rose-800", warning: "border-amber-200 bg-amber-50 text-amber-800", muted: "border-slate-200 bg-white text-slate-700", success: "border-emerald-200 bg-emerald-50 text-emerald-800" }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="font-semibold">{title}</div>
      <p className="mt-1 text-sm opacity-90">{body}</p>
      {action && <button type="button" onClick={action.onClick} className="mt-3 h-10 rounded-lg border border-current px-4 text-sm">{action.label}</button>}
    </div>
  );
}

function Skeleton() {
  return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200/70" />)}</div>;
}
