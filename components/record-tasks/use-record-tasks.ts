"use client";

/**
 * useRecordTasks — โหลด/เพิ่ม/ติ๊ก/แก้/ลบ เช็กลิสต์กลาง (erp_record_tasks ผ่าน /api/record-tasks) ที่เดียว
 * ใช้โดย RecordTasksButton (Drawer) · RecordChecklist (ฝังในฟอร์ม) · RecordChecklistChip (บนการ์ด)
 * แก้แบบ optimistic (เห็นผลทันที) · พลาด = คืนค่า + toast · onChange เรียกหลังแก้ทุกครั้ง (ให้หน้าแม่อัปเดตสรุปบนการ์ด)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { isTaskDone } from "@/lib/record-tasks";
import type { RecordTask } from "@/app/api/record-tasks/route";

export function useRecordTasks({ moduleKey, recordId = null, recordType = null, enabled = true, onChange }: {
  moduleKey: string;
  /** null = เช็กลิสต์ส่วนกลางของหน้า/โมดูล */
  recordId?: string | null;
  recordType?: string | null;
  /** false = ยังไม่โหลด (เช่น ป๊อปบนการ์ดที่ยังไม่เปิด) */
  enabled?: boolean;
  onChange?: (items: RecordTask[]) => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<RecordTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const changed = useRef(false);   // แก้จากผู้ใช้ (ไม่ใช่โหลด) → แจ้ง onChange หลัง state เปลี่ยน
  const update = (fn: (p: RecordTask[]) => RecordTask[]) => { changed.current = true; setItems(fn); };
  useEffect(() => { if (changed.current) { changed.current = false; onChangeRef.current?.(items); } }, [items]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ module_key: moduleKey });
      if (recordId) qs.set("record_id", recordId);
      const j = await apiFetch(`/api/record-tasks?${qs}`).then((r) => r.json());
      if (!j.error) { setItems((j.data ?? []) as RecordTask[]); setLoaded(true); }
    } catch { /* โชว์ของเดิมไว้ */ } finally { setLoading(false); }
  }, [moduleKey, recordId]);

  useEffect(() => { if (enabled) void load(); }, [enabled, load]);

  /** เพิ่มข้อ (ใส่ผู้รับผิดชอบพร้อมกันได้ — กระดิ่งเด้งบอกคนนั้น) */
  const add = async (title: string, assignee: { id: string; name: string } | null = null): Promise<boolean> => {
    const t = title.trim(); if (!t) return false;
    try {
      const j = await apiFetch("/api/record-tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_key: moduleKey, record_id: recordId, record_type: recordType, title: t, actor: user?.name, assigned_to: assignee?.id ?? null }),
      }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      update((p) => [...p, j.data as RecordTask]);
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); return false; }
  };

  const toggle = async (it: RecordTask) => {
    const next = isTaskDone(it.status) ? "open" : "resolved";   // "เสร็จ" = resolved (ตาม check constraint ของตาราง)
    const done = next === "resolved";
    update((p) => p.map((x) => (x.id === it.id ? { ...x, status: next, resolved_by: done ? user?.name ?? null : null, resolved_at: done ? new Date().toISOString() : null } : x)));
    try {
      const r = await apiFetch(`/api/record-tasks/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next, actor: user?.name }) });
      if (!r.ok) throw new Error();
    } catch { update((p) => p.map((x) => (x.id === it.id ? it : x))); toast.error("อัปเดตไม่สำเร็จ"); }
  };

  const rename = async (it: RecordTask, title: string) => {
    const t = title.trim();
    if (!t || t === it.title) return;
    update((p) => p.map((x) => (x.id === it.id ? { ...x, title: t } : x)));
    try {
      const r = await apiFetch(`/api/record-tasks/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: t, actor: user?.name }) });
      if (!r.ok) throw new Error();
    } catch { update((p) => p.map((x) => (x.id === it.id ? it : x))); toast.error("แก้ข้อความไม่สำเร็จ"); }
  };

  /** เปลี่ยนผู้รับผิดชอบ (null = ไม่ระบุ) — คนใหม่ได้กระดิ่งเด้งบอก */
  const assign = async (it: RecordTask, who: { id: string; name: string } | null) => {
    if ((who?.id ?? null) === (it.assigned_to ?? null)) return;
    update((p) => p.map((x) => (x.id === it.id ? { ...x, assigned_to: who?.id ?? null, assigned_name: who?.name ?? null } : x)));
    try {
      const r = await apiFetch(`/api/record-tasks/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assigned_to: who?.id ?? null, actor: user?.name }) });
      if (!r.ok) throw new Error();
    } catch { update((p) => p.map((x) => (x.id === it.id ? it : x))); toast.error("เปลี่ยนผู้รับผิดชอบไม่สำเร็จ"); }
  };

  const remove = async (it: RecordTask) => {
    update((p) => p.filter((x) => x.id !== it.id));
    try { const r = await apiFetch(`/api/record-tasks/${it.id}`, { method: "DELETE" }); if (!r.ok) throw new Error(); }
    catch { toast.error("ลบไม่สำเร็จ"); void load(); }
  };

  return { items, loading, loaded, load, add, toggle, rename, assign, remove };
}

/** "เมื่อสักครู่ / 5 นาทีที่แล้ว / 23 ต.ค." */
export const relTime = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "เมื่อสักครู่";
  if (d < 3600) return `${Math.floor(d / 60)} นาทีที่แล้ว`;
  if (d < 86400) return `${Math.floor(d / 3600)} ชม.ที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
};
