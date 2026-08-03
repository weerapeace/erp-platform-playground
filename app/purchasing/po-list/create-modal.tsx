"use client";

/**
 * ป๊อป "เปิด PO ใหม่" — สร้างใบสั่งซื้อเองโดยไม่ต้องผ่านใบขอซื้อ
 * ใช้เมื่อ: ซัพขอใบ PO / ของที่ไม่ได้ผ่านตะกร้าขอซื้อ / สั่งด่วน
 *
 * ของกลางที่ใช้: ERPModal · SupplierPicker · SkuMultiPickerModal · SupplierWizard · Toast
 * บันทึกผ่าน POST /api/purchasing/po-manual (ออกเลขด้วยระบบเลขเอกสารกลาง)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { SupplierPicker } from "@/components/supplier-picker";
import { SupplierWizard } from "@/components/supplier-wizard";
import { SkuMultiPickerModal } from "@/components/sku-multi-picker";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { SkuPickerValue } from "@/components/pickers";

type Line = {
  key: string;
  item_sku_id: string | null;
  item_name: string;
  qty: string;
  uom: string;
  price: string;
};

type Supplier = { id: string; name: string; cn?: boolean };

const newKey = () => `l${Math.random().toString(36).slice(2, 9)}`;
const emptyLine = (): Line => ({ key: newKey(), item_sku_id: null, item_name: "", qty: "1", uom: "", price: "" });
const n = (s: string) => { const v = Number(s); return isFinite(v) ? v : 0; };

export function PoCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [sellerId, setSellerId] = useState("");
  const [seller, setSeller] = useState("");
  const [currency, setCurrency] = useState<"THB" | "RMB">("THB");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // โหลดร้าน — ไม่กรอง is_supplier เพราะข้อมูลจริงหลายร้านไม่ได้ติ๊กไว้ (เคยทำให้หาร้านไม่เจอ)
  useEffect(() => {
    void apiFetch("/api/master-v2/partners?limit=2000").then((r) => r.json()).then((j) => {
      const data = (j.data ?? []) as Record<string, unknown>[];
      const nm = (p: Record<string, unknown>) => String(p.name_th ?? p.display_name ?? p.code ?? "");
      const isCn = (p: Record<string, unknown>) =>
        p.is_taobao === true || /จีน|china/i.test(String(p.shop_country ?? "")) || String(p.default_currency ?? "") === "RMB";
      setSuppliers(
        data.filter((p) => p.is_active !== false)
          .map((p) => ({ id: String(p.id), name: nm(p), cn: isCn(p) }))
          .filter((s) => s.name)
          .sort((a, b) => a.name.localeCompare(b.name, "th")),
      );
    }).catch(() => {});
  }, []);

  // เลือกร้านจีน → เดาสกุลเป็น RMB ให้ (แก้เองได้)
  const pickSeller = useCallback((id: string, name: string) => {
    setSellerId(id); setSeller(name);
    const s = suppliers.find((x) => x.id === id);
    if (s?.cn) setCurrency("RMB");
  }, [suppliers]);

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => (ls.length <= 1 ? ls : ls.filter((l) => l.key !== key)));

  const addFromSkus = useCallback((skus: SkuPickerValue[]) => {
    setPickerOpen(false);
    if (skus.length === 0) return;
    setLines((ls) => {
      const kept = ls.filter((l) => l.item_name.trim() || l.item_sku_id);
      const added = skus.map((s) => ({
        key: newKey(),
        item_sku_id: s.id,
        item_name: `${s.code ? `${s.code} · ` : ""}${s.name}`,
        qty: "1",
        uom: s.uom_name ?? "",
        price: "",
      }));
      return [...kept, ...added];
    });
  }, []);

  const total = useMemo(() => lines.reduce((a, l) => a + n(l.qty) * n(l.price), 0), [lines]);
  const validLines = lines.filter((l) => l.item_name.trim() && n(l.qty) > 0);
  const canSave = !!seller.trim() && validLines.length > 0 && !saving;

  const save = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/purchasing/po-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller_name: seller.trim(),
          seller_partner_id: sellerId || null,
          currency,
          order_date: orderDate,
          expected_date: expectedDate || null,
          note: note.trim() || null,
          lines: validLines.map((l) => ({
            item_sku_id: l.item_sku_id,
            item_name: l.item_name.trim(),
            qty: n(l.qty),
            uom: l.uom.trim() || null,
            price: n(l.price),
          })),
        }),
      });
      const json = (await res.json()) as { id?: string; po_no?: string; error?: string };
      if (!res.ok || !json.id) { toast.error(json.error ?? "สร้างใบสั่งซื้อไม่สำเร็จ"); return; }
      toast.success(`เปิดใบสั่งซื้อ ${json.po_no} แล้ว`);
      onCreated(json.id);
    } catch {
      toast.error("สร้างใบสั่งซื้อไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }, [canSave, seller, sellerId, currency, orderDate, expectedDate, note, validLines, toast, onCreated]);

  const sym = currency === "RMB" ? "¥" : "฿";

  return (
    <>
      <ERPModal
        open onClose={onClose} size="lg" title="🧾 เปิดใบสั่งซื้อใหม่"
        description="สร้างเองได้เลย ไม่ต้องผ่านใบขอซื้อ — เหมาะกับเคสซัพขอใบ PO หรือสั่งด่วน"
        hasUnsavedChanges={!!seller || validLines.length > 0}
        footer={
          <div className="flex items-center justify-between w-full gap-3">
            <div className="text-sm text-slate-600">
              รวม <b className="tabular-nums text-slate-900">{sym}{total.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</b>
              <span className="text-slate-400"> · {validLines.length} รายการ</span>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm">ยกเลิก</button>
              <button onClick={() => void save()} disabled={!canSave}
                className="h-9 px-5 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40">
                {saving ? "กำลังบันทึก..." : "เปิดใบสั่งซื้อ"}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* หัวใบ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">ร้าน / ผู้จำหน่าย *</label>
              <SupplierPicker value={sellerId} suppliers={suppliers} onChange={pickSeller} onAddNew={() => setWizardOpen(true)} />
              <input
                value={seller} onChange={(e) => { setSeller(e.target.value); setSellerId(""); }}
                placeholder="หรือพิมพ์ชื่อร้านเอง (กรณียังไม่มีในทะเบียน)"
                className="mt-1.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">สกุลเงิน</label>
              <div className="flex gap-1">
                {(["THB", "RMB"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setCurrency(c)}
                    className={`h-9 px-4 text-sm rounded-md border ${currency === c ? "bg-blue-50 border-blue-300 text-blue-700 font-medium" : "bg-white border-slate-200 text-slate-500"}`}>
                    {c === "THB" ? "฿ บาท" : "¥ หยวน"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">วันที่สั่ง</label>
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">กำหนดของเข้า (ถ้ามี)</label>
              <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุ</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น สั่งด่วน / ซัพขอใบ PO"
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
            </div>
          </div>

          {/* รายการสินค้า */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-600">รายการสินค้า *</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPickerOpen(true)}
                  className="h-8 px-3 text-xs rounded-md border border-blue-200 bg-blue-50 text-blue-700 font-medium">
                  📦 เลือกจากคลังสินค้า
                </button>
                <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])}
                  className="h-8 px-3 text-xs rounded-md border border-slate-200 bg-white text-slate-600">
                  + เพิ่มบรรทัด
                </button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="hidden sm:grid grid-cols-[1fr_80px_80px_110px_100px_36px] gap-2 px-3 py-2 bg-slate-50 text-[11px] font-medium text-slate-500">
                <div>สินค้า</div><div className="text-right">จำนวน</div><div>หน่วย</div>
                <div className="text-right">ราคา/หน่วย</div><div className="text-right">รวม</div><div />
              </div>
              <div className="divide-y divide-slate-100">
                {lines.map((l) => (
                  <div key={l.key} className="grid grid-cols-2 sm:grid-cols-[1fr_80px_80px_110px_100px_36px] gap-2 px-3 py-2 items-center">
                    <input value={l.item_name} onChange={(e) => setLine(l.key, { item_name: e.target.value, item_sku_id: null })}
                      placeholder="ชื่อสินค้า"
                      className="col-span-2 sm:col-span-1 h-9 px-2 text-sm border border-slate-200 rounded-md" />
                    <input type="number" step="any" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })}
                      className="h-9 px-2 text-sm border border-slate-200 rounded-md text-right tabular-nums" />
                    <input value={l.uom} onChange={(e) => setLine(l.key, { uom: e.target.value })} placeholder="หน่วย"
                      className="h-9 px-2 text-sm border border-slate-200 rounded-md" />
                    <input type="number" step="any" value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })}
                      placeholder="0" className="h-9 px-2 text-sm border border-slate-200 rounded-md text-right tabular-nums" />
                    <div className="text-sm text-right tabular-nums text-slate-700">
                      {sym}{(n(l.qty) * n(l.price)).toLocaleString("th-TH", { maximumFractionDigits: 2 })}
                    </div>
                    <button type="button" onClick={() => removeLine(l.key)} disabled={lines.length <= 1}
                      className="h-8 w-8 rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30">🗑</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-[11px] text-slate-400 mt-1.5">
              ยังไม่ใส่ราคาก็เปิดใบได้ — เติมทีหลังได้ที่หน้าแดชบอร์ด/ปฏิทินจัดซื้อ
            </div>
          </div>
        </div>
      </ERPModal>

      {pickerOpen && (
        <SkuMultiPickerModal
          open onClose={() => setPickerOpen(false)} onConfirm={addFromSkus}
          excludeIds={lines.map((l) => l.item_sku_id).filter(Boolean) as string[]}
        />
      )}
      {wizardOpen && (
        <SupplierWizard
          onClose={() => setWizardOpen(false)}
          onCreated={(s: { id: string; name: string }) => {
            setSuppliers((arr) => [...arr, { id: s.id, name: s.name }].sort((a, b) => a.name.localeCompare(b.name, "th")));
            setSellerId(s.id); setSeller(s.name); setWizardOpen(false);
          }}
        />
      )}
    </>
  );
}
