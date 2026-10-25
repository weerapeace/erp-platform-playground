"use client";

/**
 * จัดการใบสั่งผลิตค้าง — /master/mo-backlog
 * ใบที่ยังเปิดอยู่ทั้งหมด แบ่งเป็นแท็บตาม "สิ่งที่ต้องทำ" (ของกลาง lib/mo-backlog) → ติ๊กหลายใบ → สั่งจากแถบล่าง
 *
 * ขั้นที่ 1: ✅ ปิดงาน · 📅 ตั้งวันกำหนด · 🚫 ยกเลิกใบ
 *   - กฎสถานะ = ของกลาง lib/mo-workflow (หน้าจอเช็กก่อนเพื่อบอกจำนวน · server เช็กซ้ำเสมอ)
 *   - กระทบเกิน 20 ใบ ต้องพิมพ์ CONFIRM (CLAUDE.md §18) · ยกเลิกต้องใส่เหตุผล
 *   - ทุกคำสั่งเขียนประวัติรายใบ (audit) ฝั่ง API · จบแล้วโชว์รายงาน สำเร็จ/ข้าม พร้อมเหตุผล
 * ของกลางที่ใช้: DataTable (bulkBarPosition="bottom" → BulkActionBar) · ConfirmDialog · ERPModal · MoStatusModal · DateInput
 * สิทธิ์: ดู = products.view · ปิด/ยกเลิก = work_board.dispatch · ตั้งวัน = products.edit
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type BulkAction, type DataTableView } from "@/components/data-table";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { MoStatusModal } from "@/components/mo-status-modal";
import { DateInput } from "@/components/date-input";
import { useToast } from "@/components/toast";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { MO_BUCKETS, MO_BUCKET_ORDER, type MoBacklogBucket, type MoBacklogRow } from "@/lib/mo-backlog";
import { checkMoTransition, MO_ACTION_META, type MoBulkStatusAction } from "@/lib/mo-workflow";

type Kind = MoBulkStatusAction | "due";
type Skip = { mo_no: string | null; reason: string };
type Result = { title: string; okText: string; skipped: Skip[]; note?: string; prs: { pr_no: string; status: string; mo_nos: string[] }[] };

const TYPED_AT = 20;   // กระทบเกินนี้ต้องพิมพ์ CONFIRM

const TONE: Record<(typeof MO_BUCKETS)[MoBacklogBucket]["tone"], string> = {
  green:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  blue:   "bg-blue-50 text-blue-700 border-blue-200",
  red:    "bg-rose-50 text-rose-700 border-rose-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  amber:  "bg-amber-50 text-amber-700 border-amber-200",
  slate:  "bg-slate-50 text-slate-600 border-slate-200",
};

const factsOf = (r: MoBacklogRow) => ({ status: r.status, qty: r.qty, dispatched: r.dispatched, received: r.received, openWorkOrders: r.open_work_orders });
const num = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const Dash = () => <span className="text-xs text-slate-300">—</span>;

function Ratio({ done, total }: { done: number; total: number }) {
  if (!total) return <Dash />;
  const ok = done >= total;
  return <span className={`text-xs tabular-nums ${ok ? "text-emerald-600 font-medium" : done > 0 ? "text-amber-600" : "text-slate-400"}`}>{num(done)}/{num(total)}</span>;
}

/** รวมใบที่ถูกข้ามตามเหตุผล → "เหตุผล: MO-1, MO-2 …" */
function groupSkips(skipped: Skip[]) {
  const by = new Map<string, string[]>();
  for (const s of skipped) by.set(s.reason, [...(by.get(s.reason) ?? []), s.mo_no ?? "—"]);
  return [...by.entries()];
}

export default function MoBacklogPage() {
  const canView = usePermission("products.view");
  const canEdit = usePermission("products.edit");             // ตั้งวันกำหนด (สิทธิ์เดียวกับ API เดิม)
  const canManage = usePermission("work_board.dispatch");     // ปิดงาน / ยกเลิก = คนคุมบอร์ดจ่ายงาน
  const toast = useToast();

  const [rows, setRows] = useState<MoBacklogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [openMoId, setOpenMoId] = useState<string | null>(null);

  // คำสั่งที่กำลังยืนยัน
  const [pending, setPending] = useState<{ kind: Kind; rows: MoBacklogRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [dueField, setDueField] = useState<"due" | "internal">("due");
  const [dueVal, setDueVal] = useState("");
  const [dueMode, setDueMode] = useState<"empty" | "all">("empty");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await apiFetch("/api/mo/backlog");
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "โหลดข้อมูลไม่สำเร็จ");
      setRows((j.data ?? []) as MoBacklogRow[]);
    } catch (e) { setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"); setRows([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(MO_BUCKET_ORDER.map((b) => [b, 0])) as Record<MoBacklogBucket, number>;
    for (const r of rows) c[r.bucket] += 1;
    return c;
  }, [rows]);

  const views = useMemo<DataTableView[]>(() => {
    const cnt = (f: (r: MoBacklogRow) => boolean) => rows.filter(f).length;
    return [
      { id: "all", label: `ทั้งหมด (${rows.length})` },
      ...MO_BUCKET_ORDER.filter((b) => counts[b] > 0).map((b) => ({
        id: `b-${b}`, label: `${b} · ${MO_BUCKETS[b].label} (${counts[b]})`,
        filter: (r: Record<string, unknown>) => (r as MoBacklogRow).bucket === b,
      })),
      { id: "no-due", label: `ไม่มีวันนัดส่ง (${cnt((r) => !r.due_date)})`, filter: (r) => !(r as MoBacklogRow).due_date },
      { id: "late", label: `เลยวันนัดส่ง (${cnt((r) => r.overdue_days != null)})`, filter: (r) => (r as MoBacklogRow).overdue_days != null },
      { id: "no-bom", label: `ไม่มีสูตร (${cnt((r) => !r.has_bom)})`, filter: (r) => !(r as MoBacklogRow).has_bom },
    ];
  }, [rows, counts]);

  const columns = useMemo<ColumnDef<MoBacklogRow>[]>(() => [
    { accessorKey: "mo_no", header: "เลขใบ", size: 130, cell: ({ getValue }) => <span className="font-mono text-xs text-slate-700">{getValue() as string}</span> },
    {
      accessorKey: "product_sku", header: "สินค้า", size: 240,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800 truncate">{row.original.product_sku || "—"}</div>
          {row.original.product_name && row.original.product_name !== row.original.product_sku && <div className="text-[11px] text-slate-400 truncate">{row.original.product_name}</div>}
        </div>
      ),
    },
    { accessorKey: "qty", header: "จำนวน", size: 80, meta: { filterType: "number" }, cell: ({ getValue }) => <span className="text-sm tabular-nums">{num(getValue() as number)}</span> },
    {
      accessorKey: "bucket", header: "สิ่งที่ต้องทำ", size: 190,
      meta: { filterable: true, filterType: "select", filterOptions: MO_BUCKET_ORDER.map((b) => ({ value: b, label: `${b} · ${MO_BUCKETS[b].label}` })) },
      cell: ({ getValue }) => { const b = getValue() as MoBacklogBucket; const m = MO_BUCKETS[b];
        return <span title={m.hint} className={`text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap ${TONE[m.tone]}`}>{b} · {m.label}</span>; },
    },
    {
      accessorKey: "age_days", header: "สร้างเมื่อ", size: 130, meta: { filterType: "number", filterLabel: "อายุใบ (วัน)" },
      cell: ({ row }) => (
        <span className="text-xs whitespace-nowrap text-slate-600">{formatDate(row.original.created_at)}
          <span className={`ml-1 ${row.original.age_days > 90 ? "text-rose-600 font-medium" : row.original.age_days > 60 ? "text-orange-600" : "text-slate-400"}`}>({row.original.age_days} วัน)</span>
        </span>
      ),
    },
    {
      id: "dispatch", accessorFn: (r) => r.dispatched, header: "จ่าย / คืน", size: 120,
      cell: ({ row }) => { const r = row.original;
        if (!r.dispatched) return <span className="text-xs text-slate-400">ยังไม่จ่าย</span>;
        return <span className="text-xs tabular-nums whitespace-nowrap">จ่าย {num(r.dispatched)} · <span className={r.received >= r.qty ? "text-emerald-600 font-medium" : "text-slate-500"}>คืน {num(r.received)}</span></span>; },
    },
    { id: "prep", accessorFn: (r) => r.prep_ready, header: "เตรียม", size: 80, cell: ({ row }) => <Ratio done={row.original.prep_ready} total={row.original.prep_total} /> },
    { id: "cut", accessorFn: (r) => r.cut_ready, header: "ตัด", size: 80, cell: ({ row }) => <Ratio done={row.original.cut_ready} total={row.original.cut_total} /> },
    {
      accessorKey: "due_date", header: "📦 นัดส่งลูกค้า", size: 140,
      cell: ({ row }) => { const r = row.original; if (!r.due_date) return <Dash />;
        return <span className="text-xs whitespace-nowrap">{formatDate(r.due_date)}{r.overdue_days != null && <span className="ml-1 text-rose-600 font-medium">เลย {r.overdue_days} วัน</span>}</span>; },
    },
    { accessorKey: "internal_due_date", header: "🪑 ส่งงานภายใน", size: 120, cell: ({ getValue }) => getValue() ? <span className="text-xs">{formatDate(getValue() as string)}</span> : <Dash /> },
    { accessorKey: "groups", header: "กลุ่ม", size: 170, meta: { filterable: true }, cell: ({ getValue }) => getValue() ? <span className="text-xs text-violet-700 line-clamp-1">{getValue() as string}</span> : <Dash /> },
    { accessorKey: "last_dispatch_date", header: "จ่ายล่าสุด", size: 110, cell: ({ getValue }) => getValue() ? <span className="text-xs text-slate-500">{formatDate(getValue() as string)}</span> : <Dash /> },
  ], []);

  const open = useCallback((kind: Kind, sel: MoBacklogRow[]) => {
    setPending({ kind, rows: sel }); setReason(""); setFormErr(null);
    if (kind === "due") { setDueVal(""); setDueMode("empty"); }
  }, []);

  const bulkActions = useMemo<BulkAction<MoBacklogRow>[]>(() => [
    ...(canManage ? [{ label: "✅ ปิดงาน", keepSelection: true, onClick: (rs: MoBacklogRow[]) => open("close", rs) }] : []),
    ...(canEdit ? [{ label: "📅 ตั้งวันกำหนด", keepSelection: true, onClick: (rs: MoBacklogRow[]) => open("due", rs) }] : []),
    ...(canManage ? [{ label: "🚫 ยกเลิกใบ", variant: "danger" as const, keepSelection: true, onClick: (rs: MoBacklogRow[]) => open("cancel", rs) }] : []),
  ], [canManage, canEdit, open]);

  // ใบที่ "น่าจะทำได้" ตามกฎ (หน้าจอเช็กเพื่อบอกจำนวนล่วงหน้า — server เช็กซ้ำอีกรอบ)
  const dueCol = dueField === "due" ? "due_date" : "internal_due_date";
  const eligible = useMemo(() => {
    if (!pending) return [];
    if (pending.kind === "due") return pending.rows.filter((r) => (dueMode === "empty" ? !r[dueCol] : r[dueCol] !== (dueVal || null)));
    const k = pending.kind;
    return pending.rows.filter((r) => !checkMoTransition(k, factsOf(r)));
  }, [pending, dueMode, dueCol, dueVal]);
  const notEligible = (pending?.rows.length ?? 0) - eligible.length;

  const finish = (res: Result) => { setPending(null); setResult(res); setResetKey((k) => k + 1); void load(); };

  const run = async () => {
    if (!pending) return;
    if (!eligible.length) { setFormErr("ไม่มีใบที่ทำคำสั่งนี้ได้ในรายการที่เลือก"); return; }
    const ids = pending.rows.map((r) => r.id);
    if (pending.kind === "due") {
      if (!dueVal) { setFormErr("เลือกวันที่ก่อน"); return; }
      setBusy(true);
      try {
        const r = await apiFetch("/api/mo/bulk-due-date", { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, due_date: dueVal, field: dueField, only_empty: dueMode === "empty" }) });
        const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
        const label = dueField === "due" ? "วันนัดส่งลูกค้า" : "วันส่งงานภายใน";
        toast.success(`ตั้ง${label}แล้ว ${j.updated} ใบ`);
        finish({ title: `📅 ตั้ง${label} ${formatDate(dueVal)}`,
          okText: `ตั้งวันแล้ว ${j.updated} ใบ${j.cascaded ? ` · ใบจ่ายงานขยับตาม ${j.cascaded} ใบ` : ""}`,
          skipped: [], note: j.kept_filled ? `ข้าม ${j.kept_filled} ใบที่มีวันอยู่แล้ว (ไม่ทับ)` : undefined, prs: [] });
      } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
      finally { setBusy(false); }
      return;
    }
    const meta = MO_ACTION_META[pending.kind];
    if (meta.needReason && !reason.trim()) { setFormErr("ใส่เหตุผลก่อน (จะบันทึกลงประวัติ)"); return; }
    setBusy(true);
    try {
      const r = await apiFetch("/api/mo/bulk-status", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action: pending.kind, reason: reason.trim() }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      const done = (j.updated ?? []).length;
      toast.success(`${meta.label}แล้ว ${done} ใบ`);
      finish({ title: `${pending.kind === "close" ? "✅" : "🚫"} ผล${meta.label}`, okText: `${meta.label}แล้ว ${done} ใบ`,
        skipped: (j.skipped ?? []) as Skip[], prs: j.linked_prs ?? [] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  if (!canView) return <AccessDenied message="ต้องมีสิทธิ์ดูใบสั่งผลิต (products.view)" />;

  const k = pending?.kind;
  const n = eligible.length;
  const confirmTitle = k === "close" ? `✅ ปิดงาน ${n} ใบ` : k === "cancel" ? `🚫 ยกเลิก ${n} ใบ` : `📅 ตั้งวันกำหนด ${n} ใบ`;
  const changes = k === "close"
    ? ["สถานะใบ: ร่าง → เสร็จ", "หายจากบอร์ดจ่ายงาน หน้าขอซื้อ และหน้าเตรียมวัตถุดิบ", "ไม่แตะใบจ่ายงาน ค่าแรง หรือสต็อก"]
    : k === "cancel"
      ? ["สถานะใบ: ร่าง → ยกเลิก", "หายจากบอร์ดจ่ายงาน หน้าขอซื้อ และหน้าเตรียมวัตถุดิบ", "ใบขอซื้อที่ผูกอยู่ ไม่ถูกยกเลิกตาม (จะแจ้งรายชื่อให้หลังทำเสร็จ)"]
      : [dueField === "due" ? "ตั้ง 📦 วันนัดส่งลูกค้า" : "ตั้ง 🪑 วันส่งงานภายใน (ใบจ่ายงานที่ยังทำอยู่ขยับตาม)", dueMode === "empty" ? "เติมเฉพาะใบที่ยังว่าง — ใบที่มีวันอยู่แล้วไม่ถูกทับ" : "ทับวันเดิมทุกใบที่เลือก"];
  const skipNote = k === "close" ? "ยังส่งคืนไม่ครบ / ยังมีใบจ่ายงานค้าง" : k === "cancel" ? "จ่ายงานไปแล้ว — ยกเลิกไม่ได้" : dueMode === "empty" ? "มีวันอยู่แล้ว" : "วันเดิมตรงกับวันใหม่อยู่แล้ว";

  return (
    <div className="max-w-[1700px] mx-auto px-5 py-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">🧹 จัดการใบสั่งผลิตค้าง</h1>
          <p className="text-sm text-slate-500 mt-0.5">เลือกแท็บตามสิ่งที่ต้องทำ → ติ๊กหลายใบ (หรือ "เลือกทั้งหมดที่ตรงตัวกรอง") → สั่งจากแถบด้านล่าง · กดแถวเพื่อดูสถานะ/เช็กลิสต์ของใบนั้น</p>
        </div>
        <a href="/master/work-board" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">📋 กลับบอร์ดจ่ายงาน</a>
      </div>

      {/* สรุปจำนวนรายกลุ่ม (ไม่ซ้อนกัน) */}
      <div className="grid gap-2 mb-4 grid-cols-2 sm:grid-cols-4 xl:grid-cols-7">
        {MO_BUCKET_ORDER.map((b) => (
          <div key={b} className={`rounded-xl border px-3 py-2 ${TONE[MO_BUCKETS[b].tone]}`}>
            <div className="text-[11px] font-medium truncate">{b} · {MO_BUCKETS[b].label}</div>
            <div className="text-xl font-semibold tabular-nums">{loading ? "…" : counts[b]}</div>
            <div className="text-[11px] opacity-80 truncate">{MO_BUCKETS[b].hint}</div>
          </div>
        ))}
      </div>

      {!canManage && !canEdit && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          คุณดูได้อย่างเดียว — ปุ่มปิดงาน/ยกเลิกต้องมีสิทธิ์ "จ่ายงานเข้าแผนก (บอร์ดจ่ายงาน)" · ตั้งวันกำหนดต้องมีสิทธิ์แก้ข้อมูลสินค้า/ใบสั่งผลิต
        </div>
      )}

      <DataTable<MoBacklogRow>
        data={rows} columns={columns} loading={loading} error={error ?? undefined} onRetry={load}
        views={views} bulkActions={bulkActions} bulkBarPosition="bottom" bulkUnit="ใบ" selectionResetKey={resetKey}
        searchPlaceholder="ค้นหา เลขใบ / รหัสสินค้า / ชื่อ / กลุ่ม..."
        searchableKeys={["mo_no", "product_sku", "product_name", "groups"]}
        tableId="mo-backlog" exportFilename="ใบสั่งผลิตค้าง" exportEntityType="mo" pageSize={50}
        emptyMessage="ไม่มีใบสั่งผลิตค้างในมุมมองนี้"
        onRowClick={(r) => setOpenMoId(r.id)}
      />

      {/* ป๊อปยืนยัน (ของกลาง ConfirmDialog) — บอกจำนวนที่ทำได้/ข้าม + สิ่งที่จะเปลี่ยน · เกิน 20 ใบพิมพ์ CONFIRM */}
      <ConfirmDialog
        open={!!pending}
        onClose={() => { if (!busy) setPending(null); }}
        onConfirm={() => void run()}
        loading={busy}
        variant={k === "cancel" ? "danger" : "default"}
        title={confirmTitle}
        confirmText={k === "close" ? `ปิดงาน ${n} ใบ` : k === "cancel" ? `ยกเลิก ${n} ใบ` : `ตั้งวัน ${n} ใบ`}
        requireTyped={n > TYPED_AT ? "CONFIRM" : undefined}
        message={pending && (
          <div className="space-y-3">
            <p>เลือกไว้ <b>{pending.rows.length}</b> ใบ · ทำได้ <b className="text-slate-800">{n}</b> ใบ
              {notEligible > 0 && <> · <span className="text-amber-700">ข้าม {notEligible} ใบ ({skipNote})</span></>}</p>

            {k === "due" && (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {([["due", "📦 นัดส่งลูกค้า"], ["internal", "🪑 ส่งงานภายใน"]] as const).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setDueField(v)}
                      className={`h-8 flex-1 rounded-lg border text-xs font-medium ${dueField === v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{label}</button>
                  ))}
                </div>
                <DateInput value={dueVal} onChange={(v) => { setDueVal(v); setFormErr(null); }} className="w-full" />
                <div className="flex flex-col gap-1 text-xs text-slate-600">
                  <label className="flex items-center gap-2"><input type="radio" checked={dueMode === "empty"} onChange={() => setDueMode("empty")} /> เติมเฉพาะใบที่ยังไม่มีวัน (แนะนำ)</label>
                  <label className="flex items-center gap-2"><input type="radio" checked={dueMode === "all"} onChange={() => setDueMode("all")} /> ทับวันเดิมทุกใบที่เลือก</label>
                </div>
              </div>
            )}

            {k === "cancel" && (
              <div>
                <label className="text-xs text-slate-500">เหตุผลที่ยกเลิก (บันทึกลงประวัติ) *</label>
                <textarea value={reason} onChange={(e) => { setReason(e.target.value); setFormErr(null); }} rows={2}
                  placeholder="เช่น ลูกค้ายกเลิกออเดอร์ล็อตนี้ / เปิดใบซ้ำ"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400" />
              </div>
            )}

            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="mb-0.5 text-slate-400">สิ่งที่จะเปลี่ยน</div>
              {changes.map((c) => <div key={c}>• {c}</div>)}
            </div>
            <div className="text-[11px] text-slate-400">🕘 บันทึกประวัติทุกใบ: ใคร · เมื่อไร · ค่าเดิม → ค่าใหม่{k === "cancel" ? " · เหตุผล" : ""}</div>
            {formErr && <div className="text-xs font-medium text-rose-600">{formErr}</div>}
          </div>
        )}
      />

      {/* รายงานผลหลังทำ (สำเร็จ / ข้าม + เหตุผล / ใบขอซื้อที่ยังผูกอยู่) */}
      <ERPModal open={!!result} onClose={() => setResult(null)} size="sm" title={result?.title ?? ""}
        footer={<button onClick={() => setResult(null)} className="h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">ปิด</button>}>
        {result && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-800 font-medium">✓ {result.okText}</div>
            {result.note && <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">{result.note}</div>}
            {result.skipped.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900">
                <div className="font-medium mb-1">ข้าม {result.skipped.length} ใบ</div>
                {groupSkips(result.skipped).map(([why, list]) => (
                  <div key={why} className="text-xs mb-1"><b>{why}</b>: {list.slice(0, 30).join(", ")}{list.length > 30 ? ` และอีก ${list.length - 30} ใบ` : ""}</div>
                ))}
              </div>
            )}
            {result.prs.length > 0 && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-rose-900 text-xs">
                <div className="font-medium mb-1">⚠️ ใบขอซื้อที่ยังผูกกับใบที่ยกเลิก {result.prs.length} ใบ — ส่งให้ฝ่ายจัดซื้อตรวจ</div>
                {result.prs.slice(0, 20).map((p) => <div key={p.pr_no}>{p.pr_no} ({p.status === "waiting" ? "รออนุมัติ" : "ออกใบสั่งซื้อแล้ว"}) ← {p.mo_nos.join(", ")}</div>)}
                {result.prs.length > 20 && <div>และอีก {result.prs.length - 20} ใบ</div>}
              </div>
            )}
          </div>
        )}
      </ERPModal>

      {openMoId && <MoStatusModal moId={openMoId} onClose={() => setOpenMoId(null)} onChanged={load} />}
    </div>
  );
}
