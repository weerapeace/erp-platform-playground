"use client";

/**
 * 🛠 โหมดทำงาน (มุมมองที่ 3 ของหน้า SKU การตลาด) — จัดงานเป็นชุด แล้วติ๊กว่าแต่ละรุ่นทำถึงไหน
 *   ชิปงานด้านบน (ความคืบหน้า + กำหนดส่ง) → เลือกงาน → ตารางรุ่นในงาน: ราคา Clearance (฿/%) + เช็กลิสต์ + ความคืบหน้า
 *   ราคาใหม่เก็บในงานเท่านั้น ไม่แก้ราคาใน ERP · ติ๊กหลายรุ่นพร้อมกันได้ (แถบลอยล่างจอ)
 * ของกลางที่ใช้: MiniTable · BulkActionBar · ERPModal/ConfirmDialog · MoneyInput · SearchableSelect · HoverImage · MarketingSkuPickerModal (เลือกรุ่นแบบการ์ด) · Toast
 * กฎคำนวณ: lib/marketing/work-jobs.ts (มีเทสต์)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ConfirmDialog } from "@/components/modal";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { SearchableSelect } from "@/components/searchable-select";
import { MoneyInput } from "@/components/money-input";
import { HoverImage } from "@/components/hover-image";
import { MarketingSkuPickerModal, type SkuPickerCatalog } from "@/components/marketing-sku-picker-modal";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import type { MarketingSkuLabel } from "@/lib/marketing/sku-list";
import {
  assigneeNames, discountProblem, dueState, fmtBaht, itemProgress, jobProgress, kindInfo, newPriceRange, shortThaiDate,
  type DiscountUnit, type WorkJob, type WorkJobItem,
} from "@/lib/marketing/work-jobs";
import { LabelBadge } from "./label-manager";
import { WorkJobModal } from "./work-job-modal";

const JOB_KEY = "marketing-skus:work-job";
const readJob = () => { try { return localStorage.getItem(JOB_KEY) || ""; } catch { return ""; } };
const saveJob = (v: string) => { try { localStorage.setItem(JOB_KEY, v); } catch { /* ignore */ } };

const DUE_STYLE: Record<string, string> = {
  overdue: "text-red-600", today: "text-amber-600", soon: "text-amber-600", ok: "text-slate-500",
};
const DUE_TEXT: Record<string, string> = { overdue: "เลยกำหนด", today: "ครบวันนี้", soon: "ใกล้ครบ", ok: "" };

/** รายการงาน — หน้า SKU การตลาดถือไว้ที่เดียว (ใช้ทั้งโหมดทำงานและแถบ "ใส่ในงาน") */
export function useWorkJobs(enabled: boolean) {
  const [jobs, setJobs] = useState<WorkJob[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await apiFetch(`/api/marketing/work-jobs${showArchived ? "?all=1" : ""}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { setErr(j.error || "โหลดรายการงานไม่สำเร็จ"); return; }
      setJobs((j.data?.jobs ?? []) as WorkJob[]); setErr(null);
    } catch { setErr("เกิดข้อผิดพลาดในการโหลดรายการงาน กรุณาลองใหม่"); }
    finally { setLoaded(true); }
  }, [enabled, showArchived]);
  useEffect(() => { void reload(); }, [reload]);
  return { jobs, reload, loaded, err, showArchived, setShowArchived };
}

type Drafts = Record<string, { discount?: string; base?: string; editBase?: boolean }>;

export function WorkMode({ canManage, labels, labelMap, work, focusJobId, onLabelsChanged }: {
  canManage: boolean;
  labels: MarketingSkuLabel[];
  labelMap: Map<string, MarketingSkuLabel>;
  work: ReturnType<typeof useWorkJobs>;
  /** สร้างงานจากหน้าการ์ดแล้ว → เปิดงานนั้นเลย */
  focusJobId?: string | null;
  /** ใส่รุ่นแล้วป้ายเปลี่ยน → ให้หน้าหลักโหลดป้ายใหม่ */
  onLabelsChanged: () => void;
}) {
  const toast = useToast();
  const { jobs, reload, loaded, err: listErr, showArchived, setShowArchived } = work;
  const [jobId, setJobId] = useState<string>("");
  const [detail, setDetail] = useState<{ job: WorkJob; items: WorkJobItem[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Drafts>({});
  const [modal, setModal] = useState<{ job: WorkJob | null } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ask, setAsk] = useState<{ kind: "delete" } | { kind: "remove"; ids: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  // เลือกงาน: ที่สั่งมา → ที่จำไว้ → งานแรกที่ยังทำอยู่
  useEffect(() => { if (focusJobId) { setJobId(focusJobId); saveJob(focusJobId); } }, [focusJobId]);
  useEffect(() => {
    if (!loaded) return;
    setJobId((cur) => {
      // งานที่เพิ่งสร้าง อาจยังไม่อยู่ในรายการ (กำลังโหลดใหม่) → คงไว้ ไม่เด้งไปงานอื่น
      if (cur && (jobs.some((j) => j.id === cur) || cur === focusJobId)) return cur;
      const remembered = readJob();
      if (remembered && jobs.some((j) => j.id === remembered)) return remembered;
      return jobs.find((j) => j.status === "open")?.id ?? jobs[0]?.id ?? "";
    });
  }, [loaded, jobs, focusJobId]);
  const pickJob = (id: string) => { setJobId(id); saveJob(id); };

  const loadDetail = useCallback(async (id: string, silent = false) => {
    if (!id) { setDetail(null); return; }
    if (!silent) setLoading(true);
    try {
      const r = await apiFetch(`/api/marketing/work-jobs/${id}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) { setErr(j.error || "โหลดงานไม่สำเร็จ"); if (!silent) setDetail(null); return; }
      setDetail(j.data); setErr(null);
    } catch { setErr("เกิดข้อผิดพลาดในการโหลดงาน กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { setSelected(new Set()); setDrafts({}); void loadDetail(jobId); }, [jobId, loadDetail]);

  const job = detail?.job ?? null;
  const items = useMemo(() => detail?.items ?? [], [detail]);
  // ป๊อปเพิ่มรุ่น: เปิดที่แบรนด์ที่มีในงานมากสุด · รุ่นที่อยู่ในงานแล้วติ๊กซ้ำไม่ได้
  const itemParentIds = useMemo(() => items.map((it) => it.parent_sku_id), [items]);
  const jobBrandId = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) if (it.brand_id) m.set(it.brand_id, (m.get(it.brand_id) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [items]);
  const loadCatalog = useCallback(async (): Promise<SkuPickerCatalog> => {
    let j: { data?: SkuPickerCatalog; error?: string };
    try { j = await (await apiFetch("/api/marketing/skus")).json(); }
    catch { throw new Error("โหลดรายการรุ่นไม่สำเร็จ กรุณาลองใหม่"); }
    if (j.error || !j.data) throw new Error(j.error || "โหลดรายการรุ่นไม่สำเร็จ กรุณาลองใหม่");
    return j.data;
  }, []);
  const steps = useMemo(() => job?.steps ?? [], [job]);
  const hasPrice = job ? kindInfo(job.kind).hasPrice : false;
  const prog = useMemo(() => jobProgress(items, steps), [items, steps]);
  const rows = useMemo(() => (hideDone ? items.filter((it) => !itemProgress(it.step_done, steps).complete) : items), [items, steps, hideDone]);

  // ── บันทึก ──
  const call = async (url: string, method: string, body: unknown) => {
    const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
    return j.data ?? {};
  };
  const patchJob = async (patch: Record<string, unknown>, okText: string) => {
    if (!job) return;
    setBusy(true);
    try {
      const d = await call(`/api/marketing/work-jobs/${job.id}`, "PATCH", patch);
      setDetail((cur) => (cur ? { ...cur, job: d.job as WorkJob } : cur));
      toast.success(okText);
      void reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  // ติ๊ก/เอาติ๊กออก (หลายรุ่นได้) — เปลี่ยนบนจอก่อน พลาดค่อยโหลดใหม่
  const setStep = async (itemIds: string[], stepKey: string, done: boolean) => {
    if (!job || !itemIds.length) return;
    const now = new Date().toISOString();
    const ids = new Set(itemIds);
    setDetail((cur) => cur && {
      ...cur, items: cur.items.map((it) => {
        if (!ids.has(it.id)) return it;
        const sd = { ...it.step_done };
        if (done) sd[stepKey] = sd[stepKey] ?? { at: now, by: null }; else delete sd[stepKey];
        return { ...it, step_done: sd };
      }),
    });
    try {
      const d = await call(`/api/marketing/work-jobs/${job.id}/items`, "PATCH", { item_ids: itemIds, step_key: stepKey, done });
      if (done) setDetail((cur) => cur && { ...cur, items: cur.items.map((it) => (ids.has(it.id) && it.step_done[stepKey]?.by == null ? { ...it, step_done: { ...it.step_done, [stepKey]: { at: d.at ?? now, by: d.by ?? null } } } : it)) });
      if (itemIds.length > 1) toast.success(`${done ? "ติ๊ก" : "เอาติ๊กออก"} ${Number(d.changed) || 0} รุ่นแล้ว`);
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      void loadDetail(job.id, true);
    }
  };

  const saveItem = async (it: WorkJobItem, patch: Record<string, unknown>) => {
    if (!job) return;
    const prev = it;
    setDetail((cur) => cur && { ...cur, items: cur.items.map((x) => (x.id === it.id ? { ...x, ...patch } as WorkJobItem : x)) });
    try {
      await call(`/api/marketing/work-jobs/${job.id}/items`, "PATCH", { item_id: it.id, ...patch });
      setDrafts((d) => { const n = { ...d }; delete n[it.id]; return n; });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setDetail((cur) => cur && { ...cur, items: cur.items.map((x) => (x.id === it.id ? prev : x)) });
    }
  };
  const commitDiscount = (it: WorkJobItem, raw: string) => {
    const v = raw.trim() === "" ? null : Number(raw);
    if (v != null && !Number.isFinite(v)) { toast.error("ส่วนลดต้องเป็นตัวเลข"); return; }
    if (v === it.discount_value) { setDrafts((d) => { const n = { ...d }; delete n[it.id]; return n; }); return; }
    const problem = discountProblem(it.base_price_min ?? it.base_price_max, v, it.discount_unit);
    if (problem) { toast.error(`${it.code}: ${problem}`); return; }
    void saveItem(it, { discount_value: v });
  };
  const commitBase = (it: WorkJobItem, raw: string) => {
    const v = raw.trim() === "" ? null : Number(raw);
    if (v != null && (!Number.isFinite(v) || v < 0)) { toast.error("ราคาเต็มต้องเป็นตัวเลขไม่ติดลบ"); return; }
    setDrafts((d) => ({ ...d, [it.id]: { ...d[it.id], editBase: false, base: undefined } }));
    if (v === it.base_price_min && v === it.base_price_max) return;
    void saveItem(it, { base_price_min: v, base_price_max: v });
  };

  // ใส่รุ่นจากป๊อปเลือกรุ่น (ส่งทีละก้อน กันก้อนใหญ่เกิน) · คืน false = ป๊อปค้างไว้ให้ลองใหม่
  const addModels = async (ids: string[]): Promise<boolean> => {
    if (!job || !ids.length) return true;
    setBusy(true);
    let added = 0, labeled = 0;
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const d = await call(`/api/marketing/work-jobs/${job.id}/items`, "POST", { parent_sku_ids: ids.slice(i, i + 200) });
        added += Number(d.added) || 0; labeled += Number(d.labeled) || 0;
      }
      toast.success(`ใส่ ${added} รุ่นเข้างานแล้ว${labeled ? ` · เปลี่ยนป้าย ${labeled} รุ่น` : ""}`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ใส่รุ่นไม่สำเร็จ");
      return false;
    } finally {
      if (labeled) onLabelsChanged();
      if (added) { await loadDetail(job.id, true); void reload(); }
      setBusy(false);
    }
  };

  const confirmAsk = async () => {
    if (!job || !ask) return;
    setBusy(true);
    try {
      if (ask.kind === "delete") {
        await call(`/api/marketing/work-jobs/${job.id}`, "DELETE", {});
        toast.success(`ลบงาน “${job.name}” แล้ว`);
        setDetail(null); setJobId(""); saveJob("");
        await reload();
      } else {
        const d = await call(`/api/marketing/work-jobs/${job.id}/items`, "DELETE", { item_ids: ask.ids });
        toast.success(`เอาออก ${Number(d.removed) || 0} รุ่นแล้ว`);
        setSelected(new Set());
        await loadDetail(job.id, true); void reload();
      }
      setAsk(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  // ── คอลัมน์ ──
  const stepCell = (it: WorkJobItem) => (
    <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
      {steps.map((s) => {
        const d = it.step_done[s.key];
        const tip = d ? `ทำแล้ว${d.by ? ` โดย ${d.by}` : ""} · ${new Date(d.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}` : "ยังไม่ได้ทำ";
        return (
          <button key={s.key} type="button" disabled={!canManage} title={tip} aria-pressed={!!d}
            onClick={() => void setStep([it.id], s.key, !d)}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition ${d ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500 enabled:hover:border-slate-400"} disabled:cursor-default`}>
            <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[9px] leading-none ${d ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>{d ? "✓" : ""}</span>
            {s.label}
          </button>
        );
      })}
    </div>
  );

  const priceCell = (it: WorkJobItem) => {
    const dr = drafts[it.id] ?? {};
    const range = it.base_price_min != null && it.base_price_max != null && it.base_price_min !== it.base_price_max;
    const np = newPriceRange(it);
    const problem = discountProblem(it.base_price_min ?? it.base_price_max, it.discount_value, it.discount_unit);
    const editingBase = it.base_price_min == null || dr.editBase;
    return (
      <div className="space-y-1 text-xs" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 text-slate-500">
          <span className="w-12 flex-shrink-0">ราคาเต็ม</span>
          {editingBase && canManage ? (
            <MoneyInput value={dr.base ?? (it.base_price_min ?? "")} placeholder="ใส่ราคา"
              onChange={(v) => setDrafts((d) => ({ ...d, [it.id]: { ...d[it.id], base: v, editBase: true } }))}
              onBlur={(v) => commitBase(it, v)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="h-7 w-24 rounded border border-slate-200 px-1.5 text-right text-xs" />
          ) : (
            <button type="button" disabled={!canManage} title={range ? "แต่ละสีราคาไม่เท่ากัน — ส่วนลดคิดแยกตามราคาแต่ละสี · กดเพื่อใส่ราคาเดียว" : "กดเพื่อแก้ราคาเต็ม"}
              onClick={() => setDrafts((d) => ({ ...d, [it.id]: { ...d[it.id], editBase: true } }))}
              className="rounded px-1 text-slate-700 enabled:hover:bg-slate-100">
              {it.base_price_min == null ? "—" : range ? `${fmtBaht(it.base_price_min)}–${fmtBaht(it.base_price_max!)}` : fmtBaht(it.base_price_min)}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="w-12 flex-shrink-0 text-slate-500">ลด</span>
          <MoneyInput value={dr.discount ?? (it.discount_value ?? "")} disabled={!canManage} placeholder="0"
            onChange={(v) => setDrafts((d) => ({ ...d, [it.id]: { ...d[it.id], discount: v } }))}
            onBlur={(v) => commitDiscount(it, v)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className={`h-7 w-16 rounded border px-1.5 text-right text-xs ${problem ? "border-red-300 bg-red-50" : "border-slate-200"}`} />
          <span className="inline-flex overflow-hidden rounded border border-slate-200">
            {(["baht", "percent"] as DiscountUnit[]).map((u) => (
              <button key={u} type="button" disabled={!canManage || it.discount_unit === u}
                onClick={() => {
                  const p = discountProblem(it.base_price_min ?? it.base_price_max, it.discount_value, u);
                  if (p) { toast.error(`${it.code}: ${p} — แก้ตัวเลขส่วนลดก่อนสลับหน่วย`); return; }
                  void saveItem(it, { discount_unit: u });
                }}
                className={`h-7 px-1.5 text-xs ${it.discount_unit === u ? "bg-slate-800 text-white" : "bg-white text-slate-500 enabled:hover:bg-slate-50"}`}>{u === "baht" ? "฿" : "%"}</button>
            ))}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-12 flex-shrink-0 text-slate-500">ราคาใหม่</span>
          {problem ? <span className="text-red-600">{problem}</span>
            : np ? <span className="font-semibold text-slate-800">{np.from === np.to ? fmtBaht(np.from) : `${fmtBaht(np.from)}–${fmtBaht(np.to)}`} ฿</span>
            : <span className="text-slate-400">ใส่ราคาเต็มก่อน</span>}
        </div>
      </div>
    );
  };

  const columns: MiniColumn<WorkJobItem>[] = [
    { key: "img", header: "", width: "3.25rem", cell: (it) => <HoverImage url={r2ImageUrl(it.image_key, 96)} size={40} previewSize={320} rounded="rounded-lg" /> },
    {
      key: "model", header: "รุ่น", width: "minmax(10rem,1.3fr)", sortValue: (it) => it.code, sortLabel: "รหัสรุ่น",
      cell: (it) => (
        <div className="min-w-0 space-y-0.5">
          <Link href={`/master/parent-skus?open=${encodeURIComponent(it.parent_sku_id)}`} target="_blank" onClick={(e) => e.stopPropagation()}
            className="text-sm font-semibold text-slate-800 hover:text-blue-700 hover:underline">{it.code || "(ไม่มีรหัส)"}</Link>
          <div className="truncate text-xs text-slate-500" title={it.name}>{it.name}</div>
          {it.label_id && labelMap.get(it.label_id) && <LabelBadge label={labelMap.get(it.label_id)} />}
        </div>
      ),
    },
    ...(hasPrice ? [{ key: "price", header: "ราคา Clearance", width: "minmax(12rem,1.2fr)", cell: priceCell } as MiniColumn<WorkJobItem>] : []),
    { key: "steps", header: "ขั้นตอน", width: "minmax(14rem,2.2fr)", cell: stepCell },
    {
      key: "prog", header: "คืบหน้า", width: "6rem", align: "center",
      sortValue: (it) => itemProgress(it.step_done, steps).done, sortLabel: "ความคืบหน้า",
      cell: (it) => {
        const p = itemProgress(it.step_done, steps);
        return p.complete ? <span className="text-xs font-medium text-emerald-600">✓ เสร็จ</span> : <span className="text-xs text-slate-500">{p.done}/{p.total}</span>;
      },
    },
    ...(canManage ? [{
      key: "x", header: "", width: "2.5rem",
      cell: (it: WorkJobItem) => (
        <button type="button" title="เอารุ่นนี้ออกจากงาน" onClick={(e) => { e.stopPropagation(); setAsk({ kind: "remove", ids: [it.id] }); }}
          className="h-7 w-7 rounded text-slate-300 hover:bg-red-50 hover:text-red-500">✕</button>
      ),
    }] : []),
  ];

  const selIds = [...selected].filter((id) => items.some((it) => it.id === id));
  const stepOptions = steps.map((s) => ({ value: s.key, label: s.label }));

  // ── หน้าจอ ──
  if (!loaded) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div>;

  return (
    <div className="space-y-3">
      {/* ชิปงาน */}
      <div className="flex flex-wrap items-center gap-1.5">
        {jobs.map((j) => {
          const on = j.id === jobId;
          const ds = j.status === "open" ? dueState(j.due_date) : null;
          return (
            <button key={j.id} type="button" onClick={() => pickJob(j.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"} ${j.status !== "open" ? "opacity-70" : ""}`}>
              <span>{kindInfo(j.kind).icon}</span>
              <span className={j.status === "archived" ? "line-through" : ""}>{j.name}</span>
              <span className={on ? "text-slate-300" : "text-slate-400"}>{j.item_done ?? 0}/{j.item_count ?? 0}</span>
              {j.status === "done" && <span className={on ? "text-emerald-300" : "text-emerald-600"}>✓</span>}
              {ds === "overdue" && <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-red-300" : "bg-red-500"}`} title="เลยกำหนด" />}
            </button>
          );
        })}
        {canManage && (
          <button type="button" onClick={() => setModal({ job: null })}
            className="inline-flex items-center rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-slate-500">＋ สร้างงาน</button>
        )}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
          แสดงงานที่เก็บแล้ว
        </label>
      </div>

      {listErr && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{listErr} <button onClick={() => void reload()} className="ml-2 underline">ลองใหม่</button></div>}

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="mb-3 text-5xl">🛠️</div>
          <h2 className="text-lg font-semibold text-slate-800">สร้างงานแรก แล้วติดตามว่าแต่ละรุ่นทำถึงไหน</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">เช่น งาน Clearance (ใส่ส่วนลด + ทำรูป/แก้ Lazada/แก้ Shopee) หรือ งานลงเว็บไซต์ (ถ่ายรูป/เขียนรายละเอียด/ขึ้นเว็บ) · ใส่รุ่นได้จากโหมดการ์ด/ตาราง: ติ๊กรุ่น แล้วกด “ใส่ในงาน”</p>
          {canManage && <button type="button" onClick={() => setModal({ job: null })} className="mt-4 h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">＋ สร้างงาน</button>}
        </div>
      ) : loading && !detail ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      ) : err && !detail ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          {err} <button onClick={() => void loadDetail(jobId)} className="ml-2 underline">ลองใหม่</button>
        </div>
      ) : job ? (
        <>
          {/* หัวงาน */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-800">{kindInfo(job.kind).icon} {job.name}</h2>
                  {job.status === "done" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">ปิดงานแล้ว</span>}
                  {job.status === "archived" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">เก็บแล้ว</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{kindInfo(job.kind).label}</span>
                  <span>👤 {job.assignees?.length ? assigneeNames(job.assignees) : <span className="text-slate-400">ยังไม่มีผู้รับผิดชอบ</span>}</span>
                  {job.due_date ? (() => {
                    const ds = job.status === "open" ? dueState(job.due_date) : null;
                    return <span className={ds ? DUE_STYLE[ds] : ""}>📅 ครบกำหนด {shortThaiDate(job.due_date)}{ds && DUE_TEXT[ds] ? ` · ${DUE_TEXT[ds]}` : ""}</span>;
                  })() : <span className="text-slate-400">📅 ไม่มีกำหนดส่ง</span>}
                  {job.auto_label_id && labelMap.get(job.auto_label_id) && <span>ใส่รุ่นแล้วติดป้าย “{labelMap.get(job.auto_label_id)!.name}”</span>}
                </div>
                {job.note && <p className="mt-1.5 whitespace-pre-line text-xs text-slate-600">📝 {job.note}</p>}
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setModal({ job })} disabled={busy} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50">✏️ แก้ไขงาน</button>
                  {job.status === "open"
                    ? <button type="button" onClick={() => void patchJob({ status: "done" }, "ปิดงานแล้ว")} disabled={busy} className="h-8 rounded-lg border border-emerald-200 px-3 text-xs text-emerald-700 hover:bg-emerald-50">✓ ปิดงาน</button>
                    : <button type="button" onClick={() => void patchJob({ status: "open" }, "เปิดงานอีกครั้งแล้ว")} disabled={busy} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50">↺ เปิดงานอีกครั้ง</button>}
                  {job.status !== "archived" && <button type="button" onClick={() => void patchJob({ status: "archived" }, "เก็บงานแล้ว (ดูได้ที่ “แสดงงานที่เก็บแล้ว”)")} disabled={busy} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-500 hover:bg-slate-50">📦 เก็บ</button>}
                  <button type="button" onClick={() => setAsk({ kind: "delete" })} disabled={busy} className="h-8 rounded-lg border border-red-200 px-3 text-xs text-red-600 hover:bg-red-50">🗑 ลบงาน</button>
                </div>
              )}
            </div>
            {/* ความคืบหน้า */}
            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate-500">
                <span>รุ่นที่เสร็จ {prog.modelsDone}/{prog.models} · ขั้นตอน {prog.stepsDone}/{prog.stepsTotal}</span>
                <span className="font-medium text-slate-700">{prog.pct}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${prog.pct}%` }} />
              </div>
            </div>
          </div>

          {/* ตารางรุ่นในงาน */}
          <MiniTable<WorkJobItem>
            rows={rows}
            columns={columns}
            rowKey={(it) => it.id}
            searchText={(it) => `${it.code} ${it.name}`}
            searchPlaceholder="ค้นหารหัส / ชื่อรุ่นในงานนี้…"
            selectable={canManage}
            selected={selected}
            onSelectedChange={setSelected}
            countUnit="รุ่น"
            storageKey={`marketing-work:${hasPrice ? "price" : "plain"}`}
            resizable
            actions={
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                  <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
                  ซ่อนรุ่นที่เสร็จแล้ว
                </label>
                {canManage && <button type="button" onClick={() => setPickerOpen(true)} disabled={busy} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50">＋ เพิ่มรุ่น</button>}
              </div>
            }
            emptyText={
              <div className="py-10 text-center text-sm text-slate-500">
                {items.length === 0
                  ? <>ยังไม่มีรุ่นในงานนี้ — กด “＋ เพิ่มรุ่น” หรือไปโหมดการ์ด/ตาราง ติ๊กรุ่น แล้วกด “ใส่ในงาน”</>
                  : "ทุกรุ่นเสร็จแล้ว 🎉 (เอาติ๊ก “ซ่อนรุ่นที่เสร็จแล้ว” ออกเพื่อดูทั้งหมด)"}
              </div>
            }
          />
          {hasPrice && <p className="text-xs text-slate-400">ราคาใหม่เก็บในงานนี้เท่านั้น ไม่แก้ราคาในระบบ — แก้ราคาใน Lazada/Shopee แล้วติ๊กขั้นตอน · ราคาเต็ม = ราคาขายของสีที่ยังเปิดตอนใส่เข้างาน (กดที่ตัวเลขเพื่อแก้)</p>}
        </>
      ) : null}

      {/* แถบทำหลายรุ่นพร้อมกัน */}
      {canManage && job && (
        <BulkActionBar count={selIds.length} unit="รุ่น" onClear={() => setSelected(new Set())}>
          {stepOptions.length > 0 && (
            <>
              <div className="w-48 text-slate-800">
                <SearchableSelect value="__pick" options={[{ value: "__pick", label: "✓ ติ๊กขั้นตอน…" }, ...stepOptions]}
                  onChange={(v) => { if (v !== "__pick") void setStep(selIds, v, true); }} />
              </div>
              <div className="w-44 text-slate-800">
                <SearchableSelect value="__pick" options={[{ value: "__pick", label: "↺ เอาติ๊กออก…" }, ...stepOptions]}
                  onChange={(v) => { if (v !== "__pick") void setStep(selIds, v, false); }} />
              </div>
            </>
          )}
          <button type="button" onClick={() => setAsk({ kind: "remove", ids: selIds })}
            className="h-8 rounded-lg border border-red-300 bg-white px-3 text-xs text-red-600 hover:bg-red-50">เอาออกจากงาน</button>
        </BulkActionBar>
      )}

      <WorkJobModal open={!!modal} onClose={() => setModal(null)} job={modal?.job ?? null} labels={labels}
        onSaved={(saved, info) => {
          const isNew = !modal?.job;
          setModal(null);
          toast.success(isNew ? `สร้างงาน “${saved.name}” แล้ว` : "บันทึกงานแล้ว");
          if (info.labeled) onLabelsChanged();
          if (isNew) pickJob(saved.id); else void loadDetail(saved.id, true);
          void reload();
        }} />

      <MarketingSkuPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} title={`เพิ่มรุ่นเข้างาน “${job?.name ?? ""}”`}
        description="ติ๊กได้หลายรุ่น (จำข้ามแท็บ/ข้ามหน้า) แล้วกดใส่เข้างานทีเดียว · รุ่นที่อยู่ในงานแล้วติ๊กซ้ำไม่ได้"
        load={loadCatalog} takenIds={itemParentIds} startBrandId={jobBrandId}
        taken={{ badge: "อยู่ในงานแล้ว", short: "ในงาน", hide: "ซ่อนที่อยู่ในงานแล้ว", row: "✓ อยู่แล้ว" }}
        confirmText={(n) => (n ? `ใส่ ${n} รุ่นเข้างาน` : "ใส่เข้างาน")} busyText="กำลังใส่…"
        onConfirm={addModels} tabPrefKey="marketing_work_add_tab" colsPrefKey="marketing-work-add" showFullPageLink={false} />

      <ConfirmDialog open={!!ask} onClose={() => setAsk(null)} loading={busy} onConfirm={() => void confirmAsk()} variant="danger"
        requireTyped={ask?.kind === "delete" && items.length >= 20 ? "CONFIRM" : undefined}
        title={ask?.kind === "delete" ? `ลบงาน “${job?.name ?? ""}”?` : `เอา ${ask?.kind === "remove" ? ask.ids.length : 0} รุ่นออกจากงาน?`}
        message={ask?.kind === "delete"
          ? `รุ่นในงาน ${items.length} รุ่น ราคาที่ใส่ไว้ และที่ติ๊กไว้ทั้งหมดจะหายไป (ป้ายที่ติดให้รุ่นไปแล้วไม่เปลี่ยน · มีประวัติย้อนดูได้) — ถ้าแค่ทำเสร็จแล้ว ใช้ “ปิดงาน” หรือ “เก็บ” แทน`
          : "ราคาและที่ติ๊กไว้ของรุ่นนี้ในงานจะหายไป (ตัวสินค้าและป้ายไม่เปลี่ยน)"}
        confirmText={ask?.kind === "delete" ? "ลบงาน" : "เอาออก"} />
    </div>
  );
}
