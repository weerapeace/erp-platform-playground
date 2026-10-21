"use client";

/**
 * แถบเตือน "มีรายการที่ยังไม่ระบุบริษัท" — ใช้ร่วมกันที่ /cashflow และ /cashflow/board
 * ดูทีละบริษัทแล้วรายการพวกนี้จะไม่ถูกนับ → ต้องบอกให้รู้เสมอ ไม่งั้นตัวเลขของบริษัทดูดีเกินจริง
 */
import { CASHFLOW_SOURCE, THB, type unassignedBySource } from "@/lib/cashflow";

/** บอกว่ารายการแต่ละแบบไปตั้งบริษัทได้ที่ไหน (ใบซื้อ/บิลจีนยังไม่มีช่อง — รอเฟส 2) */
export const UNASSIGNED_HOW =
  "ใบซื้อและบิลจีนยังไม่มีช่องบริษัท (กำลังจะเพิ่ม) · เงินกู้/OD/บัตร ตั้งบริษัทได้ที่หน้าสัญญา · เงินในบัญชีและรายการประจำ ตั้งได้ที่ ⚙️ ตั้งค่า";

export function UnassignedNotice({ rows, viewingNone, onShowNone, className = "" }: {
  rows: ReturnType<typeof unassignedBySource>;
  /** กำลังดูกอง "ยังไม่ระบุ" อยู่ — เปลี่ยนข้อความเป็นคำอธิบายแทนคำเตือน */
  viewingNone: boolean;
  onShowNone: () => void;
  className?: string;
}) {
  const count = rows.reduce((s, r) => s + r.count, 0);
  if (!count) return null;
  const outAmt = rows.reduce((s, r) => s + r.out, 0);
  const inAmt = rows.reduce((s, r) => s + r.in, 0);
  return (
    <div className={`bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-900 ${className}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p>
          {viewingNone
            ? <>รายการ <b>{count}</b> ใบนี้ยังไม่รู้ว่าเป็นของบริษัทไหน — ตอนดูทีละบริษัทจะไม่ถูกนับ</>
            : <>⚠️ มี <b>{count}</b> รายการที่ยังไม่ระบุบริษัท ไม่ได้นับในมุมมองนี้</>}
          {outAmt > 0 && <> · เงินออก <b className="tabular-nums">{THB(outAmt)}</b></>}
          {inAmt > 0 && <> · เงินเข้า <b className="tabular-nums">{THB(inAmt)}</b></>}
        </p>
        {!viewingNone && (
          <button onClick={onShowNone} className="text-xs underline text-amber-800 hover:text-amber-950 whitespace-nowrap">
            ดูรายการที่ยังไม่ระบุ
          </button>
        )}
      </div>
      <p className="text-xs text-amber-800/80 mt-1">
        {rows.map((r) => `${CASHFLOW_SOURCE[r.source].icon} ${CASHFLOW_SOURCE[r.source].label} ${r.count}`).join(" · ")}
        {" — "}{UNASSIGNED_HOW}
      </p>
    </div>
  );
}
