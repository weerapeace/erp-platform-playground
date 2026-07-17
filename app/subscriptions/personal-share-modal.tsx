"use client";

/**
 * ป๊อปอัป "แชร์ลิสต์ส่วนตัวให้คนดู" — แชร์ระดับทั้งหน้า (view-only)
 * ใช้ ERPModal กลาง + MultiUserPicker กลาง · บันทึกผ่าน PUT /api/subscriptions/personal/shares
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { MultiUserPicker } from "../tasks/multi-user-picker";
import type { UserPickerValue } from "@/components/pickers";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";

export type ShareUser = { id: string; name: string };

export function PersonalShareModal({
  open, sharedWith, actorName, onClose, onSaved,
}: {
  open: boolean;
  sharedWith: ShareUser[];
  actorName?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [users, setUsers] = useState<UserPickerValue[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setUsers(sharedWith.map((u) => ({ id: u.id, name: u.name } as UserPickerValue)));
  }, [open, sharedWith]);

  const dirty = useMemo(() => {
    const a = [...users.map((u) => u.id)].sort().join(",");
    const b = [...sharedWith.map((u) => u.id)].sort().join(",");
    return a !== b;
  }, [users, sharedWith]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/subscriptions/personal/shares", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewer_ids: users.map((u) => u.id), actor: actorName }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success(users.length ? `แชร์ลิสต์ส่วนตัวให้ ${users.length} คนแล้ว` : "ยกเลิกการแชร์ทั้งหมดแล้ว");
      onSaved();
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal
      open={open} onClose={onClose} size="md"
      title="แชร์ลิสต์ส่วนตัวให้คนดู"
      description="คนที่เลือกจะเห็นรายการส่วนตัวทั้งหมดของคุณ แต่แก้ไข/ลบไม่ได้ (ดูอย่างเดียว)"
      hasUnsavedChanges={dirty}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="h-10 px-4 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          <button onClick={save} disabled={saving || !dirty}
            className="h-10 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : "💾 บันทึกการแชร์"}
          </button>
        </div>
      }
    >
      <div className="space-y-2 py-1">
        <label className="text-xs font-medium text-slate-500">เลือกคนที่จะให้ดูลิสต์ส่วนตัวของคุณ</label>
        <MultiUserPicker value={users} onChange={setUsers} disableCreate />
        <p className="text-[11px] text-slate-400">
          💡 เป็นการแชร์ทั้งหน้า — เพิ่มรายการส่วนตัวใหม่ในอนาคต คนที่แชร์ไว้จะเห็นด้วยอัตโนมัติ
        </p>
      </div>
    </ERPModal>
  );
}
