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
 */
import { useMemo, useState } from "react";
import nextDynamic from "next/dynamic";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { usePermission } from "@/components/auth";
import { uploadImagesWithDupCheck } from "@/components/duplicate-upload";
import type { SwatchSpotPick } from "@/components/sku-swatch-browser";
import {
  bodyPickOf, categoryChips, categoryOf, categoryTags, defaultMaterialTab, logoMethods, logoNeedsMaterial, logoOptions, pickInfo, pickThumbSvg, skuIdOf, sourceOf, usesHwColor,
  type Choice, type LogoMaterial, type Pick, type Pin, type Spec,
} from "@/lib/design-library";
import { HW_PARENT } from "@/lib/design-library-hwtags";
import { MaterialPickModal, type MaterialPicked } from "./material-modal";
import { img } from "./shared";

const AssetPicker = nextDynamic(() => import("@/components/asset-picker").then((m) => m.AssetPicker), { ssr: false });
const HwTagSuggestModal = nextDynamic(() => import("./hw-tag-suggest").then((m) => m.HwTagSuggestModal), { ssr: false });
type LogoPick = Extract<Pick, { kind: "logo" }>;
/** วัสดุของโลโก้ (เช่น โลโก้หนัง) กรองตามแท็กนี้ก่อน — ตั้งที่วิธีทำโลโก้ config.material_tags */
const materialTagsOf = (m: Choice | undefined): string[] => {
  const v = m?.config?.material_tags;
  const list = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/[,\n]/) : [];
  const out = list.map((s) => s.trim()).filter(Boolean);
  return out.length ? out : ["หนัง", "PU"];
};

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
      if (key) setLogo({ image_key: key, name: file.name.replace(/\.[a-z0-9]+$/i, ""), asset_id: null });
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
            <div>
              <div className="text-[12px] text-slate-500 mb-1">วิธีทำโลโก้</div>
              <div className="flex flex-wrap gap-1.5">
                {methods.map((m) => (
                  <button key={m.id} type="button" disabled={readOnly} aria-pressed={logo?.method === m.code}
                    onClick={() => setLogo({ method: m.code, option: undefined, material: logoNeedsMaterial(m) ? logo?.material ?? null : null })}
                    className={`h-8 px-3 rounded-full border text-[12.5px] ${logo?.method === m.code ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{m.name}</button>
                ))}
              </div>
            </div>
          ) : <p className="text-[12px] text-slate-400">ยังไม่มีรายการวิธีทำโลโก้ — ผู้ดูแลเพิ่มที่ “ตัวเลือก” → วิธีทำโลโก้</p>}
          {method && options.length > 0 && (
            <div>
              <div className="text-[12px] text-slate-500 mb-1">แบบ ({method.name})</div>
              <div className="flex flex-wrap gap-1.5">
                {options.map((o) => (
                  <button key={o.code} type="button" disabled={readOnly} aria-pressed={logo?.option === o.code} onClick={() => setLogo({ option: logo?.option === o.code ? undefined : o.code })}
                    className={`h-7 px-2.5 rounded-full border text-[12px] ${logo?.option === o.code ? "bg-violet-50 border-violet-300 text-violet-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{o.name}</button>
                ))}
              </div>
            </div>
          )}
          {methodWarn && <p className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[12px] text-amber-800 flex items-start gap-1.5"><Icon value="i:alert-triangle" className="mt-0.5 shrink-0" />{methodWarn}</p>}
          {method && logoNeedsMaterial(method) && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-1.5">
              {logo?.material?.image_key
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={img(logo.material.image_key, 160)} alt="" className="w-10 h-10 rounded object-cover bg-slate-50 shrink-0" />
                : <span className="w-10 h-10 rounded bg-slate-100 shrink-0" />}
              <span className="min-w-0 flex-1 text-[12.5px]">
                <span className="block text-[11px] text-slate-500">วัสดุของโลโก้</span>
                <span className="block truncate text-slate-800">{logo?.material ? `${logo.material.code ? `${logo.material.code} · ` : ""}${logo.material.name}` : "ยังไม่ได้เลือก"}</span>
              </span>
              {!readOnly && <button type="button" onClick={() => setMat("logo")} className="h-8 px-2.5 text-[12px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 shrink-0">{logo?.material ? "เปลี่ยน" : "เลือกวัสดุ"}</button>}
            </div>
          )}
          {!readOnly && (
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
        <MaterialPickModal open onClose={() => setMat(null)} title={`เลือกวัสดุของโลโก้ (${method.name})`} tags={materialTagsOf(method)} defaultTab="list"
          onPick={(m) => { setLogo({ material: logoMaterialOf(m) }); setMat(null); }} />
      )}
      {hwOpen && <HwTagSuggestModal open onClose={() => setHwOpen(false)} />}
      <AssetPicker open={assetOpen} onClose={() => setAssetOpen(false)} typeFilter="image" title="เลือกโลโก้จากคลังรูป" defaultSource="artwork" defaultSearch="logo"
        onSelect={(a) => { const x = a[0]; if (x) setLogo({ image_key: x.r2_key, name: x.title || x.file_name, asset_id: x.id }); setAssetOpen(false); }} />
    </div>
  );
}
