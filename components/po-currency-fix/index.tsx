"use client";

/**
 * PoCurrencyFixModal (ของกลาง) — ป๊อปแก้สกุลเงินของใบสั่งซื้อทั้งใบ (บาท ⇄ หยวน)
 * เจ้าของสั่ง 2026-11-05 — เปิดจากใบรับสินค้า (GrDetailModal) · ใช้ที่อื่นได้: <PoCurrencyFixModal poId onClose onDone />
 *   เลือกได้ 2 แบบ: ตัวเลขถูกแล้ว แค่ป้ายผิด (45 → ¥45) / แปลงตามเรท · ดูราคาใหม่ทุกบรรทัดก่อนกดยืนยัน
 *   ติ๊กเพิ่มได้: แก้ราคาร้านใน SKU ด้วย (ใบหน้าไม่ผิดซ้ำ) · ตั้งร้านนี้เป็นสกุลหยวน
 *   กติกา/การแปลง = lib/po-currency · บันทึก = POST /api/purchasing/po-currency (เก็บประวัติ audit)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { convertPrice, currencyName, currencySymbol, type CurrencyFixMode, type DocCurrency } from "@/lib/po-currency";

type Info = {
  po_id: string; po_no: string; seller_name: string; currency: DocCurrency; fx_rate: number | null; status: string;
  shop: { id: string; name: string; china: boolean; default_currency: DocCurrency } | null;
  lines: { id: string; item_name: string; qty: number; uom: string; price: number }[];
  rate: number | null; lock: string | null; shop_price_rows: number;
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });
const fmt2 = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PoCurrencyFixModal({ poId, onClose, onDone }: { poId: string; onClose: () => void; onDone?: () => void | Promise<void> }) {
  const toast = useToast();
  const [d, setD] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<CurrencyFixMode>("relabel");
  const [rate, setRate] = useState("");
  const [shopPrices, setShopPrices] = useState(true);
  const [shopCur, setShopCur] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch(`/api/purchasing/po-currency?po_id=${encodeURIComponent(poId)}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const info = j.data as Info;
      setD(info);
      if (info.rate) setRate(String(info.rate));
      setShopPrices(info.shop_price_rows > 0);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [poId]);
  useEffect(() => { void load(); }, [load]);

  const to: DocCurrency = d?.currency === "RMB" ? "THB" : "RMB";
  const rateN = Number(rate) || 0;
  const preview = useMemo(() => {
    if (!d) return null;
    if (mode === "convert" && !(rateN > 0)) return null;
    let before = 0, after = 0;
    const rows = d.lines.map((l) => {
      const np = convertPrice(l.price, d.currency, to, mode, rateN);
      before += l.qty * l.price; after += l.qty * np;
      return { ...l, np };
    });
    return { rows, before, after };
  }, [d, mode, rateN, to]);
  // ตั้งสกุลตั้งต้นของร้านเป็นหยวน — มีความหมายเฉพาะตอนเปลี่ยนเป็นหยวน และร้านยังตั้งเป็นบาท
  const canSetShopCur = !!d?.shop && to === "RMB" && d.shop.default_currency !== "RMB";

  const save = async () => {
    if (!d) return;
    if (mode === "convert" && !(rateN > 0)) { setFormErr("ใส่เรท (บาท ต่อ 1 หยวน) ก่อน"); return; }
    setSaving(true); setFormErr(null);
    try {
      const res = await apiFetch("/api/purchasing/po-currency", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ po_id: poId, to, mode, rate: rateN > 0 ? rateN : undefined, update_shop_prices: shopPrices && d.shop_price_rows > 0, set_shop_currency: canSetShopCur && shopCur }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      const extra = [j.data?.shop_prices_updated ? `แก้ราคาร้านใน SKU ${j.data.shop_prices_updated} แถว` : "", j.data?.shop_currency_set ? "ตั้งร้านเป็นหยวนแล้ว" : ""].filter(Boolean).join(" · ");
      toast.success(`เปลี่ยน ${d.po_no} เป็น${currencyName(to)}แล้ว${extra ? ` · ${extra}` : ""}`);
      await onDone?.();
      onClose();
    } catch (e) { setFormErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={() => !saving && onClose()} size="md" storageKey="po-currency-fix"
      title={d ? `แก้สกุลเงิน ${d.po_no}` : "แก้สกุลเงินใบสั่งซื้อ"}
      description={d ? `${d.seller_name}${d.shop?.china ? " · ร้านอยู่จีน" : ""} · ตอนนี้เป็น ${currencySymbol(d.currency)} ${currencyName(d.currency)}` : undefined}
      footer={(<>
        <button onClick={onClose} disabled={saving} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
        {d && !d.lock && (
          <button onClick={save} disabled={saving} className="px-4 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : `เปลี่ยนเป็น ${currencySymbol(to)} ${currencyName(to)}`}
          </button>
        )}
      </>)}>
      {loading ? <div className="py-8 text-center text-sm text-slate-400">กำลังโหลด…</div>
      : err || !d ? <div className="py-8 text-center text-sm text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล {err ? `(${err})` : ""} <button onClick={load} className="underline ml-1">ลองใหม่</button></div>
      : d.lock ? <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm px-3 py-3">{d.lock}</div>
      : (
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="cur-mode" checked={mode === "relabel"} onChange={() => setMode("relabel")} className="mt-1" />
              <span>ตัวเลขถูกแล้ว แค่ป้ายผิด <span className="text-slate-400">(เช่น 45 → {currencySymbol(to)}45)</span></span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="cur-mode" checked={mode === "convert"} onChange={() => setMode("convert")} className="mt-1" />
              <span>ตัวเลขเป็น{currencyName(d.currency)}จริง แปลงเป็น{currencyName(to)}ตามเรท</span>
            </label>
            {mode === "convert" && (
              <div className="pl-6 flex items-center gap-2 text-xs text-slate-500">
                เรท <input type="number" inputMode="decimal" step="any" value={rate} onChange={(e) => { setRate(e.target.value); setFormErr(null); }} className="w-24 h-8 px-2 border border-slate-200 rounded-md tabular-nums text-sm text-slate-700" /> บาท ต่อ 1 หยวน
                {d.rate ? <span className="text-slate-400">(เรทวันสั่ง {d.rate})</span> : <span className="text-amber-600">ไม่พบเรทวันสั่ง ใส่เอง</span>}
              </div>
            )}
          </div>

          {preview ? (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="max-h-56 overflow-auto divide-y divide-slate-100">
                {preview.rows.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <span className="flex-1 min-w-0 truncate text-slate-700" title={l.item_name}>{l.item_name} <span className="text-slate-400">× {fmt(l.qty)} {l.uom}</span></span>
                    <span className="tabular-nums text-slate-400 line-through">{currencySymbol(d.currency)}{fmt(l.price)}</span>
                    <span className="tabular-nums text-slate-800">→ {currencySymbol(to)}{fmt(l.np)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between px-3 py-2 bg-slate-50 text-sm font-medium">
                <span>ยอดใบ (ก่อนภาษี)</span>
                <span className="tabular-nums">{currencySymbol(d.currency)}{fmt2(preview.before)} → {currencySymbol(to)}{fmt2(preview.after)}</span>
              </div>
            </div>
          ) : <div className="text-xs text-amber-600">ใส่เรทก่อน ถึงจะเห็นราคาใหม่</div>}

          <div className="space-y-1.5">
            {d.shop_price_rows > 0 && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={shopPrices} onChange={(e) => setShopPrices(e.target.checked)} className="mt-1" />
                <span>แก้ราคาร้านใน SKU ด้วย ({d.shop_price_rows} รายการ) <span className="text-slate-400">— ขอซื้อครั้งหน้าจะไม่ผิดซ้ำ</span></span>
              </label>
            )}
            {canSetShopCur && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={shopCur} onChange={(e) => setShopCur(e.target.checked)} className="mt-1" />
                <span>ตั้งร้าน {d.shop?.name} เป็นสกุลหยวน <span className="text-slate-400">— ใบใหม่ของร้านนี้เริ่มเป็นหยวน</span></span>
              </label>
            )}
          </div>
          <p className="text-[11px] text-slate-400">แก้ตามทั้งใบสั่งซื้อ ใบขอซื้อที่ผูก และยอดใบ · เก็บประวัติว่าใครแก้ ก่อน/หลังเป็นเท่าไร</p>
          {formErr && <p className="text-sm text-red-600">{formErr}</p>}
        </div>
      )}
    </ERPModal>
  );
}
