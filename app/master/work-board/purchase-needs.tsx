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
  const [mode, setMode] = useState<"type" | "mo">("type");  // จัดกลุ่มตามประเภท / ตามใบสั่งผลิต
  const [drafts, setDrafts] = useState<Record<string, string>>({});  // จำนวนที่มี (กำลังพิมพ์) ต่อ summary_id
  const [busy, setBusy] = useState<string | null>(null);

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
    </div>
  );
  const printBtn = (
    <a href="/print/purchase-needs" target="_blank" rel="noreferrer" title="พิมพ์รายการ (มีช่องเช็ค ซื้อแล้ว/เตรียมแล้ว)"
      className="h-8 px-3 inline-flex items-center text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">🖨️ พิมพ์</a>
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
            {moGroups.map((g) => (
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
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">ใส่ &ldquo;จำนวนที่มี&rdquo; แล้วคลิกออกจากช่อง = บันทึก (sync กับบอร์ด) · ติ๊ก &ldquo;เตรียมแล้ว&rdquo; = ทำเครื่องหมายเตรียมเสร็จ · คลิกหัวใบสั่งผลิต = เปิดป๊อปอัป</p>
      </div>
    )}

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
