"use client";

/**
 * เนื้อหาหน้า ผลิต → จัดการงานเหมา (/master/piecework-jobs) — เจ้าของขอ 2026-11-01 "ต้องมีหน้า จัดการงานเหมาด้วยสิ ของกลางอะ"
 *   ทะเบียนงานเหมากลาง (piecework_jobs) = ตัวเลือกในช่อง "งานเหมา" ทุกที่ (จ่ายงานเหมา · BOM)
 *   ตารางกลาง (DataTable) + ใช้ใน BOM กี่สูตร · จ่ายไปกี่ครั้ง · แก้ราคาล่าสุด · ลากเรียงลำดับ (= ลำดับใน dropdown)
 *   ป๊อปแก้ไข: ชื่อ / ราคาตั้งต้น / งานละเอียด / หมายเหตุ · เปลี่ยนราคาใน BOM ด้วยได้ · แท็บ ประวัติราคา / ใช้ใน BOM / จ่ายล่าสุด
 *   รวมกับงานอื่น (งานชื่อซ้ำ) · เก็บ (แทนการลบ) / คืนกลับมาใช้
 * สิทธิ์: ดู = products.view · แก้ = production.piecework · API /api/admin/piecework-jobs (หน้าเดิม /admin/piecework-jobs พามาที่นี่)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type DataTableView } from "@/components/data-table";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import { SearchableSelect } from "@/components/searchable-select";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { PieceworkJobManage, PieceworkRate, PieceworkUsage } from "@/app/api/admin/piecework-jobs/route";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const thDate = (s: string | null) => { if (!s) return "—"; const d = new Date(s.length === 10 ? `${s}T00:00:00` : s); return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); };
const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm disabled:opacity-50";
const input = "h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400";
type Form = { id: string | null; name: string; default_rate: string; is_detail: boolean; note: string; bom_rate: boolean };
const EMPTY: Form = { id: null, name: "", default_rate: "", is_detail: false, note: "", bom_rate: false };

async function call<T = Record<string, unknown>>(url: string, method: "POST" | "PATCH" | "DELETE" = "POST", body?: unknown): Promise<T> {
  const r = await apiFetch(url, method === "DELETE" ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(r.status === 401 || r.status === 403 ? "คุณไม่มีสิทธิ์แก้งานเหมา" : (j?.error || "บันทึกไม่สำเร็จ"));
  return j as T;
}

/** เนื้อหาหน้า (page.tsx ครอบ + ส่งสิทธิ์) */
export function PieceworkJobsView({ canView, canEdit }: { canView: boolean; canEdit: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<PieceworkJobManage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [tab, setTab] = useState<"hist" | "bom" | "recent">("hist");
  const [hist, setHist] = useState<PieceworkRate[] | null>(null);
  const [usage, setUsage] = useState<PieceworkUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [mergeTo, setMergeTo] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [order, setOrder] = useState<PieceworkJobManage[]>([]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await apiFetch("/api/admin/piecework-jobs?manage=1").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setRows((j.data ?? []) as PieceworkJobManage[]);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดงานเหมาไม่สำเร็จ"); setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const cur = form?.id ? rows?.find((r) => r.id === form.id) ?? null : null;
  const open = (r: PieceworkJobManage | null) => {
    setForm(r ? { id: r.id, name: r.name, default_rate: String(r.default_rate), is_detail: r.is_detail, note: r.note ?? "", bom_rate: false } : { ...EMPTY });
    setTab("hist"); setHist(null); setUsage(null); setMergeTo("");
    if (r) {
      apiFetch(`/api/admin/piecework-jobs?history=${r.id}`).then((x) => x.json()).then((j) => setHist((j.data ?? []) as PieceworkRate[])).catch(() => setHist([]));
      apiFetch(`/api/admin/piecework-jobs?usage=${r.id}`).then((x) => x.json()).then((j) => setUsage((j.data ?? null) as PieceworkUsage | null)).catch(() => setUsage({ boms: [], recent: [] }));
    }
  };
  const rateChanged = !!cur && form != null && form.default_rate.trim() !== "" && Math.abs(Number(form.default_rate) - cur.default_rate) > 0.0001;
  const dirty = !!form && (!cur ? !!form.name.trim() : form.name !== cur.name || rateChanged || form.is_detail !== cur.is_detail || (form.note || "") !== (cur.note ?? ""));

  const save = async () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) { toast.error("ใส่ชื่องานก่อน"); return; }
    const rate = Number(form.default_rate) || 0;
    if (rate < 0) { toast.error("ราคาติดลบไม่ได้"); return; }
    const dupe = rows?.find((r) => r.id !== form.id && r.is_active && r.name.trim().toLowerCase() === name.toLowerCase());
    if (dupe) { toast.error(`มีงาน "${dupe.name}" อยู่แล้ว — ถ้าเป็นงานเดียวกันใช้ "รวมกับงานอื่น"`); return; }
    setBusy(true);
    try {
      if (form.id) {
        const j = await call<{ bom_updated?: number }>("/api/admin/piecework-jobs", "PATCH", { id: form.id, name, default_rate: rate, is_detail: form.is_detail, note: form.note, bom_rate: rateChanged && form.bom_rate });
        toast.success(`บันทึก "${name}" แล้ว${j.bom_updated ? ` · เปลี่ยนราคาใน BOM ${j.bom_updated} สูตร` : ""}`);
      } else {
        await call("/api/admin/piecework-jobs", "POST", { name, default_rate: rate, is_detail: form.is_detail, note: form.note });
        toast.success(`เพิ่มงานเหมา "${name}" แล้ว`);
      }
      setForm(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const archive = async (on: boolean) => {
    if (!cur) return;
    if (!on && !(await askConfirm({ title: `เก็บงาน "${cur.name}"?`, confirmText: "เก็บ",
      message: <div className="space-y-1 text-sm"><div>จะไม่ขึ้นให้เลือกในช่องงานเหมาอีก — ข้อมูลเดิมไม่หาย</div>{cur.bom_count > 0 && <div className="text-amber-700">ยังอยู่ใน BOM {cur.bom_count} สูตร (สูตรเดิมยังใช้ได้)</div>}</div> }))) return;
    setBusy(true);
    try {
      if (on) await call("/api/admin/piecework-jobs", "PATCH", { id: cur.id, is_active: true });
      else await call(`/api/admin/piecework-jobs?id=${encodeURIComponent(cur.id)}`, "DELETE");
      toast.success(on ? `คืน "${cur.name}" กลับมาใช้แล้ว` : `เก็บ "${cur.name}" แล้ว`);
      setForm(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const merge = async () => {
    const dst = rows?.find((r) => r.id === mergeTo);
    if (!cur || !dst) return;
    if (!(await askConfirm({ title: `รวม "${cur.name}" เข้ากับ "${dst.name}"?`, variant: "danger", confirmText: "รวมงาน",
      message: <div className="space-y-1 text-sm"><div>BOM {cur.bom_count} สูตร + งานที่จ่ายไปแล้ว {cur.dispatch_count} รายการ จะเปลี่ยนไปใช้ &ldquo;{dst.name}&rdquo;</div><div>งาน &ldquo;{cur.name}&rdquo; จะถูกเก็บ · BOM ที่มีทั้งสองงานอยู่แล้ว = เหลือ &ldquo;{dst.name}&rdquo; อย่างเดียว</div></div> }))) return;
    setBusy(true);
    try {
      const j = await call<{ data: { bom_moved: number; bom_dropped: number; dispatch_moved: number } }>("/api/admin/piecework-jobs", "POST", { action: "merge", from: cur.id, into: dst.id });
      toast.success(`รวมแล้ว · BOM ย้าย ${j.data.bom_moved}${j.data.bom_dropped ? ` (ซ้ำตัดออก ${j.data.bom_dropped})` : ""} · งานที่จ่าย ${j.data.dispatch_moved}`);
      setForm(null); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "รวมไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  // ── จัดลำดับ (ลาก) = ลำดับในช่อง "งานเหมา" ทุกที่
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => setOrder((o) => moveItem(o, from, to)));
  const openOrder = () => { setOrder((rows ?? []).filter((r) => r.is_active)); setOrderOpen(true); };
  const saveOrder = async () => {
    setBusy(true);
    try { await call("/api/admin/piecework-jobs", "POST", { action: "reorder", ids: order.map((r) => r.id) }); toast.success("บันทึกลำดับแล้ว"); setOrderOpen(false); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกลำดับไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const active = (rows ?? []).filter((r) => r.is_active).length;
  const views = useMemo<DataTableView[]>(() => [
    { id: "active", label: `ใช้งาน (${active})`, filter: (r) => (r as PieceworkJobManage).is_active },
    { id: "archived", label: `เก็บแล้ว (${(rows ?? []).length - active})`, filter: (r) => !(r as PieceworkJobManage).is_active },
    { id: "unused", label: `ยังไม่มีใครใช้ (${(rows ?? []).filter((r) => r.is_active && !r.bom_count && !r.dispatch_count).length})`, filter: (r) => { const x = r as PieceworkJobManage; return x.is_active && !x.bom_count && !x.dispatch_count; } },
  ], [rows, active]);
  const columns = useMemo<ColumnDef<PieceworkJobManage>[]>(() => [
    { accessorKey: "sort_order", header: "ลำดับ", size: 70, cell: ({ getValue }) => <span className="text-xs tabular-nums text-slate-400">{getValue() as number}</span> },
    { accessorKey: "name", header: "งานเหมา", size: 260, cell: ({ row }) => (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">{row.original.name}{row.original.is_detail && <span className="rounded bg-amber-50 px-1.5 text-[11px] font-normal text-amber-700">ละเอียด</span>}{!row.original.is_active && <span className="rounded bg-slate-100 px-1.5 text-[11px] font-normal text-slate-500">เก็บแล้ว</span>}</div>
        {row.original.note && <div className="truncate text-[11px] text-slate-400">{row.original.note}</div>}
      </div>
    ) },
    { accessorKey: "default_rate", header: "ราคาตั้งต้น/ชิ้น", size: 120, cell: ({ getValue }) => <span className="font-semibold tabular-nums text-violet-700">฿{fmt(getValue() as number)}</span> },
    { accessorKey: "bom_count", header: "ใช้ใน BOM", size: 100, cell: ({ getValue }) => { const n = getValue() as number; return <span className={`tabular-nums ${n ? "text-slate-700" : "text-slate-300"}`}>{n ? `${fmt(n)} สูตร` : "—"}</span>; } },
    { accessorKey: "dispatch_count", header: "จ่ายไปแล้ว", size: 100, cell: ({ getValue }) => { const n = getValue() as number; return <span className={`tabular-nums ${n ? "text-slate-700" : "text-slate-300"}`}>{n ? `${fmt(n)} ครั้ง` : "—"}</span>; } },
    { accessorKey: "last_rate_at", header: "แก้ราคาล่าสุด", size: 120, cell: ({ getValue }) => <span className="text-xs text-slate-500">{thDate(getValue() as string | null)}</span> },
  ], []);

  if (!canView) return <AccessDenied />;
  return (
    <div className="mx-auto max-w-[1400px] px-5 py-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-2xl font-semibold text-slate-800"><Icon name="list" /> จัดการงานเหมา</h1>
          <p className="mt-0.5 text-sm text-slate-500">รายชื่องานเหมากลาง = ตัวเลือกในช่อง &ldquo;งานเหมา&rdquo; ทุกที่ (จ่ายงานเหมา · BOM) · กดแถวเพื่อแก้ / ดูประวัติราคา / ดูว่าใช้ที่ไหน</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/master/piecework-dispatch" className={`${btn} border-slate-200 bg-white text-slate-600 no-underline hover:bg-slate-50`}><Icon name="truck" /> ไปจ่ายงานเหมา</a>
          {canEdit && <button type="button" onClick={openOrder} disabled={!active} className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}><Icon name="sliders" /> จัดลำดับ</button>}
          {canEdit && <button type="button" onClick={() => open(null)} className={`${btn} border-violet-600 bg-violet-600 font-medium text-white hover:bg-violet-700`}><Icon name="add" /> เพิ่มงานเหมา</button>}
        </div>
      </div>
      {!canEdit && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">คุณดูได้อย่างเดียว — แก้รายชื่องานเหมาต้องมีสิทธิ์ &ldquo;จัดการงานเหมา&rdquo; (production.piecework)</div>}

      <DataTable<PieceworkJobManage>
        data={rows ?? []} columns={columns} loading={rows === null} error={err ?? undefined} onRetry={load}
        views={views} searchPlaceholder="ค้นชื่องานเหมา / หมายเหตุ" searchableKeys={["name", "note", "code"]}
        tableId="piecework-jobs" exportFilename="งานเหมา" pageSize={50} emptyMessage="ยังไม่มีงานเหมา — กด “เพิ่มงานเหมา”"
        onRowClick={(r) => open(r)}
      />

      {/* ป๊อปแก้ไข / เพิ่มงานเหมา */}
      <ERPModal open={form !== null} onClose={() => { if (!busy) setForm(null); }} size="lg" storageKey="piecework-job-edit" hasUnsavedChanges={dirty}
        title={cur ? `งานเหมา: ${cur.name}` : "เพิ่มงานเหมา"}
        description={cur ? `ใช้ใน BOM ${cur.bom_count} สูตร · จ่ายไปแล้ว ${cur.dispatch_count} ครั้ง` : "ชื่องานจะขึ้นเป็นตัวเลือกในช่อง “งานเหมา” ทุกที่"}
        footer={form && (
          <div className="flex w-full flex-wrap items-center gap-2">
            {cur && canEdit && (cur.is_active
              ? <button type="button" onClick={() => void archive(false)} disabled={busy} className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}><Icon name="folder" /> เก็บงานนี้</button>
              : <button type="button" onClick={() => void archive(true)} disabled={busy} className={`${btn} border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50`}><Icon name="refresh" /> คืนกลับมาใช้</button>)}
            <div className="flex-1" />
            <button type="button" onClick={() => setForm(null)} disabled={busy} className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>ยกเลิก</button>
            {canEdit && <button type="button" onClick={() => void save()} disabled={busy || !dirty} className={`${btn} border-violet-600 bg-violet-600 font-medium text-white hover:bg-violet-700`}><Icon name="save" /> {busy ? "กำลังบันทึก…" : "บันทึก"}</button>}
          </div>
        )}>
        {form && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm text-slate-600 sm:col-span-1">ชื่องาน<input value={form.name} disabled={!canEdit} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} placeholder="เช่น ยัดนุ่น" autoFocus /></label>
              <label className="text-sm text-slate-600">ราคาตั้งต้น/ชิ้น (บาท)<input type="number" min={0} step="any" value={form.default_rate} disabled={!canEdit} onChange={(e) => setForm({ ...form, default_rate: e.target.value })} className={`${input} text-right`} placeholder="0.25" /></label>
              <label className="text-sm text-slate-600">หมายเหตุ<input value={form.note} disabled={!canEdit} onChange={(e) => setForm({ ...form, note: e.target.value })} className={input} placeholder="ไม่บังคับ" /></label>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.is_detail} disabled={!canEdit} onChange={(e) => setForm({ ...form, is_detail: e.target.checked })} /> งานละเอียด <span className="text-[12px] text-slate-400">(ป้ายเตือนให้ช่างระวัง)</span></label>
            {rateChanged && cur && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-sm">
                <div className="text-violet-800">ราคาใหม่ ฿{fmt(Number(form.default_rate) || 0)} (เดิม ฿{fmt(cur.default_rate)}) — ใช้กับการจ่ายครั้งใหม่ · งานที่จ่ายไปแล้วไม่เปลี่ยน</div>
                {cur.bom_count > 0 && <label className="mt-1 inline-flex items-center gap-2 text-violet-800"><input type="checkbox" checked={form.bom_rate} onChange={(e) => setForm({ ...form, bom_rate: e.target.checked })} /> เปลี่ยนราคาใน BOM ที่ใช้งานนี้ด้วย ({cur.bom_count} สูตร)</label>}
              </div>
            )}

            {cur && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {([["hist", `ประวัติราคา${hist ? ` ${hist.length}` : ""}`], ["bom", `ใช้ใน BOM ${cur.bom_count}`], ["recent", `จ่ายล่าสุด${usage ? ` ${usage.recent.length}` : ""}`]] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setTab(k)} className={`inline-flex h-8 items-center rounded-full border px-3 text-sm ${tab === k ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
                  ))}
                </div>
                <div className="max-h-[40vh] overflow-auto rounded-lg border border-slate-200">
                  {tab === "hist" ? (hist === null ? <p className="p-4 text-sm text-slate-400">กำลังโหลด…</p> : !hist.length ? <p className="p-4 text-sm text-slate-400">ยังไม่มีประวัติราคา</p> : (
                    <table className="w-full text-sm"><thead><tr className="bg-slate-50 text-left text-[12px] text-slate-500"><th className="px-3 py-1.5 font-medium">วันที่</th><th className="px-3 py-1.5 text-right font-medium">ราคา</th><th className="px-3 py-1.5 font-medium">หมายเหตุ</th></tr></thead>
                      <tbody>{hist.map((h) => <tr key={h.id} className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-600">{thDate(h.created_at)}</td><td className="px-3 py-1.5 text-right font-semibold tabular-nums text-violet-700">฿{fmt(h.rate)}</td><td className="px-3 py-1.5 text-slate-500">{[h.note, h.contractor_name].filter(Boolean).join(" · ") || "—"}</td></tr>)}</tbody></table>
                  )) : !usage ? <p className="p-4 text-sm text-slate-400">กำลังโหลด…</p> : tab === "bom" ? (!usage.boms.length ? <p className="p-4 text-sm text-slate-400">ยังไม่มี BOM ใช้งานนี้ — จ่ายงานเหมาแล้วติ๊ก &ldquo;บันทึกเข้า BOM&rdquo; จะเพิ่มให้เอง</p> : (
                    <table className="w-full text-sm"><thead><tr className="bg-slate-50 text-left text-[12px] text-slate-500"><th className="px-3 py-1.5 font-medium">BOM</th><th className="px-3 py-1.5 font-medium">สินค้า</th><th className="px-3 py-1.5 text-right font-medium">ชิ้น/ใบ</th><th className="px-3 py-1.5 text-right font-medium">ราคาใน BOM</th></tr></thead>
                      <tbody>{usage.boms.map((b) => <tr key={b.bom_code} className="border-t border-slate-100"><td className="px-3 py-1.5 font-mono text-[12px] text-slate-600">{b.bom_code}</td><td className="px-3 py-1.5 font-mono text-[12px] text-slate-800">{b.product_sku ?? "—"}</td><td className="px-3 py-1.5 text-right tabular-nums">{fmt(b.qty_per)}</td><td className={`px-3 py-1.5 text-right tabular-nums ${Math.abs(b.rate - cur.default_rate) > 0.0001 ? "text-amber-700" : "text-slate-700"}`}>฿{fmt(b.rate)}</td></tr>)}</tbody></table>
                  )) : (!usage.recent.length ? <p className="p-4 text-sm text-slate-400">ยังไม่เคยจ่ายงานนี้</p> : (
                    <table className="w-full text-sm"><thead><tr className="bg-slate-50 text-left text-[12px] text-slate-500"><th className="px-3 py-1.5 font-medium">วันที่จ่าย</th><th className="px-3 py-1.5 font-medium">ใบสั่งผลิต</th><th className="px-3 py-1.5 font-medium">คนรับ</th><th className="px-3 py-1.5 text-right font-medium">ชิ้น</th><th className="px-3 py-1.5 text-right font-medium">เงิน</th><th className="px-3 py-1.5 font-medium">สถานะ</th></tr></thead>
                      <tbody>{usage.recent.map((m) => <tr key={m.id} className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-600">{thDate(m.date)}</td><td className="px-3 py-1.5 font-mono text-[12px]">{m.mo_no}</td><td className="px-3 py-1.5">{m.assignee_name ?? "—"}</td><td className="px-3 py-1.5 text-right tabular-nums">{fmt(m.total_qty)}</td><td className="px-3 py-1.5 text-right tabular-nums">฿{fmt(m.total_qty * m.rate)}</td><td className="px-3 py-1.5">{m.status === "done" ? <span className="text-emerald-700">รับคืนแล้ว</span> : <span className="text-amber-700">ค้าง</span>}</td></tr>)}</tbody></table>
                  ))}
                </div>
              </div>
            )}

            {cur && cur.is_active && canEdit && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-sm">
                <span className="text-slate-600">รวมกับงานอื่น (ชื่อซ้ำ / งานเดียวกัน):</span>
                <div className="w-56"><SearchableSelect value={mergeTo} onChange={setMergeTo} placeholder="— เลือกงานที่จะรวมเข้า —"
                  options={(rows ?? []).filter((r) => r.is_active && r.id !== cur.id).map((r) => ({ value: r.id, label: r.name, badge: `฿${fmt(r.default_rate)}` }))} /></div>
                <button type="button" onClick={() => void merge()} disabled={busy || !mergeTo} className={`${btn} h-8 border-rose-300 bg-white text-rose-600 hover:bg-rose-50`}>รวมงาน</button>
              </div>
            )}
          </div>
        )}
      </ERPModal>

      {/* จัดลำดับ (ลากหูจับ) */}
      <ERPModal open={orderOpen} onClose={() => { if (!busy) setOrderOpen(false); }} size="sm" title="จัดลำดับงานเหมา" description="ลากหูจับเพื่อเรียง — ลำดับนี้คือลำดับในช่อง “งานเหมา” ทุกที่"
        footer={<><button type="button" onClick={() => setOrderOpen(false)} disabled={busy} className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>ยกเลิก</button>
          <button type="button" onClick={() => void saveOrder()} disabled={busy} className={`${btn} border-violet-600 bg-violet-600 font-medium text-white hover:bg-violet-700`}><Icon name="save" /> บันทึกลำดับ</button></>}>
        <div className="space-y-1">
          {order.map((r, i) => (
            <div key={r.id} {...rowProps(i)} className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 ${rowCls(i)}`}>
              <DragHandle {...handleProps(i)} title="ลากเพื่อเรียง" />
              <span className="w-6 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
              <span className="flex-1 text-sm text-slate-800">{r.name}</span>
              <span className="text-sm tabular-nums text-violet-700">฿{fmt(r.default_rate)}</span>
            </div>
          ))}
        </div>
      </ERPModal>
    </div>
  );
}
