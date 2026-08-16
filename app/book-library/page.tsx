"use client";

/**
 * คลังหนังสือ (Book Library) — /book-library
 *
 * ทะเบียนหนังสือ/การ์ตูนส่วนตัว: มีแล้ว / อยากได้ / รอวางขาย / ข้ามเล่มนี้
 * 2 มุมมอง (จำค่าที่เลือกไว้ต่อคน): 📚 ชั้นหนังสือ (เห็นปก จัดตามชุด) · 📋 ตาราง (ค้น/กรอง/นำเข้า-ส่งออก)
 * ทั้งสองมุมมองใช้ข้อมูล + ฟอร์มตัวเดียวกัน (ของกลาง MasterCRUD) — แก้ที่เดียวเปลี่ยนทั้งคู่
 * ชื่อช่อง/คอลัมน์/ป้ายตัวเลือก แก้เองได้ที่ปุ่ม 🎨 แต่งฟอร์ม (ทะเบียนกลาง erp_module_fields) ไม่ต้องแก้โค้ด
 */

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { StatusBadge } from "@/components/data-table";
import { useViewPref } from "@/lib/use-view-pref";
import { BookShelfView } from "./shelf-view";
import { ImportMailModal } from "./import-mail-modal";
import { SeriesWizardModal } from "./series-wizard-modal";

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

const VIEWS = ["shelf", "table"] as const;
type View = (typeof VIEWS)[number];

export default function BookLibraryPage() {
  const { view, setView, saveDefault } = useViewPref<View>("book_library_view", VIEWS, "shelf");
  const [mailOpen, setMailOpen] = useState(false);
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);   // นำเข้าเสร็จ → บังคับตารางโหลดใหม่

  // เปลี่ยนมุมมอง = จำไว้ให้ด้วย (ต่อคน) → เปิดครั้งหน้าได้มุมมองเดิม
  const go = useCallback((v: View) => { setView(v); void saveDefault(v); }, [setView, saveDefault]);
  const openMail = useCallback(() => setMailOpen(true), []);
  const openSeries = useCallback(() => setSeriesOpen(true), []);

  // ปุ่มบนหัวหน้าตาราง — useMemo (deps คงที่) กันตารางถูกสร้างใหม่ทุกครั้งที่ re-render
  const tableConfig = useMemo<MasterCRUDConfig>(() => ({
    ...CONFIG,
    headerActions: () => (
      <>
        <button onClick={openSeries}
          className="h-9 px-3 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">📚 เพิ่มทั้งชุด</button>
        <button onClick={openMail}
          className="h-9 px-3 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">📧 จากอีเมล</button>
        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
          <button onClick={() => go("table")}
            className="h-8 px-3 text-sm rounded-md bg-slate-800 text-white font-medium">📋 ตาราง</button>
          <button onClick={() => go("shelf")}
            className="h-8 px-3 text-sm rounded-md text-slate-500 hover:bg-slate-50">📚 ชั้นหนังสือ</button>
        </div>
      </>
    ),
  }), [go, openMail, openSeries]);

  if (view === "shelf") return <BookShelfView onSwitchToTable={() => go("table")} />;
  return (
    <>
      <MasterCRUDPage key={reloadKey} config={tableConfig} />
      <ImportMailModal open={mailOpen} onClose={() => setMailOpen(false)} onImported={() => setReloadKey((k) => k + 1)} />
      <SeriesWizardModal open={seriesOpen} onClose={() => setSeriesOpen(false)} onCreated={() => setReloadKey((k) => k + 1)} />
    </>
  );
}
