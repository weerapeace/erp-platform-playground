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

type SortKey = "name" | "remaining" | "type";

export function PurchaseNeeds({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<PurchaseNeedRow[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [grouped, setGrouped] = useState(true);

  const keyOf = (r: PurchaseNeedRow) => r.component_sku ?? `nm:${r.component_name ?? ""}`;

  const load = useCallback(async () => {
    setRows(null); setSel(new Set());
    try { const res = await apiFetch("/api/mo/purchase-needs"); const j = await res.json(); setRows((j.data ?? []) as PurchaseNeedRow[]); }
    catch { setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // กรองด้วยคำค้น (รหัส/ชื่อ/ประเภท) แล้วเรียงลำดับ
  const qq = q.trim().toLowerCase();
  const filtered = (rows ?? []).filter((r) => !qq
    || (r.component_sku ?? "").toLowerCase().includes(qq)
    || (r.component_name ?? "").toLowerCase().includes(qq)
    || (r.material_type ?? "").toLowerCase().includes(qq));
  const sorted = [...filtered].sort((a, b) =>
    sort === "remaining" ? b.total_remaining - a.total_remaining
    : sort === "type" ? (a.material_type ?? "").localeCompare(b.material_type ?? "", "th") || (a.component_name ?? "").localeCompare(b.component_name ?? "", "th")
    : (a.component_name ?? "").localeCompare(b.component_name ?? "", "th"));

  // จัดกลุ่มตามประเภทวัตถุดิบ (ถ้าเปิด)
  const groups: { type: string; rows: PurchaseNeedRow[] }[] = grouped
    ? Object.entries(sorted.reduce<Record<string, PurchaseNeedRow[]>>((acc, r) => {
        const t = r.material_type || "ไม่ระบุประเภท"; (acc[t] ??= []).push(r); return acc;
      }, {})).map(([type, rs]) => ({ type, rows: rs })).sort((a, b) => a.type.localeCompare(b.type, "th"))
    : [{ type: "", rows: sorted }];

  const allKeys = sorted.map(keyOf);
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

  const Row = ({ r, idx }: { r: PurchaseNeedRow; idx: number }) => {
    const k = keyOf(r);
    return (
      <div className={`grid grid-cols-[2.5rem_1fr_6rem_5rem_1.5fr] gap-2 px-3 py-2 items-center ${sel.has(k) ? "bg-rose-50/40" : idx % 2 ? "bg-slate-50/30" : "bg-white"}`}>
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
  };

  return (
    <div className="max-h-[calc(100vh-210px)] overflow-y-auto pr-1">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-700">📦 ต้องขอซื้อ <span className="text-slate-400">({sorted.length}{sorted.length !== rows.length ? `/${rows.length}` : ""} รายการ)</span></h3>
        {canEdit && rows.length > 0 && (
          <button onClick={() => void createPR()} disabled={saving || sel.size === 0}
            className="h-9 px-4 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50">{saving ? "กำลังสร้าง…" : `🛒 สร้างใบขอซื้อ (${sel.size})`}</button>
        )}
      </div>

      {rows.length > 0 && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา รหัส / ชื่อ / ประเภท"
              className="h-8 w-56 pl-7 pr-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-300" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600">
            <option value="name">เรียง: ชื่อ A→Z</option>
            <option value="remaining">เรียง: ต้องซื้อมาก→น้อย</option>
            <option value="type">เรียง: ตามประเภท</option>
          </select>
          <button onClick={() => setGrouped((g) => !g)}
            className={`h-8 px-3 text-sm rounded-lg border ${grouped ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-white border-slate-200 text-slate-500"}`}>
            {grouped ? "▦ จัดกลุ่มตามประเภท" : "▤ ไม่จัดกลุ่ม"}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-center py-16 text-slate-300">ไม่มีวัตถุดิบที่ต้องขอซื้อ (ขอครบ/มีของครบแล้ว) 🎉</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 text-slate-300">ไม่พบวัตถุดิบที่ตรงกับ &ldquo;{q}&rdquo;</div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[2.5rem_1fr_6rem_5rem_1.5fr] gap-2 px-3 py-2 bg-slate-100 text-[11px] font-semibold text-slate-600">
            <span className="flex justify-center"><input type="checkbox" checked={allSel} disabled={!canEdit} onChange={() => setSel(allSel ? new Set() : new Set(allKeys))} className="w-4 h-4 accent-rose-600" /></span>
            <span>วัตถุดิบ</span><span className="text-right">รวมต้องซื้อ</span><span>หน่วย</span><span>ใบสั่งผลิตที่ต้องใช้</span>
          </div>
          {groups.map((g, gi) => {
            const gKeys = g.rows.map(keyOf);
            const gSel = gKeys.length > 0 && gKeys.every((k) => sel.has(k));
            let offset = 0; for (let i = 0; i < gi; i++) offset += groups[i].rows.length;
            return (
              <div key={g.type || "_all"}>
                {grouped && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-y border-slate-100">
                    <input type="checkbox" checked={gSel} disabled={!canEdit} onChange={() => setSel((s) => { const n = new Set(s); if (gSel) gKeys.forEach((k) => n.delete(k)); else gKeys.forEach((k) => n.add(k)); return n; })} className="w-3.5 h-3.5 accent-rose-600" />
                    <span className="text-xs font-semibold text-slate-600">{g.type}</span>
                    <span className="text-[10px] text-slate-400">({g.rows.length})</span>
                  </div>
                )}
                <div className="divide-y divide-slate-50">
                  {g.rows.map((r, i) => <Row key={keyOf(r)} r={r} idx={offset + i} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-2">ติ๊กเลือก → สร้างใบขอซื้อ (แยกต่อใบสั่งผลิต) → สถานะ &ldquo;ขอแล้ว&rdquo; เด้งกลับการ์ด/ป๊อปอัปอัตโนมัติ · ดูใบที่หน้า &ldquo;ขอซื้อ&rdquo;</p>
    </div>
  );
}
