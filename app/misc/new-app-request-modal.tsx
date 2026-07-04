"use client";

// ============================================================
// NewAppRequestModal — ตัวช่วย "ขอแอปใหม่" สำหรับคนไม่เขียนโค้ด
// กรอกตามคำถามนำทาง → กด "สร้าง Prompt" → ได้ prompt พร้อมคัดลอกไปวางให้ Claude สร้างแอปได้ใน 1 ครั้ง
// ไม่แตะ DB — เป็นตัวช่วยเขียน prompt ล้วน ๆ
// ============================================================
import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";

const FEATURE_OPTIONS = [
  "เพิ่ม/แก้ไข/ลบ รายการ", "ค้นหา & กรองข้อมูล", "แนบรูป / ไฟล์", "พิมพ์เอกสาร / PDF",
  "ระบบอนุมัติ", "แจ้งเตือน", "รายงาน / สรุปยอด", "นำเข้า / ส่งออก Excel",
];
const EMOJI_QUICK = ["🧩", "📋", "📝", "📦", "💰", "🧮", "📅", "👕", "🏷️", "🚚", "🧾", "⭐", "🔧", "📊"];

function Field({ label, hint, value, onChange, area }: { label: string; hint?: string; value: string; onChange: (v: string) => void; area?: boolean }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-600">{label}</span>
      {hint && <span className="ml-1 text-[10px] text-slate-400">{hint}</span>}
      {area
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
        : <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />}
    </label>
  );
}

export function NewAppRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [icon, setIcon] = useState("🧩");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [users, setUsers] = useState("");
  const [data, setData] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [example, setExample] = useState("");
  const [integrations, setIntegrations] = useState("");
  const [notes, setNotes] = useState("");
  const [generated, setGenerated] = useState("");

  const toggleFeature = (f: string) => setFeatures((l) => (l.includes(f) ? l.filter((x) => x !== f) : [...l, f]));

  const build = () => {
    if (!name.trim()) { toast.error("ใส่ชื่อแอปก่อน"); return; }
    if (!purpose.trim()) { toast.error("บอกจุดประสงค์ของแอปก่อน"); return; }
    if (!data.trim()) { toast.error("บอกข้อมูลที่ต้องเก็บก่อน"); return; }
    const prompt = [
      "อ่าน CLAUDE.md ก่อน",
      "",
      `ช่วยสร้างแอปใหม่ในพอร์ทัล "งานอื่นๆ" (/misc)`,
      `ชื่อแอป: ${icon} ${name.trim()}`,
      "",
      `จุดประสงค์ (ช่วยแก้ปัญหา / ทำอะไร): ${purpose.trim()}`,
      `ผู้ใช้งาน: ${users.trim() || "-"}`,
      `ข้อมูลที่ต้องเก็บ (แต่ละรายการมีอะไรบ้าง): ${data.trim()}`,
      `ฟีเจอร์ที่ต้องการ: ${features.length ? features.join(", ") : "-"}`,
      `ตัวอย่างการใช้งานจริง: ${example.trim() || "-"}`,
      `เชื่อมกับข้อมูลเดิม (สินค้า/ลูกค้า/พนักงาน/ฯลฯ): ${integrations.trim() || "-"}`,
      `หมายเหตุเพิ่มเติม: ${notes.trim() || "-"}`,
      "",
      "ข้อกำหนด (ทำตามมาตรฐาน ERP Core):",
      "- ใช้ของกลาง: Universal DataTable, ERPModal/ConfirmDialog, ERPForm, Picker กลาง, ปุ่ม/Toast/Loading/Empty/Error กลาง (ห้ามสร้าง table/modal/form เองถ้ามีของกลางอยู่แล้ว)",
      "- มี validation + permission (app.misc + สิทธิ์เฉพาะแอปถ้าจำเป็น) + audit log สำหรับ action สำคัญ",
      "- ถ้าต้องเก็บข้อมูล: สร้างตารางจริงใน Supabase + ลงทะเบียน field registry และลงทะเบียนแอปในเมนู/พอร์ทัล misc",
      "- ทำ preview ให้ดูก่อน แล้วอธิบายเป็นภาษาคน (เจ้าของไม่ใช่ dev)",
      "- deploy = push feat/host-portable",
      "",
      "เสนอแผนสั้น ๆ ก่อนลงมือ แล้วค่อยสร้าง",
    ].join("\n");
    setGenerated(prompt);
    toast.success("สร้าง Prompt แล้ว — เลื่อนลงไปคัดลอกได้เลย");
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(generated); toast.success("คัดลอก Prompt แล้ว — เอาไปวางให้ Claude ได้เลย"); }
    catch { toast.error("คัดลอกไม่ได้ — เลือกข้อความในกล่องแล้วกด Ctrl+C"); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="misc-new-app-request"
      title="✨ ขอแอปใหม่ (สร้าง Prompt ให้ Claude)"
      description="กรอกตามคำถาม แล้วกด “สร้าง Prompt” → คัดลอกไปวางให้ Claude สร้างให้ (ไม่ต้องรู้โค้ด)"
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">ปิด</button>
        <button onClick={build} className="h-9 px-5 text-sm font-medium rounded-lg bg-rose-500 text-white hover:bg-rose-600">✨ สร้าง Prompt</button>
      </>}>
      <div className="space-y-3">
        <div className="grid grid-cols-[70px_1fr] gap-2">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">ไอคอน</span>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4}
              className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 text-center text-lg focus:outline-none focus:ring-2 focus:ring-rose-300" />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">ชื่อแอป *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ทะเบียนครุภัณฑ์"
              className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
          </label>
        </div>
        <div className="flex flex-wrap gap-1">
          {EMOJI_QUICK.map((e) => (
            <button key={e} type="button" onClick={() => setIcon(e)}
              className={`h-8 w-8 rounded-lg border text-lg ${icon === e ? "border-rose-400 bg-rose-50" : "border-slate-200 hover:bg-slate-50"}`}>{e}</button>
          ))}
        </div>

        <Field label="แอปนี้ช่วยทำอะไร / แก้ปัญหาอะไร *" hint="สั้น ๆ 1-2 ประโยค" value={purpose} onChange={setPurpose} area />
        <Field label="ใครใช้แอปนี้" hint="เช่น ฝ่ายคลัง, หัวหน้าช่าง, ทุกคน" value={users} onChange={setUsers} />
        <Field label="ข้อมูลที่ต้องเก็บ (แต่ละรายการมีอะไรบ้าง) *" hint="เช่น ชื่อ, วันที่, จำนวน, สถานะ, ผู้รับผิดชอบ, รูป" value={data} onChange={setData} area />

        <div>
          <span className="text-[11px] font-medium text-slate-600">อยากให้ทำอะไรได้บ้าง</span>
          <span className="ml-1 text-[10px] text-slate-400">(ติ๊กเลือก)</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {FEATURE_OPTIONS.map((f) => (
              <button key={f} type="button" onClick={() => toggleFeature(f)}
                className={`h-8 px-2.5 text-xs rounded-lg border ${features.includes(f) ? "border-rose-400 bg-rose-50 text-rose-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {features.includes(f) ? "✓ " : ""}{f}
              </button>
            ))}
          </div>
        </div>

        <Field label="ตัวอย่างการใช้งานจริง 1 เคส" hint="เช่น พนักงานเพิ่มรายการเบิก → หัวหน้าอนุมัติ → พิมพ์ใบเบิก" value={example} onChange={setExample} area />
        <Field label="เชื่อมกับข้อมูลเดิมไหม" hint="เช่น สินค้า/ลูกค้า/พนักงาน — ไม่มีก็เว้นว่าง" value={integrations} onChange={setIntegrations} />
        <Field label="อื่นๆ ที่อยากบอก" hint="สิ่งที่ต้องระวัง / อยากได้พิเศษ" value={notes} onChange={setNotes} area />

        {generated && (
          <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-rose-600">📋 Prompt (คัดลอกไปวางให้ Claude)</span>
              <button onClick={() => void copy()} className="h-7 rounded-lg bg-rose-500 px-3 text-xs font-medium text-white hover:bg-rose-600">คัดลอก</button>
            </div>
            <textarea readOnly value={generated} rows={12} onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-lg border border-slate-200 bg-white p-2 text-[11px] font-mono leading-relaxed" />
          </div>
        )}
      </div>
    </ERPModal>
  );
}
