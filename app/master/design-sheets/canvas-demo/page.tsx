"use client";

/**
 * เดโม่ Canvas รายละเอียดงาน (Excalidraw) — ให้เจ้าของลองเล่นก่อนตัดสินใจเอาเข้าใบงานจริง
 * ยังไม่ผูกกับใบงาน / ยังไม่บันทึก — วาดเล่นได้เต็มที่ รีเฟรชแล้วหาย
 * ถ้าเคาะว่าเอา: จะเพิ่มช่อง canvas ลงใบงาน + เก็บรูปที่วางเข้า R2 + ถ่ายภาพ canvas ใส่ใบพิมพ์
 */
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-slate-400">กำลังโหลดกระดาน...</div>,
});

export default function DesignCanvasDemoPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">🧪 ทดลอง Canvas รายละเอียดงาน</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            กระดานแบบ miro สำหรับช่อง &quot;รายละเอียดงาน&quot; — <b>นี่คือเดโม่ ยังไม่บันทึก</b> ลองเล่นแล้วบอกว่าเอา/ไม่เอา/อยากปรับอะไร
          </p>
        </div>
        <a href="/master/design-sheets" className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">← กลับ Design Sheets</a>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-slate-500">
        <span>🖼 <b>วางรูป:</b> copy รูปจากไหนก็ได้แล้วกด Ctrl+V หรือลากไฟล์รูปมาวาง</span>
        <span>⬛ กล่อง = กด R</span>
        <span>➡ ลูกศร = กด A</span>
        <span>🔤 ข้อความ = กด T</span>
        <span>✏ วาดเส้นอิสระ = กด P</span>
        <span>📐 ตาราง = วาดกล่องเรียงต่อกัน (ไม่มีตารางสำเร็จรูป)</span>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white" style={{ height: "74vh" }}>
        <Excalidraw langCode="th-TH" />
      </div>

      <p className="text-xs text-slate-400 mt-2">
        ถ้าตกลงใช้: ผมจะฝังกระดานนี้เป็นแท็บในใบงานแต่ละใบ บันทึกลงฐานข้อมูล รูปที่วางเก็บเข้า R2 (ลบ=เข้า trash 30 วันตามนโยบาย)
        และใบพิมพ์ &quot;ใบสั่งตัวอย่าง&quot; จะแปะภาพถ่ายของกระดานให้อัตโนมัติ
      </p>
    </div>
  );
}
