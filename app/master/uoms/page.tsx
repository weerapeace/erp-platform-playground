"use client";

/**
 * หน่วยนับ — 1 หน่วย = ชื่อไทย · ชื่ออังกฤษ (+ ชื่ออื่น) · ดู docs/uom-bilingual.md
 *   - name = ชื่อหลักที่ระบบใช้จับคู่กับเอกสาร (ไม่ควรเปลี่ยนบ่อย) · display_name ตั้งอัตโนมัติ "หลา · Yard"
 *   - ปุ่ม "รวมหน่วยซ้ำ" (merge-modal) · ช่องชื่อเตือนทันทีถ้าชนหน่วยเดิม (lib/uom-names findUomClash)
 */
import { useMemo, useState } from "react";
import { LoadingState } from "@/components/state-views";
import dynamic from "next/dynamic";
import type { MasterCRUDConfig } from "@/components/master-crud";
import { findDupGroups, findUomClash, splitAliases, uomLabel, type UomRow } from "@/lib/uom-names";
import { UomMergeModal, useUomList } from "./merge-modal";

const MasterCRUDPage = dynamic(
  () => import("@/components/master-crud").then((m) => m.MasterCRUDPage),
  { ssr: false, loading: () => <LoadingState /> },
);

export default function UomsPage() {
  const [mergeOpen, setMergeOpen] = useState(false);
  const { rows, load } = useUomList();
  const dupCount = useMemo(() => findDupGroups(rows ?? []).length, [rows]);

  const config = useMemo<MasterCRUDConfig>(() => {
    const clashHint = ({ form, recordId }: { form: Record<string, unknown>; recordId: string | null }) => {
      const hit = findUomClash([form.name as string, form.name_th as string, form.name_en as string, form.aliases as string], rows ?? [], recordId);
      if (hit.length === 0) return null;
      return <span className="text-xs text-amber-700">มีหน่วยนี้แล้ว: {hit.map((u) => `${uomLabel(u)} (${u.name})`).join(", ")} — ใช้ตัวเดิมแทนการสร้างใหม่ หรือกด &ldquo;รวมหน่วยซ้ำ&rdquo; ทีหลัง</span>;
    };
    return {
      apiBase: "/api/master-v2/", apiPath: "uoms", moduleKey: "uoms",
      tableId: "master-uoms", title: "หน่วยนับ (UoM)", icon: "📏",
      description: "1 หน่วย = ชื่อไทย · ชื่ออังกฤษ เช่น หลา · Yard · ชื่ออื่นที่ใส่ไว้ ค้นเจอและกันสร้างซ้ำ",
      activeField: "active", pageLimit: 500,
      searchKeys: ["name", "name_th", "name_en", "aliases", "display_name"],
      permissions: { view: "products.view", create: "products.create", edit: "products.edit" },
      headerActions: () => (
        <button type="button" onClick={() => setMergeOpen(true)}
          className={`h-9 px-3 text-sm rounded-lg border ${dupCount ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
          รวมหน่วยซ้ำ{dupCount ? ` (${dupCount} กลุ่ม)` : ""}
        </button>
      ),
      fieldHints: { name: clashHint, name_th: clashHint, name_en: clashHint, aliases: clashHint },
      cellRenderers: {
        display_name: (v, row) => <span className="font-medium">{row ? uomLabel(row as UomRow) : String(v ?? "")}</span>,
        aliases: (v) => {
          const a = splitAliases(v as string);
          return a.length ? <span className="flex flex-wrap gap-1">{a.map((x) => <span key={x} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px]">{x}</span>)}</span> : <span className="text-slate-300">—</span>;
        },
        uom_type: (v) => v ? <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600">{String(v)}</span> : <span className="text-slate-300">—</span>,
      },
      afterSave: () => { load(); },
    };
  }, [rows, dupCount, load]);

  return (
    <>
      <MasterCRUDPage config={config} />
      {mergeOpen && <UomMergeModal open onClose={() => { setMergeOpen(false); load(); }} />}
    </>
  );
}
