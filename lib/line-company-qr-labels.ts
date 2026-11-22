/**
 * ชื่อ/ที่ติดของ QR ไลน์บริษัท — ส่วนที่หน้าเว็บใช้ได้ (ไม่มี crypto ของ Node)
 * ⚠️ แยกจาก lib/line-company-qr (ใช้ crypto ฝั่งเซิร์ฟเวอร์) เพราะแผง QR ในคอนโซล LINE import ไปใช้ในหน้าเว็บ
 *    ถ้า import ไฟล์นั้นจากหน้าเว็บ = โค้ดเข้ารหัสของ Node (~100KB) ติดไปทุกหน้าที่เปิดคอนโซล LINE (พบ 2026-11-22 หน้าแผนผังการทำงาน +91KB)
 */
export type CompanyQrKind = "staff" | "customer" | "admin" | "shop";
export const POSTER_QR_KINDS: Exclude<CompanyQrKind, "shop">[] = ["staff", "customer", "admin"];
export const QR_KINDS: CompanyQrKind[] = ["staff", "customer", "admin", "shop"];

export const QR_LABEL: Record<CompanyQrKind, { title: string; where: string }> = {
  staff: { title: "QR พนักงาน", where: "ติดโรงงาน / ห้องพัก" },
  customer: { title: "QR ลูกค้า (รวมทุกร้าน)", where: "หน้าร้าน / แปะใบส่งของ" },
  admin: { title: "QR แอดมิน", where: "ไม่ติดที่สาธารณะ · ต้องมีบัญชี ERP ที่มีสิทธิ์แอดมิน" },
  shop: { title: "QR รายร้าน", where: "ให้ร้านนั้นเท่านั้น · สแกนแล้วผูกร้านทันที" },
};
