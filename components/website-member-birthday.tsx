"use client";

/**
 * 🎂 แก้/ล้างวันเกิดสมาชิก (ERP แท็บสมาชิก) — สมาชิกตั้งเองในหน้าบัญชีได้ครั้งเดียว ร้านแก้ให้ที่นี่ (PATCH /api/website/members · บันทึกประวัติ)
 * เก็บแค่วัน+เดือน ไม่เก็บปี · ใช้ออกคูปองวันเกิด (lib/website-birthday · ตั้งค่าที่ ข้อมูลร้าน › 🎂)
 * ⚠️ แก้เดือนเกิดหลังคูปองปีนี้ออกไปแล้ว = ไม่ออกใบใหม่ในปีเดียวกัน (1 คน 1 ใบต่อปี)
 * ของกลาง: ERPModal · กฎตรวจวันที่ validBirthday (ใช้ร่วมกับ API)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { validBirthday } from "@/lib/website-birthday";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "12 มี.ค." */
export const birthdayText = (month: number | null, day: number | null): string => (month && day ? `${day} ${MONTHS[month - 1]}` : "—");

export function MemberBirthdayModal({ member, onClose, onSaved }: { member: { id: string; name: string; birthMonth: number | null; birthDay: number | null } | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setMonth(member?.birthMonth ? String(member.birthMonth) : "");
    setDay(member?.birthDay ? String(member.birthDay) : "");
  }, [member]);
  const dirty = !!member && (month !== (member.birthMonth ? String(member.birthMonth) : "") || day !== (member.birthDay ? String(member.birthDay) : ""));
  const bad = !!(month || day) && !validBirthday(month, day);

  const save = async (clear = false) => {
    if (!member) return;
    setBusy(true);
    try {
      const body = clear ? { id: member.id, birthMonth: null, birthDay: null } : { id: member.id, birthMonth: Number(month), birthDay: Number(day) };
      const r = await apiFetch("/api/website/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) return toast.error(j.error ?? "บันทึกไม่สำเร็จ");
      toast.success(clear ? `ล้างวันเกิดของ ${member.name} แล้ว — สมาชิกตั้งใหม่เองได้` : `บันทึกวันเกิด ${member.name} แล้ว`);
      onSaved();
      onClose();
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ERPModal
      open={!!member}
      onClose={onClose}
      title={`🎂 วันเกิดของ ${member?.name ?? ""}`}
      description="เก็บแค่วันและเดือน (ไม่เก็บปี) · ใช้ออกคูปองวันเกิด · สมาชิกตั้งเองได้ครั้งเดียว"
      size="sm"
      hasUnsavedChanges={dirty}
      loading={busy}
      footer={
        <div className="flex items-center justify-end gap-2">
          {member?.birthMonth && (
            <button type="button" disabled={busy} onClick={() => void save(true)} className="mr-auto h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40">
              ล้างวันเกิด
            </button>
          )}
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg border border-slate-200 text-sm">
            ปิด
          </button>
          <button type="button" disabled={!dirty || bad || !month || !day || busy} onClick={() => void save()} className="h-9 px-4 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-40">
            บันทึก
          </button>
        </div>
      }
    >
      <div className="flex items-end gap-2" data-member-birthday-form>
        <label className="block">
          <span className="block text-xs text-slate-500 mb-1">วัน</span>
          <select className="h-9 rounded-lg border border-slate-200 px-2 text-sm" value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">—</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-slate-500 mb-1">เดือน</span>
          <select className="h-9 rounded-lg border border-slate-200 px-2 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">—</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      {bad && <p className="mt-2 text-xs text-red-600">วันที่นี้ไม่มีในเดือนนั้น</p>}
      <p className="mt-3 text-[11px] text-slate-500">แก้เดือนเกิดหลังสมาชิกได้คูปองวันเกิดปีนี้ไปแล้ว = ปีนี้ไม่ออกใบใหม่ (1 คน 1 ใบต่อปี)</p>
    </ERPModal>
  );
}
