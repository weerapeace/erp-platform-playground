"use client";

/**
 * อัปโหลด "ไอคอนของฉัน" → R2 (โฟลเดอร์ erp-icons · ลงคลังไฟล์กลางด้วย)
 *   รูป PNG/WebP/JPG = ย่อเหลือกว้างไม่เกิน 256px
 *   SVG (ไฟล์ หรือวางโค้ด) = แปลงเป็น PNG พื้นใส 256×256 ในเบราว์เซอร์ก่อน — เซิร์ฟเวอร์ไม่รับ SVG (กันสคริปต์แฝง)
 */
import { apiFetch } from "@/lib/api";
import { downscaleImageWidth } from "@/lib/image-resize";

const SIZE = 256;

/** โค้ด SVG → ไฟล์ PNG พื้นใส (ใส่ขนาดให้ถ้าไม่มี · สีที่เป็น currentColor = ดำ ซึ่งโหมดระบายสีใช้แค่รูปทรง) */
export async function svgTextToPng(svgText: string, name = "icon"): Promise<File> {
  const doc = new DOMParser().parseFromString(svgText.trim(), "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) throw new Error("โค้ดนี้ไม่ใช่ SVG");
  svg.querySelectorAll("script, foreignObject").forEach((n) => n.remove());
  svg.setAttribute("width", String(SIZE));
  svg.setAttribute("height", String(SIZE));
  if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  const img = new Image();
  await new Promise<void>((ok, fail) => {
    img.onload = () => ok();
    img.onerror = () => fail(new Error("อ่านรูป SVG ไม่ได้"));
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  canvas.getContext("2d")!.drawImage(img, 0, 0, SIZE, SIZE);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
  if (!blob) throw new Error("แปลงรูปไม่สำเร็จ");
  return new File([blob], `${name}.png`, { type: "image/png" });
}

/** อัปไฟล์ไอคอน (รูป หรือ SVG) → r2 key */
export async function uploadIconFile(file: File): Promise<string> {
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  const ready = isSvg ? await svgTextToPng(await file.text(), file.name.replace(/\.svg$/i, "")) : await downscaleImageWidth(file, SIZE, 0.92);
  const fd = new FormData();
  fd.append("file", ready);
  fd.append("folder", "erp-icons");
  const r = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
  const j = (await r.json().catch(() => ({}))) as { r2_key?: string; error?: string };
  if (!j.r2_key) throw new Error(j.error ?? "อัปโหลดไม่สำเร็จ");
  return j.r2_key;
}

/** รหัสไอคอนของฉันแบบสั้น (a-z0-9) */
export const newCustomIconId = () => Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
