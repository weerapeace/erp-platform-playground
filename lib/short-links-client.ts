// 🔗 ลิงก์สั้น — ตัวเรียกฝั่งหน้าเว็บ (ของกลาง) · กติกาอยู่ lib/short-links
"use client";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { isShortenableShopUrl, type ShortLinkListItem } from "@/lib/short-links";

async function json<T>(res: Response): Promise<T> {
  const j = await res.json().catch(() => null);
  if (!j) throw new Error(`เซิร์ฟเวอร์ตอบไม่ถูกต้อง (รหัส ${res.status})`);
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
  return j as T;
}
const send = (url: string, method: string, body?: unknown) =>
  apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

// ── สวิตช์ "ย่อลิงก์ร้านอัตโนมัติ" (ค่าส่วนตัวของแต่ละคน · เปิดเป็นค่าเริ่ม) ─────
const AUTO_KEY = "erp.shortLinks.auto";
const AUTO_EVT = "erp-short-links-auto";
export function readAutoShortLinks(): boolean {
  try { return typeof window === "undefined" ? true : window.localStorage.getItem(AUTO_KEY) !== "0"; } catch { return true; }
}
export function setAutoShortLinks(on: boolean) {
  try { window.localStorage.setItem(AUTO_KEY, on ? "1" : "0"); } catch { /* โหมดส่วนตัว */ }
  try { window.dispatchEvent(new Event(AUTO_EVT)); } catch { /* ไม่มี window */ }
}
export function useAutoShortLinks(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const sync = () => setOn(readAutoShortLinks());
    sync();
    window.addEventListener(AUTO_EVT, sync);
    return () => window.removeEventListener(AUTO_EVT, sync);
  }, []);
  return [on, setAutoShortLinks];
}

// ความจำในหน้า: ลิงก์ยาว → สั้น (กันยิงซ้ำตอนพิมพ์/เปิดหลาย drawer)
const memo = new Map<string, string>();

export type EnsureCtx = { label?: string | null; sourceModule?: string | null; sourceId?: string | null };

/** ย่อหลายลิงก์ (เฉพาะลิงก์ร้าน · ใช้ลิงก์เดิมซ้ำ) → { ยาว: สั้น } · ไม่มีสิทธิ์/ล้ม = {} (ใช้ลิงก์ยาวตามเดิม) */
export async function ensureShortLinks(urls: string[], ctx: EnsureCtx = {}): Promise<Record<string, string>> {
  const want = [...new Set(urls.map((u) => u.trim()).filter(isShortenableShopUrl))];
  const out: Record<string, string> = {};
  const missing = want.filter((u) => { const hit = memo.get(u); if (hit) out[u] = hit; return !hit; });
  if (missing.length) {
    try {
      const r = await json<{ data: Record<string, string> }>(await send("/api/short-links/ensure", "POST", { urls: missing, label: ctx.label ?? null, source_module: ctx.sourceModule ?? null, source_id: ctx.sourceId ?? null }));
      for (const [k, v] of Object.entries(r.data ?? {})) { memo.set(k, v); out[k] = v; }
    } catch { /* ใช้ลิงก์ยาวต่อไป */ }
  }
  return out;
}

/** hook: ลิงก์ร้านในรายการ → map ยาว→สั้น (ย่ออัตโนมัติ) · enabled=false = ไม่ย่อ */
export function useShortLinkMap(urls: string[], ctx: EnsureCtx & { enabled?: boolean } = {}): Record<string, string> {
  const enabled = ctx.enabled !== false;
  const key = useMemo(() => [...new Set(urls.map((u) => u.trim()).filter(isShortenableShopUrl))].sort().join("\n"), [urls]);
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!enabled || !key) { setMap({}); return; }
    let alive = true;
    // หน่วงนิดนึง: พิมพ์/วางลิงก์เสร็จก่อนค่อยย่อ (ไม่สร้างลิงก์ของ URL ที่พิมพ์ค้างครึ่งเดียว)
    const t = setTimeout(() => { ensureShortLinks(key.split("\n"), ctx).then((m) => { if (alive) setMap(m); }); }, 900);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, ctx.sourceId]);
  return enabled ? map : {};
}

// ── หน้าจัดการ ─────────────────────────────────────────────
export async function listShortLinks(opts: { trash?: boolean; q?: string } = {}): Promise<ShortLinkListItem[]> {
  const sp = new URLSearchParams();
  if (opts.trash) sp.set("trash", "1");
  if (opts.q) sp.set("q", opts.q);
  return (await json<{ data: ShortLinkListItem[] }>(await apiFetch(`/api/short-links${sp.size ? `?${sp}` : ""}`))).data ?? [];
}
export async function createShortLink(body: { url: string; code?: string; label?: string; source_module?: string; reuse?: boolean }): Promise<ShortLinkListItem & { reused: boolean }> {
  return (await json<{ data: ShortLinkListItem & { reused: boolean } }>(await send("/api/short-links", "POST", body))).data;
}
export async function updateShortLink(id: string, patch: { target_url?: string; label?: string | null; code?: string; is_active?: boolean; restore?: boolean }): Promise<ShortLinkListItem> {
  return (await json<{ data: ShortLinkListItem }>(await send(`/api/short-links/${id}`, "PATCH", patch))).data;
}
export async function deleteShortLink(id: string): Promise<void> {
  await json(await send(`/api/short-links/${id}`, "DELETE"));
}
