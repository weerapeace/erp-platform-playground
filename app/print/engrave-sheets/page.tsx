"use client";

// ============================================================
// 🖨 ใบสลักชื่อ — /print/engrave-sheets?ids=<id,id,…>
// 1 ออเดอร์ = 1 แถบ: หัว (สลักชื่อ · รูปแบบ · ตำแหน่ง · เลขออเดอร์) + ช่องตัวอักษร 10 ช่อง (เกิน 10 ตัว = แถวที่ 2)
// หน้าตาเหมือนแอปเก่า order-instruction-manager · นับจำนวนครั้งที่พิมพ์ (POST action print)
// ============================================================

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { usePrintLog } from "@/components/report/use-print-log";
import { LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { DEFAULT_ENGRAVE_FONT, ENGRAVE_POSITION_EN, ENGRAVE_TYPE_EN, invalidEngraveChars, splitEngraveChars, type EngravePosition, type EngraveType } from "@/lib/order-ops";

type Row = { id: string; order_no: string; engrave_text: string | null; engrave_type: string | null; engrave_position: string | null; engrave_font: string | null };

const TYPE_COLOR: Record<string, string> = { "พิมพ์จม": "#2563eb", "ฟอยเงิน": "#6b7280", "ฟอยทอง": "#ca8a04" };
/** เส้นปะสูงจากเส้นฐานตัวอักษร (px) · ตัวพิมพ์เล็กขนาด LOWER_PX ทั้งตัวอยู่ใต้เส้นนี้ ตัวใหญ่ 52px ทะลุขึ้นไป */
const GUIDE_PX = 20;
const LOWER_PX = 30;

export default function EngraveSheetsPage() {
  return <Suspense fallback={<LoadingState />}><Sheets /></Suspense>;
}

function Sheets() {
  const sp = useSearchParams();
  const ids = (sp.get("ids") ?? "").split(",").filter(Boolean);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [specials, setSpecials] = useState<string[]>([]);

  useEffect(() => {
    if (!ids.length) { setError("ยังไม่ได้เลือกรายการ"); return; }
    apiFetch("/api/order-ops?t=options").then((r) => r.json()).then((j: { options?: { kind: string; label: string; is_active: boolean }[] }) =>
      setSpecials((j.options ?? []).filter((o) => o.kind === "engrave_special" && o.is_active).map((o) => o.label))).catch(() => {});
    apiFetch(`/api/order-ops?t=instructions&ids=${ids.join(",")}&page_size=200`)
      .then((r) => r.json())
      .then((j: { rows?: Row[]; error?: string }) => {
        if (j.error) throw new Error(j.error);
        const map = new Map((j.rows ?? []).map((r) => [r.id, r]));
        setRows(ids.map((id) => map.get(id)).filter((r): r is Row => !!r && !!r.engrave_text));
      })
      .catch((e: Error) => setError(e.message || "โหลดไม่สำเร็จ"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  // ประวัติพิมพ์กลาง (print_logs · doc_type engrave_sheet) — ป้าย "พิมพ์แล้ว" ในหน้าคำสั่งพิเศษ · จับทั้งปุ่มพิมพ์และ Ctrl+P
  usePrintLog("engrave_sheet", (rows ?? []).map((r) => ({ doc_id: r.id, doc_no: r.order_no })));
  const print = () => {
    void apiFetch("/api/order-ops", { method: "POST", body: JSON.stringify({ action: "print", ids: (rows ?? []).map((r) => r.id) }) }).catch(() => {});
    window.print();
  };

  if (error) return <div className="p-6 text-sm text-rose-600">{error}</div>;
  if (!rows) return <LoadingState label="กำลังเตรียมใบสลักชื่อ…" />;

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{"@page{size:auto;margin:6mm} @media print{.no-print{display:none!important}.sheet{break-inside:avoid}}"}</style>
      <div className="no-print mx-auto mb-3 flex max-w-[270mm] items-center gap-3">
        <h1 className="flex-1 text-lg font-bold text-slate-800">ใบสลักชื่อ {rows.length} ใบ</h1>
        <button onClick={print} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"><Icon name="printer" /> พิมพ์</button>
      </div>
      <div className="mx-auto max-w-[270mm] bg-white p-3 print:max-w-none print:p-0">
        {rows.map((r, idx) => <Sheet key={r.id} r={r} first={idx === 0} specials={specials} />)}
        {!rows.length && <p className="p-6 text-center text-sm text-slate-500">รายการที่เลือกไม่มีชื่อสลัก</p>}
      </div>
    </div>
  );
}

function Sheet({ r, first, specials }: { r: Row; first: boolean; specials: string[] }) {
  const chars = splitEngraveChars(r.engrave_text ?? "");
  const font = r.engrave_font || DEFAULT_ENGRAVE_FONT;
  const bad = invalidEngraveChars(r.engrave_text ?? "", specials);
  const type = (r.engrave_type ?? "พิมพ์จม") as EngraveType;
  const pos = (r.engrave_position ?? "มุมขวา") as EngravePosition;
  const rowsOfChars = chars.length > 10 ? [chars.slice(0, 10), chars.slice(10, 20)] : [chars];
  const cell = "flex items-center justify-center border-r-[1.5px] border-black last:border-r-0";
  return (
    <div className="sheet border-[2.5px] border-black font-[Arial,sans-serif]" style={first ? undefined : { borderTop: "none" }}>
      <div className="flex items-center gap-4 border-b-[1.5px] border-black px-3 py-1.5">
        <span className="text-lg font-extrabold">สลักชื่อ</span>
        <span className="text-lg font-extrabold leading-tight" style={{ color: TYPE_COLOR[type] ?? "#111" }}>{type}<small className="block text-[10px] uppercase tracking-wide">{ENGRAVE_TYPE_EN[type] ?? ""}</small></span>
        <span className="rounded-lg bg-indigo-800 px-3 py-0.5 text-base font-black leading-tight text-white [print-color-adjust:exact]">{pos}<small className="block text-[10px] uppercase tracking-wide">{ENGRAVE_POSITION_EN[pos] ?? ""}</small></span>
        <span className="text-xs font-bold text-slate-600">ฟอนต์: {font}</span>
        <span className="ml-auto font-mono text-sm font-bold text-slate-700">{r.order_no}</span>
      </div>
      {bad.length > 0 && <div className="border-b-[1.5px] border-black bg-rose-100 px-3 py-1 text-sm font-bold text-rose-700 [print-color-adjust:exact]">⚠ มีตัวที่เครื่องสลักทำไม่ได้: {bad.join(" ")} — เช็กกับคนรับออเดอร์ก่อนสลัก</div>}
      {rowsOfChars.map((line, li) => (
        <div key={li}>
          <div className="grid border-b-[1.5px] border-black" style={{ gridTemplateColumns: "200px repeat(10, 1fr)" }}>
            <div className={`${cell} bg-slate-50 py-1 text-xs font-bold`}>{li === 0 ? "ชื่อ" : "ต่อ (11-20)"}</div>
            {Array.from({ length: 10 }, (_, i) => <div key={i} className={`${cell} bg-slate-50 text-[13px] font-extrabold`}>{li * 10 + i + 1}</div>)}
          </div>
          <div className="grid border-b-[1.5px] border-black last:border-b-0" style={{ gridTemplateColumns: "200px repeat(10, 1fr)" }}>
            <div className={`${cell} min-h-[60px] justify-center break-all px-2 text-[22px] font-bold`} style={{ fontFamily: `"${font}", serif` }}>{li === 0 ? r.engrave_text : "-"}</div>
            {Array.from({ length: 10 }, (_, i) => {
              const ch = line[i] ?? "";
              const lower = ch >= "a" && ch <= "z";
              // ทุกช่องใช้ "เส้นฐาน" เดียวกัน (ชั้นนอกขนาด/ระยะบรรทัดเท่ากันทุกช่อง) · เส้นปะสูงจากเส้นฐาน GUIDE_PX
              // ตัวพิมพ์เล็กย่อให้ทั้งตัว (รวมหาง l/i) อยู่ใต้เส้นปะ · ช่องตัวใหญ่/ตัวเลข/สัญลักษณ์ไม่มีเส้นปะ (ดูง่ายกว่า) — เจ้าของขอ 2026-11-25
              const strut = { fontFamily: `"${font}", serif`, fontSize: 52, lineHeight: "66px" } as const;
              const guide = lower || !ch;
              return (
                <div key={i} className={`${cell} relative min-h-[66px] items-end`}>
                  <div className="relative w-full px-1 font-bold" style={strut}>
                    <span className={`inline-block w-full border-t-2 border-dashed align-baseline ${guide ? "border-slate-500" : "border-transparent"}`} style={{ height: GUIDE_PX }} />
                    <div className="absolute inset-0 px-1 text-center" style={strut}>
                      <span className="align-baseline" style={{ fontSize: lower ? LOWER_PX : 52 }}>{ch}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
