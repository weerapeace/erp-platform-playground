"use client";
/**
 * 🧵 ไฟล์ปัก — ขั้น "เลือกส่วนที่จะปัก" (หลังเปิดไฟล์ · หรือกดเลือกใหม่ในหน้าทำงาน)
 *   ระบบแยกเป็นกลุ่มให้ (pickGroups — ใช้ autoGroup ของบล็อกพิมพ์) แล้วติ๊กกลุ่มใหญ่ให้ก่อน · ตัวหนังสือกำกับ/เส้นบอกขนาด/ชุดซ้ำ ไม่ติ๊ก
 *   คลิกชิ้น = สลับเลือก · ลากกรอบ = เลือกทั้งกรอบ (ถ้าในกรอบเลือกไว้หมดแล้ว = เอาออก) · ซูม Ctrl+ล้อเมาส์ / ถ่างนิ้ว / ปุ่ม (useCanvasZoom กลาง)
 *   หลายกลุ่ม → "แยกเป็น N งาน" (1 กลุ่ม = 1 ไฟล์ .DST เช่น โลโก้หน้า/หลัง)
 */
import { useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useCanvasZoom, zoomLabel } from "@/components/block-print/use-zoom";
import { opsToSvgPath, pieceShapes, type BlockPiece } from "@/lib/block-print";
import { designBox, pickGroups, pieceColor, type PickGroup } from "@/lib/embroidery";

export type PickResult = { mode: "one"; on: string[] } | { mode: "split"; sets: { ids: string[]; label: string }[] };

const fmt = (mm: number) => (mm / 10).toFixed(1);

export function SelectStep({ open, pieces, initialOn, allowSplit = true, onCancel, onDone, title = "เลือกส่วนที่จะปัก" }: {
  open: boolean; pieces: BlockPiece[]; initialOn?: string[] | null; allowSplit?: boolean;
  onCancel: () => void; onDone: (r: PickResult) => void; title?: string;
}) {
  const [gap, setGap] = useState(3);
  const groups = useMemo(() => pickGroups(pieces, gap), [pieces, gap]);
  const [on, setOn] = useState<Set<string>>(() => new Set(initialOn ?? groups.filter((g) => g.on).flatMap((g) => g.ids)));
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { zoom, zoomTo, step } = useCanvasZoom(boxRef, 1, open);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number; sx: number; sy: number } | null>(null);

  const all = useMemo(() => pieces.filter((p) => p.kind !== "background"), [pieces]);
  const vb = useMemo(() => { const b = designBox(all); const pad = Math.max(b.w, b.h) * 0.03 + 1; return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }; }, [all]);
  const paths = useMemo(() => all.map((p) => ({ id: p.id, color: pieceColor(p), fill: p.fill, d: pieceShapes(p).map((s) => opsToSvgPath(s.d, 1, 1, p.ax, p.ay)).join(" ") })), [all]);
  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);
  const sel = useMemo(() => all.filter((p) => on.has(p.id)), [all, on]);
  const selBox = useMemo(() => designBox(sel), [sel]);
  const groupState = (g: PickGroup) => { const n = g.ids.filter((id) => on.has(id)).length; return n === 0 ? "none" : n === g.ids.length ? "all" : "some"; };
  const pickedGroups = groups.filter((g) => groupState(g) !== "none");

  const toggleIds = (ids: string[], value?: boolean) => setOn((cur) => {
    const next = new Set(cur);
    const v = value ?? !ids.every((id) => cur.has(id));
    for (const id of ids) { if (v) next.add(id); else next.delete(id); }
    return next;
  });
  const toSvg = (cx: number, cy: number) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = toSvg(e.clientX, e.clientY);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, sx: e.clientX, sy: e.clientY });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => { if (drag) { const p = toSvg(e.clientX, e.clientY); setDrag({ ...drag, x1: p.x, y1: p.y }); } };
  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4;
    if (!moved) {
      const id = (e.target as Element).getAttribute?.("data-id");
      if (id) toggleIds([id]);
    } else {
      const x0 = Math.min(drag.x0, drag.x1), x1 = Math.max(drag.x0, drag.x1), y0 = Math.min(drag.y0, drag.y1), y1 = Math.max(drag.y0, drag.y1);
      const ids = all.filter((p) => p.ax >= x0 && p.ay >= y0 && p.ax + p.ow <= x1 && p.ay + p.oh <= y1).map((p) => p.id);
      if (ids.length) toggleIds(ids);
    }
    setDrag(null);
  };

  const label = (g: PickGroup, i: number) => `กลุ่ม ${i + 1}`;
  const finishOne = () => onDone({ mode: "one", on: [...on] });
  const finishSplit = () => onDone({ mode: "split", sets: pickedGroups.map((g) => ({ ids: g.ids.filter((id) => on.has(id)), label: label(g, groups.indexOf(g)) })) });

  return (
    <ERPModal open={open} onClose={onCancel} title={title} size="xl" storageKey="embroidery-select"
      description="ติ๊กกลุ่ม · คลิกชิ้น · หรือลากกรอบ เพื่อเลือกส่วนที่จะปัก — ส่วนจาง = ไม่ปัก"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">เลือก {sel.length} ชิ้น{sel.length ? ` · ${fmt(selBox.w)} × ${fmt(selBox.h)} ซม. (ในไฟล์)` : ""}</span>
          <span className="flex-1" />
          <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50">ยกเลิก</button>
          {allowSplit && pickedGroups.length >= 2 && (
            <button type="button" onClick={finishSplit} className="h-9 rounded-lg border border-indigo-200 bg-indigo-50 px-4 text-sm font-medium text-indigo-700 hover:bg-indigo-100">
              แยกเป็น {pickedGroups.length} งาน
            </button>
          )}
          <button type="button" disabled={!sel.length} onClick={finishOne} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {allowSplit && pickedGroups.length >= 2 ? "รวมเป็นงานเดียว" : "ใช้ส่วนที่เลือก"} →
          </button>
        </div>
      }>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <button type="button" onClick={() => step(-1)} className="h-7 w-7 rounded border border-slate-200 bg-white" aria-label="ซูมออก">−</button>
            <span className="w-12 text-center tabular-nums">{zoomLabel(zoom)}</span>
            <button type="button" onClick={() => step(1)} className="h-7 w-7 rounded border border-slate-200 bg-white" aria-label="ซูมเข้า">+</button>
            <button type="button" onClick={() => zoomTo(1)} className="h-7 rounded border border-slate-200 bg-white px-2">พอดีจอ</button>
            <span className="ml-auto hidden text-slate-400 sm:inline">Ctrl + ล้อเมาส์ = ซูม · ลากกรอบ = เลือก</span>
          </div>
          <div ref={boxRef} className="max-h-[62vh] overflow-auto rounded-lg border border-slate-200 bg-white">
            <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="block select-none" style={{ width: `${zoom * 100}%`, cursor: "crosshair", touchAction: "pan-x pan-y" }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
              {groups.map((g, i) => groupState(g) !== "none" && (
                <g key={g.key}>
                  <rect x={g.box.x - 0.6} y={g.box.y - 0.6} width={g.box.w + 1.2} height={g.box.h + 1.2} fill="none" stroke="#4f46e5" strokeWidth={vb.w / 500} strokeDasharray={`${vb.w / 150} ${vb.w / 250}`} rx={vb.w / 300} />
                  <text x={g.box.x} y={g.box.y - 1.2} fontSize={vb.w / 60} fill="#4f46e5">{label(g, i)}</text>
                </g>
              ))}
              {paths.map((p) => (
                <path key={p.id} data-id={p.id} d={p.d} fill={p.color} fillRule={p.fill} opacity={on.has(p.id) ? 1 : 0.18} style={{ cursor: "pointer" }} />
              ))}
              {drag && (
                <rect x={Math.min(drag.x0, drag.x1)} y={Math.min(drag.y0, drag.y1)} width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)}
                  fill="rgba(79,70,229,0.08)" stroke="#4f46e5" strokeWidth={vb.w / 600} />
              )}
            </svg>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-500">ระบบแยกให้ {groups.length} กลุ่ม · ติ๊กส่วนที่จะปัก</div>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            รวมชิ้นที่ห่างไม่เกิน
            <input type="range" min={0.5} max={10} step={0.5} value={gap} onChange={(e) => setGap(Number(e.target.value))} className="flex-1" />
            <span className="w-10 tabular-nums">{gap} มม.</span>
          </label>
          <ul className="max-h-[52vh] space-y-1.5 overflow-auto pr-1">
            {groups.map((g, i) => {
              const s = groupState(g);
              return (
                <li key={g.key}>
                  <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-sm ${s !== "none" ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <input type="checkbox" className="mt-0.5" checked={s === "all"} ref={(el) => { if (el) el.indeterminate = s === "some"; }} onChange={(e) => toggleIds(g.ids, e.target.checked)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <b className="font-medium text-slate-800">{label(g, i)}</b>
                        {g.colors.slice(0, 5).map((c) => <span key={c} className="h-3 w-3 rounded-sm border border-black/10" style={{ background: c }} />)}
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        {fmt(g.box.w)} × {fmt(g.box.h)} ซม. · {g.ids.length} ชิ้น
                        {g.kind === "junk" && " · เศษเล็ก/เส้นกรอบ"}{g.kind === "note" && " · น่าจะเป็นคำกำกับ (สีแดง)"}
                        {g.dupOf != null && ` · ซ้ำกับกลุ่ม ${g.dupOf + 1}`}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-1.5 text-xs">
            <button type="button" onClick={() => setOn(new Set(all.map((p) => p.id)))} className="rounded border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50">เลือกทั้งหมด</button>
            <button type="button" onClick={() => setOn(new Set())} className="rounded border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50">ล้าง</button>
            <button type="button" onClick={() => setOn(new Set(groups.filter((g) => g.on).flatMap((g) => g.ids)))} className="rounded border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"><Icon name="refresh" /> ที่ระบบแนะนำ</button>
          </div>
          {allowSplit && pickedGroups.length >= 2 && (
            <p className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">เลือกไว้ {pickedGroups.length} กลุ่ม — ถ้าเป็นโลโก้คนละจุด (เช่น หน้า/หลัง) กด "แยกเป็น {pickedGroups.length} งาน" ร้านจะได้ไฟล์แยกกัน</p>
          )}
          {byId.size === 0 && <p className="text-sm text-slate-500">ไม่มีชิ้นในไฟล์</p>}
        </div>
      </div>
    </ERPModal>
  );
}
