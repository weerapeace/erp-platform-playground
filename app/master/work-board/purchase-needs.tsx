"use client";

/**
 * หน้า "ขอซื้อ/เตรียม" — รวมวัตถุดิบที่ต้องซื้อ/เตรียม จากทุกใบสั่งผลิต
 *  • โหมด "ตามประเภท": ใช้ MiniTable — ติ๊กเลือก → สร้างใบขอซื้อ (แยกต่อใบสั่งผลิต)
 *  • โหมด "ตามใบสั่งผลิต": จัดกลุ่มต่อ MO — ใส่จำนวนที่มี + ติ๊กเตรียมแล้ว (sync บอร์ดผ่าน mo_material_summary)
 *  • รูปวัตถุดิบ + รูป SKU ของ MO · คลิกใบสั่งผลิต → เปิดป๊อปอัปใบสั่งผลิต
 * ใช้ของกลาง: MiniTable, ERPModal, /api/mo/material (เตรียม/จำนวน), /api/purchasing/create-pr
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { ERPModal } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import type { PurchaseNeedRow, PurchaseNeedMo } from "@/app/api/mo/purchase-needs/route";

const fmt = (n: number) => (Math.round(n * 10000) / 10000).toLocaleString("th-TH");
const keyOf = (r: PurchaseNeedRow) => r.component_sku ?? `nm:${r.component_name ?? ""}`;

// รูปเล็ก (วัตถุดิบ/สินค้า) + fallback
function Thumb({ url, size = "sm" }: { url: string | null | undefined; size?: "xs" | "sm" | "md" }) {
  const [err, setErr] = useState(false);
  const cls = size === "xs" ? "w-5 h-5 text-[8px]" : size === "md" ? "w-10 h-10 text-sm" : "w-8 h-8 text-[10px]";
  if (!url || err) return <span className={`${cls} shrink-0 rounded border border-slate-100 bg-slate-50 flex items-center justify-center text-slate-300`}>📦</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" onError={() => setErr(true)} className={`${cls} shrink-0 rounded object-cover border border-slate-100`} />;
}

type FlatLine = PurchaseNeedMo & {
  component_sku: string | null; component_name: string | null; component_image: string | null; material_type: string | null; uom: string | null;
};

export function PurchaseNeeds({ canEdit, onOpenMo }: { canEdit: boolean; onOpenMo?: (moId: string) => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<PurchaseNeedRow[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);   // popup ยืนยันก่อนสร้างจริง
  const [mode, setMode] = useState<"type" | "mo" | "group">("type");  // ตามประเภท / ตามใบสั่งผลิต / ตามกลุ่ม
  const [confirmPrepOpen, setConfirmPrepOpen] = useState(false);   // ยืนยันก่อน "ทำเป็นเตรียมแล้ว"
  const [moGroupList, setMoGroupList] = useState<{ name: string; mo_nos: string[] }[]>([]);
  useEffect(() => { void (async () => { try { const r = await apiFetch("/api/mo/groups"); const j = await r.json();
    setMoGroupList(((j.data ?? []) as { name: string; mo_nos: unknown }[]).map((g) => ({ name: g.name, mo_nos: (Array.isArray(g.mo_nos) ? g.mo_nos : []) as string[] }))); } catch { /* ignore */ } })(); }, []);
  const groupNameOf = useCallback((moNo: string) => moGroupList.find((g) => g.mo_nos.includes(moNo))?.name ?? null, [moGroupList]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});  // จำนวนที่มี (กำลังพิมพ์) ต่อ summary_id
  const [busy, setBusy] = useState<string | null>(null);
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const [printSel, setPrintSel] = useState<Set<string>>(new Set());  // ประเภทที่เลือกพิมพ์

  const load = useCallback(async () => {
    setRows(null); setSel(new Set()); setDrafts({});
    try { const res = await apiFetch("/api/mo/purchase-needs"); const j = await res.json(); setRows((j.data ?? []) as PurchaseNeedRow[]); }
    catch { setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const createPR = async () => {
    if (!rows) return;
    const chosen = rows.filter((r) => sel.has(keyOf(r)));
    if (chosen.length === 0) { toast.error("ยังไม่ได้เลือกวัตถุดิบ"); return; }
    const items = chosen.flatMap((r) => r.mos.map((m) => ({
      item_name: r.component_sku ? `[${r.component_sku}] ${r.component_name ?? ""}` : (r.component_name ?? ""),
      qty: m.needed, uom: r.uom, used_for_label: m.product_label, needed_date: m.due_date, source_mo_no: m.mo_no,
      note: `จากใบสั่งผลิต ${m.mo_no} (รวมขอซื้อ)`,
    })));
    setSaving(true);
    try {
      const res = await apiFetch("/api/purchasing/create-pr", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, order_date: new Date().toISOString().slice(0, 10), actor: user?.name ?? user?.email ?? undefined }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`สร้างใบขอซื้อ ${j.created ?? items.length} รายการ — ดูที่หน้า "ขอซื้อ"`);
      setConfirmOpen(false);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างใบขอซื้อไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  // บันทึก "จำนวนที่มี" → mo_material_summary.on_hand_qty (sync บอร์ด) แล้วโหลดใหม่ (needed เปลี่ยน)
  const saveOnHand = async (summaryId: string | null, val: string, prev: number) => {
    if (!summaryId) return;
    const num = Number(val);
    if (!Number.isFinite(num) || num < 0 || num === prev) { setDrafts((d) => { const n = { ...d }; delete n[summaryId]; return n; }); return; }
    setBusy(summaryId);
    try {
      const res = await apiFetch("/api/mo/material", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: summaryId, on_hand_qty: num }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกจำนวนที่มีแล้ว");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(null); }
  };
  // ติ๊ก "เตรียมแล้ว" → is_ready (อัปเดต local ทันที ไม่ต้องโหลดใหม่)
  const toggleReady = async (summaryId: string | null, next: boolean) => {
    if (!summaryId) return;
    setBusy(summaryId);
    try {
      const res = await apiFetch("/api/mo/material", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: summaryId, is_ready: next }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setRows((prev) => prev ? prev.map((r) => ({ ...r, mos: r.mos.map((m) => m.summary_id === summaryId ? { ...m, is_ready: next } : m) })) : prev);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(null); }
  };

  // ✓ ทำเป็นเตรียมแล้ว — เตรียมครบทุกใบสั่งผลิตที่ใช้วัตถุดิบที่เลือก (อัพเดต is_ready ทุก summary_id)
  const markPreparedSelected = async () => {
    if (!rows) return;
    const chosenRows = rows.filter((r) => sel.has(keyOf(r)));
    const ids = chosenRows.flatMap((r) => r.mos.map((m) => m.summary_id).filter(Boolean)) as string[];
    if (ids.length === 0) { toast.error("ยังไม่ได้เลือกวัตถุดิบ"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/mo/material", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, is_ready: true }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      const idSet = new Set(ids);
      setRows((prev) => prev ? prev.map((r) => ({ ...r, mos: r.mos.map((m) => m.summary_id && idSet.has(m.summary_id) ? { ...m, is_ready: true } : m) })) : prev);
      setSel(new Set()); setConfirmPrepOpen(false);
      toast.success(`ทำเป็นเตรียมแล้ว ${ids.length} รายการ (ทุกใบที่ใช้วัตถุดิบที่เลือก)`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  // popup ยืนยัน
  const chosen = (rows ?? []).filter((r) => sel.has(keyOf(r)));
  const prCount = chosen.reduce((n, r) => n + r.mos.length, 0);
  const moCount = new Set(chosen.flatMap((r) => r.mos.map((m) => m.mo_no))).size;

  // โหมดตามใบสั่งผลิต: แตกเป็นบรรทัดต่อ (MO × วัตถุดิบ) แล้วจัดกลุ่มตาม MO
  const moGroups = useMemo(() => {
    const lines: FlatLine[] = (rows ?? []).flatMap((r) => r.mos.map((m) => ({
      ...m, component_sku: r.component_sku, component_name: r.component_name, component_image: r.component_image, material_type: r.material_type, uom: r.uom,
    })));
    const map = new Map<string, { mo_no: string; mo_id: string; product_label: string; product_image: string | null; due_date: string | null; lines: FlatLine[] }>();
    for (const l of lines) {
      let g = map.get(l.mo_no);
      if (!g) { g = { mo_no: l.mo_no, mo_id: l.mo_id, product_label: l.product_label, product_image: l.product_image, due_date: l.due_date, lines: [] }; map.set(l.mo_no, g); }
      g.lines.push(l);
    }
    return [...map.values()].sort((a, b) => a.mo_no.localeCompare(b.mo_no));
  }, [rows]);

  const columns = useMemo<MiniColumn<PurchaseNeedRow>[]>(() => [
    {
      key: "material", header: "วัตถุดิบ", width: "1.4fr",
      sortValue: (r) => r.component_name ?? "", sortLabel: "ชื่อ",
      cell: (r) => (
        <div className="flex items-center gap-2 min-w-0">
          <Thumb url={r.component_image} />
          <div className="min-w-0">
            <p className="truncate"><code className="text-[10px] text-slate-400">{r.component_sku}</code> {r.component_name}</p>
            {r.material_type && <p className="text-[10px] text-slate-400">{r.material_type}{r.total_requested > 0 ? ` · ขอแล้ว ${fmt(r.total_requested)}` : ""}</p>}
          </div>
        </div>
      ),
    },
    {
      key: "remaining", header: "รวมต้องซื้อ", width: "6rem", align: "right",
      sortValue: (r) => r.total_remaining, sortLabel: "ต้องซื้อ",
      cell: (r) => <span className="font-bold text-rose-600 tabular-nums">{fmt(r.total_remaining)}</span>,
    },
    { key: "uom", header: "หน่วย", width: "4.5rem", cell: (r) => <span className="text-xs text-slate-500">{r.uom ?? ""}</span> },
    {
      key: "mos", header: "ใบสั่งผลิตที่ต้องใช้", width: "1.6fr",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.mos.map((m) => (
            <button key={m.mo_no} type="button" onClick={() => onOpenMo?.(m.mo_id)} title={`${m.mo_no} · ${m.product_label} · ${fmt(m.needed)} ${r.uom ?? ""} — คลิกเปิดใบสั่งผลิต`}
              className="text-[10px] pl-0.5 pr-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700 inline-flex items-center gap-1">
              <Thumb url={m.product_image} size="xs" /> {m.product_label || m.mo_no} <b>{fmt(m.needed)}</b>
            </button>
          ))}
        </div>
      ),
    },
  ], [onOpenMo]);

  if (rows === null) return <div className="text-center py-16 text-slate-400">กำลังโหลด…</div>;

  const modeToggle = (
    <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
      <button onClick={() => setMode("type")} className={`h-8 px-3 ${mode === "type" ? "bg-rose-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>ตามประเภท</button>
      <button onClick={() => setMode("mo")} className={`h-8 px-3 border-l border-slate-200 ${mode === "mo" ? "bg-rose-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>ตามใบสั่งผลิต</button>
      <button onClick={() => setMode("group")} className={`h-8 px-3 border-l border-slate-200 ${mode === "group" ? "bg-rose-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>ตามกลุ่ม</button>
    </div>
  );
  const allTypes = [...new Set((rows ?? []).map((r) => r.material_type || "ไม่ระบุประเภท"))].sort((a, b) => a.localeCompare(b, "th"));
  const openPrint = (types: string[]) => {
    setPrintMenuOpen(false);
    const qs = types.length ? `?types=${encodeURIComponent(types.join(","))}` : "";
    window.open(`/print/purchase-needs${qs}`, "_blank", "noopener");
  };
  const printBtn = (
    <div className="relative">
      <button type="button" onClick={() => setPrintMenuOpen((o) => !o)} title="พิมพ์รายการ (เลือกพิมพ์ทั้งหมด/เฉพาะประเภท)"
        className="h-8 px-3 inline-flex items-center gap-1 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">🖨️ พิมพ์ <span className="text-[9px] text-slate-400">▾</span></button>
      {printMenuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPrintMenuOpen(false)} />
          <div className="absolute right-0 top-9 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2 min-w-[230px]">
            <button type="button" onClick={() => openPrint([])} className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-slate-50 text-slate-700">🖨️ พิมพ์ทั้งหมด</button>
            <div className="border-t border-slate-100 my-1.5" />
            <div className="text-[11px] text-slate-400 px-1 mb-1">เลือกพิมพ์เฉพาะประเภท</div>
            <div className="max-h-56 overflow-y-auto">
              {allTypes.map((t) => (
                <label key={t} className="flex items-center gap-2 px-1 py-1 text-sm hover:bg-slate-50 rounded cursor-pointer">
                  <input type="checkbox" checked={printSel.has(t)} onChange={() => setPrintSel((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; })} className="w-4 h-4 accent-rose-600" />
                  <span className="truncate">{t}</span>
                </label>
              ))}
              {allTypes.length === 0 && <div className="px-1 py-2 text-xs text-slate-300">ไม่มีข้อมูล</div>}
            </div>
            <button type="button" disabled={printSel.size === 0} onClick={() => openPrint([...printSel])}
              className="mt-1.5 w-full h-8 text-sm font-medium bg-rose-600 text-white rounded-md hover:bg-rose-700 disabled:opacity-40">🖨️ พิมพ์ที่เลือก ({printSel.size})</button>
          </div>
        </>
      )}
    </div>
  );

  // การ์ดวัตถุดิบต่อ 1 ใบสั่งผลิต (ใช้ทั้งโหมด "ตามใบสั่งผลิต" และ "ตามกลุ่ม")
  const renderMoSection = (g: typeof moGroups[number]) => (
    <div key={g.mo_no} className="border border-slate-200 rounded-xl overflow-hidden">
      <button type="button" onClick={() => onOpenMo?.(g.mo_id)} title="คลิกเปิดใบสั่งผลิต"
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-blue-50 border-b border-slate-100 text-left">
        <Thumb url={g.product_image} size="md" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-800 truncate">{g.product_label}</div>
          <div className="text-[11px] text-slate-400 font-mono">{g.mo_no} · {g.lines.length} วัตถุดิบ</div>
        </div>
        <span className="text-[11px] text-blue-600 shrink-0">เปิด →</span>
      </button>
      <div className="grid grid-cols-[1.6fr_5rem_4rem_7rem_5rem] gap-2 px-3 py-1.5 bg-slate-100/60 text-[11px] font-semibold text-slate-500">
        <span>วัตถุดิบ</span><span className="text-right">ต้องซื้อ</span><span>หน่วย</span><span className="text-center">จำนวนที่มี</span><span className="text-center">เตรียมแล้ว</span>
      </div>
      <div className="divide-y divide-slate-50">
        {g.lines.map((l) => {
          const sid = l.summary_id ?? "";
          const draft = drafts[sid];
          return (
            <div key={`${l.mo_no}:${l.component_sku ?? l.component_name}`} className={`grid grid-cols-[1.6fr_5rem_4rem_7rem_5rem] gap-2 px-3 py-1.5 items-center ${l.is_ready ? "bg-emerald-50/40" : ""}`}>
              <div className="flex items-center gap-2 min-w-0">
                <Thumb url={l.component_image} />
                <div className="min-w-0"><p className="text-sm text-slate-800 truncate"><code className="text-[10px] text-slate-400">{l.component_sku}</code> {l.component_name}</p>
                  {l.material_type && <p className="text-[10px] text-slate-400">{l.material_type}</p>}</div>
              </div>
              <span className="text-right text-sm font-bold text-rose-600 tabular-nums">{fmt(l.needed)}</span>
              <span className="text-xs text-slate-500">{l.uom ?? ""}</span>
              <div className="flex justify-center">
                <input type="number" min={0} disabled={!canEdit || !l.summary_id || busy === sid}
                  value={draft ?? String(l.on_hand)}
                  onChange={(e) => setDrafts((d) => ({ ...d, [sid]: e.target.value }))}
                  onBlur={(e) => void saveOnHand(l.summary_id, e.target.value, l.on_hand)}
                  className="w-24 h-7 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-300 disabled:bg-slate-50 disabled:text-slate-400" />
              </div>
              <div className="flex justify-center">
                <input type="checkbox" disabled={!canEdit || !l.summary_id || busy === sid} checked={l.is_ready}
                  onChange={(e) => void toggleReady(l.summary_id, e.target.checked)} className="w-4 h-4 accent-emerald-600" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
    {mode === "type" ? (
      <MiniTable
        rows={rows}
        rowKey={keyOf}
        columns={columns}
        searchText={(r) => `${r.component_sku ?? ""} ${r.component_name ?? ""} ${r.material_type ?? ""}`}
        searchPlaceholder="ค้นหา รหัส / ชื่อ / ประเภท"
        groupBy={(r) => r.material_type || "ไม่ระบุประเภท"}
        groupLabel="จัดกลุ่มตามประเภท"
        selectable={canEdit}
        selected={sel}
        onSelectedChange={setSel}
        title="📦 ต้องขอซื้อ/เตรียม"
        maxHeightClass="max-h-[calc(100vh-210px)]"
        emptyText="ไม่มีวัตถุดิบที่ต้องขอซื้อ/เตรียม 🎉"
        noMatchText={(q) => `ไม่พบวัตถุดิบที่ตรงกับ “${q}”`}
        actions={<div className="flex items-center gap-2">
          {modeToggle}
          {printBtn}
          {canEdit && rows.length > 0 && (
            <button onClick={() => setConfirmPrepOpen(true)} disabled={saving || sel.size === 0} title="เตรียมครบทุกใบสั่งผลิตที่ใช้วัตถุดิบที่เลือก"
              className="h-9 px-3 text-sm font-medium border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-50">✓ ทำเป็นเตรียมแล้ว ({sel.size})</button>
          )}
          {canEdit && rows.length > 0 && (
            <button onClick={() => setConfirmOpen(true)} disabled={saving || sel.size === 0}
              className="h-9 px-4 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50">{`🛒 สร้างใบขอซื้อ (${sel.size})`}</button>
          )}
        </div>}
        footnote='ติ๊กเลือก → สร้างใบขอซื้อ (แยกต่อใบสั่งผลิต) · สลับ "ตามใบสั่งผลิต" เพื่อใส่จำนวนที่มี/ติ๊กเตรียมแล้ว'
      />
    ) : (
      <div className="max-h-[calc(100vh-210px)] overflow-y-auto pr-1">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-700">📦 ต้องขอซื้อ/เตรียม <span className="text-slate-400">({moGroups.length} ใบสั่งผลิต)</span></h3>
          <div className="flex items-center gap-2">{modeToggle}{printBtn}</div>
        </div>
        {moGroups.length === 0 ? (
          <div className="text-center py-16 text-slate-300">ไม่มีวัตถุดิบที่ต้องขอซื้อ/เตรียม 🎉</div>
        ) : (
          <div className="space-y-3">
            {mode === "group" ? (() => {
              const buckets = new Map<string, typeof moGroups>();
              for (const g of moGroups) { const k = groupNameOf(g.mo_no) ?? "— ยังไม่จับกลุ่ม —"; (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(g); }
              return [...buckets.entries()].map(([gname, gs]) => (
                <div key={gname}>
                  <div className="text-xs font-bold text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-3 py-1.5 mb-2">🗂 {gname} <span className="text-violet-400 font-normal">({gs.length} ใบ)</span></div>
                  <div className="space-y-3">{gs.map(renderMoSection)}</div>
                </div>
              ));
            })() : moGroups.map(renderMoSection)}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">ใส่ &ldquo;จำนวนที่มี&rdquo; แล้วคลิกออกจากช่อง = บันทึก (sync กับบอร์ด) · ติ๊ก &ldquo;เตรียมแล้ว&rdquo; = ทำเครื่องหมายเตรียมเสร็จ · คลิกหัวใบสั่งผลิต = เปิดป๊อปอัป</p>
      </div>
    )}

    <ERPModal open={confirmPrepOpen} onClose={() => !saving && setConfirmPrepOpen(false)} size="sm" title="ยืนยันทำเป็นเตรียมแล้ว"
      footer={<>
        <button onClick={() => setConfirmPrepOpen(false)} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
        <button onClick={() => void markPreparedSelected()} disabled={saving} className="h-9 px-4 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "ยืนยัน เตรียมแล้ว"}</button>
      </>}>
      {(() => {
        const chosenRows = (rows ?? []).filter((r) => sel.has(keyOf(r)));
        const ids = chosenRows.flatMap((r) => r.mos.map((m) => m.summary_id).filter(Boolean));
        const moCnt = new Set(chosenRows.flatMap((r) => r.mos.map((m) => m.mo_no))).size;
        return (
          <div className="space-y-2 text-sm text-slate-600">
            <p>จะทำเครื่องหมาย <b>เตรียมแล้ว</b> ให้วัตถุดิบที่เลือก <b className="text-emerald-700">{chosenRows.length}</b> ชนิด</p>
            <p>กระทบ <b>{ids.length}</b> รายการ ใน <b>{moCnt}</b> ใบสั่งผลิต (ทุกใบที่ใช้วัตถุดิบนั้น)</p>
            <p className="text-[11px] text-slate-400">การ์ดบนบอร์ดจะอัปเดตความพร้อมตาม</p>
          </div>
        );
      })()}
    </ERPModal>

    <ERPModal open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)} size="md"
      title="ยืนยันสร้างใบขอซื้อ"
      footer={<>
        <button onClick={() => setConfirmOpen(false)} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
        <button onClick={() => void createPR()} disabled={saving || chosen.length === 0} className="h-9 px-4 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50">{saving ? "กำลังสร้าง…" : "ยืนยันสร้าง"}</button>
      </>}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700">วัตถุดิบ <b>{chosen.length}</b> ชนิด</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">จะออกใบขอซื้อ <b>{prCount}</b> รายการ</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">ครอบคลุม <b>{moCount}</b> ใบสั่งผลิต</span>
        </div>
        <p className="text-[11px] text-slate-400">ระบบจะแยกใบขอซื้อตามใบสั่งผลิต เพื่อให้สถานะ &ldquo;ขอแล้ว&rdquo; เด้งกลับการ์ดแต่ละใบ</p>
        <div className="border border-slate-200 rounded-lg max-h-72 overflow-y-auto divide-y divide-slate-50">
          {chosen.map((r) => (
            <div key={keyOf(r)} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <div className="flex items-center gap-2 min-w-0"><Thumb url={r.component_image} />
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 truncate"><code className="text-[10px] text-slate-400">{r.component_sku}</code> {r.component_name}</p>
                  <p className="text-[10px] text-slate-400">{r.material_type || "ไม่ระบุประเภท"} · {r.mos.length} ใบสั่งผลิต</p>
                </div>
              </div>
              <span className="text-sm font-bold text-rose-600 tabular-nums shrink-0">{fmt(r.total_remaining)} <span className="text-[11px] font-normal text-slate-400">{r.uom ?? ""}</span></span>
            </div>
          ))}
          {chosen.length === 0 && <div className="px-3 py-4 text-center text-sm text-slate-300">ยังไม่ได้เลือกวัตถุดิบ</div>}
        </div>
      </div>
    </ERPModal>
    </>
  );
}
