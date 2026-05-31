/**
 * Cloudflare R2 helper (S3-compatible)
 *
 * โหลด @aws-sdk/client-s3 แบบ dynamic + webpackIgnore เพื่อให้ build ผ่าน
 * แม้ SDK ยังไม่ถูกติดตั้ง — จะ throw ตอนเรียกจริงเท่านั้น (ไม่ทำทั้งแอปพัง)
 *
 * ต้องตั้งค่าใน .env.local (ฝั่ง server เท่านั้น):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
 */

// F13: default bucket = ตามที่ admin app เดิมใช้ (รูป Odoo migrate มาที่นี่)
//      override ได้ผ่าน R2_BUCKET secret ถ้า bucket เปลี่ยน
export const R2_BUCKET     = process.env.R2_BUCKET ?? "odoo-product-images";
export const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");

export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    R2_PUBLIC_URL
  );
}

// F16: cache AWS SDK module + S3Client + presigner per Worker isolate
// (เร็วขึ้นมาก: SDK load ครั้งเดียว, ไม่ต้องสร้าง S3Client ซ้ำทุก request)
/* eslint-disable @typescript-eslint/no-explicit-any */
let _aws: any | null = null;
let _presigner: any | null = null;
let _client: any | null = null;

async function loadAws(): Promise<any> {
  if (_aws) return _aws;
  _aws = await import(/* webpackIgnore: true */ ("@aws-sdk/client-s3" as string));
  return _aws;
}

async function loadPresigner(): Promise<any> {
  if (_presigner) return _presigner;
  _presigner = await import(/* webpackIgnore: true */ ("@aws-sdk/s3-request-presigner" as string));
  return _presigner;
}

async function makeClient(): Promise<any> {
  if (_client) return _client;
  const aws = await loadAws();
  _client = new aws.S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    // F18: AWS SDK v3 (3.729+) เพิ่ม checksum headers อัตโนมัติ
    //      ('x-amz-checksum-mode=ENABLED' ฯลฯ) → R2 ตอบ 403 SignatureDoesNotMatch
    //      ปิดทั้ง 2 ตัว = presigned URL ไม่มี param เกิน → R2 ยอมรับ
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return _client;
}

/** อัปโหลดไฟล์ขึ้น R2 */
export async function r2PutObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const aws: any = await loadAws();
  const client = await makeClient();
  await client.send(new aws.PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType,
  }));
}

/** ลบไฟล์จาก R2 */
export async function r2DeleteObject(key: string): Promise<void> {
  const aws: any = await loadAws();
  const client = await makeClient();
  await client.send(new aws.DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

/**
 * Generate signed URL สำหรับอ่านไฟล์จาก R2 (private bucket)
 * @param key   R2 object key (เช่น "product_skus/62026/2026-04-02-09-20-00/thumb_128")
 * @param ttl   อายุ URL วินาที (default 3600 = 1 ชั่วโมง)
 */
export async function r2GetSignedUrl(key: string, ttl = 3600): Promise<string> {
  const aws = await loadAws();
  const presigner = await loadPresigner();
  const client = await makeClient();
  const cmd = new aws.GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
  return await presigner.getSignedUrl(client, cmd, { expiresIn: ttl });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
