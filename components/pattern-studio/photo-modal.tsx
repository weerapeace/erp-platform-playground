"use client";

/**
 * ป๊อป "แกะจากรูป" ของสตูดิโอแพทเทิร์น (รอบ 5 · 2026-11-10) — 2 ทาง
 *   1) รูปแพทเทิร์นกระดาษ → ลอกเส้นรอบชิ้นอัตโนมัติในเครื่องผู้ใช้ (lib/pattern-trace) ไม่ใช้ AI ไม่เสียเงิน รูปไม่ถูกอัปโหลด
 *      ผู้ใช้เลือกชิ้นที่เอา + บอกความกว้างจริงของชิ้นใหญ่สุด → วางเป็นชิ้นบนกระดาน (แก้จุดต่อได้)
 *   2) ใช้ AI ของผู้ใช้เอง (ฟรี) → คัดลอกคำสั่งไปวางใน ChatGPT/Claude/Gemini พร้อมรูปหลายมุม → วางคำตอบ (JSON bagpattern/1) กลับ → ตรวจ + ดูตัวอย่าง → วางเป็นชิ้น + ตะเข็บตั้งต้น (lib/bag-ai-import)
 *   3) รูปกระเป๋าสำเร็จ → AI ในระบบประมาณสัดส่วน (เสียเงินตามการใช้ · POST /api/pattern-projects/ai-draft · ลงทะเบียน ai.bag_draft)
 *      → เปิดตัวสร้างจากแม่แบบทรงด้วยค่าที่ได้ ให้ตรวจ/แก้ก่อนวาง — เป็น "ร่างแรก" ไม่ใช่แพทเทิร์นสำเร็จ
 * ใช้ที่: PatternStudio (ปุ่ม แกะจากรูป)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { RangeInput } from "@/components/range-input";
import { apiFetch } from "@/lib/api";
import type { BagParams } from "@/lib/bag-templates";
import { contourShape, traceGray } from "@/lib/pattern-trace";
import { checkScale, rectifyGray, traceTolMm, type CheckPair, type PPt } from "@/lib/pattern-photo";
import { AI_PATTERN_PROMPT, parseAiPattern, type AiImport, type AiSeam } from "@/lib/bag-ai-import";
import { shapePathD } from "@/lib/pattern-shape";
import type { EditorPiece } from "@/components/pattern-sheet/shape-editor";

type Loaded = { url: string; w: number; h: number; gray: Uint8Array };
export type AiDraftInfo = { style: string; notes: string; confidence: number; fits: boolean; /** ค่าไหน AI เห็นจากภาพ / ประมาณ (รอบ I3) */ sources?: Record<string, "seen" | "estimated"> };

/** ภาพเทา → รูป (data URL) ให้แสดงหลังแก้มุมเอียง */
function grayUrl(gray: Uint8Array, w: number, h: number): string {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); if (!g) return "";
  const d = g.createImageData(w, h);
  for (let i = 0; i < gray.length; i++) { d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = gray[i]; d.data[i * 4 + 3] = 255; }
  g.putImageData(d, 0, 0);
  return c.toDataURL("image/jpeg", 0.85);
}

/** อ่านไฟล์รูป → ย่อให้ด้านยาวไม่เกิน max จุดภาพ → ผืนผ้าใบ */
async function toCanvas(file: File, max: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error("เปิดรูปนี้ไม่ได้ ลองไฟล์ JPG หรือ PNG")); im.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d"); if (!g) throw new Error("เครื่องนี้วาดรูปไม่ได้");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

/** ทางที่ 2: ใช้ AI ของผู้ใช้เอง — คัดลอกคำสั่ง → ไปวางใน ChatGPT/Claude/Gemini พร้อมรูป → วางคำตอบกลับ → ตรวจ + ดูตัวอย่าง → วางลงกระดาน */
function OwnAiTab({ onPlace }: { onPlace: (r: Extract<AiImport, { ok: true }>) => void }) {
  const t = useT();
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");
  const [res, setRes] = useState<AiImport | null>(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(AI_PATTERN_PROMPT); setCopied(true); }
    catch { promptRef.current?.select(); try { document.execCommand("copy"); setCopied(true); } catch { /* ผู้ใช้กด Ctrl+C เองได้ (ข้อความถูกเลือกไว้แล้ว) */ } }
  };
  const readFile = async (f: File | undefined) => { if (!f) return; try { const s = await f.text(); setText(s.slice(0, 200000)); setRes(parseAiPattern(s)); } catch { setRes({ ok: false, error: t("เปิดไฟล์นี้ไม่ได้", "Could not open this file") }); } };
  const good = res?.ok ? res : null;
  const view = useMemo(() => {
    if (!good) return null;
    let w = 1, h = 1;
    for (const p of good.pieces) { w = Math.max(w, p.at[0] + p.w + p.allow); h = Math.max(h, p.at[1] + p.h + p.allow); }
    return { w, h };
  }, [good]);
  const num = "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-medium text-blue-700";
  const tips: [string, string, string][] = [["i:photo", "ด้านหน้าตรง ๆ", "Front, straight on"], ["i:photo", "ด้านข้าง เห็นความหนา", "Side, showing depth"], ["i:photo", "ก้น และด้านบน", "Base and top"], ["i:ruler-measure", "บอกขนาดจริง กว้าง สูง หนา", "Tell it the real width, height, depth"]];
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><span className={num}>1</span>{t("คัดลอกคำสั่งนี้", "Copy this prompt")}</div>
        <textarea ref={promptRef} readOnly value={AI_PATTERN_PROMPT} rows={7} className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] leading-relaxed text-slate-700" />
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void copy()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-xs text-blue-700 hover:bg-blue-50"><Icon value="i:copy" className="text-sm" />{t("คัดลอกคำสั่ง", "Copy prompt")}</button>
          {copied && <span className="text-xs text-emerald-700">{t("คัดลอกแล้ว", "Copied")}</span>}
        </div>
      </div>
      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><span className={num}>2</span>{t("วางใน ChatGPT, Claude หรือ Gemini พร้อมรูปกระเป๋าหลายมุม", "Paste it into ChatGPT, Claude or Gemini with photos from several angles")}</div>
        <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
          {tips.map(([ic, th, en]) => <div key={th} className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1.5"><Icon value={ic} className="text-sm text-slate-400" />{t(th, en)}</div>)}
        </div>
        <p className="text-[11px] text-slate-500">{t("ใช้บัญชี AI ของคุณเอง ระบบนี้ไม่ได้ส่งรูปหรือข้อมูลไปที่ไหน และไม่มีค่าใช้จ่ายในระบบ · ถ้า AI ถามขนาดกลับ ให้ตอบตามที่วัดจริง", "This uses your own AI account. Nothing is sent from this system and nothing is charged here. If the AI asks for sizes, answer with real measurements.")}</p>
      </div>
      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><span className={num}>3</span>{t("วางคำตอบของ AI กลับมาที่นี่", "Paste the AI's answer here")}</div>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setRes(null); }} rows={5} placeholder={'{ "format": "bagpattern/1", "pieces": [ … ] }'} className="w-full resize-y rounded-lg border border-slate-200 p-2 font-mono text-[11px] leading-relaxed" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setRes(parseAiPattern(text))} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"><Icon value="i:checks" className="text-sm" />{t("ตรวจและดูตัวอย่าง", "Check and preview")}</button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50">
            <Icon value="i:file-text" className="text-sm" />{t("หรือเลือกไฟล์ .json / .txt", "or choose a .json / .txt file")}
            <input type="file" accept=".json,.txt,application/json,text/plain" className="hidden" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
        {res && !res.ok && <div className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{res.error}</div>}
        {good && view && (
          <div className="space-y-2">
            <div className="rounded-lg bg-slate-50 p-2">
              <svg viewBox={`-1 -1 ${view.w + 2} ${view.h + 2}`} className="block max-h-[260px] w-full" role="img" aria-label={t("ตัวอย่างชิ้นที่อ่านได้", "Preview of the pieces")}>
                {good.pieces.map((p, i) => (
                  <g key={i}>
                    <path d={shapePathD(p.shape, p.at[0], p.at[1])} fill="#dbeafe" stroke="#2563eb" strokeWidth={Math.max(0.12, view.w / 500)} />
                    <text x={p.at[0] + p.w / 2} y={p.at[1] + p.h / 2} fontSize={Math.max(1.1, Math.min(2.4, Math.min(p.w, p.h) / 3))} textAnchor="middle" dominantBaseline="central" fill="#1e3a8a">P{i + 1}</text>
                  </g>
                ))}
              </svg>
            </div>
            <ul className="divide-y divide-slate-100 text-xs">
              {good.pieces.map((p, i) => <li key={i} className="flex justify-between gap-2 py-1"><span>P{i + 1} {p.name} ×{p.count}{p.material ? <span className="text-slate-400"> · {p.material}</span> : null}</span><span className="tabular-nums text-slate-500">{p.w.toFixed(1)} × {p.h.toFixed(1)} {t("ซม.", "cm")} · {t("เผื่อ", "allow.")} {p.allow.toFixed(1)}</span></li>)}
            </ul>
            <p className="text-xs text-slate-600">{t(`อ่านได้ ${good.pieces.length} ชิ้น · ตะเข็บ ${good.seams.length} แนว`, `${good.pieces.length} pieces read · ${good.seams.length} seams`)}
              {good.skipped.length > 0 && <span className="text-amber-700"> · {t(`ข้าม ${good.skipped.length} ชิ้นที่ขนาดหรือรูปทรงใช้ไม่ได้: ${good.skipped.join(", ")}`, `skipped ${good.skipped.length} invalid pieces: ${good.skipped.join(", ")}`)}</span>}
              {good.seamsSkipped > 0 && <span className="text-amber-700"> · {t(`ข้ามตะเข็บ ${good.seamsSkipped} แนวที่อ้างชิ้นหรือขอบไม่ได้`, `skipped ${good.seamsSkipped} seams that point at a missing piece or edge`)}</span>}</p>
            {good.notes && <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("AI บอกว่า", "The AI says")}: {good.notes}</div>}
            <p className="text-[11px] text-slate-500">{t("นี่คือร่างแรกจากการประมาณของ AI — วางลงกระดานแล้วให้ช่างตรวจขนาดกับของจริง · ตะเข็บที่ยาวไม่เท่ากันจะขึ้นเตือนในเครื่องมือเย็บ · เส้นโค้งที่มาเป็นเหลี่ยม เกลาได้ด้วย แก้จุด", "A first draft from the AI's estimate — have your pattern maker check sizes after placing. Seams of unequal length are flagged in the sewing tool. Refine angular curves with Edit points.")}</p>
            <button type="button" onClick={() => onPlace(good)} className="h-9 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700">{t(`วางลงกระดาน (${good.pieces.length} ชิ้น)`, `Place on the board (${good.pieces.length} pieces)`)}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function PhotoModal({ open, onClose, onPieces, onDraft, materials, traceOnly = false }: {
  open: boolean; onClose: () => void;
  /** true = มีแค่แท็บ "รูปแพทเทิร์นกระดาษ (ลอกเส้น)" (ไม่มีทาง AI) — หน้าคิดผ้าก่อนซื้อใช้ */
  traceOnly?: boolean;
  /** ชิ้นที่ลอกจากรูปแพทเทิร์น / ที่ AI ของผู้ใช้ร่างให้ → วางลงกระดาน · seams = ตะเข็บตั้งต้น (อ้างลำดับชิ้นในรายการ) */
  onPieces: (pieces: EditorPiece[], seams?: AiSeam[]) => void;
  /** วัสดุที่เลือกได้ในหน้านี้ — ชื่อวัสดุที่ AI ตอบมาตรงกับชื่อในรายการ = ใส่วัสดุให้ชิ้นเลย */
  materials?: { id: string; name: string }[];
  /** ค่าแม่แบบที่ AI ร่างจากรูปกระเป๋า → เปิดตัวสร้างจากแม่แบบ */
  onDraft: (params: BagParams, info: AiDraftInfo) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<"trace" | "own" | "ai">("trace");
  const [err, setErr] = useState<string | null>(null);
  // ── ลอกจากรูปแพทเทิร์น
  const [img, setImg] = useState<Loaded | null>(null);
  const [bias, setBias] = useState(0);
  const [mode, setMode] = useState<"auto" | "dark" | "light">("auto");
  const [eps, setEps] = useState(2);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [realW, setRealW] = useState(30);
  // ── รอบ I3: แก้มุมเอียง (4 มุมของกรอบที่รู้ขนาด) · จุดตรวจระยะ (2 จุด + ระยะจริง หลายคู่) · ค่าคลาดที่ยอมได้
  const [clickMode, setClickMode] = useState<null | "quad" | "check">(null);
  const [quad, setQuad] = useState<PPt[]>([]);
  const [refW, setRefW] = useState(29.7);
  const [refH, setRefH] = useState(21);
  const [ext, setExt] = useState(0);
  const [orig, setOrig] = useState<Loaded | null>(null);
  const [fixedScale, setFixedScale] = useState<number | null>(null);
  const [checks, setChecks] = useState<{ a: PPt; b?: PPt; real: number }[]>([]);
  const [tolCm, setTolCm] = useState(0.3);
  // ── AI จากรูปกระเป๋า
  const [bag, setBag] = useState<{ url: string; w: number; h: number } | null>(null);
  const [bagW, setBagW] = useState(32);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setErr(null); }, [open, tab]);

  const pickTrace = async (f: File | undefined) => {
    if (!f) return; setErr(null);
    try {
      const c = await toCanvas(f, 900), d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      const gray = new Uint8Array(c.width * c.height);
      for (let i = 0; i < gray.length; i++) gray[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
      setImg({ url: c.toDataURL("image/jpeg", 0.8), w: c.width, h: c.height, gray }); setOff(new Set());
      setOrig(null); setFixedScale(null); setQuad([]); setChecks([]); setClickMode(null);
    } catch (e) { setErr((e as Error).message); }
  };
  const pickBag = async (f: File | undefined) => {
    if (!f) return; setErr(null);
    try { const c = await toCanvas(f, 1024); setBag({ url: c.toDataURL("image/jpeg", 0.85), w: c.width, h: c.height }); }
    catch (e) { setErr((e as Error).message); }
  };

  const traced = useMemo(() => (img ? traceGray(img.gray, img.w, img.h, { bias, pieces: mode, eps }) : null), [img, bias, mode, eps]);
  const chosen = useMemo(() => (traced?.contours ?? []).map((c, i) => ({ c, i })).filter((x) => !off.has(x.i)), [traced, off]);
  const widest = chosen.reduce((m, x) => Math.max(m, x.c.box.w), 0);
  const pairs: CheckPair[] = checks.flatMap((c) => (c.b ? [{ a: c.a, b: c.b, real: c.real }] : []));
  const chk = useMemo(() => checkScale(pairs, tolCm, fixedScale), [JSON.stringify(pairs), tolCm, fixedScale]);   // eslint-disable-line react-hooks/exhaustive-deps
  const scaleFrom: "rect" | "checks" | "widest" = fixedScale ? "rect" : chk ? "checks" : "widest";
  const cmPerPx = fixedScale ?? chk?.cmPerPx ?? (widest > 0 && realW > 0 ? realW / widest : 0);
  /** คลิกบนรูป (โหมดเลือกมุม / จุดตรวจ) → พิกัดจุดภาพ */
  const onImgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!clickMode || !img) return;
    const svg = e.currentTarget, m = svg.getScreenCTM(); if (!m) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(m.inverse()), p: PPt = [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10];
    if (clickMode === "quad") setQuad((old) => { const n = [...old, p].slice(-4); if (n.length === 4) setClickMode(null); return n; });
    else setChecks((old) => { const last = old[old.length - 1]; if (last && !last.b) { setClickMode(null); return [...old.slice(0, -1), { ...last, b: p }]; } return [...old, { a: p, real: 10 }]; });
  };
  const rectify = () => {
    if (!img || quad.length !== 4) return;
    const r = rectifyGray(img.gray, img.w, img.h, quad, refW, refH, { extend: ext, maxSide: 900 });
    if (!r) { setErr(t("4 จุดต้องเป็นมุมของสี่เหลี่ยม ไม่ไขว้กัน — ลองคลิกใหม่", "The 4 points must be corners of a quadrilateral without crossing — try again")); return; }
    setOrig(orig ?? img); setImg({ url: grayUrl(r.gray, r.w, r.h), w: r.w, h: r.h, gray: r.gray }); setFixedScale(r.cmPerPx);
    setQuad([]); setChecks([]); setOff(new Set()); setErr(null);
  };
  const undoRectify = () => { if (!orig) return; setImg(orig); setOrig(null); setFixedScale(null); setChecks([]); setOff(new Set()); };
  const toggle = (i: number) => setOff((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const place = () => {
    const out: EditorPiece[] = [];
    chosen.forEach(({ c }, k) => {
      const shape = contourShape(c, cmPerPx);
      if (shape) out.push({ shape, count: 1, allow: 0, name: t(`ชิ้นจากรูป ${k + 1}`, `Traced piece ${k + 1}`), at: [Math.round(c.box.x * cmPerPx * 10) / 10, Math.round(c.box.y * cmPerPx * 10) / 10] });
    });
    if (out.length) onPieces(out);
  };
  const askAi = async () => {
    if (!bag) return;
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch("/api/pattern-projects/ai-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: bag.url, width_cm: bagW }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      const d = j.data as { params: BagParams; is_bag: boolean; fits: boolean; confidence: number; style: string; notes: string; sources?: Record<string, "seen" | "estimated"> };
      if (!d.is_bag) throw new Error(t("AI ดูแล้วไม่เห็นว่าเป็นรูปกระเป๋า ลองรูปที่เห็นกระเป๋าทั้งใบชัด ๆ", "The AI could not see a bag in this photo. Try one that shows the whole bag clearly."));
      onDraft(d.params, { style: d.style, notes: d.notes, confidence: d.confidence, fits: d.fits, sources: d.sources });
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const seg = (on: boolean) => `h-8 rounded-md px-3 text-xs ${on ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`;
  const fileBtn = (label: string, onFile: (f: File | undefined) => void) => (
    <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-sm text-blue-700 hover:bg-blue-50">
      <Icon value="i:photo" className="text-base" />{label}
      <input type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
    </label>
  );
  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="pattern-photo-modal" title={t("แกะจากรูป", "Start from a photo")} loading={busy}
      description={t("ได้ร่างแรกให้แก้ต่อ ไม่ใช่แพทเทิร์นสำเร็จ — ตรวจขนาดกับของจริงก่อนตัดเสมอ", "Gives a first draft to refine, not a finished pattern — always check sizes against the real thing before cutting")}
      footer={tab === "own" ? (
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ปิด", "Close")}</button></div>
      ) : tab === "trace" ? (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" disabled={!chosen.length || !(cmPerPx > 0)} onClick={place} className="h-9 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-40">{t(`วางลงกระดาน (${chosen.length} ชิ้น)`, `Place on the board (${chosen.length} pieces)`)}</button>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" disabled={!bag || busy} onClick={() => void askAi()} className="h-9 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-40">{busy ? t("AI กำลังดูรูป…", "AI is looking…") : t("ให้ AI ประมาณขนาด", "Ask the AI to estimate")}</button>
        </div>
      )}>
      <div className="space-y-3 text-sm">
        {!traceOnly && <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group">
          <button type="button" className={seg(tab === "trace")} onClick={() => setTab("trace")}>{t("รูปแพทเทิร์นกระดาษ (ลอกเส้น)", "Paper pattern photo (trace)")}</button>
          <button type="button" className={seg(tab === "own")} onClick={() => setTab("own")}>{t("ใช้ AI ของคุณเอง (ฟรี)", "Use your own AI (free)")}</button>
          <button type="button" className={seg(tab === "ai")} onClick={() => setTab("ai")}>{t("AI ในระบบ (เสียเงิน)", "Built-in AI (paid)")}</button>
        </div>}

        {tab === "own" ? (
          <OwnAiTab onPlace={(r) => onPieces(r.pieces.map((p) => {
            const m = p.material ? materials?.find((x) => x.name.trim().toLowerCase() === p.material!.toLowerCase()) : undefined;
            return { shape: p.shape, count: p.count, allow: p.allow, name: p.name, at: p.at, ...(m ? { mats: [{ id: m.id, name: m.name }] } : {}) };
          }), r.seams)} />
        ) : tab === "trace" ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-2">
              {fileBtn(img ? t("เปลี่ยนรูป", "Change photo") : t("เลือกรูปแพทเทิร์น", "Choose a pattern photo"), (f) => void pickTrace(f))}
              {img ? (
                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="block w-full" />
                  <svg viewBox={`0 0 ${img.w} ${img.h}`} className="absolute inset-0 h-full w-full" onClick={onImgClick} style={clickMode ? { cursor: "crosshair" } : undefined} data-photo-svg>
                    {(traced?.contours ?? []).map((c, i) => (
                      <polygon key={i} points={c.pts.map((p) => p.join(",")).join(" ")} onClick={() => { if (!clickMode) toggle(i); }} style={{ cursor: clickMode ? "crosshair" : "pointer", pointerEvents: clickMode ? "none" : undefined }}
                        fill={off.has(i) ? "rgba(148,163,184,0.15)" : "rgba(37,99,235,0.22)"} stroke={off.has(i) ? "#94a3b8" : "#2563eb"} strokeWidth={Math.max(1.5, img.w / 400)} strokeDasharray={off.has(i) ? "6 4" : undefined} />
                    ))}
                    {quad.length > 0 && <g data-photo-quad style={{ pointerEvents: "none" }}>
                      {quad.length > 1 && <polyline points={[...quad, ...(quad.length === 4 ? [quad[0]] : [])].map((p) => p.join(",")).join(" ")} fill="none" stroke="#f59e0b" strokeWidth={Math.max(1.5, img.w / 350)} />}
                      {quad.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={Math.max(4, img.w / 120)} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />)}
                    </g>}
                    {checks.map((c, i) => <g key={`c${i}`} style={{ pointerEvents: "none" }} data-photo-check>
                      {c.b && <line x1={c.a[0]} y1={c.a[1]} x2={c.b[0]} y2={c.b[1]} stroke={chk?.rows[checks.slice(0, i).filter((x) => x.b).length]?.ok === false ? "#dc2626" : "#059669"} strokeWidth={Math.max(1.5, img.w / 350)} />}
                      {[c.a, ...(c.b ? [c.b] : [])].map((p, k) => <circle key={k} cx={p[0]} cy={p[1]} r={Math.max(3.5, img.w / 140)} fill="#059669" stroke="#fff" strokeWidth={1.2} />)}
                      <text x={c.a[0] + 6} y={c.a[1] - 6} fontSize={Math.max(10, img.w / 55)} fill="#047857" stroke="#fff" strokeWidth={3} paintOrder="stroke">{i + 1}</text>
                    </g>)}
                  </svg>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">{t("วางแพทเทิร์นกระดาษบนพื้นสีตัดกัน (กระดาษขาวบนโต๊ะสีเข้ม หรือกลับกัน) แล้วถ่ายตรงจากด้านบน", "Lay the paper pattern on a contrasting surface and shoot straight from above")}</div>
              )}
              {img && <p className="text-xs text-slate-500">{traced?.contours.length ? t(`เจอ ${traced.contours.length} ชิ้น · กดที่ชิ้นในรูปเพื่อเอา/ไม่เอา · รูปไม่ถูกอัปโหลด ประมวลผลในเครื่องนี้`, `Found ${traced.contours.length} pieces · click a piece to include or skip it · the photo stays on this device`) : t("ยังแยกชิ้นไม่ได้ ลองปรับแถบด้านขวา หรือเปลี่ยนเป็นชิ้นเข้ม/อ่อนกว่าพื้น", "No pieces found yet. Try the sliders on the right, or switch darker/lighter.")}</p>}
            </div>
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <div className="font-medium text-slate-600">{t("ชิ้นกับพื้น", "Pieces vs background")}</div>
                <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="group">
                  {([["auto", "อัตโนมัติ", "Auto"], ["dark", "ชิ้นเข้มกว่า", "Darker"], ["light", "ชิ้นอ่อนกว่า", "Lighter"]] as const).map(([k, th, en]) => <button key={k} type="button" className={`${seg(mode === k)} flex-1 px-1`} onClick={() => setMode(k)}>{t(th, en)}</button>)}
                </div>
              </div>
              <RangeInput label={t("ความไวแยกชิ้นจากพื้น", "Piece/background sensitivity")} min={-80} max={80} step={2} value={bias} onChange={setBias} />
              <RangeInput label={t("ความละเอียดของเส้น (น้อย = ตามรูปมาก จุดเยอะ)", "Outline detail (lower = more points)")} min={0.5} max={10} step={0.5} value={eps} onChange={setEps} />
              {img && cmPerPx > 0 && <p className="-mt-2 text-[11px] text-slate-500" data-trace-tol>{t(`เส้นที่ลอกห่างขอบในรูปได้ไม่เกิน ≈ ${traceTolMm(eps, cmPerPx)} มม. · 1 จุดภาพ = ${Math.round(cmPerPx * 100) / 10} มม.`, `Traced line stays within ≈ ${traceTolMm(eps, cmPerPx)} mm of the photo edge · 1 px = ${Math.round(cmPerPx * 100) / 10} mm`)}</p>}
              {img && (
                <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50/60 p-2" data-photo-rectify>
                  <div className="font-medium text-slate-700">{t("แก้มุมเอียงของรูป", "Fix photo perspective")}</div>
                  {orig ? <div className="flex items-center gap-1.5 text-emerald-700">{t("แก้แล้ว · มาตราส่วนจากกรอบอ้างอิง", "Fixed · scale from the reference")}<button type="button" onClick={undoRectify} className="ml-auto h-7 rounded-md border border-slate-200 bg-white px-2 text-slate-600 hover:bg-slate-50">{t("กลับรูปเดิม", "Undo")}</button></div> : <>
                    <p className="text-[11px] text-slate-500">{t("วางของที่รู้ขนาดในรูป (กระดาษ A4 29.7×21 · แผ่นรองตัด) แล้วคลิก 4 มุมของมัน", "Put something of known size in the photo (A4 paper 29.7×21, a cutting mat) and click its 4 corners")}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" data-photo-quad-pick onClick={() => { setQuad([]); setClickMode(clickMode === "quad" ? null : "quad"); }} aria-pressed={clickMode === "quad"} className={`h-7 rounded-md border px-2 ${clickMode === "quad" ? "border-amber-400 bg-amber-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}>{clickMode === "quad" ? t(`คลิกมุมที่ ${quad.length + 1}/4`, `Click corner ${quad.length + 1}/4`) : t("คลิก 4 มุม", "Click 4 corners")}</button>
                      <span>{t("กว้าง", "W")}</span><input type="number" min={1} step={0.1} value={refW} onChange={(e) => setRefW(Math.max(0, Number(e.target.value) || 0))} className="h-7 w-16 rounded-md border border-slate-200 px-1 text-right" aria-label={t("กว้างจริงของกรอบ (ซม.)", "Reference width (cm)")} />
                      <span>{t("สูง", "H")}</span><input type="number" min={1} step={0.1} value={refH} onChange={(e) => setRefH(Math.max(0, Number(e.target.value) || 0))} className="h-7 w-16 rounded-md border border-slate-200 px-1 text-right" aria-label={t("สูงจริงของกรอบ (ซม.)", "Reference height (cm)")} />{t("ซม.", "cm")}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select value={ext} onChange={(e) => setExt(Number(e.target.value))} className="h-7 rounded-md border border-slate-200 bg-white px-1" aria-label={t("พื้นที่ที่เก็บ", "Area kept")}>
                        <option value={0}>{t("เก็บเฉพาะในกรอบ", "Inside the reference only")}</option><option value={0.5}>{t("เก็บรอบกรอบครึ่งเท่า", "Half a reference around it")}</option><option value={1}>{t("เก็บรอบกรอบ 1 เท่า", "One reference around it")}</option>
                      </select>
                      <button type="button" data-photo-rectify-apply disabled={quad.length !== 4 || !(refW > 0 && refH > 0)} onClick={rectify} className="h-7 rounded-md bg-amber-500 px-2 text-white hover:bg-amber-600 disabled:opacity-40">{t("แก้มุมเอียง", "Fix perspective")}</button>
                    </div>
                  </>}
                </div>
              )}
              {img && (
                <div className="space-y-1.5 rounded-md border border-emerald-200 bg-emerald-50/50 p-2" data-photo-checks>
                  <div className="flex items-center gap-1.5 font-medium text-slate-700">{t("จุดตรวจระยะ", "Check distances")}
                    <span className="ml-auto inline-flex items-center gap-1 font-normal text-slate-500">{t("คลาดได้ ±", "Tolerance ±")}<input type="number" min={0.05} step={0.05} value={tolCm} onChange={(e) => setTolCm(Math.max(0.05, Number(e.target.value) || 0.3))} className="h-6 w-14 rounded border border-slate-200 px-1 text-right" aria-label={t("ค่าคลาดที่ยอมได้ (ซม.)", "Tolerance (cm)")} />{t("ซม.", "cm")}</span></div>
                  <p className="text-[11px] text-slate-500">{t("คลิก 2 จุดที่รู้ระยะจริง (เช่น ขอบชิ้นที่วัดแล้ว ไม้บรรทัดในรูป) แล้วพิมพ์ระยะ — หลายคู่ = ระบบตรวจว่าทั้งรูปตรงไหม", "Click 2 points with a known real distance (a measured edge, a ruler in the photo) and type it — several pairs show whether the whole photo is true")}</p>
                  {checks.map((c, i) => { const k = checks.slice(0, i).filter((x) => x.b).length, row = c.b ? chk?.rows[k] : undefined; return (
                    <div key={i} className="flex flex-wrap items-center gap-1.5" data-photo-check-row>
                      <span className="text-slate-500">#{i + 1}</span>{t("จริง", "Real")}
                      <input type="number" min={0.1} step={0.1} value={c.real} onChange={(e) => setChecks((old) => old.map((x, j) => (j === i ? { ...x, real: Math.max(0, Number(e.target.value) || 0) } : x)))} className="h-6 w-16 rounded border border-slate-200 px-1 text-right" aria-label={t("ระยะจริง (ซม.)", "Real distance (cm)")} />{t("ซม.", "cm")}
                      {!c.b ? <span className="text-amber-700">{t("คลิกจุดที่ 2", "Click the 2nd point")}</span> : row ? <span className={row.ok ? "text-emerald-700" : "text-rose-700"}>{t(`วัดได้ ${row.got} · คลาด ${row.err > 0 ? "+" : ""}${row.err} (${row.pct}%)`, `measured ${row.got} · off ${row.err > 0 ? "+" : ""}${row.err} (${row.pct}%)`)}{row.ok ? " ✓" : " ✗"}</span> : null}
                      <button type="button" onClick={() => setChecks((old) => old.filter((_, j) => j !== i))} className="ml-auto text-slate-300 hover:text-rose-600" aria-label={t("ลบจุดตรวจ", "Remove check")}>✕</button>
                    </div>); })}
                  <button type="button" data-photo-check-add onClick={() => setClickMode(clickMode === "check" ? null : "check")} aria-pressed={clickMode === "check"} className={`h-7 rounded-md border px-2 ${clickMode === "check" ? "border-emerald-400 bg-emerald-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}>{clickMode === "check" ? t("คลิก 2 จุดบนรูป…", "Click 2 points on the photo…") : t("+ จุดตรวจ", "+ Check")}</button>
                  {chk && <p className={`text-[11px] ${chk.ok ? "text-emerald-700" : "text-rose-700"}`} data-photo-check-sum>{chk.ok ? t(`ผ่านทุกจุด (คลาดมากสุด ${chk.worst} ซม.)`, `All checks pass (worst ${chk.worst} cm)`) : (fixedScale ? t(`คลาดเกิน ±${tolCm} ซม. (มากสุด ${chk.worst}) — ตรวจว่าวัดของจริงถูก คลิกตรงจุด และชิ้นวางราบกับกระดาษ`, `Off by more than ±${tolCm} cm (worst ${chk.worst}) — check the real measurement, the clicked points, and that pieces lie flat`) : t(`คลาดเกิน ±${tolCm} ซม. (มากสุด ${chk.worst}) — รูปอาจถ่ายเอียง ลอง "แก้มุมเอียง" ก่อน`, `Off by more than ±${tolCm} cm (worst ${chk.worst}) — the photo may be tilted, try "Fix perspective" first`))}</p>}
                </div>
              )}
              {scaleFrom === "widest" ? <RangeInput label={t("ความกว้างจริงของชิ้นที่กว้างที่สุด", "Real width of the widest piece")} unit={t("ซม.", "cm")} min={2} max={150} step={0.5} value={realW} onChange={setRealW} />
                : <p className="text-[11px] text-slate-600" data-scale-from>{scaleFrom === "rect" ? t("มาตราส่วนจากกรอบอ้างอิงที่แก้มุมเอียง", "Scale from the perspective reference") : t("มาตราส่วนจากจุดตรวจระยะ (เข้ากับทุกคู่มากที่สุด)", "Scale from the check distances (best fit to all pairs)")}</p>}
              {chosen.length > 0 && cmPerPx > 0 && (
                <ul className="space-y-0.5 rounded-md bg-slate-50 p-2 tabular-nums text-slate-600">
                  {chosen.map(({ c, i }, k) => <li key={i}>{t(`ชิ้น ${k + 1}`, `Piece ${k + 1}`)} · {(c.box.w * cmPerPx).toFixed(1)} × {(c.box.h * cmPerPx).toFixed(1)} {t("ซม.", "cm")} · {c.pts.length} {t("จุด", "pts")}</li>)}
                </ul>
              )}
              <div className="space-y-1 rounded-md border border-slate-200 p-2 text-slate-500">
                <div className="font-medium text-slate-700">{t("ช่างคิดยังไง", "How a pattern maker thinks")}</div>
                <p>{t("รูปถ่ายไม่มีมาตราส่วน ระบบจึงต้องให้คุณวัดของจริง 1 ค่า แล้วย่อขยายทุกชิ้นตามค่านั้น — ถ่ายเอียงนิดเดียวขนาดก็เพี้ยนได้ ให้วัดซ้ำอีกด้านหลังวางลงกระดาน", "A photo has no scale, so you give one real measurement and everything is scaled from it. A slightly tilted shot distorts sizes — re-measure another side after placing.")}</p>
                <p>{t("เส้นที่ลอกได้คือขอบกระดาษ ระบบไม่รู้ว่าเป็นเส้นตัดหรือเส้นเย็บ ชิ้นที่วางจึงยังไม่มีเผื่อเย็บ ให้ตั้งเองในแผงของชิ้น · เส้นโค้งจะเป็นเส้นตรงสั้น ๆ ต่อกัน ใช้ แก้จุด เกลาได้", "The traced line is the paper edge — the system cannot tell cut line from sew line, so placed pieces have no allowance yet. Curves become short straight segments; refine with Edit points.")}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-2">
              {fileBtn(bag ? t("เปลี่ยนรูป", "Change photo") : t("เลือกรูปกระเป๋า", "Choose a bag photo"), (f) => void pickBag(f))}
              {bag ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bag.url} alt="" className="block max-h-[420px] rounded-lg border border-slate-200 object-contain" />
              ) : <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">{t("รูปที่เห็นกระเป๋าทั้งใบ มุมเฉียงเล็กน้อยให้เห็นความหนา จะประมาณได้ดีที่สุด", "A photo showing the whole bag at a slight angle (so the depth is visible) works best")}</div>}
            </div>
            <div className="space-y-3 text-xs">
              <RangeInput label={t("ความกว้างก้นกระเป๋าจริง", "Real base width of the bag")} unit={t("ซม.", "cm")} min={10} max={80} step={0.5} value={bagW} onChange={setBagW} />
              <div className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-amber-800"><Icon value="i:coin" className="mt-0.5 text-sm" /><span>{t("ปุ่มนี้ใช้ AI ที่เสียเงินตามการใช้ (ครั้งละไม่กี่สตางค์ถึงราวหนึ่งบาท ตามโมเดลที่ตั้งไว้) · ผู้ดูแลเปิด-ปิดและดูยอดได้ที่ ศูนย์ AI/API ที่เสียเงิน · รูปถูกส่งให้ AI อ่านครั้งเดียว ไม่ถูกเก็บ", "This button uses a paid AI (a fraction of a baht to about one baht per use, depending on the model). Admins can switch it off and see usage in the paid AI/API centre. The photo is sent once and not stored.")}</span></div>
              <div className="space-y-1 rounded-md border border-slate-200 p-2 text-slate-500">
                <div className="font-medium text-slate-700">{t("สิ่งที่ได้ และที่ไม่ได้", "What you get, and what you do not")}</div>
                <p>{t("AI ประมาณ \"สัดส่วน\" ของกระเป๋า (สูง หนา ปากบาน มุมก้น หู ช่องด้านหน้า) แล้วระบบคูณด้วยความกว้างจริงที่คุณใส่ เปิดตัวสร้างจากแม่แบบทรงให้ตรวจและแก้ก่อนวาง", "The AI estimates the bag's proportions; the system scales them by your real width and opens the template builder for you to check and adjust.")}</p>
                <p>{t("ได้เฉพาะทรงที่แม่แบบรองรับ (Tote: ตัวหน้า ตัวหลัง ข้าง ก้น หู) — เป้ กระเป๋ามีฝา มีจีบ หรือทรงกระบอก จะถูกประมาณเป็นทรง Tote ที่ใกล้ที่สุด · ยังไม่เคยทดสอบกับรูปจริงจำนวนมาก ถือเป็นจุดเริ่ม ไม่ใช่คำตอบ", "Only the tote template is supported — backpacks, flap bags, pleats or cylinders are approximated as the nearest tote. Not yet tested on many real photos: a starting point, not an answer.")}</p>
              </div>
            </div>
          </div>
        )}
        {err && <div className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</div>}
      </div>
    </ERPModal>
  );
}
