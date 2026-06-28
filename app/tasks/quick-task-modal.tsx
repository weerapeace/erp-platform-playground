"use client";

// ============================================================
// งานด่วน (Quick Task) — เพิ่มงานเร็ว ๆ มีแค่ รายละเอียดงาน + ผู้รับผิดชอบ + ผู้มอบหมาย
// ไม่ผ่าน Wizard · ผู้มอบหมายดีฟอลต์ = ตัวเอง (เลือกคนอื่นได้)
// ============================================================

import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPTextarea } from "@/components/form";
import { UserPicker } from "@/components/pickers";
import type { UserPickerValue } from "@/components/pickers";
import { useT } from "@/components/i18n";
import { createTask } from "./data";

export function QuickTaskModal({ open, onClose, onCreated, pushToast, me, lockedCampaignId }: {
  open: boolean;
  onClose: () => void;
  onCreated: (res: { id: string; task_no: string }) => void;
  pushToast: (type: "success" | "error" | "info", m: string) => void;
  me?: UserPickerValue | null;
  lockedCampaignId?: string;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<UserPickerValue | null>(null);
  const [assignedTo, setAssignedTo] = useState<UserPickerValue | null>(null);
  const [assigner, setAssigner] = useState<UserPickerValue | null>(me ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setTitle(""); setAssignee(null); setAssignedTo(null); setAssigner(me ?? null); } }, [open, me]);

  const save = async () => {
    const ttl = title.trim();
    if (!ttl) { pushToast("error", t("กรุณาใส่รายละเอียดงาน", "Please enter task details")); return; }
    setSaving(true);
    try {
      const { id, task_no } = await createTask({
        title: ttl,
        assignee_id: assignee?.id ?? null, assignee_ids: assignee ? [assignee.id] : [],
        assigned_to_id: assignedTo?.id ?? null,
        assigned_by_id: assigner?.id ?? null,
        campaign_id: lockedCampaignId || null,
      });
      pushToast("success", t(`สร้างงานด่วน ${task_no} แล้ว`, `Quick task ${task_no} created`));
      onCreated({ id, task_no });
      onClose();
    } catch (e) { pushToast("error", (e as Error).message); } finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="md" title={t("⚡ งานด่วน", "⚡ Quick task")} hasUnsavedChanges={!!title.trim()}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังสร้าง...", "Creating...") : t("สร้างงาน", "Create")}</button>
      </>}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-500">{t("รายละเอียดงาน", "Task details")} <span className="text-red-500">*</span></label>
          <ERPTextarea value={title} rows={3} onChange={(e) => setTitle(e.target.value)} placeholder={t("เช่น แก้แบนเนอร์หน้าร้าน Shopee ให้เสร็จวันนี้", "e.g. Fix the Shopee storefront banner today")} />
        </div>
        <div>
          <label className="text-xs text-slate-500">{t("ผู้รับผิดชอบ", "Responsible")}</label>
          <UserPicker value={assignee} onChange={setAssignee} disableCreate />
        </div>
        <div>
          <label className="text-xs text-slate-500">{t("มอบหมายให้", "Assigned to")}</label>
          <UserPicker value={assignedTo} onChange={setAssignedTo} disableCreate />
        </div>
        <div>
          <label className="text-xs text-slate-500">{t("ผู้มอบหมาย", "Assigned by")} <span className="text-slate-400">({t("ดีฟอลต์ = ฉัน", "default = me")})</span></label>
          <UserPicker value={assigner} onChange={setAssigner} disableCreate />
        </div>
      </div>
    </ERPModal>
  );
}
