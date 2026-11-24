"use client";
/**
 * 🧱 บล็อกพิมพ์ — หน้าเลือกชิ้น (ขั้น 1 ก่อนตั้งขนาด) · เจ้าของเลือกใน widget 2026-11-24 (ข้อเสนอ 1-5 · ระยะรวมเริ่มต้น 1.5 มม.)
 *   ปัญหา: ใน Illustrator ตัวอักษร/ลาย 1 ตัวอาจประกอบจากหลายเส้นที่ไม่ได้รวมกัน (เช่น i กับจุด) → ระบบอ่านเป็นคนละชิ้น
 *   หน้านี้: วาดทุกเส้นตามตำแหน่งในไฟล์ .ai · ระบบจัดกลุ่มให้ก่อน (ทับกัน / ห่างไม่เกิน X มม.) · ซ่อนเศษเล็ก/เส้นกรอบไว้ก่อน
 *   ผู้ใช้: คลิก/แตะชิ้นเพื่อเลือก · ลากกรอบเลือกหลายชิ้น (เมาส์) · รวมเป็น 1 ชิ้น · แยกออก · ไม่เอา/เอากลับ · ย้อนกลับ/ทำซ้ำ (Ctrl+Z / Ctrl+Y)
 *   กด "ต่อไป" → applyGrouping (ชิ้นที่ไม่เปลี่ยนกลุ่มคงขนาดที่ตั้งไว้) → กลับหน้าตั้งขนาด
 *   สูตรทั้งหมดอยู่ lib/block-print.ts (autoGroup / applyGrouping) — หน้านี้แค่โชว์และรับคำสั่ง
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { shortcutKey } from "@/lib/shortcut-key";
import {
  GROUP_DEFAULT, GROUP_GAP_MAX, KIND_NAME, applyGrouping, atomsOf, autoGroup, byPosition, groupsFromPieces, opsToSvgPath,
  type BlockPiece, type GroupOpts, type PieceGroup,
} from "@/lib/block-print";

type Box = { ax: number; ay: number; ow: number; oh: number };
type View = PieceGroup & { key: string; box: Box; label: string };

const unionBox = (bs: Box[]): Box => {
  const x0 = Math.min(...bs.map((b) => b.ax)), y0 = Math.min(...bs.map((b) => b.ay));
  return { ax: x0, ay: y0, ow: Math.max(...bs.map((b) => b.ax + b.ow)) - x0, oh: Math.max(...bs.map((b) => b.ay + b.oh)) - y0 };
};
const hits = (a: Box, r: Box) => a.ax <= r.ax + r.ow && a.ax + a.ow >= r.ax && a.ay <= r.ay + r.oh && a.ay + a.oh >= r.ay;
const sameGroups = (a: PieceGroup[], b: PieceGroup[]) => JSON.stringify(a) === JSON.stringify(b);
const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8];

export function BlockPieceGrouper({ pieces, onDone, onCancel }: {
  pieces: BlockPiece[];
  onDone: (pieces: BlockPiece[]) => void;
  onCancel: () => void;
}) {
  // เส้นเดี่ยวทั้งหมด (ชิ้นที่รวมไว้แล้วแตกเป็นเส้นเดิม) — ไม่เปลี่ยนระหว่างอยู่หน้านี้
  const [start] = useState(() => groupsFromPieces(pieces));
  const atoms = useMemo(() => pieces.flatMap(atomsOf), [pieces]);
  const byId = useMemo(() => new Map(atoms.map((a) => [a.id, a])), [atoms]);
  const paths = useMemo(() => new Map(atoms.map((a) => [a.id, opsToSvgPath(a.d, 1, 1, a.ax, a.ay)])), [atoms]);
  const [groups, setGroups] = useState<PieceGroup[]>(start);
  const [opts, setOpts] = useState<GroupOpts>(GROUP_DEFAULT);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [askCancel, setAskCancel] = useState(false);
  const past = useRef<PieceGroup[][]>([]);
  const future = useRef<PieceGroup[][]>([]);

  const views: View[] = useMemo(() => {
    const vs = groups.map((g) => {
      const as = g.ids.map((id) => byId.get(id)).filter((a): a is BlockPiece => !!a);
      return { ...g, key: g.ids[0], box: unionBox(as), label: "" };
    });
    const main = vs.filter((v) => !v.kind).sort((a, b) => byPosition(a.box, b.box));
    main.forEach((v, i) => { v.label = String(i + 1); });
    vs.filter((v) => v.kind).forEach((v) => { v.label = KIND_NAME[v.kind!]; });
    return [...main, ...vs.filter((v) => v.kind)];
  }, [groups, byId]);

  const all = useMemo(() => unionBox(atoms), [atoms]);
  const pad = Math.max(all.ow, all.oh) * 0.04 + 2;
  const vb = { x: all.ax - pad, y: all.ay - pad * 1.6, w: all.ow + pad * 2, h: all.oh + pad * 2.6 };

  // ชิ้นพื้นใหญ่ (เช่น แถบสายเข็มขัดที่ลายวางทับ) วาดก่อนเป็นสีเทาอ่อน ลายเล็กที่ทับอยู่จะได้มองเห็น
  const { drawOrder, backdrop } = useMemo(() => {
    const area = (v: View) => Math.max(v.box.ow * v.box.oh, 1e-6);
    const areas = views.filter((v) => !v.kind).map(area).sort((a, b) => a - b);
    const med = areas.length ? areas[Math.floor(areas.length / 2)] : 0;
    return {
      drawOrder: [...views].sort((a, b) => area(b) - area(a)),
      backdrop: new Set(views.filter((v) => !v.kind && med > 0 && area(v) > med * 25).map((v) => v.key)),
    };
  }, [views]);

  // ซูม: เริ่มที่ขนาดที่ชิ้นทั่วไปใหญ่พอให้คลิกได้ (~28px) · ปุ่ม − / + / พอดีจอ
  const boxRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const cw = boxRef.current?.clientWidth ?? 0;
    const sizes = views.filter((v) => !v.kind).map((v) => Math.max(v.box.ow, v.box.oh)).sort((a, b) => a - b);
    if (!cw || !sizes.length) return;
    const med = sizes[Math.floor(sizes.length / 2)];
    const want = 28 / (med * (cw / vb.w));
    setZoom(ZOOMS.find((z) => z >= want) ?? ZOOMS[ZOOMS.length - 1]);
    // ตั้งครั้งเดียวตอนเปิดหน้า
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fs = Math.max(vb.w, vb.h) / 55 / Math.sqrt(zoom);
  const zoomStep = (dir: 1 | -1) => setZoom((z) => { const i = ZOOMS.indexOf(z); return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))]; });

  const commit = (next: PieceGroup[], note = "") => {
    if (sameGroups(next, groups)) return;
    past.current.push(groups);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    setGroups(next); setMsg(note);
  };
  const undo = () => { const p = past.current.pop(); if (!p) return setMsg("ไม่มีอะไรให้ย้อนแล้ว"); future.current.push(groups); setGroups(p); setSel(new Set()); setMsg("ย้อนกลับแล้ว"); };
  const redo = () => { const f = future.current.pop(); if (!f) return; past.current.push(groups); setGroups(f); setSel(new Set()); setMsg(""); };

  const picked = views.filter((v) => sel.has(v.key));
  const merge = () => {
    if (picked.length < 2) return setMsg("เลือกอย่างน้อย 2 ชิ้นก่อนกดรวม");
    const ng: PieceGroup = { ids: picked.flatMap((v) => v.ids), on: true };
    commit([...groups.filter((g) => !sel.has(g.ids[0])), ng], `รวม ${picked.length} ชิ้นเป็นชิ้นเดียวแล้ว · กดย้อนกลับได้`);
    setSel(new Set([ng.ids[0]]));
  };
  const split = () => {
    const t = picked.filter((v) => v.ids.length > 1);
    if (!t.length) return setMsg("เลือกชิ้นที่รวมจากหลายเส้นก่อน (ที่มีตัวเลข ×2, ×3 …)");
    const keys = new Set(t.map((v) => v.key));
    const add = t.flatMap((v) => v.ids.map((id) => ({ ids: [id], on: v.on })));
    commit([...groups.filter((g) => !keys.has(g.ids[0])), ...add], `แยกออกเป็น ${add.length} ชิ้นแล้ว`);
    setSel(new Set(add.map((g) => g.ids[0])));
  };
  const toggleOn = (keys?: string[]) => {
    const ks = new Set(keys ?? picked.map((v) => v.key));
    if (!ks.size) return setMsg("เลือกชิ้นก่อน");
    const allOn = groups.filter((g) => ks.has(g.ids[0])).every((g) => g.on);
    commit(groups.map((g) => (ks.has(g.ids[0]) ? { ...g, on: !allOn } : g)), allOn ? "ตั้งเป็น \"ไม่เอา\" แล้ว (ยังอยู่ ติ๊กกลับได้)" : "เอากลับมาแล้ว");
  };
  const reAuto = (o: GroupOpts) => { setOpts(o); setSel(new Set()); commit(autoGroup(atoms, o), "จัดกลุ่มใหม่ตามที่ตั้งแล้ว · กดย้อนกลับได้"); };
  const pick = (key: string) => { setMsg(""); setSel((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; }); };

  // คีย์ลัด
  const keyRef = useRef({ undo, redo });
  keyRef.current = { undo, redo };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") { setSel(new Set()); return; }
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = shortcutKey(e).toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); keyRef.current.undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); keyRef.current.redo(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ลากกรอบเลือก (เมาส์/ปากกา) · แตะที่ว่าง = ล้างที่เลือก
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; add: boolean } | null>(null);
  const [mq, setMq] = useState<Box | null>(null);
  const toSvg = (e: RPointerEvent) => {
    const svg = svgRef.current!, m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    const g = (e.target as Element).closest("[data-key]");
    if (g) { pick(g.getAttribute("data-key")!); return; }
    const p = toSvg(e);
    drag.current = { ...p, add: e.shiftKey };
    if (e.pointerType !== "touch") e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current; if (!d || e.pointerType === "touch") return;
    const p = toSvg(e);
    setMq({ ax: Math.min(d.x, p.x), ay: Math.min(d.y, p.y), ow: Math.abs(p.x - d.x), oh: Math.abs(p.y - d.y) });
  };
  const onUp = () => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    const r = mq; setMq(null);
    if (!r || (r.ow < vb.w / 200 && r.oh < vb.h / 200)) { setSel(new Set()); setMsg(""); return; }
    const inside = views.filter((v) => !v.kind && hits(v.box, r)).map((v) => v.key);
    setSel((cur) => new Set([...(d.add ? cur : []), ...inside]));
    setMsg(inside.length > 1 ? `เลือก ${inside.length} ชิ้นแล้ว · กด "รวมเป็น 1 ชิ้น" ได้` : "");
  };

  const onCount = views.filter((v) => v.on).length;
  // เลือกทุกชิ้นที่ติ๊ก (เช่น ลายต่อเนื่องทั้งแผ่น → รวมเป็นบล็อกเดียว) — มือถือลากกรอบไม่ได้ ใช้ปุ่มนี้แทน
  const selectable = views.filter((v) => v.on && !v.kind).map((v) => v.key);
  const allPicked = selectable.length > 0 && selectable.every((k) => sel.has(k));
  const pickAll = () => { setSel(allPicked ? new Set() : new Set(selectable)); setMsg(allPicked ? "" : `เลือก ${selectable.length} ชิ้นแล้ว · กด "รวมเป็น 1 ชิ้น" ได้`); };
  const changed = !sameGroups(groups, start);
  const done = () => onDone(applyGrouping(pieces, groups));

  const actions = (
    <>
      <ActBtn icon="link" label={`รวมเป็น 1 ชิ้น${picked.length > 1 ? ` (${picked.length})` : ""}`} onClick={merge} strong={picked.length > 1} />
      <ActBtn icon="scissors" label="แยกออก" onClick={split} />
      <ActBtn icon="eye-off" label="ไม่เอา / เอากลับ" onClick={() => toggleOn()} />
      <ActBtn icon="arrow-back-up" label="ย้อนกลับ" onClick={undo} />
      <ActBtn icon="list" label={allPicked ? "ล้างที่เลือก" : "เลือกทุกชิ้นที่ติ๊ก"} onClick={pickAll} />
    </>
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-3 p-3 pb-24 md:p-5 lg:pb-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => (changed ? setAskCancel(true) : onCancel())} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100"><Icon name="back" /> กลับหน้าตั้งขนาด</button>
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">1 เลือกชิ้น</span>
          <span className="text-slate-400">›</span>
          <span className="text-slate-400">2 ตั้งขนาด</span>
        </span>
        <span className="text-xs text-slate-500">ในไฟล์มี {atoms.length} เส้น → {views.length} ชิ้น · ส่งต่อ {onCount}</span>
        <button type="button" onClick={done} className="ml-auto hidden h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 lg:inline-flex">
          ต่อไป: ตั้งขนาด {onCount} ชิ้น&nbsp;→</button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        ระบบจัดกลุ่มให้ก่อนแล้ว — เส้นที่ทับกันหรืออยู่ห่างกันไม่เกินระยะที่ตั้ง รวมเป็นชิ้นเดียว · ตรวจดูว่าชิ้นไหนควรรวมหรือแยก แล้วค่อยกด &quot;ต่อไป&quot;
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 space-y-2">
          <AutoSettings opts={opts} onChange={reAuto} />
          <div className="rounded-xl bg-slate-100 p-2 md:p-3">
            <div className="mb-1.5 flex items-center gap-1 text-xs text-slate-600">
              <span>ซูม</span>
              <button type="button" onClick={() => zoomStep(-1)} aria-label="ซูมออก" className="h-7 w-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50">−</button>
              <span className="w-11 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => zoomStep(1)} aria-label="ซูมเข้า" className="h-7 w-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50">+</button>
              <button type="button" onClick={() => setZoom(1)} className="h-7 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50">พอดีจอ</button>
              {backdrop.size > 0 && <span className="ml-2 hidden text-slate-500 sm:inline">สีเทาอ่อน = ชิ้นพื้นใหญ่ (เลือกจากรายการด้านขวา)</span>}
            </div>
            <div ref={boxRef} className="max-h-[65vh] overflow-auto rounded bg-white">
              <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className={`mx-auto block select-none ${zoom === 1 ? "max-h-[64vh]" : ""}`}
                style={{ cursor: "crosshair", width: `${zoom * 100}%`, touchAction: zoom > 1 ? "pan-x pan-y" : undefined }}
                role="img" aria-label="ภาพเส้นทั้งหมดในไฟล์" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; setMq(null); }}>
                {drawOrder.map((v) => {
                  const on = sel.has(v.key), back = backdrop.has(v.key);
                  const col = !v.on ? "#94a3b8" : on ? "#2563eb" : back ? "#a5b4fc" : "#8b5cf6";
                  const ink = !v.on ? "#e2e8f0" : back ? (on ? "#bfdbfe" : "#d1d5db") : "#000";
                  const p = fs * (v.kind ? 0.15 : 0.3);
                  return (
                    <g key={v.key} data-key={back ? undefined : v.key} style={{ cursor: "pointer" }} pointerEvents={back ? "none" : undefined}>
                      <rect x={v.box.ax - p} y={v.box.ay - p} width={v.box.ow + 2 * p} height={v.box.oh + 2 * p}
                        fill={on && !back ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.01)"} stroke={col} strokeWidth={on ? 2 : 1}
                        strokeDasharray={v.on ? "4 3" : "2 2"} vectorEffect="non-scaling-stroke" />
                      {v.ids.map((id) => <path key={id} d={paths.get(id)} fill={ink} fillRule={byId.get(id)?.fill} />)}
                      {!v.kind && !back && <text x={v.box.ax - p} y={v.box.ay - p - fs * 0.25} fontSize={fs} fill={col} fontFamily="sans-serif">{v.label}{v.ids.length > 1 ? ` ×${v.ids.length}` : ""}</text>}
                    </g>
                  );
                })}
                {mq && <rect x={mq.ax} y={mq.ay} width={mq.ow} height={mq.oh} fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeDasharray="3 2" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
              </svg>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            <span className="hidden lg:inline">คลิกชิ้นเพื่อเลือก (คลิกซ้ำเพื่อเอาออก) · ลากกรอบที่ที่ว่างเพื่อเลือกหลายชิ้น (กด Shift ค้างเพื่อเพิ่ม) · คลิกที่ว่าง / Esc = ล้างที่เลือก</span>
            <span className="lg:hidden">แตะชิ้นบนภาพหรือในรายการเพื่อเลือก (แตะซ้ำเพื่อเอาออก)</span>
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">{actions}</div>
          <div className="min-h-[20px] text-sm text-indigo-700" aria-live="polite">{msg}</div>
        </section>

        <aside className="min-w-0 rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-3 py-2 text-sm font-medium text-slate-800">ชิ้น <span className="font-normal text-slate-500">· ติ๊ก = ส่งต่อไปตั้งขนาด</span></div>
          <div className="flex flex-wrap gap-1.5 p-2 lg:max-h-[62vh] lg:flex-col lg:flex-nowrap lg:overflow-y-auto">
            {views.map((v) => (
              <div key={v.key} onClick={() => pick(v.key)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${sel.has(v.key) ? "border-indigo-300 bg-indigo-50" : "border-slate-100 hover:bg-slate-50 lg:border-transparent"} ${v.on ? "" : "text-slate-400"}`}>
                <input type="checkbox" checked={v.on} aria-label={`ส่งต่อ ${v.label}`} onClick={(e) => e.stopPropagation()} onChange={() => toggleOn([v.key])} />
                <GroupThumb v={v} byId={byId} paths={paths} />
                <span className="min-w-0 flex-1 truncate">{v.kind ? v.label : `ชิ้น ${v.label}`}</span>
                {backdrop.has(v.key) && <span className="whitespace-nowrap rounded bg-slate-100 px-1 text-[11px] text-slate-500">ชิ้นพื้น</span>}
                {v.ids.length > 1 && <span className="whitespace-nowrap text-xs text-slate-500">{v.ids.length} เส้น</span>}
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-2 lg:hidden">
        <button type="button" onClick={done} className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 text-sm font-medium text-white">
          ต่อไป: ตั้งขนาด {onCount} ชิ้น&nbsp;→</button>
      </div>

      <ConfirmDialog open={askCancel} onClose={() => setAskCancel(false)} onConfirm={() => { setAskCancel(false); onCancel(); }}
        title="ทิ้งการจัดกลุ่มที่ทำไว้?" message="รวม/แยกชิ้นที่ทำในหน้านี้ยังไม่ได้ใช้ — กลับไปหน้าตั้งขนาดด้วยชิ้นแบบเดิม"
        confirmText="ทิ้งแล้วกลับ" cancelText="อยู่ต่อ" />
    </div>
  );
}

function ActBtn({ icon, label, onClick, strong }: { icon: string; label: string; onClick: () => void; strong?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm ${strong ? "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
      <Icon name={icon} /> {label}
    </button>
  );
}

/** ตั้งค่าการจัดกลุ่มอัตโนมัติ — เปลี่ยนแล้วจัดกลุ่มใหม่ทั้งไฟล์ (ย้อนกลับได้) */
function AutoSettings({ opts, onChange }: { opts: GroupOpts; onChange: (o: GroupOpts) => void }) {
  const [gap, setGap] = useState(opts.gap ?? GROUP_DEFAULT.gap!);
  useEffect(() => { if (opts.gap != null) setGap(opts.gap); }, [opts.gap]);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={opts.overlap} onChange={(e) => onChange({ ...opts, overlap: e.target.checked })} /> รวมเส้นที่ทับกัน</label>
      <label className="flex min-w-[240px] flex-1 items-center gap-2">
        <input type="checkbox" checked={opts.gap != null} aria-label="รวมเส้นที่อยู่ใกล้กัน" onChange={(e) => onChange({ ...opts, gap: e.target.checked ? gap : null })} />
        <span className="whitespace-nowrap">รวมเส้นที่ห่างกันไม่เกิน</span>
        <input type="range" min={0} max={GROUP_GAP_MAX} step={0.05} value={gap} disabled={opts.gap == null} className="min-w-[80px] flex-1"
          onChange={(e) => setGap(Number(e.target.value))}
          onPointerUp={() => { if (opts.gap != null && gap !== opts.gap) onChange({ ...opts, gap }); }}
          onKeyUp={() => { if (opts.gap != null && gap !== opts.gap) onChange({ ...opts, gap }); }} />
        <span className="w-14 whitespace-nowrap font-medium tabular-nums">{+gap.toFixed(2)} มม.</span>
      </label>
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={opts.hideJunk} onChange={(e) => onChange({ ...opts, hideJunk: e.target.checked })} /> ซ่อนเศษเล็ก / เส้นกรอบ</label>
    </div>
  );
}

function GroupThumb({ v, byId, paths }: { v: View; byId: Map<string, BlockPiece>; paths: Map<string, string> }) {
  const m = Math.max(v.box.ow, v.box.oh, 0.5);
  const pad = m * 0.1;
  return (
    <svg width={26} height={26} viewBox={`${v.box.ax + v.box.ow / 2 - m / 2 - pad} ${v.box.ay + v.box.oh / 2 - m / 2 - pad} ${m + 2 * pad} ${m + 2 * pad}`} className="shrink-0 rounded bg-slate-50">
      {v.ids.map((id) => <path key={id} d={paths.get(id)} fill={v.on ? "#111" : "#cbd5e1"} fillRule={byId.get(id)?.fill} />)}
    </svg>
  );
}
