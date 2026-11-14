"use client";
/**
 * 📚 Design Library — ป๊อป "เปลี่ยนเป็นสินค้าจริง" (รอบ 5 ช่วง 4)
 *
 * เจ้าของเลือก: ผ่านขั้นสร้าง SKU + BOM เดิมของใบงานออกแบบ — ไม่มีทางสร้างสินค้าที่ 2
 * ป๊อปนี้ไม่เขียนข้อมูลเอง: ตรวจความพร้อม (ใบงาน · จำนวนสี = จำนวน SKU · วัสดุที่ผูกรหัสจริง) แล้วพาไปขั้นในใบงาน
 *   1) ส่งเข้าใบงาน (SendToSheetModal) · 2) ตัวสร้าง SKU ของใบงาน (?action=sku · ปุ่ม "ดึงสีจากตารางสี")
 *   3) สร้างสูตร BOM จากหมุดวัสดุ ในแท็บรายละเอียดงาน (?tab=spec)
 */
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { MAIN_COLORWAY_LABEL, type Choice, type Spec } from "@/lib/design-library";
import { productReadiness } from "@/lib/design-library-sheet";
import { sheetHref, type LinkedSheet } from "./send-to-sheet";

export type ProductSheet = LinkedSheet & { status?: string | null; parent_sku_codes?: string[] | null };

export function ToProductModal({ open, onClose, spec, choices, sheet, canSend, onSend }: {
  open: boolean; onClose: () => void; spec: Spec; choices: Choice[];
  sheet: ProductSheet | null;
  /** เปิดป๊อปส่งเข้าใบงาน (มีสิทธิ์ส่ง) */
  canSend: boolean; onSend: () => void;
}) {
  const r = productReadiness(spec, choices);
  const done = sheet?.status === "sku_created";
  const parents = (sheet?.parent_sku_codes ?? []).filter(Boolean);
  const Step = ({ n, title, children, ok }: { n: number; title: string; children: React.ReactNode; ok?: boolean }) => (
    <div className="flex gap-3">
      <div className={`h-7 w-7 shrink-0 rounded-full inline-flex items-center justify-center text-[13px] font-semibold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{ok ? <Icon value="i:circle-check" /> : n}</div>
      <div className="min-w-0 flex-1 pb-4"><div className="text-[14px] font-medium text-slate-800">{title}</div><div className="text-[13px] text-slate-600 mt-1 space-y-1.5">{children}</div></div>
    </div>
  );
  const linkBtn = "h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[13px] inline-flex items-center gap-1.5";
  return (
    <ERPModal open={open} onClose={onClose} title="เปลี่ยนเป็นสินค้าจริง" size="md" defaultExpanded={false} storageKey="design-library-to-product"
      description="สร้างสินค้าผ่านขั้นเดิมของใบงานออกแบบ — ป๊อปนี้ยังไม่สร้างอะไร จะสร้างจริงตอนกดยืนยันในใบงาน"
      footer={<div className="flex justify-end"><button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm">ปิด</button></div>}>
      <div className="pt-1">
        <Step n={1} title={sheet ? `ใบงาน ${sheet.code}` : "ส่งสูตรเป็นใบงานออกแบบ"} ok={!!sheet}>
          {sheet ? (
            <>
              <p>{sheet.name}</p>
              <p className="text-[12px] text-slate-500">แก้สูตรหลังส่งไปแล้ว? ส่งเข้าใบเดิมอีกครั้งก่อน (หน้ารายละเอียดงาน + ตารางสีจะอัปเดตแทนของเดิม)</p>
              <div className="flex flex-wrap gap-2">
                <a href={sheetHref(sheet.id)} target="_blank" rel="noopener" className={linkBtn}><Icon value="i:external-link" />เปิดใบงาน</a>
                {canSend && <button type="button" onClick={onSend} className={linkBtn}><Icon value="i:clipboard-list" />ส่งข้อมูลล่าสุดเข้าใบเดิม</button>}
              </div>
            </>
          ) : (
            <>
              <p>สินค้าจริงสร้างจากใบงานออกแบบ — ส่งสูตรนี้เป็นใบงานก่อน (ติ๊ก "รูปแม่แบบ + หมุดวัสดุ" และ "ตารางสี" ไว้ด้วย)</p>
              {canSend
                ? <button type="button" onClick={onSend} className="h-8 px-3 rounded-lg bg-indigo-600 text-white text-[13px] inline-flex items-center gap-1.5"><Icon value="i:clipboard-list" />ส่งเป็นใบงาน</button>
                : <p className="text-amber-700 text-[12px]">ต้องมีสิทธิ์แก้ Design Library และแก้ใบงานออกแบบ — ขอผู้ดูแลเพิ่มสิทธิ์</p>}
            </>
          )}
        </Step>

        <Step n={2} title="สร้าง SKU (สินค้าแม่ + ลูกทุกสี)" ok={done}>
          <p>จะได้ SKU ลูก <b>{r.colorNames.length}</b> ตัว ตามชุดสี: {r.colorNames.join(" · ")}</p>
          {r.colorNames[0] === MAIN_COLORWAY_LABEL && <p className="text-[12px] text-slate-500">ชื่อ "{MAIN_COLORWAY_LABEL}" แก้เป็นชื่อสีจริงได้ในตัวสร้าง SKU ก่อนกดสร้าง</p>}
          {done && <p className="text-emerald-700">ใบงานนี้สร้าง SKU แล้ว{parents.length ? ` (${parents.join(", ")})` : ""}</p>}
          {sheet && (
            <a href={`${sheetHref(sheet.id)}&action=sku`} target="_blank" rel="noopener" className={linkBtn}><Icon value="i:external-link" />เปิดตัวสร้าง SKU ในใบงาน</a>
          )}
          {sheet && <p className="text-[12px] text-slate-500">ในตัวสร้าง กด "ดึงสีจากตารางสี" → ได้แถวครบทุกสีพร้อมรหัสถัดไป → ตรวจ แล้วกด "สร้าง SKU" (ต้องมีสิทธิ์สร้างสินค้า)</p>}
        </Step>

        <Step n={3} title="สร้างสูตร BOM">
          <p>วัสดุ {r.materials} จุด · ผูกรหัสวัตถุดิบจริงแล้ว <b>{r.withCode}</b> จุด</p>
          {r.noCode.length > 0 && <p className="text-amber-700 text-[12px]">ยังไม่มีรหัสวัตถุดิบ: {r.noCode.join(" · ")} — BOM จะไม่มีบรรทัดนี้ ต้องเติมเองในหน้าสูตร BOM (หรือเลือก SKU ในจุดนั้นของสูตรก่อนส่ง)</p>}
          {sheet && (
            <a href={`${sheetHref(sheet.id)}&tab=spec`} target="_blank" rel="noopener" className={linkBtn}><Icon value="i:external-link" />เปิดแท็บรายละเอียดงาน</a>
          )}
          <p className="text-[12px] text-slate-500">ในแท็บรายละเอียดงาน กด "สร้างสูตร BOM" → เลือก SKU ที่สร้างในขั้น 2 → ได้ BOM พร้อมรหัสวัตถุดิบและจำนวนจากสูตร · ใบงานที่มีหลายหน้า (ส่งหลายชุดสี) ตัวสร้าง BOM รวมวัสดุทุกหน้า → ติ๊กออกวัสดุของสีอื่นก่อนสร้าง (ทำทีละสี)</p>
        </Step>
      </div>
    </ERPModal>
  );
}
