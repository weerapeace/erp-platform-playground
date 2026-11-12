"use client";
/**
 * 🎬 ภาพเคลื่อนไหวสั้นของเครื่องมือ (Bag CAD รอบ D) — "ดูตัวอย่าง" ในช่องค้นหาเครื่องมือของสตูดิโอแพทเทิร์น
 *   SVG + <animate> วนซ้ำ ~3 วิ ไม่โหลดไฟล์เพิ่ม · ตั้งค่าเครื่อง "ลดการเคลื่อนไหว" = ภาพนิ่งตอนจบ + ขั้นตอนเป็นตัวหนังสือ (ผู้เรียกแสดงขั้นตอนอยู่แล้ว)
 *   มีเฉพาะเครื่องมือในชุด DemoId (lib/pattern-tools) — เครื่องมืออื่นไม่มีปุ่มดูตัวอย่าง (ไม่ทำปุ่มหลอก)
 */
import { useEffect, useState } from "react";
import type { DemoId } from "@/lib/pattern-tools";

const DUR = "3.2s";
const C = { piece: "#dbeafe", line: "#2563eb", sel: "#f59e0b", seamA: "#c2410c", seamB: "#2563eb", cut: "#334155", cursor: "#0f172a", grid: "#e2e8f0" };
/** ค่าที่เปลี่ยนตามเวลา: values คั่นด้วย ; · keyTimes ตรงกัน */
const A = ({ attr, values, keyTimes = "0;0.55;1" }: { attr: string; values: string; keyTimes?: string }) => <animate attributeName={attr} values={values} keyTimes={keyTimes} dur={DUR} repeatCount="indefinite" />;
const Cursor = ({ path, still }: { path: [number, number][]; still: boolean }) => {
  const last = path[path.length - 1];
  const tri = "M0 0 L0 14 L4 10 L7 16 L9 15 L6 9 L11 9 Z";
  return still ? <path d={tri} transform={`translate(${last[0]} ${last[1]})`} fill={C.cursor} stroke="#fff" strokeWidth={1} /> : (
    <path d={tri} fill={C.cursor} stroke="#fff" strokeWidth={1}>
      <animateTransform attributeName="transform" type="translate" values={path.map((p) => `${p[0]} ${p[1]}`).join(";")} keyTimes={path.map((_, i) => (i / (path.length - 1)).toFixed(2)).join(";")} dur={DUR} repeatCount="indefinite" />
    </path>
  );
};

function scene(id: DemoId, still: boolean) {
  switch (id) {
    case "rect": return <>
      <rect x={40} y={30} width={still ? 130 : 0} height={still ? 75 : 0} fill={C.piece} stroke={C.line} strokeWidth={2}>{!still && <><A attr="width" values="0;130;130" /><A attr="height" values="0;75;75" /></>}</rect>
      <text x={105} y={124} textAnchor="middle" fontSize={11} fill="#475569">กด R แล้วลาก · Drag</text>
      <Cursor still={still} path={[[40, 30], [170, 105], [170, 105]]} />
    </>;
    case "move": return <>
      <rect x={still ? 120 : 30} y={40} width={70} height={50} fill={C.piece} stroke={C.sel} strokeWidth={2.5}>{!still && <A attr="x" values="30;120;120" />}</rect>
      <text x={120} y={124} textAnchor="middle" fontSize={11} fill="#475569">คลิกชิ้นแล้วลาก · Click and drag</text>
      <Cursor still={still} path={[[60, 62], [150, 62], [150, 62]]} />
    </>;
    case "pen": {
      const d = "M40 100 L80 30 C110 10 150 10 170 40 L200 100 Z";
      return <>
        <path d={d} fill={still ? C.piece : "none"} stroke={C.line} strokeWidth={2} strokeDasharray="420" strokeDashoffset={still ? 0 : 420}>{!still && <A attr="stroke-dashoffset" values="420;0;0" keyTimes="0;0.7;1" />}</path>
        {[[40, 100], [80, 30], [170, 40], [200, 100]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3.5} fill="#7c3aed" />)}
        <text x={120} y={128} textAnchor="middle" fontSize={11} fill="#475569">คลิกทีละจุด · ลาก = โค้ง</text>
      </>;
    }
    case "measure": return <>
      <rect x={40} y={45} width={160} height={50} fill={C.piece} stroke={C.line} strokeWidth={1.5} />
      <line x1={40} y1={70} x2={still ? 200 : 40} y2={70} stroke="#7c3aed" strokeWidth={2}>{!still && <A attr="x2" values="40;200;200" />}</line>
      <text x={120} y={36} textAnchor="middle" fontSize={12} fontWeight={600} fill="#7c3aed" opacity={still ? 1 : 0}>260 มม.{!still && <A attr="opacity" values="0;0;1" keyTimes="0;0.55;1" />}</text>
      <Cursor still={still} path={[[40, 70], [200, 70], [200, 70]]} />
    </>;
    case "sew": return <>
      <rect x={30} y={20} width={180} height={45} fill={C.piece} stroke={C.line} strokeWidth={1.5} />
      <rect x={30} y={90} width={180} height={25} fill={C.piece} stroke={C.line} strokeWidth={1.5} />
      <line x1={30} y1={65} x2={210} y2={65} stroke={C.seamA} strokeWidth={4} opacity={still ? 1 : 0}>{!still && <A attr="opacity" values="0;1;1;1" keyTimes="0;0.25;0.6;1" />}</line>
      <line x1={30} y1={90} x2={210} y2={90} stroke={C.seamA} strokeWidth={4} opacity={still ? 1 : 0}>{!still && <A attr="opacity" values="0;0;1;1" keyTimes="0;0.5;0.6;1" />}</line>
      {[60, 120, 180].map((x) => <line key={x} x1={x} y1={65} x2={x} y2={90} stroke={C.seamA} strokeDasharray="3 3" opacity={still ? 1 : 0}>{!still && <A attr="opacity" values="0;0;1" keyTimes="0;0.65;1" />}</line>)}
      <text x={120} y={133} textAnchor="middle" fontSize={11} fill="#475569">คลิกขอบแรก → คลิกขอบคู่ (N)</text>
      <Cursor still={still} path={[[110, 66], [110, 66], [110, 91], [110, 91]]} />
    </>;
    case "sewpart": return <>
      <rect x={20} y={30} width={200} height={40} fill={C.piece} stroke={C.line} strokeWidth={1.5} />
      <rect x={80} y={95} width={80} height={20} fill={C.piece} stroke={C.line} strokeWidth={1.5} />
      <line x1={80} y1={30} x2={still ? 160 : 80} y2={30} stroke={C.seamA} strokeWidth={4}>{!still && <A attr="x2" values="80;160;160" keyTimes="0;0.45;1" />}</line>
      <line x1={80} y1={95} x2={160} y2={95} stroke={C.seamA} strokeWidth={4} opacity={still ? 1 : 0}>{!still && <A attr="opacity" values="0;0;1" keyTimes="0;0.6;1" />}</line>
      <circle cx={80} cy={30} r={4} fill={C.seamA} /><circle cx={160} cy={30} r={4} fill={C.seamA} opacity={still ? 1 : 0}>{!still && <A attr="opacity" values="0;1;1" keyTimes="0;0.45;1" />}</circle>
      <text x={120} y={133} textAnchor="middle" fontSize={11} fill="#475569">จุดเริ่ม → จุดจบ → ขอบอีกชิ้น (J)</text>
    </>;
    case "allow": return <>
      <rect x={still ? 52 : 60} y={still ? 32 : 40} width={still ? 136 : 120} height={still ? 66 : 50} fill="none" stroke={C.cut} strokeWidth={2}>
        {!still && <><A attr="x" values="60;52;52" /><A attr="y" values="40;32;32" /><A attr="width" values="120;136;136" /><A attr="height" values="50;66;66" /></>}
      </rect>
      <rect x={60} y={40} width={120} height={50} fill={C.piece} stroke={C.line} strokeWidth={1.5} strokeDasharray="5 3" />
      <text x={120} y={70} textAnchor="middle" fontSize={11} fill="#1e3a8a">เส้นเย็บ · sew</text>
      <text x={120} y={122} textAnchor="middle" fontSize={11} fill="#475569">เส้นทึบด้านนอก = เส้นตัด (+7 มม.)</text>
    </>;
    case "round": return <>
      <rect x={55} y={30} width={130} height={70} rx={still ? 16 : 0} fill={C.piece} stroke={C.line} strokeWidth={2}>{!still && <A attr="rx" values="0;0;16;16" keyTimes="0;0.3;0.7;1" />}</rect>
      <text x={120} y={124} textAnchor="middle" fontSize={11} fill="#475569">มุมโค้ง: ใส่รัศมีแล้วกด</text>
    </>;
  }
}

export function ToolDemo({ id, label }: { id: DemoId; label: string }) {
  const [still, setStill] = useState(false);
  useEffect(() => { try { setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { /* ไม่รู้ = เคลื่อนไหว */ } }, []);
  return (
    <svg viewBox="0 0 240 140" width="100%" style={{ maxWidth: 300, display: "block" }} role="img" aria-label={label} data-tool-demo={id} className="rounded-md border border-slate-200 bg-white">
      <title>{label}</title>
      <defs><pattern id={`g-${id}`} width={10} height={10} patternUnits="userSpaceOnUse"><path d="M10 0 L0 0 0 10" fill="none" stroke={C.grid} strokeWidth={0.6} /></pattern></defs>
      <rect width={240} height={140} fill={`url(#g-${id})`} />
      {scene(id, still)}
    </svg>
  );
}
