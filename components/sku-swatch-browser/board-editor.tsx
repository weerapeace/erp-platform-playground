"use client";

/**
 * ตัวแก้แผงผ้า (ใช้ร่วม 2 ที่: ป๊อป "เพิ่มแผ่น Swatch" + โหมดตั้งค่าของแผ่นที่มีอยู่)
 *   - หลายรูปต่อแผ่น: เพิ่ม (ลากมาวางที่ช่อง "+ เพิ่มรูป"/บนรูป · Ctrl+V · เลือกไฟล์ทีละหลายรูป) · ✂️ ครอป + หมุน (ImageFreeCropModal) · เลื่อนลำดับ · ตั้งเป็นปก (= รูปแรก) · ลบ
 *   - ซูมรูป: Ctrl + หมุนลูกกลิ้ง / ปุ่ม − % + (ของกลาง ZoomBox)
 *   - ชิ้นบนรูป (รอบ 2 · 2026-11-14 หลังเจ้าของลองรูปจริง):
 *       🎯 คลิกที่สี = ระบบไล่หาพื้นที่สีเดียวกันแล้วตีกรอบพอดีชิ้น + สีเฉลี่ยทั้งชิ้น (ทำในเครื่อง ฟรี · ปรับ "ความไวสี" ได้)
 *       ⬚ ลากกรอบเอง (ลากได้ทั้ง 2 โหมด) · แบ่งกรอบเท่า ๆ กัน · 🎯 ตีกรอบใหม่จากสี (ชิ้นที่เลือก)
 *       ✨ AI อ่านเลขบนแผง = วาดกรอบพร้อมเลขลงรูปแล้วให้ AI อ่าน (ไม่แตะตำแหน่งกรอบ) · ให้ AI หาชิ้นเอง = ทดลอง
 *       🎨 ชื่อสี = สีที่ใกล้ที่สุดในทะเบียนสีกลาง จากสี่เหลี่ยมสี (ฟรี · ไม่ใช้ AI · เปลี่ยนสีแล้วชื่อตาม ถ้าไม่ได้พิมพ์เอง) — เจ้าของขอ 2026-11-14
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
import { chipCode, LABEL_POSITION_TH, LABEL_POSITIONS, overlapRatio, remapToCrop, rotateRect90, sortColumnOrder, sortReadingOrder, splitRect, type LabelPosition, type PctRect, type Pt } from "@/lib/sku-swatch";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { useUserPref } from "@/lib/use-user-pref";
import { fitAtPoint, imageSize, readPhotoChips, readPhotoLabels, sampleColors, tempId, useColorNamer, type DraftChip, type DraftPhoto } from "./swatch-tools";

/** ราคาโดยประมาณต่อรูป (บาท) — ตรงกับ costHint ใน lib/paid-services ("ai.swatch_read") · วัดจริง 2026-11-14 ≈ ฿0.09 */
const AI_COST_HINT = "~฿0.1/รูป";
const TOL_DEFAULT = 38;

/** รหัสที่จะได้ (ชิ้นที่มีรหัสแล้ว = รหัสเดิม · ชิ้นใหม่ = เลขต่อจาก nextNo ตามลำดับ รูป → ลำดับในรายการ) — ต้องตรงกับ assignCodes ใน API */
export function previewCodes(chips: DraftChip[], photos: DraftPhoto[], boardCode: string, nextNo: number): Map<string, string> {
  const m = new Map<string, string>();
  let no = nextNo;
  for (const p of photos) {
    const fresh = chips.filter((c) => c.photo === p.key && !c.code);
    for (const c of fresh) m.set(c.id, chipCode(boardCode, no++));
  }
  for (const c of chips) if (c.code) m.set(c.id, c.code);
  return m;
}

export function photoFromApi(i: { id: string; image_key: string; image_w: number | null; image_h: number | null }): DraftPhoto {
  return { key: i.id || tempId("img"), id: i.id || null, image_key: i.image_key, src: r2ImageUrl(i.image_key, 2400) ?? "", file: null, w: i.image_w ?? 0, h: i.image_h ?? 0 };
}

/** ชิ้นใหม่ — name = ชื่อสีจากสี่เหลี่ยมสี (ทะเบียนสีกลาง) ถ้ารู้แล้ว */
const newChip = (photo: string, rect: PctRect, color: string | null, name: string | null = null, source: DraftChip["source"] = "manual"): DraftChip =>
  ({ id: tempId(), photo, ...rect, code: null, name, nameAuto: !!name, label: null, color_hex: color, source, sku_id: null, sku: null });

// ───────────────────────────── สถานะ ─────────────────────────────
export function useBoardDraft() {
  const toast = useToast();
  // ชื่อสี = สีที่ใกล้ที่สุดในทะเบียนสีกลาง (จากสี่เหลี่ยมสีที่วัดจากพิกเซลจริง · ฟรี · ไม่ใช้ AI) — เจ้าของขอ 2026-11-14
  const nameOf = useColorNamer();
  /** สีของชิ้นเปลี่ยน → ชื่อเปลี่ยนตาม เฉพาะชื่อที่ระบบตั้ง (หรือยังว่าง) · ชื่อที่พิมพ์เองไม่ทับ */
  const withAutoName = (c: DraftChip, hex: string | null): Partial<DraftChip> => {
    if (!hex || (c.name && !c.nameAuto)) return {};
    const n = nameOf(hex);
    return n ? { name: n, nameAuto: true } : {};
  };
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
    if (hex) setChipsNow(chipsRef.current.map((x) => (x.id === c.id && !x.color_hex ? { ...x, color_hex: hex, ...withAutoName(x, hex) } : x)));
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
      const t = chipsRef.current.find((x) => x.id === targetId);
      patchChip(targetId, { ...res.rect, points: null, color_hex: res.hex, unsure: false, ...(t ? withAutoName(t, res.hex) : {}) });
      setSelId(targetId);
      return true;
    }
    // ชิ้นเดิมขนาดใกล้กัน + ทับกันเกือบหมด = คลิกชิ้นเดิมซ้ำ (เทียบทั้งสองทาง กันกรอบใหญ่ครอบกรอบเล็กแล้วนับเป็นซ้ำ)
    const dup = chipsRef.current.find((c) => c.photo === p.key && overlapRatio(c, res.rect) > 0.7 && Math.min(c.w * c.h, res.rect.w * res.rect.h) / Math.max(c.w * c.h, res.rect.w * res.rect.h) > 0.6);
    if (dup) { setSelId(dup.id); toast.info("ชิ้นนี้มีกรอบแล้ว (เลือกให้)"); return false; }
    const c = newChip(p.key, res.rect, res.hex, nameOf(res.hex));
    setChipsNow([...chipsRef.current, c]);
    setSelId(c.id); touch();
    return true;
  };
  const patchChip = (id: string, patch: Partial<DraftChip>) => { setChipsNow(chipsRef.current.map((x) => (x.id === id ? { ...x, ...patch } : x))); touch(); };
  /** เรียงชิ้นของรูปหนึ่งใหม่ (ลำดับ = เลขที่จะได้) — ชิ้นของรูปอื่นอยู่ที่เดิม */
  const setPhotoOrder = (photoKey: string, ordered: DraftChip[]) => {
    const all = chipsRef.current;
    let i = 0;
    setChipsNow(all.map((c) => (c.photo === photoKey ? ordered[i++] : c)));
    touch();
  };
  const reorderChips = (photoKey: string, from: number, to: number) => setPhotoOrder(photoKey, moveItem(chipsRef.current.filter((c) => c.photo === photoKey), from, to));
  const sortChips = (photoKey: string, how: "row" | "col") => {
    const mine = chipsRef.current.filter((c) => c.photo === photoKey);
    setPhotoOrder(photoKey, how === "row" ? sortReadingOrder(mine) : sortColumnOrder(mine));
  };
  const removeChip = (id: string) => { setChipsNow(chipsRef.current.filter((x) => x.id !== id)); setSelId((s) => (s === id ? null : s)); touch(); };
  /** แบ่งกรอบเป็น cols × rows ชิ้น (ชิ้นเดิมหายไป ถ้ามีรหัสแล้ว รหัสนั้นจะไม่ถูกใช้ซ้ำ) */
  const splitChip = async (id: string, cols: number, rows: number) => {
    const ch = chipsRef.current.find((x) => x.id === id); const p = ch ? photoOf(ch.photo) : null;
    if (!ch || !p) return;
    const parts = splitRect(ch, cols, rows);
    const colors = await sampleColors(p.src, parts);
    const fresh = parts.map((r, i) => newChip(p.key, r, colors[i], nameOf(colors[i])));
    setChipsNow([...chipsRef.current.filter((x) => x.id !== id), ...fresh]);
    setSelId(fresh[0]?.id ?? null); touch();
  };
  /** 🎨 ตั้งชื่อสีจากสี่เหลี่ยมสี (ทะเบียนสีกลาง) ให้ชิ้นบนรูปนี้ — all=false: เฉพาะชื่อว่าง/ชื่อที่ระบบตั้ง · all=true: ทับชื่อที่พิมพ์เองด้วย · คืนจำนวนที่เปลี่ยน (-1 = ทะเบียนยังไม่พร้อม) */
  const nameFromColors = (photoKey: string, all: boolean): number => {
    if (!nameOf("#808080")) return -1;
    let n = 0;
    setChipsNow(chipsRef.current.map((c) => {
      if (c.photo !== photoKey || !c.color_hex || (!all && c.name && !c.nameAuto)) return c;
      const name = nameOf(c.color_hex);
      if (!name || (name === c.name && c.nameAuto)) return c;
      n++;
      return { ...c, name, nameAuto: true };
    }));
    if (n) touch();
    return n;
  };
  /** สี่เหลี่ยมสีเปลี่ยน (เลือกสีเอง) → ชื่อตาม (ถ้าเป็นชื่อที่ระบบตั้ง) */
  const setChipColor = (id: string, hex: string) => {
    const c = chipsRef.current.find((x) => x.id === id);
    if (c) patchChip(id, { color_hex: hex, unsure: false, ...withAutoName(c, hex) });
  };
  /** ✨ AI อ่านเลขที่พิมพ์บนแผง ให้ชิ้นที่มีกรอบแล้ว — เติมเฉพาะช่องที่ยังว่าง (ที่พิมพ์เองไม่ทับ) · ตำแหน่งกรอบไม่เปลี่ยน · ชื่อสีไม่ใช้ AI แล้ว (ตั้งจากสี่เหลี่ยมสี แม่นกว่า) */
  const labelPhotos = async (keys: string[], pos: LabelPosition = "auto") => {
    const list = keys.map(photoOf).filter((p): p is DraftPhoto => !!p && chipsRef.current.some((c) => c.photo === p.key));
    if (!list.length) { toast.warning("ตีกรอบชิ้นก่อน (คลิกที่สีบนรูป) แล้วค่อยให้ AI อ่านเลขบนแผง"); return; }
    let filled = 0, chipsRead = 0;
    setReading({ done: 0, total: list.length, what: "label" });
    try {
      for (const [i, p] of list.entries()) {
        const got = await readPhotoLabels(p, chipsRef.current, pos);
        chipsRead += got.size;
        setChipsNow(chipsRef.current.map((c) => {
          const g = got.get(c.id);
          if (!g) return c;
          const next = { ...c };
          if (!c.label && g.label) { next.label = g.label; filled++; }
          return next;
        }));
        setReading({ done: i + 1, total: list.length, what: "label" });
      }
      touch();
      toast.success(chipsRead ? `AI อ่านแล้ว ${chipsRead} ชิ้น · เติมเลขบนแผง ${filled} ช่องที่ว่าง (ช่องที่พิมพ์เองไม่ทับ)` : "AI อ่านเลขบนแผงไม่ออก — พิมพ์เองได้");
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
        // ชื่อสีจาก AI ไม่แม่น (ดูด้วยตา) → ใช้ชื่อจากสี่เหลี่ยมสีแทนเมื่อทะเบียนพร้อม
        const add = res.chips.filter((n) => !keptHere.some((k) => overlapRatio(k, n) > 0.5))
          .map((n) => { const nm = nameOf(n.color_hex); return nm ? { ...n, name: nm, nameAuto: true } : n; });
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

  return { photos, chips, cur, setCur, selId, setSelId, dirty, setDirty, reading, reset, addFiles, removePhoto, movePhoto, makeCover, applyCrop, addChip, fitChip, patchChip, reorderChips, sortChips, removeChip, splitChip, labelPhotos, findPhotos, nameFromColors, setChipColor };
}
export type BoardDraft = ReturnType<typeof useBoardDraft>;


// ───────────────────────────── ขนาดหน้าจอแก้ (ลากปรับ · จำต่อคน) ─────────────────────────────
/** h = ความสูงพื้นที่รูปในป๊อป (px · null = ครึ่งจอ) · pw = ความกว้างแผงชิ้น (px) · hide = ซ่อนแผงชิ้น */
type EditorLayout = { h: number | null; pw: number; hide: boolean };
const LAYOUT_DEFAULT: EditorLayout = { h: null, pw: 320, hide: false };
const parseLayout = (v: unknown): EditorLayout | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const h = typeof o.h === "number" && o.h >= 200 && o.h <= 2000 ? Math.round(o.h) : null;
  const pw = typeof o.pw === "number" && o.pw >= 200 && o.pw <= 640 ? Math.round(o.pw) : 320;
  return { h, pw, hide: o.hide === true };
};

/** ลากเส้น/แถบ → ค่าใหม่ (ระหว่างลากเปลี่ยนเฉพาะหน้าจอ · ปล่อยเมาส์ค่อยบันทึก) */
function useDragSize(onMove: (delta: number) => void, onEnd: () => void, axis: "x" | "y") {
  const start = useRef<number | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => { e.preventDefault(); start.current = axis === "x" ? e.clientX : e.clientY; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => { if (start.current == null) return; onMove((axis === "x" ? e.clientX : e.clientY) - start.current); },
    onPointerUp: () => { if (start.current == null) return; start.current = null; onEnd(); },
    onPointerCancel: () => { start.current = null; },
  };
}

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
  const [askName, setAskName] = useState<string | null>(null);   // ถามก่อนทับชื่อสีทั้งรูป
  const [tool, setTool] = useState<"click" | "draw">("click");
  const [tol, setTol] = useState(TOL_DEFAULT);
  const [armed, setArmed] = useState<string | null>(null);   // 🎯 ตีกรอบใหม่ให้ชิ้นนี้ — รอคลิกบนรูป
  const [zoom, setZoom] = useState(1);
  const [fitting, setFitting] = useState(false);
  const [over, setOver] = useState<"main" | "tile" | null>(null);
  const [labelPos, setLabelPos] = useState<LabelPosition>("auto");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { onOverlay?.(!!cropKey || !!askFind || !!askName); }, [cropKey, askFind, askName, onOverlay]);

  // ── ขนาด: ลากแถบใต้รูป (สูง/เตี้ย · เฉพาะป๊อป) + เส้นกลาง (แผงชิ้นกว้าง/แคบ · ลากสุด = ซ่อน) — จำต่อคน ──
  const [saved, saveLayout] = useUserPref<EditorLayout>("swatch_editor_layout", LAYOUT_DEFAULT, parseLayout);
  const [live, setLive] = useState<EditorLayout | null>(null);   // ระหว่างลาก
  const lay = live ?? saved;
  const imgH = lay.h ?? (typeof window !== "undefined" ? Math.round(window.innerHeight * 0.5) : 420);
  const baseRef = useRef(lay);
  const hGrip = useDragSize((d) => { const b = baseRef.current; const maxH = typeof window !== "undefined" ? window.innerHeight * 0.9 : 1200; setLive({ ...b, h: Math.round(Math.max(240, Math.min(maxH, (b.h ?? imgH) + d))) }); },
    () => { if (live) saveLayout(live); setLive(null); }, "y");
  const vGrip = useDragSize((d) => { const b = baseRef.current; const pw = b.hide ? 0 : b.pw; const next = pw - d; setLive(next < 150 ? { ...b, hide: true } : { ...b, hide: false, pw: Math.round(Math.min(560, Math.max(220, next))) }); },
    () => { if (live) saveLayout(live); setLive(null); }, "x");
  const gripStart = (h: { onPointerDown: (e: React.PointerEvent<HTMLElement>) => void }) => (e: React.PointerEvent<HTMLElement>) => { baseRef.current = lay; h.onPointerDown(e); };

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
  // Delete / Backspace = ลบชิ้นที่เลือก (ตอนไม่ได้พิมพ์ในช่อง และไม่มีป๊อปอื่นเปิด)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (!selId || cropKey || askFind || t?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t?.tagName ?? "")) return;
      if (document.querySelector("[role=dialog] [role=dialog], [data-confirm-open]")) return;
      e.preventDefault();
      const here = chips.filter((c) => c.photo === photo?.key);
      const i = here.findIndex((c) => c.id === selId);
      draft.removeChip(selId);
      const next = here.filter((c) => c.id !== selId)[Math.min(Math.max(0, i), here.length - 2)];
      if (next) setSelId(next.id);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selId, cropKey, askFind, chips, photo, draft, setSelId]);

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
      <button type="button" onClick={() => void draft.labelPhotos([photo.key], labelPos)} disabled={!!reading}
        title={here.length ? "AI เห็นรูปเต็ม + ภาพซูมรอบแต่ละชิ้น แล้วตอบว่ากรอบไหนพิมพ์เลขอะไร (ชื่อสีตั้งจากสี่เหลี่ยมสีให้อยู่แล้ว)" : "ตีกรอบชิ้นก่อน (คลิกที่สีบนรูป)"}
        className="h-8 px-3 text-[13px] font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
        {reading?.what === "label" ? `กำลังอ่าน… ${reading.done}/${reading.total}` : "✨ AI อ่านเลขบนแผง"}
      </button>
      {photos.length > 1 && !reading && (
        <button type="button" onClick={() => void draft.labelPhotos(photos.map((p) => p.key), labelPos)} className="h-8 px-3 text-[12px] rounded-lg border border-violet-300 text-violet-700 bg-white hover:bg-violet-50">ทุกรูป ({photos.length})</button>
      )}
      <label className="flex items-center gap-1 text-[11.5px] text-violet-900/80" title="แต่ละแผงพิมพ์เลขคนละที่ — บอก AI ช่วยได้ (ไม่รู้ = ให้ AI ดูเอง)">
        เลขอยู่
        <select value={labelPos} onChange={(e) => setLabelPos(e.target.value as LabelPosition)} className="h-7 px-1 text-[12px] border border-violet-200 rounded bg-white">
          {LABEL_POSITIONS.map((p) => <option key={p} value={p}>{LABEL_POSITION_TH[p]}</option>)}
        </select>
      </label>
      <span className="text-[11.5px] text-violet-900/80">{here.length ? `${here.length} ชิ้น · เติมเฉพาะช่องว่าง · ${AI_COST_HINT}` : "ตีกรอบชิ้นก่อน (🎯 คลิกที่สีบนรูป)"}</span>
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
    <div className={layout === "full" ? "flex-1 min-h-[320px] flex flex-col" : ""}>
      <div className={`relative bg-slate-100 ${layout === "modal" ? "rounded-t-xl" : "rounded-xl flex-1"} ${over === "main" ? "ring-2 ring-indigo-400" : ""}`}
        style={layout === "modal" ? { height: imgH } : undefined}
        onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setOver("main"); } }} onDragLeave={() => setOver(null)} onDrop={dropFiles}>
        <ZoomBox zoom={zoom} onZoom={setZoom} aspect={(photo.w || 4) / (photo.h || 3)} className={`absolute inset-0 ${layout === "modal" ? "rounded-t-xl" : "rounded-xl"}`}>
          <ImageRegions<DraftChip> src={photo.src} mode="edit" className="w-full rounded-md shadow" regions={here} selectedId={selId} cornerMode="bend"
            onSelect={setSelId}
            onChange={(id, rect, points) => draft.patchChip(id, points !== undefined ? { ...rect, points } : rect)}
            onCreate={(rect) => void draft.addChip(rect)}
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
      {layout === "modal" && (
        <div {...hGrip} onPointerDown={gripStart(hGrip)} onDoubleClick={() => saveLayout({ ...lay, h: null })} role="separator" aria-orientation="horizontal"
          title="ลากเพื่อปรับความสูงพื้นที่รูป · ดับเบิลคลิก = ขนาดเริ่มต้น"
          className="group h-3 rounded-b-xl bg-slate-100 border-t border-slate-200 cursor-row-resize flex items-center justify-center touch-none">
          <span className="w-12 h-1 rounded-full bg-slate-300 group-hover:bg-indigo-500" />
        </div>
      )}
    </div>
  );

  const splitter = (
    <div {...vGrip} onPointerDown={gripStart(vGrip)} onDoubleClick={() => saveLayout({ ...lay, pw: LAYOUT_DEFAULT.pw, hide: false })} role="separator" aria-orientation="vertical"
      title={lay.hide ? "ลากไปทางซ้ายเพื่อแสดงแผงชิ้น · ดับเบิลคลิก = ขนาดเริ่มต้น" : "ลากเพื่อปรับความกว้างแผงชิ้น (ลากไปขวาสุด = ซ่อน) · ดับเบิลคลิก = ขนาดเริ่มต้น"}
      className="group hidden lg:flex w-3 shrink-0 cursor-col-resize items-center justify-center touch-none self-stretch">
      <span className={`w-1 rounded-full group-hover:bg-indigo-500 ${lay.hide ? "h-20 bg-indigo-300" : "h-12 bg-slate-300"}`} />
    </div>
  );

  return (
    <div className={layout === "modal" ? "flex flex-col lg:flex-row gap-3 lg:gap-0" : "contents"} style={{ ["--pw" as string]: `${lay.pw}px` }}>
      <div className={layout === "modal" ? "min-w-0 flex-1 space-y-2" : "flex-1 min-h-0 min-w-0 flex flex-col gap-2 bg-slate-100 p-3 sm:p-4 overflow-y-auto"}>
        {aiBar}
        {toolbar}
        {main}
        {strip}
        {photo && <p className="text-[11px] text-slate-400">Ctrl + หมุนลูกกลิ้ง = ซูม · {tool === "click" ? "คลิกที่ชิ้นสี = ตีกรอบให้" : "ลากบนรูป = ตีกรอบใหม่"} · ลากกรอบ = ย้าย · ลากจุดมุม = ดัดมุมนั้น · Delete = ลบชิ้นที่เลือก</p>}
      </div>
      {splitter}
      {lay.hide ? (
        <button type="button" onClick={() => saveLayout({ ...lay, hide: false })} className="hidden lg:flex shrink-0 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] text-slate-500 hover:text-indigo-600 [writing-mode:vertical-rl]" title="แสดงแผงชิ้น">
          ชิ้น ({here.length}) ◂
        </button>
      ) : (
        <ChipPanel draft={draft} codes={codes} here={here} selected={selected} total={chips.length} onCreateSku={onCreateSku} layout={layout} photoKey={photo?.key ?? null}
          armed={armed} onArm={(id) => { setArmed((a) => (a === id ? null : id)); if (id) toast.info("คลิกที่สีของชิ้นนี้บนรูป — ระบบจะตีกรอบใหม่ให้"); }}
          onNameFromColors={(key) => {
            const n = draft.nameFromColors(key, false);
            if (n < 0) toast.warning("กำลังโหลดทะเบียนสี — ลองกดอีกครั้ง");
            else if (n > 0) toast.success(`ตั้งชื่อสีจากสี่เหลี่ยมสีแล้ว ${n} ชิ้น (ชื่อที่พิมพ์เองไม่ทับ)`);
            else setAskName(key);   // ทุกชิ้นมีชื่อที่พิมพ์เอง/ตั้งแล้ว → ถามก่อนทับทั้งหมด
          }} />
      )}
      <ConfirmDialog open={!!askName} onClose={() => setAskName(null)}
        title="ตั้งชื่อสีใหม่ทั้งรูป?" message="ทุกชิ้นบนรูปนี้มีชื่อแล้ว — จะแทนชื่อทั้งหมด (รวมชื่อที่พิมพ์เองหรือที่ AI ตั้งไว้) ด้วยชื่อจากสี่เหลี่ยมสี (สีที่ใกล้ที่สุดในทะเบียนสีกลาง)" confirmText="แทนทั้งหมด" cancelText="ไม่แทน"
        onConfirm={() => { const k = askName; setAskName(null); if (k) { const n = draft.nameFromColors(k, true); toast.success(n ? `ตั้งชื่อสีใหม่ ${n} ชิ้น` : "ชื่อตรงกับสีอยู่แล้ว"); } }} />

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
function ChipPanel({ draft, codes, here, selected, total, onCreateSku, layout, armed, onArm, photoKey, onNameFromColors }: {
  draft: BoardDraft; codes: Map<string, string>; here: DraftChip[]; selected: DraftChip | null; total: number;
  onCreateSku?: (chip: DraftChip) => void; layout: "modal" | "full"; armed: string | null; onArm: (id: string | null) => void; photoKey: string | null;
  onNameFromColors: (photoKey: string) => void;
}) {
  const [cols, setCols] = useState(6);
  const [rows, setRows] = useState(1);
  const unsure = here.filter((c) => c.unsure).length;
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => { if (photoKey) draft.reorderChips(photoKey, from, to); });
  const selRowRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => { selRowRef.current?.scrollIntoView({ block: "nearest" }); }, [selected?.id]);
  return (
    <aside className={layout === "modal"
      ? "min-w-0 rounded-xl border border-slate-200 bg-white overflow-hidden w-full lg:w-[var(--pw)] lg:shrink-0 lg:self-start"
      : "w-full lg:w-[var(--pw)] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white overflow-y-auto max-h-[45vh] lg:max-h-none"}>
      {/* ชิ้นที่เลือก — ผูก SKU / ตีกรอบใหม่ / ดัดมุมคืน / แบ่ง / ลบ (ชื่อสี · สี · เลขแผง แก้ในรายการได้เลย) */}
      <div className="p-2.5 border-b border-slate-100">
        {selected ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded shrink-0 ring-1 ring-black/10" style={{ background: selected.color_hex ?? "#e2e8f0" }} />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12.5px] text-slate-800 truncate">{codes.get(selected.id) ?? "—"}{selected.name ? <span className="font-sans text-slate-500"> · {selected.name}</span> : null}</div>
                <div className="text-[10.5px] text-slate-400">{selected.code ? "รหัสภายใน (ล็อกแล้ว)" : "รหัสที่จะได้ตอนบันทึก"}{selected.source === "ai" ? " · จาก AI" : ""}{selected.points ? " · ดัดมุมแล้ว" : ""}</div>
              </div>
            </div>
            {selected.unsure && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">⚠ AI ไม่แน่ใจชิ้นนี้ — ตรวจขอบกรอบ/สี แล้วแก้ หรือลบทิ้ง</p>}
            <SkuPicker key={selected.id}
              value={selected.sku ? ({ id: selected.sku.id, code: selected.sku.code, name: selected.sku.name, image_url: selected.sku.image } as SkuPickerValue) : null}
              placeholder="ผูก SKU (ไม่บังคับ)"
              onChange={(v) => draft.patchChip(selected.id, v
                ? { sku_id: v.id, sku: { id: v.id, code: v.code, name: v.name, image: v.image_url ?? (v.image_key ? r2ImageUrl(v.image_key) : null), image_key: v.image_key ?? null, uom: v.uom_name ?? null, color: v.color ?? null, qty_on_hand: null, is_active: true } }
                : { sku_id: null, sku: null })} />
            <div className="flex flex-wrap items-center gap-1">
              {!selected.sku_id && onCreateSku && <button type="button" onClick={() => onCreateSku(selected)} className="h-7 px-2 text-[11px] rounded-lg border border-slate-200 text-indigo-600 hover:bg-indigo-50">+ สร้าง SKU</button>}
              <button type="button" onClick={() => onArm(armed === selected.id ? null : selected.id)}
                className={`h-7 px-2 text-[11px] rounded-lg border ${armed === selected.id ? "border-indigo-400 bg-indigo-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                title="คลิกที่สีของชิ้นนี้บนรูป แล้วระบบตีกรอบใหม่ให้พอดีชิ้น + ดูดสีใหม่ (รหัส/ชื่อ/SKU คงเดิม)">{armed === selected.id ? "ยกเลิก" : "🎯 ตีกรอบใหม่"}</button>
              {selected.points && <button type="button" onClick={() => draft.patchChip(selected.id, { points: null })} className="h-7 px-2 text-[11px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="กลับเป็นสี่เหลี่ยมตรง (ครอบมุมที่ดัดไว้)">▭ สี่เหลี่ยมตรง</button>}
              <button type="button" onClick={() => draft.removeChip(selected.id)} className="h-7 px-2 text-[11px] rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 ml-auto" title="ลบชิ้น (หรือกด Delete)">🗑 ลบ</button>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
              แบ่งกรอบเป็น
              <input type="number" min={1} max={200} value={cols} onChange={(e) => setCols(Math.max(1, Number(e.target.value) || 1))} className="w-11 h-6 px-1 text-[11px] border border-slate-200 rounded" aria-label="จำนวนคอลัมน์" />
              ×
              <input type="number" min={1} max={50} value={rows} onChange={(e) => setRows(Math.max(1, Number(e.target.value) || 1))} className="w-11 h-6 px-1 text-[11px] border border-slate-200 rounded" aria-label="จำนวนแถว" />
              <button type="button" onClick={() => void draft.splitChip(selected.id, cols, rows)} className="h-6 px-2 rounded border border-slate-200 text-slate-600 hover:bg-slate-50" title="ชิ้นเรียงกันเป็นแถว: ลากกรอบครอบทั้งแถว แล้วแบ่งเท่า ๆ กัน">แบ่ง {cols * rows}</button>
            </div>
          </div>
        ) : <p className="text-[12px] text-slate-400">ยังไม่ได้เลือกชิ้น — 🎯 คลิกที่ชิ้นสีบนรูป หรือกดแถวในรายการ</p>}
      </div>
      {/* รายการ (ลำดับ = เลขที่จะได้) — ลาก ⠿ สลับ · แก้สี/ชื่อสี/เลขแผงในแถว */}
      <div className="p-2.5">
        <div className="flex items-center gap-1 mb-1.5">
          <span className="text-[12px] font-medium text-slate-600">ชิ้นบนรูปนี้ ({here.length}){total !== here.length ? <span className="font-normal text-slate-400"> · ทั้งแผ่น {total}</span> : null}{unsure ? <span className="font-normal text-amber-600"> · ตรวจ {unsure}</span> : null}</span>
          {here.length > 0 && photoKey && (
            <button type="button" onClick={() => onNameFromColors(photoKey)} className="ml-auto h-6 px-1.5 text-[10.5px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              title="ตั้งชื่อสีจากสี่เหลี่ยมสี (สีที่ใกล้ที่สุดในทะเบียนสีกลาง) — ชื่อที่พิมพ์เองไม่ทับ (ถามก่อนถ้าจะทับ)">🎨 ชื่อจากสี</button>
          )}
          {here.length > 1 && photoKey && (
            <span className="inline-flex rounded border border-slate-200 overflow-hidden text-[10.5px]">
              <button type="button" onClick={() => draft.sortChips(photoKey, "row")} className="h-6 px-1.5 text-slate-600 hover:bg-slate-50" title="เรียงเลขตามแถว: บนลงล่าง แต่ละแถวซ้ายไปขวา">แถว ⇢</button>
              <button type="button" onClick={() => draft.sortChips(photoKey, "col")} className="h-6 px-1.5 border-l border-slate-200 text-slate-600 hover:bg-slate-50" title="เรียงเลขตามคอลัมน์: ซ้ายไปขวา แต่ละคอลัมน์บนลงล่าง">คอลัมน์ ⇣</button>
            </span>
          )}
        </div>
        {here.length === 0 ? <p className="text-[12px] text-slate-400">ยังไม่มีชิ้น — 🎯 คลิกที่สีบนรูป หรือลากตีกรอบเอง</p> : (
          <ul className={`space-y-0.5 ${layout === "modal" ? "max-h-[46vh] overflow-y-auto pr-0.5" : ""}`}>
            {here.map((c, i) => {
              const isSel = c.id === selected?.id;
              return (
                <li key={c.id} {...rowProps(i)} ref={isSel ? selRowRef : undefined} onClick={(e) => { if (!(e.target as HTMLElement).closest("input,button")) draft.setSelId(c.id); }}
                  className={`grid grid-cols-[14px_30px_24px_minmax(0,1fr)_58px] items-center gap-1 px-1 py-0.5 rounded-md border cursor-pointer ${isSel ? "border-indigo-300 bg-indigo-50" : c.unsure ? "border-amber-200 bg-amber-50/50" : "border-transparent hover:bg-slate-50"} ${rowCls(i)}`}>
                  <DragHandle {...handleProps(i)} title="ลากเพื่อสลับลำดับ (เลขเปลี่ยนตาม)" />
                  <span className={`font-mono text-[10.5px] tabular-nums ${c.code ? "text-slate-700" : "text-slate-400"}`} title={codes.get(c.id)}>-{codes.get(c.id)?.split("-").pop()}</span>
                  <span className="[&_button]:!h-6 [&_button]:!w-6 [&_button]:rounded" title={c.color_hex ? `${c.color_hex.toUpperCase()} — กดเพื่อเปลี่ยนสี` : "กดเพื่อเลือกสี"}>
                    <ColorInput value={c.color_hex ?? "#cccccc"} allowText={false}
                      onChange={(v) => { if (/^#[0-9a-fA-F]{6}$/.test(v)) draft.setChipColor(c.id, v.toLowerCase()); }} />
                  </span>
                  <input value={c.name ?? ""} onChange={(e) => draft.patchChip(c.id, { name: e.target.value || null, nameAuto: false })} onFocus={() => draft.setSelId(c.id)} placeholder={c.sku ? c.sku.code : "ชื่อสี"}
                    title={c.nameAuto ? "ชื่อจากสี่เหลี่ยมสี (สีที่ใกล้ที่สุดในทะเบียนสี) — เปลี่ยนสี ชื่อเปลี่ยนตาม · พิมพ์เองได้" : undefined}
                    className={`h-6 px-1.5 text-[12px] border rounded focus:outline-none focus:ring-2 focus:ring-indigo-200 min-w-0 bg-white ${c.nameAuto ? "border-slate-200 text-slate-600" : "border-slate-200"}`} />
                  <input value={c.label ?? ""} onChange={(e) => draft.patchChip(c.id, { label: e.target.value || null })} onFocus={() => draft.setSelId(c.id)} placeholder="เลขแผง"
                    className="h-6 px-1.5 text-[12px] border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-200 min-w-0 bg-white" />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
