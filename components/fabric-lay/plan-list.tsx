"use client";
/**
 * ✂️ แผนวางบนผ้า — รายการแผน (ตารางกลาง DataTable) + ป๊อปสร้างแผนใหม่ (เลือกผ้าจากอัลบั้ม + ชื่อแผน)
 *   ลบ = ถังขยะ (ย้อนกลับได้ทันที) · ถังขยะ: กู้คืน / ลบถาวร (พิมพ์รหัสยืนยัน)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { FabricAlbum } from "./fabric-album";
import { API, api, imgUrl, planHref, sizeText, thaiDate, type FabricRow, type PlanRow } from "./shared";

type Row = PlanRow & { fabric?: FabricRow };

export function PlanList() {
  const router = useRouter();
  const toast = useToast();
  const canEdit = usePermission("fabric_lay.edit");
  const [trash, setTrash] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [hardDel, setHardDel] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setErr(null); setRows(null);
    try {
      const [plans, fabrics] = await Promise.all([
        api<PlanRow[]>(`${API}/plans${trash ? "?trash=1" : ""}`),
        api<FabricRow[]>(`${API}/fabrics`).catch(() => [] as FabricRow[]),
      ]);
      const fb = new Map(fabrics.map((f) => [f.id, f]));
      setRows(plans.map((p) => ({ ...p, fabric: fb.get(p.fabric_id) })));
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [trash]);
  useEffect(() => { void load(); }, [load]);

  const archive = async (r: Row) => {
    try {
      await api(`${API}/plans/${r.id}`, { method: "DELETE" });
      setRows((c) => c?.filter((x) => x.id !== r.id) ?? c);
      toast.undo(`ย้าย ${r.code} เข้าถังขยะแล้ว`, async () => {
        try { await api(`${API}/plans/${r.id}`, { method: "PATCH", json: { is_active: true } }); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };
  const restore = async (r: Row) => {
    try { await api(`${API}/plans/${r.id}`, { method: "PATCH", json: { is_active: true } }); setRows((c) => c?.filter((x) => x.id !== r.id) ?? c); toast.success(`กู้คืน ${r.code} แล้ว`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); }
  };
  const destroy = async () => {
    const r = hardDel; if (!r) return;
    try { await api(`${API}/plans/${r.id}?hard=1`, { method: "DELETE" }); setRows((c) => c?.filter((x) => x.id !== r.id) ?? c); toast.success(`ลบ ${r.code} ถาวรแล้ว`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    setHardDel(null);
  };

  const columns = useMemo<ColumnDef<Row>[]>(() => [
    { id: "img", header: "", size: 64, cell: ({ row }) => row.original.fabric?.image_key
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={imgUrl(row.original.fabric.image_key, 120) ?? ""} alt="" className="h-10 w-14 rounded object-cover" /> : <span className="text-slate-300">—</span> },
    { accessorKey: "code", header: "รหัส", size: 90, cell: ({ row }) => <span className="font-mono text-xs text-slate-600">{row.original.code}</span> },
    { accessorKey: "name", header: "ชื่อแผน", size: 220, cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.name}</span> },
    { id: "fabric", header: "ผ้า", size: 200, accessorFn: (r) => r.fabric?.name ?? "", cell: ({ row }) => <span className="text-xs">{row.original.fabric ? <>{row.original.fabric.name} <span className="text-slate-400">· {sizeText(row.original.fabric.width_cm, row.original.fabric.height_cm)}</span></> : "—"}</span> },
    { id: "bags", header: "กระเป๋า", size: 200, accessorFn: (r) => r.bags.map((b) => b.label).join(", "), cell: ({ row }) => <span className="text-xs text-slate-600">{row.original.bags.length ? `${row.original.bags.length} ใบ · ${row.original.bags.map((b) => b.label).join(", ")}` : "ยังไม่เลือก"}</span> },
    { id: "cut", header: "สถานะ", size: 110, accessorFn: (r) => (r.cut_done_at ? "ตัดแล้ว" : "วางแผน"), cell: ({ row }) => row.original.cut_done_at
      ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">ตัดแล้ว</span> : <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700">วางแผน</span> },
    { accessorKey: trash ? "deleted_at" : "updated_at", header: trash ? "ลบเมื่อ" : "แก้ล่าสุด", size: 140, cell: ({ row }) => <span className="text-xs text-slate-500">{thaiDate(trash ? row.original.deleted_at : row.original.updated_at)}</span> },
  ], [trash]);

  const rowActions = trash
    ? (canEdit ? [
        { id: "restore", label: "กู้คืน", onClick: (r: Row) => void restore(r), variant: "success" as const },
        { id: "hard", label: "ลบถาวร", onClick: (r: Row) => setHardDel(r), variant: "danger" as const },
      ] : [])
    : [
        { id: "open", label: "เปิด", onClick: (r: Row) => router.push(planHref(r.id)) },
        ...(canEdit ? [{ id: "trash", label: "ย้ายเข้าถังขยะ", onClick: (r: Row) => void archive(r), variant: "danger" as const }] : []),
      ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => setTrash((t) => !t)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${trash ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}><Icon name="trash" /> {trash ? "กลับไปแผนทั้งหมด" : "ถังขยะ"}</button>
        {canEdit && !trash && <button type="button" onClick={() => setCreating(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"><Icon name="add" /> แผนวางใหม่</button>}
      </div>
      {trash && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">ถังขยะ — แผนที่ลบไว้ กู้คืนได้ · ลบถาวรแล้วกู้ไม่ได้</div>}
      <DataTable<Row>
        tableId={trash ? "fabric-lay-plans-trash" : "fabric-lay-plans"}
        data={rows ?? []} columns={columns} loading={rows === null && !err} error={err ?? undefined} onRetry={() => void load()}
        emptyMessage={trash ? "ถังขยะว่าง" : canEdit ? "ยังไม่มีแผน — เพิ่มผ้าในอัลบั้มก่อน แล้วกด \"แผนวางใหม่\"" : "ยังไม่มีแผนวาง"}
        searchPlaceholder="ค้นรหัส / ชื่อแผน / ผ้า / กระเป๋า" searchableKeys={["code", "name"]}
        rowActions={rowActions} onRowClick={trash ? undefined : (r) => router.push(planHref(r.id))}
        pageSize={25} exportFilename="fabric-lay-plans" exportEntityType="fabric_lay_plans" />
      <NewPlanModal open={creating} fabric={null} onClose={() => setCreating(false)} onCreated={(id) => router.push(planHref(id))} />
      <ConfirmDialog open={!!hardDel} onClose={() => setHardDel(null)} onConfirm={() => void destroy()} variant="danger"
        title="ลบแผนนี้ถาวร?" message={<>ลบ <b>{hardDel?.code} {hardDel?.name}</b> ถาวร กู้คืนไม่ได้ — พิมพ์รหัสแผนเพื่อยืนยัน</>} confirmText="ลบถาวร" requireTyped={hardDel?.code} />
    </div>
  );
}

/** สร้างแผนใหม่ — fabric = เลือกผ้ามาแล้ว (จากการ์ดผ้า) · null = เลือกผ้าจากอัลบั้มในป๊อปนี้ */
export function NewPlanModal({ open, fabric, onClose, onCreated }: { open: boolean; fabric: FabricRow | null; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [pick, setPick] = useState<FabricRow | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPick(fabric); setName(fabric ? `แผน ${fabric.name}` : ""); } }, [open, fabric]);

  const create = async () => {
    if (!pick) { toast.warning("เลือกผ้าก่อน"); return; }
    if (!pick.image_key || !pick.width_cm) { toast.warning("ผ้านี้ยังไม่ตั้งสเกล — แก้ผ้าในอัลบั้มก่อน"); return; }
    setBusy(true);
    try {
      const p = await api<PlanRow>(`${API}/plans`, { json: { name: name.trim() || `แผน ${pick.name}`, fabric_id: pick.id, bags: [], items: [] } });
      onCreated(p.id);
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างไม่สำเร็จ"); setBusy(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} title="แผนวางใหม่" size={pick ? "md" : "xl"} loading={busy}
      footer={<div className="flex w-full justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
        <button type="button" disabled={!pick || busy} onClick={() => void create()} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">สร้างแล้วเริ่มวาง</button>
      </div>}>
      {pick ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {pick.image_key && <img src={imgUrl(pick.image_key, 200) ?? ""} alt="" className="h-14 w-20 rounded object-cover" />}
            <div className="min-w-0 flex-1"><div className="font-medium">{pick.name}</div><div className="text-xs text-slate-500">{pick.code} · {sizeText(pick.width_cm, pick.height_cm)}</div></div>
            {!fabric && <button type="button" onClick={() => setPick(null)} className="h-8 rounded-lg px-2 text-xs text-slate-600 hover:bg-slate-100">เปลี่ยนผ้า</button>}
          </div>
          <label className="block"><span className="text-xs text-slate-500">ชื่อแผน</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2" /></label>
          <p className="text-xs text-slate-500">สร้างแล้วเลือกกระเป๋า (แบบตัดต่อสินค้า) ที่จะตัดจากผ้านี้ได้หลายใบในหน้าวาง</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">เลือกผ้าจากอัลบั้ม</p>
          <FabricAlbum onPick={(f) => { setPick(f); setName(`แผน ${f.name}`); }} />
        </div>
      )}
    </ERPModal>
  );
}
