"use client";

/**
 * 🖨 พิมพ์เช็กลิสต์ "หมวดในร้าน" — /print/shop-categories?brand=<id>&platform=<id>
 *   เปิดจากปุ่ม "พิมพ์เช็กลิสต์" ในแท็บหมวดในร้าน (components/platform-catalog/shop-category-planner)
 *   ข้อมูล = GET /api/platform-shop-categories (ตัวเดียวกับหน้าจอ) → เช็กลิสต์ lib/shop-category-plan → ใบพิมพ์ lib/shop-category-print
 *   ตั้งค่าหน้าพิมพ์ = ของกลาง ListPrintPanel · JPG = SaveImageButton · ไม่บันทึกประวัติพิมพ์ (พิมพ์ใหม่ได้ทุกครั้งจากแผนล่าสุด)
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ErrorState, LoadingState } from "@/components/state-views";
import { printReportHtmlInNewWindow } from "@/components/report";
import { ListPrintFrame } from "@/components/report/list-print-frame";
import { ListPrintPanel } from "@/components/report/list-print-panel";
import { SaveImageButton } from "@/components/report/save-image-button";
import { useListPrintSettings } from "@/components/report/use-list-print-settings";
import { useAuth } from "@/components/auth";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { shortcutKey } from "@/lib/shortcut-key";
import { estimateListPages } from "@/lib/list-print";
import { shopCategoryChecklist, type ShopCat, type ShopCatItem, type ShopCatProduct } from "@/lib/shop-category-plan";
import { SHOP_CAT_PRINT_GROUPS, SHOP_CAT_PRINT_PRESETS, SHOP_CAT_PRINT_SORTS, SHOP_CAT_PRINT_TITLE, buildShopCatPrint, shopCatPrintColumns, shopCatPrintDefaults } from "@/lib/shop-category-print";

type Resp = { cats: ShopCat[]; items: ShopCatItem[]; products: ShopCatProduct[]; platform: { name: string } | null; error: string | null };
type Company = { id: string; name: string; logo_key: string | null };
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function Inner() {
  const sp = useSearchParams();
  const brand = sp.get("brand") ?? "", platform = sp.get("platform") ?? "";
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");
  useEffect(() => {
    apiFetch(`/api/platform-shop-categories?brand_id=${encodeURIComponent(brand)}&platform_id=${encodeURIComponent(platform)}`).then((r) => r.json())
      .then((j: Resp) => { if (j.error) throw new Error(j.error); setData(j); })
      .catch((e: Error) => setErr(e.message || "โหลดไม่สำเร็จ"));
    apiFetch("/api/platform-accounts").then((r) => r.json()).then((j: { brands?: { id: string; name: string }[] }) => setBrandName(j.brands?.find((b) => b.id === brand)?.name ?? "")).catch(() => {});
  }, [brand, platform]);
  if (err) return <div className="min-h-screen bg-slate-100 py-16"><ErrorState title="โหลดเช็กลิสต์ไม่สำเร็จ" hint={err} /></div>;
  if (!data) return <LoadingState />;
  return <View data={data} shopLabel={[data.platform?.name, brandName].filter(Boolean).join(" · ")} />;
}

function View({ data, shopLabel }: { data: Resp; shopLabel: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const available = useMemo(() => shopCatPrintColumns(), []);
  const defaults = useMemo(() => shopCatPrintDefaults(), []);
  const print = useListPrintSettings({ reportKey: "shop-categories", family: "shop-categories", available, defaults });
  const s = print.settings;
  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    apiFetch("/api/admin/companies").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] }))
      .then((co: { data?: Company[] }) => setCompanies((co.data ?? []).map((c) => ({ id: c.id, name: c.name, logo_key: c.logo_key ?? null }))));
  }, []);
  const company = companies.find((c) => c.id === s.companyId) ?? null;
  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data]);
  const steps = useMemo(() => shopCategoryChecklist(data.cats, data.items, (id) => productById.get(id)?.code ?? id), [data, productById]);
  const productByCode = useMemo(() => new Map(data.products.map((p) => [p.code, p])), [data]);
  const result = useMemo(() => buildShopCatPrint({
    steps, productByCode, settings: s, company, shopLabel,
    origin: typeof window !== "undefined" ? window.location.origin : "",
    printedAt: new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Bangkok" }),
  }), [steps, productByCode, s, company, shopLabel]);
  const html = result.html;
  const doPrint = () => { if (html) printReportHtmlInNewWindow(html); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && shortcutKey(e) === "p") { e.preventDefault(); if (html) printReportHtmlInNewWindow(html); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [html]);
  const frameWidth = s.orientation === "landscape" ? (s.paper === "A5" ? 840 : 1180) : s.paper === "A5" ? 600 : 840;
  const paperPx = s.orientation === "landscape" ? (s.paper === "A5" ? 794 : 1123) : s.paper === "A5" ? 559 : 794;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-3 sm:gap-3 sm:px-6">
        <button onClick={() => router.back()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"><Icon name="back" /> กลับ</button>
        <span className="min-w-0 truncate text-sm text-slate-600"><Icon name="print" /> {s.title.trim() || SHOP_CAT_PRINT_TITLE} · {shopLabel} · {steps.length.toLocaleString("th-TH")} ข้อ</span>
        <div className="flex-1" />
        <SaveImageButton html={html} fileName={`${s.title.trim() || SHOP_CAT_PRINT_TITLE} ${shopLabel} ${todayLocal()}`} pageWidthPx={paperPx} />
        <button onClick={doPrint} disabled={!html} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">พิมพ์ / บันทึก PDF</button>
      </div>
      <div className="flex flex-col items-start gap-4 px-4 py-6 lg:flex-row">
        <div className="w-full min-w-0 flex-1"><ListPrintFrame html={html} state={print} maxWidth={frameWidth} onPrint={doPrint} /></div>
        <aside className="no-print order-first w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 lg:order-none lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:w-[330px] lg:overflow-y-auto" aria-label="ตั้งค่าหน้าพิมพ์">
          <ListPrintPanel state={print} available={available} sorts={SHOP_CAT_PRINT_SORTS} groups={SHOP_CAT_PRINT_GROUPS} builtinPresets={SHOP_CAT_PRINT_PRESETS}
            companies={companies} estimatedPages={estimateListPages(result.groupCounts, s)} pageGroups={result.groupCounts}
            defaultTitle={SHOP_CAT_PRINT_TITLE} canSaveTeam={can("admin.users")} signatureHint="ผู้ทำ / ผู้ตรวจ" />
        </aside>
      </div>
    </div>
  );
}

export default function ShopCategoriesPrintPage() {
  return <Suspense fallback={<LoadingState />}><Inner /></Suspense>;
}
