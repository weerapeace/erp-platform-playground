"use client";
/**
 * 👜 BagPartsModal — ตัวสร้างชิ้นกระเป๋าของสตูดิโอแพทเทิร์น (Bag CAD รอบ F2 · ปุ่ม "ชิ้นกระเป๋า")
 *   แท็บ สาย/หู   : กว้างสำเร็จ · ยาวโผล่ · โคนเย็บทับ · วิธีพับ · ประกบ 2 ชั้น → ชิ้นสายพร้อมเส้นพับ + รอยบากโคน
 *   แท็บ กุ๊น      : ความยาวกุ๊นรวมจากขอบที่ติ๊ก "กุ๊น" / ตะเข็บหุ้มขอบ → แถบที่ต้องตัด (ผ้าตัดเฉียง · หนังตัดตรง)
 *   แท็บ ช่องโชว์ : เลือกชิ้น + รูป (หัวใจ เมฆ แมว หมี วงรี เหลี่ยม SVG เอง) + โครงสร้าง 4 แบบ → รูจริง + PVC + กรอบ + แผ่นกั้น
 *   สูตรทั้งหมด: lib/pattern-bagparts · ใส่ลงกระดานที่ components/pattern-studio (inject + ตะเข็บ)
 *
 *   <BagPartsModal open onClose={…} hosts={[{ pid, name, shape, holes, allow, foldEdges }]} defaultPid={…} bindPieces={…} bindSeams={…} onInsert={(r) => …} />
 * ใช้ที่: components/pattern-studio · คู่มือ: docs/pattern-studio.md
 */
import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { RangeInput } from "@/components/range-input";
import { BIND_KINDS, STRAP_DEFAULT, STRAP_FOLDS, WINDOW_STRUCTURES, bindingPlan, strapPlan, windowPlan, type BindKind, type PlanPiece, type StrapOpts, type WindowKind, type WindowPlan, type WindowStructure } from "@/lib/pattern-bagparts";
import { flattenShape, shapeBox, type Shape } from "@/lib/pattern-shape";
import { bindRuns } from "@/lib/pattern-trims";
import type { ProjectPiece } from "@/lib/pattern-project";
import type { Seam } from "@/lib/pattern-seams";

export type BagPartHost = { pid: string; name: string; shape: Shape; holes: Shape[]; allow: number; foldEdges?: number[] | null };
export type BagPartsResult = { kind: "strap" | "binding"; piece: PlanPiece } | { kind: "window"; hostPid: string; plan: WindowPlan };
type Tab = "strap" | "binding" | "window";
const WIN_KINDS: [WindowKind, string, string][] = [["heart", "หัวใจ", "Heart"], ["cloud", "เมฆ", "Cloud"], ["cat", "แมว", "Cat"], ["bear", "หมี", "Bear"], ["circle", "วงรี", "Oval"], ["rect", "เหลี่ยมมน", "Rounded"], ["svg", "SVG เอง", "Own SVG"]];
const d = (P: [number, number][], k: number, ox: number, oy: number) => "M" + P.map(([x, y]) => `${(x - ox) * k + 8} ${(y - oy) * k + 8}`).join("L") + "Z";

export function BagPartsModal({ open, onClose, hosts, defaultPid, bindPieces, bindSeams, onInsert, initialTab = "strap" }: {
  open: boolean; onClose: () => void;
  hosts: BagPartHost[];
  defaultPid?: string | null;
  /** ชิ้น + ตะเข็บ ไว้คิดความยาวกุ๊นรวมทั้งใบ (ขอบที่ติ๊กกุ๊น + ตะเข็บหุ้มขอบ · นับจำนวนตัด) */ bindPieces: ProjectPiece[]; bindSeams: Seam[];
  onInsert: (r: BagPartsResult) => void;
  initialTab?: Tab;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>(initialTab);
  const seg = (on: boolean) => `h-8 flex-1 rounded-md px-2 text-xs ${on ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`;
  // ── สาย/หู
  const [st, setSt] = useState<StrapOpts>(STRAP_DEFAULT);
  const strap = useMemo(() => strapPlan(st), [st]);
  // ── กุ๊น
  const [bw, setBw] = useState(1);
  const [bk, setBk] = useState<BindKind>("double");
  const [bias, setBias] = useState(true);
  const [extra, setExtra] = useState(0);
  const bindTotal = useMemo(() => bindRuns(bindPieces, bindSeams).total, [bindPieces, bindSeams]);
  const bind = useMemo(() => bindingPlan(bindTotal + extra, { w: bw, kind: bk, bias }), [bindTotal, extra, bw, bk, bias]);
  // ── ช่องโชว์
  const [pid, setPid] = useState<string>(() => (hosts.find((h) => h.pid === defaultPid) ?? hosts[0])?.pid ?? "");
  const host = hosts.find((h) => h.pid === pid) ?? null;
  const hb = host ? shapeBox(host.shape) : null;
  const [wk, setWk] = useState<WindowKind>("heart");
  const [svg, setSvg] = useState("");
  const [ww, setWw] = useState(12);
  const [wh, setWh] = useState(10);
  const [wy, setWy] = useState(0);            // กลางช่องต่ำจากขอบบนของชิ้น (0 = กึ่งกลาง)
  const [struct, setStruct] = useState<WindowStructure>("pvc");
  const [frame, setFrame] = useState(0);
  const win = useMemo(() => (host && hb ? windowPlan(host, { kind: wk, svg, w: ww, h: wh, cx: hb.x + hb.w / 2, cy: hb.y + (wy > 0 ? wy : hb.h / 2), structure: struct, frame }) : null), [host, hb, wk, svg, ww, wh, wy, struct, frame]);

  const piecePreview = (pc: PlanPiece | null, label: string) => {
    if (!pc) return null;
    const b = shapeBox(pc.shape), k = Math.min(520 / Math.max(1, b.w), 120 / Math.max(1, b.h));
    return (
      <svg viewBox={`0 0 ${Math.round(b.w * k + 16)} ${Math.round(b.h * k + 30)}`} className="w-full" role="img" aria-label={label}>
        <path d={d(flattenShape(pc.shape), k, b.x, b.y)} fill="#e9e2cf" stroke="#8a8266" />
        {(pc.inner ?? []).map((l) => <path key={l.id} d={"M" + l.pts.map(([x, y]) => `${(x - b.x) * k + 8} ${(y - b.y) * k + 8}`).join("L")} stroke="#7c3aed" strokeDasharray="6 3 2 3" fill="none" />)}
        {(pc.notches ?? []).map(([x, y], i) => <circle key={i} cx={(x - b.x) * k + 8} cy={(y - b.y) * k + 8} r={2.5} fill="#c2410c" />)}
        <text x={8} y={b.h * k + 24} fontSize={11} fill="#475569">{Math.round(b.w * 10) / 10} × {Math.round(b.h * 10) / 10} {t("ซม.", "cm")} · {t(`ตัด ${pc.count} ชิ้น`, `cut ${pc.count}`)}</text>
      </svg>
    );
  };
  const winPreview = host && hb ? (() => {
    const k = Math.min(300 / hb.w, 240 / hb.h), ox = hb.x, oy = hb.y;
    return (
      <svg viewBox={`0 0 ${Math.round(hb.w * k + 16)} ${Math.round(hb.h * k + 16)}`} className="mx-auto max-h-64 w-full" role="img" aria-label={t("ภาพตัวอย่างช่องโชว์", "Window preview")} data-window-preview>
        <path d={d(flattenShape(host.shape), k, ox, oy)} fill="#e9e2cf" stroke="#8a8266" />
        {win?.frame && <path d={d(flattenShape(win.frame.shape), k, ox, oy)} fill="#c7b89a" stroke="#8a8266" />}
        {win && <path d={d(flattenShape(win.pvc.shape), k, ox, oy)} fill="none" stroke="#0891b2" strokeDasharray="5 3" />}
        {win && <path d={d(flattenShape(win.hole), k, ox, oy)} fill="#f8fafc" stroke="#0f172a" strokeWidth={1.5} />}
      </svg>
    );
  })() : null;

  const can = tab === "strap" ? !!strap : tab === "binding" ? !!bind : !!win;
  const insert = () => {
    if (tab === "strap" && strap) onInsert({ kind: "strap", piece: strap.piece });
    else if (tab === "binding" && bind) onInsert({ kind: "binding", piece: bind.piece });
    else if (tab === "window" && win && host) onInsert({ kind: "window", hostPid: host.pid, plan: win });
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="pattern-bag-parts-modal"
      title={t("ชิ้นกระเป๋า", "Bag parts")}
      description={t("สร้างสาย/หู · แถบกุ๊นที่ต้องตัด · ช่องโชว์บนชิ้น — วางลงกระดานเป็นชิ้นจริง แก้ต่อและย้อนกลับได้", "Make straps · binding strips to cut · display windows on a piece — placed on the board as real pieces you can edit or undo")}
      footer={<>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" disabled={!can} onClick={insert} data-bag-parts-insert className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-40">
          <Icon value="i:plus" className="text-sm" />{t("เพิ่มลงกระดาน", "Add to the board")}
        </button>
      </>}>
      <div className="mb-3 flex rounded-lg border border-slate-200 bg-white p-0.5" role="tablist" aria-label={t("ชนิดชิ้น", "Part type")}>
        {([["strap", "สาย / หู", "Strap / handle"], ["binding", "กุ๊น / หุ้มขอบ", "Binding"], ["window", "ช่องโชว์", "Display window"]] as [Tab, string, string][]).map(([k, th, en]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} data-bag-tab={k} onClick={() => setTab(k)} className={seg(tab === k)}>{t(th, en)}</button>
        ))}
      </div>

      {tab === "strap" && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]" data-bag-strap>
          <div className="min-w-0 space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">{piecePreview(strap?.piece ?? null, t("ภาพตัวอย่างสาย", "Strap preview"))}</div>
            <p className="text-[11px] text-slate-500"><b>{t("ช่างคิดยังไง", "How a pattern maker thinks")}</b> · {t(STRAP_FOLDS.find((f) => f.key === st.fold)!.hintTh, STRAP_FOLDS.find((f) => f.key === st.fold)!.hintEn)} · {t(`ยาวตัด = ยาวโผล่ ${st.L} + โคนเย็บทับ 2 × ${st.attach} ซม. (รอยบากบอกจุดเริ่มเย็บทับ)`, `Cut length = visible ${st.L} + 2 × ${st.attach} cm overlap (notches mark the overlap)`)}</p>
          </div>
          <div className="min-w-0 space-y-3 text-xs">
            <label className="block space-y-1"><span className="text-slate-500">{t("วิธีพับ", "Fold method")}</span>
              <select value={st.fold} onChange={(e) => setSt((x) => ({ ...x, fold: e.target.value as StrapOpts["fold"] }))} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
                {STRAP_FOLDS.map((f) => <option key={f.key} value={f.key}>{t(f.th, f.en)}</option>)}
              </select></label>
            <RangeInput label={t("กว้างสำเร็จ", "Finished width")} unit={t("ซม.", "cm")} min={0.5} max={10} step={0.5} value={st.w} onChange={(n) => setSt((x) => ({ ...x, w: n }))} />
            <RangeInput label={t("ยาวส่วนที่โผล่", "Visible length")} unit={t("ซม.", "cm")} min={5} max={160} step={1} value={st.L} onChange={(n) => setSt((x) => ({ ...x, L: n }))} />
            <RangeInput label={t("โคนเย็บทับตัวกระเป๋า (ปลายละ)", "Overlap onto the bag (each end)")} unit={t("ซม.", "cm")} min={0} max={10} step={0.5} value={st.attach} onChange={(n) => setSt((x) => ({ ...x, attach: n }))} />
            {st.fold === "half" && <RangeInput label={t("เผื่อเย็บ", "Seam allowance")} unit={t("ซม.", "cm")} min={0.3} max={2} step={0.1} value={st.sa} onChange={(n) => setSt((x) => ({ ...x, sa: n }))} />}
            <RangeInput label={t("จำนวนเส้น", "How many")} unit="" min={1} max={8} step={1} value={st.count} onChange={(n) => setSt((x) => ({ ...x, count: Math.round(n) }))} />
            <label className="flex items-center gap-2"><input type="checkbox" checked={st.layers === 2} onChange={(e) => setSt((x) => ({ ...x, layers: e.target.checked ? 2 : 1 }))} className="h-4 w-4 accent-blue-600" />{t("ประกบ 2 ชั้น (หนัง/PU นอก-ใน)", "2 layers (outer + inner leather/PU)")}</label>
          </div>
        </div>
      )}

      {tab === "binding" && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]" data-bag-binding>
          <div className="min-w-0 space-y-2">
            {bindTotal + extra > 0 ? <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">{piecePreview(bind?.piece ?? null, t("ภาพตัวอย่างแถบกุ๊น", "Binding preview"))}</div>
              : <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">{t("ยังไม่มีขอบที่ติ๊ก 'กุ๊น' — ติ๊กที่ค่าของขอบ (กด B แล้วคลิกขอบ) หรือใส่ความยาวเพิ่มเอง", "No edge is ticked 'Binding' yet — tick it in the edge values (B + click an edge), or add a length yourself")}</p>}
            {bind && <p className="text-xs text-slate-700" data-bind-summary>{t(`ใช้ ${bind.need} ซม. (กุ๊นรวม ${Math.round((bindTotal + extra) * 10) / 10} + หัวท้าย 5) → ตัด ${bind.strips} เส้น เส้นละ ${bind.stripLen} × ${bind.cutW} ซม.`, `Needs ${bind.need} cm (binding ${Math.round((bindTotal + extra) * 10) / 10} + 5 ends) → cut ${bind.strips} strip(s) of ${bind.stripLen} × ${bind.cutW} cm`)}</p>}
            <p className="text-[11px] text-slate-500"><b>{t("ช่างคิดยังไง", "How a pattern maker thinks")}</b> · {t("แถบยาวไม่เกิน 140 ซม. ต่อกันเผื่อรอยต่อละ 2 ซม. · ผ้าตัดเฉียง 45° ให้โค้งตามขอบได้ · หนัง/PU ตัดตรง", "Strips up to 140 cm, 2 cm per join · fabric is cut on the bias to follow curves · leather/PU is cut straight")}</p>
          </div>
          <div className="min-w-0 space-y-3 text-xs">
            <label className="block space-y-1"><span className="text-slate-500">{t("ชนิด", "Type")}</span>
              <select value={bk} onChange={(e) => { const v = e.target.value as BindKind; setBk(v); setBias(v !== "wrap"); }} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
                {BIND_KINDS.map((k) => <option key={k.key} value={k.key}>{t(k.th, k.en)}</option>)}
              </select></label>
            <RangeInput label={t("กว้างสำเร็จ", "Finished width")} unit={t("ซม.", "cm")} min={0.3} max={3} step={0.1} value={bw} onChange={setBw} />
            <RangeInput label={t("ความยาวเพิ่มเอง", "Extra length")} unit={t("ซม.", "cm")} min={0} max={500} step={1} value={extra} onChange={setExtra} />
            <label className="flex items-center gap-2"><input type="checkbox" checked={bias} onChange={(e) => setBias(e.target.checked)} className="h-4 w-4 accent-blue-600" />{t("ตัดเฉียง 45° (ผ้า)", "Cut on the bias (fabric)")}</label>
          </div>
        </div>
      )}

      {tab === "window" && (
        !hosts.length ? <p className="py-8 text-center text-sm text-slate-500">{t("ยังไม่มีชิ้นบนกระดาน", "No pieces on the board yet")}</p> : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]" data-bag-window>
            <div className="min-w-0 space-y-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">{winPreview}</div>
              {!win && <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{wk === "svg" && !svg.trim() ? t("วางโค้ด SVG ก่อน", "Paste SVG code first") : t("ช่องออกนอกชิ้น — ลดขนาดหรือขยับตำแหน่ง", "The window goes outside the piece — make it smaller or move it")}</p>}
              {win?.warnings.map((w, i) => <p key={i} className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{t(w.th, w.en)}</p>)}
              <p className="text-[11px] text-slate-500"><b>{t("ช่างคิดยังไง", "How a pattern maker thinks")}</b> · {t(WINDOW_STRUCTURES.find((x) => x.key === struct)!.hintTh, WINDOW_STRUCTURES.find((x) => x.key === struct)!.hintEn)} · {t("PVC ใหญ่กว่ารูรอบละ 1.5 ซม. ไว้เป็นที่เย็บ", "The PVC is 1.5 cm bigger all round for stitching")}</p>
            </div>
            <div className="min-w-0 space-y-3 text-xs">
              <label className="block space-y-1"><span className="text-slate-500">{t("เจาะบนชิ้น", "On piece")}</span>
                <select value={pid} onChange={(e) => setPid(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
                  {hosts.map((h) => { const b = shapeBox(h.shape); return <option key={h.pid} value={h.pid}>{h.name} · {Math.round(b.w * 10) / 10} × {Math.round(b.h * 10) / 10}</option>; })}
                </select></label>
              <div className="grid grid-cols-4 gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("รูปช่อง", "Window shape")}>
                {WIN_KINDS.map(([k, th, en]) => <button key={k} type="button" data-bag-win-kind={k} className={seg(wk === k)} onClick={() => setWk(k)}>{t(th, en)}</button>)}
              </div>
              {wk === "svg" && <textarea value={svg} onChange={(e) => setSvg(e.target.value)} rows={3} placeholder={t("วางโค้ด <svg>…</svg> (ใช้รูปแรกในไฟล์)", "Paste <svg>…</svg> code (the first shape is used)")} className="w-full rounded-lg border border-slate-200 p-2 font-mono text-[11px]" />}
              <RangeInput label={t("กว้างช่อง", "Width")} unit={t("ซม.", "cm")} min={2} max={Math.max(4, Math.floor((hb?.w ?? 30) - 2))} step={0.5} value={ww} onChange={setWw} />
              <RangeInput label={t("สูงช่อง", "Height")} unit={t("ซม.", "cm")} min={2} max={Math.max(4, Math.floor((hb?.h ?? 30) - 2))} step={0.5} value={wh} onChange={setWh} />
              <RangeInput label={t("กลางช่องต่ำจากขอบบน (0 = กึ่งกลาง)", "Centre below the top (0 = middle)")} unit={t("ซม.", "cm")} min={0} max={Math.max(2, Math.floor(hb?.h ?? 30))} step={0.5} value={wy} onChange={setWy} />
              <label className="block space-y-1"><span className="text-slate-500">{t("โครงสร้าง", "Structure")}</span>
                <select value={struct} onChange={(e) => setStruct(e.target.value as WindowStructure)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm" data-bag-win-struct>
                  {WINDOW_STRUCTURES.map((x) => <option key={x.key} value={x.key}>{t(x.th, x.en)}</option>)}
                </select></label>
              <RangeInput label={t("กรอบรอบช่อง (0 = ไม่มี)", "Frame around the window (0 = none)")} unit={t("ซม.", "cm")} min={0} max={4} step={0.5} value={frame} onChange={setFrame} />
            </div>
          </div>
        )
      )}
    </ERPModal>
  );
}
