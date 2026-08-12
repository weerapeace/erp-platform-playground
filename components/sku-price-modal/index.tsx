"use client";

/**
 * SkuPriceModal — ของกลาง: "ใส่ราคาต้นทุนของวัตถุดิบ/สินค้า ได้จากหน้าที่กำลังทำงานอยู่"
 *
 * ปัญหาที่แก้: เจอวัตถุดิบ "ไม่มีราคา" ตอนคิดต้นทุน แล้วต้องออกจากงาน ไปเปิดหน้าสินค้า
 *              แก้ราคา แล้วค่อยกลับมาใหม่ → เสียจังหวะ และคนหน้างานมักไม่แก้
 *
 * ทำอะไร (ใช้ระบบกลางทั้งหมด ไม่มีทางลัดเฉพาะหน้า):
 *   1) ราคาต้นทุน/หน่วย (บาท) → บันทึกกลับ SKU จริง `skus_v2.standard_price`
 *      ผ่าน PATCH /api/master-v2/skus/<id> (มีสิทธิ์ระดับฟิลด์ + audit ของกลาง)
 *      → ทุกหน้าที่คิดต้นทุน (แท็บต้นทุน, แผนผู้บริหาร, รายงาน) เห็นตรงกันทันที
 *   2) ราคาต่อร้าน → ใช้ของกลาง <SkuSupplierList> (ตาราง supplier_items)
 *      ตั้งร้านหลัก ⭐ แล้ว API กลางจะ sync ราคาร้านหลักกลับ SKU ให้เอง
 *      (ร้านสกุล RMB จะลงช่อง rmb_cost — ต้นทุนที่ใช้คิดเงินเป็น "บาท" จึงต้องกรอกช่องบาทด้วย)
 *
 * ใช้ที่: แท็บ 💰 ต้นทุน (บอร์ดจ่ายงาน) · เสียบหน้าอื่นที่เจอ "ไม่มีราคา" ได้เลย
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { SkuSupplierList } from "@/components/sku-supplier-list";
import type { SkuLookupHit } from "@/app/api/skus/lookup/route";

export function SkuPriceModal({ open, skuCode, skuName, uom, onClose, onSaved }: {
  open: boolean;
  skuCode: string | null;
  skuName?: string | null;
  uom?: string | null;          // หน่วย (โชว์ต่อท้ายช่องราคา ให้รู้ว่า "ต่ออะไร")
  onClose: () => void;
  onSaved?: () => void;         // บันทึกราคาสำเร็จ → หน้าเรียกไปโหลดต้นทุนใหม่
}) {
  const toast = useToast();
  const [skuId, setSkuId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [price, setPrice] = useState("");        // ราคาต้นทุน/หน่วย (บาท) ที่กำลังกรอก
  const [savedPrice, setSavedPrice] = useState<number | null>(null);   // ค่าที่อยู่ในระบบตอนนี้
  const [rmb, setRmb] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [shopsOpen, setShopsOpen] = useState(false);   // กางส่วน "ร้านที่ซื้อ + ราคา"

  const load = useCallback(async () => {
    if (!skuCode) return;
    setLoading(true); setErr(null); setSkuId(null);
    try {
      // หา SKU จากรหัส (ของกลาง — POST เพราะรหัสจริงมี "#" เยอะ ส่งทาง URL แล้วเพี้ยน)
      const j = await apiFetch("/api/skus/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codes: [skuCode] }) }).then((r) => r.json());
      const hit = (j.data as Record<string, SkuLookupHit | null> | undefined)?.[skuCode] ?? null;
      if (!hit) { setErr(`ไม่พบรหัส "${skuCode}" ในระบบสินค้า — อาจถูกลบไปแล้ว หรือรหัสในสูตรพิมพ์ไม่ตรง`); return; }
      setSkuId(hit.id);
      // อ่านราคาต้นทุนปัจจุบันจากทะเบียนสินค้ากลาง
      const d = await apiFetch(`/api/master-v2/skus/${encodeURIComponent(hit.id)}`).then((r) => r.json());
      const row = (d.data ?? {}) as Record<string, unknown>;
      const std = row.standard_price == null ? null : Number(row.standard_price);
      setSavedPrice(std); setPrice(std && std > 0 ? String(std) : "");
      setRmb(row.rmb_cost == null ? null : Number(row.rmb_cost));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลสินค้าไม่สำเร็จ");
    } finally { setLoading(false); }
  }, [skuCode]);

  useEffect(() => { if (open) { setShopsOpen(false); void load(); } }, [open, load]);

  const savePrice = async () => {
    if (!skuId) return;
    const n = price.trim() === "" ? null : Number(price);
    if (n != null && (!isFinite(n) || n < 0)) { toast.error("ราคาต้องเป็นตัวเลขไม่ติดลบ"); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/master-v2/skus/${encodeURIComponent(skuId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ standard_price: n }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setSavedPrice(n);
      toast.success(n == null ? "ล้างราคาแล้ว" : `บันทึกราคา ฿${n.toLocaleString("th-TH")} กลับเข้าสินค้าแล้ว`);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  const dirty = (price.trim() === "" ? null : Number(price)) !== savedPrice;

  return (
    <ERPModal open={open} onClose={() => !saving && onClose()} size="lg" title="ราคาต้นทุนของวัตถุดิบ"
      footer={<>
        <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ปิด</button>
        <button onClick={() => void savePrice()} disabled={saving || loading || !skuId || !dirty}
          title={!dirty ? "ยังไม่ได้แก้ราคา" : "บันทึกกลับเข้าสินค้า (ใช้กับทุกหน้าที่คิดต้นทุน)"}
          className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {saving ? "กำลังบันทึก…" : "💾 บันทึกราคา"}
        </button>
      </>}>
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">กำลังโหลด…</div>
      ) : err ? (
        <div className="py-10 text-center">
          <div className="text-3xl mb-2">⚠️</div>
          <p className="text-sm text-slate-600">{err}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">{skuName ?? skuCode}</div>
            <div className="text-[11px] text-slate-400 font-mono">{skuCode}</div>
          </div>

          <label className="block">
            <span className="text-xs text-slate-500">ราคาต้นทุน / หน่วย (บาท){uom ? ` — ต่อ 1 ${uom}` : ""}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">฿</span>
                <input type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && dirty) void savePrice(); }}
                  autoFocus placeholder="0.00"
                  className="w-full h-11 pl-7 pr-3 text-lg text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              {savedPrice != null && savedPrice > 0 && (
                <span className="text-[11px] text-slate-400 whitespace-nowrap">ในระบบตอนนี้ ฿{savedPrice.toLocaleString("th-TH")}</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              บันทึกแล้วจะไปอยู่ที่ <b>สินค้า → Standard Price</b> → ทุกหน้าที่คิดต้นทุน (แท็บต้นทุน · แผนผู้บริหาร · รายงาน) ใช้ค่านี้เหมือนกัน
            </p>
          </label>

          {rmb != null && rmb > 0 && (
            <div className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              🇨🇳 สินค้านี้มีราคาร้านจีนอยู่ <b>¥{rmb.toLocaleString("th-TH")}</b> — ระบบคิดต้นทุนใช้ “ราคาบาท” เท่านั้น จึงต้องกรอกช่องบาทด้วย (แปลงเรตเองตามที่ตกลง)
            </div>
          )}

          {/* ร้านที่ซื้อ + ราคาต่อร้าน — ของกลางตัวเดียวกับหน้าสินค้า/หน้าสั่งซื้อ */}
          {skuId && (shopsOpen ? (
            <div>
              <SkuSupplierList skuId={skuId} onChanged={() => { void load(); onSaved?.(); }} />
              <p className="text-[11px] text-slate-400 mt-1">
                ⭐ ร้านหลัก = ระบบจะเอาราคาร้านนั้นไปใส่ให้สินค้าอัตโนมัติ (ร้านสกุล RMB จะลงช่องราคาจีน ไม่ใช่ช่องบาท)
              </p>
            </div>
          ) : (
            <button type="button" onClick={() => setShopsOpen(true)}
              className="w-full h-10 px-3 text-sm text-left text-slate-600 border border-dashed border-slate-300 rounded-lg hover:border-indigo-300 hover:text-indigo-600 flex items-center gap-2">
              🏪 ซื้อจากร้านไหน / ราคาต่อร้าน
              <span className="ml-auto text-indigo-500">เพิ่ม/แก้ร้าน ▾</span>
            </button>
          ))}
        </div>
      )}
    </ERPModal>
  );
}
