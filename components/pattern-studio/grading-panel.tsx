"use client";
/**
 * 📏 GradingPanel — ขยายไซซ์ (Bag CAD รอบ I2 · ส่วนของสตูดิโอแพทเทิร์น)
 *   ตั้งรายชื่อไซซ์ + ไซซ์ตั้งต้น (= แบบบนกระดาน) · กฎกลาง (กว้าง/สูงเพิ่มต่อไซซ์ + จุดยึด) · กฎเฉพาะชิ้น + กฎรายจุด
 *   ซ้อนดูทุกไซซ์บนกระดาน (เส้นประสีต่อไซซ์) · ตรวจตะเข็บทุกไซซ์ · ตารางขนาด · ไฟล์ทุกไซซ์ (.json) · CSV
 *   สูตร: lib/pattern-grading · เก็บใน template.grading
 *
 *   <GradingPanel live={pieces} seams={seams} spec={grading} onSpec={(g) => …} onGhosts={(g) => …} />
 * ใช้ที่: components/pattern-studio · คู่มือ: docs/pattern-studio.md (รอบ I2)
 */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { StepInput } from "@/components/step-input";
import { DEFAULT_GRADING, GRADE_ANCHORS, GRADE_MAX_SIZES, buildGradedFile, gradeSeamReport, gradeSizeCsv, gradeSizeRows, gradeSizes, ruleFor, type GradeAnchor, type GradeSpec, type PieceGrade } from "@/lib/pattern-grading";
import { pieceEdges, type EdgeMeta, type Seam } from "@/lib/pattern-seams";
import type { InnerLine, Pt, Shape } from "@/lib/pattern-shape";

export type GradePieceIn = { pid: string; name?: string; shape: Shape; holes?: Shape[] | null; grain?: Pt[] | null; notches?: Pt[] | null; inner?: InnerLine[] | null; edgeMeta?: EdgeMeta[] | null };
export type GradeGhost = { shape: Shape; holes?: Shape[]; color: string };
/** สีเส้นประของไซซ์ (เล็ก → ใหญ่) */
const SIZE_COLORS = ["#0284c7", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#9333ea", "#e11d48", "#ca8a04", "#4f46e5"];

const download = (name: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function GradingPanel({ live, seams, spec, onSpec, onGhosts, readonly = false, fileBase = "pattern", tol }: {
  live: GradePieceIn[]; seams: Seam[];
  spec: GradeSpec | null;
  onSpec?: (g: GradeSpec | null) => void;
  /** เส้นประของทุกไซซ์ (ยกเว้นตั้งต้น) ที่ซ้อนบนกระดาน · null = ไม่ซ้อน */
  onGhosts: (g: GradeGhost[] | null) => void;
  readonly?: boolean; fileBase?: string; tol?: number;
}) {
  const t = useT();
  const [overlay, setOverlay] = useState(true);
  const [pick, setPick] = useState<string>("");
  const [sizeTxt, setSizeTxt] = useState((spec ?? DEFAULT_GRADING).sizes.join(", "));
  useEffect(() => { if (spec) setSizeTxt(spec.sizes.join(", ")); }, [spec]);
  const can = !readonly && !!onSpec;
  const set = (g: GradeSpec) => onSpec?.(g);

  const graded = useMemo(() => (spec ? gradeSizes(live, spec) : []), [live, spec]);
  const report = useMemo(() => (spec ? gradeSeamReport(live, seams, spec, tol) : []), [live, seams, spec, tol]);
  const rows = useMemo(() => (spec ? gradeSizeRows(live, spec) : []), [live, spec]);
  useEffect(() => {
    if (!spec || !overlay) { onGhosts(null); return; }
    onGhosts(graded.flatMap((s, i) => (s.step === 0 ? [] : s.pieces.map((p) => ({ shape: p.shape, holes: p.holes ?? [], color: SIZE_COLORS[i % SIZE_COLORS.length] })))));
  }, [graded, overlay, spec, onGhosts]);
  useEffect(() => () => onGhosts(null), [onGhosts]);

  if (!spec) return (
    <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-xs" data-grading-panel>
      <div className="font-medium text-slate-700">{t("ขยายไซซ์ (Grading)", "Size grading")}</div>
      <p className="text-slate-600">{t("แบบบนกระดาน = ไซซ์ตั้งต้น · ตั้งว่าไซซ์ถัดไปกว้าง/สูงเพิ่มเท่าไร แล้วดูทุกไซซ์ซ้อนกัน + ตรวจตะเข็บทุกไซซ์", "The board = the base size · set how much each next size grows, then see every size overlaid + check seams in every size")}</p>
      {can ? <button type="button" data-grade-start onClick={() => set(DEFAULT_GRADING)} className="h-8 rounded-md border border-sky-300 bg-white px-3 text-sky-800 hover:bg-sky-50">{t("เริ่มตั้งไซซ์ (S M L · +2 ซม.)", "Start grading (S M L · +2 cm)")}</button>
        : <p className="text-slate-400">{t("ยังไม่ได้ตั้งไซซ์", "No grading set")}</p>}
    </div>
  );

  const applySizes = () => {
    const sizes = [...new Set(sizeTxt.split(/[,\s]+/).map((s) => s.trim().slice(0, 12)).filter(Boolean))].slice(0, GRADE_MAX_SIZES);
    if (sizes.length < 2) { setSizeTxt(spec.sizes.join(", ")); return; }
    const baseName = spec.sizes[spec.base], base = sizes.indexOf(baseName);
    set({ ...spec, sizes, base: base >= 0 ? base : Math.min(spec.base, sizes.length - 1) });
  };
  const pickPiece = live.find((p) => p.pid === pick) ?? null;
  const own = pickPiece ? spec.rules[pickPiece.pid] ?? null : null;
  const setRule = (pid: string, g: PieceGrade | null) => { const rules = { ...spec.rules }; if (g) rules[pid] = g; else delete rules[pid]; set({ ...spec, rules }); };
  const ruleRow = (g: PieceGrade, on: (g: PieceGrade) => void) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-slate-500">{t("กว้าง +", "Width +")}</span><StepInput value={g.dw} step={0.5} min={-50} max={50} unit={t("ซม.", "cm")} disabled={!can} ariaLabel={t("กว้างเพิ่มต่อไซซ์", "Width per size")} onChange={(v) => on({ ...g, dw: v ?? 0 })} className="h-7 w-28" />
      <span className="text-slate-500">{t("สูง +", "Height +")}</span><StepInput value={g.dh} step={0.5} min={-50} max={50} unit={t("ซม.", "cm")} disabled={!can} ariaLabel={t("สูงเพิ่มต่อไซซ์", "Height per size")} onChange={(v) => on({ ...g, dh: v ?? 0 })} className="h-7 w-28" />
      <select value={g.anchor ?? "c"} disabled={!can} onChange={(e) => on({ ...g, anchor: e.target.value as GradeAnchor })} className="h-7 rounded-md border border-slate-200 bg-white px-1" aria-label={t("จุดยึด", "Anchor")}>
        {GRADE_ANCHORS.map((a) => <option key={a.key} value={a.key}>{t(`ยึด${a.th}`, `Anchor: ${a.en}`)}</option>)}
      </select>
    </div>
  );
  const bad = report.filter((r) => r.bad.length);
  return (
    <div className="space-y-2.5 rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-xs" data-grading-panel>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-700">{t("ขยายไซซ์", "Size grading")}</span>
        <label className="inline-flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} data-grade-overlay />{t("ซ้อนดูทุกไซซ์บนกระดาน", "Overlay every size on the board")}</label>
        <span className="ml-auto flex flex-wrap gap-1">{spec.sizes.map((s, i) => <span key={s} className="rounded-full px-1.5 py-0.5 text-[10px] text-white" style={{ background: i === spec.base ? "#334155" : SIZE_COLORS[i % SIZE_COLORS.length] }}>{s}{i === spec.base ? t(" ตั้งต้น", " base") : ""}</span>)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" data-grade-sizes>
        <span className="text-slate-500">{t("ไซซ์ (คั่นด้วย ,)", "Sizes (comma separated)")}</span>
        <input value={sizeTxt} disabled={!can} onChange={(e) => setSizeTxt(e.target.value)} onBlur={applySizes} onKeyDown={(e) => { if (e.key === "Enter") applySizes(); }} className="h-7 w-44 rounded-md border border-slate-200 bg-white px-2" />
        <span className="text-slate-500">{t("ตั้งต้น", "Base")}</span>
        <select value={spec.base} disabled={!can} onChange={(e) => set({ ...spec, base: Number(e.target.value) })} className="h-7 rounded-md border border-slate-200 bg-white px-1">{spec.sizes.map((s, i) => <option key={s} value={i}>{s}</option>)}</select>
      </div>
      <div className="space-y-1"><div className="font-medium text-slate-600">{t("กฎกลาง (ทุกชิ้นที่ไม่ได้ตั้งเฉพาะ) — ต่อ 1 ไซซ์", "Default rule (pieces without their own) — per size")}</div>{ruleRow(spec.def, (g) => set({ ...spec, def: g }))}</div>
      <div className="space-y-1 rounded-md border border-slate-200 bg-white p-2" data-grade-piece>
        <div className="flex flex-wrap items-center gap-1.5"><span className="font-medium text-slate-600">{t("กฎเฉพาะชิ้น", "Piece rule")}</span>
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-1">
            <option value="">{t("— เลือกชิ้น —", "— pick a piece —")}</option>
            {live.map((p, i) => <option key={p.pid} value={p.pid}>{p.name || t(`ชิ้น ${i + 1}`, `Piece ${i + 1}`)}{spec.rules[p.pid] ? t(" (ตั้งเฉพาะ)", " (own)") : ""}</option>)}
          </select>
          {pickPiece && can && (own ? <button type="button" onClick={() => setRule(pickPiece.pid, null)} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50">{t("กลับไปใช้กฎกลาง", "Use the default")}</button>
            : <button type="button" onClick={() => setRule(pickPiece.pid, { ...spec.def })} className="h-7 rounded-md border border-sky-200 px-2 text-sky-800 hover:bg-sky-50">{t("ตั้งกฎเฉพาะชิ้นนี้", "Give this piece its own rule")}</button>)}
        </div>
        {pickPiece && own && <>
          {ruleRow(own, (g) => setRule(pickPiece.pid, g))}
          <div className="text-slate-500">{t(`กฎรายจุด (จุด 1–${pieceEdges(pickPiece.shape).length} ตามลำดับรอบชิ้น) — ขยับเพิ่มต่อไซซ์`, `Point rules (points 1–${pieceEdges(pickPiece.shape).length} around the piece) — extra move per size`)}</div>
          {(own.pts ?? []).map((q, k) => (
            <div key={k} className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-500">{t("จุด", "Point")}</span><StepInput value={q.n + 1} step={1} integer min={1} max={pieceEdges(pickPiece.shape).length} disabled={!can} ariaLabel={t("เลขจุด", "Point no.")} onChange={(v) => setRule(pickPiece.pid, { ...own, pts: (own.pts ?? []).map((x, j) => (j === k ? { ...x, n: Math.max(0, (v ?? 1) - 1) } : x)) })} className="h-7 w-20" />
              <span className="text-slate-500">x</span><StepInput value={q.dx} step={0.5} min={-50} max={50} disabled={!can} ariaLabel="dx" onChange={(v) => setRule(pickPiece.pid, { ...own, pts: (own.pts ?? []).map((x, j) => (j === k ? { ...x, dx: v ?? 0 } : x)) })} className="h-7 w-24" />
              <span className="text-slate-500">y</span><StepInput value={q.dy} step={0.5} min={-50} max={50} disabled={!can} ariaLabel="dy" onChange={(v) => setRule(pickPiece.pid, { ...own, pts: (own.pts ?? []).map((x, j) => (j === k ? { ...x, dy: v ?? 0 } : x)) })} className="h-7 w-24" />
              {can && <button type="button" onClick={() => setRule(pickPiece.pid, { ...own, pts: (own.pts ?? []).filter((_, j) => j !== k) })} className="text-slate-300 hover:text-rose-600" aria-label={t("ลบกฎจุด", "Remove point rule")}>✕</button>}
            </div>
          ))}
          {can && <button type="button" data-grade-addpt onClick={() => setRule(pickPiece.pid, { ...own, pts: [...(own.pts ?? []), { n: 0, dx: 1, dy: 0 }] })} className="h-7 rounded-md border border-slate-200 px-2 hover:bg-slate-50">{t("+ กฎรายจุด", "+ Point rule")}</button>}
        </>}
      </div>
      <div className="space-y-1" data-grade-seams>
        <div className="font-medium text-slate-600">{t("ตรวจตะเข็บทุกไซซ์", "Seams in every size")}</div>
        {!seams.length ? <p className="text-slate-400">{t("ยังไม่มีตะเข็บ", "No seams yet")}</p> : report.map((r) => (
          <div key={r.size} className={`flex flex-wrap items-center gap-1.5 ${r.bad.length ? "text-amber-800" : "text-emerald-700"}`}>
            <b className="w-10">{r.size}</b>{r.bad.length ? t(`ไม่เท่ากัน ${r.bad.length} แนว: `, `${r.bad.length} mismatched: `) + r.bad.map((b) => `${b.seam}${b.name ? ` ${b.name}` : ""} (${b.diff} ${t("ซม.", "cm")})`).join(", ") : t(`ผ่านครบ ${r.ok} แนว`, `All ${r.ok} OK`)}
          </div>
        ))}
        {bad.length > 0 && <p className="text-[11px] text-slate-500">{t("แก้: ตั้งกฎเฉพาะชิ้นให้ชิ้นที่เย็บคู่กันขยายเท่ากัน (เช่น ชิ้นข้างยาวเพิ่ม = รอบตัวหน้าที่เพิ่ม)", "Fix: give the pieces sewn together matching rules (e.g. the gusset grows by the front's added perimeter)")}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-1 pr-2">{t("ชิ้น", "Piece")}</th>{spec.sizes.map((s, i) => <th key={s} className="py-1 pr-2 text-right">{s}{i === spec.base ? "*" : ""}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.pid} className="border-b border-slate-100"><td className="py-0.5 pr-2">{r.name}</td>{r.sizes.map((z, i) => <td key={i} className="py-0.5 pr-2 text-right tabular-nums">{z.w}×{z.h}</td>)}</tr>)}</tbody>
        </table>
        <div className="text-[10px] text-slate-400">{t("ขนาดสำเร็จ กว้าง×สูง (ซม.) · * = ตั้งต้น", "Finished width×height (cm) · * = base")}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" data-grade-file onClick={() => download(`${fileBase}-all-sizes.json`, buildGradedFile({ name: fileBase, pieces: live, seams }, spec), "application/json")} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50"><Icon value="i:download" className="text-[13px]" />{t("ไฟล์ทุกไซซ์ (.json)", "All sizes file (.json)")}</button>
        <button type="button" data-grade-csv onClick={() => download(`${fileBase}-sizes.csv`, gradeSizeCsv(live, spec, fileBase), "text/csv;charset=utf-8")} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50"><Icon value="i:table" className="text-[13px]" />{t("ตารางขนาด CSV", "Size table CSV")}</button>
        {can && <button type="button" onClick={() => { if (window.confirm(t("ล้างการตั้งไซซ์ทั้งหมด?", "Clear all grading?"))) onSpec?.(null); }} className="ml-auto h-7 rounded-md border border-slate-200 bg-white px-2 text-slate-500 hover:text-rose-600">{t("ล้างการตั้งไซซ์", "Clear grading")}</button>}
      </div>
      <p className="text-[10px] text-slate-400">{t("กฎรายจุดใช้กับเส้นนอก · เส้นใน/จุดบาก/รู ขยายตามสัดส่วน · ไฟล์โปรเจกต์ปกติมีกฎไซซ์ติดไปด้วย", "Point rules move the outline only · inner lines/notches/holes scale proportionally · the normal project file carries the rules too")}</p>
    </div>
  );
}
