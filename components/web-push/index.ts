"use client";
/**
 * 📲 useWebPush — เปิด/ปิดรับแจ้งเตือนเด้ง "บนเครื่องนี้" (ของกลาง ฝั่งหน้าจอ)
 *
 * - ลงทะเบียน service worker /notify-sw.js (scope /notify — ไม่ยุ่งกับหน้าอื่นของ ERP)
 * - enable() ต้องเรียกจากการกดปุ่มเท่านั้น (iPhone บังคับ) · ขอสิทธิ์ก่อนทำอย่างอื่น
 * - เปิดแอปทุกครั้ง = ต่ออายุการสมัคร + สมัครใหม่ให้เองถ้ากุญแจระบบเปลี่ยน/การสมัครหมดอายุ (เคยเปิดไว้)
 * ฝั่งเซิร์ฟเวอร์: /api/push/subscriptions · ส่งจริง lib/push-server
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { PushDevice } from "@/app/api/push/subscriptions/route";
import type { PushPrefs } from "@/lib/push-categories";

export const NOTIFY_SW_URL = "/notify-sw.js";
export const NOTIFY_SW_SCOPE = "/notify";
const WANTED_KEY = "notify_push_wanted";   // จำว่าเครื่องนี้เคยเปิดรับ → สมัครใหม่ให้เองเมื่อหลุด

export type PushSupport =
  | "ok"
  | "ios_needs_install"   // iPhone/iPad ที่ยังไม่ได้เปิดจากไอคอนหน้าจอโฮม
  | "unsupported";        // เบราว์เซอร์นี้ส่งแจ้งเตือนเด้งไม่ได้

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(buf: ArrayBuffer | null | undefined): string {
  if (!buf) return "";
  let bin = ""; for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* โหมดส่วนตัว */ } },
};

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function detectSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  const has = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (ios && !isStandalone()) return "ios_needs_install";
  return has ? "ok" : "unsupported";
}

async function postSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  const res = await apiFetch("/api/push/subscriptions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: { endpoint: json.endpoint, keys: json.keys }, standalone: isStandalone() }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "บันทึกเครื่องนี้ไม่สำเร็จ");
}

export function useWebPush() {
  const [support, setSupport] = useState<PushSupport>("ok");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [endpoint, setEndpoint] = useState<string | null>(null);   // การสมัครของเครื่องนี้ (null = ยังไม่เปิดรับ)
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [prefs, setPrefs] = useState<PushPrefs>({ off: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string>("");

  const fetchServer = useCallback(async () => {
    const res = await apiFetch("/api/push/subscriptions");
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "โหลดไม่สำเร็จ");
    keyRef.current = j.publicKey;
    setDevices(j.devices ?? []);
    setPrefs(j.prefs ?? { off: [] });
  }, []);

  const subscribe = useCallback(async (): Promise<PushSubscription> => {
    const reg = await navigator.serviceWorker.register(NOTIFY_SW_URL, { scope: NOTIFY_SW_SCOPE });
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(keyRef.current) });
    await postSubscription(sub);
    return sub;
  }, []);

  /** โหลดสถานะ + ต่ออายุการสมัครของเครื่องนี้ (เรียกตอนเปิดแอป) */
  const load = useCallback(async () => {
    setError(null);
    const s = detectSupport();
    setSupport(s);
    try {
      await fetchServer();
      if (s !== "ok") return;
      setPermission(Notification.permission);
      const reg = await navigator.serviceWorker.register(NOTIFY_SW_URL, { scope: NOTIFY_SW_SCOPE });
      let sub = await reg.pushManager.getSubscription();
      // กุญแจระบบเปลี่ยน → การสมัครเดิมใช้ไม่ได้ ต้องสมัครใหม่
      if (sub && keyRef.current && bytesToB64url(sub.options?.applicationServerKey) !== keyRef.current) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
      if (sub) await postSubscription(sub);
      else if (Notification.permission === "granted" && store.get(WANTED_KEY) === "1") sub = await subscribe();
      setEndpoint(sub?.endpoint ?? null);
      if (sub) await fetchServer();
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [fetchServer, subscribe]);

  useEffect(() => { void load(); }, [load]);

  /** เปิดรับบนเครื่องนี้ — เรียกจากปุ่มเท่านั้น */
  const enable = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (detectSupport() !== "ok") return false;
    // ขอสิทธิ์ก่อนทำอย่างอื่น (iPhone ยอมเฉพาะในจังหวะที่กดปุ่ม)
    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") return false;
    setBusy(true);
    try {
      if (!keyRef.current) await fetchServer();
      const sub = await subscribe();
      store.set(WANTED_KEY, "1");
      setEndpoint(sub.endpoint);
      await fetchServer();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "เปิดรับไม่สำเร็จ");
      return false;
    } finally { setBusy(false); }
  }, [fetchServer, subscribe]);

  /** ปิดรับบนเครื่องนี้ */
  const disable = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration(NOTIFY_SW_SCOPE);
      const sub = await reg?.pushManager.getSubscription();
      const ep = sub?.endpoint ?? endpoint;
      await sub?.unsubscribe().catch(() => {});
      if (ep) await apiFetch("/api/push/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: ep }) });
      store.set(WANTED_KEY, "0");
      setEndpoint(null);
      await fetchServer();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ปิดไม่สำเร็จ");
    } finally { setBusy(false); }
  }, [endpoint, fetchServer]);

  /** ลบเครื่องอื่นออกจากรายการ (เครื่องหาย/เลิกใช้) */
  const removeDevice = useCallback(async (id: string) => {
    const res = await apiFetch("/api/push/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
    await fetchServer();
  }, [fetchServer]);

  /** เปิด/ปิดรายประเภท (บันทึกทันที) */
  const savePrefs = useCallback(async (next: PushPrefs) => {
    const prev = prefs;
    setPrefs(next);
    const res = await apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "push_prefs", value: next }) });
    if (!res.ok) { setPrefs(prev); throw new Error("บันทึกไม่สำเร็จ"); }
  }, [prefs]);

  const thisDeviceId = endpoint ? devices.find((d) => endpoint.endsWith(d.endpoint_tail))?.id ?? null : null;

  return { support, permission, subscribed: !!endpoint, thisDeviceId, devices, prefs, loading, busy, error,
    reload: load, refreshDevices: fetchServer, enable, disable, removeDevice, savePrefs };
}
