/**
 * ของกลาง: สร้าง/ดาวน์โหลดไฟล์ .bat เปิด Chrome โปรไฟล์ที่ถูก + หน้าบิล (ใช้ฝั่ง client เท่านั้น)
 * ใช้ทั้งป๊อปอัปดาวน์โหลดใบเสร็จ และพาเนล "บิลที่ยังขาด"
 */
import type { Subscription } from "@/lib/subscriptions";

export type BatInfo = Pick<Subscription, "name" | "chrome_profile" | "chrome_profile_dir" | "account_email" | "invoice_url">;

export const normUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

export function sanitizeName(n: string): string {
  return (n || "subscription").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 40) || "subscription";
}

/** ลิงก์หน้าบิล (เติม https ถ้าไม่มี) — null ถ้าไม่ได้ตั้ง */
export function subInvoiceUrl(sub: Pick<Subscription, "invoice_url">): string | null {
  return sub.invoice_url ? normUrl(sub.invoice_url) : null;
}

/** สร้างไฟล์ .bat ได้ไหม (ต้องมีทั้งลิงก์บิล + โฟลเดอร์โปรไฟล์) */
export function canMakeBat(sub: BatInfo): boolean {
  return !!(sub.chrome_profile_dir && sub.invoice_url);
}

// เนื้อไฟล์ .bat (Windows): เปิด Chrome โปรไฟล์ที่ระบุ + หน้าบิล
function makeBat(profileDir: string, url: string): string {
  const safeUrl = url.replace(/%/g, "%%"); // escape % สำหรับ batch
  return `@echo off\r\nstart "" chrome --profile-directory="${profileDir}" "${safeUrl}"\r\n`;
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/octet-stream" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(href);
}

/** ดาวน์โหลดไฟล์ .bat ของ subscription — ชื่อไฟล์เติมชื่อเล่นโปรไฟล์/อีเมล กันชื่อซ้ำ · คืน false ถ้าข้อมูลไม่พอ */
export function downloadSubBat(sub: BatInfo): boolean {
  const url = subInvoiceUrl(sub);
  if (!url || !sub.chrome_profile_dir) return false;
  const suffix = sub.chrome_profile ? `-${sanitizeName(sub.chrome_profile)}` : sub.account_email ? `-${sanitizeName(sub.account_email)}` : "";
  downloadTextFile(`chrome-${sanitizeName(sub.name)}${suffix}.bat`, makeBat(sub.chrome_profile_dir, url));
  return true;
}
