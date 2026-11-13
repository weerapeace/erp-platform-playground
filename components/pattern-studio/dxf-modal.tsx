"use client";
/**
 * 📥 DxfModal — นำเข้าแพทเทิร์นจากไฟล์ DXF (เช่น ที่ส่งออกจาก CLO3D) ลงกระดานของสตูดิโอแพทเทิร์น · เจ้าของสั่ง 2026-11-11 "ทำต่อเลย"
 *   เลือกหรือลากไฟล์ .dxf → ระบบอ่านในเครื่อง (ไม่อัปโหลดไปไหน) → แสดงภาพชิ้น + ขนาด + จำนวนขอบ ให้ตรวจก่อน → เลือกหน่วยถ้าขนาดไม่ตรง → วางลงกระดาน
 *   ได้: รูปชิ้น (เส้นเย็บ) · เผื่อเย็บ · รูเจาะ · เส้นใน · รอยบาก · เส้นทางผ้า · ชื่อชิ้น · จำนวนตัด — ไม่ได้: ตะเข็บ วัสดุ (DXF ไม่มีข้อมูลนี้)
 *   ตัวอ่าน = lib/pattern-dxf-import (สูตรบริสุทธิ์ มีเทสต์) · ⚠️ ยังไม่ได้ทดสอบกับไฟล์จาก CLO3D ของโรงงานจริง
 *
 *   <DxfModal open onClose={…} onInsert={(pieces) => …} />
 * ใช้ที่: components/pattern-studio · คู่มือ: docs/pattern-studio.md
 */
import { useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { FileDropHint, useFileDrop } from "@/components/file-drop";
import { applyCutOnly, parseDxfPattern, type DxfNote, type DxfPiece, type DxfUnit } from "@/lib/pattern-dxf-import";
import { shapePathD } from "@/lib/pattern-shape";

const MAX_BYTES = 8 * 1024 * 1024;

export function DxfModal({ open, onClose, onInsert }: {
  open: boolean;
  onClose: () => void;
  /** วางชิ้นลงกระดาน (ชิ้นอยู่ในพิกัดของไฟล์ ซม. · at = มุมซ้ายบนของแต่ละชิ้น) */
  onInsert: (pieces: DxfPiece[]) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [unit, setUnit] = useState<DxfUnit | null>(null);       // null = ตามไฟล์ (ไม่มี = มม.)
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const imp = useMemo(() => (file ? parseDxfPattern(file.text, unit ?? undefined) : null), [file, unit]);
  // รอบ H: ไฟล์มีแต่เส้นตัด → ต้องรู้ก่อนว่าเส้นคืออะไร + เผื่อเท่าไหร่ (ไม่เดาให้เงียบ ๆ)
  const cutOnly = imp?.pieces.filter((p) => p.cutOnly).length ?? 0;
  const [coMode, setCoMode] = useState<"cut" | "sew" | "none">("cut");
  const [coMm, setCoMm] = useState(7);
  const ready = useMemo(() => (imp ? applyCutOnly(imp.pieces, coMode, coMm / 10) : null), [imp, coMode, coMm]);

  const load = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (!/\.dxf$/i.test(f.name)) { setErr(t("เลือกได้เฉพาะไฟล์ .dxf", "Only .dxf files can be imported")); return; }
    if (f.size > MAX_BYTES) { setErr(t("ไฟล์ใหญ่เกิน 8 MB — ลองส่งออกเฉพาะชิ้นแพทเทิร์น (ไม่รวมภาพ 3 มิติ)", "The file is over 8 MB — export only the pattern pieces")); return; }
    setBusy(true);
    try {
      const text = await f.text();
      if (!parseDxfPattern(text)) { setFile(null); setErr(t("อ่านไฟล์นี้ไม่ได้ หรือไม่พบเส้นรอบชิ้นที่ปิดเป็นวง — ต้องเป็น DXF แบบข้อความ (ASCII) ถ้าส่งออกจาก CLO3D ให้เลือกแบบ DXF (AAMA หรือ ASTM)", "Could not read this file, or it has no closed piece outlines — it must be a text (ASCII) DXF. From CLO3D, export as DXF (AAMA or ASTM)")); }
      else { setFile({ name: f.name, text }); setUnit(null); }
    } catch { setErr(t("เปิดไฟล์ไม่ได้ ลองใหม่อีกครั้ง", "Could not open the file. Try again.")); }
    finally { setBusy(false); }
  };
  const drop = useFileDrop((files) => void load(files[0]), { disabled: busy });

  const noteText = (n: DxfNote) => n === "spline" ? t("ไฟล์มีเส้นโค้งแบบ SPLINE ระบบใช้จุดควบคุมแทน รูปจะใกล้เคียงแต่ไม่เป๊ะ — เทียบขนาดกับของจริงก่อนใช้", "The file has SPLINE curves; control points are used instead, so shapes are close but not exact — compare with the original")
    : n === "uneven" ? t("บางชิ้นเผื่อเย็บไม่เท่ากันทุกด้าน ระบบใส่ค่าน้อยสุดให้ทั้งชิ้น — ตั้งเผื่อรายขอบเองหลังวาง", "Some pieces have uneven allowances; the smallest value is used — set per-edge allowances after placing")
    : n === "open" ? t("มีเส้นบางเส้นที่ต่อไม่ครบวง ระบบข้ามเส้นเหล่านั้น", "Some lines do not form closed outlines and were skipped")
    : t("ไฟล์ไม่มีเส้นตัด ระบบใช้เส้นเย็บเป็นรูปชิ้น (เผื่อเย็บ = 0)", "No cut lines were found; sew lines are used as piece shapes (allowance 0)");

  const preview = imp ? (() => {
    const W = Math.max(imp.width, 10), H = Math.max(imp.height, 10), sw = Math.max(W, H) / 320;
    return (
      <svg viewBox={`${-W * 0.02} ${-H * 0.02} ${W * 1.04} ${H * 1.04}`} className="max-h-[340px] w-full" role="img" aria-label={t("ภาพชิ้นที่อ่านได้จากไฟล์", "Pieces read from the file")}>
        {imp.pieces.map((p, i) => (
          <g key={i}>
            <path d={shapePathD(p.shape) + p.holes.map((h) => shapePathD(h)).join("")} fillRule="evenodd" fill="#dbeafe" stroke="#2563eb" strokeWidth={sw} />
            {p.inner.map((l) => <path key={l.id} d={"M" + l.pts.map((q) => `${q[0]} ${q[1]}`).join("L")} fill="none" stroke={l.kind === "fold" ? "#7c3aed" : "#64748b"} strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 3}`} />)}
            {p.notches.map((q, k) => <circle key={k} cx={q[0]} cy={q[1]} r={sw * 2.2} fill="#e11d48" />)}
            <text x={p.at[0] + p.w / 2} y={p.at[1] + p.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(sw * 9, Math.min(p.w, p.h) / 7)} fill="#1e3a8a">{i + 1}</text>
          </g>
        ))}
      </svg>
    );
  })() : null;

  return (
    <ERPModal open={open} onClose={onClose} size="xl" storageKey="pattern-dxf-modal"
      title={t("นำเข้าแพทเทิร์นจากไฟล์ DXF", "Import a pattern from a DXF file")}
      description={t("ใช้ย้ายแพทเทิร์นที่ทำไว้ในโปรแกรมอื่น (เช่น CLO3D) เข้ามา — ระบบอ่านไฟล์ในเครื่องนี้ ไม่อัปโหลดไปไหน และยังไม่วางอะไรจนกว่าจะกดปุ่มวาง", "Bring in patterns made in other software (such as CLO3D) — the file is read on this device, nothing is uploaded, and nothing is placed until you press the button")}
      footer={<>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" disabled={!imp} onClick={() => { if (ready) onInsert(ready.pieces); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-40">
          <Icon value="i:plus" className="text-sm" />{imp ? t(`วางลงกระดาน ${imp.pieces.length} ชิ้น`, `Place ${imp.pieces.length} pieces`) : t("วางลงกระดาน", "Place on the board")}
        </button>
      </>}>
      <div className="space-y-3" {...drop.guard}>
        <input ref={inputRef} type="file" accept=".dxf" className="hidden" onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ""; }} />
        <div {...drop.zone("dxf")} className={`relative flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm ${drop.over === "dxf" ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-slate-50"}`}>
          <FileDropHint show={drop.over === "dxf"} label={t("วางไฟล์ .dxf ที่นี่", "Drop the .dxf file here")} />
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-blue-700 hover:bg-blue-50 disabled:opacity-50">
            <Icon value="i:file-import" className="text-base" />{file ? t("เลือกไฟล์อื่น", "Choose another file") : t("เลือกไฟล์ .dxf", "Choose a .dxf file")}
          </button>
          <span className="min-w-0 flex-1 truncate text-slate-600">{busy ? t("กำลังอ่านไฟล์…", "Reading the file…") : file ? file.name : t("หรือลากไฟล์มาวางในกรอบนี้", "or drag the file into this box")}</span>
        </div>
        {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

        {imp && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-2">
              <div className="rounded-lg border border-slate-200 bg-white p-2">{preview}</div>
              <p className="text-[11px] text-slate-500">{t("เส้นสีน้ำเงิน = เส้นเย็บของชิ้น · เส้นประ = เส้นใน · จุดแดง = รอยบาก · เลขในชิ้นตรงกับรายการทางขวา", "Blue = sew line · dashed = inner lines · red dots = notches · numbers match the list on the right")}</p>
              {imp.notes.map((n) => <p key={n} className="rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{noteText(n)}</p>)}
              {cutOnly > 0 && (
                <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900" data-dxf-cutonly>
                  <div className="font-medium">{t(`${cutOnly} ชิ้นมีแต่เส้นตัด (ไม่มีเส้นเย็บในไฟล์) — เส้นนี้คืออะไร?`, `${cutOnly} piece(s) have cut lines only (no sew line in the file) — what are these lines?`)}</div>
                  {([["cut", "เส้นตัด (รวมเผื่อเย็บแล้ว) → หดเข้าเป็นเส้นเย็บ ขนาดตัดเท่าเดิม", "Cut lines (allowance included) → shrink to the sew line, cut size unchanged"], ["sew", "เส้นเย็บ → เพิ่มเผื่อออกนอก ชิ้นตัดใหญ่ขึ้น", "Sew lines → add allowance outside, cut pieces get bigger"], ["none", "ไม่ใส่เผื่อ ใช้เส้นนี้ตามเดิม", "No allowance, use the lines as they are"]] as const).map(([k, th, en]) => (
                    <label key={k} className="flex items-start gap-2"><input type="radio" name="dxf-cutonly" checked={coMode === k} onChange={() => setCoMode(k)} className="mt-0.5" data-dxf-cutonly-mode={k} />{t(th, en)}</label>
                  ))}
                  {coMode !== "none" && <label className="flex items-center gap-2">{t("ระยะเผื่อเย็บ", "Seam allowance")}<input type="number" min={1} max={50} step={0.5} value={coMm} onChange={(e) => setCoMm(Math.max(1, Math.min(50, Number(e.target.value) || 7)))} className="h-7 w-16 rounded-md border border-amber-300 bg-white px-1.5 text-right" data-dxf-cutonly-mm />{t("มม.", "mm")}</label>}
                  {ready && ready.skipped > 0 && <p className="text-rose-700">{t(`${ready.skipped} ชิ้นเล็ก/แคบเกินกว่าจะหดเข้า — วางตามเดิม (ตรวจชิ้นนี้อีกครั้ง)`, `${ready.skipped} piece(s) are too small/narrow to shrink — placed as they are (check them)`)}</p>}
                </div>
              )}
            </div>
            <div className="min-w-0 space-y-3 text-xs">
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3">
                <div className="font-medium text-slate-700">{t("หน่วยของไฟล์", "File units")}</div>
                <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("หน่วยของไฟล์", "File units")}>
                  {(["mm", "cm", "inch"] as const).map((u) => <button key={u} type="button" onClick={() => setUnit(u)} aria-pressed={imp.unit === u} className={`h-8 flex-1 rounded-md px-2 ${imp.unit === u ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{u === "mm" ? t("มิลลิเมตร", "mm") : u === "cm" ? t("เซนติเมตร", "cm") : t("นิ้ว", "inch")}</button>)}
                </div>
                <p className="text-slate-500">{imp.detected
                  ? t(`ไฟล์บอกว่าใช้หน่วย ${imp.detected === "mm" ? "มิลลิเมตร" : imp.detected === "cm" ? "เซนติเมตร" : "นิ้ว"} · ถ้าขนาดชิ้นด้านล่างไม่ตรงของจริง เปลี่ยนหน่วยได้`, `The file says its unit is ${imp.detected} · change it if the sizes below look wrong`)
                  : t("ไฟล์ไม่ได้บอกหน่วย ระบบเริ่มที่มิลลิเมตร — ดูขนาดชิ้นด้านล่าง ถ้าไม่ตรงของจริงให้เปลี่ยนหน่วย", "The file does not state its unit, so millimetres are assumed — check the sizes below and change the unit if they look wrong")}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-1.5 font-medium text-slate-700">{t(`ชิ้นที่อ่านได้ ${imp.pieces.length} ชิ้น`, `${imp.pieces.length} pieces found`)}</div>
                <ul className="max-h-[260px] space-y-1 overflow-auto">
                  {imp.pieces.map((p, i) => (
                    <li key={i} className="flex items-baseline gap-2 rounded px-1.5 py-1 odd:bg-slate-50">
                      <span className="w-5 shrink-0 text-right tabular-nums text-slate-400">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{p.name || t("(ไม่มีชื่อ)", "(unnamed)")}</span>
                      <span className="shrink-0 tabular-nums text-slate-600">{p.w} × {p.h} {t("ซม.", "cm")}</span>
                      <span className="shrink-0 tabular-nums text-slate-400" title={t("ตัดกี่ชิ้น · กี่ขอบ · เผื่อเย็บ", "cut count · edges · allowance")}>×{p.count} · {t(`${p.edges} ขอบ`, `${p.edges} edges`)}{p.allow ? ` · +${p.allow}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-[11px] text-slate-500"><b>{t("ต้องทำต่อเองหลังวาง", "After placing, you still need to")}</b> · {t("เย็บขอบที่ติดกัน (ไฟล์ DXF ไม่เก็บตะเข็บ) · เลือกวัสดุของแต่ละชิ้น · ตรวจขนาดเทียบกับของจริงอย่างน้อย 1 ชิ้น", "sew the matching edges (DXF does not store seams) · pick each piece's material · check at least one piece's size against the original")}</p>
            </div>
          </div>
        )}
        {!imp && !err && (
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>{t("จาก CLO3D: File → Export → DXF (AAMA หรือ ASTM) แล้วเลือกไฟล์ .dxf ที่ได้", "From CLO3D: File → Export → DXF (AAMA or ASTM), then choose the .dxf file")}</li>
            <li>{t("ได้: รูปชิ้น เผื่อเย็บ รูเจาะ เส้นใน รอยบาก เส้นทางผ้า ชื่อชิ้น จำนวนตัด · ไม่ได้: ตะเข็บ วัสดุ หลายไซซ์", "Imported: shapes, allowance, holes, inner lines, notches, grain, names, cut counts · not imported: seams, materials, sizes")}</li>
            <li>{t("ไฟล์ DXF ที่ส่งออกจากระบบนี้ (หน้าพิมพ์ / ไฟล์ตัด) ก็นำกลับเข้ามาได้", "DXF files exported from this system (Print / cut files) can be imported back too")}</li>
          </ul>
        )}
      </div>
    </ERPModal>
  );
}
