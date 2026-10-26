"use client";
/**
 * 🔔 ตัวดึงแจ้งเตือนกลาง (ของกลาง) — กระดิ่ง + การ์ดแจ้งเตือนลอย ใช้ข้อมูลชุดเดียวกัน
 * - ถาม /api/notifications ทีเดียวต่อหน้า (ไม่ว่าจะมีกี่ตัวที่ใช้) · ทุก 30 วิ เฉพาะตอนแท็บเปิดอยู่ · กลับมาที่แท็บ = ถามทันที
 * - อ่านแล้ว/อ่านหมด อัปเดตทุกตัวพร้อมกัน (กดที่การ์ด กระดิ่งก็เปลี่ยนตาม)
 * ใช้: const feed = useNotificationFeed(user?.id) → { items, unread, loading, loaded, refresh, markRead, markAllRead }
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import type { Notification, NotificationsResponse } from "@/app/api/notifications/route";

const POLL_MS = 30_000;
const LIMIT = 20;

type Snapshot = { items: Notification[]; unread: number; loading: boolean; loaded: boolean };
const EMPTY: Snapshot = { items: [], unread: 0, loading: false, loaded: false };

let snap: Snapshot = EMPTY;
let owner: string | null = null;            // ข้อมูลตอนนี้เป็นของใคร (สลับผู้ใช้ = ล้าง)
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let firstTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: Partial<Snapshot>) {
  snap = { ...snap, ...next };
  listeners.forEach((l) => l());
}

export function refreshNotifications(): Promise<void> {
  if (inflight) return inflight;
  emit({ loading: true });
  inflight = (async () => {
    try {
      const res = await apiFetch(`/api/notifications?limit=${LIMIT}`);
      const j: NotificationsResponse = await res.json();
      if (!j.error) emit({ items: j.data, unread: j.unread_count, loaded: true });
    } catch { /* เงียบ — รอบถัดไปลองใหม่ */ } finally {
      inflight = null;
      emit({ loading: false });
    }
  })();
  return inflight;
}

const onVisible = () => { if (document.visibilityState === "visible") void refreshNotifications(); };

function start() {
  // perf: เลื่อนครั้งแรก ไม่แย่ง resource กับเนื้อหาหลักตอนเปิดหน้า
  firstTimer = setTimeout(() => { void refreshNotifications(); }, 1500);
  timer = setInterval(() => { if (document.visibilityState === "visible") void refreshNotifications(); }, POLL_MS);
  document.addEventListener("visibilitychange", onVisible);
}
function stop() {
  if (firstTimer) clearTimeout(firstTimer);
  if (timer) clearInterval(timer);
  firstTimer = null; timer = null;
  document.removeEventListener("visibilitychange", onVisible);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnap = () => snap;
const getServerSnap = () => EMPTY;

export function useNotificationFeed(userId: string | null | undefined) {
  const s = useSyncExternalStore(subscribe, getSnap, getServerSnap);

  useEffect(() => {
    if (!userId) return;
    if (owner !== userId) { owner = userId; snap = EMPTY; emit({}); }
    subscribers += 1;
    if (subscribers === 1) start();
    else if (!snap.loaded) void refreshNotifications();
    return () => { subscribers -= 1; if (subscribers === 0) stop(); };
  }, [userId]);

  const markRead = useCallback(async (n: Notification) => {
    if (n.read_at) return;
    const now = new Date().toISOString();
    emit({ items: snap.items.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)), unread: Math.max(0, snap.unread - 1) });
    try {
      await apiFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id }) });
    } catch { void refreshNotifications(); }
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    emit({ items: snap.items.map((x) => (x.read_at ? x : { ...x, read_at: now })), unread: 0 });
    try {
      await apiFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    } catch { void refreshNotifications(); }
  }, []);

  const mine = userId && owner === userId ? s : EMPTY;
  return { ...mine, refresh: refreshNotifications, markRead, markAllRead };
}
