"use client";
/**
 * เลือกสินค้าในระบบที่ยังไม่ได้ลงร้านนี้ → ส่งต่อให้ตัวช่วยลงสินค้า (ปุ่ม "เพิ่มสินค้าขึ้นร้าน" หน้าสินค้าบนแพลตฟอร์ม)
 * ข้อมูล: GET /api/platform-catalog?view=notlisted → แยก 3 แท็บ (NotListedResponse)
 *   พร้อมลง (เลือกได้) · อาจมีบนร้านแล้ว (ตัวเดาของหน้าจับคู่ชี้มา — ปุ่มไปจับคู่ ไม่ให้ลงซ้ำแบบ JEAN08) · ไม่มี SKU เปิดขาย (ลงไม่ได้)
 * ลงจริง/ตรวจความพร้อม/แก้ที่ขาด = AddToPlatformWizard (ของกลางเดิม) — ตัวนี้แค่เลือก
 * ของกลางที่ใช้: ERPModal · MiniTable · ScrollTabs · HoverImage · state-views
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { ERPModal } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ScrollTabs } from "@/components/scroll-tabs";
import { HoverImage } from "@/components/hover-image";
import { ErrorState, LoadingState } from "@/components/state-views";
import type { NotListedMaybe, NotListedResponse, ShopParent } from "@/lib/platform-listing-health";
import type { AddWizardParent } from "@/components/platform-listing/add-to-platform-wizard";

const MAX_PICK = 200;
type Tab = "ready" | "maybe" | "nosku";

export function NotListedPicker({ open, onClose, platformId, brandId, where, onPick, onGoMatch }: {
  open: boolean;
  onClose: () => void;
  platformId: string;
  brandId: string;
  /** ชื่อร้าน · แบรนด์ (ไว้ในหัวป๊อป) */
  where: string;
  onPick: (parents: AddWizardParent[]) => void;
  /** แท็บ "อาจมีบนร้านแล้ว" → ไปจับคู่รายการบนร้านตัวนั้น */
  onGoMatch?: (listingId: string) => void;
}) {
  const [data, setData] = useState<NotListedResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>("ready");

  useEffect(() => {
    if (!open || !platformId || !brandId) return;
    let alive = true;
    setData(null); setErr(null); setSelected(new Set()); setTab("ready");
    apiFetch(`/api/platform-catalog?${new URLSearchParams({ view: "notlisted", platform_id: platformId, brand_id: brandId })}`).then((r) => r.json())
      .then((j: NotListedResponse) => { if (!alive) return; if (j.error) setErr(j.error); else setData({ parents: j.parents ?? [], maybe: j.maybe ?? [], no_sku: j.no_sku ?? [], error: null }); })
      .catch(() => { if (alive) setErr("โหลดรายการสินค้าไม่สำเร็จ"); });
    return () => { alive = false; };
  }, [open, platformId, brandId, retry]);

  const productCell = (p: ShopParent) => (
    <div className="flex min-w-0 items-center gap-2.5">
      <HoverImage url={r2ImageUrl(p.cover_key, 160)} size={40} previewSize={280} rounded="rounded-md" fallback="—" />
      <div className="min-w-0">
        <div className="truncate" title={p.name ?? ""}>{p.name || p.code}</div>
        <div className="truncate font-mono text-[11px] text-slate-400">{p.code}</div>
      </div>
    </div>
  );
  const readyCols: MiniColumn<ShopParent>[] = [
    { key: "p", header: "สินค้าในระบบ", width: "2.5fr", sortValue: (p) => p.code, cell: productCell },
    { key: "img", header: "รูปปก", width: "6rem", align: "center", sortValue: (p) => (p.cover_key ? 1 : 0), cell: (p) => (p.cover_key ? <span className="text-xs text-slate-500">มี</span> : <span className="text-xs text-amber-700">ไม่มี</span>) },
  ];
  const maybeCols: MiniColumn<NotListedMaybe>[] = [
    { key: "p", header: "สินค้าในระบบ", width: "2fr", sortValue: (p) => p.code, cell: productCell },
    {
      key: "l", header: "น่าจะเป็นรายการนี้บนร้าน", width: "2fr", sortValue: (p) => p.score,
      cell: (p) => (
        <div className="min-w-0">
          <div className="truncate text-sm" title={p.listing_title ?? ""}>{p.listing_title || "—"}</div>
          <div className="truncate font-mono text-[11px] text-slate-400">#{p.external_product_id ?? "—"} · ตรง {p.score}%</div>
        </div>
      ),
    },
    {
      key: "act", header: "", width: "6rem", align: "right",
      cell: (p) => onGoMatch ? <button type="button" onClick={() => onGoMatch(p.listing_id)} className="h-7 rounded-md border border-violet-200 px-2 text-xs text-violet-700 hover:bg-violet-50">ไปจับคู่</button> : null,
    },
  ];
  const noSkuCols: MiniColumn<ShopParent>[] = [
    { key: "p", header: "สินค้าในระบบ", width: "2.5fr", sortValue: (p) => p.code, cell: productCell },
    { key: "why", header: "", width: "9rem", align: "right", cell: () => <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">ไม่มี SKU ที่เปิดขาย</span> },
  ];

  const ready = data?.parents ?? [];
  const picked = ready.filter((p) => selected.has(p.id));
  const tooMany = picked.length > MAX_PICK;
  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: "ready", label: "พร้อมลง", n: ready.length },
    { key: "maybe", label: "อาจมีบนร้านแล้ว", n: data?.maybe.length ?? 0 },
    { key: "nosku", label: "ไม่มี SKU — ลงไม่ได้", n: data?.no_sku.length ?? 0 },
  ];

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title={`เพิ่มสินค้าขึ้นร้าน — ${where}`} storageKey="platform-not-listed-picker"
      description="เลือกสินค้าในระบบที่ยังไม่ได้ลงร้านนี้ แล้วกดถัดไป — ตัวช่วยจะตรวจความพร้อม (หมวด/รูป/ราคา) ให้แก้ที่ขาดก่อนลงจริง"
      footer={tab === "ready" ? (
        <div className="flex w-full items-center gap-2">
          <span className="flex-1 text-xs text-slate-500">{tooMany ? <span className="text-rose-600">ลงได้ครั้งละไม่เกิน {MAX_PICK} รุ่น</span> : `เลือก ${picked.length.toLocaleString()} รุ่น`}</span>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button type="button" disabled={picked.length === 0 || tooMany} onClick={() => onPick(picked.map((p) => ({ id: p.id, code: p.code, name: p.name })))}
            className="h-9 rounded-lg bg-violet-600 px-3 text-sm text-white hover:bg-violet-700 disabled:opacity-40">ถัดไป — ตรวจความพร้อม ({picked.length.toLocaleString()})</button>
        </div>
      ) : undefined}>
      {err ? <ErrorState title={err} onRetry={() => setRetry((n) => n + 1)} />
        : !data ? <LoadingState label="กำลังหาสินค้าที่ยังไม่ได้ลง…" />
        : (
          <div className="space-y-2">
            <ScrollTabs activeKey={tab} className="border-b border-slate-200">
              {tabs.map((t) => (
                <button key={t.key} type="button" data-tab-key={t.key} onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
                  className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-violet-500 font-medium text-violet-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                  {t.label} <span className="text-xs tabular-nums text-slate-400">{t.n.toLocaleString()}</span>
                </button>
              ))}
            </ScrollTabs>
            {tab === "ready" ? (
              <MiniTable rows={ready} columns={readyCols} rowKey={(p) => p.id} selectable selected={selected} onSelectedChange={setSelected}
                searchText={(p) => `${p.code} ${p.name ?? ""}`} searchPlaceholder="ค้นรหัส / ชื่อสินค้า" dense
                emptyText="สินค้าของแบรนด์นี้ลงร้านนี้ครบแล้ว" />
            ) : tab === "maybe" ? (
              <>
                <p className="text-xs text-slate-500">บนร้านมีรายการที่ยังไม่จับคู่ และระบบเดาว่าเป็นสินค้าเหล่านี้ — กด “ไปจับคู่” แทนการลงใหม่ (ลงซ้ำ = ร้านมีหลายหน้าขายของชิ้นเดียวกัน)</p>
                <MiniTable rows={data.maybe} columns={maybeCols} rowKey={(p) => p.id} searchText={(p) => `${p.code} ${p.name ?? ""} ${p.listing_title ?? ""}`} searchPlaceholder="ค้นรหัส / ชื่อ" dense emptyText="ไม่มี" />
              </>
            ) : (
              <>
                <p className="text-xs text-slate-500">สินค้าเหล่านี้ไม่มี SKU ที่เปิดขาย — เพิ่ม SKU ในระบบก่อน หรือถ้าเป็นตัวซ้ำ/เลิกขายแล้ว ควรปิดใช้งานสินค้าในระบบ</p>
                <MiniTable rows={data.no_sku} columns={noSkuCols} rowKey={(p) => p.id} searchText={(p) => `${p.code} ${p.name ?? ""}`} searchPlaceholder="ค้นรหัส / ชื่อ" dense emptyText="ไม่มี" />
              </>
            )}
          </div>
        )}
    </ERPModal>
  );
}
