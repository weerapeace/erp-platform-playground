"use client";

/**
 * วางแผนตัดผ้า (/master/fabric-plan · เมนู ผลิต › จ่ายงาน) — เฟส 1 (เจ้าของสั่ง 2026-11-13 "ระบบคำนวณผ้า แบบ Nesting คุ้ม ๆ")
 *   ① ผ้าที่ตัดรวมได้ = ผ้าที่ใบสั่งผลิต "ยังไม่ตัด" ใช้ร่วมกัน (ใช้หลายใบ = ตัดรวมประหยัดกว่าตัดแยก) → กด "วางแผน"
 *   ② เลือกใบเอง (ตัวเลือกใบงานของกลาง) → วางทุกผ้าของใบที่เลือก
 *   ผลต่อผ้า: ตัดแยก vs ตัดรวม · ประหยัด · ใช้ผ้า % · สต็อกพอไหม · ผังการวาง · แบ่งผ้าคืนต่อใบ · ใส่ตะกร้าขอซื้อส่วนขาด · พิมพ์ใบตัดผ้า
 *   อ่านอย่างเดียว — ไม่แก้ตัวเลขในใบสั่งผลิต (ตัวเลขต่อใบยังเป็นแบบตัดแยกตามเดิม)
 * ของกลาง: MiniTable · MoMultiPickerModal · FabricLayoutPreview · addToPrCart · useToast · กติกา lib/fabric-plan (วาง = lib/fabric-calc)
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { MoMultiPickerModal } from "@/components/mo-picker";
import { FabricLayoutPreview } from "@/components/design-sheet-detail/fabric-layout-preview";
import { addToPrCart } from "@/lib/pr-cart";
import { planGroup, type PlanGroupInput, type PlanGroupResult } from "@/lib/fabric-plan";
import type { FabricPlanMo, FabricSuggest } from "@/app/api/mo/fabric-plan/route";

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const dueTxt = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—");
type Plan = { mo_nos: string[]; sku: string | null; title: string };

export default function FabricPlanPage() {
  const toast = useToast();
  const [sug, setSug] = useState<FabricSuggest[] | null>(null);
  const [sugErr, setSugErr] = useState("");
  const [moInfo, setMoInfo] = useState<Record<string, FabricPlanMo>>({});
  const [plan, setPlan] = useState<Plan | null>(null);
  const [inputs, setInputs] = useState<PlanGroupInput[] | null>(null);
  const [results, setResults] = useState<PlanGroupResult[] | null>(null);
  const [planErr, setPlanErr] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState(false);
  const [onlyShared, setOnlyShared] = useState(true);

  const loadSug = async () => {
    setSugErr(""); setSug(null);
    try {
      const r = await apiFetch("/api/mo/fabric-plan?suggest=1"); const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setSug(j.data.groups as FabricSuggest[]); setMoInfo((m) => ({ ...m, ...(j.data.mos as Record<string, FabricPlanMo>) }));
    } catch (e) { setSugErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  };
  useEffect(() => { void loadSug(); }, []);

  // โหลดชิ้นตัดของแผน แล้วคำนวณ (หน่วงให้หน้าวาดก่อน — งานใหญ่หลายสิบใบใช้เวลาครู่หนึ่ง)
  useEffect(() => {
    if (!plan) return;
    let alive = true;
    setInputs(null); setResults(null); setPlanErr(""); setOpen(new Set());
    void (async () => {
      try {
        const q = `mo_nos=${encodeURIComponent(plan.mo_nos.join(","))}${plan.sku ? `&sku=${encodeURIComponent(plan.sku)}` : ""}`;
        const r = await apiFetch(`/api/mo/fabric-plan?${q}`); const j = await r.json();
        if (!alive) return;
        if (!r.ok || j.error) throw new Error(j.error || "โหลดชิ้นตัดไม่สำเร็จ");
        const gs = j.data.groups as PlanGroupInput[];
        setMoInfo((m) => ({ ...m, ...(j.data.mos as Record<string, FabricPlanMo>) }));
        setInputs(gs);
        window.setTimeout(() => {
          if (!alive) return;
          const rs = gs.map(planGroup);
          setResults(rs);
          if (rs.length === 1) setOpen(new Set([rs[0].key]));
        }, 30);
      } catch (e) { if (alive) setPlanErr(e instanceof Error ? e.message : "โหลดชิ้นตัดไม่สำเร็จ"); }
    })();
    return () => { alive = false; };
  }, [plan]);

  const sugShown = useMemo(() => (sug ?? []).filter((g) => !onlyShared || g.mos.length >= 2), [sug, onlyShared]);
  const sharedCount = useMemo(() => (sug ?? []).filter((g) => g.mos.length >= 2).length, [sug]);
  const moLabel = (no: string) => moInfo[no]?.product_sku ?? no;

  const sugCols: MiniColumn<FabricSuggest>[] = [
    { key: "fab", header: "ผ้า", width: "minmax(14rem,2fr)", sortValue: (g) => g.name ?? g.sku, cell: (g) => <div className="min-w-0"><div className="truncate font-medium text-slate-800">{g.name ?? g.sku}</div><div className="truncate font-mono text-[11px] text-slate-400">{g.sku}</div></div> },
    { key: "face", header: "หน้ากว้าง", width: "7rem", sortValue: (g) => g.face_width_cm, cell: (g) => <span className="text-slate-600">{fmt(g.face_width_cm)} ซม.{g.sheet_length_cm ? <span className="text-slate-400"> × {fmt(g.sheet_length_cm)} (ผืน)</span> : ""}</span> },
    { key: "mos", header: "ใบรอตัด", width: "minmax(10rem,1.6fr)", sortValue: (g) => g.mos.length, cell: (g) => <div className="min-w-0"><b className="text-slate-800">{g.mos.length}</b> ใบ<div className="truncate text-[11px] text-slate-400">{g.mos.slice(0, 4).map(moLabel).join(", ")}{g.mos.length > 4 ? ` +${g.mos.length - 4}` : ""}</div></div> },
    { key: "pcs", header: "ชิ้นตัด", align: "right", width: "6rem", sortValue: (g) => g.pieces, cell: (g) => <span className="tabular-nums">{fmt(g.pieces)}</span> },
    { key: "sep", header: "ตัดแยก (เดิม)", align: "right", width: "8rem", sortValue: (g) => g.separate, cell: (g) => <span className="tabular-nums">{fmt(g.separate)} {g.uom ?? ""}</span> },
    { key: "go", header: "", align: "right", width: "8.5rem", cell: (g) => (
      <button type="button" onClick={(e) => { e.stopPropagation(); setPlan({ mo_nos: g.mos, sku: g.sku, title: g.name ?? g.sku }); }}
        className="inline-flex h-8 items-center gap-1 rounded-lg bg-violet-600 px-3 text-[12px] font-medium text-white hover:bg-violet-700"><Icon name="cut" /> วางแผนตัด</button>
    ) },
  ];

  const resCols: MiniColumn<PlanGroupResult>[] = [
    { key: "fab", header: "ผ้า", width: "minmax(13rem,2fr)", sortValue: (r) => r.name ?? r.sku, cell: (r) => <div className="min-w-0"><div className="truncate font-medium text-slate-800">{r.name ?? r.sku}</div><div className="truncate text-[11px] text-slate-400">{r.sku} · หน้า {fmt(r.face_width_cm)} ซม.{r.sheet_length_cm ? ` × ผืน ${fmt(r.sheet_length_cm)}` : ""}</div></div> },
    { key: "mos", header: "ใบ", align: "right", width: "4rem", sortValue: (r) => r.mos.length, cell: (r) => r.mos.length },
    { key: "pcs", header: "ชิ้น", align: "right", width: "5.5rem", sortValue: (r) => r.pieces, cell: (r) => <span className="tabular-nums">{fmt(r.pieces)}</span> },
    { key: "sep", header: "ตัดแยก", align: "right", width: "7rem", sortValue: (r) => r.separate, cell: (r) => <span className="tabular-nums text-slate-500">{fmt(r.separate)}</span> },
    { key: "comb", header: "ตัดรวม", align: "right", width: "7rem", sortValue: (r) => r.combined.qty, cell: (r) => r.ok ? <span className={`tabular-nums ${r.best === "combined" ? "font-semibold text-slate-900" : "text-slate-400 line-through"}`}>{fmt(r.combined.qty)}</span> : <span className="text-rose-600">{r.error}</span> },
    { key: "need", header: "ต้องใช้ (แนะนำ)", align: "right", width: "9.5rem", sortValue: (r) => r.need, cell: (r) => r.ok ? <span className="inline-flex flex-col items-end"><b className="tabular-nums text-slate-900">{fmt(r.need)} {r.uom ?? ""}</b><span className={`text-[10px] ${r.best === "combined" ? "text-violet-600" : "text-amber-700"}`}>{r.best === "combined" ? (r.mos.length > 1 ? "ตัดรวม" : "ใบเดียว") : "ตัดแยกดีกว่า"}</span></span> : "—" },
    { key: "save", header: "ประหยัด", align: "right", width: "7rem", sortValue: (r) => r.saved, cell: (r) => r.saved > 0 ? <span className="tabular-nums font-semibold text-emerald-600">−{fmt(r.saved)}</span> : <span className="text-slate-300">—</span> },
    { key: "eff", header: "ใช้ผ้า", align: "right", width: "5.5rem", sortValue: (r) => r.combined.efficiency_pct, cell: (r) => r.ok ? <span className="tabular-nums">{fmt(r.combined.efficiency_pct)}%</span> : "—" },
    { key: "stock", header: "สต็อก", align: "right", width: "8rem", sortValue: (r) => r.short ?? -1, cell: (r) => r.on_hand == null ? <span className="text-slate-300">ไม่รู้</span>
      : (r.short ?? 0) > 0 ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">ขาด {fmt(r.short ?? 0)}</span>
      : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">พอ ({fmt(r.on_hand)})</span> },
  ];

  const shorts = (results ?? []).filter((r) => r.ok && (r.short ?? 0) > 0);
  const addShortToCart = () => {
    if (!shorts.length || !plan) return;
    const n = addToPrCart(shorts.map((r) => ({
      label: `[${r.sku}] ${r.name ?? ""}`.trim(), qty: Math.max(1, Math.ceil(r.short ?? 0)), uom: r.uom || "หลา",
      seller: "", price: 0, currency: "THB", image: null, variationId: null, skuRef: r.sku, skuId: null,
      note: `ขาดจากแผนตัดผ้า ${r.mos.length} ใบ (${r.mos.slice(0, 5).join(", ")}${r.mos.length > 5 ? " …" : ""}) · ต้องใช้ ${fmt(r.need)} มี ${fmt(r.on_hand ?? 0)}`,
      reason: "ผ้าไม่พอตามแผนตัดผ้า", sourceMoNo: r.mos[0] ?? null,
    })));
    toast.success(`ใส่ตะกร้าขอซื้อแล้ว ${shorts.length} รายการ (ตะกร้ามี ${n}) — ไปกดยืนยันที่หน้า “ขอซื้อ”`);
  };
  const printHref = plan ? `/print/fabric-plan?mo_nos=${encodeURIComponent(plan.mo_nos.join(","))}${plan.sku ? `&sku=${encodeURIComponent(plan.sku)}` : ""}` : "#";

  return (
    <div className="mx-auto max-w-[1500px] p-4">
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800"><Icon name="cut" /> วางแผนตัดผ้า</h1>
          <p className="mt-0.5 text-xs text-slate-500">วางชิ้นตัดของหลายใบสั่งผลิตที่ใช้ผ้าเดียวกันลงผ้าผืนเดียวกัน (ชิ้นเล็กยัดช่องว่างข้ามใบได้) → รู้ว่าต้องใช้ผ้าเท่าไหร่ ประหยัดกว่าตัดแยกเท่าไหร่ สต็อกพอไหม · หน้านี้<b>อ่านอย่างเดียว</b> ไม่แก้ตัวเลขในใบสั่งผลิต</p>
        </div>
        <button type="button" onClick={() => setPick(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 text-sm text-violet-700 hover:bg-violet-50"><Icon name="add" /> เลือกใบเอง</button>
      </div>

      {!plan ? (
        <MiniTable rows={sugShown} columns={sugCols} rowKey={(g) => g.key} searchText={(g) => `${g.sku} ${g.name ?? ""} ${g.mos.map(moLabel).join(" ")}`}
          searchPlaceholder="ค้นผ้า / รหัสสินค้าในใบ" countUnit="ผ้า"
          title={<span className="inline-flex items-center gap-2"><b>ผ้าที่ใบสั่งผลิต “ยังไม่ตัด” ใช้อยู่</b>{sug && <span className="text-[12px] font-normal text-slate-500">ใช้ร่วมกันหลายใบ {sharedCount} ผ้า</span>}</span>}
          actions={<label className="inline-flex items-center gap-1.5 text-[12px] text-slate-600"><input type="checkbox" checked={onlyShared} onChange={(e) => setOnlyShared(e.target.checked)} /> เฉพาะที่ใช้ร่วมกันตั้งแต่ 2 ใบ (ตัดรวมได้)</label>}
          onRowClick={(g) => setPlan({ mo_nos: g.mos, sku: g.sku, title: g.name ?? g.sku })}
          emptyText={sugErr ? <span className="text-rose-600">{sugErr} <button type="button" onClick={() => void loadSug()} className="underline">ลองใหม่</button></span> : sug === null ? "กำลังโหลด…" : "ไม่มีผ้าที่ต้องวาง — ใบที่ยังไม่ตัดไม่มีชิ้นตัดผ้า (หรือยังไม่ได้กด “อัพเดตวัตถุดิบตาม BOM”)"} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <button type="button" onClick={() => setPlan(null)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100"><Icon name="back" /> กลับ</button>
            <b className="text-slate-800">แผนตัด: {plan.title}</b>
            <span className="text-sm text-slate-500">{plan.mo_nos.length} ใบสั่งผลิต{results ? ` · ${results.length} ผ้า` : ""}</span>
            <div className="flex-1" />
            {shorts.length > 0 && <button type="button" onClick={addShortToCart} className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 text-[12px] text-rose-700 hover:bg-rose-50"><Icon name="cart" /> ใส่ตะกร้าขอซื้อส่วนขาด ({shorts.length})</button>}
            <a href={printHref} target="_blank" rel="noreferrer" className={`inline-flex h-8 items-center gap-1 rounded-lg bg-violet-600 px-3 text-[12px] font-medium text-white no-underline hover:bg-violet-700 ${results ? "" : "pointer-events-none opacity-40"}`}><Icon name="print" /> พิมพ์ใบตัดผ้า</a>
          </div>
          {planErr ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm text-rose-700">{planErr} <button type="button" onClick={() => setPlan({ ...plan })} className="underline">ลองใหม่</button></div>
            : !results ? <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">{inputs ? `กำลังวางผ้า ${inputs.length} ผ้า…` : "กำลังโหลดชิ้นตัด…"}</div>
            : (
              <MiniTable rows={results} columns={resCols} rowKey={(r) => r.key} hideSearch={results.length < 6} countUnit="ผ้า"
                onRowClick={(r) => setOpen((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })}
                expandedKeys={open} renderExpanded={(r) => <PlanDetail r={r} moInfo={moInfo} />}
                emptyText="ใบที่เลือกไม่มีชิ้นตัดผ้า (หรือยังไม่ได้กด “อัพเดตวัตถุดิบตาม BOM”)" />
            )}
          {results && <div className="text-[11px] text-slate-400">ตัดแยก = วางทีละใบ (ตัวเลขที่ใบสั่งผลิตใช้อยู่) · ตัดรวม = วางชิ้นทุกใบบนผ้าผืนเดียวกัน · ไม่บวกเผื่อเสีย · วางแบบกรอบสี่เหลี่ยม (ชิ้นโค้งจะวางได้ดีกว่านี้ในเฟสถัดไป) · กดแถวเพื่อดูผัง + แบ่งต่อใบ</div>}
        </div>
      )}

      <MoMultiPickerModal open={pick} onClose={() => setPick(false)} scope="open" title="เลือกใบสั่งผลิตที่จะวางแผนตัด" confirmLabel="วางแผนตัด"
        description="เลือกได้หลายใบ — ระบบจะรวมชิ้นตัดของผ้าตัวเดียวกันให้"
        onConfirm={(rows) => { setPick(false); if (rows.length) setPlan({ mo_nos: rows.map((r) => r.mo_no), sku: null, title: `${rows.length} ใบที่เลือก` }); }} />
    </div>
  );
}

/** กางแถว: ผังการวาง (ตัดรวม) + แบ่งผ้าต่อใบ */
function PlanDetail({ r, moInfo }: { r: PlanGroupResult; moInfo: Record<string, FabricPlanMo> }) {
  if (!r.ok) return <div className="p-3 text-sm text-rose-600">{r.error}</div>;
  const layout = r.combined.layout;
  return (
    <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="mb-1 text-[12px] text-slate-600">{r.combined.note}</div>
        {layout ? <FabricLayoutPreview result={layout} faceWidthCm={r.face_width_cm} sheetLengthCm={r.sheet_length_cm} mode={r.sheet_length_cm ? "sheet" : "roll"} />
          : <div className="text-sm text-slate-400">ไม่มีผัง</div>}
      </div>
      <div className="min-w-0">
        <div className="mb-1 text-[12px] font-semibold text-slate-700">แบ่งผ้าต่อใบ (ตามสัดส่วนพื้นที่ชิ้น)</div>
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-[12px]">
          <div className="grid grid-cols-[minmax(0,1fr)_4rem_5rem_5rem] gap-2 px-2 py-1 text-[11px] text-slate-400"><span>ใบ</span><span className="text-right">ชิ้น</span><span className="text-right">ตัดแยก</span><span className="text-right">{r.best === "combined" ? "ส่วนจากตัดรวม" : "ตัดรวม"}</span></div>
          {r.per_mo.map((m) => (
            <div key={m.mo_no} className="grid grid-cols-[minmax(0,1fr)_4rem_5rem_5rem] items-center gap-2 px-2 py-1.5">
              <span className="min-w-0"><span className="block truncate font-mono text-slate-800">{moInfo[m.mo_no]?.product_sku ?? m.mo_no}</span><span className="block truncate text-[10px] text-slate-400">{m.mo_no} · {fmt(moInfo[m.mo_no]?.qty ?? 0)} ใบ · ส่ง {dueTxt(moInfo[m.mo_no]?.due_date ?? null)}</span></span>
              <span className="text-right tabular-nums text-slate-600">{fmt(m.pieces)}</span>
              <span className="text-right tabular-nums text-slate-400">{fmt(m.separate)}</span>
              <span className={`text-right tabular-nums ${r.best === "combined" ? "font-semibold text-slate-800" : "text-slate-400"}`}>{fmt(m.combined)}</span>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(0,1fr)_4rem_5rem_5rem] gap-2 bg-slate-50 px-2 py-1.5 font-semibold">
            <span>รวม</span><span className="text-right tabular-nums">{fmt(r.pieces)}</span><span className="text-right tabular-nums text-slate-500">{fmt(r.separate)}</span><span className="text-right tabular-nums">{fmt(r.combined.qty)} {r.uom ?? ""}</span>
          </div>
        </div>
        {r.best === "separate" && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">ผ้านี้วางรวมแล้ว<b>ยาวกว่า</b>ตัดทีละใบ ({fmt(r.combined.qty)} vs {fmt(r.separate)}) → <b>แนะนำตัดแยก</b> ใช้ผังของแต่ละใบ (ปุ่ม 🧵 ผัง ในใบสั่งผลิต) · ต้องใช้รวม {fmt(r.need)} {r.uom ?? ""}</div>}
        {r.saved > 0 && <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">ตัดรวมประหยัด <b>{fmt(r.saved)} {r.uom ?? ""}</b> ({fmt(r.separate > 0 ? (r.saved / r.separate) * 100 : 0)}%) เทียบตัดทีละใบ</div>}
        {r.combined.layout?.sampledFrom && <div className="mt-1 text-[11px] text-amber-600">ล็อตใหญ่: จำลองบางส่วนแล้วขยายผล (ประมาณการ)</div>}
      </div>
    </div>
  );
}
