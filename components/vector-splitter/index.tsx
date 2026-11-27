"use client";
/**
 * ✂️ ตัวแยกชิ้นจากไฟล์ออกแบบ (ของกลาง) — โยนไฟล์ .ai / .pdf / .svg ที่มีหลายชิ้นในแผ่นเดียว
 *   → ระบบหาชิ้นอัตโนมัติ (จากพื้นที่ว่างระหว่างชิ้น) แสดงเป็นกรอบ → ติ๊กเลือก / รวม / แยก / ลากกรอบเอง / ลบกรอบ (ย้อนกลับได้ Ctrl+Z)
 *   → ตั้งชื่อ (heart_01…) → แปลงเป็น PNG พื้นใสตามขนาดที่เลือก (วาดจากเส้นเวกเตอร์ใหม่ = คม) → เข้าอัลบั้มในคลังไฟล์
 *   → ไฟล์ต้นฉบับเก็บในคลังด้วย และ PNG ทุกชิ้นผูกกลับ (assets.source_asset_id) — หน้ารายละเอียดโชว์ "มาจากไฟล์ไหน"
 * ใช้เมื่อ: ต้องการตัดชิ้นส่วนจากไฟล์เวกเตอร์ชุด (สติกเกอร์/ไอคอน/ลายเส้น) เป็นรูปแยก
 * ห้ามใช้เมื่อ: ไฟล์รูป (JPG/PNG) ธรรมดา → ใช้ครอปรูป (ImageCropPicker) · ไฟล์บล็อกพิมพ์ที่ต้องการเส้นตัด → BlockPrint
 * .eps / .ai รุ่นเก่า = PostScript เปิดในเว็บไม่ได้ → ระบบบอกให้ Save As เป็น .ai/.pdf
 * ตรรกะหาชิ้น/ตั้งชื่อ/สเกล = lib/vector-split (มีเทสต์) · ตัววาด = ./render
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { ERPModal } from "@/components/modal";
import { AlbumSelect } from "@/components/album-picker";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { SMALL_UPLOAD_BYTES } from "@/lib/media-upload-limits";
import {
  type Box, type SizeMode, VECTOR_ACCEPT, isVectorFile, inkMask, detectPieces, unionBox, pieceNames,
  safeFileName, exportScale, boxFromDrag, clearEdgeWhite, readingOrder,
} from "@/lib/vector-split";
import { openVectorFile, canvasToPng, type VectorSource } from "./render";
import type { AssetCollection } from "@/app/api/assets/collections/route";

type Piece = { id: number; box: Box; selected: boolean; name?: string };
type Preview = { url: string; scale: number; data: ImageData };
type Result = { ok: number; failed: { name: string; error: string }[]; album: string | null };

const PREVIEW_LONG = 1600;
const SIZE_OPTS: { v: SizeMode; label: string }[] = [{ v: 512, label: "512" }, { v: 1024, label: "1024" }, { v: 2048, label: "2048" }, { v: "actual", label: "เท่าจริง" }];
const CHECKER = { backgroundImage: "linear-gradient(45deg,#eef0f3 25%,transparent 25%),linear-gradient(-45deg,#eef0f3 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eef0f3 75%),linear-gradient(-45deg,transparent 75%,#eef0f3 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,0 8px,8px -8px,-8px 0" };
let pid = 0;

/** มุมทั้ง 4 ของแผ่นเป็นสีขาวทึบ = น่าจะมีแผ่นขาวรองพื้น → เปิด "ลบพื้นขาว" ให้เอง */
function looksWhiteBacked(d: ImageData): boolean {
  const at = (x: number, y: number) => { const p = (y * d.width + x) * 4; return d.data[p + 3] > 200 && d.data[p] > 242 && d.data[p + 1] > 242 && d.data[p + 2] > 242; };
  const w = d.width - 1, h = d.height - 1;
  return at(0, 0) && at(w, 0) && at(0, h) && at(w, h);
}

export function VectorSplitterModal({ initialFile, collections, defaultCollectionId, actor, onClose, onDone }: {
  initialFile?: File | null; collections: AssetCollection[]; defaultCollectionId?: string | null; actor?: string | null;
  onClose: () => void; onDone: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [src, setSrc] = useState<VectorSource | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeWhite, setRemoveWhite] = useState(false);
  const [gapPct, setGapPct] = useState(2.5);   // % ของด้านยาว — ขีดประดับรอบชิ้น (เช่น ขีดรอบหัวใจ) นับรวมเป็นชิ้นเดียว
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [history, setHistory] = useState<Piece[][]>([]);
  const [prefix, setPrefix] = useState("piece_");
  const [size, setSize] = useState<SizeMode>(1024);
  const [pad, setPad] = useState(10);
  const [albumId, setAlbumId] = useState<string>(defaultCollectionId ?? "");
  const [extraCols, setExtraCols] = useState<AssetCollection[]>([]);
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [originalInAlbum, setOriginalInAlbum] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [progress, setProgress] = useState<UploadProgressState | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cols = useMemo(() => [...collections, ...extraCols.filter((x) => !collections.some((c) => c.id === x.id))], [collections, extraCols]);

  // ── เปิดไฟล์ → วาดภาพรวม → หาชิ้น ──
  const detect = useCallback((pv: Preview, rw: boolean, gp: number) => {
    const d = pv.data;
    const mask = inkMask(d.data, d.width, d.height, rw);
    const boxes = detectPieces(mask, d.width, d.height, { gap: Math.max(1, (Math.max(d.width, d.height) * gp) / 100) });
    return boxes.map((b) => ({ id: ++pid, selected: true, box: { x: b.x / pv.scale, y: b.y / pv.scale, w: b.w / pv.scale, h: b.h / pv.scale } }));
  }, []);

  const loadFile = useCallback(async (f: File, page = 1) => {
    setLoading(true); setError(null); setPieces([]); setHistory([]); setPreview(null);
    try {
      let s = src && file === f ? src : await openVectorFile(f);
      if (s.page !== page) s = await s.setPage(page);
      setSrc(s);
      const scale = Math.min(PREVIEW_LONG / Math.max(s.width, s.height), 8);
      const canvas = await s.renderRegion({ x: 0, y: 0, w: s.width, h: s.height }, scale);
      const ctx = canvas.getContext("2d")!;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pv: Preview = { url: canvas.toDataURL("image/png"), scale, data };
      setPreview(pv);
      const rw = looksWhiteBacked(data);
      setRemoveWhite(rw);
      setPieces(detect(pv, rw, gapPct));
      const base = f.name.replace(/\.[^.]+$/, "").replace(/[\s-]+/g, "_").replace(/_?\d+$/, "").slice(0, 30);
      setPrefix(`${base || "piece"}_`);
    } catch (e) {
      setSrc(null);
      setError(e instanceof Error ? e.message : t("เปิดไฟล์ไม่ได้", "Can't open file"));
    } finally { setLoading(false); }
  }, [detect, file, gapPct, src, t]);

  useEffect(() => { if (initialFile) void loadFile(initialFile); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- เปิดไฟล์แรกครั้งเดียว
  // ปิดไฟล์ตอนปิดป๊อป (เปลี่ยนหน้าใช้เอกสารเดิม — ห้ามปิดตอน src เปลี่ยน)
  const srcRef = useRef<VectorSource | null>(null);
  srcRef.current = src;
  useEffect(() => () => srcRef.current?.destroy(), []);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!isVectorFile(f)) { toast.error(t("รับไฟล์ .ai / .pdf / .svg (และ .eps ที่ Save As แล้ว)", "Accepts .ai / .pdf / .svg files")); return; }
    src?.destroy(); setSrc(null); setFile(f); setResult(null); void loadFile(f);
  };
  const { over, zone } = useFileDrop((fs) => pickFile(fs[0]), { disabled: !!progress });

  // ── แก้กรอบ (ย้อนกลับได้) ──
  const commit = (next: Piece[]) => { setHistory((h) => [...h.slice(-40), pieces]); setPieces(next); };
  const undo = useCallback(() => {
    setHistory((h) => { if (!h.length) return h; setPieces(h[h.length - 1]); return h.slice(0, -1); });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && (e.code === "KeyZ")) { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  const selected = pieces.filter((p) => p.selected);
  const autoNames = useMemo(() => pieceNames(prefix, selected.length), [prefix, selected.length]);
  const nameOf = (p: Piece) => p.name ?? autoNames[selected.findIndex((s) => s.id === p.id)] ?? "";
  const toggle = (id: number) => setPieces((ps) => ps.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)));
  const setAll = (v: boolean) => setPieces((ps) => ps.map((p) => ({ ...p, selected: v })));
  const removePiece = (id: number) => commit(pieces.filter((p) => p.id !== id));
  const mergeSelected = () => {
    if (selected.length < 2) { toast.info(t("ติ๊กอย่างน้อย 2 ชิ้นก่อนรวม", "Tick at least 2 pieces to merge")); return; }
    const merged: Piece = { id: ++pid, selected: true, box: unionBox(selected.map((p) => p.box)) };
    const rest = pieces.filter((p) => !p.selected);
    commit(orderPieces([...rest, merged]));
  };
  const splitSelected = () => {
    if (!preview || selected.length !== 1) { toast.info(t("ติ๊กชิ้นเดียวที่ต้องการแยก", "Tick exactly one piece to split")); return; }
    const target = selected[0];
    const d = preview.data, s = preview.scale;
    const x0 = Math.max(0, Math.floor(target.box.x * s)), y0 = Math.max(0, Math.floor(target.box.y * s));
    const w = Math.min(d.width - x0, Math.ceil(target.box.w * s)), h = Math.min(d.height - y0, Math.ceil(target.box.h * s));
    const full = inkMask(d.data, d.width, d.height, removeWhite);
    const sub = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) sub.set(full.subarray((y0 + y) * d.width + x0, (y0 + y) * d.width + x0 + w), y * w);
    const boxes = detectPieces(sub, w, h, { gap: Math.max(1, (Math.max(d.width, d.height) * gapPct) / 400), minFrac: 0.002 });
    if (boxes.length < 2) { toast.info(t("แยกต่อไม่ได้ — ชิ้นนี้ติดกันอยู่ (ลากกรอบเองได้)", "Can't split further — draw boxes manually")); return; }
    const parts: Piece[] = boxes.map((b) => ({ id: ++pid, selected: true, box: { x: (b.x + x0) / s, y: (b.y + y0) / s, w: b.w / s, h: b.h / s } }));
    commit(orderPieces([...pieces.filter((p) => p.id !== target.id), ...parts]));
  };
  const redetect = (rw: boolean, gp: number) => { if (preview) commit(detect(preview, rw, gp)); };

  // ── ลากกรอบเอง ──
  const toUnits = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * (src?.width ?? 1), y: ((e.clientY - r.top) / r.height) * (src?.height ?? 1) };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!drawMode || !src) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = toUnits(e); setDrag({ x: p.x, y: p.y, x2: p.x, y2: p.y });
  };
  const onMove = (e: React.PointerEvent) => { if (drag) { const p = toUnits(e); setDrag({ ...drag, x2: p.x, y2: p.y }); } };
  const onUp = () => {
    if (!drag || !src) return;
    const b = boxFromDrag(drag.x, drag.y, drag.x2, drag.y2);
    setDrag(null);
    if (b.w < src.width * 0.01 || b.h < src.height * 0.01) return;
    commit(orderPieces([...pieces, { id: ++pid, selected: true, box: b }]));
  };

  // ── บันทึก: ต้นฉบับ → PNG ทีละชิ้น → คลังไฟล์ ──
  const createAlbum = async (name: string) => {
    const j = await (await apiFetch("/api/assets/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })).json();
    if (j.error || !j.data?.id) { toast.error(j.error || t("สร้างอัลบั้มไม่สำเร็จ", "Create album failed")); return null; }
    setExtraCols((x) => [...x, { id: j.data.id, name, description: null, count: 0, parent_id: null }]);
    return j.data.id as string;
  };
  const postAsset = async (f: File, extra: Record<string, string>) => {
    const fd = new FormData();
    fd.append("file", f);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    if (actor) fd.append("actor", actor);
    const res = await apiFetch("/api/assets", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({ error: res.status === 413 ? t("ไฟล์ใหญ่เกินที่ระบบรับได้", "File too large") : t("อัปโหลดไม่สำเร็จ", "Upload failed") }));
    if (!res.ok || j.error) throw new Error(j.error || t("อัปโหลดไม่สำเร็จ", "Upload failed"));
    return j.data?.id as string;
  };
  const save = async () => {
    if (!file || !src || !preview) return;
    if (!selected.length) { toast.error(t("ยังไม่ได้ติ๊กชิ้นไหนเลย", "No pieces ticked")); return; }
    const names = selected.map((p) => safeFileName(nameOf(p)));
    const dupName = names.find((n, i) => names.indexOf(n) !== i);
    if (dupName) { toast.error(`${t("ชื่อซ้ำกัน", "Duplicate name")}: ${dupName}`); return; }
    const albumIds = albumId ? JSON.stringify([albumId]) : "";
    const total = selected.length + (keepOriginal ? 1 : 0);
    let step = 0;
    let sourceId: string | null = null;
    const failed: Result["failed"] = [];
    try {
      if (keepOriginal) {
        step++;
        setProgress({ name: file.name, size: file.size, pct: null, label: t("เก็บไฟล์ต้นฉบับ", "Saving original"), count: { current: step, total } });
        const common: Record<string, string> = { tags: "ไฟล์ต้นฉบับ", ...(originalInAlbum && albumIds ? { collection_ids: albumIds } : {}) };
        try {
          if (file.size <= SMALL_UPLOAD_BYTES) sourceId = await postAsset(file, { ...common, title: file.name });
          else {
            // ไฟล์จริงใหญ่เกินที่เว็บรับ (4MB) → เก็บภาพรวมแผ่นแทน (ผูกชิ้นได้เหมือนกัน · ไฟล์จริงเก็บ NAS/Drive แล้วใส่ path ในรายละเอียด)
            const sheet = await canvasToPng(await src.renderRegion({ x: 0, y: 0, w: src.width, h: src.height }, preview.scale));
            sourceId = await postAsset(new File([sheet], `${file.name.replace(/\.[^.]+$/, "")}_sheet.png`, { type: "image/png" }),
              { ...common, title: `${file.name} (${t("ภาพรวมแผ่น — ไฟล์จริงใหญ่เกิน 4MB", "sheet preview — original over 4MB")})` });
          }
        } catch (e) { failed.push({ name: file.name, error: e instanceof Error ? e.message : String(e) }); }
      }
      for (let i = 0; i < selected.length; i++) {
        const p = selected[i], name = names[i];
        step++;
        setProgress({ name: `${name}.png`, pct: Math.round(((step - 1) / total) * 100), label: t("แปลงเป็น PNG + อัปโหลด", "Converting to PNG + uploading"), count: { current: step, total } });
        try {
          const canvas = await src.renderRegion(p.box, exportScale(p.box, size, src.unitsPerInch), pad);
          if (removeWhite) {
            const ctx = canvas.getContext("2d")!;
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            clearEdgeWhite(img.data, canvas.width, canvas.height);
            ctx.putImageData(img, 0, 0);
          }
          const blob = await canvasToPng(canvas);
          if (blob.size > SMALL_UPLOAD_BYTES) throw new Error(t("PNG ใหญ่เกิน 4MB — เลือกขนาดเล็กลง", "PNG over 4MB — pick a smaller size"));
          await postAsset(new File([blob], `${name}.png`, { type: "image/png" }), {
            title: name, width: String(canvas.width), height: String(canvas.height), tags: "แยกจากไฟล์ออกแบบ",
            ...(albumIds ? { collection_ids: albumIds } : {}), ...(sourceId ? { source_asset_id: sourceId } : {}),
          });
        } catch (e) { failed.push({ name, error: e instanceof Error ? e.message : String(e) }); }
      }
    } finally { setProgress(null); }
    const ok = selected.length - failed.filter((f) => f.name !== file.name).length;
    setResult({ ok, failed, album: cols.find((c) => c.id === albumId)?.name ?? null });
    if (ok) toast.success(`${t("บันทึก", "Saved")} ${ok} ${t("ชิ้นเข้าคลังแล้ว", "pieces to the library")}`);
  };

  const dirty = pieces.length > 0 && !result;
  const busy = !!progress;

  // ── หน้าตา ──
  const footer = result ? (
    <div className="flex justify-end gap-2 w-full">
      <button onClick={() => { setResult(null); setFile(null); setSrc(null); setPreview(null); setPieces([]); }} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("แยกไฟล์อื่นต่อ", "Split another file")}</button>
      <button onClick={onDone} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{t("เสร็จ", "Done")}</button>
    </div>
  ) : (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[12px] text-slate-500 mr-auto">{preview ? `${t("เลือก", "Selected")} ${selected.length}/${pieces.length} ${t("ชิ้น", "pieces")}` : ""}</span>
      <button onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">{t("ยกเลิก", "Cancel")}</button>
      <button onClick={save} disabled={busy || !selected.length} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
        {t("แปลง", "Convert")} {selected.length} {t("ชิ้นเข้าคลัง", "pieces to library")}
      </button>
    </div>
  );

  return (
    <ERPModal open onClose={onClose} size="xl" storageKey="vector-splitter" hasUnsavedChanges={dirty || busy}
      title={t("✂️ แยกชิ้นจากไฟล์ออกแบบ", "✂️ Split design file")} footer={footer}>
      {result ? (
        <div className="py-6 text-center">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-base font-medium text-slate-800">{t("บันทึก", "Saved")} {result.ok} {t("ชิ้น", "pieces")}{result.album ? ` ${t("เข้าอัลบั้ม", "into album")} “${result.album}”` : ""}</p>
          {result.failed.length > 0 && (
            <div className="mt-3 mx-auto max-w-md text-left text-[12px] text-rose-700 bg-rose-50 rounded-lg p-3">
              <p className="font-medium mb-1">{t("ทำไม่สำเร็จ", "Failed")} {result.failed.length}</p>
              {result.failed.map((f) => <p key={f.name}>• {f.name}: {f.error}</p>)}
            </div>
          )}
        </div>
      ) : !file || (!preview && !loading && !error) ? (
        <div {...zone("pick")} onClick={() => inputRef.current?.click()}
          className="relative cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <FileDropHint show={over === "pick"} label={t("วางไฟล์ออกแบบ", "Drop design file")} />
          <div className="text-4xl mb-2">✂️</div>
          <p className="text-sm font-medium text-slate-700">{t("ลากไฟล์ .ai / .pdf / .svg มาวาง หรือคลิกเลือก", "Drop an .ai / .pdf / .svg file or click to choose")}</p>
          <p className="text-[12px] text-slate-400 mt-1">{t("ไฟล์ .eps: เปิดใน Illustrator แล้ว Save As เป็น .ai หรือ .pdf ก่อน", ".eps files: Save As .ai or .pdf in Illustrator first")}</p>
          <input ref={inputRef} type="file" accept={VECTOR_ACCEPT} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        </div>
      ) : (
        <div className="flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_280px] gap-4">
          {/* ซ้าย: แผ่นงาน + กรอบ */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-[12px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 truncate max-w-[220px]" title={file.name}>📄 {file.name}</span>
              {src && src.pages > 1 && (
                <select value={src.page} onChange={(e) => void loadFile(file, Number(e.target.value))} className="h-7 text-[12px] border border-slate-200 rounded">
                  {Array.from({ length: src.pages }, (_, i) => <option key={i} value={i + 1}>{t("หน้า", "Page")} {i + 1}</option>)}
                </select>
              )}
              <button onClick={() => inputRef.current?.click()} className="text-[12px] text-indigo-600 hover:underline">{t("เปลี่ยนไฟล์", "Change file")}</button>
              <input ref={inputRef} type="file" accept={VECTOR_ACCEPT} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            </div>
            {preview && (
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <ToolBtn onClick={() => setAll(true)}>{t("เลือกทั้งหมด", "Select all")}</ToolBtn>
                <ToolBtn onClick={() => setAll(false)}>{t("ล้าง", "Clear")}</ToolBtn>
                <ToolBtn on={drawMode} onClick={() => setDrawMode((v) => !v)}>⬚ {t("ลากกรอบเอง", "Draw box")}</ToolBtn>
                <ToolBtn onClick={mergeSelected}>🔗 {t("รวมชิ้น", "Merge")}</ToolBtn>
                <ToolBtn onClick={splitSelected}>✂ {t("แยกชิ้น", "Split")}</ToolBtn>
                <ToolBtn onClick={undo} disabled={!history.length}>↶ {t("ย้อน", "Undo")}</ToolBtn>
              </div>
            )}
            {loading && <p className="py-16 text-center text-sm text-slate-400">{t("กำลังเปิดไฟล์และหาชิ้น…", "Opening file and finding pieces…")}</p>}
            {error && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
                <p className="font-medium mb-1">{t("เปิดไฟล์นี้ไม่ได้", "Can't open this file")}</p>
                <p>{error}</p>
              </div>
            )}
            {preview && src && (
              <div ref={stageRef} className={`relative w-full rounded-lg border border-slate-200 overflow-hidden select-none ${drawMode ? "cursor-crosshair touch-none" : ""}`}
                style={{ ...CHECKER, aspectRatio: `${src.width} / ${src.height}` }}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- ภาพจาก canvas ในเครื่อง */}
                <img src={preview.url} alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />
                {pieces.map((p, i) => {
                  const s = { left: `${(p.box.x / src.width) * 100}%`, top: `${(p.box.y / src.height) * 100}%`, width: `${(p.box.w / src.width) * 100}%`, height: `${(p.box.h / src.height) * 100}%` };
                  return (
                    <div key={p.id} style={s} onClick={(e) => { if (drawMode) return; e.stopPropagation(); toggle(p.id); }}
                      className={`group absolute rounded-sm ${drawMode ? "pointer-events-none" : "cursor-pointer"} ${p.selected ? "border-2 border-indigo-500 bg-indigo-500/10" : "border border-dashed border-slate-400 hover:border-slate-600"}`}>
                      <span className={`absolute -top-0.5 left-0.5 text-[10px] leading-none px-0.5 rounded ${p.selected ? "bg-indigo-600 text-white" : "bg-white/80 text-slate-500"}`}>{String(i + 1).padStart(2, "0")}</span>
                      {!drawMode && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); removePiece(p.id); }} aria-label={t("ลบกรอบ", "Remove box")}
                          className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-white border border-slate-300 text-[10px] leading-none text-slate-500 hover:text-rose-600 opacity-100 md:opacity-0 md:group-hover:opacity-100">×</button>
                      )}
                    </div>
                  );
                })}
                {drag && (() => { const b = boxFromDrag(drag.x, drag.y, drag.x2, drag.y2); return (
                  <div className="absolute border-2 border-pink-500 bg-pink-500/10 pointer-events-none"
                    style={{ left: `${(b.x / src.width) * 100}%`, top: `${(b.y / src.height) * 100}%`, width: `${(b.w / src.width) * 100}%`, height: `${(b.h / src.height) * 100}%` }} />
                ); })()}
              </div>
            )}
            {preview && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] text-slate-600">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={removeWhite} onChange={(e) => { setRemoveWhite(e.target.checked); redetect(e.target.checked, gapPct); }} />
                  {t("ลบพื้นขาว (ไฟล์ที่มีแผ่นขาวรองพื้น)", "Remove white background")}
                </label>
                <label className="flex items-center gap-2">
                  <span className="shrink-0">{t("ความห่างของชิ้น", "Piece gap")}</span>
                  <input type="range" min={0.3} max={5} step={0.1} value={gapPct} className="flex-1"
                    onChange={(e) => setGapPct(Number(e.target.value))} onPointerUp={() => redetect(removeWhite, gapPct)} onKeyUp={() => redetect(removeWhite, gapPct)} />
                </label>
              </div>
            )}
          </div>

          {/* ขวา: ตั้งชื่อ / ขนาด / อัลบั้ม */}
          {preview && (
            <div className="flex flex-col gap-3 text-[13px]">
              <div>
                <p className="text-[12px] text-slate-500 mb-1">{t("ตั้งชื่อ", "Name prefix")}</p>
                <input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="w-full h-9 px-3 border border-slate-200 rounded-lg" />
                <p className="text-[11px] text-slate-400 mt-0.5">{autoNames.length ? `${autoNames[0]}${autoNames.length > 1 ? ` … ${autoNames[autoNames.length - 1]}` : ""}` : ""} · {t("แก้รายชิ้นได้ข้างล่าง", "edit each below")}</p>
              </div>
              {selected.length > 0 && (
                <div className="max-h-40 overflow-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
                  {selected.map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5 px-2 py-1">
                      <span className="text-[10px] text-slate-400 w-5 shrink-0">{String(pieces.indexOf(p) + 1).padStart(2, "0")}</span>
                      <input value={nameOf(p)} onChange={(e) => setPieces((ps) => ps.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))}
                        className="flex-1 min-w-0 h-7 px-2 text-[12px] border border-slate-200 rounded" />
                      {p.name != null && <button onClick={() => setPieces((ps) => ps.map((x) => (x.id === p.id ? { ...x, name: undefined } : x)))} title={t("กลับไปใช้ชื่ออัตโนมัติ", "Back to auto name")} className="text-[11px] text-slate-400 hover:text-indigo-600">↺</button>}
                    </div>
                  ))}
                </div>
              )}
              <div>
                <p className="text-[12px] text-slate-500 mb-1">{t("ขนาด PNG (ด้านยาว px)", "PNG size (long side px)")}</p>
                <div className="flex gap-1">
                  {SIZE_OPTS.map((o) => (
                    <button key={String(o.v)} onClick={() => setSize(o.v)}
                      className={`flex-1 h-8 text-[12px] rounded-lg border ${size === o.v ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 hover:bg-slate-50"}`}>{o.v === "actual" ? t("เท่าจริง", "Actual") : o.label}</button>
                  ))}
                </div>
                {size === "actual" && <p className="text-[11px] text-slate-400 mt-0.5">{t("ขนาดจริงในไฟล์ที่ 300 DPI (สูงสุด 4096 px)", "Real size at 300 DPI (max 4096 px)")}</p>}
              </div>
              <div>
                <p className="text-[12px] text-slate-500 mb-1">{t("ขอบใสรอบชิ้น", "Transparent padding")} · {pad} px</p>
                <input type="range" min={0} max={60} step={1} value={pad} onChange={(e) => setPad(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <p className="text-[12px] text-slate-500 mb-1">{t("บันทึกเข้าอัลบั้ม", "Save into album")}</p>
                <AlbumSelect albums={cols} value={albumId} onChange={setAlbumId} noneLabel={t("— ไม่ใส่อัลบั้ม —", "— No album —")} onCreate={createAlbum} />
              </div>
              <label className="flex items-start gap-2 text-[12px] text-slate-600">
                <input type="checkbox" checked={keepOriginal} onChange={(e) => setKeepOriginal(e.target.checked)} className="mt-0.5" />
                <span>{t("เก็บไฟล์ต้นฉบับ + ผูกกับ PNG ทุกชิ้น", "Keep original + link every PNG to it")}
                  {file.size > SMALL_UPLOAD_BYTES && <span className="block text-[11px] text-amber-600">{t("ไฟล์นี้ใหญ่เกิน 4MB — จะเก็บเป็นภาพรวมแผ่นแทน", "Over 4MB — a sheet preview is stored instead")}</span>}
                </span>
              </label>
              {keepOriginal && albumId && (
                <label className="flex items-center gap-2 text-[12px] text-slate-600 -mt-2 pl-5">
                  <input type="checkbox" checked={originalInAlbum} onChange={(e) => setOriginalInAlbum(e.target.checked)} />
                  {t("ใส่ไฟล์ต้นฉบับในอัลบั้มด้วย", "Also put the original in the album")}
                </label>
              )}
              {progress && <UploadProgress {...progress} />}
            </div>
          )}
        </div>
      )}
    </ERPModal>
  );
}

function orderPieces(ps: Piece[]): Piece[] {
  const order = readingOrder(ps.map((p) => p.box));
  return order.map((b) => ps.find((p) => p.box === b)!);
}

function ToolBtn({ on, disabled, onClick, children }: { on?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`h-7 px-2.5 text-[12px] rounded-lg border disabled:opacity-40 ${on ? "border-pink-400 bg-pink-50 text-pink-700" : "border-slate-200 hover:bg-slate-50 text-slate-700"}`}>{children}</button>
  );
}
