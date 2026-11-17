"use client";

/**
 * 🖨 การ์ดบาร์โค้ดคำสั่งสถานีแพ็ค — /print/packing-cards
 * พิมพ์ A4 แล้วตัด/เคลือบติดโต๊ะ: แพ็คเสร็จ · มีปัญหา · อัดใหม่ · ข้าม + การ์ดกล่องทุกขนาด (ยิงการ์ดกล่อง = ตั้งกล่องที่ใช้จริง)
 * รหัสขึ้นต้น *PK- (lib/packing PACK_CMD_PREFIX) · พิมพ์เป็น Code128 เท่านั้น (Code39 ใช้ * เป็นตัวคั่น อ่านเพี้ยน)
 */
import { LoadingState } from "@/components/state-views";
import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { PACK_COMMANDS, boxCommandCode, boxSizeText, type BoxSize } from "@/lib/packing";

function Barcode({ value, height = 70 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try { JsBarcode(ref.current, value, { format: "CODE128", displayValue: false, height, width: 2, margin: 0 }); } catch { /* รหัสแปลก — เว้นว่าง */ }
  }, [value, height]);
  return <svg ref={ref} className="mx-auto block max-w-full" />;
}

const CMD_TONE: Record<string, string> = {
  DONE: "border-emerald-600 text-emerald-700", PROBLEM: "border-red-600 text-red-700", REDO: "border-sky-600 text-sky-700", SKIP: "border-slate-500 text-slate-700",
};

export default function PackingCardsPrintPage() {
  const [boxes, setBoxes] = useState<BoxSize[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    apiFetch("/api/packing?boxes=1").then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "โหลดรายการกล่องไม่สำเร็จ (ต้องเข้าสู่ระบบ)"); setBoxes([]); return; }
      setBoxes(j.boxes ?? []);
    }).catch(() => { setErr("เน็ตหลุด — โหลดรายการกล่องไม่ได้"); setBoxes([]); });
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{`@page { size: A4; margin: 10mm; } @media print { .no-print { display: none !important; } .card { break-inside: avoid; } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[190mm] flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">การ์ดบาร์โค้ดคำสั่ง — สถานีแพ็ค</h1>
          <p className="text-sm text-slate-500">พิมพ์แล้วตัด เคลือบ ติดโต๊ะแพ็ค · ยิงด้วยเครื่องยิงได้เลย ไม่ต้องจับเมาส์</p>
        </div>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"><Icon name="print" /> พิมพ์</button>
      </div>

      <div className="mx-auto max-w-[190mm] bg-white p-4 print:max-w-none print:p-0">
        <div className="grid grid-cols-2 gap-4">
          {PACK_COMMANDS.map((c) => {
            const key = c.code.replace("*PK-", "");
            return (
              <div key={c.code} className={`card rounded-xl border-4 p-4 text-center ${CMD_TONE[key] ?? "border-slate-400"}`}>
                <p className="text-3xl font-black">{c.label}</p>
                <p className="mb-3 text-sm text-slate-600">{c.hint}</p>
                <Barcode value={c.code} height={80} />
                <p className="mt-1 font-mono text-xs text-slate-500">{c.code}</p>
              </div>
            );
          })}
        </div>

        <h2 className="mt-6 mb-2 text-base font-bold text-slate-800">การ์ดกล่อง — ยิงเพื่อบอกว่าใช้กล่องไหนจริง</h2>
        {err && <p className="no-print mb-2 text-sm text-red-600">{err}</p>}
        {boxes === null ? <LoadingState label="กำลังโหลดรายการกล่อง…" boxClassName="text-sm text-slate-400" /> : (
          <div className="grid grid-cols-3 gap-3">
            {boxes.map((b) => (
              <div key={b.name} className="card rounded-lg border-2 border-slate-300 p-2 text-center">
                <p className="text-xl font-bold text-slate-900">{b.name}</p>
                <p className="mb-1 text-[11px] text-slate-500">{boxSizeText(b) || " "}</p>
                <Barcode value={boxCommandCode(b.name)} height={45} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
