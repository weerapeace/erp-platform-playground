"use client";
/**
 * เนื้อหาแท็บของสินค้าบน Shopee ในลิ้นชักสินค้าบนร้าน (listing-drawer) — แบบเดียวกับ ./tiktok-listing-panels (ฉบับเบา)
 *
 *   const sp   = useShopeeListing(isShopee ? listingId : null, onSaved);   // ดึงสดจาก Shopee ตอนเปิด
 *   const edit = useShopeeEdit(sp, canEdit, onSaved);                       // เฟส 4A: แก้ชื่อ + รายละเอียด · 4B ราคา · 4C รูป → ส่งขึ้น Shopee (ถามก่อน)
 *   const disp = useShopeeDisplay(sp, onDone);                              // เฟส 4A: เปิด/ปิดขายทั้งสินค้า (ถามก่อน)
 *   <ShopeeHeaderStatus …/>  <ShopeeInfoPanel …/>  <ShopeeImagesPanel …/>  <ShopeeOptionsPanel …/>
 *   footer = <ShopeeEditFooter …/> · {edit.dialog}{disp.dialog}
 *
 * ข้อมูล: GET /api/shopee/listing-detail (ดึงสด ไม่บันทึก) · ปุ่ม "ดึงตัวนี้จาก Shopee" = POST (อัปเดตสำเนาย่อในระบบด้วย)
 * ส่งขึ้นร้านจริง (ถามก่อนเสมอ · มีประวัติ): POST /api/shopee/listing-edit · /api/shopee/listing-display
 * กฎ: lib/shopee-listing-edit (pure + เทสต์ — หน้าเว็บกับ API ใช้ตัวเดียวกัน) · แผนเฟส: docs/shopee-connector.md
 * เฟส 4B: ราคาตั้งต่อตัวเลือก (แท็บตัวเลือก & ราคา → POST /api/shopee/listing-prices · มีผลทันที) — ปุ่มบันทึกเดียวกับชื่อ (ส่งราคาก่อน)
 * เฟส 4C: รูปสินค้า (แท็บรูป — ลากเรียง/ตั้งปก/ลบ/เพิ่มจากคลังรูปในระบบ) → ส่งพร้อมชื่อใน /api/shopee/listing-edit (รูปใหม่ฝากกับ Shopee ตอนกดบันทึก)
 * 2026-11-23 (เจ้าของเลือก A + ข้อ 1-4): ข้อมูลครบแบบหน้าลงสินค้า (หมวดเต็ม · วันเตรียมส่ง · สภาพ · ขนส่ง) · รูปในรายละเอียด (ดู/เรียง/ลบ/เพิ่ม/อัปโหลด)
 *   · แท็บข้อมูลจำเพาะ (ShopeeSpecsPanel · ช่องกรอกกลาง LazadaAttrField · แนะนำจากชื่อ/รายละเอียด) — ส่งพร้อมปุ่มบันทึกเดียวกัน
 * ยังไม่ทำ: ตัวเลือก (ดูอย่างเดียว) · สต๊อก (BigSeller ยังซิงค์อยู่ — ไม่แก้)
 * ของกลางที่ใช้: MiniTable · ConfirmDialog · ToggleSwitch · state-views · Icon · ./listing-images (ListingImageGrid · ListingImagePicker · useSystemImages)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { MoneyInput } from "@/components/money-input";
import {
  applyShopeeBulkPrice, planShopeeAttrs, planShopeeDisplay, planShopeeEdit, planShopeeImages, planShopeePrices, shopeeAttrValSig, shopeeImageRef, shopeeImagesMax, shopeeIsOpen, shopeePriceChangeText, shopeePriceRowsFromView, shopeeRefsForSend,
  shopeeRowsWithSysPrices, shopeeStatusBadge, shopeeTextLength, SHOPEE_DESC_MAX_IMAGES,
  type ShopeeAttrFieldsResponse, type ShopeeAttrPlan, type ShopeeImagePlan, type ShopeeListingDetailResponse, type ShopeeListingView, type ShopeeModelView, type ShopeePricePlan, type ShopeePriceRow, type ShopeeWriteResponse,
} from "@/lib/shopee-listing-edit";
import { ttsAttrDef, ttsAttrFromText, ttsAttrToText, type TtsAttrField, type TtsAttrState } from "@/lib/tiktok-attrs";
import { ListingImageGrid, ListingImagePicker, listingImgSrc, useSystemImages } from "./listing-images";
import { ImageLightbox } from "@/components/image-lightbox";
import { LazadaAttrField } from "./lazada-listing-panels";
import { AttrSuggestButtons, AttrSuggestPanel, applyAttrHits, useAttrSuggest } from "./attr-suggest-box";
import { CheckBadge, CheckSysBox, SysThumbs, type ListingCheckApi } from "./listing-check";

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

// ───────────────────────── เฟส 4A: แก้ชื่อ + รายละเอียด · เฟส 4B: ราคาตั้งต่อตัวเลือก (ปุ่มบันทึกเดียว) ─────────────────────────
export type ShopeeEditApi = {
  canEdit: boolean;
  name: string | null;
  setName: (v: string) => void;
  description: string | null;
  setDescription: (v: string) => void;
  /** เฟส 4B: ราคาตั้ง (original_price) ต่อตัวเลือก · null = ยังไม่มีข้อมูล */
  prices: ShopeePriceRow[] | null;
  setPrice: (modelId: string, price: number | null) => void;
  setPrices: (rows: ShopeePriceRow[]) => void;
  pricePlan: ShopeePricePlan | null;
  /** เฟส 4C: รูปในฟอร์ม (ลิงก์รูปเดิมบนร้าน / "r2:<key>" รูปใหม่จากระบบ) · null = ยังไม่มีข้อมูล */
  images: string[] | null;
  setImages: (next: string[]) => void;
  imagePlan: ShopeeImagePlan | null;
  /** รูปในรายละเอียด (2026-11-23): ลิงก์รูปเดิมบนร้าน / "r2:<key>" รูปใหม่ · null = ยังไม่มีข้อมูล */
  descImages: string[] | null;
  setDescImages: (next: string[]) => void;
  descImagesDirty: boolean;
  /** ข้อมูลจำเพาะ (2026-11-23): ค่าทั้งชุดในฟอร์ม · ช่องของหมวดโหลดเมื่อขอ (loadAttrFields) */
  attrs: TtsAttrState | null;
  setAttrs: (next: TtsAttrState) => void;
  attrPlan: ShopeeAttrPlan | null;
  attrFields: TtsAttrField[] | null;
  attrMeta: { loading: boolean; error: string | null; categoryName: string | null };
  loadAttrFields: () => void;
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
  const [prices, setPricesState] = useState<ShopeePriceRow[] | null>(null);
  const [images, setImagesState] = useState<string[] | null>(null);
  const [descImages, setDescImagesState] = useState<string[] | null>(null);
  const [attrs, setAttrsState] = useState<TtsAttrState | null>(null);
  const [attrFields, setAttrFields] = useState<TtsAttrField[] | null>(null);
  const [attrMeta, setAttrMeta] = useState<{ loading: boolean; error: string | null; categoryName: string | null; cat: string | null }>({ loading: false, error: null, categoryName: null, cat: null });
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const priceBase = useMemo(() => (v ? shopeePriceRowsFromView(v) : null), [v]);
  // ข้อมูลจากร้านเปลี่ยน (เปิดตัวอื่น / ดึงใหม่ / หลังบันทึก) → เริ่มจากของบนร้าน
  // รูปในรายละเอียดในฟอร์ม = ลิงก์รูปบนร้าน (โชว์ได้ทันที) · ตอนส่งแปลงกลับเป็น "spi:<id>"
  const descBase = useMemo(() => (v ? v.descriptionImages.map((x) => x.url ?? shopeeImageRef(x.id)) : null), [v]);
  useEffect(() => { setNameState(v ? v.name : null); setDescState(v ? v.description : null); setPricesState(priceBase); setImagesState(v ? v.images : null); setDescImagesState(descBase); setAttrsState(v ? v.attrs : null); }, [v, priceBase, descBase]);
  // ช่องข้อมูลจำเพาะของหมวด — โหลดเมื่อขอ (เปิดแท็บ / โหมดเช็กกับระบบ) · หมวดเปลี่ยน = โหลดใหม่
  const catId = v?.categoryId ?? null;
  const loadAttrFields = useCallback(() => {
    if (!state.listingId || !catId || attrMeta.loading || (attrMeta.cat === catId && (attrFields || attrMeta.error))) return;
    setAttrMeta((m) => ({ ...m, loading: true, error: null, cat: catId }));
    apiFetch(`/api/shopee/listing-detail?part=attrs&listing_id=${encodeURIComponent(state.listingId)}&category_id=${encodeURIComponent(catId)}`)
      .then((r) => r.json().catch(() => ({ fields: null, category_name: null, error: `HTTP ${r.status}` })) as Promise<ShopeeAttrFieldsResponse>)
      .then((j) => { setAttrFields(j.fields); setAttrMeta({ loading: false, error: j.error, categoryName: j.category_name, cat: catId }); })
      .catch(() => setAttrMeta({ loading: false, error: "โหลดช่องของหมวดไม่สำเร็จ", categoryName: null, cat: catId }));
  }, [state.listingId, catId, attrMeta.loading, attrMeta.cat, attrMeta.error, attrFields]);

  const descImagesDirty = !!descImages && !!descBase && descImages.join("|") !== descBase.join("|");
  // ลิงก์รูปเดิม → "spi:<id>" · รูปใหม่คง "r2:<key>"
  const descRefs = useMemo(() => {
    if (!v || !descImages) return null;
    const idOf = new Map(v.descriptionImages.map((x) => [x.url ?? shopeeImageRef(x.id), x.id]));
    return descImages.map((u) => (idOf.has(u) ? shopeeImageRef(idOf.get(u)!) : u));
  }, [v, descImages]);
  const plan = useMemo(() => (v && name != null && description != null ? planShopeeEdit(v, { name, description, ...(descImagesDirty && descRefs ? { descImages: descRefs } : {}) }) : null), [v, name, description, descImagesDirty, descRefs]);
  // ข้อมูลจำเพาะ: ส่งเฉพาะช่องที่ต่างจากบนร้าน (ตัวส่งรวมกับของเดิมให้เอง)
  const attrWant = useMemo(() => {
    if (!v || !attrs) return null;
    const out: TtsAttrState = {};
    for (const id of new Set([...Object.keys(attrs), ...Object.keys(v.attrs)])) if (shopeeAttrValSig(attrs[id]) !== shopeeAttrValSig(v.attrs[id])) out[id] = attrs[id] ?? [];
    return out;
  }, [v, attrs]);
  const attrPlan = useMemo(() => (v && attrWant && Object.keys(attrWant).length ? planShopeeAttrs(v, attrWant, attrFields) : null), [v, attrWant, attrFields]);
  const pricePlan = useMemo(() => (v && prices ? planShopeePrices(v, prices) : null), [v, prices]);
  const imagePlan = useMemo((): ShopeeImagePlan | null => {
    if (!v || !images) return null;
    if (images.join("\n") === v.images.join("\n")) return null; // ไม่ได้แตะรูป
    const refs = shopeeRefsForSend(images, v);
    return refs ? planShopeeImages(v, refs)
      : { changed: true, refs: [], newImages: 0, removed: 0, coverChanged: false, changes: [], errors: ["มีรูปเดิมที่ระบบหารหัสบน Shopee ไม่เจอ — กดดึงตัวนี้จาก Shopee แล้วแก้ใหม่"], warnings: [] };
  }, [v, images]);
  const infoN = plan?.changes.length ?? 0;
  const priceN = pricePlan?.changes.length ?? 0;
  const imgN = imagePlan?.changed ? 1 : 0;
  const attrN = attrPlan?.changes.length ?? 0;
  const changeCount = infoN + priceN + imgN + attrN;
  const dirty = changeCount > 0;
  const errors = [...(plan?.errors ?? []), ...(pricePlan?.errors ?? []), ...(imgN ? imagePlan!.errors : []), ...(attrN ? attrPlan!.errors : [])];
  const reset = () => { if (v) { setNameState(v.name); setDescState(v.description); setPricesState(priceBase); setImagesState(v.images); setDescImagesState(descBase); setAttrsState(v.attrs); } };

  /** ส่งราคาก่อน (มีผลทันที) แล้วค่อยชื่อ/รายละเอียด/รูป (คำสั่งเดียว) · ราคาไม่ผ่านทั้งหมด = หยุด ไม่ส่งต่อ */
  const save = async () => {
    if (!v || !state.listingId || !dirty || errors.length) return;
    setSaving(true);
    try {
      let latest: ShopeeListingView | null = null;
      if (priceN && pricePlan && priceBase) {
        const r = await apiFetch("/api/shopee/listing-prices", {
          method: "POST",
          body: JSON.stringify({
            listing_id: state.listingId,
            before: priceBase.map((b) => ({ model_id: b.modelId, price: b.price })),
            prices: pricePlan.changes.map((c) => ({ model_id: c.modelId, label: c.label, price: c.after })),
          }),
        });
        const j = await r.json().catch(() => ({ ok: false, view: null, error: `HTTP ${r.status}` })) as ShopeeWriteResponse;
        if (!j.ok) {
          toast.error(r.status === 401 ? NO_AUTH : (j.error ?? `HTTP ${r.status}`));
          if ((r.status === 409 || r.status === 502) && j.view) { state.apply(j.view); setAsking(false); }
          return;
        }
        toast.success(`${j.summary ?? "แก้ราคาบน Shopee แล้ว"} — บันทึกประวัติแล้ว`);
        (j.warnings ?? []).forEach((w) => toast.warning(w));
        latest = j.view;
      }
      // ชื่อ/รายละเอียด: ส่ง "ข้อความที่แก้" ตรง ๆ (🐛 เดิมส่ง plan.body.description — รายละเอียดแบบมีรูป (extended) ไม่มีช่องนี้ → แก้ข้อความแล้วไม่ถูกส่ง)
      const nameChanged = !!plan?.body.item_name;
      const textChanged = !!plan?.changes.some((c) => c.label === "รายละเอียด");
      if (nameChanged || textChanged || descImagesDirty || (imgN && imagePlan) || attrN) {
        const r = await apiFetch("/api/shopee/listing-edit", {
          method: "POST",
          body: JSON.stringify({
            listing_id: state.listingId,
            ...(nameChanged || textChanged ? { before: { name: v.name, description: v.description }, edit: { name: nameChanged ? plan!.body.item_name : null, description: textChanged ? description : null } } : {}),
            ...(descImagesDirty && descRefs ? { desc_images: { before_ids: v.descriptionImages.map((x) => x.id), refs: descRefs } } : {}),
            ...(imgN && imagePlan ? { images: { before_ids: v.imageIds, refs: imagePlan.refs } } : {}),
            ...(attrN && attrWant ? { attributes: { before: v.attrs, values: attrWant, fields: (attrFields ?? []).map((f) => ({ id: f.id, name: f.name, required: f.required })) } } : {}),
          }),
        });
        const j = await r.json().catch(() => ({ ok: false, view: null, error: `HTTP ${r.status}` })) as ShopeeWriteResponse;
        if (!j.ok) {
          toast.error(r.status === 401 ? NO_AUTH : (j.error ?? `HTTP ${r.status}`));
          if (r.status === 409 && j.view) { state.apply(j.view); setAsking(false); }
          else if (latest) state.apply(latest);
          return;
        }
        toast.success(`${j.summary ?? "บันทึกขึ้น Shopee แล้ว"} — บันทึกประวัติแล้ว`);
        (j.warnings ?? []).forEach((w) => toast.warning(w));
        latest = j.view ?? latest;
      }
      setAsking(false);
      if (latest) state.apply(latest);
      onSaved?.(latest?.name ?? plan?.body.item_name ?? v.name);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const warnings = [...(pricePlan?.changes.length ? pricePlan.warnings : []), ...(plan?.warnings ?? []), ...(imgN ? imagePlan!.warnings : []), ...(attrN ? attrPlan!.warnings : [])];
  const dialog = (
    <ConfirmDialog open={asking && dirty} onClose={() => { if (!saving) setAsking(false); }} onConfirm={() => void save()} loading={saving}
      title={`ส่งการแก้ไข ${changeCount} รายการขึ้นร้าน Shopee?`} confirmText="ส่งขึ้น Shopee"
      message={dirty ? (
        <div className="space-y-2 text-sm">
          <p>ระบบจะแก้สินค้าบนร้าน Shopee จริงตามนี้ (ส่งเฉพาะที่เปลี่ยน · สต๊อกไม่แตะ) · มีประวัติว่าใครแก้อะไร</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
            {(pricePlan?.changes ?? []).map((c) => (
              <li key={`p-${c.modelId}`}><span className="font-medium text-slate-700">ราคาตั้ง {c.label}:</span> {shopeePriceChangeText(c)}{c.promo ? <span className="text-orange-700"> · ในโปรโมชัน</span> : null}</li>
            ))}
            {[...(plan?.changes ?? []), ...(imgN ? imagePlan!.changes : []), ...(attrN ? attrPlan!.changes : [])].map((c, i) => (
              <li key={`i-${i}`}><span className="font-medium text-slate-700">{c.label}:</span> <span className="text-slate-400 line-through">{c.before}</span> → <span className="text-slate-800">{c.after}</span></li>
            ))}
          </ul>
          {warnings.map((w, i) => <p key={i} className="flex items-start gap-1 text-xs text-amber-700"><Icon name="warning" className="mt-0.5 shrink-0" />{w}</p>)}
        </div>
      ) : ""} />
  );
  return {
    canEdit, name, setName: setNameState, description, setDescription: setDescState,
    prices, setPrice: (modelId, price) => setPricesState((rows) => (rows ? rows.map((r) => (r.modelId === modelId ? { ...r, price } : r)) : rows)),
    setPrices: setPricesState, pricePlan,
    images, setImages: setImagesState, imagePlan,
    descImages, setDescImages: setDescImagesState, descImagesDirty,
    attrs, setAttrs: setAttrsState, attrPlan, attrFields, attrMeta: { loading: attrMeta.loading, error: attrMeta.error, categoryName: attrMeta.categoryName }, loadAttrFields,
    changeCount, errors, dirty, reset, ask: () => setAsking(true), saving, dialog,
  };
}

export function ShopeeEditFooter({ edit, state }: { edit: ShopeeEditApi; state: ShopeeListingState }) {
  if (!edit.canEdit) return <span className="text-xs text-slate-400">Shopee: ดูอย่างเดียว — ไม่มีสิทธิ์ส่งขึ้นร้าน</span>;
  if (!state.view) return <span className="text-xs text-slate-400">กำลังดึงข้อมูลจาก Shopee…</span>;
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 text-xs text-slate-500">
        {edit.errors.length ? <span className="text-rose-600">{edit.errors[0]}{edit.errors.length > 1 ? ` (และอีก ${edit.errors.length - 1})` : ""}</span>
          : edit.dirty ? `แก้แล้ว ${edit.changeCount.toLocaleString()} รายการ — ยังไม่ได้ส่งขึ้น Shopee` : "ยังไม่ได้แก้อะไร"}
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
export function ShopeeInfoPanel({ state, edit, matchedParent = null, matchedCode = null, chk = null }: {
  state: ShopeeListingState; edit: ShopeeEditApi; matchedParent?: string | null; matchedCode?: string | null;
  /** โหมดเช็กกับระบบ (ของกลาง ./listing-check) — ป้ายตรง/ไม่ตรง + ค่าระบบใต้ช่อง */
  chk?: ListingCheckApi | null;
}) {
  // หมวดเต็ม (ชื่อไทย) มากับช่องข้อมูลจำเพาะ — โหลดตอนเปิดแท็บนี้ด้วย (จำไว้ที่เซิร์ฟเวอร์ 6 ชม.)
  const { loadAttrFields } = edit;
  useEffect(() => { if (state.view?.categoryId) loadAttrFields(); }, [state.view?.categoryId, loadAttrFields]);
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
          <span className="flex items-center gap-1.5 text-xs text-slate-500">ชื่อสินค้าบน Shopee <CheckBadge chk={chk} k="title" /></span>
          <Counter n={shopeeTextLength(name)} min={L?.nameMin} max={L?.nameMax} />
        </div>
        {can
          ? <input value={name} onChange={(e) => edit.setName(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-violet-400 focus:outline-none" />
          : <div className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{v.name}</div>}
        <CheckSysBox chk={chk} k="title" sys={chk?.sys?.title ? <div className="text-slate-800">{chk.sys.title}</div> : null}
          onUse={can && chk?.sys?.title ? () => edit.setName(chk.sys!.title!) : null} />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">รายละเอียดสินค้า{v.descriptionEditable ? "" : " (แบบมีรูป — แก้ใน Seller Centre)"} <CheckBadge chk={chk} k="description" /></span>
          <Counter n={shopeeTextLength(desc)} min={L?.descMin} max={L?.descMax} />
        </div>
        {can && v.descriptionEditable
          ? <textarea value={desc} onChange={(e) => edit.setDescription(e.target.value)} rows={10} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:border-violet-400 focus:outline-none" />
          : <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{v.description || "—"}</div>}
        <CheckSysBox chk={chk} k="description"
          sys={chk?.sys ? <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-violet-100 bg-white px-2 py-1.5 text-slate-700">{chk.sys.description || "—"}</div> : null}
          onUse={can && v.descriptionEditable && chk?.sys ? () => edit.setDescription(chk.sys!.description) : null} />
      </div>
      <ShopeeDescImagesBox state={state} edit={edit} canEdit={can} matchedParent={matchedParent} matchedCode={matchedCode} chk={chk} />
      {/* ข้อมูลครบแบบหน้าลงสินค้า (เจ้าของ 2026-11-23) — ดูอย่างเดียว · แก้หมวด/ขนส่ง/น้ำหนักใน Seller Centre */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadField label="หมวดบน Shopee">{edit.attrMeta.categoryName ?? (v.categoryId ? `รหัส ${v.categoryId}` : "—")}</ReadField>
        <ReadField label="แบรนด์">{v.brand ?? "—"}</ReadField>
        <ReadField label="น้ำหนัก">{v.weight != null ? `${v.weight} กก.` : "—"}</ReadField>
        <ReadField label="ขนาดกล่อง (ย × ก × ส)">{v.dims ? `${v.dims.length ?? "?"} × ${v.dims.width ?? "?"} × ${v.dims.height ?? "?"} ซม.` : "—"}</ReadField>
        <ReadField label="เตรียมส่ง">{v.preOrder ? `พรีออเดอร์ ${v.daysToShip ?? "?"} วัน` : v.daysToShip != null ? `ปกติ (${v.daysToShip} วัน)` : "—"}</ReadField>
        <ReadField label="สภาพสินค้า">{v.condition === "NEW" ? "ใหม่" : v.condition === "USED" ? "มือสอง" : v.condition ?? "—"}</ReadField>
        <ReadField label="ขนส่งที่เปิด">{v.logistics.filter((l) => l.enabled).map((l) => l.name).join(" · ") || "—"}</ReadField>
        <ReadField label="รหัสสินค้าบน Shopee">{v.itemId}{v.itemSku ? ` · SKU ${v.itemSku}` : ""}{v.gtin && v.gtin !== "00" ? ` · GTIN ${v.gtin}` : ""}</ReadField>
      </div>
      <p className="text-[11px] text-slate-400">แก้ได้ตอนนี้: ชื่อ · รายละเอียด · รูปในรายละเอียด · รูปสินค้า (แท็บรูป) · ข้อมูลจำเพาะ (แท็บข้อมูลจำเพาะ) · ราคาตั้งต่อตัวเลือก · สต๊อกไม่แก้จากระบบ (BigSeller ยังซิงค์อยู่)</p>
    </div>
  );
}

/**
 * รูปในรายละเอียด (extended · ต่อท้ายข้อความ) — ดู / ลากเรียง / ลบ / เพิ่มจากรูปในระบบ / อัปโหลดจากเครื่อง (ของกลาง ListingImagePicker → คลังรูปกลาง)
 * ส่งพร้อมปุ่ม "บันทึกขึ้น Shopee" (route ฝากรูปแบบคงสัดส่วน scene desc) · เจ้าของถาม 2026-11-23 "ดูตรง Description Image ให้หน่อยว่าใช้ได้ยัง"
 */
function ShopeeDescImagesBox({ state, edit, canEdit, matchedParent, matchedCode, chk }: {
  state: ShopeeListingState; edit: ShopeeEditApi; canEdit: boolean; matchedParent: string | null; matchedCode: string | null; chk?: ListingCheckApi | null;
}) {
  const [picker, setPicker] = useState(false);
  const [zoom, setZoom] = useState(-1);
  const sys = useSystemImages(matchedParent);
  const v = state.view!;
  const imgs = edit.descImages ?? [];
  const max = SHOPEE_DESC_MAX_IMAGES;
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">รูปในรายละเอียด ({imgs.length}/{max}) — ต่อท้ายข้อความ</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><Icon name="done" />ร้านนี้ใช้ได้แล้ว{v.descriptionType === "extended" ? "" : " (ใส่รูปแล้วรายละเอียดจะเปลี่ยนเป็นแบบมีรูป)"}</span>
        {edit.descImagesDirty && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">แก้แล้ว ยังไม่ส่ง</span>}
        <CheckBadge chk={chk} k="desc_images" />
      </div>
      <CheckSysBox chk={chk} k="desc_images" useLabel={`ใช้ตามระบบ (${chk?.sys?.descImageRefs.length ?? 0} รูป)`}
        sys={chk?.sys?.descImageRefs.length ? <SysThumbs refs={chk.sys.descImageRefs} /> : null}
        onUse={canEdit && chk?.sys?.descImageRefs.length ? () => edit.setDescImages(chk.sys!.descImageRefs.slice(0, SHOPEE_DESC_MAX_IMAGES)) : null} />
      {imgs.length === 0 && !canEdit ? <p className="text-xs text-slate-500">ยังไม่มีรูปในรายละเอียด</p> : (
        <ListingImageGrid images={imgs} onChange={edit.setDescImages} canEdit={canEdit} max={max} platformName="Shopee (รูปในรายละเอียด)" dragGroup="shopee-desc-images"
          onOpen={setZoom}
          onAdd={() => { sys.load(); setPicker(true); }} canAdd={canEdit && imgs.length < max} />
      )}
      {canEdit && <p className="mt-1 text-[11px] text-slate-400">เพิ่มได้จากรูปในระบบ หรืออัปโหลดจากเครื่อง (ในป๊อปเลือกรูป) · ลากเรียง / ลบได้ · กด “บันทึกขึ้น Shopee” ถึงจะส่ง</p>}
      <ListingImagePicker open={picker} onClose={() => setPicker(false)} mode="product" title="เลือกรูปใส่รายละเอียด Shopee"
        description={`เลือกได้อีก ${Math.max(0, max - imgs.length)} รูป · รูปยาวได้ (ไม่ตัดเป็นสี่เหลี่ยม)`} matchedParent={matchedParent} matchedCode={matchedCode}
        sysImages={sys.images} isUsed={(ref) => imgs.includes(ref)} full={imgs.length >= max}
        onPick={(ref) => edit.setDescImages([...(edit.descImages ?? []), ref].slice(0, max))} storageKey="shopee-desc-image-picker" />
      <ImageLightbox images={imgs.map((u) => ({ url: listingImgSrc(u, 1600) }))} index={zoom} onClose={() => setZoom(-1)} onIndex={setZoom} />
    </div>
  );
}

/**
 * แท็บข้อมูลจำเพาะ (attribute_list) — ช่องกรอกกลาง LazadaAttrField (ตัวเดียวกับหน้าลงสินค้า/TikTok/Lazada) + แนะนำจากชื่อ/รายละเอียด (ฟรี) / AI ช่วยเติม
 * ส่งพร้อมปุ่ม "บันทึกขึ้น Shopee" — ส่งทั้งชุด (ของเดิม + ที่แก้) · ช่องบังคับว่าง = ส่งไม่ได้ (บอกชื่อช่อง)
 */
export function ShopeeSpecsPanel({ state, edit, chk = null }: { state: ShopeeListingState; edit: ShopeeEditApi; chk?: ListingCheckApi | null }) {
  const { loadAttrFields } = edit;
  useEffect(() => { if (state.view?.categoryId) loadAttrFields(); }, [state.view?.categoryId, loadAttrFields]);
  const [more, setMore] = useState(false);
  const [src, setSrc] = useState<Record<string, "text" | "ai">>({});
  const v = state.view;
  const fields = edit.attrFields ?? [];
  const vals = edit.attrs ?? v?.attrs ?? {};
  const sug = useAttrSuggest({
    fields, values: vals,
    text: () => `${edit.name ?? v?.name ?? ""}\n${edit.description ?? v?.description ?? ""}`,
    ai: v && edit.canEdit ? { platform: "Shopee", name: edit.name ?? v.name, description: edit.description ?? v.description, category: edit.attrMeta.categoryName, imageKeys: [] } : null,
  });
  const g = gate(state); if (g) return g;
  const view = state.view!;
  const can = edit.canEdit && view.status !== "SELLER_DELETE" && view.status !== "SHOPEE_DELETE";
  const main = fields.filter((f) => f.required || (view.attrs[f.id]?.length ?? 0) > 0);
  const rest = fields.filter((f) => !main.includes(f));
  const missing = fields.filter((f) => f.required && !(vals[f.id]?.length));
  // ค่าบนร้านที่ไม่อยู่ในช่องของหมวด (หมวดเปลี่ยน / ช่องเก่า) — โชว์ไว้ให้รู้ ไม่แก้
  const orphan = Object.keys(view.attrs).filter((id) => !fields.some((f) => f.id === id));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">ข้อมูลจำเพาะของหมวด{edit.attrMeta.categoryName ? ` · ${edit.attrMeta.categoryName}` : ""}</span>
        {missing.length > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">ช่องบังคับยังว่าง {missing.length}</span>}
        {(edit.attrPlan?.changes.length ?? 0) > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">แก้แล้ว {edit.attrPlan!.changes.length} ช่อง ยังไม่ส่ง</span>}
        <CheckBadge chk={chk} k="attrs" />
        {can && fields.length > 0 && <span className="ml-auto"><AttrSuggestButtons s={sug} /></span>}
      </div>
      <CheckSysBox chk={chk} k="attrs"
        onUse={can && chk?.sys?.attrs ? () => edit.setAttrs({ ...vals, ...(chk.sys!.attrs as TtsAttrState) }) : null} />
      <AttrSuggestPanel s={sug} onApply={(hits, source) => {
        const { next, filledIds } = applyAttrHits(vals, hits);
        edit.setAttrs(next); setSrc((m) => ({ ...m, ...Object.fromEntries(filledIds.map((id) => [id, source])) }));
        if (filledIds.some((id) => rest.some((f) => f.id === id))) setMore(true);
      }} />
      {!view.categoryId ? <p className="text-xs text-slate-500">ไม่รู้หมวดของสินค้านี้ — กดดึงตัวนี้จาก Shopee</p>
        : edit.attrMeta.loading && !edit.attrFields ? <LoadingState label="กำลังโหลดช่องของหมวดจาก Shopee…" />
        : !edit.attrFields ? <ErrorState title={edit.attrMeta.error ?? "โหลดช่องของหมวดไม่สำเร็จ"} />
        : fields.length === 0 ? <p className="text-xs text-slate-500">หมวดนี้ไม่มีช่องข้อมูลจำเพาะ</p>
        : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {(more ? [...main, ...rest] : main).map((f) => (
                <div key={f.id}>
                  <LazadaAttrField def={ttsAttrDef(f)} value={ttsAttrToText(vals[f.id])} base={ttsAttrToText(view.attrs[f.id])} can={can}
                    suggested={src[f.id] ? (vals[f.id] ?? []).map((x) => x.id).filter((x): x is string => !!x) : undefined}
                    onChange={(text) => {
                      setSrc((m) => { const n = { ...m }; delete n[f.id]; return n; });
                      const next = { ...vals }; const nv = ttsAttrFromText(f, text); if (nv.length) next[f.id] = nv; else delete next[f.id];
                      edit.setAttrs(next);
                    }} />
                  {src[f.id] && <div className={`mt-0.5 text-[10px] ${src[f.id] === "ai" ? "text-violet-700" : "text-amber-700"}`}>มาจาก: {src[f.id] === "ai" ? "AI เดา · ตรวจก่อน (ยังไม่ส่ง)" : "แนะนำจากชื่อ/รายละเอียด (ยังไม่ส่ง)"}</div>}
                </div>
              ))}
            </div>
            {main.length === 0 && !more && <p className="text-xs text-slate-500">หมวดนี้ไม่มีช่องบังคับ และบนร้านยังไม่ได้กรอกช่องไหน</p>}
            {rest.length > 0 && <button type="button" onClick={() => setMore((x) => !x)} className="text-xs text-violet-700 hover:underline">{more ? "ซ่อนช่องไม่บังคับ" : `แสดงช่องไม่บังคับ (${rest.length} ช่อง)`}</button>}
            {orphan.length > 0 && <p className="text-[11px] text-slate-400">บนร้านมีค่าของช่องที่ไม่อยู่ในหมวดนี้แล้ว {orphan.length} ช่อง (ไม่แตะ)</p>}
          </>
        )}
      {(edit.attrPlan?.warnings.length ?? 0) > 0 && edit.attrPlan!.warnings.map((w, i) => <p key={i} className="flex items-start gap-1 text-xs text-amber-700"><Icon name="warning" className="mt-0.5 shrink-0" />{w}</p>)}
      <p className="text-[11px] text-slate-400">แก้แล้วกด “บันทึกขึ้น Shopee” ด้านล่าง (ถามก่อนส่ง · มีประวัติ) · ส่งทั้งชุด ช่องที่ไม่ได้แตะคงเดิม</p>
    </div>
  );
}

/** แท็บรูป — เฟส 4C: ลากเรียง / ตั้งปก / ลบ / เพิ่มจากคลังรูปในระบบ (ของกลาง ./listing-images · แบบเดียวกับ TikTok) · ไม่มีสิทธิ์ = ดูอย่างเดียว */
export function ShopeeImagesPanel({ state, onOpen, edit, matchedParent, matchedCode, chk = null }: {
  state: ShopeeListingState; onOpen: (index: number) => void; edit?: ShopeeEditApi | null; matchedParent?: string | null; matchedCode?: string | null;
  chk?: ListingCheckApi | null;
}) {
  const sys = useSystemImages(matchedParent ?? null);
  const [picking, setPicking] = useState(false);
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const max = shopeeImagesMax(v);
  const locked = v.status === "SELLER_DELETE" || v.status === "SHOPEE_DELETE";
  const can = !!edit?.canEdit && !!edit.images && !locked;
  const images = can ? edit!.images! : v.images;
  const note = can
    ? `ลากเพื่อเรียง · รูปแรก = ปก · Shopee รับไม่เกิน ${max} รูป${v.imageRatio === "3:4" ? " (สินค้านี้ใช้รูปแนวตั้ง 3:4)" : ""} · รูปใหม่จะฝากกับ Shopee ตอนกด “บันทึกขึ้น Shopee”`
    : "ดูอย่างเดียว";
  return (
    <div className="space-y-3">
      {chk?.on && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">รูปสินค้าเทียบกับระบบ <CheckBadge chk={chk} k="images" /></div>
          <CheckSysBox chk={chk} k="images" useLabel={`ใช้ตามระบบ (${chk.sys?.imageRefs.length ?? 0} รูป)`}
            sys={chk.sys?.imageRefs.length ? <SysThumbs refs={chk.sys.imageRefs} /> : null}
            onUse={can && chk.sys?.imageRefs.length ? () => edit!.setImages(chk.sys!.imageRefs.slice(0, max)) : null} />
        </div>
      )}
      {!can && images.length === 0
        ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">สินค้านี้ไม่มีรูปบน Shopee</p>
        : <ListingImageGrid images={images} onChange={(next) => edit?.setImages(next)} canEdit={can} max={max} platformName="Shopee" dragGroup="shopee-listing-images"
            onOpen={onOpen} onAdd={() => { setPicking(true); sys.load(); }} canAdd={can && !!matchedParent} note={note} />}
      {can && !matchedParent && <p className="text-[11px] text-slate-400">เพิ่มรูปจากระบบได้เมื่อจับคู่สินค้านี้กับ Parent SKU แล้ว (แท็บจับคู่) · เรียง/ลบรูปเดิมได้เลย</p>}
      {can && (
        <ListingImagePicker open={picking} onClose={() => setPicking(false)} mode="product" storageKey="shopee-image-picker"
          title="เพิ่มรูปสินค้าจากคลังรูปในระบบ" description={`เลือกได้อีก ${Math.max(0, max - images.length)} รูป (Shopee รับไม่เกิน ${max}) · ส่งขึ้นร้านตอนกดบันทึก`}
          matchedParent={matchedParent ?? null} matchedCode={matchedCode} sysImages={sys.images}
          isUsed={(ref) => images.includes(ref)} full={images.length >= max}
          onPick={(ref) => edit!.setImages([...images, ref])} />
      )}
    </div>
  );
}

const numOrNull = (raw: string | number | null | undefined): number | null => { if (raw == null || raw === "") return null; const n = Number(raw); return Number.isFinite(n) ? n : null; };

/** แถบแก้ราคาหลายตัวพร้อมกัน (ติ๊กบางตัว = เฉพาะที่ติ๊ก · ไม่ติ๊ก = ทุกตัว) — เติมฟอร์มอย่างเดียว ยังไม่ส่ง */
function ShopeeBulkPrice({ edit, selected }: { edit: ShopeeEditApi; selected: Set<string> }) {
  const [price, setPrice] = useState<string>("");
  const [pct, setPct] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const apply = () => {
    if (!edit.prices) return;
    const res = applyShopeeBulkPrice(edit.prices, selected, { price: numOrNull(price), pct: numOrNull(pct) });
    if (res.error) { setErr(res.error); return; }
    edit.setPrices(res.rows); setErr(null); setPrice(""); setPct("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
      <label className="inline-flex items-center gap-1">ตั้งราคา<MoneyInput value={price} onChange={(raw) => { setPrice(String(raw ?? "")); setErr(null); }} placeholder="ไม่เปลี่ยน" className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2 text-right" /></label>
      <label className="inline-flex items-center gap-1">หรือ ปรับ<input type="number" min="-99" max="500" value={pct} onChange={(e) => { setPct(e.target.value); setErr(null); }} placeholder="-10" className="h-8 w-16 rounded-md border border-slate-200 bg-white px-2 text-right" />%</label>
      <button type="button" onClick={apply} className="h-8 rounded-md bg-violet-600 px-2.5 text-white hover:bg-violet-700">ใช้กับ{selected.size ? `ที่ติ๊ก ${selected.size} ตัว` : "ทุกตัว"}</button>
      <span className="text-slate-400">ปัดเป็นบาทเต็ม (Shopee ไทยรับเฉพาะจำนวนเต็ม)</span>
      {err && <span className="w-full text-rose-600">{err}</span>}
    </div>
  );
}

/** แท็บตัวเลือก & ราคา — เฟส 4B แก้ "ราคาตั้ง" ต่อตัวเลือกได้ (ราคาที่ลูกค้าจ่ายมาจากโปรโมชัน · สต๊อกบนร้านไว้ดูเทียบ) */
export function ShopeeOptionsPanel({ state, edit, chk = null }: { state: ShopeeListingState; edit?: ShopeeEditApi | null; chk?: ListingCheckApi | null }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const lockedStatus = v.status === "SELLER_DELETE" || v.status === "SHOPEE_DELETE";
  const canPrice = !!edit?.canEdit && !!edit.prices && !lockedStatus;
  const rowOf = new Map((edit?.prices ?? []).map((r) => [r.modelId, r]));
  const rows: ShopeeModelView[] = v.hasModel ? v.models
    : [{ modelId: "0", sku: v.itemSku, label: "สินค้าเดียว (ไม่มีตัวเลือก)", price: v.price, originalPrice: v.originalPrice, stock: v.stock, image: v.images[0] ?? null, status: null, promo: v.inPromotion }];
  const promoN = rows.filter((m) => m.promo).length;
  const cols: MiniColumn<ShopeeModelView>[] = [
    { key: "img", header: "", width: "3rem", cell: (m) => (m.image ? <img src={m.image} alt="" className="h-9 w-9 rounded object-cover" /> : <div className="h-9 w-9 rounded bg-slate-100" />) },
    { key: "opt", header: "ตัวเลือก", width: "1.6fr", cell: (m) => (
      <div className="min-w-0">
        <div className="truncate" title={m.label ?? ""}>{m.label ?? "—"}{m.promo && <span className="ml-1 rounded bg-orange-50 px-1 text-[10px] text-orange-700" title="อยู่ในโปรโมชัน — Shopee มักไม่ให้แก้ราคาตัวนี้">โปร</span>}</div>
        <div className="truncate font-mono text-[11px] text-slate-400">{m.sku ?? "ไม่มีรหัส"}</div>
      </div>
    ) },
    {
      key: "orig", header: canPrice ? "ราคาตั้ง (แก้ได้)" : "ราคาตั้ง", width: canPrice ? "7.5rem" : "6rem", align: "right", sortValue: (m) => m.originalPrice,
      cell: (m) => {
        if (!canPrice) return <span className="text-slate-500">{baht(m.originalPrice)}</span>;
        const r = rowOf.get(m.modelId);
        const changed = !!r && r.price !== m.originalPrice;
        return (
          <span className="block w-full">
            <MoneyInput value={r?.price ?? null} onChange={(raw) => edit!.setPrice(m.modelId, numOrNull(raw))}
              className={`h-8 w-full rounded-md border px-2 text-right text-sm ${changed ? "border-violet-400 bg-violet-50" : "border-slate-200"}`} />
            {changed && <span className="block text-right text-[11px] text-slate-400 line-through">{baht(m.originalPrice)}</span>}
          </span>
        );
      },
    },
    { key: "price", header: "ลูกค้าจ่าย", width: "6rem", align: "right", sortValue: (m) => m.price, cell: (m) => <span className={m.price != null && m.originalPrice != null && m.price < m.originalPrice ? "font-medium text-rose-600" : ""}>{baht(m.price)}</span> },
    { key: "stock", header: "สต๊อกบนร้าน", width: "6rem", align: "right", sortValue: (m) => m.stock, cell: (m) => (m.stock == null ? "—" : m.stock.toLocaleString()) },
  ];
  // ราคาของระบบ → แถวราคาในฟอร์ม (ตัวช่วยกลาง shopeeRowsWithSysPrices)
  const useSysPrices = () => { if (edit?.prices && chk?.sys) edit.setPrices(shopeeRowsWithSysPrices(v, edit.prices, chk.sys.prices)); };
  return (
    <div className="space-y-2">
      {chk?.on && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">ราคา <CheckBadge chk={chk} k="price" /> · ชื่อตัวเลือก <CheckBadge chk={chk} k="options" /> · รูปตัวเลือก <CheckBadge chk={chk} k="variant_images" /></div>
          <CheckSysBox chk={chk} k="price" onUse={canPrice ? useSysPrices : null} useLabel="ใช้ราคาตามระบบ" />
          <CheckSysBox chk={chk} k="options" />
          <CheckSysBox chk={chk} k="variant_images" />
        </div>
      )}
      {canPrice && edit && <ShopeeBulkPrice edit={edit} selected={selected} />}
      {canPrice && promoN > 0 && (
        <p className="flex items-start gap-1 rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs text-orange-800"><Icon name="warning" className="mt-0.5 shrink-0" />{promoN.toLocaleString()} ตัวเลือกอยู่ในโปรโมชัน (ป้าย “โปร”) — Shopee มักไม่ให้แก้ราคาจนกว่าจะนำออกจากโปรโมชันใน Seller Centre · ตัวที่ไม่อยู่ในโปรแก้ได้ตามปกติ</p>
      )}
      <MiniTable rows={rows} columns={cols} rowKey={(m) => m.modelId} dense hideToolbar emptyText="ไม่มีตัวเลือก" resizable storageKey="listing-drawer-shopee-options"
        selectable={canPrice && rows.length > 1} selected={selected} onSelectedChange={setSelected} />
      <p className="text-[11px] text-slate-400">
        {canPrice ? "แก้ราคาตั้งแล้วกด “บันทึกขึ้น Shopee” (ถามยืนยันก่อน · มีผลทันที) · ราคาที่ลูกค้าจ่ายมาจากโปรโมชันของร้าน (แก้ใน Seller Centre)" : "ดูอย่างเดียว"}
        {" · "}สต๊อกบนร้านไว้ดูเทียบเท่านั้น (BigSeller ยังซิงค์อยู่ ระบบไม่ส่งสต๊อก)
      </p>
    </div>
  );
}
