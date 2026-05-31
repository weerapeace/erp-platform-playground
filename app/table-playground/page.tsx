"use client";

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable, StatusBadge } from "@/components/data-table";
import { MOCK_PRODUCTS, type Product } from "./mock-data";
import type { ColumnDef } from "@tanstack/react-table";

// ---- Column definitions ----

const PRODUCT_COLUMNS: ColumnDef<Product>[] = [
  {
    id: "sku",
    accessorKey: "sku",
    header: "SKU",
    size: 110,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
        {getValue() as string}
      </span>
    ),
  },
  {
    id: "name",
    accessorKey: "name",
    header: "ชื่อสินค้า",
    size: 280,
    cell: ({ getValue }) => (
      <span className="text-sm text-slate-800 font-medium line-clamp-1">{getValue() as string}</span>
    ),
  },
  {
    id: "category",
    accessorKey: "category",
    header: "หมวดหมู่",
    size: 160,
    meta: { filterable: true },  // auto-detect: ค่าซ้ำน้อย → select
    cell: ({ getValue }) => (
      <span className="text-sm text-slate-600">{getValue() as string}</span>
    ),
  },
  {
    id: "supplier",
    accessorKey: "supplier",
    header: "ผู้จำหน่าย",
    size: 200,
    meta: { filterable: true },  // auto-detect
    cell: ({ getValue }) => (
      <span className="text-xs text-slate-500 line-clamp-1">{getValue() as string}</span>
    ),
  },
  {
    id: "unit",
    accessorKey: "unit",
    header: "หน่วย",
    size: 80,
    cell: ({ getValue }) => (
      <span className="text-sm text-slate-600">{getValue() as string}</span>
    ),
  },
  {
    id: "cost_price",
    accessorKey: "cost_price",
    header: "ราคาต้นทุน",
    size: 110,
    meta: { filterable: true, filterType: "number" },
    cell: ({ getValue }) => {
      const val = getValue() as number;
      return val > 0 ? (
        <span className="text-sm text-slate-700 font-medium tabular-nums">
          ฿{val.toLocaleString("th-TH")}
        </span>
      ) : <span className="text-xs text-slate-400">—</span>;
    },
  },
  {
    id: "selling_price",
    accessorKey: "selling_price",
    header: "ราคาขาย",
    size: 100,
    meta: { filterable: true, filterType: "number" },
    cell: ({ getValue }) => {
      const val = getValue() as number;
      return val > 0 ? (
        <span className="text-sm text-slate-700 tabular-nums">
          ฿{val.toLocaleString("th-TH")}
        </span>
      ) : <span className="text-xs text-slate-400">—</span>;
    },
  },
  {
    id: "stock_on_hand",
    accessorKey: "stock_on_hand",
    header: "Stock คงเหลือ",
    size: 110,
    meta: { filterable: true, filterType: "number" },
    cell: ({ getValue, row }) => {
      const qty = getValue() as number;
      const minStock = row.original.min_stock;
      const isLow = qty <= minStock && qty > 0;
      const isEmpty = qty === 0;
      return (
        <span className={`text-sm font-medium tabular-nums ${
          isEmpty ? "text-red-600" : isLow ? "text-amber-600" : "text-slate-700"
        }`}>
          {qty.toLocaleString("th-TH")}
          {isLow && <span className="ml-1 text-xs text-amber-500">⚠</span>}
          {isEmpty && <span className="ml-1 text-xs text-red-500">✕</span>}
        </span>
      );
    },
  },
  {
    id: "status",
    accessorKey: "status",
    header: "สถานะ",
    size: 110,
    meta: {
      filterable: true,
      filterOptions: [
        { value: "active",    label: "Active" },
        { value: "inactive",  label: "Inactive" },
        { value: "low_stock", label: "Low Stock" },
      ],
    },
    cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
    enableSorting: false,
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "วันที่สร้าง",
    size: 110,
    cell: ({ getValue }) => (
      <span className="text-xs text-slate-500">{getValue() as string}</span>
    ),
  },
];

// ---- Saved Views ----

const PRODUCT_VIEWS = [
  {
    id: "all",
    label: "All Products",
  },
  {
    id: "active",
    label: "Active",
    filter: (row: Record<string, unknown>) => row.status === "active",
  },
  {
    id: "low_stock",
    label: "Low Stock",
    filter: (row: Record<string, unknown>) => row.status === "low_stock",
  },
  {
    id: "inactive",
    label: "Inactive",
    filter: (row: Record<string, unknown>) => row.status === "inactive",
  },
];

// ---- Demo Modes ----

type DemoMode = "normal" | "loading" | "error" | "empty";

export default function TablePlaygroundPage() {
  const [demoMode, setDemoMode] = useState<DemoMode>("normal");

  const demoModes: { id: DemoMode; label: string; desc: string }[] = [
    { id: "normal", label: "ปกติ", desc: "ข้อมูล 20 รายการ" },
    { id: "loading", label: "Loading", desc: "กำลังโหลดข้อมูล" },
    { id: "error", label: "Error", desc: "เกิดข้อผิดพลาด" },
    { id: "empty", label: "Empty", desc: "ไม่มีข้อมูล" },
  ];

  return (
    <PlaygroundShell>
      {/* Page Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          ✅ Phase 5 — Universal DataTable
        </div>
        <h1 className="text-2xl font-bold text-slate-900">📊 Table Playground</h1>
        <p className="text-slate-500 mt-1">
          ตารางกลาง — ทุกโมดูลใช้ตัวเดียวกัน ไม่ต้องสร้างใหม่ทุกหน้า
        </p>
      </div>

      <div className="px-8 py-6 space-y-8">

        {/* Feature summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: "🔍", label: "Search", desc: "ค้นหาทุก field" },
            { icon: "☑️", label: "Bulk Select", desc: "เลือกหลายรายการ" },
            { icon: "⚙️", label: "Column Manager", desc: "ซ่อน/แสดง column" },
            { icon: "📂", label: "Saved Views", desc: "กรองตามมุมมอง" },
            { icon: "🔀", label: "Sort", desc: "เรียงทุก column" },
            { icon: "📄", label: "Pagination", desc: "แบ่งหน้า" },
            { icon: "💡", label: "Row Actions", desc: "เมนูแต่ละแถว" },
            { icon: "⚡", label: "Bulk Actions", desc: "ทำหลายรายการพร้อมกัน" },
          ].map((f) => (
            <div key={f.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex items-center gap-3">
              <span className="text-xl">{f.icon}</span>
              <div>
                <p className="text-sm font-medium text-slate-700">{f.label}</p>
                <p className="text-xs text-slate-400">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Demo mode toggle */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">ทดลอง State ต่างๆ</p>
          <div className="flex flex-wrap gap-2">
            {demoModes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setDemoMode(mode.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                  demoMode === mode.id
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                {mode.label}
                <span className="ml-1.5 text-xs opacity-70">{mode.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* The actual DataTable */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <DataTable<Product>
            data={demoMode === "empty" ? [] : MOCK_PRODUCTS}
            columns={PRODUCT_COLUMNS}
            title="สินค้า (Products)"
            description="ทะเบียนสินค้าทั้งหมดในระบบ — ข้อมูล Mock สำหรับทดสอบ"
            loading={demoMode === "loading"}
            error={demoMode === "error" ? "ไม่สามารถโหลดข้อมูลสินค้าได้ กรุณาตรวจสอบการเชื่อมต่อ" : undefined}
            emptyMessage="ไม่พบสินค้า ลองเปลี่ยนคำค้นหาหรือเลือก View อื่น"
            searchPlaceholder="ค้นหาจาก SKU / ชื่อสินค้า / หมวดหมู่..."
            searchableKeys={["sku", "name", "category", "supplier"]}
            views={PRODUCT_VIEWS}
            rowActions={[
              {
                label: "ดูรายละเอียด",
                icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
                onClick: (row) => alert(`ดูสินค้า: ${row.name}\nSKU: ${row.sku}`),
              },
              {
                label: "แก้ไข",
                icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
                onClick: (row) => alert(`แก้ไขสินค้า: ${row.name}`),
              },
              {
                label: "Archive",
                icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></svg>,
                onClick: (row) => alert(`Archive: ${row.name}`),
                variant: "danger",
              },
            ]}
            bulkActions={[
              {
                label: "Export ที่เลือก",
                onClick: (rows) => alert(`Export ${rows.length} รายการ`),
              },
              {
                label: "เปลี่ยนสถานะ",
                onClick: (rows) => alert(`เปลี่ยนสถานะ ${rows.length} รายการ`),
              },
              {
                label: "Archive ที่เลือก",
                onClick: (rows) => alert(`Archive ${rows.length} รายการ`),
                variant: "danger",
              },
            ]}
            onRetry={() => setDemoMode("normal")}
          />
        </div>

        {/* How to use */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">วิธีใช้ DataTable กลาง</h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-3">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                <div>
                  <p className="font-medium text-slate-700">กำหนด columns</p>
                  <p className="text-slate-500 text-xs mt-0.5">บอกว่า column ไหนแสดงอะไร จาก field ไหนใน data</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                <div>
                  <p className="font-medium text-slate-700">กำหนด views (optional)</p>
                  <p className="text-slate-500 text-xs mt-0.5">Saved Views สำหรับกรองข้อมูลล่วงหน้า เช่น Active, Low Stock</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                <div>
                  <p className="font-medium text-slate-700">กำหนด row actions</p>
                  <p className="text-slate-500 text-xs mt-0.5">เมนู 3 จุดด้านขวาของแต่ละแถว เช่น ดู / แก้ไข / Archive</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                <div>
                  <p className="font-medium text-slate-700">กำหนด bulk actions</p>
                  <p className="text-slate-500 text-xs mt-0.5">ปุ่มที่ปรากฏเมื่อติ๊กเลือกหลายแถว เช่น Export, Archive</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">5</span>
                <div>
                  <p className="font-medium text-slate-700">ส่ง data เข้า</p>
                  <p className="text-slate-500 text-xs mt-0.5">ส่ง array ข้อมูล + loading / error state เข้ามา</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0">✓</span>
                <div>
                  <p className="font-medium text-slate-700">Search / Sort / Column Manager ได้เลย</p>
                  <p className="text-slate-500 text-xs mt-0.5">ทำงานอัตโนมัติ ไม่ต้องเขียนเพิ่ม</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Spec checklist */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Feature Checklist</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { done: true,  label: "Global Search" },
              { done: true,  label: "Sort by column" },
              { done: true,  label: "Saved Views (tabs)" },
              { done: true,  label: "Column Manager" },
              { done: true,  label: "Row Selection (checkbox)" },
              { done: true,  label: "Bulk Action Bar" },
              { done: true,  label: "Row Actions (3-dot menu)" },
              { done: true,  label: "Pagination + page size" },
              { done: true,  label: "Loading State (skeleton)" },
              { done: true,  label: "Empty State" },
              { done: true,  label: "Error State + Retry" },
              { done: true,  label: "Export button (UI)" },
              { done: true,  label: "Status Badge" },
              { done: true,  label: "Custom cell rendering" },
              { done: true,  label: "Filter panel (condition-based)" },
              { done: false, label: "Column reorder (drag)" },
              { done: false, label: "Pinned columns" },
              { done: false, label: "Supabase data source" },
              { done: false, label: "Field Registry integration" },
              { done: false, label: "Permission by field" },
              { done: false, label: "Audit Log" },
              { done: false, label: "Import" },
            ].map((item) => (
              <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                item.done ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"
              }`}>
                <span>{item.done ? "✅" : "⬜"}</span>
                {item.label}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-4">
            ✅ พร้อมใช้แล้ว — ⬜ จะทำใน Phase ถัดไป (Supabase + Field Registry)
          </p>
        </div>

      </div>
    </PlaygroundShell>
  );
}
