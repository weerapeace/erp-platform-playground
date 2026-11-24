"use client";
/**
 * 🧱 บล็อกพิมพ์ — หน้าทำงาน (/master/block-print/<id>)  · แบบที่เจ้าของเลือกใน widget รอบ 3
 *   ซ้าย = ชิ้นที่พบในไฟล์ (ติ๊ก = ส่งออก) · กลาง = ภาพหน้ากระดาษ "หน้าตา PDF จริง" · ขวา = ตั้งขนาดชิ้นที่เลือก
 *   ตั้งกว้าง/สูง (ซม./มม.) ล็อกสัดส่วนได้ · ให้ทุกชิ้นสูงเท่ากัน · กลับขนาดเดิม · รวมหลายชิ้นเป็นชิ้นเดียว (Shift/Ctrl+คลิก เลือกหลายชิ้น)
 *   ย้อนกลับ/ทำซ้ำ: Ctrl+Z · Ctrl+Shift+Z / Ctrl+Y · บันทึก Ctrl+S · ออกจากหน้าตอนยังไม่บันทึก = ถามก่อน
 *   ส่งออก PDF = lib/block-print-pdf (ตำแหน่ง/เส้นบอกขนาดตัวเดียวกับภาพบนจอ) + จดประวัติการส่งออก
 *   มือถือ: ภาพอยู่บน · รายการชิ้นเป็นปุ่มแนวนอน · แผงขนาดอยู่ล่าง · ปุ่มบันทึก/PDF ติดล่างจอ
 *   ขั้นเลือกชิ้น (grouper.tsx): เปิดไฟล์ใหม่ (?step=group) หรือกด "จัดกลุ่มชิ้นใหม่" → รวม/แยกชิ้น → กด "ต่อไป" = ใช้ + บันทึกให้เลย
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { shortcutKey } from "@/lib/shortcut-key";
import { downloadBlob } from "@/lib/pdf-merge-engine";
import { buildBlockPdf } from "@/lib/block-print-pdf";
import {
  DIM_COLORS, PAPERS, UNITS, dimGeometry, equalHeight, fmtDim, fromUnit, isResized, layoutFree, layoutPage, mergePieces,
  opsToSvgPath, pdfFileName, pieceShapes, piecesForSave, resetPieceSize, setPieceSize, toUnit,
  type BlockPaper, type BlockPiece, type BlockUnit, type PlacedPiece,
} from "@/lib/block-print";
import { API, api, LIST_HREF, skippedNote, thaiDate, type Job } from "./shared";
import { SKIPPED_KEY } from "./list";
import { BlockPieceGrouper } from "./grouper";

type Doc = { name: string; unit: BlockUnit; paper: BlockPaper; pieces: BlockPiece[] };
const docKey = (d: Doc | null) => (d ? JSON.stringify(d) : "");

export function BlockPrintEditor({ id }: { id: string }) {
  const toast = useToast();
  const canEdit = usePermission("block_print.edit");
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [savedKey, setSavedKey] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [lock, setLock] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [step, setStep] = useState<"size" | "group">("size");
  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const j = await api<Job>(`${API}/${id}`);
      const d: Doc = { name: j.name, unit: j.unit, paper: j.paper, pieces: j.pieces ?? [] };
      setJob(j); setDoc(d); setSavedKey(docKey(d)); past.current = []; future.current = [];
      setSel(d.pieces[0] ? [d.pieces[0].id] : []);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  // เปิดไฟล์ใหม่จากหน้ารายการ → เข้าขั้นเลือกชิ้นก่อน (ลบ ?step ออกจากลิงก์ กดรีเฟรชแล้วไม่วนกลับมา)
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("step") !== "group") return;
    setStep("group");
    u.searchParams.delete("step");
    window.history.replaceState(null, "", u.pathname + u.search);
  }, []);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SKIPPED_KEY(id));
      if (!raw) return;
      sessionStorage.removeItem(SKIPPED_KEY(id));
      const s = JSON.parse(raw) as { strokes: number; texts: number; images: number; whites: number; backgrounds?: number; pages?: number };
      const n = skippedNote(s);
      if ((s.pages ?? 1) > 1) n.push(`ไฟล์มี ${s.pages} อาร์ตบอร์ด — นำเข้าเฉพาะอาร์ตบอร์ดแรก`);
      setNotes(n);
    } catch { /* ไม่มีที่จำ */ }
  }, [id]);

  const dirty = !!doc && docKey(doc) !== savedKey;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  /** แก้เอกสาร + จดลงประวัติย้อนกลับ · คืนเอกสารใหม่ (null = ไม่เปลี่ยน) */
  const apply = (fn: (d: Doc) => Doc): Doc | null => {
    if (!doc || !canEdit) return null;
    const n = fn(doc);
    if (docKey(n) === docKey(doc)) return null;
    past.current.push(doc);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    setDoc(n);
    return n;
  };
  const undo = () => { const p = past.current.pop(); if (!p || !doc) return; future.current.push(doc); setDoc(p); };
  const redo = () => { const f = future.current.pop(); if (!f || !doc) return; past.current.push(doc); setDoc(f); };
  const setPieces = (fn: (ps: BlockPiece[]) => BlockPiece[]) => apply((d) => ({ ...d, pieces: fn(d.pieces) }));

  const save = async (next?: Doc, okText = "บันทึกแล้ว") => {
    const d = next ?? doc;
    if (!d || !canEdit || saving) return;
    setSaving(true);
    try {
      const j = await api<Job>(`${API}/${id}`, { method: "PATCH", json: { ...d, pieces: piecesForSave(d.pieces) } });
      setJob(j); setSavedKey(docKey(d));
      toast.success(okText);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    setSaving(false);
  };

  /** จบขั้นเลือกชิ้น → ใช้ชิ้นใหม่ + บันทึกให้เลย (ย้อนกลับได้ด้วยปุ่มย้อน/Ctrl+Z) */
  const finishGrouping = (ps: BlockPiece[]) => {
    setStep("size");
    const n = apply((d) => ({ ...d, pieces: ps }));
    const first = ps.find((p) => p.on) ?? ps[0];
    setSel(first ? [first.id] : []);
    if (n) void save(n, `จัดกลุ่มแล้ว · ${ps.filter((p) => p.on).length} ชิ้นที่ส่งออก`);
  };

  const exportPdf = async () => {
    if (!doc || !job || exporting) return;
    setExporting(true);
    try {
      const blob = await buildBlockPdf(doc.pieces, { paper: doc.paper, unit: doc.unit, title: `${job.code} ${doc.name}` });
      downloadBlob(blob, pdfFileName(job.code, doc.name));
      void api(`${API}/${id}/export`, { json: { paper: doc.paper, unit: doc.unit, pieces: doc.pieces.filter((p) => p.on).map((p) => ({ name: p.name, w: p.w, h: p.h })) } }).catch(() => undefined);
      toast.success("ส่งออก PDF แล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ส่งออกไม่สำเร็จ"); }
    setExporting(false);
  };

  // คีย์ลัด (ไม่ยุ่งตอนพิมพ์ในช่อง — ให้ช่องย้อนเองได้)
  const keyRef = useRef({ undo, redo, save, step });
  keyRef.current = { undo, redo, save, step };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (keyRef.current.step === "group") return;   // หน้าเลือกชิ้นมีคีย์ลัดของตัวเอง
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = shortcutKey(e).toLowerCase();
      if (k === "s") { e.preventDefault(); void keyRef.current.save(); return; }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (k === "z" && !e.shiftKey) { e.preventDefault(); keyRef.current.undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); keyRef.current.redo(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const pick = (pid: string, multi: boolean) =>
    setSel((cur) => (multi ? (cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid]) : [pid]));

  const pieces = doc?.pieces ?? [];
  const primary = pieces.find((p) => p.id === sel[sel.length - 1]) ?? null;
  const lay = useMemo(() => (doc ? layoutPage(doc.pieces, doc.paper) : null), [doc]);

  if (err) return <div className="p-6"><ErrorState title="เปิดงานไม่สำเร็จ" hint={err} onRetry={() => void load()} /></div>;
  if (!doc || !job) return <div className="p-6"><LoadingState label="กำลังเปิดงาน…" /></div>;

  if (step === "group" && canEdit) return <BlockPieceGrouper pieces={doc.pieces} onDone={finishGrouping} onCancel={() => setStep("size")} />;

  const unit = doc.unit;
  const onCount = pieces.filter((p) => p.on).length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-3 p-3 pb-24 md:p-5 lg:pb-5">
      {/* หัวหน้า */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={LIST_HREF} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100"><Icon name="back" /> งานทั้งหมด</Link>
        <span className="font-mono text-xs text-slate-500">{job.code}</span>
        <input key={`name-${doc.name}`} defaultValue={doc.name} disabled={!canEdit} aria-label="ชื่องาน"
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== doc.name) apply((d) => ({ ...d, name: v.slice(0, 120) })); else e.target.value = doc.name; }}
          className="h-9 min-w-0 flex-1 rounded-lg border border-transparent px-2 text-base font-semibold text-slate-900 hover:border-slate-200 focus:border-indigo-300 focus:outline-none disabled:bg-transparent md:max-w-md" />
        <span className="text-xs text-slate-400">{job.source_file_name ?? ""}{job.source_file_name ? " · " : ""}แก้ล่าสุด {thaiDate(job.updated_at)}</span>
        <div className="ml-auto flex items-center gap-1">
          {canEdit && <>
            <button type="button" onClick={undo} disabled={!past.current.length} title="ย้อนกลับ (Ctrl+Z)" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"><Icon name="arrow-back-up" /></button>
            <button type="button" onClick={redo} disabled={!future.current.length} title="ทำซ้ำ (Ctrl+Shift+Z)" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"><Icon name="arrow-forward-up" /></button>
          </>}
          <ActionButtons canEdit={canEdit} dirty={dirty} saving={saving} exporting={exporting} onSave={() => void save()} onExport={exportPdf} className="hidden lg:flex" />
        </div>
      </div>

      {notes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <div className="mb-1 flex items-center gap-1 font-medium"><Icon name="info" /> เปิดไฟล์แล้ว — สิ่งที่ไม่ได้นำเข้า</div>
          <ul className="list-disc space-y-0.5 pl-5">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <button type="button" onClick={() => setNotes([])} className="mt-1 text-xs text-amber-700 underline">รับทราบ</button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[250px_minmax(0,1fr)_270px]">
        {/* ซ้าย: ชิ้นที่พบในไฟล์ */}
        <aside className="order-2 min-w-0 rounded-xl border border-slate-200 bg-white lg:order-1">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <span className="flex-1 text-sm font-medium text-slate-800">ชิ้นในไฟล์ <span className="font-normal text-slate-500">· ส่งออก {onCount}/{pieces.length}</span></span>
            {canEdit && <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => setPieces((ps) => { const all = ps.every((p) => p.on); return ps.map((p) => ({ ...p, on: !all })); })}>
              {pieces.every((p) => p.on) ? "เอาออกทั้งหมด" : "ติ๊กทั้งหมด"}</button>}
          </div>
          {canEdit && <button type="button" onClick={() => setStep("group")}
            className="mx-2 mt-2 inline-flex h-8 w-[calc(100%-1rem)] items-center justify-center gap-1.5 rounded-lg border border-dashed border-indigo-300 text-xs text-indigo-700 hover:bg-indigo-50">
            <Icon name="link" /> จัดกลุ่มชิ้นใหม่ (รวม / แยกชิ้น)</button>}
          <div className="flex gap-1.5 overflow-x-auto p-2 lg:max-h-[60vh] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
            {pieces.map((p) => {
              const active = sel.includes(p.id);
              return (
                <div key={p.id} onClick={(e) => pick(p.id, e.shiftKey || e.ctrlKey || e.metaKey)}
                  className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${active ? "border-indigo-300 bg-indigo-50" : "border-transparent hover:bg-slate-50"}`}>
                  <input type="checkbox" checked={p.on} disabled={!canEdit} aria-label={`ส่งออก ${p.name}`}
                    onClick={(e) => e.stopPropagation()} onChange={() => setPieces((ps) => ps.map((x) => (x.id === p.id ? { ...x, on: !x.on } : x)))} />
                  <PieceThumb p={p} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="whitespace-nowrap text-xs text-slate-500">{toUnit(p.w, unit)}×{toUnit(p.h, unit)}</span>
                </div>
              );
            })}
          </div>
          <div className="hidden border-t border-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-500 lg:block">Shift / Ctrl + คลิก = เลือกหลายชิ้น (ไว้รวมชิ้น หรือดูหลายชิ้นพร้อมกัน)</div>
        </aside>

        {/* กลาง: หน้ากระดาษ = หน้าตา PDF */}
        <section className="order-1 min-w-0 space-y-2 lg:order-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">กระดาษ</span>
            {(Object.keys(PAPERS) as BlockPaper[]).map((k) => (
              <button key={k} type="button" disabled={!canEdit} onClick={() => apply((d) => ({ ...d, paper: k }))}
                className={`h-7 rounded-md border px-2.5 text-xs ${doc.paper === k ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600"}`}>{k}</button>
            ))}
            <span className="ml-2 text-slate-500">หน่วยบนเส้น</span>
            {UNITS.map((u) => (
              <button key={u.key} type="button" disabled={!canEdit} onClick={() => apply((d) => ({ ...d, unit: u.key }))}
                className={`h-7 rounded-md border px-2.5 text-xs ${unit === u.key ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600"}`}>{u.th}</button>
            ))}
            {lay?.ok && <span className="ml-auto text-xs text-slate-400">{doc.paper} {lay.orientation === "portrait" ? "แนวตั้ง" : "แนวนอน"} · ขนาดจริง 1:1</span>}
          </div>
          {lay && !lay.ok && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{lay.error}</div>}
          <div className="rounded-xl bg-slate-100 p-2 md:p-4">
            <PagePreview doc={doc} sel={sel} onPick={pick} />
          </div>
          <p className="text-xs text-slate-500">{lay?.ok
            ? "ภาพนี้คือหน้าตา PDF จริง — กรอบสีฟ้าของชิ้นที่เลือกไม่ติดไปในไฟล์"
            : "ตอนนี้ยังวางลงหน้ากระดาษไม่พอ — ภาพนี้เรียงให้ดูชิ้นทั้งหมดก่อน (ยังไม่ใช่หน้าตา PDF) · ติ๊กออกบางชิ้น ลดขนาด หรือเปลี่ยนกระดาษ"}</p>
        </section>

        {/* ขวา: ตั้งขนาด */}
        <aside className="order-3 min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          {!primary ? <p className="text-sm text-slate-500">เลือกชิ้นจากรายการหรือกดที่ภาพ</p> : <>
            <input key={`pn-${primary.id}-${primary.name}`} defaultValue={primary.name} disabled={!canEdit} aria-label="ชื่อชิ้น"
              onBlur={(e) => { const v = e.target.value.trim().slice(0, 80); if (v && v !== primary.name) setPieces((ps) => ps.map((x) => (x.id === primary.id ? { ...x, name: v } : x))); else e.target.value = primary.name; }}
              className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-medium" />
            <div className="grid grid-cols-2 gap-2">
              <SizeInput label={`กว้าง (${unit === "cm" ? "ซม." : "มม."})`} mm={primary.w} unit={unit} disabled={!canEdit}
                onCommit={(mm) => setPieces((ps) => ps.map((x) => (x.id === primary.id ? setPieceSize(x, "w", mm, lock) : x)))} />
              <SizeInput label={`สูง (${unit === "cm" ? "ซม." : "มม."})`} mm={primary.h} unit={unit} disabled={!canEdit}
                onCommit={(mm) => setPieces((ps) => ps.map((x) => (x.id === primary.id ? setPieceSize(x, "h", mm, lock) : x)))} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> ล็อกสัดส่วน</label>
            <div className="text-xs text-slate-500">ขนาดเดิมในไฟล์: {fmtDim(primary.ow, unit)} × {fmtDim(primary.oh, unit)}</div>
            {canEdit && <div className="grid gap-1.5">
              <button type="button" onClick={() => setPieces((ps) => equalHeight(ps, primary.id))} className="h-9 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50">ให้ทุกชิ้นที่ติ๊กสูงเท่าตัวนี้</button>
              <button type="button" disabled={!isResized(primary)} onClick={() => setPieces((ps) => ps.map((x) => (x.id === primary.id ? resetPieceSize(x) : x)))} className="h-9 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">กลับเป็นขนาดเดิมในไฟล์</button>
              {sel.length > 1 && <button type="button" onClick={() => { const ids = pieces.filter((p) => sel.includes(p.id)).map((p) => p.id); setPieces((ps) => mergePieces(ps, ids)); setSel([ids[0]]); toast.action(`รวม ${ids.length} ชิ้นเป็นชิ้นเดียวแล้ว`, "ย้อนกลับ", () => keyRef.current.undo()); }}
                className="h-9 rounded-lg border border-indigo-200 bg-indigo-50 text-sm text-indigo-700 hover:bg-indigo-100">รวม {sel.length} ชิ้นที่เลือกเป็นชิ้นเดียว</button>}
            </div>}
          </>}
          <ActionButtons canEdit={canEdit} dirty={dirty} saving={saving} exporting={exporting} onSave={() => void save()} onExport={exportPdf} className="hidden flex-col lg:flex" />
        </aside>
      </div>

      {/* มือถือ: ปุ่มติดล่างจอ */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-2 lg:hidden">
        <ActionButtons canEdit={canEdit} dirty={dirty} saving={saving} exporting={exporting} onSave={() => void save()} onExport={exportPdf} className="flex" />
      </div>
    </div>
  );
}

function ActionButtons({ canEdit, dirty, saving, exporting, onSave, onExport, className = "" }: {
  canEdit: boolean; dirty: boolean; saving: boolean; exporting: boolean; onSave: () => void; onExport: () => void; className?: string;
}) {
  return (
    <div className={`gap-1.5 ${className}`}>
      {canEdit && <button type="button" onClick={onSave} disabled={!dirty || saving}
        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        <Icon name="save" /> {saving ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}</button>}
      <button type="button" onClick={onExport} disabled={exporting}
        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
        <Icon name="download" /> {exporting ? "กำลังสร้าง PDF…" : "ส่งออก PDF"}</button>
    </div>
  );
}

/** ช่องกรอกขนาด — พิมพ์แล้วกด Enter หรือออกจากช่องถึงจะใช้ (ไม่เด้งระหว่างพิมพ์) */
function SizeInput({ label, mm, unit, disabled, onCommit }: { label: string; mm: number; unit: BlockUnit; disabled: boolean; onCommit: (mm: number) => void }) {
  const shown = String(toUnit(mm, unit));
  const [v, setV] = useState(shown);
  useEffect(() => { setV(shown); }, [shown]);
  const commit = () => {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n) && n > 0 && String(n) !== shown) onCommit(fromUnit(n, unit)); else setV(shown);
  };
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <input inputMode="decimal" value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm tabular-nums" />
    </label>
  );
}

function PieceThumb({ p }: { p: BlockPiece }) {
  const s = 22 / Math.max(p.ow, p.oh);
  return (
    <svg width={24} height={24} viewBox="-1 -1 24 24" className="shrink-0 rounded bg-slate-50">
      {pieceShapes(p).map((sh, i) => <path key={i} d={opsToSvgPath(sh.d, s, s, (22 - p.ow * s) / 2, (22 - p.oh * s) / 2)} fill="#111" fillRule={sh.fill} />)}
    </svg>
  );
}

/** หน้ากระดาษ + ชิ้น + เส้นบอกขนาด — ใช้ layoutPage/dimGeometry ตัวเดียวกับตัวเขียน PDF */
function PagePreview({ doc, sel, onPick }: { doc: Doc; sel: string[]; onPick: (id: string, multi: boolean) => void }) {
  const lay = layoutPage(doc.pieces, doc.paper);
  const byId = new Map(doc.pieces.map((p) => [p.id, p]));
  let w: number, h: number, items: PlacedPiece[], page = false;
  if (lay.ok) { w = lay.pageW; h = lay.pageH; items = lay.items; page = true; }
  else { const r = layoutFree(doc.pieces, doc.paper); w = Math.max(r.w, 60); h = Math.max(r.h, 30); items = r.items; }
  if (!items.length) return <div className="flex h-48 items-center justify-center text-sm text-slate-500">ยังไม่ได้ติ๊กชิ้นที่จะส่งออก</div>;
  return (
    <div className="mx-auto" style={{ maxWidth: page ? (w > h ? 900 : 620) : undefined }}>
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full bg-white shadow-sm" role="img" aria-label="ภาพตัวอย่าง PDF">
        {items.map((it) => {
          const p = byId.get(it.id)!;
          const g = dimGeometry(it, doc.unit);
          return (
            <g key={it.id}>
              {g.lines.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.kind === "guide" ? DIM_COLORS.guide : DIM_COLORS.dim} strokeWidth={l.kind === "guide" ? 0.15 : 0.3} />)}
              {g.texts.map((t, i) => (
                <text key={i} x={t.x} y={t.y} fontSize={3.2} fontFamily="Courier New, monospace" fill={DIM_COLORS.text}
                  textAnchor="middle" transform={t.rotate ? `rotate(90 ${t.x} ${t.y})` : undefined}>{t.text}</text>
              ))}
              {pieceShapes(p).map((sh, i) => <path key={i} d={opsToSvgPath(sh.d, it.w / p.ow, it.h / p.oh, it.x, it.y)} fill="#000" fillRule={sh.fill} />)}
              <rect x={it.x} y={it.y} width={it.w} height={it.h} fill="transparent" style={{ cursor: "pointer" }}
                onClick={(e) => onPick(it.id, e.shiftKey || e.ctrlKey || e.metaKey)} />
              {sel.includes(it.id) && <rect x={it.x - 1} y={it.y - 1} width={it.w + 2} height={it.h + 2} fill="none" stroke="#3b82f6" strokeWidth={0.4} strokeDasharray="1.5 1" pointerEvents="none" />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
