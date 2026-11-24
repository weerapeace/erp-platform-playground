"use client";

// ============================================================
// 🛠 ซ่อม / คืนสินค้า — /order-ops/after-sales (แอป ช่องทางขาย/ออเดอร์ออนไลน์)
// แท็บ งานซ่อม (รอของลูกค้า → ซ่อม → รอแพ็กส่งกลับ → ส่งคืนแล้ว) · ของคืน/ตีกลับ (รอตรวจ → ตรวจแล้ว → ปิดงาน)
// ย้ายจากแอปเก่า repair-and-return (2026-11-24 · ช่วงทดลอง: ปุ่มรับเข้าสต๊อกยังไม่แตะสต๊อกจริง)
// API /api/order-ops?t=cases · กติกา lib/order-ops · ชิ้นส่วนร่วม ../instructions + ../shared
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { LoadingState, ErrorState } from "@/components/state-views";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Pager } from "@/components/pager";
import { StatFilterCards } from "@/components/stat-filter-cards";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ImageAttachKeys } from "@/components/image-attach";
import { PlatformOrderPicker } from "@/components/platform-order-picker";
import { useMediaQuery } from "@/lib/use-media-query";
import { caseStatusInfo, caseStatusList, defaultCaseStatus, nextCaseStatuses, REPAIR_RESOLUTIONS, type CaseKind } from "@/lib/order-ops";
import {
  Field, HistoryList, OptionsManager, OrderNoField, Pill, SkuField, TrashToggle, TrialBanner, TrialPill,
  fmtDate, inputCls, opsJson, useOpsOptions, type OrderHit,
} from "../shared";

type Case = {
  id: string; kind: CaseKind; order_no: string; customer_name: string | null; sku: string | null; qty: number;
  topic: string | null; detail: string | null; resolution: string | null; status: string; replacement_sku: string | null;
  shipping_charge: number | null; shipping_refund: number | null; bank_info: string | null; shipping_address: string | null;
  return_date: string | null; images: string[]; packed_at: string | null; shipped_back_at: string | null; checked_at: string | null;
  stock_received_at: string | null; stock_received_by_name: string | null; zort_cancelled_at: string | null; note: string | null;
  is_trial: boolean; platform_order_id: string | null; created_at: string; created_by_name: string | null;
};
type Summary = { repairing?: number; ready?: number; returns_open?: number; total?: number; trial?: number };

export default function AfterSalesPage() {
  const { permsReady } = useAuth();
  const canView = usePermission("order_ops.view");
  return (
    <PlaygroundShell>
      <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4">
        {!permsReady ? <LoadingState label="กำลังตรวจสิทธิ์…" />
          : !canView ? <AccessDenied message="หน้านี้สำหรับผู้มีสิทธิ์ดูงานหลังขาย (order_ops.view)" />
          : <Suspense fallback={<LoadingState />}><Body /></Suspense>}
      </div>
    </PlaygroundShell>
  );
}

function Body() {
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const kind: CaseKind = sp.get("kind") === "return" ? "return" : "repair";
  const isPhone = !useMediaQuery("(min-width: 768px)");
  const canEdit = usePermission("order_ops.edit");
  const canDelete = usePermission("order_ops.delete");
  const canManage = usePermission("order_ops.manage");
  const { options, reload: reloadOptions } = useOpsOptions();
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [trash, setTrash] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Case[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Case | "new" | null>(null);
  const [optOpen, setOptOpen] = useState(false);
  const [bump, setBump] = useState(0);

  const setKind = (k: CaseKind) => { setFilter("open"); router.replace(k === "return" ? "/order-ops/after-sales?kind=return" : "/order-ops/after-sales"); };

  const statusFilter = useMemo(() => {
    if (filter === "all") return null;
    if (kind === "repair") return filter === "ready" ? ["ready_to_ship"] : filter === "done" ? ["shipped_back"] : ["waiting_customer", "repairing", "remake"];
    return filter === "done" ? ["closed"] : ["received", "checked"];
  }, [filter, kind]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const p = new URLSearchParams({ t: "cases", kind, page: String(page), page_size: "50" });
    if (trash) p.set("trash", "1"); else if (statusFilter) p.set("status", statusFilter.join(","));
    if (q.trim()) p.set("q", q.trim());
    try {
      const r = await opsJson<{ rows: Case[]; total: number; summary: Summary }>(`/api/order-ops?${p}`);
      setRows(r.rows); setTotal(r.total); if (!trash) setSummary(r.summary);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [kind, page, trash, statusFilter, q]);
  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, bump, q]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [filter, trash, q, kind]);

  const sel = rows.filter((r) => selected.has(r.id));
  const patchOne = async (r: Case, patch: Record<string, unknown>, msg: string, undoPatch: Record<string, unknown>) => {
    try {
      await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "cases", id: r.id, patch }) });
      void load();
      toast.undo(msg, async () => { await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "cases", id: r.id, patch: undoPatch }) }); void load(); });
    } catch (e) { toast.error((e as Error).message); }
  };
  const bulkStatus = async (to: string) => {
    const prev = sel.map((r) => ({ id: r.id, status: r.status }));
    try {
      const r = await opsJson<{ updated: number; results: { ok: boolean; error?: string }[] }>("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "cases", ids: prev.map((x) => x.id), patch: { status: to } }) });
      const failed = r.results.filter((x) => !x.ok).length;
      setSelected(new Set()); void load();
      toast.undo(`เปลี่ยนสถานะ ${r.updated} รายการ${failed ? ` · ข้าม ${failed} รายการ (เปลี่ยนตรง ๆ ไม่ได้)` : ""}`, async () => {
        for (const p of prev) await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "cases", id: p.id, patch: { status: p.status } }) }).catch(() => {});
        void load();
      });
    } catch (e) { toast.error((e as Error).message); }
  };
  const del = async (ids: string[], mode: "soft" | "restore" | "hard") => {
    if (mode === "hard" && !(await askConfirm({ title: `ลบถาวร ${ids.length} รายการ?`, message: "ลบแล้วกู้คืนไม่ได้", confirmText: "ลบถาวร", variant: "danger" }))) return;
    try {
      await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "cases", ids, restore: mode === "restore", hard: mode === "hard" }) });
      setSelected(new Set()); void load();
      if (mode === "soft") toast.undo("ย้ายลงถังขยะแล้ว", async () => { await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "cases", ids, restore: true }) }); void load(); });
    } catch (e) { toast.error((e as Error).message); }
  };

  const statusPill = (r: Case) => { const s = caseStatusInfo(r.kind, r.status); return <Pill tone={s.tone}>{s.label}</Pill>; };
  const commonStatuses = kind === "repair" ? ["repairing", "ready_to_ship", "shipped_back"] : ["checked", "closed"];

  const columns: MiniColumn<Case>[] = kind === "repair" ? [
    { key: "order", header: "ออเดอร์", width: "1.2fr", locked: true, sortValue: (r) => r.order_no, cell: (r) => (
      <div className="min-w-0"><div className="flex items-center gap-1 font-mono text-xs">{r.order_no} {r.is_trial && <TrialPill />}</div><div className="truncate text-xs text-slate-500">{r.customer_name ?? "-"}</div></div>) },
    { key: "sku", header: "SKU", width: "8rem", sortValue: (r) => r.sku ?? "", cell: (r) => <span className="font-mono text-xs">{r.sku ?? "-"}{r.qty > 1 ? ` ×${r.qty}` : ""}</span> },
    { key: "topic", header: "หัวข้อ / วิธีแก้", width: "1.4fr", cell: (r) => <div className="text-xs"><div>{r.topic ?? "-"}</div><div className="text-slate-500">{r.resolution ?? ""}{r.replacement_sku ? ` → ${r.replacement_sku}` : ""}</div></div> },
    { key: "status", header: "สถานะ", width: "9rem", sortValue: (r) => r.status, cell: statusPill },
    { key: "fee", header: "ค่าส่ง", width: "5.5rem", align: "right", cell: (r) => <span className="text-xs">{r.shipping_charge != null ? `${r.shipping_charge.toLocaleString()} ฿` : "-"}{r.shipping_refund != null ? <span className="block text-rose-600">คืน {r.shipping_refund.toLocaleString()}</span> : null}</span> },
    { key: "img", header: "รูป", width: "3.5rem", align: "center", cell: (r) => r.images?.length ? <span className="text-xs text-slate-500"><Icon name="photo" className="inline h-3.5 w-3.5" /> {r.images.length}</span> : <span className="text-xs text-slate-300">-</span> },
    { key: "created", header: "รับงานเมื่อ", width: "7.5rem", sortValue: (r) => r.created_at, cell: (r) => <span className="text-xs text-slate-500">{fmtDate(r.created_at)}</span> },
  ] : [
    { key: "order", header: "ออเดอร์", width: "1.3fr", locked: true, sortValue: (r) => r.order_no, cell: (r) => (
      <div className="min-w-0"><div className="flex items-center gap-1 font-mono text-xs">{r.order_no} {r.is_trial && <TrialPill />}</div><div className="truncate text-xs text-slate-500">{r.customer_name ?? "-"}</div></div>) },
    { key: "sku", header: "SKU", width: "8rem", sortValue: (r) => r.sku ?? "", cell: (r) => <span className="font-mono text-xs">{r.sku ?? "-"}{r.qty > 1 ? ` ×${r.qty}` : ""}</span> },
    { key: "checked", header: "ตรวจของ", width: "6rem", cell: (r) => r.checked_at ? <Pill tone="success">ตรวจแล้ว</Pill> : <Pill>ยัง</Pill> },
    { key: "stock", header: "เข้าสต๊อก", width: "7rem", cell: (r) => r.stock_received_at
        ? <Pill tone="success" title={`${fmtDate(r.stock_received_at)} ${r.stock_received_by_name ?? ""} · ช่วงทดลองยังไม่เพิ่มสต๊อกจริง`}>รับเข้าแล้ว</Pill>
        : canEdit && !trash ? <button onClick={(e) => { e.stopPropagation(); void patchOne(r, { stock_received: true }, "บันทึกรับเข้าสต๊อกแล้ว (ช่วงทดลอง ยังไม่เพิ่มสต๊อกจริง)", { stock_received: false }); }} className="rounded border border-slate-200 px-2 py-0.5 text-[11px] hover:bg-slate-50">รับเข้า</button> : <span className="text-xs text-slate-300">-</span> },
    { key: "zort", header: "ZORT", width: "5.5rem", cell: (r) => r.zort_cancelled_at ? <Pill tone="success">ยกเลิกแล้ว</Pill> : <Pill>ยัง</Pill> },
    { key: "status", header: "สถานะ", width: "7rem", sortValue: (r) => r.status, cell: statusPill },
    { key: "created", header: "รับของเมื่อ", width: "7.5rem", sortValue: (r) => r.created_at, cell: (r) => <span className="text-xs text-slate-500">{fmtDate(r.created_at)}</span> },
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ซ่อม / คืนสินค้า</h1>
          <p className="text-sm text-slate-500">งานซ่อมหลังขาย · ของคืน / ตีกลับ — ผูกกับออเดอร์ในศูนย์ออเดอร์ด้วยเลขออเดอร์</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-sm">
          <button onClick={() => setKind("repair")} className={`rounded-md px-3 py-1 ${kind === "repair" ? "bg-sky-50 font-medium text-sky-700" : "text-slate-600"}`}>งานซ่อม</button>
          <button onClick={() => setKind("return")} className={`rounded-md px-3 py-1 ${kind === "return" ? "bg-sky-50 font-medium text-sky-700" : "text-slate-600"}`}>ของคืน / ตีกลับ</button>
        </div>
      </div>
      <TrialBanner trialCount={summary.trial ?? 0} onChanged={() => setBump((b) => b + 1)} />
      <StatFilterCards
        value={trash ? "" : filter}
        onChange={(k) => {
          setTrash(false);
          if (k === "returns") { setKind("return"); return; }
          setFilter(k);
        }}
        showZero
        cards={kind === "repair" ? [
          { key: "open", label: "รอซ่อม / กำลังซ่อม", value: summary.repairing, tone: "warning" },
          { key: "ready", label: "รอแพ็กส่งกลับ", value: summary.ready, tone: "info" },
          { key: "returns", label: "ของคืน รอตรวจ", value: summary.returns_open, tone: "warning" },
          { key: "done", label: "ส่งคืนแล้ว", value: null, tone: "success" },
          { key: "all", label: "งานซ่อมทั้งหมด", value: summary.total, tone: "neutral" },
        ] : [
          { key: "open", label: "รอตรวจ / ตรวจแล้ว", value: summary.returns_open, tone: "warning" },
          { key: "done", label: "ปิดงาน", value: null, tone: "success" },
          { key: "all", label: "ของคืนทั้งหมด", value: summary.total, tone: "neutral" },
        ]}
      />
      <div className="my-2 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นเลขออเดอร์ / ชื่อลูกค้า / SKU / รายละเอียด" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <TrashToggle on={trash} onChange={setTrash} />
        {canManage && kind === "repair" && <button onClick={() => setOptOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"><Icon name="settings" className="h-3.5 w-3.5" /> จัดการหัวข้อซ่อม</button>}
        {canEdit && !trash && <button onClick={() => setEditing("new")} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"><Icon name="plus" className="h-4 w-4" /> {kind === "repair" ? "รับงานซ่อม" : "รับของคืน"}</button>}
      </div>

      {sel.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
          <span>เลือก {sel.length} รายการ</span><span className="flex-1" />
          {!trash && canEdit && commonStatuses.map((s) => <button key={s} onClick={() => bulkStatus(s)} className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs">→ {caseStatusInfo(kind, s).label}</button>)}
          {!trash && canDelete && <button onClick={() => del(sel.map((r) => r.id), "soft")} className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs text-rose-600">ลบ</button>}
          {trash && canDelete && <button onClick={() => del(sel.map((r) => r.id), "restore")} className="rounded-md border border-sky-200 bg-white px-2 py-1 text-xs">กู้คืน</button>}
          {trash && canManage && <button onClick={() => del(sel.map((r) => r.id), "hard")} className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs text-rose-600">ลบถาวร</button>}
          <button onClick={() => setSelected(new Set())} className="text-xs text-sky-700 underline">ยกเลิกเลือก</button>
        </div>
      )}

      {error ? <ErrorState title={error} onRetry={load} /> : loading && !rows.length ? <LoadingState /> : (
        <MiniTable rows={rows} columns={columns} rowKey={(r) => r.id} hideSearch selectable selected={selected} onSelectedChange={setSelected}
          onRowClick={(r) => setEditing(r)} layout={isPhone ? "cards" : "table"} storageKey={`order-ops-cases-${kind}`} countUnit="รายการ"
          emptyText={trash ? "ถังขยะว่าง" : q ? "ไม่พบรายการ ลองเปลี่ยนคำค้น" : kind === "repair" ? "ไม่มีงานซ่อมในกลุ่มนี้" : "ไม่มีของคืนในกลุ่มนี้"}
          renderCard={(r) => (
            <div className="space-y-1 p-1">
              <div className="flex items-start justify-between gap-2"><span className="font-mono text-xs">{r.order_no}</span><span className="flex gap-1">{r.is_trial && <TrialPill />}{statusPill(r)}</span></div>
              <div className="text-xs text-slate-500"><span className="font-mono">{r.sku ?? "-"}</span>{r.topic ? ` · ${r.topic}` : ""}{r.customer_name ? ` · ${r.customer_name}` : ""}</div>
              {!trash && canEdit && (
                <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  {nextCaseStatuses(r.kind, r.status).filter((s) => s !== "cancelled").slice(0, 2).map((s) => (
                    <button key={s} onClick={() => patchOne(r, { status: s }, `เปลี่ยนเป็น "${caseStatusInfo(r.kind, s).label}"`, { status: r.status })} className="flex-1 rounded-md border border-slate-200 py-1.5 text-xs">{caseStatusInfo(r.kind, s).label}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        />
      )}
      <Pager page={page} pageSize={50} total={total} onPage={setPage} unitLabel="รายการ" hideWhenSingle />

      {editing && (
        <CaseForm kind={kind} row={editing === "new" ? null : editing} topics={options.filter((o) => o.kind === "repair_topic")}
          readOnly={!canEdit || trash} canDelete={canDelete && !trash} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
      )}
      <OptionsManager open={optOpen} onClose={() => setOptOpen(false)} kind="repair_topic" options={options} onChanged={reloadOptions} />
      {isPhone ? null : <p className="mt-3 text-[11px] text-slate-400">ทุกการเปลี่ยนแปลงลงประวัติ (ใครทำ · เมื่อไหร่ · จากอะไรเป็นอะไร) — ดูได้ในหน้ารายละเอียด</p>}
    </>
  );
}

/* ───────────── ฟอร์มงานซ่อม / ของคืน ───────────── */

function CaseForm({ kind, row, topics, readOnly, canDelete, onClose, onSaved }: {
  kind: CaseKind; row: Case | null; topics: { label: string; is_active: boolean }[]; readOnly: boolean; canDelete: boolean; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const k: CaseKind = row?.kind ?? kind;
  const init = useMemo(() => ({
    order_no: row?.order_no ?? "", customer_name: row?.customer_name ?? "", sku: row?.sku ?? "", qty: row?.qty ?? 1,
    topic: row?.topic ?? "", detail: row?.detail ?? "", resolution: row?.resolution ?? "", status: row?.status ?? defaultCaseStatus(k),
    replacement_sku: row?.replacement_sku ?? "", shipping_charge: row?.shipping_charge != null ? String(row.shipping_charge) : "",
    shipping_refund: row?.shipping_refund != null ? String(row.shipping_refund) : "", bank_info: row?.bank_info ?? "",
    shipping_address: row?.shipping_address ?? "", return_date: row?.return_date ?? "", images: row?.images ?? [], note: row?.note ?? "",
    checked: !!row?.checked_at, stock_received: !!row?.stock_received_at, zort_cancelled: !!row?.zort_cancelled_at, packed: !!row?.packed_at,
    platform_order_id: row?.platform_order_id ?? null as string | null,
  }), [row, k]);
  const [f, setF] = useState(init);
  const [items, setItems] = useState<OrderHit["items"]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<{ id: string; action: string; metadata: Record<string, unknown> | null; created_at: string }[]>([]);
  const set = <K extends keyof typeof f>(key: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [key]: v }));
  useEffect(() => { if (row) opsJson<{ history: typeof history }>(`/api/order-ops?t=cases&id=${row.id}`).then((r) => setHistory(r.history)).catch(() => {}); }, [row]);

  const allowed = row ? [row.status, ...nextCaseStatuses(k, row.status)] : caseStatusList(k);

  const save = async () => {
    if (!f.order_no.trim()) { toast.error("กรุณาใส่เลขออเดอร์"); return; }
    if (k === "repair" && !f.topic) { toast.error("กรุณาเลือกหัวข้อซ่อม"); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...f, kind: k };
      if (!row) delete body.platform_order_id;
      if (row) await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "cases", id: row.id, patch: body }) });
      else {
        const { checked, stock_received, zort_cancelled, packed, ...create } = body;
        void checked; void stock_received; void zort_cancelled; void packed;
        const r = await opsJson<{ row: { id: string } }>("/api/order-ops", { method: "POST", body: JSON.stringify({ t: "cases", ...create, platform_order_id: f.platform_order_id, is_trial: true }) });
        const flags = { checked: f.checked, stock_received: f.stock_received, zort_cancelled: f.zort_cancelled, packed: f.packed };
        if (Object.values(flags).some(Boolean)) await opsJson("/api/order-ops", { method: "PATCH", body: JSON.stringify({ t: "cases", id: r.row.id, patch: flags }) });
      }
      toast.success("บันทึกแล้ว"); onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  const del = async () => {
    if (!row) return;
    try {
      await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "cases", ids: [row.id] }) });
      onSaved();
      toast.undo("ย้ายลงถังขยะแล้ว", async () => { await opsJson("/api/order-ops", { method: "DELETE", body: JSON.stringify({ t: "cases", ids: [row.id], restore: true }) }); onSaved(); });
    } catch (e) { toast.error((e as Error).message); }
  };
  const activeTopics = topics.filter((t) => t.is_active || t.label === f.topic).map((t) => t.label);

  return (
    <ERPModal open onClose={onClose} title={row ? `${k === "repair" ? "งานซ่อม" : "ของคืน"} — ${row.order_no}` : k === "repair" ? "รับงานซ่อม" : "รับของคืน / ตีกลับ"}
      size="lg" defaultExpanded={false} storageKey="order-ops-case-form" hasUnsavedChanges={!readOnly && JSON.stringify(f) !== JSON.stringify(init)}
      footer={readOnly ? undefined : (
        <div className="flex w-full items-center gap-2">
          {row && canDelete && <button onClick={del} className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">ลบ</button>}
          <span className="flex-1" />
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">ยกเลิก</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      )}>
      <fieldset disabled={readOnly} className="space-y-3">
        <Field label="เลขออเดอร์ *">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <OrderNoField value={f.order_no} onChange={(v) => set("order_no", v)} autoFocus={!row}
                onFound={(o) => { setItems(o?.items ?? []); if (o) setF((p) => ({ ...p, platform_order_id: o.id, customer_name: p.customer_name || o.customer_name || "", sku: p.sku || (o.items.length === 1 ? o.items[0].sku ?? "" : ""), note: p.note || (o.note ? `ลูกค้าเขียน: ${o.note}` : "") })); }} />
            </div>
            <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"><Icon name="list" className="h-4 w-4" /> เลือกออเดอร์</button>
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
          <Field label="ชื่อลูกค้า"><input value={f.customer_name} onChange={(e) => set("customer_name", e.target.value)} className={inputCls} /></Field>
          <Field label="สินค้า (SKU)"><SkuField value={f.sku} onChange={(v) => set("sku", v)} items={items} /></Field>
          <Field label="จำนวน"><input type="number" min={1} value={f.qty} onChange={(e) => set("qty", Math.max(1, Number(e.target.value) || 1))} className={inputCls} /></Field>
        </div>

        {k === "repair" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="หัวข้อซ่อม *">
                <select value={f.topic} onChange={(e) => set("topic", e.target.value)} className={inputCls}>
                  <option value="">เลือกหัวข้อ</option>{activeTopics.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="วิธีแก้">
                <select value={f.resolution} onChange={(e) => set("resolution", e.target.value)} className={inputCls}>
                  <option value="">ยังไม่ตัดสิน</option>{REPAIR_RESOLUTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <Field label="รายละเอียด"><textarea value={f.detail} onChange={(e) => set("detail", e.target.value)} rows={2} className={inputCls} /></Field>
            {f.resolution && f.resolution !== "ซ่อม" && <Field label="สินค้าที่ส่งให้แทน (SKU)"><input value={f.replacement_sku} onChange={(e) => set("replacement_sku", e.target.value)} className={`${inputCls} font-mono`} /></Field>}
          </>
        )}

        <Field label="สถานะ">
          <div className="flex flex-wrap gap-1">
            {caseStatusList(k).map((s) => {
              const info = caseStatusInfo(k, s); const ok = allowed.includes(s);
              return <button key={s} type="button" disabled={!ok} onClick={() => set("status", s)} title={ok ? "" : "ต้องผ่านขั้นก่อนหน้าก่อน"} className={`rounded-md border px-2.5 py-1 text-xs ${f.status === s ? "border-sky-400 bg-sky-50 text-sky-700" : ok ? "border-slate-200 text-slate-600" : "border-slate-100 text-slate-300"}`}>{info.label}</button>;
            })}
          </div>
        </Field>

        <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-slate-200 p-3 text-sm">
          {k === "repair" && <label className="flex items-center gap-2"><input type="checkbox" checked={f.packed} onChange={(e) => set("packed", e.target.checked)} /> แพ็กแล้ว</label>}
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.checked} onChange={(e) => set("checked", e.target.checked)} /> ตรวจเช็กสินค้าแล้ว</label>
          {k === "return" && <label className="flex items-center gap-2" title="ช่วงทดลอง: จดไว้อย่างเดียว ยังไม่เพิ่มสต๊อกจริง"><input type="checkbox" checked={f.stock_received} onChange={(e) => set("stock_received", e.target.checked)} /> รับเข้าสต๊อกแล้ว <span className="text-[11px] text-amber-700">(ทดลอง ยังไม่เพิ่มสต๊อกจริง)</span></label>}
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.zort_cancelled} onChange={(e) => set("zort_cancelled", e.target.checked)} /> ยกเลิกใน ZORT แล้ว</label>
        </div>

        {k === "repair" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="เก็บค่าส่ง (บาท)"><input inputMode="decimal" value={f.shipping_charge} onChange={(e) => set("shipping_charge", e.target.value)} className={inputCls} /></Field>
            <Field label="คืนค่าส่ง (บาท)"><input inputMode="decimal" value={f.shipping_refund} onChange={(e) => set("shipping_refund", e.target.value)} className={inputCls} /></Field>
            <Field label="วันที่ส่งกลับ"><input type="date" value={f.return_date} onChange={(e) => set("return_date", e.target.value)} className={inputCls} /></Field>
          </div>
        )}
        {k === "repair" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="บัญชีธนาคาร (คืนเงิน)"><textarea value={f.bank_info} onChange={(e) => set("bank_info", e.target.value)} rows={2} className={inputCls} /></Field>
            <Field label="ที่อยู่ส่งกลับ"><textarea value={f.shipping_address} onChange={(e) => set("shipping_address", e.target.value)} rows={2} className={inputCls} /></Field>
          </div>
        )}
        <Field label={k === "repair" ? "รูปตำหนิ / สลิปโอน" : "รูปสินค้าที่รับคืน"}>
          <ImageAttachKeys value={f.images} onChange={(v) => set("images", v)} folder="after-sales" disabled={readOnly} />
        </Field>
        <Field label="หมายเหตุ"><textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={2} className={inputCls} /></Field>
      </fieldset>
      {!row && <p className="mt-3 text-[11px] text-amber-700">ช่วงทดลอง: รายการใหม่จะติดป้าย "ทดลอง" และล้างทิ้งได้ทีเดียวตอนเริ่มใช้จริง</p>}
      {row && <div className="mt-4 border-t border-slate-100 pt-3"><div className="mb-1 text-xs font-medium text-slate-600">ประวัติ</div><HistoryList logs={history} /></div>}
      <PlatformOrderPicker open={pickerOpen} onClose={() => setPickerOpen(false)} existingLabel="มีคำสั่งพิเศษ"
        onPick={(o) => setF((p) => ({ ...p, order_no: o.order_no, customer_name: "", sku: "" }))} />
    </ERPModal>
  );
}
