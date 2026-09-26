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
  const [h, setH] = useState<{ voucher_date: string; fx_rate: string; ship_method: ShipMethod; ship_rate: string; ship_manual_total: string; note: string }>({ voucher_date: "", fx_rate: "", ship_method: "none", ship_rate: "", ship_manual_total: "", note: "" });
  const [ln, setLn] = useState<Record<string, { unit_price: string; cbm_per_unit: string; kg_per_unit: string }>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const applyData = useCallback((d: Detail) => {
    setData(d);
    setH({ voucher_date: d.header.voucher_date, fx_rate: d.header.fx_rate == null ? "" : String(d.header.fx_rate), ship_method: d.header.ship_method, ship_rate: d.header.ship_rate == null ? "" : String(d.header.ship_rate), ship_manual_total: d.header.ship_manual_total == null ? "" : String(d.header.ship_manual_total), note: d.header.note ?? "" });
    const m: typeof ln = {};
    for (const l of d.lines) m[l.id] = { unit_price: l.unit_price == null ? "" : String(l.unit_price), cbm_per_unit: l.cbm_per_unit == null ? "" : String(l.cbm_per_unit), kg_per_unit: l.kg_per_unit == null ? "" : String(l.kg_per_unit) };
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
      { currency, fx_rate: h.fx_rate === "" ? null : num(h.fx_rate), ship_method: h.ship_method, ship_rate: h.ship_rate === "" ? null : num(h.ship_rate), ship_manual_total: h.ship_manual_total === "" ? null : num(h.ship_manual_total) },
      data.lines.map((l) => { const e = ln[l.id]; return { qty: l.qty, unit_price: e?.unit_price ? num(e.unit_price) : null, cbm_per_unit: e?.cbm_per_unit ? num(e.cbm_per_unit) : null, kg_per_unit: e?.kg_per_unit ? num(e.kg_per_unit) : null }; }),
    );
  }, [data, h, ln, currency]);

  const setHeader = (patch: Partial<typeof h>) => { setH((p) => ({ ...p, ...patch })); setDirty(true); };
  const setLine = (lid: string, patch: Partial<{ unit_price: string; cbm_per_unit: string; kg_per_unit: string }>) => { setLn((p) => ({ ...p, [lid]: { ...p[lid], ...patch } })); setDirty(true); };

  const save = async (): Promise<boolean> => {
    if (!data) return false;
    setSaving(true);
    try {
      const body = {
        header: { voucher_date: h.voucher_date, fx_rate: h.fx_rate === "" ? null : num(h.fx_rate), ship_method: h.ship_method, ship_rate: h.ship_rate === "" ? null : num(h.ship_rate), ship_manual_total: h.ship_manual_total === "" ? null : num(h.ship_manual_total), note: h.note || null },
        lines: data.lines.map((l) => { const e = ln[l.id]; return { id: l.id, unit_price: e?.unit_price === "" ? null : num(e?.unit_price), cbm_per_unit: e?.cbm_per_unit === "" ? null : num(e?.cbm_per_unit), kg_per_unit: e?.kg_per_unit === "" ? null : num(e?.kg_per_unit) }; }),
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
  const basisLabel = h.ship_method === "cube" ? "คิว/ชิ้น" : "กก./ชิ้น";
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
                <div className="text-sm text-slate-500 mt-0.5">🏪 {hd.seller_name ?? "—"} · ใบรับ {hd.gr_nos.join(", ") || "—"} · PO {hd.po_nos.join(", ") || "—"}</div>
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
                    <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                      {(["none", "cube", "weight"] as ShipMethod[]).map((m, i) => (
                        <button key={m} type="button" disabled={readonly} onClick={() => setHeader({ ship_method: m, ship_rate: h.ship_rate || (m === "cube" ? "3500" : m === "weight" ? "45" : "") })}
                          className={`h-8 px-3 ${i > 0 ? "border-l border-slate-200" : ""} ${h.ship_method === m ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"} disabled:opacity-70`}>{SHIP_LABEL[m]}</button>
                      ))}
                    </div>
                    {h.ship_method !== "none" && (
                      <>
                        <label className="text-xs text-slate-500 flex items-center gap-1.5">เรท ฿/{h.ship_method === "cube" ? "คิว" : "กก."}
                          <MoneyInput value={h.ship_rate} disabled={readonly} onChange={(v) => setHeader({ ship_rate: v })} className={`${inputCls} w-24 text-right`} />
                        </label>
                        <span className="text-xs text-slate-500">× {h.ship_method === "cube" ? `${(t?.total_cbm ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 4 })} คิว` : `${(t?.total_kg ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 3 })} กก.`} = <b className="text-slate-700">฿{fmtMoney(t?.ship_from_rate_thb)}</b></span>
                        <label className="text-xs text-slate-500 flex items-center gap-1.5 ml-2">ยอดจริงจากบิลขนส่ง (ทับ)
                          <MoneyInput value={h.ship_manual_total} disabled={readonly} onChange={(v) => setHeader({ ship_manual_total: v })} className={`${inputCls} w-28 text-right`} placeholder="ว่าง = ใช้เรท" />
                        </label>
                      </>
                    )}
                  </div>
                  {h.ship_method !== "none" && (t?.missing_basis_count ?? 0) > 0 && (
                    <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">⚠ {t?.missing_basis_count} รายการยังไม่มี{basisLabel} (ไม่ได้ตั้งขนาด/น้ำหนักที่ Parent SKU) → รายการนั้นจะไม่ได้รับค่าส่งเฉลี่ย ใส่เองในตารางได้</div>
                  )}
                </div>

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
                          {h.ship_method !== "none" && <th className="text-right px-2 py-2 font-medium">{basisLabel}</th>}
                          {h.ship_method !== "none" && <th className="text-right px-2 py-2 font-medium">ค่าส่ง ฿</th>}
                          {h.ship_method !== "none" && <th className="text-right px-2 py-2 font-medium">ถึงมือ/ชิ้น ฿</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.lines.map((l, i) => {
                          const e = ln[l.id] ?? { unit_price: "", cbm_per_unit: "", kg_per_unit: "" };
                          const c = calc.lines[i];
                          const src = SOURCE_BADGE[e.unit_price ? (l.price_source ?? "manual") : "none"];
                          const basisKey = h.ship_method === "cube" ? "cbm_per_unit" : "kg_per_unit";
                          const parentVal = h.ship_method === "cube" ? l.parent_cbm : l.parent_kg;
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
                              {h.ship_method !== "none" && (
                                <td className="px-2 py-2 text-right whitespace-nowrap">
                                  <input type="number" inputMode="decimal" step="any" min={0} value={e[basisKey]} disabled={readonly} onChange={(ev) => setLine(l.id, { [basisKey]: ev.target.value })}
                                    className={`${inputCls} w-24 text-right tabular-nums ${!e[basisKey] ? "border-amber-300" : ""}`} placeholder={h.ship_method === "cube" ? "0.0000" : "0.000"} />
                                  {parentVal != null && String(parentVal) !== e[basisKey] && !readonly && (
                                    <button onClick={() => setLine(l.id, { [basisKey]: String(parentVal) })} title="ใช้ค่าจากขนาด/น้ำหนักที่ตั้งไว้ที่ Parent SKU" className="block ml-auto text-[10px] text-indigo-600 hover:underline">ใช้ค่าตัวแม่ {parentVal}</button>
                                  )}
                                </td>
                              )}
                              {h.ship_method !== "none" && <td className="px-2 py-2 text-right tabular-nums text-orange-700">{c.ship_alloc_thb > 0 ? fmtMoney(c.ship_alloc_thb) : <span className="text-slate-300">-</span>}</td>}
                              {h.ship_method !== "none" && <td className="px-2 py-2 text-right tabular-nums font-medium text-slate-800">{c.has_price ? fmtMoney(c.landed_unit_thb) : "—"}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ขวา: สรุปยอด (ค่าส่งแยกบรรทัด ไม่รวมในราคาสินค้า) */}
              <aside className="space-y-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4 xl:sticky xl:top-4">
                  <div className="text-sm font-semibold text-slate-700 mb-2">สรุปยอด</div>
                  <dl className="text-sm space-y-1.5">
                    {foreign && <div className="flex justify-between"><dt className="text-slate-500">ค่าสินค้า ({sym.trim()})</dt><dd className="tabular-nums">{sym}{fmtMoney(t?.subtotal_foreign)}</dd></div>}
                    {foreign && <div className="flex justify-between text-xs"><dt className="text-slate-400">เรท</dt><dd className="tabular-nums text-slate-500">× {h.fx_rate || "—"}</dd></div>}
                    <div className="flex justify-between"><dt className="text-slate-500">ค่าสินค้า (฿)</dt><dd className="tabular-nums font-medium">฿{fmtMoney(t?.subtotal_thb)}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">ค่าส่ง (฿) <span className="text-[10px] text-slate-400">แยก ไม่รวมในราคาสินค้า</span></dt><dd className="tabular-nums text-orange-700">฿{fmtMoney(t?.ship_total_thb)}</dd></div>
                    {h.ship_method !== "none" && <div className="flex justify-between text-xs"><dt className="text-slate-400">{h.ship_method === "cube" ? "คิวรวม" : "น้ำหนักรวม"}</dt><dd className="tabular-nums text-slate-500">{h.ship_method === "cube" ? `${(t?.total_cbm ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 4 })} คิว` : `${(t?.total_kg ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 3 })} กก.`}</dd></div>}
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
