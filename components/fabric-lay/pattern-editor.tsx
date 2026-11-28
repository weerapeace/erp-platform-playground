"use client";
/**
 * ✂️ แบบตัดของสินค้า 1 ตัว (/master/fabric-lay/patterns/<id>)
 *   ชิ้นแบบ: เลือกว่าเป็นส่วนไหน (หน้า/หลัง/ข้าง/…) · ขนาดสำเร็จ (ยืดได้) · จำนวนชิ้น · คู่ซ้าย-ขวา (พลิกให้เอง) · เผื่อเย็บ · โน้ต
 *   เพิ่มชิ้น: สี่เหลี่ยม (ใส่ขนาด) · โยนไฟล์ SVG/DXF (รูปทรงจริง · lib/pattern-shape + lib/pattern-dxf-import) · รูป PNG/JPG (เป็นรูปอ้างอิง + ใส่ขนาด)
 *            · ดึงจากสตูดิโอแพทเทิร์น (/api/pattern-projects — ชิ้น/จำนวน/เผื่อเย็บตามแพทเทิร์น)
 *   แก้ได้ทุกช่อง · ย้อนกลับ/ทำซ้ำ (Ctrl+Z / Ctrl+Y) · บันทึก (Ctrl+S) · ออกโดยไม่บันทึก = เตือน
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { ErrorState, LoadingState } from "@/components/state-views";
import { LAY_PARTS, MAX_COUNT, newId, rectShape, type LayPart, type LayPiece } from "@/lib/fabric-lay";
import { cleanShape, fitShape, normalizeShape, parseSvgShapes, shapeBox, type Shape } from "@/lib/pattern-shape";
import { parseDxfPattern } from "@/lib/pattern-dxf-import";
import { PieceThumb } from "./piece-thumb";
import { API, HOME, api, bagImgUrl, shrinkToJpeg, studioThumbUrl, uploadImage, useLeaveGuard, type Pattern } from "./shared";

type Doc = { name: string; note: string; bag_image: string | null; pieces: LayPiece[] };
const r1 = (n: number) => Math.round(n * 10) / 10;
const key = (d: Doc) => JSON.stringify(d);

export function PatternEditor({ id }: { id: string }) {
  const toast = useToast();
  const canEdit = usePermission("fabric_lay.edit");
  const [row, setRow] = useState<Pattern | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const past = useRef<Doc[]>([]), future = useRef<Doc[]>([]);
  const fileRef = useRef<HTMLInputElement>(null), bagRef = useRef<HTMLInputElement>(null);
  const [studio, setStudio] = useState(false);
  const [, force] = useState(0);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const p = await api<Pattern>(`${API}/patterns/${id}`);
      const d: Doc = { name: p.name, note: p.note ?? "", bag_image: p.bag_image, pieces: p.pieces ?? [] };
      setRow(p); setDoc(d); setSaved(key(d)); past.current = []; future.current = [];
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const dirty = !!doc && key(doc) !== saved;
  useLeaveGuard(dirty);

  const apply = (fn: (d: Doc) => Doc) => {
    if (!doc) return;
    past.current.push(doc); if (past.current.length > 100) past.current.shift();
    future.current = [];
    setDoc(fn(doc));
  };
  const undo = () => { const p = past.current.pop(); if (!p || !doc) return; future.current.push(doc); setDoc(p); };
  const redo = () => { const f = future.current.pop(); if (!f || !doc) return; past.current.push(doc); setDoc(f); };
  const setPiece = (pid: string, patch: Partial<LayPiece>) => apply((d) => ({ ...d, pieces: d.pieces.map((p) => (p.id === pid ? { ...p, ...patch } : p)) }));
  const addPieces = (ps: LayPiece[]) => { if (!ps.length) return; apply((d) => ({ ...d, pieces: [...d.pieces, ...ps].slice(0, 40) })); toast.action(`เพิ่ม ${ps.length} ชิ้นแล้ว`, "ย้อนกลับ", () => keyRef.current.undo()); };
  const removePiece = (p: LayPiece) => { apply((d) => ({ ...d, pieces: d.pieces.filter((x) => x.id !== p.id) })); toast.undo(`ลบชิ้น ${p.name} แล้ว`, () => keyRef.current.undo()); };
  const move = (i: number, dir: -1 | 1) => apply((d) => { const ps = [...d.pieces]; const j = i + dir; if (j < 0 || j >= ps.length) return d; [ps[i], ps[j]] = [ps[j], ps[i]]; return { ...d, pieces: ps }; });

  const save = async () => {
    if (!doc || !row) return;
    if (!doc.name.trim()) { toast.warning("ใส่ชื่อแบบตัด"); return; }
    setBusy("กำลังบันทึก…");
    try {
      const p = await api<Pattern>(`${API}/patterns/${row.id}`, { method: "PATCH", json: { name: doc.name.trim(), note: doc.note.trim() || null, bag_image: doc.bag_image, pieces: doc.pieces } });
      setRow(p); setSaved(key(doc)); toast.success("บันทึกแบบตัดแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    setBusy(null);
  };

  const keyRef = useRef({ undo, redo, save });
  keyRef.current = { undo, redo, save };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
      const k = e.code;
      if (k === "KeyS") { e.preventDefault(); void keyRef.current.save(); }
      else if (!typing && k === "KeyZ" && !e.shiftKey) { e.preventDefault(); keyRef.current.undo(); force((n) => n + 1); }
      else if (!typing && (k === "KeyY" || (k === "KeyZ" && e.shiftKey))) { e.preventDefault(); keyRef.current.redo(); force((n) => n + 1); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // ── เพิ่มชิ้น ──
  const addRect = () => {
    const w = Number(window.prompt("ความกว้างชิ้น (ขนาดสำเร็จ) กี่ ซม.?", "30")), h = Number(window.prompt("ความสูงชิ้น กี่ ซม.?", "24"));
    if (!(w > 0 && h > 0 && w <= 500 && h <= 500)) return;
    const part: LayPart = doc?.pieces.some((p) => p.part === "front") ? (doc.pieces.some((p) => p.part === "back") ? "side" : "back") : "front";
    addPieces([{ id: newId("p"), part, name: LAY_PARTS.find((x) => x.key === part)!.th, shape: rectShape(w, h), count: 1, mirror: false, allow: 1, src: "rect" }]);
  };
  const openFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    try {
      if (ext === "svg" || ext === "dxf") {
        const text = await file.text();
        const shapes: { shape: Shape; holes: Shape[]; name?: string; count?: number; allow?: number }[] = [];
        if (ext === "svg") { const r = parseSvgShapes(text); if (r) shapes.push(...r.pieces); }
        else { const r = parseDxfPattern(text); if (r) shapes.push(...r.pieces.map((p) => ({ shape: p.shape, holes: p.holes, name: p.name, count: p.count, allow: p.allow }))); }
        if (!shapes.length) { toast.error("ไม่พบรูปปิดในไฟล์นี้ — ชิ้นต้องเป็นเส้นปิด"); return; }
        const base = file.name.replace(/\.[a-z0-9]+$/i, "");
        addPieces(shapes.slice(0, 40).map((s, i) => ({
          id: newId("p"), part: "other" as LayPart, name: s.name || (shapes.length > 1 ? `${base} ${i + 1}` : base),
          shape: normalizeShape(s.shape), holes: s.holes.length ? s.holes.map((h) => h) : undefined,
          count: Math.max(1, Math.min(MAX_COUNT, s.count ?? 1)), mirror: false, allow: s.allow ?? 1, src: ext as "svg" | "dxf",
        })));
        toast.info("ตั้งว่าแต่ละชิ้นเป็นส่วนไหนของกระเป๋า และเช็กขนาดในตาราง");
      } else if (file.type.startsWith("image/")) {
        setBusy("กำลังอัปรูปชิ้น…");
        const s = await shrinkToJpeg(file, 1600);
        const ref = await uploadImage(s.blob, "fabric-lay-piece.jpg");
        const w = Number(window.prompt("ความกว้างจริงของชิ้นนี้ (ขนาดสำเร็จ) กี่ ซม.?", "30"));
        if (!(w > 0 && w <= 500)) { setBusy(null); return; }
        const h = r1((w * s.h) / s.w);
        addPieces([{ id: newId("p"), part: "other", name: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80), shape: rectShape(w, h), count: 1, mirror: false, allow: 1, src: "image", ref }]);
        setBusy(null);
      } else toast.error("รองรับไฟล์ SVG · DXF · PNG · JPG");
    } catch (e) { toast.error(e instanceof Error ? e.message : "เปิดไฟล์ไม่สำเร็จ"); setBusy(null); }
  };
  const changeBag = async (file: File) => {
    setBusy("กำลังอัปรูปกระเป๋า…");
    try { const s = await shrinkToJpeg(file, 1600); const k = await uploadImage(s.blob, "fabric-lay-bag.jpg"); apply((d) => ({ ...d, bag_image: k })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "อัปรูปไม่สำเร็จ"); }
    setBusy(null);
  };

  if (err) return <div className="p-6"><ErrorState title={err} onRetry={() => void load()} /></div>;
  if (!doc || !row) return <div className="p-6"><LoadingState /></div>;
  const ro = !canEdit;
  const bagUrl = bagImgUrl(doc.bag_image, 400);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`${HOME}?tab=patterns`} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100"><Icon value="i:arrow-left" /> แบบตัดทั้งหมด</Link>
        <span className="font-mono text-xs text-slate-500">{row.code}</span>
        {row.parent_code && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{row.parent_code}</span>}
        {row.design_sheet_code && <span className="text-xs text-violet-700">ใบงาน {row.design_sheet_code}</span>}
        <span className="flex-1" />
        {canEdit && <>
          <button type="button" onClick={undo} disabled={!past.current.length} title="ย้อนกลับ (Ctrl+Z)" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"><Icon name="arrow-back-up" /></button>
          <button type="button" onClick={redo} disabled={!future.current.length} title="ทำซ้ำ (Ctrl+Y)" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"><Icon name="arrow-forward-up" /></button>
          <button type="button" onClick={() => void save()} disabled={!dirty || !!busy} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{busy ?? (dirty ? "บันทึก (Ctrl+S)" : "บันทึกแล้ว")}</button>
        </>}
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {bagUrl ? <img src={bagUrl} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">ยังไม่มีรูปกระเป๋า</div>}
          </div>
          {canEdit && <button type="button" onClick={() => bagRef.current?.click()} className="h-8 w-full rounded-lg border border-slate-200 text-xs hover:bg-slate-50">เปลี่ยนรูปกระเป๋า</button>}
          <p className="text-[11px] text-slate-500">รูปนี้ไปอยู่ใน JPEG สรุป เพื่อบอก ChatGPT ว่าตัดไปประกอบเป็นกระเป๋าทรงไหน</p>
          <input ref={bagRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void changeBag(f); }} />
        </div>
        <div className="space-y-3">
          <label className="block"><span className="text-xs text-slate-500">ชื่อแบบตัด</span>
            <input disabled={ro} value={doc.name} onChange={(e) => apply((d) => ({ ...d, name: e.target.value }))} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-medium" /></label>
          <label className="block"><span className="text-xs text-slate-500">โน้ต (เช่น วิธีเย็บ / ทิศลาย)</span>
            <textarea disabled={ro} value={doc.note} onChange={(e) => apply((d) => ({ ...d, note: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" /></label>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={addRect} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50"><Icon value="i:square" /> ชิ้นสี่เหลี่ยม</button>
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50"><Icon name="upload" /> โยนไฟล์ชิ้น (SVG · DXF · PNG · JPG)</button>
              <button type="button" onClick={() => setStudio(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-50 px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100"><Icon value="i:shopping-bag" /> ดึงจากสตูดิโอแพทเทิร์น</button>
              <input ref={fileRef} type="file" accept=".svg,.dxf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void openFile(f); }} />
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[64px_150px_minmax(0,1fr)_150px_70px_80px_80px_96px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500 lg:grid">
          <span /> <span>ส่วนของกระเป๋า</span><span>ชื่อชิ้น / โน้ต</span><span>ขนาดสำเร็จ (ซม.)</span><span>จำนวน</span><span>คู่ซ้าย-ขวา</span><span>เผื่อเย็บ</span><span />
        </div>
        {!doc.pieces.length && <div className="p-6 text-center text-sm text-slate-500">ยังไม่มีชิ้นแบบ — เพิ่มชิ้นสี่เหลี่ยม · โยนไฟล์ · หรือดึงจากสตูดิโอแพทเทิร์น</div>}
        {doc.pieces.map((p, i) => <PieceRow key={p.id} p={p} ro={ro} first={i === 0} last={i === doc.pieces.length - 1}
          onChange={(patch) => setPiece(p.id, patch)} onRemove={() => removePiece(p)} onMove={(d) => move(i, d)}
          onDup={() => addPieces([{ ...p, id: newId("p"), name: `${p.name} (สำเนา)` }])} />)}
      </div>
      <p className="text-xs text-slate-500">ขนาดสำเร็จ = ขนาดหลังเย็บ · เส้นตัดจริง = บวกเผื่อเย็บรอบชิ้น · คู่ซ้าย-ขวา = ชิ้นที่ 2, 4… ถูกพลิกกระจกให้อัตโนมัติตอนวางบนผ้า</p>

      <StudioImport open={studio} onClose={() => setStudio(false)} onImport={(ps) => { setStudio(false); addPieces(ps); }} />
    </div>
  );
}

function PieceRow({ p, ro, first, last, onChange, onRemove, onMove, onDup }: { p: LayPiece; ro: boolean; first: boolean; last: boolean; onChange: (patch: Partial<LayPiece>) => void; onRemove: () => void; onMove: (d: -1 | 1) => void; onDup: () => void }) {
  const b = shapeBox(p.shape);
  const [w, setW] = useState(String(r1(b.w))), [h, setH] = useState(String(r1(b.h)));
  useEffect(() => { setW(String(r1(b.w))); setH(String(r1(b.h))); }, [b.w, b.h]);
  const commitSize = () => {
    const nw = Number(w), nh = Number(h);
    if (!(nw > 0 && nh > 0 && nw <= 500 && nh <= 500)) { setW(String(r1(b.w))); setH(String(r1(b.h))); return; }
    if (Math.abs(nw - b.w) < 0.01 && Math.abs(nh - b.h) < 0.01) return;
    const sx = nw / b.w, sy = nh / b.h;
    onChange({ shape: fitShape(p.shape, 0, 0, nw, nh), holes: p.holes?.map((hs) => { const hb = shapeBox(hs); return fitShape(hs, (hb.x - b.x) * sx, (hb.y - b.y) * sy, hb.w * sx, hb.h * sy); }) });
  };
  const inp = "h-8 rounded-md border border-slate-200 px-2 text-sm disabled:bg-slate-50";
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 border-b border-slate-100 px-3 py-2 last:border-0 lg:grid-cols-[64px_150px_minmax(0,1fr)_150px_70px_80px_80px_96px] lg:items-center">
      <PieceThumb piece={p} size={56} />
      <div className="grid gap-1.5 sm:grid-cols-2 lg:contents">
        <select disabled={ro} value={p.part} onChange={(e) => { const part = e.target.value as LayPart; const old = LAY_PARTS.find((x) => x.key === p.part)?.th; onChange({ part, ...(p.name === old ? { name: LAY_PARTS.find((x) => x.key === part)!.th } : {}) }); }} className={inp} aria-label="ส่วนของกระเป๋า">
          {LAY_PARTS.map((x) => <option key={x.key} value={x.key}>{x.th}</option>)}
        </select>
        <div className="min-w-0 space-y-1">
          <input disabled={ro} value={p.name} onChange={(e) => onChange({ name: e.target.value.slice(0, 80) })} className={`${inp} w-full`} aria-label="ชื่อชิ้น" />
          <input disabled={ro} value={p.note ?? ""} onChange={(e) => onChange({ note: e.target.value.slice(0, 300) || undefined })} placeholder="โน้ต เช่น ลายหัวขึ้น / อยู่ฝั่งหูจับ" className={`${inp} w-full text-xs`} aria-label="โน้ตชิ้น" />
        </div>
        <div className="flex items-center gap-1 text-sm">
          <input disabled={ro} inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} onBlur={commitSize} onKeyDown={(e) => e.key === "Enter" && commitSize()} className={`${inp} w-16 text-right`} aria-label="กว้าง" />
          <span>×</span>
          <input disabled={ro} inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)} onBlur={commitSize} onKeyDown={(e) => e.key === "Enter" && commitSize()} className={`${inp} w-16 text-right`} aria-label="สูง" />
        </div>
        <label className="flex items-center gap-1 text-xs text-slate-500 lg:block"><span className="lg:hidden">จำนวน</span>
          <input disabled={ro} type="number" min={1} max={MAX_COUNT} value={p.count} onChange={(e) => onChange({ count: Math.max(1, Math.min(MAX_COUNT, Math.round(Number(e.target.value) || 1))) })} className={`${inp} w-16`} /></label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input disabled={ro} type="checkbox" checked={p.mirror} onChange={(e) => onChange({ mirror: e.target.checked })} /> พลิกคู่</label>
        <label className="flex items-center gap-1 text-xs text-slate-500"><span className="lg:hidden">เผื่อเย็บ</span>
          <input disabled={ro} inputMode="decimal" value={p.allow} onChange={(e) => onChange({ allow: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })} className={`${inp} w-14 text-right`} /> ซม.</label>
        {!ro && (
          <div className="flex items-center justify-end gap-0.5">
            <button type="button" disabled={first} onClick={() => onMove(-1)} aria-label="เลื่อนขึ้น" className="h-7 w-7 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"><Icon value="i:chevron-up" /></button>
            <button type="button" disabled={last} onClick={() => onMove(1)} aria-label="เลื่อนลง" className="h-7 w-7 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"><Icon value="i:chevron-down" /></button>
            <button type="button" onClick={onDup} aria-label="ทำสำเนา" className="h-7 w-7 rounded text-slate-500 hover:bg-slate-100"><Icon name="copy" /></button>
            <button type="button" onClick={onRemove} aria-label="ลบชิ้น" className="h-7 w-7 rounded text-red-500 hover:bg-red-50"><Icon name="trash" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

type StudioRow = { id: string; pattern_no: string; name: string; sku_code: string | null; piece_count: number; thumb: string | null };
type StudioPiece = { pid: string; name: string; count: number; allow: number; shape: unknown; holes?: unknown[] };

/** ดึงชิ้นจากแพทเทิร์นในสตูดิโอแพทเทิร์น — เลือกแพทเทิร์น → ติ๊กชิ้น → เพิ่ม (ส่วนของกระเป๋าเดาจากชื่อชิ้น) */
function StudioImport({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (ps: LayPiece[]) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<StudioRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<{ row: StudioRow; pieces: StudioPiece[] } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setPick(null); setErr(null); setRows(null);
    fetchJson<StudioRow[]>("/api/pattern-projects?status=all").then(setRows).catch((e) => setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
  }, [open]);

  const openRow = async (r: StudioRow) => {
    try {
      const d = await fetchJson<{ pieces: StudioPiece[] }>(`/api/pattern-projects/${r.id}`);
      setPick({ row: r, pieces: d.pieces ?? [] }); setSel(new Set((d.pieces ?? []).map((p) => p.pid)));
    } catch (e) { toast.error(e instanceof Error ? e.message : "เปิดแพทเทิร์นไม่สำเร็จ"); }
  };
  const guessPart = (name: string): LayPart => {
    const n = name.toLowerCase();
    const map: [RegExp, LayPart][] = [[/หน้า|front/, "front"], [/หลัง|back/, "back"], [/ข้าง|side|gusset/, "side"], [/ก้น|ฐาน|bottom|base/, "bottom"], [/ฝา|flap/, "flap"], [/ซิป|บน|top|zip/, "top"], [/ช่อง|pocket/, "pocket"], [/หู|handle/, "handle"], [/สาย|strap/, "strap"], [/ซับ|lining/, "lining"]];
    return map.find(([re]) => re.test(n))?.[1] ?? "other";
  };
  const doImport = () => {
    if (!pick) return;
    const out: LayPiece[] = [];
    for (const p of pick.pieces) {
      if (!sel.has(p.pid)) continue;
      const shape = cleanShape(p.shape); if (!shape) continue;
      const b = shapeBox(shape);
      const holes = (p.holes ?? []).map(cleanShape).filter((h): h is Shape => !!h).map((h) => { const hb = shapeBox(h); return fitShape(h, hb.x - b.x, hb.y - b.y, hb.w, hb.h); });
      out.push({ id: newId("p"), part: guessPart(p.name), name: p.name.slice(0, 80) || "ชิ้น", shape: normalizeShape(shape), ...(holes.length ? { holes } : {}), count: Math.max(1, Math.min(MAX_COUNT, p.count || 1)), mirror: false, allow: Math.min(5, Math.max(0, p.allow || 0)), src: "pattern", note: `จากแพทเทิร์น ${pick.row.pattern_no}` });
    }
    if (!out.length) { toast.warning("ติ๊กชิ้นที่จะเอามาก่อน"); return; }
    onImport(out);
  };

  const shown = (rows ?? []).filter((r) => !q || `${r.pattern_no} ${r.name} ${r.sku_code ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <ERPModal open={open} onClose={onClose} title={pick ? `เลือกชิ้นจาก ${pick.row.pattern_no}` : "ดึงชิ้นจากสตูดิโอแพทเทิร์น"} size="lg"
      footer={pick ? <div className="flex w-full justify-between gap-2">
        <button type="button" onClick={() => setPick(null)} className="h-9 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100">← เลือกแพทเทิร์นอื่น</button>
        <button type="button" onClick={doImport} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700">เพิ่ม {sel.size} ชิ้น</button>
      </div> : undefined}>
      {err ? <ErrorState title={err} /> : rows === null ? <LoadingState /> : pick ? (
        <div className="space-y-1">
          {!pick.pieces.length && <p className="text-sm text-slate-500">แพทเทิร์นนี้ยังไม่มีชิ้น</p>}
          {pick.pieces.map((p) => {
            const shape = cleanShape(p.shape); const b = shape ? shapeBox(shape) : null;
            return (
              <label key={p.pid} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={sel.has(p.pid)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(p.pid); else n.delete(p.pid); return n; })} />
                {shape && <PieceThumb piece={{ id: p.pid, part: "other", name: p.name, shape, count: 1, mirror: false, allow: p.allow || 0, src: "pattern" }} size={40} />}
                <span className="flex-1">{p.name}</span>
                <span className="text-xs text-slate-500">{b ? `${r1(b.w)}×${r1(b.h)} ซม.` : "รูปทรงใช้ไม่ได้"} · ×{p.count || 1}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นเลข / ชื่อแพทเทิร์น / SKU" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          {!shown.length && <p className="text-sm text-slate-500">ไม่พบแพทเทิร์น</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {shown.slice(0, 120).map((r) => (
              <button key={r.id} type="button" onClick={() => void openRow(r)} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-left text-sm hover:bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {studioThumbUrl(r.thumb) ? <img src={studioThumbUrl(r.thumb) ?? ""} alt="" className="h-10 w-10 rounded bg-slate-50 object-contain" /> : <span className="h-10 w-10 rounded bg-slate-100" />}
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.name}</span><span className="text-xs text-slate-500">{r.pattern_no}{r.sku_code ? ` · ${r.sku_code}` : ""} · {r.piece_count} ชิ้น</span></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </ERPModal>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const { apiFetch } = await import("@/lib/api");
  const res = await apiFetch(url);
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || (res.status === 403 ? "คุณไม่มีสิทธิ์เปิดสตูดิโอแพทเทิร์น" : "โหลดไม่สำเร็จ"));
  return j.data as T;
}
