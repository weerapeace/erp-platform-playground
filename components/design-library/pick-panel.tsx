"use client";

/**
 * 📚 Design Library — แผงเลือกของ "จุด" ที่กดบนรูป
 * รอบ 7: แผงผ้า / SKU / SKU-หรือเขียนเอง → ป๊อปเลือกวัสดุ 3 แท็บเดียวกัน (material-modal: แผง · รายการตามแท็กของหมวด · ค้นทั้งหมด)
 *        โลโก้ = วิธีทำ (logo_method) → แบบย่อย → วัสดุโลโก้ (ถ้าวิธีนั้นต้องใช้) + รูปโลโก้ · คำเตือนของวิธีขึ้นทันที
 * ยังไม่เลือกหมวด → ปุ่มหมวด (จากรายการตัวเลือก category) · เลือกแล้ว → ตัวเลือกตามแหล่งของหมวด:
 *   swatch   = แผงผ้า (ของกลาง SwatchBrowser โหมด onPickSpot) — ได้รูปชิ้นที่ตัดจากแผง + SKU
 *   sku      = ของกลาง SkuPicker (+ สีอะไหล่ทั้งใบ ถ้าหมวดตั้ง "สีอะไหล่")
 *   color    = รหัสสีจากรายการ (เช่น สีด้าย)
 *   logo     = อัปโหลด (uploadImagesWithDupCheck) หรือเลือกจากคลังรูป (AssetPicker)
 *   sku_text = SkuPicker หรือเขียนเอง
 * โน้ตต่อจุด → ขึ้นในใบสรุป + prompt
 * รอบ 8 (เจ้าของเลือก 2026-11-15): โลโก้ วิธี + แบบ = ดรอปดาวน์ 2 ช่องข้างกัน (ของกลาง SearchableSelect)
 *   ขนาดโลโก้ (ซม. · pin.dim) เติมให้เองตามลำดับ: ชื่อ SKU โลโก้ ("4.5 x 2 cm") → ขนาดเดิมของโลโก้นี้ในสูตรอื่น → ล็อกสัดส่วนจากรูปโลโก้
 *   สีโลโก้/สีด้ายปัก (ต่อชุดสี) · จุดอื่น (ไม่ใช่ผ้า) = จำนวนต่อจุด + ความยาว (ซิปยาว 28 ซม.) → ทุน + ใบสั่งทำตัวอย่าง
 */
import { useEffect, useMemo, useRef, useState } from "react";
import nextDynamic from "next/dynamic";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { usePermission } from "@/components/auth";
import { uploadImagesWithDupCheck } from "@/components/duplicate-upload";
import type { SwatchSpotPick } from "@/components/sku-swatch-browser";
import { SearchableSelect } from "@/components/searchable-select";
import {
  bodyPickOf, categoryChips, categoryOf, categoryTags, defaultMaterialTab, dimText, logoColorsOf, logoMethods, logoNeedsMaterial, logoOptions, pickInfo, pickThumbSvg, pinQty, sizeFromName, skuIdOf, sourceOf, usesHwColor,
  type CategoryChip, type Choice, type LogoMaterial, type Pick, type Pin, type Spec,
} from "@/lib/design-library";
import { HW_PARENT } from "@/lib/design-library-hwtags";
import { MaterialPickModal, type MaterialPicked } from "./material-modal";
import { img, loadLogoSizes, loadSize } from "./shared";

const AssetPicker = nextDynamic(() => import("@/components/asset-picker").then((m) => m.AssetPicker), { ssr: false });
const HwTagSuggestModal = nextDynamic(() => import("./hw-tag-suggest").then((m) => m.HwTagSuggestModal), { ssr: false });
type LogoPick = Extract<Pick, { kind: "logo" }>;
/** วัสดุของโลโก้ (เช่น โลโก้หนัง) กรองตามแท็กนี้ก่อน — ตั้งที่วิธีทำโลโก้ config.material_tags */
const materialTagsOf = (m: Choice | undefined): string[] => {
  const v = m?.config?.material_tags;
  if (v === undefined || v === null) return ["หนัง", "PU"];   // ไม่ได้ตั้ง = หนัง/PU · ตั้งเป็นว่าง (โลโก้โลหะ) = ไม่กรองแท็ก
  const list = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/[,\n]/) : [];
  return list.map((s) => s.trim()).filter(Boolean);
};
/** ปุ่มลัดค้นวัสดุของวิธีทำ (config.material_chips "ชื่อ=คำค้น") — เช่น โลโก้ทั้งหมด=LOGO- */
const materialChipsOf = (m: Choice | undefined): CategoryChip[] => categoryChips(m ? { ...m, config: { chips: m.config?.material_chips } } : undefined);
const AREA_CATS = ["body", "lining", "handle"];
const hasDim = (p: Pin) => !!(p.dim && p.dim.w > 0 && p.dim.h > 0);

/** ช่องตัวเลขทศนิยม (ซม.) — พิมพ์ค้าง "1." ได้ ไม่เด้ง · ว่าง = null */
function NumBox({ value, onChange, placeholder, disabled, className = "w-20" }: { value: number | undefined; onChange: (v: number | null) => void; placeholder: string; disabled?: boolean; className?: string }) {
  const show = (v: number | undefined) => (v && v > 0 ? String(v) : "");
  const [text, setText] = useState(show(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(show(value)); }, [value, focus]);
  return (
    <input type="number" min={0} step={0.1} inputMode="decimal" value={text} disabled={disabled} placeholder={placeholder} aria-label={placeholder}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); onChange(e.target.value.trim() === "" ? null : Number.isFinite(n) && n >= 0 ? n : null); }}
      className={`${className} h-9 px-2 border border-slate-200 rounded-lg text-sm text-right text-slate-800 disabled:bg-slate-50`} />
  );
}

export function PickThumb({ pick, spec, choices, cat, size = 56 }: { pick: Pick | null; spec: Spec; choices: Choice[]; cat?: string; size?: number }) {
  const c = cat ? categoryOf(choices, cat) : undefined;
  const hw = choices.find((x) => x.list_key === "hw_color" && x.code === spec.hw_color);
  const html = pickThumbSvg(pick, `width="${size}" height="${size}"`, (k, w) => img(k, w), { bodyPick: bodyPickOf(spec), hwHex: hw?.hex, isHw: usesHwColor(c) });
  return <span className="inline-block shrink-0 rounded-md overflow-hidden border border-slate-200" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function StockBadge({ onHand }: { onHand: number | undefined }) {
  if (onHand === undefined) return null;
  if (onHand <= 0) return <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 whitespace-nowrap">หมดสต็อก</span>;
  if (onHand < 10) return <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 whitespace-nowrap">เหลือ {onHand}</span>;
  return <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 whitespace-nowrap">มีของ {onHand.toLocaleString("th-TH")}</span>;
}

export function PickPanel({ pin, index, spec, choices, stock, readOnly, onChange, onHwColor, onDelete, onClose }: {
  pin: Pin; index: number; spec: Spec; choices: Choice[]; stock: Record<string, number>; readOnly: boolean;
  onChange: (pin: Pin) => void; onHwColor: (code: string) => void; onDelete: () => void;
  /** อยู่ในป๊อปข้างจุด (รอบ 7) → มีปุ่มปิด */
  onClose?: () => void;
}) {
  const toast = useToast();
  const canTag = usePermission("products.edit");
  const [mat, setMat] = useState<null | "pick" | "logo">(null);
  const [hwOpen, setHwOpen] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  const [colorQ, setColorQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const cats = useMemo(() => choices.filter((c) => c.list_key === "category"), [choices]);
  const cat = categoryOf(choices, pin.cat);
  const src = sourceOf(cat);
  const hwColors = choices.filter((c) => c.list_key === "hw_color");
  const colorList = choices.filter((c) => c.list_key === String(cat?.config?.color_list ?? "thread_color"));
  const info = pickInfo(pin.pick, { bodyPick: bodyPickOf(spec) });
  const setPick = (pick: Pick | null) => onChange({ ...pin, pick });
  const logo = pin.pick?.kind === "logo" ? pin.pick : null;
  /** แก้ส่วนหนึ่งของโลโก้ (รูป / วิธี / แบบ / วัสดุ) โดยคงส่วนอื่นไว้ */
  const setLogo = (p: Partial<LogoPick>) => setPick({ kind: "logo", image_key: null, name: "", asset_id: null, ...(logo ?? {}), ...p } as LogoPick);
  const methods = useMemo(() => logoMethods(choices), [choices]);
  const method = logo?.method ? methods.find((m) => m.code === logo.method) : undefined;
  const options = logoOptions(method);
  const methodWarn = String(method?.config?.warn ?? "").trim();
  const ratio = logo?.img_w && logo?.img_h ? logo.img_w / logo.img_h : null;
  const [lock, setLock] = useState(true);
  const [sizeHint, setSizeHint] = useState("");
  // ค่าล่าสุดของจุด (งานที่รอโหลด — ขนาดรูป/ขนาดเดิม — กลับมาแล้วต้องแก้บนค่าปัจจุบัน ไม่ใช่ค่าตอนกด)
  const pinRef = useRef(pin); pinRef.current = pin;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const logoBase = (): LogoPick => ({ kind: "logo", image_key: null, name: "", asset_id: null, ...(logo ?? {}) } as LogoPick);
  const pickMethod = (v: string) => {
    const m = methods.find((x) => x.code === v);
    setLogo({ method: v || undefined, option: undefined, material: logoNeedsMaterial(m) ? logo?.material ?? null : null });
  };
  /** ขนาดเดิมของโลโก้นี้ในสูตรอื่น (คีย์แรกที่เจอ) */
  const prevSize = async (keys: string[]) => {
    const hits = await loadLogoSizes();
    for (const k of keys) { const h = hits.find((x) => x.k === k); if (h) return h; }
    return null;
  };
  const setDimPart = (k: "w" | "h", v: number | null) => {
    const cur = pin.dim ?? { w: 0, h: 0 };
    let w = k === "w" ? v ?? 0 : cur.w, h = k === "h" ? v ?? 0 : cur.h;
    if (lock && ratio && v) { if (k === "w") h = Math.round((v / ratio) * 100) / 100; else w = Math.round(v * ratio * 100) / 100; }
    setSizeHint("");
    onChange({ ...pin, dim: w > 0 || h > 0 ? { w, h } : null });
  };
  /** ใส่รูปโลโก้ → อ่านสัดส่วนรูป + เติมขนาดเดิมของโลโก้นี้ (ถ้ายังไม่ใส่ขนาด) ในครั้งเดียว */
  const setLogoImage = async (image_key: string, name: string, asset_id: string | null) => {
    onChange({ ...pin, pick: { ...logoBase(), image_key, name, asset_id } });
    const [d, prev] = await Promise.all([loadSize(img(image_key, 800)), prevSize([`img:${image_key}`, ...(asset_id ? [`asset:${asset_id}`] : [])])]);
    if (!alive.current) return;
    const cur = pinRef.current, cp = cur.pick?.kind === "logo" ? cur.pick : null;
    if (!cp || cp.image_key !== image_key) return;   // เปลี่ยนรูปไปแล้วระหว่างรอ
    const useDim = prev && !hasDim(cur);
    onChange({ ...cur, pick: { ...cp, img_w: d.w, img_h: d.h }, ...(useDim ? { dim: { w: prev.w, h: prev.h } } : {}) });
    if (useDim) { setSizeHint(`ขนาดเดิมจากสูตร #${prev.seq}`); toast.info(`ใส่ขนาดเดิมของโลโก้นี้ ${dimText(prev)} (จากสูตร #${prev.seq}) — แก้ได้`); }
  };
  /** เลือกวัสดุโลโก้ → ขนาดจากชื่อ SKU ("4.5 x 2 cm") ก่อน · ไม่มี = ขนาดเดิมของ SKU นี้ในสูตรอื่น */
  const setLogoMaterial = async (material: LogoMaterial) => {
    const next = { ...logoBase(), material };
    const byName = hasDim(pin) ? null : sizeFromName(material.name);
    if (byName) {
      onChange({ ...pin, pick: next, dim: byName });
      setSizeHint("ขนาดจากชื่อ SKU"); toast.success(`ใส่ขนาด ${dimText(byName)} จากชื่อ SKU ให้แล้ว — แก้ได้`);
      return;
    }
    onChange({ ...pin, pick: next });
    if (hasDim(pin) || !material.sku_id) return;
    const prev = await prevSize([`sku:${material.sku_id}`]);
    if (!alive.current || !prev) return;
    const cur = pinRef.current;
    if (hasDim(cur) || (cur.pick?.kind === "logo" ? cur.pick.material?.sku_id : null) !== material.sku_id) return;
    onChange({ ...cur, dim: { w: prev.w, h: prev.h } });
    setSizeHint(`ขนาดเดิมจากสูตร #${prev.seq}`); toast.info(`ใส่ขนาดเดิมของ ${material.code || "โลโก้นี้"} ${dimText(prev)} (จากสูตร #${prev.seq}) — แก้ได้`);
  };

  const fromSwatch = (p: SwatchSpotPick) => {
    if (!p.sku) { toast.warning("ชิ้นนี้บนแผงยังไม่ได้ผูก SKU — ใช้รหัสภายในของแผงแทน (ไม่มีสต็อก)"); }
    setPick({ kind: "swatch", swatch_id: p.swatch_id, swatch_name: p.swatch_name, image_key: p.image_key, image_w: p.image_w, image_h: p.image_h,
      x: p.x, y: p.y, w: p.w, h: p.h, sku_id: p.sku?.id ?? null, code: p.sku?.code ?? p.code ?? p.label ?? "", name: p.sku?.name ?? p.name ?? p.label ?? p.swatch_name });
  };
  const fromMaterial = (m: MaterialPicked) => {
    if (m.kind === "swatch") fromSwatch(m.spot);
    else setPick({ kind: "sku", sku_id: m.sku.id, code: m.sku.code, name: m.sku.name, image_key: m.sku.image_key });
  };
  const logoMaterialOf = (m: MaterialPicked): LogoMaterial => m.kind === "swatch"
    ? { sku_id: m.spot.sku?.id ?? null, code: m.spot.sku?.code ?? m.spot.code ?? "", name: m.spot.sku?.name ?? m.spot.name ?? m.spot.swatch_name, image_key: m.spot.image_key }
    : { sku_id: m.sku.id, code: m.sku.code, name: m.sku.name, image_key: m.sku.image_key };
  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadImagesWithDupCheck([file], { folder: "design-library/logos", max: 1600, onError: (_, e) => toast.error(e.message) });
      const key = up?.keys[0];
      if (key) void setLogoImage(key, file.name.replace(/\.[a-z0-9]+$/i, ""), null);
    } catch { toast.error("อัปโหลดโลโก้ไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setUploading(false); }
  };

  const closeBtn = onClose && (
    <button type="button" onClick={onClose} aria-label="ปิด" title="ปิด (Esc)"
      className={`h-7 w-7 -mr-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 inline-flex items-center justify-center shrink-0 ${readOnly ? "ml-auto" : ""}`}><Icon value="i:x" /></button>
  );

  if (!pin.cat || !cat) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-1"><span className="text-[14px] font-medium text-slate-800">จุดที่ {index + 1} · จะเปลี่ยนอะไร?</span>
          {!readOnly && <button type="button" onClick={onDelete} className="ml-auto text-[12px] text-rose-600 hover:underline">ลบจุด</button>}{closeBtn}</div>
        <p className="text-[12px] text-slate-500 mb-2">เลือกหมวด — แต่ละหมวดเลือกจากแหล่งที่ต่างกัน</p>
        {cats.length === 0 && <p className="text-[13px] text-amber-700">ยังไม่มีรายการหมวด — ให้ผู้ดูแลเพิ่มที่ “ตัวเลือก” หน้า Design Library</p>}
        <div className="grid grid-cols-2 gap-1.5">
          {cats.map((c) => (
            <button key={c.id} type="button" disabled={readOnly} onClick={() => onChange({ ...pin, cat: c.code, pick: c.code === "handle" ? { kind: "same_as_body" } : null })}
              className="h-9 px-2.5 rounded-lg border border-slate-200 text-left text-[13px] text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40 disabled:opacity-50 flex items-center gap-2">
              <span className="flex-1 truncate">{c.name}</span><span className="text-[10.5px] text-slate-400">{({ swatch: "แผง", sku: "รายการ", color: "รหัสสี", logo: "วิธี+รูป", sku_text: "ค้น/เขียน" } as const)[sourceOf(c)]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const btn = "h-9 px-3 text-[13px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50";
  const sid = skuIdOf(pin.pick);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-medium text-slate-800">จุดที่ {index + 1} · {cat.name}</span>
        {!readOnly && <>
          <button type="button" onClick={() => onChange({ ...pin, cat: "", pick: null })} className="ml-auto text-[12px] text-slate-500 hover:underline">เปลี่ยนหมวด</button>
          <button type="button" onClick={onDelete} className="text-[12px] text-rose-600 hover:underline">ลบจุด</button>
        </>}
        {closeBtn}
      </div>

      <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-2">
        <PickThumb pick={pin.pick} spec={spec} choices={choices} cat={pin.cat} size={64} />
        <div className="min-w-0 flex-1 text-[13px]">
          {pin.pick ? <><div className="font-medium text-slate-800 truncate">{info.code ? `${info.code} · ` : ""}{info.name}</div>
            {pin.pick.kind === "swatch" && <div className="text-[11px] text-slate-500 truncate">จากแผง: {pin.pick.swatch_name}</div>}
            {pin.pick.kind === "color" && pin.pick.hex && <div className="text-[11px] text-slate-500 font-mono">{pin.pick.hex}</div>}</>
            : <div className="text-slate-400">ยังไม่ได้เลือก</div>}
        </div>
        {sid && <StockBadge onHand={stock[sid]} />}
      </div>

      {!readOnly && (src === "swatch" || src === "sku" || src === "sku_text") && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMat("pick")} className={`${btn} !border-indigo-300 !bg-indigo-50 text-indigo-700 hover:!bg-indigo-100`}>
            <Icon value={src === "swatch" ? "i:layout-grid" : "i:search"} />{pin.pick && pin.pick.kind !== "text" && pin.pick.kind !== "same_as_body" ? "เปลี่ยน" : "เลือก"}{cat.name}
          </button>
          {src === "swatch" && pin.cat !== "body" && <button type="button" onClick={() => setPick({ kind: "same_as_body" })} className={`${btn} ${pin.pick?.kind === "same_as_body" ? "!border-indigo-300 !bg-indigo-50 text-indigo-700" : ""}`}>ใช้วัสดุเดียวกับตัวกระเป๋า</button>}
        </div>
      )}
      {!readOnly && src === "sku_text" && (
        <label className="block text-[12px] text-slate-500">หรือเขียนเอง (ไม่มี SKU)
          <input value={pin.pick?.kind === "text" ? pin.pick.text : ""} onChange={(e) => setPick(e.target.value.trim() ? { kind: "text", text: e.target.value } : null)}
            placeholder="เช่น ปักชื่อลูกค้าที่ฝา" className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm text-slate-800" />
        </label>
      )}
      {src !== "logo" && !AREA_CATS.includes(pin.cat) && pin.pick?.kind !== "same_as_body" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[12px] text-slate-500">จำนวนต่อจุด
            <input type="number" min={1} max={999} disabled={readOnly} value={pinQty(pin)} onChange={(e) => { const n = Math.round(Number(e.target.value)); onChange({ ...pin, qty: n > 1 ? Math.min(999, n) : undefined }); }}
              className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm text-right text-slate-800 disabled:bg-slate-50" />
          </label>
          <label className="block text-[12px] text-slate-500">ความยาว ซม. (ไม่บังคับ)
            <span className="mt-1 block"><NumBox value={pin.len} className="w-full" disabled={readOnly} placeholder={pin.cat === "tape" ? "ว่าง = รอบปากกระเป๋า" : "เช่น ซิปยาว 28"} onChange={(v) => onChange({ ...pin, len: v && v > 0 ? Math.min(500, v) : undefined })} /></span>
          </label>
        </div>
      )}
      {usesHwColor(cat) && (
        <div>
          <div className="text-[12px] text-slate-500 mb-1">สีอะไหล่ (เลือกครั้งเดียว ใช้กับอะไหล่ทุกชิ้นทั้งใบ)</div>
          <div className="flex flex-wrap gap-1.5">
            {hwColors.map((c) => (
              <button key={c.id} type="button" disabled={readOnly} onClick={() => onHwColor(c.code)}
                className={`h-8 px-2.5 rounded-full border text-[12.5px] inline-flex items-center gap-1.5 ${spec.hw_color === c.code ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600"}`}>
                <span className="w-3.5 h-3.5 rounded-full border border-slate-300" style={{ background: c.hex ?? "#ccc" }} />{c.name}
              </button>
            ))}
            {hwColors.length === 0 && <span className="text-[12px] text-slate-400">ยังไม่มีรายการสีอะไหล่</span>}
          </div>
        </div>
      )}
      {!readOnly && src === "color" && (
        <div>
          <input value={colorQ} onChange={(e) => setColorQ(e.target.value)} placeholder="พิมพ์รหัสสี / ชื่อสี" className="w-full h-9 px-2 border border-slate-200 rounded-lg text-sm mb-1.5" />
          <div className="max-h-56 overflow-auto space-y-1">
            {colorList.filter((c) => !colorQ.trim() || `${c.code} ${c.name}`.toLowerCase().includes(colorQ.trim().toLowerCase())).map((c) => (
              <button key={c.id} type="button" onClick={() => setPick({ kind: "color", code: c.code, name: c.name, hex: c.hex })}
                className={`w-full flex items-center gap-2 px-2 h-9 rounded-lg border text-[13px] text-left ${pin.pick?.kind === "color" && pin.pick.code === c.code ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                <span className="w-5 h-5 rounded border border-slate-300 shrink-0" style={{ background: c.hex ?? "#ccc" }} /><span className="font-mono text-slate-500">{c.code}</span><span className="truncate">{c.name}</span>
              </button>
            ))}
            {colorList.length === 0 && <p className="text-[12px] text-amber-700">ยังไม่มีรหัสสีในรายการ — ให้ผู้ดูแลเพิ่มที่ “ตัวเลือก” → สีด้าย</p>}
          </div>
        </div>
      )}
      {src === "logo" && (
        <div className="space-y-2.5">
          {methods.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[12px] text-slate-500 min-w-0">วิธีทำโลโก้
                <SearchableSelect value={logo?.method ?? ""} disabled={readOnly} placeholder="— เลือกวิธี —" className="mt-1 w-full"
                  options={methods.map((m) => ({ value: m.code, label: m.name, sub: m.name_en ?? undefined }))} onChange={pickMethod} />
              </label>
              <label className="block text-[12px] text-slate-500 min-w-0">แบบ
                <SearchableSelect value={logo?.option ?? ""} disabled={readOnly || !method || options.length === 0} className="mt-1 w-full"
                  placeholder={!method ? "เลือกวิธีก่อน" : options.length ? "— เลือกแบบ —" : "วิธีนี้ไม่มีแบบย่อย"}
                  options={[{ value: "", label: "— ไม่ระบุ —" }, ...options.map((o) => ({ value: o.code, label: o.name, sub: o.name_en || undefined }))]}
                  onChange={(v) => setLogo({ option: v || undefined })} />
              </label>
            </div>
          ) : <p className="text-[12px] text-slate-400">ยังไม่มีรายการวิธีทำโลโก้ — ผู้ดูแลเพิ่มที่ “ตัวเลือก” → วิธีทำโลโก้</p>}
          {methodWarn && <p className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[12px] text-amber-800 flex items-start gap-1.5"><Icon value="i:alert-triangle" className="mt-0.5 shrink-0" />{methodWarn}</p>}
          {method && logoNeedsMaterial(method) && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-1.5">
              {logo?.material?.image_key
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={img(logo.material.image_key, 160)} alt="" className="w-10 h-10 rounded object-cover bg-slate-50 shrink-0" />
                : <span className="w-10 h-10 rounded bg-slate-100 shrink-0" />}
              <span className="min-w-0 flex-1 text-[12.5px]">
                <span className="block text-[11px] text-slate-500">{method.config?.no_artwork === true ? "ตัวโลโก้ (SKU)" : "วัสดุของโลโก้"}</span>
                <span className="block truncate text-slate-800">{logo?.material ? `${logo.material.code ? `${logo.material.code} · ` : ""}${logo.material.name}` : "ยังไม่ได้เลือก"}</span>
              </span>
              {!readOnly && <button type="button" onClick={() => setMat("logo")} className="h-8 px-2.5 text-[12px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 shrink-0">{logo?.material ? "เปลี่ยน" : "เลือก"}</button>}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 text-[12px] text-slate-500 mb-1">ขนาดโลโก้ (ซม.){sizeHint && <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1"><Icon value="i:sparkles" />{sizeHint}</span>}</div>
            <div className="flex items-center gap-1.5">
              <NumBox value={pin.dim?.w} placeholder="กว้าง" disabled={readOnly} onChange={(v) => setDimPart("w", v)} />
              <span className="text-slate-400">×</span>
              <NumBox value={pin.dim?.h} placeholder="สูง" disabled={readOnly} onChange={(v) => setDimPart("h", v)} />
              {ratio && !readOnly && (
                <button type="button" onClick={() => setLock((x) => !x)} aria-pressed={lock} title={lock ? "ล็อกสัดส่วนตามรูปโลโก้อยู่ — ใส่กว้าง สูงคิดให้เอง (กดเพื่อปลด)" : "กดเพื่อล็อกสัดส่วนตามรูปโลโก้"}
                  className={`h-9 w-9 rounded-lg border inline-flex items-center justify-center ${lock ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}><Icon value={lock ? "i:lock" : "i:lock-open"} /></button>
              )}
              {pin.dim && !readOnly && <button type="button" onClick={() => { setSizeHint(""); onChange({ ...pin, dim: null }); }} className="text-[12px] text-slate-400 hover:text-rose-600 hover:underline ml-1">ล้าง</button>}
            </div>
            {!pin.dim && !readOnly && <p className="text-[11px] text-slate-400 mt-1">เลือกโลโก้จาก SKU ที่มีขนาดในชื่อ หรือโลโก้ที่เคยใส่ขนาดไว้ ระบบเติมให้เอง</p>}
          </div>
          <div>
            <div className="text-[12px] text-slate-500 mb-1">{method?.code === "embroid" ? "สีด้ายปัก" : "สีโลโก้"} <span className="text-slate-400">(แยกตามชุดสีได้)</span></div>
            <div className="flex flex-wrap gap-1">
              {logoColorsOf(method).map((c) => (
                <button key={c} type="button" disabled={readOnly} aria-pressed={logo?.color === c} onClick={() => setLogo({ color: logo?.color === c ? undefined : c })}
                  className={`h-7 px-2.5 rounded-full border text-[12px] ${logo?.color === c ? "bg-violet-50 border-violet-300 text-violet-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{c}</button>
              ))}
            </div>
            {!readOnly && <input value={logo?.color && !logoColorsOf(method).includes(logo.color) ? logo.color : ""} onChange={(e) => setLogo({ color: e.target.value.slice(0, 40) || undefined })}
              placeholder="หรือพิมพ์สีเอง เช่น Pantone 871C" className="mt-1.5 w-full h-8 px-2 border border-slate-200 rounded-lg text-[12.5px] text-slate-800" />}
          </div>
          {!readOnly && method?.config?.no_artwork !== true && (
            <div className="flex flex-wrap gap-2">
              <label className={`${btn} cursor-pointer`}><Icon value="i:upload" />{uploading ? "กำลังอัปโหลด…" : logo?.image_key ? "เปลี่ยนไฟล์โลโก้" : "อัปโหลดไฟล์โลโก้"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadLogo(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <button type="button" onClick={() => setAssetOpen(true)} className={btn}><Icon value="i:photo" />เลือกจากคลังรูป</button>
            </div>
          )}
        </div>
      )}

      <label className="block text-[12px] text-slate-500">โน้ตของจุดนี้ (ขึ้นในใบสรุป + prompt)
        <input value={pin.note} disabled={readOnly} onChange={(e) => onChange({ ...pin, note: e.target.value })} placeholder="เช่น อยากได้แบบนี้"
          className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm text-slate-800 disabled:bg-slate-50" />
      </label>

      {mat === "pick" && (
        <MaterialPickModal open onClose={() => setMat(null)} title={`เลือก${cat.name}`} tags={categoryTags(cat)} chips={categoryChips(cat)} defaultTab={defaultMaterialTab(cat)}
          onPick={(m) => { fromMaterial(m); setMat(null); }}
          footerNote={categoryTags(cat).includes(HW_PARENT) && canTag ? (
            <p className="text-[12px] text-slate-500 flex flex-wrap items-center gap-2">อะไหล่ยังติดแท็กไม่ครบ?
              <button type="button" onClick={() => setHwOpen(true)} className="h-7 px-2.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 inline-flex items-center gap-1"><Icon value="i:tags" />ติดแท็กอะไหล่จากชื่อ SKU</button>
            </p>
          ) : null} />
      )}
      {mat === "logo" && method && (
        <MaterialPickModal open onClose={() => setMat(null)} title={method.config?.no_artwork === true ? `เลือกตัวโลโก้ (${method.name})` : `เลือกวัสดุของโลโก้ (${method.name})`}
          tags={materialTagsOf(method)} chips={materialChipsOf(method)} noBoard={method.config?.material_board === false}
          defaultTab={materialTagsOf(method).length || materialChipsOf(method).length ? "list" : "search"}
          onPick={(m) => { void setLogoMaterial(logoMaterialOf(m)); setMat(null); }} />
      )}
      {hwOpen && <HwTagSuggestModal open onClose={() => setHwOpen(false)} />}
      <AssetPicker open={assetOpen} onClose={() => setAssetOpen(false)} typeFilter="image" title="เลือกโลโก้จากคลังรูป" defaultSource="artwork" defaultSearch="logo"
        onSelect={(a) => { const x = a[0]; if (x) void setLogoImage(x.r2_key, x.title || x.file_name, x.id); setAssetOpen(false); }} />
    </div>
  );
}
