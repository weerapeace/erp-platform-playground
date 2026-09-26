"use client";

/**
 * ฟอร์มใบสำคัญรับ (ใบซื้อ) — /purchasing/vouchers/<id>
 *   หัวใบ: วันที่ · ร้าน · สกุล/เรท · วิธีคิดค่าส่ง (ไม่คิด / คิว / น้ำหนัก) · เรทค่าส่ง หรือยอดจริงจากบิลขนส่ง
 *   รายการ: จำนวนรับ · ราคา/หน่วย (¥ หรือ ฿) · ราคาบาท · คิวหรือกก./ชิ้น (ค่าเริ่มต้นจาก Parent SKU) · ค่าส่งเฉลี่ย · ต้นทุนถึงมือ
 *   ตัวเลขคิดสดด้วยสูตรกลาง lib/landed-cost (ตัวเดียวกับ server) · บันทึกร่าง → ยืนยัน = ออกเลข + เขียนราคากลับ
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { MoneyInput } from "@/components/money-input";
import { HoverPreview } from "@/components/hover-image";
import { CopyButton } from "@/components/copy-button";
import { DeliveryBillPanel } from "@/components/delivery-bill-panel";
import { computeVoucher, fmtMoney, curSymbol, isForeignCurrency, type ShipMethod } from "@/lib/landed-cost";
import type { VoucherHeader, VoucherLine } from "@/lib/purchase-voucher-server";

type Detail = { header: VoucherHeader; lines: VoucherLine[] };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const SHIP_LABEL: Record<ShipMethod, string> = { none: "ไม่คิดค่าส่ง", cube: "📦 ตามคิว (CBM)", weight: "⚖️ ตามน้ำหนัก (กก.)" };
const SOURCE_BADGE: Record<string, { text: string; cls: string }> = {
  po: { text: "จากใบ PO", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  price_list: { text: "ราคาต่อร้าน", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  manual: { text: "กรอกเอง", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  none: { text: "ยังไม่มีราคา", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

export default function PurchaseVoucherFormPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const router = useRouter();
  const toast = useToast();
  const canView = usePermission("products.cost.view");
  const canEdit = usePermission("products.edit");
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // ค่าที่กำลังแก้ (ยังไม่บันทึก)
  // หัวใบ: 2 เรท (฿/คิว, ฿/กก.) · ship_method = วิธีคิดเริ่มต้นของบรรทัดที่ไม่ระบุเอง
  const [h, setH] = useState<{ voucher_date: string; fx_rate: string; ship_method: ShipMethod; ship_rate_cube: string; ship_rate_kg: string; ship_manual_total: string; note: string; carrier_id: string; carrier_name: string }>({ voucher_date: "", fx_rate: "", ship_method: "none", ship_rate_cube: "", ship_rate_kg: "", ship_manual_total: "", note: "", carrier_id: "", carrier_name: "" });
  // ร้านขนส่ง/เรทค่าส่ง จากตั้งค่ากลาง (/m/freight-carriers) — เลือกแล้วได้วิธีคิดเริ่มต้น + 2 เรททันที
  const [carriers, setCarriers] = useState<{ id: string; name: string; method: ShipMethod; rate_cube: number | null; rate_kg: number | null }[]>([]);
  useEffect(() => {
    apiFetch("/api/master-v2/freight-carriers?limit=100").then((r) => r.json()).then((j) => {
      const rows = ((j.data ?? []) as Record<string, unknown>[]).filter((c) => c.is_active !== false)
        .map((c) => {
          const method = (c.method === "weight" ? "weight" : "cube") as ShipMethod;
          const legacy = Number(c.rate_thb) || 0;
          return { id: String(c.id), name: String(c.name ?? ""), method,
            rate_cube: c.rate_cube_thb != null ? Number(c.rate_cube_thb) : method === "cube" ? legacy : null,
            rate_kg: c.rate_kg_thb != null ? Number(c.rate_kg_thb) : method === "weight" ? legacy : null };
        });
      setCarriers(rows);
    }).catch(() => setCarriers([]));
  }, []);
  // บิลค่าส่งจากแอปโอนเงินจีน (china_bills.is_shipping) — ไว้ผูกกับใบสำคัญตอนจ่ายค่าส่ง
  const [shipBills, setShipBills] = useState<{ id: string; label: string }[]>([]);
  const [payBusy, setPayBusy] = useState(false);
  const [ln, setLn] = useState<Record<string, { unit_price: string; cbm_per_unit: string; kg_per_unit: string; ship_method: "" | "cube" | "weight" }>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const applyData = useCallback((d: Detail) => {
    setData(d);
    const hd0 = d.header;
    // ข้อมูลเก่ามีเรทตัวเดียว (ship_rate) → ใส่ให้ช่องของวิธีคิดเดิม
    const rateCube = hd0.ship_rate_cube ?? (hd0.ship_method === "cube" ? hd0.ship_rate : null);
    const rateKg = hd0.ship_rate_kg ?? (hd0.ship_method === "weight" ? hd0.ship_rate : null);
    setH({ voucher_date: hd0.voucher_date, fx_rate: hd0.fx_rate == null ? "" : String(hd0.fx_rate), ship_method: hd0.ship_method, ship_rate_cube: rateCube == null ? "" : String(rateCube), ship_rate_kg: rateKg == null ? "" : String(rateKg), ship_manual_total: hd0.ship_manual_total == null ? "" : String(hd0.ship_manual_total), note: hd0.note ?? "", carrier_id: hd0.carrier_id ?? "", carrier_name: hd0.carrier_name ?? "" });
    const m: typeof ln = {};
    for (const l of d.lines) m[l.id] = { unit_price: l.unit_price == null ? "" : String(l.unit_price), cbm_per_unit: l.cbm_per_unit == null ? "" : String(l.cbm_per_unit), kg_per_unit: l.kg_per_unit == null ? "" : String(l.kg_per_unit), ship_method: l.ship_method === "cube" || l.ship_method === "weight" ? l.ship_method : "" };
    setLn(m); setDirty(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${id}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      applyData(j.data as Detail);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setLoading(false); }
  }, [id, applyData]);
  useEffect(() => { if (canView && id) void load(); }, [load, canView, id]);

  const readonly = !canEdit || (data?.header.status ?? "draft") !== "draft";
  const currency = data?.header.currency ?? "THB";
  const foreign = isForeignCurrency(currency);
  const sym = curSymbol(currency);

  // คิดสดฝั่งหน้าเว็บ (สูตรเดียวกับ server)
  const calc = useMemo(() => {
    if (!data) return null;
    return computeVoucher(
      { currency, fx_rate: h.fx_rate === "" ? null : num(h.fx_rate), ship_method: h.ship_method, ship_rate_cube: h.ship_rate_cube === "" ? null : num(h.ship_rate_cube), ship_rate_kg: h.ship_rate_kg === "" ? null : num(h.ship_rate_kg), ship_manual_total: h.ship_manual_total === "" ? null : num(h.ship_manual_total) },
      data.lines.map((l) => { const e = ln[l.id]; return { qty: l.qty, unit_price: e?.unit_price ? num(e.unit_price) : null, cbm_per_unit: e?.cbm_per_unit ? num(e.cbm_per_unit) : null, kg_per_unit: e?.kg_per_unit ? num(e.kg_per_unit) : null, ship_method: e?.ship_method || null }; }),
    );
  }, [data, h, ln, currency]);

  const setHeader = (patch: Partial<typeof h>) => { setH((p) => ({ ...p, ...patch })); setDirty(true); };
  const setLine = (lid: string, patch: Partial<{ unit_price: string; cbm_per_unit: string; kg_per_unit: string; ship_method: "" | "cube" | "weight" }>) => { setLn((p) => ({ ...p, [lid]: { ...p[lid], ...patch } })); setDirty(true); };

  const save = async (): Promise<boolean> => {
    if (!data) return false;
    setSaving(true);
    try {
      const body = {
        header: {
          voucher_date: h.voucher_date, fx_rate: h.fx_rate === "" ? null : num(h.fx_rate), ship_method: h.ship_method,
          ship_rate_cube: h.ship_rate_cube === "" ? null : num(h.ship_rate_cube), ship_rate_kg: h.ship_rate_kg === "" ? null : num(h.ship_rate_kg),
          // เรทเดิมตัวเดียว = เรทของวิธีคิดเริ่มต้น (ให้ของเก่าที่ยังอ่านช่องนี้ใช้ได้)
          ship_rate: h.ship_method === "cube" ? (h.ship_rate_cube === "" ? null : num(h.ship_rate_cube)) : h.ship_method === "weight" ? (h.ship_rate_kg === "" ? null : num(h.ship_rate_kg)) : null,
          ship_manual_total: h.ship_manual_total === "" ? null : num(h.ship_manual_total), note: h.note || null, carrier_id: h.carrier_id || null, carrier_name: h.carrier_name || null,
        },
        lines: data.lines.map((l) => { const e = ln[l.id]; return { id: l.id, unit_price: e?.unit_price === "" ? null : num(e?.unit_price), cbm_per_unit: e?.cbm_per_unit === "" ? null : num(e?.cbm_per_unit), kg_per_unit: e?.kg_per_unit === "" ? null : num(e?.kg_per_unit), ship_method: e?.ship_method || null }; }),
      };
      const res = await apiFetch(`/api/purchasing/vouchers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      applyData(j.data as Detail);
      return true;
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); return false; }
    finally { setSaving(false); }
  };

  const confirm = async () => {
    setConfirming(true);
    try {
      if (dirty && !(await save())) return;
      const res = await apiFetch(`/api/purchasing/vouchers/${id}/confirm`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(`ยืนยันแล้ว — เลขที่ ${j.pv_no}${j.failed ? ` (เขียนราคากลับไม่สำเร็จ ${j.failed} รายการ ดูในประวัติ)` : ""}`);
      setConfirmOpen(false);
      await load();
    } catch (e) { toast.error("ยืนยันไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setConfirming(false); }
  };

  // ── การจ่ายเงิน (หลังยืนยัน) ──
  // ค่าสินค้า: มาร์คที่ใบ PO ผ่าน API กลาง mark-paid · ยอดที่จ่าย = ค่าสินค้าของใบนั้นตามราคาในใบสำคัญ (ไม่รวมค่าส่ง)
  const markPoPaid = async (po: { po_id: string; po_no: string; goods_thb: number }, paid: boolean) => {
    setPayBusy(true);
    try {
      const res = await apiFetch("/api/purchasing/mark-paid", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paid ? { id: po.po_id, paid: true, paid_date: new Date().toISOString().slice(0, 10), paid_amount_thb: po.goods_thb } : { id: po.po_id, paid: false }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(paid ? `มาร์คจ่ายค่าสินค้าแล้ว — ${po.po_no}` : `ยกเลิกจ่าย — ${po.po_no}`);
      await load();
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setPayBusy(false); }
  };
  // ค่าส่ง: เก็บที่ใบสำคัญ (+ ผูกบิลค่าส่งในแอปโอนเงินจีนได้)
  const setShippingPaid = async (paid: boolean, billId?: string | null) => {
    setPayBusy(true);
    try {
      const body = { header: { shipping_payment_status: paid ? "paid" : "unpaid", shipping_paid_date: paid ? new Date().toISOString().slice(0, 10) : null, ...(billId !== undefined ? { shipping_bill_id: billId } : {}) } };
      const res = await apiFetch(`/api/purchasing/vouchers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      applyData(j.data as Detail);
      toast.success(paid ? "มาร์คจ่ายค่าส่งแล้ว" : "ยกเลิกจ่ายค่าส่ง");
    } catch (e) { toast.error("บันทึกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setPayBusy(false); }
  };
  const loadShipBills = async () => {
    try {
      const res = await apiFetch("/api/master-v2/china-bills?limit=100");
      const j = await res.json();
      const rows = ((j.data ?? []) as Record<string, unknown>[]).filter((b) => b.is_shipping && b.is_active !== false)
        .map((b) => ({ id: String(b.id), label: `${b.bill_date ? formatDate(String(b.bill_date)) : "—"} · ฿${fmtMoney(Number(b.amount_thb) || 0)}${b.note ? ` · ${String(b.note).slice(0, 30)}` : ""}` }));
      setShipBills(rows);
    } catch { setShipBills([]); }
  };

  const cancelDraft = async () => {
    try {
      const res = await apiFetch(`/api/purchasing/vouchers/${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success("ยกเลิกใบร่างแล้ว ใบรับกลับไปรอออกใบสำคัญ");
      router.push("/purchasing/vouchers");
    } catch (e) { toast.error("ยกเลิกไม่สำเร็จ: " + String((e as Error).message ?? e)); }
  };

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ดูราคาต้นทุน (products.cost.view)" /></PlaygroundShell>;

  const hd = data?.header;
  const grIds = [...new Set((data?.lines ?? []).map((l) => l.gr_id ?? "").filter(Boolean))];
  const t = calc?.totals;
  // มีค่าส่งให้คิดไหม = ค่าเริ่มต้นของใบไม่ใช่ "ไม่คิด" หรือมีบรรทัดที่ระบุวิธีคิดเอง
  const anyShip = h.ship_method !== "none" || (data?.lines ?? []).some((l) => !!ln[l.id]?.ship_method);
  const inputCls = "h-9 px-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <PlaygroundShell>
      <div className="p-5 max-w-[1400px]">
        {loading ? <div className="py-16 text-center text-slate-400 text-sm">กำลังโหลด…</div>
        : err || !data || !hd || !calc ? <div className="py-16 text-center text-red-500 text-sm">⚠️ {err ?? "ไม่พบใบสำคัญรับ"}</div>
        : (
          <>
            {/* หัวหน้า */}
            <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
              <div>
                <button onClick={() => router.push("/purchasing/vouchers")} className="text-xs text-slate-400 hover:text-blue-600">← กลับรายการใบสำคัญรับ</button>
                <h1 className="text-xl font-semibold text-slate-800 mt-1">🧾 ใบสำคัญรับ {hd.pv_no ? <span className="font-mono">{hd.pv_no}</span> : <span className="text-slate-400 text-base">(ร่าง — ยังไม่ออกเลข)</span>}
                  {hd.status === "confirmed" && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 align-middle">✅ ยืนยันแล้ว {hd.confirmed_at ? formatDate(hd.confirmed_at) : ""} {hd.confirmed_by ? `· ${hd.confirmed_by}` : ""}</span>}
                </h1>
                <div className="text-sm text-slate-500 mt-0.5">🏪 {hd.seller_name ?? "—"} · ใบรับ {hd.gr_nos.join(", ") || "—"} · PO {hd.po_nos.join(", ") || "—"}{hd.tracking_no && <span className="ml-2 font-mono text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200" title="รหัสขนส่ง (จากใบส่งของ)">🚚 {hd.tracking_no}</span>}</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {grIds.map((gid) => {
                  const no = data.lines.find((l) => l.gr_id === gid)?.gr_no ?? gid;
                  return <a key={gid} href={`/print/goods-receipt/${gid}`} target="_blank" rel="noreferrer" className="h-9 px-3 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 inline-flex items-center">🖨 ใบรับ {no}</a>;
                })}
                <a href={`/print/purchase-voucher/${id}`} target="_blank" rel="noreferrer" className={`h-9 px-3 text-xs rounded-md border inline-flex items-center ${hd.status === "confirmed" ? "border-slate-800 bg-slate-800 text-white hover:bg-slate-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>🖨 ใบซื้อ (ใบสำคัญรับ)</a>
                {!readonly && <button onClick={() => setCancelOpen(true)} className="h-9 px-3 text-xs rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50">❌ ยกเลิกใบร่าง</button>}
                {!readonly && <button onClick={() => void save()} disabled={saving || !dirty} className="h-9 px-4 text-sm rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40">{saving ? "กำลังบันทึก…" : "💾 บันทึกร่าง"}</button>}
                {!readonly && <button onClick={() => setConfirmOpen(true)} disabled={saving} className="h-9 px-4 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">✓ ยืนยัน + ออกเลข</button>}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
              {/* ซ้าย: หัวใบ + รายการ */}
              <div className="space-y-4 min-w-0">
                <div className="bg-white border border-slate-200 rounded-xl p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs text-slate-500">วันที่ใบสำคัญ
                    <input type="date" value={h.voucher_date} disabled={readonly} onChange={(e) => setHeader({ voucher_date: e.target.value })} className={`${inputCls} w-full mt-1`} />
                  </label>
                  <div className="text-xs text-slate-500">สกุลราคาสินค้า
                    <div className="h-9 mt-1 flex items-center text-sm text-slate-800 font-medium">{sym} {currency === "YUAN" ? "RMB" : currency}<span className="text-[11px] text-slate-400 font-normal ml-1">(ตามใบสั่งซื้อ)</span></div>
                  </div>
                  {foreign && (
                    <label className="text-xs text-slate-500">เรท ฿ ต่อ 1 {sym.trim()} <span className="text-slate-400">(ค่าเริ่มต้น = เรทวันรับของ)</span>
                      <input type="number" inputMode="decimal" step="0.001" min={0} value={h.fx_rate} disabled={readonly} onChange={(e) => setHeader({ fx_rate: e.target.value })} className={`${inputCls} w-full mt-1 tabular-nums`} placeholder="เช่น 5.18" />
                    </label>
                  )}
                  <label className="text-xs text-slate-500 sm:col-span-2 lg:col-span-1">หมายเหตุ
                    <input value={h.note} disabled={readonly} onChange={(e) => setHeader({ note: e.target.value })} className={`${inputCls} w-full mt-1`} placeholder="เลขบิลขนส่ง / ชิปเมนต์…" />
                  </label>
                </div>

                {/* ค่าส่ง */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-700">🚚 ค่าส่ง</span>
                    {/* ร้านขนส่งจากตั้งค่ากลาง — เลือกแล้วตั้งวิธีคิด + เรทให้ · เพิ่ม/แก้เรทที่เมนู ร้านขนส่ง */}
                    <select value={h.carrier_id} disabled={readonly}
                      onChange={(e) => { const c = carriers.find((x) => x.id === e.target.value); if (!c) { setHeader({ carrier_id: "", carrier_name: "" }); return; } setHeader({ carrier_id: c.id, carrier_name: c.name, ship_method: c.method, ship_rate_cube: c.rate_cube == null ? "" : String(c.rate_cube), ship_rate_kg: c.rate_kg == null ? "" : String(c.rate_kg) }); }}
                      className={`${inputCls} max-w-[18rem]`} title="ร้านขนส่ง / เรทค่าส่ง">
                      <option value="">— ร้านขนส่ง (ไม่ระบุ) —</option>
                      {carriers.map((c) => <option key={c.id} value={c.id}>{c.name} · {[c.rate_cube != null ? `฿${fmtMoney(c.rate_cube, 0)}/คิว` : null, c.rate_kg != null ? `฿${fmtMoney(c.rate_kg, 0)}/กก.` : null].filter(Boolean).join(" · ") || "ยังไม่ตั้งเรท"}</option>)}
                      {h.carrier_id && !carriers.some((c) => c.id === h.carrier_id) && <option value={h.carrier_id}>{h.carrier_name || "ร้านขนส่ง (ปิดใช้แล้ว)"}</option>}
                    </select>
                    {!readonly && <a href="/m/freight-carriers" target="_blank" rel="noreferrer" className="text-[11px] text-slate-400 hover:text-blue-600">⚙ ตั้งค่าร้านขนส่ง</a>}
                    <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                      {(["none", "cube", "weight"] as ShipMethod[]).map((m, i) => (
                        <button key={m} type="button" disabled={readonly} onClick={() => setHeader({ ship_method: m })} title="วิธีคิดเริ่มต้น — บรรทัดที่ไม่ได้ระบุเอง (จากใบส่งของ) จะใช้แบบนี้"
                          className={`h-8 px-3 ${i > 0 ? "border-l border-slate-200" : ""} ${h.ship_method === m ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"} disabled:opacity-70`}>{SHIP_LABEL[m]}</button>
                      ))}
                    </div>
                    {anyShip && (
                      <>
                        <label className="text-xs text-slate-500 flex items-center gap-1.5">฿/คิว
                          <MoneyInput value={h.ship_rate_cube} disabled={readonly} onChange={(v) => setHeader({ ship_rate_cube: v })} className={`${inputCls} w-20 text-right ${(t?.charged_cbm ?? 0) > 0 && !num(h.ship_rate_cube) ? "border-amber-300" : ""}`} />
                        </label>
                        <label className="text-xs text-slate-500 flex items-center gap-1.5">฿/กก.
                          <MoneyInput value={h.ship_rate_kg} disabled={readonly} onChange={(v) => setHeader({ ship_rate_kg: v })} className={`${inputCls} w-20 text-right ${(t?.charged_kg ?? 0) > 0 && !num(h.ship_rate_kg) ? "border-amber-300" : ""}`} />
                        </label>
                        <span className="text-xs text-slate-500">
                          {(t?.charged_cbm ?? 0) > 0 && <>{(t?.charged_cbm ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 4 })} คิว × {fmtMoney(num(h.ship_rate_cube), 0)}</>}
                          {(t?.charged_cbm ?? 0) > 0 && (t?.charged_kg ?? 0) > 0 && " + "}
                          {(t?.charged_kg ?? 0) > 0 && <>{(t?.charged_kg ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 3 })} กก. × {fmtMoney(num(h.ship_rate_kg), 0)}</>}
                          {" = "}<b className="text-slate-700">฿{fmtMoney(t?.ship_from_rate_thb)}</b>
                        </span>
                        <label className="text-xs text-slate-500 flex items-center gap-1.5 ml-2">ยอดจริงจากบิลขนส่ง (ทับ)
                          <MoneyInput value={h.ship_manual_total} disabled={readonly} onChange={(v) => setHeader({ ship_manual_total: v })} className={`${inputCls} w-28 text-right`} placeholder="ว่าง = ใช้เรท" />
                        </label>
                      </>
                    )}
                  </div>
                  <div className="mt-1.5 text-[11px] text-slate-400">แต่ละบรรทัดเลือกคิดจาก คิว หรือ น้ำหนัก ได้เอง (คอลัมน์ "คิดจาก") · อ่านใบส่งของแล้วระบบเลือกให้ตามกฎ Description (BOX = คิว, CLOTH BLOCK = น้ำหนัก) <a href="/m/freight-description-rules" target="_blank" rel="noreferrer" className="hover:text-blue-600 underline decoration-dotted">⚙ แก้กฎ</a></div>
                  {anyShip && (t?.missing_basis_count ?? 0) > 0 && (
                    <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">⚠ {t?.missing_basis_count} รายการยังไม่มีคิว/กก. ตามวิธีที่เลือก (ไม่ได้ตั้งขนาด/น้ำหนักที่ Parent SKU และยังไม่ได้อ่านจากใบส่งของ) → รายการนั้นจะไม่ได้รับค่าส่ง ใส่เองในตารางได้</div>
                  )}
                  {anyShip && (t?.missing_rate_count ?? 0) > 0 && (
                    <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">⚠ {t?.missing_rate_count} รายการมีปริมาณแต่ยังไม่มีเรทของวิธีนั้น (ใส่ ฿/คิว หรือ ฿/กก. ให้ครบ)</div>
                  )}
                </div>

                {/* ใบส่งของจากขนส่ง — AI อ่านรหัสขนส่ง + น้ำหนัก/คิวรายกล่อง → จับคู่สินค้า → ใช้ค่าจริง */}
                <DeliveryBillPanel voucherId={id} readonly={readonly}
                  lines={data.lines.map((l) => ({ id: l.id, code: l.code, item_name: l.item_name, qty: l.qty, uom: l.uom, gr_no: l.gr_no }))}
                  onApplied={load} />

                {/* รายการ */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs">
                        <tr>
                          <th className="px-2 py-2 w-12"></th>
                          <th className="text-left px-2 py-2 font-medium">สินค้า</th>
                          <th className="text-left px-2 py-2 font-medium">ใบรับ / PO</th>
                          <th className="text-right px-2 py-2 font-medium">รับจริง</th>
                          <th className="text-right px-2 py-2 font-medium">ราคา/หน่วย ({sym.trim()})</th>
                          {foreign && <th className="text-right px-2 py-2 font-medium">ราคา/หน่วย ฿</th>}
                          <th className="text-right px-2 py-2 font-medium">ค่าสินค้า ฿</th>
                          {anyShip && <th className="text-left px-2 py-2 font-medium">คิดจาก</th>}
                          {anyShip && <th className="text-right px-2 py-2 font-medium">คิว หรือ กก. /ชิ้น</th>}
                          {anyShip && <th className="text-right px-2 py-2 font-medium">ค่าส่ง ฿</th>}
                          {anyShip && <th className="text-right px-2 py-2 font-medium">ถึงมือ/ชิ้น ฿</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.lines.map((l, i) => {
                          const e = ln[l.id] ?? { unit_price: "", cbm_per_unit: "", kg_per_unit: "", ship_method: "" as const };
                          const c = calc.lines[i];
                          const src = SOURCE_BADGE[e.unit_price ? (l.price_source ?? "manual") : "none"];
                          const lineMethod = c.method;   // วิธีคิดที่ใช้จริงกับบรรทัดนี้ (ระบุเอง หรือตามใบ)
                          const basisKey = lineMethod === "weight" ? "kg_per_unit" : "cbm_per_unit";
                          const parentVal = lineMethod === "weight" ? l.parent_kg : l.parent_cbm;
                          return (
                            <tr key={l.id} className={!c.has_price ? "bg-amber-50/40" : ""}>
                              <td className="px-2 py-2">
                                <HoverPreview url={l.image_url} previewW={320}>
                                  <div className="w-10 h-10 rounded bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100">
                                    {l.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={l.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-sm">📦</span>}
                                  </div>
                                </HoverPreview>
                              </td>
                              <td className="px-2 py-2">
                                <div className="text-slate-800 flex items-center gap-1">{l.item_name.replace(/^\s*\[[^\]]*\]\s*/, "")}<CopyButton value={l.item_name.replace(/^\s*\[[^\]]*\]\s*/, "")} title="คัดลอกชื่อ" /></div>
                                <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1">{l.code || "—"}{l.code && <CopyButton value={l.code} title="คัดลอกรหัส" />}<span className={`ml-1 text-[10px] px-1 py-0.5 rounded border font-sans ${src.cls}`}>{src.text}</span></div>
                              </td>
                              <td className="px-2 py-2 text-[11px] text-slate-500 whitespace-nowrap"><div>{l.gr_no}</div><div>{l.po_no}</div></td>
                              <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap font-medium text-slate-800">{l.qty.toLocaleString()} <span className="text-xs font-normal text-slate-400">{l.uom}</span></td>
                              <td className="px-2 py-2 text-right">
                                <MoneyInput value={e.unit_price} disabled={readonly} onChange={(v) => setLine(l.id, { unit_price: v })} className={`${inputCls} w-24 text-right ${!c.has_price ? "border-amber-300" : ""}`} placeholder="0.00" />
                              </td>
                              {foreign && <td className="px-2 py-2 text-right tabular-nums text-slate-600">{c.has_price ? fmtMoney(c.unit_price_thb) : "—"}</td>}
                              <td className="px-2 py-2 text-right tabular-nums text-slate-800">{c.has_price ? fmtMoney(c.line_total_thb) : "—"}</td>
                              {anyShip && (
                                <td className="px-2 py-2 whitespace-nowrap">
                                  {/* วิธีคิดเฉพาะบรรทัด — ว่าง = ตามค่าเริ่มต้นของใบ · มาจากใบส่งของ (BOX=คิว, CLOTH BLOCK=กก.) หรือเลือกเอง */}
                                  <select value={e.ship_method} disabled={readonly} onChange={(ev) => setLine(l.id, { ship_method: ev.target.value as "" | "cube" | "weight" })}
                                    className={`${inputCls} w-28 text-xs ${e.ship_method ? "border-indigo-300 bg-indigo-50" : ""}`} title="คิดค่าส่งบรรทัดนี้จากอะไร">
                                    <option value="">ตามใบ ({h.ship_method === "cube" ? "คิว" : h.ship_method === "weight" ? "กก." : "ไม่คิด"})</option>
                                    <option value="cube">📦 คิว (M3)</option>
                                    <option value="weight">⚖️ น้ำหนัก (kg)</option>
                                  </select>
                                </td>
                              )}
                              {anyShip && (
                                <td className="px-2 py-2 text-right whitespace-nowrap">
                                  {lineMethod === "none" ? <span className="text-slate-300 text-xs">—</span> : (
                                    <>
                                      <div className="flex items-center justify-end gap-1">
                                        <input type="number" inputMode="decimal" step="any" min={0} value={e[basisKey]} disabled={readonly} onChange={(ev) => setLine(l.id, { [basisKey]: ev.target.value })}
                                          className={`${inputCls} w-24 text-right tabular-nums ${!e[basisKey] ? "border-amber-300" : ""}`} placeholder={lineMethod === "cube" ? "0.0000" : "0.000"} />
                                        <span className="text-[10px] text-slate-400 w-6">{lineMethod === "cube" ? "คิว" : "กก."}</span>
                                      </div>
                                      {parentVal != null && String(parentVal) !== e[basisKey] && !readonly && (
                                        <button onClick={() => setLine(l.id, { [basisKey]: String(parentVal) })} title="ใช้ค่าจากขนาด/น้ำหนักที่ตั้งไว้ที่ Parent SKU" className="block ml-auto text-[10px] text-indigo-600 hover:underline">ใช้ค่าตัวแม่ {parentVal}</button>
                                      )}
                                    </>
                                  )}
                                </td>
                              )}
                              {anyShip && <td className="px-2 py-2 text-right tabular-nums text-orange-700">{c.ship_alloc_thb > 0 ? fmtMoney(c.ship_alloc_thb) : <span className="text-slate-300">-</span>}</td>}
                              {anyShip && <td className="px-2 py-2 text-right tabular-nums font-medium text-slate-800">{c.has_price ? fmtMoney(c.landed_unit_thb) : "—"}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ขวา: สรุปยอด (ค่าส่งแยกบรรทัด ไม่รวมในราคาสินค้า) + การจ่ายเงิน (หลังยืนยัน) */}
              <aside className="space-y-3">
                {hd.status === "confirmed" && (
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-sm font-semibold text-slate-700 mb-2">💳 การจ่ายเงิน</div>
                    <div className="text-[11px] text-slate-400 mb-2">ยอดค่าสินค้าอ้างจากราคาในใบสำคัญนี้ · มาร์คแล้วไปขึ้นที่ใบ PO / แดชบอร์ด / กระแสเงินสด</div>
                    <div className="space-y-2">
                      {hd.po_payments.map((p) => (
                        <div key={p.po_id} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-slate-600">{p.po_no}</span>
                            <span className="tabular-nums font-medium text-slate-800">฿{fmtMoney(p.goods_thb)}{foreign ? <span className="text-[11px] text-slate-400 font-normal"> ({sym}{fmtMoney(p.goods_foreign)})</span> : null}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1">
                            {p.payment_status === "paid"
                              ? <span className="text-xs text-emerald-700">🟢 จ่ายแล้ว {p.paid_date ? formatDate(p.paid_date) : ""}{p.paid_amount_thb ? ` · ฿${fmtMoney(p.paid_amount_thb)}` : ""}</span>
                              : <span className="text-xs text-amber-700">🟡 ค่าสินค้า รอจ่าย</span>}
                            {canEdit && (p.payment_status === "paid"
                              ? <button onClick={() => void markPoPaid(p, false)} disabled={payBusy} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">↩ ยกเลิกจ่าย</button>
                              : <button onClick={() => void markPoPaid(p, true)} disabled={payBusy} className="h-7 px-2.5 text-[11px] font-medium rounded-md border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50">💰 จ่ายค่าสินค้าแล้ว</button>)}
                          </div>
                        </div>
                      ))}
                      {hd.ship_total_thb > 0 && (
                        <div className="border border-orange-200 bg-orange-50/40 rounded-lg px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-600">🚚 ค่าส่ง {hd.carrier_name ? `· ${hd.carrier_name}` : ""}</span>
                            <span className="tabular-nums font-medium text-orange-700">฿{fmtMoney(hd.ship_total_thb)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1">
                            {hd.shipping_payment_status === "paid"
                              ? <span className="text-xs text-emerald-700">🟢 จ่ายแล้ว {hd.shipping_paid_date ? formatDate(hd.shipping_paid_date) : ""}</span>
                              : <span className="text-xs text-amber-700">🟡 ค่าส่ง รอจ่าย</span>}
                            {canEdit && (hd.shipping_payment_status === "paid"
                              ? <button onClick={() => void setShippingPaid(false)} disabled={payBusy} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">↩ ยกเลิกจ่าย</button>
                              : <button onClick={() => void setShippingPaid(true)} disabled={payBusy} className="h-7 px-2.5 text-[11px] font-medium rounded-md border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50">💰 จ่ายค่าส่งแล้ว</button>)}
                          </div>
                          {canEdit && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <select value={hd.shipping_bill_id ?? ""} onFocus={() => { if (shipBills.length === 0) void loadShipBills(); }} disabled={payBusy}
                                onChange={(e) => void setShippingPaid(hd.shipping_payment_status === "paid", e.target.value || null)}
                                className={`${inputCls} h-7 text-[11px] flex-1 min-w-0`} title="ผูกบิลค่าส่งจากแอปโอนเงินจีน (บิลที่ติ๊ก ค่าส่ง)">
                                <option value="">— ผูกบิลค่าส่ง (แอปโอนเงินจีน) —</option>
                                {hd.shipping_bill_id && !shipBills.some((b) => b.id === hd.shipping_bill_id) && <option value={hd.shipping_bill_id}>บิลที่ผูกไว้</option>}
                                {shipBills.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="bg-white border border-slate-200 rounded-xl p-4 xl:sticky xl:top-4">
                  <div className="text-sm font-semibold text-slate-700 mb-2">สรุปยอด</div>
                  <dl className="text-sm space-y-1.5">
                    {foreign && <div className="flex justify-between"><dt className="text-slate-500">ค่าสินค้า ({sym.trim()})</dt><dd className="tabular-nums">{sym}{fmtMoney(t?.subtotal_foreign)}</dd></div>}
                    {foreign && <div className="flex justify-between text-xs"><dt className="text-slate-400">เรท</dt><dd className="tabular-nums text-slate-500">× {h.fx_rate || "—"}</dd></div>}
                    <div className="flex justify-between"><dt className="text-slate-500">ค่าสินค้า (฿)</dt><dd className="tabular-nums font-medium">฿{fmtMoney(t?.subtotal_thb)}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">ค่าส่ง (฿) <span className="text-[10px] text-slate-400">แยก ไม่รวมในราคาสินค้า</span></dt><dd className="tabular-nums text-orange-700">฿{fmtMoney(t?.ship_total_thb)}</dd></div>
                    {anyShip && (t?.charged_cbm ?? 0) > 0 && <div className="flex justify-between text-xs"><dt className="text-slate-400">คิดตามคิว</dt><dd className="tabular-nums text-slate-500">{(t?.charged_cbm ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 4 })} คิว × ฿{fmtMoney(num(h.ship_rate_cube), 0)}</dd></div>}
                    {anyShip && (t?.charged_kg ?? 0) > 0 && <div className="flex justify-between text-xs"><dt className="text-slate-400">คิดตามน้ำหนัก</dt><dd className="tabular-nums text-slate-500">{(t?.charged_kg ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 3 })} กก. × ฿{fmtMoney(num(h.ship_rate_kg), 0)}</dd></div>}
                    <div className="flex justify-between border-t border-slate-200 pt-2 mt-2"><dt className="text-slate-700 font-semibold">รวมทั้งสิ้น (฿)</dt><dd className="tabular-nums font-bold text-slate-900 text-base">฿{fmtMoney(t?.grand_total_thb)}</dd></div>
                  </dl>
                  {(t?.missing_price_count ?? 0) > 0 && <div className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">⚠ ยังไม่มีราคา {t?.missing_price_count} รายการ — ต้องใส่ให้ครบก่อนยืนยัน</div>}
                  {foreign && !(num(h.fx_rate) > 0) && <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">⚠ ยังไม่มีเรท — ราคาบาทจะเป็น 0</div>}
                  {dirty && !readonly && <div className="mt-3 text-[11px] text-blue-700">● มีการแก้ไขที่ยังไม่บันทึก</div>}
                  <div className="mt-3 text-[11px] text-slate-400 leading-relaxed">
                    เมื่อกดยืนยัน: ออกเลขที่ · ราคาสินค้า (ไม่รวมค่าส่ง) เขียนกลับ ใบสั่งซื้อ + ราคาต่อร้านของ SKU + ราคาบน SKU ({foreign ? "rmb_cost + standard_price" : "standard_price"}) · ลงประวัติทุกรายการ
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>

      {/* ยืนยัน */}
      {confirmOpen && data && calc && (
        <ERPModal open onClose={() => !confirming && setConfirmOpen(false)} size="sm" storageKey="pv-confirm"
          title="✓ ยืนยันใบสำคัญรับ" description={`${hd?.seller_name ?? ""} · ${data.lines.length} รายการ`}
          footer={<>
            <button onClick={() => setConfirmOpen(false)} disabled={confirming} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยังก่อน</button>
            <button onClick={() => void confirm()} disabled={confirming || (calc.totals.missing_price_count > 0)} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{confirming ? "กำลังยืนยัน…" : "ยืนยัน + ออกเลข"}</button>
          </>}>
          <div className="text-sm text-slate-700 space-y-1">
            <div className="flex justify-between"><span>ค่าสินค้า</span><b>฿{fmtMoney(calc.totals.subtotal_thb)}</b></div>
            <div className="flex justify-between"><span>ค่าส่ง (แยก)</span><b className="text-orange-700">฿{fmtMoney(calc.totals.ship_total_thb)}</b></div>
            <div className="flex justify-between border-t border-slate-100 pt-1"><span>รวม</span><b>฿{fmtMoney(calc.totals.grand_total_thb)}</b></div>
          </div>
          {calc.totals.missing_price_count > 0 && <p className="text-xs text-red-600 mt-2">ยังไม่มีราคา {calc.totals.missing_price_count} รายการ ยืนยันไม่ได้</p>}
          <p className="text-[11px] text-slate-400 mt-3">หลังยืนยัน แก้ราคาในใบนี้ไม่ได้อีก (ราคาถูกเขียนกลับระบบแล้ว) · ถ้าผิดให้ออกใบใหม่จากใบรับเดิมไม่ได้ ต้องแก้ราคาที่ใบสั่งซื้อ/สินค้าโดยตรง</p>
        </ERPModal>
      )}
      {/* ยกเลิกใบร่าง */}
      {cancelOpen && (
        <ERPModal open onClose={() => setCancelOpen(false)} size="sm" storageKey="pv-cancel"
          title="❌ ยกเลิกใบร่าง" description="ใบรับที่ผูกไว้จะกลับไปรอออกใบสำคัญใหม่"
          footer={<>
            <button onClick={() => setCancelOpen(false)} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ไม่ยกเลิก</button>
            <button onClick={() => void cancelDraft()} className="px-5 h-9 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700">ยืนยันยกเลิก</button>
          </>}>
          <p className="text-sm text-slate-600">ราคาที่กรอกในใบร่างนี้จะหายไป (ยังไม่ได้เขียนกลับระบบ)</p>
        </ERPModal>
      )}
    </PlaygroundShell>
  );
}
