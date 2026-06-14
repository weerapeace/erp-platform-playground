"use client";

/**
 * หน้า "ขอซื้อ" — รวมวัตถุดิบที่ต้องซื้อจากทุกใบสั่งผลิต ติ๊กเลือก → สร้างใบขอซื้อ
 * สร้าง PR แยกต่อใบสั่งผลิต (source_mo_no) → สถานะ "ขอแล้ว" เด้งกลับการ์ด/ป๊อปอัปอัตโนมัติ
 * ใช้ของกลาง: MiniTable (ค้นหา/เรียง/จัดกลุ่ม/เลือก มาในตัว)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import type { PurchaseNeedRow } from "@/app/api/mo/purchase-needs/route";

const fmt = (n: number) => (Math.round(n * 10000) / 10000).toLocaleString("th-TH");
const keyOf = (r: PurchaseNeedRow) => r.component_sku ?? `nm:${r.component_name ?? ""}`;

export function PurchaseNeeds({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<PurchaseNeedRow[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setRows(null); setSel(new Set());
    try { const res = await apiFetch("/api/mo/purchase-needs"); const j = await res.json(); setRows((j.data ?? []) as PurchaseNeedRow[]); }
    catch { setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

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

  const columns = useMemo<MiniColumn<PurchaseNeedRow>[]>(() => [
    {
      key: "material", header: "วัตถุดิบ", width: "1fr",
      sortValue: (r) => r.component_name ?? "", sortLabel: "ชื่อ",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate"><code className="text-[10px] text-slate-400">{r.component_sku}</code> {r.component_name}</p>
          {r.material_type && <p className="text-[10px] text-slate-400">{r.material_type}{r.total_requested > 0 ? ` · ขอแล้ว ${fmt(r.total_requested)}` : ""}</p>}
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
      key: "mos", header: "ใบสั่งผลิตที่ต้องใช้", width: "1.5fr",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.mos.map((m) => (
            <span key={m.mo_no} title={`${m.mo_no} · ${m.product_label} · ${fmt(m.needed)} ${r.uom ?? ""}`} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{m.product_label || m.mo_no} <b>{fmt(m.needed)}</b></span>
          ))}
        </div>
      ),
    },
  ], []);

  if (rows === null) return <div className="text-center py-16 text-slate-400">กำลังโหลด…</div>;

  return (
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
      title="📦 ต้องขอซื้อ"
      maxHeightClass="max-h-[calc(100vh-210px)]"
      emptyText="ไม่มีวัตถุดิบที่ต้องขอซื้อ (ขอครบ/มีของครบแล้ว) 🎉"
      noMatchText={(q) => `ไม่พบวัตถุดิบที่ตรงกับ “${q}”`}
      actions={canEdit && rows.length > 0 ? (
        <button onClick={() => void createPR()} disabled={saving || sel.size === 0}
          className="h-9 px-4 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50">{saving ? "กำลังสร้าง…" : `🛒 สร้างใบขอซื้อ (${sel.size})`}</button>
      ) : undefined}
      footnote='ติ๊กเลือก → สร้างใบขอซื้อ (แยกต่อใบสั่งผลิต) → สถานะ "ขอแล้ว" เด้งกลับการ์ด/ป๊อปอัปอัตโนมัติ · ดูใบที่หน้า "ขอซื้อ"'
    />
  );
}
