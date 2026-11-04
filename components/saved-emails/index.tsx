"use client";

// ============================================================
// 📇 ช่องเพิ่มอีเมลนอกระบบ + สมุดอีเมลที่บันทึกไว้ (ของกลาง)
//   พิมพ์อีเมล (+ ชื่อเรียก) → "เพิ่ม" = ใส่เป็นผู้รับ และ (ติ๊กไว้) บันทึกลงสมุด → ครั้งหน้ากดชิปเลือกได้เลย ไม่ต้องพิมพ์ใหม่
//   ชิป ⭐ = อีเมลที่บันทึกไว้ (ซ่อนตัวที่ใส่เป็นผู้รับแล้ว) · ✕ บนชิป = ลบออกจากสมุด (ถามก่อน · ไม่กระทบรายงานที่ใส่ไว้แล้ว)
// ข้อมูล: lib/email-contacts (ui_config "email_contacts") ผ่าน /api/admin/email-contacts · สิทธิ์ admin.email_reports
// ใช้ที่: หน้าแก้ไขรายงานอัตโนมัติ (app/admin/email-reports/report-editor) — หน้าอื่นที่ต้องใส่ผู้รับอีเมล ใช้ตัวนี้ได้เลย
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { emailContactLabel, type EmailContact } from "@/lib/email-contacts";

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** โหลด/เพิ่ม/ลบ สมุดอีเมลที่บันทึกไว้ */
export function useEmailContacts() {
  const [contacts, setContacts] = useState<EmailContact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    apiFetch("/api/admin/email-contacts").then((r) => r.json())
      .then((j) => { if (alive) { setContacts(Array.isArray(j.contacts) ? j.contacts : []); setError(j.error ?? null); } })
      .catch(() => { if (alive) setError("โหลดอีเมลที่บันทึกไว้ไม่สำเร็จ"); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);
  const save = useCallback(async (email: string, name: string | null): Promise<string | null> => {
    try {
      const res = await apiFetch("/api/admin/email-contacts", { method: "POST", body: JSON.stringify({ email, name }) });
      const j = await res.json();
      if (!res.ok || j.error) return j.error || "บันทึกอีเมลไม่สำเร็จ";
      setContacts(j.contacts ?? []);
      return null;
    } catch { return "บันทึกอีเมลไม่สำเร็จ"; }
  }, []);
  const remove = useCallback(async (email: string): Promise<string | null> => {
    try {
      const res = await apiFetch(`/api/admin/email-contacts?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok || j.error) return j.error || "ลบไม่สำเร็จ";
      setContacts(j.contacts ?? []);
      return null;
    } catch { return "ลบไม่สำเร็จ"; }
  }, []);
  return { contacts, loaded, error, save, remove };
}

/**
 * ช่องเพิ่มอีเมลนอกระบบ + ชิปอีเมลที่บันทึกไว้
 * existing = อีเมลที่เป็นผู้รับอยู่แล้ว (ตัวเล็ก) → ไม่ซ้ำ + ซ่อนชิปตัวนั้น · onAdd = ใส่เป็นผู้รับ (ผู้เรียกจัดการเอง)
 */
export function ExternalEmailAdder({ existing, onAdd }: { existing: string[]; onAdd: (email: string, name: string | null) => void }) {
  const toast = useToast();
  const { contacts, loaded, error: loadErr, save, remove } = useEmailContacts();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [keep, setKeep] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<EmailContact | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const has = new Set(existing.map((e) => e.toLowerCase()));
  const available = contacts.filter((c) => !has.has(c.email));

  const add = async () => {
    const e = email.trim().toLowerCase();
    const n = name.trim() || null;
    if (!EMAIL_RE.test(e)) { setErr("อีเมลไม่ถูกต้อง เช่น name@gmail.com"); return; }
    if (has.has(e)) { setErr("มีอีเมลนี้ในรายชื่อแล้ว"); return; }
    onAdd(e, n ?? contacts.find((c) => c.email === e)?.name ?? null);
    setEmail(""); setName(""); setErr(null);
    if (keep) {
      setBusy(true);
      const fail = await save(e, n);
      setBusy(false);
      if (fail) toast.error(`เพิ่มเป็นผู้รับแล้ว แต่บันทึกลงสมุดไม่สำเร็จ: ${fail}`);
      else toast.success(`บันทึก ${n ? `${n} (${e})` : e} ไว้แล้ว — ครั้งหน้ากดเลือกได้เลย`);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    const fail = await remove(removing.email);
    setRemoveBusy(false);
    if (fail) toast.error(fail); else toast.success(`ลบ ${removing.email} ออกจากอีเมลที่บันทึกไว้แล้ว`);
    setRemoving(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <input value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }}
          placeholder="อีเมลนอกระบบ เช่น partner@gmail.com" inputMode="email" aria-label="อีเมลนอกระบบ"
          className="h-9 min-w-[12rem] flex-[2] rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }}
          placeholder="ชื่อเรียก (ไม่บังคับ) เช่น ฝ่ายบัญชี" aria-label="ชื่อเรียก" maxLength={80}
          className="h-9 min-w-[8rem] flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="button" onClick={() => void add()} disabled={busy}
          className="h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "เพิ่ม"}</button>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-4 w-4" />
        ⭐ บันทึกอีเมลนี้ไว้ใช้ครั้งหน้า
      </label>
      {err && <p className="text-xs text-rose-600">{err}</p>}

      {/* สมุดอีเมลที่บันทึกไว้ — กดเพื่อใส่เป็นผู้รับ */}
      {loaded && (contacts.length > 0 || loadErr) && (
        <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
          <div className="mb-1 text-[11px] text-slate-500">อีเมลที่บันทึกไว้ <span className="text-slate-400">— กดเพื่อเพิ่มเป็นผู้รับ</span></div>
          {loadErr ? <p className="text-xs text-rose-600">⚠ {loadErr}</p>
            : available.length === 0 ? <p className="text-xs text-slate-400">ใส่ครบทุกอีเมลที่บันทึกไว้แล้ว</p>
            : (
              <div className="flex flex-wrap gap-1">
                {available.map((c) => (
                  <span key={c.email} className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 text-xs text-amber-900">
                    <button type="button" onClick={() => onAdd(c.email, c.name)} title={`เพิ่ม ${c.email} เป็นผู้รับ`} className="rounded-l-full py-0.5 pl-2 pr-1 hover:bg-amber-100">
                      ⭐ {emailContactLabel(c)}
                    </button>
                    <button type="button" onClick={() => setRemoving(c)} aria-label={`ลบ ${c.email} ออกจากอีเมลที่บันทึกไว้`} title="ลบออกจากอีเมลที่บันทึกไว้"
                      className="flex h-5 w-5 items-center justify-center rounded-full text-amber-500 hover:bg-amber-200 hover:text-amber-900">✕</button>
                  </span>
                ))}
              </div>
            )}
        </div>
      )}

      <ConfirmDialog open={!!removing} onClose={() => { if (!removeBusy) setRemoving(null); }} onConfirm={() => void confirmRemove()} loading={removeBusy} variant="danger"
        title="ลบอีเมลออกจากที่บันทึกไว้?" confirmText="ลบออก"
        message={<p className="text-sm">ลบ <b>{removing ? emailContactLabel(removing) : ""}</b> ออกจากสมุดอีเมล — รายงานที่ใส่อีเมลนี้เป็นผู้รับไว้แล้วยังส่งถึงเหมือนเดิม</p>} />
    </div>
  );
}
