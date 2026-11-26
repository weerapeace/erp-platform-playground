"use client";
/**
 * 🧵 ไฟล์ปัก — หน้ารายการงาน (/master/embroidery)
 *   ปุ่ม "เปิดไฟล์โลโก้" → อ่านไฟล์ .ai/.pdf/.svg ในเบราว์เซอร์ (readArtFile ของบล็อกพิมพ์ — ได้สีพื้นด้วย) → ตั้งค่าตั้งต้น → สร้างงาน → ไปหน้าทำงาน
 *   ตารางกลาง DataTable · ลบ = ย้ายเข้าถังขยะ (ย้อนกลับได้จากแจ้งผล) · ถังขยะ: กู้คืน / ลบถาวร (พิมพ์รหัสยืนยัน)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ART_ACCEPT, readArtFile } from "@/lib/block-print-ai";
import { skippedNote } from "@/components/block-print/shared";
import { buildPlan, defaultSettings, startWidth, withSelection } from "@/lib/embroidery";
import type { BlockPiece } from "@/lib/block-print";
import { SelectStep, type PickResult } from "./select-step";
import { API, api, designHref, fmtCm, fmtNum, nameFromFile, planStats, thaiDate, type Design, type DesignRow } from "./shared";

export const SKIPPED_KEY = (id: string) => `embroidery-skipped:${id}`;

/** เปิดไฟล์ → ชิ้นทั้งหมด (ยังไม่เลือก — ไปขั้นเลือกส่วนที่จะปักต่อ) · ใช้ทั้งสร้างงานใหม่และ "เปิดไฟล์ใหม่" ในหน้าทำงาน */
export async function readLogoFile(file: File) {
  const res = await readArtFile(file);
  const pieces = res.pieces.filter((p) => p.kind !== "background");
  if (!pieces.length) {
    const notes = skippedNote(res.skipped);
    throw new Error(`ไม่พบส่วนที่เติมสีในไฟล์นี้${notes.length ? ` · ${notes[0]}` : ""}`);
  }
  return { pieces, skipped: res.skipped, pages: res.pages };
}

export function EmbroideryList({ parentId }: { parentId?: string } = {}) {
  const router = useRouter();
  const toast = useToast();
  const canEdit = usePermission("embroidery.edit");
  const fileRef = useRef<HTMLInputElement>(null);
  const [trash, setTrash] = useState(false);
  const [rows, setRows] = useState<DesignRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hardDel, setHardDel] = useState<DesignRow | null>(null);
  const [pending, setPending] = useState<{ file: File; pieces: BlockPiece[]; skipped: unknown } | null>(null);

  const load = useCallback(async () => {
    setErr(null); setRows(null);
    const qs = new URLSearchParams();
    if (trash) qs.set("trash", "1");
    if (parentId) qs.set("parent", parentId);
    try { setRows(await api<DesignRow[]>(`${API}${qs.size ? `?${qs}` : ""}`)); }
    catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [trash, parentId]);
  useEffect(() => { void load(); }, [load]);

  const openFile = async (file: File) => {
    setBusy(`กำลังอ่านไฟล์ ${file.name}…`);
    try {
      const r = await readLogoFile(file);
      setPending({ file, pieces: r.pieces, skipped: r.skipped });
      setBusy(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เปิดไฟล์ไม่สำเร็จ");
      setBusy(null);
    }
  };

  /** หลังเลือกส่วน → สร้างงาน 1 งาน หรือแยกตามกลุ่ม */
  const createFrom = async (r: PickResult) => {
    const p = pending; if (!p) return;
    setPending(null);
    const sets = r.mode === "one" ? [{ ids: r.on, label: "" }] : r.sets;
    const base = nameFromFile(p.file.name);
    try {
      let firstId = "";
      for (let i = 0; i < sets.length; i++) {
        setBusy(`กำลังสร้างงาน ${sets.length > 1 ? `${i + 1}/${sets.length}` : ""}…`);
        const pieces = withSelection(p.pieces, sets[i].ids);
        const settings = defaultSettings(pieces, startWidth(pieces));
        const plan = buildPlan(pieces, settings);
        const name = sets.length > 1 ? `${base} – ${sets[i].label}` : base;
        const d = await api<Design>(API, { json: { name, source_file_name: p.file.name, parent_sku_id: parentId ?? null, pieces, settings, ...planStats(plan) } });
        if (!firstId) { firstId = d.id; try { sessionStorage.setItem(SKIPPED_KEY(d.id), JSON.stringify(p.skipped)); } catch { /* ไม่มีที่จำ */ } }
      }
      if (sets.length > 1) { toast.success(`สร้าง ${sets.length} งานแล้ว`); setBusy(null); await load(); }
      else router.push(designHref(firstId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้างงานไม่สำเร็จ");
      setBusy(null);
      void load();
    }
  };

  const archive = async (r: DesignRow) => {
    try {
      await api(`${API}/${r.id}`, { method: "DELETE" });
      setRows((cur) => cur?.filter((x) => x.id !== r.id) ?? cur);
      toast.undo(`ย้าย ${r.code} เข้าถังขยะแล้ว`, async () => {
        try { await api(`${API}/${r.id}`, { method: "PATCH", json: { is_active: true } }); await load(); }
        catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };
  const restore = async (r: DesignRow) => {
    try {
      await api(`${API}/${r.id}`, { method: "PATCH", json: { is_active: true } });
      setRows((cur) => cur?.filter((x) => x.id !== r.id) ?? cur);
      toast.success(`กู้คืน ${r.code} แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); }
  };
  const destroy = async () => {
    const r = hardDel; if (!r) return;
    try {
      await api(`${API}/${r.id}?hard=1`, { method: "DELETE" });
      setRows((cur) => cur?.filter((x) => x.id !== r.id) ?? cur);
      toast.success(`ลบ ${r.code} ถาวรแล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    setHardDel(null);
  };

  const columns = useMemo<ColumnDef<DesignRow>[]>(() => [
    { accessorKey: "code", header: "รหัส", size: 100, cell: ({ row }) => <span className="font-mono text-xs text-slate-600">{row.original.code}</span> },
    { accessorKey: "name", header: "ชื่องาน", size: 240, cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.name}</span> },
    { id: "size", header: "ขนาด (ซม.)", size: 110, cell: ({ row }) => <span>{fmtCm(row.original.width_mm)} × {fmtCm(row.original.height_mm)}</span> },
    { accessorKey: "stitch_count", header: "ฝีเข็ม", size: 90, cell: ({ row }) => <span>{fmtNum(row.original.stitch_count)}</span> },
    { accessorKey: "color_count", header: "สี", size: 60 },
    { id: "parent", header: "สินค้า", size: 180, cell: ({ row }) => <span className="text-xs text-slate-600">{row.original.parent ? `${row.original.parent.code} ${row.original.parent.name}` : "—"}</span> },
    { accessorKey: trash ? "deleted_at" : "updated_at", header: trash ? "ลบเมื่อ" : "แก้ล่าสุด", size: 150, cell: ({ row }) => <span className="text-xs text-slate-500">{thaiDate(trash ? row.original.deleted_at : row.original.updated_at)}</span> },
  ], [trash]);

  const rowActions = trash
    ? (canEdit ? [
        { id: "restore", label: "กู้คืน", onClick: (r: DesignRow) => void restore(r), variant: "success" as const },
        { id: "hard", label: "ลบถาวร", onClick: (r: DesignRow) => setHardDel(r), variant: "danger" as const },
      ] : [])
    : [
        { id: "open", label: "เปิด", onClick: (r: DesignRow) => router.push(designHref(r.id)) },
        ...(canEdit ? [{ id: "trash", label: "ย้ายเข้าถังขยะ", onClick: (r: DesignRow) => void archive(r), variant: "danger" as const }] : []),
      ];

  return (
    <div className={parentId ? "space-y-3" : "mx-auto max-w-6xl space-y-4 p-4 md:p-6"}>
      <div className="flex flex-wrap items-start gap-3">
        {!parentId && (
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900"><Icon name="thread" /> ไฟล์ปัก</h1>
            <p className="mt-1 text-sm text-slate-500">เปิดโลโก้ .ai / .pdf / .svg → ตั้งชนิดฝีเข็มตามสี + ขนาดจริง → ดูตัวอย่างฝีเข็ม → ดาวน์โหลดไฟล์ .DST ส่งร้านปัก</p>
          </div>
        )}
        {parentId && <div className="min-w-0 flex-1 text-sm text-slate-500">ไฟล์ปักของสินค้านี้</div>}
        <button type="button" onClick={() => setTrash((t) => !t)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${trash ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
          <Icon name="trash" /> {trash ? "กลับไปงานทั้งหมด" : "ถังขยะ"}
        </button>
        {canEdit && !trash && (
          <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            <Icon name="upload" /> {busy ? "กำลังเปิด…" : "เปิดไฟล์โลโก้"}
          </button>
        )}
        <input ref={fileRef} type="file" accept={ART_ACCEPT} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void openFile(f); }} />
      </div>

      {busy && <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">{busy}</div>}
      {trash && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">ถังขยะ — งานที่ลบไว้ กู้คืนได้ · ลบถาวรแล้วกู้ไม่ได้</div>}
      {!trash && !parentId && (
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ไฟล์ EPS: เปิดใน Illustrator แล้ว Save As เป็น PDF ก่อน · ตัวหนังสือต้อง Create Outlines · ไฟล์ที่แปลงอัตโนมัติควรให้ร้านปักทดสอบ 1 ชิ้นก่อนสั่งจริง
        </div>
      )}

      <DataTable<DesignRow>
        tableId={trash ? "embroidery-trash" : "embroidery-designs"}
        data={rows ?? []}
        columns={columns}
        loading={rows === null && !err}
        error={err ?? undefined}
        onRetry={() => void load()}
        emptyMessage={trash ? "ถังขยะว่าง" : canEdit ? "ยังไม่มีงาน — กด \"เปิดไฟล์โลโก้\" เพื่อเริ่ม" : "ยังไม่มีงานไฟล์ปัก"}
        searchPlaceholder="ค้นรหัส / ชื่องาน / ชื่อไฟล์"
        searchableKeys={["code", "name", "source_file_name"]}
        rowActions={rowActions}
        onRowClick={trash ? undefined : (r) => router.push(designHref(r.id))}
        pageSize={25}
        exportFilename="embroidery-designs"
        exportEntityType="embroidery_designs"
      />

      {pending && <SelectStep key={pending.file.name + pending.pieces.length} open pieces={pending.pieces} onCancel={() => setPending(null)} onDone={(r) => void createFrom(r)} />}

      <ConfirmDialog
        open={!!hardDel}
        onClose={() => setHardDel(null)}
        onConfirm={() => void destroy()}
        variant="danger"
        title="ลบงานนี้ถาวร?"
        message={<>ลบ <b>{hardDel?.code} {hardDel?.name}</b> ออกจากระบบถาวร กู้คืนไม่ได้ — พิมพ์รหัสงานเพื่อยืนยัน</>}
        confirmText="ลบถาวร"
        requireTyped={hardDel?.code}
      />
    </div>
  );
}
