"use client";

/**
 * Master Data v2 — Parent SKUs page
 *
 * URL: /master/parent-skus
 *
 * แสดง 1,471 parent templates จาก parent_skus_v2 (Master Data v2)
 * ใช้ DataTable กลาง + apiFetch (forward auth) + PlaygroundShell
 */

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { apiFetch } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import type { ParentSkuV2Row, ParentSkusV2Response } from "@/app/api/master-v2/parent-skus/route";

// ============================================================
// Columns
// ============================================================

const FAMILY_LABEL: Record<string, { label: string; color: string }> = {
  general: { label: "ทั่วไป",   color: "bg-slate-100 text-slate-700" },
  bag:     { label: "กระเป๋า",  color: "bg-blue-100 text-blue-700" },
  belt:    { label: "เข็มขัด",  color: "bg-amber-100 text-amber-700" },
  jewelry: { label: "จิวเวลรี", color: "bg-pink-100 text-pink-700" },
  spare:   { label: "อะไหล่",   color: "bg-violet-100 text-violet-700" },
};

const COLUMNS: ColumnDef<ParentSkuV2Row>[] = [
  {
    accessorKey: "code",
    header: "Code",
    size: 130,
    cell: ({ getValue, row }) => {
      const code = getValue() as string;
      const isDup = code.includes("_DUP_");
      return (
        <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${isDup ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}
              title={isDup ? "ซ้ำ — ตรวจสอบและรวม/เปลี่ยนรหัส" : undefined}>
          {code}
        </span>
      );
    },
  },
  {
    accessorKey: "name_th",
    header: "ชื่อสินค้า",
    cell: ({ getValue }) => (
      <span className="text-sm text-slate-800 line-clamp-2">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: "product_family",
    header: "หมวด",
    size: 100,
    meta: { filterable: true, filterType: "select" },
    cell: ({ getValue }) => {
      const v = getValue() as string;
      const cfg = FAMILY_LABEL[v] ?? { label: v, color: "bg-slate-100 text-slate-600" };
      return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.color}`}>
          {cfg.label}
        </span>
      );
    },
  },
  {
    accessorKey: "brand_name",
    header: "Brand",
    size: 140,
    meta: { filterable: true },
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      return v ? <span className="text-sm text-slate-700">{v}</span> : <span className="text-xs text-slate-300">—</span>;
    },
  },
  {
    accessorKey: "collection_name",
    header: "Collection",
    size: 160,
    meta: { filterable: true },
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      return v ? <span className="text-sm text-slate-600">{v}</span> : <span className="text-xs text-slate-300">—</span>;
    },
  },
  {
    accessorKey: "size_summary",
    header: "Size",
    size: 100,
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      return v ? <span className="text-xs text-slate-500">{v}</span> : <span className="text-xs text-slate-300">—</span>;
    },
  },
  {
    accessorKey: "sale_price",
    header: "ราคาขาย",
    size: 100,
    meta: { filterable: true, filterType: "number" },
    cell: ({ getValue }) => {
      const v = getValue() as number | null;
      return v ? (
        <span className="text-sm tabular-nums font-medium text-slate-800">
          ฿{v.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
        </span>
      ) : <span className="text-xs text-slate-300">—</span>;
    },
  },
  {
    accessorKey: "warranty",
    header: "Warranty",
    size: 100,
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      return v ? <span className="text-xs text-slate-500 line-clamp-1">{v}</span> : <span className="text-xs text-slate-300">—</span>;
    },
  },
  {
    accessorKey: "is_active",
    header: "สถานะ",
    size: 80,
    meta: { filterable: true, filterType: "select" },
    cell: ({ getValue }) => {
      const active = getValue() as boolean;
      return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
          active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
        }`}>
          {active ? "Active" : "Inactive"}
        </span>
      );
    },
  },
];

// ============================================================
// Page
// ============================================================

export default function ParentSkusV2Page() {
  const [rows, setRows]       = useState<ParentSkuV2Row[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch("/api/master-v2/parent-skus?limit=500&include_inactive=true")
      .then((r) => r.json() as Promise<ParentSkusV2Response>)
      .then((res) => {
        if (res.error) setError(res.error);
        else { setRows(res.data); setTotal(res.total); }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const byFamily = new Map<string, number>();
    let withBrand = 0, withCollection = 0, dups = 0;
    for (const r of rows) {
      byFamily.set(r.product_family, (byFamily.get(r.product_family) ?? 0) + 1);
      if (r.brand_id) withBrand++;
      if (r.collection_id) withCollection++;
      if (r.code.includes("_DUP_")) dups++;
    }
    return { byFamily, withBrand, withCollection, dups };
  }, [rows]);

  return (
    <PlaygroundShell>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-[1600px] mx-auto px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <Link href="/apps" className="hover:text-blue-600">Apps</Link>
                  <span>›</span>
                  <span>Master Data</span>
                  <span>›</span>
                  <span className="text-slate-700">Parent SKUs</span>
                </div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  📦 Parent SKUs <span className="text-sm font-normal text-slate-500">(Product Templates)</span>
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  ข้อมูลแม่ของสินค้า — แต่ละ Parent มี SKU variants ภายใต้
                </p>
              </div>
              <Link
                href="/master/parent-skus/new"
                className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors opacity-50 pointer-events-none"
                title="ยังไม่เปิดให้สร้างใหม่ (รอ RPC mutation)"
              >
                + เพิ่ม Parent SKU
              </Link>
            </div>

            {/* Stats strip */}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md font-medium">
                ทั้งหมด <strong>{total.toLocaleString("th-TH")}</strong>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md">
                มี Brand: {stats.withBrand}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-50 text-violet-700 rounded-md">
                มี Collection: {stats.withCollection}
              </span>
              {stats.dups > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md" title="Code ซ้ำที่ migrate มา — ต้องตรวจสอบและรวม">
                  ⚠️ ซ้ำ: {stats.dups}
                </span>
              )}
              {[...stats.byFamily.entries()].map(([fam, n]) => (
                <span key={fam} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md">
                  {FAMILY_LABEL[fam]?.label ?? fam}: {n}
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* Body */}
        <main className="max-w-[1600px] mx-auto px-6 py-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <strong>เกิดข้อผิดพลาด:</strong> {error}
            </div>
          )}

          <DataTable
            data={rows}
            columns={COLUMNS}
            loading={loading}
            tableId="master-parent-skus-v2"
            searchPlaceholder="ค้นหา code หรือชื่อ..."
            emptyMessage="ไม่มี Parent SKU"
          />
        </main>
      </div>
    </PlaygroundShell>
  );
}
