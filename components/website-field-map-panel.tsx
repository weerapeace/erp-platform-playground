"use client";

/**
 * WebsiteFieldMapPanel — แท็บ "จับคู่ฟิลด์" ในหน้า /website
 * ตั้งครั้งเดียวต่อร้าน: ข้อมูลบนเว็บแต่ละช่องดึงมาจากฟิลด์ไหนของ Parent SKU
 * → สินค้าทุกตัวเติมให้อัตโนมัติ ไม่ต้องพิมพ์ทีละชิ้น (กรอกทับรายตัวได้เสมอ)
 * ข้อมูล: /api/website/field-map (guardApi products.view/edit + audit)
 *
 * 📂 หมวดบนเว็บ: ที่นี่โชว์แค่สรุป — เพิ่ม/แก้/ลบ/เรียง/หมวดย่อย ทำที่แท็บ "📂 หมวดหมู่" ที่เดียว (รหัสหมวดเปลี่ยนไม่ได้ กันลิงก์เสีย)
 * 🔗 จับคู่หมวด ERP → หมวดเว็บ: ใช้กับสินค้าที่ยังไม่ได้จัดหมวดเอง (web_categories ว่าง เช่น สินค้าที่เพิ่งเพิ่มขึ้นเว็บ)
 * 🏷️ แท็ก → หมวดเว็บ: การ์ดแยก (components/website-tag-category-rules) บันทึกทันทีผ่าน /api/website/tag-categories
 *    มาก่อนกฎหมวด ERP · แถบบันทึกของหน้านี้ไม่แตะกฎแท็ก (server คงค่าจาก DB)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commonLabelEn } from "@/lib/content-i18n";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { NAME_SOURCE_OPTIONS, PRICE_SOURCE_OPTIONS, DESC_SOURCE_OPTIONS } from "@/lib/website-field-map";
import { childCategories, topCategories } from "@/lib/website-category-tree";
// ช่องเลือกหมวดเว็บ (ต้นไม้ ↳) = ของกลาง — ใช้ชุดเดียวกับตารางกฎแท็กและป๊อป 🔗 ของแท็ก
import { WebCategorySelect as WebCatSelect } from "@/components/website-category-select";
import { WebsiteTagCategoryRules } from "@/components/website-tag-category-rules";
import { SaveBar } from "@/components/save-bar";
import { ERPModal } from "@/components/modal";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { webForm } from "@/lib/website-form-styles";

/** รหัสหมวดตั้งเองได้แล้ว ไม่ใช่รายการตายตัว (ให้ตรงกับ lib/website-field-map.ts) */
type WebCategory = string;

interface FieldMap {
  name: { source: string; stripPrefix?: string; removeBrand?: boolean; removeCollection?: boolean; removeCode?: boolean; removeParens?: boolean; removeParenMarks?: boolean };
  price: { source: string };
  description: { source: string };
  unit: { default: string; default_en?: string };
  options: { source: string; label: string; label_en?: string };
  /** อาจไม่มีในข้อมูลเก่าที่บันทึกไว้ก่อนมีฟีเจอร์นี้ */
  options2?: { source: string; label: string; label_en?: string };
  category: { default: WebCategory; rules: Record<string, WebCategory> };
  /** อาจไม่มีในข้อมูลเก่า — server จะเติมชุดตั้งต้นให้ */
  categories?: CategoryDef[];
  image: { useCover: boolean; source?: "parent" | "skus" | "both" };
}

// ป้ายแหล่งข้อมูล = ของกลางใน lib/website-field-map (กล่อง 🔗 ข้อมูลที่เชื่อม ใช้ชุดเดียวกัน)
const NAME_OPTS = NAME_SOURCE_OPTIONS;
const PRICE_OPTS = PRICE_SOURCE_OPTIONS;
const DESC_OPTS = DESC_SOURCE_OPTIONS;

type CategoryDef = { key: string; label: string; icon: string; blurb: string; parent?: string | null };

/** สินค้าบนเว็บร้านนี้: ทั้งหมด / ที่ยังไม่ได้จัดหมวดเอง (= ใช้กฎจับคู่หมวด ERP) */
type ListingStats = { total: number; auto: number };

const inputCls = webForm.input;
const labelCls = webForm.label;
const cardCls = webForm.card;

export function WebsiteFieldMapPanel({
  shopSlug,
  shopId,
  onOpenCategories,
}: {
  shopSlug: string;
  shopId: string;
  /** ปุ่ม "จัดการหมวดที่แท็บ 📂 หมวดหมู่" — หน้าแม่สลับแท็บให้ (ไม่ส่ง = ไม่โชว์ปุ่ม) */
  onOpenCategories?: () => void;
}) {
  const toast = useToast();
  const t = useT();
  const [map, setMap] = useState<FieldMap | null>(null);
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [listingStats, setListingStats] = useState<ListingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // ค่าที่โหลด/บันทึกล่าสุด (เทียบหาว่ามีการแก้) — แถบบันทึกของกลางใช้
  const [savedJson, setSavedJson] = useState("");
  const [q, setQ] = useState("");
  // ตัวกรองรายการหมวด ERP: ทั้งหมด / จับคู่แล้ว / ยังไม่จับคู่
  const [show, setShow] = useState<"all" | "mapped" | "unmapped">("all");
  // ⋯ เมนูตั้งหลายหมวดพร้อมกัน · ป๊อปเลือกหมวดเว็บที่จะตั้งให้ทั้งหมดที่เห็น
  const moreRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTo, setBulkTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/field-map?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      setMap(j.fieldMap ?? null);
      setSavedJson(JSON.stringify(j.fieldMap ?? null));
      setCategories(j.categories ?? []);
      setListingStats(j.listingStats ?? null);
    } catch {
      toast.error(tr("โหลดการตั้งค่าไม่สำเร็จ", "Could not load settings"));
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (p: Partial<FieldMap>) => setMap((m) => (m ? { ...m, ...p } : m));

  const save = async () => {
    if (!map) return;
    setSaving(true);
    try {
      const r = await apiFetch("/api/website/field-map", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, fieldMap: map }),
      });
      const j = await r.json();
      if (j.ok) {
        setMap(j.fieldMap);
        setSavedJson(JSON.stringify(j.fieldMap ?? null));
        toast.success(t("บันทึกการจับคู่แล้ว — สินค้าทุกตัวจะใช้ค่านี้อัตโนมัติ", "Mapping saved — every product uses it automatically"));
      } else toast.error(j.error ?? t("บันทึกไม่สำเร็จ", "Save failed"));
    } catch {
      toast.error(t("เชื่อมต่อไม่ได้", "Connection failed"));
    } finally {
      setSaving(false);
    }
  };

  // หมวด ERP ที่ตรงคำค้น (ก่อนกรองสถานะ — ไว้นับเลขบนปุ่มกรอง)
  const matched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? categories.filter((c) => c.name.toLowerCase().includes(needle)) : categories;
  }, [categories, q]);
  const rules = map?.category.rules ?? {};
  const shown = show === "all" ? matched : matched.filter((c) => (show === "mapped") === !!rules[c.name]);

  // "" = เลิกจับคู่ (ลบกฎทิ้ง ไม่เก็บค่าว่างค้าง)
  const setRules = (names: string[], v: WebCategory) =>
    setMap((m) => {
      if (!m) return m;
      const next = { ...m.category.rules };
      for (const n of names) {
        if (v) next[n] = v;
        else delete next[n];
      }
      return { ...m, category: { ...m.category, rules: next } };
    });

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">{t("กำลังโหลด…", "Loading…")}</div>;
  if (!map) return <div className="py-16 text-center text-sm text-slate-400">{t("โหลดการตั้งค่าไม่สำเร็จ", "Could not load settings")}</div>;

  /* ── หมวดของร้าน (แก้ที่แท็บ 📂 หมวดหมู่ · ที่นี่ใช้เป็นตัวเลือกปลายทาง) ── */
  const webCatDefs: CategoryDef[] = map.categories ?? [];
  const tops = topCategories(webCatDefs);
  const subCount = webCatDefs.length - tops.length;
  const labelOfWeb = (k: string) => webCatDefs.find((c) => c.key === k)?.label ?? k;
  const defaultLabel = map.category.default ? labelOfWeb(map.category.default) : "—";
  const mappedCount = matched.filter((c) => rules[c.name]).length;
  const shownMapped = shown.filter((c) => rules[c.name]).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-blue-50/60 border border-blue-200 px-4 py-3">
        <p className="text-sm text-slate-700">
          {t("ตั้งครั้งเดียว →", "Set once →")} <span className="font-medium">{t("สินค้าทุกตัวในร้านนี้เติมให้อัตโนมัติ", "every product in this shop is filled automatically")}</span> {t("ไม่ต้องพิมพ์ทีละชิ้น", "no typing one by one")}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {t("ถ้าสินค้าตัวไหนพิมพ์ทับไว้ในแท็บ \"สินค้าบนเว็บ\" ระบบจะใช้ค่าที่พิมพ์เสมอ", "If a product has a value typed over in the \"Web products\" tab, the typed value always wins")}
        </p>
      </div>

      {/* ฟิลด์หลัก */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">{t("ข้อมูลหลัก", "Main data")}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>{t("ชื่อบนเว็บ ดึงจาก", "Web name comes from")}</label>
            <select
              className={inputCls}
              value={map.name.source}
              onChange={(e) => patch({ name: { ...map.name, source: e.target.value } })}
            >
              {NAME_OPTS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>{t("ตัดคำนำหน้าชื่อออก (ถ้ามี)", "Strip name prefix (if any)")}</label>
            <input
              className={inputCls}
              value={map.name.stripPrefix ?? ""}
              onChange={(e) => patch({ name: { ...map.name, stripPrefix: e.target.value } })}
              placeholder={t("เช่น IG International", "e.g. IG International")}
            />
          </div>

          {/* กฎประกอบชื่อ — ตัดส่วนที่ไม่อยากโชว์ออกจากชื่อใน ERP (ใช้ทุกสินค้าในร้าน) */}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelCls}>{t("ตัดออกจากชื่ออัตโนมัติ", "Auto-remove from name")}</label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {(
                [
                  ["removeBrand", t("ชื่อแบรนด์", "Brand name")],
                  ["removeCollection", t("ชื่อคอลเลกชัน", "Collection name")],
                  ["removeCode", t("รหัสสินค้า", "Product code")],
                  ["removeParens", t("ข้อความในวงเล็บ ( )", "Text in brackets ( )")],
                  ["removeParenMarks", t("แค่เครื่องหมายวงเล็บ (เก็บข้อความ)", "Bracket marks only (keep text)")],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!map.name[k]}
                    onChange={(e) => {
                      // วงเล็บ: ลบทั้งข้อความ ↔ ลบแค่เครื่องหมาย — เลือกได้ทีละอัน (ตรงกับ NAME_RULE_EXCLUSIVE ใน lib/website-field-map)
                      const other = k === "removeParens" ? "removeParenMarks" : k === "removeParenMarks" ? "removeParens" : null;
                      patch({ name: { ...map.name, [k]: e.target.checked, ...(other && e.target.checked ? { [other]: false } : {}) } });
                    }}
                    className="accent-orange-500"
                  />
                  {l}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>{t("ราคาบนเว็บ ดึงจาก", "Web price comes from")}</label>
            <select
              className={inputCls}
              value={map.price.source}
              onChange={(e) => patch({ price: { source: e.target.value } })}
            >
              {PRICE_OPTS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className={labelCls}>{t("คำอธิบายบนเว็บ ดึงจาก", "Web description comes from")}</label>
            <select
              className={inputCls}
              value={map.description.source}
              onChange={(e) => patch({ description: { source: e.target.value } })}
            >
              {DESC_OPTS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>{t("หน่วยขายเริ่มต้น", "Default sales unit")}</label>
            <input
              className={inputCls}
              value={map.unit.default}
              onChange={(e) => patch({ unit: { ...map.unit, default: e.target.value } })}
              placeholder={t("ชิ้น / ตร.ฟุต / หลา", "piece / sq ft / yard")}
            />
            <EnInput value={map.unit.default_en ?? ""} th={map.unit.default} onChange={(v) => patch({ unit: { ...map.unit, default_en: v } })} />
          </div>
        </div>
      </div>

      {/* ตัวเลือก + รูป */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">{t("ตัวเลือกสินค้า & รูป", "Product options & images")}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>{t("ตัวเลือกให้ลูกค้าเลือก", "Options for customers")}</label>
            <select
              className={inputCls}
              value={map.options.source}
              onChange={(e) => patch({ options: { ...map.options, source: e.target.value } })}
            >
              <option value="sku_color">{t("สีของ SKU ลูก (แนะนำ)", "Child SKU color (recommended)")}</option>
              <option value="none">{t("— ไม่ใช้ —", "— Not used —")}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t("ชื่อชุดตัวเลือก", "Option set name")}</label>
            <input
              className={inputCls}
              value={map.options.label}
              onChange={(e) => patch({ options: { ...map.options, label: e.target.value } })}
              placeholder={t("แบบ/สี", "Style/color")}
            />
            <EnInput value={map.options.label_en ?? ""} th={map.options.label || "แบบ/สี"} onChange={(v) => patch({ options: { ...map.options, label_en: v } })} />
          </div>

          {/* ตัวเลือกชุดที่ 2 — สินค้าที่มี 2 มิติ เช่น ขนาดรู × จำนวนรู */}
          <div>
            <label className={labelCls}>{t("ตัวเลือกชุดที่ 2", "Second option set")}</label>
            <select
              className={inputCls}
              value={map.options2?.source ?? "none"}
              onChange={(e) => patch({ options2: { ...(map.options2 ?? { label: "" }), source: e.target.value } })}
            >
              <option value="none">{t("— ไม่ใช้ (ตัวเลือกชั้นเดียว) —", "— Not used (single option level) —")}</option>
              <option value="variant_option">{t("ตัวเลือกที่ 2 ของ SKU ลูก", "Child SKU second option")}</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t("ชื่อชุดตัวเลือกที่ 2 (สำรอง)", "Second option set name (fallback)")}</label>
            <input
              className={inputCls}
              value={map.options2?.label ?? ""}
              onChange={(e) => patch({ options2: { ...(map.options2 ?? { source: "none" }), label: e.target.value } })}
              placeholder={t("ใช้เมื่อ SKU ไม่ได้ตั้งชื่อชุดไว้", "Used when the SKU has no set name")}
              disabled={(map.options2?.source ?? "none") === "none"}
            />
            {(map.options2?.source ?? "none") !== "none" && (
              <EnInput value={map.options2?.label_en ?? ""} th={map.options2?.label ?? ""} onChange={(v) => patch({ options2: { ...(map.options2 ?? { source: "none", label: "" }), label_en: v } })} />
            )}
          </div>
          {(map.options2?.source ?? "none") === "variant_option" && (
            <p className="sm:col-span-2 lg:col-span-3 text-[11px] text-slate-500">
              {t("ใช้กับสินค้าที่เลือก 2 อย่างถึงจะได้ของถูกตัว เช่น เข็มขัด = สี × ไซส์ · เครื่องมือเจาะหนัง = จำนวนรู × ขนาดรู · ค่ามาจาก SKU ไซส์/แบบ (ปุ่ม ＋ เพิ่มแบบ/ไซส์ ในตาราง SKU ลูก) · ชื่อชุดที่ติดมากับ SKU (เช่น ไซส์ / แบบพิมพ์) ชนะช่องสำรอง · เปิด/ปิดแต่ละคู่ สี×ไซส์ ได้ในป๊อปตั้งค่าสินค้าบนเว็บ → 🛒 ขายบนเว็บ", "For products needing 2 choices to get the right item, e.g. belt = color × size · leather punch = hole count × hole size · values come from size/style SKUs (＋ Add style/size in the child SKU table) · a set name on the SKU (e.g. Size / Print) beats the fallback · turn each color×size pair on/off in the web product settings popup → 🛒 Sell on web")}
            </p>
          )}
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer pb-1.5">
              <input
                type="checkbox"
                className="w-4 h-4 accent-blue-600"
                checked={map.image.useCover}
                onChange={(e) => patch({ image: { ...map.image, useCover: e.target.checked } })}
              />
              {t("ใช้รูปหน้าปกจาก ERP", "Use cover image from ERP")}
            </label>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">{t("รูปสินค้าบนเว็บเอาจาก", "Web product images come from")}</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
              value={map.image.source ?? "parent"}
              onChange={(e) => patch({ image: { ...map.image, source: e.target.value as "parent" | "skus" | "both" } })}
            >
              <option value="parent">{t("หน้าปก Parent SKU (รูปเดียว)", "Parent SKU cover (one image)")}</option>
              <option value="skus">{t("รูปของ SKU ลูกแต่ละสี (หลายรูป · กดเลือกสีแล้วรูปเปลี่ยน)", "Child SKU image per color (several · image changes with color)")}</option>
              <option value="both">{t("ทั้งสองอย่าง — หน้าปก Parent ก่อน แล้วตามด้วยรูปแต่ละสี", "Both — Parent cover first, then per-color images")}</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">{t("ถ้ากรอกรูปทับไว้ในแท็บ \"สินค้าบนเว็บ\" จะใช้รูปที่กรอกแทนเสมอ · SKU ลูกที่ไม่มีรูปจะถูกข้าม", "Images set in the \"Web products\" tab always win · child SKUs without images are skipped")}</p>
          </div>
        </div>
      </div>

      {/* 📂 หมวดของเว็บร้าน — สรุปอย่างเดียว · แก้ที่แท็บ 📂 หมวดหมู่ (ที่เดียว มีต้นไม้แม่-ลูก + การ์ดแก้ครบ) */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-800">{t("หมวดสินค้าบนเว็บร้านนี้", "Web categories in this shop")}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {webCatDefs.length
                ? t(`📂 ${webCatDefs.length} หมวด (หลัก ${tops.length}${subCount ? ` · ย่อย ${subCount}` : ""}) · เพิ่ม/แก้ชื่อ/รูป/ลำดับ/หมวดย่อย ทำที่แท็บ 📂 หมวดหมู่ ที่เดียว`, `📂 ${webCatDefs.length} categories (main ${tops.length}${subCount ? ` · sub ${subCount}` : ""}) · add/rename/images/order/subcategories in the 📂 Categories tab only`)
                : t("ยังไม่มีหมวด — เพิ่มที่แท็บ 📂 หมวดหมู่", "No categories yet — add them in the 📂 Categories tab")}
            </p>
          </div>
          {onOpenCategories && (
            <button
              type="button"
              onClick={onOpenCategories}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-blue-400 hover:text-blue-700"
            >
              {t("จัดการหมวดที่แท็บ 📂 หมวดหมู่ →", "Manage in the 📂 Categories tab →")}
            </button>
          )}
        </div>
        {tops.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {tops.map((t) => {
              const kids = childCategories(webCatDefs, t.key).length;
              return (
                <span
                  key={t.key}
                  title={kids ? childCategories(webCatDefs, t.key).map((k) => k.label).join(" · ") : undefined}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
                >
                  {t.icon && <span aria-hidden>{t.icon}</span>}
                  {t.label}
                  {kids > 0 && <span className="text-slate-400">· {kids}</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* 🏷️ แท็ก → หมวดบนเว็บ (มาก่อนกฎหมวด ERP · บันทึกทันที · ข้อมูลชุดเดียวกับป๊อป 🔗 ของแท็ก) */}
      <WebsiteTagCategoryRules shopSlug={shopSlug} />

      {/* 🔗 จับคู่หมวด ERP → หมวดเว็บ (ใช้กับสินค้าที่ยังไม่ได้จัดหมวดเอง) */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800">{t("จับคู่หมวด ERP → หมวดบนเว็บ", "ERP category → web category mapping")}</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {t("ใช้กับสินค้าที่ยังไม่ได้จัดหมวดเองในแท็บ 📂 หมวดหมู่ (เช่น สินค้าที่เพิ่งเพิ่มขึ้นเว็บ)", "Applies to products not categorized manually in the 📂 Categories tab (e.g. newly added web products)")}
          {listingStats &&
            listingStats.total > 0 &&
            (listingStats.auto
              ? t(` · ตอนนี้ใช้กับ ${listingStats.auto} จาก ${listingStats.total} รุ่น`, ` · currently applies to ${listingStats.auto} of ${listingStats.total} models`)
              : t(` · ตอนนี้สินค้าบนเว็บ ${listingStats.total} รุ่นจัดหมวดเองครบแล้ว — มีผลกับรุ่นที่เพิ่มใหม่`, ` · all ${listingStats.total} web models are categorized manually — applies to newly added models`))}
        </p>

        {webCatDefs.length === 0 ? (
          <p className="mt-3 py-6 text-center text-sm text-slate-400">{t("ยังไม่มีหมวดบนเว็บให้จับคู่ — เพิ่มหมวดที่แท็บ 📂 หมวดหมู่ก่อน", "No web categories to map yet — add some in the 📂 Categories tab first")}</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
              <span className="text-xs text-slate-600">{t("หมวด ERP ที่ไม่ได้จับคู่ → ไปหมวด", "Unmapped ERP categories → go to")}</span>
              <WebCatSelect
                cats={webCatDefs}
                value={map.category.default}
                onChange={(v) => patch({ category: { ...map.category, default: v } })}
                className="min-w-[160px] border-slate-200 bg-white text-slate-800 font-medium"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                className={inputCls}
                style={{ maxWidth: 220 }}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("🔍 ค้นหาหมวด ERP", "🔍 Search ERP categories")}
              />
              <div className="flex items-center gap-1" role="group" aria-label={t("กรองหมวด ERP", "Filter ERP categories")}>
                {(
                  [
                    ["all", t(`ทั้งหมด ${matched.length}`, `All ${matched.length}`)],
                    ["mapped", t(`จับคู่แล้ว ${mappedCount}`, `Mapped ${mappedCount}`)],
                    ["unmapped", t(`ยังไม่จับคู่ ${matched.length - mappedCount}`, `Unmapped ${matched.length - mappedCount}`)],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setShow(k)}
                    aria-pressed={show === k}
                    className={`rounded-full px-2.5 py-1 text-xs border ${
                      show === k ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {/* ⋯ ตั้ง/ล้างหลายหมวดพร้อมกัน (เดิมเป็นแถวปุ่มชื่อหมวดยาว 3 บรรทัด) */}
              <div ref={moreRef} className="ml-auto">
                <button
                  type="button"
                  onClick={() => setMoreOpen((o) => !o)}
                  disabled={!shown.length}
                  title={t("ตั้งหลายหมวดพร้อมกัน", "Set many categories at once")}
                  aria-label={t("ตั้งหลายหมวดพร้อมกัน", "Set many categories at once")}
                  className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-800 disabled:opacity-40"
                >
                  ⋯
                </button>
              </div>
              <FloatingDropdown anchorRef={moreRef} open={moreOpen} onClose={() => setMoreOpen(false)} minWidth={260}>
                <div className="rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      setBulkTo(map.category.default);
                      setBulkOpen(true);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {t(`ตั้ง ${shown.length} หมวดที่เห็นเป็นหมวดเดียวกัน…`, `Set the ${shown.length} visible categories to one category…`)}
                  </button>
                  <button
                    type="button"
                    disabled={!shownMapped}
                    onClick={() => {
                      setMoreOpen(false);
                      setRules(shown.map((c) => c.name), "");
                      toast.success(t(`ล้างการจับคู่ ${shownMapped} หมวดแล้ว — กดบันทึกด้านล่างเพื่อยืนยัน`, `Cleared mapping for ${shownMapped} categories — press Save below to confirm`));
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:text-slate-300 disabled:hover:bg-transparent"
                  >
                    {t(`ล้างการจับคู่ ${shownMapped} หมวดที่เห็น`, `Clear mapping for ${shownMapped} visible categories`)}
                  </button>
                </div>
              </FloatingDropdown>
            </div>

            <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-slate-100">
              {shown.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  {q.trim() ? t("ไม่พบหมวดที่ค้นหา ลองเปลี่ยนคำค้น", "No matching categories, try another search") : show === "mapped" ? t("ยังไม่ได้จับคู่หมวดไหน", "No categories mapped yet") : show === "unmapped" ? t("จับคู่ครบทุกหมวดแล้ว 🎉", "All categories mapped 🎉") : t("ยังไม่มีหมวด ERP ที่มีสินค้า", "No ERP categories with products yet")}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {shown.map((c) => {
                    const rule = rules[c.name] ?? "";
                    return (
                      <li key={c.name} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50/60">
                        <span className="flex-1 min-w-0 truncate text-sm text-slate-700" title={t(`${c.name} · สินค้าใน ERP ${c.count} รุ่น`, `${c.name} · ${c.count} models in ERP`)}>
                          {c.name} <span className="text-[11px] text-slate-400 tabular-nums">{c.count}</span>
                        </span>
                        <span className="text-slate-300 text-xs" aria-hidden>
                          →
                        </span>
                        <WebCatSelect
                          cats={webCatDefs}
                          value={rule}
                          onChange={(v) => setRules([c.name], v)}
                          emptyLabel={t(`ค่าเริ่มต้น · ${defaultLabel}`, `Default · ${defaultLabel}`)}
                          className={`w-[52%] max-w-[220px] shrink-0 ${rule ? "border-blue-200 bg-blue-50/40 text-slate-800" : "border-slate-200 text-slate-400"}`}
                          ariaLabel={t(`หมวดบนเว็บของ ${c.name}`, `Web category for ${c.name}`)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {/* ตั้งหลายหมวดพร้อมกัน (ของกลาง ERPModal) — ยังไม่บันทึกจนกดแถบบันทึกด้านล่าง */}
      <ERPModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title={t(`ตั้ง ${shown.length} หมวด ERP พร้อมกัน`, `Set ${shown.length} ERP categories at once`)}
        size="sm"
        defaultExpanded={false}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button onClick={() => setBulkOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
              {t("ยกเลิก", "Cancel")}
            </button>
            <button
              onClick={() => {
                setRules(shown.map((c) => c.name), bulkTo);
                setBulkOpen(false);
                toast.success(t(`ตั้ง ${shown.length} หมวดแล้ว — กดบันทึกด้านล่างเพื่อยืนยัน`, `${shown.length} categories set — press Save below to confirm`));
              }}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {t(`ตั้ง ${shown.length} หมวด`, `Set ${shown.length} categories`)}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {t(`หมวด ERP ที่เห็นอยู่ตอนนี้ ${shown.length} หมวด`, `The ${shown.length} ERP categories shown`)}{q.trim() || show !== "all" ? t(" (ตามคำค้น/ตัวกรอง)", " (by search/filter)") : ""} {t("จะส่งสินค้าเข้าหมวดบนเว็บนี้", "will send their products to this web category")}
          </p>
          <p className="text-xs text-slate-400 line-clamp-3">{shown.map((c) => c.name).join(" · ")}</p>
          <div>
            <label className={labelCls}>{t("ไปหมวดบนเว็บ", "Go to web category")}</label>
            <WebCatSelect cats={webCatDefs} value={bulkTo} onChange={setBulkTo} emptyLabel={t(`— ค่าเริ่มต้น · ${defaultLabel} (ล้างการจับคู่) —`, `— Default · ${defaultLabel} (clear mapping) —`)} />
          </div>
        </div>
      </ERPModal>

      {/* 💾 แถบบันทึก (ของกลาง) */}
      <SaveBar dirty={!!map && JSON.stringify(map) !== savedJson} saving={saving} onSave={save} onDiscard={() => void load()} saveLabel={t("💾 บันทึกการจับคู่", "💾 Save mapping")} note={t("สินค้าทุกตัวใช้ค่านี้อัตโนมัติ", "Every product uses this automatically")} />
    </div>
  );
}


/** 🌐 ช่องภาษาอังกฤษเล็ก ๆ ใต้ช่องไทย (หน้าเว็บ /en) — ว่าง = ใช้คำมาตรฐาน (ถ้ารู้จัก) ไม่งั้นโชว์ไทย */
function EnInput({ value, th, onChange }: { value: string; th: string; onChange: (v: string) => void }) {
  const t = useT();
  const auto = commonLabelEn(th);
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <span className="shrink-0 text-[10px] font-semibold text-indigo-600">🌐 EN</span>
      <input
        className="w-full rounded-md border border-indigo-100 bg-indigo-50/30 px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-300"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={auto ? t(`ว่าง = ${auto}`, `Empty = ${auto}`) : t("English (ว่าง = ใช้ภาษาไทย)", "English (empty = use Thai)")}
      />
    </div>
  );
}
