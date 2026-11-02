/**
 * /api/post-image?k=<r2 key | drive:<fileId>> — รูปสำหรับให้แพลตฟอร์มโซเชียลดึงไปโพสต์ (ตัวยิงโพสต์ใช้ผ่าน lib/social-publish/media)
 *
 * - ไม่ปรับอะไร + เป็น JPEG ที่กว้าง ≤2048 อยู่แล้ว = ส่งไฟล์เดิมเป๊ะ (ไม่บีบซ้ำ)
 * - อย่างอื่นแปลงเป็น JPEG q92 (Instagram รับ JPEG เท่านั้น · PNG/WebP/HEIC จาก Drive โดนปฏิเสธ) · กว้าง ≤2048 · หมุนตาม EXIF · พื้นใสเป็นขาว
 * - &fit=pad|crop&ar=auto|<กว้าง÷สูง>&bg=white|black|blur|<rrggbb> = ปรับรูปให้พอดีแพลตฟอร์ม (lib/social-publish/fit)
 *     pad = เติมขอบ (ไม่ตัดรูป) · crop = ครอปกลาง · ar=auto = แก้เฉพาะรูปที่หลุดช่วง IG ฟีด (4:5–1.91:1)
 * - &w=<px> = ย่อผลลัพธ์ (ตัวอย่างในป๊อปโพสต์ · ไม่ใส่ = 2048)
 * - &meta=1 = คืน JSON { width, height, bytes, original } ขนาดไฟล์จริง (Drive = ต้นฉบับ อ่านจาก Drive โดยไม่โหลดไฟล์)
 * - &fb=<r2 key> = รูปสำรอง (รูปย่อในระบบ) — ต้นฉบับบน Drive โหลด/แปลงไม่ได้ (เช่น HEIC) → ใช้ตัวนี้แทน โพสต์ไม่ล้ม
 * - รูปบน Google Drive ดึงตรงจาก Drive ตอนแพลตฟอร์มขอ (ไม่ก็อปลง R2)
 * - ไม่ต้องล็อกอิน (เซิร์ฟเวอร์ Meta เรียก) — ปลอดภัยเท่า "ต้องรู้ key" เหมือน /api/r2-image และ /api/drive-video
 */
import { NextRequest } from "next/server";
import { isSafeR2Key, r2GetObject } from "@/lib/r2";
import { driveConfigured, driveDownloadFile, driveImageSize } from "@/lib/google-drive";
import { parseFitQuery, fitTargetRatio, padBox, cropBox } from "@/lib/social-publish/fit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;
const DRIVE_ID = /^[a-zA-Z0-9_-]{10,}$/;
const MAX_W = 2048;
const bad = (msg: string, status = 400) => new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=300" } });

async function loadBytes(k: string): Promise<{ bytes: Uint8Array; type: string } | Response> {
  if (k.startsWith("drive:")) {
    const id = k.slice(6);
    if (!DRIVE_ID.test(id)) return bad("invalid drive id");
    if (!driveConfigured()) return bad("Google Drive ยังไม่ได้ตั้งค่า", 503);
    const dl = await driveDownloadFile(id);
    if (!dl) return bad("อ่านรูปจาก Drive ไม่ได้ — ตรวจว่าแชร์ไฟล์ให้บัญชีระบบแล้ว", 404);
    return { bytes: dl.bytes, type: dl.mimeType };
  }
  if (!SAFE_KEY.test(k) || !isSafeR2Key(k)) return bad("invalid key");
  const obj = await r2GetObject(k);
  if (!obj) return bad("ไม่พบรูป", 404);
  return { bytes: new Uint8Array(await new Response(obj.body).arrayBuffer()), type: obj.httpMetadata?.contentType ?? "" };
}

/** สีขอบ → ค่าที่ sharp ใช้ */
const bgColor = (bg: string) => (bg === "black" ? "#000000" : bg === "white" || bg === "blur" ? "#ffffff" : `#${bg}`);

export async function GET(request: NextRequest): Promise<Response> {
  const sp = new URL(request.url).searchParams;
  const k = (sp.get("k") ?? "").trim();
  if (!k) return bad("ต้องมี k");
  const fb = (sp.get("fb") ?? "").trim();
  const res = await render(k, sp);
  // ต้นฉบับใช้ไม่ได้ → ลองรูปสำรอง (รูปย่อใน R2) แทน
  if (fb && fb !== k && sp.get("meta") !== "1" && (res.status >= 400 || !(res.headers.get("content-type") ?? "").startsWith("image/jpeg"))) {
    const alt = await render(fb, sp);
    if (alt.status < 400) return alt;
  }
  return res;
}

async function render(k: string, sp: URLSearchParams): Promise<Response> {

  // ขนาดจริง (ไว้โชว์ความคมชัดในป๊อปโพสต์) — Drive อ่านจาก metadata ไม่ต้องโหลดไฟล์
  if (sp.get("meta") === "1") {
    if (k.startsWith("drive:")) {
      const id = k.slice(6);
      if (!DRIVE_ID.test(id) || !driveConfigured()) return bad("invalid drive id");
      const m = await driveImageSize(id);
      return m ? json({ ...m, original: true }) : bad("อ่านขนาดรูปจาก Drive ไม่ได้", 404);
    }
  }

  let src: { bytes: Uint8Array; type: string } | Response;
  try { src = await loadBytes(k); } catch (e) { return bad(`โหลดรูปไม่สำเร็จ: ${(e as Error).message}`, 502); }
  if (src instanceof Response) return src;

  const fit = parseFitQuery(sp);
  const maxW = Math.min(MAX_W, Math.max(200, Number(sp.get("w")) || MAX_W));
  let out: Uint8Array = src.bytes; let ct = src.type || "image/jpeg";
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(src.bytes).metadata();
    const swap = (meta.orientation ?? 1) >= 5;
    const W0 = (swap ? meta.height : meta.width) ?? 0, H0 = (swap ? meta.width : meta.height) ?? 0;
    if (sp.get("meta") === "1") return json({ width: W0, height: H0, bytes: src.bytes.byteLength, original: false });

    const target = fit && W0 && H0 ? fitTargetRatio(W0 / H0, fit) : null;
    // ไม่ต้องปรับ + JPEG อยู่แล้ว + ไม่เกินขนาด + ไม่ต้องหมุน → ส่งไฟล์เดิมเป๊ะ (ไม่บีบอัดซ้ำ คมเท่าต้นฉบับในระบบ)
    const keep = !target && meta.format === "jpeg" && (meta.width ?? 0) <= maxW && (!meta.orientation || meta.orientation === 1);
    if (!keep) {
      const rotated = await sharp(src.bytes).rotate().toBuffer({ resolveWithObject: true });
      let buf: Buffer = rotated.data; const W = rotated.info.width, H = rotated.info.height;
      if (fit && target) {
        if (fit.mode === "crop") {
          buf = await sharp(buf).extract(cropBox(W, H, target)).toBuffer();
        } else {
          const g = padBox(W, H, target);
          // พื้นขอบ: เบลอจากรูปเอง (ย่อเล็กแล้วขยาย = เบลอแรงแต่เร็ว) หรือสีเรียบ
          const bgBuf = fit.bg === "blur"
            ? await sharp(buf).resize(Math.max(8, Math.round(g.width / 16)), Math.max(8, Math.round(g.height / 16)), { fit: "cover" }).blur(2).resize(g.width, g.height).modulate({ brightness: 0.95 }).jpeg().toBuffer()
            : await sharp({ create: { width: g.width, height: g.height, channels: 3, background: bgColor(fit.bg) } }).jpeg().toBuffer();
          buf = await sharp(bgBuf).composite([{ input: buf, left: g.left, top: g.top }]).toBuffer();
        }
      }
      out = new Uint8Array(await sharp(buf).resize({ width: maxW, withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 92, mozjpeg: true }).toBuffer());
    }
    ct = "image/jpeg";
  } catch { /* แปลงไม่ได้ → ส่งไฟล์เดิม (แพลตฟอร์มอาจปฏิเสธเองถ้าไม่ใช่ JPEG) */ }
  return new Response(out as BodyInit, {
    headers: { "Content-Type": ct, "Content-Length": String(out.byteLength), "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
