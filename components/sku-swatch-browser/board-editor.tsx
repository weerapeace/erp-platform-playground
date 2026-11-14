"use client";

/**
 * ตัวแก้แผงผ้า (ใช้ร่วม 2 ที่: ป๊อป "เพิ่มแผ่น Swatch" + โหมดตั้งค่าของแผ่นที่มีอยู่)
 *   - หลายรูปต่อแผ่น: เพิ่ม (ลากมาวางที่ช่อง "+ เพิ่มรูป"/บนรูป · Ctrl+V · เลือกไฟล์ทีละหลายรูป) · ✂️ ครอป + หมุน (ImageFreeCropModal) · เลื่อนลำดับ · ตั้งเป็นปก (= รูปแรก) · ลบ
 *   - ซูมรูป: Ctrl + หมุนลูกกลิ้ง / ปุ่ม − % + (ของกลาง ZoomBox)
 *   - ชิ้นบนรูป (รอบ 2 · 2026-11-14 หลังเจ้าของลองรูปจริง):
 *       🎯 คลิกที่สี = ระบบไล่หาพื้นที่สีเดียวกันแล้วตีกรอบพอดีชิ้น + สีเฉลี่ยทั้งชิ้น (ทำในเครื่อง ฟรี · ปรับ "ความไวสี" ได้)
 *       ⬚ ลากกรอบเอง (ลากได้ทั้ง 2 โหมด) · แบ่งกรอบเท่า ๆ กัน · 🎯 ตีกรอบใหม่จากสี (ชิ้นที่เลือก)
 *       ✨ AI อ่านเลข + ชื่อสี = วาดกรอบพร้อมเลขลงรูปแล้วให้ AI อ่าน (ไม่แตะตำแหน่งกรอบ) · ให้ AI หาชิ้นเอง = ทดลอง
 *   - แต่ละชิ้น: รหัสภายใน (ระบบออกตอนบันทึก) · สี · ชื่อสี · เลขบนแผง · ผูก SKU (ไม่บังคับ) / สร้าง SKU จากชิ้นนี้
 * สถานะทั้งหมดอยู่ใน useBoardDraft — ผู้เรียกเป็นคนบันทึก (อัปรูปที่ค้าง + POST/PATCH /api/sku-swatches)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageRegions } from "@/components/image-regions";
import { ImageFreeCropModal, type FreeCropResult } from "@/components/image-crop-picker";
import { ZoomBox, ZoomControls } from "@/components/zoom-box";
import { ColorInput } from "@/components/color-picker";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { r2ImageUrl } from "@/lib/r2-image";
import { chipCode, overlapRatio, remapToCrop, rotateRect90, sortReadingOrder, splitRect, type PctRect } from "@/lib/sku-swatch";
import { fitAtPoint, imageSize, readPhotoChips, readPhotoLabels, sampleColors, tempId, type DraftChip, type DraftPhoto } from "./swatch-tools";

/** ราคาโดยประมาณต่อรูป (บาท) — ตรงกับ costHint ใน lib/paid-services ("ai.swatch_read") · วัดจริง 2026-11-14 ≈ ฿0.09 */
const AI_COST_HINT = "~฿0.1/รูป";
const TOL_DEFAULT = 38;

/** รหัสที่จะได้ (ชิ้นที่มีรหัสแล้ว = รหัสเดิม · ชิ้นใหม่ = เลขต่อจาก nextNo ตามลำดับ รูป → อ่านแบบหนังสือ) — ต้องตรงกับ assignCodes ใน API */
export function previewCodes(chips: DraftChip[], photos: DraftPhoto[], boardCode: string, nextNo: number): Map<string, string> {
  const m = new Map<string, string>();
  let no = nextNo;
  for (const p of photos) {
    const fresh = sortReadingOrder(chips.filter((c) => c.photo === p.key && !c.code));
    for (const c of fresh) m.set(c.id, chipCode(boardCode, no++));
  }
  for (const c of chips) if (c.code) m.set(c.id, c.code);
  return m;
}

export function photoFromApi(i: { id: string; image_key: string; image_w: number | null; image_h: number | null }): DraftPhoto {
  return { key: i.id || tempId("img"), id: i.id || null, image_key: i.image_key, src: r2ImageUrl(i.image_key, 2400) ?? "", file: null, w: i.image_w ?? 0, h: i.image_h ?? 0 };
}

const newChip = (photo: string, rect: PctRect, color: string | null, source: DraftChip["source"] = "manual"): DraftChip =>
  ({ id: tempId(), photo, ...rect, code: null, name: null, label: null, color_hex: color, source, sku_id: null, sku: null });

// ───────────────────────────── สถานะ ─────────────────────────────
export function useBoardDraft() {
  const toast = useToast();
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [chips, setChips] = useState<DraftChip[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reading, setReading] = useState<{ done: number; total: number; what: "label" | "find" } | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => { for (const u of urls.current) URL.revokeObjectURL(u); }, []);
  // ค่าล่าสุดของชิ้น (งานที่รอ AI หลายรูปต่อกัน ต้องต่อจากผลรูปก่อนหน้า ไม่ใช่ค่าตอนกดปุ่ม)
  const chipsRef = useRef<DraftChip[]>([]);
  chipsRef.current = chips;
  const setChipsNow = (next: DraftChip[]) => { chipsRef.current = next; setChips(next); };
  const blobUrl = (b: Blob) => { const u = URL.createObjectURL(b); urls.current.push(u); return u; };
  const touch = () => setDirty(true);

  const reset = useCallback((p: DraftPhoto[], c: DraftChip[]) => {
    setPhotos(p); setChips(c); setCur(p[0]?.key ?? null); setSelId(null); setDirty(false);
  }, []);

  const addFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) { if (files.length) toast.warning("ลากไฟล์รูปมาวางนะ (JPG / PNG / WebP)"); return; }
    const added: DraftPhoto[] = [];
    for (const f of imgs) {
      const src = blobUrl(f);
      const s = await imageSize(src);
      added.push({ key: tempId("img"), id: null, image_key: null, src, file: f, w: s.w, h: s.h });
    }
    setPhotos((p) => [...p, ...added]);
    setCur(added[0].key);
    touch();
    if (added.length > 1) toast.success(`เพิ่ม ${added.length} รูปแล้ว`);
  };
  const removePhoto = (key: string) => {
    const n = photos.filter((x) => x.key !== key);
    setPhotos(n);
    if (cur === key) setCur(n[0]?.key ?? null);
    setChipsNow(chipsRef.current.filter((x) => x.photo !== key));
    touch();
  };
  const movePhoto = (key: string, d: -1 | 1) => {
    setPhotos((p) => {
      const i = p.findIndex((x) => x.key === key), j = i + d;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n;
    });
    touch();
  };
  const makeCover = (key: string) => { setPhotos((p) => { const it = p.find((x) => x.key === key); return it ? [it, ...p.filter((x) => x.key !== key)] : p; }); touch(); };

  /** ครอป/หมุนแล้ว → รูปใหม่ (ค้างอัป) + เลื่อนกรอบชิ้นบนรูปนั้นตาม · คืนจำนวนชิ้นที่หลุดกรอบ */
  const applyCrop = (key: string, r: FreeCropResult): number => {
    const src = blobUrl(r.blob);
    setPhotos((p) => p.map((x) => (x.key === key ? { ...x, src, file: r.blob, image_key: null, w: r.w, h: r.h } : x)));
    const all = chipsRef.current;
    let turned = all.filter((c) => c.photo === key);
    for (let i = 0; i < r.rotation; i++) turned = turned.map((c) => rotateRect90(c, "cw"));
    const res = remapToCrop(turned, r.rect);
    setChipsNow([...all.filter((c) => c.photo !== key), ...res.kept]);
    if (selId && res.dropped.some((d) => d.id === selId)) setSelId(null);
    touch();
    return res.dropped.length;
  };

  const photoOf = (key: string | null) => photos.find((p) => p.key === key) ?? null;
  /** ลากกรอบเอง */
  const addChip = async (rect: PctRect) => {
    const p = photoOf(cur);
    if (!p) return;
    const c = newChip(p.key, rect, null);
    setChipsNow([...chipsRef.current, c]);
    setSelId(c.id); touch();
    const [hex] = await sampleColors(p.src, [rect]);
    if (hex) setChips((all) => all.map((x) => (x.id === c.id && !x.color_hex ? { ...x, color_hex: hex } : x)));
  };
  /** 🎯 คลิกที่สี → กรอบพอดีชิ้น · targetId = ตีกรอบใหม่ให้ชิ้นเดิม (เก็บรหัส/ชื่อ/SKU ไว้) · null = ชิ้นใหม่ */
  const fitChip = async (photoKey: string, pt: { x: number; y: number }, tol: number, targetId: string | null): Promise<boolean> => {
    const p = photoOf(photoKey);
    if (!p) return false;
    let res;
    try { res = await fitAtPoint(p.src, pt, tol); }
    catch { toast.error("อ่านสีจากรูปไม่ได้ — ลองลากกรอบเองแทน"); return false; }
    if (!res.ok) {
      toast.warning(res.reason === "too_big" ? "ตรงนี้กว้างเกินไป (น่าจะเป็นพื้นหลัง/การ์ด) — ลดความไวสี หรือลากกรอบเอง"
        : res.reason === "too_small" ? "ชิ้นเล็กเกินไป — ซูมเข้าแล้วคลิกกลางชิ้น หรือเพิ่มความไวสี" : "คลิกในรูปนะ");
      return false;
    }
    if (targetId) {
      patchChip(targetId, { ...res.rect, color_hex: res.hex, unsure: false });
      setSelId(targetId);
      return true;
    }
    // ชิ้นเดิมขนาดใกล้กัน + ทับกันเกือบหมด = คลิกชิ้นเดิมซ้ำ (เทียบทั้งสองทาง กันกรอบใหญ่ครอบกรอบเล็กแล้วนับเป็นซ้ำ)
    const dup = chipsRef.current.find((c) => c.photo === p.key && overlapRatio(c, res.rect) > 0.7 && Math.min(c.w * c.h, res.rect.w * res.rect.h) / Math.max(c.w * c.h, res.rect.w * res.rect.h) > 0.6);
    if (dup) { setSelId(dup.id); toast.info("ชิ้นนี้มีกรอบแล้ว (เลือกให้)"); return false; }
    const c = newChip(p.key, res.rect, res.hex);
    setChipsNow([...chipsRef.current, c]);
    setSelId(c.id); touch();
    return true;
  };
  const patchChip = (id: string, patch: Partial<DraftChip>) => { setChipsNow(chipsRef.current.map((x) => (x.id === id ? { ...x, ...patch } : x))); touch(); };
  const removeChip = (id: string) => { setChipsNow(chipsRef.current.filter((x) => x.id !== id)); setSelId((s) => (s === id ? null : s)); touch(); };
  /** แบ่งกรอบเป็น cols × rows ชิ้น (ชิ้นเดิมหายไป ถ้ามีรหัสแล้ว รหัสนั้นจะไม่ถูกใช้ซ้ำ) */
  const splitChip = async (id: string, cols: number, rows: number) => {
    const ch = chipsRef.current.find((x) => x.id === id); const p = ch ? photoOf(ch.photo) : null;
    if (!ch || !p) return;
    const parts = splitRect(ch, cols, rows);
    const colors = await sampleColors(p.src, parts);
    const fresh = parts.map((r, i) => newChip(p.key, r, colors[i]));
    setChipsNow([...chipsRef.current.filter((x) => x.id !== id), ...fresh]);
    setSelId(fresh[0]?.id ?? null); touch();
  };
  /** ✨ AI อ่านเลข + ชื่อสี ให้ชิ้นที่มีกรอบแล้ว — เติมเฉพาะช่องที่ยังว่าง (ที่พิมพ์เองไม่ทับ) · ตำแหน่งกรอบไม่เปลี่ยน */
  const labelPhotos = async (keys: string[]) => {
    const list = keys.map(photoOf).filter((p): p is DraftPhoto => !!p && chipsRef.current.some((c) => c.photo === p.key));
    if (!list.length) { toast.warning("ตีกรอบชิ้นก่อน (คลิกที่สีบนรูป) แล้วค่อยให้ AI อ่านเลข/ชื่อสี"); return; }
    let filled = 0, chipsRead = 0;
    setReading({ done: 0, total: list.length, what: "label" });
    try {
      for (const [i, p] of list.entries()) {
        const got = await readPhotoLabels(p, chipsRef.current);
        chipsRead += got.size;
        setChipsNow(chipsRef.current.map((c) => {
          const g = got.get(c.id);
          if (!g) return c;
          const next = { ...c };
          if (!c.label && g.label) { next.label = g.label; filled++; }
          if (!c.name && g.name) { next.name = g.name; filled++; }
          return next;
        }));
        setReading({ done: i + 1, total: list.length, what: "label" });
      }
      touch();
      toast.success(chipsRead ? `AI อ่านแล้ว ${chipsRead} ชิ้น · เติม ${filled} ช่องที่ว่าง (ช่องที่พิมพ์เองไม่ทับ)` : "AI อ่านเลข/ชื่อสีไม่ออก — พิมพ์เองได้");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI อ่านไม่สำเร็จ");
    } finally { setReading(null); }
  };
  /** 🧪 ให้ AI หาชิ้นเอง (ทดลอง) — แทนชิ้นใหม่ (ยังไม่มีรหัส/ไม่ผูก SKU) ของรูปนั้น · ชิ้นที่บันทึกแล้วเก็บไว้ */
  const findPhotos = async (keys: string[]) => {
    const list = keys.map(photoOf).filter((p): p is DraftPhoto => !!p);
    if (!list.length) return;
    let found = 0, unsure = 0;
    setReading({ done: 0, total: list.length, what: "find" });
    try {
      for (const [i, p] of list.entries()) {
        const res = await readPhotoChips(p);
        const kept = chipsRef.current.filter((c) => c.photo !== p.key || c.code || c.sku_id);
        const keptHere = kept.filter((c) => c.photo === p.key);
        const add = res.chips.filter((n) => !keptHere.some((k) => overlapRatio(k, n) > 0.5));
        found += add.length; unsure += add.filter((a) => a.unsure).length;
        setChipsNow([...kept, ...add]);
        if (selId && !kept.some((c) => c.id === selId)) setSelId(null);
        setReading({ done: i + 1, total: list.length, what: "find" });
      }
      touch();
      if (found === 0) toast.warning("AI ไม่เจอชิ้นสีในรูป — ใช้ 🎯 คลิกที่สี แทนได้");
      else toast.success(`AI เจอ ${found} ชิ้น${unsure ? ` · ${unsure} ชิ้นให้ตรวจ (ขอบส้มเส้นประ)` : ""} — ตรวจตำแหน่งกรอบก่อนบันทึก`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI หาชิ้นไม่สำเร็จ");
    } finally { setReading(null); }
  };

  return { photos, chips, cur, setCur, selId, setSelId, dirty, setDirty, reading, reset, addFiles, removePhoto, movePhoto, makeCover, applyCrop, addChip, fitChip, patchChip, removeChip, splitChip, labelPhotos, findPhotos };
}
export type BoardDraft = ReturnType<typeof useBoardDraft>;

// ───────────────────────────── หน้าจอแก้ ─────────────────────────────
export function BoardEditor({ draft, codes, onCreateSku, onOverlay, layout = "modal" }: {
  draft: BoardDraft;
  /** รหัสที่จะได้ของทุกชิ้น (previewCodes) */
  codes: Map<string, string>;
  /** ปุ่ม "สร้าง SKU จากชิ้นนี้" (ไม่ส่ง = ไม่โชว์) */
  onCreateSku?: (chip: DraftChip) => void;
  /** มีป๊อปของกลาง (ครอป/ยืนยัน) เปิดอยู่ไหม — หน้าเต็มจอที่ครอบอยู่ต้องถอยไปข้างหลัง */
  onOverlay?: (open: boolean) => void;
  layout?: "modal" | "full";
}) {
  const toast = useToast();
  const { photos, chips, cur, setCur, selId, setSelId, reading } = draft;
  const [cropKey, setCropKey] = useState<string | null>(null);
  const [askFind, setAskFind] = useState<string[] | null>(null);
  const [tool, setTool] = useState<"click" | "draw">("click");
  const [tol, setTol] = useState(TOL_DEFAULT);
  const [armed, setArmed] = useState<string | null>(null);   // 🎯 ตีกรอบใหม่ให้ชิ้นนี้ — รอคลิกบนรูป
  const [zoom, setZoom] = useState(1);
  const [fitting, setFitting] = useState(false);
  const [over, setOver] = useState<"main" | "tile" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { onOverlay?.(!!cropKey || !!askFind); }, [cropKey, askFind, onOverlay]);

  const photo = photos.find((p) => p.key === cur) ?? photos[0] ?? null;
  useEffect(() => { setZoom(1); setArmed(null); }, [photo?.key]);
  // ชิ้นที่รอตีกรอบใหม่ถูกลบ/ย้ายไปรูปอื่น = ยกเลิก
  useEffect(() => { if (armed && !chips.some((c) => c.id === armed && c.photo === photo?.key)) setArmed(null); }, [armed, chips, photo]);
  // Esc = ยกเลิก "ตีกรอบใหม่จากสี" (จับก่อนหน้าที่ครอบอยู่ ไม่ให้ Esc ปิดทั้งหน้า)
  useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); setArmed(null); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [armed]);

  // วางรูป Ctrl+V = เพิ่มรูป (เฉพาะตอนไม่มีป๊อปอื่นเปิด)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (cropKey || askFind) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); void draft.addFiles(files); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [draft, cropKey, askFind]);

  const here = useMemo(() => chips.filter((c) => c.photo === photo?.key), [chips, photo]);
  const selected = chips.find((c) => c.id === selId) ?? null;
  const cropPhoto = photos.find((p) => p.key === cropKey) ?? null;
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const dropFiles = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setOver(null); void draft.addFiles(Array.from(e.dataTransfer.files)); };

  const onPoint = async (pt: { x: number; y: number }, region: DraftChip | null) => {
    if (!photo || fitting) return;
    if (armed) {
      setFitting(true);
      const ok = await draft.fitChip(photo.key, pt, tol, armed);
      setFitting(false);
      if (ok) setArmed(null);
      return;
    }
    if (region) return;   // คลิกในกรอบที่มีอยู่ = เลือกกรอบนั้น (ImageRegions เลือกให้แล้ว)
    setFitting(true);
    await draft.fitChip(photo.key, pt, tol, null);
    setFitting(false);
  };
  const startFind = (keys: string[]) => {
    const hasNew = chips.some((c) => keys.includes(c.photo) && !c.code && !c.sku_id);
    if (hasNew) setAskFind(keys); else void draft.findPhotos(keys);
  };

  const strip = (
    <div className="flex items-start gap-2 overflow-x-auto pb-1"
      onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setOver("tile"); } }} onDragLeave={() => setOver(null)} onDrop={dropFiles}>
      {photos.map((p, i) => {
        const n = chips.filter((c) => c.photo === p.key).length;
        return (
          <div key={p.key} className="shrink-0 w-[104px]">
            <button type="button" onClick={() => setCur(p.key)}
              className={`relative block w-[104px] h-[68px] rounded-lg overflow-hidden border-2 bg-slate-100 ${p.key === photo?.key ? "border-indigo-500" : "border-transparent hover:border-slate-300"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt="" className="w-full h-full object-cover" />
              {i === 0 && <span className="absolute left-1 top-1 text-[10px] px-1.5 rounded bg-indigo-600 text-white">ปก</span>}
              {p.file && <span className="absolute right-1 top-1 text-[10px] px-1 rounded bg-amber-500 text-white" title="ยังไม่อัปโหลด — อัปตอนกดบันทึก">ใหม่</span>}
              <span className="absolute right-1 bottom-1 text-[10px] px-1 rounded bg-slate-900/70 text-white tabular-nums">{n} ชิ้น</span>
            </button>
            <div className="mt-1 flex items-center gap-0.5">
              <button type="button" onClick={() => draft.movePhoto(p.key, -1)} disabled={i === 0} className="w-6 h-6 text-[12px] rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30" title="เลื่อนไปทางซ้าย">‹</button>
              <button type="button" onClick={() => draft.movePhoto(p.key, 1)} disabled={i === photos.length - 1} className="w-6 h-6 text-[12px] rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30" title="เลื่อนไปทางขวา">›</button>
              <button type="button" onClick={() => setCropKey(p.key)} className="w-6 h-6 text-[12px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50" title="ครอป / หมุนรูปนี้">✂</button>
              {i > 0 && <button type="button" onClick={() => draft.makeCover(p.key)} className="h-6 px-1 text-[10px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50" title="ตั้งเป็นรูปปก (ย้ายไปไว้แรกสุด)">ปก</button>}
              <button type="button" onClick={() => draft.removePhoto(p.key)} className="w-6 h-6 text-[12px] rounded border border-rose-200 text-rose-600 hover:bg-rose-50 ml-auto" title={n ? `ลบรูปนี้ (ชิ้นบนรูปนี้ ${n} ชิ้นจะหายด้วย)` : "ลบรูปนี้"}>✕</button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => fileRef.current?.click()}
        className={`shrink-0 w-[104px] h-[68px] rounded-lg border-2 border-dashed text-[11.5px] leading-tight transition ${over === "tile" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600"}`}>
        {over === "tile" ? "⬇ วางรูปตรงนี้" : <>+ เพิ่มรูป<br /><span className="text-[10.5px] text-slate-400">หรือลากรูปมาวาง</span></>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void draft.addFiles(f); }} />
    </div>
  );

  const toolbar = photo && (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[12.5px]">
        <button type="button" onClick={() => setTool("click")} aria-pressed={tool === "click"} title="คลิกที่ชิ้นสี = ระบบหาขอบสีเดียวกันแล้วตีกรอบให้"
          className={`h-8 px-2.5 ${tool === "click" ? "bg-indigo-50 text-indigo-700 font-medium" : "bg-white text-slate-600 hover:bg-slate-50"}`}>🎯 คลิกที่สี</button>
        <button type="button" onClick={() => setTool("draw")} aria-pressed={tool === "draw"} title="ลากบนรูปเพื่อตีกรอบเอง (คลิกที่ว่าง = ยกเลิกการเลือก)"
          className={`h-8 px-2.5 border-l border-slate-200 ${tool === "draw" ? "bg-indigo-50 text-indigo-700 font-medium" : "bg-white text-slate-600 hover:bg-slate-50"}`}>⬚ ลากกรอบเอง</button>
      </div>
      {(tool === "click" || armed) && (
        <label className="flex items-center gap-1.5 text-[11.5px] text-slate-500" title="ยิ่งมาก = กินพื้นที่สีใกล้เคียงกว้างขึ้น (ชิ้นติดกันสีใกล้กันให้ลดลง)">
          ความไวสี
          <input type="range" min={10} max={90} step={2} value={tol} onChange={(e) => setTol(Number(e.target.value))} className="w-24 accent-indigo-600" />
          <span className="w-6 tabular-nums text-slate-400">{tol}</span>
        </label>
      )}
      {fitting && <span className="text-[11.5px] text-indigo-600">กำลังหาขอบชิ้น…</span>}
      <ZoomControls zoom={zoom} onZoom={setZoom} className="ml-auto" />
    </div>
  );

  const aiBar = photo && (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2">
      <button type="button" onClick={() => void draft.labelPhotos([photo.key])} disabled={!!reading}
        title={here.length ? "AI เห็นรูปพร้อมเลขกรอบ แล้วตอบว่ากรอบไหนพิมพ์เลขอะไร สีชื่ออะไร" : "ตีกรอบชิ้นก่อน (คลิกที่สีบนรูป)"}
        className="h-8 px-3 text-[13px] font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
        {reading?.what === "label" ? `กำลังอ่าน… ${reading.done}/${reading.total}` : "✨ AI อ่านเลข + ชื่อสี"}
      </button>
      {photos.length > 1 && !reading && (
        <button type="button" onClick={() => void draft.labelPhotos(photos.map((p) => p.key))} className="h-8 px-3 text-[12px] rounded-lg border border-violet-300 text-violet-700 bg-white hover:bg-violet-50">ทุกรูป ({photos.length})</button>
      )}
      <span className="text-[11.5px] text-violet-900/80">{here.length ? `เติมเลขบนแผง + ชื่อสี ให้ ${here.length} ชิ้นที่มีกรอบ (ช่องที่พิมพ์เองไม่ทับ) · ${AI_COST_HINT}` : "ตีกรอบชิ้นก่อน (🎯 คลิกที่สีบนรูป) แล้วค่อยให้ AI อ่านเลข/ชื่อสี"}</span>
      <button type="button" onClick={() => startFind([photo.key])} disabled={!!reading} className="ml-auto text-[11.5px] text-violet-700 hover:underline disabled:opacity-50" title="ให้ AI หาตำแหน่งชิ้นเอง — ตำแหน่งได้แค่ประมาณ ตรวจก่อนบันทึก">
        {reading?.what === "find" ? `AI กำลังหาชิ้น… ${reading.done}/${reading.total}` : "🧪 ให้ AI หาชิ้นเอง (ทดลอง)"}
      </button>
    </div>
  );

  const main = !photo ? (
    <div onDragOver={(e) => { e.preventDefault(); setOver("main"); }} onDragLeave={() => setOver(null)} onDrop={dropFiles}
      onClick={() => fileRef.current?.click()}
      className={`rounded-xl border-2 border-dashed cursor-pointer flex items-center justify-center min-h-[220px] ${over ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50 hover:border-indigo-300"}`}>
      <div className="text-center text-sm text-slate-500 p-6">
        <div className="text-3xl mb-1">🖼️</div>ลากรูปมาวาง · กด Ctrl+V · หรือคลิกเพื่อเลือกไฟล์ (เลือกได้หลายรูป)
        <div className="text-[11px] text-slate-400 mt-1">ถ่ายให้ตรง ไม่เอียง · ครอปให้เหลือเฉพาะแผงก่อนจะตีกรอบง่ายขึ้น</div>
      </div>
    </div>
  ) : (
    <div className={`relative rounded-xl bg-slate-100 ${layout === "modal" ? "h-[50vh] min-h-[280px]" : "flex-1 min-h-[320px]"} ${over === "main" ? "ring-2 ring-indigo-400" : ""}`}
      onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setOver("main"); } }} onDragLeave={() => setOver(null)} onDrop={dropFiles}>
      <ZoomBox zoom={zoom} onZoom={setZoom} aspect={(photo.w || 4) / (photo.h || 3)} className="absolute inset-0 rounded-xl">
        <ImageRegions<DraftChip> src={photo.src} mode="edit" className="w-full rounded-md shadow" regions={here} selectedId={selId}
          onSelect={setSelId} onChange={(id, rect) => draft.patchChip(id, rect)} onCreate={(rect) => void draft.addChip(rect)}
          onPointClick={tool === "click" || armed ? (pt, r) => void onPoint(pt, r) : undefined}
          editCursor={armed ? "crosshair" : tool === "click" ? "crosshair" : "cell"}
          regionLabel={(r) => codes.get(r.id)?.split("-").pop() ?? null}
          isMuted={(r) => !!r.unsure} />
      </ZoomBox>
      {armed && (
        <div className="absolute left-1/2 -translate-x-1/2 top-2 z-[8] px-3 py-1.5 rounded-full bg-indigo-600 text-white text-[12px] shadow-lg whitespace-nowrap">
          🎯 คลิกที่สีของชิ้น {codes.get(armed) ?? ""} บนรูป · Esc = ยกเลิก
        </div>
      )}
      {over === "main" && <div className="absolute inset-0 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-700 text-sm font-medium pointer-events-none">⬇ วางเพื่อเพิ่มรูป</div>}
    </div>
  );

  return (
    <div className={layout === "modal" ? "grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]" : "contents"}>
      <div className={layout === "modal" ? "min-w-0 space-y-2" : "flex-1 min-h-0 min-w-0 flex flex-col gap-2 bg-slate-100 p-3 sm:p-4 overflow-y-auto"}>
        {aiBar}
        {toolbar}
        {main}
        {strip}
        {photo && <p className="text-[11px] text-slate-400">Ctrl + หมุนลูกกลิ้ง = ซูม · {tool === "click" ? "คลิกที่ชิ้นสี = ตีกรอบให้ · ลากบนรูป = ตีกรอบเอง" : "ลากบนรูป = ตีกรอบใหม่"} · ลากกรอบ = ย้าย · ลากมุม = ปรับขนาด · กรอบส้มเส้นประ = ให้ตรวจ</p>}
      </div>
      <ChipPanel draft={draft} codes={codes} here={here} selected={selected} total={chips.length} onCreateSku={onCreateSku} layout={layout}
        armed={armed} onArm={(id) => { setArmed((a) => (a === id ? null : id)); if (id) toast.info("คลิกที่สีของชิ้นนี้บนรูป — ระบบจะตีกรอบใหม่ให้"); }} />

      {cropPhoto && (
        <ImageFreeCropModal open src={cropPhoto.src} onClose={() => setCropKey(null)}
          title="✂️ ครอป / หมุนรูปแผง"
          onDone={(r) => {
            const dropped = draft.applyCrop(cropPhoto.key, r);
            if (dropped) toast.warning(`ชิ้นที่อยู่นอกกรอบครอปถูกเอาออก ${dropped} ชิ้น`);
          }} />
      )}
      <ConfirmDialog open={!!askFind} onClose={() => setAskFind(null)}
        title="ให้ AI หาชิ้นเอง?" message="ชิ้นที่ยังไม่บันทึกและยังไม่ผูก SKU บนรูปนี้จะถูกแทนด้วยกรอบที่ AI หา (ชิ้นที่บันทึกแล้วหรือผูก SKU แล้วเก็บไว้) — ตำแหน่งจาก AI ได้แค่ประมาณ ตรวจก่อนบันทึก" confirmText="ให้ AI หา" cancelText="ไม่ใช่"
        onConfirm={() => { const k = askFind; setAskFind(null); if (k) void draft.findPhotos(k); }} />
    </div>
  );
}

// ───────────────────────────── แผงชิ้น (ขวา) ─────────────────────────────
function ChipPanel({ draft, codes, here, selected, total, onCreateSku, layout, armed, onArm }: {
  draft: BoardDraft; codes: Map<string, string>; here: DraftChip[]; selected: DraftChip | null; total: number;
  onCreateSku?: (chip: DraftChip) => void; layout: "modal" | "full"; armed: string | null; onArm: (id: string | null) => void;
}) {
  const [cols, setCols] = useState(6);
  const [rows, setRows] = useState(1);
  const list = useMemo(() => sortReadingOrder(here), [here]);
  const unsure = here.filter((c) => c.unsure).length;
  return (
    <aside className={layout === "modal" ? "min-w-0 rounded-xl border border-slate-200 bg-white overflow-hidden" : "w-full lg:w-[340px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white overflow-y-auto max-h-[45vh] lg:max-h-none"}>
      <div className="p-3 border-b border-slate-100">
        <div className="text-[12px] font-medium text-slate-600 mb-1.5">ชิ้นที่เลือก</div>
        {selected ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ColorInput value={selected.color_hex ?? "#cccccc"} onChange={(v) => draft.patchChip(selected.id, { color_hex: /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : selected.color_hex, unsure: false })} allowText={false} />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[13px] text-slate-800 truncate">{codes.get(selected.id) ?? "—"}</div>
                <div className="text-[10.5px] text-slate-400">{selected.code ? "รหัสภายใน (ล็อกแล้ว)" : "รหัสที่จะได้ตอนบันทึก"}{selected.source === "ai" ? " · จาก AI" : ""}</div>
              </div>
              <button type="button" onClick={() => onArm(armed === selected.id ? null : selected.id)}
                className={`h-7 px-2 text-[11px] rounded-lg border ${armed === selected.id ? "border-indigo-400 bg-indigo-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                title="คลิกที่สีของชิ้นนี้บนรูป แล้วระบบตีกรอบใหม่ให้พอดีชิ้น + ดูดสีใหม่ (รหัส/ชื่อ/SKU คงเดิม)">{armed === selected.id ? "ยกเลิก" : "🎯 ตีกรอบใหม่จากสี"}</button>
            </div>
            {selected.unsure && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">⚠ AI ไม่แน่ใจชิ้นนี้ — ตรวจขอบกรอบ/สี แล้วแก้ หรือลบทิ้ง</p>}
            <div className="grid grid-cols-[1fr_88px] gap-2">
              <input value={selected.name ?? ""} onChange={(e) => draft.patchChip(selected.id, { name: e.target.value || null })} placeholder="ชื่อสี เช่น กรมท่า"
                className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 min-w-0" />
              <input value={selected.label ?? ""} onChange={(e) => draft.patchChip(selected.id, { label: e.target.value || null })} placeholder="เลขบนแผง"
                className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 min-w-0" />
            </div>
            <div>
              <SkuPicker key={selected.id}
                value={selected.sku ? ({ id: selected.sku.id, code: selected.sku.code, name: selected.sku.name, image_url: selected.sku.image } as SkuPickerValue) : null}
                placeholder="ผูก SKU (ไม่บังคับ)"
                onChange={(v) => draft.patchChip(selected.id, v
                  ? { sku_id: v.id, sku: { id: v.id, code: v.code, name: v.name, image: v.image_url ?? (v.image_key ? r2ImageUrl(v.image_key) : null), image_key: v.image_key ?? null, uom: v.uom_name ?? null, color: v.color ?? null, qty_on_hand: null, is_active: true } }
                  : { sku_id: null, sku: null })} />
              {!selected.sku_id && onCreateSku && (
                <button type="button" onClick={() => onCreateSku(selected)} className="mt-1 text-[11.5px] text-indigo-600 hover:underline">+ สร้าง SKU ใหม่จากชิ้นนี้</button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
              <span className="text-[11px] text-slate-500">แบ่งกรอบเป็น</span>
              <input type="number" min={1} max={200} value={cols} onChange={(e) => setCols(Math.max(1, Number(e.target.value) || 1))} className="w-12 h-7 px-1 text-[12px] border border-slate-200 rounded" aria-label="จำนวนคอลัมน์" />
              <span className="text-[11px] text-slate-400">×</span>
              <input type="number" min={1} max={50} value={rows} onChange={(e) => setRows(Math.max(1, Number(e.target.value) || 1))} className="w-12 h-7 px-1 text-[12px] border border-slate-200 rounded" aria-label="จำนวนแถว" />
              <button type="button" onClick={() => void draft.splitChip(selected.id, cols, rows)} className="h-7 px-2 text-[11px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="ชิ้นเรียงกันเป็นแถว: ลากกรอบครอบทั้งแถว แล้วแบ่งเท่า ๆ กัน">แบ่ง {cols * rows} ชิ้น</button>
              <button type="button" onClick={() => draft.removeChip(selected.id)} className="h-7 px-2 text-[11px] rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 ml-auto">🗑 ลบชิ้น</button>
            </div>
          </div>
        ) : <p className="text-[12px] text-slate-400">ยังไม่ได้เลือกชิ้น — 🎯 คลิกที่ชิ้นสีบนรูปเพื่อตีกรอบ หรือกดกรอบที่มีอยู่</p>}
      </div>
      <div className="p-3">
        <div className="text-[12px] font-medium text-slate-600 mb-1.5">ชิ้นบนรูปนี้ ({here.length}){total !== here.length ? <span className="font-normal text-slate-400"> · ทั้งแผ่น {total}</span> : null}{unsure ? <span className="font-normal text-amber-600"> · ให้ตรวจ {unsure}</span> : null}</div>
        {list.length === 0 ? <p className="text-[12px] text-slate-400">ยังไม่มีชิ้น — 🎯 คลิกที่สีบนรูป หรือลากตีกรอบเอง</p> : (
          <ul className={`space-y-1 ${layout === "modal" ? "max-h-[38vh] overflow-y-auto pr-1" : ""}`}>
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => draft.setSelId(c.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left ${c.id === selected?.id ? "border-indigo-300 bg-indigo-50" : c.unsure ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  <span className="w-5 h-5 rounded shrink-0 ring-1 ring-black/10" style={{ background: c.color_hex ?? "#e2e8f0" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[11px] text-slate-700 truncate">{codes.get(c.id)}{c.label ? <span className="text-slate-400"> · {c.label}</span> : null}</span>
                    <span className="block text-[11px] text-slate-500 truncate">{c.sku ? `${c.sku.code} ${c.sku.name}` : c.name ?? "—"}</span>
                  </span>
                  {c.unsure && <span className="text-amber-600 text-[12px]" title="AI ไม่แน่ใจ">⚠</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
