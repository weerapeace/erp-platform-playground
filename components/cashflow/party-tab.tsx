"use client";

/**
 * แท็บ "ต้องจ่าย" / "ต้องรับ" ของหน้ากระแสเงินสด (/cashflow) — รวมรายการเป็น 1 แถวต่อคู่ค้า (ร้าน · ลูกค้า · เจ้าหนี้)
 * ใช้ตารางกลาง DataTable: ติ๊กหลายแถว · ปุ่มต่อแถว · กดแถวกางดูเอกสารข้างใน
 * ทุกปุ่มเรียก API เดิม (ไม่มีตาราง/กติกาใหม่):
 *   เลื่อนวัน   → POST  /api/cashflow/plan            (cashflow.manage · เฉพาะชนิดใน MOVABLE_SOURCES · audit ในตัว)
 *   ตั้งเครดิต  → PATCH /api/cashflow/credit-terms    (cashflow.manage · audit ในตัว)
 *   จ่ายแล้ว   → POST  /api/purchasing/mark-paid     (เฉพาะ PO · products.edit · audit ในตัว)
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type BulkAction, type RowAction } from "@/components/data-table";
import { ERPModal } from "@/components/modal";
import { DateInput } from "@/components/date-input";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { CREDIT_TERM_OPTIONS } from "@/lib/credit-term";
import { CASHFLOW_CERTAINTY, THB, addDaysISO, daysBetween, type CashflowEvent } from "@/lib/cashflow";

type Side = "out" | "in";
type Cat = "shop" | "china" | "loan" | "od" | "card" | "payroll" | "manual" | "customer";

const CAT: Record<Cat, { label: string; color: string; page: string }> = {
  shop:     { label: "ร้านค้า (PO)", color: "#EF9F27", page: "/purchasing/po-list" },
  china:    { label: "บิลจีน",       color: "#DB2777", page: "/app/china-pay" },
  loan:     { label: "งวดเงินกู้",    color: "#DC2626", page: "/loan-installments" },
  od:       { label: "ดอกเบี้ย OD",   color: "#B45309", page: "/od-facilities" },
  card:     { label: "บัตรเครดิต",    color: "#9333EA", page: "/debt-cards" },
  payroll:  { label: "เงินเดือน",     color: "#7C5CD6", page: "/payroll/payments" },
  manual:   { label: "รายการประจำ",   color: "#0F766E", page: "/cashflow" },
  customer: { label: "ลูกค้า",        color: "#1D9E75", page: "/sales-orders" },
};
const catOf = (e: CashflowEvent): Cat =>
  e.source === "purchase_order" ? "shop" : e.source === "china" ? "china" : e.source === "loan" ? "loan"
    : e.source === "od_interest" ? "od" : e.source === "card" ? "card" : e.source === "payroll" ? "payroll"
      : e.source === "manual" ? "manual" : "customer";
/** ชนิดที่ตั้งเครดิตได้ (มีคู่ค้าใน partners_v2) */
const CREDIT_CATS = new Set<Cat>(["shop", "china", "customer"]);

type Group = {
  id: string; cat: Cat; party: string; partyId: string | null;
  events: CashflowEvent[]; count: number; total: number;
  /** วันใกล้สุดที่ยังไม่ถึง (null = เลยกำหนดหมดแล้ว) */
  next: string | null;
  overdue: number; overdueDays: number; guessed: number;
};

/** ช่วงอายุ (นับจากวันที่ควรจ่าย/ควรได้รับ เทียบวันนี้) */
const AGING = [
  { key: "due", label: "ยังไม่ถึงกำหนด", color: "#10b981", test: (d: number) => d <= 0 },
  { key: "a", label: "เลย 1–30 วัน", color: "#f59e0b", test: (d: number) => d >= 1 && d <= 30 },
  { key: "b", label: "31–60 วัน", color: "#f97316", test: (d: number) => d >= 31 && d <= 60 },
  { key: "c", label: "61–90 วัน", color: "#ef4444", test: (d: number) => d >= 61 && d <= 90 },
  { key: "d", label: "เกิน 90 วัน", color: "#b91c1c", test: (d: number) => d > 90 },
];

type Modal = { kind: "date" | "credit" | "pay"; events: CashflowEvent[]; groups: Group[] } | null;

export function CashflowPartyTab({
  side, events, today, canManage, canPayPo, onChanged,
}: {
  side: Side;
  /** รายการฝั่งนี้ทั้งหมด (รวมของค้างจากก่อนวันนี้) — กรองบริษัท/แหล่งมาแล้ว */
  events: CashflowEvent[];
  today: string;
  canManage: boolean;
  canPayPo: boolean;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [cat, setCat] = useState<Cat | "all">("all");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Modal>(null);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const e of events) {
      const c = catOf(e);
      const key = `${c}|${e.partyId ?? e.party}`;
      const g = map.get(key) ?? { id: key, cat: c, party: e.party || "(ไม่ระบุ)", partyId: e.partyId ?? null, events: [], count: 0, total: 0, next: null, overdue: 0, overdueDays: 0, guessed: 0 };
      g.events.push(e); g.count += 1; g.total += e.amount;
      const late = daysBetween(e.date, today);
      if (late > 0) { g.overdue += e.amount; g.overdueDays = Math.max(g.overdueDays, late); }
      else if (!g.next || e.date < g.next) g.next = e.date;
      if (!e.dateConfident) g.guessed += 1;
      map.set(key, g);
    }
    for (const g of map.values()) g.events.sort((a, b) => a.date.localeCompare(b.date));
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [events, today]);

  const cats = useMemo(() => {
    const t = new Map<Cat, number>();
    for (const g of groups) t.set(g.cat, (t.get(g.cat) ?? 0) + g.total);
    return [...t.entries()].sort((a, b) => b[1] - a[1]);
  }, [groups]);
  const shown = cat === "all" ? groups : groups.filter((g) => g.cat === cat);
  const shownTotal = shown.reduce((s, g) => s + g.total, 0);

  const aging = useMemo(() => AGING.map((a) => {
    const list = shown.flatMap((g) => g.events).filter((e) => a.test(daysBetween(e.date, today)));
    return { ...a, amount: list.reduce((s, e) => s + e.amount, 0), count: list.length };
  }), [shown, today]);

  const toggle = (g: Group) => setOpen((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; });
  const movable = (list: CashflowEvent[]) => list.filter((e) => e.movable && e.docId);
  const payable = (list: CashflowEvent[]) => list.filter((e) => e.source === "purchase_order" && e.docId);
  const partyWord = side === "out" ? "ร้าน" : "ลูกค้า";

  const columns = useMemo<ColumnDef<Group>[]>(() => [
    {
      id: "party", accessorKey: "party", header: side === "out" ? "จ่ายให้ใคร" : "รับจากใคร", size: 300,
      cell: ({ row }) => {
        const g = row.original;
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-xs w-3">{open.has(g.id) ? "▾" : "▸"}</span>
              <span className="font-medium text-slate-800 truncate">{g.party}</span>
            </div>
            <div className="flex items-center gap-1.5 pl-4 mt-0.5">
              <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ color: CAT[g.cat].color, background: `${CAT[g.cat].color}18` }}>{CAT[g.cat].label}</span>
              {g.guessed > 0 && <span className="text-[11px] text-amber-700" title="ยังไม่ได้ตั้งเครดิต/วันครบกำหนด ระบบเดาวันให้">~ ระบบเดาวัน {g.guessed} ใบ</span>}
            </div>
          </div>
        );
      },
    },
    { id: "count", accessorKey: "count", header: "รายการ", size: 80, cell: ({ row }) => <span className="tabular-nums text-slate-600">{row.original.count}</span> },
    {
      id: "total", accessorKey: "total", header: side === "out" ? "ยอดต้องจ่าย" : "ยอดต้องรับ", size: 130,
      cell: ({ row }) => <span className={`tabular-nums font-semibold ${side === "out" ? "text-rose-600" : "text-emerald-600"}`}>{THB(row.original.total)}</span>,
    },
    {
      id: "next", accessorKey: "next", header: "ครบกำหนดถัดไป", size: 120,
      cell: ({ row }) => row.original.next ? <span className="text-slate-700">{formatDate(row.original.next)}</span> : <span className="text-slate-300">—</span>,
    },
    {
      id: "overdue", accessorKey: "overdue", header: "เลยกำหนดแล้ว", size: 150,
      cell: ({ row }) => row.original.overdue > 0
        ? <span className="tabular-nums text-red-600">{THB(row.original.overdue)} <span className="text-[11px] text-red-400">· นานสุด {row.original.overdueDays} วัน</span></span>
        : <span className="text-slate-300">—</span>,
    },
  ], [side, open]);

  const rowActions = useMemo<RowAction<Group>[]>(() => [
    { id: "pay", label: "จ่ายแล้วทั้งร้าน", defaultPlacement: "inline", show: (g) => side === "out" && canPayPo && payable(g.events).length > 0,
      onClick: (g) => setModal({ kind: "pay", events: payable(g.events), groups: [g] }) },
    { id: "move", label: "เลื่อนวัน", defaultPlacement: "inline", show: (g) => canManage && movable(g.events).length > 0,
      onClick: (g) => setModal({ kind: "date", events: movable(g.events), groups: [g] }) },
    { id: "credit", label: `ตั้งเครดิต${partyWord}`, defaultPlacement: "menu", show: (g) => canManage && !!g.partyId && CREDIT_CATS.has(g.cat),
      onClick: (g) => setModal({ kind: "credit", events: [], groups: [g] }) },
    { id: "page", label: "ไปหน้าเอกสาร", defaultPlacement: "menu", onClick: (g) => router.push(g.events.length === 1 && g.events[0].href ? g.events[0].href : CAT[g.cat].page) },
  ], [side, canManage, canPayPo, partyWord, router]);

  const bulkActions = useMemo<BulkAction<Group>[]>(() => [
    ...(side === "out" && canPayPo ? [{ label: "จ่ายแล้ว (เฉพาะ PO)", keepSelection: true, onClick: (rows: Group[]) => setModal({ kind: "pay", events: payable(rows.flatMap((g) => g.events)), groups: rows }) }] : []),
    ...(canManage ? [
      { label: "เลื่อนวัน", keepSelection: true, onClick: (rows: Group[]) => setModal({ kind: "date", events: movable(rows.flatMap((g) => g.events)), groups: rows }) },
      { label: `ตั้งเครดิต${partyWord}`, keepSelection: true, onClick: (rows: Group[]) => setModal({ kind: "credit", events: [], groups: rows.filter((g) => g.partyId && CREDIT_CATS.has(g.cat)) }) },
    ] : []),
  ], [side, canManage, canPayPo, partyWord]);

  const agingTotal = aging.reduce((s, a) => s + a.amount, 0);

  return (
    <div className="space-y-3">
      {/* ชนิด */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" onClick={() => setCat("all")}
          className={`h-8 px-3 text-xs rounded-full border ${cat === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
          ทั้งหมด · {THB(groups.reduce((s, g) => s + g.total, 0))}
        </button>
        {cats.map(([c, t]) => (
          <button key={c} type="button" onClick={() => setCat(c)}
            className={`h-8 px-3 text-xs rounded-full border ${cat === c ? "text-white" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            style={cat === c ? { background: CAT[c].color, borderColor: CAT[c].color } : undefined}>
            {CAT[c].label} · {THB(t)}
          </button>
        ))}
      </div>

      {/* อายุ */}
      {agingTotal > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <div className="text-xs text-slate-500 mb-1.5">{side === "out" ? "ค้างจ่ายตามอายุ (นับจากวันครบกำหนด)" : "อายุลูกหนี้ (นับจากวันที่ควรได้รับเงิน)"}</div>
          <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
            {aging.filter((a) => a.amount > 0).map((a) => <div key={a.key} style={{ width: `${(a.amount / agingTotal) * 100}%`, background: a.color }} title={`${a.label} ${THB(a.amount)}`} />)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
            {aging.map((a) => (
              <div key={a.key} className="text-xs">
                <div className="flex items-center gap-1 text-slate-500"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: a.color }} />{a.label}</div>
                <div className="tabular-nums font-semibold text-slate-800">{THB(a.amount)} <span className="font-normal text-slate-400">· {a.count}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable<Group>
        tableId={`cashflow-${side}-groups`}
        data={shown}
        columns={columns}
        title={side === "out" ? `ต้องจ่าย · ${THB(shownTotal)}` : `ต้องรับ · ${THB(shownTotal)}`}
        description={`1 แถว = 1 ${side === "out" ? "ร้าน / เจ้าหนี้" : "ลูกค้า"} · กดแถวเพื่อดูเอกสารข้างใน · ติ๊กหลายแถวแล้วทำทีเดียว`}
        emptyMessage={side === "out" ? "ไม่มีรายการที่ต้องจ่ายในช่วงนี้" : "ไม่มีรายการที่ต้องรับในช่วงนี้"}
        searchPlaceholder={`ค้นหาชื่อ${partyWord}…`}
        searchableKeys={["party"]}
        selectable={bulkActions.length > 0}
        bulkActions={bulkActions}
        bulkUnit={partyWord}
        rowActions={rowActions}
        onRowClick={toggle}
        isRowExpanded={(g) => open.has(g.id)}
        renderExpandedRow={(g) => (
          <DocList group={g} side={side} canManage={canManage} canPayPo={canPayPo}
            onMove={(e) => setModal({ kind: "date", events: [e], groups: [g] })}
            onPay={(e) => setModal({ kind: "pay", events: [e], groups: [g] })} />
        )}
        pageSize={25}
        exportFilename={side === "out" ? "cashflow-payables" : "cashflow-receivables"}
      />
      {side === "in" && (
        <p className="text-xs text-slate-500">
          ใบขายเก่าที่จริงเก็บเงินแล้ว แต่ยังค้างอยู่ในนี้ = ยังไม่ได้ออกใบรับชำระ → <Link href="/receipts" className="text-blue-600 underline">บันทึกรับเงิน</Link> แล้วยอดค้างจะลดเอง
        </p>
      )}

      <DateModal modal={modal?.kind === "date" ? modal : null} today={today} onClose={() => setModal(null)} onDone={() => { setModal(null); onChanged(); }} />
      <CreditModal modal={modal?.kind === "credit" ? modal : null} side={side} onClose={() => setModal(null)} onDone={() => { setModal(null); onChanged(); }} />
      <PayModal modal={modal?.kind === "pay" ? modal : null} today={today} onClose={() => setModal(null)} onDone={() => { setModal(null); onChanged(); }} />
    </div>
  );
}

/** เอกสารข้างในแถวคู่ค้า (แถวที่กางออก) */
function DocList({ group, side, canManage, canPayPo, onMove, onPay }: {
  group: Group; side: Side; canManage: boolean; canPayPo: boolean;
  onMove: (e: CashflowEvent) => void; onPay: (e: CashflowEvent) => void;
}) {
  return (
    <div className="bg-slate-50/70 rounded-lg border border-slate-100 divide-y divide-slate-100 text-[13px]">
      {group.events.map((e) => {
        const c = CASHFLOW_CERTAINTY[e.certainty];
        return (
          <div key={e.id} className="flex items-center gap-3 px-3 py-2 flex-wrap">
            <span className={`w-24 shrink-0 ${e.dateConfident ? "text-slate-700" : "text-slate-400 italic"}`} title={e.dateNote}>
              {formatDate(e.date)}{!e.dateConfident && " ~"}
            </span>
            <span className="flex-1 min-w-[160px]">
              {e.href ? <Link href={e.href} className="text-blue-700 hover:underline">{e.ref}</Link> : <span className="text-slate-700">{e.ref}</span>}
              {(e.note || e.dateNote) && <span className="block text-[11px] text-slate-400">{e.note || e.dateNote}</span>}
            </span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${c.badge}`} title={c.hint}>{c.label}</span>
            <span className={`w-28 text-right tabular-nums font-medium ${side === "out" ? "text-rose-600" : "text-emerald-600"}`}>{THB(e.amount)}</span>
            <span className="flex gap-1">
              {canPayPo && e.source === "purchase_order" && e.docId && (
                <button type="button" onClick={() => onPay(e)} className="h-7 px-2.5 text-xs rounded-md border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50">จ่ายแล้ว</button>
              )}
              {canManage && e.movable && e.docId && (
                <button type="button" onClick={() => onMove(e)} className="h-7 px-2.5 text-xs rounded-md border border-slate-200 text-slate-600 bg-white hover:bg-slate-50">เลื่อนวัน</button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const sum = (list: CashflowEvent[]) => list.reduce((s, e) => s + e.amount, 0);
const btn = "h-9 px-4 text-sm rounded-lg";

/** เลื่อนวันจ่าย/วันรับเงิน — เขียนวันลงเอกสารต้นทาง (ทางเดียวกับกระดานเงินสด) */
function DateModal({ modal, today, onClose, onDone }: { modal: Modal; today: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(addDaysISO(today, 7));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!modal) return null;
  const list = modal.events;
  const submit = async () => {
    if (!date) { setErr("เลือกวันที่ก่อน"); return; }
    if (!list.length) { setErr("รายการที่เลือกเลื่อนวันไม่ได้ (งวดเงินกู้ / เงินเดือน / ดอก OD ล็อกไว้)"); return; }
    setBusy(true); setErr("");
    try {
      const res = await apiFetch("/api/cashflow/plan", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moves: list.map((e) => ({ source: e.source, docId: e.docId, date })) }) });
      const j = await res.json();
      if (j?.error) { setErr(j.error); return; }
      const r = j.data as { moved: number; failed: { reason: string }[] };
      if (r.failed.length) toast.warning(`เลื่อนแล้ว ${r.moved} ใบ · ไม่สำเร็จ ${r.failed.length} ใบ (${r.failed[0].reason})`);
      else toast.success(`เลื่อนวันแล้ว ${r.moved} ใบ → ${formatDate(date)}`);
      onDone();
    } catch { setErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} title="เลื่อนวัน" size="sm" loading={busy}
      footer={<><button type="button" onClick={onClose} className={`${btn} border border-slate-200 text-slate-600`}>ยกเลิก</button>
        <button type="button" onClick={submit} disabled={busy} className={`${btn} bg-blue-600 text-white disabled:opacity-50`}>{busy ? "กำลังบันทึก…" : "เลื่อนวัน"}</button></>}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">{list.length} ใบ · รวม <b className="tabular-nums">{THB(sum(list))}</b>{modal.groups.length === 1 ? ` · ${modal.groups[0].party}` : ` · ${modal.groups.length} ราย`}</p>
        <div><label className="block text-xs text-slate-500 mb-1">วันใหม่</label><DateInput value={date} onChange={(v) => { setDate(v); setErr(""); }} /></div>
        <p className="text-xs text-slate-400">เขียนวันลงเอกสารต้นทาง (PO · ใบวางบิล · ใบขาย · บิลจีน) ทุกหน้าที่อ่านวันครบกำหนดจะเห็นวันใหม่ · มีประวัติว่าใครเลื่อน</p>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </ERPModal>
  );
}

/** ตั้งเครดิตหลายรายพร้อมกัน (ทางเดียวกับหน้า /cashflow/credit-terms) */
function CreditModal({ modal, side, onClose, onDone }: { modal: Modal; side: Side; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState("days:30");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!modal) return null;
  const parties = modal.groups.filter((g) => g.partyId);
  const submit = async () => {
    if (!parties.length) { setErr("รายการที่เลือกไม่ผูกกับคู่ค้า ตั้งเครดิตไม่ได้"); return; }
    setBusy(true); setErr("");
    try {
      const res = await apiFetch("/api/cashflow/credit-terms", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: side === "out" ? "supplier" : "customer", items: [...new Set(parties.map((g) => g.partyId))].map((id) => ({ id, value: value || null })) }) });
      const j = await res.json();
      if (j?.error) { setErr(j.error); return; }
      const r = j.data as { updated: number; failed: number };
      if (r.failed) toast.warning(`ตั้งเครดิตแล้ว ${r.updated} ราย · ไม่สำเร็จ ${r.failed} ราย`);
      else toast.success(`ตั้งเครดิตแล้ว ${r.updated} ราย — วันจ่าย/วันรับเงินคิดใหม่ให้แล้ว`);
      onDone();
    } catch { setErr("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} title={side === "out" ? "ตั้งเครดิตร้าน" : "ตั้งเครดิตลูกค้า"} size="sm" loading={busy}
      footer={<><button type="button" onClick={onClose} className={`${btn} border border-slate-200 text-slate-600`}>ยกเลิก</button>
        <button type="button" onClick={submit} disabled={busy} className={`${btn} bg-blue-600 text-white disabled:opacity-50`}>{busy ? "กำลังบันทึก…" : "บันทึกเครดิต"}</button></>}>
      <div className="space-y-3 text-sm">
        <div className="max-h-32 overflow-y-auto text-slate-600 text-xs space-y-0.5">
          {parties.map((g) => <div key={g.id}>• {g.party} <span className="text-slate-400">({g.count} ใบ · {THB(g.total)})</span></div>)}
          {!parties.length && <div className="text-amber-700">ไม่มีรายที่ตั้งเครดิตได้ (งวดเงินกู้ เงินเดือน บัตร ไม่มีเครดิต)</div>}
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">เครดิต</label>
          <select value={value} onChange={(e) => { setValue(e.target.value); setErr(""); }} className="w-full h-9 px-2.5 text-sm border border-slate-200 rounded-lg bg-white">
            {CREDIT_TERM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <p className="text-xs text-slate-400">ใช้กับเอกสารที่ยังไม่ได้ระบุวันครบกำหนดเอง · เก็บที่ทะเบียนคู่ค้า (ฟอร์มคู่ค้าเห็นค่าเดียวกัน)</p>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </ERPModal>
  );
}

/** ติ๊ก "จ่ายแล้ว" ให้ PO (ทีละใบหรือทั้งร้าน) — เกิน 20 ใบต้องพิมพ์ยืนยัน */
function PayModal({ modal, today, onClose, onDone }: { modal: Modal; today: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(today);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!modal) return null;
  const list = modal.events;
  const needTyped = list.length > 20;
  const submit = async () => {
    if (!list.length) { setErr("ไม่มี PO ในรายการที่เลือก (ติ๊กจ่ายได้เฉพาะ PO — อย่างอื่นจ่ายที่หน้าของมัน)"); return; }
    if (!date) { setErr("เลือกวันที่จ่ายก่อน"); return; }
    if (needTyped && typed.trim() !== "CONFIRM") { setErr("พิมพ์ CONFIRM เพื่อยืนยัน"); return; }
    setBusy(true); setErr("");
    let ok = 0; const failed: string[] = [];
    for (const e of list) {
      try {
        const res = await apiFetch("/api/purchasing/mark-paid", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: e.docId, paid: true, paid_date: date }) });
        const j = await res.json();
        if (j?.error) failed.push(`${e.ref}: ${j.error}`); else ok += 1;
      } catch { failed.push(`${e.ref}: เชื่อมต่อไม่สำเร็จ`); }
    }
    setBusy(false);
    if (failed.length) { toast.warning(`ติ๊กจ่ายแล้ว ${ok} ใบ · ไม่สำเร็จ ${failed.length} ใบ — ${failed[0]}`); }
    else toast.success(`ติ๊กจ่ายแล้ว ${ok} ใบ · ${THB(sum(list))}`);
    setTyped("");
    onDone();
  };
  return (
    <ERPModal open onClose={onClose} title="บันทึกว่าจ่ายแล้ว" size="sm" loading={busy}
      footer={<><button type="button" onClick={onClose} className={`${btn} border border-slate-200 text-slate-600`}>ยกเลิก</button>
        <button type="button" onClick={submit} disabled={busy} className={`${btn} bg-emerald-600 text-white disabled:opacity-50`}>{busy ? "กำลังบันทึก…" : `จ่ายแล้ว ${list.length} ใบ`}</button></>}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">PO {list.length} ใบ · รวม <b className="tabular-nums">{THB(sum(list))}</b>{modal.groups.length === 1 ? ` · ${modal.groups[0].party}` : ` · ${modal.groups.length} ร้าน`}</p>
        <div className="max-h-28 overflow-y-auto text-xs text-slate-500 space-y-0.5">
          {list.slice(0, 50).map((e) => <div key={e.id}>{e.ref} · {THB(e.amount)}</div>)}
          {list.length > 50 && <div>…อีก {list.length - 50} ใบ</div>}
        </div>
        <div><label className="block text-xs text-slate-500 mb-1">วันที่จ่าย</label><DateInput value={date} onChange={(v) => { setDate(v); setErr(""); }} /></div>
        {needTyped && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">เกิน 20 ใบ — พิมพ์ <b>CONFIRM</b> เพื่อยืนยัน</label>
            <input value={typed} onChange={(e) => { setTyped(e.target.value); setErr(""); }} className="w-full h-9 px-2.5 text-sm border border-slate-200 rounded-lg" />
          </div>
        )}
        <p className="text-xs text-slate-400">PO ที่ติ๊กแล้วหลุดจากเงินที่ต้องจ่าย · ยังไม่หักยอดเงินในบัญชี (รอสมุดบัญชีธนาคาร) · ยกเลิกได้ที่หน้า PO · มีประวัติว่าใครกด</p>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </ERPModal>
  );
}
