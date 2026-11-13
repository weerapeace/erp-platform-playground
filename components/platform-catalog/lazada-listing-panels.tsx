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
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { MoneyInput } from "@/components/money-input";
import { DateInput } from "@/components/date-input";
import { SearchableMultiSelect, SearchableSelect } from "@/components/searchable-select";
import { ListingImageGrid, ListingImagePicker, listingImgSrc, useSystemImages } from "./listing-images";
import {
  applyLazadaBulkPrice, lazadaEditStateFromView, lazadaPriceRowsFromView, lazadaSkuMediaFromView, lazStatusBadge, planLazadaDisplay, planLazadaEdit, planLazadaPrices, planLazadaSkuMedia, LAZADA_NAME_MAX, MAX_LAZADA_IMAGES,
  lazApplyImagesToGroup, lazSystemImageKey, type LazadaSkuMediaPlan, type LazadaSkuMediaRow,
  planLazadaAttrs, lazAttrDefsWithExtras, lazAttrEditable, lazAttrGroup, lazAttrDisplay, lazAttrFill, lazNormAttr, type LazadaAttrDef, type LazadaAttrPlan,
  type LazadaEditChange, type LazadaEditPlan, type LazadaEditState, type LazadaListingDetailResponse, type LazadaListingView, type LazadaPricePlan, type LazadaPriceRow, type LazadaSkuView, type LazadaWriteResponse,
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

// ───────────────────────── เฟส 2–3: แก้ชื่อ / รายละเอียด / จุดเด่น + ราคา (ปุ่มบันทึกเดียว) ─────────────────────────
export type LazadaEditApi = {
  canEdit: boolean;
  form: LazadaEditState | null;
  base: LazadaEditState | null;
  setField: <K extends keyof LazadaEditState>(k: K, v: LazadaEditState[K]) => void;
  plan: LazadaEditPlan | null;
  /** เฟส 3: ราคาต่อตัวเลือก */
  prices: LazadaPriceRow[] | null;
  /** เฟส 4: รูปตัวเลือก + น้ำหนัก/ขนาดกล่อง */
  skuMedia: LazadaSkuMediaRow[] | null;
  setSkuMedia: (skuId: string, patch: Partial<LazadaSkuMediaRow>) => void;
  /** แทนทั้งชุด (เช่น ใช้รูปกับทุกตัวเลือกสีเดียวกัน) */
  setSkuMediaRows: (rows: LazadaSkuMediaRow[]) => void;
  /** เฟส B: ข้อมูลเฉพาะ/ประกัน/ห่อของขวัญ (ชื่อช่อง → ค่า) · แผนคำนวณเมื่อโหลดรายการช่องของหมวดแล้ว */
  attrs: Record<string, string> | null;
  setAttr: (name: string, value: string) => void;
  attrPlan: LazadaAttrPlan | null;
  skuPlan: LazadaSkuMediaPlan | null;
  setImages: (next: string[]) => void;
  setPrice: (skuId: string, patch: Partial<LazadaPriceRow>) => void;
  setPrices: (rows: LazadaPriceRow[]) => void;
  pricePlan: LazadaPricePlan | null;
  /** รวมทั้งข้อมูล + ราคา */
  changes: LazadaEditChange[];
  errors: string[];
  dirty: boolean;
  descEdit: boolean;
  setDescEdit: (v: boolean) => void;
  reset: () => void;
  ask: () => void;
  saving: boolean;
  dialog: ReactNode;
};

export function useLazadaEdit(state: LazadaListingState, canEdit: boolean, onSaved?: (name: string) => void, attrDefs?: LazadaAttrDef[] | null): LazadaEditApi {
  const toast = useToast();
  const base = useMemo(() => (state.view ? lazadaEditStateFromView(state.view) : null), [state.view]);
  const priceBase = useMemo(() => (state.view ? lazadaPriceRowsFromView(state.view) : null), [state.view]);
  const skuBase = useMemo(() => (state.view ? lazadaSkuMediaFromView(state.view) : null), [state.view]);
  const [skuMedia, setSkuMediaState] = useState<LazadaSkuMediaRow[] | null>(null);
  useEffect(() => { setSkuMediaState(skuBase ? skuBase.map((r) => ({ ...r, images: [...r.images] })) : null); }, [skuBase]);
  const skuPlan = useMemo(() => (skuBase && skuMedia ? planLazadaSkuMedia(skuBase, skuMedia, state.view?.imageVariation) : null), [skuBase, skuMedia, state.view]);
  // เฟส B: คุณสมบัติ (เริ่มจากค่าบนร้าน · แผนต้องรู้รายการช่องของหมวด)
  const attrBase = useMemo(() => (state.view ? state.view.attributes : null), [state.view]);
  const [attrs, setAttrs] = useState<Record<string, string> | null>(null);
  useEffect(() => { setAttrs(attrBase ? { ...attrBase } : null); }, [attrBase]);
  const attrPlan = useMemo(() => (attrDefs && attrBase && attrs ? planLazadaAttrs(attrDefs, attrBase, attrs) : null), [attrDefs, attrBase, attrs]);
  const [form, setForm] = useState<LazadaEditState | null>(null);
  const [prices, setPricesState] = useState<LazadaPriceRow[] | null>(null);
  const [descEdit, setDescEdit] = useState(false);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  // ข้อมูลจากร้านเปลี่ยน (เปิดตัวใหม่ / ดึงใหม่ / ส่งสำเร็จ) → ฟอร์มเริ่มจากของล่าสุด
  useEffect(() => { setForm(base ? { ...base } : null); setDescEdit(false); }, [base]);
  useEffect(() => { setPricesState(priceBase ? priceBase.map((r) => ({ ...r })) : null); }, [priceBase]);
  const plan = useMemo(() => (base && form ? planLazadaEdit(base, form) : null), [base, form]);
  const pricePlan = useMemo(() => (priceBase && prices ? planLazadaPrices(priceBase, prices) : null), [priceBase, prices]);
  const infoDirty = (!!plan && plan.changes.length > 0) || (!!skuPlan && skuPlan.changes.length > 0) || (!!attrPlan && attrPlan.changes.length > 0);   // ข้อมูล + รูป + กล่อง + คุณสมบัติ ส่งทาง listing-edit
  const priceDirty = !!pricePlan && pricePlan.changes.length > 0;
  const dirty = infoDirty || priceDirty;
  const changes = [...(plan?.changes ?? []), ...(skuPlan?.changes ?? []), ...(attrPlan?.changes ?? []), ...(pricePlan?.changes ?? [])];
  const errors = [...(plan?.errors ?? []), ...(skuPlan?.errors ?? []), ...(attrPlan?.errors ?? []), ...(pricePlan?.errors ?? [])];
  const warnings = [...(plan?.warnings ?? []), ...(skuPlan?.warnings ?? []), ...(attrPlan && attrPlan.changes.length ? attrPlan.warnings : []), ...(pricePlan?.warnings ?? [])];

  const post = async (url: string, payload: unknown) => {
    const r = await apiFetch(url, { method: "POST", body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({ ok: false, view: null, error: `HTTP ${r.status}` })) as LazadaWriteResponse;
    return { r, j };
  };
  // ส่งทีละส่วน: ข้อมูล (listing-edit) → ราคา (listing-prices) · ส่วนแรกพลาด = ไม่ส่งต่อ
  const save = async () => {
    if (!state.listingId || !base || !form || !priceBase || !prices) return;
    setSaving(true);
    const done: string[] = [];
    let saved = false;
    try {
      if (infoDirty) {
        const { r, j } = await post("/api/lazada/listing-edit", { listing_id: state.listingId, before: base, edit: form, sku_before: skuBase, sku_edit: skuMedia, ...(attrPlan && attrPlan.changes.length ? { attrs_before: attrBase, attrs_edit: attrs } : {}) });
        if (!j.ok) {
          toast.error(r.status === 401 ? "ไม่มีสิทธิ์ส่งขึ้นร้าน หรือระบบยังไม่ยืนยันการล็อกอิน — รอสักครู่แล้วลองใหม่" : `ข้อมูลสินค้า: ${j.error ?? `HTTP ${r.status}`}${priceDirty ? " (ยังไม่ได้ส่งราคา)" : ""}`);
          if (r.status === 409 && j.view) { setAsking(false); state.apply(j.view); }   // ร้านเปลี่ยน → โหลดของล่าสุดให้ (ฟอร์มเริ่มใหม่)
          return;
        }
        saved = true; done.push(j.qc ? "ข้อมูลสินค้า (Lazada ส่งไปรอตรวจ)" : "ข้อมูลสินค้า");
        (j.warnings ?? []).filter((w) => !w.includes("รอตรวจ")).forEach((w) => toast.warning(w));
        if (j.view && !priceDirty) state.apply(j.view);
      }
      if (priceDirty) {
        const { r, j } = await post("/api/lazada/listing-prices", { listing_id: state.listingId, before: priceBase, edit: prices });
        (j.warnings ?? []).forEach((w) => toast.warning(w));
        if (j.ok) { saved = true; done.push(`ราคา ${(j.changes ?? []).length} ตัวเลือก`); }
        else {
          toast.error(r.status === 401 ? "ไม่มีสิทธิ์ส่งขึ้นร้าน หรือระบบยังไม่ยืนยันการล็อกอิน — รอสักครู่แล้วลองใหม่" : `ราคา: ${j.error ?? `HTTP ${r.status}`}`);
          if (r.status === 207) saved = true;   // ส่งได้บางส่วน
        }
        if (j.view) state.apply(j.view);
        else if (saved) state.reload();
        if (!j.ok && r.status !== 207) { if (r.status === 409) setAsking(false); if (!saved) return; }
      }
      if (done.length) toast.success(`ส่งขึ้น Lazada แล้ว: ${done.join(" · ")} — บันทึกประวัติแล้ว`);
      setAsking(false);
    } catch (e) { toast.error(`ส่งขึ้น Lazada ไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setSaving(false); if (saved) onSaved?.(form.name); }
  };

  const dialog = (
    <ConfirmDialog open={asking && changes.length > 0} onClose={() => { if (!saving) setAsking(false); }} onConfirm={() => void save()} loading={saving}
      title={`ส่งการแก้ไข ${changes.length} รายการขึ้นร้าน Lazada?`} confirmText="ส่งขึ้น Lazada"
      message={(
        <div className="space-y-2 text-sm">
          <p>ระบบจะแก้สินค้าบนร้าน Lazada จริงตามนี้ (ส่งเฉพาะที่เปลี่ยน · สถานะเปิด/ปิดของทุกตัวเลือกคงเดิม · ไม่แตะสต๊อก) · มีประวัติว่าใครแก้อะไร</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
            {changes.map((c, i) => (
              <li key={i}><span className="font-medium text-slate-700">{c.label}:</span> <span className="text-slate-400 line-through">{c.before}</span> → <span className="text-slate-800">{c.after}</span></li>
            ))}
          </ul>
          {warnings.map((w, i) => <p key={i} className="flex items-start gap-1 text-xs text-amber-700"><Icon name="warning" className="mt-0.5 shrink-0" />{w}</p>)}
        </div>
      )} />
  );
  return {
    canEdit, form, base, plan, prices, pricePlan, skuMedia, skuPlan, changes, errors, dirty, descEdit, setDescEdit, saving, dialog,
    setSkuMedia: (skuId, patch) => setSkuMediaState((rows) => (rows ? rows.map((r) => (r.skuId === skuId ? { ...r, ...patch } : r)) : rows)),
    setSkuMediaRows: (rows) => setSkuMediaState(rows),
    attrs, attrPlan,
    setAttr: (name, value) => setAttrs((a) => (a ? { ...a, [name]: value } : a)),
    setImages: (next) => setForm((f) => (f ? { ...f, images: next } : f)),
    setField: (k, v) => setForm((f) => (f ? { ...f, [k]: v } : f)),
    setPrice: (skuId, patch) => setPricesState((rows) => (rows ? rows.map((r) => (r.skuId === skuId ? { ...r, ...patch } : r)) : rows)),
    setPrices: (rows) => setPricesState(rows),
    reset: () => { if (base) setForm({ ...base }); if (priceBase) setPricesState(priceBase.map((r) => ({ ...r }))); if (skuBase) setSkuMediaState(skuBase.map((r) => ({ ...r, images: [...r.images] }))); if (attrBase) setAttrs({ ...attrBase }); setDescEdit(false); },
    ask: () => setAsking(true),
  };
}

/** แถบท้ายลิ้นชัก (Lazada) — สถานะการแก้ + ยกเลิก + บันทึกขึ้น Lazada */
export function LazadaEditFooter({ edit, state }: { edit: LazadaEditApi; state: LazadaListingState }) {
  if (!edit.canEdit) return <span className="text-xs text-slate-400">Lazada: ดูอย่างเดียว — ไม่มีสิทธิ์ส่งขึ้นร้าน</span>;
  if (!state.view || !edit.plan) return <span className="text-xs text-slate-400">กำลังดึงข้อมูลจาก Lazada…</span>;
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 text-xs text-slate-500">
        {edit.errors.length ? <span className="text-rose-600">{edit.errors[0]}{edit.errors.length > 1 ? ` (และอีก ${edit.errors.length - 1})` : ""}</span> : edit.dirty ? `แก้แล้ว ${edit.changes.length.toLocaleString()} รายการ — ยังไม่ได้ส่งขึ้น Lazada` : "ยังไม่ได้แก้อะไร"}
      </span>
      {edit.dirty && <button type="button" onClick={edit.reset} disabled={edit.saving} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">ยกเลิกที่แก้</button>}
      <button type="button" disabled={!edit.dirty || edit.errors.length > 0 || edit.saving} onClick={edit.ask}
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
        {can ? "ข้อมูลสดจากร้าน Lazada · แก้แล้วกด “บันทึกขึ้น Lazada” ด้านล่าง (โชว์ก่อน → หลัง ให้ยืนยัน) · รูปสินค้าแก้ที่แท็บรูป · ราคา/รูปตัวเลือก/กล่อง แก้ที่แท็บตัวเลือก & ราคา" : "ดูอย่างเดียว — ข้อมูลสดจากร้าน Lazada"}
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

const LAZADA_IMG_NOTE = "รูปจากระบบจะถูกฝากกับ Lazada เป็น JPG สี่เหลี่ยมจัตุรัสพื้นขาว (Lazada รับ jpg/png ไม่เกิน 3MB · พื้นไม่ขาวเคยโดนปัดตก)";

/** แท็บรูป — เฟส 4: ลากเรียง/ตั้งปก/ลบ/เพิ่มจากคลังรูปในระบบ (ชิ้นส่วนเดียวกับ LINE: ./listing-images) · ไม่มีสิทธิ์ = ดูอย่างเดียว */
export function LazadaImagesPanel({ state, onOpen, edit, matchedParent, matchedCode }: {
  state: LazadaListingState; onOpen: (index: number) => void; edit?: LazadaEditApi | null; matchedParent?: string | null; matchedCode?: string | null;
}) {
  const sys = useSystemImages(matchedParent ?? null);
  const [picking, setPicking] = useState(false);
  const [promoPick, setPromoPick] = useState<null | "promoSquare" | "promoLong">(null);
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const can = !!edit?.canEdit && !!edit.form;
  const images = can ? edit!.form!.images : v.images;
  const promo = { promoSquare: can ? edit!.form!.promoSquare ?? null : v.promoSquare, promoLong: can ? edit!.form!.promoLong ?? null : v.promoLong };
  const promoBox = (k: "promoSquare" | "promoLong", label: string, ratio: string, w: number, h: number) => {
    const ref = promo[k]; const changed = can && ref !== (k === "promoSquare" ? v.promoSquare : v.promoLong);
    return (
      <div className="flex items-start gap-2">
        <div style={{ width: w, height: h }} className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white ${changed ? "border-violet-400 ring-2 ring-violet-200" : "border-slate-200"} ${ref ? "" : "border-dashed text-slate-300"}`}>
          {ref ? <img src={listingImgSrc(ref, 300)} alt="" className="h-full w-full object-contain" /> : <Icon name="image" />}
        </div>
        <div className="min-w-0 text-xs">
          <div className="font-medium text-slate-700">{label}</div>
          <div className="text-[11px] text-slate-400">{ratio} · {ref ? (lazSystemImageKey(ref) ? "รูปใหม่จากระบบ (ส่งตอนบันทึก)" : "อยู่บน Lazada") : "ยังไม่มี"}</div>
          {can && <button type="button" onClick={() => { setPromoPick(k); sys.load(); }} className="mt-1 text-[11px] text-violet-700 hover:underline">{ref ? "เปลี่ยนรูป" : "เลือกรูป"}</button>}
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-4">
      {!can && images.length === 0
        ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">สินค้านี้ยังไม่มีรูปบน Lazada</p>
        : <ListingImageGrid images={images} onChange={(next) => edit?.setImages(next)} canEdit={can} max={MAX_LAZADA_IMAGES} platformName="Lazada" dragGroup="lazada-listing-images"
            onOpen={onOpen} onAdd={() => { setPicking(true); sys.load(); }} canAdd={!!matchedParent} note={can ? LAZADA_IMG_NOTE : "ดูอย่างเดียว"} />}
      {/* เฟส A: รูปส่งเสริมการขาย (attributes.promotion_square_image / promotion_long_image) */}
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="mb-2 text-xs font-semibold text-slate-600">รูปภาพส่งเสริมการขาย</div>
        <div className="flex flex-wrap gap-6">
          {promoBox("promoSquare", "พื้นขาว จัตุรัส", "1:1", 80, 80)}
          {promoBox("promoLong", "แนวตั้ง (ไม่บังคับ)", "3:4", 60, 80)}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">สินค้าต้องอยู่บนพื้นขาว ไม่มีตัวหนังสือ/กรอบ · รูปจากระบบจะถูกเติมขอบขาวให้ได้สัดส่วน (จัตุรัส 1000px / แนวตั้ง 750×1000) แล้วฝากกับ Lazada · ไม่ได้ลบพื้นหลังเดิม · สัดส่วนผิด Lazada ทิ้งเงียบ ๆ — ส่งแล้วระบบเช็กให้</p>
      </div>
      {can && (
        <ListingImagePicker open={picking} onClose={() => setPicking(false)} mode="product" storageKey="lazada-image-picker"
          title="เพิ่มรูปสินค้าจากคลังรูปในระบบ" description={`เลือกได้อีก ${Math.max(0, MAX_LAZADA_IMAGES - images.length)} รูป (Lazada รับไม่เกิน ${MAX_LAZADA_IMAGES}) · ส่งขึ้นร้านตอนกดบันทึก`}
          matchedParent={matchedParent ?? null} matchedCode={matchedCode} sysImages={sys.images}
          isUsed={(ref) => images.includes(ref)} full={images.length >= MAX_LAZADA_IMAGES}
          onPick={(ref) => edit!.setImages([...images, ref])} />
      )}
      {can && (
        <ListingImagePicker open={!!promoPick} onClose={() => setPromoPick(null)} mode="variant" storageKey="lazada-promo-picker"
          title={promoPick === "promoLong" ? "เลือกรูปส่งเสริม (แนวตั้ง 3:4)" : "เลือกรูปส่งเสริม (จัตุรัสพื้นขาว)"}
          description={promoPick === "promoLong" ? "เลือกจากคลังรูปในระบบ — ระบบทำเป็น 3:4 พื้นขาวให้ (รูปบนร้านส่วนใหญ่เป็นจัตุรัส ใช้เป็นแนวตั้งไม่ได้)" : "เลือกรูปที่สินค้าอยู่บนพื้นขาว · รูปจากระบบจะถูกทำเป็นจัตุรัสพื้นขาวให้"}
          shopImages={promoPick === "promoSquare" ? images : undefined} matchedParent={matchedParent ?? null} matchedCode={matchedCode} sysImages={sys.images}
          onPick={(ref) => { if (promoPick) edit!.setField(promoPick, ref); setPromoPick(null); }} />
      )}
    </div>
  );
}

const numOrNull = (raw: string) => { const n = Number(raw); return raw.trim() === "" || !Number.isFinite(n) ? null : n; };

/** แถบแก้ราคาหลายตัวเลือกพร้อมกัน — เติมฟอร์มอย่างเดียว (applyLazadaBulkPrice) ต้องกดบันทึกขึ้น Lazada อีกที */
function LazadaBulkPriceBar({ edit, selected }: { edit: LazadaEditApi; selected: Set<string> }) {
  const [b, setB] = useState({ price: "", special: "", pct: "", from: "", to: "" });
  const [noEnd, setNoEnd] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = selected.size || (edit.prices?.length ?? 0);
  const apply = () => {
    if (!edit.prices) return;
    const r = applyLazadaBulkPrice(edit.prices, selected, { price: numOrNull(b.price), special: numOrNull(b.special), pct: numOrNull(b.pct), from: noEnd ? null : (b.from || null), to: noEnd ? null : (b.to || null), noEnd });
    setErr(r.error ?? (r.changed === 0 ? "ค่าเท่าเดิมทุกตัว — ไม่มีอะไรเปลี่ยน" : null));
    if (!r.error && r.changed) edit.setPrices(r.rows);
  };
  const upd = (k: keyof typeof b) => (v: string) => { setB((x) => ({ ...x, [k]: v })); setErr(null); };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-2.5 py-2 text-xs text-violet-900">
      <span className="font-medium">แก้{selected.size ? `ตัวที่ติ๊ก (${selected.size})` : `ทุกตัวเลือก (${n})`}พร้อมกัน:</span>
      <label className="inline-flex items-center gap-1">ราคาปกติ<MoneyInput value={b.price} onChange={upd("price")} placeholder="ไม่เปลี่ยน" className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2 text-right" /></label>
      <label className="inline-flex items-center gap-1">ราคาลด<MoneyInput value={b.special} onChange={upd("special")} placeholder="ไม่เปลี่ยน" className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2 text-right" /></label>
      <label className="inline-flex items-center gap-1">หรือ ลด<input type="number" min="1" max="99" value={b.pct} onChange={(e) => upd("pct")(e.target.value)} className="h-8 w-16 rounded-md border border-slate-200 bg-white px-2 text-right" />%</label>
      <span className={`inline-flex items-center gap-1 ${noEnd ? "opacity-40" : ""}`}>ช่วงราคาลด<DateInput value={b.from} onChange={upd("from")} disabled={noEnd} className="w-32" /><span>–</span><DateInput value={b.to} onChange={upd("to")} disabled={noEnd} className="w-32" /></span>
      <label className="inline-flex items-center gap-1"><input type="checkbox" checked={noEnd} onChange={(e) => { setNoEnd(e.target.checked); setErr(null); }} />ไม่มีกำหนด</label>
      <button type="button" onClick={apply} className="h-8 rounded-md bg-violet-600 px-2.5 text-white hover:bg-violet-700">ใช้กับ{selected.size ? `ที่ติ๊ก ${selected.size} ตัว` : "ทุกตัว"}</button>
      {err && <span className="w-full text-rose-600">{err}</span>}
      <span className="w-full text-[11px] text-violet-700/80">ช่องว่าง = ไม่เปลี่ยน · ลด % คิดจากราคาปกติ · ราคาลดไม่ใส่วัน / ติ๊ก “ไม่มีกำหนด” = ลดตลอด ไม่มีวันหมด · ระบบไม่ยอมส่งราคาที่ขยับตั้งแต่ 80% · กดแล้วยังไม่ส่ง — ต้องกด “บันทึกขึ้น Lazada”</span>
    </div>
  );
}

/** แท็บตัวเลือก & ราคา — แก้ราคา/ราคาลด/ช่วงวัน (edit · เฟส 3) · เปิด/ปิดขายทีละตัวเลือก (disp · เฟส 2) · สต๊อกดูอย่างเดียว */
export function LazadaOptionsPanel({ state, disp, edit, matchedParent, matchedCode }: {
  state: LazadaListingState; disp: LazadaDisplayApi | null; edit?: LazadaEditApi | null; matchedParent?: string | null; matchedCode?: string | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"price" | "media">("price");
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const toggle = (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-sm">
      {([["price", "ราคา · เปิดปิดขาย"], ["media", "รูป · น้ำหนัก · กล่อง"]] as const).map(([k, label], i) => (
        <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
          className={`h-8 px-3 ${i ? "border-l border-slate-200" : ""} ${mode === k ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
      ))}
    </div>
  );
  if (mode === "media") return <div className="space-y-2">{toggle}<LazadaSkuMediaTable state={state} edit={edit ?? null} matchedParent={matchedParent ?? null} matchedCode={matchedCode ?? null} /></div>;
  const canPrice = !!edit?.canEdit && !!edit.prices;
  const rowOf = new Map((edit?.prices ?? []).map((r) => [r.skuId, r]));
  const baseOf = new Map(v.skus.map((s) => [s.skuId, s]));
  const changedCls = (on: boolean) => (on ? "border-violet-400 bg-violet-50" : "border-slate-200");
  const priceCols: MiniColumn<LazadaSkuView>[] = canPrice ? [
    {
      key: "price", header: "ราคาปกติ", width: "6.5rem", align: "right",
      cell: (s) => { const r = rowOf.get(s.skuId); return <MoneyInput value={r?.price ?? null} onChange={(raw) => edit!.setPrice(s.skuId, { price: numOrNull(raw) })} className={`h-8 w-full rounded-md border px-2 text-right text-sm ${changedCls(r?.price !== s.price)}`} />; },
    },
    {
      key: "sp", header: "ราคาลด", width: "6.5rem", align: "right",
      cell: (s) => {
        const r = rowOf.get(s.skuId);
        return (
          <span className="block leading-tight">
            <MoneyInput value={r?.special ?? null} onChange={(raw) => edit!.setPrice(s.skuId, { special: numOrNull(raw) })} placeholder="ไม่มี" className={`h-8 w-full rounded-md border px-2 text-right text-sm ${changedCls(r?.special !== s.specialPrice)}`} />
            {r?.special != null && r.price ? <span className="block text-right text-[11px] text-rose-600">-{Math.round((1 - r.special / r.price) * 100)}%</span> : null}
          </span>
        );
      },
    },
    {
      key: "dates", header: "ช่วงราคาลด", width: "8.5rem",
      cell: (s) => {
        const r = rowOf.get(s.skuId); const b = baseOf.get(s.skuId);
        if (!r || r.special == null) return <span className="text-slate-300">—</span>;
        const ch = r.from !== (b?.specialFrom?.slice(0, 10) ?? null) || r.to !== (b?.specialTo?.slice(0, 10) ?? null);
        const open = !r.from && !r.to;
        return (
          <span className={`flex flex-col gap-0.5 rounded-md ${ch ? "bg-violet-50" : ""}`}>
            <DateInput value={r.from ?? ""} onChange={(iso) => edit!.setPrice(s.skuId, { from: iso || null })} placeholder="เริ่ม: วันนี้" className="w-full" />
            <DateInput value={r.to ?? ""} onChange={(iso) => edit!.setPrice(s.skuId, { to: iso || null })} placeholder="ไม่มีกำหนด" className="w-full" />
            {open
              ? <span className="text-[10px] text-emerald-700">ไม่มีกำหนด (ลดตลอด)</span>
              : <button type="button" onClick={() => edit!.setPrice(s.skuId, { from: null, to: null })} className="self-start text-[10px] text-violet-700 hover:underline" title="ล้างวัน = ราคาลดใช้ตลอด ไม่มีวันหมด">ตั้งเป็นไม่มีกำหนด</button>}
          </span>
        );
      },
    },
  ] : [
    { key: "price", header: "ราคาปกติ", width: "5.5rem", align: "right", cell: (s) => <span>{baht(s.price)}</span> },
    {
      key: "sp", header: "ราคาลด", width: "7rem", align: "right",
      cell: (s) => s.specialPrice == null ? <span className="text-slate-300">—</span> : (
        <span className="leading-tight">
          <span className="block text-rose-600">{baht(s.specialPrice)}{s.price ? <span className="ml-1 text-[11px]">-{Math.round((1 - s.specialPrice / s.price) * 100)}%</span> : null}</span>
          {(s.specialFrom || s.specialTo)
            ? <span className="block text-[10px] text-slate-400" title={`${s.specialFrom ?? "?"} ถึง ${s.specialTo ?? "ไม่มีกำหนด"}`}>{(s.specialFrom ?? "?").slice(0, 10)} – {s.specialTo ? s.specialTo.slice(0, 10) : "ไม่มีกำหนด"}</span>
            : <span className="block text-[10px] text-slate-400">ไม่มีกำหนด</span>}
        </span>
      ),
    },
  ];
  const cols: MiniColumn<LazadaSkuView>[] = [
    {
      key: "opt", header: "ตัวเลือก", width: "1.6fr",
      cell: (s) => (
        <div className="flex min-w-0 items-center gap-2">
          {s.images[0] ? <img src={s.images[0]} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded object-cover" /> : null}
          <div className="min-w-0">
            <div className="truncate" title={s.label}>{s.label}</div>
            <div className="flex items-center gap-1 truncate font-mono text-[11px] text-slate-400">
              {s.sellerSku ?? "ไม่มีรหัส"}
              {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" title="เปิดตัวเลือกนี้บนเว็บ Lazada" className="text-violet-600 hover:text-violet-800"><Icon name="open" /></a>}
            </div>
          </div>
        </div>
      ),
    },
    ...priceCols,
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
  const priceChanged = edit?.pricePlan?.changes.length ?? 0;
  return (
    <div className="space-y-2">
      {toggle}
      {canPrice && <LazadaBulkPriceBar edit={edit!} selected={selected} />}
      <MiniTable rows={v.skus} columns={cols} rowKey={(s) => s.skuId} dense hideToolbar emptyText="ไม่มีตัวเลือก" resizable storageKey={canPrice ? "listing-drawer-lazada-prices" : "listing-drawer-lazada-options"}
        selectable={canPrice} selected={selected} onSelectedChange={setSelected} />
      {canPrice && edit!.pricePlan && edit!.pricePlan.errors.length > 0 && (
        <ul className="space-y-0.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {edit!.pricePlan.errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
          {edit!.pricePlan.errors.length > 6 && <li>… และอีก {edit!.pricePlan.errors.length - 6}</li>}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span>{v.skus.length.toLocaleString()} ตัวเลือก{off ? ` · ปิดขาย ${off.toLocaleString()}` : ""}{priceChanged ? ` · แก้ราคาแล้ว ${priceChanged} ตัว (ยังไม่ส่ง)` : ""}</span>
        <span className="ml-auto">{canPrice ? "ช่องที่แก้มีกรอบม่วง · " : "ราคาดูอย่างเดียว · "}สต๊อกดูอย่างเดียว (BigSeller ยังซิงค์สต๊อก Lazada อยู่)</span>
      </div>
    </div>
  );
}

/**
 * เฟส 4 + A: รูปตัวเลือก (≤ 8 รูปต่อตัว) + น้ำหนัก/ขนาดกล่อง ต่อตัวเลือก (โหมด "รูป · น้ำหนัก · กล่อง" ของแท็บตัวเลือก)
 * กดรูปในแถว → ป๊อปจัดการรูปของตัวเลือกนั้น (ลากเรียง/ปก/ลบ/เพิ่ม — ชิ้นส่วนเดียวกับแท็บรูป) + "ใช้กับทุกตัวเลือกสีเดียวกัน"
 * กติกา Lazada (planLazadaSkuMedia): รูปตัวเลือกครบทุกตัว · ใส่ได้เฉพาะชั้นแรกที่ไม่ใช่ไซซ์
 */
function LazadaSkuMediaTable({ state, edit, matchedParent, matchedCode }: { state: LazadaListingState; edit: LazadaEditApi | null; matchedParent: string | null; matchedCode: string | null }) {
  const sys = useSystemImages(matchedParent);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const v = state.view!;
  const can = !!edit?.canEdit && !!edit.skuMedia;
  const rows = can ? edit!.skuMedia! : lazadaSkuMediaFromView(v);
  const baseOf = new Map(v.skus.map((s) => [s.skuId, s]));
  const groupOf = new Map(v.skus.map((s) => [s.skuId, s.groupValue]));
  const iv = v.imageVariation;
  const numCell = (k: "weight" | "length" | "width" | "height", step: string) => (r: LazadaSkuMediaRow) => {
    const b = baseOf.get(r.skuId);
    const changed = !!b && b[k] !== r[k];
    return can
      ? <input type="number" step={step} min="0" value={r[k] ?? ""} onChange={(e) => edit!.setSkuMedia(r.skuId, { [k]: numOrNull(e.target.value) } as Partial<LazadaSkuMediaRow>)}
          className={`h-8 w-full rounded-md border px-2 text-right text-sm ${changed ? "border-violet-400 bg-violet-50" : "border-slate-200"}`} />
      : <span>{r[k] ?? "—"}</span>;
  };
  const cols: MiniColumn<LazadaSkuMediaRow>[] = [
    { key: "opt", header: "ตัวเลือก", width: "1.4fr", cell: (r) => <div className="min-w-0"><div className="truncate" title={r.label}>{r.label}</div><div className="truncate font-mono text-[11px] text-slate-400">{r.sellerSku ?? "ไม่มีรหัส"}</div></div> },
    {
      key: "img", header: "รูป (สูงสุด 8)", width: "9rem",
      cell: (r) => {
        const changed = (baseOf.get(r.skuId)?.images ?? []).join("\n") !== r.images.join("\n");
        return (
          <button type="button" onClick={() => setOpenFor(r.skuId)} title={can ? "จัดการรูปของตัวเลือกนี้" : "ดูรูปของตัวเลือกนี้"}
            className={`flex items-center gap-1 rounded-md p-0.5 hover:bg-slate-50 ${changed ? "ring-2 ring-violet-300" : ""}`}>
            {r.images.slice(0, 3).map((ref, i) => <img key={`${ref}-${i}`} src={listingImgSrc(ref, 120)} alt="" className="h-8 w-8 rounded object-cover" />)}
            {r.images.length === 0 && <span className="flex h-8 w-8 items-center justify-center rounded bg-slate-50 text-slate-300"><Icon name="image" /></span>}
            <span className="text-[11px] text-violet-700">{r.images.length > 3 ? `+${r.images.length - 3}` : ""} {can ? "จัดการ" : "ดู"}</span>
          </button>
        );
      },
    },
    { key: "w", header: "น้ำหนัก (กก.)", width: "6rem", align: "right", cell: numCell("weight", "0.01") },
    { key: "l", header: "ยาว (ซม.)", width: "5rem", align: "right", cell: numCell("length", "0.1") },
    { key: "wd", header: "กว้าง (ซม.)", width: "5rem", align: "right", cell: numCell("width", "0.1") },
    { key: "h", header: "สูง (ซม.)", width: "5rem", align: "right", cell: numCell("height", "0.1") },
  ];
  const row = rows.find((r) => r.skuId === openFor) ?? null;
  const group = row ? groupOf.get(row.skuId) ?? null : null;
  const sameGroup = row && group != null ? rows.filter((r) => groupOf.get(r.skuId) === group).length : 0;
  const errs = edit?.skuPlan?.errors ?? [];
  return (
    <div className="space-y-2">
      {iv?.isSize && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">ชั้นตัวเลือกแรกของสินค้านี้คือ “{iv.label}” (ไซซ์) — Lazada ไม่ให้ใส่รูปตามไซซ์ แก้ได้แค่น้ำหนัก/กล่อง</p>}
      <MiniTable rows={rows} columns={cols} rowKey={(r) => r.skuId} dense hideToolbar emptyText="ไม่มีตัวเลือก" resizable storageKey="listing-drawer-lazada-media" />
      {errs.length > 0 && <ul className="space-y-0.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{errs.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}</ul>}
      <p className="text-[11px] text-slate-400">{can ? "ช่องที่แก้มีกรอบม่วง · รูปตัวเลือกต้องมีครบทุกตัว · รูปจากระบบจะถูกฝากกับ Lazada ตอนกดบันทึก · " : "ดูอย่างเดียว · "}น้ำหนักเป็นกิโลกรัม · ขนาดกล่องเป็นเซนติเมตร (ใช้คิดค่าส่ง)</p>

      {/* ป๊อปจัดการรูปของตัวเลือก 1 ตัว */}
      <ERPModal open={!!row} onClose={() => { setOpenFor(null); setAdding(false); }} size="lg" storageKey="lazada-sku-images"
        title={`รูปของตัวเลือก ${row?.label ?? ""}`} description={can ? "ลากเรียง · ตั้งปก · ลบ · เพิ่มจากรูปสินค้าบนร้าน/คลังรูปในระบบ — ส่งขึ้นร้านตอนกดบันทึก" : "ดูอย่างเดียว"}>
        {row && (
          <div className="space-y-3">
            {row.images.length === 0 && !can
              ? <p className="text-xs text-slate-500">ตัวเลือกนี้ยังไม่มีรูป</p>
              : <ListingImageGrid images={row.images} onChange={(next) => edit?.setSkuMedia(row.skuId, { images: next })} canEdit={can && !iv?.isSize} max={MAX_LAZADA_IMAGES} platformName="Lazada (รูปตัวเลือก)"
                  dragGroup="lazada-sku-images" onOpen={() => {}} onAdd={() => { setAdding(true); sys.load(); }} canAdd note="รูปจากระบบจะถูกทำเป็นจัตุรัสพื้นขาวแล้วฝากกับ Lazada" />}
            {can && !iv?.isSize && sameGroup > 1 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 text-xs text-violet-900">
                <span className="flex-1">ตัวเลือก “{group}” มี {sameGroup} ตัว (เช่น หลายไซซ์) — Lazada แนะนำให้ใช้รูปชุดเดียวกัน</span>
                <button type="button" onClick={() => { const r = lazApplyImagesToGroup(edit!.skuMedia!, row.skuId, row.images, groupOf); edit!.setSkuMediaRows(r.rows); }}
                  className="h-8 rounded-md bg-violet-600 px-2.5 text-white hover:bg-violet-700">ใช้รูปชุดนี้กับทั้ง {sameGroup} ตัว</button>
              </div>
            )}
          </div>
        )}
      </ERPModal>
      {can && row && (
        <ListingImagePicker open={adding} onClose={() => setAdding(false)} mode="product" showShop storageKey="lazada-sku-image-picker"
          title={`เพิ่มรูปให้ตัวเลือก ${row.label}`} description={`เลือกได้อีก ${Math.max(0, MAX_LAZADA_IMAGES - row.images.length)} รูป (ไม่เกิน ${MAX_LAZADA_IMAGES}) · ส่งขึ้นร้านตอนกดบันทึก`}
          shopImages={edit!.form?.images ?? v.images} matchedParent={matchedParent} matchedCode={matchedCode} sysImages={sys.images}
          isUsed={(ref) => row.images.includes(ref)} full={row.images.length >= MAX_LAZADA_IMAGES}
          onPick={(ref) => edit!.setSkuMedia(row.skuId, { images: [...row.images, ref] })} />
      )}
    </div>
  );
}

// ───────────────────────── เฟส B: ข้อมูลเฉพาะ + ประกัน + ห่อของขวัญ ─────────────────────────
export type LazadaAttrDefsState = { defs: LazadaAttrDef[] | null; error: string | null; loading: boolean; load: () => void };
/** รายการช่องของหมวด (GET /api/lazada/category-attributes · ดึงสดจาก Lazada) — โหลดเมื่อเปิดแท็บข้อมูลเฉพาะครั้งแรก */
export function useLazadaAttrDefs(brandId: string | null, categoryId: string | null): LazadaAttrDefsState {
  const [st, setSt] = useState<{ key: string | null; defs: LazadaAttrDef[] | null; error: string | null; loading: boolean }>({ key: null, defs: null, error: null, loading: false });
  const key = brandId && categoryId ? `${brandId}|${categoryId}` : null;
  const load = useCallback(() => {
    if (!key || (st.key === key && (st.defs || st.loading))) return;
    setSt({ key, defs: null, error: null, loading: true });
    apiFetch(`/api/lazada/category-attributes?brand_id=${encodeURIComponent(brandId!)}&category_id=${encodeURIComponent(categoryId!)}`)
      .then((r) => r.json())
      .then((j: { attributes?: LazadaAttrDef[]; error?: string | null }) => setSt((cur) => (cur.key !== key ? cur : { key, defs: Array.isArray(j.attributes) ? lazAttrDefsWithExtras(j.attributes) : null, error: j.error ?? (Array.isArray(j.attributes) ? null : "ดึงรายการช่องไม่สำเร็จ"), loading: false })))
      .catch(() => setSt((cur) => (cur.key !== key ? cur : { key, defs: null, error: "ดึงรายการช่องของหมวดจาก Lazada ไม่สำเร็จ — ลองใหม่", loading: false })));
  }, [key, brandId, categoryId, st]);
  const mine = st.key === key;
  return { defs: mine ? st.defs : null, error: mine ? st.error : null, loading: mine && st.loading, load };
}

const MULTI = new Set(["multiSelect", "multiEnumInput"]);

/**
 * ช่องกรอก 1 ช่อง ตามชนิดของ Lazada (เลือก 1 / เลือกหลาย / พิมพ์+รายการ / ข้อความ / ตัวเลข / วันที่) — ใช้ร่วม ลิ้นชัก Lazada/TikTok + หน้าลงฉบับร่าง
 * เลือกหลายค่า = dropdown ติ๊กได้หลายตัว (SearchableMultiSelect · 2026-11-13 เจ้าของขอ "ให้กดจะได้ไม่รก") · เลือก 1 ที่รายการยาว = dropdown พิมพ์ค้นได้
 * suggested = ค่าที่ระบบแนะนำ (ป้าย "แนะนำ") — ยังไม่ส่งจนกดบันทึก
 */
export function LazadaAttrField({ def, value, base, can, onChange, suggested }: { def: LazadaAttrDef; value: string; base: string; can: boolean; onChange: (v: string) => void; suggested?: string[] }) {
  const changed = lazNormAttr(def, value) !== lazNormAttr(def, base);
  const empty = !lazNormAttr(def, value);
  const ring = changed ? "border-violet-400 bg-violet-50" : def.required && empty ? "border-rose-300 bg-rose-50" : "border-slate-200";
  const norm = lazNormAttr(def, value);
  let control: ReactNode;
  if (!can) control = <div className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{lazAttrDisplay(def, value) || <span className="text-slate-400">(ว่าง)</span>}</div>;
  else if (def.input_type === "singleSelect" && def.choices.length > 12) {
    const known = !norm || def.choices.some((c) => c.en === norm);
    control = (
      <SearchableSelect value={norm} onChange={(v) => onChange(v)}
        options={[...(!known ? [{ value: norm, label: `(ค่าเดิม: ${value})` }] : []), ...def.choices.map((c) => ({ value: c.en, label: c.name || c.en, searchText: c.en }))]} />
    );
  } else if (def.input_type === "singleSelect" && def.choices.length) {
    const known = !norm || def.choices.some((c) => c.en === norm);
    control = (
      <select value={norm} onChange={(e) => onChange(e.target.value)} className={`h-9 w-full rounded-lg border px-2 text-sm ${ring}`}>
        <option value="">— เลือก —</option>
        {!known && <option value={norm}>{`(ค่าเดิม: ${value})`}</option>}
        {def.choices.map((c) => <option key={c.en} value={c.en}>{c.name || c.en}</option>)}
      </select>
    );
  } else if (MULTI.has(def.input_type) && def.choices.length) {
    // เลือกหลายค่า = dropdown ติ๊ก (ไม่กางชิปเต็มจอ) · multiEnumInput = พิมพ์ค่าเองได้ (ห้ามมีจุลภาค เพราะใช้คั่นค่า)
    const vals = norm ? norm.split(",").filter(Boolean) : [];
    control = (
      <SearchableMultiSelect values={vals} onChange={(next) => onChange(next.join(","))} buttonClassName={ring} highlight={suggested}
        options={def.choices.map((c) => ({ value: c.en, label: c.name || c.en, searchText: c.en }))}
        onCreate={def.input_type === "multiEnumInput" ? (q) => { const v = q.replace(/,/g, " ").trim(); if (v && !vals.includes(v)) onChange([...vals, v].join(",")); } : undefined} />
    );
  } else if (def.input_type === "date") {
    control = <DateInput value={value.slice(0, 10)} onChange={(iso) => onChange(iso)} className="w-full" />;
  } else {
    const listId = def.choices.length ? `laz-attr-${def.name}` : undefined;
    control = (
      <>
        <input value={def.choices.length ? lazAttrDisplay(def, value) : value} list={listId} onChange={(e) => onChange(e.target.value)}
          inputMode={def.input_type === "numeric" ? "decimal" : undefined} placeholder={MULTI.has(def.input_type) ? "หลายค่าคั่นด้วย ," : def.choices.length ? "พิมพ์ หรือเลือกจากรายการ" : ""}
          className={`h-9 w-full rounded-lg border px-3 text-sm ${ring}`} />
        {listId && <datalist id={listId}>{def.choices.map((c) => <option key={c.en} value={c.name || c.en} />)}</datalist>}
      </>
    );
  }
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-xs text-slate-500">
        {def.required && <span className="text-rose-500">*</span>}{def.label}
        {def.is_key_prop && <span className="rounded bg-sky-50 px-1 text-[10px] font-medium text-sky-700">KEY</span>}
        {can && !!suggested?.length && !MULTI.has(def.input_type) && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-800">แนะนำ</span>}
      </span>
      {control}
      {can && changed && <span className="mt-0.5 block text-[11px] text-violet-700">เดิม: {lazAttrDisplay(def, base) || "(ว่าง)"}</span>}
      {can && !changed && def.required && empty && <span className="mt-0.5 block text-[11px] text-rose-600">ช่องจำเป็น — ยังว่าง</span>}
    </label>
  );
}

/** แท็บข้อมูลเฉพาะ (Lazada) — ช่องของหมวด + ประกัน + ห่อของขวัญ · แก้แล้วส่งพร้อมปุ่ม "บันทึกขึ้น Lazada" เดียวกัน */
export function LazadaAttrsPanel({ state, edit, defsState }: { state: LazadaListingState; edit: LazadaEditApi; defsState: LazadaAttrDefsState }) {
  const [more, setMore] = useState(false);
  const { load } = defsState;
  useEffect(() => { load(); }, [load]);
  const g = gate(state); if (g) return g;
  const v = state.view!;
  if (!v.categoryId) return <p className="text-xs text-slate-500">สินค้านี้ไม่มีหมวดบน Lazada — ไม่มีข้อมูลเฉพาะให้แก้</p>;
  if (defsState.error) return <ErrorState title={defsState.error} onRetry={defsState.load} />;
  if (!defsState.defs) return <LoadingState label="กำลังดึงรายการช่องของหมวดจาก Lazada…" />;
  const can = edit.canEdit && !!edit.attrs;
  const values = edit.attrs ?? v.attributes;
  const base = v.attributes;
  const ed = defsState.defs.filter(lazAttrEditable);
  const spec = ed.filter((d) => lazAttrGroup(d) === "spec").sort((a, b) => Number(b.required) - Number(a.required) || Number(b.is_key_prop) - Number(a.is_key_prop));
  const main = spec.filter((d) => d.required || d.is_key_prop || lazNormAttr(d, values[d.name]));
  const rest = spec.filter((d) => !main.includes(d));
  const warranty = ed.filter((d) => lazAttrGroup(d) === "warranty");
  const gift = ed.find((d) => lazAttrGroup(d) === "gift");
  const fill = lazAttrFill(defsState.defs, values);
  const pct = fill.total ? Math.round((fill.filled / fill.total) * 100) : 100;
  const field = (d: LazadaAttrDef) => <LazadaAttrField key={d.name} def={d} value={values[d.name] ?? ""} base={base[d.name] ?? ""} can={can} onChange={(x) => edit.setAttr(d.name, x)} />;
  const errs = edit.attrPlan?.errors ?? [];
  const brand = defsState.defs.find((d) => d.name === "brand");
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-slate-600">กรอกแล้ว {fill.filled}/{fill.total}</span>
        <div className="h-2 min-w-[8rem] flex-1 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-violet-500"}`} style={{ width: `${pct}%` }} /></div>
        <span className="text-xs text-slate-500">{pct}%</span>
      </div>
      {(edit.attrPlan?.missingRequired.length ?? 0) > 0 && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">ช่องจำเป็นยังว่าง {edit.attrPlan!.missingRequired.length} ช่อง — Lazada อาจไม่ให้บันทึกสินค้านี้จนกว่าจะกรอกครบ (ช่องที่มีกรอบแดง)</p>
      )}
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="mb-2 text-xs font-semibold text-slate-600">ข้อมูลเฉพาะของสินค้า</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {brand && (
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-xs text-slate-500"><span className="text-rose-500">*</span>ยี่ห้อ</span>
              <div className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{v.brand ?? "—"}</div>
              <span className="mt-0.5 block text-[11px] text-slate-400">ดูอย่างเดียว (Lazada ใช้รหัสแบรนด์ของเขา)</span>
            </label>
          )}
          {main.map(field)}
          {more && rest.map(field)}
        </div>
        {rest.length > 0 && <button type="button" onClick={() => setMore((x) => !x)} className="mt-2 text-xs text-violet-700 hover:underline">{more ? "ซ่อนช่องเพิ่มเติม" : `แสดงเพิ่มเติม (${rest.length} ช่อง)`}</button>}
      </div>
      {(warranty.length > 0 || gift) && (
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-600">การรับประกัน & บริการ</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {warranty.map(field)}
            {gift && (
              <div>
                <span className="mb-1 block text-xs text-slate-500">บริการห่อของขวัญ (ฟรี)</span>
                <ToggleSwitch on={lazNormAttr(gift, values[gift.name]) === "Yes"} disabled={!can} label={<span className="text-xs text-slate-600">{lazNormAttr(gift, values[gift.name]) === "Yes" ? "เปิด" : "ปิด"}</span>}
                  onChange={(on) => edit.setAttr(gift.name, on ? "Yes" : "No")} />
                <span className="mt-0.5 block text-[11px] text-amber-700">Lazada เปิดให้เฉพาะร้านที่ได้รับอนุญาต — ถ้าไม่รับ ระบบจะบอก (เปิดเองได้ใน Seller Center)</span>
              </div>
            )}
          </div>
        </div>
      )}
      {errs.length > 0 && <ul className="space-y-0.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{errs.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}</ul>}
      <p className="text-[11px] text-slate-400">{can ? "ช่องที่แก้มีกรอบม่วง (บอกค่าเดิมใต้ช่อง) · ตัวเลือกมาจากหมวดของสินค้าบน Lazada · ส่งพร้อมปุ่ม “บันทึกขึ้น Lazada” ด้านล่าง" : "ดูอย่างเดียว"} · ให้ AI ช่วยเลือก = เฟสถัดไป</p>
    </div>
  );
}
