"use client";

/**
 * 💾 กู้งานรวม PDF ที่ค้างไว้ — เก็บไฟล์ + ลำดับหน้าใน IndexedDB ของเบราว์เซอร์เครื่องนี้ (ไม่ส่งขึ้นเซิร์ฟเวอร์)
 *   เผลอปิดหน้า/รีเฟรช → เปิดใหม่ได้ไฟล์และลำดับเดิม · ล้างทั้งหมด = ลบที่เก็บ
 *   ⚠️ โหมดไม่ระบุตัวตน / ล้างข้อมูลเบราว์เซอร์ = หาย (ตั้งใจ: เป็นแค่ตัวช่วยกันเผลอ ไม่ใช่ที่เก็บถาวร)
 *   ใช้ที่: components/pdf-merge (prop storageKey) · พลาดทุกกรณี = เงียบ (หน้ายังใช้ได้ปกติ)
 */
import type { MergeFileMeta, MergePage } from "@/lib/pdf-merge";

export type SavedMerge = {
  pages: MergePage[];
  name: string;
  files: { meta: MergeFileMeta; blob: Blob }[];
  savedAt: number;
};

const DB = "erp-pdf-merge";
const STORE = "drafts";
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no indexedDB")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export async function loadMergeDraft(key: string): Promise<SavedMerge | null> {
  try {
    const v = await run<SavedMerge | undefined>("readonly", (s) => s.get(key));
    return v && Array.isArray(v.pages) && Array.isArray(v.files) ? v : null;
  } catch { return null; }
}

export async function saveMergeDraft(key: string, draft: SavedMerge): Promise<void> {
  try {
    if (!draft.pages.length) { await run("readwrite", (s) => s.delete(key)); return; }
    await run("readwrite", (s) => s.put(draft, key));
  } catch { /* เก็บไม่ได้ (เต็ม/โหมดส่วนตัว) — ไม่เป็นไร */ }
}

export async function clearMergeDraft(key: string): Promise<void> {
  try { await run("readwrite", (s) => s.delete(key)); } catch { /* ignore */ }
}
