"use client";

/**
 * Preview: LineItemsGrid (ตารางรายการกลาง) — ของกลางตาม CLAUDE.md
 * โชว์: จัดแถวตรง, ชื่อยาวไม่เพี้ยน, sort, group ตามหน่วย, ลากเรียง, เพิ่ม/ลบ, readonly
 */
import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { LineItemsGrid, type LineColumn } from "@/components/line-items-grid";

type Row = { key: string; name: string; qty: number; uom: string; price: number };
let _n = 0;
const k = () => `r${_n++}`;
const SEED: Row[] = [
  { key: k(), name: "BONDED-0.4BK อีเลเน่ (Bonded Leather) 0.4 mm. ดำ (1 ม้วน = 100 หลา หน้ากว้าง 150 cm.)", qty: 0.3, uom: "หลา", price: 120 },
  { key: k(), name: "ZIP-M-NO.5#G322#N ซิปฟันเหล็ก#5", qty: 0.53, uom: "หลา", price: 18 },
  { key: k(), name: "CHAIN-4#N โซ่ไข่ปลา ยาว 10 cm.", qty: 1, uom: "Units", price: 8 },
  { key: k(), name: "STP#5-N Stopper ตัวหยุดซิป #5 สีเงิน", qty: 2, uom: "Units", price: 1.5 },
  { key: k(), name: "RMN066PU-1 ผ้าซับในตัวใหม่ สีดำ", qty: 0.4, uom: "หลา", price: 45 },
];

const inputCls = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50";

export default function LineItemsDemoPage() {
  const [rows, setRows] = useState<Row[]>(SEED);
  const [readonly, setReadonly] = useState(false);

  const columns: LineColumn<Row>[] = [
    { key: "name", header: "รายการ", minWidth: 320, sortable: true,
      render: (r) => <span className="block truncate text-sm text-slate-700" title={r.name}>{r.name}</span> },
    { key: "qty", header: "จำนวน", width: 90, align: "right", sortable: true,
      render: (r, u, ro) => <input type="number" step="any" value={r.qty} disabled={ro}
        onChange={(e) => u({ qty: Number(e.target.value) })} className={`${inputCls} text-right`} /> },
    { key: "uom", header: "หน่วย", width: 90, sortable: true,
      render: (r, u, ro) => <input value={r.uom} disabled={ro}
        onChange={(e) => u({ uom: e.target.value })} className={inputCls} /> },
    { key: "price", header: "ราคา/หน่วย", width: 110, align: "right", sortable: true,
      render: (r, u, ro) => <input type="number" step="any" value={r.price} disabled={ro}
        onChange={(e) => u({ price: Number(e.target.value) })} className={`${inputCls} text-right`} /> },
  ];

  const total = rows.reduce((s, r) => s + r.qty * r.price, 0);

  return (
    <PlaygroundShell>
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">🧱 LineItemsGrid — ตารางรายการกลาง</h1>
          <p className="text-sm text-slate-500 mt-0.5">ของกลางสำหรับ &ldquo;หัวเอกสาร + หลายบรรทัด&rdquo; — ใช้ใน BOM / PR / SO / PO</p>
        </div>
        <ul className="text-xs text-slate-500 list-disc pl-5 space-y-0.5">
          <li>คลิกหัวคอลัมน์เพื่อ <b>sort</b> (none → ▲ → ▼) — ชื่อยาวจะตัด ไม่ดันคอลัมน์เพี้ยน</li>
          <li>เลือก <b>จัดกลุ่มตาม: หน่วย</b> เพื่อจัดกลุ่ม · ลาก ⠿ เพื่อเรียงลำดับ (เมื่อไม่ sort/group)</li>
        </ul>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={readonly} onChange={(e) => setReadonly(e.target.checked)} className="rounded border-slate-300" />
          โหมดอ่านอย่างเดียว (readonly)
        </label>

        <LineItemsGrid<Row>
          rows={rows} columns={columns} onChange={setRows} rowId={(r) => r.key}
          readonly={readonly} onAdd={() => ({ key: k(), name: "", qty: 1, uom: "Units", price: 0 })}
          addLabel="＋ เพิ่มรายการ" groupByOptions={[{ key: "uom", label: "หน่วย" }]}
          footer={<span className="text-sm text-slate-600">มูลค่ารวม <span className="font-bold text-slate-900">฿{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></span>}
        />
      </div>
    </PlaygroundShell>
  );
}
