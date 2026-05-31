"use client";

import { useState, useEffect, useCallback } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable, StatusBadge } from "@/components/data-table";
import type { FieldRegistryEntry, ServerFetchParams } from "@/components/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import type { ApiProduct } from "@/types/products";
import type { FieldRegistryResponse } from "@/app/api/field-registry/product-skus/route";
import { apiFetch } from "@/lib/api";

// ---- Types ----

type DataSource = "mock" | "supabase";
type DemoMode  = "normal" | "loading" | "empty" | "error";

type DisplayProduct = {
  id:                 string;
  sku:                string;
  name:               string;
  display_name:       string;
  barcode:            string;
  category:           string;
  brand_name:         string;
  collection_name:    string;
  parent_sku_name:    string;
  supplier:           string;
  product_type:       string;
  color:              string;
  color_th_variation: string;
  unit:               string;
  purchase_uom_name:  string;
  moq:                number;
  cost_price:         number;
  selling_price:      number;
  fake_price:         number;
  stock_on_hand:      number;
  sale_ok:            boolean;
  purchase_ok:        boolean;
  ig_sell:            boolean;
  sync_status:        string;
  status:             "active" | "inactive" | "low_stock";
  created_at:         string;
  updated_at:         string;
};

// ---- Mock data ----

// ค่า default สำหรับ fields ใหม่ที่ mock data ยังไม่มี
const MOCK_EXTRA: Omit<DisplayProduct, "id"|"sku"|"name"|"category"|"supplier"|"unit"|"cost_price"|"selling_price"|"stock_on_hand"|"status"|"product_type"|"created_at"> = {
  display_name: "", barcode: "", brand_name: "", collection_name: "",
  parent_sku_name: "", color: "", color_th_variation: "",
  purchase_uom_name: "", moq: 0, fake_price: 0,
  sale_ok: true, purchase_ok: true, ig_sell: false,
  sync_status: "synced", updated_at: "",
};

const MOCK_PRODUCTS: DisplayProduct[] = [
  { ...MOCK_EXTRA, id: "1",  sku: "SKU-001", name: "กระดาษ A4 80gsm (รีม)",               category: "เครื่องเขียน",        supplier: "บริษัท ออฟฟิศซัพพลาย จำกัด", unit: "รีม",   cost_price: 95,  selling_price: 120, stock_on_hand: 240, status: "active",    product_type: "consu", created_at: "2025-01-10" },
  { ...MOCK_EXTRA, id: "2",  sku: "SKU-002", name: "ปากกาลูกลื่น สีน้ำเงิน (กล่อง 12 ด้าม)", category: "เครื่องเขียน",   supplier: "ชัพพลาย พาร์ท จำกัด",          unit: "กล่อง", cost_price: 42,  selling_price: 60,  stock_on_hand: 85,  status: "active",    product_type: "consu", created_at: "2025-01-12" },
  { ...MOCK_EXTRA, id: "3",  sku: "SKU-003", name: "แฟ้มเอกสาร A4 (แพ็ค 10 อัน)",        category: "เครื่องเขียน",        supplier: "บริษัท ออฟฟิศซัพพลาย จำกัด", unit: "แพ็ค",  cost_price: 120, selling_price: 160, stock_on_hand: 12,  status: "low_stock", product_type: "consu", created_at: "2025-01-15" },
  { ...MOCK_EXTRA, id: "4",  sku: "SKU-004", name: "น้ำยาล้างจาน (1 ลิตร)",              category: "สินค้าทำความสะอาด",    supplier: "เคมีภัณฑ์ไทย จำกัด",          unit: "ขวด",   cost_price: 35,  selling_price: 50,  stock_on_hand: 60,  status: "active",    product_type: "consu", created_at: "2025-01-18" },
  { ...MOCK_EXTRA, id: "5",  sku: "SKU-005", name: "หมึกปริ้นเตอร์ HP 680 Black",        category: "ไอที",                supplier: "ไอทีซัพพลาย จำกัด",           unit: "ชิ้น",  cost_price: 250, selling_price: 340, stock_on_hand: 8,   status: "low_stock", product_type: "consu", created_at: "2025-01-20" },
  { ...MOCK_EXTRA, id: "6",  sku: "SKU-006", name: "ลวดเย็บกระดาษ No.10 (กล่อง 1000 ตัว)", category: "เครื่องเขียน",    supplier: "ชัพพลาย พาร์ท จำกัด",          unit: "กล่อง", cost_price: 18,  selling_price: 28,  stock_on_hand: 150, status: "active",    product_type: "consu", created_at: "2025-01-22" },
  { ...MOCK_EXTRA, id: "7",  sku: "SKU-007", name: "กาวแท่ง Pritt (แพ็ค 6 ก้าน)",       category: "เครื่องเขียน",        supplier: "บริษัท ออฟฟิศซัพพลาย จำกัด", unit: "แพ็ค",  cost_price: 75,  selling_price: 98,  stock_on_hand: 45,  status: "active",    product_type: "consu", created_at: "2025-01-25" },
  { ...MOCK_EXTRA, id: "8",  sku: "SKU-008", name: "น้ำดื่ม 600ml (ลัง 12 ขวด)",         category: "อาหารและเครื่องดื่ม",  supplier: "เครื่องดื่มสดชื่น จำกัด",      unit: "ลัง",   cost_price: 48,  selling_price: 72,  stock_on_hand: 30,  status: "active",    product_type: "consu", created_at: "2025-02-01" },
  { ...MOCK_EXTRA, id: "9",  sku: "SKU-009", name: "เมาส์ USB Optical (ชิ้น)",           category: "ไอที",                supplier: "ไอทีซัพพลาย จำกัด",           unit: "ชิ้น",  cost_price: 180, selling_price: 250, stock_on_hand: 22,  status: "active",    product_type: "consu", created_at: "2025-02-03" },
  { ...MOCK_EXTRA, id: "10", sku: "SKU-010", name: "กาแฟสำเร็จรูป Nescafe 3in1 (กล่อง)", category: "อาหารและเครื่องดื่ม",  supplier: "เครื่องดื่มสดชื่น จำกัด",      unit: "กล่อง", cost_price: 120, selling_price: 180, stock_on_hand: 55,  status: "active",    product_type: "consu", created_at: "2025-02-05" },
  { ...MOCK_EXTRA, id: "11", sku: "SKU-011", name: "แฟลชไดร์ฟ 32GB USB 3.0",            category: "ไอที",                supplier: "ไอทีซัพพลาย จำกัด",           unit: "ชิ้น",  cost_price: 220, selling_price: 290, stock_on_hand: 0,   status: "inactive",  product_type: "consu", created_at: "2025-02-08" },
  { ...MOCK_EXTRA, id: "12", sku: "SKU-012", name: "คีย์บอร์ด USB ไทย-อังกฤษ",          category: "ไอที",                supplier: "ไอทีซัพพลาย จำกัด",           unit: "ชิ้น",  cost_price: 280, selling_price: 350, stock_on_hand: 18,  status: "active",    product_type: "consu", created_at: "2025-02-10" },
  { ...MOCK_EXTRA, id: "13", sku: "SKU-013", name: "น้ำยาทำความสะอาดกระจก (ขวด)",        category: "สินค้าทำความสะอาด",    supplier: "เคมีภัณฑ์ไทย จำกัด",          unit: "ขวด",   cost_price: 38,  selling_price: 55,  stock_on_hand: 42,  status: "active",    product_type: "consu", created_at: "2025-02-12" },
  { ...MOCK_EXTRA, id: "14", sku: "SKU-014", name: "สก๊อตเทปใส 1นิ้ว (ม้วน)",            category: "เครื่องเขียน",        supplier: "ชัพพลาย พาร์ท จำกัด",          unit: "ม้วน",  cost_price: 12,  selling_price: 20,  stock_on_hand: 200, status: "active",    product_type: "consu", created_at: "2025-02-15" },
  { ...MOCK_EXTRA, id: "15", sku: "SKU-015", name: "ถุงมือยางธรรมชาติ (กล่อง 100 ชิ้น)", category: "อุปกรณ์ป้องกัน",      supplier: "เคมีภัณฑ์ไทย จำกัด",          unit: "กล่อง", cost_price: 80,  selling_price: 120, stock_on_hand: 5,   status: "low_stock", product_type: "consu", created_at: "2025-02-18" },
];

// ---- Column definitions ----

// meta.filterable = true  →  column นี้จะปรากฏใน Filter panel อัตโนมัติ
// meta.filterType         →  ระบุประเภท filter (ถ้าไม่ระบุ DataTable auto-detect)
// meta.filterOptions      →  ตัวเลือกคงที่สำหรับ select type

const COLUMNS: ColumnDef<DisplayProduct>[] = [
  {
    accessorKey: "sku",
    header: "SKU",
    size: 110,
    meta: { group: "ข้อมูลหลัก" },
    cell: ({ getValue }) => (
      <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
        {(getValue() as string) || "—"}
      </span>
    ),
  },
  {
    accessorKey: "name",
    header: "ชื่อสินค้า",
    meta: { group: "ข้อมูลหลัก" },
    cell: ({ getValue }) => (
      <span className="text-sm font-medium text-slate-800 line-clamp-1">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: "category",
    header: "หมวดหมู่",
    size: 140,
    meta: { group: "ข้อมูลหลัก", filterable: true },
  },
  {
    accessorKey: "supplier",
    header: "ผู้จำหน่าย",
    meta: { group: "ข้อมูลหลัก", filterable: true },
  },
  { accessorKey: "unit", header: "หน่วย", size: 70, meta: { group: "ข้อมูลหลัก" } },
  {
    accessorKey: "cost_price",
    header: "ราคาต้นทุน",
    size: 110,
    meta: { group: "ราคา & สต็อก", filterable: true, filterType: "number" },
    cell: ({ getValue }) => {
      const v = getValue() as number;
      return v > 0
        ? <span className="text-sm tabular-nums text-slate-600">฿{v.toLocaleString("th-TH")}</span>
        : <span className="text-xs text-slate-400">—</span>;
    },
  },
  {
    accessorKey: "selling_price",
    header: "ราคาขาย",
    size: 100,
    meta: { group: "ราคา & สต็อก", filterable: true, filterType: "number" },
    cell: ({ getValue }) => {
      const v = getValue() as number;
      return v > 0
        ? <span className="text-sm tabular-nums font-medium text-slate-800">฿{v.toLocaleString("th-TH")}</span>
        : <span className="text-xs text-slate-400">—</span>;
    },
  },
  {
    accessorKey: "stock_on_hand",
    header: "STOCK คงเหลือ",
    size: 120,
    meta: { group: "ราคา & สต็อก", filterable: true, filterType: "number" },
    cell: ({ row }) => {
      const stock  = row.original.stock_on_hand;
      const isLow  = row.original.status === "low_stock";
      const isZero = stock === 0;
      return (
        <span className={`text-sm tabular-nums font-medium ${isZero ? "text-red-500" : isLow ? "text-amber-600" : "text-slate-700"}`}>
          {stock.toLocaleString("th-TH")}
          {isLow && !isZero && <span className="ml-1 text-xs">⚠️</span>}
          {isZero && <span className="ml-1 text-xs">🚫</span>}
        </span>
      );
    },
  },
  {
    accessorKey: "status",
    header: "สถานะ",
    size: 100,
    // filterOptions ระบุชัดเจน → ไม่ต้อง auto-compute (มั่นใจครบทุก status)
    meta: {
      group: "สถานะ",
      filterable: true,
      filterOptions: [
        { value: "active",    label: "Active" },
        { value: "inactive",  label: "Inactive" },
        { value: "low_stock", label: "Low Stock" },
      ],
    },
    cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
  },
  {
    accessorKey: "created_at",
    header: "วันที่สร้าง",
    size: 110,
    meta: { group: "ข้อมูลระบบ" },
    cell: ({ getValue }) => (
      <span className="text-xs text-slate-500">{getValue() as string}</span>
    ),
  },
];

// ---- Saved Views ----

const MOCK_VIEWS = [
  { id: "all",       label: "All Products" },
  { id: "active",    label: "Active",    filter: (r: Record<string, unknown>) => r.status === "active" },
  { id: "low_stock", label: "Low Stock", filter: (r: Record<string, unknown>) => r.status === "low_stock" },
  { id: "inactive",  label: "Inactive",  filter: (r: Record<string, unknown>) => r.status === "inactive" },
];

const SUPABASE_VIEWS = [
  { id: "all",      label: "All Products" },
  { id: "active",   label: "Active",   filter: (r: Record<string, unknown>) => r.status === "active" },
  { id: "inactive", label: "Inactive", filter: (r: Record<string, unknown>) => r.status === "inactive" },
];

// ---- Mapper: ApiProduct → DisplayProduct ----

function mapApiProduct(p: ApiProduct): DisplayProduct {
  return {
    id:                 p.id,
    sku:                p.sku                ?? "",
    name:               p.name,
    display_name:       p.display_name       ?? "",
    barcode:            p.barcode            ?? "",
    category:           p.category_name      ?? "—",
    brand_name:         p.brand_name         ?? "",
    collection_name:    p.collection_name    ?? "",
    parent_sku_name:    p.parent_sku_name     ?? "",
    supplier:           p.seller_name        ?? "—",
    product_type:       p.product_type       ?? "",
    color:              p.color              ?? "",
    color_th_variation: p.color_th_variation ?? "",
    unit:               p.uom_name           ?? "—",
    purchase_uom_name:  p.purchase_uom_name  ?? "",
    moq:                Number(p.moq)        || 0,
    cost_price:         0,   // sensitive — not in API
    selling_price:      Number(p.list_price) || 0,
    fake_price:         Number(p.fake_price) || 0,
    stock_on_hand:      0,   // not in API yet
    sale_ok:            p.sale_ok            ?? false,
    purchase_ok:        p.purchase_ok        ?? false,
    ig_sell:            p.ig_sell            ?? false,
    sync_status:        p.sync_status        ?? "",
    status:             p.active === false ? "inactive" : "active",
    created_at:         p.created_at ? p.created_at.slice(0, 10) : "",
    updated_at:         p.updated_at ? p.updated_at.slice(0, 10) : "",
  };
}

// ---- Product Detail Drawer Content ----

function ProductDrawerContent({ product }: { product: DisplayProduct }) {
  const isSupabaseProduct = product.cost_price === 0 && product.stock_on_hand === 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header badge row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-sm bg-slate-100 px-2.5 py-1 rounded-md text-slate-600 font-medium">
          {product.sku || "ไม่มี SKU"}
        </span>
        <StatusBadge status={product.status} />
        {product.product_type && (
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
            {product.product_type}
          </span>
        )}
      </div>

      {/* Product name */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 leading-snug">{product.name}</h2>
      </div>

      <div className="border-t border-slate-100" />

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <DetailField label="หมวดหมู่"   value={product.category} />
        <DetailField label="ผู้จำหน่าย" value={product.supplier} />
        <DetailField label="หน่วยนับ"   value={product.unit} />
        <DetailField label="วันที่สร้าง" value={product.created_at} />
      </div>

      <div className="border-t border-slate-100" />

      {/* Price & Stock */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ราคา & สต็อก</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">ราคาต้นทุน</p>
            <p className="text-lg font-bold text-slate-700">
              {product.cost_price > 0
                ? `฿${product.cost_price.toLocaleString("th-TH")}`
                : <span className="text-sm font-normal text-slate-400">—</span>
              }
            </p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-xs text-blue-500 mb-1">ราคาขาย</p>
            <p className="text-lg font-bold text-blue-700">
              {product.selling_price > 0
                ? `฿${product.selling_price.toLocaleString("th-TH")}`
                : <span className="text-sm font-normal text-slate-400">—</span>
              }
            </p>
          </div>
          <div className={`rounded-xl p-3 text-center ${
            product.status === "low_stock"
              ? "bg-amber-50"
              : product.stock_on_hand === 0
                ? "bg-red-50"
                : "bg-emerald-50"
          }`}>
            <p className={`text-xs mb-1 ${
              product.status === "low_stock" ? "text-amber-500"
              : product.stock_on_hand === 0   ? "text-red-500"
              : "text-emerald-500"
            }`}>STOCK</p>
            <p className={`text-lg font-bold ${
              product.status === "low_stock" ? "text-amber-700"
              : product.stock_on_hand === 0   ? "text-red-600"
              : "text-emerald-700"
            }`}>
              {product.stock_on_hand > 0
                ? product.stock_on_hand.toLocaleString("th-TH")
                : <span className="text-sm font-normal text-slate-400">—</span>
              }
            </p>
          </div>
        </div>
        {product.cost_price > 0 && product.selling_price > 0 && (
          <div className="mt-3 px-3 py-2 bg-slate-50 rounded-lg flex items-center justify-between">
            <span className="text-xs text-slate-500">กำไร (Margin)</span>
            <span className="text-sm font-semibold text-emerald-700">
              ฿{(product.selling_price - product.cost_price).toLocaleString("th-TH")}
              <span className="text-xs font-normal text-slate-500 ml-1">
                ({Math.round(((product.selling_price - product.cost_price) / product.selling_price) * 100)}%)
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Supabase note */}
      {isSupabaseProduct && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          💡 ราคาต้นทุนและ STOCK ไม่แสดงสำหรับข้อมูล Supabase เพื่อความปลอดภัย
        </div>
      )}

      <div className="border-t border-slate-100" />

      {/* Actions */}
      <div className="flex gap-3">
        <button className="flex-1 h-9 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          ✏️ แก้ไขสินค้า
        </button>
        <button className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          📋 ดูประวัติ
        </button>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value || "—"}</p>
    </div>
  );
}

// ---- Main Page ----

export default function ProductsDemoPage() {
  const [dataSource,     setDataSource]     = useState<DataSource>("mock");
  const [demoMode,       setDemoMode]       = useState<DemoMode>("normal");
  const [sbProducts,     setSbProducts]     = useState<DisplayProduct[]>([]);
  const [sbLoading,      setSbLoading]      = useState(false);
  const [sbError,        setSbError]        = useState<string | null>(null);
  const [sbTotal,        setSbTotal]        = useState(0);
  const [fieldRegistry,  setFieldRegistry]  = useState<FieldRegistryEntry[]>([]);

  // Fetch Field Registry ครั้งเดียวตอน mount
  useEffect(() => {
    apiFetch("/api/field-registry/product-skus")
      .then(r => r.json())
      .then((json: FieldRegistryResponse) => {
        if (json.data) setFieldRegistry(json.data);
      })
      .catch(() => {}); // silent fail — DataTable ยังใช้ auto-detect ได้
  }, []);

  const fetchFromSupabase = useCallback(async () => {
    setSbLoading(true);
    setSbError(null);
    try {
      const res = await fetch("/api/products?limit=200&page=1");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSbProducts((json.data as ApiProduct[]).map(mapApiProduct));
      setSbTotal(json.total);
    } catch (err: unknown) {
      setSbError(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setSbLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dataSource === "supabase") fetchFromSupabase();
  }, [dataSource, fetchFromSupabase]);

  // Server-side fetch — โหลดทีละหน้าจาก Supabase (12,609 แถว ไม่ต้องโหลดหมด)
  const supabaseServerFetch = useCallback(async (p: ServerFetchParams) => {
    const res = await fetch(`/api/products?search=${encodeURIComponent(p.search)}&page=${p.page}&limit=${p.pageSize}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    setSbTotal(json.total);
    return { rows: (json.data as ApiProduct[]).map(mapApiProduct), total: json.total as number };
  }, []);

  const isSupabase   = dataSource === "supabase";
  const tableData    = isSupabase ? sbProducts : (demoMode === "normal" ? MOCK_PRODUCTS : []);
  const tableLoading = isSupabase ? sbLoading  : demoMode === "loading";
  const tableError   = isSupabase ? sbError    : (demoMode === "error" ? "ไม่สามารถโหลดข้อมูลสินค้าได้ กรุณาลองใหม่" : undefined);

  // Supabase ไม่มีข้อมูล cost/stock → ซ่อน 2 columns นั้น
  // filter ของ column ที่ซ่อนจะหายไปอัตโนมัติ (DataTable อ่าน visibility แล้ว)
  const activeColumns: ColumnDef<DisplayProduct>[] = isSupabase
    ? COLUMNS.filter((c) => {
        const key = (c as { accessorKey?: string }).accessorKey;
        return key !== "cost_price" && key !== "stock_on_hand";
      })
    : COLUMNS;

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          ✅ Phase 8 — Example Module
        </div>
        <h1 className="text-2xl font-bold text-slate-900">📦 Products Module</h1>
        <p className="text-slate-500 mt-1">
          ตัวอย่างโมดูลสินค้า — กดที่ row เพื่อดูรายละเอียด • กด Filter เพื่อกรองข้อมูลตาม column
        </p>
      </div>

      <div className="px-8 py-6 space-y-5">

        {/* Data Source Toggle */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Data Source</p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => { setDataSource("mock"); setDemoMode("normal"); }}
              className={`flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-lg border transition-colors ${
                dataSource === "mock"
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              📋 Mock Data
              <span className="text-xs opacity-60">{MOCK_PRODUCTS.length} รายการ</span>
            </button>
            <button
              onClick={() => setDataSource("supabase")}
              className={`flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-lg border transition-colors ${
                dataSource === "supabase"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
              }`}
            >
              🗄️ Supabase จริง
              {sbTotal > 0 && (
                <span className="text-xs opacity-80">
                  ({sbTotal.toLocaleString()} รายการ — โหลด 200 แรก)
                </span>
              )}
            </button>
            {dataSource === "supabase" && !sbLoading && (
              <button
                onClick={fetchFromSupabase}
                className="h-9 px-3 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                🔄 Refresh
              </button>
            )}
          </div>

          {/* Supabase status */}
          {isSupabase && !sbLoading && !sbError && sbProducts.length > 0 && (
            <div className="mt-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-2">
              <span className="text-blue-500 text-sm">🟢</span>
              <span className="text-xs text-blue-700">
                เชื่อมต่อ Supabase สำเร็จ — ข้อมูลจาก{" "}
                <code className="font-mono bg-blue-100 px-1 rounded">product_skus</code>{" "}
                ({sbProducts.length.toLocaleString()} / {sbTotal.toLocaleString()} รายการ)
              </span>
            </div>
          )}

          {/* Mock mode sub-toggles */}
          {dataSource === "mock" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(["normal", "loading", "empty", "error"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setDemoMode(m)}
                  className={`h-8 px-3 text-xs font-medium rounded-lg border transition-colors ${
                    demoMode === m
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  {m === "normal" ? "📊 Normal" : m === "loading" ? "⏳ Loading" : m === "empty" ? "📭 Empty" : "❌ Error"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Supabase flow info */}
        {isSupabase && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-xl mt-0.5">🔐</span>
            <div className="text-sm">
              <p className="font-semibold text-emerald-800 mb-1">วิธีที่ข้อมูลไหล (ปลอดภัย)</p>
              <div className="flex items-center gap-1.5 flex-wrap text-emerald-700 text-xs">
                <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-full">หน้าเว็บ</span>
                <span>→</span>
                <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-full">/api/products</span>
                <span>→</span>
                <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-full">erp_playground_get_products()</span>
                <span>→</span>
                <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-full">product_skus</span>
              </div>
              <p className="text-xs text-emerald-600 mt-1.5">ไม่เปิด RLS ตรง • ไม่ใช้ service_role key • ราคาต้นทุนไม่ถูกส่งออกมา</p>
            </div>
          </div>
        )}

        {/* DataTable */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <DataTable<DisplayProduct>
            data={tableData}
            columns={activeColumns}
            title={isSupabase
              ? `รายการสินค้า (Supabase — ${sbTotal.toLocaleString()} รายการ)`
              : "สินค้า (Products)"
            }
            description={isSupabase
              ? "ข้อมูลจริงจาก product_skus — โหลดทีละหน้าจาก server (server-side pagination)"
              : "ทะเบียนสินค้าทั้งหมดในระบบ — ข้อมูล Mock สำหรับทดสอบ"
            }
            serverFetch={isSupabase ? supabaseServerFetch : undefined}
            loading={tableLoading}
            error={tableError ?? undefined}
            emptyMessage={isSupabase ? "ไม่พบสินค้า — ลองกด Refresh" : "ไม่พบสินค้า"}
            searchPlaceholder="ค้นหา SKU / ชื่อสินค้า / หมวดหมู่..."
            searchableKeys={["sku", "name", "category", "supplier"]}
            views={isSupabase ? SUPABASE_VIEWS : MOCK_VIEWS}
            rowActions={[
              { label: "แก้ไข",    icon: "✏️",  onClick: (row) => alert(`แก้ไข: ${row.name}`) },
              { label: "ลบสินค้า", icon: "🗑️",  onClick: (row) => alert(`ลบ: ${row.name}`), variant: "danger" },
            ]}
            bulkActions={[
              { label: "Export",     onClick: (rows) => alert(`Export ${rows.length} รายการ`) },
              { label: "ปิดใช้งาน", onClick: (rows) => alert(`ปิดใช้งาน ${rows.length} รายการ`), variant: "danger" },
            ]}
            pageSize={20}
            onRetry={isSupabase ? fetchFromSupabase : () => setDemoMode("normal")}
            drawerTitle={(row) => row.name}
            drawerContent={(row) => <ProductDrawerContent product={row} />}
            tableId="products"
            fieldRegistry={fieldRegistry}
          />
        </div>

      </div>
    </PlaygroundShell>
  );
}
