"use client";

// ============================================================
// NewAppRequestModal — ตัวช่วย "ขอแอปใหม่" สำหรับคนไม่เขียนโค้ด
// กรอกตามคำถามนำทาง (ติ๊ก role จริง / โมดูลจริง / ฟิลด์แนะนำ) → กด "สร้าง Prompt" → คัดลอกไปวางให้ Claude
// ไม่แตะ DB — เป็นตัวช่วยเขียน prompt ล้วน ๆ
// ============================================================
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

const PICKER_THRESHOLD = 6; // ตัวเลือกเกินจำนวนนี้ → เปลี่ยนเป็นปุ่มเปิด popup แทนโชว์ชิปเรียง
const DRAFT_KEY = "misc_new_app_draft"; // เก็บร่างต่อ user (user_ui_prefs) — บันทึกอัตโนมัติ + โหลดกลับตอนเปิด

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

type Opt = { key: string; label: string };

/**
 * MultiSelect กลาง (ในไฟล์นี้):
 * - ตัวเลือก ≤ 6 → โชว์ชิปเรียงเลย (ติ๊กได้ทันที)
 * - ตัวเลือก > 6 → ปุ่ม "＋ เลือก (n)" → เปิด popup มีค้นหา + ติ๊ก + (เพิ่มเอง) เพื่อไม่ให้รก
 * เก็บค่าเป็น label string (ให้ build() นำไปเรียงต่อได้เลย)
 */
function MultiSelect({
  label, hint, required, options, selected, setSelected, allowCustom = false, addPlaceholder, pickerTitle,
}: {
  label: string; hint?: string; required?: boolean;
  options: Opt[]; selected: string[]; setSelected: (v: string[]) => void;
  allowCustom?: boolean; addPlaceholder?: string; pickerTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState("");

  const optLabels = options.map((o) => o.label);
  const customSel = selected.filter((s) => !optLabels.includes(s)); // ที่ผู้ใช้พิมพ์เพิ่มเอง
  const usePicker = options.length > PICKER_THRESHOLD;

  const toggle = (v: string) => setSelected(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const add = () => { const t = custom.trim(); if (!t) return; if (!selected.includes(t)) setSelected([...selected, t]); setCustom(""); };

  // Escape ปิดเฉพาะ popup นี้ (capture + stopImmediatePropagation กันไม่ให้ modal หลักปิดตาม)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); setOpen(false); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  const header = (
    <div>
      <span className="text-[11px] font-medium text-slate-600">{label}{required && " *"}</span>
      {hint && <span className="ml-1 text-[10px] text-slate-400">{hint}</span>}
    </div>
  );

  const customInput = (big?: boolean) => (
    <div className={`flex gap-1 ${big ? "" : "mt-1.5"}`}>
      <input value={custom} onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        placeholder={addPlaceholder || "เพิ่มเอง แล้วกด Enter"}
        className={`${big ? "h-9" : "h-8"} flex-1 rounded-lg border border-slate-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-300`} />
      <button type="button" onClick={add} className={`${big ? "h-9" : "h-8"} rounded-lg border border-rose-300 px-3 text-xs text-rose-600 hover:bg-rose-50`}>＋ เพิ่ม</button>
    </div>
  );

  // โหมดชิปเรียง (ตัวเลือกน้อย)
  if (!usePicker) {
    return (
      <div>
        {header}
        <div className="mt-1 flex flex-wrap gap-1.5">
          {options.map((o) => <Chip key={o.key} on={selected.includes(o.label)} onClick={() => toggle(o.label)}>{o.label}</Chip>)}
          {customSel.map((c) => <Chip key={c} on onClick={() => toggle(c)}>{c}</Chip>)}
        </div>
        {allowCustom && customInput()}
      </div>
    );
  }

  // โหมดปุ่ม → popup (ตัวเลือกเยอะ)
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div>
      {header}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setOpen(true)}
          className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
          ＋ เลือก{selected.length ? ` (${selected.length})` : ""}
        </button>
        {selected.map((s) => (
          <button key={s} type="button" onClick={() => toggle(s)} title="กดเพื่อเอาออก"
            className="h-8 rounded-lg border border-rose-300 bg-rose-50 px-2.5 text-xs text-rose-600 hover:bg-rose-100">
            {s} ✕
          </button>
        ))}
        {selected.length === 0 && <span className="text-[11px] text-slate-400">ยังไม่ได้เลือก</span>}
      </div>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          onMouseDown={(e) => { e.stopPropagation(); setOpen(false); }}>
          <div className="absolute inset-0 bg-slate-900/40" />
          <div className="relative z-[81] flex max-h-[72vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="text-sm font-semibold text-slate-800">{pickerTitle || label}</div>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="border-b border-slate-100 px-4 py-2">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา..."
                className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {filtered.length === 0 && <div className="px-2 py-6 text-center text-xs text-slate-400">ไม่พบรายการ</div>}
              <div className="flex flex-col gap-0.5">
                {filtered.map((o) => {
                  const on = selected.includes(o.label);
                  return (
                    <button key={o.key} type="button" onClick={() => toggle(o.label)}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${on ? "bg-rose-50 text-rose-700" : "text-slate-700 hover:bg-slate-50"}`}>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${on ? "border-rose-500 bg-rose-500 text-white" : "border-slate-300"}`}>{on ? "✓" : ""}</span>
                      {o.label}
                    </button>
                  );
                })}
              </div>
              {customSel.length > 0 && (
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <div className="px-2 pb-1 text-[10px] text-slate-400">เพิ่มเอง</div>
                  <div className="flex flex-wrap gap-1.5 px-2">
                    {customSel.map((c) => <Chip key={c} on onClick={() => toggle(c)}>{c} ✕</Chip>)}
                  </div>
                </div>
              )}
            </div>
            {allowCustom && <div className="border-t border-slate-100 px-4 py-2">{customInput(true)}</div>}
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
              <span className="text-[11px] text-slate-400">เลือกแล้ว {selected.length} รายการ</span>
              <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-lg bg-rose-500 px-4 text-xs font-medium text-white hover:bg-rose-600">เสร็จ</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export function NewAppRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [icon, setIcon] = useState("🧩");
  const [iconImg, setIconImg] = useState<string | null>(null);       // โลโก้/รูปไอคอน (R2 key) — ถ้ามีจะใช้แทนอีโมจิ
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [roles, setRoles] = useState<Opt[]>([]);
  const [selRoles, setSelRoles] = useState<string[]>([]);
  const [usersText, setUsersText] = useState("");                    // เผื่อโหลด role ไม่ได้
  const [dataFields, setDataFields] = useState<string[]>([]);        // ข้อมูลที่ต้องเก็บ (preset + เพิ่มเอง)
  const [features, setFeatures] = useState<string[]>([]);
  const [example, setExample] = useState("");
  const [modules, setModules] = useState<Opt[]>([]);
  const [selModules, setSelModules] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [generated, setGenerated] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false); // โหลดร่างเสร็จแล้วหรือยัง (กัน autosave เขียนทับตอนกำลังโหลด)
  const [hasDraft, setHasDraft] = useState(false);       // มีร่างอยู่ → โชว์แถบ "บันทึกร่างอัตโนมัติ · ล้างร่าง"

  // รวมค่าฟอร์มปัจจุบันเป็นก้อนร่าง
  const draftValue = () => ({ icon, iconImg, name, purpose, selRoles, usersText, dataFields, features, example, selModules, notes });

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

  // โหลดร่างที่เคยบันทึกไว้ เมื่อเปิด modal
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setDraftLoaded(false);
    apiFetch(`/api/user-prefs?key=${DRAFT_KEY}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      const v = (j?.value ?? {}) as Record<string, unknown>;
      const has = !!(v.name || v.purpose || (Array.isArray(v.dataFields) && v.dataFields.length) || (Array.isArray(v.features) && v.features.length) || (Array.isArray(v.selModules) && v.selModules.length));
      if (has) {
        setIcon(typeof v.icon === "string" ? v.icon : "🧩");
        setIconImg(typeof v.iconImg === "string" ? v.iconImg : null);
        setName(typeof v.name === "string" ? v.name : "");
        setPurpose(typeof v.purpose === "string" ? v.purpose : "");
        setSelRoles(Array.isArray(v.selRoles) ? (v.selRoles as string[]) : []);
        setUsersText(typeof v.usersText === "string" ? v.usersText : "");
        setDataFields(Array.isArray(v.dataFields) ? (v.dataFields as string[]) : []);
        setFeatures(Array.isArray(v.features) ? (v.features as string[]) : []);
        setExample(typeof v.example === "string" ? v.example : "");
        setSelModules(Array.isArray(v.selModules) ? (v.selModules as string[]) : []);
        setNotes(typeof v.notes === "string" ? v.notes : "");
      }
      setHasDraft(has);
    }).catch(() => {}).finally(() => { if (alive) setDraftLoaded(true); });
    return () => { alive = false; };
  }, [open]);

  // บันทึกร่างอัตโนมัติ (หน่วง 800ms) หลังโหลดร่างเสร็จแล้วเท่านั้น
  useEffect(() => {
    if (!open || !draftLoaded) return;
    const t = setTimeout(() => { void saveDraft(true); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftLoaded, icon, iconImg, name, purpose, selRoles, usersText, dataFields, features, example, selModules, notes]);

  const saveDraft = async (silent = false) => {
    try {
      await apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: DRAFT_KEY, value: draftValue() }) });
      setHasDraft(true);
      if (!silent) toast.success("บันทึกร่างแล้ว — ปิดแล้วเปิดมากรอกต่อได้เลย");
    } catch { if (!silent) toast.error("บันทึกร่างไม่สำเร็จ ลองใหม่อีกครั้ง"); }
  };

  const clearDraft = async () => {
    try { await apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: DRAFT_KEY, value: {} }) }); } catch {}
    setIcon("🧩"); setIconImg(null); setName(""); setPurpose(""); setSelRoles([]); setUsersText("");
    setDataFields([]); setFeatures([]); setExample(""); setSelModules([]); setNotes(""); setGenerated("");
    setHasDraft(false);
    toast.success("ล้างร่างแล้ว");
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
        <button onClick={() => void saveDraft()} className="h-9 px-4 text-sm rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50">💾 บันทึกร่าง</button>
        <button onClick={build} className="h-9 px-5 text-sm font-medium rounded-lg bg-rose-500 text-white hover:bg-rose-600">✨ สร้าง Prompt</button>
      </>}>
      <div className="space-y-3">
        {hasDraft && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
            <span>📝 บันทึกร่างไว้อัตโนมัติ — ปิดแล้วเปิดมากรอกต่อได้</span>
            <button type="button" onClick={() => void clearDraft()} className="rounded-md border border-amber-300 px-2 py-0.5 text-amber-700 hover:bg-amber-100">ล้างร่าง</button>
          </div>
        )}
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

        {/* ใครใช้ = ติ๊ก role จริง (เกิน 6 → popup) */}
        {roles.length > 0 ? (
          <MultiSelect label="ใครใช้แอปนี้" hint="(ติ๊กตำแหน่ง)" options={roles}
            selected={selRoles} setSelected={setSelRoles} pickerTitle="เลือกผู้ใช้งาน (role)" />
        ) : (
          <div>
            <span className="text-[11px] font-medium text-slate-600">ใครใช้แอปนี้</span>
            <input value={usersText} onChange={(e) => setUsersText(e.target.value)} placeholder="เช่น ฝ่ายคลัง, หัวหน้าช่าง"
              className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
          </div>
        )}

        {/* ข้อมูลที่ต้องเก็บ = preset + เพิ่มเอง (15 ตัว → popup) */}
        <MultiSelect label="ข้อมูลที่ต้องเก็บ" required hint="(ติ๊กที่จำเป็น หรือพิมพ์เพิ่มเอง)"
          options={DATA_PRESETS.map((d) => ({ key: d, label: d }))} selected={dataFields} setSelected={setDataFields}
          allowCustom addPlaceholder="เพิ่มข้อมูลอื่น เช่น เลขซีเรียล" pickerTitle="เลือกข้อมูลที่ต้องเก็บ" />

        {/* ฟีเจอร์ (16 ตัว → popup) */}
        <MultiSelect label="อยากให้ทำอะไรได้บ้าง" hint="(ติ๊กเลือก)"
          options={FEATURE_OPTIONS.map((f) => ({ key: f, label: f }))} selected={features} setSelected={setFeatures}
          pickerTitle="เลือกฟีเจอร์ที่ต้องการ" />

        <Field label="ตัวอย่างการใช้งานจริง 1 เคส" hint="เช่น พนักงานเพิ่มรายการเบิก → หัวหน้าอนุมัติ → พิมพ์ใบเบิก" value={example} onChange={setExample} area />

        {/* เชื่อมกับข้อมูลเดิม = โมดูลจริง (เยอะ → popup) */}
        <MultiSelect label="เชื่อมกับข้อมูลเดิมในระบบ" hint="(ติ๊กจากข้อมูลที่เรามี — ไม่มีก็ข้ามได้)"
          options={modules} selected={selModules} setSelected={setSelModules}
          allowCustom addPlaceholder="เพิ่มเองถ้าไม่มีในรายการ" pickerTitle="เชื่อมกับข้อมูลเดิม" />

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
