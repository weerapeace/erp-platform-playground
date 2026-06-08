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
import { SupplierPicker } from "@/components/supplier-picker";

export type SkuSupplierRow = {
  id: string; sku_id: string | null; partner_id: string | null; partner_name: string;
  partner_country: string | null; price: number | null; currency: string; is_default: boolean;
  supplier_sku: string | null; moq: number | null; lead_time_days: number | null; note: string | null;
  price_tiers: { qty: number; price: number }[];
};
type Supplier = { id: string; name: string; currency: string };

const curLabel = (c: string) => (c === "YUAN" ? "RMB" : c);
const CURRENCIES = ["THB", "RMB"];

export function SkuSupplierList({ skuId, onUse, onChanged, defaultOpen = true, reloadSignal }: {
  skuId: string;
  onUse?: (row: SkuSupplierRow) => void;
  onChanged?: () => void;   // แจ้ง parent เมื่อ list เปลี่ยน (เผื่อ refresh ราคาตั้งต้น)
  defaultOpen?: boolean;    // false = ซ่อนไว้ก่อน โชว์ปุ่มกดเปิด
  reloadSignal?: number;    // parent bump ค่านี้ → รีโหลดรายการ (อัปเดตจำนวนร้าน)
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [rows, setRows] = useState<SkuSupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tierEdit, setTierEdit] = useState<{ id: string; tiers: { qty: number; price: number }[] } | null>(null);   // ตัวแก้ขั้นราคา
  const [histId, setHistId] = useState<string | null>(null);   // ดูประวัติราคาของแถวไหน
  const [hist, setHist] = useState<{ id: string; old_price: number | null; new_price: number | null; currency: string; changed_by_name: string | null; changed_at: string }[]>([]);

  const openHistory = async (id: string) => {
    if (histId === id) { setHistId(null); return; }
    setHistId(id); setHist([]);
    try {
      const j = await apiFetch(`/api/purchasing/sku-suppliers?history_id=${encodeURIComponent(id)}`).then((r) => r.json());
      setHist(j.data ?? []);
    } catch { /* ignore */ }
  };

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
  // parent สั่งรีโหลด (เช่นหลัง sync ร้านจากหัวรายการ) — อัปเดตจำนวนร้าน/รายการ
  useEffect(() => { if (reloadSignal !== undefined) void load(); }, [reloadSignal, load]);

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

  // ยุบไว้ก่อน — โชว์เป็นปุ่ม กดแล้วค่อยขยาย
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full h-9 px-3 text-sm text-left text-slate-600 border border-dashed border-slate-300 rounded-lg hover:border-blue-300 hover:text-blue-600 flex items-center gap-2">
        🏪 ร้านที่จำหน่าย + ราคา{loading ? "" : ` (${rows.length} ร้าน)`}
        <span className="ml-auto text-blue-500">+ เพิ่ม/เลือกร้าน ▾</span>
      </button>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-slate-700">🏪 ร้านที่จำหน่าย + ราคา</div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">{rows.length} ร้าน · ⭐ = ร้านหลัก</span>
          {!defaultOpen && <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-slate-400 hover:text-slate-600">▴ ซ่อน</button>}
        </div>
      </div>

      {loading ? (
        <div className="py-4 text-center text-slate-400 text-sm">กำลังโหลด…</div>
      ) : rows.length === 0 ? (
        <div className="py-3 text-center text-slate-300 text-sm">ยังไม่มีร้าน — เพิ่มร้านแรกด้านล่าง</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-md px-2 py-1.5">
            <div className="flex items-center gap-2">
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
            {/* บรรทัดรอง: MOQ + leadtime (แก้ได้) */}
            <div className="flex items-center gap-3 mt-1 pl-6 text-[11px] text-slate-400">
              <label className="flex items-center gap-1">MOQ
                <input type="number" step="any" defaultValue={r.moq ?? ""} disabled={busy}
                  onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== r.moq) void patchRow(r.id, { moq: v }); }}
                  className="h-6 w-16 px-1 text-right border border-slate-200 rounded" placeholder="—" /></label>
              <label className="flex items-center gap-1">ส่ง
                <input type="number" step="1" defaultValue={r.lead_time_days ?? ""} disabled={busy}
                  onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== r.lead_time_days) void patchRow(r.id, { lead_time_days: v }); }}
                  className="h-6 w-12 px-1 text-right border border-slate-200 rounded" placeholder="—" />วัน</label>
              <button type="button" onClick={() => setTierEdit(tierEdit?.id === r.id ? null : { id: r.id, tiers: r.price_tiers?.length ? [...r.price_tiers] : [{ qty: 0, price: 0 }] })}
                className="text-blue-600 hover:underline">
                ราคาขั้นบันได{r.price_tiers?.length ? ` (${r.price_tiers.length})` : ""}
              </button>
              <button type="button" onClick={() => void openHistory(r.id)} className="text-slate-500 hover:text-blue-600 hover:underline">📈 ประวัติ</button>
            </div>
            {/* ประวัติราคา */}
            {histId === r.id && (
              <div className="mt-1 pl-6 text-[11px] text-slate-500 space-y-0.5">
                {hist.length === 0 ? <div className="text-slate-300">— ยังไม่มีประวัติการเปลี่ยนราคา —</div> : hist.map((h) => (
                  <div key={h.id} className="flex items-center gap-2">
                    <span className="text-slate-400">{h.changed_at?.slice(0, 10)}</span>
                    <span>{h.old_price ?? "—"} → <b className="text-slate-700">{h.new_price ?? "—"}</b> {curLabel(h.currency)}</span>
                    {h.changed_by_name && <span className="text-slate-400">· {h.changed_by_name}</span>}
                  </div>
                ))}
              </div>
            )}
            {/* แสดงขั้นราคาแบบย่อ */}
            {r.price_tiers?.length > 0 && tierEdit?.id !== r.id && (
              <div className="mt-1 pl-6 flex flex-wrap gap-1">
                {r.price_tiers.map((t, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">≥{t.qty.toLocaleString()} → {t.price} {curLabel(r.currency)}</span>
                ))}
              </div>
            )}
            {/* ตัวแก้ขั้นราคา */}
            {tierEdit?.id === r.id && (
              <div className="mt-1.5 pl-6 space-y-1">
                {tierEdit.tiers.map((t, i) => (
                  <div key={i} className="flex items-center gap-1 text-[11px] text-slate-500">
                    ซื้อ ≥
                    <input type="number" value={t.qty || ""} onChange={(e) => setTierEdit((te) => te && { ...te, tiers: te.tiers.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) || 0 } : x) })}
                      className="h-6 w-16 px-1 text-right border border-slate-200 rounded" placeholder="จำนวน" />
                    → ราคา
                    <input type="number" step="any" value={t.price || ""} onChange={(e) => setTierEdit((te) => te && { ...te, tiers: te.tiers.map((x, j) => j === i ? { ...x, price: Number(e.target.value) || 0 } : x) })}
                      className="h-6 w-16 px-1 text-right border border-slate-200 rounded" placeholder="ราคา" />
                    {curLabel(r.currency)}
                    <button type="button" onClick={() => setTierEdit((te) => te && { ...te, tiers: te.tiers.filter((_, j) => j !== i) })} className="text-slate-300 hover:text-red-500">✕</button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-0.5">
                  <button type="button" onClick={() => setTierEdit((te) => te && { ...te, tiers: [...te.tiers, { qty: 0, price: 0 }] })} className="text-[11px] text-slate-500 hover:text-blue-600">+ เพิ่มขั้น</button>
                  <button type="button" disabled={busy} onClick={async () => { await patchRow(r.id, { price_tiers: tierEdit.tiers.filter((t) => t.qty > 0) }); setTierEdit(null); }}
                    className="h-6 px-2 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40">บันทึกขั้นราคา</button>
                  <button type="button" onClick={() => setTierEdit(null)} className="text-[11px] text-slate-400 hover:text-slate-600">ยกเลิก</button>
                </div>
              </div>
            )}
            </div>
          ))}
        </div>
      )}

      {/* แถวเพิ่มร้าน */}
      <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[150px]">
          <SupplierPicker value={newPartner} suppliers={available} placeholder="+ เลือกร้าน…"
            onChange={(id) => pickPartner(id)} onAddNew={() => setWizardOpen(true)} />
        </div>
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
