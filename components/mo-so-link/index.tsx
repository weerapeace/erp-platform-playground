"use client";

/**
 * ของกลาง — ส่วน "ใบสั่งขาย" ในป๊อปสร้างใบสั่งผลิต (เจ้าของสั่ง 2026-11-05)
 *
 *   <MoSoLinkSection sku={code} productName={name} value={v} onChange={setV} onState={setSt} />
 *   ส่งเข้า API:  so_link: soLinkInputOf(v)   ·  ตรวจก่อนบันทึก: soLinkError(st.need, soLinkInputOf(v), st.brandName)
 *   หลังบันทึกสำเร็จ: await persistSoLinkExtras(v, st)  (จำลูกค้าประจำแบรนด์ ถ้าติ๊กไว้)
 *
 * พฤติกรรม (กติกา lib/mo-so-rule.ts):
 *   แบรนด์ลูกค้า   → ต้องเลือก "ใบที่มีอยู่" หรือ "ยังไม่มี สร้างใหม่" (ลูกค้าเติมจากลูกค้าประจำแบรนด์)
 *   แบรนด์เราเอง   → ไม่บังคับ (กดผูกเองได้)
 *   ยังไม่รู้แบรนด์ → เลือกแบรนด์ให้สินค้าได้เลยในนี้ (ใช้ API ป๊อปใส่แบรนด์ตัวเดิม /api/mo/missing-brand)
 * ข้อมูล: GET /api/mo/so-options · บริษัท /api/admin/companies · แบรนด์ /api/brands
 * ใช้ที่: components/mo-create (หน้าใบสั่งผลิต + บอร์ดจ่ายงาน)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { CustomerPicker, type CustomerPickerValue } from "@/components/pickers";
import { DateInput } from "@/components/date-input";
import { MoneyInput } from "@/components/money-input";
import type { MoSoLinkInput, SoNeed, SoOption, SoOptionsResponse } from "@/lib/mo-so-rule";

export type MoSoLinkValue = {
  /** pick = ใบที่มีอยู่ · new = สร้างใหม่ · skip = ไม่ผูก (เฉพาะแบรนด์เรา) */
  mode: "pick" | "new" | "skip";
  so_order_id: string | null; so_line_id: string | null; order_no: string | null;
  customer: CustomerPickerValue | null; company_id: string | null; company_code: string;
  po_no: string; due: string; unit_price: string;
  /** ตั้งลูกค้าที่เลือกเป็นลูกค้าประจำแบรนด์ (แบรนด์ที่ยังไม่ได้ตั้ง) */
  remember: boolean;
};
export type SoLinkState = {
  /** สินค้าที่สถานะนี้คิดให้ (กันใช้สถานะของสินค้าตัวก่อน) */
  sku: string;
  need: SoNeed | null; brandId: string | null; brandName: string | null;
  hasDefaultCustomer: boolean; loading: boolean;
  /** วันส่งลูกค้าของใบ/รายการที่เลือก — ไว้เติมกำหนดส่งใบผลิต */
  dueHint: string | null;
};

export const emptySoLink = (): MoSoLinkValue => ({
  mode: "pick", so_order_id: null, so_line_id: null, order_no: null,
  customer: null, company_id: null, company_code: "", po_no: "", due: "", unit_price: "", remember: true,
});

/** ค่าที่ส่งเข้า POST /api/mo (so_link) */
export function soLinkInputOf(v: MoSoLinkValue | null | undefined): MoSoLinkInput | null {
  if (!v || v.mode === "skip") return null;
  if (v.mode === "new") {
    return { new_so: {
      company_id: v.company_id, company_code: v.company_code || null,
      customer_id: v.customer?.id ?? null, customer_code: v.customer?.code ?? null, customer_name: v.customer?.name ?? null,
      customer_po_no: v.po_no.trim() || null, due_date: v.due || null,
      unit_price: v.unit_price.trim() === "" ? null : Number(v.unit_price),
    } };
  }
  return v.so_order_id ? { so_order_id: v.so_order_id, so_line_id: v.so_line_id } : null;
}

/** หลังสร้างใบผลิตสำเร็จ — จำลูกค้าประจำแบรนด์ (ถ้าแบรนด์ยังไม่ได้ตั้ง และผู้ใช้ติ๊กไว้) */
export async function persistSoLinkExtras(v: MoSoLinkValue, st: SoLinkState): Promise<void> {
  if (v.mode !== "new" || !v.remember || !v.customer || !st.brandId || st.hasDefaultCustomer) return;
  try {
    await apiFetch("/api/brands", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: st.brandId, default_customer_id: v.customer.id }) });
  } catch { /* จำไม่ได้ก็ไม่เป็นไร — ตั้งเองได้ที่หน้าแบรนด์ */ }
}

type Company = { id: string; company_code: string; name: string; is_default: boolean };
type BrandOpt = { id: string; name: string; is_customer_job?: boolean };

const dayText = (s: string | null) => (s ? new Date(s.slice(0, 10) + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "");
const num = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("th-TH");
const inCls = "w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
const lblCls = "text-[11px] text-slate-500";

/** รายการที่ควรผูก: รายการสินค้านี้ที่ยังเปิดผลิตไม่ครบก่อน */
const bestLine = (o: SoOption) => o.lines.find((l) => l.opened + 0.0001 < l.qty) ?? o.lines[0] ?? null;

export function MoSoLinkSection({ sku, productName, value, onChange, onState, note }: {
  sku: string;
  productName?: string | null;
  value: MoSoLinkValue;
  onChange: (v: MoSoLinkValue) => void;
  onState?: (s: SoLinkState) => void;
  /** ข้อความเสริมใต้หัวข้อ (โหมดหลายรายการ) */
  note?: string | null;
}) {
  const toast = useToast();
  const [raw, setRaw] = useState<{ sku: string; res: SoOptionsResponse } | null>(null);
  // ข้อมูลของสินค้าตัวก่อนห้ามใช้ (สลับสินค้าแล้วรอโหลดใหม่)
  const data = raw && raw.sku === sku ? raw.res : null;
  const [loading, setLoading] = useState(false);
  const [all, setAll] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [brands, setBrands] = useState<BrandOpt[]>([]);
  const [brandPick, setBrandPick] = useState("");
  const [savingBrand, setSavingBrand] = useState(false);
  const [reload, setReload] = useState(0);
  const set = (p: Partial<MoSoLinkValue>) => onChange({ ...value, ...p });

  useEffect(() => {
    void (async () => {
      try { const j = await apiFetch("/api/admin/companies").then((r) => r.json()); setCompanies((j.data ?? []) as Company[]); } catch { /* ไม่มีก็ใช้ชุดเลขกลาง */ }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!sku) { setRaw(null); return; }
    setLoading(true);
    try {
      const j = (await apiFetch(`/api/mo/so-options?sku=${encodeURIComponent(sku)}${all ? "&all=1" : ""}`).then((r) => r.json())) as SoOptionsResponse;
      setRaw(j && j.need ? { sku, res: j } : null);
    } catch { setRaw(null); }
    finally { setLoading(false); }
  }, [sku, all]);
  useEffect(() => { void load(); }, [load, reload]);

  const need = data?.need ?? null;
  const brand = data?.brand ?? null;

  // แจ้งสถานะให้ป๊อปแม่ (ใช้ตรวจก่อนบันทึก + เติมกำหนดส่ง)
  const picked = data?.orders.find((o) => o.id === value.so_order_id) ?? null;
  const pickedLine = picked?.lines.find((l) => l.id === value.so_line_id) ?? null;
  const dueHint = value.mode === "pick" ? (pickedLine?.due_date || picked?.due_date || null) : value.mode === "new" ? (value.due || null) : null;
  useEffect(() => {
    onState?.({ sku, need, brandId: brand?.brand_id ?? null, brandName: brand?.brand_name ?? null,
      hasDefaultCustomer: !!brand?.default_customer, loading: loading || !data, dueHint });
  }, [sku, need, brand, loading, dueHint, onState]);

  // ค่าตั้งต้นเมื่อรู้แบรนด์แล้ว: แบรนด์เรา = ไม่ผูก · งานลูกค้า = เลือกใบ (ถ้ามีใบเดียวที่รายการนี้ยังเปิดผลิตไม่ครบ เลือกให้)
  useEffect(() => {
    if (!data) return;
    if (data.need === "optional" && value.mode !== "skip" && !value.so_order_id && value.mode !== "new") { onChange({ ...value, mode: "skip" }); return; }
    if (data.need === "required" && value.mode === "skip") { onChange({ ...value, mode: "pick" }); return; }
    if (data.need === "required" && value.mode === "pick" && !value.so_order_id) {
      const open = data.orders.filter((o) => o.lines.some((l) => l.opened + 0.0001 < l.qty));
      if (open.length === 1) { const l = bestLine(open[0]); onChange({ ...value, so_order_id: open[0].id, so_line_id: l?.id ?? null, order_no: open[0].order_no }); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // สลับไป "สร้างใหม่" → เติมลูกค้าประจำแบรนด์ + บริษัทหลัก
  const startNew = () => {
    const def = companies.find((c) => c.is_default) ?? companies[0];
    const dc = brand?.default_customer;
    onChange({ ...value, mode: "new",
      customer: value.customer ?? (dc ? ({ id: dc.id, code: dc.code, name: dc.name } as CustomerPickerValue) : null),
      company_id: value.company_id ?? def?.id ?? null, company_code: value.company_code || def?.company_code || "" });
  };
  useEffect(() => {   // บริษัทโหลดมาทีหลัง → เติมให้ถ้ายังว่าง
    if (value.mode === "new" && !value.company_code && companies.length) {
      const def = companies.find((c) => c.is_default) ?? companies[0];
      onChange({ ...value, company_id: def.id, company_code: def.company_code });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, value.mode]);

  const loadBrands = async () => {
    if (brands.length) return;
    try { const j = await apiFetch("/api/brands").then((r) => r.json()); setBrands((j.data ?? []) as BrandOpt[]); } catch { /* */ }
  };
  useEffect(() => { if (need === "unknown_brand") void loadBrands(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [need]);

  const saveBrand = async () => {
    if (!brandPick) { toast.error("เลือกแบรนด์ก่อน"); return; }
    setSavingBrand(true);
    try {
      const r = await apiFetch("/api/mo/missing-brand", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: sku, name: productName ?? null, brand_id: brandPick }) });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "ใส่แบรนด์ไม่สำเร็จ");
      toast.success("ใส่แบรนด์ให้สินค้าแล้ว");
      setBrandPick(""); setReload((n) => n + 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ใส่แบรนด์ไม่สำเร็จ"); }
    finally { setSavingBrand(false); }
  };

  if (!sku) return null;
  if (loading && !data) return <div className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] text-slate-400">กำลังเช็กใบสั่งขาย…</div>;
  if (!data) return (
    <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
      <span className="flex-1">เช็กใบสั่งขายของสินค้านี้ไม่สำเร็จ</span>
      <button type="button" onClick={() => setReload((n) => n + 1)} className="h-7 px-2 rounded-md border border-rose-200 bg-white text-[11px]">ลองใหม่</button>
    </div>
  );

  // ── ยังไม่รู้แบรนด์ ──
  if (need === "unknown_brand") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 space-y-1.5">
        <div className="flex items-start gap-1.5 text-xs text-rose-700">
          <Icon name="warning" className="mt-0.5 shrink-0" />
          <span>สินค้านี้ยังไม่มีแบรนด์ — ใส่แบรนด์ก่อน ระบบถึงจะรู้ว่าต้องผูกใบสั่งขายไหม</span>
        </div>
        <div className="flex gap-2">
          <select value={brandPick} onChange={(e) => setBrandPick(e.target.value)} className="h-8 flex-1 px-2 text-sm border border-rose-200 bg-white rounded-lg">
            <option value="">— เลือกแบรนด์ —</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_customer_job ? " (งานลูกค้า)" : ""}</option>)}
          </select>
          <button type="button" onClick={() => void saveBrand()} disabled={savingBrand || !brandPick}
            className="h-8 px-3 text-xs font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50">
            {savingBrand ? "กำลังใส่…" : "ใส่แบรนด์"}
          </button>
        </div>
        <p className="text-[10px] text-rose-600/80">ใส่ที่ Parent SKU ของสินค้านี้ (ทุกสี/แบบในรุ่นเดียวกันได้แบรนด์นี้ด้วย)</p>
      </div>
    );
  }

  // ── แบรนด์เราเอง: ไม่บังคับ ──
  if (need === "optional" && value.mode === "skip") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <Icon name="done" className="text-emerald-600" />
        <span className="flex-1">แบรนด์ของเรา{brand ? ` (${brand.brand_name})` : ""} — ไม่ต้องมีใบสั่งขาย</span>
        <button type="button" onClick={() => set({ mode: "pick" })} className="text-[11px] text-blue-600 hover:underline">ผูกใบสั่งขาย (ไม่บังคับ)</button>
      </div>
    );
  }

  const orders = data.orders;
  const required = need === "required";
  return (
    <div className={`rounded-lg border px-3 py-2 space-y-2 ${required ? "border-blue-200 bg-blue-50/40" : "border-slate-200"}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-700">
          ใบสั่งขาย {required && <span className="text-rose-600">*</span>}
        </span>
        <span className="text-[11px] text-slate-400">
          {required ? `แบรนด์ ${brand?.brand_name ?? ""} เป็นงานลูกค้า — ต้องผูก` : "ไม่บังคับ"}
        </span>
        {!required && <button type="button" onClick={() => set({ mode: "skip", so_order_id: null, so_line_id: null, order_no: null })} className="ml-auto text-[11px] text-slate-500 hover:underline">ไม่ผูก</button>}
      </div>
      {note && <p className="text-[11px] text-slate-500">{note}</p>}

      <div className="flex gap-2">
        {([["pick", "search", "เลือกใบที่มีอยู่"], ["new", "add", "ยังไม่มี สร้างใหม่"]] as const).map(([m, icon, label]) => (
          <button key={m} type="button" onClick={() => (m === "new" ? startNew() : set({ mode: "pick" }))}
            className={`flex-1 h-8 px-2 text-xs rounded-lg border inline-flex items-center justify-center gap-1.5 ${value.mode === m ? "border-blue-500 bg-white text-blue-700 ring-1 ring-blue-500" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`}>
            <Icon name={icon} /> {label}
          </button>
        ))}
      </div>

      {value.mode === "pick" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>{data.filtered_by === "customer" ? `เฉพาะใบของ ${brand?.default_customer?.name ?? "ลูกค้าประจำแบรนด์"}` : data.filtered_by === "brand" ? "เฉพาะใบที่มีสินค้าแบรนด์นี้" : "ทุกใบที่ยังไม่ส่งครบ"} · ใบที่มีสินค้านี้ขึ้นก่อน</span>
            <label className="inline-flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> แสดงทุกใบ</label>
          </div>
          {orders.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-center text-[11px] text-slate-400">
              ยังไม่มีใบสั่งขายที่เลือกได้ — กด “ยังไม่มี สร้างใหม่”{!all ? " หรือติ๊ก “แสดงทุกใบ”" : ""}
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {orders.map((o) => {
                const on = value.so_order_id === o.id;
                const bl = bestLine(o);
                return (
                  <div key={o.id} role="button" tabIndex={0}
                    onClick={() => set({ so_order_id: o.id, so_line_id: on ? value.so_line_id : bl?.id ?? null, order_no: o.order_no })}
                    onKeyDown={(e) => { if (e.key === "Enter") set({ so_order_id: o.id, so_line_id: bl?.id ?? null, order_no: o.order_no }); }}
                    className={`rounded-lg border bg-white px-2.5 py-1.5 cursor-pointer ${on ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 hover:border-blue-300"}`}>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`h-3 w-3 shrink-0 rounded-full border ${on ? "border-blue-600 bg-blue-600" : "border-slate-300"}`} />
                      <span className="font-mono font-medium text-slate-800">{o.order_no ?? "—"}</span>
                      <span className="text-slate-400">{dayText(o.order_date)}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-500">{o.customer_name}</span>
                      {o.due_date && <span className="shrink-0 text-[10px] text-indigo-600">ส่ง {dayText(o.due_date)}</span>}
                    </div>
                    <div className="pl-5 text-[11px] text-slate-500">
                      {o.lines.length === 0
                        ? <span className="text-amber-700">ยังไม่มีสินค้านี้ในใบ → ผูกแล้วเพิ่มเป็นรายการใหม่ (ราคาใส่ทีหลัง)</span>
                        : o.lines.length === 1
                          ? <span>มีรายการนี้ {num(o.lines[0].qty)} · เปิดผลิตแล้ว {num(o.lines[0].opened)}{o.lines[0].opened + 0.0001 < o.lines[0].qty ? <b className="font-medium text-emerald-700"> · เหลือ {num(o.lines[0].qty - o.lines[0].opened)}</b> : <span className="text-amber-700"> · เปิดครบแล้ว (ใบนี้จะนับเป็นเปิดเพิ่ม)</span>}</span>
                          : on && (
                            <span className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                              {o.lines.map((l, i) => (
                                <button key={l.id} type="button" onClick={() => set({ so_line_id: l.id })}
                                  className={`rounded-md border px-1.5 py-0.5 text-[10px] ${value.so_line_id === l.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                                  รายการที่ {i + 1}: {num(l.opened)}/{num(l.qty)}{l.due_date ? ` · ส่ง ${dayText(l.due_date)}` : ""}
                                </button>
                              ))}
                            </span>
                          )}
                      {o.lines.length > 1 && !on && <span>มีรายการนี้ {o.lines.length} รายการ</span>}
                      {o.customer_po_no && <span className="ml-1 text-slate-400">· PO {o.customer_po_no}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {value.mode === "new" && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className={lblCls}>ลูกค้า <span className="text-rose-600">*</span>{brand?.default_customer ? <span className="text-slate-400"> (ลูกค้าประจำแบรนด์)</span> : null}</span>
              <div className="mt-0.5"><CustomerPicker value={value.customer} onChange={(c) => set({ customer: c })} /></div>
            </div>
            <label className="block">
              <span className={lblCls}>บริษัท (ชุดเลขเอกสาร)</span>
              <select value={value.company_code} className={inCls}
                onChange={(e) => { const c = companies.find((x) => x.company_code === e.target.value); set({ company_code: e.target.value, company_id: c?.id ?? null }); }}>
                {companies.length === 0 && <option value="">—</option>}
                {companies.map((c) => <option key={c.id} value={c.company_code}>{c.company_code} · {c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={lblCls}>เลข PO ลูกค้า <span className="text-slate-400">(ไม่บังคับ)</span></span>
              <input value={value.po_no} onChange={(e) => set({ po_no: e.target.value })} className={inCls} />
            </label>
            <div>
              <span className={lblCls}>กำหนดส่งลูกค้า</span>
              <DateInput value={value.due} onChange={(d) => set({ due: d })} className="mt-0.5" />
            </div>
            <div>
              <span className={lblCls}>ราคาต่อชิ้น <span className="text-slate-400">(ใส่ทีหลังได้)</span></span>
              <MoneyInput value={value.unit_price} onChange={(v) => set({ unit_price: v })} placeholder="ยังไม่ใส่ราคา" className={inCls} />
            </div>
          </div>
          {brand && !brand.default_customer && value.customer && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
              <input type="checkbox" checked={value.remember} onChange={(e) => set({ remember: e.target.checked })} />
              ตั้ง {value.customer.name} เป็นลูกค้าประจำแบรนด์ {brand.brand_name} (ครั้งหน้าเติมให้เลย)
            </label>
          )}
          <p className="text-[10px] text-slate-400">บันทึกแล้วได้ใบสั่งขายใหม่ 1 ใบ โดยใบผลิตนี้เป็นรายการแรก · ไม่ใส่ราคา = ติดหมายเหตุ “ยังไม่ใส่ราคา”</p>
        </div>
      )}
    </div>
  );
}
