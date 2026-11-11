"use client";
/**
 * ParentProductionTab — แท็บ "🏭 ผลิต" ของ Parent SKU (แทนแท็บ "ปัญหา" · เจ้าของขอ 2026-11-11)
 *
 *   1) เลือกสี/SKU (สูตรผลิตผูกกับ SKU ลูก ไม่ใช่ Parent) — เปิดตัวที่สูตรแก้ล่าสุดก่อน
 *   2) สูตรผลิต (BOM) — หลายเวอร์ชัน = แท็บ (ล่าสุดก่อน) · วัตถุดิบ + รายละเอียดแบบหน้าทำสูตร (งานเหมา · ค่าแรง · หมายเหตุ)
 *      ปุ่ม "แก้ในตัวทำสูตร" / "สร้างสูตร" = BomEditorModal (ของกลาง)
 *   3) ปัญหาที่เคยเจอ = ParentIssuesPanel (ของกลาง ตัวเดิมของแท็บปัญหา)
 *   4) ประวัติการผลิต — ใบสั่งผลิตของทุก SKU ในรุ่น: วันที่ · จำนวน · ใครทำ · สถานะ · กดเปิด MoStatusModal (ของกลาง)
 * ข้อมูล: GET /api/parent-skus/[id]/production (products.view) · กฎ lib/parent-production
 * ของกลางที่ใช้: ScrollTabs · MiniTable · HoverImage · state-views · BomEditorModal · ParentIssuesPanel · MoStatusModal · MO_STATUS_TONE_CLASS
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { r2ImageUrl } from "@/lib/r2-image";
import { ScrollTabs } from "@/components/scroll-tabs";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { HoverImage } from "@/components/hover-image";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { ParentIssuesPanel } from "@/components/parent-issues-panel";
import { MO_STATUS_TONE_CLASS } from "@/lib/mo-status";
import { pickDefaultSku, productionHistoryStatus, sortBomVersions } from "@/lib/parent-production";

const BomEditorModal = dynamic(() => import("@/components/bom-editor-modal").then((m) => m.BomEditorModal), { ssr: false });
const MoStatusModal = dynamic(() => import("@/components/mo-status-modal").then((m) => m.MoStatusModal), { ssr: false });

type Sku = { id: string; code: string; name: string | null; color: string | null; image_key: string | null; is_active: boolean };
type BomLine = { component_sku: string | null; component_name: string | null; qty: number | string | null; uom: string | null; waste_percent: number | string | null; slot_code: string | null; material_type: string | null; image_key: string | null };
type Bom = {
  id: string; bom_code: string; product_sku: string | null; product_name: string | null; version: string | null; status: string | null;
  is_default: boolean; note: string | null; effective_from: string | null; updated_at: string | null;
  lines: BomLine[]; piecework: { job_name: string | null; rate: number | string | null; qty_per: number | string | null }[];
  labor: { craftsman_name: string | null; rate: number | string | null; is_current: boolean }[];
};
type Mo = {
  id: string; mo_no: string; product_sku: string | null; qty: number; status: string | null; date: string | null;
  finished_received_at: string | null; dispatched: number; received: number; people: string[]; departments: string[];
};
type Data = { skus: Sku[]; boms: Bom[]; mos: Mo[] };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmt = (v: unknown, d = 2) => num(v).toLocaleString("th-TH", { maximumFractionDigits: d });
const baht = (v: unknown) => `฿${num(v).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const thDate = (s: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—");

export function ParentProductionTab({ parentId }: { parentId: string | null }) {
  const { can } = useAuth();
  const canEditBom = can("products.edit");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [sku, setSku] = useState<string | null>(null);
  const [bomCode, setBomCode] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ sku: string; name: string | null; newVersion: boolean } | null>(null);
  const [openMo, setOpenMo] = useState<string | null>(null);
  const [onlyThisSku, setOnlyThisSku] = useState(false);
  const [showAllSkus, setShowAllSkus] = useState(false);   // SKU ที่ยังไม่มีสูตร/ไม่เคยผลิต พับไว้ (รุ่นหนึ่งมีได้ 20+ ตัว)

  const load = useCallback(async () => {
    if (!parentId) return;
    setErr("");
    try {
      const r = await apiFetch(`/api/parent-skus/${encodeURIComponent(parentId)}/production`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `โหลดไม่สำเร็จ (${r.status})`);
      setData({ skus: j.skus ?? [], boms: j.boms ?? [], mos: j.mos ?? [] });
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดข้อมูลการผลิตไม่สำเร็จ"); }
  }, [parentId]);
  useEffect(() => { void load(); }, [load]);

  // เลือก SKU ตั้งต้น = สูตรแก้ล่าสุด
  useEffect(() => {
    if (!data || sku) return;
    setSku(pickDefaultSku(data.skus.map((s) => s.code), data.boms));
  }, [data, sku]);

  const bomCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of data?.boms ?? []) if (b.product_sku) m.set(b.product_sku, (m.get(b.product_sku) ?? 0) + 1);
    return m;
  }, [data]);
  const versions = useMemo(() => sortBomVersions((data?.boms ?? []).filter((b) => b.product_sku === sku)), [data, sku]);
  const bom = versions.find((b) => b.bom_code === bomCode) ?? versions[0] ?? null;
  useEffect(() => { setBomCode(versions[0]?.bom_code ?? null); }, [sku]);   // eslint-disable-line react-hooks/exhaustive-deps
  const skuRow = data?.skus.find((s) => s.code === sku) ?? null;
  // ชิป SKU: ตัวที่มีสูตรหรือเคยผลิตโชว์ก่อน · ที่เหลือพับ (ไม่มีตัวไหนมีข้อมูลเลย = โชว์ทั้งหมด)
  const { mainSkus, restSkus } = useMemo(() => {
    const all = data?.skus ?? [];
    const busy = new Set([...(data?.boms ?? []).map((b) => b.product_sku), ...(data?.mos ?? []).map((m) => m.product_sku)]);
    const main = all.filter((s) => busy.has(s.code) || s.code === sku);
    return main.length === 0 ? { mainSkus: all, restSkus: [] as Sku[] } : { mainSkus: main, restSkus: all.filter((s) => !main.includes(s)) };
  }, [data, sku]);
  const skuLabel = (s: Sku | null) => (s ? [s.color, s.code].filter(Boolean).join(" · ") : "");

  if (!parentId) return <div className="text-sm text-slate-400 py-8 text-center">บันทึกสินค้าก่อน แล้วค่อยดูข้อมูลการผลิต</div>;
  if (err) return <ErrorState title="โหลดข้อมูลการผลิตไม่สำเร็จ" hint={err} onRetry={() => void load()} />;
  if (!data) return <LoadingState label="กำลังโหลดข้อมูลการผลิต…" />;

  const lineCols: MiniColumn<BomLine>[] = [
    { key: "img", header: "", width: "2.5rem", cell: (l) => <HoverImage url={r2ImageUrl(l.image_key, 96)} size={28} alt={l.component_name ?? ""} /> },
    { key: "name", header: "วัตถุดิบ", width: "1fr", sortValue: (l) => l.component_name ?? "",
      cell: (l) => <div className="min-w-0"><div className="truncate text-slate-800">{l.component_name || l.component_sku || "—"}</div>
        <div className="text-[11px] text-slate-400 truncate">{[l.component_sku, l.slot_code].filter(Boolean).join(" · ")}</div></div> },
    { key: "qty", header: "ใช้/ชิ้น", width: "7rem", align: "right", sortValue: (l) => num(l.qty),
      cell: (l) => <span className="tabular-nums">{fmt(l.qty, 4)} <span className="text-slate-400">{l.uom ?? ""}</span></span> },
    { key: "waste", header: "เผื่อเสีย", width: "4.5rem", align: "right",
      cell: (l) => (num(l.waste_percent) ? <span className="tabular-nums text-slate-500">{fmt(l.waste_percent, 1)}%</span> : <span className="text-slate-300">—</span>) },
  ];

  const mos = onlyThisSku && sku ? data.mos.filter((m) => m.product_sku === sku) : data.mos;
  const skuByCode = new Map(data.skus.map((s) => [s.code, s]));
  const moCols: MiniColumn<Mo>[] = [
    { key: "date", header: "วันที่", width: "6.5rem", sortValue: (m) => m.date ?? "", cell: (m) => <span className="tabular-nums">{thDate(m.date)}</span> },
    { key: "mo", header: "ใบสั่งผลิต", width: "8.5rem", sortValue: (m) => m.mo_no,
      cell: (m) => <button type="button" onClick={() => setOpenMo(m.id)} className="text-violet-700 hover:underline font-mono text-[12px]">{m.mo_no}</button> },
    { key: "sku", header: "สี / SKU", width: "1fr", cell: (m) => <span className="truncate">{skuLabel(skuByCode.get(m.product_sku ?? "") ?? null) || m.product_sku}</span> },
    { key: "qty", header: "จำนวน", width: "4.5rem", align: "right", sortValue: (m) => m.qty, cell: (m) => <span className="tabular-nums">{fmt(m.qty, 2)}</span> },
    { key: "who", header: "ใครทำ", width: "1.3fr",
      cell: (m) => (m.people.length
        ? <span className="truncate" title={m.people.join(", ")}>{m.people.join(", ")}</span>
        : m.departments.length ? <span className="text-slate-500 truncate">{m.departments.join(", ")}</span>
        : <span className="text-slate-300">ยังไม่จ่ายงาน</span>) },
    { key: "status", header: "สถานะ", width: "7rem",
      cell: (m) => { const s = productionHistoryStatus(m); return <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${MO_STATUS_TONE_CLASS[s.tone]}`}>{s.label}</span>; } },
  ];
  const totalQty = mos.reduce((s, m) => s + (m.status === "cancelled" ? 0 : m.qty), 0);
  const totalRecv = mos.reduce((s, m) => s + m.received, 0);

  return (
    <div className="space-y-3">
      {/* 1) เลือกสี/SKU — สูตรผูกกับ SKU ลูก */}
      {data.skus.length === 0 ? (
        <EmptyState title="รุ่นนี้ยังไม่มี SKU ลูก" hint="สร้าง SKU (สี/ไซซ์) ก่อน แล้วค่อยทำสูตรผลิตให้แต่ละตัว" />
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-500 mr-1">สี / SKU:</span>
          {(showAllSkus ? [...mainSkus, ...restSkus] : mainSkus).map((s) => {
            const on = s.code === sku; const n = bomCount.get(s.code) ?? 0;
            return (
              <button key={s.code} type="button" onClick={() => setSku(s.code)} title={n ? `${n} เวอร์ชัน` : "ยังไม่มีสูตร"}
                className={`inline-flex items-center gap-1.5 h-7 pl-1 pr-2 rounded-full border text-xs ${on ? "border-violet-400 bg-violet-50 text-violet-800" : n ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "border-dashed border-slate-200 bg-white text-slate-400 hover:bg-slate-50"}`}>
                <HoverImage url={r2ImageUrl(s.image_key, 96)} size={20} rounded="rounded-full" alt={s.code} />
                <span>{skuLabel(s)}</span>
                {n > 0 && <span className="text-[10px] tabular-nums text-slate-400">{n}v</span>}
              </button>
            );
          })}
          {restSkus.length > 0 && (
            <button type="button" onClick={() => setShowAllSkus((v) => !v)} className="h-7 px-2 text-xs text-violet-700 hover:underline">
              {showAllSkus ? "ซ่อน SKU ที่ยังไม่มีสูตร" : `+ อีก ${restSkus.length} SKU (ยังไม่มีสูตร/ไม่เคยผลิต)`}
            </button>
          )}
        </div>
      )}

      {/* 2) สูตรผลิต */}
      {sku && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-end gap-2 px-3 pt-2 border-b border-slate-200">
            <span className="text-sm font-medium text-slate-800 pb-2 shrink-0">🧾 สูตรผลิต</span>
            {versions.length > 0 && (
              <ScrollTabs activeKey={bom?.bom_code ?? null} className="flex-1 min-w-0">
                {versions.map((b, i) => (
                  <button key={b.bom_code} data-tab-key={b.bom_code} type="button" onClick={() => setBomCode(b.bom_code)}
                    className={`px-3 py-2 text-xs whitespace-nowrap border-b-2 ${b.bom_code === bom?.bom_code ? "border-orange-500 text-orange-600 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                    {b.version || "—"}{i === 0 ? " · ล่าสุด" : ""}{b.is_default ? " ⭐" : ""}
                  </button>
                ))}
              </ScrollTabs>
            )}
            {canEditBom && (
              <span className="ml-auto flex gap-1.5 pb-1.5 shrink-0">
                {bom && <button type="button" onClick={() => setEditor({ sku, name: skuRow?.name ?? bom.product_name, newVersion: false })}
                  className="h-7 px-2.5 text-xs rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">✎ แก้ในตัวทำสูตร</button>}
                <button type="button" onClick={() => setEditor({ sku, name: skuRow?.name ?? null, newVersion: !!bom })}
                  className="h-7 px-2.5 text-xs rounded-md border border-violet-300 text-violet-700 hover:bg-violet-50">{bom ? "+ เวอร์ชันใหม่" : "+ สร้างสูตร"}</button>
              </span>
            )}
          </div>
          {!bom ? (
            <EmptyState className="m-3" title={`${skuLabel(skuRow)} ยังไม่มีสูตรผลิต`} hint={canEditBom ? "กด “+ สร้างสูตร” เพื่อทำสูตรให้ SKU นี้" : "ให้ฝ่ายผลิตทำสูตรให้ SKU นี้ก่อน"} />
          ) : (
            <div className="p-3 grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <MiniTable rows={bom.lines} columns={lineCols} rowKey={(l) => `${l.component_sku}|${l.slot_code}|${l.component_name}`} hideSearch dense
                countUnit="รายการ" emptyText="สูตรนี้ยังไม่มีวัตถุดิบ" />
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-1">รายละเอียดสูตร</div>
                  <dl className="grid grid-cols-[6rem_1fr] gap-y-1">
                    <dt className="text-slate-400">รหัสสูตร</dt><dd className="font-mono text-slate-700">{bom.bom_code}</dd>
                    <dt className="text-slate-400">สถานะ</dt><dd className="text-slate-700">{bom.status === "active" ? "ใช้งาน" : bom.status || "—"}{bom.is_default ? " · สูตรหลัก" : ""}</dd>
                    <dt className="text-slate-400">วัตถุดิบ</dt><dd className="text-slate-700">{bom.lines.length} รายการ</dd>
                    <dt className="text-slate-400">แก้ล่าสุด</dt><dd className="text-slate-700">{thDate(bom.updated_at)}</dd>
                  </dl>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-1">งานเหมา</div>
                  {bom.piecework.length === 0 ? <div className="text-slate-300">— ยังไม่ตั้ง</div> : (
                    <ul className="space-y-0.5">
                      {bom.piecework.map((p, i) => (
                        <li key={i} className="flex gap-2"><span className="flex-1 truncate text-slate-700">{p.job_name || "—"}</span>
                          <span className="tabular-nums text-slate-500">{num(p.qty_per) > 1 ? `${fmt(p.qty_per)} × ` : ""}{baht(p.rate)}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-1">ค่าแรงประกอบ</div>
                  {bom.labor.filter((l) => l.is_current).length === 0 ? <div className="text-slate-300">— ยังไม่ตั้ง</div> : (
                    <ul className="space-y-0.5">
                      {bom.labor.filter((l) => l.is_current).map((l, i) => (
                        <li key={i} className="flex gap-2"><span className="flex-1 truncate text-slate-700">{l.craftsman_name || "ค่าแรงกลาง"}</span>
                          <span className="tabular-nums text-slate-500">{baht(l.rate)}/ชิ้น</span></li>
                      ))}
                    </ul>
                  )}
                </div>
                {bom.note && (
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500 mb-1">หมายเหตุสูตร</div>
                    <div className="whitespace-pre-wrap text-slate-700">{bom.note}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3) ปัญหาที่เคยเจอ (ตัวเดิมของแท็บปัญหา) */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <ParentIssuesPanel parentSkuId={parentId} editable bare />
      </div>

      {/* 4) ประวัติการผลิต */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <MiniTable rows={mos} columns={moCols} rowKey={(m) => m.id} hideSearch dense countUnit="ใบ"
          title={<span className="text-sm font-medium text-slate-800">🏭 ประวัติการผลิต</span>}
          actions={
            <span className="flex items-center gap-3 text-xs text-slate-500">
              {mos.length > 0 && <span className="tabular-nums">สั่งผลิต {fmt(totalQty, 0)} ชิ้น · ส่งแล้ว {fmt(totalRecv, 0)}</span>}
              {sku && <label className="inline-flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={onlyThisSku} onChange={(e) => setOnlyThisSku(e.target.checked)} /> เฉพาะ {skuLabel(skuRow)}</label>}
            </span>
          }
          emptyText="ยังไม่เคยสั่งผลิตสินค้ารุ่นนี้" />
      </div>

      {editor && (
        <BomEditorModal sku={editor.sku} productName={editor.name} newVersion={editor.newVersion}
          onClose={(changed) => { setEditor(null); if (changed) void load(); }} />
      )}
      {openMo && <MoStatusModal moId={openMo} onClose={() => setOpenMo(null)} onChanged={() => void load()} />}
    </div>
  );
}
