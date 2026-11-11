"use client";
/**
 * ParentPriceTab — แท็บ "💰 ราคา" ของ Parent SKU (เจ้าของขอ 2026-11-11)
 *
 *   ราคาขาย: ราคากลาง (แก้ได้ทีละ SKU / ทั้งรุ่นทีเดียว) · ราคาเต็ม · ราคาเว็บแต่ละร้าน · ราคาบนร้านแพลตฟอร์มแต่ละรายการ
 *     ราคาบนร้าน ≠ ราคากลาง → สีเหลือง + สรุปจำนวน (ปิดเตือนได้ จำต่อคน)
 *     "ปรับตรงนี้ ตรงนั้นเปลี่ยน": แก้ราคากลางแล้ว → LINE กด "ส่งราคากลางขึ้น LINE" (ถามก่อน — แตะร้านจริง) · ร้านอื่นกดเปิดสินค้าบนร้านแก้
 *   ต้นทุน (เฉพาะคนมีสิทธิ์ products.cost.view): ราคาซื้อ · วัตถุดิบ · ค่าแรง · ค่าอื่น ๆ · ต้นทุนรวม · กำไร · % — เปิด/ปิดคอลัมน์ได้ (จำต่อคน)
 *     สูตรคิด = ของกลาง deriveCost (lib/cost-calc) + ต้นทุนที่บันทึกไว้ในเครื่องคิดต้นทุน (เฉพาะสี → ทั้งรุ่น → ค่าตั้งต้น)
 * ข้อมูล: GET /api/parent-skus/[id]/prices · แก้ราคากลาง: /api/product-platforms/sku-price · ทั้งรุ่น: /api/product-platforms/mass-price
 *   · ส่งขึ้น LINE: /api/line-shopping/push-prices (ของเดิมทั้งหมด — มีสิทธิ์ + audit ในตัว)
 * ของกลางที่ใช้: MiniTable · MoneyInput · ConfirmDialog · HoverImage · PlatformIcon · state-views · ListingDrawer · SkuPriceModal · useUserPref · deriveCost
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { r2ImageUrl } from "@/lib/r2-image";
import { useUserPref } from "@/lib/use-user-pref";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { MoneyInput } from "@/components/money-input";
import { ConfirmDialog } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { PlatformIcon } from "@/components/platform-icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { DEFAULT_SCENARIO, deriveCost, normScenario } from "@/lib/cost-calc";
import { COST_COLUMNS, parsePriceTabPrefs, pickSavedCosting, priceMismatch, type CostColumnKey, type SavedCostingLite } from "@/lib/parent-prices";
import type { MoCostMaterial } from "@/app/api/mo/[id]/cost/route";

const ListingDrawer = dynamic(() => import("@/components/platform-catalog/listing-drawer").then((m) => m.ListingDrawer), { ssr: false });
const SkuPriceModal = dynamic(() => import("@/components/sku-price-modal").then((m) => m.SkuPriceModal), { ssr: false });

type Sku = { id: string; code: string; name: string | null; color: string | null; image_key: string | null; is_active: boolean;
  list_price: number | null; fake_price: number | null; standard_price?: number | null; rmb_cost?: number | null };
type ShopCol = { listing_id: string; platform_code: string; platform_name: string; icon_key: string | null; title: string | null; external_id: string | null;
  supported: boolean; fetched: boolean; listing_price: number | null; prices: Record<string, { price: number | null; sale_price: number | null; pay: number | null; label: string }> };
type WebCol = { listing_id: string; shop_id: string | null; shop_name: string; web_price: number | null };
type CostIn = { bom_code: string | null; material_cost_pp: number; missing_price: number; materials: MoCostMaterial[]; central_rate: number; system_piece: { job_name: string; rate: number; qty_per: number }[] };
type Data = { parent_code: string; cost_access: boolean; skus: Sku[]; web: WebCol[]; shops: ShopCol[]; costs: Record<string, CostIn> | null; saved: SavedCostingLite[] };

const baht = (n: number | null | undefined, d = 0) => (n == null ? "—" : `฿${Number(n).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: 2 })}`);
const PREF_FALLBACK = { hiddenCost: [] as CostColumnKey[], warn: true };

export function ParentPriceTab({ parentId }: { parentId: string | null }) {
  const { can } = useAuth();
  const toast = useToast();
  const canEdit = can("products.edit");
  const canPushShop = can("products.platforms.edit");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [prefs, setPrefs] = useUserPref("parent_price_tab", PREF_FALLBACK, parsePriceTabPrefs);
  const [bulk, setBulk] = useState("");
  const [bulkOnlyEmpty, setBulkOnlyEmpty] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "bulk" } | { kind: "line"; listing: ShopCol }>(null);
  const [busy, setBusy] = useState(false);
  const [openListing, setOpenListing] = useState<string | null>(null);
  const [priceSku, setPriceSku] = useState<Sku | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});   // ช่องที่กำลังพิมพ์ (key = skuId:field)

  const load = useCallback(async () => {
    if (!parentId) return;
    setErr("");
    try {
      const r = await apiFetch(`/api/parent-skus/${encodeURIComponent(parentId)}/prices`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `โหลดไม่สำเร็จ (${r.status})`);
      setData(j as Data);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดราคาไม่สำเร็จ"); }
  }, [parentId]);
  useEffect(() => { void load(); }, [load]);

  // บันทึกราคากลาง/ราคาเต็มทีละ SKU (ออกจากช่อง = บันทึก · ค่าไม่เปลี่ยน = ไม่ยิง)
  const saveCell = async (sku: Sku, field: "list_price" | "fake_price") => {
    const k = `${sku.id}:${field}`; const raw = draft[k];
    if (raw === undefined) return;
    const next = raw.trim() === "" ? null : Number(raw);
    setDraft((d) => { const n = { ...d }; delete n[k]; return n; });
    if ((next ?? null) === (sku[field] ?? null)) return;
    if (next != null && (!Number.isFinite(next) || next < 0)) { toast.error("ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป"); return; }
    try {
      const r = await apiFetch("/api/product-platforms/sku-price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku_id: sku.id, price: next, field }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || `บันทึกไม่สำเร็จ (${r.status})`);
      setData((d) => d ? { ...d, skus: d.skus.map((s) => (s.id === sku.id ? { ...s, [field]: next } : s)) } : d);
      toast.success(`บันทึก${field === "list_price" ? "ราคากลาง" : "ราคาเต็ม"} ${sku.code} แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };

  const runConfirm = async () => {
    if (!confirm || !parentId) return;
    setBusy(true);
    try {
      if (confirm.kind === "bulk") {
        const price = Number(bulk);
        const r = await apiFetch("/api/product-platforms/mass-price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent_sku_id: parentId, price, only_empty: bulkOnlyEmpty }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || `ปรับไม่สำเร็จ (${r.status})`);
        toast.success(`ปรับราคากลางเป็น ${baht(price)} แล้ว${typeof j.updated === "number" ? ` (${j.updated} SKU)` : ""}`);
        setBulk("");
      } else {
        const r = await apiFetch("/api/line-shopping/push-prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent_sku_id: parentId }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || `ส่งไม่สำเร็จ (${r.status})`);
        const res = (j.results ?? []) as { ok: boolean; variants: number; error?: string }[];
        if (res.some((x) => x.ok)) toast.success(`ส่งราคากลางขึ้น LINE แล้ว (${res.filter((x) => x.ok).reduce((a, x) => a + (x.variants ?? 0), 0)} ตัวเลือก) — ราคาในตารางจะอัปเดตหลังดึงข้อมูลร้านรอบถัดไป`);
        else toast.error(res.find((x) => !x.ok)?.error || j.note || "ยังไม่มีสินค้าที่จับคู่ให้ส่ง");
      }
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ทำไม่สำเร็จ"); } finally { setBusy(false); }
  };

  const warn = prefs.warn;
  const hidden = new Set(prefs.hiddenCost);
  const skus = data?.skus ?? [];
  const mismatchCount = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    for (const s of data.skus) {
      for (const sh of data.shops) if (priceMismatch(sh.prices[s.code]?.pay, s.list_price)) n++;
      for (const w of data.web) if (w.web_price != null && priceMismatch(w.web_price, s.list_price)) n++;
    }
    return n;
  }, [data]);

  // ต้นทุนต่อ SKU (deriveCost ของกลาง · ใช้ราคากลางล่าสุดในตาราง)
  const costRows = useMemo(() => {
    if (!data?.costs) return [];
    return data.skus.map((s) => {
      const ci = data.costs![s.code];
      const hasBom = !!ci?.bom_code;
      const buy = s.standard_price ?? null;
      if (!hasBom && !(buy && buy > 0)) return { sku: s, d: null, from: null as "sku" | "parent" | null, missing: 0, buy, hasBom };
      const pick = pickSavedCosting(s.code, data.parent_code, data.saved);
      const d = deriveCost({
        qty: pick.qty, sell_price: s.list_price ?? 0,
        // ไม่มีสูตรผลิต (ซื้อมาขาย) = ต้นทุน = ราคาซื้อ
        material_cost_pp: hasBom ? ci!.material_cost_pp : (buy ?? 0), materials: hasBom ? ci!.materials : undefined,
        central_rate: hasBom ? ci!.central_rate : 0, est_labor_pp: 0, system_piece: hasBom ? ci!.system_piece : [],
      }, pick.scenario ? normScenario(pick.scenario) : DEFAULT_SCENARIO);
      return { sku: s, d, from: pick.from, missing: ci?.missing_price ?? 0, buy, hasBom };
    });
  }, [data]);

  if (!parentId) return <div className="text-sm text-slate-400 py-8 text-center">บันทึกสินค้าก่อน แล้วค่อยตั้งราคา</div>;
  if (err) return <ErrorState title="โหลดราคาไม่สำเร็จ" hint={err} onRetry={() => void load()} />;
  if (!data) return <LoadingState label="กำลังโหลดราคา…" />;
  if (skus.length === 0) return <EmptyState title="รุ่นนี้ยังไม่มี SKU ลูก" hint="สร้าง SKU (สี/ไซซ์) ก่อน แล้วค่อยตั้งราคา" />;

  const skuCell = (s: Sku) => (
    <span className="flex items-center gap-2 min-w-0">
      <HoverImage url={r2ImageUrl(s.image_key, 96)} size={26} alt={s.code} />
      <span className="min-w-0"><span className="block truncate text-slate-800">{s.color || s.name || s.code}</span><span className="block text-[11px] text-slate-400 truncate">{s.code}</span></span>
    </span>
  );
  const editCell = (s: Sku, field: "list_price" | "fake_price") => {
    const k = `${s.id}:${field}`;
    if (!canEdit) return <span className="tabular-nums">{baht(s[field])}</span>;
    return (
      <MoneyInput value={draft[k] ?? (s[field] ?? "")} onChange={(raw) => setDraft((d) => ({ ...d, [k]: raw }))}
        onBlur={() => void saveCell(s, field)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="—" className={`h-8 w-24 text-right text-sm rounded-md border px-2 ${field === "list_price" ? "border-violet-200 bg-violet-50/40" : "border-slate-200"}`} />
    );
  };
  const vsCentral = (pay: number | null | undefined, central: number | null, extra?: string) => {
    if (pay == null) return <span className="text-slate-300">—</span>;
    const bad = warn && priceMismatch(pay, central);
    return (
      <span className={`tabular-nums px-1.5 py-0.5 rounded ${bad ? "bg-amber-50 text-amber-700" : "text-slate-700"}`} title={bad ? `ไม่เท่าราคากลาง (${baht(central)})` : undefined}>
        {bad && "⚠ "}{baht(pay)}{extra && <span className="ml-1 text-[10.5px] text-slate-400 line-through">{extra}</span>}
      </span>
    );
  };

  const saleCols: MiniColumn<Sku>[] = [
    { key: "sku", header: "สี / SKU", width: "minmax(9rem,1.4fr)", sortValue: (s) => s.code, cell: skuCell },
    { key: "central", header: <span title="ราคาขายที่ทุกช่องทางควรใช้">ราคากลาง</span>, width: "7rem", align: "right", sortValue: (s) => s.list_price ?? 0, cell: (s) => editCell(s, "list_price") },
    { key: "fake", header: <span title="ราคาขีดฆ่า (ราคาเต็ม)">ราคาเต็ม</span>, width: "7rem", align: "right", cell: (s) => editCell(s, "fake_price") },
    ...data.web.map((w): MiniColumn<Sku> => ({
      key: `web:${w.listing_id}`, header: <span title={`เว็บร้าน ${w.shop_name}${w.web_price == null ? " — ว่าง = ใช้ราคากลาง" : ""}`}>🛍 {w.shop_name}</span>, width: "6.5rem", align: "right",
      cell: (s) => (w.web_price == null ? <span className="tabular-nums text-slate-400" title="ตามราคากลาง">{baht(s.list_price)}</span> : vsCentral(w.web_price, s.list_price)),
    })),
    ...data.shops.map((sh): MiniColumn<Sku> => ({
      key: `shop:${sh.listing_id}`, width: "7rem", align: "right",
      header: (
        <span className="inline-flex items-center gap-1" title={[sh.platform_name, sh.title, sh.external_id ? `#${sh.external_id}` : ""].filter(Boolean).join(" · ")}>
          <PlatformIcon code={sh.platform_code} iconKey={sh.icon_key} size={13} /> {sh.platform_name}
        </span>
      ),
      cell: (s) => {
        if (!sh.supported || !sh.fetched) return <span className="text-[11px] text-slate-400" title="ร้านนี้ไม่มีข้อมูลราคาต่อตัวเลือก">{sh.listing_price != null ? baht(sh.listing_price) : "—"}</span>;
        const p = sh.prices[s.code];
        return vsCentral(p?.pay, s.list_price, p && p.sale_price != null && p.price != null ? baht(p.price) : undefined);
      },
    })),
  ];

  // จัดกลุ่มตามสีเฉพาะเมื่อมีสีที่มีหลาย SKU (สีละตัวเดียว = หัวกลุ่มรก)
  const colorCount = new Map<string, number>(); for (const s of skus) { const c = s.color || ""; colorCount.set(c, (colorCount.get(c) ?? 0) + 1); }
  const groupByColor = [...colorCount.values()].some((n) => n > 1);
  const costCols = COST_COLUMNS.filter((c) => !hidden.has(c.key));
  type CostRow = typeof costRows[number];
  const costTableCols: MiniColumn<CostRow>[] = [
    { key: "sku", header: "สี / SKU", width: "minmax(9rem,1.4fr)", cell: (r) => skuCell(r.sku) },
    ...costCols.map((c): MiniColumn<CostRow> => ({
      key: c.key, header: c.label, width: c.key === "buy" ? "7rem" : "6rem", align: "right",
      cell: (r) => {
        if (c.key === "buy") return (
          <button type="button" onClick={() => setPriceSku(r.sku)} className="tabular-nums text-slate-700 hover:text-violet-700 hover:underline" title="ดู/แก้ราคาซื้อ + ร้านที่ขาย">
            {r.buy != null && r.buy > 0 ? baht(r.buy, 2) : "ตั้งราคา"}{r.sku.rmb_cost ? <span className="block text-[10.5px] text-slate-400">¥{r.sku.rmb_cost}</span> : null}
          </button>
        );
        if (!r.d) return <span className="text-slate-300">—</span>;
        const v = c.key === "material" ? r.d.matPP : c.key === "labor" ? r.d.laborPP : c.key === "extras" ? r.d.extrasPP : c.key === "cost" ? r.d.costPP : c.key === "profit" ? r.d.profitPP : r.d.marginPct;
        if (c.key === "margin") return <span className={`tabular-nums ${v < 0 ? "text-rose-600" : "text-emerald-700"}`}>{Number.isFinite(v) ? `${v.toFixed(1)}%` : "—"}</span>;
        return (
          <span className={`tabular-nums ${c.key === "profit" ? (v < 0 ? "text-rose-600 font-medium" : "text-emerald-700 font-medium") : c.key === "cost" ? "font-medium text-slate-800" : "text-slate-700"}`}>
            {baht(v, 2)}{c.key === "material" && r.missing > 0 && <span className="block text-[10.5px] text-amber-600" title="วัตถุดิบในสูตรที่ยังไม่มีราคา — ต้นทุนจะต่ำกว่าจริง">ขาดราคา {r.missing}</span>}
          </span>
        );
      },
    })),
    { key: "from", header: "ที่มา", width: "6.5rem",
      cell: (r) => <span className="text-[11px] text-slate-400">{r.from === "sku" ? "ต้นทุนเฉพาะสี" : r.from === "parent" ? "ต้นทุนทั้งรุ่น" : r.hasBom ? "คิดจากสูตร" : r.buy ? "ราคาซื้อ" : "—"}</span> },
  ];

  return (
    <div className="space-y-3">
      {/* แถบเครื่องมือ */}
      <div className="flex items-center gap-2 flex-wrap rounded-xl border border-slate-200 bg-white px-3 py-2">
        {canEdit && (
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-600">ปรับราคากลางทั้งรุ่น ฿</span>
            <MoneyInput value={bulk} onChange={setBulk} placeholder={skus[0]?.list_price != null ? String(skus[0].list_price) : "0"} className="h-8 w-24 text-right text-sm rounded-md border border-slate-200 px-2" />
            <label className="inline-flex items-center gap-1 text-[11.5px] text-slate-500"><input type="checkbox" checked={bulkOnlyEmpty} onChange={(e) => setBulkOnlyEmpty(e.target.checked)} /> เฉพาะที่ยังไม่มีราคา</label>
            <button type="button" disabled={!(Number(bulk) > 0)} onClick={() => setConfirm({ kind: "bulk" })}
              className="h-8 px-3 text-xs rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40">ใช้กับ {bulkOnlyEmpty ? "SKU ที่ว่าง" : `ทุก SKU (${skus.length})`}</button>
          </span>
        )}
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer" title="จำค่าไว้เฉพาะตัวคุณ">
          <input type="checkbox" checked={warn} onChange={(e) => setPrefs({ ...prefs, warn: e.target.checked })} /> เตือนเมื่อราคาไม่เท่าราคากลาง
        </label>
        <button type="button" onClick={() => void load()} className="h-8 px-2 text-xs text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50">🔄</button>
      </div>

      {warn && mismatchCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠ ราคาบนร้าน/เว็บไม่เท่าราคากลาง {mismatchCount} จุด (ช่องสีเหลือง) — ราคาบนร้านไม่เปลี่ยนตามเอง: LINE กด “ส่งราคากลาง” ใต้ตาราง · ร้านอื่นกด “แก้บนร้าน”
        </div>
      )}

      {/* ราคาขาย */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <MiniTable rows={skus} columns={saleCols} rowKey={(s) => s.id} hideSearch dense countUnit="SKU"
          title={<span className="text-sm font-medium text-slate-800">🏷 ราคาขาย</span>}
          groupBy={(s) => s.color || "ไม่ระบุสี"} groupLabel="สี" defaultGrouped={groupByColor} />
        {(data.shops.length > 0 || data.web.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {data.shops.map((sh) => (
              <span key={sh.listing_id} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 pl-2 pr-1 py-0.5">
                <PlatformIcon code={sh.platform_code} iconKey={sh.icon_key} size={13} /> {sh.platform_name}
                {sh.platform_code === "line_shopping" && canPushShop && (
                  <button type="button" onClick={() => setConfirm({ kind: "line", listing: sh })} className="ml-1 h-6 px-2 rounded-md text-violet-700 hover:bg-violet-50">ส่งราคากลาง ↑</button>
                )}
                <button type="button" onClick={() => setOpenListing(sh.listing_id)} className="h-6 px-2 rounded-md text-slate-600 hover:bg-slate-50">แก้บนร้าน ›</button>
              </span>
            ))}
            {data.web.length > 0 && <span className="text-[11px] text-slate-400 self-center">ราคาเว็บ: แก้ในแท็บ “เว็บไซต์” (ว่าง = ตามราคากลาง)</span>}
          </div>
        )}
        {data.shops.length === 0 && <p className="mt-2 text-[11px] text-slate-400">ยังไม่มีสินค้าบนร้านที่จับคู่กับรุ่นนี้ — จับคู่/ลงร้านได้ที่แท็บ “แพลตฟอร์ม”</p>}
      </div>

      {/* ต้นทุน / กำไร */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        {!data.cost_access ? (
          <div className="text-xs text-slate-500">🔒 คุณไม่มีสิทธิ์ดูต้นทุน — ให้หัวหน้า/แอดมินเปิดสิทธิ์ “ดูต้นทุน” ในหน้าสิทธิ์</div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-sm font-medium text-slate-800">📦 ต้นทุน / กำไร</span>
              <span className="text-[11px] text-slate-400">ต่อชิ้น · สูตรเดียวกับเครื่องคิดต้นทุน</span>
              <span className="ml-auto flex flex-wrap gap-1">
                {COST_COLUMNS.map((c) => {
                  const on = !hidden.has(c.key);
                  return (
                    <button key={c.key} type="button" title={on ? "ซ่อนคอลัมน์" : "แสดงคอลัมน์"}
                      onClick={() => setPrefs({ ...prefs, hiddenCost: on ? [...prefs.hiddenCost, c.key] : prefs.hiddenCost.filter((k) => k !== c.key) })}
                      className={`h-6 px-2 rounded-full text-[11px] border ${on ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-400 line-through"}`}>{c.label}</button>
                  );
                })}
              </span>
            </div>
            <MiniTable rows={costRows} columns={costTableCols} rowKey={(r) => r.sku.id} hideSearch dense countUnit="SKU"
              groupBy={(r) => r.sku.color || "ไม่ระบุสี"} groupLabel="สี" defaultGrouped={groupByColor} emptyText="ยังไม่มีข้อมูลต้นทุน" />
            <p className="mt-2 text-[11px] text-slate-400">
              ต้นทุน = วัตถุดิบตามสูตรผลิต + ค่าแรง + ค่าอื่น ๆ ที่ตั้งไว้ · ตั้งค่าแรง/ค่าอื่น ๆ แล้วบันทึกเป็นต้นทุนมาตรฐานได้ที่{" "}
              <a href="/master/cost-calculator" target="_blank" rel="noopener noreferrer" className="text-violet-700 hover:underline">เครื่องคิดต้นทุน ↗</a>
            </p>
          </>
        )}
      </div>

      {confirm && (
        <ConfirmDialog open onClose={() => (busy ? undefined : setConfirm(null))} onConfirm={() => void runConfirm()} loading={busy}
          title={confirm.kind === "bulk" ? "ปรับราคากลางทั้งรุ่น" : "ส่งราคากลางขึ้น LINE"}
          message={confirm.kind === "bulk"
            ? `ตั้งราคากลางเป็น ${baht(Number(bulk))} ให้${bulkOnlyEmpty ? " SKU ที่ยังไม่มีราคา" : `ทุก SKU ในรุ่นนี้ (${skus.length} ตัว)`} — ราคาบนร้านจะยังไม่เปลี่ยนจนกว่าจะส่งขึ้นร้าน`
            : `ส่งราคากลาง (และราคาเต็ม) ของรุ่นนี้ขึ้นร้าน LINE จริง — ลูกค้าจะเห็นราคาใหม่ทันที`}
          confirmText={confirm.kind === "bulk" ? "ปรับราคา" : "ส่งขึ้น LINE"} variant={confirm.kind === "line" ? "danger" : "default"} />
      )}
      {openListing && <ListingDrawer listingId={openListing} canPublish={can("products.platforms.publish")} onClose={() => { setOpenListing(null); void load(); }} />}
      {priceSku && <SkuPriceModal open skuCode={priceSku.code} skuName={priceSku.name} onClose={() => setPriceSku(null)} onSaved={() => void load()} />}
    </div>
  );
}
