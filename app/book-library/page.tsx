"use client";

/**
 * คลังหนังสือ (Book Library) — /book-library
 *
 * ทะเบียนหนังสือ/การ์ตูนส่วนตัว: มีแล้ว / อยากได้ / รอวางขาย / ข้ามเล่มนี้
 * ใช้ของกลาง MasterCRUDPage → ตาราง ค้นหา ตัวกรอง ฟอร์ม รูปปก สิทธิ์ ประวัติ นำเข้า/ส่งออก ครบในตัว
 * ชื่อช่อง/คอลัมน์/ป้ายตัวเลือก แก้เองได้ที่ปุ่ม 🎨 แต่งฟอร์ม (ทะเบียนกลาง erp_module_fields) ไม่ต้องแก้โค้ด
 */

import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { StatusBadge } from "@/components/data-table";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);

/** คะแนน 1-5 → ดาว (อ่านเร็วกว่าตัวเลขในตาราง) */
const stars = (v: unknown) => {
  const n = Math.round(Number(v));
  if (!n || n < 1) return <span className="text-slate-300">—</span>;
  const filled = Math.min(5, n);
  return (
    <span className="text-sm" title={`${filled}/5`}>
      <span className="text-amber-500">{"★".repeat(filled)}</span>
      <span className="text-slate-200">{"★".repeat(5 - filled)}</span>
    </span>
  );
};

/** ลิงก์สั่งซื้อ — เปิดแท็บใหม่ ไม่ให้คลิกแล้วเปิดฟอร์มของแถว */
const buyLink = (v: unknown) => {
  const url = String(v ?? "").trim();
  if (!url) return <span className="text-slate-300">—</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      className="text-sm text-blue-600 hover:underline">เปิดลิงก์ ↗</a>
  );
};

const CONFIG: MasterCRUDConfig = {
  apiBase:     "/api/master-v2/",
  apiPath:     "book_library",
  moduleKey:   "book_library",
  tableId:     "book-library",
  title:       "คลังหนังสือ",
  icon:        "📚",
  description: "ทะเบียนหนังสือ/การ์ตูน — เล่มที่มีแล้ว เล่มที่อยากได้ และเล่มที่รอวางขาย",
  formLayout:  "sections",
  activeField: "is_active",
  exportEntityType: "book_library",
  uniqueKey:   "title",
  searchKeys:  ["title", "series", "volume", "author", "category", "store", "isbn"],
  permissions: { view: "books.view", create: "books.edit", edit: "books.edit" },
  copyFromRecord: true,
  cellRenderers: {
    status:  (v) => <StatusBadge status={String(v ?? "")} module="book_library" />,
    rating:  stars,
    buy_url: buyLink,
  },
};

export default function BookLibraryPage() {
  return <MasterCRUDPage config={CONFIG} />;
}
