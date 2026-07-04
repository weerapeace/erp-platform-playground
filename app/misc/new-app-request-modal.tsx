"use client";

// ============================================================
// NewAppRequestModal — ตัวช่วย "ขอแอปใหม่" สำหรับคนไม่เขียนโค้ด
// กรอกตามคำถามนำทาง (ติ๊ก role จริง / โมดูลจริง / ฟิลด์แนะนำ) → กด "สร้าง Prompt" → คัดลอกไปวางให้ Claude
// ไม่แตะ DB — เป็นตัวช่วยเขียน prompt ล้วน ๆ
// ============================================================
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { ImageInput } from "@/components/image-input";

const DATA_PRESETS = [
  "ชื่อ / หัวข้อ", "รหัส / เลขที่", "วันที่", "จำนวน", "ราคา / เงิน", "สถานะ", "ผู้รับผิดชอบ",
  "หมวดหมู่", "รูปภาพ", "ไฟล์แนบ", "หมายเหตุ", "ที่อยู่", "เบอร์โทร", "อีเมล", "แท็ก",
];
const FEATURE_OPTIONS = [
  "เพิ่ม/แก้ไข/ลบ รายการ", "ค้นหา & กรองข้อมูล", "แนบรูป / ไฟล์", "พิมพ์เอกสาร / PDF",
  "ระบบอนุมัติ", "แจ้งเตือน", "รายงาน / สรุปยอด", "นำเข้า / ส่งออก Excel",
  "ปฏิทิน / ไทม์ไลน์", "แดชบอร์ด / กราฟสรุป", "บาร์โค้ด / QR", "มอบหมายงาน",
  "หลายขั้นตอน (สถานะ / workflow)", "คอมเมนต์ / แชท", "ประวัติการแก้ไข", "ใช้บนมือถือ (PWA)",
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

// ชิปติ๊กเลือก (multi-select)
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`h-8 px-2.5 text-xs rounded-lg border ${on ? "border-rose-400 bg-rose-50 text-rose-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      {on ? "✓ " : ""}{children}
    </button>
  );
}

export function NewAppRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [icon, setIcon] = useState("🧩");
  const [iconImg, setIconImg] = useState<string | null>(null);       // โลโก้/รูปไอคอน (R2 key) — ถ้ามีจะใช้แทนอีโมจิ
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [roles, setRoles] = useState<{ key: string; label: string }[]>([]);
  const [selRoles, setSelRoles] = useState<string[]>([]);
  const [usersText, setUsersText] = useState("");                    // เผื่อโหลด role ไม่ได้
  const [dataFields, setDataFields] = useState<string[]>([]);        // ข้อมูลที่ต้องเก็บ (preset + เพิ่มเอง)
  const [dataCustom, setDataCustom] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [example, setExample] = useState("");
  const [modules, setModules] = useState<{ key: string; label: string }[]>([]);
  const [selModules, setSelModules] = useState<string[]>([]);
  const [modCustom, setModCustom] = useState("");
  const [notes, setNotes] = useState("");
  const [generated, setGenerated] = useState("");

  // โหลด role จริง + โมดูลจริง (no hardcode) เมื่อเปิด
  useEffect(() => {
    if (!open) return;
    let alive = true;
    apiFetch("/api/admin/roles").then((r) => r.json())
      .then((j) => { if (alive && Array.isArray(j.roles)) setRoles(j.roles.map((x: { key: string; label: string }) => ({ key: x.key, label: x.label }))); }).catch(() => {});
    apiFetch("/api/misc/data-sources").then((r) => r.json())
      .then((j) => { if (alive && Array.isArray(j.data)) setModules(j.data.map((x: { module_key: string; label: string }) => ({ key: x.module_key, label: x.label }))); }).catch(() => {});
    return () => { alive = false; };
  }, [open]);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const addChip = (arr: string[], set: (v: string[]) => void, v: string, clear: () => void) => {
    const t = v.trim(); if (!t) return;
    if (!arr.includes(t)) set([...arr, t]); clear();
  };

  const build = () => {
    if (!name.trim()) { toast.error("ใส่ชื่อแอปก่อน"); return; }
    if (!purpose.trim()) { toast.error("บอกจุดประสงค์ของแอปก่อน"); return; }
    if (dataFields.length === 0) { toast.error("เลือกข้อมูลที่ต้องเก็บอย่างน้อย 1 อย่าง"); return; }
    const iconText = iconImg ? `รูปที่แนบไว้ (R2 key: ${iconImg})` : icon;
    const usersLine = selRoles.length ? selRoles.join(", ") : (usersText.trim() || "-");
    const prompt = [
      "อ่าน CLAUDE.md ก่อน",
      "",
      `ช่วยสร้างแอปใหม่ในพอร์ทัล "งานอื่นๆ" (/misc)`,
      `ชื่อแอป: ${iconImg ? "" : icon + " "}${name.trim()}`,
      `ไอคอน: ${iconText}`,
      "",
      `จุดประสงค์ (ช่วยแก้ปัญหา / ทำอะไร): ${purpose.trim()}`,
      `ผู้ใช้งาน (role): ${usersLine}`,
      `ข้อมูลที่ต้องเก็บ (fields): ${dataFields.join(", ")}`,
      `ฟีเจอร์ที่ต้องการ: ${features.length ? features.join(", ") : "-"}`,
      `ตัวอย่างการใช้งานจริง: ${example.trim() || "-"}`,
      `เชื่อมกับข้อมูลเดิมในระบบ: ${selModules.length ? selModules.join(", ") : "-"}`,
      `หมายเหตุเพิ่มเติม: ${notes.trim() || "-"}`,
      "",
      "ข้อกำหนด (ทำตามมาตรฐาน ERP Core):",
      "- ใช้ของกลาง: Universal DataTable, ERPModal/ConfirmDialog, ERPForm, Picker กลาง, ปุ่ม/Toast/Loading/Empty/Error กลาง (ห้ามสร้าง table/modal/form เองถ้ามีของกลางอยู่แล้ว)",
      "- มี validation + permission (app.misc + สิทธิ์เฉพาะแอปถ้าจำเป็น) + audit log สำหรับ action สำคัญ",
      "- ถ้าต้องเก็บข้อมูล: สร้างตารางจริงใน Supabase + ลงทะเบียน field registry และลงทะเบียนแอปในเมนู/พอร์ทัล misc",
      "- ถ้าเชื่อมกับข้อมูลเดิม ให้ใช้ Picker/relation ของโมดูลนั้น ไม่ทำข้อมูลซ้ำ",
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
        {/* ไอคอน (อีโมจิ หรือ อัปรูป) + ชื่อ */}
        <div className="flex items-start gap-2">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">ไอคอน / รูป</span>
            <div className="mt-0.5 flex items-center gap-1.5">
              {!iconImg && <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4}
                className="h-10 w-12 rounded-lg border border-slate-200 text-center text-lg focus:outline-none focus:ring-2 focus:ring-rose-300" />}
              <ImageInput compact value={iconImg} onChange={setIconImg} folder="misc-app-icons" />
            </div>
          </label>
          <label className="block flex-1">
            <span className="text-[11px] font-medium text-slate-600">ชื่อแอป *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ทะเบียนครุภัณฑ์"
              className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
          </label>
        </div>
        {!iconImg && (
          <div className="flex flex-wrap gap-1">
            {EMOJI_QUICK.map((e) => (
              <button key={e} type="button" onClick={() => setIcon(e)}
                className={`h-8 w-8 rounded-lg border text-lg ${icon === e ? "border-rose-400 bg-rose-50" : "border-slate-200 hover:bg-slate-50"}`}>{e}</button>
            ))}
          </div>
        )}

        <Field label="แอปนี้ช่วยทำอะไร / แก้ปัญหาอะไร *" hint="สั้น ๆ 1-2 ประโยค" value={purpose} onChange={setPurpose} area />

        {/* ใครใช้ = ติ๊ก role จริง */}
        <div>
          <span className="text-[11px] font-medium text-slate-600">ใครใช้แอปนี้</span>
          <span className="ml-1 text-[10px] text-slate-400">(ติ๊กตำแหน่ง)</span>
          {roles.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {roles.map((r) => <Chip key={r.key} on={selRoles.includes(r.label)} onClick={() => toggle(selRoles, setSelRoles, r.label)}>{r.label}</Chip>)}
            </div>
          ) : (
            <input value={usersText} onChange={(e) => setUsersText(e.target.value)} placeholder="เช่น ฝ่ายคลัง, หัวหน้าช่าง"
              className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
          )}
        </div>

        {/* ข้อมูลที่ต้องเก็บ = preset + เพิ่มเอง */}
        <div>
          <span className="text-[11px] font-medium text-slate-600">ข้อมูลที่ต้องเก็บ *</span>
          <span className="ml-1 text-[10px] text-slate-400">(ติ๊กที่จำเป็น หรือพิมพ์เพิ่มเอง)</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {DATA_PRESETS.map((d) => <Chip key={d} on={dataFields.includes(d)} onClick={() => toggle(dataFields, setDataFields, d)}>{d}</Chip>)}
            {dataFields.filter((d) => !DATA_PRESETS.includes(d)).map((d) => <Chip key={d} on onClick={() => toggle(dataFields, setDataFields, d)}>{d}</Chip>)}
          </div>
          <div className="mt-1.5 flex gap-1">
            <input value={dataCustom} onChange={(e) => setDataCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChip(dataFields, setDataFields, dataCustom, () => setDataCustom("")); } }}
              placeholder="เพิ่มข้อมูลอื่น เช่น เลขซีเรียล แล้วกด Enter"
              className="h-8 flex-1 rounded-lg border border-slate-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-300" />
            <button type="button" onClick={() => addChip(dataFields, setDataFields, dataCustom, () => setDataCustom(""))}
              className="h-8 rounded-lg border border-rose-300 px-3 text-xs text-rose-600 hover:bg-rose-50">＋ เพิ่ม</button>
          </div>
        </div>

        {/* ฟีเจอร์ */}
        <div>
          <span className="text-[11px] font-medium text-slate-600">อยากให้ทำอะไรได้บ้าง</span>
          <span className="ml-1 text-[10px] text-slate-400">(ติ๊กเลือก)</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {FEATURE_OPTIONS.map((f) => <Chip key={f} on={features.includes(f)} onClick={() => toggle(features, setFeatures, f)}>{f}</Chip>)}
          </div>
        </div>

        <Field label="ตัวอย่างการใช้งานจริง 1 เคส" hint="เช่น พนักงานเพิ่มรายการเบิก → หัวหน้าอนุมัติ → พิมพ์ใบเบิก" value={example} onChange={setExample} area />

        {/* เชื่อมกับข้อมูลเดิม = โมดูลจริง */}
        <div>
          <span className="text-[11px] font-medium text-slate-600">เชื่อมกับข้อมูลเดิมในระบบ</span>
          <span className="ml-1 text-[10px] text-slate-400">(ติ๊กจากข้อมูลที่เรามี — ไม่มีก็ข้ามได้)</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {modules.map((m) => <Chip key={m.key} on={selModules.includes(m.label)} onClick={() => toggle(selModules, setSelModules, m.label)}>{m.label}</Chip>)}
            {selModules.filter((m) => !modules.some((x) => x.label === m)).map((m) => <Chip key={m} on onClick={() => toggle(selModules, setSelModules, m)}>{m}</Chip>)}
          </div>
          <div className="mt-1.5 flex gap-1">
            <input value={modCustom} onChange={(e) => setModCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChip(selModules, setSelModules, modCustom, () => setModCustom("")); } }}
              placeholder="เพิ่มเองถ้าไม่มีในรายการ แล้วกด Enter"
              className="h-8 flex-1 rounded-lg border border-slate-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-300" />
            <button type="button" onClick={() => addChip(selModules, setSelModules, modCustom, () => setModCustom(""))}
              className="h-8 rounded-lg border border-rose-300 px-3 text-xs text-rose-600 hover:bg-rose-50">＋ เพิ่ม</button>
          </div>
        </div>

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
