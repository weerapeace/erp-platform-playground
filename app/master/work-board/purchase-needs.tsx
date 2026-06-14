"use client";

/**
 * หน้า "ขอซื้อ" — รวมวัตถุดิบที่ต้องซื้อจากทุกใบสั่งผลิต ติ๊กเลือก → สร้างใบขอซื้อ
 * สร้าง PR แยกต่อใบสั่งผลิต (source_mo_no) → สถานะ "ขอแล้ว" เด้งกลับการ์ด/ป๊อปอัปอัตโนมัติ
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import type { PurchaseNeedRow } from "@/app/api/mo/purchase-needs/route";

const fmt = (n: number) => (Math.round(n * 10000) / 10000).toLocaleString("th-TH");

export function PurchaseNeeds({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<PurchaseNeedRow[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const keyOf = (r: PurchaseNeedRow) => r.component_sku ?? `nm:${r.component_name ?? ""}`;

  const load = useCallback(async () => {
    setRows(null); setSel(new Set());
    try { const res = await apiFetch("/api/mo/purchase-needs"); const j = await res.json(); setRows((j.data ?? []) as PurchaseNeedRow[]); }
    catch { setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allKeys = (rows ?? []).map(keyOf);
  const allSel = allKeys.length > 0 && allKeys.every((k) => sel.has(k));

  const createPR = async () => {
    if (!rows) return;
    const chosen = rows.filter((r) => sel.has(keyOf(r)));
    if (chosen.length === 0) { toast.error("ยังไม่ได้เลือกวัตถุดิบ"); return; }
    // สร้าง item ต่อ (ใบสั่งผลิต × วัตถุดิบ) เพื่อให้สถานะกลับไปแต่ละการ์ด
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
      await load();   // โหลดใหม่ → รายการที่ขอครบแล้วหายไป + สถานะการ์ดอัปเดต
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างใบขอซื้อไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  if (rows === null) return <div className="text-center py-16 text-slate-400">กำลังโหลด…</div>;

  return (
    <div className="max-h-[calc(100vh-210px)] overflow-y-auto pr-1">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700">📦 ต้องขอซื้อ <span className="text-slate-400">({rows.length} รายการ)</span></h3>
        {canEdit && rows.length > 0 && (
          <button onClick={() => void createPR()} disabled={saving || sel.size === 0}
            className="h-9 px-4 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50">{saving ? "กำลังสร้าง…" : `🛒 สร้างใบขอซื้อ (${sel.size})`}</button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="text-center py-16 text-slate-300">ไม่มีวัตถุดิบที่ต้องขอซื้อ (ขอครบ/มีของครบแล้ว) 🎉</div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[2.5rem_1fr_6rem_5rem_1.5fr] gap-2 px-3 py-2 bg-slate-100 text-[11px] font-semibold text-slate-600">
            <span className="flex justify-center"><input type="checkbox" checked={allSel} disabled={!canEdit} onChange={() => setSel(allSel ? new Set() : new Set(allKeys))} className="w-4 h-4 accent-rose-600" /></span>
            <span>วัตถุดิบ</span><span className="text-right">รวมต้องซื้อ</span><span>หน่วย</span><span>ใบสั่งผลิตที่ต้องใช้</span>
          </div>
          <div className="divide-y divide-slate-50">
            {rows.map((r, idx) => {
              const k = keyOf(r);
              return (
                <div key={k} className={`grid grid-cols-[2.5rem_1fr_6rem_5rem_1.5fr] gap-2 px-3 py-2 items-center ${sel.has(k) ? "bg-rose-50/40" : idx % 2 ? "bg-slate-50/30" : "bg-white"}`}>
                  <span className="flex justify-center"><input type="checkbox" checked={sel.has(k)} disabled={!canEdit} onChange={() => toggle(k)} className="w-4 h-4 accent-rose-600" /></span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 truncate"><code className="text-[10px] text-slate-400">{r.component_sku}</code> {r.component_name}</p>
                    {r.material_type && <p className="text-[10px] text-slate-400">{r.material_type}{r.total_requested > 0 ? ` · ขอแล้ว ${fmt(r.total_requested)}` : ""}</p>}
                  </div>
                  <span className="text-right text-sm font-bold text-rose-600 tabular-nums">{fmt(r.total_remaining)}</span>
                  <span className="text-xs text-slate-500">{r.uom ?? ""}</span>
                  <div className="flex flex-wrap gap-1">
                    {r.mos.map((m) => (
                      <span key={m.mo_no} title={`${m.mo_no} · ${m.product_label} · ${fmt(m.needed)} ${r.uom ?? ""}`} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{m.product_label || m.mo_no} <b>{fmt(m.needed)}</b></span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-2">ติ๊กเลือก → สร้างใบขอซื้อ (แยกต่อใบสั่งผลิต) → สถานะ &ldquo;ขอแล้ว&rdquo; เด้งกลับการ์ด/ป๊อปอัปอัตโนมัติ · ดูใบที่หน้า &ldquo;ขอซื้อ&rdquo;</p>
    </div>
  );
}
