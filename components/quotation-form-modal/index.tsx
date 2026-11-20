"use client";

/**
 * ป๊อปฟอร์มสร้าง/แก้ใบเสนอราคา (ของกลาง · แยกจากหน้า /quotations 2026-11-20 ให้หน้าพิมพ์ใบเสนอราคาเปิดแก้ได้ด้วย)
 *
 *   <QuotationFormModal open={open} quote={detailOrNull} defaultSalePerson={user?.name} actor={user?.name}
 *     onClose={() => setOpen(false)} onSaved={(id, isNew) => reload(id)} />
 *
 * - quote = null → สร้างใบใหม่ · ส่งรายละเอียดใบ → แก้ใบนั้น (แก้ได้เฉพาะใบร่าง — API ตรวจซ้ำ)
 * - บันทึกผ่าน POST /api/quotations · PATCH /api/quotations/[id] (เดิม) · ข้อมูลยังไม่บันทึก = ถามก่อนปิด (ERPModal)
 * - ใช้ที่: หน้าใบเสนอราคา (app/quotations) · หน้าพิมพ์ใบเสนอราคา (app/print/quotation/[id])
 * ของกลางที่ใช้: ERPModal · CustomerPicker · UserPicker · RecordPeekLink · DateInput · SOLineEditor · SalesTotalsPreview
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { CustomerPicker, UserPicker, RecordPeekLink } from "@/components/pickers";
import type { CustomerPickerValue, UserPickerValue } from "@/components/pickers";
import { DateInput } from "@/components/date-input";
import { SOLineEditor, SalesTotalsPreview, calculateEditorTotals, emptyLine, type EditorLine } from "@/components/sales-line-items";
import { apiFetch } from "@/lib/api";
import type { QuoteDetail, QuoteLine } from "@/app/api/quotations/route";

const addDays = (iso: string, days: number) => {
  const d = new Date(iso); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export type QuoteFormLine = QuoteLine & { image_url?: string | null; image_key?: string | null };
export type QuoteFormSource = Omit<QuoteDetail, "lines"> & { lines: QuoteFormLine[] };

type FormState = {
  customer: CustomerPickerValue | null;
  sale_person_name: string;
  quote_date: string;
  valid_until: string;
  vat_rate: number;
  vat_included: boolean;
  wht_rate: number;
  header_discount_type: "percent" | "amount";
  header_discount_value: number;
  shipping_fee: number;
  note: string;
  lines: EditorLine[];
};

const makeEmpty = (salePersonName = ""): FormState => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    customer: null, sale_person_name: salePersonName,
    quote_date: today, valid_until: addDays(today, 30),
    vat_rate: 7, vat_included: false, wht_rate: 0,
    header_discount_type: "percent", header_discount_value: 0, shipping_fee: 0,
    note: "", lines: [emptyLine()],
  };
};

/** บรรทัดใบเสนอราคา → บรรทัดของตัวแก้รายการ (ใช้ทั้งฟอร์มนี้และหน้าดูแบบอ่านอย่างเดียว) */
export const quoteLinesToEditor = (lines: QuoteFormLine[]): EditorLine[] => lines.map((l, index) => ({
  tempId: l.id ?? `${l.sku ?? "line"}-${index}`,
  product_id: l.product_id ?? null,
  sku: l.sku ?? null,
  product_name: l.product_name,
  image_url: l.image_url ?? null,
  image_key: l.image_key ?? null,
  qty: l.qty,
  unit: l.unit,
  unit_price: l.unit_price,
  discount_type: l.discount_type ?? "percent",
  discount_value: l.discount_value ?? 0,
  tax_code: l.tax_code ?? null,
  note: l.note ?? "",
}));

const formFromQuote = (q: QuoteFormSource): FormState => ({
  customer: q.customer_id ? { id: q.customer_id, code: q.customer_code, name: q.customer_name ?? "" } as CustomerPickerValue : null,
  sale_person_name: q.sale_person_name ?? "",
  quote_date: q.quote_date,
  valid_until: q.valid_until ?? addDays(q.quote_date, 30),
  vat_rate: q.vat_rate, vat_included: q.vat_included, wht_rate: q.wht_rate,
  header_discount_type: q.header_discount_type, header_discount_value: q.header_discount_value,
  shipping_fee: q.shipping_fee,
  note: q.note ?? "",
  lines: quoteLinesToEditor(q.lines),
});

export function QuotationFormModal({ open, quote, defaultSalePerson = "", actor, onClose, onSaved }: {
  open: boolean;
  /** null = สร้างใบใหม่ · ใบที่จะแก้ */
  quote: QuoteFormSource | null;
  /** เซลส์ตั้งต้นตอนสร้างใบใหม่ (ปกติ = ผู้ใช้ที่ล็อกอิน) */
  defaultSalePerson?: string;
  actor?: string | null;
  onClose: () => void;
  /** บันทึกสำเร็จ — id ใบที่บันทึก · isNew = เพิ่งสร้าง */
  onSaved: (id: string | null, isNew: boolean) => void | Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(() => makeEmpty(defaultSalePerson));
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const baseline = useRef("");
  const editingId = quote?.id ?? null;

  // เปิดป๊อปใหม่ทุกครั้ง = เริ่มจากค่าของใบนั้น (หรือฟอร์มว่าง)
  useEffect(() => {
    if (!open) return;
    const f = quote ? formFromQuote(quote) : makeEmpty(defaultSalePerson);
    setForm(f); setFormErr(null);
    baseline.current = JSON.stringify(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quote?.id]);
  const dirty = open && JSON.stringify(form) !== baseline.current;

  const previewTotals = useMemo(() => calculateEditorTotals(form.lines, {
    vatRate: form.vat_rate,
    vatIncluded: form.vat_included,
    whtRate: form.wht_rate,
    headerDiscountType: form.header_discount_type,
    headerDiscountValue: form.header_discount_value,
    shippingFee: form.shipping_fee,
  }), [form.lines, form.vat_rate, form.vat_included, form.wht_rate, form.header_discount_type, form.header_discount_value, form.shipping_fee]);

  const save = async () => {
    if (!form.customer) { setFormErr("กรุณาเลือกลูกค้า"); return; }
    if (form.lines.length === 0 || form.lines.some(l => !l.product_name.trim())) {
      setFormErr("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ"); return;
    }
    setSaving(true); setFormErr(null);
    try {
      const header = {
        customer_id: form.customer.id, customer_name: form.customer.name, customer_code: form.customer.code,
        sale_person_name: form.sale_person_name || null,
        quote_date: form.quote_date,
        valid_until: form.valid_until || null,
        vat_rate: form.vat_rate, vat_included: form.vat_included, wht_rate: form.wht_rate,
        header_discount_type: form.header_discount_type,
        header_discount_value: form.header_discount_value,
        shipping_fee: form.shipping_fee,
        note: form.note || null,
      };
      const lines = form.lines.map(l => ({
        product_id: l.product_id, sku: l.sku, product_name: l.product_name,
        qty: l.qty, unit: l.unit, unit_price: l.unit_price,
        discount_type: l.discount_type, discount_value: l.discount_value,
        tax_code: l.tax_code, note: l.note,
        image_key: l.image_key ?? null,   // รูปที่แนบเอง (ติดไปกับใบพิมพ์)
      }));
      const url = editingId ? `/api/quotations/${editingId}` : "/api/quotations";
      const method = editingId ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header, lines, actor: actor ?? undefined }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      baseline.current = JSON.stringify(form);
      const savedId = editingId ?? (json.id ? String(json.id) : null);
      await onSaved(savedId, !editingId);
    } catch (err) { setFormErr(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={() => !saving && onClose()} size="xl" hasUnsavedChanges={dirty}
      title={editingId ? `แก้ใบเสนอราคา${quote?.quote_number ? ` ${quote.quote_number}` : ""}` : "สร้างใบเสนอราคาใหม่"}
      footer={
        <>
          <button onClick={onClose} disabled={saving}
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={save} disabled={saving}
            className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "..." : "บันทึก"}
          </button>
        </>
      }>
      <div className="space-y-4">
        {formErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <span className="text-xs font-medium text-slate-600">ลูกค้า *</span>
            <div className="mt-0.5">
              <CustomerPicker value={form.customer} onChange={(v) => setForm({ ...form, customer: v })} />
            </div>
            {form.customer && (
              <RecordPeekLink
                moduleKey="partners-v2"
                recordId={form.customer.id}
                label={form.customer.code ? `${form.customer.code} - ${form.customer.name}` : form.customer.name}
              />
            )}
          </div>
          <div>
            <span className="text-xs font-medium text-slate-600">เซลส์ <span className="text-slate-400">(ผู้ใช้ระบบ — ไม่บังคับ)</span></span>
            <div className="mt-0.5">
              {/* เซลส์ = ผู้ใช้ระบบ (ของกลาง UserPicker · user_profiles) — ค่ายังเก็บเป็นชื่อเหมือนเดิม */}
              <UserPicker
                value={form.sale_person_name ? { id: "", code: null, name: form.sale_person_name } as UserPickerValue : null}
                onChange={(v: UserPickerValue | null) => setForm({ ...form, sale_person_name: v?.name ?? "" })}
              />
            </div>
            {defaultSalePerson && (
              <p className="mt-1 text-[11px] text-slate-400">
                ค่าเริ่มต้นคือ user ที่ login: {defaultSalePerson}
              </p>
            )}
          </div>
          <div>
            <span className="text-xs font-medium text-slate-600">วันที่เสนอราคา</span>
            <div className="mt-0.5">
              <DateInput value={form.quote_date} onChange={(iso) => setForm({ ...form, quote_date: iso })} />
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-600">ยืนราคาถึงวันที่ <span className="text-slate-400">(default 30 วัน)</span></span>
            <div className="mt-0.5">
              <DateInput value={form.valid_until} onChange={(iso) => setForm({ ...form, valid_until: iso })} />
            </div>
          </div>
        </div>

        <SOLineEditor lines={form.lines} onChange={(lines) => setForm({ ...form, lines })} />

        <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg sm:grid-cols-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">VAT %</span>
            <input type="number" value={form.vat_rate} onChange={e => setForm({ ...form, vat_rate: parseFloat(e.target.value) || 0 })}
              className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">รวม VAT</span>
            <div className="h-8 mt-0.5 flex items-center">
              <input type="checkbox" checked={form.vat_included} onChange={e => setForm({ ...form, vat_included: e.target.checked })}
                className="rounded border-slate-300" />
              <span className="ml-2 text-xs">{form.vat_included ? "Included" : "Excluded"}</span>
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">WHT %</span>
            <input type="number" value={form.wht_rate} onChange={e => setForm({ ...form, wht_rate: parseFloat(e.target.value) || 0 })}
              className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">ค่าจัดส่ง</span>
            <input type="number" value={form.shipping_fee} onChange={e => setForm({ ...form, shipping_fee: parseFloat(e.target.value) || 0 })}
              className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
          </label>
          <div className="block col-span-2">
            <span className="text-xs font-medium text-slate-600">ส่วนลดท้ายบิล</span>
            <div className="flex gap-1 mt-0.5">
              <input type="number" value={form.header_discount_value}
                onChange={e => setForm({ ...form, header_discount_value: parseFloat(e.target.value) || 0 })}
                className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded" />
              <select value={form.header_discount_type}
                onChange={e => setForm({ ...form, header_discount_type: e.target.value as "percent" | "amount" })}
                className="w-16 h-8 px-1 text-xs border border-slate-200 rounded bg-white">
                <option value="percent">%</option><option value="amount">฿</option>
              </select>
            </div>
          </div>
          <label className="block col-span-2">
            <span className="text-xs font-medium text-slate-600">หมายเหตุ</span>
            <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
              className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
          </label>
        </div>

        <SalesTotalsPreview result={previewTotals} />
      </div>
    </ERPModal>
  );
}
