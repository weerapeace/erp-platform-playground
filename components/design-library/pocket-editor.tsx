"use client";

/**
 * 📚 Design Library — วาดช่อง (ด้านนอกหน้า/หลัง + ข้างใน 2 ฝั่ง) · 1 ฝั่งมีได้หลายกล่อง
 * ลากที่ว่าง = วาดกล่องใหม่ · ลากกล่อง = ย้าย · ลากจุดมุมขวาล่าง = ปรับขนาด · หน่วยเป็น ซม. ตามขนาดกระเป๋า
 * รูปในใบสรุปใช้ pocketPanelSvg (lib/design-library) ชุดเดียวกัน
 */
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { MAX_BOXES, PANELS, type Choice, type PanelKey, type PocketBox, type Spec } from "@/lib/design-library";
import { newId } from "./shared";

type Drag = { kind: "move" | "size"; id: string; sx: number; sy: number; start: PocketBox } | { kind: "draw"; sx: number; sy: number; cx: number; cy: number };
const r1 = (n: number) => Math.round(n * 2) / 2;   // ปัดครึ่งเซนติเมตร

export function PocketEditor({ spec, choices, readOnly, onChange }: {
  spec: Spec; choices: Choice[]; readOnly: boolean; onChange: (pockets: Spec["pockets"]) => void;
}) {
  const [panel, setPanel] = useState<PanelKey>("front");
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const types = choices.filter((c) => c.list_key === "pocket_type");
  // ระหว่างพิมพ์ขนาดใหม่ค่าอาจเป็น 0 ชั่วคราว → กันหารศูนย์ (ตอนบันทึก cleanSpec บีบกล่องให้พอดีขนาดจริงเอง)
  const W = Math.max(1, spec.size.w), H = Math.max(1, spec.size.h);
  const s = Math.min(320 / W, 340 / H), ox = (360 - W * s) / 2, oy = 24;
  const boxes = spec.pockets[panel];
  const selBox = boxes.find((b) => b.id === sel) ?? null;

  const setBoxes = (next: PocketBox[]) => onChange({ ...spec.pockets, [panel]: next });
  const patch = (id: string, p: Partial<PocketBox>) => setBoxes(boxes.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const toCm = (e: RPointerEvent) => {
    const svg = svgRef.current!; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: (q.x - ox) / s, y: (q.y - oy) / s };
  };
  const clampBox = (b: PocketBox): PocketBox => {
    const w = Math.max(1, Math.min(W, b.w)), h = Math.max(1, Math.min(H, b.h));
    return { ...b, w, h, x: Math.max(0, Math.min(W - w, b.x)), y: Math.max(0, Math.min(H - h, b.y)) };
  };

  const down = (e: RPointerEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const t = (e.target as Element).closest("[data-box]");
    const p = toCm(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    if (t) {
      const id = t.getAttribute("data-box")!; const b = boxes.find((x) => x.id === id)!;
      setSel(id); setDrag({ kind: t.getAttribute("data-h") === "size" ? "size" : "move", id, sx: p.x, sy: p.y, start: b });
    } else if (boxes.length < MAX_BOXES) { setSel(null); setDrag({ kind: "draw", sx: p.x, sy: p.y, cx: p.x, cy: p.y }); }
  };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const p = toCm(e);
    if (drag.kind === "draw") { setDrag({ ...drag, cx: p.x, cy: p.y }); return; }
    const dx = r1(p.x - drag.sx), dy = r1(p.y - drag.sy), b = drag.start;
    patch(drag.id, drag.kind === "move" ? clampBox({ ...b, x: b.x + dx, y: b.y + dy }) : clampBox({ ...b, w: b.w + dx, h: b.h + dy }));
  };
  const up = () => {
    if (drag?.kind === "draw") {
      const x = r1(Math.min(drag.sx, drag.cx)), y = r1(Math.min(drag.sy, drag.cy)), w = r1(Math.abs(drag.cx - drag.sx)), h = r1(Math.abs(drag.cy - drag.sy));
      if (w >= 1 && h >= 1) {
        const nb = clampBox({ id: newId(), x, y, w, h, type: types[0]?.code ?? "", note: "" });
        setBoxes([...boxes, nb]); setSel(nb.id);
      }
    }
    setDrag(null);
  };
  const addDefault = () => {
    const w = Math.min(W, Math.round(W * 0.5)), h = Math.min(H, Math.round(H * 0.35));
    const nb = clampBox({ id: newId(), x: r1((W - w) / 2), y: r1(H * 0.2 + boxes.length * 2), w, h, type: types[0]?.code ?? "", note: "" });
    setBoxes([...boxes, nb]); setSel(nb.id);
  };

  const draw = drag?.kind === "draw" ? drag : null;
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {PANELS.map((p) => (
          <button key={p.key} type="button" onClick={() => { setPanel(p.key); setSel(null); }}
            className={`h-8 px-3 text-[12.5px] rounded-full border ${panel === p.key ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {p.label} <span className="text-slate-400">{spec.pockets[p.key].length}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="rounded-lg bg-slate-50 p-2">
          <svg ref={svgRef} viewBox={`0 0 360 ${oy + H * s + 12}`} width="100%" className="block bg-white rounded-md select-none" style={{ touchAction: "none", cursor: readOnly ? "default" : "crosshair" }}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}>
            <rect x={ox} y={oy} width={W * s} height={H * s} fill={PANELS.find((p) => p.key === panel)?.inside ? "#eef2f7" : "#f4efe4"} stroke="#999" />
            <text x={180} y={15} textAnchor="middle" fontSize={11} fill="#555">{PANELS.find((p) => p.key === panel)?.label} · {W}×{H} ซม.</text>
            {boxes.map((b, i) => {
              const x = ox + b.x * s, y = oy + b.y * s, w = b.w * s, h = b.h * s, on = b.id === sel;
              return (
                <g key={b.id} data-box={b.id} style={{ cursor: readOnly ? "default" : "move" }}>
                  <rect x={x} y={y} width={w} height={h} fill={on ? "rgba(55,138,221,.25)" : "rgba(55,138,221,.12)"} stroke="#185FA5" strokeWidth={on ? 2 : 1.3} />
                  {b.type === "zip" && <line x1={x + 3} y1={y + 5} x2={x + w - 3} y2={y + 5} stroke="#185FA5" strokeDasharray="3 2" />}
                  {b.type === "flap" && <path d={`M${x} ${y} L${x + w / 2} ${y + h * 0.35} L${x + w} ${y}`} fill="none" stroke="#185FA5" />}
                  <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={11} fill="#0C447C" pointerEvents="none">{i + 1}) {b.w}×{b.h}</text>
                  {!readOnly && on && <circle data-box={b.id} data-h="size" cx={x + w} cy={y + h} r={8} fill="#185FA5" stroke="#fff" strokeWidth={2} style={{ cursor: "nwse-resize" }} />}
                </g>
              );
            })}
            {draw && <rect x={ox + Math.min(draw.sx, draw.cx) * s} y={oy + Math.min(draw.sy, draw.cy) * s} width={Math.abs(draw.cx - draw.sx) * s} height={Math.abs(draw.cy - draw.sy) * s} fill="rgba(55,138,221,.1)" stroke="#378ADD" strokeDasharray="4 3" />}
          </svg>
          {!readOnly && <p className="text-[11px] text-slate-400 mt-1">ลากบนที่ว่าง = วาดช่องใหม่ · ลากกล่อง = ย้าย · ลากจุดมุมขวาล่าง = ปรับขนาด</p>}
        </div>
        <div className="space-y-2">
          {boxes.length === 0 && <div className="text-[13px] text-slate-400">ฝั่งนี้ยังไม่มีช่อง{readOnly ? "" : " — ลากบนรูปเพื่อวาด หรือกดปุ่มด้านล่าง"}</div>}
          {boxes.map((b, i) => (
            <div key={b.id} onClick={() => setSel(b.id)} className={`rounded-lg border p-2 ${b.id === sel ? "border-indigo-300 bg-indigo-50/40" : "border-slate-200"}`}>
              <div className="flex items-center gap-2 text-[13px]">
                <span className="font-medium text-slate-700">ช่อง {i + 1}</span>
                <span className="text-slate-500">{b.w}×{b.h} ซม. · ห่างขอบบน {b.y} · ขอบซ้าย {b.x}</span>
                {!readOnly && <button type="button" onClick={(e) => { e.stopPropagation(); setBoxes(boxes.filter((x) => x.id !== b.id)); setSel(null); }} className="ml-auto text-rose-600 text-[12px] hover:underline">ลบ</button>}
              </div>
              {!readOnly && (b.id === sel || boxes.length <= 2) && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {types.map((t) => (
                      <button key={t.id} type="button" onClick={() => patch(b.id, { type: t.code })}
                        className={`h-7 px-2.5 text-[12px] rounded-full border ${b.type === t.code ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600"}`}>{t.name}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {(["w", "h", "y", "x"] as const).map((k) => (
                      <label key={k} className="text-[11px] text-slate-500">{{ w: "กว้าง", h: "สูง", y: "ห่างบน", x: "ห่างซ้าย" }[k]}
                        <input type="number" step={0.5} min={0} value={b[k]} onChange={(e) => patch(b.id, clampBox({ ...b, [k]: Number(e.target.value) || 0 }))} className="w-full h-7 px-1 border border-slate-200 rounded text-[12px]" />
                      </label>
                    ))}
                  </div>
                  <input value={b.note} onChange={(e) => patch(b.id, { note: e.target.value })} placeholder="รายละเอียด เช่น ใส่โทรศัพท์ได้ / แบ่ง 2 ช่อง (ส่งไปใน prompt)" className="w-full h-8 px-2 border border-slate-200 rounded-md text-[12.5px]" />
                </div>
              )}
              {readOnly && b.note && <div className="text-[12px] text-slate-500 mt-1">{b.note}</div>}
            </div>
          ))}
          {!readOnly && boxes.length < MAX_BOXES && <button type="button" onClick={addDefault} className="h-8 px-3 text-[13px] rounded-lg border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50">+ เพิ่มช่องฝั่งนี้</button>}
        </div>
      </div>
    </div>
  );
}
