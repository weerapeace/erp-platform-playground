"use client";

/**
 * Payroll — ตรวจทั้งงวด (ไม่แก้ข้อมูลเอง · ปุ่ม "คิดราคาใหม่" ถามยืนยันก่อนทุกครั้ง)
 * เปิดงวดเดียว เห็น "ที่มาที่ไป" ของเงินทุกบาท: สะพานเงินทั้งงวด → ตรวจอัตโนมัติ → รายคน (สูตร + รายการต้นทาง)
 * ข้อมูล/สูตรทั้งหมดมาจาก lib/payroll-period-recheck (ใช้กฎกลางเดียวกับเครื่องคำนวณ) ผ่าน /api/payroll/period-recheck
 * ใช้ของกลาง: MiniTable (รายชื่อ) · Drawer (ที่มาของเงินรายคน) · ERPModal + ConfirmDialog (คิดราคาใหม่) · Toast · Icon · state-views
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { usePayrollPeriod } from "@/components/payroll/payroll-period-context";
import { ConfirmDialog, Drawer, ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Icon } from "@/components/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import type { PeriodRecheck, RecheckCheck, RecheckFlag, RecheckItem, RecheckPerson, RepriceItem } from "@/lib/payroll-period-recheck";
import type { RepriceResult } from "@/lib/payroll-period-recheck-db";

const baht = (n: number) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bahtInt = (n: number) => `฿${Math.round(Number(n || 0)).toLocaleString("th-TH")}`;

const FLAG_LABEL: Record<RecheckFlag, { label: string; cls: string }> = {
  changed: { label: "ยอดเปลี่ยนหลังคำนวณ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  source_mismatch: { label: "ต้นทางไม่ตรง", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  old_price: { label: "ราคาเก่า", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  zero_gross: { label: "รายได้ ฿0", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  negative: { label: "ติดลบ", cls: "bg-red-50 text-red-700 border-red-200" },
  not_in_saved: { label: "ยังไม่อยู่ในผลคำนวณ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  not_in_live: { label: "ไม่อยู่ในผลสดแล้ว", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};
const CHECK_ICON: Record<RecheckCheck["level"], { name: string; cls: string }> = {
  ok: { name: "done", cls: "text-emerald-600" },
  info: { name: "info", cls: "text-slate-400" },
  warning: { name: "warning", cls: "text-amber-600" },
  error: { name: "forbidden", cls: "text-red-600" },
};

type PeopleFilter = { label: string; ids?: Set<string>; fields?: string[] } | null;

export default function PeriodRecheckPage() {
  const { periods, periodId, setPeriodId } = usePayrollPeriod();
  const [data, setData] = useState<PeriodRecheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [filter, setFilter] = useState<PeopleFilter>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [repriceOpen, setRepriceOpen] = useState(false);

  const load = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch(`/api/payroll/period-recheck?period_id=${encodeURIComponent(pid)}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setData(j.data as PeriodRecheck);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); setData(null);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { setFilter(null); setOpenId(null); void load(periodId); }, [periodId, load]);

  const people = useMemo(() => {
    let rows = data?.people ?? [];
    if (onlyFlagged) rows = rows.filter((p) => p.flags.length);
    if (filter?.ids) rows = rows.filter((p) => filter.ids!.has(p.employee_id));
    if (filter?.fields) rows = rows.filter((p) => p.items.some((it) => filter.fields!.includes(it.key) && it.amount !== 0));
    return rows;
  }, [data, onlyFlagged, filter]);
  const flaggedCount = data?.people.filter((p) => p.flags.length).length ?? 0;
  const open = data?.people.find((p) => p.employee_id === openId) ?? null;
  const editable = !!data && ["draft", "review"].includes(data.period.status);

  const showPeople = (f: PeopleFilter) => {
    setFilter(f); setOnlyFlagged(false);
    requestAnimationFrame(() => document.getElementById("recheck-people")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const columns: MiniColumn<RecheckPerson>[] = [
    { key: "who", header: "พนักงาน", width: "1.6fr", sortValue: (p) => p.code, sortLabel: "รหัส",
      cell: (p) => <span className="block truncate"><b className="text-slate-800">{p.code}</b> <span className="text-slate-500">{p.name}</span></span> },
    { key: "type", header: "ประเภท", width: "6rem", sortValue: (p) => p.wage_label, cell: (p) => <span className="text-xs text-slate-500">{p.wage_label}</span> },
    { key: "gross", header: "รายได้", width: "7rem", align: "right", sortValue: (p) => p.gross, cell: (p) => <span className="tabular-nums">{baht(p.gross)}</span> },
    { key: "ded", header: "หัก", width: "7rem", align: "right", sortValue: (p) => p.total_deduction, cell: (p) => <span className="tabular-nums text-red-600">{baht(p.total_deduction)}</span> },
    { key: "net", header: "สุทธิ", width: "7rem", align: "right", sortValue: (p) => p.net, cell: (p) => <span className="tabular-nums font-semibold">{baht(p.net)}</span> },
    { key: "flags", header: "ควรดู", width: "1.4fr", sortValue: (p) => p.flags.length,
      cell: (p) => p.flags.length
        ? <span className="flex flex-wrap gap-1">{p.flags.map((f) => <span key={f} className={`rounded-full border px-2 py-0.5 text-[11px] ${FLAG_LABEL[f].cls}`}>{FLAG_LABEL[f].label}</span>)}</span>
        : <span className="text-xs text-emerald-600">ตรง</span> },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800"><Icon name="calc" /> ตรวจทั้งงวด</h1>
          <p className="mt-1 text-sm text-slate-500">ดูที่มาที่ไปของเงินทุกบาทในงวด — ยอดรวม · ตรวจอัตโนมัติ · รายคนพร้อมสูตรและรายการต้นทาง (หน้านี้ไม่แก้ข้อมูลเอง ยกเว้นกด "คิดราคาใหม่" ซึ่งถามก่อนเสมอ)</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">งวด</span>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="h-10 min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 text-sm">
              {periods.map((p) => <option key={p.id} value={p.id}>{p.period_name} ({p.status})</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void load(periodId)} disabled={loading}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <Icon name="refresh" /> ตรวจใหม่
          </button>
        </div>
      </div>

      {loading && !data && <LoadingState className="mt-10" label="กำลังไล่ตรวจทั้งงวด (คำนวณสดเทียบด้วย)..." />}
      {err && <ErrorState className="mt-6" title="ตรวจทั้งงวดไม่สำเร็จ" hint={err} onRetry={() => void load(periodId)} retrying={loading} />}
      {!loading && !err && !periodId && <EmptyState className="mt-10" title="เลือกงวดที่จะตรวจ" hint="ยังไม่มีงวดเงินเดือน" />}

      {data && (
        <div className={loading ? "opacity-60" : ""}>
          <div className="mt-2 text-xs text-slate-500">
            {data.basis === "saved" && data.run
              ? <>ใช้ผลคำนวณที่บันทึก รอบที่ {data.run.run_no}{data.run.calculated_at ? ` (${new Date(data.run.calculated_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })})` : ""} · {data.totals.people} คน</>
              : <span className="text-amber-700">ยังไม่ได้บันทึกผลคำนวณ — ตัวเลขเป็นผลคำนวณสด · {data.totals.people} คน</span>}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="รายได้รวม" value={bahtInt(data.totals.gross)} />
            <Stat label="หักรวม" value={bahtInt(data.totals.total_deduction)} />
            <Stat label="สุทธิ (โอนจริง)" value={bahtInt(data.totals.net_rounded)} strong />
            <Stat label="ภาษีบริษัทออกให้" value={bahtInt(data.totals.tax_company_paid)} hint={data.totals.tax_company_paid_people ? `${data.totals.tax_company_paid_people} คน` : undefined} />
          </div>

          <Section title="1 · เงินทั้งงวดมาจากไหน" hint="กดแถวเพื่อดูว่าใครบ้าง">
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {data.bridge.filter((b) => b.sign > 0).map((b) => <BridgeRow key={b.key} b={b} onClick={() => showPeople({ label: b.label, fields: b.fields })} />)}
              <TotalRow label="= รายได้รวม" value={baht(data.totals.gross)} />
              {data.bridge.filter((b) => b.sign < 0).map((b) => <BridgeRow key={b.key} b={b} onClick={() => showPeople({ label: b.label, fields: b.fields })} />)}
              <TotalRow label="= สุทธิ" value={`${baht(data.totals.net)} → โอนจริง ${bahtInt(data.totals.net_rounded)}`}
                hint={data.totals.tax_company_paid ? `ภาษีหัก ณ ที่จ่าย ฿${baht(data.totals.tax_company_paid)} ของ ${data.totals.tax_company_paid_people} คน บริษัทออกให้ จึงไม่อยู่ในยอดหัก` : undefined} />
            </div>
          </Section>

          <Section title="2 · ตรวจอัตโนมัติ">
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {data.checks.map((c) => (
                <div key={c.code} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
                  <span className={`mt-0.5 text-lg ${CHECK_ICON[c.level].cls}`}><Icon name={CHECK_ICON[c.level].name} /></span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${c.level === "ok" ? "text-slate-700" : c.level === "error" ? "font-medium text-red-700" : c.level === "warning" ? "font-medium text-amber-800" : "text-slate-700"}`}>{c.title}</div>
                    {c.detail && <div className="mt-0.5 text-xs text-slate-500">{c.detail}</div>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {c.employee_ids?.length ? (
                      <button type="button" onClick={() => showPeople({ label: c.title, ids: new Set(c.employee_ids) })}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">ดูรายคน ({c.employee_ids.length})</button>
                    ) : null}
                    {c.code === "old_price" && editable && data.reprice.length > 0 && (
                      <button type="button" onClick={() => setRepriceOpen(true)}
                        className="flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"><Icon name="calc" /> คิดราคาใหม่</button>
                    )}
                    {c.fix && <Link href={c.fix.href} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100">{c.fix.label}</Link>}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <div id="recheck-people" className="scroll-mt-4">
            <Section title="3 · รายคน" hint="กดชื่อเพื่อดูที่มาของเงินและสูตร">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <button type="button" onClick={() => { setOnlyFlagged(false); setFilter(null); }}
                  className={`rounded-full border px-3 py-1 text-xs ${!onlyFlagged && !filter ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600"}`}>ทั้งหมด {data.people.length}</button>
                <button type="button" onClick={() => { setOnlyFlagged(true); setFilter(null); }}
                  className={`rounded-full border px-3 py-1 text-xs ${onlyFlagged ? "border-amber-600 bg-amber-600 text-white" : "border-amber-200 bg-amber-50 text-amber-700"}`}>ควรดู {flaggedCount}</button>
                {filter && (
                  <span className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700">
                    กรอง: {filter.label} ({people.length})
                    <button type="button" aria-label="ล้างตัวกรอง" onClick={() => setFilter(null)} className="ml-1 hover:text-blue-900"><Icon name="cancel" /></button>
                  </span>
                )}
              </div>
              <MiniTable rows={people} columns={columns} rowKey={(p) => p.employee_id}
                searchText={(p) => `${p.code} ${p.name} ${p.wage_label}`} searchPlaceholder="ค้นรหัส / ชื่อ"
                groupBy={(p) => p.wage_label} groupLabel="จัดกลุ่มตามประเภทการจ้าง"
                onRowClick={(p) => setOpenId(p.employee_id)} emptyText="ไม่มีพนักงานตามตัวกรองนี้" />
            </Section>
          </div>
        </div>
      )}

      <Drawer open={!!open} onClose={() => setOpenId(null)} size="lg"
        title={open ? `${open.code} ${open.name}` : ""}
        description={open ? `${open.wage_label}${open.work_days ? ` · วันทำงานในงวด ${open.work_days.payable} วัน (${open.work_days.range})` : ""}` : undefined}>
        {open && <PersonDetail p={open} />}
      </Drawer>

      {data && <RepricePanel open={repriceOpen} onClose={() => setRepriceOpen(false)} data={data} onDone={() => void load(data.period.id)} />}
    </div>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`tabular-nums ${strong ? "text-2xl font-bold text-slate-900" : "text-xl font-semibold text-slate-800"}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline gap-2"><h2 className="text-sm font-semibold text-slate-700">{title}</h2>{hint && <span className="text-xs text-slate-400">{hint}</span>}</div>
      {children}
    </section>
  );
}

function BridgeRow({ b, onClick }: { b: PeriodRecheck["bridge"][number]; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="grid w-full grid-cols-[1fr_auto] gap-x-3 px-4 py-2.5 text-left hover:bg-slate-50">
      <span className="text-sm text-slate-800">{b.label} <span className="text-xs text-slate-400">· {b.people} คน</span></span>
      <span className={`tabular-nums text-sm font-medium ${b.sign > 0 ? "text-emerald-700" : "text-red-600"}`}>{b.sign > 0 ? "+" : "−"}{baht(b.amount)}</span>
      <span className="col-span-2 text-xs text-slate-500">{b.source}</span>
    </button>
  );
}

function TotalRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 bg-slate-50 px-4 py-2.5">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <span className="tabular-nums text-sm font-bold text-slate-900">{value}</span>
      {hint && <span className="col-span-2 text-xs text-slate-500">{hint}</span>}
    </div>
  );
}

function PersonDetail({ p }: { p: RecheckPerson }) {
  const earnings = p.items.filter((it) => it.sign > 0);
  const deductions = p.items.filter((it) => it.sign < 0);
  const infos = p.items.filter((it) => it.sign === 0);
  return (
    <div className="space-y-4 text-sm">
      {p.flags.includes("changed") && p.live_net != null && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ข้อมูลเปลี่ยนหลังคำนวณ — ถ้าคำนวณตอนนี้จะได้สุทธิ ฿{baht(p.live_net)} (ที่บันทึกไว้ ฿{baht(p.net)}) · ไปหน้าคำนวณงวดแล้วบันทึกใหม่
        </div>
      )}
      <ItemGroup items={earnings} total={{ label: "= รายได้รวม", value: p.gross }} />
      <ItemGroup items={deductions} total={{ label: "= หักรวม", value: p.total_deduction }} />
      {infos.length > 0 && <ItemGroup items={infos} />}
      <div className="flex items-baseline justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
        <span>สุทธิ {baht(p.gross)} − {baht(p.total_deduction)}</span>
        <span className="tabular-nums text-lg font-bold">{baht(p.net)} → โอน {bahtInt(p.net_rounded)}</span>
      </div>
    </div>
  );
}

function ItemGroup({ items, total }: { items: RecheckItem[]; total?: { label: string; value: number } }) {
  if (!items.length && !total) return null;
  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {items.map((it) => <ItemRow key={it.key} it={it} />)}
      {total && (
        <div className="flex justify-between bg-slate-50 px-3 py-2">
          <span className="font-semibold text-slate-800">{total.label}</span>
          <span className="tabular-nums font-bold text-slate-900">{baht(total.value)}</span>
        </div>
      )}
    </div>
  );
}

function ItemRow({ it }: { it: RecheckItem }) {
  const color = it.sign > 0 ? "text-emerald-700" : it.sign < 0 ? "text-red-600" : "text-slate-400";
  return (
    <div className="px-3 py-2.5">
      <div className="flex justify-between gap-3">
        <span className={it.sign === 0 ? "text-slate-500" : "text-slate-800"}>{it.label}</span>
        <span className={`tabular-nums font-medium ${color}`}>{it.sign > 0 ? "+" : it.sign < 0 ? "−" : ""}{baht(it.amount)}</span>
      </div>
      {it.formula && <div className="mt-0.5 text-xs text-slate-500">สูตร: {it.formula}</div>}
      {it.sources.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {it.sources.map((s, i) => {
            const cls = s.warn ? "border-amber-300 bg-amber-50 text-amber-800" : s.counted === false ? "border-slate-200 bg-white text-slate-400 line-through" : "border-slate-200 bg-slate-50 text-slate-600";
            const body = (
              <>
                {s.label}{s.amount != null && s.amount !== 0 ? ` · ฿${baht(s.amount)}` : ""}
                {s.warn && <span className="ml-1 no-underline">({s.warn})</span>}
              </>
            );
            const title = [s.note, s.warn].filter(Boolean).join(" · ") || undefined;
            return s.href
              ? <Link key={i} href={s.href} title={title} className={`rounded-full border px-2 py-0.5 text-[11px] hover:border-blue-300 ${cls}`}>{body}</Link>
              : <span key={i} title={title} className={`rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>{body}</span>;
          })}
        </div>
      )}
      {it.sources.some((s) => s.counted === false) && <div className="mt-1 text-[11px] text-slate-400">ขีดฆ่า = มีรายการแต่เครื่องคำนวณไม่นับ (ชี้เพื่อดูเหตุผล)</div>}
      {it.warn && <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">{it.warn}</div>}
    </div>
  );
}

/** คิดราคาใหม่ — ตัวอย่างทุกรายการก่อน → ยืนยัน (เยอะ = พิมพ์ CONFIRM) → server ตรวจซ้ำแล้วเขียน + audit */
function RepricePanel({ open, onClose, data, onDone }: { open: boolean; onClose: () => void; data: PeriodRecheck; onDone: () => void }) {
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RepriceResult | null>(null);
  useEffect(() => { if (!open) { setAsk(false); setResult(null); } }, [open]);

  const items = data.reprice;
  const people = new Set(items.map((it) => it.employee_id)).size;
  const netEffect = items.reduce((t, it) => t + it.net_effect, 0);
  const { id: periodId, work_days, hours_per_day } = data.period;
  const effectText = (n: number) => `${n < 0 ? "ได้น้อยลง" : "ได้เพิ่ม"} ฿${baht(Math.abs(n))}`;

  const run = async () => {
    setBusy(true);
    try {
      const j = await apiFetch("/api/payroll/period-recheck/reprice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, items: items.map(({ key, new_amount }) => ({ key, new_amount })) }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const res = j.data as RepriceResult;
      setResult(res); setAsk(false);
      if (res.updated) toast.success(`คิดราคาใหม่แล้ว ${res.updated} รายการ`);
      if (res.skipped.length) toast.warning(`ข้าม ${res.skipped.length} รายการ — ดูเหตุผลในหน้าต่าง`);
      onDone();
    } catch (e) {
      setAsk(false);
      toast.error(e instanceof Error ? e.message : "คิดราคาใหม่ไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  const columns: MiniColumn<RepriceItem>[] = [
    { key: "who", header: "พนักงาน", width: "minmax(9rem,1.3fr)", sortValue: (it) => it.code, cell: (it) => <span className="block truncate"><b className="text-slate-800">{it.code}</b> <span className="text-slate-500">{it.name}</span></span> },
    { key: "what", header: "รายการ", width: "minmax(8.5rem,1.5fr)", sortValue: (it) => it.label, cell: (it) => <span className="block truncate text-slate-700" title={it.item_label}>{it.label}</span> },
    { key: "old", header: "ราคาเดิม", width: "6rem", align: "right", sortValue: (it) => it.old_amount, cell: (it) => <span className="tabular-nums text-slate-400 line-through">{baht(it.old_amount)}</span> },
    { key: "new", header: "ราคาใหม่", width: "6rem", align: "right", sortValue: (it) => it.new_amount, cell: (it) => <span className="tabular-nums font-medium text-slate-800">{baht(it.new_amount)}</span> },
    { key: "net", header: "ผลต่อสุทธิ", width: "6.5rem", align: "right", sortValue: (it) => it.net_effect,
      cell: (it) => <span className={`tabular-nums ${it.net_effect < 0 ? "text-red-600" : "text-emerald-700"}`}>{it.net_effect > 0 ? "+" : "−"}{baht(Math.abs(it.net_effect))}</span> },
  ];

  const calcHref = `/payroll/calc-run?period_id=${periodId}`;
  return (
    <>
      <ERPModal open={open} onClose={onClose} size="lg" storageKey="payroll-reprice" loading={busy}
        title="คิดราคาใหม่ตามสูตรตอนนี้"
        description={`${data.period.name} · ตั้งค่างวดตอนนี้ ${work_days} วัน × ${hours_per_day} ชม./วัน`}
        footer={result ? (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50">ปิด</button>
            {result.updated > 0 && <Link href={calcHref} className="flex h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">ไปคำนวณงวดใหม่</Link>}
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button type="button" onClick={() => setAsk(true)} disabled={busy || !items.length}
              className="h-9 rounded-lg bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">คิดราคาใหม่ {items.length} รายการ</button>
          </div>
        )}>
        {result ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
              <div className="flex items-center gap-2 font-semibold"><Icon name="done" /> คิดราคาใหม่แล้ว {result.updated} รายการ</div>
              {result.updated > 0 && <div className="mt-1 text-xs">พนักงาน{effectText(result.net_effect)} (รวมทั้งงวด) · บันทึกประวัติทุกรายการแล้ว</div>}
            </div>
            {result.updated > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <div className="font-semibold">ขั้นต่อไป (ยอดเงินเดือนยังเป็นยอดเดิมจนกว่าจะคำนวณใหม่)</div>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                  <li>ไปหน้าคำนวณงวด กด &quot;คำนวณ + เทียบ&quot; แล้วบันทึกผล</li>
                  <li>ไปหน้ารอบจ่าย กด &quot;อัปเดตยอดจากคำนวณล่าสุด&quot; ในรอบปลายเดือน</li>
                </ol>
              </div>
            )}
            {result.skipped.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs font-semibold text-slate-700">ข้าม {result.skipped.length} รายการ</div>
                <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                  {result.skipped.slice(0, 20).map((s) => <li key={s.key}>{s.label} — {s.reason}</li>)}
                  {result.skipped.length > 20 && <li>และอีก {result.skipped.length - 20} รายการ</li>}
                </ul>
              </div>
            )}
          </div>
        ) : !items.length ? (
          <EmptyState title="ทุกรายการราคาตรงสูตรแล้ว" hint="ไม่มีอะไรต้องคิดราคาใหม่" />
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="รายการ" value={String(items.length)} />
              <Stat label="พนักงาน" value={`${people} คน`} />
              <div className="col-span-2 sm:col-span-1"><Stat label="ผลต่อยอดโอนรวม" value={`${netEffect < 0 ? "−" : "+"}฿${baht(Math.abs(netEffect))}`} hint={netEffect < 0 ? "พนักงานได้น้อยลง" : "พนักงานได้เพิ่ม"} /></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              ราคาสาย/ขาด/ลา/OT ถูกคิดไว้ตอนลงรายการ ถ้าแก้วันทำงานของงวดหรือเงินเดือนในสัญญาทีหลัง รายการเดิมยังใช้ราคาเก่า
              ปุ่มนี้คิดราคาใหม่ด้วย<b className="text-slate-800">ตั้งค่าตอนนี้ ({work_days} วัน × {hours_per_day} ชม./วัน)</b> — จำนวนนาที/ชั่วโมงไม่เปลี่ยน เปลี่ยนแค่ราคา
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              ถ้า {work_days} วันไม่ถูก ให้<Link href="/payroll/periods" className="font-semibold underline">แก้ตั้งค่างวด</Link>ก่อน แล้วกลับมากด &quot;ตรวจใหม่&quot; · หลังคิดราคาใหม่ต้องคำนวณงวดใหม่ + บันทึก ยอดเงินเดือนถึงจะเปลี่ยน
            </div>
            <MiniTable rows={items} columns={columns} rowKey={(it) => it.key}
              searchText={(it) => `${it.code} ${it.name} ${it.label} ${it.item_label}`} searchPlaceholder="ค้นรหัส / ชื่อ / วันที่"
              groupBy={(it) => it.item_label.replace(/\s[\d,.]+\sนาที$/, "")} groupLabel="จัดกลุ่มตามประเภท" emptyText="ไม่พบรายการ" />
          </div>
        )}
      </ERPModal>

      <ConfirmDialog open={ask} onClose={() => setAsk(false)} onConfirm={() => void run()} loading={busy}
        title={`ยืนยันคิดราคาใหม่ ${items.length} รายการ?`}
        message={<>รายการของ {people} คนจะเปลี่ยนราคาตามตั้งค่างวดตอนนี้ ({work_days} วัน) · พนักงาน{effectText(netEffect)} รวมทั้งงวด · ระบบบันทึกประวัติทุกรายการ แล้วต้องไปคำนวณงวดใหม่ต่อ</>}
        confirmText="คิดราคาใหม่" requireTyped={items.length >= 20 ? "CONFIRM" : undefined} />
    </>
  );
}
