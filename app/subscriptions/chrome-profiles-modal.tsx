"use client";

/**
 * ป๊อปอัป "🖥️ โปรไฟล์ Chrome" — ทะเบียนว่าแต่ละโปรไฟล์ใช้อีเมล/โฟลเดอร์อะไร (ตั้งครั้งเดียว)
 * แก้ที่นี่ → ทุกรายการงานที่ใช้โปรไฟล์นี้เปลี่ยนตาม (API ไล่อัปเดตให้)
 * เปิดได้จากหัวหน้า App Subscription และจากฟอร์มรายการ (เลือก "＋ เพิ่มโปรไฟล์ใหม่…" / "แก้ในทะเบียน")
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { CHROME_PROFILES_API, validateChromeProfile, type ChromeProfile, type ChromeProfileInput } from "@/lib/chrome-profiles";

const INP = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white";
const BLANK: ChromeProfileInput = { nickname: "", account_email: "", chrome_profile_dir: "", chrome_profile_url: "" };

/** เปิดมาให้ทำอะไรทันที: เพิ่มใหม่ (เติมค่าตั้งต้นให้ได้ เช่น จากผู้ใช้ที่กรอกเอง) หรือแก้โปรไฟล์ที่ระบุ */
export type ChromeProfilesStart = { mode: "new"; init?: Partial<ChromeProfileInput> } | { mode: "edit"; id: string } | null;

export function ChromeProfilesModal({ open, profiles, canEdit, start, onClose, onChanged, onSaved }: {
  open: boolean;
  profiles: ChromeProfile[];
  canEdit: boolean;
  start?: ChromeProfilesStart;
  onClose: () => void;
  /** ทะเบียน/รายการเปลี่ยน → ให้หน้าโหลดใหม่ */
  onChanged: () => void | Promise<void>;
  /** บันทึกสำเร็จ (ฟอร์มใช้เลือกโปรไฟล์ที่เพิ่งสร้าง / อัปเดตผู้ใช้ที่ผูกชื่อเล่นเดิม) */
  onSaved?: (p: ChromeProfile, oldNickname: string | null) => void;
}) {
  const toast = useToast();
  const [editId, setEditId] = useState<string | null>(null); // "new" = แถวเพิ่มใหม่
  const [draft, setDraft] = useState<ChromeProfileInput>(BLANK);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const beginNew = (init?: Partial<ChromeProfileInput>) => {
    const d = { ...BLANK, ...init };
    setEditId("new"); setDraft(d); setDirty(Object.values(d).some((v) => v.trim())); setErr(null);
  };
  const beginEdit = (p: ChromeProfile) => {
    setEditId(p.id);
    setDraft({ nickname: p.nickname, account_email: p.account_email, chrome_profile_dir: p.chrome_profile_dir, chrome_profile_url: p.chrome_profile_url });
    setDirty(false); setErr(null);
  };
  const cancelEdit = () => { setEditId(null); setDirty(false); setErr(null); };

  // เปิดป๊อป → เริ่มตามที่สั่งมา (เพิ่มใหม่ / แก้ตัวที่ระบุ) ไม่งั้นแค่โชว์รายการ
  useEffect(() => {
    if (!open) return;
    if (start?.mode === "new") beginNew(start.init);
    else if (start?.mode === "edit") {
      const p = profiles.find((x) => x.id === start.id);
      if (p) beginEdit(p); else cancelEdit();
    } else cancelEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- เริ่มใหม่เฉพาะตอนเปิดป๊อป
  }, [open, start]);

  const patchDraft = (k: keyof ChromeProfileInput, v: string) => { setDraft((d) => ({ ...d, [k]: v })); setDirty(true); setErr(null); };

  const save = async () => {
    const isNew = editId === "new";
    const e = validateChromeProfile(draft, isNew);
    if (e) { setErr(e); return; }
    const before = isNew ? null : profiles.find((p) => p.id === editId) ?? null;
    setSaving(true);
    try {
      const res = await apiFetch(isNew ? CHROME_PROFILES_API : `${CHROME_PROFILES_API}/${editId}`, {
        method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.data) { setErr(j.error ?? "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
      const n = Number(j.updated) || 0;
      toast.success(n ? `บันทึกแล้ว · อัปเดต ${n} รายการที่ใช้โปรไฟล์นี้` : "บันทึกแล้ว");
      if (Number(j.failed)) toast.warning(`มี ${j.failed} รายการอัปเดตไม่สำเร็จ ลองบันทึกอีกครั้ง`);
      onSaved?.(j.data as ChromeProfile, before?.nickname ?? null);
      cancelEdit();
      await onChanged();
    } finally { setSaving(false); }
  };

  const remove = async (p: ChromeProfile) => {
    const ok = await askConfirm({
      title: `ลบโปรไฟล์ "${p.nickname}" ออกจากทะเบียน?`, variant: "danger", confirmText: "ลบโปรไฟล์",
      message: p.usage
        ? <>มี <b>{p.usage} รายการ</b> ใช้โปรไฟล์นี้อยู่ — รายการเหล่านั้นยังเก็บอีเมล/โฟลเดอร์เดิมไว้ แค่จะไม่เปลี่ยนตามทะเบียนอีก</>
        : "ยังไม่มีรายการไหนใช้โปรไฟล์นี้",
    });
    if (!ok) return;
    const res = await apiFetch(`${CHROME_PROFILES_API}/${p.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(j.error ?? "ลบไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
    toast.success("ลบโปรไฟล์แล้ว");
    if (editId === p.id) cancelEdit();
    await onChanged();
  };

  const editor = (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block mb-1 text-xs font-medium text-slate-600">ชื่อเล่นโปรไฟล์ <span className="text-red-500">*</span></span>
          <input value={draft.nickname} onChange={(e) => patchDraft("nickname", e.target.value)} placeholder="Gogo, Louis Team" className={INP} autoFocus />
        </label>
        <label className="block">
          <span className="block mb-1 text-xs font-medium text-slate-600">อีเมลบัญชี</span>
          <input value={draft.account_email} onChange={(e) => patchDraft("account_email", e.target.value)} placeholder="name@gmail.com" className={INP} />
        </label>
        <label className="block">
          <span className="block mb-1 text-xs font-medium text-slate-600">โฟลเดอร์โปรไฟล์ (สำหรับปุ่ม .bat เปิดบิล)</span>
          <input value={draft.chrome_profile_dir} onChange={(e) => patchDraft("chrome_profile_dir", e.target.value)} placeholder="Profile 3, Default" className={INP} />
        </label>
        <label className="block">
          <span className="block mb-1 text-xs font-medium text-slate-600">ลิงก์โปรไฟล์ Chrome</span>
          <input value={draft.chrome_profile_url} onChange={(e) => patchDraft("chrome_profile_url", e.target.value)} placeholder="https://…" className={INP} />
        </label>
      </div>
      <p className="text-[11px] text-slate-400">หาชื่อโฟลเดอร์: เปิด Chrome ในโปรไฟล์นั้น → พิมพ์ chrome://version ที่ช่อง URL → บรรทัด &quot;Profile Path&quot; คำท้ายสุดคือชื่อโฟลเดอร์</p>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={cancelEdit} disabled={saving} className="h-8 px-3 text-xs border border-slate-200 rounded-lg bg-white hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={save} disabled={saving}
          className="h-8 px-4 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </div>
  );

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="subs-chrome-profiles"
      title="🖥️ โปรไฟล์ Chrome" description="ตั้งครั้งเดียวว่าแต่ละโปรไฟล์ใช้อีเมลอะไร · แก้ที่นี่ ทุกรายการที่ใช้โปรไฟล์นี้เปลี่ยนตาม"
      hasUnsavedChanges={!!editId && dirty}
      footer={<button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>}>
      <div className="space-y-2">
        {canEdit && editId !== "new" && (
          <button type="button" onClick={() => beginNew()}
            className="w-full h-9 inline-flex items-center justify-center gap-1.5 text-sm text-indigo-700 border border-dashed border-indigo-200 rounded-lg hover:bg-indigo-50/50">
            <Icon name="add" /> เพิ่มโปรไฟล์
          </button>
        )}
        {editId === "new" && editor}

        {profiles.length === 0 && editId !== "new" && (
          <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีโปรไฟล์ในทะเบียน — กด &quot;เพิ่มโปรไฟล์&quot; เพื่อเริ่ม</p>
        )}

        {profiles.map((p) => editId === p.id ? <div key={p.id}>{editor}</div> : (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="w-8 h-8 shrink-0 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium flex items-center justify-center">
              {(p.nickname.trim()[0] ?? "?").toUpperCase()}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-slate-800 truncate">{p.nickname}</span>
              <span className="block text-xs truncate">
                {p.account_email ? <span className="text-slate-500">{p.account_email}</span> : <span className="text-amber-600">ยังไม่ใส่อีเมล</span>}
                <span className="text-slate-300"> · </span>
                {p.chrome_profile_dir ? <span className="text-slate-500">{p.chrome_profile_dir}</span> : <span className="text-slate-400">ยังไม่ระบุโฟลเดอร์</span>}
              </span>
            </span>
            <span className="text-[11px] text-slate-400 whitespace-nowrap">ใช้ใน {p.usage ?? 0} รายการ</span>
            {canEdit && (
              <span className="flex gap-1">
                <button type="button" onClick={() => beginEdit(p)} title="แก้ไข" aria-label={`แก้ไข ${p.nickname}`}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Icon name="edit" /></button>
                <button type="button" onClick={() => remove(p)} title="ลบ" aria-label={`ลบ ${p.nickname}`}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-red-100 text-red-500 hover:bg-red-50"><Icon name="delete" /></button>
              </span>
            )}
          </div>
        ))}
      </div>
    </ERPModal>
  );
}
