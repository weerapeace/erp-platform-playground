"use client";

/**
 * Editor เทมเพลตรูปส่วนประกอบเข็มขัด — กรอบมาตรฐาน 1000×185 px
 * ปรับด้วยสไลเดอร์ (ความยาว/ความสูง/ทรงปลาย/เส้นแบ่งโซน) + ลากตัวอักษรขยับตำแหน่งได้
 * โหลดได้ทั้ง SVG (แก้ได้) และ PNG (เรนเดอร์ client จาก SVG)
 */
import { useCallback, useRef, useState } from "react";

const W = 1000, H = 185;
type Tail = "duckbill" | "pointed" | "straight";
type TextItem = { id: string; x: number; y: number; label: string; size: number };

const DEFAULT_TEXTS: TextItem[] = [
  { id: "logo", x: 560, y: 96, label: "Louis Montini", size: 20 },
  { id: "dim1", x: 720, y: 30, label: "ห่าง 1 นิ้ว", size: 12 },
  { id: "z1", x: 110, y: 178, label: "โซนรู / ลาย (ซ้าย)", size: 11 },
  { id: "z2", x: 510, y: 178, label: "โซนโลโก้ (ขวา)", size: 11 },
];

const escXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function beltPath(len: number, bh: number, tail: Tail): string {
  const top = Math.round((H - bh) / 2), bot = top + bh, cy = Math.round((top + bot) / 2);
  const bodyEnd = Math.max(60, len - 105);
  if (tail === "straight") return `M40,${top} H${len} V${bot} H40 Z`;
  if (tail === "pointed") return `M40,${top} H${bodyEnd} L${len},${cy} L${bodyEnd},${bot} H40 Z`;
  return `M40,${top} H${bodyEnd} L${len - 14},${top + 16} Q${len},${cy} ${len - 14},${bot - 16} L${bodyEnd},${bot} H40 Z`;
}

function triggerDownload(href: string, name: string) {
  const a = document.createElement("a"); a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

export default function BeltTemplatePage() {
  const [len, setLen] = useState(790);
  const [bh, setBh] = useState(95);
  const [tail, setTail] = useState<Tail>("duckbill");
  const [divider, setDivider] = useState(450);
  const [texts, setTexts] = useState<TextItem[]>(DEFAULT_TEXTS);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<string | null>(null);

  const toSvgCoords = (clientX: number, clientY: number) => {
    const svg = svgRef.current; if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { x: Math.round((clientX - r.left) * (W / r.width)), y: Math.round((clientY - r.top) * (H / r.height)) };
  };
  const onDown = (id: string) => (e: React.PointerEvent) => { e.stopPropagation(); dragRef.current = id; (e.target as Element).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const c = toSvgCoords(e.clientX, e.clientY); if (!c) return;
    setTexts((ts) => ts.map((t) => (t.id === dragRef.current ? { ...t, x: c.x, y: c.y } : t)));
  };
  const onUp = () => { dragRef.current = null; };

  // SVG สำหรับดาวน์โหลด (ไกด์เทา + ตัวอักษรตามที่จัด)
  const toSvgString = useCallback(() => {
    const txt = texts.map((t) => `<text x="${t.x}" y="${t.y}" font-family="sans-serif" font-size="${t.size}" fill="#94a3b8">${escXml(t.label)}</text>`).join("\n  ");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="1" y="1" width="998" height="183" fill="none" stroke="#e2e8f0" stroke-width="2"/>
  <path d="${beltPath(len, bh, tail)}" fill="none" stroke="#94a3b8" stroke-width="2"/>
  <line x1="${divider}" y1="20" x2="${divider}" y2="165" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="5 5"/>
  ${txt}
</svg>`;
  }, [len, bh, tail, divider, texts]);

  const downloadSvg = useCallback(() => {
    const url = URL.createObjectURL(new Blob([toSvgString()], { type: "image/svg+xml" }));
    triggerDownload(url, "belt-template-1000x185.svg"); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [toSvgString]);

  const downloadPng = useCallback(() => {
    const svgUrl = URL.createObjectURL(new Blob([toSvgString()], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      c.getContext("2d")?.drawImage(img, 0, 0, W, H);
      c.toBlob((png) => { if (!png) return; const u = URL.createObjectURL(png); triggerDownload(u, "belt-template-1000x185.png"); setTimeout(() => URL.revokeObjectURL(u), 1000); }, "image/png");
      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  }, [toSvgString]);

  const slider = (label: string, value: number, min: number, max: number, set: (n: number) => void, unit = "") => (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-28 shrink-0 text-slate-600">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => set(Number(e.target.value))} className="flex-1" />
      <span className="w-12 text-right tabular-nums text-slate-500">{value}{unit}</span>
    </label>
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-xl font-bold text-slate-800">🧷 เทมเพลตรูปส่วนประกอบเข็มขัด (ปรับได้)</h1>
      <p className="mt-1 text-sm text-slate-500">เลื่อนสไลเดอร์ปรับรูปร่าง · <b>ลากตัวอักษร</b>ขยับตำแหน่งได้ · แล้วโหลด PNG/SVG ไปวาดทับ</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 rounded-xl border border-slate-200 bg-white p-4">
        {slider("ความยาว", len, 400, 960, setLen)}
        {slider("ความสูง", bh, 60, 150, setBh)}
        {slider("เส้นแบ่งโซน", divider, 200, 820, setDivider)}
        <label className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 text-slate-600">ทรงปลาย</span>
          <select value={tail} onChange={(e) => setTail(e.target.value as Tail)} className="flex-1 h-9 px-2 border border-slate-200 rounded-md bg-white">
            <option value="duckbill">ปากเป็ด</option>
            <option value="pointed">แหลม</option>
            <option value="straight">ตรง</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={downloadPng} className="h-9 rounded-lg bg-amber-600 px-5 text-sm font-medium text-white hover:bg-amber-700">⬇️ ดาวน์โหลด PNG</button>
        <button onClick={downloadSvg} className="h-9 rounded-lg border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50">⬇️ ดาวน์โหลด SVG</button>
        <button onClick={() => { setLen(790); setBh(95); setTail("duckbill"); setDivider(450); setTexts(DEFAULT_TEXTS); }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-500 hover:bg-slate-50">↺ รีเซ็ต</button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ touchAction: "none" }} onPointerMove={onMove} onPointerUp={onUp}>
          <rect x="1" y="1" width="998" height="183" fill="none" stroke="#e2e8f0" strokeWidth="2" />
          <path d={beltPath(len, bh, tail)} fill="none" stroke="#94a3b8" strokeWidth="2" />
          <line x1={divider} y1="20" x2={divider} y2="165" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="5 5" />
          {texts.map((t) => (
            <text key={t.id} x={t.x} y={t.y} fontFamily="sans-serif" fontSize={t.size} fill="#64748b"
              style={{ cursor: "move", userSelect: "none" }} onPointerDown={onDown(t.id)}>{t.label}</text>
          ))}
        </svg>
      </div>

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold">วิธีใช้</div>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>ปรับ ความยาว/สูง/ทรงปลาย ให้ตรงรุ่น · ลากตัวอักษรไปตำแหน่งที่ต้องการ</li>
          <li>โหลด PNG → วาดรูปจริง (เส้นดำ) ทับเส้นไกด์ · <b>พื้นหลังโปร่งใส ห้ามกล่องทึบ</b></li>
          <li>วาดเฉพาะชิ้นนั้น (ปลายหาง=เส้นขอบ · รู=ลายซ้าย · โลโก้=ขวา) · ลบเส้นไกด์ก่อน export</li>
          <li><b>ทุกรูปใช้ค่าปรับเดียวกัน</b> (ความยาวเท่ากัน) → ซ้อนในใบงานพอดี</li>
        </ol>
      </div>
    </div>
  );
}
