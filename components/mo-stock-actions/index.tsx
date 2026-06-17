"use client";

/**
 * MoStockActions — ปุ่มสต๊อกของใบสั่งผลิต (เฟส4): เบิกวัตถุดิบ (−) / รับสินค้าเสร็จ (+)
 * แยก 2 ปุ่ม แยกคลัง · self-contained (โหลดคลังหลักเอง + ป๊อปเลือกคลัง) เพื่อแตะหน้า MO น้อยสุด
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { WarehousePicker } from "@/components/pickers";
import type { WarehousePickerValue } from "@/components/pickers";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";

export function MoStockActions({ moId, moQty, actor, onDone }: {
  moId: string; moQty: number; actor?: string | null; onDone?: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"issue" | "receive" | null>(null);
  const [wh, setWh] = useState<WarehousePickerValue | null>(null);
  const [qty, setQty] = useState<string>(String(moQty ?? 0));
  const [saving, setSaving] = useState(false);

  // default คลังหลัก
  useEffect(() => {
    apiFetch("/api/master/warehouses?limit=50").then((r) => r.json())
      .then((j) => { const m = ((j.data ?? []) as WarehousePickerValue[]).find((w) => w.code === "WH-MAIN"); if (m) setWh(m); })
      .catch(() => {});
  }, []);
  useEffect(() => { setQty(String(moQty ?? 0)); }, [moQty]);

  const open = (m: "issue" | "receive") => { setMode(m); };

  const submit = async () => {
    if (!wh) { toast.error("เลือกคลังก่อน"); return; }
    setSaving(true);
    try {
      const url = mode === "issue" ? `/api/mo/${moId}/issue-materials` : `/api/mo/${moId}/receive-finished`;
      const payload = mode === "issue"
        ? { warehouse_id: wh.id, actor }
        : { warehouse_id: wh.id, qty: parseFloat(qty) || moQty, actor };
      const res = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      toast.success(mode === "issue" ? `เบิกวัตถุดิบแล้ว (${j.issued_lines} รายการ)` : "รับสินค้าเข้าสต๊อกแล้ว");
      setMode(null); onDone?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <>
      <button type="button" onClick={() => open("issue")}
        className="h-9 px-3 inline-flex items-center text-sm border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50">🧾 เบิกวัตถุดิบ</button>
      <button type="button" onClick={() => open("receive")}
        className="h-9 px-3 inline-flex items-center text-sm border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50">📥 รับเข้าสต๊อก</button>

      <ERPModal open={mode !== null} onClose={() => !saving && setMode(null)} size="sm"
        title={mode === "issue" ? "เบิกวัตถุดิบออกจากคลัง" : "รับสินค้าสำเร็จเข้าคลัง"}
        footer={<>
          <button onClick={() => setMode(null)} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "..." : "ยืนยัน"}</button>
        </>}>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {mode === "issue"
              ? "ตัดสต๊อกวัตถุดิบตามสูตร (required_qty) ออกจากคลังที่เลือก — ทำได้ครั้งเดียวต่อใบ"
              : "บวกสต๊อกสินค้าสำเร็จเข้าคลังที่เลือก — ทำได้ครั้งเดียวต่อใบ"}
          </p>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">{mode === "issue" ? "เบิกจากคลัง" : "รับเข้าคลัง"} *</span>
            <div className="mt-1"><WarehousePicker value={wh} onChange={setWh} /></div>
          </label>
          {mode === "receive" && (
            <label className="block">
              <span className="text-xs font-medium text-slate-600">จำนวนที่ผลิตได้</span>
              <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-right text-sm tabular-nums outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              <span className="mt-1 block text-[11px] text-slate-400">ค่าเริ่มต้น = จำนวนของใบสั่งผลิต ({moQty})</span>
            </label>
          )}
        </div>
      </ERPModal>
    </>
  );
}
