"use client";
/**
 * ผูก SKU ใต้รายการในใบสั่งขาย (เจ้าของสั่ง 2026-11-19 · กติกา lib/so-sku-link)
 *   - ยังไม่ผูก → กล่องแดง: SKU ในใบงาน (กดเลือก) · ค้นจาก SKU ทั้งหมด (SkuPicker กลาง) · ติ๊ก "ไม่ใช่สินค้า"
 *   - ใบงานยังไม่มี SKU → ลิงก์ "สร้าง SKU ในใบงาน" (เปิดแท็บใหม่)
 *   - ระบบเดาให้ → ป้าย "เดา" + ปุ่ม "ถูกแล้ว" · ไม่ใช่สินค้า → ป้ายเทา + ปุ่มเอาออก
 * ใช้คู่กับ SOLineEditor prop rowBelow · ข้อมูล SKU ของใบงาน = /api/so-orders/sheet-skus
 */
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { Icon } from "@/components/icon";
import type { SheetOfQuote, SheetSkuOption } from "@/app/api/so-orders/sheet-skus/route";

export type SkuLinkPick = { code: string; name: string | null; color: string | null; image_url: string | null };

export function SoSkuLinkHint({ sku, needs, guessed, nonProduct, options, emptySheets, readonly, onPick, onConfirmGuess, onNonProduct }: {
  sku: string | null;
  /** ยังต้องผูก (ไม่มีรหัส + ไม่ได้ติ๊กไม่ใช่สินค้า) */
  needs: boolean;
  guessed?: boolean;
  nonProduct?: boolean;
  /** SKU ในใบงานของใบเสนอราคาต้นทาง */
  options: SheetSkuOption[];
  /** ใบงานที่ยังไม่มี SKU */
  emptySheets: SheetOfQuote[];
  readonly?: boolean;
  onPick: (p: SkuLinkPick) => void;
  onConfirmGuess: () => void;
  onNonProduct: (v: boolean) => void;
}) {
  if (nonProduct && !sku) {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
        <span className="rounded bg-slate-100 px-1.5 py-0.5">ไม่ใช่สินค้า · ไม่ต้องผูก SKU</span>
        {!readonly && <button type="button" onClick={() => onNonProduct(false)} className="text-blue-600 hover:underline">เป็นสินค้า</button>}
      </div>
    );
  }
  if (sku && guessed) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">ระบบเดา SKU จากชื่อ/สี — ตรวจด้วย</span>
        {!readonly && <button type="button" onClick={onConfirmGuess} className="inline-flex items-center gap-0.5 text-emerald-700 hover:underline"><Icon name="done" /> ถูกแล้ว</button>}
        {!readonly && options.length > 1 && <PickChips options={options} current={sku} onPick={onPick} />}
      </div>
    );
  }
  if (!needs) return null;
  return (
    <div className="mt-1.5 space-y-1.5 rounded-lg border border-rose-200 bg-white p-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-1.5 font-medium text-rose-700">
        <Icon name="link" /> ยังไม่ผูก SKU — เลือกก่อนบันทึก
      </div>
      {options.length > 0 && !readonly && (
        <div>
          <div className="mb-1 text-slate-500">SKU ในใบงาน</div>
          <PickChips options={options} current={null} onPick={onPick} />
        </div>
      )}
      {emptySheets.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center gap-1.5 text-amber-800">
          <Icon name="warning" /> ใบงาน {s.code ?? s.name ?? ""} ยังไม่มี SKU
          <a href={`/master/design-sheets?open=${s.id}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 hover:bg-amber-100">
            สร้าง SKU ในใบงาน <Icon name="open" />
          </a>
        </div>
      ))}
      {!readonly && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[220px] flex-1">
            <SkuPicker value={null} placeholder="ค้นจาก SKU ทั้งหมด…"
              onChange={(p: SkuPickerValue | null) => p && onPick({ code: p.code, name: p.name, color: p.color ?? null, image_url: p.image_url ?? null })} />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1 text-slate-600">
            <input type="checkbox" checked={false} onChange={() => onNonProduct(true)} /> ไม่ใช่สินค้า (ค่าส่ง/ค่าบริการ)
          </label>
        </div>
      )}
    </div>
  );
}

function PickChips({ options, current, onPick }: { options: SheetSkuOption[]; current: string | null; onPick: (p: SkuLinkPick) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.slice(0, 24).map((o) => (
        <button key={o.id} type="button" onClick={() => onPick({ code: o.code, name: o.name_th, color: o.color, image_url: o.image_url })}
          title={o.name_th ?? o.code}
          className={`inline-flex max-w-[220px] items-center gap-1 rounded-md border px-1.5 py-0.5 ${o.code === current ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50"}`}>
          {o.image_url
            ? <img src={o.image_url} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />
            : <span className="h-5 w-5 shrink-0 rounded bg-slate-100" />}
          <code className="shrink-0 font-mono text-orange-700">{o.code}</code>
          {o.color && <span className="truncate text-slate-600">{o.color}</span>}
        </button>
      ))}
    </div>
  );
}
