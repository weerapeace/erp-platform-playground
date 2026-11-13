"use client";
/**
 * 🔍 ComparePanel — เทียบรุ่นของแพทเทิร์น (Bag CAD รอบ H · ส่วนของสตูดิโอแพทเทิร์น)
 *   ตัวเทียบ = "รุ่นที่ตั้งไว้" (เก็บใน template.compareRef ตอนกด ตั้งรุ่นนี้เป็นตัวเทียบ) หรือ "ไฟล์โปรเจกต์" ที่เลือกจากเครื่อง (ไม่บันทึก)
 *   แสดงตาราง: ชิ้นไหนเปลี่ยนขนาด / เพิ่ม / หาย + ติ๊ก "ซ้อนบนกระดาน" = เส้นประสีชมพูของรุ่นเก่าวางตรงชิ้นปัจจุบัน
 *   สูตร: lib/pattern-export (compareRevisions · parseProjectFile)
 *
 *   <ComparePanel live={[…]} saved={ref} onSaveRef={…} onClearRef={…} onGhost={(pieces) => …} />
 * ใช้ที่: components/pattern-studio · คู่มือ: docs/pattern-studio.md
 */
import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { compareRevisions, parseProjectFile } from "@/lib/pattern-export";
import type { ProjectPiece } from "@/lib/pattern-project";

export type CompareRef = { label: string; pieces: ProjectPiece[] };

export function ComparePanel({ live, saved, onSaveRef, onClearRef, overlay, onOverlay, readonly = false }: {
  live: ProjectPiece[];
  /** รุ่นที่ตั้งไว้เป็นตัวเทียบ (template.compareRef) */
  saved: CompareRef | null;
  /** คืนข้อความเมื่อเก็บไม่ได้ (เช่น ใหญ่เกิน) */ onSaveRef?: () => string | null | void;
  onClearRef?: () => void;
  /** ตัวเทียบที่กำลังซ้อนบนกระดาน (null = ไม่ซ้อน) */
  overlay: CompareRef | null;
  onOverlay: (ref: CompareRef | null) => void;
  readonly?: boolean;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fromFile, setFromFile] = useState<CompareRef | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [src, setSrc] = useState<"saved" | "file">(saved ? "saved" : "file");
  const ref = src === "saved" ? saved : fromFile;
  const diff = useMemo(() => (ref ? compareRevisions(ref.pieces, live) : []), [ref, live]);
  const changed = diff.filter((d) => d.status !== "same");
  const load = async (f?: File) => {
    if (!f) return;
    setErr(null);
    const p = parseProjectFile(await f.text().catch(() => ""));
    if (!p) { setErr(t("อ่านไฟล์นี้ไม่ได้ — ต้องเป็นไฟล์โปรเจกต์ (.json) ที่ส่งออกจากสตูดิโอแพทเทิร์น", "Can't read this file — it must be a project file (.json) exported from the pattern studio")); return; }
    const r = { label: `${p.from ?? f.name}`, pieces: p.pieces };
    setFromFile(r); setSrc("file"); if (overlay) onOverlay(r);
  };
  const tone = { same: "text-slate-400", changed: "text-amber-700", added: "text-emerald-700", removed: "text-rose-700" } as const;
  const word = { same: t("เหมือนเดิม", "Same"), changed: t("เปลี่ยน", "Changed"), added: t("เพิ่มใหม่", "Added"), removed: t("หายไป", "Removed") } as const;
  const sg = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return (
    <div className="space-y-2 rounded-lg border border-pink-200 bg-white p-2.5 text-xs" data-compare-panel>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-slate-700">{t("เทียบกับ", "Compare with")}</span>
        <button type="button" onClick={() => setSrc("saved")} disabled={!saved} className={`h-7 rounded-md px-2 ${src === "saved" ? "bg-slate-800 text-white" : "border border-slate-200 bg-white text-slate-600 disabled:opacity-40"}`}>{saved ? saved.label : t("รุ่นที่ตั้งไว้ (ยังไม่มี)", "Saved reference (none)")}</button>
        <button type="button" onClick={() => (fromFile ? setSrc("file") : fileRef.current?.click())} className={`h-7 rounded-md px-2 ${src === "file" && fromFile ? "bg-slate-800 text-white" : "border border-slate-200 bg-white text-slate-600"}`} data-compare-file>{fromFile ? fromFile.label : t("ไฟล์โปรเจกต์…", "Project file…")}</button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ""; }} />
        {!readonly && onSaveRef && <button type="button" data-compare-save onClick={() => { const e = onSaveRef(); setErr(typeof e === "string" ? e : null); if (!e) setSrc("saved"); }} className="ml-auto h-7 rounded-md border border-pink-200 bg-white px-2 text-pink-700 hover:bg-pink-50" title={t("จำรูปชิ้นตอนนี้ไว้ในแพทเทิร์น ใช้เทียบหลังแก้", "Remember the pieces as they are now, to compare after edits")}>{t("ตั้งรุ่นนี้เป็นตัวเทียบ", "Set this as the reference")}</button>}
        {!readonly && saved && onClearRef && <button type="button" onClick={onClearRef} className="h-7 rounded-md px-2 text-slate-500 hover:text-rose-600">{t("ล้างตัวเทียบ", "Clear")}</button>}
      </div>
      {err && <p className="rounded-md bg-rose-50 px-2 py-1 text-rose-700">{err}</p>}
      {ref ? (
        <>
          <label className="flex items-center gap-1.5 text-slate-700"><input type="checkbox" checked={!!overlay} onChange={(e) => onOverlay(e.target.checked ? ref : null)} className="h-3.5 w-3.5 accent-pink-600" data-compare-overlay />
            <Icon value="i:layers-subtract" className="text-sm text-pink-600" />{t("ซ้อนรุ่นเทียบบนกระดาน (เส้นประชมพู)", "Overlay the reference on the board (pink dashes)")}</label>
          <div className="text-slate-600">{changed.length ? t(`ต่างกัน ${changed.length} ชิ้น`, `${changed.length} piece(s) differ`) : t("ทุกชิ้นเหมือนตัวเทียบ", "Every piece matches the reference")}</div>
          {changed.length > 0 && (
            <table className="w-full border-collapse" data-compare-table>
              <thead><tr className="border-b border-slate-200 text-left text-[11px] text-slate-500"><th className="py-1 pr-2">{t("ชิ้น", "Piece")}</th><th className="py-1 pr-2">{t("สถานะ", "Status")}</th><th className="py-1 pr-2 text-right">{t("กว้าง", "W")}</th><th className="py-1 pr-2 text-right">{t("สูง", "H")}</th><th className="py-1 text-right">{t("พื้นที่", "Area")}</th></tr></thead>
              <tbody>{changed.map((d) => (
                <tr key={d.pid} className="border-b border-slate-100"><td className="py-1 pr-2">{d.name}</td><td className={`py-1 pr-2 ${tone[d.status]}`}>{word[d.status]}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{sg(d.dw)}</td><td className="py-1 pr-2 text-right tabular-nums">{sg(d.dh)}</td><td className="py-1 text-right tabular-nums">{sg(d.darea)}</td></tr>
              ))}</tbody>
            </table>
          )}
          <p className="text-[11px] text-slate-400">{t("ตัวเลข = ต่างจากตัวเทียบ (ซม. / ตร.ซม. ของขนาดสำเร็จ)", "Numbers = difference from the reference (cm / cm² of finished size)")}</p>
        </>
      ) : <p className="text-slate-500">{t("ยังไม่มีตัวเทียบ — กด 'ตั้งรุ่นนี้เป็นตัวเทียบ' ก่อนแก้ หรือเลือกไฟล์โปรเจกต์ของรุ่นเก่า", "No reference yet — press 'Set this as the reference' before editing, or pick an older project file")}</p>}
    </div>
  );
}
