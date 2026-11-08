"use client";
/**
 * ตัวเลือกบนร้าน ↔ SKU ในระบบ — กล่องในป๊อปรายละเอียดสินค้าบนร้าน (หน้าจับคู่ /master/platform-catalog)
 *
 * บอกเจ้าของว่าแต่ละตัวเลือก (สี/ไซซ์) บนร้าน ตรงกับ SKU ไหนในระบบ ตามกฎเดียวกับตอนส่งราคา/สต๊อก:
 *   ✓ รหัสตรง · ≈ ใช้รหัสสี (LINE แยกไซซ์ ระบบมีแค่สี) · ✗ ไม่เจอ (ส่งราคา/สต๊อกให้ไม่ได้) · ⚠ อยู่คนละรุ่น
 * อ่านอย่างเดียว (เฟสนี้ยังไม่ให้แก้คู่) · ข้อมูล: GET /api/platform-catalog?view=variants · กฎ: lib/platform-variant-match
 * ของกลางที่ใช้: MiniTable · HoverImage · state-views
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { HoverImage } from "@/components/hover-image";
import { ErrorState, LoadingState } from "@/components/state-views";
import type { ListingVariantsResponse, VariantMatchKind, VariantMatchRow } from "@/lib/platform-variant-match";

const KIND: Record<VariantMatchKind, { label: string; cls: string; why: string }> = {
  exact: { label: "รหัสตรง", cls: "text-emerald-700 bg-emerald-50 border-emerald-200", why: "รหัสบนร้านตรงกับ SKU ในระบบเป๊ะ" },
  base: { label: "ใช้รหัสสี", cls: "text-sky-700 bg-sky-50 border-sky-200", why: "ไม่มี SKU รหัสนี้ตรง ๆ — ใช้ราคา/สต๊อกของ SKU สี (ตัดตัวอักษรท้ายรหัส เช่น ไซซ์ S/M/L)" },
  none: { label: "ไม่เจอ", cls: "text-rose-700 bg-rose-50 border-rose-200", why: "ไม่มี SKU รหัสนี้ในระบบ — ส่งราคา/สต๊อกให้ตัวเลือกนี้ไม่ได้" },
  nosku: { label: "ไม่มีรหัส", cls: "text-slate-600 bg-slate-100 border-slate-200", why: "ตัวเลือกบนร้านไม่ได้ใส่รหัส SKU — ระบบจับคู่ไม่ได้" },
};
const money = (n: number | null) => (n == null ? "—" : `${n.toLocaleString()}฿`);

export function ListingVariantMap({ listingId, reloadKey = 0 }: { listingId: string; reloadKey?: number }) {
  const [data, setData] = useState<ListingVariantsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setData(null); setErr(null);
    apiFetch(`/api/platform-catalog?view=variants&listing_id=${encodeURIComponent(listingId)}`).then((r) => r.json())
      .then((j: ListingVariantsResponse) => { if (!alive) return; if (j.error) setErr(j.error); else setData(j); })
      .catch(() => { if (alive) setErr("โหลดตัวเลือกบนร้านไม่สำเร็จ"); });
    return () => { alive = false; };
  }, [listingId, reloadKey, retry]);

  if (err) return <ErrorState title={err} onRetry={() => setRetry((n) => n + 1)} />;
  if (!data) return <LoadingState label="กำลังเทียบตัวเลือกกับ SKU…" />;
  if (!data.supported) return null;   // ร้านที่ไม่มีข้อมูลตัวเลือก (ไฟล์ export ของ Shopee) — ไม่ต้องโชว์กล่อง
  if (!data.fetched || data.rows.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        ยังไม่มีข้อมูลตัวเลือกจากร้าน
        {data.platform_code === "line_shopping" ? " — สินค้าที่ระบบสร้างขึ้นร้านเอง ต้องกด “ดึงสินค้าจาก LINE” หนึ่งครั้งก่อน ถึงจะเห็นตัวเลือก" : " — ดึงสินค้าจากร้านอีกครั้ง"}
      </p>
    );
  }

  const c = data.counts;
  const cols: MiniColumn<VariantMatchRow>[] = [
    {
      key: "opt", header: "ตัวเลือกบนร้าน", width: "2fr", sortValue: (r) => r.label,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2">
          {data.platform_code === "line_shopping" && <HoverImage url={r.image} size={32} previewSize={240} rounded="rounded" fallback="—" />}
          <div className="min-w-0">
            <div className="truncate" title={r.label}>{r.label}</div>
            <div className="truncate font-mono text-[11px] text-slate-400">{r.sku ?? "ไม่มีรหัส"}</div>
          </div>
        </div>
      ),
    },
    { key: "stock", header: "สต๊อกบนร้าน", width: "5.5rem", align: "right", sortValue: (r) => r.stock ?? -1, cell: (r) => <span className={r.stock === 0 ? "text-rose-600" : ""}>{r.stock ?? "—"}</span> },
    {
      key: "price", header: "ราคาบนร้าน", width: "6.5rem", align: "right", sortValue: (r) => r.sale_price ?? r.price ?? -1,
      cell: (r) => r.sale_price != null
        ? <span className="leading-tight"><span className="block">{money(r.sale_price)}</span><span className="block text-[11px] text-slate-400 line-through">{money(r.price)}</span></span>
        : <span>{money(r.price)}</span>,
    },
    {
      key: "erp", header: "SKU ในระบบ", width: "1.6fr", sortValue: (r) => ({ none: 0, nosku: 1, base: 2, exact: 3 })[r.kind] - (r.other_parent ? 0.5 : 0),
      cell: (r) => {
        const k = KIND[r.kind];
        return (
          <div className="min-w-0 space-y-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] ${k.cls}`} title={k.why}>{k.label}</span>
              {r.erp_code && <span className="truncate font-mono text-xs text-slate-700" title={r.erp_name ?? ""}>{r.erp_code}</span>}
            </div>
            {r.other_parent && (
              <div className="truncate text-[11px] text-amber-700" title="SKU นี้อยู่คนละรุ่นกับที่จับคู่ไว้ — ราคา/สต๊อกจะมาจากรุ่นนั้น ควรตรวจว่าจับคู่รุ่นถูกไหม">
                อยู่รุ่น <span className="font-mono">{r.erp_parent_code ?? "อื่น"}</span> ไม่ใช่ {data.matched_parent_code ?? "รุ่นที่จับคู่"}
              </div>
            )}
          </div>
        );
      },
    },
  ];
  const chip = (n: number, label: string, cls: string) => n > 0 && <span className={`rounded border px-1.5 py-0.5 ${cls}`}>{label} {n.toLocaleString()}</span>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-slate-500">{c.total.toLocaleString()} ตัวเลือก:</span>
        {chip(c.exact, "รหัสตรง", KIND.exact.cls)}
        {chip(c.base, "ใช้รหัสสี", KIND.base.cls)}
        {chip(c.none, "ไม่เจอ", KIND.none.cls)}
        {chip(c.nosku, "ไม่มีรหัส", KIND.nosku.cls)}
        {chip(c.other_parent, "อยู่คนละรุ่น", "text-amber-700 bg-amber-50 border-amber-200")}
      </div>
      <MiniTable rows={data.rows} columns={cols} rowKey={(r) => r.key} dense hideToolbar={data.rows.length <= 10}
        searchText={(r) => `${r.label} ${r.sku ?? ""} ${r.erp_code ?? ""}`} searchPlaceholder="ค้นหาตัวเลือก / รหัส" emptyText="ไม่มีตัวเลือก"
        resizable storageKey="platform-listing-variants" />
      <p className="text-[11px] text-slate-400">
        ระบบจับตัวเลือกกับ SKU เองด้วยรหัส ทุกครั้งที่ส่งราคา/สต๊อก (ไม่ต้องกดจับคู่ทีละตัว)
        {c.none + c.nosku > 0 ? " · ตัวที่ “ไม่เจอ/ไม่มีรหัส” จะส่งราคา/สต๊อกให้ไม่ได้ — แก้รหัสบนร้านให้ตรง หรือเพิ่ม SKU ในระบบ" : ""}
      </p>
    </div>
  );
}
