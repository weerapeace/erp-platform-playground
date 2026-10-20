"use client";

/**
 * 🛠 โหมดทำงาน (มุมมองที่ 3 ของหน้า SKU การตลาด) — จัดงานเป็นชุด แล้วติ๊กว่าแต่ละรุ่นทำถึงไหน
 *   ชิปงานด้านบน (ความคืบหน้า + กำหนดส่ง) → เลือกงาน → ตารางรุ่นในงาน: ราคา Clearance (฿/%) + เช็กลิสต์ + ความคืบหน้า
 *   ราคาใหม่เก็บในงานเท่านั้น ไม่แก้ราคาใน ERP · ติ๊กหลายรุ่นพร้อมกันได้ (แถบลอยล่างจอ)
 *   มุมมอง ☰ ตาราง / ▦ การ์ด (จำรายคน) · กดรุ่น = เปิด drawer สินค้า (◀ ▶ ตามรายการ) · 🛍 = drawer ตั้งค่าเว็บไซต์
 *   ⊘ ที่ขั้นตอน = รุ่นนี้ไม่ต้องทำขั้นนี้ (ไม่นับในความคืบหน้า · กดที่ขั้นที่ข้ามเพื่อกลับมาต้องทำ)
 *   📋 ส่งเข้า Task Manager = การ์ดงาน Creative 1 ใบผูกกับงานนี้ (% + สถานะ ซิงก์ฝั่งเซิร์ฟเวอร์ — lib/marketing/work-jobs-db)
 *   📝 จดหมายเหตุ รายรุ่น/ทั้งงาน (ความคิดเห็นกลาง) + ⚠️ ติดปัญหา (ป้ายแดง · ตัวกรอง · นับในหัวงาน) — work-notes-modal.tsx
 * ของกลางที่ใช้: MiniTable · BulkActionBar · ERPModal/ConfirmDialog · MoneyInput · SearchableSelect · HoverImage · MarketingSkuPickerModal (เลือกรุ่นแบบการ์ด) · Toast
 * กฎคำนวณ: lib/marketing/work-jobs.ts (มีเทสต์)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useToast } from "@/components/toast";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ConfirmDialog } from "@/components/modal";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { SearchableSelect } from "@/components/searchable-select";
import { MoneyInput } from "@/components/money-input";
import { HoverImage } from "@/components/hover-image";
import { MarketingSkuPickerModal, type SkuPickerCatalog } from "@/components/marketing-sku-picker-modal";
import { ParentWebDrawer } from "@/components/parent-web-drawer";
import { Pager } from "@/components/pager";
import { useGalleryColumns, GalleryColumnsControl } from "@/components/gallery-columns";
import { useViewPref } from "@/lib/use-view-pref";
import { useCanHover } from "@/lib/use-can-hover";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import type { MarketingSkuLabel } from "@/lib/marketing/sku-list";
import {
  assigneeNames, discountProblem, dueState, fmtBaht, itemProgress, jobProgress, kindInfo, newPriceRange, shortThaiDate,
  type DiscountUnit, type WorkJob, type WorkJobItem,
} from "@/lib/marketing/work-jobs";
import { LabelBadge } from "./label-manager";
import { WorkJobModal } from "./work-job-modal";
import { WorkNotesModal, type WorkNotesTarget } from "./work-notes-modal";

// drawer สินค้าตัวจริง (ทุกแท็บ) — โหลดเมื่อเปิดครั้งแรก
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

const JOB_KEY = "marketing-skus:work-job";
const ITEM_VIEWS = ["table", "grid"] as const;
const GRID_PAGE = 60;
type GridSort = "order" | "code" | "prog_asc" | "prog_desc";
const GRID_SORTS: { value: GridSort; label: string }[] = [
  { value: "order", label: "เรียง: ลำดับเดิม" }, { value: "code", label: "เรียง: รหัสรุ่น" },
  { value: "prog_asc", label: "เรียง: คืบหน้าน้อย → มาก" }, { value: "prog_desc", label: "เรียง: คืบหน้ามาก → น้อย" },
];
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
  const [issueOnly, setIssueOnly] = useState(false);   // ⚠️ เฉพาะรุ่นที่ติดปัญหา
  const [notes, setNotes] = useState<WorkNotesTarget | null>(null);   // 📝 ป๊อปจดหมายเหตุ
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Drafts>({});
  const [modal, setModal] = useState<{ job: WorkJob | null } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ask, setAsk] = useState<{ kind: "delete" } | { kind: "remove"; ids: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  // มุมมองรุ่นในงาน (จำรายคน) · ค้นหาใช้ร่วมกันทั้ง 2 มุมมอง · drawer สินค้า / เว็บไซต์
  const { view: itemView, setView: setItemView, saveDefault: saveItemView } = useViewPref("marketing_work_items_view", ITEM_VIEWS, "table");
  const [q, setQ] = useState("");
  const [gridSort, setGridSort] = useState<GridSort>("order");
  const [gridPage, setGridPage] = useState(0);
  const { cols: gridCols, setCols: setGridCols } = useGalleryColumns("marketing-work-grid", 5);
  const [openParent, setOpenParent] = useState<string | null>(null);
  const [webParent, setWebParent] = useState<string | null>(null);
  const canHover = useCanHover();

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
  const issueCount = useMemo(() => items.filter((it) => it.issue_open).length, [items]);
  const rows = useMemo(() => items.filter((it) =>
    (!hideDone || !itemProgress(it.step_done, steps, it.step_skip).complete) && (!issueOnly || it.issue_open)), [items, steps, hideDone, issueOnly]);
  // รายการที่เห็นจริง (ค้นหา) — ใช้กับการ์ด + ◀ ▶ ของ drawer
  const term = q.trim().toLowerCase();
  const shown = useMemo(() => (term ? rows.filter((it) => `${it.code} ${it.name}`.toLowerCase().includes(term)) : rows), [rows, term]);
  const gridRows = useMemo(() => {
    if (gridSort === "order") return shown;
    const pr = (it: WorkJobItem) => { const p = itemProgress(it.step_done, steps, it.step_skip); return p.total ? p.done / p.total : 1; };
    const out = [...shown];
    if (gridSort === "code") out.sort((a, b) => a.code.localeCompare(b.code));
    else out.sort((a, b) => (gridSort === "prog_asc" ? pr(a) - pr(b) : pr(b) - pr(a)));
    return out;
  }, [shown, gridSort, steps]);
  useEffect(() => setGridPage(0), [term, gridSort, hideDone, issueOnly, jobId]);
  useEffect(() => { if (issueOnly && issueCount === 0) setIssueOnly(false); }, [issueOnly, issueCount]);   // แก้ครบแล้ว → กลับไปดูทั้งหมด
  const navIds = useMemo(() => (itemView === "grid" ? gridRows : shown).map((it) => it.parent_sku_id), [itemView, gridRows, shown]);
  const itemByParent = useMemo(() => new Map(items.map((it) => [it.parent_sku_id, it])), [items]);
  const webItem = webParent ? itemByParent.get(webParent) : undefined;

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
        if (done && it.step_skip?.[stepKey]) return it;   // ขั้นที่ไม่ต้องทำ ติ๊กไม่ได้
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

  // ⊘ ไม่ต้องทำขั้นนี้ / กลับมาต้องทำ (หลายรุ่นได้) — ตั้งไม่ต้องทำ = เอาติ๊กของขั้นนั้นออกด้วย
  const setSkip = async (itemIds: string[], stepKey: string, skip: boolean) => {
    if (!job || !itemIds.length) return;
    const now = new Date().toISOString();
    const ids = new Set(itemIds);
    const label = steps.find((s) => s.key === stepKey)?.label ?? "";
    setDetail((cur) => cur && {
      ...cur, items: cur.items.map((it) => {
        if (!ids.has(it.id)) return it;
        const sk = { ...(it.step_skip ?? {}) };
        const sd = { ...it.step_done };
        if (skip) { sk[stepKey] = sk[stepKey] ?? { at: now, by: null }; delete sd[stepKey]; } else delete sk[stepKey];
        return { ...it, step_skip: sk, step_done: sd };
      }),
    });
    try {
      const d = await call(`/api/marketing/work-jobs/${job.id}/items`, "PATCH", { item_ids: itemIds, step_key: stepKey, skip });
      const one = itemIds.length === 1 ? items.find((x) => x.id === itemIds[0])?.code : null;
      toast.success(skip
        ? `${one ?? `${Number(d.changed) || 0} รุ่น`}: ไม่ต้องทำ “${label}” แล้ว${one ? " · กดที่ขั้นตอนเพื่อกลับมาต้องทำ" : ""}`
        : `${one ?? `${Number(d.changed) || 0} รุ่น`}: กลับมาต้องทำ “${label}” แล้ว`);
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

  // 📋 ส่งเข้า Task Manager — สร้างการ์ดงานผูกกับงานนี้ (ผูกแล้วกดซ้ำ = คืนตัวเดิม)
  const sendToTaskManager = async () => {
    if (!job) return;
    setBusy(true);
    try {
      const d = await call(`/api/marketing/work-jobs/${job.id}/task`, "POST", {});
      toast.success(`ส่งเข้า Task Manager แล้ว${d.task_no ? ` (${d.task_no})` : ""} — ติ๊กที่นี่แล้ว % ที่การ์ดงานอัปเดตเอง`);
      await loadDetail(job.id, true); void reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ส่งเข้า Task Manager ไม่สำเร็จ"); }
    finally { setBusy(false); }
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
  // ชิปขั้นตอน: ☐ ยังไม่ทำ · ✓ ทำแล้ว · ⊘ ไม่ต้องทำ (เส้นประ ขีดฆ่า) — มุมขวาบนของชิปที่ยังไม่ทำ มีปุ่ม ⊘ (ชี้แล้วโผล่ · จอสัมผัสโชว์จาง ๆ)
  const stepCell = (it: WorkJobItem) => (
    <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
      {steps.map((s) => {
        const d = it.step_done[s.key];
        const sk = it.step_skip?.[s.key];
        if (sk) {
          return (
            <button key={s.key} type="button" disabled={!canManage}
              title={`ไม่ต้องทำสำหรับรุ่นนี้${sk.by ? ` (ตั้งโดย ${sk.by})` : ""}${canManage ? " · กดเพื่อกลับมาต้องทำ" : ""}`}
              onClick={() => void setSkip([it.id], s.key, false)}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-400 enabled:hover:border-slate-500 enabled:hover:text-slate-600 disabled:cursor-default">
              <span className="text-[11px] leading-none">⊘</span><span className="line-through">{s.label}</span>
            </button>
          );
        }
        const tip = d ? `ทำแล้ว${d.by ? ` โดย ${d.by}` : ""} · ${new Date(d.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}` : "ยังไม่ได้ทำ";
        return (
          <span key={s.key} className="group/step relative inline-flex">
            <button type="button" disabled={!canManage} title={tip} aria-pressed={!!d}
              onClick={() => void setStep([it.id], s.key, !d)}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition ${d ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500 enabled:hover:border-slate-400"} disabled:cursor-default`}>
              <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[9px] leading-none ${d ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>{d ? "✓" : ""}</span>
              {s.label}
            </button>
            {canManage && !d && (
              <button type="button" onClick={() => void setSkip([it.id], s.key, true)} title={`รุ่นนี้ไม่ต้องทำ “${s.label}”`} aria-label={`ไม่ต้องทำ ${s.label}`}
                className={`absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] leading-none text-slate-400 shadow-sm hover:border-slate-500 hover:text-slate-700 ${canHover ? "opacity-0 group-hover/step:opacity-100 focus:opacity-100" : "opacity-60"}`}>⊘</button>
            )}
          </span>
        );
      })}
    </div>
  );
  const progText = (it: WorkJobItem) => {
    const p = itemProgress(it.step_done, steps, it.step_skip);
    return p.complete
      ? <span className="text-xs font-medium text-emerald-600" title={p.skipped ? `ไม่ต้องทำ ${p.skipped} ขั้น` : undefined}>✓ เสร็จ</span>
      : <span className="text-xs text-slate-500" title={p.skipped ? `ไม่นับขั้นที่ไม่ต้องทำ ${p.skipped} ขั้น` : undefined}>{p.done}/{p.total}{p.skipped ? <span className="text-slate-300"> ·⊘{p.skipped}</span> : null}</span>;
  };
  const webBtn = (it: WorkJobItem, cls = "") => (
    <button type="button" title="ตั้งค่าเว็บไซต์ของรุ่นนี้ (ทุกร้าน)" onClick={(e) => { e.stopPropagation(); setWebParent(it.parent_sku_id); }}
      className={`h-7 w-7 rounded text-sm hover:bg-violet-50 ${cls}`}>🛍</button>
  );
  // 📝 จดหมายเหตุ (ตัวเลข = จำนวนข้อความ) · ⚠️ ป้ายติดปัญหา (กดเปิดจดหมายเหตุ)
  const noteBtn = (it: WorkJobItem) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); setNotes({ kind: "item", item: it }); }}
      title={it.note_count ? `จดหมายเหตุ ${it.note_count} ข้อความ` : "เขียนจดหมายเหตุ (เช่น ติดปัญหาอะไร)"}
      className={`inline-flex h-6 items-center gap-0.5 rounded-md border px-1.5 text-[11px] ${it.note_count ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-transparent text-slate-300 hover:border-slate-200 hover:text-slate-600"}`}>
      📝{it.note_count ? <span className="font-medium">{it.note_count}</span> : null}
    </button>
  );
  const issueChip = (it: WorkJobItem) => it.issue_open ? (
    <button type="button" onClick={(e) => { e.stopPropagation(); setNotes({ kind: "item", item: it }); }}
      title={`ติดปัญหา${it.issue_by ? ` · ตั้งโดย ${it.issue_by}` : ""} — กดดูจดหมายเหตุ`}
      className="inline-flex h-6 items-center rounded-md bg-red-600 px-1.5 text-[11px] font-medium text-white hover:bg-red-700">⚠️ ติดปัญหา</button>
  ) : null;
  const onIssueChanged = (itemId: string, patch: Pick<WorkJobItem, "issue_open" | "issue_at" | "issue_by">) => {
    setDetail((cur) => cur && { ...cur, items: cur.items.map((x) => (x.id === itemId ? { ...x, ...patch } : x)) });
    void reload();   // ชิปงาน: ตัวเลข ⚠️
  };

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
          <button type="button" onClick={(e) => { e.stopPropagation(); setOpenParent(it.parent_sku_id); }} title="เปิดข้อมูลสินค้า"
            className="text-left text-sm font-semibold text-slate-800 hover:text-blue-700 hover:underline">{it.code || "(ไม่มีรหัส)"}</button>
          <div className="truncate text-xs text-slate-500" title={it.name}>{it.name}</div>
          {it.label_id && labelMap.get(it.label_id) && <LabelBadge label={labelMap.get(it.label_id)} />}
          {issueChip(it)}
        </div>
      ),
    },
    ...(hasPrice ? [{ key: "price", header: "ราคา Clearance", width: "minmax(12rem,1.2fr)", cell: priceCell } as MiniColumn<WorkJobItem>] : []),
    { key: "steps", header: "ขั้นตอน", width: "minmax(14rem,2.2fr)", cell: stepCell },
    {
      key: "prog", header: "คืบหน้า", width: "6rem", align: "center",
      sortValue: (it) => { const p = itemProgress(it.step_done, steps, it.step_skip); return p.total ? p.done / p.total : 1; }, sortLabel: "ความคืบหน้า",
      cell: progText,
    },
    { key: "notes", header: "📝", width: "3.5rem", align: "center", sortValue: (it) => (it.issue_open ? 10_000 : 0) + it.note_count, sortLabel: "จดหมายเหตุ / ติดปัญหา", cell: (it) => noteBtn(it) },
    { key: "web", header: "", width: "2.5rem", cell: (it) => webBtn(it) },
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
              {!!j.issue_count && <span className={on ? "text-red-300" : "text-red-600"} title={`ติดปัญหา ${j.issue_count} รุ่น`}>⚠️{j.issue_count}</span>}
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
              {(
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setNotes({ kind: "job", job })} title="จดหมายเหตุของทั้งงาน (เช่น ติดรอรูป/ติดรอราคา)"
                    className={`h-8 rounded-lg border px-3 text-xs ${job.note_count ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>📝 จดหมายเหตุงาน{job.note_count ? ` (${job.note_count})` : ""}</button>
                  {job.creative_task_id ? (
                    <a href={`/tasks?task=${job.creative_task_id}`} title="เปิดการ์ดงานนี้ใน Task Manager (ความคืบหน้าซิงก์ให้อัตโนมัติ)"
                      className="inline-flex h-8 items-center rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs text-violet-700 hover:bg-violet-100">📋 {job.creative_task_no ?? "Task Manager"} ↗</a>
                  ) : canManage && (
                    <button type="button" onClick={() => void sendToTaskManager()} disabled={busy} title="สร้างการ์ดงานใน Task Manager ผูกกับงานนี้ — ผู้รับผิดชอบ/กำหนดส่งเดียวกัน · % ความคืบหน้าอัปเดตเอง"
                      className="h-8 rounded-lg border border-violet-200 px-3 text-xs text-violet-700 hover:bg-violet-50">📋 ส่งเข้า Task Manager</button>
                  )}
                  {canManage && <>
                  <button type="button" onClick={() => setModal({ job })} disabled={busy} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50">✏️ แก้ไขงาน</button>
                  {job.status === "open"
                    ? <button type="button" onClick={() => void patchJob({ status: "done" }, "ปิดงานแล้ว")} disabled={busy} className="h-8 rounded-lg border border-emerald-200 px-3 text-xs text-emerald-700 hover:bg-emerald-50">✓ ปิดงาน</button>
                    : <button type="button" onClick={() => void patchJob({ status: "open" }, "เปิดงานอีกครั้งแล้ว")} disabled={busy} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50">↺ เปิดงานอีกครั้ง</button>}
                  {job.status !== "archived" && <button type="button" onClick={() => void patchJob({ status: "archived" }, "เก็บงานแล้ว (ดูได้ที่ “แสดงงานที่เก็บแล้ว”)")} disabled={busy} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-500 hover:bg-slate-50">📦 เก็บ</button>}
                  <button type="button" onClick={() => setAsk({ kind: "delete" })} disabled={busy} className="h-8 rounded-lg border border-red-200 px-3 text-xs text-red-600 hover:bg-red-50">🗑 ลบงาน</button>
                  </>}
                </div>
              )}
            </div>
            {/* ความคืบหน้า */}
            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate-500">
                <span>
                  รุ่นที่เสร็จ {prog.modelsDone}/{prog.models} · ขั้นตอน {prog.stepsDone}/{prog.stepsTotal}
                  {issueCount > 0 && (
                    <button type="button" onClick={() => setIssueOnly(true)} title="ดูเฉพาะรุ่นที่ติดปัญหา"
                      className="ml-2 font-medium text-red-600 hover:underline">⚠️ ติดปัญหา {issueCount} รุ่น</button>
                  )}
                </span>
                <span className="font-medium text-slate-700">{prog.pct}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${prog.pct}%` }} />
              </div>
            </div>
          </div>

          {/* รุ่นในงาน: ☰ ตาราง / ▦ การ์ด (คำค้นใช้ร่วมกัน) */}
          {(() => {
            const emptyEl = (
              <div className="py-10 text-center text-sm text-slate-500">
                {items.length === 0
                  ? <>ยังไม่มีรุ่นในงานนี้ — กด “＋ เพิ่มรุ่น” หรือไปโหมดการ์ด/ตาราง ติ๊กรุ่น แล้วกด “ใส่ในงาน”</>
                  : rows.length === 0 ? (issueOnly ? "ไม่มีรุ่นที่ติดปัญหา 🎉" : "ทุกรุ่นเสร็จแล้ว 🎉 (เอาติ๊ก “ซ่อนรุ่นที่เสร็จแล้ว” ออกเพื่อดูทั้งหมด)") : "ไม่พบรุ่นที่ค้นหา"}
              </div>
            );
            const actionsEl = (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white" role="group" aria-label="มุมมอง">
                  {ITEM_VIEWS.map((v) => (
                    <button key={v} type="button" onClick={() => { setItemView(v); void saveItemView(v); }}
                      className={`h-8 px-2.5 text-xs ${itemView === v ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{v === "table" ? "☰ ตาราง" : "▦ การ์ด"}</button>
                  ))}
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                  <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
                  ซ่อนรุ่นที่เสร็จแล้ว
                </label>
                {(issueCount > 0 || issueOnly) && (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-red-600">
                    <input type="checkbox" checked={issueOnly} onChange={(e) => setIssueOnly(e.target.checked)} className="h-3.5 w-3.5 rounded border-red-300 accent-red-600" />
                    ⚠️ เฉพาะที่ติดปัญหา ({issueCount})
                  </label>
                )}
                {canManage && <button type="button" onClick={() => setPickerOpen(true)} disabled={busy} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50">＋ เพิ่มรุ่น</button>}
              </div>
            );
            if (itemView === "table") return (
              <MiniTable<WorkJobItem>
                rows={rows}
                columns={columns}
                rowKey={(it) => it.id}
                searchText={(it) => `${it.code} ${it.name}`}
                searchPlaceholder="ค้นหารหัส / ชื่อรุ่นในงานนี้…"
                searchValue={q}
                onSearchChange={setQ}
                selectable={canManage}
                selected={selected}
                onSelectedChange={setSelected}
                onRowClick={(it) => setOpenParent(it.parent_sku_id)}
                countUnit="รุ่น"
                storageKey={`marketing-work:${hasPrice ? "price" : "plain"}`}
                resizable
                actions={actionsEl}
                emptyText={emptyEl}
              />
            );
            // ▦ การ์ด
            const pageRows = gridRows.slice(gridPage * GRID_PAGE, (gridPage + 1) * GRID_PAGE);
            const pageAllOn = pageRows.length > 0 && pageRows.every((it) => selected.has(it.id));
            const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
            return (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ค้นหารหัส / ชื่อรุ่นในงานนี้…"
                    className="h-9 min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 sm:max-w-xs" />
                  <select value={gridSort} onChange={(e) => setGridSort(e.target.value as GridSort)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">
                    {GRID_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <GalleryColumnsControl as="select" cols={gridCols} onChange={setGridCols} />
                  {canManage && pageRows.length > 0 && (
                    <button type="button" className="text-xs text-blue-600 hover:underline"
                      onClick={() => setSelected((s) => { const n = new Set(s); for (const it of pageRows) { if (pageAllOn) n.delete(it.id); else n.add(it.id); } return n; })}>
                      {pageAllOn ? "เอาติ๊กหน้านี้ออก" : `ติ๊กทั้งหน้านี้ (${pageRows.length})`}
                    </button>
                  )}
                  <span className="text-xs text-slate-400">{gridRows.length.toLocaleString("th-TH")} รุ่น</span>
                  <div className="ml-auto">{actionsEl}</div>
                </div>
                {gridRows.length === 0 ? emptyEl : (
                  <div className="grid grid-cols-2 gap-2.5 sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ ["--cols" as string]: gridCols } as React.CSSProperties}>
                    {pageRows.map((it) => {
                      const on = selected.has(it.id);
                      const p = itemProgress(it.step_done, steps, it.step_skip);
                      const img = r2ImageUrl(it.image_key, 300);
                      return (
                        <div key={it.id} className={`flex flex-col overflow-hidden rounded-xl border bg-white ${on ? "border-blue-500 ring-2 ring-blue-200" : it.issue_open ? "border-red-300 ring-1 ring-red-200" : p.complete ? "border-emerald-200" : "border-slate-200"}`}>
                          <div className="relative aspect-square cursor-pointer bg-slate-100" onClick={() => setOpenParent(it.parent_sku_id)} title="เปิดข้อมูลสินค้า">
                            {img && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
                            )}
                            {canManage && (
                              <input type="checkbox" checked={on} onClick={(e) => e.stopPropagation()} onChange={() => toggleSel(it.id)} aria-label={`เลือก ${it.code}`}
                                className="absolute left-2 top-2 h-4 w-4 accent-blue-600" />
                            )}
                            <span className="absolute right-1.5 top-1.5 rounded-full bg-white/95 shadow-sm">{webBtn(it)}</span>
                            {p.complete && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white">✓ เสร็จ</span>}
                          </div>
                          <div className="flex flex-1 flex-col gap-1 p-2">
                            <div className="flex items-center justify-between gap-1">
                              <button type="button" onClick={() => setOpenParent(it.parent_sku_id)} title="เปิดข้อมูลสินค้า"
                                className="truncate text-left font-mono text-xs font-semibold text-slate-800 hover:text-blue-700 hover:underline">{it.code || "(ไม่มีรหัส)"}</button>
                              {progText(it)}
                            </div>
                            <p className="truncate text-[11px] text-slate-500" title={it.name}>{it.name}</p>
                            <div className="flex flex-wrap items-center gap-1">
                              {it.label_id && labelMap.get(it.label_id) && <LabelBadge label={labelMap.get(it.label_id)} />}
                              {issueChip(it)}
                              <span className="ml-auto">{noteBtn(it)}</span>
                            </div>
                            <div className="pt-0.5">{stepCell(it)}</div>
                            {hasPrice && <div className="mt-1 border-t border-slate-100 pt-1.5">{priceCell(it)}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {gridRows.length > GRID_PAGE && <Pager page={gridPage} pageSize={GRID_PAGE} total={gridRows.length} onPage={setGridPage} unitLabel="รุ่น" />}
              </div>
            );
          })()}
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
              <div className="w-44 text-slate-800">
                <SearchableSelect value="__pick" options={[{ value: "__pick", label: "⊘ ไม่ต้องทำ…" }, ...stepOptions]}
                  onChange={(v) => { if (v !== "__pick") void setSkip(selIds, v, true); }} />
              </div>
              <div className="w-44 text-slate-800">
                <SearchableSelect value="__pick" options={[{ value: "__pick", label: "↺ กลับมาต้องทำ…" }, ...stepOptions]}
                  onChange={(v) => { if (v !== "__pick") void setSkip(selIds, v, false); }} />
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

      {/* 📦 drawer สินค้าตัวจริง (ทุกแท็บ) · ◀ ▶ ตามรายการที่เห็น · ปิด/แก้แล้วโหลดงานใหม่ (รหัส/ชื่อ/รูปอาจเปลี่ยน) */}
      {openParent && (
        <MasterRecordDrawer moduleKey="parent-skus-v2" apiPath="parent-skus" recordId={openParent} navIds={navIds}
          onClose={() => { setOpenParent(null); if (job) void loadDetail(job.id, true); }}
          onChanged={() => { if (job) void loadDetail(job.id, true); }} />
      )}
      {/* 🛍 ตั้งค่าเว็บไซต์ของรุ่น (ทุกร้าน — ตัวเดียวกับแท็บ 🛍 ใน Parent SKU) · เปิด Parent SKU ทับได้ */}
      <ParentWebDrawer parentId={webParent} hidden={!!openParent}
        code={webItem?.code} name={webItem?.name} imageUrl={webItem ? r2ImageUrl(webItem.image_key, 160) : null}
        navIds={navIds} onNavigate={setWebParent} onClose={() => setWebParent(null)}
        onOpenParent={(pid) => setOpenParent(pid)} />

      {/* 📝 จดหมายเหตุ — ปิดแล้วโหลดตัวเลขใหม่ */}
      {job && (
        <WorkNotesModal target={notes} jobId={job.id} canManage={canManage} onIssueChanged={onIssueChanged}
          onClose={() => { setNotes(null); void loadDetail(job.id, true); }} />
      )}

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
