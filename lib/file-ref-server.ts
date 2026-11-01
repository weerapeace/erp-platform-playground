/**
 * ที่อยู่ไฟล์กลาง — ส่วนฝั่งเซิร์ฟเวอร์ (อ่านไฟล์ / ทำลิงก์เปิดดู) · ห้าม import จากหน้าจอ
 * รูปแบบ ref: lib/file-ref.ts (R2 key ธรรมดา หรือ sb:<bucket>/<path>)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { r2GetObject } from "@/lib/r2";
import { parseFileRef } from "@/lib/file-ref";

type Admin = SupabaseClient;

/** ลิงก์เปิดดูไฟล์ Supabase ส่วนตัว อยู่ได้นานเท่านี้ (วินาที) */
export const FILE_SIGNED_TTL = 600;

export const r2ViewUrl = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;

/** อ่านไฟล์ทั้งก้อน → { bytes, contentType } · ไม่มีไฟล์/อ่านไม่ได้ = null (อ่าน body จนจบเสมอ — ดู r2_body_cancel_hang) */
export async function readFileRef(admin: Admin, ref: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const p = parseFileRef(ref);
  if (!p) return null;
  if (p.provider === "r2") {
    const obj = await r2GetObject(p.key);
    if (!obj) return null;
    const buf = new Uint8Array(await new Response(obj.body as ReadableStream).arrayBuffer());
    return { bytes: buf, contentType: obj.httpMetadata?.contentType || "application/octet-stream" };
  }
  const { data, error } = await admin.storage.from(p.bucket).download(p.path);
  if (error || !data) return null;
  return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
}

/** ไฟล์รูป → data URL (ส่งให้ AI อ่าน) · อ่านไม่ได้ = null */
export async function fileRefToDataUrl(admin: Admin, ref: string): Promise<string | null> {
  const f = await readFileRef(admin, ref);
  if (!f) return null;
  const type = f.contentType.startsWith("image/") ? f.contentType : "image/jpeg";
  return `data:${type};base64,${Buffer.from(f.bytes).toString("base64")}`;
}

/** ลิงก์ชั่วคราวของไฟล์ Supabase หลายไฟล์ในครั้งเดียว (แยกตาม bucket) → Map<path เต็ม sb:..., url> */
export async function signSupabaseRefs(admin: Admin, refs: string[]): Promise<Map<string, string>> {
  const byBucket = new Map<string, { ref: string; path: string }[]>();
  for (const ref of refs) {
    const p = parseFileRef(ref);
    if (p?.provider !== "supabase") continue;
    const list = byBucket.get(p.bucket) ?? [];
    list.push({ ref, path: p.path });
    byBucket.set(p.bucket, list);
  }
  const out = new Map<string, string>();
  await Promise.all([...byBucket.entries()].map(async ([bucket, items]) => {
    const { data, error } = await admin.storage.from(bucket).createSignedUrls(items.map((i) => i.path), FILE_SIGNED_TTL);
    if (error || !data) { console.error(`[file-ref] sign ${bucket}:`, error?.message); return; }
    data.forEach((d, i) => { if (d.signedUrl && !d.error) out.set(items[i].ref, d.signedUrl); });
  }));
  return out;
}
