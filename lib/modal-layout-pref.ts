"use client";

/**
 * modal-layout-pref (ของกลาง) — "สมุดจำขนาดป๊อป/drawer" ต่อคน ต่อป๊อป
 *   • ใช้กับ ERPModal (ขยายเต็มจอ ⤢ + ขนาดที่ลากขอบ) และ Drawer (ความกว้างที่ลากขอบซ้าย) ใน components/modal
 *   • เก็บรวม 1 แถวต่อคน ใน user_ui_prefs key "modal_layout" (ผ่าน /api/user-prefs) → ตามไปทุกเครื่อง
 *     และแยกคนชัดเจนแม้ใช้คอมเครื่องเดียวกัน (cache ในเครื่องผูก uid — เปลี่ยนคน = ไม่เอาค่าของคนก่อน)
 *   • cache localStorage → เปิดป๊อปได้ขนาดเดิมทันทีไม่ต้องรอเน็ต
 *   • ไม่ใช้ useViewPref เพราะนั่นยิง 1 request ต่อ 1 key — ป๊อปมีหลายร้อยตัว → ที่นี่ดึงครั้งเดียวต่อการโหลดหน้า
 *     (เลื่อนไปหลังหน้าโหลดเสร็จ กันแย่ง request หลัก) · เขียนแบบรวบ (debounce) ทั้งก้อน
 *   • ลบค่า = เก็บ { t } เปล่า (tombstone) กันค่าเก่าจากเครื่องอื่นเด้งกลับตอนรวมข้อมูล
 */
import { apiFetch } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase-browser";

/** x = ขยายเต็มจอไหม · w/h = ขนาดที่ลากเอง (px) · px/py = ตำแหน่งที่ลากย้าย (ระยะจากกลางจอ) · dk/dw = เกาะขอบซ้าย/ขวา + ความกว้างแผง · t = เวลาที่แก้ล่าสุด (ใช้ตัดสินตอนรวมข้อมูลหลายเครื่อง) */
export type LayoutPref = { x?: boolean; w?: number; h?: number; px?: number; py?: number; dk?: "l" | "r"; dw?: number; t: number };
type Store = { uid?: string; m: Record<string, LayoutPref> };

const LS_KEY = "erp-layout-prefs";
const SERVER_KEY = "modal_layout";
const MAX_ENTRIES = 200;          // กันโตไม่หยุด (ป๊อปที่ชื่อเป็นชื่อรายการล้วน ๆ) — เก็บที่ใช้ล่าสุดไว้
const PREFETCH_DELAY_MS = 2500;   // ดึงจากเซิร์ฟเวอร์หลังหน้าโหลดเสร็จ

let store: Store | null = null;
let syncPromise: Promise<void> | null = null;
let serverMerged = false;         // รวมค่าจากเซิร์ฟเวอร์แล้ว → เขียนทั้งก้อนกลับได้โดยไม่ทับค่าของเครื่องอื่น
let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): Store {
  if (store) return store;
  try {
    const j = JSON.parse(localStorage.getItem(LS_KEY) ?? "null") as Store | null;
    store = j && typeof j === "object" && j.m && typeof j.m === "object" ? j : { m: {} };
  } catch { store = { m: {} }; }
  return store;
}

function prune(m: Record<string, LayoutPref>): Record<string, LayoutPref> {
  const keys = Object.keys(m);
  if (keys.length <= MAX_ENTRIES) return m;
  const keep = keys.sort((a, b) => (m[b].t ?? 0) - (m[a].t ?? 0)).slice(0, MAX_ENTRIES);
  return Object.fromEntries(keep.map((k) => [k, m[k]]));
}

function persistLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(load())); } catch { /* เต็ม/โหมดส่วนตัว — ไม่เป็นไร */ }
}

/** รวมค่าจากเซิร์ฟเวอร์ (ครั้งเดียวต่อการโหลดหน้า) — ค่าไหนแก้ทีหลังชนะ */
export function syncLayoutPrefs(): Promise<void> {
  if (syncPromise) return syncPromise;
  if (prefetchTimer) { clearTimeout(prefetchTimer); prefetchTimer = null; }
  syncPromise = (async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return;                                   // ยังไม่ล็อกอิน → ใช้ค่าในเครื่องอย่างเดียว
    const s = load();
    if (s.uid && s.uid !== uid) s.m = {};               // คอมเครื่องเดียวกันแต่คนละคน → ทิ้งค่าของคนก่อน
    s.uid = uid;
    const r = await apiFetch(`/api/user-prefs?key=${SERVER_KEY}`);
    if (!r.ok) { persistLocal(); return; }
    const j = await r.json() as { value?: { m?: Record<string, LayoutPref> } };
    const remote = j?.value?.m && typeof j.value.m === "object" ? j.value.m : {};
    let localNewer = false;
    for (const [k, v] of Object.entries(remote)) {
      if (!v || typeof v !== "object") continue;
      const lv = s.m[k];
      if (!lv || (v.t ?? 0) > (lv.t ?? 0)) s.m[k] = v;
    }
    for (const [k, v] of Object.entries(s.m)) {
      if (!remote[k] || (v.t ?? 0) > (remote[k].t ?? 0)) { localNewer = true; break; }
    }
    s.m = prune(s.m);
    serverMerged = true;
    persistLocal();
    if (localNewer) scheduleSave();
  })().catch(() => { /* เน็ตหลุด — ใช้ค่าในเครื่องไปก่อน */ });
  return syncPromise;
}

/** เรียกตอนป๊อปถูก mount — นัดดึงค่าจากเซิร์ฟเวอร์หลังหน้าโหลดเสร็จ (ไม่แย่ง request หลักของหน้า) */
export function prefetchLayoutPrefs() {
  if (syncPromise || prefetchTimer || typeof window === "undefined") return;
  prefetchTimer = setTimeout(() => { prefetchTimer = null; void syncLayoutPrefs(); }, PREFETCH_DELAY_MS);
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await syncLayoutPrefs();
    if (!serverMerged) return;                          // ยังรวมกับเซิร์ฟเวอร์ไม่ได้ → ไม่เขียนทับ (กันลบค่าของเครื่องอื่น)
    try {
      // ใช้ fetch ตรง ไม่ใช่ apiFetch — apiFetch บอก refresh-bus ว่า "มีการแก้ข้อมูล" → ปิดป๊อปแล้วหน้าเบื้องหลังจะโหลดใหม่โดยไม่จำเป็น
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch("/api/user-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: SERVER_KEY, value: { m: load().m } }),
        keepalive: true,
      });
    } catch { /* ไม่เป็นไร — ค่าในเครื่องยังอยู่ */ }
  }, 800);
}

/** ค่าที่จำไว้ของป๊อปนี้ (undefined = ยังไม่เคยปรับ / ถูกคืนค่าเดิมแล้ว) */
export function getLayoutPref(key: string): LayoutPref | undefined {
  const p = load().m[key];
  if (!p || (p.x === undefined && !p.w && !p.h)) return undefined;
  return p;
}

/** จำค่าของป๊อปนี้ (รวมกับค่าเดิม) · ส่ง null = ลืมทั้งหมด (คืนค่าเดิม) · ส่ง field เป็น undefined = ลบ field นั้น */
export function setLayoutPref(key: string, patch: Partial<Omit<LayoutPref, "t">> | null) {
  const s = load();
  const next: LayoutPref = patch === null ? { t: Date.now() } : { ...s.m[key], ...patch, t: Date.now() };
  for (const f of ["x", "w", "h", "px", "py", "dk", "dw"] as const) if (next[f] === undefined) delete next[f];
  s.m[key] = next;
  s.m = prune(s.m);
  persistLocal();
  scheduleSave();
}

/**
 * key อัตโนมัติจากชื่อป๊อป — ตัดชื่อรายการที่ต่อท้ายทิ้ง ("แก้ไขงาน — ชื่องาน" → "แก้ไขงาน")
 * ตัดตรง " — " " – " " - " " · " " | " และ ":" · ตัวเลขแทนด้วย # (เลขเอกสาร/จำนวน) · ผูกกับหน้า (2 ช่วงแรกของ path ที่ไม่ใช่ id)
 * ป๊อปที่ส่ง storageKey มาเองจะใช้ storageKey แทน (คงที่กว่า) · Drawer ไม่ส่งชื่อ (หัว drawer มักเป็นชื่อรายการ) → จำต่อหน้า+ขนาด
 */
export function autoLayoutKey(kind: "m" | "d", title: string, size: string): string {
  let path = "";
  try {
    path = window.location.pathname.split("/").filter((seg) => seg && !/\d/.test(seg)).slice(0, 2).join("/");
  } catch { /* ignore */ }
  const name = (title ?? "")
    .split(/\s+[—–\-·|]\s+|[:：]/)[0]
    .replace(/[0-9๐-๙]+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `${kind}:${path}|${name}|${size}`;
}
