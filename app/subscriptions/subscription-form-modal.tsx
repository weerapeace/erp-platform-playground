"use client";

/**
 * ป๊อปอัปเพิ่ม/แก้ไข subscription — ใช้ ERPModal กลาง + validation + เตือน unsaved changes
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import {
  CYCLE_LABEL, TYPE_LABEL, validateSubInput,
  type BillingCycle, type Currency, type SubInput, type SubType, type Subscription, type StreamingService,
} from "@/lib/subscriptions";

const INP = "w-full h-10 px-3 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white";

const EMPTY: SubInput = {
  name: "", category: "", billing_cycle: "monthly", cost: 0, currency: "THB",
  billing_date: null, chrome_profile: "", chrome_profile_url: "", chrome_profile_dir: "", invoice_url: "",
  notes: "", active: true, type: "work", account_email: "", card_last4: "", card_statement_name: "",
  pending_cancel: false, want_to_buy: false, owner_id: null, streaming: [],
};

function fromSub(s: Subscription): SubInput {
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = s;
  return { ...EMPTY, ...rest };
}

export function SubscriptionFormModal({ open, editing, categories, saving, defaults, streamingServices, onQuickAddStreaming, onClose, onSave }: {
  open: boolean;
  editing: Subscription | null;
  categories: string[];
  saving: boolean;
  defaults?: Partial<SubInput> | null;
  /** ถ้าส่งมา (ไม่ null) = โหมดส่วนตัว → โชว์ section เลือก streaming */
  streamingServices?: StreamingService[] | null;
  /** เพิ่ม streaming ใหม่เข้าคลัง (คืน service ที่สร้าง) — หน้าเรียก API เอง */
  onQuickAddStreaming?: (name: string) => Promise<StreamingService | null>;
  onClose: () => void;
  onSave: (input: SubInput) => void;
}) {
  const [form, setForm] = useState<SubInput>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newStreaming, setNewStreaming] = useState("");
  const [addingStreaming, setAddingStreaming] = useState(false);

  const toggleStreaming = (id: string) => {
    setForm((f) => {
      const has = f.streaming.includes(id);
      return { ...f, streaming: has ? f.streaming.filter((x) => x !== id) : [...f.streaming, id] };
    });
    setDirty(true);
  };

  const quickAddStreaming = async () => {
    const name = newStreaming.trim();
    if (!name || !onQuickAddStreaming) return;
    setAddingStreaming(true);
    try {
      const svc = await onQuickAddStreaming(name);
      if (svc) { setForm((f) => ({ ...f, streaming: [...f.streaming, svc.id] })); setDirty(true); setNewStreaming(""); }
    } finally { setAddingStreaming(false); }
  };

  // เติมฟอร์มเมื่อเปิด
  useEffect(() => {
    if (open) { setForm(editing ? fromSub(editing) : { ...EMPTY, ...(defaults ?? {}) }); setDirty(false); setErr(null); setNewStreaming(""); }
  }, [open, editing, defaults]);

  const set = <K extends keyof SubInput>(k: K, v: SubInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const submit = () => {
    const e = validateSubInput(form, true);
    if (e) { setErr(e); return; }
    setErr(null);
    onSave(form);
  };

  const catOptions = useMemo(() => Array.from(new Set(categories.filter(Boolean))).sort(), [categories]);

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="subs-form"
      hasUnsavedChanges={dirty && !saving}
      title={editing ? "แก้ไขรายการ" : "เพิ่มรายการใหม่"}
      description="Subscription / บริการที่สมัครใช้งาน"
      footer={
        <>
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="h-9 px-5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}
          </button>
        </>
      }>
      <div className="space-y-4">
        {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {err}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
          <Field label="ชื่อรายการ" required className="md:col-span-2">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น Claude MAX, Adobe Photoshop"
              className={INP} autoFocus />
          </Field>

          <Field label="หมวดหมู่">
            <input value={form.category} onChange={(e) => set("category", e.target.value)} list="subs-cat-list" placeholder="เช่น Productivity, Design"
              className={INP} />
            <datalist id="subs-cat-list">{catOptions.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="ประเภท">
            <select value={form.type} onChange={(e) => set("type", e.target.value as SubType)} className={INP}>
              {(["work", "personal"] as SubType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </Field>

          <Field label="รอบบิล">
            <select value={form.billing_cycle} onChange={(e) => set("billing_cycle", e.target.value as BillingCycle)} className={INP}>
              {(["monthly", "yearly", "one-time"] as BillingCycle[]).map((c) => <option key={c} value={c}>{CYCLE_LABEL[c]}</option>)}
            </select>
          </Field>
          <Field label="วันต่ออายุ/วันครบกำหนด">
            <input type="date" value={form.billing_date ?? ""} onChange={(e) => set("billing_date", e.target.value || null)} className={INP} />
          </Field>

          <Field label="ราคา" required>
            <input type="number" step="0.01" min="0" value={form.cost}
              onChange={(e) => set("cost", e.target.value === "" ? 0 : Number(e.target.value))} className={`${INP} tabular-nums`} />
          </Field>
          <Field label="สกุลเงิน">
            <select value={form.currency} onChange={(e) => set("currency", e.target.value as Currency)} className={INP}>
              {(["THB", "USD", "EUR"] as Currency[]).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>

        {/* สถานะ */}
        <div className="flex flex-wrap gap-4 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
          <Check label="ใช้งานอยู่ (active)" checked={form.active} onChange={(v) => set("active", v)} />
          <Check label="🛒 อยากซื้อ (ยังไม่ได้ซื้อ)" checked={form.want_to_buy} onChange={(v) => set("want_to_buy", v)} />
          <Check label="⏳ กำลังจะยกเลิก" checked={form.pending_cancel} onChange={(v) => set("pending_cancel", v)} />
        </div>

        {/* Streaming ที่ได้ (เฉพาะโหมดส่วนตัว = ส่ง streamingServices มา) */}
        {streamingServices && (
          <div className="rounded-lg bg-violet-50/60 border border-violet-100 px-3 py-2.5 space-y-2">
            <div className="text-xs font-medium text-violet-700">📺 Streaming ที่ได้จากรายการนี้</div>
            {streamingServices.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {streamingServices.map((s) => {
                  const on = form.streaming.includes(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => toggleStreaming(s.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${on ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                      {on ? "✓ " : ""}{s.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">ยังไม่มีบริการในคลัง — เพิ่มด้านล่าง หรือที่มุมมอง 📺 Streaming</p>
            )}
            {onQuickAddStreaming && (
              <div className="flex items-center gap-1.5">
                <input value={newStreaming} onChange={(e) => setNewStreaming(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); quickAddStreaming(); } }}
                  placeholder="เพิ่มบริการใหม่ เช่น iQIYI, WeTV, Netflix"
                  className="flex-1 h-8 px-2.5 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-violet-400" />
                <button type="button" onClick={quickAddStreaming} disabled={!newStreaming.trim() || addingStreaming}
                  className="h-8 px-3 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
                  {addingStreaming ? "…" : "＋ เพิ่ม"}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
          <Field label="อีเมลบัญชี">
            <input value={form.account_email} onChange={(e) => set("account_email", e.target.value)} placeholder="อีเมลที่ใช้สมัคร" className={INP} />
          </Field>
          <Field label="บัตร 4 ตัวท้าย">
            <input value={form.card_last4} onChange={(e) => set("card_last4", e.target.value)} placeholder="เช่น 1234" maxLength={4} className={INP} />
          </Field>
          <Field label="ชื่อในบิลบัตรเครดิต (ไว้เทียบสเตทเมนต์)" className="md:col-span-2">
            <input value={form.card_statement_name} onChange={(e) => set("card_statement_name", e.target.value)} placeholder="เช่น ADOBE *PHOTOSHOP, GOOGLE *Cloud" className={INP} />
          </Field>
          <Field label="โปรไฟล์ Chrome (ชื่อเล่น)">
            <input value={form.chrome_profile} onChange={(e) => set("chrome_profile", e.target.value)} className={INP} />
          </Field>
          <Field label="โฟลเดอร์โปรไฟล์ Chrome (สำหรับปุ่มเปิด Chrome)">
            <input value={form.chrome_profile_dir} onChange={(e) => set("chrome_profile_dir", e.target.value)} placeholder="เช่น Profile 3, Default" className={INP} />
            <span className="mt-1 block text-[11px] text-slate-400">ดูได้ที่ Chrome → เปิดโปรไฟล์นั้น → พิมพ์ chrome://version ที่ช่อง URL → ดูบรรทัด &quot;Profile Path&quot; (ท้ายสุดคือชื่อโฟลเดอร์)</span>
          </Field>
          <Field label="ลิงก์โปรไฟล์ Chrome">
            <input value={form.chrome_profile_url} onChange={(e) => set("chrome_profile_url", e.target.value)} placeholder="https://…" className={INP} />
          </Field>
          <Field label="ลิงก์หน้าใบเสร็จ/บิล" className="md:col-span-2">
            <input value={form.invoice_url} onChange={(e) => set("invoice_url", e.target.value)} placeholder="https://…" className={INP} />
          </Field>
          <Field label="หมายเหตุ" className="md:col-span-2">
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={`${INP} h-auto py-2 resize-none`} />
          </Field>
        </div>
      </div>
    </ERPModal>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
      {label}
    </label>
  );
}
