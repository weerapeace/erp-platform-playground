"use client";
/**
 * เนื้อหาแท็บของสินค้าบน Lazada ในลิ้นชักสินค้าบนร้าน (listing-drawer)
 *
 *   const laz  = useLazadaListing(isLazada ? listingId : null);       // ดึงสดจาก Lazada ตอนเปิด
 *   const edit = useLazadaEdit(laz, canEdit, onSaved);                  // เฟส 2: แก้ชื่อ/รายละเอียด/จุดเด่น → บันทึกขึ้น Lazada
 *   const disp = useLazadaDisplay(laz, onDone);                         // เฟส 2: เปิด/ปิดขาย ทั้งสินค้า/ทีละตัวเลือก
 *   <LazadaInfoPanel state={laz} edit={edit} />  <LazadaImagesPanel …/>  <LazadaOptionsPanel state={laz} disp={canEdit ? disp : null} />
 *   footer = <LazadaEditFooter edit={edit} /> · {edit.dialog}{disp.dialog}
 *
 * ลิ้นชัก/หัว/แท็บจับคู่/ประวัติ = ของเดิมที่ใช้ร่วมกับ LINE · ไฟล์นี้มีแค่ส่วนที่ Lazada ต่างจาก LINE
 * ข้อมูล: GET /api/lazada/listing-detail (ดึงสด ไม่บันทึก) · ปุ่ม "ดึงตัวนี้จาก Lazada" = POST (อัปเดตสำเนาย่อในระบบด้วย)
 * ส่งขึ้นร้านจริง (ถามก่อนเสมอ · มีประวัติ): POST /api/lazada/listing-edit · /api/lazada/listing-display
 * กฎ: lib/lazada-listing-edit (pure + เทสต์ — หน้าเว็บกับ API ใช้ตัวเดียวกัน) · แผนเฟส + กติกา Lazada: docs/lazada-connector.md
 * ของกลางที่ใช้: MiniTable · ConfirmDialog · ToggleSwitch · RichTextEditor · state-views · Icon · sanitizeRichHtml
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import {
  lazadaEditStateFromView, lazStatusBadge, planLazadaDisplay, planLazadaEdit, LAZADA_NAME_MAX, MAX_LAZADA_IMAGES,
  type LazadaEditPlan, type LazadaEditState, type LazadaListingDetailResponse, type LazadaListingView, type LazadaSkuView, type LazadaWriteResponse,
} from "@/lib/lazada-listing-edit";

// กล่องข้อความจัดรูปแบบหนัก (tiptap) — โหลดเมื่อกด "แก้รายละเอียด" เท่านั้น
const RichTextEditor = dynamic(() => import("@/components/rich-text").then((m) => m.RichTextEditor), { ssr: false, loading: () => <div className="h-40 rounded-lg bg-slate-50" /> });

export type LazadaListingState = {
  listingId: string | null;
  view: LazadaListingView | null;
  error: string | null;
  loading: boolean;
  /** เวลาที่ดึงจาก Lazada ล่าสุด */
  fetchedAt: string | null;
  /** โหลดใหม่ (ดึงสด ไม่บันทึก) */
  reload: () => void;
  /** ดึงตัวนี้จาก Lazada + อัปเดตสำเนาในระบบ */
  refresh: () => Promise<void>;
  refreshing: boolean;
  /** ใช้ข้อมูลล่าสุดที่ API ส่งกลับ (หลังส่งขึ้นร้าน) */
  apply: (view: LazadaListingView) => void;
};

/** ดึงสินค้าตัวนี้สดจาก Lazada เมื่อเปิดลิ้นชัก (listingId = null → ไม่ทำอะไร) */
export function useLazadaListing(listingId: string | null, onSaved?: () => void): LazadaListingState {
  const toast = useToast();
  const [view, setView] = useState<LazadaListingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (!listingId) { lastId.current = null; setView(null); setError(null); setFetchedAt(null); return; }
    const my = ++seq.current;
    // สลับไปรายการอื่น = ล้างของเดิมทันที (กันโชว์ข้อมูลตัวก่อน) · โหลดซ้ำตัวเดิม = คงไว้ระหว่างรอ
    if (lastId.current !== listingId) { lastId.current = listingId; setView(null); setFetchedAt(null); }
    setLoading(true); setError(null);
    apiFetch(`/api/lazada/listing-detail?listing_id=${encodeURIComponent(listingId)}`)
      .then((r) => r.json().catch(() => ({ view: null, fetched_at: null, error: `HTTP ${r.status}` })) as Promise<LazadaListingDetailResponse>)
      .then((j) => {
        if (my !== seq.current) return;   // สลับรายการระหว่างรอ = ทิ้งคำตอบเก่า
        if (j.error || !j.view) { setError(j.error ?? "ดึงข้อมูลจาก Lazada ไม่สำเร็จ"); setView(null); return; }
        setView(j.view); setFetchedAt(j.fetched_at);
      })
      .catch(() => { if (my === seq.current) setError("ดึงข้อมูลจาก Lazada ไม่สำเร็จ — ลองใหม่อีกครั้ง"); })
      .finally(() => { if (my === seq.current) setLoading(false); });
  }, [listingId, n]);

  const refresh = useCallback(async () => {
    if (!listingId) return;
    setRefreshing(true);
    const my = ++seq.current;
    try {
      const r = await apiFetch("/api/lazada/listing-detail", { method: "POST", body: JSON.stringify({ listing_id: listingId }) });
      const j = await r.json().catch(() => ({ view: null, fetched_at: null, error: `HTTP ${r.status}` })) as LazadaListingDetailResponse;
      if (my !== seq.current) return;
      if (j.view) { setView(j.view); setFetchedAt(j.fetched_at); setError(null); }
      if (j.error) toast.error(r.status === 401 ? "ระบบยังไม่ยืนยันการล็อกอิน/สิทธิ์ — รอสักครู่แล้วกดใหม่ (ถ้ายังไม่ได้ ลองรีเฟรชหน้า)" : j.error);
      else { toast.success("ดึงข้อมูลจาก Lazada แล้ว — อัปเดตในระบบแล้ว"); onSaved?.(); }
    } catch (e) { toast.error((e as Error).message); }
    finally { setRefreshing(false); }
  }, [listingId, onSaved, toast]);

  const apply = useCallback((v: LazadaListingView) => { ++seq.current; setView(v); setFetchedAt(new Date().toISOString()); setError(null); setLoading(false); }, []);
  return { listingId, view, error, loading, fetchedAt, reload: () => setN((x) => x + 1), refresh, refreshing, apply };
}

// ───────────────────────── เฟส 2: แก้ชื่อ / รายละเอียด / จุดเด่น ─────────────────────────
export type LazadaEditApi = {
  canEdit: boolean;
  form: LazadaEditState | null;
  base: LazadaEditState | null;
  setField: <K extends keyof LazadaEditState>(k: K, v: LazadaEditState[K]) => void;
  plan: LazadaEditPlan | null;
  dirty: boolean;
  descEdit: boolean;
  setDescEdit: (v: boolean) => void;
  reset: () => void;
  ask: () => void;
  saving: boolean;
  dialog: ReactNode;
};

export function useLazadaEdit(state: LazadaListingState, canEdit: boolean, onSaved?: (name: string) => void): LazadaEditApi {
  const toast = useToast();
  const base = useMemo(() => (state.view ? lazadaEditStateFromView(state.view) : null), [state.view]);
  const [form, setForm] = useState<LazadaEditState | null>(null);
  const [descEdit, setDescEdit] = useState(false);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  // ข้อมูลจากร้านเปลี่ยน (เปิดตัวใหม่ / ดึงใหม่ / ส่งสำเร็จ) → ฟอร์มเริ่มจากของล่าสุด
  useEffect(() => { setForm(base ? { ...base } : null); setDescEdit(false); }, [base]);
  const plan = useMemo(() => (base && form ? planLazadaEdit(base, form) : null), [base, form]);
  const dirty = !!plan && plan.changes.length > 0;

  const save = async () => {
    if (!state.listingId || !base || !form) return;
    setSaving(true);
    try {
      const r = await apiFetch("/api/lazada/listing-edit", { method: "POST", body: JSON.stringify({ listing_id: state.listingId, before: base, edit: form }) });
      const j = await r.json().catch(() => ({ ok: false, view: null, error: `HTTP ${r.status}` })) as LazadaWriteResponse;
      if (j.ok) {
        toast.success(j.qc ? "ส่งขึ้น Lazada แล้ว — Lazada ส่งไปรอตรวจ (ไม่เกิน 24 ชม.)" : "ส่งขึ้น Lazada แล้ว — บันทึกประวัติแล้ว");
        (j.warnings ?? []).filter((w) => !w.includes("รอตรวจ")).forEach((w) => toast.warning(w));
        setAsking(false);
        if (j.view) state.apply(j.view);
        onSaved?.(form.name);
      } else {
        toast.error(r.status === 401 ? "ไม่มีสิทธิ์ส่งขึ้นร้าน หรือระบบยังไม่ยืนยันการล็อกอิน — รอสักครู่แล้วลองใหม่" : (j.error ?? `HTTP ${r.status}`));
        if (r.status === 409 && j.view) { setAsking(false); state.apply(j.view); }   // ร้านเปลี่ยน → โหลดของล่าสุดให้ (ฟอร์มเริ่มใหม่)
      }
    } catch (e) { toast.error(`ส่งขึ้น Lazada ไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setSaving(false); }
  };

  const dialog = (
    <ConfirmDialog open={asking && !!plan} onClose={() => { if (!saving) setAsking(false); }} onConfirm={() => void save()} loading={saving}
      title={`ส่งการแก้ไข ${plan?.changes.length ?? 0} ช่องขึ้นร้าน Lazada?`} confirmText="ส่งขึ้น Lazada"
      message={plan ? (
        <div className="space-y-2 text-sm">
          <p>ระบบจะแก้สินค้าบนร้าน Lazada จริงตามนี้ (ส่งเฉพาะที่เปลี่ยน · สถานะเปิด/ปิดของทุกตัวเลือกคงเดิม) · มีประวัติว่าใครแก้อะไร</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
            {plan.changes.map((c, i) => (
              <li key={i}><span className="font-medium text-slate-700">{c.label}:</span> <span className="text-slate-400 line-through">{c.before}</span> → <span className="text-slate-800">{c.after}</span></li>
            ))}
          </ul>
          {plan.warnings.map((w, i) => <p key={i} className="flex items-start gap-1 text-xs text-amber-700"><Icon name="warning" className="mt-0.5 shrink-0" />{w}</p>)}
        </div>
      ) : ""} />
  );
  return {
    canEdit, form, base, plan, dirty, descEdit, setDescEdit, saving, dialog,
    setField: (k, v) => setForm((f) => (f ? { ...f, [k]: v } : f)),
    reset: () => { if (base) setForm({ ...base }); setDescEdit(false); },
    ask: () => setAsking(true),
  };
}

/** แถบท้ายลิ้นชัก (Lazada) — สถานะการแก้ + ยกเลิก + บันทึกขึ้น Lazada */
export function LazadaEditFooter({ edit, state }: { edit: LazadaEditApi; state: LazadaListingState }) {
  if (!edit.canEdit) return <span className="text-xs text-slate-400">Lazada: ดูอย่างเดียว — ไม่มีสิทธิ์ส่งขึ้นร้าน</span>;
  if (!state.view || !edit.plan) return <span className="text-xs text-slate-400">กำลังดึงข้อมูลจาก Lazada…</span>;
  const p = edit.plan;
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 text-xs text-slate-500">
        {p.errors.length ? <span className="text-rose-600">{p.errors[0]}</span> : edit.dirty ? `แก้แล้ว ${p.changes.length.toLocaleString()} ช่อง — ยังไม่ได้ส่งขึ้น Lazada` : "ยังไม่ได้แก้อะไร"}
      </span>
      {edit.dirty && <button type="button" onClick={edit.reset} disabled={edit.saving} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">ยกเลิกที่แก้</button>}
      <button type="button" disabled={!edit.dirty || p.errors.length > 0 || edit.saving} onClick={edit.ask}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm text-white hover:bg-emerald-700 disabled:opacity-40"><Icon name="upload" />บันทึกขึ้น Lazada</button>
    </div>
  );
}

// ───────────────────────── เฟส 2: เปิด / ปิดขาย ─────────────────────────
export type LazadaDisplayApi = { request: (open: boolean, sku?: LazadaSkuView) => void; busy: boolean; dialog: ReactNode };

export function useLazadaDisplay(state: LazadaListingState, onDone?: () => void): LazadaDisplayApi {
  const toast = useToast();
  const [ask, setAsk] = useState<{ open: boolean; sku?: LazadaSkuView } | null>(null);
  const [busy, setBusy] = useState(false);
  const plan = useMemo(() => (ask && state.view ? planLazadaDisplay(state.view, { open: ask.open, skuIds: ask.sku ? [ask.sku.skuId] : [] }) : null), [ask, state.view]);

  const run = async () => {
    if (!ask || !state.listingId) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/lazada/listing-display", { method: "POST", body: JSON.stringify({ listing_id: state.listingId, open: ask.open, ...(ask.sku ? { sku_ids: [ask.sku.skuId] } : {}) }) });
      const j = await r.json().catch(() => ({ ok: false, view: null, error: `HTTP ${r.status}` })) as LazadaWriteResponse;
      if (j.ok) {
        toast.success(`${j.summary ?? (ask.open ? "เปิดขาย" : "ปิดขาย")} บน Lazada แล้ว`);
        (j.warnings ?? []).forEach((w) => toast.warning(w));
        setAsk(null);
        if (j.view) state.apply(j.view);
        onDone?.();
      } else toast.error(r.status === 401 ? "ไม่มีสิทธิ์ส่งขึ้นร้าน หรือระบบยังไม่ยืนยันการล็อกอิน — รอสักครู่แล้วลองใหม่" : (j.error ?? `HTTP ${r.status}`));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const verb = ask?.open ? "เปิดขาย" : "ปิดขาย";
  const dialog = (
    <ConfirmDialog open={!!ask} onClose={() => { if (!busy) setAsk(null); }} onConfirm={() => void run()} loading={busy}
      title={`${verb}${ask?.sku ? ` “${ask.sku.label}”` : "ทั้งสินค้า"} บน Lazada?`}
      confirmText={plan && plan.api === "none" ? "ปิดหน้าต่าง" : verb}
      variant={ask && !ask.open ? "danger" : undefined}
      message={plan ? (
        <div className="space-y-2 text-sm">
          {plan.errors.length ? <p className="text-rose-600">{plan.errors[0]}</p>
            : plan.api === "none" ? <p>{plan.summary} — ไม่มีอะไรต้องส่ง</p>
            : <p>{ask?.open ? "ลูกค้าจะเห็นและสั่งซื้อได้ทันที (ถ้ามีสต๊อก)" : "ลูกค้าจะมองไม่เห็นและสั่งซื้อไม่ได้ทันที"} — {plan.summary} · ส่งขึ้นร้าน Lazada จริง · มีประวัติว่าใครกด</p>}
          {plan.api !== "none" && plan.targets.length > 0 && (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
              {plan.targets.slice(0, 12).map((s) => <li key={s.skuId} className="truncate">{s.label} <span className="font-mono text-slate-400">{s.sellerSku ?? ""}</span></li>)}
              {plan.targets.length > 12 && <li className="text-slate-400">… และอีก {(plan.targets.length - 12).toLocaleString()} ตัวเลือก</li>}
            </ul>
          )}
        </div>
      ) : ""} />
  );
  return { request: (open, sku) => setAsk({ open, sku }), busy, dialog };
}

const baht = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`);
const thTime = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }); };
const TONE_CLS: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700", off: "bg-slate-100 text-slate-600", wait: "bg-amber-50 text-amber-700", bad: "bg-rose-50 text-rose-700", none: "bg-slate-100 text-slate-500",
};

/** ป้ายสถานะ + สวิตช์เปิด/ปิดขายทั้งสินค้า + ปุ่มดึงตัวนี้ (หัวลิ้นชัก) */
export function LazadaHeaderStatus({ state, disp, dirty }: { state: LazadaListingState; disp: LazadaDisplayApi | null; dirty?: boolean }) {
  const v = state.view;
  const b = v ? lazStatusBadge(v.status) : null;
  const anyOpen = !!v && v.skus.some((s) => s.status !== "inactive");
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {b && <span className={`rounded-full px-2 py-0.5 text-[11px] ${TONE_CLS[b.tone]}`}>{b.label}</span>}
        {v && disp && (
          <ToggleSwitch on={anyOpen} disabled={disp.busy} size="sm" label={<span className="text-xs text-slate-600">{anyOpen ? "เปิดขาย" : "ปิดขาย"}</span>}
            title="เปิด/ปิดขายทั้งสินค้าบน Lazada (ถามก่อน) — ทีละตัวเลือกได้ที่แท็บตัวเลือก & ราคา"
            onChange={(on) => disp.request(on)} />
        )}
      </div>
      <button type="button" disabled={state.refreshing || state.loading || !!dirty} onClick={() => void state.refresh()}
        title={dirty ? "มีที่แก้ค้างอยู่ — บันทึกหรือยกเลิกก่อน" : "ดึงข้อมูลสินค้าตัวนี้จาก Lazada ใหม่ และอัปเดตในระบบ (ไม่แก้อะไรบนร้าน)"}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
        <Icon name="refresh" />{state.refreshing ? "กำลังดึง..." : "ดึงตัวนี้จาก Lazada"}
      </button>
      {state.fetchedAt && <span className="text-[10px] text-slate-400">ข้อมูลสดจาก Lazada {thTime(state.fetchedAt)}</span>}
    </div>
  );
}

/** โหลด / พัง → ข้อความเดียวกันทุกแท็บ · null = มีข้อมูลแล้ว */
function gate(state: LazadaListingState) {
  if (state.loading && !state.view) return <LoadingState label="กำลังดึงข้อมูลจาก Lazada…" />;
  if (state.error && !state.view) return <ErrorState title={state.error} onRetry={state.reload} />;
  if (!state.view) return <LoadingState label="กำลังดึงข้อมูลจาก Lazada…" />;
  return null;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <div className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{children}</div>
      {hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}
    </div>
  );
}

/** แท็บข้อมูลสินค้า — แก้ชื่อ/จุดเด่น/รายละเอียดได้เมื่อมีสิทธิ์ (edit.canEdit) */
export function LazadaInfoPanel({ state, edit }: { state: LazadaListingState; edit: LazadaEditApi }) {
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const f = edit.form;
  const can = edit.canEdit && !!f;
  const desc = sanitizeRichHtml(f?.description ?? v.description);
  const nameLen = (f?.name ?? v.name).length;
  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-start gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <Icon name="info" className="mt-0.5 shrink-0" />
        {can ? "ข้อมูลสดจากร้าน Lazada · แก้แล้วกด “บันทึกขึ้น Lazada” ด้านล่าง (โชว์ก่อน → หลัง ให้ยืนยัน) · ราคา/รูป จะเปิดให้แก้ในเฟสถัดไป" : "ดูอย่างเดียว — ข้อมูลสดจากร้าน Lazada"}
      </p>
      {v.rejectReasons.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <div className="mb-0.5 font-medium">เหตุผลจาก Lazada</div>
          <ul className="list-disc space-y-0.5 pl-4">{v.rejectReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {can ? (
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">ชื่อสินค้าบน Lazada</span>
          <input value={f.name} onChange={(e) => edit.setField("name", e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          <span className={`mt-0.5 block text-[11px] ${nameLen > LAZADA_NAME_MAX ? "text-rose-600" : "text-slate-400"}`}>{nameLen.toLocaleString()} / {LAZADA_NAME_MAX} ตัวอักษร</span>
        </label>
      ) : <Field label="ชื่อสินค้าบน Lazada" hint={`${nameLen.toLocaleString()} / ${LAZADA_NAME_MAX} ตัวอักษร`}>{v.name || <span className="text-slate-400">(ไม่มีชื่อ)</span>}</Field>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="แบรนด์" hint="Lazada ให้เลือกจากรายชื่อแบรนด์ของเขาเท่านั้น (แก้ไม่ได้จากที่นี่)">{v.brand ?? "—"}</Field>
        <Field label="หมวดบน Lazada" hint="เปลี่ยนหมวด = ต้องกรอกคุณสมบัติใหม่ทั้งชุด (แก้ไม่ได้จากที่นี่)"><span className="font-mono text-slate-500">{v.categoryId ?? "—"}</span></Field>
      </div>
      <div>
        <span className="mb-1 block text-xs text-slate-500">จุดเด่นสินค้า (หัวข้อย่อย · มีเฉพาะ Lazada)</span>
        {can ? (
          <>
            <textarea value={f.highlights} onChange={(e) => edit.setField("highlights", e.target.value)} rows={Math.min(8, Math.max(3, f.highlights.split("\n").length + 1))}
              placeholder={"บรรทัดละ 1 ข้อ เช่น\nหนังแท้ 100%\nยาว 120 ซม."} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <span className="mt-0.5 block text-[11px] text-slate-400">บรรทัดละ 1 ข้อ · ข้อความล้วน (Lazada ตัดรูป/ลิงก์ทิ้ง)</span>
          </>
        ) : v.shortDescription.replace(/<[^>]+>/g, "").trim()
          ? <div className="tiptap-content rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(v.shortDescription) }} />
          : <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">(ไม่มีจุดเด่นสินค้า)</p>}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-slate-500">รายละเอียดสินค้า</span>
          {can && !edit.descEdit && <button type="button" onClick={() => edit.setDescEdit(true)} className="inline-flex items-center gap-1 text-xs text-violet-700 hover:underline"><Icon name="edit" />แก้รายละเอียด</button>}
        </div>
        {can && edit.descEdit
          ? (
            <>
              <RichTextEditor value={f.description} onChange={(html) => edit.setField("description", html)} minHeight={220} />
              <span className="mt-0.5 block text-[11px] text-slate-400">รูปในรายละเอียดต้องเป็นรูปที่อยู่บน Lazada แล้ว (เพิ่มรูปใหม่ได้ในเฟสรูป) · ไม่เกิน 25,000 ตัวอักษร</span>
            </>
          )
          : <div className="tiptap-content max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm [&_img]:max-w-full [&_img]:rounded"
              dangerouslySetInnerHTML={{ __html: desc || "<p class=\"text-slate-400\">(ไม่มีรายละเอียด)</p>" }} />}
      </div>
    </div>
  );
}

/** แท็บรูป (ดูอย่างเดียว — แก้รูป = เฟส 4) */
export function LazadaImagesPanel({ state, onOpen }: { state: LazadaListingState; onOpen: (index: number) => void }) {
  const g = gate(state); if (g) return g;
  const v = state.view!;
  return (
    <div className="space-y-2">
      {v.images.length === 0
        ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">สินค้านี้ยังไม่มีรูปบน Lazada</p>
        : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {v.images.map((url, i) => (
              <button key={`${url}-${i}`} type="button" onClick={() => onOpen(i)} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 text-[10px] text-violet-700">ปก</span>}
              </button>
            ))}
          </div>
        )}
      <p className="text-[11px] text-slate-400">รูปสินค้า {v.images.length}/{MAX_LAZADA_IMAGES} · รูปแรก = ปก · ดูอย่างเดียว (แก้รูปจะเปิดให้ในเฟสรูป · Lazada รับ jpg/png ไม่เกิน 3MB ด้านละ 330–5000px)</p>
    </div>
  );
}

/** แท็บตัวเลือก & ราคา — ราคาดูอย่างเดียว (เฟส 3) · เปิด/ปิดขายทีละตัวเลือกได้เมื่อมีสิทธิ์ (disp) */
export function LazadaOptionsPanel({ state, disp }: { state: LazadaListingState; disp: LazadaDisplayApi | null }) {
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const cols: MiniColumn<LazadaSkuView>[] = [
    {
      key: "opt", header: "ตัวเลือก", width: "1.6fr",
      cell: (s) => (
        <div className="flex min-w-0 items-center gap-2">
          {s.images[0] ? <img src={s.images[0]} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded object-cover" /> : null}
          <div className="min-w-0">
            <div className="truncate" title={s.label}>{s.label}</div>
            <div className="truncate font-mono text-[11px] text-slate-400">{s.sellerSku ?? "ไม่มีรหัส"}</div>
          </div>
        </div>
      ),
    },
    { key: "price", header: "ราคาปกติ", width: "5.5rem", align: "right", cell: (s) => <span>{baht(s.price)}</span> },
    {
      key: "sp", header: "ราคาลด", width: "7rem", align: "right",
      cell: (s) => s.specialPrice == null ? <span className="text-slate-300">—</span> : (
        <span className="leading-tight">
          <span className="block text-rose-600">{baht(s.specialPrice)}{s.price ? <span className="ml-1 text-[11px]">-{Math.round((1 - s.specialPrice / s.price) * 100)}%</span> : null}</span>
          {(s.specialFrom || s.specialTo) && <span className="block text-[10px] text-slate-400" title={`${s.specialFrom ?? "?"} ถึง ${s.specialTo ?? "?"}`}>{(s.specialFrom ?? "?").slice(0, 10)} – {(s.specialTo ?? "?").slice(0, 10)}</span>}
        </span>
      ),
    },
    {
      key: "stock", header: "สต๊อก", width: "4rem", align: "right",
      cell: (s) => { const q = s.available ?? s.quantity; return q == null ? <span className="text-slate-300">—</span> : <span className={q === 0 ? "text-rose-600" : ""}>{q.toLocaleString()}</span>; },
    },
    {
      key: "st", header: "ขาย", width: disp ? "5.5rem" : "4rem",
      cell: (s) => {
        const open = s.status !== "inactive";
        const badge = <span className={`rounded-full px-1.5 text-[11px] ${open ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{open ? "เปิด" : "ปิด"}</span>;
        return disp ? (
          <span className="inline-flex items-center gap-1">
            {badge}
            <button type="button" disabled={disp.busy} onClick={() => disp.request(!open, s)} className="text-[11px] text-violet-700 hover:underline disabled:opacity-40"
              title={open ? "ปิดขายตัวเลือกนี้บน Lazada (ถามก่อน)" : "เปิดขายตัวเลือกนี้บน Lazada (ถามก่อน)"}>{open ? "ปิด" : "เปิด"}</button>
          </span>
        ) : badge;
      },
    },
    {
      key: "pkg", header: "กล่อง", width: "7rem",
      cell: (s) => (s.weight == null && s.length == null ? <span className="text-slate-300">—</span> : (
        <span className="text-[11px] leading-tight text-slate-600">
          <span className="block">{s.weight != null ? `${s.weight} กก.` : "—"}</span>
          <span className="block text-slate-400">{[s.length, s.width, s.height].map((x) => x ?? "?").join("×")} ซม.</span>
        </span>
      )),
    },
  ];
  const off = v.skus.filter((s) => s.status === "inactive").length;
  return (
    <div className="space-y-2">
      <MiniTable rows={v.skus} columns={cols} rowKey={(s) => s.skuId} dense hideToolbar emptyText="ไม่มีตัวเลือก" resizable storageKey="listing-drawer-lazada-options" />
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span>{v.skus.length.toLocaleString()} ตัวเลือก{off ? ` · ปิดขาย ${off.toLocaleString()}` : ""}</span>
        <span className="ml-auto">ราคาดูอย่างเดียว (แก้ราคาเฟสถัดไป) · สต๊อกดูอย่างเดียว (BigSeller ยังซิงค์สต๊อก Lazada อยู่)</span>
      </div>
    </div>
  );
}
