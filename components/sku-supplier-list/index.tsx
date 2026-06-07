"use client";

/**
 * SkuSupplierList — ของกลาง: รายการราคาหลายร้านต่อสินค้า (price list ของ SKU)
 *   - 1 สินค้า → หลายร้าน แต่ละร้านมีราคา + สกุลเงิน, ตั้ง "ร้านหลัก" ได้ 1 ร้าน (⭐)
 *   - เพิ่ม/แก้/ลบ/ตั้งร้านหลัก ได้ในตัว (เรียก /api/purchasing/sku-suppliers)
 *   - เพิ่มร้านใหม่ทั้งร้าน ด้วย SupplierWizard ได้เลย
 *   - onUse(row): ถ้ามี จะโชว์ปุ่ม "ใช้ร้านนี้" (เช่นในหน้าสั่งซื้อ → ดึงราคาร้านนั้นมาใช้กับใบนี้)
 *
 * ใช้ซ้ำได้: ฟอร์มแก้ไขสินค้า, ป๊อปตั้งร้านหน้าสั่งซื้อ, หน้า SKU ฯลฯ
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SupplierWizard } from "@/components/supplier-wizard";

export type SkuSupplierRow = {
  id: string; sku_id: string | null; partner_id: string | null; partner_name: string;
  partner_country: string | null; price: number | null; currency: string; is_default: boolean;
  supplier_sku: string | null; moq: number | null; note: string | null;
};
type Supplier = { id: string; name: string; currency: string };

const curLabel = (c: string) => (c === "YUAN" ? "RMB" : c);
const CURRENCIES = ["THB", "RMB"];

export function SkuSupplierList({ skuId, onUse, onChanged }: {
  skuId: string;
  onUse?: (row: SkuSupplierRow) => void;
  onChanged?: () => void;   // แจ้ง parent เมื่อ list เปลี่ยน (เผื่อ refresh ราคาตั้งต้น)
}) {
  const [rows, setRows] = useState<SkuSupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // ฟอร์มเพิ่มแถว
  const [newPartner, setNewPartner] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCur, setNewCur] = useState("THB");
  const [newDefault, setNewDefault] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch(`/api/purchasing/sku-suppliers?sku_id=${encodeURIComponent(skuId)}`).then((r) => r.json());
      if (j.error) { setErr(j.error); setRows([]); }
      else setRows(j.data as SkuSupplierRow[]);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setLoading(false); }
  }, [skuId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const f = encodeURIComponent(JSON.stringify({ is_supplier: { type: "boolean", value: "true" } }));
    apiFetch(`/api/master-v2/partners?limit=1000&filters=${f}`).then((r) => r.json())
      .then((j) => setSuppliers(((j.data ?? []) as Record<string, unknown>[]).map((p) => ({
        id: String(p.id), name: String(p.display_name || p.name_th || p.id),
        currency: String(p.default_currency || "THB"),
      }))))
      .catch(() => {});
  }, []);

  const pickPartner = (id: string) => {
    setNewPartner(id);
    const s = suppliers.find((x) => x.id === id);
    if (s) setNewCur(curLabel(s.currency) === "RMB" ? "RMB" : "THB");
  };

  const addRow = async () => {
    if (!newPartner) { setErr("เลือกร้านก่อน"); return; }
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch(`/api/purchasing/sku-suppliers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku_id: skuId, partner_id: newPartner, price: newPrice === "" ? null : Number(newPrice), currency: newCur, is_default: newDefault || rows.length === 0 }),
      });
      const j = await res.json();
      if (j.error) { setErr(j.error); return; }
      setNewPartner(""); setNewPrice(""); setNewCur("THB"); setNewDefault(false);
      await load(); onChanged?.();
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const patchRow = async (id: string, changes: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch(`/api/purchasing/sku-suppliers`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }),
      });
      const j = await res.json();
      if (j.error) { setErr(j.error); return; }
      await load(); onChanged?.();
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const delRow = async (id: string) => {
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch(`/api/purchasing/sku-suppliers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await res.json();
      if (j.error) { setErr(j.error); return; }
      await load(); onChanged?.();
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  // ร้านที่ยังไม่อยู่ในรายการ (กันเลือกซ้ำ)
  const usedIds = new Set(rows.map((r) => r.partner_id));
  const available = suppliers.filter((s) => !usedIds.has(s.id));

  const inp = "h-8 px-2 text-sm border border-slate-200 rounded-md";

  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-slate-700">🏪 ร้านที่จำหน่าย + ราคา</div>
        <span className="text-[11px] text-slate-400">{rows.length} ร้าน · ⭐ = ร้านหลัก</span>
      </div>

      {loading ? (
        <div className="py-4 text-center text-slate-400 text-sm">กำลังโหลด…</div>
      ) : rows.length === 0 ? (
        <div className="py-3 text-center text-slate-300 text-sm">ยังไม่มีร้าน — เพิ่มร้านแรกด้านล่าง</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-md px-2 py-1.5">
              <button type="button" title={r.is_default ? "ร้านหลัก" : "ตั้งเป็นร้านหลัก"}
                onClick={() => !r.is_default && void patchRow(r.id, { is_default: true })} disabled={busy}
                className={`text-base leading-none ${r.is_default ? "text-amber-400" : "text-slate-300 hover:text-amber-300"}`}>
                {r.is_default ? "★" : "☆"}
              </button>
              <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{r.partner_name}</span>
              <input type="number" step="any" defaultValue={r.price ?? ""} disabled={busy}
                onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== r.price) void patchRow(r.id, { price: v }); }}
                className={inp + " w-20 text-right"} placeholder="ราคา" />
              <select defaultValue={r.currency} disabled={busy}
                onChange={(e) => void patchRow(r.id, { currency: e.target.value })}
                className={inp + " bg-white w-[68px]"}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {onUse && (
                <button type="button" onClick={() => onUse(r)}
                  className="h-7 px-2 text-[11px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap">ใช้ร้านนี้</button>
              )}
              <button type="button" onClick={() => void delRow(r.id)} disabled={busy}
                className="text-slate-300 hover:text-red-500 text-sm">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* แถวเพิ่มร้าน */}
      <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2">
        <select value={newPartner} onChange={(e) => pickPartner(e.target.value)} className={inp + " bg-white flex-1 min-w-[140px]"}>
          <option value="">+ เลือกร้าน…</option>
          {available.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="number" step="any" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="ราคา" className={inp + " w-20 text-right"} />
        <select value={newCur} onChange={(e) => setNewCur(e.target.value)} className={inp + " bg-white w-[68px]"}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          <input type="checkbox" checked={newDefault} onChange={(e) => setNewDefault(e.target.checked)} /> ร้านหลัก
        </label>
        <button type="button" onClick={addRow} disabled={busy || !newPartner}
          className="h-8 px-3 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-40">+ เพิ่ม</button>
        <button type="button" onClick={() => setWizardOpen(true)}
          className="h-8 px-2 text-xs text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50">+ ร้านใหม่</button>
      </div>

      {err && <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">{err}</div>}

      {wizardOpen && (
        <SupplierWizard onClose={() => setWizardOpen(false)}
          onCreated={(p) => {
            setSuppliers((prev) => prev.some((x) => x.id === p.id) ? prev : [...prev, { id: p.id, name: p.name, currency: "THB" }]);
            setNewPartner(p.id); setWizardOpen(false);
          }} />
      )}
    </div>
  );
}
