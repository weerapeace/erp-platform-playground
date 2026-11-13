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
 * เฟส C: รูปสินค้า (แท็บรูป · ของกลาง ./listing-images) + กล่องพัสดุ (แท็บข้อมูล) → ส่งพร้อมชื่อใน listing-edit (Partial Edit ครั้งเดียว · TikTok ตรวจใหม่)
 * รายละเอียด: กล่องแก้ข้อความกลาง (RichTextEditor) · รูปที่แทรก → /api/tiktok-shop/upload-image · ส่งพร้อมชื่อใน listing-edit
 * ตัวเลือก (2026-11-13): รูปตัวเลือกชั้นหลัก + ชื่อตัวเลือก (./tiktok-option-editor · lib/tiktok-sku-edit) — ส่งพร้อมปุ่มบันทึกเดียวกัน (บันทึกเป็นร่างก่อน → ไม่แตะสต๊อก)
 * ตารางขนาด: รูป หรือ แม่แบบตาราง (./tiktok-size-chart-picker) · โปรโมชัน: ./tiktok-promotions (อ่านอย่างเดียว · ต้องเปิดสิทธิ์ Promotion)
 * ยังไม่ทำ: สต๊อก (BigSeller ยังซิงค์สต๊อกอยู่) · เพิ่ม/ลบตัวเลือก · รหัส SKU — ดูอย่างเดียว
 * ของกลางที่ใช้: MiniTable · MoneyInput · ConfirmDialog · ToggleSwitch · state-views · Icon · sanitizeRichHtml
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
import { MoneyInput } from "@/components/money-input";
import {
  applyTiktokBulkPrice, applyTiktokErpFull, tiktokErpPriceCheck, planTiktokDisplay, planTiktokPublish, TTS_STOCK_MIN, TTS_STOCK_MAX,
  planTiktokMedia, samePkg, tiktokMediaBase, tiktokRefsForSend, TTS_MAX_IMAGES, type TiktokMediaPlan, type TiktokPkg,
  planTiktokDescription, tiktokDescText, tiktokSizeChartRef, TTS_DESC_MAX, type TiktokDescPlan, planTiktokPrices, planTiktokTitle, tiktokIsOpen, tiktokPriceBlock, tiktokPriceChangeText, tiktokPriceRowsFromView, tiktokStatusBadge, ttsTitleLength,
  TTS_PRICE_MAX, TTS_PRICE_MIN, TTS_TITLE_MAX, TTS_TITLE_MIN,
  type TiktokErpPrice, type TiktokListingDetailResponse, type TiktokListingView, type TiktokPricePlan, type TiktokPriceRow, type TiktokSkuView, type TiktokWriteResponse,
} from "@/lib/tiktok-listing-edit";
import type { VariantMatchRow } from "@/lib/platform-variant-match";
import type { CreateStep } from "@/lib/platform-create-registry";
import { ListingImageGrid, ListingImagePicker, listingImgSrc, useSystemImages } from "./listing-images";
import { LazadaAttrField } from "./lazada-listing-panels";
import { useWeightUnit } from "./weight-unit";
import { kgToUnit, planTiktokAttrs, planTiktokCod, planTiktokSizeChart, ttsAttrDef, ttsAttrFromText, ttsAttrToText, unitToKg, type TtsAttrField, type TtsAttrPlan, type TtsAttrState, type TtsAttrVal, type TtsCategoryRules, type WeightUnit } from "@/lib/tiktok-attrs";
import { planTiktokSkuEdit, tiktokOptNameKey, tiktokOptionGroups, tiktokSkuFormOf, tiktokSkuSignature, type TiktokOptGroup, type TiktokSkuForm, type TiktokSkuPlan } from "@/lib/tiktok-sku-edit";
import { TiktokOptionEditor } from "./tiktok-option-editor";
import { TiktokSizeChartBox } from "./tiktok-size-chart-picker";
import { TiktokPromotionsBox } from "./tiktok-promotions";

const RichTextEditor = dynamic(() => import("@/components/rich-text").then((m) => m.RichTextEditor), { ssr: false, loading: () => <div className="h-40 rounded-lg bg-slate-50" /> });

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
  /** เฟส C: รูปสินค้า (ลิงก์รูปเดิม / "r2:<key>" รูปใหม่จากระบบ) + กล่องพัสดุ · null = ยังไม่มีข้อมูล */
  images: string[] | null;
  setImages: (next: string[]) => void;
  pkg: TiktokPkg | null;
  setPkg: (patch: Partial<TiktokPkg>) => void;
  /** ฐานรูป/กล่อง (ฉบับรอตรวจถ้ามี ไม่งั้นฉบับขาย) */
  mediaBase: ReturnType<typeof tiktokMediaBase> | null;
  mediaPlan: TiktokMediaPlan | null;
  /** แก้รูป/กล่องไม่ได้เพราะอะไร · null = แก้ได้ */
  mediaBlock: string | null;
  /** รายละเอียด (HTML): ฐาน = ฉบับรอตรวจถ้ามี · descEdit = เปิดกล่องแก้แล้ว */
  baseDescription: string | null;
  description: string | null;
  setDescription: (html: string) => void;
  descEdit: boolean;
  setDescEdit: (on: boolean) => void;
  descPlan: TiktokDescPlan | null;
  /** ฝากรูปที่แทรกในรายละเอียดกับ TikTok → ลิงก์ (กล่องแก้ข้อความเรียกเอง) */
  uploadDescImage: (file: File) => Promise<string>;
  /** คุณลักษณะของหมวด / COD / ตารางขนาด — ช่องและกติกาของหมวดโหลดจาก TikTok (meta) */
  meta: { fields: TtsAttrField[] | null; rules: TtsCategoryRules | null; error: string | null; loading: boolean };
  attrs: TtsAttrState | null;
  setAttr: (fieldId: string, vals: TtsAttrVal[]) => void;
  cod: boolean | null;
  setCod: (on: boolean) => void;
  sizeChart: string | null;
  /** ชื่อแม่แบบตารางขนาดที่เพิ่งเลือก (ไว้โชว์ในหน้ายืนยัน) */
  sizeChartName: string | null;
  setSizeChart: (ref: string | null, name?: string | null) => void;
  attrPlan: TtsAttrPlan | null;
  /** ตัวเลือก: ชั้น (สี/ไซซ์) + รูปชั้นหลัก + ชื่อค่า (lib/tiktok-sku-edit) */
  optGroups: TiktokOptGroup[];
  skuForm: TiktokSkuForm | null;
  setSkuImage: (valueKey: string, ref: string | null) => void;
  setSkuName: (groupKey: string, valueKey: string, name: string) => void;
  setSkuPrimary: (groupKey: string) => void;
  skuPlan: TiktokSkuPlan | null;
  /** จำนวนรายการที่แก้ (ชื่อ + ราคาแต่ละตัว + รูป/กล่อง) */
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
  const mediaBase = useMemo(() => (state.view ? tiktokMediaBase(state.view) : null), [state.view]);
  const mediaBlock = !state.view ? null : state.view.productStatus === "FREEZE" || state.view.productStatus === "DELETED" ? "สินค้าที่ถูกระงับ/ลบแล้ว แก้รูป/กล่องไม่ได้" : null;
  const [title, setTitle] = useState<string | null>(null);
  const [prices, setPricesState] = useState<TiktokPriceRow[] | null>(null);
  const [images, setImagesState] = useState<string[] | null>(null);
  const [pkg, setPkgState] = useState<TiktokPkg | null>(null);
  const baseDescription = state.view ? (state.view.pendingDescription ?? state.view.description) : null;
  const [description, setDescriptionState] = useState<string | null>(null);
  // คุณลักษณะ / COD / ตารางขนาด
  const meta = useTiktokCategoryMeta(state.listingId, state.view?.categoryId ?? null);
  const baseAttrs = state.view?.attrs ?? null;
  const baseCod = state.view ? state.view.cod : null;
  const baseSizeRef = state.view ? tiktokSizeChartRef(state.view) : null;
  const [attrs, setAttrsState] = useState<TtsAttrState | null>(null);
  const [cod, setCodState] = useState<boolean | null>(null);
  const [sizeChart, setSizeChartState] = useState<string | null>(null);
  const [sizeChartName, setSizeChartName] = useState<string | null>(null);
  // ตัวเลือก (รูปชั้นหลัก + ชื่อค่า)
  const optGroups = useMemo(() => (state.view ? tiktokOptionGroups(state.view.skus) : []), [state.view]);
  const baseSkuForm = useMemo(() => tiktokSkuFormOf(optGroups), [optGroups]);
  const [skuForm, setSkuForm] = useState<TiktokSkuForm | null>(null);
  const [descEdit, setDescEdit] = useState(false);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  // ข้อมูลจากร้านเปลี่ยน (เปิดตัวใหม่ / ดึงใหม่ / ส่งสำเร็จ) → ฟอร์มเริ่มจากของล่าสุด
  useEffect(() => { setTitle(baseTitle); }, [baseTitle]);
  useEffect(() => { setDescriptionState(baseDescription); setDescEdit(false); }, [baseDescription]);
  useEffect(() => { setAttrsState(baseAttrs ? { ...baseAttrs } : null); setCodState(baseCod); setSizeChartState(baseSizeRef); setSizeChartName(null); }, [baseAttrs, baseCod, baseSizeRef]);
  useEffect(() => { setSkuForm(state.view ? { ...baseSkuForm, images: { ...baseSkuForm.images }, names: { ...baseSkuForm.names } } : null); }, [baseSkuForm, state.view]);
  useEffect(() => { setPricesState(priceBase ? priceBase.map((r) => ({ ...r })) : null); }, [priceBase]);
  useEffect(() => { setImagesState(mediaBase ? mediaBase.images.map((x) => x.url) : null); setPkgState(mediaBase ? { ...mediaBase.pkg } : null); }, [mediaBase]);
  const plan = useMemo(() => (baseTitle != null && title != null ? planTiktokTitle(baseTitle, title) : null), [baseTitle, title]);
  const pricePlan = useMemo(() => (priceBase && prices ? planTiktokPrices(priceBase, prices) : null), [priceBase, prices]);
  // รูป/กล่อง: แตะแล้วเท่านั้นถึงตรวจกฎ (สินค้าที่ไม่มีรูปบนร้าน ไม่ควรบล็อกการแก้ชื่อ/ราคา)
  const mediaTouched = !!mediaBase && !!images && !!pkg && (images.join("\n") !== mediaBase.images.map((x) => x.url).join("\n") || !samePkg(pkg, mediaBase.pkg));
  const mediaRefs = useMemo(() => (mediaBase && images ? tiktokRefsForSend(images, mediaBase.images) : null), [mediaBase, images]);
  const mediaPlan = useMemo(() => (mediaBase && pkg && mediaRefs ? planTiktokMedia(mediaBase.images.map((x) => x.uri), mediaBase.pkg, mediaRefs, pkg) : null), [mediaBase, pkg, mediaRefs]);
  const descPlan = useMemo(() => (descEdit && baseDescription != null && description != null ? planTiktokDescription(baseDescription, description) : null), [descEdit, baseDescription, description]);
  const descDirty = !!descPlan?.changed;
  const attrPlan = useMemo(() => (meta.fields && baseAttrs && attrs ? planTiktokAttrs(meta.fields, baseAttrs, attrs, { strictRequired: true, names: state.view?.attrNames }) : null), [meta.fields, baseAttrs, attrs, state.view?.attrNames]);
  const codPlan = useMemo(() => (state.view ? planTiktokCod(baseCod, cod, meta.rules?.codSupported ?? null) : null), [state.view, baseCod, cod, meta.rules]);
  const sizePlan = useMemo(() => (state.view ? planTiktokSizeChart(baseSizeRef, sizeChart, meta.rules, sizeChartName) : null), [state.view, baseSizeRef, sizeChart, meta.rules, sizeChartName]);
  const skuPlan = useMemo(() => (state.view && skuForm ? planTiktokSkuEdit(optGroups, skuForm, { status: state.view.status ?? state.view.productStatus, hasDraft: state.view.hasDraft }) : null), [state.view, skuForm, optGroups]);
  const attrDirty = !!attrPlan?.changed; const codDirty = !!codPlan?.changed; const sizeDirty = !!sizePlan?.changed;
  const skuDirty = !!skuPlan?.changed;
  const extraDirty = attrDirty || codDirty || sizeDirty;
  const titleDirty = !!plan?.changed;
  const priceDirty = !!pricePlan && pricePlan.changes.length > 0;
  const mediaDirty = mediaTouched && !mediaBlock && !!mediaPlan && (mediaPlan.imagesChanged || mediaPlan.weightChanged || mediaPlan.boxChanged);
  const dirty = titleDirty || descDirty || priceDirty || mediaDirty || extraDirty || skuDirty || (mediaTouched && !!mediaPlan?.errors.length);
  const changeCount = (titleDirty ? 1 : 0) + (descDirty ? 1 : 0) + (attrPlan?.changes.length ?? 0) + (codDirty ? 1 : 0) + (sizeDirty ? 1 : 0) + (pricePlan?.changes.length ?? 0) + (mediaDirty ? mediaPlan!.changes.length : 0) + (skuDirty ? skuPlan!.changes.length : 0);
  const errors = [
    ...(plan?.errors ?? []), ...(descDirty ? descPlan!.errors : []), ...(pricePlan?.errors ?? []),
    ...(attrDirty ? attrPlan!.errors : []), ...(codDirty ? codPlan!.errors : []), ...(sizeDirty ? sizePlan!.errors : []), ...(skuDirty ? skuPlan!.errors : []),
    ...(mediaTouched && !mediaRefs ? ["รูปบนร้านเปลี่ยนไปแล้ว — กดยกเลิกที่แก้ แล้วลองใหม่"] : []),
    ...(mediaTouched ? mediaPlan?.errors ?? [] : []),
  ];

  const post = async (url: string, payload: unknown) => {
    const r = await apiFetch(url, { method: "POST", body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({ ok: false, view: null, error: `HTTP ${r.status}` })) as TiktokWriteResponse;
    return { r, j };
  };
  // ส่งทีละส่วน: ราคา (มีผลทันที) → ชื่อ + รูป/กล่อง (Partial Edit ครั้งเดียว · ส่งตรวจ) · ส่วนแรกพลาด = ไม่ส่งต่อ
  const save = async () => {
    if (!state.listingId || baseTitle == null || !priceBase || !prices) return;
    const editDirty = titleDirty || descDirty || mediaDirty || extraDirty || skuDirty;
    setSaving(true);
    const done: string[] = [];
    let saved = false;
    let lastView: TiktokListingView | null = null;
    try {
      if (priceDirty) {
        const { r, j } = await post("/api/tiktok-shop/listing-prices", { listing_id: state.listingId, before: priceBase, edit: prices });
        if (!j.ok) {
          toast.error(r.status === 401 ? NO_AUTH : `ราคา: ${j.error ?? `HTTP ${r.status}`}${editDirty ? " (ยังไม่ได้ส่งชื่อ/รูป/กล่อง)" : ""}`);
          if (r.status === 409 && j.view) { setAsking(false); state.apply(j.view); }
          return;
        }
        saved = true; done.push(j.summary ?? "ราคา");
        (j.warnings ?? []).forEach((w) => toast.warning(w));
        if (j.view) lastView = j.view;
      }
      if (editDirty) {
        const payload = {
          listing_id: state.listingId,
          ...(titleDirty && plan ? { before_title: baseTitle, title: plan.title } : {}),
          ...(descDirty && description != null ? { before_description: baseDescription, description } : {}),
          ...(extraDirty ? { extra: {
            ...(attrDirty ? { before_attrs: baseAttrs, attrs } : {}),
            ...(codDirty ? { before_cod: baseCod, cod } : {}),
            ...(sizeDirty ? { before_size_chart: baseSizeRef, size_chart: sizeChart } : {}),
          } } : {}),
          ...(skuDirty && skuForm && state.view ? { skus: { before_sig: tiktokSkuSignature(state.view.skus), primary: skuForm.primary, images: skuForm.images, names: skuForm.names } } : {}),
          ...(mediaDirty && mediaBase && mediaPlan ? { media: { before_uris: mediaBase.images.map((x) => x.uri), before_pkg: mediaBase.pkg, images: mediaPlan.images, pkg: mediaPlan.pkg } } : {}),
        };
        const { r, j } = await post("/api/tiktok-shop/listing-edit", payload);
        if (!j.ok) {
          toast.error(r.status === 401 ? NO_AUTH : `${titleDirty && !mediaDirty && !descDirty ? "ชื่อ" : "แก้สินค้า"}: ${j.error ?? `HTTP ${r.status}`}`);
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

  const warnings = [...(titleDirty ? plan?.warnings ?? [] : []), ...(descDirty ? descPlan?.warnings ?? [] : []), ...(attrDirty ? attrPlan?.warnings ?? [] : []), ...(sizeDirty ? sizePlan?.warnings ?? [] : []), ...(priceDirty ? pricePlan?.warnings ?? [] : []), ...(mediaDirty ? mediaPlan?.warnings ?? [] : []), ...(skuDirty ? skuPlan?.warnings ?? [] : [])];
  const dialog = (
    <ConfirmDialog open={asking && dirty} onClose={() => { if (!saving) setAsking(false); }} onConfirm={() => void save()} loading={saving}
      title={`ส่งการแก้ไข ${changeCount.toLocaleString()} รายการขึ้นร้าน TikTok?`} confirmText="ส่งขึ้น TikTok"
      message={(
        <div className="space-y-2 text-sm">
          <p>ระบบจะแก้สินค้าบนร้าน TikTok จริงตามนี้ (ส่งเฉพาะที่เปลี่ยน · ไม่แตะสต๊อก/สถานะเปิดปิด) · มีประวัติว่าใครแก้อะไร</p>
          {(state.view?.status ?? state.view?.productStatus) === "DRAFT" && <p className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-800">สินค้านี้เป็นฉบับร่าง — บันทึกลงร่างอย่างเดียว ไม่ส่งตรวจ ไม่ขึ้นขาย (กดปุ่ม “เผยแพร่” ด้านบนเมื่อพร้อม)</p>}
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
            {titleDirty && plan && <li><span className="font-medium text-slate-700">ชื่อสินค้า:</span> <span className="text-slate-400 line-through">{baseTitle}</span> → <span className="text-slate-800">{plan.title}</span></li>}
            {attrDirty && attrPlan!.changes.map((c) => <li key={`a-${c.label}`}><span className="font-medium text-slate-700">{c.label}:</span> <span className="text-slate-400">{c.before}</span> → <span className="text-slate-800">{c.after}</span></li>)}
            {codDirty && codPlan?.change && <li><span className="font-medium text-slate-700">{codPlan.change.label}:</span> <span className="text-slate-400">{codPlan.change.before}</span> → <span className="text-slate-800">{codPlan.change.after}</span></li>}
            {sizeDirty && sizePlan?.change && <li><span className="font-medium text-slate-700">{sizePlan.change.label}:</span> <span className="text-slate-400">{sizePlan.change.before}</span> → <span className="text-slate-800">{sizePlan.change.after}</span></li>}
            {descDirty && descPlan?.change && <li><span className="font-medium text-slate-700">{descPlan.change.label}:</span> <span className="text-slate-400">{descPlan.change.before}</span> → <span className="text-slate-800">{descPlan.change.after}</span></li>}
            {mediaDirty && (mediaPlan?.changes ?? []).map((c) => (
              <li key={c.label}><span className="font-medium text-slate-700">{c.label}:</span> <span className="text-slate-400">{c.before}</span> → <span className="text-slate-800">{c.after}</span></li>
            ))}
            {(pricePlan?.changes ?? []).map((c) => (
              <li key={c.skuId}><span className="font-medium text-slate-700">ราคา {c.label}:</span> <span className="text-slate-800">{tiktokPriceChangeText(c)}</span></li>
            ))}
            {skuDirty && skuPlan!.changes.map((c, i) => <li key={`k-${i}`}><span className="font-medium text-slate-700">{c.label}:</span> <span className="text-slate-400">{c.before}</span> → <span className="text-slate-800">{c.after}</span></li>)}
          </ul>
          {warnings.map((w, i) => <p key={i} className="flex items-start gap-1 text-xs text-amber-700"><Icon name="warning" className="mt-0.5 shrink-0" />{w}</p>)}
        </div>
      )} />
  );
  const uploadDescImage = async (file: File): Promise<string> => {
    if (!state.listingId) throw new Error("no listing");
    const fd = new FormData(); fd.append("file", file); fd.append("listing_id", state.listingId);
    const r = await apiFetch("/api/tiktok-shop/upload-image", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({ url: null, error: `HTTP ${r.status}` })) as { url: string | null; error: string | null };
    if (!j.url) { toast.error(r.status === 401 ? NO_AUTH : (j.error ?? "ฝากรูปกับ TikTok ไม่สำเร็จ")); throw new Error(j.error ?? "upload failed"); }
    return j.url;
  };
  return {
    canEdit, baseTitle, title, prices, priceBlock, pricePlan, changeCount, errors, dirty, saving, dialog,
    images, pkg, mediaBase, mediaPlan, mediaBlock,
    baseDescription, description, descEdit, descPlan, uploadDescImage,
    meta, attrs, cod, sizeChart, sizeChartName, attrPlan,
    optGroups, skuForm, skuPlan,
    setSkuImage: (valueKey, ref) => setSkuForm((f) => (f ? { ...f, images: { ...f.images, [valueKey]: ref } } : f)),
    setSkuName: (groupKey, valueKey, name) => setSkuForm((f) => (f ? { ...f, names: { ...f.names, [tiktokOptNameKey(groupKey, valueKey)]: name } } : f)),
    // เปลี่ยนชั้นหลัก: ชั้นใหม่เริ่มจากไม่มีรูป (กลับมาชั้นเดิม = รูปเดิม)
    setSkuPrimary: (groupKey) => setSkuForm((f) => {
      if (!f || f.primary === groupKey) return f;
      const g = optGroups.find((x) => x.key === groupKey);
      const images: Record<string, string | null> = {};
      for (const v of g?.values ?? []) images[v.key] = groupKey === baseSkuForm.primary ? baseSkuForm.images[v.key] ?? null : null;
      return { ...f, primary: groupKey, images };
    }),
    setAttr: (fieldId, vals) => setAttrsState((a) => { const n = { ...(a ?? {}) }; if (vals.length) n[fieldId] = vals; else delete n[fieldId]; return n; }),
    setCod: (on) => setCodState(on),
    setSizeChart: (ref, name) => { setSizeChartState(ref); setSizeChartName(name ?? null); },
    setDescription: (html) => setDescriptionState(html),
    setDescEdit: (on) => { setDescEdit(on); if (!on) setDescriptionState(baseDescription); },
    setTitle: (v) => setTitle(v),
    setPrice: (skuId, price) => setPricesState((rows) => (rows ? rows.map((r) => (r.skuId === skuId ? { ...r, price } : r)) : rows)),
    setPrices: (rows) => setPricesState(rows),
    setImages: (next) => setImagesState(next),
    setPkg: (patch) => setPkgState((p) => (p ? { ...p, ...patch } : p)),
    reset: () => {
      setTitle(baseTitle); setDescriptionState(baseDescription); setDescEdit(false); setAttrsState(baseAttrs ? { ...baseAttrs } : null); setCodState(baseCod); setSizeChartState(baseSizeRef); setSizeChartName(null); if (priceBase) setPricesState(priceBase.map((r) => ({ ...r })));
      if (state.view) setSkuForm({ ...baseSkuForm, images: { ...baseSkuForm.images }, names: { ...baseSkuForm.names } });
      if (mediaBase) { setImagesState(mediaBase.images.map((x) => x.url)); setPkgState({ ...mediaBase.pkg }); }
    },
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
export function TiktokHeaderStatus({ state, disp, dirty, pub }: { state: TiktokListingState; disp: TiktokDisplayApi | null; dirty?: boolean; pub?: TiktokPublishApi | null }) {
  const v = state.view;
  const b = v ? tiktokStatusBadge(v.status) : null;
  const open = !!v && tiktokIsOpen(v);
  // สวิตช์ใช้ได้เฉพาะสถานะที่ TikTok ยอมให้เปิด/ปิด (เปิดขายอยู่ / ร้านหรือ TikTok ปิดไว้)
  const toggleable = !!v && ["ACTIVATE", "SELLER_DEACTIVATED", "PLATFORM_DEACTIVATED"].includes(v.productStatus ?? "");
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {b && <span className={`rounded-full px-2 py-0.5 text-[11px] ${TONE_CLS[b.tone]}`}>{b.label}</span>}
        {/* ฉบับร่าง: ปุ่มเผยแพร่ (เช็กลิสต์ + สต๊อกจริง → ส่งตรวจ) */}
        {v && pub && (v.status ?? v.productStatus) === "DRAFT" && (
          <button type="button" disabled={pub.busy || !!dirty} onClick={pub.request} title={dirty ? "มีที่แก้ค้างอยู่ — บันทึกหรือยกเลิกก่อน" : "ตั้งสต๊อกจริงแล้วส่งให้ TikTok ตรวจเพื่อขึ้นขาย (ถามก่อน)"}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-40"><Icon name="upload" />เผยแพร่</button>
        )}
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
export function TiktokInfoPanel({ state, edit, matchedParent, matchedCode }: { state: TiktokListingState; edit: TiktokEditApi; matchedParent?: string | null; matchedCode?: string | null }) {
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const can = edit.canEdit && edit.title != null && v.productStatus !== "FREEZE" && v.productStatus !== "DELETED";
  const t = edit.title ?? v.title;
  const n = ttsTitleLength(t.replace(/\s+/g, " ").trim());
  const desc = sanitizeRichHtml(v.pendingDescription ?? v.description);
  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-start gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <Icon name="info" className="mt-0.5 shrink-0" />
        {can ? "ข้อมูลสดจากร้าน TikTok · แก้ชื่อ/รายละเอียด/กล่องพัสดุแล้วกด “บันทึกขึ้น TikTok” ด้านล่าง (ถามก่อนส่ง) · TikTok จะตรวจของใหม่ก่อน ระหว่างตรวจร้านยังใช้ของเดิม · รูปแก้ที่แท็บรูป · ราคาแก้ที่แท็บตัวเลือก & ราคา (มีผลทันที)" : "ดูอย่างเดียว — ข้อมูลสดจากร้าน TikTok"}
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
      <TiktokPackageBox v={v} edit={edit} />
      <TiktokAttrsBox v={v} edit={edit} can={can} />
      <TiktokCodSizeBox v={v} edit={edit} can={can} matchedParent={matchedParent} matchedCode={matchedCode} listingId={state.listingId} />
      <TiktokDescriptionBox v={v} edit={edit} can={can} desc={desc} />
    </div>
  );
}

const TIKTOK_IMG_NOTE = "ลากเรียง · รูปแรก = ปก (ควรพื้นขาว) · รูปจากระบบจะถูกทำเป็น JPG จัตุรัสพื้นขาวแล้วฝากกับ TikTok ตอนกดบันทึก · TikTok จะตรวจรูปใหม่ก่อน ระหว่างตรวจร้านยังใช้รูปเดิม";

/** รายละเอียดสินค้า — กดแก้ = กล่องแก้ข้อความกลาง (วาง/ลาก/แทรกรูป → ฝากกับ TikTok) · ไม่มีสิทธิ์ = ดูอย่างเดียว */
function TiktokDescriptionBox({ v, edit, can, desc }: { v: TiktokListingView; edit: TiktokEditApi; can: boolean; desc: string }) {
  const editing = can && edit.descEdit && edit.description != null;
  const p = edit.descPlan;
  const text = editing ? tiktokDescText(edit.description!) : "";
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs text-slate-500">รายละเอียดสินค้า{can ? "" : " (ดูอย่างเดียว)"}</span>
        {v.pendingDescription && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">ฉบับใหม่รอ TikTok ตรวจ</span>}
        {can && !editing && <button type="button" onClick={() => edit.setDescEdit(true)} className="ml-auto text-xs text-violet-700 hover:underline">แก้รายละเอียด</button>}
        {editing && <button type="button" onClick={() => edit.setDescEdit(false)} className="ml-auto text-xs text-slate-500 hover:underline">เลิกแก้ (คืนค่าเดิม)</button>}
      </div>
      {editing ? (
        <>
          <RichTextEditor value={edit.description!} onChange={(html) => edit.setDescription(html)} onUploadImage={edit.uploadDescImage} minHeight={240} />
          <p className={`mt-1 text-[11px] ${p && p.errors.length ? "text-rose-600" : "text-slate-400"}`}>
            {p && p.errors.length ? p.errors[0] : `${text.length.toLocaleString()} ตัวอักษร · TikTok รับรวมโค้ดไม่เกิน ${TTS_DESC_MAX.toLocaleString()} · รูปแทรกได้ด้วยปุ่มรูป/วาง/ลาก (ฝากกับ TikTok ทันที — ยังไม่แก้สินค้าจนกดบันทึก) · TikTok จะตรวจรายละเอียดใหม่ก่อน`}
          </p>
        </>
      ) : (
        <div className="tiptap-content max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm [&_img]:max-w-full [&_img]:rounded"
          dangerouslySetInnerHTML={{ __html: desc || "<p class=\"text-slate-400\">(ไม่มีรายละเอียด)</p>" }} />
      )}
    </div>
  );
}

/** แท็บรูป — เฟส C: เพิ่มจากคลังรูปในระบบ / ลากเรียง / ตั้งปก / ลบ (ของกลาง ./listing-images) · ไม่มีสิทธิ์ = ดูอย่างเดียว */
export function TiktokImagesPanel({ state, onOpen, edit, matchedParent, matchedCode }: {
  state: TiktokListingState; onOpen: (index: number) => void; edit?: TiktokEditApi | null; matchedParent?: string | null; matchedCode?: string | null;
}) {
  const sys = useSystemImages(matchedParent ?? null);
  const [picking, setPicking] = useState(false);
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const can = !!edit?.canEdit && !!edit.images && !edit.mediaBlock;
  const images = can ? edit!.images! : (v.pendingImages ? v.pendingImages.map((x) => x.url) : v.images);
  return (
    <div className="space-y-3">
      {v.pendingImages && (
        <p className="flex items-start gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Icon name="info" className="mt-0.5 shrink-0" />รูปชุดนี้รอ TikTok ตรวจ — ระหว่างนี้ร้านยังใช้รูปเดิม {v.images.length.toLocaleString()} รูป
        </p>
      )}
      {edit?.canEdit && edit.mediaBlock && <p className="text-xs text-amber-700">{edit.mediaBlock}</p>}
      {!can && images.length === 0
        ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">สินค้านี้ไม่มีรูปบน TikTok</p>
        : <ListingImageGrid images={images} onChange={(next) => edit?.setImages(next)} canEdit={can} max={TTS_MAX_IMAGES} platformName="TikTok" dragGroup="tiktok-listing-images"
            onOpen={onOpen} onAdd={() => { setPicking(true); sys.load(); }} canAdd={!!matchedParent} note={can ? TIKTOK_IMG_NOTE : "ดูอย่างเดียว"} />}
      {can && !matchedParent && <p className="text-[11px] text-slate-400">เพิ่มรูปจากระบบได้เมื่อจับคู่สินค้านี้กับ Parent SKU แล้ว (แท็บจับคู่)</p>}
      {can && (
        <ListingImagePicker open={picking} onClose={() => setPicking(false)} mode="product" storageKey="tiktok-image-picker"
          title="เพิ่มรูปสินค้าจากคลังรูปในระบบ" description={`เลือกได้อีก ${Math.max(0, TTS_MAX_IMAGES - images.length)} รูป (TikTok รับไม่เกิน ${TTS_MAX_IMAGES}) · ส่งขึ้นร้านตอนกดบันทึก`}
          matchedParent={matchedParent ?? null} matchedCode={matchedCode} sysImages={sys.images}
          isUsed={(ref) => images.includes(ref)} full={images.length >= TTS_MAX_IMAGES}
          onPick={(ref) => edit!.setImages([...images, ref])} />
      )}
    </div>
  );
}

/** กล่องพัสดุ (เฟส C) — น้ำหนัก กก. + ยาว×กว้าง×สูง ซม. · ใช้คิดค่าส่ง · ไทยไม่บังคับขนาดกล่อง */
function TiktokPackageBox({ v, edit }: { v: TiktokListingView; edit: TiktokEditApi }) {
  const [unit, setUnit] = useWeightUnit();
  const can = edit.canEdit && !!edit.pkg && !edit.mediaBlock;
  const base = edit.mediaBase?.pkg ?? v.pkg;
  const p = can ? edit.pkg! : base;
  const cls = (k: keyof TiktokPkg) => `h-9 w-full rounded-lg border px-2 text-right text-sm ${can && p[k] !== base[k] ? "border-violet-400 bg-violet-50" : "border-slate-200"}`;
  const input = (k: keyof TiktokPkg, step: string, ph: string) => can
    ? <input type="number" min="0" step={step} inputMode="decimal" value={p[k] ?? ""} placeholder={ph} onChange={(e) => edit.setPkg({ [k]: numOrNull(e.target.value) } as Partial<TiktokPkg>)} className={cls(k)} />
    : <div className="flex h-9 items-center justify-end rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm">{p[k] ?? "—"}</div>;
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
        กล่องพัสดุ
        {v.pendingPkg && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-normal text-amber-700">ค่าใหม่รอ TikTok ตรวจ</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block text-xs text-slate-500">
          <span className="flex items-center justify-between gap-1">น้ำหนัก
            <select value={unit} onChange={(e) => setUnit(e.target.value as WeightUnit)} className="h-6 rounded border border-slate-200 bg-white px-1 text-[11px]" aria-label="หน่วยน้ำหนัก">
              <option value="kg">กิโลกรัม</option><option value="g">กรัม</option>
            </select>
          </span>
          {can
            ? <input type="number" min="0" step={unit === "g" ? "1" : "0.001"} inputMode="decimal" value={kgToUnit(p.weight, unit) ?? ""} placeholder={unit === "g" ? "500" : "0.5"}
                onChange={(e) => edit.setPkg({ weight: unitToKg(numOrNull(e.target.value), unit) })} className={cls("weight")} />
            : <div className="flex h-9 items-center justify-end rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm">{kgToUnit(p.weight, unit) ?? "—"}</div>}
        </label>
        <label className="block text-xs text-slate-500">ยาว (ซม.){input("length", "1", "—")}</label>
        <label className="block text-xs text-slate-500">กว้าง (ซม.){input("width", "1", "—")}</label>
        <label className="block text-xs text-slate-500">สูง (ซม.){input("height", "1", "—")}</label>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">วัดหลังแพ็กแล้ว · ใช้คิดค่าส่ง (ใส่ผิดอาจโดนเก็บค่าส่งเพิ่ม) · เลือกกรอกเป็นกรัมหรือกิโลกรัมได้ (ส่ง TikTok เป็นกิโลกรัม ทศนิยม 3 ตำแหน่ง) · ขนาดเป็นจำนวนเต็ม ใส่ครบ 3 ช่อง{can ? " · ส่งพร้อมปุ่มบันทึกขึ้น TikTok (TikTok ตรวจใหม่)" : ""}</p>
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

/** ราคาในระบบต่อตัวเลือก (จาก GET /api/platform-catalog?view=variants — key = id ตัวเลือกบน TikTok) */
export type TiktokErpRow = Pick<VariantMatchRow, "erp_code" | "erp_sale" | "erp_full">;

/**
 * แท็บตัวเลือก & ราคา — เฟส B แก้ราคาได้เมื่อมีสิทธิ์และสินค้าเปิดขายอยู่ · สต๊อกดูอย่างเดียว
 * erpRows = ราคาในระบบ (ราคาขาย/ราคาเต็ม ของ SKU ที่รหัสตรงกัน) โชว์เทียบ · null = ยังโหลดไม่เสร็จ/โหลดไม่ได้ (ซ่อนคอลัมน์)
 */
export function TiktokOptionsPanel({ state, edit, erpRows, matchedParent, matchedCode }: { state: TiktokListingState; edit?: TiktokEditApi | null; erpRows?: Map<string, TiktokErpRow> | null; matchedParent?: string | null; matchedCode?: string | null }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const g = gate(state); if (g) return g;
  const v = state.view!;
  const canPrice = !!edit?.canEdit && !!edit.prices && !edit.priceBlock;
  const rowOf = new Map((edit?.prices ?? []).map((r) => [r.skuId, r]));
  // ราคาที่ใช้เทียบ = ราคาที่กำลังแก้ (ถ้าแก้ได้) ไม่งั้นราคาบนร้าน
  const curPrice = (s: TiktokSkuView) => (canPrice ? rowOf.get(s.skuId)?.price ?? null : s.price);
  const erpOf = (skuId: string): TiktokErpPrice | null => { const r = erpRows?.get(skuId); return r?.erp_code ? { sale: r.erp_sale, full: r.erp_full } : null; };
  const checks = new Map(v.skus.map((s) => [s.skuId, tiktokErpPriceCheck(curPrice(s), erpOf(s.skuId))]));
  const belowN = [...checks.values()].filter((c) => c.flag === "below_sale").length;
  const fullDiffIds = v.skus.filter((s) => checks.get(s.skuId)?.flag === "full_diff").map((s) => s.skuId);
  const notFoundN = erpRows ? v.skus.filter((s) => !erpRows.get(s.skuId)?.erp_code).length : 0;
  const fillErpFull = (ids?: string[]) => {
    if (!edit?.prices) return;
    const r = applyTiktokErpFull(edit.prices, erpOf, ids);
    if (r.changed) edit.setPrices(r.rows);
  };
  const erpCol: MiniColumn<TiktokSkuView> = {
    key: "erp", header: "ราคาในระบบ", width: "7.5rem", align: "right",
    cell: (s) => {
      const r = erpRows?.get(s.skuId);
      if (!r?.erp_code) return <span className="text-[11px] text-slate-400" title="ไม่มี SKU ในระบบที่รหัสตรงกับตัวเลือกนี้ (เทียบรหัสตรง → รหัสสี)">ไม่เจอ SKU</span>;
      if (r.erp_sale == null && r.erp_full == null) return <span className="text-[11px] text-slate-400" title={`SKU ${r.erp_code} ยังไม่ได้ตั้งราคาในระบบ`}>ยังไม่ตั้งราคา</span>;
      const c = checks.get(s.skuId) ?? { flag: null, ratio: null };
      return (
        <span className="block leading-tight" title={`SKU ในระบบ ${r.erp_code}`}>
          <span className={`block ${c.flag === "below_sale" ? "font-medium text-rose-600" : "text-slate-600"}`} title="ราคาขายในระบบ (list price)">ขาย {baht(r.erp_sale)}</span>
          {r.erp_full != null && <span className={`block text-[11px] ${c.flag === "full_diff" ? "text-amber-700" : "text-slate-400"}`} title="ราคาเต็มในระบบ (fake price)">เต็ม {baht(r.erp_full)}</span>}
          {c.flag === "below_sale"
            ? <span className="block text-[11px] text-rose-600" title="ราคาบน TikTok ต่ำกว่าราคาขายในระบบ — ถ้ามีโปรโมชันลดอีก จะยิ่งต่ำ">ต่ำกว่าราคาขาย</span>
            : c.ratio != null ? <span className="block text-[11px] text-slate-400" title="ราคาบน TikTok เป็นกี่เท่าของราคาขายในระบบ">×{c.ratio}</span> : null}
          {canPrice && c.flag === "full_diff" && r.erp_full != null && (
            <button type="button" onClick={() => fillErpFull([s.skuId])} className="text-[11px] text-violet-700 hover:underline" title="เติมราคาเต็มในระบบลงช่องราคา (ยังไม่ส่ง)">ใช้ราคาเต็ม</button>
          )}
        </span>
      );
    },
  };
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
    ...(erpRows ? [erpCol] : []),
    { key: "stock", header: "สต๊อก", width: "4.5rem", align: "right", cell: (s) => (s.stock == null ? <span className="text-slate-300">—</span> : <span className={s.stock === 0 ? "text-rose-600" : ""}>{s.stock.toLocaleString()}</span>) },
    { key: "st", header: "สถานะ", width: "5.5rem", cell: (s) => (s.status === "DEACTIVATED" ? <span className="text-slate-500">ปิด</span> : s.status === "NORMAL" ? <span className="text-emerald-700">ปกติ</span> : <span className="text-slate-300">—</span>) },
  ];
  return (
    <div className="space-y-2">
      {canPrice && <TiktokBulkPriceBar edit={edit!} selected={selected} />}
      {edit?.canEdit && edit.priceBlock && <p className="flex items-start gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><Icon name="info" className="mt-0.5 shrink-0" />{edit.priceBlock}</p>}
      {erpRows && (belowN > 0 || (canPrice && fullDiffIds.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {belowN > 0 && <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-rose-700">ต่ำกว่าราคาขายในระบบ {belowN.toLocaleString()} ตัวเลือก</span>}
          {canPrice && fullDiffIds.length > 0 && (
            <button type="button" onClick={() => fillErpFull(fullDiffIds)} className="rounded-md border border-violet-200 px-2 py-1 text-violet-700 hover:bg-violet-50"
              title="เติมราคาเต็มในระบบลงช่องราคา เฉพาะตัวที่ในระบบมีราคาเต็ม (ยังไม่ส่ง — ต้องกดบันทึก)">ใช้ราคาเต็มในระบบ ({fullDiffIds.length.toLocaleString()} ตัว)</button>
          )}
        </div>
      )}
      <MiniTable rows={v.skus} columns={cols} rowKey={(s) => s.skuId} dense hideToolbar emptyText="ไม่มีตัวเลือก" resizable storageKey="listing-drawer-tiktok-options"
        selectable={canPrice} selected={selected} onSelectedChange={setSelected} />
      {erpRows && (
        <p className="text-[11px] text-slate-400">
          ราคาในระบบ = ราคาขาย / ราคาเต็ม ของ SKU ที่รหัสตรงกับตัวเลือก (ไม่เจอ → ใช้รหัสสี) · ปกติราคาบน TikTok สูงกว่าราคาขาย เพราะร้านลดด้วยโปรโมชัน TikTok — เตือนแดงเมื่อต่ำกว่าราคาขาย · เหลืองเมื่อไม่ตรงราคาเต็มที่ตั้งไว้
          {notFoundN > 0 ? ` · ไม่เจอ SKU ${notFoundN.toLocaleString()} ตัว (รหัสบนร้านไม่ตรงกับในระบบ)` : ""}
        </p>
      )}
      <p className="text-[11px] text-slate-400">
        {canPrice ? `ราคา = ราคาที่ลูกค้าเห็นก่อนส่วนลด · TikTok ไทยรับ ${TTS_PRICE_MIN.toLocaleString()}–${TTS_PRICE_MAX.toLocaleString()} บาท · มีผลทันทีเมื่อกดบันทึก (ส่วนลด/โปรโมชันแก้ใน Seller Center) · ` : ""}สต๊อกดูอย่างเดียว — ยังซิงค์ผ่าน BigSeller
      </p>
      {edit && <TiktokOptionEditor v={v} edit={edit} matchedParent={matchedParent} matchedCode={matchedCode} />}
      <TiktokPromotionsBox listingId={state.listingId} productId={v.productId} skus={v.skus} />
    </div>
  );
}


// ───────────────────────── คุณลักษณะของหมวด · COD · ตารางขนาด (ลิ้นชัก) ─────────────────────────
/** ช่อง/กติกาของหมวดจาก TikTok (GET /api/tiktok-shop/category-meta · แคชฝั่ง server 10 นาที) */
function useTiktokCategoryMeta(listingId: string | null, categoryId: string | null): TiktokEditApi["meta"] {
  const [st, setSt] = useState<{ key: string | null; fields: TtsAttrField[] | null; rules: TtsCategoryRules | null; error: string | null }>({ key: null, fields: null, rules: null, error: null });
  const key = listingId && categoryId ? `${listingId}:${categoryId}` : null;
  useEffect(() => {
    if (!key || !listingId || !categoryId) return;
    let alive = true;
    apiFetch(`/api/tiktok-shop/category-meta?listing_id=${encodeURIComponent(listingId)}&category_id=${encodeURIComponent(categoryId)}`)
      .then((r) => r.json())
      .then((j: { fields: TtsAttrField[] | null; rules: TtsCategoryRules | null; error: string | null }) => { if (alive) setSt({ key, fields: j.fields ?? null, rules: j.rules ?? null, error: j.error ?? null }); })
      .catch(() => { if (alive) setSt({ key, fields: null, rules: null, error: "โหลดช่องของหมวดไม่สำเร็จ" }); });
    return () => { alive = false; };
  }, [key, listingId, categoryId]);
  const mine = st.key === key;
  return { fields: mine ? st.fields : null, rules: mine ? st.rules : null, error: mine ? st.error : null, loading: !!key && !mine };
}

/** กล่องคุณลักษณะ — ช่องกรอกกลาง LazadaAttrField (แปลงช่อง TikTok ด้วย ttsAttrDef) · ช่องบังคับ + ที่มีค่าขึ้นก่อน */
function TiktokAttrsBox({ v, edit, can }: { v: TiktokListingView; edit: TiktokEditApi; can: boolean }) {
  const [more, setMore] = useState(false);
  const fields = edit.meta.fields;
  const cur = edit.attrs ?? v.attrs;
  const filled = (f: TtsAttrField) => (cur[f.id] ?? []).length > 0;
  const main = (fields ?? []).filter((f) => f.required || filled(f) || (v.attrs[f.id] ?? []).length > 0);
  const rest = (fields ?? []).filter((f) => !main.includes(f));
  const missing = edit.attrPlan?.missingRequired ?? [];
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
        คุณลักษณะของหมวด
        {missing.length > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-normal text-rose-700">ช่องบังคับยังว่าง {missing.length}</span>}
      </div>
      {!v.categoryId ? <p className="text-xs text-slate-500">ไม่รู้หมวดของสินค้านี้ — กดดึงตัวนี้จาก TikTok</p>
        : edit.meta.loading ? <LoadingState label="กำลังโหลดช่องของหมวดจาก TikTok…" className="py-3" />
        : !fields ? <p className="text-xs text-rose-600">{edit.meta.error ?? "โหลดช่องของหมวดไม่สำเร็จ"}</p>
        : fields.length === 0 ? <p className="text-xs text-slate-500">หมวดนี้ไม่มีช่องคุณลักษณะ</p>
        : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {(more ? fields : main).map((f) => {
                const def = ttsAttrDef(f);
                return (
                  <LazadaAttrField key={f.id} def={def} value={ttsAttrToText(cur[f.id])} base={ttsAttrToText(v.attrs[f.id])} can={can}
                    onChange={(text) => edit.setAttr(f.id, ttsAttrFromText(f, text))} />
                );
              })}
            </div>
            {rest.length > 0 && <button type="button" onClick={() => setMore((x) => !x)} className="mt-2 text-xs text-violet-700 hover:underline">{more ? "ซ่อนช่องเพิ่มเติม" : `แสดงเพิ่มเติม (${rest.length} ช่อง)`}</button>}
            <p className="mt-2 text-[11px] text-slate-400">ตัวเลือกมาจาก TikTok ตามหมวด · ช่องที่มี * = บังคับ{can ? " · แก้แล้วกดบันทึกขึ้น TikTok (TikTok ตรวจใหม่)" : ""}</p>
          </>
        )}
    </div>
  );
}

/** เก็บเงินปลายทาง + ตารางขนาด (รูป หรือ แม่แบบตาราง — ./tiktok-size-chart-picker) */
function TiktokCodSizeBox({ v, edit, can, matchedParent, matchedCode, listingId }: { v: TiktokListingView; edit: TiktokEditApi; can: boolean; matchedParent?: string | null; matchedCode?: string | null; listingId: string | null }) {
  const rules = edit.meta.rules;
  const cod = edit.cod ?? v.cod;
  const codOff = rules?.codSupported === false;
  const baseSizeRef = tiktokSizeChartRef(v);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="mb-2 text-xs font-semibold text-slate-600">เก็บเงินปลายทาง (COD)</div>
        {can && !codOff
          ? <ToggleSwitch on={!!cod} size="sm" label={<span className="text-sm text-slate-700">{cod ? "เปิดให้เก็บเงินปลายทาง" : "ปิด"}</span>} onChange={(on) => edit.setCod(on)} />
          : <span className="text-sm text-slate-700">{cod == null ? "ไม่ได้ตั้ง" : cod ? "เปิด" : "ปิด"}</span>}
        <p className="mt-1 text-[11px] text-slate-400">{codOff ? "หมวดนี้ TikTok ไม่รองรับเก็บเงินปลายทาง" : rules?.codSupported ? "หมวดนี้รองรับ COD" : "กดบันทึกขึ้น TikTok เพื่อส่ง"}</p>
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
          ตารางขนาด
          {rules?.sizeChartRequired && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-normal text-rose-700">หมวดนี้บังคับ</span>}
        </div>
        <TiktokSizeChartBox by={{ listingId }} categoryId={v.categoryId} rules={rules}
          value={edit.sizeChart ?? baseSizeRef} baseRef={baseSizeRef} baseImageUrl={v.sizeChart?.url ?? null} valueName={edit.sizeChartName}
          can={can} onChange={(ref, name) => edit.setSizeChart(ref, name)} matchedParent={matchedParent} matchedCode={matchedCode} />
      </div>
    </div>
  );
}


// ───────────────────────── เผยแพร่ฉบับร่าง (เจ้าของเลือก 2026-11-13) ─────────────────────────
export type TiktokPublishApi = { request: () => void; busy: boolean; dialog: ReactNode };

/** ปุ่มเผยแพร่ (เฉพาะร่าง): เช็กลิสต์ + ใส่สต๊อกจริงทุกตัวเลือก → POST /api/tiktok-shop/listing-publish (ตั้งสต๊อก → ส่งตรวจ) */
export function useTiktokPublish(state: TiktokListingState, meta: TiktokEditApi["meta"], onDone?: () => void): TiktokPublishApi {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stock, setStock] = useState<Record<string, string>>({});
  const v = state.view;
  const requiredMissing = v && meta.fields ? meta.fields.filter((f) => f.required && !(v.attrs[f.id] ?? []).length).map((f) => f.name) : null;
  const parsed: Record<string, number | null> = {};
  for (const [k, x] of Object.entries(stock)) { const n = Number(x); parsed[k] = x.trim() === "" || !Number.isFinite(n) ? null : n; }
  const plan = v ? planTiktokPublish(v, { stock: parsed, requiredMissing }) : null;

  const run = async () => {
    if (!state.listingId || !plan) return;
    if (plan.errors.length) { toast.error(plan.errors[0]); return; }
    setBusy(true);
    try {
      const r = await apiFetch("/api/tiktok-shop/listing-publish", { method: "POST", body: JSON.stringify({ listing_id: state.listingId, stock: plan.rows.map((x) => ({ sku_id: x.skuId, qty: x.qty })) }) });
      const j = await r.json().catch(() => ({ ok: false, view: null, error: `HTTP ${r.status}` })) as TiktokWriteResponse & { steps?: CreateStep[] };
      if (j.ok) {
        toast.success(`${j.summary ?? "ส่งเผยแพร่แล้ว"} — บันทึกประวัติแล้ว`);
        (j.warnings ?? []).forEach((w) => toast.warning(w));
        setOpen(false); setStock({});
        if (j.view) state.apply(j.view);
        onDone?.();
      } else {
        const failed = j.steps?.find((s) => s.state === "fail");
        toast.error(r.status === 401 ? NO_AUTH : failed ? `ติดที่ "${failed.label}": ${failed.detail ?? j.error}` : (j.error ?? `HTTP ${r.status}`));
        if (j.view) state.apply(j.view);
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const dialog = (
    <ConfirmDialog open={open && !!v} onClose={() => { if (!busy) setOpen(false); }} onConfirm={() => void run()} loading={busy}
      title="เผยแพร่สินค้านี้บน TikTok?" confirmText="ตั้งสต๊อก + ส่งเผยแพร่"
      message={v && plan ? (
        <div className="space-y-2 text-sm">
          <p>ระบบจะตั้งสต๊อกตามที่ใส่ แล้วส่งให้ TikTok ตรวจ — ผ่านแล้ว<b>ขายได้ทันที</b> · มีประวัติว่าใครกด</p>
          <div className="rounded-lg border border-slate-200">
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2 border-b border-slate-100 bg-slate-50 px-2 py-1 text-[11px] text-slate-500"><span>ตัวเลือก</span><span className="text-right">สต๊อกจริง (ชิ้น)</span></div>
            <div className="max-h-56 divide-y divide-slate-100 overflow-auto">
              {v.skus.map((s) => (
                <label key={s.skuId} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2 px-2 py-1.5 text-xs">
                  <span className="min-w-0"><span className="block truncate">{s.label}</span><span className="block truncate font-mono text-[11px] text-slate-400">{s.sellerSku ?? "ไม่มีรหัส"} · ราคา {s.price != null ? `${s.price.toLocaleString("th-TH")}฿` : "—"}</span></span>
                  <input type="number" min={TTS_STOCK_MIN} max={TTS_STOCK_MAX} step="1" inputMode="numeric" value={stock[s.skuId] ?? ""} placeholder="เช่น 5"
                    onChange={(e) => setStock((m) => ({ ...m, [s.skuId]: e.target.value }))} className="h-8 w-full rounded-md border border-slate-200 px-2 text-right text-sm" />
                </label>
              ))}
            </div>
          </div>
          {plan.errors.length > 0 && <ul className="space-y-0.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{plan.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          {plan.warnings.map((w) => <p key={w} className="flex items-start gap-1 text-xs text-amber-700"><Icon name="warning" className="mt-0.5 shrink-0" />{w}</p>)}
        </div>
      ) : ""} />
  );
  return { request: () => setOpen(true), busy, dialog };
}
