/**
 * Cloudflare R2 helper — F21: R2 native binding ล้วน (ไม่มี AWS SDK)
 *
 * เดิมใช้ @aws-sdk/client-s3 ผ่าน dynamic import + webpackIgnore
 * แต่ OpenNext ใช้ esbuild (ไม่ใช่ webpack) → webpackIgnore ไม่มีผล
 * → AWS SDK ถูก bundle เข้าไปเต็มๆ (หลาย MB) → Worker startup เกิน limit → 1102
 *
 * F21: ตัด AWS SDK ทิ้งทั้งหมด ใช้ R2 binding (env.R2_IMAGES) ตรงๆ
 * → bundle เล็กลงหลาย MB → ไม่ชน 1102
 *
 * binding ชื่อ R2_IMAGES ตั้งใน wrangler.jsonc → r2_buckets
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// minimal R2 types (จาก @cloudflare/workers-types — ไม่ import เพื่อเลี่ยง dep)
export type R2ObjectBodyLike = {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
  size: number;
} | null;

export type R2BucketLike = {
  get(key: string): Promise<R2ObjectBodyLike>;
  put(key: string, value: ArrayBuffer | ReadableStream, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
};

export const R2_BUCKET     = (process.env.R2_BUCKET ?? "odoo-product-images").replace(/^﻿/, "").trim();
export const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/^﻿/, "").trim().replace(/\/$/, "");

/**
 * ดึง R2 binding จาก Cloudflare context (runtime)
 * คืน null ถ้าไม่มี (local dev ที่ไม่ได้ผูก binding)
 */
export async function getR2Binding(): Promise<R2BucketLike | null> {
  // วิธีที่ 1 (แนะนำโดย CF docs): import { env } from "cloudflare:workers"
  try {
    const wk: any = await import(/* webpackIgnore: true */ ("cloudflare:workers" as string));
    if (wk?.env?.R2_IMAGES) return wk.env.R2_IMAGES;
  } catch { /* ไม่ใช่ runtime CF — ลองวิธี 2 */ }

  // วิธีที่ 2 (fallback): getCloudflareContext จาก opennext
  try {
    const mod: any = await import(/* webpackIgnore: true */ ("@opennextjs/cloudflare" as string));
    const ctx = mod.getCloudflareContext ? mod.getCloudflareContext() : null;
    if (ctx?.env?.R2_IMAGES) return ctx.env.R2_IMAGES;
  } catch { /* noop */ }

  return null;
}

/** R2 ถูกตั้งค่าพร้อมใช้ไหม (มี binding) */
export async function isR2Configured(): Promise<boolean> {
  return (await getR2Binding()) !== null;
}

/** อัปโหลดไฟล์ขึ้น R2 (ผ่าน binding) */
export async function r2PutObject(key: string, body: ArrayBuffer | Uint8Array | Buffer, contentType: string): Promise<void> {
  const bucket = await getR2Binding();
  if (!bucket) throw new Error("R2 binding ไม่พร้อม (R2_IMAGES)");
  // normalize → ArrayBuffer
  const ab: ArrayBuffer = body instanceof ArrayBuffer
    ? body
    : (body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer);
  await bucket.put(key, ab, { httpMetadata: { contentType } });
}

/** ลบไฟล์จาก R2 (ผ่าน binding) */
export async function r2DeleteObject(key: string): Promise<void> {
  const bucket = await getR2Binding();
  if (!bucket) throw new Error("R2 binding ไม่พร้อม (R2_IMAGES)");
  await bucket.delete(key);
}

/** ดึง object body จาก R2 (ผ่าน binding) — null ถ้าไม่พบ */
export async function r2GetObject(key: string): Promise<R2ObjectBodyLike> {
  const bucket = await getR2Binding();
  if (!bucket) throw new Error("R2 binding ไม่พร้อม (R2_IMAGES)");
  return bucket.get(key);
}

/* eslint-enable @typescript-eslint/no-explicit-any */
