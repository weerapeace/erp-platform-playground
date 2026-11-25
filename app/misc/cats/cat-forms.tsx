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
import { CAT_KINDS, EXPENSE_CATEGORY_LABEL, INTERVAL_PRESETS, SUPPLY_TYPE_LABEL, TREATMENT_LABEL, WET_KIND_LABEL, type CatKind, type CatsData, type ExpenseCategory, type Purchase, type Supply, type SupplyType, type WetKind } from "@/lib/cats";
import { fmtQty, stockUnitLabel, suggestPricePaid } from "@/lib/cats-supplies";
import { knownShops, priceCheck } from "@/lib/cats-extras";

type Row = Record<string, unknown>;
export type FormTarget = { kind: CatKind; row?: Row | null; preset?: Row };

const VACCINE_SUGGEST = ["วัคซีนรวม 4 โรค (FVRCP)", "วัคซีนรวม 5 โรค", "พิษสุนัขบ้า (Rabies)", "ลิวคีเมีย (FeLV)", "FIP"];
/** ค่าจากช่องเงิน (ข้อความดิบ) → ตัวเลข · ว่าง = null */
const toNum = (s: string): number | null => (s === "" || s === "-" || !Number.isFinite(Number(s)) ? null : Number(s));
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
    cats: { name: "", photo_r2_key: null, sex: null, birth_date: "", adopted_date: "", breed: "", color: "", neutered: false, microchip: "", note: "" },
    clinics: { name: "", phone: "", address: "", map_url: "", is_24h: false, note: "" },
    vaccinations: { cat_id: "", vaccine_name: "", date_given: today, clinic_id: "", next_due_date: addDaysYmd(today, 365), cost: null, note: "" },
    treatments: { cat_id: "", type: "flea", product: "", date_given: today, interval_days: 30, next_due_date: addDaysYmd(today, 30), cost: null, note: "" },
    weights: { cat_id: "", date: today, weight_kg: null, note: "" },
    supplies: { type: "dry_food", wet_kind: null, brand: "", flavor: "", unit: "bag", pack_size: null, pack_size_unit: "g", unit_size_g: null, units_per_pack: null, price: null, price_per: "pack", daily_g: null, pack_lasts_days: null, stock_base_qty: 0, shop_url: "", shop_name: "", cat_ids: null, note: "" },
    purchases: { supply_id: "", date: today, qty: null, packs: null, price_paid: null, shop_name: "", note: "" },
    vet_visits: { cat_id: "", date: today, clinic_id: "", symptoms: "", diagnosis: "", medicines: "", cost: null, receipt_r2_key: null, note: "" },
    expenses: { cat_id: "", category: "snack", date: today, amount: null, note: "" },
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
    for (const [k, f] of Object.entries(CAT_KINDS[kind].fields)) {
      if (!f.required) continue;
      const val = v[k];
      if (val == null || (typeof val === "string" && !val.trim())) { setErr(k === "cat_id" ? "เลือกแมวก่อน" : `ต้องใส่${f.label}`); return; }
    }
    if (kind === "weights" && !(Number(v.weight_kg) > 0)) { setErr("กรอกน้ำหนัก"); return; }
    if (kind === "supplies" && v.type === "wet_food" && !v.wet_kind) { setErr("เลือกว่าเป็นเกรวี่หรือเจลลี่"); return; }
    setSaving(true);
    // แก้ของใช้: สต็อกเปลี่ยนผ่านปุ่ม "นับสต็อก" เท่านั้น (ไม่ส่งช่องสต็อกจากฟอร์มแก้)
    const values = kind === "supplies" && target.row ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "stock_base_qty" && k !== "stock_base_at")) : v;
    const ok = await onSave(kind, values, target.row);
    setSaving(false);
    if (ok) onClose();
  };

  const catPick = "cat_id" in CAT_KINDS[kind].fields && (
    <Field label="แมว" full>
      <Seg value={(v.cat_id as string) || null} onChange={(x) => set("cat_id", x ?? "")}
        options={[...catOptions.map((c) => ({ v: c.id as string | null, label: c.name })), ...(kind === "expenses" ? [{ v: null, label: "ส่วนกลาง (ทุกตัว)" }] : [])]} />
    </Field>
  );
  const clinicPick = (
    <Field label="คลินิก">
      <select className={inputCls} value={s("clinic_id")} onChange={(e) => set("clinic_id", e.target.value)}>
        <option value="">— ไม่ระบุ —</option>
        {data.clinics.filter((c) => c.is_active || c.id === v.clinic_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </Field>
  );
  const num = (k: string) => (v[k] as number | null) ?? null;
  const supplyType = v.type as SupplyType;
  const stockUnit = supplyType === "wet_food" ? (v.unit === "can" ? "กระป๋อง" : "ซอง") : "ถุง";
  const catIds = (v.cat_ids as string[] | null) ?? [];

  const title = `${editing ? "แก้ไข" : "เพิ่ม"}${CAT_KINDS[kind].label}`;
  return (
    <ERPModal open onClose={onClose} title={title} size={kind === "cats" || kind === "supplies" || kind === "vet_visits" ? "lg" : "md"} hasUnsavedChanges={dirty && !saving} storageKey={`cats.form.${kind}`}
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
          <Field label="วันรับเลี้ยง" hint="ขึ้นปฏิทินทุกปี + แจ้ง LINE วันนั้น"><DateInput value={s("adopted_date")} onChange={(x) => set("adopted_date", x)} quick={false} /></Field>
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
          <Field label="ค่าใช้จ่าย (บาท)"><MoneyInput className={inputCls} value={(v.cost as number | null) ?? null} onChange={(x) => set("cost", toNum(x))} /></Field>
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
          <Field label="ค่าใช้จ่าย (บาท)"><MoneyInput className={inputCls} value={(v.cost as number | null) ?? null} onChange={(x) => set("cost", toNum(x))} /></Field>
          <Field label="หมายเหตุ" full><textarea className={inputCls} rows={2} value={s("note")} onChange={(e) => set("note", e.target.value)} /></Field>
        </>}

        {kind === "weights" && <>
          {catPick}
          <Field label="วันที่ชั่ง"><DateInput value={s("date")} onChange={(x) => set("date", x)} /></Field>
          <Field label="น้ำหนัก"><StepInput value={(v.weight_kg as number | null) ?? null} onChange={(x) => set("weight_kg", x)} step={0.1} min={0.1} max={29} unit="กก." /></Field>
          <Field label="หมายเหตุ" full><input className={inputCls} value={s("note")} onChange={(e) => set("note", e.target.value)} placeholder="ชั่งหลังกินข้าว" /></Field>
        </>}

        {kind === "supplies" && <>
          <Field label="ชนิด" full>
            <Seg value={supplyType} onChange={(x) => { set("type", x ?? "dry_food"); set("unit", x === "wet_food" ? "pouch" : "bag"); set("pack_size_unit", x === "litter" ? "L" : "g"); }}
              options={[{ v: "dry_food", label: SUPPLY_TYPE_LABEL.dry_food }, { v: "wet_food", label: SUPPLY_TYPE_LABEL.wet_food }, { v: "litter", label: SUPPLY_TYPE_LABEL.litter }]} />
          </Field>
          {supplyType === "wet_food" && <>
            <Field label="เกรวี่หรือเจลลี่" hint="สต็อกเกรวี่กับเจลลี่นับแยกกัน"><Seg value={(v.wet_kind as WetKind) || null} onChange={(x) => set("wet_kind", x)} options={[{ v: "gravy", label: WET_KIND_LABEL.gravy }, { v: "jelly", label: WET_KIND_LABEL.jelly }]} /></Field>
            <Field label="บรรจุแบบ"><Seg value={v.unit as string} onChange={(x) => set("unit", x ?? "pouch")} options={[{ v: "pouch", label: "ซอง" }, { v: "can", label: "กระป๋อง" }]} /></Field>
          </>}
          <Field label="ยี่ห้อ"><input className={inputCls} value={s("brand")} onChange={(e) => set("brand", e.target.value)} placeholder={supplyType === "litter" ? "ทรายเต้าหู้ Kasty" : supplyType === "wet_food" ? "Whiskas" : "Royal Canin"} /></Field>
          <Field label="รสชาติ / รุ่น"><input className={inputCls} value={s("flavor")} onChange={(e) => set("flavor", e.target.value)} placeholder={supplyType === "wet_food" ? "ปลาทู" : ""} /></Field>

          {supplyType === "dry_food" && <>
            <Field label="ขนาดถุง">
              <div className="flex gap-2"><StepInput value={num("pack_size")} onChange={(x) => set("pack_size", x)} min={0} className="flex-1" />
                <Seg value={v.pack_size_unit as string} onChange={(x) => set("pack_size_unit", x ?? "g")} options={[{ v: "g", label: "กรัม" }, { v: "kg", label: "กก." }]} /></div>
            </Field>
            <Field label="ราคาต่อถุง (บาท)"><MoneyInput className={inputCls} value={num("price")} onChange={(x) => set("price", toNum(x))} /></Field>
            <Field label="กรัมต่อวัน (รวมทุกตัว)" hint="ถ้าให้อาหารเปียกด้วย ตั้ง % ลดอาหารเม็ดได้ที่ตารางมื้อ (แท็บอาหาร/ทราย)"><StepInput value={num("daily_g")} onChange={(x) => set("daily_g", x)} step={5} min={0} unit="กรัม" /></Field>
          </>}
          {supplyType === "wet_food" && <>
            <Field label="กรัมต่อชิ้น"><StepInput value={num("unit_size_g")} onChange={(x) => set("unit_size_g", x)} step={5} min={0} unit="กรัม" /></Field>
            <Field label="ชิ้นต่อแพ็ค"><StepInput value={num("units_per_pack")} onChange={(x) => set("units_per_pack", x)} integer min={1} max={500} unit={stockUnit} /></Field>
            <Field label="ราคา (บาท)"><MoneyInput className={inputCls} value={num("price")} onChange={(x) => set("price", toNum(x))} /></Field>
            <Field label="ราคานี้คิดต่อ"><Seg value={v.price_per as string} onChange={(x) => set("price_per", x ?? "pack")} options={[{ v: "pack", label: "ต่อแพ็ค" }, { v: "piece", label: `ต่อ${stockUnit}` }]} /></Field>
            <p className="text-xs text-slate-500 sm:col-span-2">จำนวนที่กินต่อวัน ตั้งที่ “ตารางมื้อ” ในแท็บอาหาร/ทราย (ตั้งรวมทุกตัว ใส่ครึ่ง{stockUnit}ได้)</p>
          </>}
          {supplyType === "litter" && <>
            <Field label="ขนาดถุง">
              <div className="flex gap-2"><StepInput value={num("pack_size")} onChange={(x) => set("pack_size", x)} min={0} className="flex-1" />
                <Seg value={v.pack_size_unit as string} onChange={(x) => set("pack_size_unit", x ?? "L")} options={[{ v: "L", label: "ลิตร" }, { v: "kg", label: "กก." }]} /></div>
            </Field>
            <Field label="ราคาต่อถุง (บาท)"><MoneyInput className={inputCls} value={num("price")} onChange={(x) => set("price", toNum(x))} /></Field>
            <Field label="1 ถุงใช้ได้กี่วัน" hint="ใช้คำนวณวันหมดและค่าใช้จ่ายต่อเดือน"><StepInput value={num("pack_lasts_days")} onChange={(x) => set("pack_lasts_days", x)} step={1} min={1} unit="วัน" /></Field>
          </>}

          {!editing && <Field label={`ตอนนี้มีอยู่กี่${stockUnit}`} hint="ใส่ทศนิยมได้ เช่น 1.5 ถุง · หลังจากนี้กด “ซื้อเข้า” แล้วสต็อกบวกเอง"><StepInput value={num("stock_base_qty")} onChange={(x) => set("stock_base_qty", x ?? 0)} step={supplyType === "wet_food" ? 1 : 0.5} min={0} unit={stockUnit} /></Field>}
          <Field label="ร้านประจำ"><input className={inputCls} value={s("shop_name")} onChange={(e) => set("shop_name", e.target.value)} placeholder="Shopee ร้าน …" /></Field>
          <Field label="ลิงก์สั่งซื้อ (Shopee / Lazada)" full><input className={inputCls} value={s("shop_url")} onChange={(e) => set("shop_url", e.target.value)} placeholder="https://shopee.co.th/…" inputMode="url" /></Field>
          <Field label="แมวที่ใช้ของนี้" full hint="ไม่เลือก = ทุกตัว · ใช้แบ่งค่าใช้จ่ายรายตัว">
            <div className="flex flex-wrap gap-1.5">
              {catOptions.map((c) => {
                const on = catIds.includes(c.id);
                return <button key={c.id} type="button" onClick={() => set("cat_ids", on ? catIds.filter((x) => x !== c.id) : [...catIds, c.id])}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${on ? "border-sky-500 bg-sky-50 font-medium text-sky-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>{c.name}</button>;
              })}
            </div>
          </Field>
          <Field label="หมายเหตุ" full><textarea className={inputCls} rows={2} value={s("note")} onChange={(e) => set("note", e.target.value)} /></Field>
        </>}

        {kind === "vet_visits" && <>
          {catPick}
          <Field label="วันที่"><DateInput value={s("date")} onChange={(x) => set("date", x)} /></Field>
          {clinicPick}
          <Field label="อาการ" full><textarea className={inputCls} rows={2} value={s("symptoms")} onChange={(e) => set("symptoms", e.target.value)} placeholder="ไม่กินข้าว อาเจียน 2 ครั้ง" /></Field>
          <Field label="การวินิจฉัย" full><textarea className={inputCls} rows={2} value={s("diagnosis")} onChange={(e) => set("diagnosis", e.target.value)} /></Field>
          <Field label="ยาที่ได้" full><textarea className={inputCls} rows={2} value={s("medicines")} onChange={(e) => set("medicines", e.target.value)} placeholder="ยาแก้อักเสบ วันละ 2 ครั้ง 7 วัน" /></Field>
          <Field label="ค่ารักษา (บาท)"><MoneyInput className={inputCls} value={num("cost")} onChange={(x) => set("cost", toNum(x))} /></Field>
          <Field label="รูปใบเสร็จ" full><ImageInput value={(v.receipt_r2_key as string) || null} onChange={(k) => set("receipt_r2_key", k)} folder="cats" /></Field>
          <Field label="หมายเหตุ" full><textarea className={inputCls} rows={2} value={s("note")} onChange={(e) => set("note", e.target.value)} placeholder="นัดตรวจซ้ำ …" /></Field>
        </>}

        {kind === "expenses" && <>
          {catPick}
          <Field label="หมวด" full>
            <Seg value={v.category as ExpenseCategory} onChange={(x) => set("category", x ?? "other")}
              options={(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[]).map((c) => ({ v: c, label: EXPENSE_CATEGORY_LABEL[c] }))} />
          </Field>
          <Field label="วันที่"><DateInput value={s("date")} onChange={(x) => set("date", x)} /></Field>
          <Field label="จำนวนเงิน (บาท)"><MoneyInput className={inputCls} value={num("amount")} onChange={(x) => set("amount", toNum(x))} /></Field>
          <Field label="รายละเอียด" full><input className={inputCls} value={s("note")} onChange={(e) => set("note", e.target.value)} placeholder="ขนมแมวเลีย 1 กล่อง" /></Field>
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

function FooterButtons({ err, saving, label, onClose, onSave }: { err: string | null; saving: boolean; label: string; onClose: () => void; onSave: () => void }) {
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <span className="text-sm text-rose-600">{err}</span>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={onSave} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60">{saving ? "กำลังบันทึก…" : label}</button>
      </div>
    </div>
  );
}

/**
 * ซื้อเข้า — บวกสต็อกเอง + นับเป็นค่าใช้จ่าย · แก้ใบเดิมได้ (target.row)
 *   อาหารเปียก: กรอกกี่แพ็ค → คิดเป็นชิ้นให้ (แก้ได้) · ราคาที่จ่ายเติมให้จากราคาที่ตั้ง (แก้ได้)
 *   ซื้อจากร้าน: ใส่ร้านประจำให้ก่อน · เลือกร้านที่เคยใช้ได้ · เตือนถ้าแพงกว่าครั้งก่อน ≥ 10% + บอกร้านที่เคยถูกสุด (lib/cats-extras)
 */
export type PurchaseTarget = { supply: Supply; row?: Purchase | null };
export function PurchaseModal({ target, data, onClose, onSave }: { target: PurchaseTarget | null; data: CatsData; onClose: () => void; onSave: (values: Row, row?: Purchase | null) => Promise<boolean> }) {
  const supply = target?.supply ?? null;
  const row = target?.row ?? null;
  const [date, setDate] = useState(todayBangkok());
  const [packs, setPacks] = useState<number | null>(1);
  const [qty, setQty] = useState<number | null>(null);
  const [paid, setPaid] = useState<number | null>(null);
  const [paidTouched, setPaidTouched] = useState(false);
  const [shop, setShop] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wet = supply?.type === "wet_food";
  const perPack = supply?.units_per_pack || 1;

  useEffect(() => {
    if (!supply) return;
    if (row) {
      setDate(row.date); setPacks(row.packs != null ? Number(row.packs) : null); setQty(Number(row.qty)); setPaid(row.price_paid != null ? Number(row.price_paid) : null);
      setPaidTouched(true); setShop(row.shop_name ?? ""); setNote(row.note ?? ""); setErr(null);
      return;
    }
    const q = supply.type === "wet_food" ? perPack : 1;
    setDate(todayBangkok()); setPacks(1); setQty(q); setPaid(suggestPricePaid(supply, q)); setPaidTouched(false); setShop(supply.shop_name ?? ""); setNote(""); setErr(null);
  }, [supply, row, perPack]);
  const shops = useMemo(() => (supply ? knownShops(supply, data.supplies, data.purchases) : []), [supply, data.supplies, data.purchases]);
  const check = useMemo(() => (supply && qty && paid ? priceCheck(supply, data.purchases, Number(qty), Number(paid), row?.id) : null), [supply, data.purchases, qty, paid, row?.id]);
  if (!supply) return null;
  const unit = stockUnitLabel(supply);
  const packWord = wet ? "แพ็ค" : "ถุง";
  const nowPerPack = qty && paid ? (Number(paid) / Number(qty)) * (wet ? perPack : 1) : null;
  const changeQty = (q: number | null) => { setQty(q); if (!paidTouched) setPaid(q ? suggestPricePaid(supply, q) : null); setErr(null); };
  const submit = async () => {
    if (!(Number(qty) > 0)) { setErr("กรอกจำนวน"); return; }
    if (!date) { setErr("เลือกวันที่ซื้อ"); return; }
    setSaving(true);
    const ok = await onSave({ supply_id: supply.id, date, qty, packs: wet ? packs : null, price_paid: paid, shop_name: shop.trim(), note }, row);
    setSaving(false);
    if (ok) onClose();
  };
  const dirty = row
    ? date !== row.date || Number(qty) !== Number(row.qty) || (paid ?? null) !== (row.price_paid != null ? Number(row.price_paid) : null) || shop !== (row.shop_name ?? "") || note !== (row.note ?? "")
    : note !== "" || paidTouched;
  const cheaperElsewhere = !!(check?.cheapest && nowPerPack != null && check.cheapest.shop !== shop.trim() && check.cheapest.perPack < nowPerPack - 0.01);
  return (
    <ERPModal open onClose={onClose} title={`${row ? "แก้ใบซื้อเข้า" : "ซื้อเข้า"} · ${[supply.brand, supply.flavor].filter(Boolean).join(" ")}`}
      description={row ? "แก้จำนวน ราคา หรือร้านได้ · สต็อกและค่าใช้จ่ายคำนวณใหม่ให้เอง" : "สต็อกบวกให้เอง และนับเป็นค่าใช้จ่ายของเดือนนี้"} size="md" storageKey={row ? undefined : "cats.purchase"}
      hasUnsavedChanges={!saving && dirty}
      footer={<FooterButtons err={err} saving={saving} label={row ? "บันทึกการแก้ไข" : "บันทึกซื้อเข้า"} onClose={onClose} onSave={submit} />}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="วันที่ซื้อ"><DateInput value={date} onChange={setDate} /></Field>
        <Field label="ซื้อจากร้าน" hint={shops.length ? "พิมพ์ใหม่ หรือเลือกร้านที่เคยใช้" : "เช่น Shopee · Pet Mall"}>
          <input className={inputCls} value={shop} onChange={(e) => setShop(e.target.value)} list="cats-shop-list" placeholder="Shopee · ร้าน …" maxLength={80} />
          <datalist id="cats-shop-list">{shops.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        {wet ? <>
          <Field label="ซื้อกี่แพ็ค" hint={`1 แพ็ค = ${perPack} ${unit}`}><StepInput value={packs} onChange={(p) => { setPacks(p); changeQty(p ? Math.round(p * perPack * 100) / 100 : null); }} step={1} min={0} unit="แพ็ค" /></Field>
          <Field label={`รวมกี่${unit}`}><StepInput value={qty} onChange={changeQty} step={1} min={0} unit={unit} /></Field>
        </> : (
          <Field label="ซื้อกี่ถุง"><StepInput value={qty} onChange={changeQty} step={1} min={0} unit="ถุง" /></Field>
        )}
        <Field label="จ่ายไป (บาท)" hint={row ? undefined : "เติมให้จากราคาที่ตั้งไว้ · แก้ได้ถ้าได้ส่วนลด"}><MoneyInput className={inputCls} value={paid} onChange={(x) => { setPaid(toNum(x)); setPaidTouched(true); }} /></Field>
        {check && (check.warn || cheaperElsewhere) && (
          <p className={`rounded-lg px-3 py-2 text-xs sm:col-span-2 ${check.warn ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"}`}>
            {check.warn && <>แพงกว่าครั้งก่อน {check.pctVsLast}% (ครั้งก่อน {fmtQty(check.lastPerPack ?? 0)} บาท/{packWord}){cheaperElsewhere ? " · " : ""}</>}
            {cheaperElsewhere && check.cheapest && <>เคยถูกสุด {fmtQty(check.cheapest.perPack)} บาท/{packWord} ที่ {check.cheapest.shop}</>}
          </p>
        )}
        <Field label="หมายเหตุ" full><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="โปร 11.11" /></Field>
      </div>
    </ERPModal>
  );
}

/** นับสต็อกจริง — ตั้งจำนวนคงเหลือใหม่ (เริ่มนับวันหมดจากวันนี้) */
export function StockCountModal({ supply, estimate, onClose, onSave }: { supply: Supply | null; estimate: number; onClose: () => void; onSave: (qty: number) => Promise<boolean> }) {
  const [qty, setQty] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (supply) setQty(Math.round(estimate * 10) / 10); }, [supply, estimate]);
  if (!supply) return null;
  const unit = stockUnitLabel(supply);
  const submit = async () => {
    setSaving(true);
    const ok = await onSave(Math.max(0, Number(qty) || 0));
    setSaving(false);
    if (ok) onClose();
  };
  return (
    <ERPModal open onClose={onClose} title={`นับสต็อก · ${[supply.brand, supply.flavor].filter(Boolean).join(" ")}`} size="sm"
      footer={<FooterButtons err={null} saving={saving} label="บันทึกจำนวนนี้" onClose={onClose} onSave={submit} />}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">ระบบคาดว่าเหลือ <b>{fmtQty(estimate)} {unit}</b> · ถ้านับจริงได้ไม่เท่านี้ ใส่จำนวนที่นับได้</p>
        <StepInput value={qty} onChange={setQty} step={supply.type === "wet_food" ? 1 : 0.5} min={0} unit={unit} />
      </div>
    </ERPModal>
  );
}
