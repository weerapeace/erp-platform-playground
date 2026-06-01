"use client";

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { ImportWizard } from "@/components/import-wizard";
import { IMPORT_SCHEMAS } from "@/lib/import";

const ENTITY_OPTIONS = [
  { v: "products",  label: "📦 สินค้า",      perm: "products.create" as const },
  { v: "suppliers", label: "🏢 ผู้จำหน่าย", perm: "suppliers.create" as const },
  { v: "material-families", label: "🧵 กลุ่มวัตถุดิบ", perm: "products.create" as const },
];

export default function AdminImportPage() {
  const { user, can } = useAuth();
  const canViewPage = usePermission("products.create") || usePermission("suppliers.create");

  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  if (!canViewPage) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ products.create หรือ suppliers.create" /></PlaygroundShell>;

  const schema = selectedEntity ? IMPORT_SCHEMAS[selectedEntity] : null;

  return (
    <PlaygroundShell>
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-800">Import ข้อมูล</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            อัปโหลด CSV/Excel แล้ว map column → field → ตรวจสอบ → commit
          </p>
        </div>

        {!schema ? (
          <div>
            <p className="text-sm text-slate-600 mb-3">เลือกประเภทข้อมูลที่ต้องการ import:</p>
            <div className="grid grid-cols-2 gap-3">
              {ENTITY_OPTIONS.map(opt => {
                const allowed = can(opt.perm);
                return (
                  <button key={opt.v} onClick={() => allowed && setSelectedEntity(opt.v)}
                    disabled={!allowed}
                    className={`p-6 text-left rounded-xl border-2 transition-colors ${
                      allowed
                        ? "bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer"
                        : "bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed"
                    }`}>
                    <div className="text-3xl mb-2">{opt.label.split(" ")[0]}</div>
                    <div className="font-semibold text-slate-800">{opt.label.split(" ").slice(1).join(" ")}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {allowed
                        ? `Schema: ${IMPORT_SCHEMAS[opt.v].fields.length} fields, unique key: ${IMPORT_SCHEMAS[opt.v].uniqueKey ?? "—"}`
                        : `ต้องมีสิทธิ์ ${opt.perm}`}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
              💡 <strong>เคล็ดลับ:</strong>
              <ul className="ml-4 list-disc space-y-0.5 mt-1">
                <li>Column ของไฟล์ไม่ต้องตรงเป๊ะ — wizard จะ auto-detect</li>
                <li>รองรับ aliases เช่น &quot;ชื่อสินค้า&quot;, &quot;product name&quot;, &quot;product&quot; → field &quot;name&quot;</li>
                <li>Mode <code className="bg-white px-1 rounded">create</code> = fail ถ้า key ซ้ำ · <code className="bg-white px-1 rounded">upsert</code> = อัปเดต</li>
                <li>ไม่เกิน 5000 แถว/ครั้ง</li>
              </ul>
            </div>
          </div>
        ) : (
          <ImportWizard
            schema={schema}
            actor={user?.name}
            onClose={() => setSelectedEntity(null)}
          />
        )}
      </div>
    </PlaygroundShell>
  );
}
