"use client";

/**
 * ✂ PatternPrintView — หน้าพิมพ์/ส่งออกแพทเทิร์น (ของกลาง · ย้ายมาจาก /print/design-sheet/[id]/pattern 2026-11-10 เพื่อใช้ร่วมกับแอปสตูดิโอแพทเทิร์น)
 *   ภาพรวม: รายการชิ้น (P1, P2, …) + ภาพชิ้นทั้งหมด + วางบนผ้า (ตัววางผ้าตัวเดียวกับเครื่องคิดเลขผ้า)
 *   ขนาดจริง (A4): หน้าแรก = วิธีต่อ + กรอบทดสอบ 5 ซม. + แผนผังหน้า · หน้าถัดไป = ชิ้นขนาดจริง 1:1 แบ่งหน้า A4 ทับกัน 1 ซม.
 *   ดาวน์โหลด DXF (เครื่องตัด · หน่วยมม.) / SVG (Illustrator)
 *
 *   หน้าที่เรียกเตรียม "บรรทัด" (PatternLineInput — บรรทัดตีราคา หรือ ชิ้นของแพทเทิร์น) + หัวกระดาษ + ชื่อไฟล์ แล้วส่งเข้ามา
 *   <PatternPrintView lines={lines} eyebrow="แพทเทิร์นจากตีราคา · ทั่วไป" title="DS-001 Tote" footCode="DS-001 · ทั่วไป" fileName={…} emptyText={…} />
 * ของกลาง: lib/pattern-sheet · PatternPiecesSvg · PrintToolbar · packFabric + FabricLayoutPreview · บันทึกประวัติพิมพ์ = หน้าที่เรียกใช้ usePrintLog เอง
 */
import { useMemo, useState, type ReactNode } from "react";
import { PrintToolbar } from "@/components/report";
import {
  A4_PRINTABLE, buildPatternDxf, buildPatternSvg, pagesWithPieces, patternPieces, patternSheetWidth, shelfLayout, tilePages, type PatternLineInput, type PatternPiece,
} from "@/lib/pattern-sheet";
import { PatternPiecesSvg, groupColors } from "@/components/pattern-sheet";
import { packFabric, YARD_CM } from "@/lib/fabric-calc";
import { FabricLayoutPreview } from "@/components/design-sheet-detail/fabric-layout-preview";

const OVERLAP = 1;                                   // ซม. ที่หน้า A4 ทับกัน (ไว้ต่อกระดาษ)
const OVERVIEW_W = 160;                              // ซม. ความกว้างแผ่นภาพรวม / ไฟล์ส่งเครื่องตัด
const TILE_H = 26.5;                                 // ซม. ส่วนที่วาดชิ้นต่อหน้า (เหลือที่หัวหน้า)

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`h-7 rounded-md px-2.5 text-xs transition ${value === o.v ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{o.label}</button>
      ))}
    </div>
  );
}

const download = (name: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function PatternPrintView({ lines, eyebrow, title, footCode, fileName, emptyText, controls }: {
  /** บรรทัดที่จะวาดเป็นชิ้น (กรองแท็บ/เรียงมาแล้ว) */
  lines: PatternLineInput[];
  /** บรรทัดเล็กเหนือชื่อ เช่น "แพทเทิร์นจากตีราคา · ทั่วไป" */
  eyebrow: string;
  /** ชื่อใหญ่ เช่น "DS-2026-0064 กระเป๋า Tote" */
  title: string;
  /** รหัสสั้นบนหัวแผ่น A4 แต่ละหน้า เช่น "DS-2026-0064 · ทั่วไป" */
  footCode: string;
  fileName: string;
  /** ข้อความเมื่อไม่มีชิ้นให้วาด */
  emptyText: ReactNode;
  /** ปุ่มเพิ่มทางซ้ายของแผงตั้งค่า (เช่น ปุ่มเลือกแท็บตีราคา) */
  controls?: ReactNode;
}) {
  const [mode, setMode] = useState<"overview" | "tiles">("overview");
  const [mono, setMono] = useState(false);
  const [orderQty, setOrderQty] = useState(1);
  const [faceW, setFaceW] = useState<Record<string, number>>({});

  const pieces = useMemo(() => patternPieces(lines), [lines]);
  const skipped = lines.length - pieces.length;   // บรรทัดที่ไม่มีกว้าง×ยาว (อะไหล่/ชิ้นสำเร็จ)
  const sheetW = useMemo(() => patternSheetWidth(pieces, A4_PRINTABLE.w, OVERLAP, 2), [pieces]);
  const layout = useMemo(() => shelfLayout(pieces, sheetW, 2), [pieces, sheetW]);   // แผ่นสำหรับพิมพ์ A4 (กว้างลงตัวกับหน้า)
  // ภาพรวม + ไฟล์ DXF/SVG = วางบนแผ่นกว้าง ~160 ซม. (ขนาดโต๊ะตัด/หน้าผ้าทั่วไป) ชิ้นเรียงข้างกัน ดูง่ายกว่า
  const overviewW = Math.max(OVERVIEW_W, pieces.reduce((m, p) => Math.max(m, p.w), 0));
  const overview = useMemo(() => shelfLayout(pieces, overviewW, 2), [pieces, overviewW]);
  const allPages = useMemo(() => tilePages(layout.width, layout.height, A4_PRINTABLE.w, TILE_H, OVERLAP), [layout]);
  const pages = useMemo(() => pagesWithPieces(allPages, layout), [allPages, layout]);   // หน้าว่างไม่พิมพ์
  const colors = groupColors(layout);
  const cols = allPages.reduce((m, p) => Math.max(m, p.col), 0), rows = allPages.reduce((m, p) => Math.max(m, p.row), 0);

  // วางบนผ้า — แยกตามชื่อวัสดุ (ตัววางผ้าตัวเดียวกับเครื่องคิดเลขผ้า lib/fabric-calc)
  const fabric = useMemo(() => {
    const byMat = new Map<string, PatternPiece[]>();
    for (const p of pieces) { const k = p.material; byMat.set(k, [...(byMat.get(k) ?? []), p]); }
    return [...byMat.entries()].map(([name, ps]) => {
      const fw = faceW[name] ?? ps.find((p) => p.faceWidth)?.faceWidth ?? 150;
      const result = packFabric({
        pieces: ps.map((p) => ({ key: p.id, label: `${p.id} ${p.w}×${p.h}`, width_cm: p.w, length_cm: p.h, qty: p.count * Math.max(1, orderQty) })),
        faceWidthCm: fw, allowRotate: true, wastePercent: 0, gapCm: 0.5,
      });
      return { name, pieces: ps, fw, result };
    });
  }, [pieces, faceW, orderQty]);

  const head = (
    <div className="flex items-end justify-between gap-3 border-b border-slate-300 pb-2">
      <div className="min-w-0">
        <div className="text-[11px] text-slate-500">{eyebrow}</div>
        <div className="truncate text-lg font-semibold text-slate-900">{title}</div>
      </div>
      <div className="shrink-0 text-right text-[11px] text-slate-500">{pieces.length} แบบ · ตัดรวม {pieces.reduce((s, p) => s + p.count, 0)} ชิ้น / ใบ<br />{new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</div>
    </div>
  );
  const pieceTable = (
    <table className="w-full border-collapse text-[12px]">
      <thead><tr className="border-b border-slate-300 text-left text-[11px] text-slate-500">
        <th className="py-1 pr-2">ชิ้น</th><th className="py-1 pr-2">วัสดุ</th><th className="py-1 pr-2">ชนิด</th><th className="py-1 pr-2 text-right">กว้าง × ยาว (ซม.)</th><th className="py-1 pr-2 text-right">ตัด / ใบ</th><th className="py-1">หมายเหตุ</th>
      </tr></thead>
      <tbody>{pieces.map((p) => {
        const c = colors.get(p.group);
        return (
          <tr key={p.id} className="border-b border-slate-100">
            <td className="py-1 pr-2 font-semibold"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: c?.fill, border: `1px solid ${c?.stroke}` }} />{p.id}</td>
            <td className="py-1 pr-2">{p.name}</td><td className="py-1 pr-2 text-slate-500">{p.group}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{p.w} × {p.h}</td><td className="py-1 pr-2 text-right tabular-nums">{p.count}</td>
            <td className="py-1 text-slate-500">{p.note ?? ""}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{`@page { size: A4 portrait; margin: 10mm; } @media print { .pattern-page { break-after: page; page-break-after: always; } .pattern-page:last-child { break-after: auto; page-break-after: auto; } }`}</style>
      <PrintToolbar fileName={fileName} />
      {/* แผงตั้งค่า (ไม่พิมพ์) */}
      <div className="no-print mx-auto flex max-w-[860px] flex-wrap items-center gap-2 px-4 pt-4">
        {controls}
        <Seg value={mode} onChange={setMode} options={[{ v: "overview", label: "ภาพรวม + วางบนผ้า" }, { v: "tiles", label: "พิมพ์ขนาดจริง (A4)" }]} />
        {mode === "tiles" && (
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} className="h-3.5 w-3.5" /> ขาวดำ (ประหยัดหมึก)</label>
        )}
        <div className="ml-auto flex gap-1.5">
          <button type="button" disabled={!pieces.length} onClick={() => download(`${fileName}.dxf`, buildPatternDxf(overview), "application/dxf")}
            title="ไฟล์สำหรับเครื่องตัดเลเซอร์ / โปรแกรม CAD (หน่วยมิลลิเมตร · ป้ายชื่อเป็นรหัสชิ้นภาษาอังกฤษ)"
            className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">ดาวน์โหลด DXF</button>
          <button type="button" disabled={!pieces.length} onClick={() => download(`${fileName}.svg`, buildPatternSvg(overview), "image/svg+xml")}
            title="ไฟล์ภาพเวกเตอร์ขนาดจริง (เปิดใน Illustrator ได้)"
            className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">ดาวน์โหลด SVG</button>
        </div>
      </div>

      {pieces.length === 0 ? (
        <div className="mx-auto mt-6 max-w-[860px] rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{emptyText}</div>
      ) : mode === "overview" ? (
        <div className="mx-auto my-4 max-w-[860px] space-y-4 bg-white p-6 shadow-sm print:my-0 print:max-w-none print:p-0 print:shadow-none">
          {head}
          {pieceTable}
          {skipped > 0 && <p className="text-[11px] text-slate-500">ไม่ได้วาด {skipped} บรรทัด (ไม่ได้คิดแบบกว้าง × ยาว เช่น อะไหล่ / สาย-เทปคิดตามยาว / ชิ้นสำเร็จ)</p>}
          <div>
            <div className="mb-1 text-[11px] text-slate-500">ภาพชิ้นทั้งหมด (ย่อให้พอดีหน้า · วางบนแผ่นกว้าง {overview.width} × {overview.height} ซม. เหมือนในไฟล์ DXF/SVG)</div>
            <div className="rounded-lg border border-slate-200 p-2"><PatternPiecesSvg layout={overview} style={{ maxHeight: 520 }} /></div>
          </div>
          <div className="break-inside-avoid space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">วางบนผ้า</span>
              <label className="no-print inline-flex items-center gap-1 text-xs text-slate-600">ผลิต
                <input type="number" min={1} value={orderQty} onChange={(e) => setOrderQty(Math.max(1, Math.round(Number(e.target.value)) || 1))} className="h-7 w-20 rounded-md border border-slate-200 px-2 text-right text-xs" /> ใบ
              </label>
              <span className="text-[11px] text-slate-500 print:inline">หมุนชิ้นได้ · เว้นรอยตัด 0.5 ซม. · ยังไม่รวมเผื่อเสีย</span>
            </div>
            {fabric.map((f) => (
              <div key={f.name} className="break-inside-avoid rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                  <b className="text-slate-800">{f.name}</b>
                  <span className="text-slate-500">{f.pieces.map((p) => p.id).join(", ")}</span>
                  <label className="no-print inline-flex items-center gap-1 text-slate-600">หน้าผ้า
                    <input type="number" min={10} value={f.fw} onChange={(e) => setFaceW((m) => ({ ...m, [f.name]: Math.max(10, Number(e.target.value) || 150) }))} className="h-7 w-16 rounded-md border border-slate-200 px-1.5 text-right text-xs" /> ซม.
                  </label>
                  {f.result.ok ? (
                    <span className="ml-auto tabular-nums text-emerald-700">ใช้ผ้า {Math.round(f.result.usedLengthCm * 10) / 10} ซม. ≈ <b>{(f.result.usedLengthCm / YARD_CM).toFixed(2)} หลา</b> · คุ้ม {Math.round(f.result.packEfficiencyPercent)}%</span>
                  ) : <span className="ml-auto text-rose-600">{f.result.error ?? "วางไม่ได้"}</span>}
                </div>
                {f.result.ok && <FabricLayoutPreview result={f.result} faceWidthCm={f.fw} mode="roll" />}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mx-auto my-4 w-fit space-y-4 print:my-0 print:space-y-0">
          {/* หน้าแรก: วิธีใช้ + กรอบทดสอบ + แผนผังหน้า */}
          <section className="pattern-page box-border space-y-3 bg-white p-[6mm] shadow-sm print:p-0 print:shadow-none" style={{ width: "190mm", minHeight: "277mm" }}>
            {head}
            <div className="flex gap-4">
              <div className="flex-1 space-y-1 text-[12px] text-slate-700">
                <div className="font-semibold">วิธีพิมพ์และต่อแพทเทิร์น</div>
                <ol className="list-decimal space-y-0.5 pl-4">
                  <li>ตั้งพิมพ์กระดาษ A4 แนวตั้ง ขนาด <b>100% (ไม่ย่อ/ไม่พอดีหน้า)</b></li>
                  <li>วัดกรอบทดสอบด้านขวา ต้องได้ <b>5 × 5 ซม.</b> พอดี — ถ้าไม่ได้ ให้แก้การตั้งค่าพิมพ์ก่อน</li>
                  <li>ต่อกระดาษตามแผนผังด้านล่าง (แถว-คอลัมน์) ขอบแต่ละหน้าทับกัน {OVERLAP} ซม.</li>
                  <li>ตัดตามเส้นประ · ชิ้นไหนต้องตัดกี่ชิ้นดูที่ป้าย “ตัด ×”</li>
                </ol>
              </div>
              <div className="shrink-0 text-center text-[10px] text-slate-500">
                <div className="border-2 border-slate-900" style={{ width: "50mm", height: "50mm" }} />กรอบทดสอบ 5 × 5 ซม.
              </div>
            </div>
            {pieceTable}
            <div>
              <div className="mb-1 text-[11px] text-slate-500">แผนผังหน้า (พิมพ์ {pages.length} หน้า{allPages.length > pages.length ? ` · ข้ามหน้าว่าง ${allPages.length - pages.length} หน้า` : ""} · {rows} แถว × {cols} คอลัมน์)</div>
              <div className="relative rounded border border-slate-300" style={{ width: "100%", aspectRatio: `${layout.width} / ${layout.height}`, maxHeight: "90mm" }}>
                <PatternPiecesSvg layout={layout} mono={mono} style={{ position: "absolute", inset: 0, height: "100%" }} />
                <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" height="100%" className="absolute inset-0" preserveAspectRatio="xMinYMin meet">
                  {pages.map((p) => (
                    <g key={`m${p.row}-${p.col}`}>
                      <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="none" stroke="#0f172a" strokeWidth={0.15} strokeDasharray="0.8 0.5" />
                      <text x={p.x + 0.8} y={p.y + 2} fontSize={1.8} fill="#0f172a" fontWeight={700}>{p.row}-{p.col}</text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>
          </section>
          {pages.map((p) => (
            <section key={`${p.row}-${p.col}`} className="pattern-page box-border bg-white shadow-sm print:shadow-none" style={{ width: "190mm", height: "277mm" }}>
              <div className="flex items-center justify-between px-[1mm] text-[9pt] text-slate-600" style={{ height: "7mm" }}>
                <b>แผ่น {p.row}-{p.col}</b><span>{footCode} · แถว {p.row}/{rows} คอลัมน์ {p.col}/{cols} · ขนาดจริง 1:1</span>
              </div>
              <div className="border border-slate-300" style={{ width: "190mm", height: `${TILE_H * 10}mm`, boxSizing: "border-box" }}>
                <PatternPiecesSvg layout={layout} view={{ x: p.x, y: p.y, w: A4_PRINTABLE.w, h: TILE_H }} printMm mono={mono} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
