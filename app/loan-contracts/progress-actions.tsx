"use client";
/**
 * แผงปุ่มของหมวด "ความคืบหน้าการผ่อน" ในฟอร์มสัญญาเงินกู้
 * ตอบคำถาม "ตัวเลขพวกนี้ต้องไปลงที่ไหน" — ลงได้จากตรงนี้เลย ไม่ต้องออกจากหน้า:
 *   ① สร้างตารางผ่อน (ได้จำนวนงวด + วันครบกำหนด)  ② บันทึกการจ่าย (ระบบตัดยอดเข้างวดให้เอง)
 * ใช้ป๊อปกลางตัวเดียวกับหน้า /loan-schedules และ /loan-payments (ไม่สร้างฟอร์มซ้ำ)
 */
import { useState } from "react";
import { InfoHint } from "@/components/info-hint";
import { GenerateScheduleModal } from "@/app/loan-schedules/generate-modal";
import { RecordPaymentModal } from "@/app/loan-payments/record-modal";
import { InstallmentsModal } from "@/app/loan-contracts/installments-modal";

const btn = "h-7 px-2.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export function LoanProgressActions({
  recordId, totalInstallments, onDone,
}: {
  recordId: string | null;
  totalInstallments: number;
  onDone: () => Promise<void> | void;
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [instOpen, setInstOpen] = useState(false);

  // ยังไม่ได้บันทึกสัญญา (สร้างใหม่) → ยังผูกการจ่ายไม่ได้
  if (!recordId) {
    return <span className="text-[11px] text-slate-400">บันทึกสัญญาก่อน แล้วค่อยลงตารางผ่อน / การจ่าย</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <InfoHint side="right" label="ตัวเลขหมวดนี้มาจากไหน">
        <b className="text-slate-700">ช่องในหมวดนี้กรอกเองไม่ได้ — ระบบคิดให้จาก 2 ที่:</b>
        <br />① <b>ตารางผ่อน</b> — บอกว่าทั้งหมดกี่งวด งวดละเท่าไหร่ ครบกำหนดวันไหน
        <br />② <b>ใบบันทึกการจ่าย</b> — ทุกครั้งที่จ่ายเงินให้ธนาคาร บันทึกที่นี่ ระบบจะตัดยอดเข้างวดเก่าสุดก่อน (ดอกเบี้ยก่อน แล้วเงินต้น) แล้วอัปเดตตัวเลขให้เอง
        <br /><br />แก้ยอดหรือลบใบจ่ายภายหลังได้ ระบบคำนวณใหม่จากต้นทางเสมอ
      </InfoHint>
      <button type="button" onClick={() => setGenOpen(true)}
        className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50`}
        title={totalInstallments > 0 ? "สร้างตารางผ่อนเวอร์ชันใหม่ (ของเดิมเก็บเป็นประวัติ)" : "ยังไม่มีตารางผ่อน — สร้างก่อน"}>
        🧾 {totalInstallments > 0 ? "แก้ตารางผ่อน" : "สร้างตารางผ่อน"}
      </button>
      <button type="button" onClick={() => setInstOpen(true)}
        className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50`}
        title="ดูงวดผ่อนทั้งหมดของสัญญานี้ (เปิดเป็นป๊อปอัป) · แก้ยอดรายงวดได้">
        📄 ดูงวดทั้งหมด
      </button>
      <button type="button" onClick={() => setPayOpen(true)}
        className={`${btn} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>
        💵 บันทึกการจ่าย
      </button>

      <GenerateScheduleModal
        open={genOpen} contractId={recordId}
        onClose={() => setGenOpen(false)}
        onCreated={async () => { setGenOpen(false); await onDone(); }}
      />
      <RecordPaymentModal
        open={payOpen} contractId={recordId}
        onClose={() => setPayOpen(false)}
        onCreated={async () => { setPayOpen(false); await onDone(); }}
      />
      <InstallmentsModal
        open={instOpen} contractId={recordId}
        onClose={() => setInstOpen(false)}
        onSaved={onDone}
      />
    </span>
  );
}
