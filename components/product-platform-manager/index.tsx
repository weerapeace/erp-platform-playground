"use client";

// ============================================================
// ProductPlatformManager (ของกลาง) — ศูนย์เตรียมลงขายหลายแพลตฟอร์ม (เฟส 1a, MVP ในบ้าน)
// เปิดต่อ Parent SKU · sub-tab ตาม erp_platforms (ไม่ hardcode) · ร่างต่อแพลตฟอร์ม +
// ตาราง SKU/variant จริง (MiniTable) + รูป (HoverImage, ย่อผ่าน /api/r2-image) + checklist
// ยังไม่ publish จริง (เฟส 2 — ต่อ API/queue) · มี toast ในตัว (droppable ทุกที่)
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { ERPInput, ERPTextarea } from "@/components/form";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { HoverImage } from "@/components/hover-image";
import { useDrawerResize } from "@/lib/use-drawer-resize";
import { r2ImageUrl } from "@/lib/r2-image";
import { apiFetch } from "@/lib/api";
import { requiredChecks } from "@/lib/platform-required-fields";

// ตัวแก้สินค้ากลาง (SKU) — เปิดจากตัวจัดการเพื่อแก้ราคา/สี/รูป หรือเพิ่มสีใหม่ · dynamic กัน import วน
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });
// ตัวช่วยสร้าง SKU หลายชั้น (สี × ตัวเลือก) — ของกลาง
const VariantMatrixModal = dynamic(() => import("@/components/variant-matrix").then((m) => m.VariantMatrixModal), { ssr: false });

type Platform = { id: string; code: string; name_th: string; icon_key: string | null; theme_color: string | null; capabilities?: Record<string, unknown> };
type Draft = { title?: string | null; description?: string | null; category_path?: string | null; status?: string | null; image_keys?: string[]; extra?: Record<string, unknown>; platform_product_id?: string | null; review_link?: string | null; last_sync_status?: string | null; last_error?: string | null };
type ParentInfo = { id: string; code: string; name_th: string; name_platform: string; description: string; category_id: string | null; category_name: string | null; brand_name: string | null };
type ImageItem = { key: string; source: string };
type Account = { label: string | null; is_active: boolean };
type Variant = { id: string; code: string; name: string; color: string | null; price: number | null; image_key: string | null; is_active: boolean; has_price: boolean; has_image: boolean };
type Toast = { id: number; type: "success" | "error" | "info"; msg: string };

const PLATFORM_ICON: Record<string, string> = { shopee: "🛍️", lazada: "🛒", tiktok: "🎵", tiktok_shop: "🎵", website: "🌐", instagram: "📸", facebook: "👍", line_oa: "💬", youtube: "▶️", pinterest: "📌", x: "✖️" };

// ค้นหา + เลือกหมวดหมู่ของแพลตฟอร์ม (จาก platform_category_options ที่นำเข้ามา) — คืนค่า "id · ชื่อ"
function CategoryOptionPicker({ platformId, onPick }: { platformId: string; onPick: (label: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ external_id: string; name_th: string; name_en: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true; setLoading(true);
    const t = setTimeout(async () => {
      try { const j = await apiFetch(`/api/platform-category-options?${new URLSearchParams({ platform_id: platformId, search: q, limit: "30" })}`).then((r) => r.json()); if (live) { setResults(j.categories ?? []); setTotal(j.total ?? 0); } }
      catch { if (live) setResults([]); } finally { if (live) setLoading(false); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [open, q, platformId]);
  return (
    <div className="relative">
      <input value={q} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        placeholder="🔍 เลือกหมวดจาก LINE (พิมพ์ค้น เช่น กระเป๋า / bag)" className="h-9 w-full border border-violet-200 rounded-md px-2 text-sm" />
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {total === 0 ? <div className="p-3 text-xs text-amber-600">ยังไม่ได้นำเข้าหมวดหมู่ของแพลตฟอร์มนี้ — กด “📂 นำเข้าหมวดหมู่” ที่หน้าสินค้าบนแพลตฟอร์มก่อน</div>
            : loading ? <div className="p-3 text-xs text-slate-400">กำลังค้นหา...</div>
            : results.length === 0 ? <div className="p-3 text-xs text-slate-400">ไม่พบหมวดที่ตรง</div>
            : results.map((c) => (
              <button key={c.external_id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(`${c.external_id} · ${c.name_th || c.name_en}`); setOpen(false); setQ(""); }} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-violet-50">
                <span className="text-slate-400 font-mono">{c.external_id}</span> {c.name_th || c.name_en}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ช่องแก้ราคาขายราย SKU (inline) — uncontrolled + เซฟตอน blur/Enter (เปลี่ยนค่าถึงเซฟ)
function PriceCell({ v, onSave }: { v: Variant; onSave: (id: string, price: string) => void }) {
  const cur = v.price == null ? "" : String(v.price);
  return (
    <input type="number" min={0} key={`p-${v.id}-${cur}`} defaultValue={cur}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      onBlur={(e) => { const val = e.target.value.trim(); if (val !== cur) onSave(v.id, val === "" ? "0" : val); }}
      placeholder="—" title="ราคาขายกลาง (ใช้ทุกช่องทาง)"
      className={`h-7 w-full text-right tabular-nums border rounded-md pl-1.5 pr-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-300 ${v.has_price ? "border-slate-200" : "border-rose-300 bg-rose-50/40"}`} />
  );
}

// ช่องส่วนลดราย SKU (instantDiscount ของ LINE) — สวิตช์เปิด/ปิด + ช่องกรอกจำนวนเงินที่ลด (บาท)
function DiscountCell({ v, disc, onToggle, onValue }: { v: Variant; disc: { on: boolean; value: number }; onToggle: (on: boolean) => void; onValue: (value: number) => void }) {
  const net = (v.price ?? 0) - (disc.on ? disc.value : 0);
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <button type="button" onClick={() => onToggle(!disc.on)} title={disc.on ? "ปิดส่วนลด" : "เปิดส่วนลด"}
        className={`h-5 w-9 rounded-full relative transition-colors shrink-0 ${disc.on ? "bg-violet-600" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${disc.on ? "left-[1.15rem]" : "left-0.5"}`} />
      </button>
      <div className="relative w-16">
        <input type="number" min={0} disabled={!disc.on} key={`d-${v.id}-${disc.value}`} defaultValue={disc.value || ""}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onBlur={(e) => { const n = Math.max(0, Number(e.target.value) || 0); if (n !== disc.value) onValue(n); }}
          placeholder="ลด" title={disc.on ? `ราคาสุทธิ ≈ ${net.toLocaleString()}฿` : "เปิดสวิตช์ก่อนกรอกส่วนลด"}
          className={`h-7 w-full text-right tabular-nums border rounded-md pl-1.5 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-violet-300 ${disc.on ? "border-violet-300" : "border-slate-200 bg-slate-50 text-slate-300"}`} />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">฿</span>
      </div>
    </div>
  );
}

export function ProductPlatformManager({ parentSkuId, onClose, canEdit = true, canPublish = false, initialPlatformId }: {
  parentSkuId: string; onClose: () => void; canEdit?: boolean; canPublish?: boolean;
  /** เปิดมาให้อยู่แท็บแพลตฟอร์มนี้เลย (เช่น เปิดจากหน้า catalog ของ LINE) */
  initialPlatformId?: string;
}) {
  const { width, startResize } = useDrawerResize("platformMgrWidth", 780);
  const [loading, setLoading] = useState(true);
  const [parent, setParent] = useState<ParentInfo | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [variants, setVariants] = useState<Variant[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [images, setImages] = useState<ImageItem[]>([]);
  const [accounts, setAccounts] = useState<Record<string, Account>>({});
  const [active, setActive] = useState<string>("");
  const [catInput, setCatInput] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [skuEditor, setSkuEditor] = useState<{ recordId: string | null } | null>(null); // แก้/เพิ่มสี (SKU)
  const [matrixOpen, setMatrixOpen] = useState(false); // ตัวช่วยสร้าง SKU หลายชั้น
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [massPrice, setMassPrice] = useState("");   // Mass fill ราคาทุก SKU
  const [massBusy, setMassBusy] = useState(false);
  const [creating, setCreating] = useState(false);  // สร้างสินค้าใหม่บน LINE
  const [displaying, setDisplaying] = useState(false); // เปิด/ปิดการขายบน LINE
  const [pushingPrice, setPushingPrice] = useState(false); // ส่งราคา/ส่วนลดขึ้น LINE
  const [prefillTick, setPrefillTick] = useState(0); // บังคับรีเฟรชช่อง (uncontrolled) หลัง prefill
  // F: render ผ่าน portal ไป body (เหมือน Drawer กลาง) → เปิดทับ drawer แม่ที่ค้างอยู่ ไม่ซ้อนหลัง
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const toast = useCallback((type: Toast["type"], msg: string) => {
    const id = Math.floor(performance.now()) + Math.floor(performance.now() % 1000);
    setToasts((q) => [...q, { id, type, msg }]);
    setTimeout(() => setToasts((q) => q.filter((t) => t.id !== id)), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch(`/api/product-platforms?parent_sku_id=${encodeURIComponent(parentSkuId)}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setParent(j.parent ? { id: String(j.parent.id ?? ""), code: String(j.parent.code ?? ""), name_th: String(j.parent.name_th ?? ""), name_platform: String(j.parent.name_platform ?? ""), description: String(j.parent.description ?? ""), category_id: j.parent.category_id ?? null, category_name: j.parent.category_name ?? null, brand_name: j.parent.brand_name ?? null } : null);
      const pfs = (j.platforms ?? []) as Platform[];
      setPlatforms(pfs);
      setDrafts((j.drafts ?? {}) as Record<string, Draft>);
      setVariants((j.variants ?? []) as Variant[]);
      setMappings((j.mappings ?? {}) as Record<string, string>);
      setImages((j.images ?? []) as ImageItem[]);
      setAccounts((j.accounts ?? {}) as Record<string, Account>);
      setActive((prev) => prev || (initialPlatformId && pfs.some((p) => p.id === initialPlatformId) ? initialPlatformId : (pfs[0]?.id ?? "")));
    } catch (e) { toast("error", (e as Error).message); }
    finally { setLoading(false); }
  }, [parentSkuId, toast, initialPlatformId]);
  useEffect(() => { load(); }, [load]);

  const activeDraft = drafts[active] ?? {};
  const title = activeDraft.title ?? "";
  const description = activeDraft.description ?? "";

  // เติมชื่อ/รายละเอียดจากข้อมูลสินค้าใน ERP (ชื่อ = name_platform > name_th)
  const prefillFromErp = async (field: "title" | "description") => {
    const val = field === "title" ? (parent?.name_platform || parent?.name_th || "") : (parent?.description || "");
    if (!val.trim()) { toast("info", "ไม่มีข้อมูลใน ERP ให้เติม"); return; }
    await saveField(field, val);
    setPrefillTick((t) => t + 1);
  };
  // Mass fill ราคาขายทุก SKU ใต้สินค้านี้
  const massFillPrice = async (onlyEmpty: boolean) => {
    const p = Number(massPrice);
    if (!Number.isFinite(p) || p < 0) { toast("error", "ใส่ราคาให้ถูกต้อง"); return; }
    setMassBusy(true);
    try {
      const r = await apiFetch("/api/product-platforms/mass-price", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId, price: p, only_empty: onlyEmpty }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast("success", `ตั้งราคา ${j.updated} SKU แล้ว`); setMassPrice(""); await load();
    } catch (e) { toast("error", (e as Error).message); } finally { setMassBusy(false); }
  };
  // ฟิลด์เพิ่มเติม (แบรนด์/บาร์โค้ด/น้ำหนัก-ขนาด/ของขวัญ) — เก็บรวมใน draft.extra (client ส่งทั้งก้อน)
  const extra = (activeDraft.extra ?? {}) as Record<string, unknown>;
  const exStr = (k: string) => (extra[k] == null ? "" : String(extra[k]));
  const saveExtra = async (patch: Record<string, unknown>) => {
    const next = { ...extra, ...patch };
    setDrafts((d) => ({ ...d, [active]: { ...d[active], extra: next } }));
    try { const r = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ parent_sku_id: parentSkuId, platform_id: active, extra: next }) }); const j = await r.json(); if (j.error) throw new Error(j.error); toast("success", "เซฟแล้ว"); }
    catch (e) { toast("error", (e as Error).message); }
  };
  const giftCats = (extra.gift_categories ?? []) as string[];
  const toggleGiftCat = (c: string) => saveExtra({ gift_categories: giftCats.includes(c) ? giftCats.filter((x) => x !== c) : [...giftCats, c] });
  // แก้ราคาขายราย SKU (inline) — เขียน skus_v2.list_price + อัปเดตในหน้าทันที (ไม่โหลดใหม่ทั้งก้อน)
  const savePrice = useCallback(async (skuId: string, priceStr: string) => {
    const p = Number(priceStr);
    if (!Number.isFinite(p) || p < 0) { toast("error", "ราคาไม่ถูกต้อง"); return; }
    setVariants((vs) => vs.map((v) => v.id === skuId ? { ...v, price: p, has_price: p > 0 } : v));
    try {
      const r = await apiFetch("/api/product-platforms/sku-price", { method: "POST", body: JSON.stringify({ sku_id: skuId, price: p }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast("success", "ตั้งราคาแล้ว");
    } catch (e) { toast("error", (e as Error).message); load(); }
  }, [toast, load]);
  // ส่วนลดต่อ SKU (instantDiscount ของ LINE) — เก็บใน draft.extra.discounts = { [skuId]: { on, value } } ต่อแพลตฟอร์ม
  const discounts = (extra.discounts ?? {}) as Record<string, { on?: boolean; value?: number }>;
  const discOf = (skuId: string) => { const d = discounts[skuId]; return { on: !!d?.on, value: Number(d?.value) || 0 }; };
  const setDiscount = (skuId: string, patch: { on?: boolean; value?: number }) => {
    const cur = discOf(skuId);
    saveExtra({ discounts: { ...discounts, [skuId]: { ...cur, ...patch } } });
  };
  // สร้างสินค้าใหม่บน LINE (สินค้าที่ยังไม่มีบน LINE)
  const createOnLine = async () => {
    setCreating(true);
    try {
      const r = await apiFetch("/api/line-shopping/create-product", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast("success", `สร้างบน LINE แล้ว (รหัส ${j.product_id})`); await load();
    } catch (e) { toast("error", (e as Error).message); } finally { setCreating(false); }
  };
  const setDisplayLine = async (status: "onsale" | "hide") => {
    setDisplaying(true);
    try {
      const r = await apiFetch("/api/line-shopping/set-display", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId, status }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast("success", status === "onsale" ? "เปิดขายบน LINE แล้ว" : "ปิดขายบน LINE แล้ว"); await load();
    } catch (e) { toast("error", (e as Error).message); } finally { setDisplaying(false); }
  };
  // ส่งราคา + ส่วนลด (instantDiscount) ของสินค้านี้ขึ้น LINE — ใช้ push-prices โหมดสินค้าเดียว (หาแบรนด์จาก parent)
  const pushPricesLine = async () => {
    setPushingPrice(true);
    try {
      const r = await apiFetch("/api/line-shopping/push-prices", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      const res = (j.results ?? []) as { ok: boolean; variants: number; error?: string }[];
      const ok = res.filter((x) => x.ok).length;
      if (ok > 0) toast("success", `ส่งราคา/ส่วนลดขึ้น LINE แล้ว (${res[0]?.variants ?? 0} ตัวเลือก)`);
      else toast("error", res.find((x) => !x.ok)?.error || j.note || "ยังไม่มีสินค้าที่จับคู่ให้ส่ง");
    } catch (e) { toast("error", (e as Error).message); } finally { setPushingPrice(false); }
  };
  // เซ็ตช่องหมวดหมู่เมื่อสลับแพลตฟอร์ม (draft > mapping > ว่าง)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCatInput((drafts[active]?.category_path ?? mappings[active] ?? "") as string); }, [active]);

  const saveField = async (field: keyof Draft, value: string) => {
    const cur = (drafts[active]?.[field] ?? "") as string;
    if ((value || "") === (cur || "")) return;
    setDrafts((d) => ({ ...d, [active]: { ...d[active], [field]: value || null } }));
    try {
      const r = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ parent_sku_id: parentSkuId, platform_id: active, [field]: value }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast("success", "เซฟร่างแล้ว");
    } catch (e) { toast("error", (e as Error).message); }
  };
  // เลือกรูปส่งแพลตฟอร์ม (array) — เซฟทันที
  const saveImages = async (keys: string[]) => {
    setDrafts((d) => ({ ...d, [active]: { ...d[active], image_keys: keys } }));
    try { const r = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ parent_sku_id: parentSkuId, platform_id: active, image_keys: keys }) }); const j = await r.json(); if (j.error) throw new Error(j.error); }
    catch (e) { toast("error", (e as Error).message); }
  };
  const toggleImage = (key: string) => {
    const cur = activeDraft.image_keys ?? [];
    saveImages(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
  };
  // หมวดหมู่: ใช้ค่ามาตรฐาน / บันทึกเป็นค่ามาตรฐานของหมวดกลางนี้
  const useStandard = () => { const v = mappings[active] ?? ""; if (!v) { toast("info", "ยังไม่มีค่ามาตรฐานของหมวดนี้"); return; } setCatInput(v); saveField("category_path", v); };
  const saveMapping = async () => {
    if (!parent?.category_id) { toast("info", "สินค้านี้ยังไม่มีหมวดหมู่กลาง"); return; }
    try {
      const r = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ save_mapping: true, central_category_id: parent.category_id, platform_id: active, platform_category_path: catInput }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setMappings((m) => ({ ...m, [active]: catInput }));
      toast("success", "บันทึกเป็นค่ามาตรฐานของหมวดนี้แล้ว");
    } catch (e) { toast("error", (e as Error).message); }
  };
  // ลงขาย (mock connector) — เดี่ยว / ทุกที่พร้อม
  const account = accounts[active];
  const published = activeDraft.last_sync_status === "success" || activeDraft.status === "published";
  const publishOnePlatform = async () => {
    if (!ready) { toast("error", "ข้อมูลยังไม่ครบ — ดูเช็คลิสต์"); return; }
    if (!account?.is_active) { toast("error", "แบรนด์นี้ยังไม่มีร้านสำหรับแพลตฟอร์มนี้"); return; }
    setPublishing(true);
    try {
      const r = await apiFetch("/api/product-platforms/publish", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId, platform_id: active }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast("success", `ลงขายแล้ว (จำลอง) · ${j.platform_product_id ?? ""}`);
      await load();
    } catch (e) { toast("error", (e as Error).message); } finally { setPublishing(false); }
  };
  const publishAll = async () => {
    setPublishing(true);
    try {
      const r = await apiFetch("/api/product-platforms/publish", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId, all: true }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      const res = (j.results ?? []) as { ok: boolean }[];
      const okN = res.filter((x) => x.ok).length;
      const failN = res.length - okN;
      toast(failN ? "info" : "success", `ลงขายสำเร็จ ${okN}${failN ? ` · ไม่สำเร็จ ${failN} (ดูในแต่ละแพลตฟอร์ม)` : ""}`);
      await load();
    } catch (e) { toast("error", (e as Error).message); } finally { setPublishing(false); }
  };

  // เช็คลิสต์ "ฟิลด์จำเป็น" ตามแพลตฟอร์มที่เลือก (LINE มี spec เฉพาะ · อื่น ๆ ใช้ชุดทั่วไป)
  const checks = useMemo(() => {
    const allHavePrice = variants.length > 0 && variants.every((v) => v.has_price);
    const allHaveImage = variants.length > 0 && variants.every((v) => v.has_image);
    const code = platforms.find((p) => p.id === active)?.code ?? "";
    return requiredChecks(code, {
      title, description, category: (activeDraft.category_path ?? "") as string,
      imagesToSend: (activeDraft.image_keys ?? []).length, variantCount: variants.length, allHavePrice, allHaveImage,
    });
  }, [title, description, variants, activeDraft.category_path, activeDraft.image_keys, platforms, active]);
  const ready = checks.every((c) => !c.required || c.ok);

  const cols: MiniColumn<Variant>[] = useMemo(() => [
    { key: "img", header: "รูป", width: "2.5rem", cell: (v) => <HoverImage url={r2ImageUrl(v.image_key)} size={32} /> },
    { key: "code", header: "SKU", width: "1fr", sortValue: (v) => v.code, cell: (v) => <span className="font-mono text-xs">{v.code}</span> },
    { key: "color", header: "สี", width: "0.9fr", cell: (v) => v.color || "—" },
    { key: "price", header: "ราคา", width: "5.5rem", align: "right", sortValue: (v) => v.price ?? -1,
      cell: (v) => canEdit ? <PriceCell v={v} onSave={savePrice} /> : (v.has_price ? <span className="tabular-nums">{v.price!.toLocaleString()}฿</span> : <span className="text-rose-500 text-xs">ไม่มี</span>) },
    { key: "discount", header: "ส่วนลด", width: "7rem", align: "right",
      cell: (v) => canEdit ? <DiscountCell v={v} disc={discOf(v.id)} onToggle={(on) => setDiscount(v.id, { on })} onValue={(value) => setDiscount(v.id, { value, on: true })} />
        : (discOf(v.id).on && discOf(v.id).value > 0 ? <span className="tabular-nums text-violet-600">-{discOf(v.id).value.toLocaleString()}฿</span> : <span className="text-slate-300">—</span>) },
    { key: "ready", header: "พร้อม", width: "3.5rem", align: "center", cell: (v) => (v.has_price && v.has_image && v.is_active) ? <span className="text-emerald-600">✓</span> : <span className="text-rose-500" title={[!v.has_price && "ไม่มีราคา", !v.has_image && "ไม่มีรูป", !v.is_active && "ปิดอยู่"].filter(Boolean).join(", ")}>✗</span> },
    { key: "edit", header: "", width: "2.5rem", align: "center", cell: (v) => canEdit ? <button onClick={() => setSkuEditor({ recordId: v.id })} title="แก้สี/รูป (หน้าสินค้าเต็ม)" className="text-violet-600 hover:underline">✏️</button> : null },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [canEdit, savePrice, discounts, active]);

  const activePf = platforms.find((p) => p.id === active);
  const iconOf = (p: Platform) => p.icon_key || PLATFORM_ICON[p.code] || "🏬";

  if (!mounted) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div style={{ width }} className="fixed right-0 top-0 h-full max-w-[97vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div onMouseDown={startResize} title="ลากเพื่อปรับความกว้าง" className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-violet-400/40 z-[60]" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate">🏬 ลงขายหลายแพลตฟอร์ม</h3>
            {parent && <p className="text-xs text-slate-500 truncate"><span className="font-mono">{parent.code}</span> · {parent.name_th}</p>}
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
        </div>

        {loading ? <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">กำลังโหลด...</div> : (
          <>
            <div className="flex gap-1 px-4 pt-3 overflow-x-auto shrink-0 border-b border-slate-100">
              {platforms.map((p) => (
                <button key={p.id} onClick={() => setActive(p.id)} className={`shrink-0 px-3 py-1.5 text-sm rounded-t-lg border-b-2 transition-colors ${active === p.id ? "border-violet-500 text-violet-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                  {iconOf(p)} {p.name_th}
                </button>
              ))}
              {platforms.length === 0 && <p className="text-sm text-slate-400 py-2">ยังไม่มีแพลตฟอร์มที่เปิดใช้ — เพิ่มที่ตั้งค่า</p>}
            </div>

            {activePf && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ready ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>{ready ? "✓ พร้อมลงขาย" : "⚠ ข้อมูลยังไม่ครบ"}</span>
                  {account?.is_active ? <span className="text-xs text-slate-400">ร้าน: {account.label || "—"}</span> : <span className="text-xs text-amber-600">⚠ แบรนด์นี้ยังไม่มีร้าน {activePf.name_th} <a href="/admin/platform-accounts" target="_blank" rel="noopener noreferrer" className="underline">ตั้งร้าน</a></span>}
                  {published && <span className="text-xs text-emerald-600">✅ ลงขายแล้ว (จำลอง){activeDraft.platform_product_id ? ` · ${activeDraft.platform_product_id}` : ""}</span>}
                  {activeDraft.last_sync_status === "failed" && <span className="text-xs text-rose-600" title={activeDraft.last_error ?? ""}>⚠ ส่งไม่สำเร็จ</span>}
                </div>

                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-slate-400">ชื่อสินค้าบน {activePf.name_th}</p>
                      {canEdit && !title.trim() && (parent?.name_platform || parent?.name_th) && <button onClick={() => prefillFromErp("title")} className="text-[11px] text-violet-600 hover:underline">↙ ใช้ชื่อจากสินค้า</button>}
                    </div>
                    <ERPInput key={`t-${active}-${prefillTick}`} defaultValue={title} placeholder={parent?.name_platform || parent?.name_th || "ชื่อสินค้า"} disabled={!canEdit} onBlur={(e) => saveField("title", e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-slate-400">รายละเอียดสินค้า</p>
                      {canEdit && !description.trim() && parent?.description && <button onClick={() => prefillFromErp("description")} className="text-[11px] text-violet-600 hover:underline">↙ ใช้รายละเอียดจากสินค้า</button>}
                    </div>
                    <ERPTextarea key={`d-${active}-${prefillTick}`} defaultValue={description} rows={4} placeholder="รายละเอียดเฉพาะแพลตฟอร์มนี้..." disabled={!canEdit} onBlur={(e) => saveField("description", e.target.value)} />
                  </div>
                </div>

                {/* หมวดหมู่ปลายทาง + mapping */}
                {parent?.category_id ? (
                  <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                    <p className="text-xs font-medium text-slate-600">หมวดหมู่ปลายทาง — {activePf.name_th}</p>
                    <p className="text-[11px] text-slate-400">หมวดกลาง: <span className="text-slate-600">{parent.category_name || "—"}</span></p>
                    {canEdit && <CategoryOptionPicker platformId={active} onPick={(label) => { setCatInput(label); saveField("category_path", label); }} />}
                    <ERPInput value={catInput} disabled={!canEdit} placeholder="หรือพิมพ์เอง เช่น Women's Bags > Shoulder Bags" onChange={(e) => setCatInput(e.target.value)} onBlur={() => saveField("category_path", catInput)} />
                    {!catInput.trim() && <p className="text-[11px] text-rose-600">⚠ ยังไม่ได้ตั้งค่าหมวดหมู่สำหรับแพลตฟอร์มนี้</p>}
                    {canEdit && (
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={useStandard} className="text-xs text-slate-600 border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50">↩︎ ใช้ค่ามาตรฐาน{mappings[active] ? "" : " (ยังไม่มี)"}</button>
                        <button onClick={saveMapping} className="text-xs text-violet-700 border border-violet-200 rounded-md px-2 py-1 hover:bg-violet-50">💾 บันทึกเป็นค่ามาตรฐานของหมวดนี้</button>
                      </div>
                    )}
                  </div>
                ) : <p className="text-[11px] text-amber-600">สินค้านี้ยังไม่มีหมวดหมู่กลาง — ตั้งที่หน้าสินค้าก่อน จึงจะใช้ mapping ได้</p>}

                {/* เลือกรูปส่งไปแพลตฟอร์ม */}
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-600 mb-2">รูปที่ส่งไป {activePf.name_th} ({(activeDraft.image_keys ?? []).length}/{images.length})</p>
                  {images.length === 0 ? <p className="text-xs text-slate-400">ยังไม่มีรูป — เพิ่มที่หน้าสินค้า/SKU</p> : (
                    <div className="flex flex-wrap gap-2">
                      {images.map((im) => {
                        const on = (activeDraft.image_keys ?? []).includes(im.key);
                        return (
                          <button key={im.key} type="button" onClick={() => canEdit && toggleImage(im.key)} title={im.source} className={`relative rounded-lg overflow-hidden border-2 ${on ? "border-violet-500" : "border-slate-200"}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r2ImageUrl(im.key, 140) ?? ""} alt="" loading="lazy" className="h-16 w-16 object-cover block" />
                            {on && <span className="absolute top-0.5 right-0.5 bg-violet-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">✓</span>}
                            <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[8px] truncate px-0.5 text-left">{im.source}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] text-slate-400">SKU / สี ที่จะส่งไป {activePf.name_th} ({variants.length})</p>
                    {canEdit && (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setMatrixOpen(true)} title="สร้าง SKU หลายชั้น (สี × ตัวเลือก เช่น แบบพิมพ์) ทีเดียว" className="text-xs text-violet-700 border border-violet-200 rounded-md px-2 py-0.5 hover:bg-violet-50">🧬 หลายชั้น</button>
                        {activePf.capabilities?.add_variant !== false
                          ? <button onClick={() => setSkuEditor({ recordId: null })} className="text-xs text-violet-700 border border-violet-200 rounded-md px-2 py-0.5 hover:bg-violet-50">➕ เพิ่มสี</button>
                          : <span className="text-[10px] text-amber-600" title="แพลตฟอร์มนี้เพิ่มสีใหม่ใน listing เดิมไม่ได้ ต้องสร้าง listing ใหม่">⚠ เพิ่มสีใน listing เดิมไม่ได้</span>}
                      </div>
                    )}
                  </div>
                  {canEdit && variants.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mb-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[11px] text-slate-500">⚡ ตั้งราคาทุก SKU พร้อมกัน:</span>
                      <div className="relative">
                        <input type="number" min={0} value={massPrice} onChange={(e) => setMassPrice(e.target.value)} placeholder="ราคา" className="h-8 w-28 border border-slate-200 rounded-md pl-2 pr-5 text-sm" />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">฿</span>
                      </div>
                      <button onClick={() => massFillPrice(false)} disabled={massBusy || !massPrice} className="h-8 px-3 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40">ใช้กับทั้งหมด</button>
                      <button onClick={() => massFillPrice(true)} disabled={massBusy || !massPrice} className="h-8 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 disabled:opacity-40">เฉพาะที่ยังไม่มีราคา</button>
                      <span className="text-[10px] text-slate-400">= ราคาขายกลางของ SKU (ใช้ทุกช่องทาง)</span>
                    </div>
                  )}
                  <MiniTable rows={variants} columns={cols} rowKey={(v) => v.id} searchText={(v) => `${v.code} ${v.color ?? ""}`} dense emptyText="ยังไม่มี SKU ลูก — กด ➕ เพิ่มสี"
                    footnote={activePf?.code === "line_shopping"
                      ? "ราคา = ราคาขายกลาง (แก้แล้วมีผลทุกช่องทาง) · ส่วนลด = ต่อ SKU เฉพาะ LINE (instantDiscount) ส่งเมื่อกด “ส่งราคา/ส่วนลดขึ้น LINE”"
                      : "ราคา = ราคาขายกลางของ SKU (ใช้ทุกช่องทาง) · ส่วนลดจะส่งไปเฉพาะแพลตฟอร์มที่รองรับ"} />
                </div>

                {canEdit && activePf?.code === "line_shopping" && (
                  <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                    <p className="text-xs font-medium text-slate-600">ฟิลด์เพิ่มเติมของ LINE</p>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-[11px] text-slate-500">แบรนด์/ยี่ห้อ
                        <input key={`br-${active}-${prefillTick}`} defaultValue={exStr("brand") || (parent?.brand_name ?? "")} onBlur={(e) => saveExtra({ brand: e.target.value })} className="mt-1 w-full h-8 border border-slate-200 rounded-md px-2 text-sm" />
                      </label>
                      <label className="text-[11px] text-slate-500">บาร์โค้ด / GTIN
                        <input key={`gt-${active}`} defaultValue={exStr("barcode")} onBlur={(e) => saveExtra({ barcode: e.target.value })} className="mt-1 w-full h-8 border border-slate-200 rounded-md px-2 text-sm" />
                      </label>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <label className="text-[11px] text-slate-500">น้ำหนัก(kg)<input key={`w-${active}`} type="number" defaultValue={exStr("weight")} onBlur={(e) => saveExtra({ weight: e.target.value })} className="mt-1 w-full h-8 border border-slate-200 rounded-md px-2 text-sm" /></label>
                      <label className="text-[11px] text-slate-500">กว้าง(cm)<input key={`wd-${active}`} type="number" defaultValue={exStr("width")} onBlur={(e) => saveExtra({ width: e.target.value })} className="mt-1 w-full h-8 border border-slate-200 rounded-md px-2 text-sm" /></label>
                      <label className="text-[11px] text-slate-500">ยาว(cm)<input key={`ln-${active}`} type="number" defaultValue={exStr("length")} onBlur={(e) => saveExtra({ length: e.target.value })} className="mt-1 w-full h-8 border border-slate-200 rounded-md px-2 text-sm" /></label>
                      <label className="text-[11px] text-slate-500">สูง(cm)<input key={`h-${active}`} type="number" defaultValue={exStr("height")} onBlur={(e) => saveExtra({ height: e.target.value })} className="mt-1 w-full h-8 border border-slate-200 rounded-md px-2 text-sm" /></label>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">สถานะของขวัญ</p>
                      <div className="flex gap-2">
                        {([["on", "เปิด"], ["gift_only", "เฉพาะของขวัญ"], ["off", "ปิด"]] as const).map(([v, l]) => (
                          <button key={v} onClick={() => saveExtra({ gift_status: v })} className={`h-7 px-2.5 text-xs rounded-full border ${(extra.gift_status ?? "on") === v ? "bg-violet-600 text-white border-violet-600" : "bg-white border-slate-200 text-slate-600"}`}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">หมวดของขวัญ (เลือกได้หลายอัน)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {["For Her", "For Him", "Mom & Kids", "Seniors", "Couples", "Pet Lovers"].map((c) => (
                          <button key={c} onClick={() => toggleGiftCat(c)} className={`h-7 px-2.5 text-xs rounded-full border ${giftCats.includes(c) ? "bg-violet-600 text-white border-violet-600" : "bg-white border-slate-200 text-slate-600"}`}>{c}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-600 mb-2">ฟิลด์จำเป็นของ {activePf?.name_th ?? "แพลตฟอร์ม"}</p>
                  <ul className="space-y-1">
                    {checks.map((c, i) => (
                      <li key={i} className={`text-xs flex items-center gap-2 ${c.ok ? "text-slate-600" : c.required ? "text-rose-600" : "text-amber-600"}`}><span>{c.ok ? "✓" : "✗"}</span>{c.label}{!c.required && <span className="text-[10px] text-slate-400">(แนะนำ)</span>}</li>
                    ))}
                  </ul>
                  {activePf?.code === "line_shopping" && (
                    activeDraft.platform_product_id
                      ? <div className="mt-2 space-y-1.5">
                          <p className="text-[11px] text-emerald-700">✓ มีบน LINE แล้ว (รหัส {String(activeDraft.platform_product_id)}) — แก้ราคา/ส่วนลดในตาราง SKU แล้วกดส่ง</p>
                          {canEdit && <div className="flex flex-wrap gap-2">
                            <button onClick={pushPricesLine} disabled={pushingPrice} className="h-8 px-3 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{pushingPrice ? "กำลังส่ง..." : "⬆️ ส่งราคา/ส่วนลด"}</button>
                            <button onClick={() => setDisplayLine("onsale")} disabled={displaying} className="h-8 px-3 text-xs text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50">▶ เปิดขาย</button>
                            <button onClick={() => setDisplayLine("hide")} disabled={displaying} className="h-8 px-3 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">⏸ ปิดขาย</button>
                          </div>}
                        </div>
                      : canEdit && <button onClick={createOnLine} disabled={creating || !ready} title={!ready ? "กรอกฟิลด์จำเป็นให้ครบก่อน (ดูรายการด้านบน)" : "สร้างสินค้าใหม่บน LINE"} className="mt-2 w-full h-9 px-3 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{creating ? "กำลังสร้าง..." : "🆕 สร้างสินค้าใหม่บน LINE"}</button>
                  )}
                </div>
              </div>
            )}

            <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-2 shrink-0">
              <span className="text-[11px] text-slate-400">เซฟร่างอัตโนมัติ · ลงขายตอนนี้เป็นแบบจำลอง (mock) — ต่อ API จริงทีหลังต่อแพลตฟอร์ม</span>
              <div className="flex items-center gap-2 shrink-0">
                {canPublish && <button onClick={publishAll} disabled={publishing} className="h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">📦 ลงขายทุกที่พร้อม</button>}
                <button onClick={publishOnePlatform} disabled={!canPublish || publishing || !ready || !account?.is_active} title={!canPublish ? "ไม่มีสิทธิ์ลงขาย" : !account?.is_active ? "ยังไม่มีร้าน" : !ready ? "ข้อมูลยังไม่ครบ" : ""} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed">{publishing ? "..." : published ? "🔄 ส่ง update" : "📤 ลงขาย"}</button>
              </div>
            </div>
          </>
        )}

        {/* toast ในตัว */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-1.5 items-center">
          {toasts.map((t) => (
            <div key={t.id} className={`px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg ${t.type === "error" ? "bg-rose-600 text-white" : t.type === "success" ? "bg-emerald-600 text-white" : "bg-slate-800 text-white"}`}>{t.msg}</div>
          ))}
        </div>
      </div>
      {/* ตัวแก้สินค้ากลาง (SKU) — แก้ราคา/สี/รูป หรือเพิ่มสีใหม่ (recordId null = สร้างใต้ parent นี้) · ปิดแล้วโหลดใหม่ */}
      {skuEditor && parent && (
        <MasterRecordDrawer moduleKey="skus-v2" apiPath="skus" recordId={skuEditor.recordId} startInEdit
          createTitle="เพิ่มสี (SKU ใหม่)"
          createDefaults={skuEditor.recordId ? undefined : { parent_sku_id: parent.id }}
          onClose={() => { setSkuEditor(null); load(); }} onChanged={load} />
      )}
      {/* ตัวช่วยสร้าง SKU หลายชั้น (สี × ตัวเลือก) — ปิดแล้วโหลดตาราง SKU ใหม่ */}
      {matrixOpen && parent && (
        <VariantMatrixModal parentSkuId={parent.id} onClose={() => setMatrixOpen(false)} onCreated={load} />
      )}
    </>,
    document.body,
  );
}
