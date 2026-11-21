"use client";

/**
 * กล่องรายละเอียดของหน้าลงสินค้าใหม่บนร้าน (ของกลาง · Shopee + Lazada ใช้ตัวเดียวกัน) — แบบ B ที่เจ้าของเลือก 2026-11-20
 * --------------------------------------------------------------------------
 * ปกติ = "หน้าตาบนร้าน" (ขึ้นบรรทัด/บรรทัดว่างตามจริง · ข้อความยาวตัดบรรทัดเอง ไม่ล้นขวา) + ปุ่ม "ดูทั้งหมด/ย่อ"
 * กด "แก้" = ช่องพิมพ์ที่สูงตามข้อความ (ตัดบรรทัดอัตโนมัติ · นับตัวอักษร) → "บันทึกลงร่าง <ร้าน>"
 * รูปในรายละเอียด (ร้านที่รับ เช่น Lazada): ต่อท้ายข้อความ · ลากเรียง/ตั้งลำดับ/เอาออก · เพิ่มจากคลังรูปสินค้า · "ไม่ใส่รูป" · "กลับไปใช้รูปอัตโนมัติ"
 *   <ListingDescriptionBox platformName="Lazada" text={…} html={pv.description.value} src={…} canEdit saving onSave={(t) => …}
 *     images={{ refs, custom, src, max, parentId, parentCode, onSave: (refs) => …, onReset: () => … }} />
 * ไม่ส่ง html = โชว์ข้อความตามบรรทัด (Shopee รายละเอียดเป็นข้อความล้วน) · note = ข้อความเพิ่มใต้กล่อง (เช่น สิทธิ์รูปในรายละเอียด Shopee)
 * ของกลางที่ใช้: sanitizeRichHtml · ListingImageGrid/ListingImagePicker/useSystemImages · HoverPreview (ผ่านตารางรูป) · Icon
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { ListingImageGrid, ListingImagePicker, listingImgSrc, useSystemImages } from "@/components/platform-catalog/listing-images";

export type DescImagesProps = {
  refs: string[]; custom: boolean; src: string; max: number; parentId: string; parentCode: string;
  onSave: (refs: string[]) => void;
  /** กลับไปใช้รูปอัตโนมัติ (ลบที่เลือกเองในร่าง) */
  onReset: () => void;
  /** ปุ่มเพิ่มเติมข้างหัวข้อ เช่น "ใช้รูปชุดเดียวกับ Lazada" (Shopee) */
  actions?: { label: string; onClick: () => void }[];
  /** ข้อความเตือนใต้ชุดรูป เช่น รูปไม่คม */
  warning?: string | null;
};

export function ListingDescriptionBox({ platformName, text, html, src, canEdit, saving, required, maxLen, onSave, note, images }: {
  platformName: string;
  /** ข้อความที่แก้ได้ (ขึ้นบรรทัดตามที่พิมพ์) */
  text: string;
  /** HTML ที่จะส่งร้าน (โชว์หน้าตาบนร้าน) · ไม่ส่ง = โชว์ text ตามบรรทัด */
  html?: string;
  src: string;
  canEdit: boolean; saving: boolean;
  required?: boolean;
  maxLen?: number;
  onSave: (text: string) => void;
  note?: ReactNode;
  images?: DescImagesProps;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(text);
  const [open, setOpen] = useState(false);
  const [imgs, setImgs] = useState<string[] | null>(null);
  const [picker, setPicker] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const sys = useSystemImages(images?.parentId ?? null);
  useEffect(() => { if (!editing) setVal(text); }, [text, editing]);
  useEffect(() => { setImgs(null); }, [images?.refs.join("|")]);   // eslint-disable-line react-hooks/exhaustive-deps
  // ช่องพิมพ์สูงตามข้อความ (ไม่ต้องเลื่อนในกล่องเล็ก ๆ)
  useLayoutEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight + 2, 900)}px`; }, [val, editing]);

  const curImgs = imgs ?? images?.refs ?? [];
  const imgDirty = !!images && !!imgs && imgs.join("|") !== images.refs.join("|");
  const empty = !text.trim();
  const long = text.length > 400 || text.split("\n").length > 8 || curImgs.length > 0;
  const over = maxLen != null && val.length > maxLen;

  return (
    <div className="space-y-2">
      {editing ? (
        <div className="space-y-1.5">
          <textarea ref={ta} value={val} onChange={(e) => setVal(e.target.value)} autoFocus placeholder="พิมพ์รายละเอียด — กด Enter ขึ้นบรรทัดใหม่ได้ตามต้องการ"
            className="block min-h-[10rem] w-full resize-y whitespace-pre-wrap rounded-lg border border-violet-300 px-3 py-2 text-sm leading-relaxed [overflow-wrap:anywhere] focus:outline-none focus:ring-1 focus:ring-violet-400" />
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" disabled={saving || over || (required && !val.trim())} onClick={() => { onSave(val); setEditing(false); }} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกลงร่าง {platformName}</button>
            <button type="button" onClick={() => { setEditing(false); setVal(text); }} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
            <span className={`ml-auto text-[11px] ${over ? "text-rose-600" : "text-slate-400"}`}>{val.length.toLocaleString()}{maxLen ? ` / ${maxLen.toLocaleString()}` : ""} ตัวอักษร</span>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">หน้าตาบน {platformName}</span>
            {canEdit && <button type="button" onClick={() => { setVal(text); setEditing(true); }} className="inline-flex items-center gap-1 text-xs text-violet-700 hover:underline"><Icon name="edit" />แก้</button>}
          </div>
          <div className={`relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 ${open || !long ? "" : "max-h-72"}`}>
            {empty ? <span className={`text-sm ${required ? "text-rose-600" : "text-slate-400"}`}>{required ? `ยังไม่มี (${platformName} ต้องมี)` : "ไม่มี (ไม่บังคับ)"}</span>
              : html != null
                ? <div className="tiptap-content text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere] [&_img]:max-w-full [&_li]:my-0 [&_p]:my-0 [&_p:empty]:h-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }} />
                : <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere]">{text}</div>}
            {curImgs.length > 0 && (
              <div className="mt-2 space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {curImgs.map((r, i) => <img key={`${r}-${i}`} src={listingImgSrc(r, 800)} alt="" loading="lazy" className="mx-auto block w-full max-w-md rounded" />)}
              </div>
            )}
            {long && !open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-50 to-transparent" />}
          </div>
          {long && <button type="button" onClick={() => setOpen((x) => !x)} className="mt-1 inline-flex items-center gap-0.5 text-xs text-violet-700 hover:underline"><Icon name={open ? "chevron-up" : "chevron-down"} />{open ? "ย่อ" : "ดูทั้งหมด"}</button>}
        </div>
      )}
      <div className="text-[11px] text-slate-400">มาจาก: {src}{maxLen && !editing ? ` · ${text.length.toLocaleString()} / ${maxLen.toLocaleString()} ตัวอักษร` : ""}</div>
      {note && <div className="text-[11px] text-slate-500">{note}</div>}

      {images && (
        <div className="rounded-lg border border-slate-100 p-2">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-600"><Icon name="image" /> รูปในรายละเอียด ({curImgs.length}/{images.max}) — ต่อท้ายข้อความ</span>
            {canEdit && (
              <div className="flex flex-wrap gap-1.5">
                {imgDirty && <button type="button" disabled={saving} onClick={() => images.onSave(curImgs)} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกรูปในรายละเอียด</button>}
                {imgDirty && <button type="button" onClick={() => setImgs(null)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>}
                {!imgDirty && curImgs.length > 0 && <button type="button" disabled={saving} onClick={() => images.onSave([])} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ไม่ใส่รูป</button>}
                {!imgDirty && images.custom && <button type="button" disabled={saving} onClick={images.onReset} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">กลับไปใช้รูปอัตโนมัติ</button>}
                {!imgDirty && images.actions?.map((a) => <button key={a.label} type="button" disabled={saving} onClick={a.onClick} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">{a.label}</button>)}
              </div>
            )}
          </div>
          {curImgs.length > 0 || canEdit ? (
            <ListingImageGrid images={curImgs} onChange={(next) => setImgs(next)} canEdit={canEdit} max={images.max} platformName={`${platformName} (รูปในรายละเอียด)`} dragGroup="listing-desc-images"
              onOpen={() => {}} onAdd={() => { setPicker(true); sys.load(); }} canAdd={canEdit} note="ระบบฝากรูปกับร้านให้ตอนลง" />
          ) : <p className="text-xs text-slate-400">ไม่มีรูปในรายละเอียด</p>}
          <div className="mt-1 text-[11px] text-slate-400">มาจาก: {imgDirty ? "ที่เลือกตอนนี้ (ยังไม่บันทึก)" : images.src}</div>
          {images.warning && !imgDirty && <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700"><Icon name="warning" />{images.warning}</p>}
          <ListingImagePicker open={picker} onClose={() => setPicker(false)} mode="product" title={`เลือกรูปใส่รายละเอียด ${platformName}`}
            description={`เลือกได้อีก ${Math.max(0, images.max - curImgs.length)} รูป`} matchedParent={images.parentId} matchedCode={images.parentCode}
            sysImages={sys.images} isUsed={(ref) => curImgs.includes(ref)} full={curImgs.length >= images.max}
            onPick={(ref) => setImgs((xs) => [...(xs ?? images.refs), ref].slice(0, images.max))} storageKey="listing-desc-image-picker" />
        </div>
      )}
    </div>
  );
}
