"use client";

/**
 * Relation Playground (R6) — preview ระบบ relation fields กลาง
 *
 * โชว์ 3 ของกลางที่เพิ่งทำ:
 *   1. relation-mapping กลาง (lib/relation.ts) — map FK → ชื่อ
 *   2. Dependent dropdown ลูกโซ่ — เลือกพ่อ → ลูกค่อยเลือกได้
 *   3. DataTable อ่าน label อัตโนมัติ
 *
 * ใช้ mock data ในตัว (ไม่แตะ Supabase) เพื่อให้ดูพฤติกรรมได้แน่นอน
 */

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { readRelationLabel, buildRelationFilter, type RelationConfig } from "@/lib/relation";

// ---- mock data: warehouse → location (ความสัมพันธ์พ่อ-ลูก) ----
const WAREHOUSES = [
  { id: "wh-bkk", name: "คลังกรุงเทพ" },
  { id: "wh-cnx", name: "คลังเชียงใหม่" },
];
const LOCATIONS = [
  { id: "loc-a1", warehouse_id: "wh-bkk", name: "A1 — ชั้นวาง A แถว 1" },
  { id: "loc-a2", warehouse_id: "wh-bkk", name: "A2 — ชั้นวาง A แถว 2" },
  { id: "loc-b1", warehouse_id: "wh-bkk", name: "B1 — โซนเย็น" },
  { id: "loc-c1", warehouse_id: "wh-cnx", name: "C1 — โกดังหลัก" },
  { id: "loc-c2", warehouse_id: "wh-cnx", name: "C2 — โซนพักสินค้า" },
];

// config ของ location ที่ "ขึ้นกับ" warehouse
const locationConfig: RelationConfig = {
  target_table: "locations",
  target_label_field: "name",
  depends_on: { parent_field: "warehouse_id", filter_column: "warehouse_id" },
};

export default function RelationPlaygroundPage() {
  // ฟอร์มจำลอง: warehouse_id (พ่อ) + location_id (ลูก)
  const [form, setForm] = useState<Record<string, string>>({ warehouse_id: "", location_id: "" });

  const setWarehouse = (id: string) => {
    // เปลี่ยนพ่อ → เคลียร์ลูก (พฤติกรรมจริงของ RelationPicker)
    setForm({ warehouse_id: id, location_id: "" });
  };
  const setLocation = (id: string) => setForm((f) => ({ ...f, location_id: id }));

  // ใช้ helper กลางคำนวณว่า location เลือกได้ไหม + กรองยังไง
  const locFilter = buildRelationFilter(locationConfig, form);
  const blocked = locFilter != null && "blocked" in locFilter;
  const visibleLocations = blocked
    ? []
    : LOCATIONS.filter((l) => !locFilter || l.warehouse_id === locFilter.value);

  // ตัวอย่าง row ที่ denormalized มาแล้ว (มี _label) → DataTable อ่านชื่อได้เลย
  const sampleRow = {
    sku: "SKU-001",
    warehouse_id: form.warehouse_id || "wh-bkk",
    warehouse_label: WAREHOUSES.find((w) => w.id === (form.warehouse_id || "wh-bkk"))?.name,
    location_id: form.location_id || "loc-a1",
    location_label: LOCATIONS.find((l) => l.id === (form.location_id || "loc-a1"))?.name,
  };

  return (
    <PlaygroundShell>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">🔗 Relation Fields — ของกลาง</h1>
          <p className="text-sm text-slate-500 mt-1">
            ตัวอย่างการทำงานของระบบ field เชื่อมโยง (FK) — ใช้ข้อมูลจำลองในตัว
          </p>
        </div>

        {/* ---- 1. Dependent dropdown ---- */}
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">1️⃣ Dropdown ลูกโซ่ (Dependent)</h2>
          <p className="text-xs text-slate-500 mb-4">
            เลือก &ldquo;คลัง&rdquo; ก่อน → ช่อง &ldquo;ตำแหน่งเก็บ&rdquo; ถึงเลือกได้ และจะเห็นเฉพาะตำแหน่งของคลังนั้น
          </p>

          <div className="grid grid-cols-2 gap-4">
            {/* พ่อ: warehouse */}
            <label className="block">
              <span className="text-xs font-medium text-slate-600">คลัง (พ่อ)</span>
              <select value={form.warehouse_id} onChange={(e) => setWarehouse(e.target.value)}
                className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-md bg-white">
                <option value="">— เลือกคลัง —</option>
                {WAREHOUSES.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>

            {/* ลูก: location (ขึ้นกับ warehouse) */}
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ตำแหน่งเก็บ (ลูก)</span>
              <select value={form.location_id} onChange={(e) => setLocation(e.target.value)}
                disabled={blocked}
                className={`w-full h-9 mt-0.5 px-2 text-sm border rounded-md ${
                  blocked ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed" : "bg-white border-slate-200"
                }`}>
                <option value="">{blocked ? "— เลือกคลังก่อน —" : "— เลือกตำแหน่ง —"}</option>
                {visibleLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-3 text-xs">
            {blocked ? (
              <span className="text-amber-600">⚠ ช่องลูกถูกล็อก — ต้องเลือกคลังก่อน (helper คืน <code>{"{ blocked: true }"}</code>)</span>
            ) : (
              <span className="text-emerald-600">
                ✓ กรอง location ด้วย <code className="bg-emerald-50 px-1 rounded">{locFilter ? `${locFilter.column} = ${locFilter.value}` : "ไม่กรอง"}</code>
                {" "}— เห็น {visibleLocations.length} ตำแหน่ง
              </span>
            )}
          </div>
        </section>

        {/* ---- 2. relation label mapping ---- */}
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">2️⃣ แสดงชื่อแทนรหัส (FK → label)</h2>
          <p className="text-xs text-slate-500 mb-4">
            ข้อมูลที่ตารางได้รับมี <code className="bg-slate-100 px-1 rounded">xxx_id</code> + <code className="bg-slate-100 px-1 rounded">xxx_label</code> คู่กัน
            — <code>readRelationLabel()</code> อ่านชื่อให้อัตโนมัติ
          </p>

          <div className="bg-slate-50 rounded-lg p-3 font-mono text-xs space-y-1.5">
            <div className="text-slate-400">// row ที่ตารางได้รับ:</div>
            <pre className="text-slate-600 whitespace-pre-wrap">{JSON.stringify(sampleRow, null, 2)}</pre>
            <div className="text-slate-400 mt-2">// ตารางแสดง:</div>
            <div className="text-slate-700">
              warehouse_id → <span className="text-emerald-700 font-semibold">{readRelationLabel(sampleRow, "warehouse_id") ?? "—"}</span>
            </div>
            <div className="text-slate-700">
              location_id → <span className="text-emerald-700 font-semibold">{readRelationLabel(sampleRow, "location_id") ?? "—"}</span>
            </div>
          </div>
        </section>

        {/* ---- 3. อธิบายของกลาง ---- */}
        <section className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-blue-800 mb-2">📦 ของกลางที่ใช้ (ทุกโมดูลใช้ร่วมกัน)</h2>
          <ul className="text-xs text-blue-700 space-y-1.5">
            <li>• <code className="bg-white px-1 rounded">lib/relation.ts</code> — type + helper กลาง (relationLabelKey, readRelationLabel, buildRelationFilter, resolveRelationLabels)</li>
            <li>• <code className="bg-white px-1 rounded">RelationPicker</code> — รองรับ <code>depends_on</code> + <code>siblingValues</code> สำหรับลูกโซ่</li>
            <li>• <code className="bg-white px-1 rounded">DataTable</code> — อ่าน label จากทะเบียนอัตโนมัติเมื่อ field เป็น relation</li>
            <li>• ทุกฟอร์ม (master-crud, record-form, sku-form) ส่ง <code>siblingValues</code> ให้ picker เองแล้ว</li>
          </ul>
        </section>
      </div>
    </PlaygroundShell>
  );
}
