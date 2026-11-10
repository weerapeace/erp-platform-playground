"use client";

/**
 * ป๊อป "แกะจากรูป" ของสตูดิโอแพทเทิร์น (รอบ 5 · 2026-11-10) — 2 ทาง
 *   1) รูปแพทเทิร์นกระดาษ → ลอกเส้นรอบชิ้นอัตโนมัติในเครื่องผู้ใช้ (lib/pattern-trace) ไม่ใช้ AI ไม่เสียเงิน รูปไม่ถูกอัปโหลด
 *      ผู้ใช้เลือกชิ้นที่เอา + บอกความกว้างจริงของชิ้นใหญ่สุด → วางเป็นชิ้นบนกระดาน (แก้จุดต่อได้)
 *   2) รูปกระเป๋าสำเร็จ → AI ประมาณสัดส่วน (เสียเงินตามการใช้ · POST /api/pattern-projects/ai-draft · ลงทะเบียน ai.bag_draft)
 *      → เปิดตัวสร้างจากแม่แบบทรงด้วยค่าที่ได้ ให้ตรวจ/แก้ก่อนวาง — เป็น "ร่างแรก" ไม่ใช่แพทเทิร์นสำเร็จ
 * ใช้ที่: PatternStudio (ปุ่ม แกะจากรูป)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { RangeInput } from "@/components/range-input";
import { apiFetch } from "@/lib/api";
import type { BagParams } from "@/lib/bag-templates";
import { contourShape, traceGray } from "@/lib/pattern-trace";
import type { EditorPiece } from "@/components/pattern-sheet/shape-editor";

type Loaded = { url: string; w: number; h: number; gray: Uint8Array };
export type AiDraftInfo = { style: string; notes: string; confidence: number; fits: boolean };

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

export function PhotoModal({ open, onClose, onPieces, onDraft }: {
  open: boolean; onClose: () => void;
  /** ชิ้นที่ลอกจากรูปแพทเทิร์น → วางลงกระดาน */
  onPieces: (pieces: EditorPiece[]) => void;
  /** ค่าแม่แบบที่ AI ร่างจากรูปกระเป๋า → เปิดตัวสร้างจากแม่แบบ */
  onDraft: (params: BagParams, info: AiDraftInfo) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<"trace" | "ai">("trace");
  const [err, setErr] = useState<string | null>(null);
  // ── ลอกจากรูปแพทเทิร์น
  const [img, setImg] = useState<Loaded | null>(null);
  const [bias, setBias] = useState(0);
  const [mode, setMode] = useState<"auto" | "dark" | "light">("auto");
  const [eps, setEps] = useState(2);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [realW, setRealW] = useState(30);
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
  const cmPerPx = widest > 0 && realW > 0 ? realW / widest : 0;
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
      const d = j.data as { params: BagParams; is_bag: boolean; fits: boolean; confidence: number; style: string; notes: string };
      if (!d.is_bag) throw new Error(t("AI ดูแล้วไม่เห็นว่าเป็นรูปกระเป๋า ลองรูปที่เห็นกระเป๋าทั้งใบชัด ๆ", "The AI could not see a bag in this photo. Try one that shows the whole bag clearly."));
      onDraft(d.params, { style: d.style, notes: d.notes, confidence: d.confidence, fits: d.fits });
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
      footer={tab === "trace" ? (
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
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group">
          <button type="button" className={seg(tab === "trace")} onClick={() => setTab("trace")}>{t("รูปแพทเทิร์นกระดาษ (ลอกเส้น)", "Paper pattern photo (trace)")}</button>
          <button type="button" className={seg(tab === "ai")} onClick={() => setTab("ai")}>{t("รูปกระเป๋าสำเร็จ (AI ประมาณ)", "Finished bag photo (AI estimate)")}</button>
        </div>

        {tab === "trace" ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-2">
              {fileBtn(img ? t("เปลี่ยนรูป", "Change photo") : t("เลือกรูปแพทเทิร์น", "Choose a pattern photo"), (f) => void pickTrace(f))}
              {img ? (
                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="block w-full" />
                  <svg viewBox={`0 0 ${img.w} ${img.h}`} className="absolute inset-0 h-full w-full">
                    {(traced?.contours ?? []).map((c, i) => (
                      <polygon key={i} points={c.pts.map((p) => p.join(",")).join(" ")} onClick={() => toggle(i)} style={{ cursor: "pointer" }}
                        fill={off.has(i) ? "rgba(148,163,184,0.15)" : "rgba(37,99,235,0.22)"} stroke={off.has(i) ? "#94a3b8" : "#2563eb"} strokeWidth={Math.max(1.5, img.w / 400)} strokeDasharray={off.has(i) ? "6 4" : undefined} />
                    ))}
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
              <RangeInput label={t("ความกว้างจริงของชิ้นที่กว้างที่สุด", "Real width of the widest piece")} unit={t("ซม.", "cm")} min={2} max={150} step={0.5} value={realW} onChange={setRealW} />
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
