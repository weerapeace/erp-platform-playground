"use client";

/**
 * WebsiteFieldMapPanel — แท็บ "จับคู่ฟิลด์" ในหน้า /website
 * ตั้งครั้งเดียวต่อร้าน: ข้อมูลบนเว็บแต่ละช่องดึงมาจากฟิลด์ไหนของ Parent SKU
 * → สินค้าทุกตัวเติมให้อัตโนมัติ ไม่ต้องพิมพ์ทีละชิ้น (กรอกทับรายตัวได้เสมอ)
 * ข้อมูล: /api/website/field-map (guardApi products.view/edit + audit)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";

/** รหัสหมวดตั้งเองได้แล้ว ไม่ใช่รายการตายตัว (ให้ตรงกับ lib/website-field-map.ts) */
type WebCategory = string;

interface FieldMap {
  name: { source: string; stripPrefix?: string };
  price: { source: string };
  description: { source: string };
  unit: { default: string };
  options: { source: string; label: string };
  /** อาจไม่มีในข้อมูลเก่าที่บันทึกไว้ก่อนมีฟีเจอร์นี้ */
  options2?: { source: string; label: string };
  category: { default: WebCategory; rules: Record<string, WebCategory> };
  /** อาจไม่มีในข้อมูลเก่า — server จะเติมชุดตั้งต้นให้ */
  categories?: CategoryDef[];
  image: { useCover: boolean };
}

const NAME_OPTS = [
  { v: "name_th", l: "ชื่อไทย (name_th)" },
  { v: "name_platform", l: "ชื่อแพลตฟอร์ม (name_platform)" },
  { v: "name_en", l: "ชื่ออังกฤษ (name_en)" },
  { v: "sku_name", l: "ชื่อ SKU (sku_name)" },
  { v: "code", l: "รหัสสินค้า (code)" },
];

const PRICE_OPTS = [
  { v: "sku_max", l: "ราคาสูงสุดของ SKU ลูก (แนะนำ)" },
  { v: "sku_min", l: "ราคาต่ำสุดของ SKU ลูก" },
  { v: "final_price", l: "ราคาสุทธิ (final_price)" },
  { v: "sale_price", l: "ราคาขาย (sale_price)" },
  { v: "fake_price", l: "ราคาก่อนลด (fake_price)" },
];

const DESC_OPTS = [
  { v: "platform_description", l: "คำโปรยแพลตฟอร์ม (สั้น — แนะนำ)" },
  { v: "introduction", l: "บทนำ (introduction)" },
  { v: "description", l: "คำอธิบายเต็ม (description)" },
  { v: "english_description", l: "คำอธิบายอังกฤษ" },
  { v: "none", l: "— ไม่ดึง —" },
];

type CategoryDef = { key: string; label: string; icon: string; blurb: string };

/** รหัสหมวดต้องปลอดภัยกับ URL (/shop?cat=<key>) — ให้ตรงกับฝั่ง server */
const cleanKey = (v: string) =>
  v.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40);

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";
const cardCls = "rounded-xl border border-slate-200 bg-white p-4";

export function WebsiteFieldMapPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [map, setMap] = useState<FieldMap | null>(null);
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/field-map?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      setMap(j.fieldMap ?? null);
      setCategories(j.categories ?? []);
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
        toast.success("บันทึกการจับคู่แล้ว — สินค้าทุกตัวจะใช้ค่านี้อัตโนมัติ");
      } else toast.error(j.error ?? "บันทึกไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  };

  const shown = useMemo(() => {
    const t = q.trim();
    return t ? categories.filter((c) => c.name.includes(t)) : categories;
  }, [categories, q]);

  const setRule = (name: string, v: WebCategory) =>
    setMap((m) => (m ? { ...m, category: { ...m.category, rules: { ...m.category.rules, [name]: v } } } : m));

  const bulkSet = (v: WebCategory) =>
    setMap((m) => {
      if (!m) return m;
      const rules = { ...m.category.rules };
      for (const c of shown) rules[c.name] = v;
      return { ...m, category: { ...m.category, rules } };
    });

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;
  if (!map) return <div className="py-16 text-center text-sm text-slate-400">โหลดการตั้งค่าไม่สำเร็จ</div>;

  const mappedCount = shown.filter((c) => map.category.rules[c.name]).length;

  /* ── หมวดของร้าน (เจ้าของเพิ่ม/แก้/ลบเอง) ── */
  const webCatDefs: CategoryDef[] = map.categories ?? [];
  const webCats = [...webCatDefs.map((c) => ({ v: c.key, l: c.label })), { v: "", l: "— ไม่ระบุ —" }];

  const setCats = (next: CategoryDef[]) => setMap((m) => (m ? { ...m, categories: next } : m));
  const editCat = (i: number, p: Partial<CategoryDef>) =>
    setCats(webCatDefs.map((c, idx) => (idx === i ? { ...c, ...p } : c)));
  const addCat = () => setCats([...webCatDefs, { key: "", label: "", icon: "", blurb: "" }]);
  const removeCat = (i: number) => {
    const c = webCatDefs[i];
    const used = Object.values(map.category.rules).filter((v) => v === c.key).length;
    const warn = used ? `\n\nมี ${used} หมวด ERP จับคู่ไว้กับหมวดนี้ — ลบแล้วจะกลับไปใช้ค่าเริ่มต้น` : "";
    if (!confirm(`ลบหมวด "${c.label || c.key}" ออกจากเว็บ?${warn}`)) return;
    setCats(webCatDefs.filter((_, idx) => idx !== i));
  };
  const dupKey = (i: number) => {
    const k = webCatDefs[i].key;
    return !!k && webCatDefs.some((c, idx) => idx !== i && c.key === k);
  };

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
              onChange={(e) => patch({ unit: { default: e.target.value } })}
              placeholder="ชิ้น / ตร.ฟุต / หลา"
            />
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
            <label className={labelCls}>ชื่อชุดตัวเลือกที่ 2</label>
            <input
              className={inputCls}
              value={map.options2?.label ?? ""}
              onChange={(e) => patch({ options2: { ...(map.options2 ?? { source: "none" }), label: e.target.value } })}
              placeholder="เว้นว่าง = ใช้ชื่อที่ตั้งไว้กับ SKU"
              disabled={(map.options2?.source ?? "none") === "none"}
            />
          </div>
          {(map.options2?.source ?? "none") === "variant_option" && (
            <p className="sm:col-span-2 lg:col-span-3 text-[11px] text-slate-500">
              ใช้กับสินค้าที่เลือก 2 อย่างถึงจะได้ของถูกตัว เช่น เครื่องมือเจาะหนัง = จำนวนรู × ขนาดรู ·
              ค่ามาจากช่อง &quot;ตัวเลือกที่ 2&quot; ที่ตั้งไว้ตอนสร้าง SKU แบบเมทริกซ์
            </p>
          )}
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer pb-1.5">
              <input
                type="checkbox"
                className="w-4 h-4 accent-blue-600"
                checked={map.image.useCover}
                onChange={(e) => patch({ image: { useCover: e.target.checked } })}
              />
              ใช้รูปหน้าปกจาก ERP
            </label>
          </div>
        </div>
      </div>

      {/* หมวดของเว็บร้าน */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-slate-800">หมวดสินค้าบนเว็บร้านนี้</h3>
          <button
            onClick={addCat}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-blue-400 hover:text-blue-700"
          >
            + เพิ่มหมวด
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">
          เมนูหมวดบนหน้าเว็บมาจากรายการนี้ · <b>รหัส</b> คือชื่อที่โผล่ในลิงก์ (`/shop?cat=รหัส`) ตั้งแล้วไม่ควรเปลี่ยน
          เพราะลิงก์เก่าที่ลูกค้าเคยบันทึกไว้จะเสีย
        </p>

        {webCatDefs.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีหมวด — กด &quot;+ เพิ่มหมวด&quot;</p>
        ) : (
          <ul className="space-y-2">
            {webCatDefs.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <input
                  className={inputCls}
                  style={{ width: 64 }}
                  value={c.icon}
                  onChange={(e) => editCat(i, { icon: e.target.value.slice(0, 4) })}
                  placeholder="ไอคอน"
                  title="ใส่อีโมจิได้ 1 ตัว"
                />
                <input
                  className={inputCls}
                  style={{ width: 180 }}
                  value={c.label}
                  onChange={(e) => editCat(i, { label: e.target.value })}
                  placeholder="ชื่อที่ลูกค้าเห็น เช่น เครื่องมือ"
                />
                <input
                  className={`${inputCls} ${dupKey(i) ? "border-red-400" : ""}`}
                  style={{ width: 160 }}
                  value={c.key}
                  onChange={(e) => editCat(i, { key: cleanKey(e.target.value) })}
                  placeholder="รหัส เช่น tools"
                />
                <input
                  className={inputCls}
                  style={{ width: 240 }}
                  value={c.blurb ?? ""}
                  onChange={(e) => editCat(i, { blurb: e.target.value.slice(0, 120) })}
                  placeholder="คำโปรย เช่น หัวเข็มขัด ซิป หมุด ห่วง"
                  title="ข้อความสั้น ๆ ใต้ชื่อหมวดบนการ์ดหน้าแรก เว้นว่างได้"
                />
                <button onClick={() => removeCat(i)} className="text-xs text-red-500 hover:underline">
                  ลบ
                </button>
                {dupKey(i) && <span className="text-[11px] text-red-600">รหัสซ้ำกับหมวดอื่น</span>}
                {!c.key && c.label && <span className="text-[11px] text-amber-600">ยังไม่ได้ใส่รหัส — จะไม่ถูกบันทึก</span>}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          เมนูหมวดในหน้าร้านวัสดุ <b>และการ์ดหมวดบนหน้าแรก</b> วาดจากรายการนี้ทั้งคู่ — เพิ่ม/แก้ที่นี่แล้วขึ้นเว็บเลย
          ไม่ต้องแก้โค้ด · ลำดับการ์ดเรียงตามลำดับในรายการนี้
        </p>
      </div>

      {/* จับคู่หมวด */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">จับคู่หมวด ERP → หมวดบนเว็บ</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              จับคู่แล้ว {mappedCount}/{shown.length} หมวด · ที่ไม่ได้จับคู่จะใช้ค่าเริ่มต้น
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">ค่าเริ่มต้น</span>
            <select
              className={inputCls}
              style={{ width: "auto" }}
              value={map.category.default}
              onChange={(e) => patch({ category: { ...map.category, default: e.target.value as WebCategory } })}
            >
              {webCats.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.l}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            className={inputCls}
            style={{ maxWidth: 240 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาหมวด เช่น ซิป, หนัง"
          />
          <span className="text-[11px] text-slate-400">ตั้งที่แสดงอยู่ทั้งหมดเป็น:</span>
          {webCats.filter((c) => c.v).map((c) => (
            <button
              key={c.v}
              onClick={() => bulkSet(c.v)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-500"
            >
              {c.l}
            </button>
          ))}
        </div>

        <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-100">
          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">ไม่พบหมวดที่ค้นหา</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shown.map((c) => (
                <li key={c.name} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 text-sm text-slate-700 truncate">
                    {c.name} <span className="text-slate-400 text-xs">({c.count})</span>
                  </span>
                  <select
                    className={inputCls}
                    style={{ width: 150 }}
                    value={map.category.rules[c.name] ?? ""}
                    onChange={(e) => setRule(c.name, e.target.value as WebCategory)}
                  >
                    <option value="">— ใช้ค่าเริ่มต้น —</option>
                    {webCats.filter((w) => w.v).map((w) => (
                      <option key={w.v} value={w.v}>
                        {w.l}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-slate-50/80 backdrop-blur py-3">
        <button onClick={() => void load()} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:border-slate-400">
          ยกเลิกการแก้ไข
        </button>
        <button
          onClick={() => void save()}
          disabled={saving}
          className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก…" : "บันทึกการจับคู่"}
        </button>
      </div>
    </div>
  );
}
