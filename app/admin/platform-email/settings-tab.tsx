"use client";

// ⚙️ แท็บ "ตั้งค่า + ติดตั้ง" — เปิด/ปิด · ความถี่ · ดึงย้อนหลัง · ร้านของเรา (ชื่อในเมล → แบรนด์) · คำค้น Gmail (ขั้นสูง)
//                              + ขั้นตอนติดตั้งสคริปต์ใน Gmail (คัดลอกสคริปต์/สร้างกุญแจใหม่ = admin.users เท่านั้น)
// ของกลาง: SaveBar (ยังไม่บันทึกถามก่อนสลับแท็บ) · ConfirmDialog · ERPInput/ERPSelect · copyText

import { useEffect, useMemo, useState } from "react";
import { SaveBar, useReportUnsaved } from "@/components/save-bar";
import { ConfirmDialog } from "@/components/modal";
import { ERPInput, ERPSelect } from "@/components/form";
import { copyText } from "@/components/copy-button";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { fmtDateTime, type SettingsResponse, type ShopRule } from "./types";

type Form = { enabled: boolean; interval_min: number; backfill_days: number; search_query: string; shops: ShopRule[] };
const toForm = (d: SettingsResponse): Form => ({
  enabled: d.settings.enabled, interval_min: d.settings.interval_min, backfill_days: d.settings.backfill_days,
  search_query: d.settings.search_query ?? "", shops: d.settings.shops.map((s) => ({ ...s })),
});
const INTERVALS = [5, 10, 15, 30, 60];

export function SettingsTab({ data, onSaved }: { data: SettingsResponse; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Form>(() => toForm(data));
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const base = useMemo(() => JSON.stringify(toForm(data)), [data]);
  const dirty = JSON.stringify(form) !== base;
  useReportUnsaved(dirty);
  useEffect(() => { setForm(toForm(data)); }, [data]);

  // ค่าที่ฝังอยู่ในสคริปต์ — เปลี่ยนแล้วต้องวางสคริปต์ใหม่
  const scriptValuesChanged = form.interval_min !== data.settings.interval_min || form.backfill_days !== data.settings.backfill_days
    || form.search_query.trim() !== (data.settings.search_query ?? "");

  const save = async () => {
    const shops = form.shops.map((s) => ({ ...s, match: s.match.trim() })).filter((s) => s.match);
    setSaving(true); setSaveErr(null);
    try {
      const res = await apiFetch("/api/platform-email/settings", { method: "PATCH", body: JSON.stringify({ ...form, shops, search_query: form.search_query.trim() }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success(scriptValuesChanged ? "บันทึกแล้ว — อย่าลืมคัดลอกสคริปต์ไปวางใหม่ใน Gmail แล้วกด setup อีกครั้ง" : "บันทึกสำเร็จ");
      setSavedAt(new Date());
      onSaved();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const setShop = (i: number, patch: Partial<ShopRule>) => setForm((f) => ({ ...f, shops: f.shops.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const brandOptions = [{ value: "", label: "— ไม่ระบุแบรนด์ —" }, ...data.brands.map((b) => ({ value: b.id, label: b.name }))];

  return (
    <div className="space-y-4 pb-20">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">การทำงาน</div>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <span className="text-sm text-slate-700">รับเมลเข้า ERP<div className="text-[11px] text-slate-400">ปิด = เมลรอใน Gmail จนกว่าจะเปิด</div></span>
            <button type="button" role="switch" aria-checked={form.enabled} onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${form.enabled ? "bg-emerald-500" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${form.enabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </label>
          <div>
            <div className="mb-1 text-xs text-slate-500">หาเมลใหม่ทุก</div>
            <ERPSelect value={String(form.interval_min)} onChange={(e) => setForm((f) => ({ ...f, interval_min: Number(e.target.value) }))}
              options={INTERVALS.map((n) => ({ value: String(n), label: n === 60 ? "1 ชั่วโมง" : `${n} นาที` }))} />
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">ตอนติดตั้ง ดึงเมลย้อนหลัง (วัน)</div>
            <ERPInput type="number" min={1} max={365} value={form.backfill_days} onChange={(e) => setForm((f) => ({ ...f, backfill_days: Number(e.target.value) || 1 }))} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">ร้านของเรา <span className="font-normal text-slate-500">— ชื่อร้านที่เมลเรียก (เช่น &quot;เรียน คุณ louismontini_officialshop&quot;) → แบรนด์</span></div>
        <p className="mt-1 text-xs text-slate-500">ระบบรับออเดอร์เฉพาะเมลที่เรียกชื่อร้านในรายการนี้ (กันเมลตอนเราไปซื้อของเองหลุดเข้ามาเป็นยอดขาย) · ร้านใหม่ที่ไม่อยู่ในรายการ จะขึ้นกล่อง &quot;ต้องมีคนดู&quot; · เพิ่มแล้วไปกด &quot;อ่านใหม่&quot; ที่เมลนั้น</p>
        <div className="mt-3 space-y-2">
          {form.shops.map((s, i) => (
            <div key={i} className="grid grid-cols-[7rem_1fr_11rem_2rem] items-center gap-2">
              <ERPSelect value={s.platform ?? ""} onChange={(e) => setShop(i, { platform: e.target.value || null })}
                options={[{ value: "", label: "ทุกแพลตฟอร์ม" }, { value: "shopee", label: "Shopee" }, { value: "lazada", label: "Lazada" }]} />
              <ERPInput value={s.match} onChange={(e) => setShop(i, { match: e.target.value })} placeholder="ชื่อร้านในเมล (มีคำนี้ = ตรง)" />
              <ERPSelect value={s.brand_id ?? ""} onChange={(e) => setShop(i, { brand_id: e.target.value || null })} options={brandOptions} />
              <button onClick={() => setForm((f) => ({ ...f, shops: f.shops.filter((_, k) => k !== i) }))} title="ลบร้านนี้" className="h-9 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button>
            </div>
          ))}
          <button onClick={() => setForm((f) => ({ ...f, shops: [...f.shops, { platform: "shopee", match: "", brand_id: null }] }))}
            className="h-8 rounded-lg border border-dashed border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">＋ เพิ่มร้าน</button>
          {!form.shops.length && <div className="text-xs text-amber-700">⚠ ไม่ได้ตั้งร้านไว้เลย = รับทุกเมลที่มาจาก Shopee/Lazada (ไม่รู้แบรนด์)</div>}
        </div>
      </section>

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">ขั้นสูง — คำค้นใน Gmail</summary>
        <div className="mt-3 space-y-1">
          <ERPInput value={form.search_query} onChange={(e) => setForm((f) => ({ ...f, search_query: e.target.value }))} placeholder={data.settings.default_query} />
          <div className="text-xs text-slate-500">เว้นว่าง = ค่าเริ่มต้น <code className="rounded bg-slate-100 px-1">{data.settings.default_query}</code> (เมลจากผู้ส่งที่มีคำว่า shopee หรือ lazada) · เขียนแบบช่องค้นหาของ Gmail</div>
        </div>
      </details>

      <InstallGuide data={data} scriptValuesChanged={scriptValuesChanged} onChanged={onSaved} />

      <SaveBar dirty={dirty} saving={saving} error={saveErr} savedAt={savedAt} onSave={save} onDiscard={() => setForm(toForm(data))}
        note={scriptValuesChanged ? "เปลี่ยนความถี่/ย้อนหลัง/คำค้น → ต้องคัดลอกสคริปต์ไปวางใหม่" : undefined} />
    </div>
  );
}

/** 📖 ขั้นตอนติดตั้งสคริปต์ใน Gmail (ทำครั้งเดียว) + ปุ่มคัดลอกสคริปต์ / สร้างกุญแจใหม่ */
function InstallGuide({ data, scriptValuesChanged, onChanged }: { data: SettingsResponse; scriptValuesChanged: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [script, setScript] = useState<string | null>(null);
  const [busy, setBusy] = useState<"script" | "rotate" | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const s = data.settings;

  const getScript = async () => {
    setBusy("script");
    try {
      const res = await apiFetch("/api/platform-email/settings", { method: "POST", body: JSON.stringify({ action: "script" }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "สร้างสคริปต์ไม่สำเร็จ");
      setScript(j.script as string);
      if (await copyText(j.script as string)) toast.success("คัดลอกสคริปต์แล้ว — ไปวางใน script.google.com ตามขั้นที่ 2");
      else toast.warning("คัดลอกอัตโนมัติไม่ได้ — คลิกในกล่องสคริปต์ด้านล่าง แล้วกด Ctrl+C เอง");
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างสคริปต์ไม่สำเร็จ"); }
    finally { setBusy(null); }
  };

  const rotate = async () => {
    setBusy("rotate");
    try {
      const res = await apiFetch("/api/platform-email/settings", { method: "POST", body: JSON.stringify({ action: "rotate_key" }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "สร้างกุญแจไม่สำเร็จ");
      setScript(null); setConfirmRotate(false);
      toast.success(`สร้างกุญแจใหม่แล้ว (ลงท้าย …${j.key_last4}) — สคริปต์เดิมใช้ไม่ได้แล้ว ให้คัดลอกสคริปต์ไปวางใหม่`);
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างกุญแจไม่สำเร็จ"); }
    finally { setBusy(null); }
  };

  const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{n}</span>
      <div className="min-w-0 text-sm text-slate-700"><div className="font-medium text-slate-800">{title}</div><div className="mt-0.5 space-y-1 text-slate-600">{children}</div></div>
    </li>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">ติดตั้งสคริปต์ใน Gmail (ทำครั้งเดียว ~5 นาที)</div>
          <div className="mt-0.5 text-xs text-slate-500">
            กุญแจปัจจุบัน: {s.has_key ? <>ลงท้าย <code className="rounded bg-slate-100 px-1">…{s.key_last4}</code></> : "ยังไม่มี (สร้างให้ตอนกดคัดลอกสคริปต์)"} · ปลายทาง <code className="break-all rounded bg-slate-100 px-1">{data.endpoint}</code>
          </div>
        </div>
        {data.can_admin && s.has_key && (
          <button onClick={() => setConfirmRotate(true)} disabled={!!busy} className="h-8 rounded-lg border border-rose-200 px-3 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50">🔑 สร้างกุญแจใหม่</button>
        )}
      </div>
      {scriptValuesChanged && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠ มีค่าที่ยังไม่บันทึกซึ่งฝังอยู่ในสคริปต์ — กดบันทึกก่อน แล้วค่อยคัดลอกสคริปต์</div>}

      <ol className="mt-4 space-y-4">
        <Step n={1} title="คัดลอกสคริปต์">
          {data.can_admin ? (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => void getScript()} disabled={!!busy || scriptValuesChanged}
                className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">{busy === "script" ? "กำลังสร้าง..." : "📋 คัดลอกสคริปต์"}</button>
              <span className="text-xs text-rose-600">⚠ สคริปต์มีกุญแจลับของ ERP — ห้ามส่งในแชต/LINE/อีเมล</span>
            </div>
          ) : <div className="text-amber-700">ต้องให้ผู้ดูแลระบบ (สิทธิ์ admin.users) เป็นคนกดคัดลอกสคริปต์</div>}
          {script && <textarea readOnly value={script} onFocus={(e) => e.target.select()} className="mt-2 h-32 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-600" />}
        </Step>
        <Step n={2} title="วางใน Google Apps Script">
          <div>เปิด <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">script.google.com → โปรเจกต์ใหม่ ↗</a> <b>ด้วย Gmail ที่รับเมลจาก Shopee/Lazada</b></div>
          <div>ตั้งชื่อโปรเจกต์ (มุมซ้ายบน) เช่น <b>ERP ออเดอร์จากเมล</b> → ลบโค้ดเดิมในหน้านั้นทิ้งทั้งหมด → วางสคริปต์ (Ctrl+V) → กด 💾 บันทึก</div>
        </Step>
        <Step n={3} title="กดติดตั้ง + อนุญาตสิทธิ์">
          <div>ช่องเลือกฟังก์ชันด้านบน (ข้างปุ่ม ▶ เรียกใช้) เลือก <b>setup</b> → กด <b>▶ เรียกใช้ (Run)</b></div>
          <div>Google จะถามสิทธิ์: <b>ตรวจสอบสิทธิ์</b> → เลือกบัญชี Gmail → ถ้าขึ้น &quot;Google ยังไม่ได้ยืนยันแอปนี้&quot; กด <b>ขั้นสูง → ไปที่ ERP ออเดอร์จากเมล (ไม่ปลอดภัย)</b> → <b>อนุญาต</b></div>
          <div className="text-xs text-slate-500">ที่ขึ้นว่า &quot;ไม่ปลอดภัย&quot; เพราะเป็นสคริปต์ที่เราสร้างใช้เอง Google ไม่ได้ตรวจ — ปกติ · สคริปต์ขอสิทธิ์ อ่านเมล + ติดป้าย + ส่งข้อมูลเข้า ERP เท่านั้น</div>
        </Step>
        <Step n={4} title="ตรวจผล">
          <div>ด้านล่างหน้าสคริปต์ (บันทึกการดำเนินการ) ต้องขึ้น <b>✅ เชื่อมต่อ ERP สำเร็จ</b> และ <b>✅ ติดตั้งเสร็จ</b></div>
          <div>กลับมาหน้านี้ กด <b>↻ รีเฟรช</b> → แท็บภาพรวมขึ้น &quot;เชื่อมต่อแล้ว&quot; + เมลย้อนหลัง {s.backfill_days} วันทยอยเข้า (ถ้าเยอะ จะทยอยเข้าทุก {s.interval_min} นาที)</div>
          <div className="text-xs text-slate-500">ใน Gmail เมลที่ส่งเข้า ERP แล้วจะมีป้าย <b>ERP-sent</b> (ไม่ต้องลบ — ระบบใช้กันส่งซ้ำ)</div>
        </Step>
      </ol>
      <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        หยุดใช้: ในหน้าสคริปต์เลือกฟังก์ชัน <b>stop</b> → ▶ เรียกใช้ · หรือปิดสวิตช์ &quot;รับเมลเข้า ERP&quot; ด้านบน · ตั้งค่าล่าสุดเมื่อ {fmtDateTime(s.updated_at)}
      </div>

      <ConfirmDialog open={confirmRotate} onClose={() => setConfirmRotate(false)} onConfirm={() => void rotate()} loading={busy === "rotate"} variant="danger"
        title="สร้างกุญแจใหม่?" confirmText="สร้างกุญแจใหม่"
        message="สคริปต์ที่วางไว้ใน Gmail ตอนนี้จะส่งเมลเข้า ERP ไม่ได้ทันที จนกว่าจะคัดลอกสคริปต์ใหม่ไปวางทับแล้วกด setup อีกครั้ง — ใช้เมื่อสงสัยว่าสคริปต์/กุญแจหลุดไปถึงคนอื่น" />
    </section>
  );
}
