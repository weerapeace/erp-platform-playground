"use client";

/**
 * 🐾 แท็บตั้งค่า — แจ้งเตือน LINE (สรุปวันละ 1 ข้อความ ทุกเช้า 08:00)
 *   เปิด/ปิด · เตือนวัคซีน/ยาล่วงหน้ากี่วัน · เตือนของใกล้หมดล่วงหน้ากี่วัน · ดูตัวอย่างข้อความ · ส่งทดสอบ
 *   กลุ่มปลายทาง = ศูนย์ LINE ช่อง "กลุ่มแมว" (slot cats) — ไม่ตั้ง = ไม่ส่ง
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { StepInput } from "@/components/step-input";
import { ToggleSwitch } from "@/components/toggle-switch";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { todayBangkok } from "@/lib/date";
import type { CatsData } from "@/lib/cats";
import { asNotify, type NotifySettings } from "@/lib/cats-supplies";
import { digestLines, digestText } from "@/lib/cats-notify";

type LineStatus = { botReady: boolean; groupSet: boolean; eventOn: boolean };

export function SettingsTab({ data, settingsRaw, canEdit, isAdmin, onSaveNotify }: {
  data: CatsData;
  settingsRaw: { meal_plan?: unknown; notify?: unknown };
  canEdit: boolean;
  isAdmin: boolean;
  onSaveNotify: (v: NotifySettings, before: NotifySettings) => Promise<boolean>;
}) {
  const toast = useToast();
  const saved = useMemo(() => asNotify(settingsRaw.notify), [settingsRaw.notify]);
  const [v, setV] = useState<NotifySettings>(saved);
  useEffect(() => setV(saved), [saved]);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const [line, setLine] = useState<LineStatus | null>(null);
  const [confirmTest, setConfirmTest] = useState(false);
  const [testing, setTesting] = useState(false);

  const loadLine = useCallback(async () => {
    try {
      const j = await (await apiFetch("/api/cats/settings")).json();
      setLine(j.data?.line ?? null);
    } catch { setLine(null); }
  }, []);
  useEffect(() => { void loadLine(); }, [loadLine]);

  const today = todayBangkok();
  const preview = useMemo(() => {
    const lines = digestLines(data, settingsRaw.meal_plan, v, today, true);
    return digestText(lines, today, typeof window !== "undefined" ? window.location.origin : "");
  }, [data, settingsRaw.meal_plan, v, today]);

  const sendTest = async () => {
    setConfirmTest(false); setTesting(true);
    try {
      const j = await (await apiFetch("/api/cron/cat-reminders?test=1")).json();
      if (j.error) toast.error(j.error);
      else if (j.sent) toast.success(`ส่งเข้ากลุ่ม LINE แล้ว (${j.lines} เรื่อง)`);
      else toast.info(j.reason || "ไม่มีอะไรต้องส่ง");
    } catch { toast.error("ส่งไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    setTesting(false);
  };

  const Check = ({ ok, children }: { ok: boolean | undefined; children: React.ReactNode }) => (
    <li className="flex items-start gap-2 text-sm">
      <span className={`mt-0.5 ${ok ? "text-emerald-600" : "text-amber-500"}`}><Icon name={ok ? "circle-check" : "alert-triangle"} /></span>
      <span className="text-slate-700">{children}</span>
    </li>
  );

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-semibold text-slate-700"><Icon name="bell" /> แจ้งเตือนเข้ากลุ่ม LINE</h3>
          <ToggleSwitch on={v.enabled} onChange={(x) => setV((p) => ({ ...p, enabled: x }))} disabled={!canEdit} label={v.enabled ? "เปิดอยู่" : "ปิดอยู่"} />
        </div>
        <p className="mb-3 text-sm text-slate-500">ส่งสรุปวันละ 1 ข้อความตอน 08:00 เฉพาะวันที่มีเรื่อง: วันที่ถึงจุดเตือน · 1 วันก่อน · วันครบกำหนด (ของใกล้หมดเตือนเพิ่มตอนเหลือ 3 วัน) พร้อมลิงก์ร้านให้กดสั่ง · น้ำหนักลดผิดปกติ / ไม่ได้ชั่งนาน · วันเกิดและวันรับเลี้ยง (เช้าวันนั้น)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">เตือนวัคซีน / ยา ล่วงหน้า</span>
            <StepInput value={v.health_days} onChange={(x) => setV((p) => ({ ...p, health_days: Math.max(1, Math.min(30, Math.round(x ?? 3))) }))} integer min={1} max={30} unit="วัน" disabled={!canEdit} /></label>
          <label className="block text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">เตือนอาหาร / ทราย ใกล้หมด ล่วงหน้า</span>
            <StepInput value={v.supply_days} onChange={(x) => setV((p) => ({ ...p, supply_days: Math.max(1, Math.min(30, Math.round(x ?? 7))) }))} integer min={1} max={30} unit="วัน" disabled={!canEdit} /></label>
        </div>
        {canEdit && dirty && (
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setV(saved)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={async () => { if (await onSaveNotify(v, saved)) void loadLine(); }} className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">บันทึก</button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-semibold text-slate-700">พร้อมส่งไหม</h3>
        {line == null ? <p className="text-sm text-slate-400">กำลังตรวจ…</p> : (
          <ul className="space-y-1.5">
            <Check ok={line.botReady}>บอท LINE ของบริษัท {line.botReady ? "พร้อมใช้" : "ยังไม่ได้ตั้งโทเคน"}</Check>
            <Check ok={line.groupSet}>
              {line.groupSet ? "ตั้งกลุ่มแมวแล้ว" : <>ยังไม่ได้ตั้งกลุ่มแมว — เชิญบอทเข้ากลุ่ม LINE ของบ้าน · พิมพ์อะไรก็ได้ 1 ข้อความในกลุ่ม · แล้วไปที่ศูนย์ LINE ช่อง “กลุ่มแมว (ทะเบียนแมว)” กดใช้กลุ่มล่าสุด</>}
              {isAdmin && <a href="/admin/line" target="_blank" rel="noreferrer" className="ml-2 text-sky-700 hover:underline">เปิดศูนย์ LINE</a>}
            </Check>
            <Check ok={line.eventOn}>สวิตช์ “เตือนเรื่องแมว” ในศูนย์ LINE {line.eventOn ? "เปิดอยู่" : "ถูกปิดไว้"}</Check>
            <Check ok={saved.enabled}>แจ้งเตือนในแอปนี้ {saved.enabled ? "เปิดอยู่" : "ยังปิดอยู่ (เปิดด้านบนแล้วกดบันทึก)"}</Check>
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-400">โควตา LINE ฟรีของบริษัท 300 ข้อความ/เดือน ใช้ร่วมกันทั้งระบบ และนับตามจำนวนคนในกลุ่ม (กลุ่ม 4 คน ส่ง 1 ครั้ง = 4) — ระบบจึงรวมเป็นข้อความเดียวและส่งเฉพาะวันที่มีเรื่อง</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-700">ตัวอย่างข้อความ (ถ้าส่งตอนนี้)</h3>
          {canEdit && <button type="button" onClick={() => setConfirmTest(true)} disabled={testing || !preview} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"><Icon name="send" /> {testing ? "กำลังส่ง…" : "ส่งทดสอบตอนนี้"}</button>}
        </div>
        {preview ? <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700">{preview}</pre>
          : <p className="text-sm text-slate-400">ตอนนี้ไม่มีเรื่องที่อยู่ในช่วงเตือน — ถ้าวันไหนมี ระบบจะส่งให้เอง</p>}
      </section>

      <ConfirmDialog open={confirmTest} onClose={() => setConfirmTest(false)} onConfirm={() => void sendTest()} confirmText="ส่งเลย"
        title="ส่งข้อความทดสอบเข้ากลุ่ม LINE?" message="ข้อความจริงจะเข้ากลุ่มแมวทันที (ใช้โควตา LINE ตามจำนวนคนในกลุ่ม) ส่งแล้วดึงกลับไม่ได้" />
    </div>
  );
}
