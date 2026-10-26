"use client";

/**
 * 📤 ลงสินค้าบนแพลตฟอร์ม — /master/platform-listing · แอป "ช่องทางขาย"
 * เอาสินค้าจาก ERP ขึ้นร้าน (คนละทิศกับ 🛒 สินค้าบนแพลตฟอร์ม ที่ดูของที่อยู่บนร้าน)
 *
 * เลือกร้าน + แบรนด์ → ตารางกลางแสดงสินค้าทั้งแบรนด์ + สถานะ (ยังไม่เตรียม · เตรียมแล้ว·ขาดข้อมูล · พร้อมลง · ลงแล้ว)
 * เลือกหลายตัว → 📤 เตรียมลงสินค้า (บันทึกร่าง + ตรวจ) / 🗂️ ตั้งหมวดกลาง · รายแถว → เปิดตัวจัดการเดิมตรงแท็บร้านนั้น
 * ร้านที่ยังไม่มีตัวเชื่อมจริง (เช่น Lazada) = เตรียมร่างได้อย่างเดียว ยังไม่ส่งอะไรไปที่ร้าน · docs/platform-listing.md
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { isSellingPlatform } from "@/lib/selling-platforms";
import { PrepareListingDialog, type PrepareRow } from "@/components/platform-listing/prepare-dialog";
import { BulkCategoryDialog } from "@/components/platform-listing/bulk-category-dialog";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">กำลังโหลด...</div> },
);
const ProductPlatformManager = dynamic(() => import("@/components/product-platform-manager").then((m) => m.ProductPlatformManager), { ssr: false });


type Platform = { id: string; code: string; name_th: string };
type Brand = { id: string; name: string };
type Summary = { total: number; listed: number; ready: number; missing: number; new: number; new_ready_now: number; no_category: number };

const STATUS_STYLE: Record<string, string> = {
  "ลงแล้ว": "bg-violet-50 text-violet-700 border-violet-200",
  "พร้อมลง": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "เตรียมแล้ว · ขาดข้อมูล": "bg-amber-50 text-amber-800 border-amber-200",
  "ยังไม่เตรียม": "bg-slate-100 text-slate-600 border-slate-200",
};
const muted = (v: unknown) => v ? <span className="text-sm text-slate-700">{String(v)}</span> : <span className="text-xs text-slate-300">—</span>;

export default function PlatformListingPage() {
  const toast = useToast();
  const canView = usePermission("products.platforms.view");
  const canEdit = usePermission("products.platforms.edit");
  const canPublish = usePermission("products.platforms.publish");

  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [platformCode, setPlatformCode] = useState("");
  const [brandId, setBrandId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [canRealPublish, setCanRealPublish] = useState(false);
  const [tick, setTick] = useState(0);

  const [prepareRows, setPrepareRows] = useState<PrepareRow[] | null>(null);
  const [catRows, setCatRows] = useState<{ id: string; code: string }[] | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);

  // ร้าน + แบรนด์ (ใช้ endpoint เดียวกับหน้าตั้งร้าน — ตัดแบรนด์งานลูกค้าออกแล้ว)
  useEffect(() => {
    if (!canView) return;
    (async () => {
      try {
        const j = await apiFetch("/api/platform-accounts").then((r) => r.json());
        if (j.error) throw new Error(j.error);
        // เฉพาะร้านขายของ (ไม่รวมช่องทางโพสต์คอนเทนต์ เช่น Facebook/IG/YouTube) — erp_platforms ยังไม่มีธงแยกประเภท
        const pfs = ((j.platforms ?? []) as Record<string, unknown>[])
          .filter((p) => isSellingPlatform(String(p.code)))
          .map((p) => ({ id: String(p.id), code: String(p.code), name_th: String(p.name_th ?? p.code) }));
        const brs = ((j.brands ?? []) as Record<string, unknown>[]).map((b) => ({ id: String(b.id), name: String(b.name ?? "") }));
        setPlatforms(pfs); setBrands(brs);
        setPlatformCode((cur) => cur || (pfs.find((p) => p.code === "lazada") ?? pfs[0])?.code || "");
        setBrandId((cur) => cur || (brs.find((b) => b.name === "IG International") ?? brs[0])?.id || "");
      } catch (e) { setLoadError(e instanceof Error ? e.message : "โหลดไม่ได้"); }
    })();
  }, [canView]);

  const platform = platforms.find((p) => p.code === platformCode) ?? null;
  const brand = brands.find((b) => b.id === brandId) ?? null;

  const loadSummary = useCallback(async () => {
    if (!platformCode || !brandId) return;
    setSummary(null);
    try {
      const j = await apiFetch(`/api/product-platforms/readiness?platform_code=${encodeURIComponent(platformCode)}&brand_id=${encodeURIComponent(brandId)}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setSummary(j.summary as Summary);
      setCanRealPublish(!!j.platform?.can_publish);
    } catch (e) { toast.error(e instanceof Error ? e.message : "โหลดสรุปไม่ได้"); }
  }, [platformCode, brandId, toast]);
  useEffect(() => { void loadSummary(); }, [loadSummary, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const description = useMemo(() => {
    const parts: string[] = [`เอาสินค้าจาก ERP ขึ้นร้าน ${platform?.name_th ?? ""}${brand ? ` ของ ${brand.name}` : ""}`];
    if (summary) {
      parts.push(`ทั้งหมด ${summary.total} · พร้อมลง ${summary.ready} · ขาดข้อมูล ${summary.missing} · ยังไม่เตรียม ${summary.new} (ถ้าเตรียมตอนนี้พร้อม ${summary.new_ready_now}) · ลงแล้ว ${summary.listed}`);
      if (summary.no_category) parts.push(`ยังไม่มีหมวดของร้าน ${summary.no_category} สินค้า — ตั้งหมวดกลางแล้วจับคู่กับร้าน`);
    }
    if (platform && !canRealPublish) parts.push(`ยังไม่เปิดลงสินค้าจริงบน ${platform.name_th} — ตอนนี้เตรียมและบันทึกร่างได้อย่างเดียว`);
    return parts.join(" · ");
  }, [platform, brand, summary, canRealPublish]);

  const config = useMemo<MasterCRUDConfig | null>(() => {
    if (!platform || !brandId) return null;
    const toPrep = (rows: Record<string, unknown>[]): PrepareRow[] => rows.map((r) => ({ id: String(r.id), code: String(r.code ?? ""), status: String(r.status ?? "") }));
    return {
      apiBase: "/api/product-platforms/", apiPath: "readiness", tableId: "platform-listing",
      title: `ลงสินค้าบน ${platform.name_th}`, icon: "📤", description,
      readOnly: true, hideActiveStatus: true, pageLimit: 20000, uniqueKey: "id",
      extraQuery: { platform_code: platform.code, brand_id: brandId },
      permissions: { view: "products.platforms.view", create: "products.platforms.edit", edit: "products.platforms.edit" },
      defaultShowAllColumns: true,
      searchKeys: ["code", "name", "central_category", "platform_category", "missing"],
      headerActions: () => (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">ร้าน
            <select value={platformCode} onChange={(e) => setPlatformCode(e.target.value)} className="h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700">
              {platforms.map((p) => <option key={p.code} value={p.code}>{p.name_th}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">แบรนด์
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700">
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        </div>
      ),
      extraBulkActions: canEdit ? [
        { label: "📤 เตรียมลงสินค้า", onClick: (rows) => setPrepareRows(toPrep(rows)) },
        { label: "🗂️ ตั้งหมวดกลาง", onClick: (rows) => setCatRows(rows.map((r) => ({ id: String(r.id), code: String(r.code ?? "") }))) },
      ] : undefined,
      extraRowActions: [
        { label: `เปิดตัวจัดการ (${platform.name_th})`, icon: "🏬", onClick: (row) => setManageId(String(row.id)) },
        ...(canEdit ? [{ label: "เตรียมลงสินค้าตัวนี้", icon: "📤", show: (row: Record<string, unknown>) => row.status !== "listed", onClick: (row: Record<string, unknown>) => setPrepareRows(toPrep([row])) }] : []),
      ],
      fields: [
        {
          key: "status_label", label: "สถานะ", type: "select", colSize: 170, filterType: "select",
          options: Object.keys(STATUS_STYLE),
          cellRender: (v) => <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_STYLE[String(v)] ?? STATUS_STYLE["ยังไม่เตรียม"]}`}>{String(v ?? "—")}</span>,
        },
        { key: "code", label: "รหัสรุ่น", type: "text", colSize: 120, cellRender: (v) => <span className="text-sm font-medium text-slate-800">{String(v ?? "")}</span> },
        { key: "name", label: "ชื่อสินค้า", type: "text", colSize: 280 },
        {
          key: "ready_label", label: "ความพร้อม", type: "text", colSize: 100,
          cellRender: (v) => <span className={`text-sm font-medium ${v === "พร้อม" ? "text-emerald-700" : "text-rose-700"}`}>{String(v ?? "")}</span>,
        },
        { key: "missing", label: "ยังขาด", type: "text", colSize: 320, cellRender: (v) => v ? <span className="text-xs text-rose-700">{String(v)}</span> : <span className="text-xs text-slate-300">—</span> },
        { key: "platform_category", label: `หมวดบน ${platform.name_th}`, type: "text", colSize: 240, cellRender: muted },
        { key: "central_category", label: "หมวดกลาง", type: "text", colSize: 160, cellRender: muted },
        { key: "variant_count", label: "ตัวเลือก", type: "number", colSize: 80 },
        { key: "price_erp", label: "ราคา ERP (บาท)", type: "text", colSize: 120 },
        { key: "price_platform", label: `ราคาบน ${platform.name_th}`, type: "text", colSize: 130 },
        { key: "image_count", label: "รูป", type: "number", colSize: 70 },
        { key: "warnings", label: "ควรดู", type: "text", colSize: 280, cellRender: (v) => v ? <span className="text-xs text-amber-700">{String(v)}</span> : <span className="text-xs text-slate-300">—</span> },
        {
          key: "prepared_at", label: "เตรียมล่าสุด", type: "text", colSize: 130,
          cellRender: (v) => v ? <span className="text-xs text-slate-500">{new Date(String(v)).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short", hour12: false })}</span> : <span className="text-xs text-slate-300">—</span>,
        },
      ],
    };
  }, [platform, platforms, platformCode, brands, brandId, description, canEdit]);

  if (!canView) return <AccessDenied />;
  if (loadError) return (
    <div className="p-10 text-center">
      <div className="text-sm text-red-600 mb-3">เกิดข้อผิดพลาดในการโหลดข้อมูล: {loadError}</div>
      <button onClick={() => window.location.reload()} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ลองใหม่</button>
    </div>
  );
  if (!config) return <div className="p-10 text-center text-slate-400">กำลังโหลด...</div>;

  return (
    <>
      <MasterCRUDPage key={`${platformCode}:${brandId}:${tick}`} config={config} />

      <PrepareListingDialog open={!!prepareRows} platform={platform} rows={prepareRows ?? []}
        onClose={() => setPrepareRows(null)} onDone={refresh} />

      <BulkCategoryDialog open={!!catRows} rows={catRows ?? []} platformName={platform?.name_th ?? "ร้าน"}
        onClose={() => setCatRows(null)}
        onDone={(msg) => { setCatRows(null); toast.success(msg); refresh(); }} />

      {manageId && platform && (
        <ProductPlatformManager parentSkuId={manageId} initialPlatformId={platform.id} canEdit={canEdit} canPublish={canPublish}
          onClose={() => { setManageId(null); refresh(); }} />
      )}
    </>
  );
}
