"use client";
/**
 * 📥 DxfModal — นำเข้าแพทเทิร์นจากไฟล์ DXF (เช่น ที่ส่งออกจาก CLO3D) ลงกระดานของสตูดิโอแพทเทิร์น · เจ้าของสั่ง 2026-11-11 "ทำต่อเลย"
 *   เลือกหรือลากไฟล์ .dxf → ระบบอ่านในเครื่อง (ไม่อัปโหลดไปไหน) → แสดงภาพชิ้น + ขนาด ให้ตรวจก่อน → เลือกหน่วยถ้าขนาดไม่ตรง → วางลงกระดาน
 *   ได้: รูปชิ้น (เส้นเย็บ) · เผื่อเย็บ · รูเจาะ · เส้นใน · รอยบาก · เส้นทางผ้า · ชื่อชิ้น · จำนวนตัด — ไม่ได้: ตะเข็บ วัสดุ (DXF ไม่มีข้อมูลนี้)
 *   รอบ J1 (2026-11-16 · ทดสอบกับไฟล์ CLO3D จริง 23 ชิ้น): หน้าตรวจหลังนำเข้า (ไฟล์ตั้งแต่ 2 ชิ้น)
 *     ตะเข็บที่ระบบเดาให้ (ขอบยาวเท่ากัน · ตรง ≥ 98% ติ๊กรับให้ก่อน · กดแถว = เห็นขอบคู่บนภาพ) · ชิ้นหน้าตาเหมือนกัน → ผูกเป็นชุด
 *     ชื่อไทย + ชนิดชิ้น (เลือกเองได้ · เปลี่ยนชนิด = เดาตะเข็บใหม่) · กรอบ/ตัว U เล็กในชิ้น = จุดติดหู (ใช้รอบ J2) · เปิดภาพ 3D หลังวาง
 *   ตัวอ่าน = lib/pattern-dxf-import · ตัวช่วยเดา = lib/pattern-import-assist (สูตรบริสุทธิ์ มีเทสต์)
 *
 *   <DxfModal open onClose={…} onInsert={(pieces, plan) => …} />
 * ใช้ที่: components/pattern-studio · คู่มือ: docs/pattern-studio.md
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { FileDropHint, useFileDrop } from "@/components/file-drop";
import { applyCutOnly, parseDxfPattern, type DxfNote, type DxfPiece, type DxfUnit } from "@/lib/pattern-dxf-import";
import { PART_TYPES, autoNames, groupIdentical, guessPieceTypes, handleSpots, isConfident, suggestSeams, type PartType, type SeamSuggestion } from "@/lib/pattern-import-assist";
import { linkedShape } from "@/lib/pattern-link";
import { pieceEdges } from "@/lib/pattern-seams";
import { shapeBox, shapePathD, type Pt } from "@/lib/pattern-shape";

const MAX_BYTES = 8 * 1024 * 1024;

/** ผลจากหน้าตรวจ (รอบ J1) — อ้างลำดับชิ้นในรายการ pieces ที่ส่งพร้อมกัน */
export type DxfPlan = {
  names: string[]; codes: string[]; types: PartType[];
  /** ชิ้นตาม → ต้นแบบ (ลำดับชิ้น) */ links: { i: number; to: number; mirror: boolean }[];
  seams: { a: { i: number; from: number; count: number; n: number }; b: { i: number; from: number; count: number; n: number } }[];
  /** id เส้นในที่เป็นจุดติดหู ต่อชิ้น */ spots: string[][];
  open3d: boolean;
  /** ตั้งค่าคลาดตะเข็บของแพทเทิร์น (ซม.) ตามไฟล์ — ตะเข็บที่รับยาวต่างกันเกินค่าเดิม */ tol?: number;
};

const TOL_STEPS = [0.05, 0.1, 0.2, 0.5];

export function DxfModal({ open, onClose, onInsert, tol = 0.05 }: {
  open: boolean;
  /** ค่าคลาดตะเข็บตอนนี้ของแพทเทิร์น (ซม.) */ tol?: number;
  onClose: () => void;
  /** วางชิ้นลงกระดาน (ชิ้นอยู่ในพิกัดของไฟล์ ซม. · at = มุมซ้ายบนของแต่ละชิ้น) + ผลหน้าตรวจ (ไฟล์ 2 ชิ้นขึ้นไป) */
  onInsert: (pieces: DxfPiece[], plan?: DxfPlan) => void;
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

  // ── รอบ J1: หน้าตรวจหลังนำเข้า
  const base = ready?.pieces ?? null;
  const review = !!base && base.length >= 2;
  const [types, setTypes] = useState<PartType[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [edited, setEdited] = useState<Set<number>>(new Set());
  const [linkOff, setLinkOff] = useState<Set<number>>(new Set());
  const [seamOn, setSeamOn] = useState<Record<string, boolean>>({});
  const [selSeam, setSelSeam] = useState<string | null>(null);
  const [open3d, setOpen3d] = useState(true);
  const [useTol, setUseTol] = useState(true);
  useEffect(() => {   // ไฟล์/หน่วย/โหมดเส้นตัดเปลี่ยน = เดาใหม่หมด
    if (!base) { setTypes([]); setNames([]); return; }
    const ty = guessPieceTypes(base);
    setTypes(ty); setNames(autoNames(ty)); setEdited(new Set()); setLinkOff(new Set()); setSeamOn({}); setSelSeam(null);
  }, [base]);
  const groups = useMemo(() => (base && review ? groupIdentical(base) : []), [base, review]);
  // ชิ้นตามได้รูปจากต้นแบบ (เหมือนผูกบนกระดาน) — เดาตะเข็บบนรูปนี้ ลำดับขอบจะตรงกับหลังวาง
  const linkList = useMemo(() => groups.flatMap((g, k) => (linkOff.has(k) ? [] : g.members.slice(1).map((m, j) => ({ i: m, to: g.members[0], mirror: g.mirror[j + 1] })))), [groups, linkOff]);
  const shaped = useMemo(() => {
    if (!base) return null;
    if (!linkList.length) return base;
    const out = [...base];
    for (const l of linkList) { const b = shapeBox(base[l.i].shape); out[l.i] = { ...base[l.i], shape: linkedShape(base[l.to].shape, l.mirror ? { to: "", mirror: "x" } : { to: "" }, b) }; }
    return out;
  }, [base, linkList]);
  const tyOk = review && types.length === base!.length;
  const sugg = useMemo(() => (shaped && tyOk ? suggestSeams(shaped, types) : []), [shaped, types, tyOk]);
  const key = (s: SeamSuggestion) => `${s.a.i}:${s.a.from}:${s.a.count}|${s.b.i}:${s.b.from}:${s.b.count}`;
  const isOn = (s: SeamSuggestion) => seamOn[key(s)] ?? isConfident(s, types);
  const accepted = sugg.filter(isOn);
  const spots = useMemo(() => (shaped && tyOk ? handleSpots(shaped, types) : []), [shaped, types, tyOk]);
  // ไฟล์จาก CLO ขอบคู่มักต่างกัน 1–2 มม. → ค่าคลาดเดิม (0.5 มม.) ทำให้ "ตรวจแบบ" ฟ้องทุกแนว · เสนอค่าคลาดขั้นถัดไปที่ครอบคลุม (ผู้ใช้เลือกได้)
  const maxDiff = accepted.reduce((m, s) => Math.max(m, s.diff), 0);
  const tolNeed = maxDiff > tol + 1e-9 ? TOL_STEPS.find((v) => v >= maxDiff - 1e-9) ?? null : null;
  const spotCount = spots.reduce((s, x) => s + x.length, 0);
  const setType = (i: number, ty: PartType) => {
    const next = types.map((x, k) => (k === i ? ty : x)), auto = autoNames(next);
    setTypes(next); setNames((old) => old.map((n, k) => (edited.has(k) ? n : auto[k]))); setSeamOn({});
  };
  const nm = (i: number) => names[i] || `#${i + 1}`;
  const edgeLabel = (r: { from: number; count: number }) => (r.count > 1 ? `${r.from + 1}–${r.from + r.count}` : `${r.from + 1}`);

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

  const place = () => {
    if (!ready || !shaped) return;
    if (!review) { onInsert(ready.pieces); return; }
    onInsert(shaped, {
      names: shaped.map((_, i) => nm(i)), codes: shaped.map((p) => p.name), types, links: linkList,
      seams: accepted.map((s) => ({ a: s.a, b: s.b })), spots, open3d, ...(tolNeed && useTol ? { tol: tolNeed } : {}),
    });
  };

  const noteText = (n: DxfNote) => n === "spline" ? t("ไฟล์มีเส้นโค้งแบบ SPLINE ระบบใช้จุดควบคุมแทน รูปจะใกล้เคียงแต่ไม่เป๊ะ — เทียบขนาดกับของจริงก่อนใช้", "The file has SPLINE curves; control points are used instead, so shapes are close but not exact — compare with the original")
    : n === "uneven" ? t("บางชิ้นเผื่อเย็บไม่เท่ากันทุกด้าน ระบบใส่ค่าน้อยสุดให้ทั้งชิ้น — ตั้งเผื่อรายขอบเองหลังวาง", "Some pieces have uneven allowances; the smallest value is used — set per-edge allowances after placing")
    : n === "open" ? t("มีเส้นบางเส้นที่ต่อไม่ครบวง ระบบข้ามเส้นเหล่านั้น", "Some lines do not form closed outlines and were skipped")
    : t("ไฟล์ไม่มีเส้นตัด ระบบใช้เส้นเย็บเป็นรูปชิ้น (เผื่อเย็บ = 0)", "No cut lines were found; sew lines are used as piece shapes (allowance 0)");

  const runPts = (i: number, r: { from: number; count: number }): Pt[] => {
    if (!shaped) return [];
    const E = pieceEdges(shaped[i].shape), out: Pt[] = [];
    for (let k = 0; k < r.count; k++) out.push(...E[(r.from + k) % E.length].pts);
    return out;
  };
  const preview = imp ? (() => {
    const list = shaped ?? imp.pieces;
    const W = Math.max(imp.width, 10), H = Math.max(imp.height, 10), sw = Math.max(W, H) / 320;
    const line = (P: Pt[]) => (P.length ? "M" + P.map((q) => `${q[0]} ${q[1]}`).join("L") : "");
    const sel = sugg.find((s) => key(s) === selSeam) ?? null;
    return (
      <svg viewBox={`${-W * 0.02} ${-H * 0.02} ${W * 1.04} ${H * 1.04}`} className="max-h-[340px] w-full" role="img" aria-label={t("ภาพชิ้นที่อ่านได้จากไฟล์", "Pieces read from the file")} data-dxf-preview>
        {list.map((p, i) => (
          <g key={i}>
            <path d={shapePathD(p.shape) + p.holes.map((h) => shapePathD(h)).join("")} fillRule="evenodd" fill="#dbeafe" stroke="#2563eb" strokeWidth={sw} />
            {p.inner.map((l) => <path key={l.id} d={line(l.pts)} fill="none" stroke={spots[i]?.includes(l.id) ? "#dc2626" : l.kind === "fold" ? "#7c3aed" : "#64748b"} strokeWidth={sw} strokeDasharray={spots[i]?.includes(l.id) ? undefined : `${sw * 4} ${sw * 3}`} />)}
            {p.notches.map((q, k) => <circle key={k} cx={q[0]} cy={q[1]} r={sw * 2.2} fill="#e11d48" />)}
            <text x={p.at[0] + p.w / 2} y={p.at[1] + p.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(sw * 9, Math.min(p.w, p.h) / 7)} fill="#1e3a8a">{i + 1}</text>
          </g>
        ))}
        {review && accepted.filter((s) => s !== sel).map((s) => <g key={key(s)} stroke="#16a34a" strokeWidth={sw * 2} fill="none" strokeLinecap="round"><path d={line(runPts(s.a.i, s.a))} /><path d={line(runPts(s.b.i, s.b))} /></g>)}
        {sel && <g stroke="#f59e0b" strokeWidth={sw * 4} fill="none" strokeLinecap="round" data-dxf-seam-hl><path d={line(runPts(sel.a.i, sel.a))} /><path d={line(runPts(sel.b.i, sel.b))} /></g>}
      </svg>
    );
  })() : null;

  const box = "space-y-1.5 rounded-lg border border-slate-200 bg-white p-3";
  return (
    <ERPModal open={open} onClose={onClose} size="xl" storageKey="pattern-dxf-modal"
      title={t("นำเข้าแพทเทิร์นจากไฟล์ DXF", "Import a pattern from a DXF file")}
      description={t("ใช้ย้ายแพทเทิร์นที่ทำไว้ในโปรแกรมอื่น (เช่น CLO3D) เข้ามา — ระบบอ่านไฟล์ในเครื่องนี้ ไม่อัปโหลดไปไหน และยังไม่วางอะไรจนกว่าจะกดปุ่มวาง", "Bring in patterns made in other software (such as CLO3D) — the file is read on this device, nothing is uploaded, and nothing is placed until you press the button")}
      footer={<div className="flex w-full flex-wrap items-center justify-end gap-2">
        {review && <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 sm:mr-auto sm:w-auto">
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={open3d} onChange={(e) => setOpen3d(e.target.checked)} data-dxf-open3d />{t("เปิดภาพ 3D หลังวาง", "Open the 3D view after placing")}</label>
          {tolNeed && <label className="inline-flex items-center gap-1.5" title={t("ขอบคู่ในไฟล์ยาวต่างกันเกินค่าคลาดตอนนี้ — ถ้าไม่ปรับ ตรวจแบบจะฟ้องทุกแนว", "Paired edges in the file differ by more than the current tolerance — without this Pattern check flags every seam")}><input type="checkbox" checked={useTol} onChange={(e) => setUseTol(e.target.checked)} data-dxf-tol />{t(`ค่าคลาดตะเข็บ ${Math.round(tolNeed * 100) / 10} มม. ตามไฟล์ (ต่างสุด ${Math.round(maxDiff * 100) / 10} มม.)`, `Seam tolerance ${Math.round(tolNeed * 100) / 10} mm to match the file (max ${Math.round(maxDiff * 100) / 10} mm)`)}</label>}
        </div>}
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" disabled={!imp} onClick={place} data-dxf-place className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-40">
          <Icon value="i:plus" className="text-sm" />{!imp ? t("วางลงกระดาน", "Place on the board") : review && accepted.length ? t(`วาง ${imp.pieces.length} ชิ้น + ${accepted.length} ตะเข็บ`, `Place ${imp.pieces.length} pieces + ${accepted.length} seams`) : t(`วางลงกระดาน ${imp.pieces.length} ชิ้น`, `Place ${imp.pieces.length} pieces`)}
        </button>
      </div>}>
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-2">
              <div className="rounded-lg border border-slate-200 bg-white p-2">{preview}</div>
              <p className="text-[11px] text-slate-500">{review
                ? t("เส้นสีน้ำเงิน = เส้นเย็บ · เส้นเขียว = ตะเข็บที่ติ๊กรับ · เส้นส้มหนา = แถวที่เลือกในรายการ · เส้นแดง = จุดติดหู · เลขในชิ้นตรงกับรายการ", "Blue = sew line · green = accepted seams · thick orange = the selected row · red = handle spots · numbers match the list")
                : t("เส้นสีน้ำเงิน = เส้นเย็บของชิ้น · เส้นประ = เส้นใน · จุดแดง = รอยบาก · เลขในชิ้นตรงกับรายการทางขวา", "Blue = sew line · dashed = inner lines · red dots = notches · numbers match the list on the right")}</p>
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
              <div className={box}>
                <div className="font-medium text-slate-700">{t("หน่วยของไฟล์", "File units")}</div>
                <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("หน่วยของไฟล์", "File units")}>
                  {(["mm", "cm", "inch"] as const).map((u) => <button key={u} type="button" onClick={() => setUnit(u)} aria-pressed={imp.unit === u} className={`h-8 flex-1 rounded-md px-2 ${imp.unit === u ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{u === "mm" ? t("มิลลิเมตร", "mm") : u === "cm" ? t("เซนติเมตร", "cm") : t("นิ้ว", "inch")}</button>)}
                </div>
                <p className="text-slate-500">{imp.detected
                  ? t(`ไฟล์บอกว่าใช้หน่วย ${imp.detected === "mm" ? "มิลลิเมตร" : imp.detected === "cm" ? "เซนติเมตร" : "นิ้ว"} · ถ้าขนาดชิ้นด้านล่างไม่ตรงของจริง เปลี่ยนหน่วยได้`, `The file says its unit is ${imp.detected} · change it if the sizes below look wrong`)
                  : t("ไฟล์ไม่ได้บอกหน่วย ระบบเริ่มที่มิลลิเมตร — ดูขนาดชิ้นด้านล่าง ถ้าไม่ตรงของจริงให้เปลี่ยนหน่วย", "The file does not state its unit, so millimetres are assumed — check the sizes below and change the unit if they look wrong")}</p>
              </div>
              {review && tyOk ? <>
                <div className={box} data-dxf-seams>
                  <div className="flex items-center gap-1.5 font-medium text-slate-700"><Icon value="i:needle-thread" className="text-sm" />{t(`ตะเข็บที่ระบบเดาให้ ${sugg.length} แนว`, `${sugg.length} suggested seams`)}
                    <span className="ml-auto flex gap-1 font-normal">
                      <button type="button" onClick={() => setSeamOn(Object.fromEntries(sugg.map((s) => [key(s), true])))} className="rounded border border-slate-200 px-1.5 hover:bg-slate-50">{t("รับทั้งหมด", "All")}</button>
                      <button type="button" onClick={() => setSeamOn(Object.fromEntries(sugg.map((s) => [key(s), false])))} className="rounded border border-slate-200 px-1.5 hover:bg-slate-50">{t("ไม่รับเลย", "None")}</button>
                    </span></div>
                  {!sugg.length ? <p className="text-slate-500">{t("ไม่เจอขอบที่ยาวเท่ากัน — ลองเปลี่ยนชนิดชิ้นด้านล่าง หรือเย็บเองหลังวาง", "No matching edge lengths — try changing the piece types below, or sew after placing")}</p> : (
                    <ul className="max-h-[220px] space-y-0.5 overflow-auto">
                      {sugg.map((s) => { const k = key(s), on = isOn(s); return (
                        <li key={k} onClick={() => setSelSeam(k === selSeam ? null : k)} className={`flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 ${k === selSeam ? "bg-amber-50 ring-1 ring-amber-300" : "hover:bg-slate-50"}`} data-dxf-seam-row>
                          <input type="checkbox" checked={on} onClick={(e) => e.stopPropagation()} onChange={(e) => setSeamOn((m) => ({ ...m, [k]: e.target.checked }))} aria-label={t("รับตะเข็บนี้", "Accept this seam")} />
                          <span className="min-w-0 flex-1 truncate">{nm(s.a.i)} <span className="text-slate-400">{t("ขอบ", "edge")} {edgeLabel(s.a)}</span> ↔ {nm(s.b.i)} <span className="text-slate-400">{t("ขอบ", "edge")} {edgeLabel(s.b)}</span></span>
                          <span className="shrink-0 tabular-nums text-slate-500">{s.la}{s.diff > 0.05 ? <span className="text-amber-700">{t(` · ต่าง ${Math.round(s.diff * 100) / 10} มม.`, ` · off ${Math.round(s.diff * 100) / 10} mm`)}</span> : null}</span>
                          <span className={`shrink-0 rounded px-1 text-[10px] ${s.pct >= 98 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{s.pct >= 99.95 ? t("ตรง 100%", "100%") : t(`ตรง ${s.pct}%`, `${s.pct}%`)}</span>
                        </li>); })}
                    </ul>
                  )}
                  <p className="text-[11px] text-slate-500">{t("เป็นการเดาจากความยาวขอบ — ติ๊กเฉพาะแนวที่เย็บจริง (ที่ติ๊กให้ก่อน = ตรง ≥ 98% และเป็นชิ้นที่ปกติเย็บกัน)", "Guessed from edge lengths — keep only seams that are really sewn (pre-ticked = ≥ 98% and pieces that are usually sewn together)")}</p>
                </div>
                {groups.length > 0 && (
                  <div className={box} data-dxf-groups>
                    <div className="flex items-center gap-1.5 font-medium text-slate-700"><Icon value="i:copy" className="text-sm" />{t("ชิ้นหน้าตาเหมือนกัน", "Identical pieces")}</div>
                    {groups.map((g, k) => (
                      <label key={k} className="flex items-center gap-1.5">
                        <input type="checkbox" checked={!linkOff.has(k)} onChange={(e) => setLinkOff((s) => { const n = new Set(s); if (e.target.checked) n.delete(k); else n.add(k); return n; })} />
                        <span className="min-w-0 flex-1 truncate">{nm(g.members[0])} ×{g.members.length}{g.mirror.some(Boolean) ? t(` (กลับด้าน ${g.mirror.filter(Boolean).length})`, ` (${g.mirror.filter(Boolean).length} mirrored)`) : ""}</span>
                        <span className="text-slate-400">{g.members.map((m) => m + 1).join(", ")}</span>
                      </label>
                    ))}
                    <p className="text-[11px] text-slate-500">{t("ติ๊ก = ผูกเป็นชุด แก้รูปชิ้นแรกแล้วชิ้นอื่นตาม (ชิ้นวางคว่ำในไฟล์จะถูกวางให้ตรงกับชิ้นแรก)", "Ticked = linked, edit the first and the rest follow (pieces placed upside down in the file are aligned with the first)")}</p>
                  </div>
                )}
                <div className={box} data-dxf-types>
                  <div className="flex items-center gap-1.5 font-medium text-slate-700"><Icon value="i:tag" className="text-sm" />{t("ชื่อและชนิดชิ้น", "Names and piece types")}</div>
                  <ul className="max-h-[220px] space-y-1 overflow-auto">
                    {base!.map((p, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="w-5 shrink-0 text-right tabular-nums text-slate-400">{i + 1}</span>
                        <input value={names[i] ?? ""} onChange={(e) => { const v = e.target.value.slice(0, 60); setNames((o) => o.map((x, k) => (k === i ? v : x))); setEdited((s) => new Set(s).add(i)); }} className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 px-1.5" aria-label={t(`ชื่อชิ้น ${i + 1}`, `Piece ${i + 1} name`)} title={p.name} />
                        <select value={types[i]} onChange={(e) => setType(i, e.target.value as PartType)} className="h-7 w-28 rounded-md border border-slate-200 bg-white px-1" aria-label={t(`ชนิดชิ้น ${i + 1}`, `Piece ${i + 1} type`)} data-dxf-type>
                          {PART_TYPES.map((x) => <option key={x.key} value={x.key}>{t(x.th, x.en)}</option>)}
                        </select>
                        <span className="w-20 shrink-0 text-right tabular-nums text-slate-500">{p.w}×{p.h}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-slate-500">{t("ระบบเดาชนิดจากขนาด — เปลี่ยนชนิดแล้วระบบเดาตะเข็บใหม่ (หู แถบเล็ก ช่องใส่ของ ไม่จับคู่อัตโนมัติ) · ชื่อเดิมจากไฟล์เก็บไว้เป็นรหัสชิ้น", "Types are guessed from size — changing a type re-guesses the seams (handles, tabs, pockets are not auto-paired) · the original file name is kept as the piece code")}</p>
                </div>
                {spotCount > 0 && (
                  <div className={box} data-dxf-spots>
                    <div className="flex items-center gap-1.5 font-medium text-slate-700"><Icon value="i:map-pin" className="text-sm" />{t(`จุดติดหู/แถบ ${spotCount} จุด`, `${spotCount} handle / tab spots`)}</div>
                    <p className="text-slate-500">{t("กรอบหรือตัว U เล็กในชิ้น (เส้นแดง) เก็บชื่อ \"จุดติดหู\" ไว้ — ใช้ยึดปลายหูอัตโนมัติในรอบ J2", "Small boxes / U shapes in pieces (red) are kept as \"handle spot\" — used to attach handle ends in round J2")}</p>
                  </div>
                )}
              </> : (
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
              )}
              <p className="text-[11px] text-slate-500"><b>{t("ต้องทำต่อเองหลังวาง", "After placing, you still need to")}</b> · {review ? t("ตรวจตะเข็บที่รับ (ตรวจแบบ) · เลือกวัสดุของแต่ละชิ้น · ตรวจขนาดเทียบของจริงอย่างน้อย 1 ชิ้น", "check the accepted seams (Pattern check) · pick each piece's material · check at least one size against the original") : t("เย็บขอบที่ติดกัน (ไฟล์ DXF ไม่เก็บตะเข็บ) · เลือกวัสดุของแต่ละชิ้น · ตรวจขนาดเทียบกับของจริงอย่างน้อย 1 ชิ้น", "sew the matching edges (DXF does not store seams) · pick each piece's material · check at least one piece's size against the original")}</p>
            </div>
          </div>
        )}
        {!imp && !err && (
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>{t("จาก CLO3D: File → Export → DXF (AAMA หรือ ASTM) แล้วเลือกไฟล์ .dxf ที่ได้", "From CLO3D: File → Export → DXF (AAMA or ASTM), then choose the .dxf file")}</li>
            <li>{t("ได้: รูปชิ้น เผื่อเย็บ รูเจาะ เส้นใน รอยบาก เส้นทางผ้า ชื่อชิ้น จำนวนตัด · ระบบเดาตะเข็บ ชื่อไทย และชิ้นที่เหมือนกันให้ตรวจก่อนวาง · ไม่ได้: วัสดุ หลายไซซ์", "Imported: shapes, allowance, holes, inner lines, notches, grain, names, cut counts · seams, Thai names and identical pieces are guessed for you to check · not imported: materials, sizes")}</li>
            <li>{t("ไฟล์ DXF ที่ส่งออกจากระบบนี้ (หน้าพิมพ์ / ไฟล์ตัด) ก็นำกลับเข้ามาได้", "DXF files exported from this system (Print / cut files) can be imported back too")}</li>
          </ul>
        )}
      </div>
    </ERPModal>
  );
}
