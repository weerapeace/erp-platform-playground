"use client";

/**
 * 💳 จัดการเครดิตเทอม ลูกค้า / ร้านค้า — หน้าเดียวจบ
 * URL: /cashflow/credit-terms (ลิงก์เดิมทุกที่ใช้ต่อได้) · /purchasing/shop-terms พามาที่นี่แท็บร้านค้า
 *
 * เจ้าของเลือกแบบ X (ตารางแก้ในช่อง + แถบเทมเพลต) จาก widget 2026-11-22 · รวม 2 หน้าเดิม
 *   (ตั้งเครดิตในกระแสเงินสด + ตั้งเงื่อนไขร้านในจัดซื้อ) ไม่สร้างหน้าที่ 3
 *
 *   - ตารางกลาง (DataTable): ค้น · มุมมอง (ยังไม่ตั้ง / เกินวงเงิน / เลยกำหนด) · ติ๊กหลายรายแล้วกดเทมเพลต
 *   - ช่องเครดิตของกลาง PurchaseCreditTermInput / CreditTermView · ระยะส่งของ PurchaseLeadTimeInput · วงเงิน MoneyInput
 *   - เทมเพลตเทอมที่ใช้บ่อย ใช้ร่วมทั้งบริษัท (app_settings) · เพิ่ม/ลบได้ ลบแล้วย้อนกลับได้
 *   - "ซื้อวันนี้ ครบกำหนด" ทุกแถว (lib/credit-term computeDueDate) · เตือนยอดค้างเกินวงเงิน / เลยกำหนด
 *   - บันทึกครั้งเดียวทั้งหน้า → แจ้งผลมุมจอมีปุ่ม "ย้อนกลับ" (คืนค่าเดิมทุกราย) · ทุกการแก้ลง audit ทีละราย
 *   - ประวัติต่อราย = RecordHistoryDrawer (ของกลาง)
 * API: /api/partners/credit-terms (สิทธิ์ดู/แก้ ดูหัวไฟล์ API)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import nextDynamic from "next/dynamic";
import type { ColumnDef } from "@tanstack/react-table";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable, type BulkAction, type DataTableView } from "@/components/data-table";
import { InfoHint } from "@/components/info-hint";
import { LoadingState } from "@/components/state-views";
import { useAuth, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { AppLogo } from "@/components/logo-picker";
import { MoneyInput } from "@/components/money-input";
import { CreditTermView, PurchaseCreditTermInput } from "@/components/purchase-credit-term-input";
import { PurchaseLeadTimeInput } from "@/components/purchase-lead-time-input";
import { apiFetch } from "@/lib/api";
import { computeDueDate, formatCreditTerm, formatLeadTime } from "@/lib/credit-term";
import { formatDate } from "@/lib/date";
import { todayTH, type CreditTermTemplate } from "@/lib/partner-insights";
import type { CreditManageResponse, CreditManageRow } from "@/app/api/partners/credit-terms/route";

const RecordHistoryDrawer = nextDynamic(() => import("@/components/activity-feed/record-history-drawer").then((m) => m.RecordHistoryDrawer), { ssr: false });

type Side = "customer" | "supplier";
type Edit = { term?: string | null; limit?: number | null; lead?: string | null };
type Row = CreditManageRow & Record<string, unknown>;

const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const tplLabel = (t: CreditTermTemplate) => t.label || formatCreditTerm(t.term);

export default function CreditTermsPage() {
  const { can, permsReady } = useAuth();
  const toast = useToast();
  const mayView = can("cashflow.view") || can("cashflow.manage") || can("products.edit") || can("so.edit");

  const [side, setSide] = useState<Side>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("side") === "supplier" ? "supplier" : "customer");
  const [data, setData] = useState<CreditManageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());     // รายที่ตั้งแล้ว แต่กด "แก้ไข" อยู่
  const [incomplete, setIncomplete] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [resetSel, setResetSel] = useState(0);
  const [history, setHistory] = useState<{ id: string; name: string } | null>(null);
  const [limitFor, setLimitFor] = useState<Row[] | null>(null);       // ป๊อปตั้งวงเงินหลายราย
  const [limitVal, setLimitVal] = useState("");
  const [addTpl, setAddTpl] = useState(false);
  const [tplTerm, setTplTerm] = useState<string | null>(null);
  const [tplName, setTplName] = useState("");

  const load = useCallback((s: Side) => {
    setLoading(true); setErr(null);
    apiFetch(`/api/partners/credit-terms?side=${s}`)
      .then(async (r) => { const j = (await r.json()) as CreditManageResponse & { error?: string }; if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ"); setData(j); })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (permsReady && mayView) load(side); }, [permsReady, mayView, side, load]);
  const switchSide = (s: Side) => {
    if (Object.keys(edits).length && !window.confirm("มีที่แก้ยังไม่บันทึก — เปลี่ยนแท็บแล้วที่แก้จะหาย ต่อไหม?")) return;
    setEdits({}); setEditing(new Set()); setIncomplete(new Set()); setSide(s);
    const u = new URL(window.location.href); u.searchParams.set("side", s); window.history.replaceState(null, "", u.toString());
  };

  const canEdit = !!data?.canEdit;
  const rows = useMemo(() => (data?.rows ?? []) as Row[], [data]);
  const today = todayTH();

  // ค่าที่จะโชว์ = ที่แก้ค้าง ทับค่าจริง
  const termOf = (r: Row) => (edits[r.id] && "term" in edits[r.id] ? edits[r.id].term ?? null : r.term);
  const limitOf = (r: Row) => (edits[r.id] && "limit" in edits[r.id] ? edits[r.id].limit ?? null : r.limit);
  const leadOf = (r: Row) => (edits[r.id] && "lead" in edits[r.id] ? edits[r.id].lead ?? null : r.lead);

  const setField = (id: string, k: keyof Edit, v: string | number | null, bad = false) => {
    setEdits((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));
    if (k === "term") setIncomplete((s0) => { const n = new Set(s0); if (bad) n.add(id); else n.delete(id); return n; });
  };
  const applyTermTo = (list: Row[], term: string | null) => {
    setEdits((e) => { const n = { ...e }; for (const r of list) n[r.id] = { ...n[r.id], term }; return n; });
    setIncomplete((s0) => { const n = new Set(s0); list.forEach((r) => n.delete(r.id)); return n; });
    toast.info(`ใส่ "${term ? formatCreditTerm(term) : "ไม่ตั้ง"}" ให้ ${list.length} ราย — ยังไม่บันทึก กด "บันทึกทั้งหมด" ด้านล่าง`);
  };

  // รายการที่เปลี่ยนจริง (เทียบค่าเดิม) — ส่งเฉพาะช่องที่เปลี่ยน
  const changed = useMemo(() => {
    const out: { id: string; term?: string | null; limit?: number | null; lead?: string | null }[] = [];
    for (const [id, e] of Object.entries(edits)) {
      const r = rows.find((x) => x.id === id); if (!r || incomplete.has(id)) continue;
      const item: (typeof out)[number] = { id };
      if ("term" in e && (e.term ?? null) !== (r.term ?? null)) item.term = e.term ?? null;
      if ("limit" in e && (e.limit ?? null) !== (r.limit ?? null)) item.limit = e.limit ?? null;
      if ("lead" in e && (e.lead ?? null) !== (r.lead ?? null)) item.lead = e.lead ?? null;
      if (Object.keys(item).length > 1) out.push(item);
    }
    return out;
  }, [edits, rows, incomplete]);

  const send = useCallback(async (items: typeof changed) => {
    const res = await apiFetch("/api/partners/credit-terms", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ side, items }) });
    const j = await res.json();
    if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
    return j.data as { updated: number; failed: { id: string; reason: string }[]; before: typeof changed };
  }, [side]);

  const save = async () => {
    if (incomplete.size) { toast.error(`ใส่ตัวเลขเครดิตไม่ครบ ${incomplete.size} ราย — แก้ช่องสีแดงก่อน`); return; }
    if (!changed.length) return;
    setSaving(true);
    try {
      const r = await send(changed);
      setEdits({}); setEditing(new Set()); setResetSel((k) => k + 1);
      load(side);
      const msg = `บันทึกแล้ว ${r.updated} ราย${r.failed.length ? ` · ไม่สำเร็จ ${r.failed.length} ราย (${r.failed[0].reason})` : ""}`;
      if (r.before.length) toast.action(msg, "ย้อนกลับ", async () => {
        try { await send(r.before); toast.success("ย้อนกลับเป็นค่าเดิมแล้ว"); load(side); }
        catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      });
      else toast.error(msg);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  // ── เทมเพลต ──
  const templates = data?.templates ?? [];
  const saveTemplates = async (next: CreditTermTemplate[], undoFrom?: CreditTermTemplate[]) => {
    try {
      const res = await apiFetch("/api/partners/credit-terms", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templates: next }) });
      const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setData((d) => (d ? { ...d, templates: j.data as CreditTermTemplate[] } : d));
      if (undoFrom) toast.undo("ลบเทมเพลตแล้ว", () => void saveTemplates(undoFrom));
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกเทมเพลตไม่สำเร็จ"); }
  };
  const addTemplate = () => {
    if (!tplTerm) return;
    if (templates.some((t) => t.term === tplTerm)) { toast.error("มีเทมเพลตนี้แล้ว"); return; }
    void saveTemplates([...templates, tplName.trim() ? { term: tplTerm, label: tplName.trim() } : { term: tplTerm }]);
    setAddTpl(false); setTplTerm(null); setTplName("");
  };

  const missing = rows.filter((r) => !termOf(r));

  // ── ตาราง ──
  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const cols: ColumnDef<Row>[] = [
      {
        id: "name", accessorKey: "name", header: side === "customer" ? "ลูกค้า" : "ร้านค้า", size: 240,
        cell: ({ row: { original: r } }) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <AppLogo src={r.logo} name={r.name} size={30} />
            <div className="min-w-0">
              <div className="font-medium text-slate-800 truncate max-w-[200px]" title={r.name}>{r.name}</div>
              <div className="text-[11px] text-slate-400 flex gap-1.5 items-center">
                {r.code && <span className="font-mono">{r.code}</span>}
                {r.isChina && <span className="px-1.5 rounded bg-rose-50 text-rose-600">จีน</span>}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "docCount", accessorKey: "docCount", header: side === "customer" ? "ใบขาย" : "ใบซื้อ", size: 110,
        meta: { filterType: "number" },
        cell: ({ row: { original: r } }) => r.docCount
          ? <div className="text-[12px]"><span className="tabular-nums font-medium">{r.docCount} ใบ</span>{r.lastDate && <div className="text-[11px] text-slate-400">ล่าสุด {formatDate(r.lastDate)}</div>}</div>
          : <span className="text-slate-300">—</span>,
      },
      {
        id: "term", accessorFn: (r) => formatCreditTerm(termOf(r)), header: "เครดิต", size: 300, enableSorting: false,
        cell: ({ row: { original: r } }) => {
          const v = termOf(r); const bad = incomplete.has(r.id);
          const isEditing = canEdit && (!r.term || editing.has(r.id));
          const dirty = r.id in edits && "term" in edits[r.id] && (edits[r.id].term ?? null) !== (r.term ?? null);
          if (!isEditing) return r.term
            ? <div className="flex items-center gap-1.5"><CreditTermView value={r.term} onEdit={canEdit ? () => setEditing((s0) => new Set(s0).add(r.id)) : undefined} />{r.legacy && <InfoHint>ค่าเก่า (จำนวนวัน) — กดแก้ไขแล้วบันทึกเพื่อย้ายมาช่องใหม่</InfoHint>}</div>
            : <span className="text-amber-600 text-xs">ยังไม่ตั้ง</span>;
          return (
            <div className={`rounded-lg ${bad ? "ring-1 ring-red-300 bg-red-50/40 p-1" : dirty ? "bg-amber-50/70 p-1" : ""}`}>
              <PurchaseCreditTermInput size="sm" value={v} onChange={(nv, info) => setField(r.id, "term", nv, info?.incomplete ?? false)} />
              {r.term && <button type="button" className="text-[11px] text-slate-500 underline mt-0.5"
                onClick={() => { setEditing((s0) => { const n = new Set(s0); n.delete(r.id); return n; }); setEdits((e) => { const n = { ...e }; if (n[r.id]) { const { term: _t, ...rest } = n[r.id]; void _t; n[r.id] = rest; } return n; }); setIncomplete((s0) => { const n = new Set(s0); n.delete(r.id); return n; }); }}>
                ยกเลิก (เดิม {formatCreditTerm(r.term)})</button>}
            </div>
          );
        },
      },
      {
        id: "dueToday", header: "ซื้อวันนี้ ครบกำหนด", size: 130, enableSorting: false,
        accessorFn: (r) => computeDueDate(today, termOf(r)) ?? "",
        cell: ({ row: { original: r } }) => { const d = computeDueDate(today, termOf(r)); return d ? <span className="text-[12px] tabular-nums">{formatDate(d)}</span> : <span className="text-slate-300">—</span>; },
      },
      {
        id: "limit", accessorFn: (r) => limitOf(r) ?? 0, header: "วงเงิน (บาท)", size: 140,
        meta: { filterType: "number" },
        cell: ({ row: { original: r } }) => canEdit
          ? <MoneyInput value={limitOf(r)} placeholder="ไม่จำกัด" className="h-8 w-[120px] text-right text-[12.5px]"
              onChange={(raw) => setField(r.id, "limit", raw === "" ? null : Number(raw))} />
          : <span className="tabular-nums">{r.limit ? baht(r.limit) : "ไม่จำกัด"}</span>,
      },
    ];
    if (side === "supplier") cols.push({
      id: "lead", accessorFn: (r) => formatLeadTime(leadOf(r)), header: "ระยะส่งของ", size: 230, enableSorting: false,
      cell: ({ row: { original: r } }) => canEdit
        ? <PurchaseLeadTimeInput value={leadOf(r)} onChange={(v) => setField(r.id, "lead", v)} />
        : <span className="text-[12px]">{formatLeadTime(r.lead)}</span>,
    });
    cols.push(
      {
        id: "openAmount", accessorKey: "openAmount", header: side === "customer" ? "ยอดค้างรับ" : "ยอดค้างจ่าย", size: 150,
        meta: { filterType: "number" },
        cell: ({ row: { original: r } }) => {
          const lim = limitOf(r); const over = !!lim && lim > 0 && r.openAmount > lim;
          return r.openAmount > 0 ? (
            <div className="text-[12px]">
              <span className="tabular-nums font-medium">{baht(r.openAmount)}</span>
              <span className="text-slate-400"> · {r.openDocs} ใบ</span>
              <div className="flex gap-1 flex-wrap mt-0.5">
                {over && <span className="text-[10.5px] px-1.5 rounded bg-amber-50 text-amber-700">เกินวงเงิน</span>}
                {r.overdueDocs > 0 && <span className="text-[10.5px] px-1.5 rounded bg-red-50 text-red-600">เลยกำหนด {r.overdueDocs} ใบ</span>}
              </div>
            </div>
          ) : <span className="text-slate-300">—</span>;
        },
      },
      {
        id: "nextDue", accessorKey: "nextDue", header: "ครบกำหนดถัดไป", size: 120,
        cell: ({ row: { original: r } }) => r.nextDue
          ? <span className={`text-[12px] tabular-nums ${r.nextDue < today ? "text-red-600 font-medium" : ""}`}>{formatDate(r.nextDue)}</span>
          : <span className="text-slate-300">—</span>,
      },
      {
        id: "history", header: "", size: 60, enableSorting: false,
        cell: ({ row: { original: r } }) => (
          <button type="button" onClick={() => setHistory({ id: r.id, name: r.name })} className="text-[11.5px] text-slate-500 hover:text-indigo-600 underline">ประวัติ</button>
        ),
      },
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, edits, editing, incomplete, canEdit, today]);

  const views = useMemo<DataTableView[]>(() => [
    { id: "all", label: "ทั้งหมด" },
    { id: "missing", label: "ยังไม่ตั้งเครดิต", filter: (r) => !(r as Row).term },
    { id: "set", label: "ตั้งแล้ว", filter: (r) => !!(r as Row).term },
    { id: "over", label: "เกินวงเงิน", filter: (r) => !!(r as Row).overLimit },
    { id: "overdue", label: "เลยกำหนด", filter: (r) => Number((r as Row).overdueDocs) > 0 },
    { id: "active", label: "มีเอกสาร", filter: (r) => Number((r as Row).docCount) > 0 },
    ...(side === "supplier" ? [{ id: "china", label: "ร้านจีน", filter: (r: Record<string, unknown>) => !!(r as Row).isChina }] : []),
  ], [side]);

  const bulkActions = useMemo<BulkAction<Row>[]>(() => canEdit ? [
    ...templates.slice(0, 6).map((t) => ({ label: tplLabel(t), keepSelection: true, onClick: (sel: Row[]) => applyTermTo(sel, t.term) })),
    { label: "ตั้งวงเงิน…", onClick: (sel: Row[]) => { setLimitFor(sel); setLimitVal(""); } },
    { label: "ล้างเครดิต", variant: "danger" as const, onClick: (sel: Row[]) => applyTermTo(sel, null) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ] : [], [canEdit, templates]);

  if (permsReady && !mayView) {
    return <PlaygroundShell><AccessDenied message="หน้านี้เปิดให้คนที่ดูข้อมูลการเงิน หรือคนที่ตั้งเครดิตลูกค้า/ร้านค้าได้" /></PlaygroundShell>;
  }

  const setCount = rows.length - missing.length;
  const overCount = rows.filter((r) => r.overLimit).length;
  const overdueCount = rows.filter((r) => r.overdueDocs > 0).length;

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">💳 จัดการเครดิตเทอม</h1>
            <p className="text-slate-500 mt-1 text-sm">ตั้งครั้งเดียว — ใบวางบิล ปฏิทินจัดซื้อ และ <Link href="/cashflow" className="text-blue-600 underline">กระแสเงินสด</Link> คิดวันครบกำหนดให้เองทุกใบ</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/master/partners" className="h-9 px-3.5 inline-flex items-center text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">🤝 Partners</Link>
            <Link href="/purchasing/calendar" className="h-9 px-3.5 inline-flex items-center text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">📅 ปฏิทินจัดซื้อ</Link>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {([["customer", "🧑‍💼 ลูกค้า (เงินเข้า)"], ["supplier", "🛒 ร้านค้า (เงินออก)"]] as [Side, string][]).map(([s, label]) => (
            <button key={s} onClick={() => side !== s && switchSide(s)}
              className={`h-9 px-4 text-sm rounded-lg border transition-colors ${side === s ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>
          ))}
          {!loading && data && (
            <div className="flex gap-3 text-[12.5px] text-slate-500 ml-1 flex-wrap">
              <span>ตั้งแล้ว <b className="text-slate-800">{setCount}</b> / {rows.length}</span>
              {overCount > 0 && <span className="text-amber-700">เกินวงเงิน <b>{overCount}</b></span>}
              {overdueCount > 0 && <span className="text-red-600">มีใบเลยกำหนด <b>{overdueCount}</b></span>}
            </div>
          )}
        </div>
      </div>

      <div className="px-3 md:px-8 py-5 space-y-4 pb-28">
        {err && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">⚠️ {err} <button className="underline ml-2" onClick={() => load(side)}>ลองใหม่</button></div>}

        {/* ── แถบเทมเพลต ── */}
        {data && (
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-medium text-slate-700">เทมเพลต</span>
              <InfoHint>ติ๊กหลายรายในตาราง แล้วกดชื่อเทมเพลตที่แถบด้านล่าง · หรือกด &quot;เติมให้ที่ยังไม่ตั้ง&quot; · ใส่ลงช่องก่อน ยังไม่บันทึกจนกด บันทึกทั้งหมด</InfoHint>
              {templates.map((t) => (
                <span key={t.term} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border border-slate-200 bg-slate-50 text-[12px] text-slate-700">
                  {tplLabel(t)}
                  {canEdit && <button type="button" title="ลบเทมเพลต" className="w-5 h-5 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    onClick={() => void saveTemplates(templates.filter((x) => x.term !== t.term), templates)}>×</button>}
                </span>
              ))}
              {canEdit && !addTpl && <button type="button" onClick={() => setAddTpl(true)} className="h-7 px-2.5 rounded-full border border-dashed border-slate-300 text-[12px] text-slate-500 hover:bg-slate-50">+ เพิ่ม</button>}
              {canEdit && data.suggested.filter((s) => !templates.some((t) => t.term === s)).map((s) => (
                <button key={s} type="button" onClick={() => void saveTemplates([...templates, { term: s }])} title="เครดิตนี้ใช้บ่อยในข้อมูลจริง — กดเพื่อเพิ่มเป็นเทมเพลต"
                  className="h-7 px-2.5 rounded-full border border-dashed border-indigo-200 text-[12px] text-indigo-600 hover:bg-indigo-50">+ {formatCreditTerm(s)} (ใช้บ่อย)</button>
              ))}
            </div>
            {addTpl && (
              <div className="flex items-center gap-2 flex-wrap bg-slate-50 rounded-lg p-2">
                <PurchaseCreditTermInput size="sm" value={tplTerm} onChange={(v) => setTplTerm(v)} />
                <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="ชื่อเรียก (ไม่ใส่ก็ได้)" className="h-8 px-2.5 text-[12.5px] border border-slate-200 rounded-lg w-44" />
                <button type="button" onClick={addTemplate} disabled={!tplTerm} className="h-8 px-3 text-[12.5px] font-medium text-white bg-indigo-600 rounded-lg disabled:opacity-40">เพิ่มเทมเพลต</button>
                <button type="button" onClick={() => setAddTpl(false)} className="h-8 px-3 text-[12.5px] text-slate-600">ยกเลิก</button>
              </div>
            )}
            {canEdit && missing.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap text-[12.5px] text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                เติมให้ทุกรายที่ยังไม่ตั้ง ({missing.length} ราย) เป็น
                {templates.slice(0, 6).map((t) => (
                  <button key={t.term} type="button" onClick={() => applyTermTo(missing, t.term)}
                    className="h-7 px-2.5 bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100">{tplLabel(t)}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {loading && !data ? <LoadingState /> : (
          <DataTable<Row>
            tableId={`credit-terms-${side}`}
            data={rows}
            columns={columns}
            loading={loading}
            error={err ?? undefined}
            onRetry={() => load(side)}
            views={views}
            searchPlaceholder="ค้นหาชื่อ / รหัส"
            searchableKeys={["name", "code"]}
            selectable={canEdit}
            bulkActions={bulkActions}
            bulkUnit="ราย"
            selectionResetKey={resetSel}
            pageSize={50}
            exportFilename={`credit-terms-${side}`}
            exportEntityType="partners_v2"
            emptyMessage="ไม่มีรายการในมุมมองนี้"
          />
        )}

        {canEdit && (changed.length > 0 || incomplete.size > 0) && (
          <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 w-[min(680px,calc(100vw-24px))] bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap shadow-lg">
            <span className="text-sm text-slate-600">
              แก้ไว้ {changed.length} ราย ยังไม่บันทึก
              {incomplete.size > 0 && <span className="ml-2 text-red-600">· ใส่ตัวเลขไม่ครบ {incomplete.size} ราย</span>}
            </span>
            <div className="flex gap-2">
              <button onClick={() => { setEdits({}); setEditing(new Set()); setIncomplete(new Set()); }} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">ล้างที่แก้</button>
              <button onClick={save} disabled={saving || !changed.length || incomplete.size > 0}
                className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "กำลังบันทึก…" : `บันทึกทั้งหมด ${changed.length} ราย`}
              </button>
            </div>
          </div>
        )}
        {side === "supplier" && rows.some((r) => r.isChina && r.openAmount > 0) && (
          <p className="text-xs text-slate-400">ยอดค้างจ่ายร้านจีนเป็นตัวเลขตามสกุลในใบซื้อ (ใช้จัดอันดับ/เตือน) — ยอดบาทจริงดูที่หน้ากระแสเงินสด</p>
        )}
      </div>

      <ERPModal open={!!limitFor} onClose={() => setLimitFor(null)} title={`ตั้งวงเงิน ${limitFor?.length ?? 0} ราย`} size="sm"
        footer={<div className="flex justify-end gap-2">
          <button onClick={() => setLimitFor(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={() => { const v = limitVal === "" ? null : Number(limitVal); setEdits((e) => { const n = { ...e }; for (const r of limitFor ?? []) n[r.id] = { ...n[r.id], limit: v }; return n; }); setLimitFor(null); toast.info("ใส่วงเงินแล้ว — กด บันทึกทั้งหมด เพื่อบันทึก"); }}
            className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg">ใส่ให้ทุกรายที่เลือก</button>
        </div>}>
        <div className="space-y-2">
          <label className="text-[13px] text-slate-600">วงเงิน (บาท) — เว้นว่าง = ไม่จำกัด</label>
          <MoneyInput value={limitVal} onChange={setLimitVal} placeholder="ไม่จำกัด" className="h-10 w-full text-right" />
        </div>
      </ERPModal>

      {history && <RecordHistoryDrawer target={{ entityType: "partners_v2", entityId: history.id, title: history.name, subtitle: "ประวัติการแก้ไข" }} onClose={() => setHistory(null)} />}
    </PlaygroundShell>
  );
}
