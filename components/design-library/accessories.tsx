"use client";

/**
 * 📚 Design Library — ส่วนเสริม (รอบ 7 · เจ้าของเลือก 2026-11-14): พวงกุญแจ ชาร์ม สายคล้องแขน ฯลฯ
 * รายการของทีม (ตัวเลือก list_key "accessory": รูป + กลุ่ม + ผูก SKU ได้ไม่บังคับ) → เลือกได้หลายชิ้นต่อสูตร + โน้ตต่อชิ้น
 * เก็บสำเนาใน spec.accessories (ชื่อ/รูป ณ ตอนเลือก) · ขึ้นในใบสรุป + prompt ({ส่วนเสริม}) + ใบสั่งทำตัวอย่าง · ทุกชุดสีใช้ร่วมกัน
 */
import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { accessoryFromChoice, MAX_ACCESSORIES, type AccessoryPick, type Choice } from "@/lib/design-library";
import { StockBadge } from "./pick-panel";
import { img, newId } from "./shared";

const Thumb = ({ k, size = 40 }: { k: string | null; size?: number }) => (k
  // eslint-disable-next-line @next/next/no-img-element
  ? <img src={img(k, size * 3)} alt="" className="rounded-md object-contain bg-slate-50 border border-slate-100 shrink-0" style={{ width: size, height: size }} loading="lazy" />
  : <span className="rounded-md bg-slate-100 shrink-0 inline-flex items-center justify-center text-slate-300" style={{ width: size, height: size }}><Icon value="i:photo" /></span>);

export function AccessoriesCard({ items, choices, stock, readOnly, onChange }: {
  items: AccessoryPick[]; choices: Choice[]; stock: Record<string, number>; readOnly: boolean; onChange: (items: AccessoryPick[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const patch = (id: string, p: Partial<AccessoryPick>) => onChange(items.map((a) => (a.id === id ? { ...a, ...p } : a)));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[14px] font-medium text-slate-800 flex items-center gap-2"><Icon value="i:key" />ส่วนเสริม</span>
        {items.length > 0 && <span className="text-[11px] px-1.5 rounded-full bg-slate-100 text-slate-500">{items.length}</span>}
        {!readOnly && <button type="button" onClick={() => setOpen(true)} className="ml-auto h-8 px-3 text-[12.5px] rounded-lg border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50">+ เลือกส่วนเสริม</button>}
      </div>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-slate-400">{readOnly ? "สูตรนี้ไม่มีส่วนเสริม" : "เช่น พวงกุญแจ ชาร์ม สายคล้องแขน — กด “เลือกส่วนเสริม”"}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-1.5">
              <Thumb k={a.image_key} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13px] min-w-0">
                  <span className="truncate text-slate-800">{a.name}</span>
                  {a.group && <span className="text-[10.5px] px-1.5 rounded bg-slate-100 text-slate-500 shrink-0">{a.group}</span>}
                  {a.sku_id && <StockBadge onHand={stock[a.sku_id]} />}
                </div>
                {readOnly ? (a.note && <div className="text-[11.5px] text-slate-500 truncate">{a.note}</div>)
                  : <input value={a.note} onChange={(e) => patch(a.id, { note: e.target.value.slice(0, 300) })} placeholder="โน้ต เช่น ห้อยหูซ้าย"
                    className="mt-0.5 w-full h-7 px-2 border border-slate-200 rounded-md text-[12px] text-slate-700" />}
              </div>
              {!readOnly && <button type="button" onClick={() => onChange(items.filter((x) => x.id !== a.id))} aria-label={`เอา ${a.name} ออก`} title="เอาออก"
                className="h-7 w-7 rounded-md text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center shrink-0"><Icon value="i:x" /></button>}
            </div>
          ))}
        </div>
      )}
      {open && <AccessoryPickerModal choices={choices} items={items} onClose={() => setOpen(false)} onApply={(next) => { onChange(next); setOpen(false); }} />}
    </div>
  );
}

/** ป๊อปเลือกส่วนเสริม — แบ่งกลุ่ม · ค้นหา · กดการ์ด = ติ๊ก/เอาออก (เลือกได้หลายชิ้น) */
function AccessoryPickerModal({ choices, items, onClose, onApply }: { choices: Choice[]; items: AccessoryPick[]; onClose: () => void; onApply: (items: AccessoryPick[]) => void }) {
  const list = useMemo(() => choices.filter((c) => c.list_key === "accessory" && c.is_active !== false), [choices]);
  const groups = useMemo(() => [...new Set(list.map((c) => String(c.config?.group ?? "").trim() || "อื่น ๆ"))], [list]);
  const [group, setGroup] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(() => new Set(items.map((a) => a.code)));
  const shown = list.filter((c) => (!group || (String(c.config?.group ?? "").trim() || "อื่น ๆ") === group)
    && (!q.trim() || `${c.code} ${c.name} ${c.name_en ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const toggle = (code: string) => setSel((p) => { const n = new Set(p); if (n.has(code)) n.delete(code); else if (n.size < MAX_ACCESSORIES) n.add(code); return n; });
  const apply = () => {
    const keep = items.filter((a) => sel.has(a.code));   // ของเดิมคงโน้ตไว้
    const add = list.filter((c) => sel.has(c.code) && !items.some((a) => a.code === c.code)).map((c) => accessoryFromChoice(c, newId()));
    onApply([...keep, ...add]);
  };
  return (
    <ERPModal open onClose={onClose} title="เลือกส่วนเสริม" size="lg" storageKey="design-library-accessory"
      description="กดการ์ดเพื่อติ๊ก — เลือกได้หลายชิ้น · ผู้ดูแลเพิ่มรายการ/รูปได้ที่ “ตัวเลือก” → ส่วนเสริม"
      footer={<div className="flex items-center gap-2">
        <span className="text-[12px] text-slate-500">เลือกอยู่ {sel.size} ชิ้น</span>
        <button type="button" onClick={onClose} className="ml-auto h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={apply} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">ใช้ที่เลือก</button>
      </div>}>
      {list.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-slate-500">ยังไม่มีรายการส่วนเสริม — ผู้ดูแลเพิ่มที่ “ตัวเลือก” → ส่วนเสริม (ใส่รูป + กลุ่ม เช่น พวงกุญแจ / ชาร์ม / สายคล้องแขน)</div>
      ) : (
        <div className="space-y-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อ / รหัส" className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm" />
          {groups.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {["", ...groups].map((g) => (
                <button key={g || "_all"} type="button" onClick={() => setGroup(g)}
                  className={`h-7 px-2.5 text-[12px] rounded-full border ${group === g ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{g || "ทั้งหมด"}</button>
              ))}
            </div>
          )}
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 max-h-[55vh] overflow-y-auto pr-1">
            {shown.map((c) => {
              const on = sel.has(c.code), key = String(c.config?.image_key ?? "") || null;
              return (
                <button key={c.id} type="button" onClick={() => toggle(c.code)} aria-pressed={on}
                  className={`relative rounded-xl border p-2 text-left ${on ? "border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-400"}`}>
                  {on && <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-[11px]"><Icon value="i:check" /></span>}
                  <div className="aspect-square w-full rounded-lg bg-slate-50 overflow-hidden flex items-center justify-center mb-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {key ? <img src={img(key, 400)} alt="" className="w-full h-full object-contain" loading="lazy" /> : <Icon value="i:photo" className="text-[28px] text-slate-300" />}
                  </div>
                  <div className="text-[12.5px] text-slate-800 line-clamp-2 leading-snug">{c.name}</div>
                  <div className="text-[10.5px] text-slate-400 truncate">{String(c.config?.group ?? "") || "อื่น ๆ"}{c.config?.sku_code ? ` · ${String(c.config.sku_code)}` : ""}</div>
                </button>
              );
            })}
            {shown.length === 0 && <div className="col-span-full py-8 text-center text-[13px] text-slate-400">ไม่พบส่วนเสริมที่ค้น</div>}
          </div>
        </div>
      )}
    </ERPModal>
  );
}
