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
import { contourShape, EDIT_ERASE, EDIT_KEEP, paintEdits, traceGray } from "@/lib/pattern-trace";
import { ZoomBox, ZoomControls } from "@/components/zoom-box";
import { shortcutKey } from "@/lib/shortcut-key";
import type { Pt } from "@/lib/pattern-shape";
import { autoQuad, checkScale, cropCorners, cropGray, rectifyGray, scaleFromFixes, straightenPts, straightenSize, traceTolMm, type CheckPair, type CropRect, type PPt } from "@/lib/pattern-photo";
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

/** ชั้นรอยยางลบ/แปรงเติม → รูปโปร่งใส (แดง = ลบ · เขียว = เติม) วางทับรูปให้เห็นว่าระบายตรงไหนไปแล้ว */
function editsUrl(ed: Uint8Array, w: number, h: number): string {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); if (!g) return "";
  const d = g.createImageData(w, h);
  for (let i = 0; i < ed.length; i++) {
    if (ed[i] === EDIT_ERASE) { d.data[i * 4] = 239; d.data[i * 4 + 1] = 68; d.data[i * 4 + 2] = 68; d.data[i * 4 + 3] = 90; }
    else if (ed[i] === EDIT_KEEP) { d.data[i * 4] = 16; d.data[i * 4 + 1] = 185; d.data[i * 4 + 2] = 129; d.data[i * 4 + 3] = 90; }
  }
  g.putImageData(d, 0, 0);
  return c.toDataURL("image/png");
}

/** ความสว่างเฉลี่ย 3×3 รอบจุดที่คลิก (ดูดสีพื้น) */
function sampleGray(gray: Uint8Array, w: number, h: number, x: number, y: number): number {
  let s = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
    if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += gray[yy * w + xx]; n++; }
  }
  return n ? Math.round(s / n) : 0;
}

type TraceTool = "pick" | "erase" | "add" | "bgpick" | "crop" | "fix";
/** ชิ้นที่ทำให้ตรงแล้ว: 4 มุมบนรูป (จุดภาพ) + ขนาดจริง (ซม. · 0 = ไม่รู้ด้านนั้น) — ผูกกับชิ้นด้วย "จุดกลาง 4 มุมอยู่ในชิ้นไหน" (เลขชิ้นเปลี่ยนได้หลังลบ/ปรับแถบ) */
type PieceFix = { quad: PPt[]; w: number; h: number; name?: string; count?: number };

function pointInPoly([x, y]: PPt, P: PPt[]): boolean {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [a, b] = P[i], [d, e] = P[j]; if ((b > y) !== (e > y) && x < ((d - a) * (y - b)) / (e - b) + a) c = !c; }
  return c;
}
const quadCenter = (q: PPt[]): PPt => [q.reduce((s, p) => s + p[0], 0) / q.length, q.reduce((s, p) => s + p[1], 0) / q.length];
const r1 = (v: number) => Math.round(v * 10) / 10;
type EditSnap = { edits: Uint8Array | null; bg: number[] };

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
  // ── 2026-11-16 เจ้าของขอ: ซูม (Ctrl+ล้อเมาส์ · มือถือสองนิ้ว) + ยางลบ/แปรงเติม/ดูดสีพื้น + ย้อนกลับ/ทำซ้ำ
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<TraceTool>("pick");
  const [brushPx, setBrushPx] = useState(18);                    // ขนาดแปรงบนจอ (คงที่แม้ซูม)
  const [edits, setEdits] = useState<Uint8Array | null>(null);   // ชั้นรอย ขนาดเท่ารูปที่ลอก
  const [bgVals, setBgVals] = useState<number[]>([]);            // สีพื้นที่ดูดไว้
  const [bgTol, setBgTol] = useState(12);
  const [stroke, setStroke] = useState<{ pts: Pt[]; r: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; r: number } | null>(null);
  const hist = useRef<EditSnap[]>([]), fut = useRef<EditSnap[]>([]);
  const [, setHistTick] = useState(0);
  const touches = useRef(new Set<number>());
  // จุดบนจอต่อ 1 จุดภาพ (วัดจากรูปที่โชว์จริง) → เลขชิ้นบนรูปขนาดเท่าเดิมทุกระดับซูม
  const [svgEl, svgRef] = useState<SVGSVGElement | null>(null);   // ref แบบ state — รูปโผล่ช้า (กล่องซูมวัดขนาดก่อน)
  const [svgScale, setSvgScale] = useState(1);
  useEffect(() => {
    const el = svgEl; if (!el || !img) return;
    const measure = () => { const w = el.getBoundingClientRect().width; if (w > 0) setSvgScale(w / img.w); };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [svgEl, img]);
  // ── 2026-11-16 รอบ 3: ครอป (หมุนกรอบได้) + ทำให้ตรงรายชิ้น
  const [crop, setCrop] = useState<CropRect | null>(null);
  const cropDrag = useRef<{ mode: "new" | "move"; start: PPt; orig: CropRect } | null>(null);
  const [fixes, setFixes] = useState<PieceFix[]>([]);
  const [editFix, setEditFix] = useState<{ ci: number; quad: PPt[]; w: number; h: number; name: string; count: number; idx: number | null } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // กระดานสูงพอดีพื้นที่ที่เหลือในป๊อป (ไม่ต้องเลื่อนลง · เจ้าของเจอ 2026-11-16) — วัดจากกล่องเลื่อนของป๊อปจริง ไม่เดาด้วย vh
  const [boardEl, setBoardEl] = useState<HTMLDivElement | null>(null);
  const [boardH, setBoardH] = useState(0);
  useEffect(() => {
    if (!boardEl) return;
    let sp: HTMLElement | null = boardEl.parentElement;
    while (sp && !/(auto|scroll)/.test(getComputedStyle(sp).overflowY)) sp = sp.parentElement;
    if (!sp) return;
    const box = sp;
    const measure = () => {
      const top = boardEl.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      const pad = parseFloat(getComputedStyle(box).paddingBottom) || 0;
      const h = Math.floor(box.clientHeight - top - pad - 2);
      setBoardH((old) => (Math.abs(old - Math.max(320, h)) < 2 ? old : Math.max(320, h)));
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(box);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [boardEl, img]);
  const [pvRot, setPvRot] = useState(0);             // หมุนรูปชิ้นในแผง (ให้อ่านตัวเขียนตรง)
  const [reading, setReading] = useState(false);     // กำลังให้ AI อ่านตัวเขียน
  const [readText, setReadText] = useState<string | null>(null);
  const cornerDrag = useRef<number | null>(null);
  const resetEdits = () => { setEdits(null); setBgVals([]); setStroke(null); hist.current = []; fut.current = []; setHistTick((x) => x + 1); setFixes([]); setEditFix(null); setCrop(null); };
  const snapshot = (): EditSnap => ({ edits: edits ? edits.slice() : null, bg: [...bgVals] });
  const pushHist = () => { hist.current = [...hist.current.slice(-24), snapshot()]; fut.current = []; setHistTick((x) => x + 1); };
  const restore = (s: EditSnap) => { setEdits(s.edits); setBgVals(s.bg); };
  const undo = () => { const s = hist.current.pop(); if (!s) return; fut.current.push(snapshot()); restore(s); setHistTick((x) => x + 1); };
  const redo = () => { const s = fut.current.pop(); if (!s) return; hist.current.push(snapshot()); restore(s); setHistTick((x) => x + 1); };
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
      setOrig(null); setFixedScale(null); setQuad([]); setChecks([]); setClickMode(null); resetEdits(); setZoom(1);
    } catch (e) { setErr((e as Error).message); }
  };
  const pickBag = async (f: File | undefined) => {
    if (!f) return; setErr(null);
    try { const c = await toCanvas(f, 1024); setBag({ url: c.toDataURL("image/jpeg", 0.85), w: c.width, h: c.height }); }
    catch (e) { setErr((e as Error).message); }
  };

  const traced = useMemo(() => (img ? traceGray(img.gray, img.w, img.h, { bias, pieces: mode, eps, edits, bgPick: bgVals.length ? { values: bgVals, tol: bgTol } : null }) : null), [img, bias, mode, eps, edits, bgVals, bgTol]);
  const editsImg = useMemo(() => (img && edits ? editsUrl(edits, img.w, img.h) : ""), [img, edits]);
  // Ctrl+Z ย้อนกลับ · Ctrl+Y / Ctrl+Shift+Z ทำซ้ำ (แป้นไทยก็ได้ — shortcutKey) · ไม่ยุ่งตอนพิมพ์ในช่องตัวเลข
  useEffect(() => {
    if (!open || tab !== "trace") return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
      const k = shortcutKey(e);
      if (k === "z" && !e.shiftKey) { if (hist.current.length) { e.preventDefault(); undo(); } }
      else if (k === "y" || (k === "z" && e.shiftKey)) { if (fut.current.length) { e.preventDefault(); redo(); } }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });   // eslint-disable-line react-hooks/exhaustive-deps -- ผูกใหม่ทุกรอบให้ undo/redo เห็นค่าล่าสุด
  /** พิกัดจอ → จุดภาพ + ขนาดแปรงเป็นจุดภาพ (แปรงคงขนาดบนจอแม้ซูม) */
  const toImgPt = (svg: SVGSVGElement, cx: number, cy: number) => {
    const m = svg.getScreenCTM(); if (!m) return null;
    const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    const q = pt.matrixTransform(m.inverse());
    return { p: [q.x, q.y] as Pt, r: brushPx / 2 / (m.a || 1) };
  };
  const brushing = tool === "erase" || tool === "add";
  const contours = traced?.contours ?? [];
  /** เลขชิ้น → ชิ้นที่ทำให้ตรงแล้ว (index ใน fixes) */
  const fixOf = useMemo(() => contours.map((c) => { const k = fixes.findIndex((f) => pointInPoly(quadCenter(f.quad), c.pts)); return k >= 0 ? k : null; }), [contours, fixes]);
  const startFix = (ci: number) => {
    const c = contours[ci]; if (!c) return;
    const k = fixOf[ci];
    setReadText(null); setPvRot(0);
    if (k != null) { const f = fixes[k]; setEditFix({ ci, quad: f.quad, w: f.w, h: f.h, name: f.name ?? "", count: f.count ?? 1, idx: k }); return; }
    const q = autoQuad(c.pts); if (!q) return;
    // ขนาดเริ่มว่าง (ช่องโชว์ค่าประมาณเป็นตัวจาง) — กดบันทึกโดยไม่ใส่ขนาด = เก็บแค่ชื่อ/จำนวน ไม่ดัดชิ้น
    setEditFix({ ci, quad: q, w: 0, h: 0, name: "", count: 1, idx: null });
  };
  /** ขนาดโดยประมาณของชิ้นที่กำลังแก้ (จากมาตราส่วนตอนนี้) — โชว์เป็นตัวจางในช่อง */
  const estSize = (q: PPt[]): [number, number] | null => {
    const k2 = cmPerPxRef.current; if (!(k2 > 0)) return null;
    const sa = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), sb = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]);
    return [r1(Math.min(sa, sb) * k2), r1(Math.max(sa, sb) * k2)];
  };
  const applyFix = () => {
    if (!editFix) return;
    const sized = editFix.w > 0 || editFix.h > 0;
    if (sized && !straightenPts(editFix.quad, editFix.quad, editFix.w, editFix.h)) { setErr(t("4 มุมต้องไม่ไขว้กัน — ลากจุด A B C D ให้ตรงมุมชิ้น", "The 4 corners must not cross — drag A B C D onto the piece corners")); return; }
    const f: PieceFix = { quad: editFix.quad, w: editFix.w, h: editFix.h, name: editFix.name.trim(), count: Math.max(1, Math.round(editFix.count) || 1) };
    setFixes((o) => (editFix.idx != null ? o.map((x, j) => (j === editFix.idx ? f : x)) : [...o, f]));
    setOff((s) => { const n = new Set(s); n.delete(editFix.ci); return n; });
    setEditFix(null); setErr(null);
  };
  const removeFix = () => { if (editFix?.idx == null) return; const k = editFix.idx; setFixes((o) => o.filter((_, j) => j !== k)); setEditFix(null); };
  const applyCrop = () => {
    if (!img || !crop) return;
    const r = cropGray(img.gray, img.w, img.h, crop);
    if (!r) { setErr(t("กรอบเล็กเกินไป ลากกรอบใหม่", "The frame is too small — drag a new one")); return; }
    setOrig(orig ?? img); setImg({ url: grayUrl(r.gray, r.w, r.h), w: r.w, h: r.h, gray: r.gray });   // ขนาดจุดภาพเท่าเดิม มาตราส่วนไม่เปลี่ยน
    setQuad([]); setChecks([]); setOff(new Set()); setErr(null); resetEdits(); setZoom(1); setTool("pick");
  };
  const onBrushDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch") touches.current.add(e.pointerId);
    if (clickMode || !img || e.button !== 0) return;
    if (touches.current.size > 1) { setStroke(null); cropDrag.current = null; cornerDrag.current = null; return; }   // นิ้วที่ 2 = ซูม/เลื่อน
    const q = toImgPt(e.currentTarget, e.clientX, e.clientY); if (!q) return;
    if (tool === "crop") {
      e.currentTarget.setPointerCapture(e.pointerId);
      if (crop && crop.w > 2 && pointInPoly(q.p, cropCorners(crop))) cropDrag.current = { mode: "move", start: q.p, orig: crop };
      else { const n: CropRect = { cx: q.p[0], cy: q.p[1], w: 0, h: 0, angle: crop?.angle ?? 0 }; cropDrag.current = { mode: "new", start: q.p, orig: n }; setCrop(n); }
      return;
    }
    if (tool === "fix") {
      const hit = 14 / (svgScale || 1);
      if (editFix) { const k = editFix.quad.findIndex((c) => Math.hypot(c[0] - q.p[0], c[1] - q.p[1]) < hit); if (k >= 0) { e.currentTarget.setPointerCapture(e.pointerId); cornerDrag.current = k; return; } }
      const ci = contours.findIndex((c) => pointInPoly(q.p, c.pts));
      if (ci >= 0) startFix(ci);
      return;
    }
    if (tool === "bgpick") { pushHist(); setBgVals((v) => [...v, sampleGray(img.gray, img.w, img.h, q.p[0], q.p[1])].slice(-8)); return; }
    if (!brushing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setStroke({ pts: [q.p], r: q.r });
  };
  const onBrushMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (img && (cropDrag.current || cornerDrag.current != null) && touches.current.size <= 1) {
      const q = toImgPt(e.currentTarget, e.clientX, e.clientY); if (!q) return;
      const d = cropDrag.current;
      if (d && d.mode === "move") setCrop({ ...d.orig, cx: d.orig.cx + q.p[0] - d.start[0], cy: d.orig.cy + q.p[1] - d.start[1] });
      else if (d) {   // ลากกรอบใหม่ตามแนวมุมที่หมุนไว้
        const a = (d.orig.angle * Math.PI) / 180, dx = q.p[0] - d.start[0], dy = q.p[1] - d.start[1];
        const du = dx * Math.cos(a) + dy * Math.sin(a), dv = -dx * Math.sin(a) + dy * Math.cos(a);
        setCrop({ ...d.orig, cx: d.start[0] + dx / 2, cy: d.start[1] + dy / 2, w: Math.abs(du), h: Math.abs(dv) });
      } else if (cornerDrag.current != null) { const k = cornerDrag.current; setEditFix((f) => (f ? { ...f, quad: f.quad.map((c, j) => (j === k ? q.p : c)) } : f)); }
      return;
    }
    if (!brushing || !img) { if (cursor) setCursor(null); return; }
    const q = toImgPt(e.currentTarget, e.clientX, e.clientY); if (!q) return;
    if (e.pointerType === "mouse") setCursor({ x: q.p[0], y: q.p[1], r: q.r });
    if (stroke && touches.current.size <= 1) setStroke((s) => (s ? { ...s, pts: [...s.pts, q.p] } : s));
  };
  const onBrushUp = (e: React.PointerEvent<SVGSVGElement>) => {
    touches.current.delete(e.pointerId);
    cropDrag.current = null; cornerDrag.current = null;
    if (!stroke || !img) return;
    const next = edits ? edits.slice() : new Uint8Array(img.w * img.h);
    if (paintEdits(next, img.w, img.h, stroke.pts, stroke.r, tool === "add" ? EDIT_KEEP : EDIT_ERASE) > 0) { pushHist(); setEdits(next); }
    setStroke(null);
  };
  const chosen = useMemo(() => (traced?.contours ?? []).map((c, i) => ({ c, i })).filter((x) => !off.has(x.i)), [traced, off]);
  const widest = chosen.reduce((m, x) => Math.max(m, x.c.box.w), 0);
  const pairs: CheckPair[] = checks.flatMap((c) => (c.b ? [{ a: c.a, b: c.b, real: c.real }] : []));
  const chk = useMemo(() => checkScale(pairs, tolCm, fixedScale), [JSON.stringify(pairs), tolCm, fixedScale]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pieceScale = useMemo(() => scaleFromFixes(fixes), [fixes]);   // ชิ้นที่ยังไม่ทำให้ตรง ใช้มาตราส่วนเฉลี่ยจากชิ้นที่ทำแล้ว
  const scaleFrom: "rect" | "checks" | "pieces" | "widest" = fixedScale ? "rect" : chk ? "checks" : pieceScale ? "pieces" : "widest";
  const cmPerPx = fixedScale ?? chk?.cmPerPx ?? pieceScale ?? (widest > 0 && realW > 0 ? realW / widest : 0);
  const cmPerPxRef = useRef(0);
  cmPerPxRef.current = cmPerPx;
  /** ขนาดจริงของชิ้นที่ทำให้ตรงแล้ว (สั้น × ยาว ซม.) */
  const fixSize = (f: PieceFix) => { const s = straightenSize(f.quad, f.w, f.h); return s ? [Math.min(s.a, s.b), Math.max(s.a, s.b)] : null; };
  const straightOf = fixOf.map((k) => k != null && !!fixSize(fixes[k]));   // ชิ้นที่ดัดตรงแล้วจริง (ใส่ขนาด) = สีเขียว
  // รูปชิ้นที่ดัดตรงแล้ว (ตัดเฉพาะชิ้น) ให้อ่านตัวเขียน — อัตราส่วนตามขนาดจริงที่ใส่ หรือตามรูปถ้ายังไม่ใส่
  const pvImg = useMemo(() => {
    if (!img || !editFix) return "";
    const s = straightenSize(editFix.quad, editFix.w, editFix.h);
    const o = editFix.quad, d = (p: PPt, r: PPt) => Math.hypot(r[0] - p[0], r[1] - p[1]);
    const a = s?.a ?? (d(o[0], o[1]) + d(o[3], o[2])) / 2, b = s?.b ?? (d(o[1], o[2]) + d(o[0], o[3])) / 2;
    const r = rectifyGray(img.gray, img.w, img.h, editFix.quad, a, b, { extend: 0.03, maxSide: 640 });
    return r ? grayUrl(r.gray, r.w, r.h) : "";
  }, [img, editFix?.quad, editFix?.w, editFix?.h]);   // eslint-disable-line react-hooks/exhaustive-deps -- พิมพ์ชื่อ/จำนวนไม่ต้องทำรูปใหม่
  const readLabel = async () => {
    if (!pvImg || !editFix) return;
    setReading(true); setErr(null);
    try {
      const res = await apiFetch("/api/pattern-projects/read-label", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: pvImg }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      const d = j.data as { text: string; name: string; w: number | null; l: number | null; count: number | null; unsure: boolean };
      setReadText(d.text || t("(อ่านไม่ออก)", "(nothing readable)"));
      setEditFix((f) => (f ? { ...f, name: d.name || f.name, w: d.w ?? f.w, h: d.l ?? f.h, count: d.count ?? f.count } : f));
    } catch (e) { setErr((e as Error).message); }
    finally { setReading(false); }
  };
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
    setQuad([]); setChecks([]); setOff(new Set()); setErr(null); resetEdits(); setZoom(1);   // รูปเปลี่ยนรูปร่าง → รอยลบเดิมไม่ตรงแล้ว ล้างทิ้ง
  };
  const undoRectify = () => { if (!orig) return; setImg(orig); setOrig(null); setFixedScale(null); setChecks([]); setOff(new Set()); resetEdits(); setZoom(1); };
  const toggle = (i: number) => setOff((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const place = () => {
    const out: EditorPiece[] = [];
    chosen.forEach(({ c, i }) => {   // ชื่อใช้เลขเดียวกับป้าย/เลขบนรูป
      const k = fixOf[i], f = k != null ? fixes[k] : null;
      let shape = null;
      if (f) {   // ทำให้ตรงแล้ว: บิดเส้นรอบชิ้นด้วย 4 มุม → ซม. (ส่งเป็น มม. ให้ลดจุดละเอียด 1 มม.)
        const cm = straightenPts(c.pts, f.quad, f.w, f.h);
        if (cm) {
          const mm = cm.map(([x, y]) => [x * 10, y * 10] as Pt), xs = mm.map((p) => p[0]), ys = mm.map((p) => p[1]);
          const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
          shape = contourShape({ pts: mm, box, area: box.w * box.h }, 0.1);
        }
      }
      if (!shape) shape = contourShape(c, cmPerPx);
      if (shape) out.push({ shape, count: Math.max(1, f?.count ?? 1), allow: 0, name: f?.name || t(`ชิ้นจากรูป ${i + 1}`, `Traced piece ${i + 1}`), at: [Math.round(c.box.x * cmPerPx * 10) / 10, Math.round(c.box.y * cmPerPx * 10) / 10] });
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
  /** แผงตั้งค่าการแยกชิ้น (เดิมคอลัมน์ขวา → กล่องลอยมุมขวาบน · รอบ 4) */
  const settingsPanel = img ? (<>
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
                <details open={!!orig || clickMode === "quad" || quad.length > 0} className="group space-y-1.5 rounded-md border border-amber-200 bg-amber-50/60 p-2" data-photo-rectify>
                  <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-slate-700 [&::-webkit-details-marker]:hidden">{t("แก้มุมเอียงของรูป", "Fix photo perspective")}{orig && <span className="font-normal text-emerald-700">· {t("แก้แล้ว", "fixed")}</span>}<Icon value="i:chevron-down" className="ml-auto text-sm text-slate-400 transition-transform group-open:rotate-180" /></summary>
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
                </details>
              )}
              {img && (
                <details open={checks.length > 0 || clickMode === "check"} className="group space-y-1.5 rounded-md border border-emerald-200 bg-emerald-50/50 p-2" data-photo-checks>
                  <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-slate-700 [&::-webkit-details-marker]:hidden">{t("จุดตรวจระยะ", "Check distances")}{chk && <span className={`font-normal ${chk.ok ? "text-emerald-700" : "text-rose-700"}`}>· {chk.ok ? t("ผ่าน", "pass") : t("คลาดเกิน", "off")}</span>}<Icon value="i:chevron-down" className="ml-auto text-sm text-slate-400 transition-transform group-open:rotate-180" /></summary>
                  <div className="flex items-center gap-1 text-slate-500">{t("คลาดได้ ±", "Tolerance ±")}<input type="number" min={0.05} step={0.05} value={tolCm} onChange={(e) => setTolCm(Math.max(0.05, Number(e.target.value) || 0.3))} className="h-6 w-14 rounded border border-slate-200 px-1 text-right" aria-label={t("ค่าคลาดที่ยอมได้ (ซม.)", "Tolerance (cm)")} />{t("ซม.", "cm")}</div>
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
                </details>
              )}
              {scaleFrom === "widest" ? <RangeInput label={t("ความกว้างจริงของชิ้นที่กว้างที่สุด", "Real width of the widest piece")} unit={t("ซม.", "cm")} min={2} max={150} step={0.5} value={realW} onChange={setRealW} />
                : <p className="text-[11px] text-slate-600" data-scale-from>{scaleFrom === "rect" ? t("มาตราส่วนจากกรอบอ้างอิงที่แก้มุมเอียง", "Scale from the perspective reference") : scaleFrom === "pieces" ? t(`ชิ้นที่ทำให้ตรงใช้ขนาดจริงที่ใส่ · ชิ้นอื่นใช้มาตราส่วนเฉลี่ยจาก ${fixes.length} ชิ้นที่ทำแล้ว`, `Straightened pieces use the sizes you entered · others use the average scale of ${fixes.length} straightened pieces`) : t("มาตราส่วนจากจุดตรวจระยะ (เข้ากับทุกคู่มากที่สุด)", "Scale from the check distances (best fit to all pairs)")}</p>}
              <details className="group space-y-1 rounded-md border border-slate-200 p-2 text-slate-500">
                <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-slate-700 [&::-webkit-details-marker]:hidden">{t("ช่างคิดยังไง", "How a pattern maker thinks")}<Icon value="i:chevron-down" className="ml-auto text-sm text-slate-400 transition-transform group-open:rotate-180" /></summary>
                <p>{t("รูปถ่ายไม่มีมาตราส่วน ระบบจึงต้องให้คุณวัดของจริง 1 ค่า แล้วย่อขยายทุกชิ้นตามค่านั้น — ถ่ายเอียงนิดเดียวขนาดก็เพี้ยนได้ ให้วัดซ้ำอีกด้านหลังวางลงกระดาน", "A photo has no scale, so you give one real measurement and everything is scaled from it. A slightly tilted shot distorts sizes — re-measure another side after placing.")}</p>
                <p>{t("เส้นที่ลอกได้คือขอบกระดาษ ระบบไม่รู้ว่าเป็นเส้นตัดหรือเส้นเย็บ ชิ้นที่วางจึงยังไม่มีเผื่อเย็บ ให้ตั้งเองในแผงของชิ้น · เส้นโค้งจะเป็นเส้นตรงสั้น ๆ ต่อกัน ใช้ แก้จุด เกลาได้", "The traced line is the paper edge — the system cannot tell cut line from sew line, so placed pieces have no allowance yet. Curves become short straight segments; refine with Edit points.")}</p>
              </details>
  </>) : null;
  /** แผงชิ้น (ลอยมุมซ้ายล่าง · มือถือเต็มกว้าง): รูปชิ้นที่ดัดตรงขยายให้อ่านตัวเขียน + ชื่อ / กว้าง / ยาว / จำนวน + AI อ่านตัวเขียน (เสียเงิน) */
  const est = editFix ? estSize(editFix.quad) : null;
  const piecePanel = editFix ? (
    <div className="absolute bottom-12 left-2 right-2 z-20 max-h-[calc(100%-5rem)] overflow-y-auto rounded-xl border border-emerald-200 bg-white/97 p-2.5 text-xs shadow-xl md:bottom-2 md:right-auto md:w-[min(560px,calc(100%-1rem))]" data-photo-piece-panel>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-medium text-emerald-900">{t(`ชิ้น ${editFix.ci + 1}`, `Piece ${editFix.ci + 1}`)}</span>
        <span className="text-slate-500">{t("ลากจุด A B C D บนรูปให้ตรงมุมชิ้น", "Drag A B C D on the photo onto the piece corners")}</span>
        <button type="button" onClick={() => setEditFix(null)} className="ml-auto text-slate-400 hover:text-slate-700" aria-label={t("ปิด", "Close")}>✕</button>
      </div>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div className="flex h-44 w-full items-center justify-center overflow-hidden rounded-lg bg-slate-100 sm:h-56 sm:w-56" data-photo-piece-preview>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {pvImg ? <img src={pvImg} alt={t("รูปชิ้นที่ดัดตรงแล้ว", "Straightened piece")} className="max-h-full max-w-full object-contain transition-transform" style={{ transform: `rotate(${pvRot}deg)` }} /> : <span className="text-slate-400">—</span>}
          </div>
          <button type="button" onClick={() => setPvRot((r) => (r + 90) % 360)} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-slate-600 hover:bg-slate-50"><Icon value="i:refresh" className="text-sm" />{t("หมุนรูปให้อ่านง่าย", "Rotate to read")}</button>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <label className="block">{t("ชื่อชิ้น", "Piece name")}
            <input value={editFix.name} onChange={(e) => setEditFix((f) => (f ? { ...f, name: e.target.value.slice(0, 60) } : f))} placeholder={t(`ชิ้นจากรูป ${editFix.ci + 1}`, `Traced piece ${editFix.ci + 1}`)} className="mt-0.5 h-8 w-full rounded-md border border-slate-200 px-2" />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <label>{t("กว้าง", "Width")}<input type="number" min={0} step={0.1} value={editFix.w || ""} placeholder={est ? String(est[0]) : "—"} onChange={(e) => setEditFix((f) => (f ? { ...f, w: Math.max(0, Number(e.target.value) || 0) } : f))} className="mt-0.5 block h-8 w-20 rounded-md border border-slate-200 px-2 text-right" aria-label={t("กว้างจริง (ซม.)", "Real width (cm)")} /></label>
            <label>{t("ยาว", "Length")}<input type="number" min={0} step={0.1} value={editFix.h || ""} placeholder={est ? String(est[1]) : "—"} onChange={(e) => setEditFix((f) => (f ? { ...f, h: Math.max(0, Number(e.target.value) || 0) } : f))} className="mt-0.5 block h-8 w-20 rounded-md border border-slate-200 px-2 text-right" aria-label={t("ยาวจริง (ซม.)", "Real length (cm)")} /></label>
            <span className="pb-2 text-slate-400">{t("ซม.", "cm")}</span>
            <label>{t("จำนวน", "Qty")}<input type="number" min={1} step={1} value={editFix.count} onChange={(e) => setEditFix((f) => (f ? { ...f, count: Math.max(1, Math.round(Number(e.target.value)) || 1) } : f))} className="mt-0.5 block h-8 w-16 rounded-md border border-slate-200 px-2 text-right" aria-label={t("จำนวนชิ้น", "Quantity")} /></label>
          </div>
          <p className="text-[11px] text-slate-500">{t("ใส่ขนาดจริง = ดัดชิ้นนี้ให้ตรงตามขนาดนั้น (ด้านเดียวก็ได้) · เว้นว่าง = ใช้แค่ชื่อและจำนวน ขนาดตามมาตราส่วนรวม", "Real size = straighten this piece to it (one side is enough) · leave empty = keep only name and quantity, size from the overall scale")}</p>
          <div className="rounded-md border border-amber-200 bg-amber-50/70 p-2">
            <button type="button" data-photo-read-label disabled={reading || !pvImg} onClick={() => void readLabel()} className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-300 bg-white px-2 text-amber-800 hover:bg-amber-50 disabled:opacity-50"><Icon value="i:sparkles" className="text-sm" />{reading ? t("AI กำลังอ่าน…", "Reading…") : t("อ่านตัวเขียนด้วย AI", "Read the writing with AI")}</button>
            <span className="ml-1.5 text-[11px] text-amber-800">{t("เสียเงินตามการใช้ ราวไม่กี่สตางค์ · ลายมืออาจอ่านผิด ตรวจก่อนกด", "Paid per use (a few satang) · handwriting may be misread, check before saving")}</span>
            {readText != null && <div className="mt-1 text-[11px] text-slate-700">{t("AI อ่านได้", "AI read")}: “{readText}”</div>}
          </div>
          {err && <p className="rounded-md bg-red-50 px-2 py-1 text-[12px] text-red-700">{err}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-photo-fix-apply onClick={applyFix} className="h-8 rounded-md bg-emerald-600 px-3 text-white hover:bg-emerald-700">{editFix.w > 0 || editFix.h > 0 ? t("ทำให้ตรง + บันทึก", "Straighten + save") : t("บันทึกชื่อ/จำนวน", "Save name/qty")}</button>
            <button type="button" onClick={() => setEditFix(null)} className="h-8 rounded-md border border-slate-200 px-3 text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            {editFix.idx != null && <button type="button" onClick={removeFix} className="h-8 rounded-md border border-rose-200 px-3 text-rose-700 hover:bg-rose-50">{t("ล้างข้อมูลชิ้นนี้", "Clear this piece")}</button>}
          </div>
        </div>
      </div>
    </div>
  ) : null;
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
          // 2026-11-16 รอบ 4 (เจ้าของขอ): กระดานเต็มป๊อป · เครื่องมือ / ป้ายชิ้น / ซูม / ตั้งค่า / แผงชิ้น ลอยทับรูป (กล่องลอยไม่กินที่ ปล่อยคลิกทะลุช่องว่าง)
          <div ref={setBoardEl} className="relative" data-photo-board>
            {!img && (
              <div className="space-y-2">
                {fileBtn(t("เลือกรูปแพทเทิร์น", "Choose a pattern photo"), (f) => void pickTrace(f))}
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">{t("วางแพทเทิร์นกระดาษบนพื้นสีตัดกัน (กระดาษขาวบนโต๊ะสีเข้ม หรือกลับกัน) แล้วถ่ายตรงจากด้านบน", "Lay the paper pattern on a contrasting surface and shoot straight from above")}</div>
              </div>
            )}
            <div className="pointer-events-none absolute left-2 right-2 top-2 z-10 flex flex-col items-start gap-1.5 md:right-auto md:max-w-[calc(100%-240px)]" data-photo-float-top>
              {img && (
                <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 text-xs shadow-md backdrop-blur" data-photo-tools>
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-blue-700 hover:bg-blue-50" title={t("เปลี่ยนรูป", "Change photo")}>
                    <Icon value="i:photo" className="text-sm" /><span className="hidden lg:inline">{t("เปลี่ยนรูป", "Change photo")}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { void pickTrace(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  <div className="inline-flex rounded-lg bg-slate-50 p-0.5" role="group" aria-label={t("เครื่องมือบนรูป", "Photo tools")}>
                    {([["pick", "i:pointer", "เลือกชิ้น", "Pick"], ["erase", "i:eraser", "ยางลบ", "Eraser"], ["add", "i:brush", "แปรงเติม", "Fill brush"], ["bgpick", "i:color-picker", "ดูดสีพื้น", "Pick background"], ["crop", "i:crop", "ครอป", "Crop"], ["fix", "i:perspective", "ทำให้ตรง", "Straighten"]] as const).map(([k, ic, th, en]) => (
                      <button key={k} type="button" data-photo-tool={k} aria-pressed={tool === k} onClick={() => { setTool(k); setClickMode(null); setCursor(null); if (k !== "fix") setEditFix(null); }} className={`inline-flex h-8 items-center gap-1 rounded-md px-2 ${tool === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`} title={t(th, en)}>
                        <Icon value={ic} className="text-sm" /><span className="hidden sm:inline">{t(th, en)}</span>
                      </button>
                    ))}
                  </div>
                  {brushing && <label className="inline-flex items-center gap-1 text-slate-500">{t("ขนาด", "Size")}<input type="range" min={4} max={80} step={2} value={brushPx} onChange={(e) => setBrushPx(Number(e.target.value))} className="w-20" aria-label={t("ขนาดแปรง", "Brush size")} /></label>}
                  <button type="button" onClick={undo} disabled={!hist.current.length} className="h-8 w-8 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30" title={t("ย้อนกลับ (Ctrl+Z)", "Undo (Ctrl+Z)")} aria-label={t("ย้อนกลับ", "Undo")}><Icon value="i:arrow-back-up" className="text-sm" /></button>
                  <button type="button" onClick={redo} disabled={!fut.current.length} className="h-8 w-8 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30" title={t("ทำซ้ำ (Ctrl+Y)", "Redo (Ctrl+Y)")} aria-label={t("ทำซ้ำ", "Redo")}><Icon value="i:arrow-forward-up" className="text-sm" /></button>
                  {(edits || bgVals.length > 0) && <button type="button" onClick={() => { pushHist(); setEdits(null); setBgVals([]); }} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-slate-600 hover:bg-slate-50">{t("ล้างรอยทั้งหมด", "Clear all marks")}</button>}
                </div>
              )}
              {img && tool === "crop" && (
                <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2 py-1.5 text-[11px] text-slate-700 shadow-md" data-photo-cropbar>
                  <span>{t("ลากกรอบรอบส่วนที่จะเก็บ · ลากในกรอบ = ย้าย", "Drag a frame around what to keep · drag inside to move")}</span>
                  <label className="inline-flex items-center gap-1">{t("หมุนกรอบ", "Rotate")}<input type="range" min={-45} max={45} step={0.5} value={crop?.angle ?? 0} onChange={(e) => { const a = Number(e.target.value); setCrop((c) => (c ? { ...c, angle: a } : { cx: img.w / 2, cy: img.h / 2, w: img.w * 0.8, h: img.h * 0.8, angle: a })); }} className="w-24" aria-label={t("มุมกรอบครอป", "Crop angle")} /><span className="w-9 tabular-nums">{(crop?.angle ?? 0).toFixed(1)}°</span></label>
                  <button type="button" data-photo-crop-apply disabled={!crop || crop.w < 8 || crop.h < 8} onClick={applyCrop} className="h-7 rounded-md bg-slate-800 px-2.5 text-white disabled:opacity-40">{t("ครอป", "Crop")}</button>
                  {crop && <button type="button" onClick={() => setCrop(null)} className="h-7 rounded-md border border-slate-200 bg-white px-2">{t("ล้างกรอบ", "Clear frame")}</button>}
                  {orig && <button type="button" onClick={undoRectify} className="ml-auto h-7 rounded-md border border-slate-200 bg-white px-2">{t("กลับรูปเดิม", "Back to original")}</button>}
                </div>
              )}
              {img && tool === "fix" && !editFix && (
                <div className="pointer-events-auto rounded-lg border border-emerald-200 bg-emerald-50/95 px-2 py-1.5 text-[11px] text-emerald-900 shadow-md" data-photo-fixbar>
                  {t(`คลิกชิ้นบนรูป → ระบบวาง 4 มุมให้ → ลากปรับ → ใส่ชื่อ ขนาด จำนวน · ทำแล้ว ${fixes.length} ชิ้น`, `Click a piece → 4 corners appear → adjust → enter name, size, quantity · ${fixes.length} done`)}{fixes.length > 0 && contours.length > fixes.length && t(" · ชิ้นที่เหลือใช้มาตราส่วนเฉลี่ยจากชิ้นที่ทำแล้ว", " · other pieces use the average scale of these")}
                </div>
              )}
              {img && tool === "bgpick" && (
                <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50/95 px-2 py-1.5 text-[11px] text-sky-900 shadow-md" data-photo-bgpick>
                  {t("คลิกที่พื้นตรงที่ระบบนับเป็นชิ้นผิด — สีนั้นจะถูกนับเป็นพื้นทั้งรูป", "Click the background where it was taken as a piece — that shade becomes background everywhere")}
                  {bgVals.map((v, i) => <button key={i} type="button" onClick={() => { pushHist(); setBgVals((o) => o.filter((_, j) => j !== i)); }} className="inline-flex items-center gap-1 rounded border border-sky-200 bg-white px-1.5 py-0.5" title={t("เอาสีนี้ออก", "Remove this shade")}><span className="h-3 w-3 rounded-sm border border-slate-300" style={{ background: `rgb(${v},${v},${v})` }} />✕</button>)}
                  <label className="ml-auto inline-flex items-center gap-1">{t("ช่วงสี ±", "Range ±")}<input type="number" min={2} max={60} value={bgTol} onChange={(e) => setBgTol(Math.max(2, Math.min(60, Number(e.target.value) || 12)))} className="h-6 w-12 rounded border border-sky-200 px-1 text-right" aria-label={t("ช่วงสีที่นับเป็นพื้น", "Shade range counted as background")} /></label>
                </div>
              )}
              {img && (traced?.contours.length ?? 0) > 0 && (
                <div className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-xl bg-white/90 p-1 text-[11px] shadow-sm sm:flex-wrap" data-photo-chips>
                  {traced!.contours.map((c, i) => { const k = fixOf[i], fs = k != null ? fixSize(fixes[k]) : null; return (
                    <button key={i} type="button" onClick={() => (tool === "fix" ? startFix(i) : toggle(i))} aria-pressed={!off.has(i)} title={tool === "fix" ? t("กดเพื่อทำให้ตรง", "Click to straighten") : off.has(i) ? t("กดเพื่อเอาชิ้นนี้", "Click to include") : t("กดเพื่อไม่เอาชิ้นนี้", "Click to skip")}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 tabular-nums ${off.has(i) ? "border-slate-200 text-slate-400 line-through" : fs ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-blue-300 bg-blue-50 text-blue-800"}`}>
                      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white ${off.has(i) ? "bg-slate-300" : fs ? "bg-emerald-600" : "bg-blue-600"}`}>{i + 1}</span>
                      {k != null && fixes[k].name ? <span className="font-medium">{fixes[k].name}</span> : null}
                      {fs ? `${fs[0].toFixed(1)} × ${fs[1].toFixed(1)} ${t("ซม.", "cm")}` : cmPerPx > 0 ? `${(c.box.w * cmPerPx).toFixed(1)} × ${(c.box.h * cmPerPx).toFixed(1)} ${t("ซม.", "cm")}` : t(`${c.pts.length} จุด`, `${c.pts.length} pts`)}
                      {k != null && (fixes[k].count ?? 1) > 1 ? <span>×{fixes[k].count}</span> : null}{fs ? " ✓" : null}
                    </button>); })}
                  <span className="shrink-0 self-center pr-1 text-slate-400">{t(`เลือก ${chosen.length}/${traced!.contours.length}`, `${chosen.length}/${traced!.contours.length} chosen`)}</span>
                </div>
              )}
              {img && !traced?.contours.length && <p className="pointer-events-auto rounded-md bg-amber-50/95 px-2 py-1 text-xs text-amber-800 shadow-sm">{t("ยังแยกชิ้นไม่ได้ ลองเปิด \"ตั้งค่าการแยกชิ้น\" มุมขวาบน ปรับความไว หรือเปลี่ยนเป็นชิ้นเข้ม/อ่อนกว่าพื้น", "No pieces found yet. Open \"Detection settings\" (top right) and adjust sensitivity or darker/lighter.")}</p>}
            </div>
            {img && (
              <div className="pointer-events-none absolute bottom-2 right-2 z-10 flex items-center gap-1.5" data-photo-float-zoom>
                <span className="pointer-events-auto hidden cursor-help rounded-full bg-white/90 px-2 py-1 text-[11px] text-slate-500 shadow-sm md:inline" title={t("หมุนลูกกลิ้งบนรูป = ซูมตรงจุดที่ชี้ · กดลูกกลิ้งค้าง หรือ Space ค้างแล้วลาก = เลื่อนรูป · มือถือใช้สองนิ้ว · รูปไม่ถูกอัปโหลด", "Wheel = zoom at the pointer · hold the wheel or Space and drag = pan · on phones use two fingers · the photo stays on this device")}>{t("ลูกกลิ้ง = ซูม · Space ลาก = เลื่อน", "Wheel = zoom · Space-drag = pan")}</span>
                <ZoomControls zoom={zoom} onZoom={setZoom} className="pointer-events-auto shadow-md" />
              </div>
            )}
            {img && (
              <div className="absolute bottom-2 left-2 z-20 flex max-h-[calc(100%-1rem)] w-[min(260px,calc(100%-1rem))] flex-col-reverse items-start gap-1.5 md:bottom-auto md:left-auto md:right-2 md:top-2 md:flex-col md:items-end" data-photo-float-settings>
                <button type="button" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-2.5 text-xs text-slate-700 shadow-md hover:bg-white">
                  <Icon value="i:adjustments" className="text-sm" />{t("ตั้งค่าการแยกชิ้น", "Detection settings")}<Icon value="i:chevron-down" className={`text-sm text-slate-400 transition-transform ${showSettings ? "rotate-180" : ""}`} />
                </button>
                {showSettings && <div className="w-full space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white/97 p-2.5 text-xs shadow-lg" data-photo-settings-panel>
                  {settingsPanel}
                </div>}
              </div>
            )}
            {img && tool === "fix" && editFix && piecePanel}
            {img && (
                <ZoomBox zoom={zoom} onZoom={setZoom} aspect={img.w / img.h} dragPan wheelZoom padding={0} className={`rounded-lg border border-slate-200 bg-slate-100 ${boardH ? "" : "h-[60vh]"}`} style={boardH ? { height: boardH } : undefined}>
                <div className="relative" data-photo-zoom>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="block w-full select-none" draggable={false} />
                  <svg ref={svgRef} viewBox={`0 0 ${img.w} ${img.h}`} className="absolute inset-0 h-full w-full" onClick={onImgClick} onPointerDown={onBrushDown} onPointerMove={onBrushMove} onPointerUp={onBrushUp} onPointerCancel={(e) => { touches.current.delete(e.pointerId); setStroke(null); }} onPointerLeave={() => setCursor(null)}
                    style={{ cursor: clickMode || tool === "bgpick" || tool === "crop" ? "crosshair" : brushing ? "none" : tool === "fix" ? "pointer" : undefined, touchAction: brushing || tool === "bgpick" || tool === "crop" || tool === "fix" ? "none" : undefined }} data-photo-svg>
                    {editsImg && <image href={editsImg} x={0} y={0} width={img.w} height={img.h} style={{ pointerEvents: "none" }} />}
                    {(traced?.contours ?? []).map((c, i) => (
                      <polygon key={i} points={c.pts.map((p) => p.join(",")).join(" ")} onClick={() => { if (!clickMode && tool === "pick") toggle(i); }} style={{ cursor: clickMode ? "crosshair" : "pointer", pointerEvents: clickMode || tool !== "pick" ? "none" : undefined }}
                        fill={off.has(i) ? "rgba(148,163,184,0.18)" : straightOf[i] ? "rgba(16,185,129,0.3)" : "rgba(37,99,235,0.3)"} stroke={off.has(i) ? "#94a3b8" : straightOf[i] ? "#047857" : "#1d4ed8"} strokeWidth={off.has(i) ? 1.5 : 2.5} vectorEffect="non-scaling-stroke" strokeDasharray={off.has(i) ? "6 4" : undefined} />
                    ))}
                    {/* เส้นหนาเท่ากันบนจอทุกระดับซูม (non-scaling) + เลขชิ้นตรงกับป้ายเหนือรูป · ขนาดเลขคิดจากขนาดรูปที่โชว์จริง */}
                    {(traced?.contours ?? []).map((c, i) => { const s = 1 / (svgScale || 1), cx = c.box.x + c.box.w / 2, cy = c.box.y + c.box.h / 2; return (
                      <g key={`n${i}`} style={{ pointerEvents: "none" }} data-photo-num>
                        <circle cx={cx} cy={cy} r={11 * s} fill={off.has(i) ? "#94a3b8" : straightOf[i] ? "#047857" : "#1d4ed8"} stroke="#fff" strokeWidth={1.5 * s} />
                        <text x={cx} y={cy} fontSize={12 * s} textAnchor="middle" dominantBaseline="central" fill="#fff">{i + 1}</text>
                      </g>); })}
                    {quad.length > 0 && <g data-photo-quad style={{ pointerEvents: "none" }}>
                      {quad.length > 1 && <polyline points={[...quad, ...(quad.length === 4 ? [quad[0]] : [])].map((p) => p.join(",")).join(" ")} fill="none" stroke="#f59e0b" strokeWidth={Math.max(1.5, img.w / 350)} />}
                      {quad.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={Math.max(4, img.w / 120)} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />)}
                    </g>}
                    {checks.map((c, i) => <g key={`c${i}`} style={{ pointerEvents: "none" }} data-photo-check>
                      {c.b && <line x1={c.a[0]} y1={c.a[1]} x2={c.b[0]} y2={c.b[1]} stroke={chk?.rows[checks.slice(0, i).filter((x) => x.b).length]?.ok === false ? "#dc2626" : "#059669"} strokeWidth={Math.max(1.5, img.w / 350)} />}
                      {[c.a, ...(c.b ? [c.b] : [])].map((p, k) => <circle key={k} cx={p[0]} cy={p[1]} r={Math.max(3.5, img.w / 140)} fill="#059669" stroke="#fff" strokeWidth={1.2} />)}
                      <text x={c.a[0] + 6} y={c.a[1] - 6} fontSize={Math.max(10, img.w / 55)} fill="#047857" stroke="#fff" strokeWidth={3} paintOrder="stroke">{i + 1}</text>
                    </g>)}
                    {stroke && <polyline points={stroke.pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={tool === "add" ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)"} strokeWidth={stroke.r * 2} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }} />}
                    {cursor && brushing && <circle cx={cursor.x} cy={cursor.y} r={cursor.r} fill="none" stroke={tool === "add" ? "#059669" : "#dc2626"} strokeWidth={cursor.r / 10 + 0.5} style={{ pointerEvents: "none" }} data-photo-brush-cursor />}
                    {crop && crop.w > 1 && (() => { const q = cropCorners(crop), d = q.map((p) => p.join(" ")).join(" L"); return (
                      <g style={{ pointerEvents: "none" }} data-photo-crop>
                        {tool === "crop" && <path d={`M0 0H${img.w}V${img.h}H0Z M${d}Z`} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />}
                        <path d={`M${d}Z`} fill="none" stroke="#fff" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                      </g>); })()}
                    {editFix && tool === "fix" && (() => { const s = 1 / (svgScale || 1); return (
                      <g style={{ pointerEvents: "none" }} data-photo-fixquad>
                        <polygon points={editFix.quad.map((p) => p.join(",")).join(" ")} fill="rgba(245,158,11,0.12)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                        {editFix.quad.map((p, k) => <g key={k}><circle cx={p[0]} cy={p[1]} r={9 * s} fill="#f59e0b" stroke="#fff" strokeWidth={1.5 * s} /><text x={p[0]} y={p[1]} fontSize={10 * s} textAnchor="middle" dominantBaseline="central" fill="#fff">{"ABCD"[k]}</text></g>)}
                      </g>); })()}
                  </svg>
                </div>
                </ZoomBox>
            )}
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
