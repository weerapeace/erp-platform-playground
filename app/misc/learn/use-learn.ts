"use client";

/**
 * 🎓 ศูนย์เรียนรู้ — โหลดบทเรียน + สั่งเขียนผ่าน API กลาง /api/learn (หน้าไม่แตะฐานข้อมูลตรง)
 *   ทุกการเขียนมีทางย้อน: สร้าง → "ย้อนกลับ" = ย้ายเข้าถังขยะ · แก้/เผยแพร่ → "ย้อนกลับ" = คืนเวอร์ชันเดิมทั้งบท · ลบ → "ย้อนกลับ" = กู้คืน
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import type { Lesson, LessonStep } from "@/lib/learn";

export type LessonDraft = Pick<Lesson, "title" | "icon" | "description" | "category" | "status" | "source_url" | "source_title"> & { steps: LessonStep[] };

export async function call(url: string, method: string, body?: unknown): Promise<{ data?: unknown; error?: string | null; canManage?: boolean }> {
  try {
    const res = await apiFetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({ error: "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง" }));
    if (!res.ok && !json.error) json.error = res.status === 401 || res.status === 403 ? "คุณไม่มีสิทธิ์ทำรายการนี้" : "บันทึกไม่ได้ ลองใหม่อีกครั้ง";
    return json;
  } catch {
    return { error: "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง" };
  }
}

/** ตัดช่องที่ API ไม่รับ (id/วันที่) ออก → ก้อนที่ส่ง PATCH คืนเวอร์ชันเดิมได้ */
export function toDraft(l: Lesson): LessonDraft {
  return {
    title: l.title, icon: l.icon, description: l.description, category: l.category, status: l.status,
    source_url: l.source_url, source_title: l.source_title,
    steps: l.steps.map(({ id: _id, ...s }) => s),
  };
}

export function useLessons(trash = false) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await call(`/api/learn${trash ? "?trash=1" : ""}`, "GET");
    if (r.error) setError(r.error);
    else { setLessons((r.data ?? []) as Lesson[]); setCanManage(!!r.canManage); setError(null); }
    setLoading(false);
  }, [trash]);

  useEffect(() => { void reload(); }, [reload]);
  return { lessons, canManage, loading, error, reload };
}

export function useLessonWrite(after: () => void | Promise<void>) {
  const toast = useToast();

  const create = useCallback(async (d: LessonDraft): Promise<Lesson | null> => {
    const r = await call("/api/learn", "POST", d);
    if (r.error) { toast.error(r.error); return null; }
    const l = r.data as Lesson;
    await after();
    toast.action(`สร้างบทเรียน "${l.title}" แล้ว`, "ย้อนกลับ", async () => {
      const u = await call(`/api/learn/${l.id}`, "DELETE");
      if (u.error) toast.error(u.error); else { await after(); toast.info("ย้ายเข้าถังขยะแล้ว"); }
    });
    return l;
  }, [toast, after]);

  /** before = เวอร์ชันก่อนแก้ (ปุ่มย้อนกลับคืนทั้งบท) */
  const update = useCallback(async (before: Lesson, patch: Partial<LessonDraft>, msg = "บันทึกบทเรียนแล้ว"): Promise<Lesson | null> => {
    const r = await call(`/api/learn/${before.id}`, "PATCH", patch);
    if (r.error) { toast.error(r.error); return null; }
    await after();
    toast.action(msg, "ย้อนกลับ", async () => {
      const u = await call(`/api/learn/${before.id}`, "PATCH", toDraft(before));
      if (u.error) toast.error(u.error); else { await after(); toast.info("คืนเวอร์ชันเดิมแล้ว"); }
    });
    return r.data as Lesson;
  }, [toast, after]);

  const remove = useCallback(async (l: Lesson): Promise<boolean> => {
    const r = await call(`/api/learn/${l.id}`, "DELETE");
    if (r.error) { toast.error(r.error); return false; }
    await after();
    toast.undo(`ลบ "${l.title}" แล้ว (อยู่ในถังขยะ)`, async () => {
      const u = await call(`/api/learn/${l.id}`, "PATCH", { is_active: true });
      if (u.error) toast.error(u.error); else { await after(); toast.info("กู้คืนแล้ว"); }
    });
    return true;
  }, [toast, after]);

  const restore = useCallback(async (l: Lesson): Promise<boolean> => {
    const r = await call(`/api/learn/${l.id}`, "PATCH", { is_active: true });
    if (r.error) { toast.error(r.error); return false; }
    await after();
    toast.success(`กู้คืน "${l.title}" แล้ว`);
    return true;
  }, [toast, after]);

  const purge = useCallback(async (l: Lesson): Promise<boolean> => {
    const r = await call(`/api/learn/${l.id}?hard=1`, "DELETE");
    if (r.error) { toast.error(r.error); return false; }
    await after();
    toast.success(`ลบ "${l.title}" ถาวรแล้ว`);
    return true;
  }, [toast, after]);

  return { create, update, remove, restore, purge };
}
