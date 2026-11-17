"use client";

/**
 * 🎞 ที่เก็บคลิปแพ็ค "ในเครื่องโต๊ะแพ็ค" (ช่วงทดลอง — docs/packing-station.md §13)
 *
 * เก็บใน IndexedDB ของเบราว์เซอร์เครื่องนี้ (ไม่ส่งขึ้นเน็ต) · ฐานข้อมูลเก็บแค่ขนาด/ความยาว/ลายนิ้วมือไฟล์
 * ⚠️ ล้างข้อมูลเบราว์เซอร์ / เปิดโหมดไม่ระบุตัวตน = คลิปหาย → ปุ่ม "ดาวน์โหลด" เก็บคลิปที่มีเคลมไว้เอง
 * ตอนเชื่อม NAS: เปลี่ยนแค่ไฟล์นี้ให้ส่งขึ้น NAS (หน้าจอ/ข้อมูลเดิมไม่ต้องรื้อ)
 */

export type LocalClip = {
  id: string;
  session_id: string | null;
  order_id: string;
  order_no: string | null;
  tracking_no: string | null;
  packer: string | null;
  station: string | null;
  status: string;              // done / problem
  created_at: string;
  mime: string;
  size: number;
  duration_sec: number;
  sha256: string | null;
  video: Blob;
  snapshot: Blob | null;       // ภาพนิ่งก่อนปิดกล่อง
};
export type LocalClipInfo = Omit<LocalClip, "video" | "snapshot"> & { has_snapshot: boolean };

const DB = "erp-packing";
const STORE = "clips";
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("เบราว์เซอร์นี้เก็บคลิปในเครื่องไม่ได้")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("created_at", "created_at");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error ?? new Error("เปิดที่เก็บคลิปไม่สำเร็จ")); };
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("ที่เก็บคลิปมีปัญหา"));
  }));
}

/** ลายนิ้วมือไฟล์ SHA-256 (ไว้พิสูจน์ว่าคลิปไม่ถูกตัดต่อ) */
export async function sha256Hex(blob: Blob): Promise<string | null> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}

export const saveClip = (c: LocalClip): Promise<IDBValidKey> => tx("readwrite", (s) => s.put(c));
export const getClip = (id: string): Promise<LocalClip | undefined> => tx("readonly", (s) => s.get(id) as IDBRequest<LocalClip | undefined>);
export const deleteClip = (id: string): Promise<undefined> => tx("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);

/** รายการคลิป (ไม่โหลดตัววิดีโอ) ใหม่สุดก่อน */
export async function listClips(): Promise<LocalClipInfo[]> {
  const all = await tx("readonly", (s) => s.getAll() as IDBRequest<LocalClip[]>);
  return all
    .map(({ video: _v, snapshot, ...rest }) => ({ ...rest, has_snapshot: !!snapshot }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** ลบคลิปเก่ากว่า N วัน — คืนจำนวนที่ลบ */
export async function pruneClips(keepDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - keepDays * 86400000).toISOString();
  const old = (await listClips()).filter((c) => c.created_at < cutoff);
  for (const c of old) await deleteClip(c.id);
  return old.length;
}

/** พื้นที่ที่ใช้/เหลือ (ถ้าเบราว์เซอร์บอกได้) */
export async function storageInfo(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && e.quota ? { used: e.usage ?? 0, quota: e.quota } : null;
  } catch { return null; }
}

/** ขอให้เบราว์เซอร์ไม่ลบที่เก็บนี้เองตอนเครื่องที่เหลือน้อย */
export async function requestPersist(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

export const clipExt = (mime: string): string => (mime.includes("mp4") ? "mp4" : "webm");
export const clipFileName = (c: Pick<LocalClipInfo, "order_no" | "created_at" | "mime">): string =>
  `pack_${(c.order_no ?? "order").replace(/[^A-Za-z0-9_-]/g, "")}_${c.created_at.slice(0, 19).replace(/[:T]/g, "-")}.${clipExt(c.mime)}`;
