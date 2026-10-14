"use client";

/**
 * ParentWebListings — แท็บ "🛍 เว็บไซต์" ใน Parent SKU (drawer + หน้าเต็ม)
 * แก้ข้อมูลบนเว็บร้านออนไลน์ได้เลยในแท็บ: ทุกร้านในที่เดียว
 *   - เปิด/ปิดขึ้นร้าน · แนะนำ · ราคาเว็บ · ชื่อเว็บ · คำอธิบายเว็บ · รูปเว็บ (รุ่น + รายสี หลายรูปต่อสี เลือกจากแกลเลอรี SKU หรือคลัง)
 *   - 📋 จับคู่รายละเอียดหน้าเว็บ: ต่อหัวข้อในชุดรายละเอียดของธีม → ตามค่ากลาง / โชว์ / ซ่อน + ข้อความเฉพาะรุ่นนี้
 *   - เว้นว่าง = ใช้ของ ERP / ค่ากลางตามเดิม
 * ของกลาง: AssetPicker (เลือกรูปจากคลัง) · /api/parent-web-listings (guardApi products.edit + audit + ล้างแคชเว็บร้าน)
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { AssetPicker } from "@/components/asset-picker";
import type { AssetRow } from "@/app/api/assets/shared";
import type { DetailOverride } from "@/lib/website-detail-overrides";
import { DEFAULT_PERSONALIZE, type PersonalizeConfig } from "@/lib/website-personalize";
import { PersonalizeEditor } from "@/components/personalize-editor";
import { ProductBannersEditor } from "@/components/product-banners-editor";
import type { ProductBanner } from "@/lib/website-banners";
import type { CardColors } from "@/lib/website-card-colors";
import { HERO_SIZE_HINT, type ProductHero } from "@/lib/website-hero";
import { MediaUploadField, type MediaValue } from "@/components/media-upload-field";
import { NAME_RULE_EXCLUSIVE, type NameRuleFlag } from "@/lib/website-field-map";
import { uploadResizedImage } from "@/components/image-attach";
import { useFooterSave } from "@/components/footer-save";
import { CopyButton } from "@/components/copy-button";

type Variant = { id: string; code: string; label: string; price: number; qty: number; erpImageKey: string | null; gallery: string[] };
type DetailItemInfo = { id: string; label: string; source: string; enabled: boolean; defaultLabel: string };
type ShopState = {
  shopId: string;
  shopName: string;
  slug: string;
  isDefault: boolean;
  listed: boolean;
  published: boolean;
  featured: boolean;
  webPrice: number | null;
  webName: string;
  /** ชื่อที่เว็บใช้จริงถ้าเว้นช่องชื่อว่าง (คำนวณจากกฎชื่อของร้าน) */
  autoName: string;
  /** กฎชื่อของร้าน — ใช้กับทุกสินค้าในร้าน */
  nameRule: Record<NameRuleFlag, boolean>;
  webDescription: string;
  webImages: string[];
  webSkuImages: Record<string, string[]>;
  webDetails: Record<string, DetailOverride>;
  webPersonalize: PersonalizeConfig | null;
  webBanners: ProductBanner[];
  /** 🎴 สีที่โชว์บนการ์ด + สีหลัก (colors null = ทุกสี) */
  webCardColors: CardColors;
  /** 🎬 รูปเปิดหน้าสินค้า คอม/มือถือ (null = ใช้รูปสินค้า) */
  webHero: ProductHero | null;
  detailItems: DetailItemInfo[];
  soldQty: number;
  productUrl: string;
};
type Resp = {
  code: string;
  parentName: string;
  erpDescription: string | null;
  nameRefs: { brand: string | null; collection: string | null; code: string };
  adminUrl: string;
  variants: Variant[];
  shops: ShopState[];
  /** ฟิลด์ Parent SKU (ทะเบียนฟิลด์) ให้แบนเนอร์เลือกโชว์ */
  webFields?: { key: string; label: string }[];
};

/** ปุ่มกฎชื่อ — ป้ายโชว์คำที่จะถูกลบจริงของรุ่นนี้ */
const NAME_RULE_CHIPS: { flag: NameRuleFlag; label: string; ref?: keyof Resp["nameRefs"] }[] = [
  { flag: "removeBrand", label: "ลบแบรนด์", ref: "brand" },
  { flag: "removeCollection", label: "ลบคอลเลกชัน", ref: "collection" },
  { flag: "removeCode", label: "ลบรหัสสินค้า", ref: "code" },
  { flag: "removeParens", label: "ลบข้อความในวงเล็บ" },
  { flag: "removeParenMarks", label: "ลบแค่วงเล็บ" },
];

/** ค่าที่ปุ่มบันทึกส่ง (saveShop) รวมเป็นข้อความเดียว — ใช้เทียบว่ามีของแก้ค้างไหม */
const snapOf = (s: ShopState) =>
  JSON.stringify([s.published, s.featured, s.webPrice, s.webName, s.webDescription, s.webImages, s.webSkuImages, s.webDetails, s.webPersonalize, s.webBanners, s.webCardColors, s.webHero]);

const MAX_SKU_IMAGES = 8;
const keyUrl = (key: string, w = 160) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;
const SOURCE_LABEL: Record<string, string> = {
  description: "คำอธิบายสินค้า",
  fields: "ฟิลด์ Parent SKU",
  details: "จุดเด่น",
  text: "ข้อความตายตัว",
  shipping: "การจัดส่ง/ชำระเงิน",
};

export function ParentWebListings({ parentId }: { parentId: string | null }) {
  const toast = useToast();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingShop, setSavingShop] = useState<string | null>(null);
  // ตัวเลือกรูปจากคลัง: กำลังเลือกให้ร้านไหน + เป้าหมาย (gallery = รูปรุ่น, หรือ sku id)
  // target: gallery = รูปรุ่น · sku id = รูปสีนั้น · "banner:<id>" = รูปแบนเนอร์
  const [picker, setPicker] = useState<{ shopId: string; target: "gallery" | string } | null>(null);
  // ร้านที่กางแผง "แบนเนอร์หน้าสินค้า" อยู่
  const [bnOpen, setBnOpen] = useState<Set<string>>(new Set());
  // แผงเลือกรูปจากแกลเลอรี SKU ที่เปิดอยู่ (ร้าน + สี)
  const [skuPanel, setSkuPanel] = useState<{ shopId: string; skuId: string } | null>(null);
  // ร้านที่กางแผง "จับคู่รายละเอียดหน้าเว็บ" อยู่
  const [detailsOpen, setDetailsOpen] = useState<Set<string>>(new Set());
  // ร้านที่กางแผง "ปั๊มชื่อ" อยู่
  const [pzOpen, setPzOpen] = useState<Set<string>>(new Set());
  // ค่าที่บันทึกล่าสุดต่อร้าน (เทียบหา "มีของแก้ค้าง" → ปุ่ม 💾 บันทึก แถบล่าง)
  const [savedSnap, setSavedSnap] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!parentId) return;
    setLoading(true);
    try {
      const r = await apiFetch(`/api/parent-web-listings?parentId=${encodeURIComponent(parentId)}`);
      const j = await r.json();
      setData(j?.shops ? (j as Resp) : null);
      if (j?.shops) setSavedSnap(Object.fromEntries((j as Resp).shops.map((s) => [s.shopId, snapOf(s)])));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [parentId]);
  useEffect(() => { void load(); }, [load]);

  const patchShop = (shopId: string, p: Partial<ShopState>) =>
    setData((d) => (d ? { ...d, shops: d.shops.map((s) => (s.shopId === shopId ? { ...s, ...p } : s)) } : d));

  const setSkuImages = (s: ShopState, skuId: string, keys: string[]) => {
    const n = { ...s.webSkuImages };
    const list = [...new Set(keys)].slice(0, MAX_SKU_IMAGES);
    if (list.length) n[skuId] = list;
    else delete n[skuId];
    patchShop(s.shopId, { webSkuImages: n });
  };

  const setDetail = (s: ShopState, itemId: string, p: Partial<DetailOverride> | null) => {
    const n = { ...s.webDetails };
    const cur = { ...(n[itemId] ?? {}), ...(p ?? {}) };
    if (p === null || (cur.show === undefined && !(cur.text ?? "").trim())) delete n[itemId];
    else n[itemId] = cur;
    patchShop(s.shopId, { webDetails: n });
  };

  const addToShop = async (shopId: string) => {
    if (!parentId) return;
    setSavingShop(shopId);
    try {
      const r = await apiFetch("/api/parent-web-listings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, shopId, action: "add" }),
      });
      if ((await r.json()).ok) { patchShop(shopId, { listed: true }); toast.success("เพิ่มเข้าร้านแล้ว (ยังปิดอยู่)"); }
      else toast.error("เพิ่มไม่สำเร็จ");
    } catch { toast.error("เชื่อมต่อไม่ได้"); }
    setSavingShop(null);
  };

  // กฎชื่อของร้าน: บันทึกทันที (ใช้ทุกสินค้าในร้าน) แล้วดึง "ชื่ออัตโนมัติ" ใหม่ — ไม่ทับช่องอื่นที่กำลังแก้อยู่
  const toggleNameRule = async (s: ShopState, flag: NameRuleFlag) => {
    if (!parentId) return;
    const next = !s.nameRule[flag];
    // ลบข้อความในวงเล็บ ↔ ลบแค่วงเล็บ เปิดได้ทีละอัน (เปิดอันหนึ่ง = ปิดอีกอัน)
    const other = next ? NAME_RULE_EXCLUSIVE[flag] : undefined;
    const changes: Partial<Record<NameRuleFlag, boolean>> = { [flag]: next, ...(other ? { [other]: false } : {}) };
    patchShop(s.shopId, { nameRule: { ...s.nameRule, ...changes } });
    try {
      const r = await apiFetch("/api/parent-web-listings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, shopId: s.shopId, action: "nameRule", nameRule: changes }),
      });
      if (!(await r.json()).ok) throw new Error();
      const fresh = (await (await apiFetch(`/api/parent-web-listings?parentId=${encodeURIComponent(parentId)}`)).json()) as Resp;
      const f = fresh?.shops?.find((x) => x.shopId === s.shopId);
      if (f) patchShop(s.shopId, { autoName: f.autoName, nameRule: f.nameRule });
      toast.success(`กฎชื่อร้าน ${s.shopName} ใช้กับทุกสินค้าในร้านแล้ว`);
    } catch {
      patchShop(s.shopId, { nameRule: s.nameRule });
      toast.error("บันทึกกฎชื่อไม่สำเร็จ");
    }
  };

  // 🎴 สีบนการ์ด — เก็บเป็นชื่อสี (ไม่สนตัวพิมพ์) · ติ๊กครบทุกสี = กลับเป็นค่าเริ่มต้น (null)
  const sameColor = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const colorLabels = () => {
    const out: string[] = [];
    for (const v of data?.variants ?? []) if (v.label && !out.some((x) => sameColor(x, v.label))) out.push(v.label);
    return out;
  };
  const cardShown = (s: ShopState, label: string) => s.webCardColors.colors === null || s.webCardColors.colors.some((c) => sameColor(c, label));
  const toggleCardColor = (s: ShopState, label: string) => {
    const all = colorLabels();
    const next = all.filter((l) => (sameColor(l, label) ? !cardShown(s, l) : cardShown(s, l)));
    patchShop(s.shopId, { webCardColors: { ...s.webCardColors, colors: next.length === all.length ? null : next } });
  };
  const setCardMain = (s: ShopState, label: string) =>
    patchShop(s.shopId, { webCardColors: { ...s.webCardColors, main: s.webCardColors.main && sameColor(s.webCardColors.main, label) ? null : label } });
  /** 🎬 ตั้ง/เอาออก รูปเปิดหน้าสินค้าของคอมหรือมือถือ (ว่างทั้งคู่ = null → ใช้รูปสินค้า) */
  const setHero = (s: ShopState, slot: "desktop" | "mobile", m: MediaValue | null) => {
    const cur: ProductHero = s.webHero ?? { desktop: null, mobile: null };
    const next: ProductHero = { ...cur, [slot]: m ? { kind: m.kind, key: m.key, posterKey: null } : null };
    patchShop(s.shopId, { webHero: next.desktop || next.mobile ? next : null });
  };

  const saveShop = async (s: ShopState) => {
    if (!parentId) return;
    setSavingShop(s.shopId);
    try {
      const r = await apiFetch("/api/parent-web-listings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId, shopId: s.shopId,
          patch: {
            isPublished: s.published, featured: s.featured, webPrice: s.webPrice,
            webName: s.webName, webDescription: s.webDescription,
            webImages: s.webImages, webSkuImages: s.webSkuImages, webDetails: s.webDetails,
            webPersonalize: s.webPersonalize, webBanners: s.webBanners,
            webCardColors: s.webCardColors, webHero: s.webHero,
          },
        }),
      });
      if ((await r.json()).ok) {
        setSavedSnap((p) => ({ ...p, [s.shopId]: snapOf(s) }));
        toast.success(`บันทึก ${s.shopName} แล้ว — เว็บเปลี่ยนตามทันที`);
      } else toast.error("บันทึกไม่สำเร็จ");
    } catch { toast.error("เชื่อมต่อไม่ได้"); }
    setSavingShop(null);
  };

  /** เพิ่มรูป (r2 key) ให้ร้าน/เป้าหมาย — ใช้ทั้ง "เลือกจากคลัง" และ "อัปโหลด" · อ่าน state ล่าสุด (อัปโหลดใช้เวลา ระหว่างนั้นอาจแก้ช่องอื่น) */
  const addImages = (shopId: string, target: string, keys: string[]) =>
    setData((d) => (d ? {
      ...d,
      shops: d.shops.map((s) => {
        if (s.shopId !== shopId) return s;
        if (target === "gallery") return { ...s, webImages: [...s.webImages, ...keys].slice(0, 12) };
        if (target.startsWith("banner:")) {
          const id = target.slice(7);
          return { ...s, webBanners: s.webBanners.map((b) => (b.id === id ? { ...b, imageKey: keys[0] } : b)) };
        }
        const list = [...new Set([...(s.webSkuImages[target] ?? []), ...keys])].slice(0, MAX_SKU_IMAGES);
        return { ...s, webSkuImages: { ...s.webSkuImages, [target]: list } };
      }),
    } : d));

  const onPickImages = (assets: AssetRow[]) => {
    if (!picker) return;
    const keys = assets.map((a) => a.r2_key).filter(Boolean);
    if (keys.length) addImages(picker.shopId, picker.target, keys);
    setPicker(null);
  };

  // ⬆ อัปโหลดรูปจากเครื่อง (หลายรูป) → ย่อด้านยาว ≤ 2000px (ของกลาง uploadResizedImage) → เข้าคลังไฟล์อัตโนมัติ → ต่อท้ายรูปของเป้าหมาย
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTo = useRef<{ shopId: string; target: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const startUpload = (shopId: string, target: string) => {
    uploadTo.current = { shopId, target };
    fileRef.current?.click();
  };
  const onUploadFiles = async (files: FileList | null) => {
    const t = uploadTo.current;
    const imgs = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!t || !imgs.length) return;
    setUploading(`${t.shopId}:${t.target}`);
    const keys: string[] = [];
    for (const f of imgs) {
      try {
        keys.push((await uploadResizedImage(f, { folder: "storefront-products", max: 2000 })).r2_key);
      } catch (e) {
        toast.error(`อัปโหลด ${f.name} ไม่สำเร็จ: ${(e as Error).message}`);
      }
    }
    if (keys.length) {
      addImages(t.shopId, t.target, keys);
      toast.success(`อัปโหลด ${keys.length} รูปแล้ว — กด 💾 บันทึก เพื่อขึ้นเว็บ`);
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
  };
  const uploadBtn = (shopId: string, target: string, cls: string) => {
    const busy = uploading === `${shopId}:${target}`;
    return (
      <button type="button" onClick={() => startUpload(shopId, target)} disabled={!!uploading}
        title="อัปโหลดรูปจากเครื่อง (เลือกได้หลายรูป · ย่อให้อัตโนมัติ · เก็บเข้าคลังไฟล์ด้วย)" className={`${cls} disabled:opacity-50`}>
        {busy ? "กำลังอัป…" : "⬆ อัปโหลด"}
      </button>
    );
  };

  // 💾 ปุ่มบันทึกอยู่แถบล่างของหน้าต่าง (ของกลาง footer-save) — เทียบกับค่าที่บันทึกล่าสุดต่อร้าน
  const dirtyShops = (data?.shops ?? []).filter((s) => s.listed && savedSnap[s.shopId] !== undefined && snapOf(s) !== savedSnap[s.shopId]);
  const saveDirty = async () => {
    for (const s of dirtyShops) await saveShop(s);
  };
  const inFooter = useFooterSave(parentId && data ? { label: "เว็บไซต์", dirty: dirtyShops.length > 0, saving: savingShop !== null, onSave: saveDirty } : null);

  if (!parentId) return <div className="text-sm text-slate-400 py-8 text-center">บันทึกรุ่นก่อน แล้วค่อยตั้งค่าการขายบนเว็บ</div>;
  if (loading) return <div className="text-sm text-slate-400 py-8 text-center">กำลังโหลด…</div>;
  if (!data) return <div className="text-sm text-slate-400 py-8 text-center">โหลดข้อมูลไม่สำเร็จ</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-500">
          ตั้งค่าการขายบนเว็บร้านออนไลน์ — เว้นว่าง = ใช้ชื่อ/รูป/คำอธิบายจาก ERP อัตโนมัติ
        </p>
        <a href={data.adminUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
          หลังบ้านร้าน (จัดการรวม) ↗
        </a>
      </div>

      {/* ร้านที่ยังไม่ขายรุ่นนี้ — รวมเป็นแถวเดียว กดเพิ่มทีละร้าน */}
      {data.shops.some((s) => !s.listed) && (
        <div className="flex items-center gap-2 flex-wrap rounded-xl border border-dashed border-slate-300 px-3 py-2">
          <span className="text-xs text-slate-500">ยังไม่ขายใน:</span>
          {data.shops.filter((s) => !s.listed).map((s) => (
            <button key={s.shopId} onClick={() => addToShop(s.shopId)} disabled={savingShop === s.shopId}
              title={`เพิ่มรุ่นนี้เข้าร้าน ${s.shopName} (ยังปิดอยู่ จนกว่าจะเปิด "ขึ้นร้าน")`}
              className="text-xs border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-60 rounded-full px-2.5 py-1">
              {savingShop === s.shopId ? "กำลังเพิ่ม…" : `+ ${s.shopName}`}
              {s.isDefault && <span className="text-[10px] text-slate-400 ml-1">ร้านหลัก</span>}
            </button>
          ))}
        </div>
      )}

      {data.shops.filter((s) => s.listed).map((s) => {
        const overrideCount = Object.keys(s.webDetails).length;
        const detailsShown = detailsOpen.has(s.shopId);
        return (
        <div key={s.shopId} className="rounded-xl border border-slate-200 overflow-hidden">
          {/* หัวการ์ด: ชื่อร้าน + เปิดขึ้นร้าน + แนะนำ + ยอดขาย ในแถวเดียว */}
          <div className="flex items-center gap-x-3 gap-y-1 bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex-wrap">
            <span className="text-sm font-medium text-slate-800">{s.shopName}</span>
            {s.isDefault && <span className="text-[11px] text-slate-400 -ml-2">(ร้านหลัก)</span>}
            <Toggle label="ขึ้นร้าน" on={s.published} onClick={() => patchShop(s.shopId, { published: !s.published })} />
            <button onClick={() => patchShop(s.shopId, { featured: !s.featured })}
              className={`text-xs flex items-center gap-1 ${s.featured ? "text-amber-500" : "text-slate-400"}`}>
              <span className="text-base leading-none">★</span> แนะนำ
            </button>
            <span className="text-[11px] text-slate-400 ml-auto">ขายผ่านเว็บ {s.soldQty} ชิ้น</span>
            {s.published && s.productUrl && (
              <>
                <a href={s.productUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">ดูหน้าเว็บ ↗</a>
                <CopyButton value={s.productUrl} label="คัดลอกลิงก์" title="คัดลอกลิงก์หน้าสินค้านี้" className="!py-0.5" />
              </>
            )}
          </div>

            <div className="p-3 space-y-3">
              <div className="grid sm:grid-cols-[1fr_10rem] gap-2">
                <div>
                  <Field label="ชื่อบนเว็บ (ว่าง = ใช้ชื่ออัตโนมัติด้านล่าง)" value={s.webName} onChange={(v) => patchShop(s.shopId, { webName: v })} placeholder={s.autoName} />
                  {/* กฎชื่อของร้าน: ประกอบชื่ออัตโนมัติจากชื่อใน ERP โดยตัดส่วนที่ไม่ต้องการออก */}
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-400" title="ตั้งครั้งเดียว ใช้กับทุกสินค้าในร้านนี้ (แก้ได้ที่ เว็บไซต์ → จับคู่ฟิลด์ ด้วย)">กฎชื่อร้านนี้:</span>
                    {NAME_RULE_CHIPS.map((c) => {
                      const ref = c.ref ? data.nameRefs[c.ref] : null;
                      if (c.ref && !ref) return null; // รุ่นนี้ไม่มีแบรนด์/คอลเลกชัน → ไม่ต้องโชว์ปุ่ม
                      const on = s.nameRule[c.flag];
                      return (
                        <button key={c.flag} type="button" onClick={() => toggleNameRule(s, c.flag)}
                          className={`text-[11px] rounded-full border px-2 py-0.5 ${on ? "bg-slate-700 border-slate-700 text-white" : "border-slate-300 text-slate-500 hover:bg-slate-100"}`}>
                          {on ? "✓ " : ""}{c.label}{ref ? ` "${ref}"` : ""}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 truncate" title={s.autoName}>
                    {s.webName.trim() ? "⚠️ พิมพ์ชื่อทับไว้ — เว็บใช้ชื่อที่พิมพ์ (ลบออกเพื่อใช้ชื่ออัตโนมัติ)" : <>ชื่อที่เว็บจะโชว์: <span className="text-slate-700">{s.autoName}</span></>}
                  </div>
                </div>
                <NumField label="ราคาเว็บ (ว่าง = ราคาปกติ)" value={s.webPrice} onChange={(v) => patchShop(s.shopId, { webPrice: v })} />
              </div>
              <Field textarea label="คำอธิบายบนเว็บ (ว่าง = ใช้จาก ERP)" value={s.webDescription} onChange={(v) => patchShop(s.shopId, { webDescription: v })} placeholder={data.erpDescription ?? "—"} />

              {/* 🎬 รูปเปิดหน้าสินค้า (Hero) — ภาพ/วิดีโอแรกของแกลเลอรี เต็มช่องแบบ Gucci */}
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-medium text-slate-700">🎬 รูปเปิดหน้าสินค้า (Hero) — ภาพแรกเต็มช่อง ไม่มีขอบ</span>
                  <span className="text-[11px] text-slate-500">{s.webHero ? "ตั้งไว้แล้ว" : "ว่าง = ใช้รูปสินค้าตามเดิม"}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MediaUploadField
                    label="🖥 คอม"
                    hint={`${HERO_SIZE_HINT.desktop} · ${HERO_SIZE_HINT.video}`}
                    value={s.webHero?.desktop ?? null}
                    onChange={(m) => setHero(s, "desktop", m)}
                    previewRatio="16 / 9"
                  />
                  <MediaUploadField
                    label="📱 มือถือ"
                    hint={HERO_SIZE_HINT.mobile}
                    value={s.webHero?.mobile ?? null}
                    onChange={(m) => setHero(s, "mobile", m)}
                    previewRatio="4 / 5"
                  />
                </div>
              </div>

              {/* รูปเว็บ (รุ่น) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-slate-600">รูปบนเว็บ ({s.webImages.length}) — ว่าง = ใช้รูป ERP</span>
                  <div className="flex items-center gap-1.5">
                    {uploadBtn(s.shopId, "gallery", "text-xs border border-orange-300 text-orange-600 hover:bg-orange-50 rounded-lg px-2.5 py-1")}
                    <button onClick={() => setPicker({ shopId: s.shopId, target: "gallery" })}
                      className="text-xs border border-orange-300 text-orange-600 hover:bg-orange-50 rounded-lg px-2.5 py-1">🖼 เลือกรูปจากคลัง</button>
                  </div>
                </div>
                {s.webImages.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.webImages.map((k, i) => (
                      <div key={`${k}-${i}`} className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={keyUrl(k)} alt="" className={`w-14 h-14 object-cover rounded-lg border ${i === 0 ? "border-orange-400 ring-1 ring-orange-300" : "border-slate-200"}`} />
                        {i === 0 && <span className="absolute -top-1.5 -left-1.5 text-[10px] bg-orange-500 text-white rounded px-1">ปก</span>}
                        <button onClick={() => patchShop(s.shopId, { webImages: s.webImages.filter((_, j) => j !== i) })}
                          className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full w-4 h-4 text-[10px] leading-none opacity-0 group-hover:opacity-100">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* รูปเว็บรายสี — หลายรูปต่อสี เลือกจากแกลเลอรี SKU หรือคลัง */}
              {data.variants.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-slate-600 mb-1.5">
                    ตัวเลือก (สี) — {data.variants.length} แบบ · เลือกรูปเว็บรายสีได้หลายรูป (ว่าง = ใช้รูปปก SKU) · กดเลือกสีบนเว็บแล้วแกลเลอรีจะโชว์รูปชุดนั้น
                  </div>
                  {(() => {
                    const all = colorLabels();
                    const shown = all.filter((l) => cardShown(s, l)).length;
                    const custom = s.webCardColors.colors !== null || s.webCardColors.main !== null;
                    return (
                      <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 mb-1.5 rounded-lg bg-emerald-50/60 px-2 py-1">
                        <span>🎴 การ์ดสินค้า: โชว์จุดสี <b className="text-slate-700">{shown}/{all.length}</b> สี · ★ สีหลัก (รูปแรกบนการ์ด): <b className="text-slate-700">{s.webCardColors.main ?? "ตามลำดับเดิม"}</b></span>
                        {custom && <button type="button" onClick={() => patchShop(s.shopId, { webCardColors: { colors: null, main: null } })} className="text-blue-600 hover:underline">ใช้ค่าเริ่มต้น (ทุกสี)</button>}
                        <span className="text-slate-400">กด 🎴 เพื่อโชว์/ซ่อนบนการ์ด · กด ★ เลือกสีหลัก</span>
                      </div>
                    );
                  })()}
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {data.variants.map((v) => {
                      const chosen = s.webSkuImages[v.id] ?? [];
                      const panelOpen = skuPanel?.shopId === s.shopId && skuPanel.skuId === v.id;
                      return (
                        <div key={v.id} className="p-2 bg-white space-y-1.5">
                          <div className="flex items-center gap-2.5">
                            {v.erpImageKey ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={keyUrl(v.erpImageKey)} alt="" className="w-10 h-10 rounded object-cover bg-slate-100 shrink-0" />
                            ) : <div className="w-10 h-10 rounded bg-slate-100 shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-slate-800 truncate">{v.label}</div>
                              <div className="text-xs text-slate-400">{v.code} · {baht(v.price)} · สต๊อก {v.qty} · รูปใน SKU {v.gallery.length}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {(() => {
                                const on = cardShown(s, v.label);
                                const isMain = !!s.webCardColors.main && sameColor(s.webCardColors.main, v.label);
                                return (
                                  <>
                                    <button type="button" onClick={() => toggleCardColor(s, v.label)}
                                      title={on ? "โชว์เป็นจุดสีบนการ์ดสินค้า — กดเพื่อซ่อน" : "ไม่โชว์บนการ์ด — กดเพื่อโชว์"}
                                      className={`text-xs border rounded-lg px-1.5 py-1 ${on ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-300 line-through"}`}>🎴</button>
                                    <button type="button" onClick={() => setCardMain(s, v.label)}
                                      title={isMain ? "สีหลักของการ์ด — กดเพื่อยกเลิก" : "ตั้งเป็นสีหลัก (รูปแรกบนการ์ดเป็นรูปสีนี้)"}
                                      className={`text-base leading-none px-0.5 ${isMain ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}>★</button>
                                  </>
                                );
                              })()}
                              <button onClick={() => setSkuPanel(panelOpen ? null : { shopId: s.shopId, skuId: v.id })}
                                disabled={!v.gallery.length}
                                title={v.gallery.length ? "เลือกจากรูปที่อัปโหลดไว้ในหน้า SKU" : "SKU นี้ยังไม่มีรูป — อัปโหลดในหน้า SKU ก่อน"}
                                className={`text-xs border rounded-lg px-2 py-1 disabled:opacity-40 ${panelOpen ? "bg-orange-500 border-orange-500 text-white" : "border-orange-300 text-orange-600 hover:bg-orange-50"}`}>
                                📷 จากรูป SKU
                              </button>
                              {uploadBtn(s.shopId, v.id, "text-xs border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-lg px-2 py-1")}
                              <button onClick={() => setPicker({ shopId: s.shopId, target: v.id })}
                                className="text-xs border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-lg px-2 py-1">🖼 จากคลัง</button>
                              {chosen.length > 0 && (
                                <button onClick={() => setSkuImages(s, v.id, [])} className="text-xs text-rose-500 hover:underline">ล้าง</button>
                              )}
                            </div>
                          </div>

                          {/* รูปเว็บที่เลือกไว้ของสีนี้ (เรียงตามลำดับที่จะโชว์) */}
                          {chosen.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pl-12">
                              {chosen.map((k, i) => (
                                <div key={`${k}-${i}`} className="relative group">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={keyUrl(k)} alt="" className={`w-12 h-12 object-cover rounded-lg border ${i === 0 ? "border-orange-400 ring-1 ring-orange-300" : "border-slate-200"}`} />
                                  <span className="absolute -top-1.5 -left-1.5 text-[10px] bg-slate-700 text-white rounded px-1">{i + 1}</span>
                                  {i > 0 && (
                                    <button title="เลื่อนไปซ้าย" onClick={() => { const n = [...chosen]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setSkuImages(s, v.id, n); }}
                                      className="absolute bottom-0 left-0 bg-white/90 text-slate-700 rounded text-[10px] px-1 opacity-0 group-hover:opacity-100">‹</button>
                                  )}
                                  {i < chosen.length - 1 && (
                                    <button title="เลื่อนไปขวา" onClick={() => { const n = [...chosen]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setSkuImages(s, v.id, n); }}
                                      className="absolute bottom-0 right-0 bg-white/90 text-slate-700 rounded text-[10px] px-1 opacity-0 group-hover:opacity-100">›</button>
                                  )}
                                  <button onClick={() => setSkuImages(s, v.id, chosen.filter((_, j) => j !== i))}
                                    className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full w-4 h-4 text-[10px] leading-none opacity-0 group-hover:opacity-100">✕</button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* แผงแกลเลอรี SKU: กดรูปเพื่อเลือก/ยกเลิก */}
                          {panelOpen && (
                            <div className="ml-12 rounded-lg border border-orange-200 bg-orange-50/50 p-2 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] text-slate-500">
                                <span>รูปในหน้า SKU {v.code} — กดเพื่อเลือก (สูงสุด {MAX_SKU_IMAGES} รูป · เลือกแล้ว {chosen.length})</span>
                                <div className="flex gap-2">
                                  <button onClick={() => setSkuImages(s, v.id, v.gallery)} className="text-orange-600 hover:underline">เลือกทั้งหมด</button>
                                  <button onClick={() => setSkuPanel(null)} className="text-slate-500 hover:underline">ปิด</button>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {v.gallery.map((k) => {
                                  const idx = chosen.indexOf(k);
                                  const on = idx >= 0;
                                  return (
                                    <button key={k} type="button"
                                      onClick={() => setSkuImages(s, v.id, on ? chosen.filter((x) => x !== k) : [...chosen, k])}
                                      disabled={!on && chosen.length >= MAX_SKU_IMAGES}
                                      className={`relative rounded-lg overflow-hidden border-2 disabled:opacity-40 ${on ? "border-orange-500" : "border-transparent hover:border-orange-300"}`}>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={keyUrl(k)} alt="" className="w-14 h-14 object-cover" />
                                      {on && <span className="absolute top-0.5 left-0.5 text-[10px] bg-orange-500 text-white rounded px-1">{idx + 1}</span>}
                                      {k === v.erpImageKey && <span className="absolute bottom-0 inset-x-0 text-[9px] bg-black/50 text-white text-center">ปก SKU</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 🔤 ปั๊มชื่อ (Personalize) — ตั้งตำแหน่ง/ขนาด/แบบ ต่อรุ่น */}
              <div className="rounded-lg border border-slate-200">
                <button type="button" onClick={() => setPzOpen((prev) => { const n = new Set(prev); if (n.has(s.shopId)) n.delete(s.shopId); else n.add(s.shopId); return n; })}
                  className="w-full flex items-center justify-between px-3 py-2 text-left">
                  <span className="text-xs font-medium text-slate-600">
                    🔤 ปั๊มชื่อ (Personalize)
                    {s.webPersonalize?.enabled && <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5">เปิดอยู่ · {s.webPersonalize.positions.filter((p) => p.enabled).length} ตำแหน่ง</span>}
                  </span>
                  <span className="text-xs text-slate-400">{pzOpen.has(s.shopId) ? "▴ ซ่อน" : "▾ ตั้งค่า"}</span>
                </button>
                {pzOpen.has(s.shopId) && (
                  <div className="border-t border-slate-100 p-3">
                    <PersonalizeEditor
                      value={s.webPersonalize ?? DEFAULT_PERSONALIZE}
                      onChange={(next) => patchShop(s.shopId, { webPersonalize: next })}
                      imageOptions={[
                        ...s.webImages.map((k, i) => ({ key: k, label: `รูปเว็บ ${i + 1}` })),
                        ...data.variants.flatMap((v) => (s.webSkuImages[v.id] ?? v.gallery).map((k, i) => ({ key: k, label: `${v.label} · รูป ${i + 1}` }))),
                      ].filter((o, i, arr) => arr.findIndex((x) => x.key === o.key) === i)}
                      fallbackImageKey={s.webImages[0] ?? data.variants[0]?.erpImageKey ?? null}
                    />
                    <p className="text-[11px] text-slate-400 mt-2">ลูกค้าจะพิมพ์ข้อความ เลือกแบบ และเลือกตำแหน่งได้ในหน้าสินค้า (ชิ้นส่วน "ปั๊มชื่อ" ในส่วนราคา-ตะกร้า) และในบล็อก "ปั๊มชื่อ" ของตัวจัดหน้า · กด "บันทึก" ด้านล่างเพื่อใช้งาน</p>
                  </div>
                )}
              </div>

              {/* 🖼 แบนเนอร์หน้าสินค้า (หลายรูป) — ทับแบนเนอร์กลางของธีมเฉพาะรุ่นนี้ */}
              <div className="rounded-lg border border-slate-200">
                <button type="button" onClick={() => setBnOpen((prev) => { const n = new Set(prev); if (n.has(s.shopId)) n.delete(s.shopId); else n.add(s.shopId); return n; })}
                  className="w-full flex items-center justify-between px-3 py-2 text-left">
                  <span className="text-xs font-medium text-slate-600">
                    🖼 แบนเนอร์หน้าสินค้า
                    {s.webBanners.length > 0 && <span className="ml-2 text-[10px] bg-orange-100 text-orange-700 rounded-full px-1.5 py-0.5">{s.webBanners.length} แบนเนอร์</span>}
                  </span>
                  <span className="text-xs text-slate-400">{bnOpen.has(s.shopId) ? "▴ ซ่อน" : "▾ ตั้งค่า"}</span>
                </button>
                {bnOpen.has(s.shopId) && (
                  <div className="border-t border-slate-100 p-3 space-y-2">
                    <p className="text-[11px] text-slate-500">ไม่ตั้ง = ใช้แบนเนอร์กลางของธีม (ดีไซน์ → หน้าสินค้า → ⚙️ แบนเนอร์) · ตั้งแล้วจะโชว์ตามลำดับนี้แทน หลายรูปได้ แต่ละรูปเลือกครึ่งจอ/เต็มจอ ตำแหน่งข้อความ ฟิลด์ และค่ามือถือแยก</p>
                    <ProductBannersEditor
                      banners={s.webBanners}
                      onChange={(webBanners) => patchShop(s.shopId, { webBanners })}
                      imageOptions={[
                        ...s.webImages.map((k, i) => ({ key: k, label: `รูปเว็บ ${i + 1}` })),
                        ...data.variants.flatMap((v) => (s.webSkuImages[v.id] ?? v.gallery).map((k, i) => ({ key: k, label: `${v.label} · รูป ${i + 1}` }))),
                      ].filter((o, i, arr) => arr.findIndex((x) => x.key === o.key) === i)}
                      fields={data.webFields ?? []}
                      onPickFromLibrary={(id) => setPicker({ shopId: s.shopId, target: `banner:${id}` })}
                    />
                  </div>
                )}
              </div>

              {/* 📋 จับคู่รายละเอียดหน้าเว็บ (ทับชุดรายละเอียดของธีมเฉพาะรุ่นนี้) */}
              <div className="rounded-lg border border-slate-200">
                <button type="button" onClick={() => setDetailsOpen((prev) => { const n = new Set(prev); if (n.has(s.shopId)) n.delete(s.shopId); else n.add(s.shopId); return n; })}
                  className="w-full flex items-center justify-between px-3 py-2 text-left">
                  <span className="text-xs font-medium text-slate-600">
                    📋 จับคู่รายละเอียดหน้าเว็บ
                    {overrideCount > 0 && <span className="ml-2 text-[10px] bg-orange-100 text-orange-700 rounded-full px-1.5 py-0.5">ปรับไว้ {overrideCount} หัวข้อ</span>}
                  </span>
                  <span className="text-xs text-slate-400">{detailsShown ? "▴ ซ่อน" : "▾ ตั้งค่า"}</span>
                </button>
                {detailsShown && (
                  <div className="border-t border-slate-100 p-3 space-y-2">
                    <p className="text-[11px] text-slate-500">
                      หัวข้อมาจาก "ชุดรายละเอียดสินค้า" ของธีม (ดีไซน์ → หน้าสินค้า) — ตั้งเฉพาะรุ่นนี้ว่าจะโชว์/ซ่อน หรือใส่ข้อความเฉพาะรุ่นแทนเนื้อหากลาง ·{" "}
                      <a href={`/website/${s.slug}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">แก้ชุดรายละเอียดกลาง ↗</a>
                    </p>
                    {s.detailItems.length === 0 && <div className="text-xs text-slate-400">ธีมร้านนี้ยังไม่มีหัวข้อรายละเอียด</div>}
                    {s.detailItems.map((it) => {
                      const ov = s.webDetails[it.id];
                      const mode: "default" | "show" | "hide" = ov?.show === true ? "show" : ov?.show === false ? "hide" : "default";
                      return (
                        <div key={it.id} className="rounded-lg bg-slate-50 p-2 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-slate-800 truncate">{it.label}</div>
                              <div className="text-[11px] text-slate-400">{SOURCE_LABEL[it.source] ?? it.source} · ค่ากลาง: {it.defaultLabel}</div>
                            </div>
                            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs shrink-0">
                              {([["default", "ตามค่ากลาง"], ["show", "โชว์"], ["hide", "ซ่อน"]] as const).map(([m, label]) => (
                                <button key={m} type="button"
                                  onClick={() => setDetail(s, it.id, m === "default" ? { show: undefined } : { show: m === "show" })}
                                  className={`px-2.5 py-1 ${mode === m ? (m === "hide" ? "bg-rose-500 text-white" : m === "show" ? "bg-emerald-500 text-white" : "bg-slate-600 text-white") : "bg-white text-slate-600 hover:bg-slate-100"}`}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {mode !== "hide" && (
                            <textarea value={ov?.text ?? ""} rows={ov?.text ? 3 : 1}
                              onChange={(e) => setDetail(s, it.id, { text: e.target.value })}
                              placeholder="ข้อความเฉพาะรุ่นนี้ (ว่าง = ใช้เนื้อหาจากแหล่งข้อมูลกลาง)"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-orange-400" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* อยู่ในหน้าต่าง (drawer) = ปุ่มบันทึกอยู่แถบล่างแล้ว · เปิดนอก drawer = ปุ่มในกล่องตามเดิม */}
              {inFooter ? (
                dirtyShops.some((d) => d.shopId === s.shopId) && (
                  <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    มีการแก้ไขที่ยังไม่บันทึก — กด 💾 บันทึก ที่แถบล่าง
                  </div>
                )
              ) : (
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => saveShop(s)} disabled={savingShop === s.shopId}
                    className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm rounded-lg px-5 py-2">
                    {savingShop === s.shopId ? "กำลังบันทึก…" : "บันทึก"}
                  </button>
                </div>
              )}
            </div>
        </div>
        );
      })}

      <AssetPicker
        open={!!picker}
        onClose={() => setPicker(null)}
        onSelect={onPickImages}
        multiple={!picker?.target.startsWith("banner:")}
        typeFilter="image"
        title={picker?.target === "gallery" ? "เลือกรูปสินค้าบนเว็บ" : picker?.target.startsWith("banner:") ? "เลือกรูปแบนเนอร์" : "เลือกรูปเว็บของสีนี้ (เลือกได้หลายรูป)"}
      />
      {/* ช่องเลือกไฟล์ตัวเดียว ใช้ร่วมทุกปุ่ม ⬆ อัปโหลด (รู้เป้าหมายจาก uploadTo) */}
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onUploadFiles(e.target.files)} />
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
      <button type="button" role="switch" aria-checked={on} onClick={onClick}
        className={`relative w-8 h-5 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-3" : ""}`} />
      </button>
      {label}
    </label>
  );
}

function Field({ label, value, onChange, placeholder, textarea }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-orange-400" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-orange-400" />
      )}
    </label>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      <input type="number" inputMode="numeric" value={value ?? ""} placeholder="—"
        onChange={(e) => { const t = e.target.value.trim(); const n = t === "" ? null : Number(t); if (n !== null && (isNaN(n) || n < 0)) return; onChange(n); }}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-right outline-none focus:ring-1 focus:ring-orange-400" />
    </label>
  );
}
