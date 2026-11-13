"use client";
/**
 * 🧩 NestPanel — วางชิ้นบนผ้าตามรูปจริง (Bag CAD รอบ I2) · ส่วนเสริมของ "วางบนผ้า" ในหน้าพิมพ์ (PatternPrintView)
 *   คำนวณใน Web Worker (หน้าจอไม่ค้าง) · แถบความคืบหน้า + ปุ่มยกเลิก · เทียบกับวางตามกรอบ (ตัวเดิม)
 *   หมุนได้: ตามทางผ้า 0°/180° (ตั้งต้น) · ทุก 90° · ชิ้นที่ป้าย "ทางเดียว" ไม่หมุน · ชิ้น "คู่ ซ้าย-ขวา" ชิ้นคี่กลับด้าน
 *   สูตร: lib/pattern-nest · ตัวทำงาน: components/pattern-sheet/nest.worker.ts
 *
 *   <NestPanel pieces={patternPieces} faceWidth={150} qty={1} boxLength={usedLengthCm} />
 * ใช้ที่: components/pattern-sheet/print-view · คู่มือ: docs/pattern-studio.md (รอบ I2)
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n";
import type { PatternPiece } from "@/lib/pattern-sheet";
import type { NestItem, NestResult, NestRot } from "@/lib/pattern-nest";

const YARD = 91.44;
const COLORS = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#65a30d", "#c026d3", "#0d9488"];

export function NestPanel({ pieces, faceWidth, qty, boxLength }: { pieces: PatternPiece[]; faceWidth: number; qty: number; boxLength?: number | null }) {
  const t = useT();
  const [rot, setRot] = useState<NestRot>("grain");
  const [gap, setGap] = useState(0.5);
  const [run, setRun] = useState<{ done: number; total: number } | null>(null);
  const [res, setRes] = useState<NestResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const wk = useRef<Worker | null>(null);
  const sig = `${faceWidth}|${qty}|${rot}|${gap}|${pieces.map((p) => `${p.id}:${p.count}:${p.w}x${p.h}`).join(",")}`;
  const [resSig, setResSig] = useState("");
  useEffect(() => () => { wk.current?.terminate(); wk.current = null; }, []);

  const start = () => {
    wk.current?.terminate();
    setMsg(null); setRes(null);
    const items: NestItem[] = pieces.map((p) => ({
      key: p.id, label: p.id, outline: p.outline && p.outline.length >= 3 ? p.outline : [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]],
      qty: p.count * Math.max(1, qty), rot: (p.tag ?? "").includes("ทางเดียว") ? "none" : rot, pair: (p.tag ?? "").includes("คู่"),
    }));
    if (!items.some((i) => i.qty > 0)) { setMsg(t("ไม่มีชิ้นให้วาง", "No pieces to place")); return; }
    let w: Worker;
    try { w = new Worker(new URL("./nest.worker.ts", import.meta.url)); } catch { setMsg(t("เบราว์เซอร์นี้คำนวณเบื้องหลังไม่ได้", "This browser can't run background work")); return; }
    wk.current = w;
    setRun({ done: 0, total: items.reduce((s, i) => s + i.qty, 0) });
    const mySig = sig;
    w.onmessage = (e: MessageEvent<{ type: string; done?: number; total?: number; result?: NestResult; message?: string }>) => {
      const d = e.data;
      if (d.type === "progress") setRun({ done: d.done ?? 0, total: d.total ?? 0 });
      else if (d.type === "done" && d.result) { setRes(d.result); setResSig(mySig); setRun(null); w.terminate(); wk.current = null; }
      else if (d.type === "error") { setMsg(t(`คำนวณไม่สำเร็จ: ${d.message ?? ""}`, `Failed: ${d.message ?? ""}`)); setRun(null); w.terminate(); wk.current = null; }
    };
    w.onerror = () => { setMsg(t("ตัวคำนวณเบื้องหลังเปิดไม่ได้ — ลองโหลดหน้าใหม่", "The background worker failed to start — reload the page")); setRun(null); w.terminate(); wk.current = null; };
    w.postMessage({ items, opts: { width: faceWidth, gap } });
  };
  const cancel = () => { wk.current?.terminate(); wk.current = null; setRun(null); setMsg(t("ยกเลิกแล้ว", "Cancelled")); };
  const stale = !!res && resSig !== sig;
  const keys = [...new Set(pieces.map((p) => p.id))];
  const color = (k: string) => COLORS[Math.max(0, keys.indexOf(k)) % COLORS.length];

  return (
    <div className={`mt-2 space-y-2 rounded-md border border-indigo-200 bg-indigo-50/40 p-2 text-[12px] ${res ? "" : "no-print"}`} data-nest-panel>
      <div className="no-print flex flex-wrap items-center gap-2">
        <b className="text-slate-700">{t("วางตามรูปจริง", "True-shape layout")}</b>
        <select value={rot} onChange={(e) => setRot(e.target.value as NestRot)} disabled={!!run} className="h-7 rounded-md border border-slate-200 bg-white px-1 text-xs" aria-label={t("การหมุนชิ้น", "Rotation")}>
          <option value="grain">{t("หมุนได้ตามทางผ้า (0°/180°)", "Along the grain (0°/180°)")}</option>
          <option value="free">{t("หมุนได้ทุก 90°", "Any 90°")}</option>
          <option value="none">{t("ห้ามหมุน (ผ้ามีทิศ)", "No rotation (directional)")}</option>
        </select>
        <label className="inline-flex items-center gap-1 text-slate-600">{t("เว้นรอยตัด", "Gap")}
          <input type="number" min={0} max={5} step={0.1} value={gap} disabled={!!run} onChange={(e) => setGap(Math.max(0, Math.min(5, Number(e.target.value) || 0)))} className="h-7 w-16 rounded-md border border-slate-200 px-1.5 text-right text-xs" /> {t("ซม.", "cm")}
        </label>
        {run ? <button type="button" data-nest-cancel onClick={cancel} className="h-7 rounded-md border border-rose-200 bg-white px-2 text-rose-700 hover:bg-rose-50">{t("ยกเลิก", "Cancel")}</button>
          : <button type="button" data-nest-run onClick={start} className="h-7 rounded-md border border-indigo-300 bg-white px-2 text-indigo-800 hover:bg-indigo-50">{res ? t("วางใหม่", "Run again") : t("วางตามรูปจริง", "Run true-shape layout")}</button>}
      </div>
      {run && <div className="no-print space-y-1" data-nest-progress>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${run.total ? Math.round((run.done / run.total) * 100) : 0}%` }} /></div>
        <div className="text-[11px] text-slate-500">{t(`กำลังวาง ${run.done}/${run.total} ชิ้น… (คำนวณเบื้องหลัง ทำอย่างอื่นต่อได้)`, `Placing ${run.done}/${run.total}… (runs in the background)`)}</div>
      </div>}
      {msg && <p className="text-[11px] text-amber-700">{msg}</p>}
      {res && (
        <div className="space-y-1" data-nest-result>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tabular-nums text-emerald-700">{t("ใช้ผ้า", "Uses")} {res.length} {t("ซม.", "cm")} ≈ <b>{(res.length / YARD).toFixed(2)} {t("หลา", "yd")}</b> · <span title={t("พื้นที่ชิ้นตามเส้นตัดจริง ÷ ผ้าที่ใช้ (ตัววางตามกรอบนับพื้นที่กรอบสี่เหลี่ยม เลข % จึงเทียบกันตรง ๆ ไม่ได้ — ดูความยาวผ้าแทน)", "Real cut area ÷ fabric used (the box layout counts box areas, so compare the length instead)")}>{t("เนื้อชิ้นจริง", "real piece area")} {res.efficiency}%</span></span>
            {boxLength != null && boxLength > 0 && <span className={`tabular-nums ${res.length < boxLength ? "text-emerald-700" : "text-slate-500"}`} data-nest-compare>{res.length < boxLength ? t(`สั้นกว่าวางตามกรอบ ${Math.round((boxLength - res.length) * 10) / 10} ซม.`, `${Math.round((boxLength - res.length) * 10) / 10} cm shorter than the box layout`) : t("ไม่สั้นกว่าวางตามกรอบ (ชิ้นเป็นสี่เหลี่ยมเกือบหมด)", "Not shorter than the box layout (mostly rectangles)")}</span>}
            {res.failed.length > 0 && <span className="text-rose-600">{t(`วางไม่ได้ (กว้างเกินหน้าผ้า): ${res.failed.join(", ")}`, `Can't place (wider than the fabric): ${res.failed.join(", ")}`)}</span>}
            {stale && <span className="no-print text-amber-700">{t("ค่าเปลี่ยนแล้ว — กด วางใหม่", "Settings changed — run again")}</span>}
          </div>
          <svg viewBox={`-1 -1 ${res.width + 2} ${Math.max(res.length, 5) + 2}`} className="w-full rounded border border-slate-200 bg-white" style={{ maxHeight: 520 }} preserveAspectRatio="xMidYMin meet">
            <rect x={0} y={0} width={res.width} height={Math.max(res.length, 5)} fill="#f8fafc" stroke="#94a3b8" strokeWidth={0.15} />
            {res.places.map((p, i) => {
              const c = color(p.key), cx = p.pts.reduce((s, q) => s + q[0], 0) / p.pts.length, cy = p.pts.reduce((s, q) => s + q[1], 0) / p.pts.length;
              return <g key={i}><polygon points={p.pts.map((q) => q.join(",")).join(" ")} fill={c} fillOpacity={0.18} stroke={c} strokeWidth={0.2} />
                <text x={cx} y={cy} fontSize={Math.min(3, res.width / 40)} textAnchor="middle" dominantBaseline="middle" fill="#334155">{p.label}{p.flip ? "ʀ" : ""}</text></g>;
            })}
          </svg>
          <div className="text-[10px] text-slate-500">{t(`หน้าผ้า ${res.width} ซม. · ตารางละเอียด ${res.res} ซม. · เว้นรอยตัด ${gap} ซม. · ยังไม่รวมเผื่อเสีย · ʀ = ชิ้นกลับด้าน (คู่ซ้าย-ขวา)`, `Fabric ${res.width} cm · grid ${res.res} cm · gap ${gap} cm · no waste allowance · ʀ = flipped (L/R pair)`)}</div>
        </div>
      )}
    </div>
  );
}
