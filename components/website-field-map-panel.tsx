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
import { NAME_SOURCE_OPTIONS, PRICE_SOURCE_OPTIONS, DESC_SOURCE_OPTIONS } from "@/lib/website-field-map";
import { childCategories, topCategories } from "@/lib/website-category-tree";
// ช่องเลือกหมวดเว็บ (ต้นไม้ ↳) = ของกลาง — ใช้ชุดเดียวกับตารางกฎแท็กและป๊อป 🔗 ของแท็ก
import { WebCategorySelect as WebCatSelect } from "@/components/website-category-select";
import { WebsiteTagCategoryRules } from "@/components/website-tag-category-rules";
import { SaveBar } from "@/components/save-bar";
import { ERPModal } from "@/components/modal";
import { FloatingDropdown } from "@/components/floating-dropdown";

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

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";
const cardCls = "rounded-xl border border-slate-200 bg-white p-4";

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
      toast.error("โหลดการตั้งค่าไม่สำเร็จ");
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
        toast.success("บันทึกการจับคู่แล้ว — สินค้าทุกตัวจะใช้ค่านี้อัตโนมัติ");
      } else toast.error(j.error ?? "บันทึกไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  };

  // หมวด ERP ที่ตรงคำค้น (ก่อนกรองสถานะ — ไว้นับเลขบนปุ่มกรอง)
  const matched = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? categories.filter((c) => c.name.toLowerCase().includes(t)) : categories;
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

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;
  if (!map) return <div className="py-16 text-center text-sm text-slate-400">โหลดการตั้งค่าไม่สำเร็จ</div>;

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
          ตั้งครั้งเดียว → <span className="font-medium">สินค้าทุกตัวในร้านนี้เติมให้อัตโนมัติ</span> ไม่ต้องพิมพ์ทีละชิ้น
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          ถ้าสินค้าตัวไหนพิมพ์ทับไว้ในแท็บ &quot;สินค้าบนเว็บ&quot; ระบบจะใช้ค่าที่พิมพ์เสมอ
        </p>
      </div>

      {/* ฟิลด์หลัก */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">ข้อมูลหลัก</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>ชื่อบนเว็บ ดึงจาก</label>
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
            <label className={labelCls}>ตัดคำนำหน้าชื่อออก (ถ้ามี)</label>
            <input
              className={inputCls}
              value={map.name.stripPrefix ?? ""}
              onChange={(e) => patch({ name: { ...map.name, stripPrefix: e.target.value } })}
              placeholder="เช่น IG International"
            />
          </div>

          {/* กฎประกอบชื่อ — ตัดส่วนที่ไม่อยากโชว์ออกจากชื่อใน ERP (ใช้ทุกสินค้าในร้าน) */}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelCls}>ตัดออกจากชื่ออัตโนมัติ</label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {(
                [
                  ["removeBrand", "ชื่อแบรนด์"],
                  ["removeCollection", "ชื่อคอลเลกชัน"],
                  ["removeCode", "รหัสสินค้า"],
                  ["removeParens", "ข้อความในวงเล็บ ( )"],
                  ["removeParenMarks", "แค่เครื่องหมายวงเล็บ (เก็บข้อความ)"],
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
            <label className={labelCls}>ราคาบนเว็บ ดึงจาก</label>
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
            <label className={labelCls}>คำอธิบายบนเว็บ ดึงจาก</label>
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
            <label className={labelCls}>หน่วยขายเริ่มต้น</label>
            <input
              className={inputCls}
              value={map.unit.default}
              onChange={(e) => patch({ unit: { ...map.unit, default: e.target.value } })}
              placeholder="ชิ้น / ตร.ฟุต / หลา"
            />
            <EnInput value={map.unit.default_en ?? ""} th={map.unit.default} onChange={(v) => patch({ unit: { ...map.unit, default_en: v } })} />
          </div>
        </div>
      </div>

      {/* ตัวเลือก + รูป */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">ตัวเลือกสินค้า &amp; รูป</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>ตัวเลือกให้ลูกค้าเลือก</label>
            <select
              className={inputCls}
              value={map.options.source}
              onChange={(e) => patch({ options: { ...map.options, source: e.target.value } })}
            >
              <option value="sku_color">สีของ SKU ลูก (แนะนำ)</option>
              <option value="none">— ไม่ใช้ —</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>ชื่อชุดตัวเลือก</label>
            <input
              className={inputCls}
              value={map.options.label}
              onChange={(e) => patch({ options: { ...map.options, label: e.target.value } })}
              placeholder="แบบ/สี"
            />
            <EnInput value={map.options.label_en ?? ""} th={map.options.label || "แบบ/สี"} onChange={(v) => patch({ options: { ...map.options, label_en: v } })} />
          </div>

          {/* ตัวเลือกชุดที่ 2 — สินค้าที่มี 2 มิติ เช่น ขนาดรู × จำนวนรู */}
          <div>
            <label className={labelCls}>ตัวเลือกชุดที่ 2</label>
            <select
              className={inputCls}
              value={map.options2?.source ?? "none"}
              onChange={(e) => patch({ options2: { ...(map.options2 ?? { label: "" }), source: e.target.value } })}
            >
              <option value="none">— ไม่ใช้ (ตัวเลือกชั้นเดียว) —</option>
              <option value="variant_option">ตัวเลือกที่ 2 ของ SKU ลูก</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>ชื่อชุดตัวเลือกที่ 2 (สำรอง)</label>
            <input
              className={inputCls}
              value={map.options2?.label ?? ""}
              onChange={(e) => patch({ options2: { ...(map.options2 ?? { source: "none" }), label: e.target.value } })}
              placeholder="ใช้เมื่อ SKU ไม่ได้ตั้งชื่อชุดไว้"
              disabled={(map.options2?.source ?? "none") === "none"}
            />
            {(map.options2?.source ?? "none") !== "none" && (
              <EnInput value={map.options2?.label_en ?? ""} th={map.options2?.label ?? ""} onChange={(v) => patch({ options2: { ...(map.options2 ?? { source: "none", label: "" }), label_en: v } })} />
            )}
          </div>
          {(map.options2?.source ?? "none") === "variant_option" && (
            <p className="sm:col-span-2 lg:col-span-3 text-[11px] text-slate-500">
              ใช้กับสินค้าที่เลือก 2 อย่างถึงจะได้ของถูกตัว เช่น เข็มขัด = สี × ไซส์ · เครื่องมือเจาะหนัง = จำนวนรู × ขนาดรู ·
              ค่ามาจาก SKU ไซส์/แบบ (ปุ่ม ＋ เพิ่มแบบ/ไซส์ ในตาราง SKU ลูก) · ชื่อชุดที่ติดมากับ SKU (เช่น ไซส์ / แบบพิมพ์) ชนะช่องสำรอง ·
              เปิด/ปิดแต่ละคู่ สี×ไซส์ ได้ในป๊อปตั้งค่าสินค้าบนเว็บ → 🛒 ขายบนเว็บ
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
              ใช้รูปหน้าปกจาก ERP
            </label>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">รูปสินค้าบนเว็บเอาจาก</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
              value={map.image.source ?? "parent"}
              onChange={(e) => patch({ image: { ...map.image, source: e.target.value as "parent" | "skus" | "both" } })}
            >
              <option value="parent">หน้าปก Parent SKU (รูปเดียว)</option>
              <option value="skus">รูปของ SKU ลูกแต่ละสี (หลายรูป · กดเลือกสีแล้วรูปเปลี่ยน)</option>
              <option value="both">ทั้งสองอย่าง — หน้าปก Parent ก่อน แล้วตามด้วยรูปแต่ละสี</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">ถ้ากรอกรูปทับไว้ในแท็บ &quot;สินค้าบนเว็บ&quot; จะใช้รูปที่กรอกแทนเสมอ · SKU ลูกที่ไม่มีรูปจะถูกข้าม</p>
          </div>
        </div>
      </div>

      {/* 📂 หมวดของเว็บร้าน — สรุปอย่างเดียว · แก้ที่แท็บ 📂 หมวดหมู่ (ที่เดียว มีต้นไม้แม่-ลูก + การ์ดแก้ครบ) */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-800">หมวดสินค้าบนเว็บร้านนี้</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {webCatDefs.length
                ? `📂 ${webCatDefs.length} หมวด (หลัก ${tops.length}${subCount ? ` · ย่อย ${subCount}` : ""}) · เพิ่ม/แก้ชื่อ/รูป/ลำดับ/หมวดย่อย ทำที่แท็บ 📂 หมวดหมู่ ที่เดียว`
                : "ยังไม่มีหมวด — เพิ่มที่แท็บ 📂 หมวดหมู่"}
            </p>
          </div>
          {onOpenCategories && (
            <button
              type="button"
              onClick={onOpenCategories}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-blue-400 hover:text-blue-700"
            >
              จัดการหมวดที่แท็บ 📂 หมวดหมู่ →
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
        <h3 className="text-sm font-semibold text-slate-800">จับคู่หมวด ERP → หมวดบนเว็บ</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          ใช้กับสินค้าที่ยังไม่ได้จัดหมวดเองในแท็บ 📂 หมวดหมู่ (เช่น สินค้าที่เพิ่งเพิ่มขึ้นเว็บ)
          {listingStats &&
            listingStats.total > 0 &&
            (listingStats.auto
              ? ` · ตอนนี้ใช้กับ ${listingStats.auto} จาก ${listingStats.total} รุ่น`
              : ` · ตอนนี้สินค้าบนเว็บ ${listingStats.total} รุ่นจัดหมวดเองครบแล้ว — มีผลกับรุ่นที่เพิ่มใหม่`)}
        </p>

        {webCatDefs.length === 0 ? (
          <p className="mt-3 py-6 text-center text-sm text-slate-400">ยังไม่มีหมวดบนเว็บให้จับคู่ — เพิ่มหมวดที่แท็บ 📂 หมวดหมู่ก่อน</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
              <span className="text-xs text-slate-600">หมวด ERP ที่ไม่ได้จับคู่ → ไปหมวด</span>
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
                placeholder="🔍 ค้นหาหมวด ERP"
              />
              <div className="flex items-center gap-1" role="group" aria-label="กรองหมวด ERP">
                {(
                  [
                    ["all", `ทั้งหมด ${matched.length}`],
                    ["mapped", `จับคู่แล้ว ${mappedCount}`],
                    ["unmapped", `ยังไม่จับคู่ ${matched.length - mappedCount}`],
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
                  title="ตั้งหลายหมวดพร้อมกัน"
                  aria-label="ตั้งหลายหมวดพร้อมกัน"
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
                    ตั้ง {shown.length} หมวดที่เห็นเป็นหมวดเดียวกัน…
                  </button>
                  <button
                    type="button"
                    disabled={!shownMapped}
                    onClick={() => {
                      setMoreOpen(false);
                      setRules(shown.map((c) => c.name), "");
                      toast.success(`ล้างการจับคู่ ${shownMapped} หมวดแล้ว — กดบันทึกด้านล่างเพื่อยืนยัน`);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:text-slate-300 disabled:hover:bg-transparent"
                  >
                    ล้างการจับคู่ {shownMapped} หมวดที่เห็น
                  </button>
                </div>
              </FloatingDropdown>
            </div>

            <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-slate-100">
              {shown.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  {q.trim() ? "ไม่พบหมวดที่ค้นหา ลองเปลี่ยนคำค้น" : show === "mapped" ? "ยังไม่ได้จับคู่หมวดไหน" : show === "unmapped" ? "จับคู่ครบทุกหมวดแล้ว 🎉" : "ยังไม่มีหมวด ERP ที่มีสินค้า"}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {shown.map((c) => {
                    const rule = rules[c.name] ?? "";
                    return (
                      <li key={c.name} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50/60">
                        <span className="flex-1 min-w-0 truncate text-sm text-slate-700" title={`${c.name} · สินค้าใน ERP ${c.count} รุ่น`}>
                          {c.name} <span className="text-[11px] text-slate-400 tabular-nums">{c.count}</span>
                        </span>
                        <span className="text-slate-300 text-xs" aria-hidden>
                          →
                        </span>
                        <WebCatSelect
                          cats={webCatDefs}
                          value={rule}
                          onChange={(v) => setRules([c.name], v)}
                          emptyLabel={`ค่าเริ่มต้น · ${defaultLabel}`}
                          className={`w-[52%] max-w-[220px] shrink-0 ${rule ? "border-blue-200 bg-blue-50/40 text-slate-800" : "border-slate-200 text-slate-400"}`}
                          ariaLabel={`หมวดบนเว็บของ ${c.name}`}
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
        title={`ตั้ง ${shown.length} หมวด ERP พร้อมกัน`}
        size="sm"
        defaultExpanded={false}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button onClick={() => setBulkOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
              ยกเลิก
            </button>
            <button
              onClick={() => {
                setRules(shown.map((c) => c.name), bulkTo);
                setBulkOpen(false);
                toast.success(`ตั้ง ${shown.length} หมวดแล้ว — กดบันทึกด้านล่างเพื่อยืนยัน`);
              }}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              ตั้ง {shown.length} หมวด
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            หมวด ERP ที่เห็นอยู่ตอนนี้ {shown.length} หมวด{q.trim() || show !== "all" ? " (ตามคำค้น/ตัวกรอง)" : ""} จะส่งสินค้าเข้าหมวดบนเว็บนี้
          </p>
          <p className="text-xs text-slate-400 line-clamp-3">{shown.map((c) => c.name).join(" · ")}</p>
          <div>
            <label className={labelCls}>ไปหมวดบนเว็บ</label>
            <WebCatSelect cats={webCatDefs} value={bulkTo} onChange={setBulkTo} emptyLabel={`— ค่าเริ่มต้น · ${defaultLabel} (ล้างการจับคู่) —`} />
          </div>
        </div>
      </ERPModal>

      {/* 💾 แถบบันทึก (ของกลาง) */}
      <SaveBar dirty={!!map && JSON.stringify(map) !== savedJson} saving={saving} onSave={save} onDiscard={() => void load()} saveLabel="💾 บันทึกการจับคู่" note="สินค้าทุกตัวใช้ค่านี้อัตโนมัติ" />
    </div>
  );
}


/** 🌐 ช่องภาษาอังกฤษเล็ก ๆ ใต้ช่องไทย (หน้าเว็บ /en) — ว่าง = ใช้คำมาตรฐาน (ถ้ารู้จัก) ไม่งั้นโชว์ไทย */
function EnInput({ value, th, onChange }: { value: string; th: string; onChange: (v: string) => void }) {
  const auto = commonLabelEn(th);
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <span className="shrink-0 text-[10px] font-semibold text-indigo-600">🌐 EN</span>
      <input
        className="w-full rounded-md border border-indigo-100 bg-indigo-50/30 px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-300"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={auto ? `ว่าง = ${auto}` : "English (ว่าง = ใช้ภาษาไทย)"}
      />
    </div>
  );
}
