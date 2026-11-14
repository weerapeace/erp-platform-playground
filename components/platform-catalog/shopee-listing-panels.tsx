"use client";
/**
 * เนื้อหาแท็บของสินค้าบน Shopee ในลิ้นชักสินค้าบนร้าน (listing-drawer) — แบบเดียวกับ ./tiktok-listing-panels (ฉบับเบา)
 *
 *   const sp   = useShopeeListing(isShopee ? listingId : null, onSaved);   // ดึงสดจาก Shopee ตอนเปิด
 *   const edit = useShopeeEdit(sp, canEdit, onSaved);                       // เฟส 4A: แก้ชื่อ + รายละเอียด → ส่งขึ้น Shopee (ถามก่อน)
 *   const disp = useShopeeDisplay(sp, onDone);                              // เฟส 4A: เปิด/ปิดขายทั้งสินค้า (ถามก่อน)
 *   <ShopeeHeaderStatus …/>  <ShopeeInfoPanel …/>  <ShopeeImagesPanel …/>  <ShopeeOptionsPanel …/>
 *   footer = <ShopeeEditFooter …/> · {edit.dialog}{disp.dialog}
 *
 * ข้อมูล: GET /api/shopee/listing-detail (ดึงสด ไม่บันทึก) · ปุ่ม "ดึงตัวนี้จาก Shopee" = POST (อัปเดตสำเนาย่อในระบบด้วย)
 * ส่งขึ้นร้านจริง (ถามก่อนเสมอ · มีประวัติ): POST /api/shopee/listing-edit · /api/shopee/listing-display
 * กฎ: lib/shopee-listing-edit (pure + เทสต์ — หน้าเว็บกับ API ใช้ตัวเดียวกัน) · แผนเฟส: docs/shopee-connector.md
 * ยังไม่ทำ (ดูอย่างเดียว): รูป · ตัวเลือก · ราคา (เฟส 4B/4C) · สต๊อก (BigSeller ยังซิงค์อยู่ — ไม่แก้)
 * ของกลางที่ใช้: MiniTable · ConfirmDialog · ToggleSwitch · state-views · Icon · ./listing-images (ListingImageGrid)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import {
  planShopeeDisplay, planShopeeEdit, shopeeIsOpen, shopeeStatusBadge, shopeeTextLength,
  type ShopeeListingDetailResponse, type ShopeeListingView, type ShopeeModelView, type ShopeeWriteResponse,
} from "@/lib/shopee-listing-edit";
import { ListingImageGrid } from "./listing-images";

export type ShopeeListingState = {
  listingId: string | null;
  view: ShopeeListingView | null;
  error: string | null;
  loading: boolean;
  fetchedAt: string | null;
  reload: () => void;
  /** ดึงตัวนี้จาก Shopee + อัปเดตสำเนาในระบบ */
  refresh: () => Promise<void>;
  refreshing: boolean;
  /** ใช้ข้อมูลล่าสุดที่ API ส่งกลับ (หลังส่งขึ้นร้าน) */
  apply: (view: ShopeeListingView) => void;
};

const NO_AUTH = "ไม่มีสิทธิ์ส่งขึ้นร้าน หรือระบบยังไม่ยืนยันการล็อกอิน — รอสักครู่แล้วลองใหม่";

/** ดึงสินค้าตัวนี้สดจาก Shopee เมื่อเปิดลิ้นชัก (listingId = null → ไม่ทำอะไร) */
export function useShopeeListing(listingId: string | null, onSaved?: () => void): ShopeeListingState {
  const toast = useToast();
  const [view, setView] = useState<ShopeeListingView | null>(null);
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
    if (lastId.current !== listingId) { lastId.current = listingId; setView(null); setFetchedAt(null); }
    setLoading(true); setError(null);
    apiFetch(`/api/shopee/listing-detail?listing_id=${encodeURIComponent(listingId)}`)
      .then((r) => r.json().catch(() => ({ view: null, fetched_at: null, error: `HTTP ${r.status}` })) as Promise<ShopeeListingDetailResponse>)
      .then((j) => {
        if (my !== seq.current) return;
        if (j.error || !j.view) { setError(j.error ?? "ดึงข้อมูลจาก Shopee ไม่สำเร็จ"); setView(null); return; }
        setView(j.view); setFetchedAt(j.fetched_at);
      })
      .catch(() => { if (my === seq.current) setError("ดึงข้อมูลจาก Shopee ไม่สำเร็จ — ลองใหม่อีกครั้ง"); })
      .finally(() => { if (my === seq.current) setLoading(false); });
  }, [listingId, n]);

  const refresh = useCallback(async () => {
    if (!listingId) return;
    setRefreshing(true);
    const my = ++seq.current;
    try {
      const r = await apiFetch("/api/shopee/listing-detail", { method: "POST", body: JSON.stringify({ listing_id: listingId }) });
      const j = await r.json().catch(() => ({ view: null, fetched_at: null, error: `HTTP ${r.status}` })) as ShopeeListingDetailResponse;
      if (my !== seq.current) return;
      if (j.view) { setView(j.view); setFetchedAt(j.fetched_at); setError(null); }
      if (j.error) toast.error(r.status === 401 ? "ระบบยังไม่ยืนยันการล็อกอิน/สิทธิ์ — รอสักครู่แล้วกดใหม่ (ถ้ายังไม่ได้ ลองรีเฟรชหน้า)" : j.error);
      else { toast.success("ดึงข้อมูลจาก Shopee แล้ว — อัปเดตในระบบแล้ว"); onSaved?.(); }
    } catch (e) { toast.error((e as Error).message); }
    finally { setRefreshing(false); }
  }, [listingId, onSaved, toast]);

  const apply = useCallback((v: ShopeeListingView) => { ++seq.current; setView(v); setFetchedAt(new Date().toISOString()); setError(null); setLoading(false); }, []);
  return { listingId, view, error, loading, fetchedAt, reload: () => setN((x) => x + 1), refresh, refreshing, apply };
}

// ───────────────────────── เฟส 4A: แก้ชื่อ + รายละเอียด (ปุ่มบันทึกเดียว) ─────────────────────────
export type ShopeeEditApi = {
  canEdit: boolean;
  name: string | null;
  setName: (v: string) => void;
  description: string | null;
  setDescription: (v: string) => void;
  changeCount: number;
  errors: string[];
  dirty: boolean;
  reset: () => void;
  ask: () => void;
  saving: boolean;
  dialog: ReactNode;
};

export function useShopeeEdit(state: ShopeeListingState, canEdit: boolean, onSaved?: (name: string) => void): ShopeeEditApi {
  const toast = useToast();
  const v = state.view;
  const [name, setNameState] = useState<string | null>(null);
  const [description, setDescState] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  // ข้อมูลจากร้านเปลี่ยน (เปิดตัวอื่น / ดึงใหม่ / หลังบันทึก) → เริ่มจากของบนร้าน
  useEffect(() => { setNameState(v ? v.name : null); setDescState(v ? v.description : null); }, [v]);

  const plan = useMemo(() => (v && name != null && description != null ? planShopeeEdit(v, { name, description }) : null), [v, name, description]);
  const changeCount = plan?.changes.length ?? 0;
  const dirty = changeCount > 0;
  const reset = () => { if (v) { setNameState(v.name); setDescState(v.description); } };

  const save = async () => {
    if (!v || !state.listingId || !plan || !plan.changes.length || plan.errors.length) return;
    setSaving(true);
    try {
      const r = await apiFetch("/api/shopee/listing-edit", {
        method: "POST",
        body: JSON.stringify({
          listing_id: state.listingId, before: { name: v.name, description: v.description },
          edit: { name: plan.body.item_name ?? null, description: plan.body.description ?? null },
        }),
      });
      const j = await r.json().catch(() => ({ ok: false, view: null, error: `HTTP ${r.status}` })) as ShopeeWriteResponse;
      if (j.ok) {
        toast.success(`${j.summary ?? "บันทึกขึ้น Shopee แล้ว"} — บันทึกประวัติแล้ว`);
        (j.warnings ?? []).forEach((w) => toast.warning(w));
        setAsking(false);
        if (j.view) state.apply(j.view);
        onSaved?.(j.view?.name ?? plan.body.item_name ?? v.name);
      } else {
        toast.error(r.status === 401 ? NO_AUTH : (j.error ?? `HTTP ${r.status}`));
        if (r.status === 409 && j.view) { state.apply(j.view); setAsking(false); }
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const dialog = (
    <ConfirmDialog open={asking && !!plan} onClose={() => { if (!saving) setAsking(false); }} onConfirm={() => void save()} loading={saving}
      title={`ส่งการแก้ไข ${changeCount} ช่องขึ้นร้าน Shopee?`} confirmText="ส่งขึ้น Shopee"
      message={plan ? (
        <div className="space-y-2 text-sm">
          <p>ระบบจะแก้สินค้าบนร้าน Shopee จริงตามนี้ (ส่งเฉพาะที่เปลี่ยน · ราคา/สต๊อก/รูปไม่แตะ) · มีประวัติว่าใครแก้อะไร</p>
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
    canEdit, name, setName: setNameState, description, setDescription: setDescState,
    changeCount, errors: plan?.errors ?? [], dirty, reset, ask: () => setAsking(true), saving, dialog,
  };
}

export function ShopeeEditFooter({ edit, state }: { edit: ShopeeEditApi; state: ShopeeListingState }) {
  if (!edit.canEdit) return <span className="text-xs text-slate-400">Shopee: ดูอย่างเดียว — ไม่มีสิทธิ์ส่งขึ้นร้าน</span>;
  if (!state.view) return <span className="text-xs text-slate-400">กำลังดึงข้อมูลจาก Shopee…</span>;
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 text-xs text-slate-500">
        {edit.errors.length ? <span className="text-rose-600">{edit.errors[0]}{edit.errors.length > 1 ? ` (และอีก ${edit.errors.length - 1})` : ""}</span>
          : edit.dirty ? `แก้แล้ว ${edit.changeCount.toLocaleString()} ช่อง — ยังไม่ได้ส่งขึ้น Shopee` : "ยังไม่ได้แก้อะไร"}
      </span>
      {edit.dirty && <button type="button" onClick={edit.reset} disabled={edit.saving} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">ยกเลิกที่แก้</button>}
      <button type="button" disabled={!edit.dirty || edit.errors.length > 0 || edit.saving} onClick={edit.ask}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm text-white hover:bg-emerald-700 disabled:opacity-40"><Icon name="upload" />บันทึกขึ้น Shopee</button>
    </div>
  );
}

// ───────────────────────── เฟส 4A: เปิด / ปิดขาย (ทั้งสินค้า) ─────────────────────────
export type ShopeeDisplayApi = { request: (open: boolean) => void; busy: boolean; dialog: ReactNode };

export function useShopeeDisplay(state: ShopeeListingState, onDone?: () => void): ShopeeDisplayApi {
  const toast = useToast();
  const [ask, setAsk] = useState<{ open: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const plan = useMemo(() => (ask && state.view ? planShopeeDisplay(state.view, ask.open) : null), [ask, state.view]);

  const run = async () => {
    if (!ask || !state.listingId || !plan) return;
    if (plan.api === "none" || plan.errors.length) { setAsk(null); return; }
    setBusy(true);
    try {
      const r = await apiFetch("/api/shopee/listing-display", { method: "POST", body: JSON.stringify({ listing_id: state.listingId, open: ask.open }) });
      const j = await r.json().catch(() => ({ ok: false, view: null, error: `HTTP ${r.status}` })) as ShopeeWriteResponse;
      if (j.ok) {
        toast.success(`${j.summary ?? (ask.open ? "เปิดขาย" : "ปิดขาย")} บน Shopee — บันทึกประวัติแล้ว`);
        (j.warnings ?? []).forEach((w) => toast.warning(w));
        setAsk(null);
        if (j.view) state.apply(j.view);
        onDone?.();
      } else {
        toast.error(r.status === 401 ? NO_AUTH : (j.error ?? `HTTP ${r.status}`));
        if (j.view) state.apply(j.view);
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const verb = ask?.open ? "เปิดขาย" : "ปิดขาย";
  const dialog = (
    <ConfirmDialog open={!!ask} onClose={() => { if (!busy) setAsk(null); }} onConfirm={() => void run()} loading={busy}
      title={`${verb}ทั้งสินค้าบน Shopee?`}
      confirmText={plan && (plan.api === "none" || plan.errors.length) ? "ปิดหน้าต่าง" : verb}
      variant={ask && !ask.open ? "danger" : undefined}
      message={plan ? (
        <div className="space-y-2 text-sm">
          {plan.errors.length ? <p className="text-rose-600">{plan.errors[0]}</p>
            : plan.api === "none" ? <p>{plan.summary} — ไม่มีอะไรต้องส่ง</p>
            : <p>{ask?.open ? "สินค้าจะกลับมาขายทุกตัวเลือก" : "ลูกค้าจะมองไม่เห็นและสั่งซื้อไม่ได้ทันที (ทุกตัวเลือก)"} · ส่งขึ้นร้าน Shopee จริง · มีประวัติว่าใครกด</p>}
          {plan.warnings.map((w, i) => <p key={i} className="flex items-start gap-1 text-xs text-amber-700"><Icon name="warning" className="mt-0.5 shrink-0" />{w}</p>)}
        </div>
      ) : ""} />
  );
  return { request: (open) => setAsk({ open }), busy, dialog };
}

const baht = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`);
const thTime = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }); };
const TONE_CLS: Record<string, string> = { ok: "bg-emerald-50 text-emerald-700", off: "bg-slate-100 text-slate-600", warn: "bg-amber-50 text-amber-700", bad: "bg-rose-50 text-rose-700" };

/** ป้ายสถานะ + สวิตช์เปิด/ปิดขายทั้งสินค้า + ปุ่มดึงตัวนี้ (หัวลิ้นชัก) */
export function ShopeeHeaderStatus({ state, disp, dirty }: { state: ShopeeListingState; disp: ShopeeDisplayApi | null; dirty?: boolean }) {
  const v = state.view;
  const b = v ? shopeeStatusBadge(v.status) : null;
  const open = !!v && shopeeIsOpen(v);
  const toggleable = !!v && (v.status === "NORMAL" || v.status === "UNLIST");
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {b && <span className={`rounded-full px-2 py-0.5 text-[11px] ${TONE_CLS[b.tone]}`}>{b.label}</span>}
        {v?.inPromotion && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] text-orange-700" title="อยู่ในโปรโมชันของร้าน — ปิดขาย/แก้ราคาบางแบบไม่ได้จนกว่าจะออกจากโปรโมชัน">ในโปรโมชัน</span>}
        {v && disp && toggleable && (
          <ToggleSwitch on={open} disabled={disp.busy} size="sm" label={<span className="text-xs text-slate-600">{open ? "เปิดขาย" : "ปิดขาย"}</span>}
            title="เปิด/ปิดขายทั้งสินค้าบน Shopee (ถามก่อน)" onChange={(on) => disp.request(on)} />
        )}
      </div>
      <button type="button" disabled={state.refreshing || state.loading || !!dirty} onClick={() => void state.refresh()}
        title={dirty ? "มีที่แก้ค้างอยู่ — บันทึกหรือยกเลิกก่อน" : "ดึงข้อมูลสินค้าตัวนี้จาก Shopee ใหม่ และอัปเดตในระบบ (ไม่แก้อะไรบนร้าน)"}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
        <Icon name="refresh" />{state.refreshing ? "กำลังดึง..." : "ดึงตัวนี้จาก Shopee"}
      </button>
      {state.fetchedAt && <span className="text-[10px] text-slate-400">ข้อมูลสดจาก Shopee {thTime(state.fetchedAt)}</span>}
    </div>
  );
}

/** โหลด / พัง → ข้อความเดียวกันทุกแท็บ · null = มีข้อมูลแล้ว */
function gate(state: ShopeeListingState) {
  if (state.loading && !state.view) return <LoadingState label="กำลังดึงข้อมูลจาก Shopee…" />;
  if (state.error && !state.view) return <ErrorState title={state.error} onRetry={state.reload} />;
  if (!state.view) return <LoadingState label="กำลังดึงข้อมูลจาก Shopee…" />;
  return null;
}

function ReadField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <div className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{children}</div>
      {hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}
    </div>
  );
}

function Counter({ n, min, max }: { n: number; min: number | null | undefined; max: number | null | undefined }) {
  const bad = (min != null && n < min) || (max != null && n > max);
  return <span className={`text-[11px] ${bad ? "text-rose-600" : "text-slate-400"}`}>{n.toLocaleString()}{max != null ? ` / ${max.toLocaleString()}` : ""} ตัวอักษร{min != null ? ` (อย่างน้อย ${min})` : ""}</span>;
}

/** แท็บข้อมูลสินค้า — แก้ชื่อ/รายละเอียดได้เมื่อมีสิทธิ์ · ที่เหลือดูอย่างเดียว */
export function ShopeeInfoPanel({ state, edit }: { state: ShopeeListingState; edit: ShopeeEditApi }) {
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const lockedStatus = v.status === "SELLER_DELETE" || v.status === "SHOPEE_DELETE";
  const can = edit.canEdit && !lockedStatus && edit.name != null;
  const L = v.limits;
  const name = edit.name ?? v.name;
  const desc = edit.description ?? v.description;
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">ชื่อสินค้าบน Shopee</span>
          <Counter n={shopeeTextLength(name)} min={L?.nameMin} max={L?.nameMax} />
        </div>
        {can
          ? <input value={name} onChange={(e) => edit.setName(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-violet-400 focus:outline-none" />
          : <div className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{v.name}</div>}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">รายละเอียดสินค้า{v.descriptionEditable ? "" : " (แบบมีรูป — แก้ใน Seller Centre)"}</span>
          <Counter n={shopeeTextLength(desc)} min={L?.descMin} max={L?.descMax} />
        </div>
        {can && v.descriptionEditable
          ? <textarea value={desc} onChange={(e) => edit.setDescription(e.target.value)} rows={10} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:border-violet-400 focus:outline-none" />
          : <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{v.description || "—"}</div>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadField label="รหัสสินค้าบน Shopee">{v.itemId}{v.itemSku ? ` · SKU ${v.itemSku}` : ""}</ReadField>
        <ReadField label="แบรนด์">{v.brand ?? "—"}</ReadField>
        <ReadField label="หมวด (รหัส Shopee)">{v.categoryId ?? "—"}</ReadField>
        <ReadField label="น้ำหนัก / กล่อง">{v.weight != null ? `${v.weight} กก.` : "—"}{v.dims ? ` · ${v.dims.length ?? "?"}×${v.dims.width ?? "?"}×${v.dims.height ?? "?"} ซม.` : ""}</ReadField>
      </div>
      <p className="text-[11px] text-slate-400">แก้ได้ตอนนี้: ชื่อ + รายละเอียด (แบบข้อความ) · รูป/ตัวเลือก/ราคา ดูอย่างเดียว (เปิดในเฟสถัดไป) · สต๊อกไม่แก้จากระบบ (BigSeller ยังซิงค์อยู่)</p>
    </div>
  );
}

/** แท็บรูป — ดูอย่างเดียวในเฟส 4A */
export function ShopeeImagesPanel({ state, onOpen }: { state: ShopeeListingState; onOpen: (index: number) => void }) {
  const g = gate(state); if (g) return g;
  const v = state.view!;
  return <ListingImageGrid images={v.images} onChange={() => { /* ดูอย่างเดียว */ }} canEdit={false} max={v.limits?.imagesMax ?? 9} platformName="Shopee"
    onOpen={onOpen} onAdd={() => { /* ดูอย่างเดียว */ }} canAdd={false} note="ดูอย่างเดียว — แก้รูปบน Shopee จะเปิดในเฟสถัดไป" />;
}

/** แท็บตัวเลือก & ราคา — ดูอย่างเดียวในเฟส 4A (ราคาตั้ง/ราคาที่ลูกค้าจ่าย/สต๊อกบนร้าน) */
export function ShopeeOptionsPanel({ state }: { state: ShopeeListingState }) {
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const rows: ShopeeModelView[] = v.hasModel ? v.models
    : [{ modelId: "0", sku: v.itemSku, label: "สินค้าเดียว (ไม่มีตัวเลือก)", price: v.price, originalPrice: v.originalPrice, stock: v.stock, image: v.images[0] ?? null, status: null }];
  const cols: MiniColumn<ShopeeModelView>[] = [
    { key: "img", header: "", width: "3rem", cell: (m) => (m.image ? <img src={m.image} alt="" className="h-9 w-9 rounded object-cover" /> : <div className="h-9 w-9 rounded bg-slate-100" />) },
    { key: "opt", header: "ตัวเลือก", width: "1.6fr", cell: (m) => (
      <div className="min-w-0"><div className="truncate" title={m.label ?? ""}>{m.label ?? "—"}</div><div className="truncate font-mono text-[11px] text-slate-400">{m.sku ?? "ไม่มีรหัส"}</div></div>
    ) },
    { key: "orig", header: "ราคาตั้ง", width: "6rem", align: "right", sortValue: (m) => m.originalPrice, cell: (m) => <span className="text-slate-500">{baht(m.originalPrice)}</span> },
    { key: "price", header: "ลูกค้าจ่าย", width: "6rem", align: "right", sortValue: (m) => m.price, cell: (m) => <span className={m.price != null && m.originalPrice != null && m.price < m.originalPrice ? "font-medium text-rose-600" : ""}>{baht(m.price)}</span> },
    { key: "stock", header: "สต๊อกบนร้าน", width: "6rem", align: "right", sortValue: (m) => m.stock, cell: (m) => (m.stock == null ? "—" : m.stock.toLocaleString()) },
  ];
  return (
    <div className="space-y-2">
      <MiniTable rows={rows} columns={cols} rowKey={(m) => m.modelId} dense hideToolbar emptyText="ไม่มีตัวเลือก" resizable storageKey="listing-drawer-shopee-options" />
      <p className="text-[11px] text-slate-400">ดูอย่างเดียว — แก้ราคาจะเปิดในเฟสถัดไป · สต๊อกบนร้านไว้ดูเทียบเท่านั้น (BigSeller ยังซิงค์อยู่ ระบบไม่ส่งสต๊อก)</p>
    </div>
  );
}
