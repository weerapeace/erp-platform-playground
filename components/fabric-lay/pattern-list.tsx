"use client";
/**
 * ✂️ แบบตัดต่อสินค้า — รายการ (ตารางกลาง) + ป๊อปสร้างแบบตัดใหม่: ผูก Parent SKU (ParentSkuPicker) หรือใบงานออกแบบ (DesignSheetPickerModal · ยังไม่มี SKU)
 *   1 สินค้า = 1 แบบตัด — เลือกสินค้าที่มีแบบตัดแล้ว → เปิดตัวเดิมให้
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { DesignSheetPickerModal, type PickedDesignSheet } from "@/components/design-sheet-picker";
import { API, api, bagImgUrl, patternHref, thaiDate, type PatternRow } from "./shared";

export function PatternList() {
  const router = useRouter();
  const toast = useToast();
  const canEdit = usePermission("fabric_lay.edit");
  const [trash, setTrash] = useState(false);
  const [rows, setRows] = useState<PatternRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [hardDel, setHardDel] = useState<PatternRow | null>(null);

  const load = useCallback(async () => {
    setErr(null); setRows(null);
    try { setRows(await api<PatternRow[]>(`${API}/patterns${trash ? "?trash=1" : ""}`)); }
    catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [trash]);
  useEffect(() => { void load(); }, [load]);

  const archive = async (r: PatternRow) => {
    try {
      await api(`${API}/patterns/${r.id}`, { method: "DELETE" });
      setRows((c) => c?.filter((x) => x.id !== r.id) ?? c);
      toast.undo(`ย้าย ${r.code} เข้าถังขยะแล้ว`, async () => {
        try { await api(`${API}/patterns/${r.id}`, { method: "PATCH", json: { is_active: true } }); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };
  const restore = async (r: PatternRow) => {
    try { await api(`${API}/patterns/${r.id}`, { method: "PATCH", json: { is_active: true } }); setRows((c) => c?.filter((x) => x.id !== r.id) ?? c); toast.success(`กู้คืน ${r.code} แล้ว`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); }
  };
  const destroy = async () => {
    const r = hardDel; if (!r) return;
    try { await api(`${API}/patterns/${r.id}?hard=1`, { method: "DELETE" }); setRows((c) => c?.filter((x) => x.id !== r.id) ?? c); toast.success(`ลบ ${r.code} ถาวรแล้ว`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    setHardDel(null);
  };

  const columns = useMemo<ColumnDef<PatternRow>[]>(() => [
    { id: "img", header: "", size: 60, cell: ({ row }) => row.original.bag_image
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={bagImgUrl(row.original.bag_image, 120) ?? ""} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="text-slate-300">—</span> },
    { accessorKey: "code", header: "รหัส", size: 90, cell: ({ row }) => <span className="font-mono text-xs text-slate-600">{row.original.code}</span> },
    { accessorKey: "name", header: "ชื่อแบบตัด", size: 240, cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.name}</span> },
    { id: "link", header: "ผูกกับ", size: 170, accessorFn: (r) => r.parent_code ?? r.design_sheet_code ?? "", cell: ({ row }) => row.original.parent_code
      ? <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{row.original.parent_code}</span>
      : row.original.design_sheet_code ? <span className="text-xs text-violet-700">ใบงาน {row.original.design_sheet_code}</span> : <span className="text-xs text-slate-400">—</span> },
    { accessorKey: "piece_count", header: "ชิ้น", size: 70 },
    { accessorKey: trash ? "deleted_at" : "updated_at", header: trash ? "ลบเมื่อ" : "แก้ล่าสุด", size: 140, cell: ({ row }) => <span className="text-xs text-slate-500">{thaiDate(trash ? row.original.deleted_at : row.original.updated_at)}</span> },
  ], [trash]);

  const rowActions = trash
    ? (canEdit ? [
        { id: "restore", label: "กู้คืน", onClick: (r: PatternRow) => void restore(r), variant: "success" as const },
        { id: "hard", label: "ลบถาวร", onClick: (r: PatternRow) => setHardDel(r), variant: "danger" as const },
      ] : [])
    : [
        { id: "open", label: "เปิด", onClick: (r: PatternRow) => router.push(patternHref(r.id)) },
        ...(canEdit ? [{ id: "trash", label: "ย้ายเข้าถังขยะ", onClick: (r: PatternRow) => void archive(r), variant: "danger" as const }] : []),
      ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => setTrash((t) => !t)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${trash ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}><Icon name="trash" /> {trash ? "กลับไปแบบตัดทั้งหมด" : "ถังขยะ"}</button>
        {canEdit && !trash && <button type="button" onClick={() => setCreating(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"><Icon name="add" /> แบบตัดใหม่</button>}
      </div>
      <DataTable<PatternRow>
        tableId={trash ? "fabric-lay-patterns-trash" : "fabric-lay-patterns"}
        data={rows ?? []} columns={columns} loading={rows === null && !err} error={err ?? undefined} onRetry={() => void load()}
        emptyMessage={trash ? "ถังขยะว่าง" : "ยังไม่มีแบบตัด — กด \"แบบตัดใหม่\" แล้วเลือกสินค้า"}
        searchPlaceholder="ค้นรหัส / ชื่อ / Parent SKU" searchableKeys={["code", "name", "parent_code", "design_sheet_code"]}
        rowActions={rowActions} onRowClick={trash ? undefined : (r) => router.push(patternHref(r.id))}
        pageSize={25} exportFilename="fabric-lay-patterns" exportEntityType="fabric_lay_patterns" />
      <NewPatternModal open={creating} existing={rows ?? []} onClose={() => setCreating(false)} onOpen={(id) => router.push(patternHref(id))} />
      <ConfirmDialog open={!!hardDel} onClose={() => setHardDel(null)} onConfirm={() => void destroy()} variant="danger"
        title="ลบแบบตัดนี้ถาวร?" message={<>ลบ <b>{hardDel?.code} {hardDel?.name}</b> ถาวร — แผนวางที่ใช้แบบนี้จะไม่เห็นชิ้นของใบนั้นอีก · พิมพ์รหัสเพื่อยืนยัน</>} confirmText="ลบถาวร" requireTyped={hardDel?.code} />
    </div>
  );
}

/** สร้างแบบตัด — เลือก Parent SKU หรือใบงานออกแบบ · มีแบบตัดอยู่แล้ว = เปิดตัวเดิม */
export function NewPatternModal({ open, existing, onClose, onOpen }: { open: boolean; existing: PatternRow[]; onClose: () => void; onOpen: (id: string) => void }) {
  const toast = useToast();
  const [src, setSrc] = useState<"sku" | "sheet">("sku");
  const [parent, setParent] = useState<ParentSkuPickerValue | null>(null);
  const [sheet, setSheet] = useState<PickedDesignSheet | null>(null);
  const [sheetPick, setSheetPick] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setParent(null); setSheet(null); setName(""); setSrc("sku"); } }, [open]);

  const dup = src === "sku" ? existing.find((r) => parent && r.parent_sku_id === parent.id) : existing.find((r) => sheet && r.design_sheet_id === sheet.id && !r.parent_sku_id);
  const create = async () => {
    if (dup) { onOpen(dup.id); return; }
    const body = src === "sku"
      ? (parent ? { name: name.trim() || `${parent.code} ${parent.name}`.trim(), parent_sku_id: parent.id, parent_code: parent.code, bag_image: parent.image_url ?? null, pieces: [] } : null)
      : (sheet ? { name: name.trim() || `${sheet.code} ${sheet.name}`.trim(), design_sheet_id: sheet.id, design_sheet_code: sheet.code, bag_image: sheet.cover_url ?? null, pieces: [] } : null);
    if (!body) { toast.warning(src === "sku" ? "เลือก Parent SKU ก่อน" : "เลือกใบงานออกแบบก่อน"); return; }
    setBusy(true);
    try { const p = await api<PatternRow>(`${API}/patterns`, { json: body }); onOpen(p.id); }
    catch (e) { toast.error(e instanceof Error ? e.message : "สร้างไม่สำเร็จ"); setBusy(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} title="แบบตัดใหม่" size="md" loading={busy}
      description="แบบตัดเก็บต่อสินค้า — ใส่ชิ้นครั้งเดียว ใช้ซ้ำได้กับผ้าทุกผืน"
      footer={<div className="flex w-full justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
        <button type="button" onClick={() => void create()} disabled={busy} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{dup ? "เปิดแบบตัดเดิม" : "สร้าง"}</button>
      </div>}>
      <div className="space-y-3 text-sm">
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
          {([["sku", "Parent SKU"], ["sheet", "ใบงานออกแบบ (ยังไม่มี SKU)"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setSrc(k)} className={`h-8 rounded-md px-3 text-xs ${src === k ? "bg-indigo-600 text-white" : "text-slate-600"}`}>{l}</button>
          ))}
        </div>
        {src === "sku" ? <ParentSkuPicker value={parent} onChange={setParent} disableCreate />
          : (
            <div className="flex items-center gap-2">
              {sheet ? <div className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 px-2 py-1.5">{sheet.code} · {sheet.name}</div> : <span className="flex-1 text-slate-400">ยังไม่เลือก</span>}
              <button type="button" onClick={() => setSheetPick(true)} className="h-9 rounded-lg border border-slate-200 px-3 hover:bg-slate-50">เลือกใบงาน</button>
            </div>
          )}
        {dup && <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">สินค้านี้มีแบบตัด {dup.code} อยู่แล้ว — กดเปิดแบบตัดเดิม (1 สินค้า = 1 แบบตัด)</div>}
        <label className="block"><span className="text-xs text-slate-500">ชื่อแบบตัด (เว้นได้ = ใช้ชื่อสินค้า)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2" /></label>
      </div>
      <DesignSheetPickerModal open={sheetPick} onClose={() => setSheetPick(false)} onConfirm={(s) => { setSheet(s); setSheetPick(false); }} title="เลือกใบงานออกแบบ" />
    </ERPModal>
  );
}
