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

// aws4fetch = ตัวเซ็น S3 ขนาดจิ๋ว (~5KB, ไม่ใช่ AWS SDK ตัวหนักที่เคยทำ bundle บวม/1102)
// ใช้เฉพาะตอนรัน "นอก Cloudflare" (เช่น Vercel) เพื่อคุย R2 ผ่าน S3 API — บน Cloudflare ยังใช้ binding เหมือนเดิม
import { AwsClient } from "aws4fetch";

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

export const R2_BUCKET       = (process.env.R2_BUCKET ?? "odoo-product-images").replace(/^﻿/, "").trim();
export const R2_SHARE_BUCKET = (process.env.R2_SHARE_BUCKET ?? "china-pay-share").replace(/^﻿/, "").trim();
export const R2_PUBLIC_URL   = (process.env.R2_PUBLIC_URL ?? "").replace(/^﻿/, "").trim().replace(/\/$/, "");

// ── S3 fallback adapter (ทำงานเมื่อรัน "นอก Cloudflare" เช่น Vercel) ──
// ตั้ง env 3 ตัว: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
//   (สร้าง "R2 API Token" ใน Cloudflare dashboard → Manage R2 API Tokens)
// ถ้าไม่ครบ → คืน null → ระบบกลับไปใช้ binding (บน Cloudflare) ตามเดิม
// คืน object หน้าตาเดียวกับ R2 binding → ฟังก์ชัน put/get/delete ด้านล่างใช้ได้โดยไม่ต้องแก้
function makeS3Bucket(bucketName: string): R2BucketLike | null {
  const accountId       = (process.env.R2_ACCOUNT_ID ?? "").trim();
  const accessKeyId     = (process.env.R2_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY ?? "").trim();
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  const client = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
  const base = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}`;
  const urlFor = (key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

  return {
    async get(key: string): Promise<R2ObjectBodyLike> {
      const res = await client.fetch(urlFor(key), { method: "GET" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2(S3) get ${res.status}`);
      return {
        body: res.body as ReadableStream,
        httpMetadata: { contentType: res.headers.get("content-type") ?? undefined },
        size: Number(res.headers.get("content-length") ?? 0),
      };
    },
    async put(key: string, value: ArrayBuffer | ReadableStream, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown> {
      const bodyAb: ArrayBuffer = value instanceof ArrayBuffer ? value : await new Response(value).arrayBuffer();
      const bytes = new Uint8Array(bodyAb);
      const ct = opts?.httpMetadata?.contentType;
      // ต้องระบุ Content-Length เอง: aws4fetch + undici (บน Vercel/Node) จะส่ง body แบบ chunked
      // เมื่อไม่ทราบความยาว → R2 (S3 API) ปฏิเสธ PUT ด้วย 411 Length Required
      const headers: Record<string, string> = { "content-length": String(bytes.byteLength) };
      if (ct) headers["content-type"] = ct;
      const res = await client.fetch(urlFor(key), { method: "PUT", body: bytes, headers });
      if (!res.ok) throw new Error(`R2(S3) put ${res.status}`);
      return undefined;
    },
    async delete(key: string): Promise<void> {
      const res = await client.fetch(urlFor(key), { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`R2(S3) delete ${res.status}`);
    },
  };
}

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

  // วิธีที่ 3 (นอก Cloudflare เช่น Vercel): S3 API ถ้าตั้ง env ครบ
  return makeS3Bucket(R2_BUCKET);
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

/** ดึง binding R2_SHARE (bucket รูปแชร์ public สำหรับ LINE) */
export async function getR2ShareBinding(): Promise<R2BucketLike | null> {
  try {
    const wk: any = await import(/* webpackIgnore: true */ ("cloudflare:workers" as string));
    if (wk?.env?.R2_SHARE) return wk.env.R2_SHARE;
  } catch { /* noop */ }
  try {
    const mod: any = await import(/* webpackIgnore: true */ ("@opennextjs/cloudflare" as string));
    const ctx = mod.getCloudflareContext ? mod.getCloudflareContext() : null;
    if (ctx?.env?.R2_SHARE) return ctx.env.R2_SHARE;
  } catch { /* noop */ }
  // นอก Cloudflare (เช่น Vercel): S3 API ถ้าตั้ง env ครบ
  return makeS3Bucket(R2_SHARE_BUCKET);
}

/** อัปโหลดรูปขึ้น bucket แชร์ (public) */
export async function r2PutShare(key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void> {
  const bucket = await getR2ShareBinding();
  if (!bucket) throw new Error("R2 binding ไม่พร้อม (R2_SHARE)");
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

/**
 * นโยบายลบไฟล์กลาง (ทุกโมดูล): "ลบ" = ย้ายเข้า trash/<key> เก็บ 30 วันก่อนลบจริง
 * - ลบจริงอัตโนมัติด้วย R2 lifecycle rule (ตั้งใน Cloudflare dashboard: prefix trash/ → delete after 30 days)
 * - กู้คืน: copy ไฟล์จาก trash/ กลับที่เดิมใน dashboard ได้ภายใน 30 วัน
 * คืน key ใหม่ใน trash หรือ null ถ้าไม่พบไฟล์ต้นทาง
 */
export async function r2MoveToTrash(key: string): Promise<string | null> {
  const bucket = await getR2Binding();
  if (!bucket) throw new Error("R2 binding ไม่พร้อม (R2_IMAGES)");
  if (key.startsWith("trash/")) return key;   // อยู่ในถังแล้ว
  const obj = await bucket.get(key);
  if (!obj) return null;                       // ไม่มีไฟล์ต้นทาง — ไม่มีอะไรให้ย้าย
  const trashKey = `trash/${key}`;
  await bucket.put(trashKey, obj.body, { httpMetadata: { contentType: obj.httpMetadata?.contentType ?? "application/octet-stream" } });
  await bucket.delete(key);
  return trashKey;
}

/** ดึง object body จาก R2 (ผ่าน binding) — null ถ้าไม่พบ */
export async function r2GetObject(key: string): Promise<R2ObjectBodyLike> {
  const bucket = await getR2Binding();
  if (!bucket) throw new Error("R2 binding ไม่พร้อม (R2_IMAGES)");
  return bucket.get(key);
}

/* eslint-enable @typescript-eslint/no-explicit-any */
