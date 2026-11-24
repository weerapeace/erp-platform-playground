"use client";

/**
 * 🐾 ทะเบียนแมว — ฟอร์มเพิ่ม/แก้ (ป๊อปกลาง ERPModal · ช่องวันที่/เงิน/ตัวเลข/รูป/สวิตช์ของกลาง)
 *   RecordFormModal = ฟอร์มเดียวใช้ทุกชนิด (แมว · คลินิก · วัคซีน · ยา · น้ำหนัก) — ช่องต่าง ๆ ตามชนิด
 *   BulkWeighModal  = ชั่งน้ำหนักทุกตัวในหน้าเดียว
 *   ปิดป๊อปตอนกรอกค้าง = ถามก่อน (hasUnsavedChanges) · ตรวจค่าจริงที่ API (lib/cats cleanCatBody)
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { DateInput } from "@/components/date-input";
import { MoneyInput } from "@/components/money-input";
import { StepInput } from "@/components/step-input";
import { ImageInput } from "@/components/image-input";
import { ToggleSwitch } from "@/components/toggle-switch";
import { addDaysYmd, todayBangkok } from "@/lib/date";
import { CAT_KINDS, INTERVAL_PRESETS, TREATMENT_LABEL, type CatKind, type CatsData } from "@/lib/cats";

type Row = Record<string, unknown>;
export type FormTarget = { kind: CatKind; row?: Row | null; preset?: Row };

const VACCINE_SUGGEST = ["วัคซีนรวม 4 โรค (FVRCP)", "วัคซีนรวม 5 โรค", "พิษสุนัขบ้า (Rabies)", "ลิวคีเมีย (FeLV)", "FIP"];
const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";

function Field({ label, hint, children, full }: { label: string; hint?: ReactNode; children: ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T | null; options: { v: T | null; label: string }[]; onChange: (v: T | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.v)} type="button" onClick={() => onChange(o.v)}
          className={`rounded-lg border px-3 py-1.5 text-sm ${value === o.v ? "border-sky-500 bg-sky-50 font-medium text-sky-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** ค่าเริ่มของฟอร์มเพิ่มใหม่ */
function blank(kind: CatKind, preset: Row = {}): Row {
  const today = todayBangkok();
  const base: Record<CatKind, Row> = {
    cats: { name: "", photo_r2_key: null, sex: null, birth_date: "", breed: "", color: "", neutered: false, microchip: "", note: "" },
    clinics: { name: "", phone: "", address: "", map_url: "", is_24h: false, note: "" },
    vaccinations: { cat_id: "", vaccine_name: "", date_given: today, clinic_id: "", next_due_date: addDaysYmd(today, 365), cost: null, note: "" },
    treatments: { cat_id: "", type: "flea", product: "", date_given: today, interval_days: 30, next_due_date: addDaysYmd(today, 30), cost: null, note: "" },
    weights: { cat_id: "", date: today, weight_kg: null, note: "" },
  };
  return { ...base[kind], ...preset };
}

/** แถวเดิม → ค่าฟอร์ม (เฉพาะช่องของชนิดนั้น) */
function fromRow(kind: CatKind, row: Row): Row {
  const out: Row = {};
  for (const k of Object.keys(CAT_KINDS[kind].fields)) out[k] = row[k] ?? (typeof blank(kind)[k] === "string" ? "" : null);
  return out;
}

export function RecordFormModal({ target, data, onClose, onSave }: {
  target: FormTarget | null;
  data: CatsData;
  onClose: () => void;
  /** คืน true = บันทึกสำเร็จ (ปิดป๊อป) */
  onSave: (kind: CatKind, values: Row, row?: Row | null) => Promise<boolean>;
}) {
  const [v, setV] = useState<Row>({});
  const [initial, setInitial] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    const init = target.row ? fromRow(target.kind, target.row) : blank(target.kind, target.preset);
    setV(init); setInitial(init); setErr(null); setSaving(false);
  }, [target]);

  const dirty = useMemo(() => JSON.stringify(v) !== JSON.stringify(initial), [v, initial]);
  if (!target) return null;
  const { kind } = target;
  const set = (k: string, val: unknown) => { setV((p) => ({ ...p, [k]: val })); setErr(null); };
  const s = (k: string) => (v[k] as string | null) ?? "";
  const editing = !!target.row;
  const catOptions = data.cats.filter((c) => c.is_active);
  const vaccineNames = Array.from(new Set([...data.vaccinations.map((x) => x.vaccine_name), ...VACCINE_SUGGEST]));

  const submit = async () => {
    if (saving) return;
    const name = CAT_KINDS[kind].nameField;
    if (kind !== "weights" && !String(v[name] ?? "").trim()) { setErr(`ต้องใส่${CAT_KINDS[kind].fields[name].label}`); return; }
    if ("cat_id" in CAT_KINDS[kind].fields && !v.cat_id) { setErr("เลือกแมวก่อน"); return; }
    if (kind === "weights" && !(Number(v.weight_kg) > 0)) { setErr("กรอกน้ำหนัก"); return; }
    setSaving(true);
    const ok = await onSave(kind, v, target.row);
    setSaving(false);
    if (ok) onClose();
  };

  const catPick = "cat_id" in CAT_KINDS[kind].fields && (
    <Field label="แมว" full>
      <Seg value={(v.cat_id as string) || null} onChange={(x) => set("cat_id", x ?? "")}
        options={catOptions.map((c) => ({ v: c.id, label: c.name }))} />
    </Field>
  );

  const title = `${editing ? "แก้ไข" : "เพิ่ม"}${CAT_KINDS[kind].label}`;
  return (
    <ERPModal open onClose={onClose} title={title} size={kind === "cats" ? "lg" : "md"} hasUnsavedChanges={dirty && !saving} storageKey={`cats.form.${kind}`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-sm text-rose-600">{err}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={submit} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
          </div>
        </div>
      }>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {kind === "cats" && <>
          <Field label="รูปแมว" full hint="รูปนี้จะโชว์ใหญ่ ๆ ในหน้าแรกและหน้าของแมวตัวนี้ · มือถือกดถ่ายรูปได้เลย">
            <ImageInput value={(v.photo_r2_key as string) || null} onChange={(k) => set("photo_r2_key", k)} folder="cats" />
          </Field>
          <Field label="ชื่อ"><input className={inputCls} value={s("name")} onChange={(e) => set("name", e.target.value)} placeholder="มะลิ" autoFocus /></Field>
          <Field label="เพศ"><Seg value={(v.sex as string) || null} onChange={(x) => set("sex", x)} options={[{ v: "female", label: "เมีย" }, { v: "male", label: "ผู้" }, { v: null, label: "ไม่ระบุ" }]} /></Field>
          <Field label="วันเกิด"><DateInput value={s("birth_date")} onChange={(x) => set("birth_date", x)} quick={false} /></Field>
          <Field label="สายพันธุ์"><input className={inputCls} value={s("breed")} onChange={(e) => set("breed", e.target.value)} placeholder="สก็อตติชโฟลด์" /></Field>
          <Field label="สี"><input className={inputCls} value={s("color")} onChange={(e) => set("color", e.target.value)} placeholder="ครีม" /></Field>
          <Field label="เลขไมโครชิป"><input className={inputCls} value={s("microchip")} onChange={(e) => set("microchip", e.target.value)} inputMode="numeric" /></Field>
          <Field label="ทำหมัน"><ToggleSwitch on={!!v.neutered} onChange={(x) => set("neutered", x)} label={v.neutered ? "ทำหมันแล้ว" : "ยังไม่ทำหมัน"} /></Field>
          <Field label="หมายเหตุ" full><textarea className={inputCls} rows={2} value={s("note")} onChange={(e) => set("note", e.target.value)} placeholder="แพ้อาหารทะเล · ชอบกินเจลลี่" /></Field>
        </>}

        {kind === "clinics" && <>
          <Field label="ชื่อคลินิก" full><input className={inputCls} value={s("name")} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
          <Field label="เบอร์โทร"><input className={inputCls} value={s("phone")} onChange={(e) => set("phone", e.target.value)} inputMode="tel" placeholder="02-123-4567" /></Field>
          <Field label="ฉุกเฉิน"><ToggleSwitch on={!!v.is_24h} onChange={(x) => set("is_24h", x)} label={v.is_24h ? "เปิด 24 ชม." : "ไม่ใช่ 24 ชม."} /></Field>
          <Field label="ที่อยู่" full><textarea className={inputCls} rows={2} value={s("address")} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="ลิงก์แผนที่ (Google Maps)" full><input className={inputCls} value={s("map_url")} onChange={(e) => set("map_url", e.target.value)} placeholder="https://maps.app.goo.gl/…" /></Field>
          <Field label="หมายเหตุ" full><textarea className={inputCls} rows={2} value={s("note")} onChange={(e) => set("note", e.target.value)} /></Field>
        </>}

        {kind === "vaccinations" && <>
          {catPick}
          <Field label="ชื่อวัคซีน" full>
            <input className={inputCls} value={s("vaccine_name")} onChange={(e) => set("vaccine_name", e.target.value)} list="cat-vaccine-names" placeholder="วัคซีนรวม 4 โรค (FVRCP)" />
            <datalist id="cat-vaccine-names">{vaccineNames.map((n) => <option key={n} value={n} />)}</datalist>
          </Field>
          <Field label="วันที่ฉีด"><DateInput value={s("date_given")} onChange={(x) => set("date_given", x)} /></Field>
          <Field label="คลินิก">
            <select className={inputCls} value={s("clinic_id")} onChange={(e) => set("clinic_id", e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {data.clinics.filter((c) => c.is_active || c.id === v.clinic_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="วันนัดครั้งถัดไป" full hint="ว่างได้ ถ้าไม่ต้องฉีดซ้ำ">
            <DateInput value={s("next_due_date")} onChange={(x) => set("next_due_date", x)} quick={false} />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[{ d: 21, l: "+3 สัปดาห์" }, { d: 30, l: "+1 เดือน" }, { d: 365, l: "+1 ปี" }, { d: 1095, l: "+3 ปี" }].map((p) => (
                <button key={p.d} type="button" onClick={() => set("next_due_date", addDaysYmd(s("date_given") || todayBangkok(), p.d))} className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">{p.l}</button>
              ))}
            </div>
          </Field>
          <Field label="ค่าใช้จ่าย (บาท)"><MoneyInput value={(v.cost as number | null) ?? null} onChange={(x) => set("cost", x)} /></Field>
          <Field label="หมายเหตุ" full><textarea className={inputCls} rows={2} value={s("note")} onChange={(e) => set("note", e.target.value)} /></Field>
        </>}

        {kind === "treatments" && <>
          {catPick}
          <Field label="ชนิด" full><Seg value={v.type as "deworm" | "flea"} onChange={(x) => set("type", x ?? "flea")} options={[{ v: "flea", label: TREATMENT_LABEL.flea }, { v: "deworm", label: TREATMENT_LABEL.deworm }]} /></Field>
          <Field label="ชื่อยา" full><input className={inputCls} value={s("product")} onChange={(e) => set("product", e.target.value)} placeholder={v.type === "deworm" ? "Drontal" : "Revolution Plus"} /></Field>
          <Field label="วันที่ให้"><DateInput value={s("date_given")} onChange={(x) => { set("date_given", x); if (x && v.interval_days) set("next_due_date", addDaysYmd(x, Number(v.interval_days))); }} /></Field>
          <Field label="รอบ (วัน)">
            <StepInput value={(v.interval_days as number | null) ?? null} integer min={1} max={730} unit="วัน"
              onChange={(x) => { set("interval_days", x); if (x && s("date_given")) set("next_due_date", addDaysYmd(s("date_given"), x)); }} />
          </Field>
          <div className="sm:col-span-2 -mt-1 flex flex-wrap gap-1.5">
            {INTERVAL_PRESETS.map((p) => (
              <button key={p.days} type="button" onClick={() => { set("interval_days", p.days); if (s("date_given")) set("next_due_date", addDaysYmd(s("date_given"), p.days)); }}
                className={`rounded-md border px-2 py-0.5 text-xs ${Number(v.interval_days) === p.days ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{p.label}</button>
            ))}
          </div>
          <Field label="ครบกำหนดครั้งถัดไป" hint="คิดให้จากวันที่ให้ + รอบ แก้เองได้"><DateInput value={s("next_due_date")} onChange={(x) => set("next_due_date", x)} quick={false} /></Field>
          <Field label="ค่าใช้จ่าย (บาท)"><MoneyInput value={(v.cost as number | null) ?? null} onChange={(x) => set("cost", x)} /></Field>
          <Field label="หมายเหตุ" full><textarea className={inputCls} rows={2} value={s("note")} onChange={(e) => set("note", e.target.value)} /></Field>
        </>}

        {kind === "weights" && <>
          {catPick}
          <Field label="วันที่ชั่ง"><DateInput value={s("date")} onChange={(x) => set("date", x)} /></Field>
          <Field label="น้ำหนัก"><StepInput value={(v.weight_kg as number | null) ?? null} onChange={(x) => set("weight_kg", x)} step={0.1} min={0.1} max={29} unit="กก." /></Field>
          <Field label="หมายเหตุ" full><input className={inputCls} value={s("note")} onChange={(e) => set("note", e.target.value)} placeholder="ชั่งหลังกินข้าว" /></Field>
        </>}
      </div>
    </ERPModal>
  );
}

/** ชั่งน้ำหนักทุกตัวทีเดียว — ช่องว่าง = ไม่บันทึกตัวนั้น */
export function BulkWeighModal({ open, data, onClose, onSave }: {
  open: boolean;
  data: CatsData;
  onClose: () => void;
  onSave: (items: Row[]) => Promise<boolean>;
}) {
  const [date, setDate] = useState(todayBangkok());
  const [kg, setKg] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setDate(todayBangkok()); setKg({}); setErr(null); } }, [open]);
  if (!open) return null;
  const cats = data.cats.filter((c) => c.is_active);
  const filled = cats.filter((c) => (kg[c.id] ?? 0) > 0);
  const submit = async () => {
    if (!filled.length) { setErr("กรอกน้ำหนักอย่างน้อย 1 ตัว"); return; }
    if (!date) { setErr("เลือกวันที่ชั่ง"); return; }
    setSaving(true);
    const ok = await onSave(filled.map((c) => ({ cat_id: c.id, date, weight_kg: kg[c.id] })));
    setSaving(false);
    if (ok) onClose();
  };
  return (
    <ERPModal open onClose={onClose} title="ชั่งน้ำหนักทุกตัว" description="กรอกเฉพาะตัวที่ชั่ง ช่องว่างจะไม่บันทึก" size="md" hasUnsavedChanges={filled.length > 0 && !saving} storageKey="cats.bulk-weigh"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-sm text-rose-600">{err}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={submit} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60">{saving ? "กำลังบันทึก…" : `บันทึก ${filled.length} ตัว`}</button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        <Field label="วันที่ชั่ง"><DateInput value={date} onChange={setDate} /></Field>
        {cats.map((c) => (
          <div key={c.id} className="flex items-center gap-3">
            <span className="w-28 truncate text-sm font-medium text-slate-700">{c.name}</span>
            <StepInput value={kg[c.id] ?? null} onChange={(x) => { setKg((p) => ({ ...p, [c.id]: x })); setErr(null); }} step={0.1} min={0.1} max={29} unit="กก." className="flex-1" />
          </div>
        ))}
        {!cats.length && <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีแมวในทะเบียน</p>}
      </div>
    </ERPModal>
  );
}
