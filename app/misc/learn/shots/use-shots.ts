"use client";

/**
 * 🎬 Video Shot — โหลดคลังช็อต + สั่งเขียนผ่าน API กลาง /api/learn/shots (หน้าไม่แตะฐานข้อมูลตรง)
 *   ทุกการเขียนมีทางย้อน: เพิ่ม → "ย้อนกลับ" = ย้ายเข้าถังขยะ · แก้ → คืนค่าเดิม · ลบ → กู้คืน · จัดลำดับ → คืนลำดับเดิม
 */
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import type { VideoShot, VideoShotList } from "@/lib/video-shot";
import { call } from "../use-learn";

export type ShotDraft = Partial<Pick<VideoShot, "title" | "url" | "list_id" | "shot_size" | "camera_move" | "note" | "thumb_url">> & {
  start_sec?: number | string | null; end_sec?: number | string | null; tags?: string[] | string;
};

export type ShotMeta = { platform: VideoShot["platform"]; id: string; url: string; startHint: number | null; title: string | null; thumb_url: string | null };

/** ช่องที่ส่ง PATCH คืนค่าเดิมได้ */
const snapshot = (s: VideoShot): ShotDraft => ({
  title: s.title, url: s.url, list_id: s.list_id, shot_size: s.shot_size, camera_move: s.camera_move,
  note: s.note, thumb_url: s.thumb_url, start_sec: s.start_sec, end_sec: s.end_sec, tags: s.tags,
});

export function useShots(trash = false) {
  const [shots, setShots] = useState<VideoShot[]>([]);
  const [lists, setLists] = useState<VideoShotList[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await call(`/api/learn/shots${trash ? "?trash=1" : ""}`, "GET");
    if (r.error) setError(r.error);
    else {
      const d = (r.data ?? {}) as { shots?: VideoShot[]; lists?: VideoShotList[] };
      setShots(d.shots ?? []); setLists(d.lists ?? []); setCanManage(!!r.canManage); setError(null);
    }
    setLoading(false);
  }, [trash]);

  useEffect(() => { void reload(); }, [reload]);
  return { shots, lists, canManage, loading, error, reload };
}

export async function fetchShotMeta(url: string): Promise<{ data: ShotMeta | null; error: string | null }> {
  const r = await call(`/api/learn/shots/meta?url=${encodeURIComponent(url)}`, "GET");
  return { data: (r.data as ShotMeta) ?? null, error: r.error ?? null };
}

export function useShotWrite(after: () => void | Promise<void>) {
  const toast = useToast();

  const create = useCallback(async (d: ShotDraft): Promise<VideoShot | null> => {
    const r = await call("/api/learn/shots", "POST", d);
    if (r.error) { toast.error(r.error); return null; }
    const s = r.data as VideoShot;
    await after();
    toast.action(`เพิ่มช็อต "${s.title}" แล้ว`, "ย้อนกลับ", async () => {
      const u = await call(`/api/learn/shots/${s.id}`, "DELETE");
      if (u.error) toast.error(u.error); else { await after(); toast.info("ย้ายเข้าถังขยะแล้ว"); }
    });
    return s;
  }, [toast, after]);

  const update = useCallback(async (before: VideoShot, patch: ShotDraft, msg = "บันทึกช็อตแล้ว"): Promise<VideoShot | null> => {
    const r = await call(`/api/learn/shots/${before.id}`, "PATCH", patch);
    if (r.error) { toast.error(r.error); return null; }
    await after();
    toast.action(msg, "ย้อนกลับ", async () => {
      const u = await call(`/api/learn/shots/${before.id}`, "PATCH", snapshot(before));
      if (u.error) toast.error(u.error); else { await after(); toast.info("คืนค่าเดิมแล้ว"); }
    });
    return r.data as VideoShot;
  }, [toast, after]);

  const remove = useCallback(async (s: VideoShot): Promise<boolean> => {
    const r = await call(`/api/learn/shots/${s.id}`, "DELETE");
    if (r.error) { toast.error(r.error); return false; }
    await after();
    toast.undo(`ลบ "${s.title}" แล้ว (อยู่ในถังขยะ)`, async () => {
      const u = await call(`/api/learn/shots/${s.id}`, "PATCH", { is_active: true });
      if (u.error) toast.error(u.error); else { await after(); toast.info("กู้คืนแล้ว"); }
    });
    return true;
  }, [toast, after]);

  const restore = useCallback(async (s: VideoShot) => {
    const r = await call(`/api/learn/shots/${s.id}`, "PATCH", { is_active: true });
    if (r.error) { toast.error(r.error); return false; }
    await after(); toast.success(`กู้คืน "${s.title}" แล้ว`); return true;
  }, [toast, after]);

  const purge = useCallback(async (s: VideoShot) => {
    const r = await call(`/api/learn/shots/${s.id}?hard=1`, "DELETE");
    if (r.error) { toast.error(r.error); return false; }
    await after(); toast.success(`ลบ "${s.title}" ถาวรแล้ว`); return true;
  }, [toast, after]);

  /** จัดลำดับใหม่ · ย้อนกลับ = ส่งลำดับเดิม */
  const reorder = useCallback(async (ids: string[], prev: string[]) => {
    const r = await call("/api/learn/shots/reorder", "POST", { ids });
    if (r.error) { toast.error(r.error); return false; }
    await after();
    toast.undo("จัดลำดับแล้ว", async () => {
      const u = await call("/api/learn/shots/reorder", "POST", { ids: prev });
      if (u.error) toast.error(u.error); else { await after(); toast.info("คืนลำดับเดิมแล้ว"); }
    });
    return true;
  }, [toast, after]);

  // ── ชุดช็อต ──
  const createList = useCallback(async (name: string, description: string | null): Promise<VideoShotList | null> => {
    const r = await call("/api/learn/shots/lists", "POST", { name, description });
    if (r.error) { toast.error(r.error); return null; }
    const l = r.data as VideoShotList;
    await after();
    toast.action(`สร้างชุด "${l.name}" แล้ว`, "ย้อนกลับ", async () => {
      const u = await call(`/api/learn/shots/lists/${l.id}`, "DELETE");
      if (u.error) toast.error(u.error); else { await after(); toast.info("ย้ายชุดเข้าถังขยะแล้ว"); }
    });
    return l;
  }, [toast, after]);

  const updateList = useCallback(async (before: VideoShotList, patch: { name?: string; description?: string | null }) => {
    const r = await call(`/api/learn/shots/lists/${before.id}`, "PATCH", patch);
    if (r.error) { toast.error(r.error); return false; }
    await after();
    toast.action("บันทึกชุดช็อตแล้ว", "ย้อนกลับ", async () => {
      const u = await call(`/api/learn/shots/lists/${before.id}`, "PATCH", { name: before.name, description: before.description });
      if (u.error) toast.error(u.error); else { await after(); toast.info("คืนค่าเดิมแล้ว"); }
    });
    return true;
  }, [toast, after]);

  const removeList = useCallback(async (l: VideoShotList) => {
    const r = await call(`/api/learn/shots/lists/${l.id}`, "DELETE");
    if (r.error) { toast.error(r.error); return false; }
    await after();
    toast.undo(`ลบชุด "${l.name}" แล้ว (ช็อตในชุดยังอยู่)`, async () => {
      const u = await call(`/api/learn/shots/lists/${l.id}`, "PATCH", { is_active: true });
      if (u.error) toast.error(u.error); else { await after(); toast.info("กู้คืนชุดแล้ว"); }
    });
    return true;
  }, [toast, after]);

  const restoreList = useCallback(async (l: VideoShotList) => {
    const r = await call(`/api/learn/shots/lists/${l.id}`, "PATCH", { is_active: true });
    if (r.error) { toast.error(r.error); return false; }
    await after(); toast.success(`กู้คืนชุด "${l.name}" แล้ว`); return true;
  }, [toast, after]);

  const purgeList = useCallback(async (l: VideoShotList) => {
    const r = await call(`/api/learn/shots/lists/${l.id}?hard=1`, "DELETE");
    if (r.error) { toast.error(r.error); return false; }
    await after(); toast.success(`ลบชุด "${l.name}" ถาวรแล้ว`); return true;
  }, [toast, after]);

  return { create, update, remove, restore, purge, reorder, createList, updateList, removeList, restoreList, purgeList };
}
