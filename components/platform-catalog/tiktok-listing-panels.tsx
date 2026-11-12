"use client";
/**
 * เนื้อหาแท็บของสินค้าบน TikTok Shop ในลิ้นชักสินค้าบนร้าน (listing-drawer) — แบบเดียวกับ ./lazada-listing-panels
 *
 *   const tt   = useTiktokListing(isTiktok ? listingId : null, onSaved);   // ดึงสดจาก TikTok ตอนเปิด
 *   const edit = useTiktokEdit(tt, canEdit, onSaved);                       // เฟส A: แก้ชื่อ → ส่งขึ้น TikTok (ถามก่อน)
 *   const disp = useTiktokDisplay(tt, onDone);                              // เฟส A: เปิด/ปิดขายทั้งสินค้า (ถามก่อน)
 *   <TiktokHeaderStatus …/>  <TiktokInfoPanel …/>  <TiktokImagesPanel …/>  <TiktokOptionsPanel …/>
 *   footer = <TiktokEditFooter …/> · {edit.dialog}{disp.dialog}
 *
 * ข้อมูล: GET /api/tiktok-shop/listing-detail (ดึงสด ไม่บันทึก) · ปุ่ม "ดึงตัวนี้จาก TikTok" = POST (อัปเดตสำเนาย่อในระบบด้วย)
 * ส่งขึ้นร้านจริง (ถามก่อนเสมอ · มีประวัติ): POST /api/tiktok-shop/listing-edit · /api/tiktok-shop/listing-display
 * กฎ: lib/tiktok-listing-edit (pure + เทสต์ — หน้าเว็บกับ API ใช้ตัวเดียวกัน) · แผนเฟส: docs/tiktok-shop-connector.md
 * เฟส B: ราคาต่อตัวเลือก (แท็บตัวเลือก & ราคา → POST /api/tiktok-shop/listing-prices · มีผลทันที) — ปุ่มบันทึกเดียวกับชื่อ
 * ยังไม่ทำ: รายละเอียด · รูป · สต๊อก (BigSeller ยังซิงค์สต๊อกอยู่) — ดูอย่างเดียว
 * ของกลางที่ใช้: MiniTable · MoneyInput · ConfirmDialog · ToggleSwitch · state-views · Icon · sanitizeRichHtml
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { MoneyInput } from "@/components/money-input";
import {
  applyTiktokBulkPrice, planTiktokDisplay, planTiktokPrices, planTiktokTitle, tiktokIsOpen, tiktokPriceBlock, tiktokPriceChangeText, tiktokPriceRowsFromView, tiktokStatusBadge, ttsTitleLength,
  TTS_PRICE_MAX, TTS_PRICE_MIN, TTS_TITLE_MAX, TTS_TITLE_MIN,
  type TiktokListingDetailResponse, type TiktokListingView, type TiktokPricePlan, type TiktokPriceRow, type TiktokSkuView, type TiktokWriteResponse,
} from "@/lib/tiktok-listing-edit";

export type TiktokListingState = {
  listingId: string | null;
  view: TiktokListingView | null;
  error: string | null;
  loading: boolean;
  fetchedAt: string | null;
  reload: () => void;
  /** ดึงตัวนี้จาก TikTok + อัปเดตสำเนาในระบบ */
  refresh: () => Promise<void>;
  refreshing: boolean;
  /** ใช้ข้อมูลล่าสุดที่ API ส่งกลับ (หลังส่งขึ้นร้าน) */
  apply: (view: TiktokListingView) => void;
};

const NO_AUTH = "ไม่มีสิทธิ์ส่งขึ้นร้าน หรือระบบยังไม่ยืนยันการล็อกอิน — รอสักครู่แล้วลองใหม่";

/** ดึงสินค้าตัวนี้สดจาก TikTok เมื่อเปิดลิ้นชัก (listingId = null → ไม่ทำอะไร) */
export function useTiktokListing(listingId: string | null, onSaved?: () => void): TiktokListingState {
  const toast = useToast();
  const [view, setView] = useState<TiktokListingView | null>(null);
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
    apiFetch(`/api/tiktok-shop/listing-detail?listing_id=${encodeURIComponent(listingId)}`)
      .then((r) => r.json().catch(() => ({ view: null, fetched_at: null, error: `HTTP ${r.status}` })) as Promise<TiktokListingDetailResponse>)
      .then((j) => {
        if (my !== seq.current) return;
        if (j.error || !j.view) { setError(j.error ?? "ดึงข้อมูลจาก TikTok ไม่สำเร็จ"); setView(null); return; }
        setView(j.view); setFetchedAt(j.fetched_at);
      })
      .catch(() => { if (my === seq.current) setError("ดึงข้อมูลจาก TikTok ไม่สำเร็จ — ลองใหม่อีกครั้ง"); })
      .finally(() => { if (my === seq.current) setLoading(false); });
  }, [listingId, n]);

  const refresh = useCallback(async () => {
    if (!listingId) return;
    setRefreshing(true);
    const my = ++seq.current;
    try {
      const r = await apiFetch("/api/tiktok-shop/listing-detail", { method: "POST", body: JSON.stringify({ listing_id: listingId }) });
      const j = await r.json().catch(() => ({ view: null, fetched_at: null, error: `HTTP ${r.status}` })) as TiktokListingDetailResponse;
      if (my !== seq.current) return;
      if (j.view) { setView(j.view); setFetchedAt(j.fetched_at); setError(null); }
      if (j.error) toast.error(r.status === 401 ? "ระบบยังไม่ยืนยันการล็อกอิน/สิทธิ์ — รอสักครู่แล้วกดใหม่ (ถ้ายังไม่ได้ ลองรีเฟรชหน้า)" : j.error);
      else { toast.success("ดึงข้อมูลจาก TikTok แล้ว — อัปเดตในระบบแล้ว"); onSaved?.(); }
    } catch (e) { toast.error((e as Error).message); }
    finally { setRefreshing(false); }
  }, [listingId, onSaved, toast]);

  const apply = useCallback((v: TiktokListingView) => { ++seq.current; setView(v); setFetchedAt(new Date().toISOString()); setError(null); setLoading(false); }, []);
  return { listingId, view, error, loading, fetchedAt, reload: () => setN((x) => x + 1), refresh, refreshing, apply };
}

// ───────────────────────── เฟส A: แก้ชื่อ + เฟส B: ราคา (ปุ่มบันทึกเดียว) ─────────────────────────
export type TiktokEditApi = {
  canEdit: boolean;
  /** ชื่อตั้งต้น = ชื่อที่รอตรวจ (ถ้ามี) ไม่งั้นชื่อบนร้าน */
  baseTitle: string | null;
  title: string | null;
  setTitle: (v: string) => void;
  /** เฟส B: ราคาต่อตัวเลือก (null = ยังไม่มีข้อมูล) */
  prices: TiktokPriceRow[] | null;
  setPrice: (skuId: string, price: number | null) => void;
  setPrices: (rows: TiktokPriceRow[]) => void;
  /** แก้ราคาไม่ได้เพราะอะไร (สินค้าไม่ได้เปิดขาย) · null = แก้ได้ */
  priceBlock: string | null;
  pricePlan: TiktokPricePlan | null;
  /** จำนวนรายการที่แก้ (ชื่อ + ราคาแต่ละตัว) */
  changeCount: number;
  errors: string[];
  dirty: boolean;
  reset: () => void;
  ask: () => void;
  saving: boolean;
  dialog: ReactNode;
};

export function useTiktokEdit(state: TiktokListingState, canEdit: boolean, onSaved?: (title: string) => void): TiktokEditApi {
  const toast = useToast();
  const baseTitle = state.view ? (state.view.pendingTitle ?? state.view.title) : null;
  const priceBase = useMemo(() => (state.view ? tiktokPriceRowsFromView(state.view) : null), [state.view]);
  const priceBlock = state.view ? tiktokPriceBlock(state.view) : null;
  const [title, setTitle] = useState<string | null>(null);
  const [prices, setPricesState] = useState<TiktokPriceRow[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  // ข้อมูลจากร้านเปลี่ยน (เปิดตัวใหม่ / ดึงใหม่ / ส่งสำเร็จ) → ฟอร์มเริ่มจากของล่าสุด
  useEffect(() => { setTitle(baseTitle); }, [baseTitle]);
  useEffect(() => { setPricesState(priceBase ? priceBase.map((r) => ({ ...r })) : null); }, [priceBase]);
  const plan = useMemo(() => (baseTitle != null && title != null ? planTiktokTitle(baseTitle, title) : null), [baseTitle, title]);
  const pricePlan = useMemo(() => (priceBase && prices ? planTiktokPrices(priceBase, prices) : null), [priceBase, prices]);
  const titleDirty = !!plan?.changed;
  const priceDirty = !!pricePlan && pricePlan.changes.length > 0;
  const dirty = titleDirty || priceDirty;
  const changeCount = (titleDirty ? 1 : 0) + (pricePlan?.changes.length ?? 0);
  const errors = [...(plan?.errors ?? []), ...(pricePlan?.errors ?? [])];

  const post = async (url: string, payload: unknown) => {
    const r = await apiFetch(url, { method: "POST", body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({ ok: false, view: null, error: `HTTP ${r.status}` })) as TiktokWriteResponse;
    return { r, j };
  };
  // ส่งทีละส่วน: ราคา (มีผลทันที) → ชื่อ (ส่งตรวจ) · ส่วนแรกพลาด = ไม่ส่งต่อ
  const save = async () => {
    if (!state.listingId || baseTitle == null || !priceBase || !prices) return;
    setSaving(true);
    const done: string[] = [];
    let saved = false;
    let lastView: TiktokListingView | null = null;
    try {
      if (priceDirty) {
        const { r, j } = await post("/api/tiktok-shop/listing-prices", { listing_id: state.listingId, before: priceBase, edit: prices });
        if (!j.ok) {
          toast.error(r.status === 401 ? NO_AUTH : `ราคา: ${j.error ?? `HTTP ${r.status}`}${titleDirty ? " (ยังไม่ได้ส่งชื่อ)" : ""}`);
          if (r.status === 409 && j.view) { setAsking(false); state.apply(j.view); }
          return;
        }
        saved = true; done.push(j.summary ?? "ราคา");
        (j.warnings ?? []).forEach((w) => toast.warning(w));
        if (j.view) lastView = j.view;
      }
      if (titleDirty && plan) {
        const { r, j } = await post("/api/tiktok-shop/listing-edit", { listing_id: state.listingId, before_title: baseTitle, title: plan.title });
        if (!j.ok) {
          toast.error(r.status === 401 ? NO_AUTH : `ชื่อ: ${j.error ?? `HTTP ${r.status}`}`);
          if (j.view) lastView = j.view;
          if (r.status === 409) setAsking(false);
          if (!saved) { if (lastView) state.apply(lastView); return; }
        } else {
          saved = true; done.push(j.summary ?? "แก้ชื่อแล้ว");
          (j.warnings ?? []).forEach((w) => toast.warning(w));
          if (j.view) lastView = j.view;
        }
      }
      if (done.length) toast.success(`ส่งขึ้น TikTok แล้ว: ${done.join(" · ")} — บันทึกประวัติแล้ว`);
      setAsking(false);
      if (lastView) state.apply(lastView);
    } catch (e) { toast.error(`ส่งขึ้น TikTok ไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setSaving(false); if (saved) onSaved?.(plan?.title ?? baseTitle); }
  };

  const warnings = [...(titleDirty ? plan?.warnings ?? [] : []), ...(priceDirty ? pricePlan?.warnings ?? [] : [])];
  const dialog = (
    <ConfirmDialog open={asking && dirty} onClose={() => { if (!saving) setAsking(false); }} onConfirm={() => void save()} loading={saving}
      title={`ส่งการแก้ไข ${changeCount.toLocaleString()} รายการขึ้นร้าน TikTok?`} confirmText="ส่งขึ้น TikTok"
      message={(
        <div className="space-y-2 text-sm">
          <p>ระบบจะแก้สินค้าบนร้าน TikTok จริงตามนี้ (ส่งเฉพาะที่เปลี่ยน · ไม่แตะสต๊อก/รูป/สถานะเปิดปิด) · มีประวัติว่าใครแก้อะไร</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
            {titleDirty && plan && <li><span className="font-medium text-slate-700">ชื่อสินค้า:</span> <span className="text-slate-400 line-through">{baseTitle}</span> → <span className="text-slate-800">{plan.title}</span></li>}
            {(pricePlan?.changes ?? []).map((c) => (
              <li key={c.skuId}><span className="font-medium text-slate-700">ราคา {c.label}:</span> <span className="text-slate-800">{tiktokPriceChangeText(c)}</span></li>
            ))}
          </ul>
          {warnings.map((w, i) => <p key={i} className="flex items-start gap-1 text-xs text-amber-700"><Icon name="warning" className="mt-0.5 shrink-0" />{w}</p>)}
        </div>
      )} />
  );
  return {
    canEdit, baseTitle, title, prices, priceBlock, pricePlan, changeCount, errors, dirty, saving, dialog,
    setTitle: (v) => setTitle(v),
    setPrice: (skuId, price) => setPricesState((rows) => (rows ? rows.map((r) => (r.skuId === skuId ? { ...r, price } : r)) : rows)),
    setPrices: (rows) => setPricesState(rows),
    reset: () => { setTitle(baseTitle); if (priceBase) setPricesState(priceBase.map((r) => ({ ...r }))); },
    ask: () => setAsking(true),
  };
}

/** แถบท้ายลิ้นชัก (TikTok) — สถานะการแก้ + ยกเลิก + บันทึกขึ้น TikTok (ชื่อ + ราคา ปุ่มเดียว) */
export function TiktokEditFooter({ edit, state }: { edit: TiktokEditApi; state: TiktokListingState }) {
  if (!edit.canEdit) return <span className="text-xs text-slate-400">TikTok: ดูอย่างเดียว — ไม่มีสิทธิ์ส่งขึ้นร้าน</span>;
  if (!state.view) return <span className="text-xs text-slate-400">กำลังดึงข้อมูลจาก TikTok…</span>;
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 text-xs text-slate-500">
        {edit.errors.length ? <span className="text-rose-600">{edit.errors[0]}{edit.errors.length > 1 ? ` (และอีก ${edit.errors.length - 1})` : ""}</span>
          : edit.dirty ? `แก้แล้ว ${edit.changeCount.toLocaleString()} รายการ — ยังไม่ได้ส่งขึ้น TikTok` : "ยังไม่ได้แก้อะไร"}
      </span>
      {edit.dirty && <button type="button" onClick={edit.reset} disabled={edit.saving} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">ยกเลิกที่แก้</button>}
      <button type="button" disabled={!edit.dirty || edit.errors.length > 0 || edit.saving} onClick={edit.ask}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm text-white hover:bg-emerald-700 disabled:opacity-40"><Icon name="upload" />บันทึกขึ้น TikTok</button>
    </div>
  );
}

// ───────────────────────── เฟส A: เปิด / ปิดขาย (ทั้งสินค้า) ─────────────────────────
export type TiktokDisplayApi = { request: (open: boolean) => void; busy: boolean; dialog: ReactNode };

export function useTiktokDisplay(state: TiktokListingState, onDone?: () => void): TiktokDisplayApi {
  const toast = useToast();
  const [ask, setAsk] = useState<{ open: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const plan = useMemo(() => (ask && state.view ? planTiktokDisplay(state.view, ask.open) : null), [ask, state.view]);

  const run = async () => {
    if (!ask || !state.listingId || !plan) return;
    if (plan.api === "none") { setAsk(null); return; }
    setBusy(true);
    try {
      const r = await apiFetch("/api/tiktok-shop/listing-display", { method: "POST", body: JSON.stringify({ listing_id: state.listingId, open: ask.open }) });
      const j = await r.json().catch(() => ({ ok: false, view: null, error: `HTTP ${r.status}` })) as TiktokWriteResponse;
      if (j.ok) {
        toast.success(`${j.summary ?? (ask.open ? "เปิดขาย" : "ปิดขาย")} บน TikTok — บันทึกประวัติแล้ว`);
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
      title={`${verb}ทั้งสินค้าบน TikTok?`}
      confirmText={plan && plan.api === "none" ? "ปิดหน้าต่าง" : verb}
      variant={ask && !ask.open ? "danger" : undefined}
      message={plan ? (
        <div className="space-y-2 text-sm">
          {plan.errors.length ? <p className="text-rose-600">{plan.errors[0]}</p>
            : plan.api === "none" ? <p>{plan.summary} — ไม่มีอะไรต้องส่ง</p>
            : <p>{ask?.open ? "ส่งคำขอเปิดขายทั้งสินค้า" : "ลูกค้าจะมองไม่เห็นและสั่งซื้อไม่ได้ทันที (ทุกตัวเลือก)"} · ส่งขึ้นร้าน TikTok จริง · มีประวัติว่าใครกด</p>}
          {plan.warnings.map((w, i) => <p key={i} className="flex items-start gap-1 text-xs text-amber-700"><Icon name="warning" className="mt-0.5 shrink-0" />{w}</p>)}
        </div>
      ) : ""} />
  );
  return { request: (open) => setAsk({ open }), busy, dialog };
}

const baht = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`);
const thTime = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }); };
const TONE_CLS: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700", off: "bg-slate-100 text-slate-600", wait: "bg-amber-50 text-amber-700", bad: "bg-rose-50 text-rose-700", none: "bg-slate-100 text-slate-500",
};

/** ป้ายสถานะ + สวิตช์เปิด/ปิดขายทั้งสินค้า + ปุ่มดึงตัวนี้ (หัวลิ้นชัก) */
export function TiktokHeaderStatus({ state, disp, dirty }: { state: TiktokListingState; disp: TiktokDisplayApi | null; dirty?: boolean }) {
  const v = state.view;
  const b = v ? tiktokStatusBadge(v.status) : null;
  const open = !!v && tiktokIsOpen(v);
  // สวิตช์ใช้ได้เฉพาะสถานะที่ TikTok ยอมให้เปิด/ปิด (เปิดขายอยู่ / ร้านหรือ TikTok ปิดไว้)
  const toggleable = !!v && ["ACTIVATE", "SELLER_DEACTIVATED", "PLATFORM_DEACTIVATED"].includes(v.productStatus ?? "");
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {b && <span className={`rounded-full px-2 py-0.5 text-[11px] ${TONE_CLS[b.tone]}`}>{b.label}</span>}
        {v && disp && toggleable && (
          <ToggleSwitch on={open} disabled={disp.busy} size="sm" label={<span className="text-xs text-slate-600">{open ? "เปิดขาย" : "ปิดขาย"}</span>}
            title="เปิด/ปิดขายทั้งสินค้าบน TikTok (ถามก่อน) — เปิดขาย = TikTok ตรวจก่อน"
            onChange={(on) => disp.request(on)} />
        )}
      </div>
      <button type="button" disabled={state.refreshing || state.loading || !!dirty} onClick={() => void state.refresh()}
        title={dirty ? "มีที่แก้ค้างอยู่ — บันทึกหรือยกเลิกก่อน" : "ดึงข้อมูลสินค้าตัวนี้จาก TikTok ใหม่ และอัปเดตในระบบ (ไม่แก้อะไรบนร้าน)"}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
        <Icon name="refresh" />{state.refreshing ? "กำลังดึง..." : "ดึงตัวนี้จาก TikTok"}
      </button>
      {state.fetchedAt && <span className="text-[10px] text-slate-400">ข้อมูลสดจาก TikTok {thTime(state.fetchedAt)}</span>}
    </div>
  );
}

/** โหลด / พัง → ข้อความเดียวกันทุกแท็บ · null = มีข้อมูลแล้ว */
function gate(state: TiktokListingState) {
  if (state.loading && !state.view) return <LoadingState label="กำลังดึงข้อมูลจาก TikTok…" />;
  if (state.error && !state.view) return <ErrorState title={state.error} onRetry={state.reload} />;
  if (!state.view) return <LoadingState label="กำลังดึงข้อมูลจาก TikTok…" />;
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

/** แท็บข้อมูลสินค้า — แก้ชื่อได้เมื่อมีสิทธิ์ · รายละเอียดดูอย่างเดียว (เฟสถัดไป) */
export function TiktokInfoPanel({ state, edit }: { state: TiktokListingState; edit: TiktokEditApi }) {
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const can = edit.canEdit && edit.title != null && v.productStatus !== "FREEZE" && v.productStatus !== "DELETED";
  const t = edit.title ?? v.title;
  const n = ttsTitleLength(t.replace(/\s+/g, " ").trim());
  const desc = sanitizeRichHtml(v.description);
  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-start gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <Icon name="info" className="mt-0.5 shrink-0" />
        {can ? "ข้อมูลสดจากร้าน TikTok · แก้ชื่อแล้วกด “บันทึกขึ้น TikTok” ด้านล่าง (ถามก่อนส่ง) · TikTok จะตรวจชื่อใหม่ก่อน ระหว่างตรวจร้านยังขายชื่อเดิม · ราคาแก้ที่แท็บตัวเลือก & ราคา (มีผลทันที) · รายละเอียด/รูป ยังแก้จากที่นี่ไม่ได้" : "ดูอย่างเดียว — ข้อมูลสดจากร้าน TikTok"}
      </p>
      {v.rejectReasons.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <div className="mb-0.5 font-medium">เหตุผลจาก TikTok</div>
          <ul className="list-disc space-y-0.5 pl-4">{v.rejectReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {v.pendingTitle && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <div className="font-medium">ชื่อใหม่รอ TikTok ตรวจ</div>
          <div className="mt-0.5">{v.pendingTitle}</div>
          <div className="mt-0.5 text-amber-700/80">ระหว่างนี้ร้านยังขายด้วยชื่อ: {v.title}</div>
        </div>
      )}
      {can ? (
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">ชื่อสินค้าบน TikTok</span>
          <textarea value={t} onChange={(e) => edit.setTitle(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <span className={`mt-0.5 block text-[11px] ${n < TTS_TITLE_MIN || n > TTS_TITLE_MAX ? "text-rose-600" : "text-slate-400"}`}>{n.toLocaleString()} ตัวอักษร (TikTok ไทยรับ {TTS_TITLE_MIN}–{TTS_TITLE_MAX})</span>
        </label>
      ) : <Field label="ชื่อสินค้าบน TikTok" hint={`${n.toLocaleString()} ตัวอักษร`}>{v.title || <span className="text-slate-400">(ไม่มีชื่อ)</span>}</Field>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="แบรนด์">{v.brand ?? "—"}</Field>
        <Field label="หมวดบน TikTok">{v.category ?? "—"}</Field>
      </div>
      <div>
        <span className="mb-1 block text-xs text-slate-500">รายละเอียดสินค้า (ดูอย่างเดียว)</span>
        <div className="tiptap-content max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm [&_img]:max-w-full [&_img]:rounded"
          dangerouslySetInnerHTML={{ __html: desc || "<p class=\"text-slate-400\">(ไม่มีรายละเอียด)</p>" }} />
      </div>
    </div>
  );
}

/** แท็บรูป — ดูอย่างเดียว (แก้รูปเป็นเฟสถัดไป) */
export function TiktokImagesPanel({ state, onOpen }: { state: TiktokListingState; onOpen: (index: number) => void }) {
  const g = gate(state); if (g) return g;
  const v = state.view!;
  if (!v.images.length) return <p className="text-xs text-slate-500">สินค้านี้ไม่มีรูปบน TikTok</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">รูปบนร้าน TikTok {v.images.length.toLocaleString()} รูป (ดูอย่างเดียว · TikTok รับสูงสุด 9 รูป)</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {v.images.map((u, i) => (
          <button key={`${u}-${i}`} type="button" onClick={() => onOpen(i)} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <img src={u} alt="" loading="lazy" className="h-full w-full object-cover" />
            {i === 0 && <span className="absolute left-1 top-1 rounded bg-slate-900/70 px-1.5 text-[10px] text-white">ปก</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

const numOrNull = (raw: string) => { const n = Number(raw); return raw.trim() === "" || !Number.isFinite(n) ? null : n; };

/** แก้ราคาหลายตัวเลือกพร้อมกัน — เติมฟอร์มอย่างเดียว ยังไม่ส่ง (applyTiktokBulkPrice) */
function TiktokBulkPriceBar({ edit, selected }: { edit: TiktokEditApi; selected: Set<string> }) {
  const [price, setPrice] = useState("");
  const [pct, setPct] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const apply = () => {
    if (!edit.prices) return;
    const r = applyTiktokBulkPrice(edit.prices, selected, { price: numOrNull(price), pct: numOrNull(pct) });
    setErr(r.error ?? (r.changed === 0 ? "ราคาเท่าเดิมทุกตัว — ไม่มีอะไรเปลี่ยน" : null));
    if (!r.error) edit.setPrices(r.rows);
  };
  const n = selected.size || (edit.prices?.length ?? 0);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-2.5 py-2 text-xs text-violet-900">
      <span className="font-medium">แก้{selected.size ? `ตัวที่ติ๊ก (${selected.size})` : `ทุกตัวเลือก (${n})`}พร้อมกัน:</span>
      <label className="inline-flex items-center gap-1">ตั้งราคา<MoneyInput value={price} onChange={(raw) => { setPrice(raw); setErr(null); }} placeholder="ไม่เปลี่ยน" className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2 text-right" /></label>
      <label className="inline-flex items-center gap-1">หรือ ปรับ<input type="number" min="-99" max="500" value={pct} onChange={(e) => { setPct(e.target.value); setErr(null); }} placeholder="-10" className="h-8 w-16 rounded-md border border-slate-200 bg-white px-2 text-right" />%</label>
      <button type="button" onClick={apply} className="h-8 rounded-md bg-violet-600 px-2.5 text-white hover:bg-violet-700">ใช้กับ{selected.size ? `ที่ติ๊ก ${selected.size} ตัว` : "ทุกตัว"}</button>
      {err && <span className="w-full text-rose-600">{err}</span>}
      <span className="w-full text-[11px] text-violet-700/80">ปรับ % คิดจากราคาตอนนี้ ปัดเป็นบาทเต็ม (−10 = ลด 10%) · กดแล้วยังไม่ส่ง — ต้องกด “บันทึกขึ้น TikTok” (โชว์ก่อน → หลัง ให้ตรวจ)</span>
    </div>
  );
}

/** แท็บตัวเลือก & ราคา — เฟส B แก้ราคาได้เมื่อมีสิทธิ์และสินค้าเปิดขายอยู่ · สต๊อกดูอย่างเดียว */
export function TiktokOptionsPanel({ state, edit }: { state: TiktokListingState; edit?: TiktokEditApi | null }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const canPrice = !!edit?.canEdit && !!edit.prices && !edit.priceBlock;
  const rowOf = new Map((edit?.prices ?? []).map((r) => [r.skuId, r]));
  const cols: MiniColumn<TiktokSkuView>[] = [
    { key: "opt", header: "ตัวเลือก", width: "1.6fr", cell: (s) => <div className="min-w-0"><div className="truncate" title={s.label}>{s.label}</div><div className="truncate font-mono text-[11px] text-slate-400">{s.sellerSku ?? "ไม่มีรหัส"}</div></div> },
    canPrice
      ? {
        key: "price", header: "ราคา (บาท)", width: "7.5rem", align: "right",
        cell: (s) => {
          const r = rowOf.get(s.skuId);
          const changed = r != null && r.price !== s.price;
          return (
            <span className="block leading-tight">
              <MoneyInput value={r?.price ?? null} onChange={(raw) => edit!.setPrice(s.skuId, numOrNull(raw))}
                className={`h-8 w-full rounded-md border px-2 text-right text-sm ${changed ? "border-violet-400 bg-violet-50" : "border-slate-200"}`} />
              {changed && <span className="block text-right text-[11px] text-slate-400 line-through">{baht(s.price)}</span>}
            </span>
          );
        },
      }
      : { key: "price", header: "ราคา", width: "6rem", align: "right", cell: (s) => <span>{baht(s.price)}</span> },
    { key: "stock", header: "สต๊อก", width: "4.5rem", align: "right", cell: (s) => (s.stock == null ? <span className="text-slate-300">—</span> : <span className={s.stock === 0 ? "text-rose-600" : ""}>{s.stock.toLocaleString()}</span>) },
    { key: "st", header: "สถานะ", width: "5.5rem", cell: (s) => (s.status === "DEACTIVATED" ? <span className="text-slate-500">ปิด</span> : s.status === "NORMAL" ? <span className="text-emerald-700">ปกติ</span> : <span className="text-slate-300">—</span>) },
  ];
  return (
    <div className="space-y-2">
      {canPrice && <TiktokBulkPriceBar edit={edit!} selected={selected} />}
      {edit?.canEdit && edit.priceBlock && <p className="flex items-start gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><Icon name="info" className="mt-0.5 shrink-0" />{edit.priceBlock}</p>}
      <MiniTable rows={v.skus} columns={cols} rowKey={(s) => s.skuId} dense hideToolbar emptyText="ไม่มีตัวเลือก" resizable storageKey="listing-drawer-tiktok-options"
        selectable={canPrice} selected={selected} onSelectedChange={setSelected} />
      <p className="text-[11px] text-slate-400">
        {canPrice ? `ราคา = ราคาที่ลูกค้าเห็นก่อนส่วนลด · TikTok ไทยรับ ${TTS_PRICE_MIN.toLocaleString()}–${TTS_PRICE_MAX.toLocaleString()} บาท · มีผลทันทีเมื่อกดบันทึก (ส่วนลด/โปรโมชันแก้ใน Seller Center) · ` : ""}สต๊อกดูอย่างเดียว — ยังซิงค์ผ่าน BigSeller
      </p>
    </div>
  );
}
