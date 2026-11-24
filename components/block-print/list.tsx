"use client";
/**
 * 🧱 บล็อกพิมพ์ — หน้ารายการงาน (/master/block-print)
 *   ปุ่ม "เปิดไฟล์ .ai" → อ่านไฟล์ในเบราว์เซอร์ (lib/block-print-ai) → สร้างงาน → ไปหน้าทำงาน
 *   ตารางกลาง DataTable · ลบ = ย้ายเข้าถังขยะ (ย้อนกลับได้ทันทีจากแจ้งผล) · ถังขยะ: กู้คืน / ลบถาวร (พิมพ์ชื่อยืนยัน)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { AI_ACCEPT, readAiFile } from "@/lib/block-print-ai";
import { API, api, jobHref, nameFromFile, skippedNote, thaiDate, type Job, type JobRow } from "./shared";

export const SKIPPED_KEY = (id: string) => `block-print-skipped:${id}`;

export function BlockPrintList() {
  const router = useRouter();
  const toast = useToast();
  const canEdit = usePermission("block_print.edit");
  const fileRef = useRef<HTMLInputElement>(null);
  const [trash, setTrash] = useState(false);
  const [rows, setRows] = useState<JobRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hardDel, setHardDel] = useState<JobRow | null>(null);

  const load = useCallback(async () => {
    setErr(null); setRows(null);
    try { setRows(await api<JobRow[]>(`${API}${trash ? "?trash=1" : ""}`)); }
    catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [trash]);
  useEffect(() => { void load(); }, [load]);

  const openFile = async (file: File) => {
    setBusy(`กำลังอ่านไฟล์ ${file.name}…`);
    try {
      const res = await readAiFile(file);
      if (!res.pieces.length) {
        const notes = skippedNote(res.skipped);
        throw new Error(`ไม่พบชิ้นเวกเตอร์ที่เติมสีในไฟล์นี้${notes.length ? ` · ${notes[0]}` : ""}`);
      }
      setBusy("กำลังสร้างงาน…");
      const job = await api<Job>(API, { json: { name: nameFromFile(file.name), source_file_name: file.name, unit: "cm", paper: "A4", pieces: res.pieces } });
      try { sessionStorage.setItem(SKIPPED_KEY(job.id), JSON.stringify({ ...res.skipped, pages: res.pages })); } catch { /* ไม่มีที่จำ */ }
      router.push(jobHref(job.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เปิดไฟล์ไม่สำเร็จ");
      setBusy(null);
    }
  };

  const archive = async (r: JobRow) => {
    try {
      await api(`${API}/${r.id}`, { method: "DELETE" });
      setRows((cur) => cur?.filter((x) => x.id !== r.id) ?? cur);
      toast.undo(`ย้าย ${r.code} เข้าถังขยะแล้ว`, async () => {
        try { await api(`${API}/${r.id}`, { method: "PATCH", json: { is_active: true } }); await load(); }
        catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };
  const restore = async (r: JobRow) => {
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

  const columns = useMemo<ColumnDef<JobRow>[]>(() => [
    { accessorKey: "code", header: "รหัส", size: 100, cell: ({ row }) => <span className="font-mono text-xs text-slate-600">{row.original.code}</span> },
    { accessorKey: "name", header: "ชื่องาน", size: 260, cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.name}</span> },
    { accessorKey: "piece_on", header: "ชิ้นที่ส่งออก", size: 110, cell: ({ row }) => <span>{row.original.piece_on} / {row.original.piece_count}</span> },
    { accessorKey: "paper", header: "กระดาษ", size: 80 },
    { accessorKey: "source_file_name", header: "ไฟล์ต้นฉบับ", size: 220, cell: ({ row }) => <span className="text-xs text-slate-500">{row.original.source_file_name ?? "—"}</span> },
    { accessorKey: trash ? "deleted_at" : "updated_at", header: trash ? "ลบเมื่อ" : "แก้ล่าสุด", size: 150, cell: ({ row }) => <span className="text-xs text-slate-500">{thaiDate(trash ? row.original.deleted_at : row.original.updated_at)}</span> },
  ], [trash]);

  const rowActions = trash
    ? (canEdit ? [
        { id: "restore", label: "กู้คืน", onClick: (r: JobRow) => void restore(r), variant: "success" as const },
        { id: "hard", label: "ลบถาวร", onClick: (r: JobRow) => setHardDel(r), variant: "danger" as const },
      ] : [])
    : [
        { id: "open", label: "เปิด", onClick: (r: JobRow) => router.push(jobHref(r.id)) },
        ...(canEdit ? [{ id: "trash", label: "ย้ายเข้าถังขยะ", onClick: (r: JobRow) => void archive(r), variant: "danger" as const }] : []),
      ];

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900"><Icon name="ruler" /> บล็อกพิมพ์</h1>
          <p className="mt-1 text-sm text-slate-500">เปิดไฟล์ .ai → เลือกชิ้นเวกเตอร์ → ตั้งขนาดจริง → ส่งออก PDF (ลาย + เส้นบอกขนาด) ส่งโรงงานทำบล็อก</p>
        </div>
        <button type="button" onClick={() => setTrash((t) => !t)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${trash ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
          <Icon name="trash" /> {trash ? "กลับไปงานทั้งหมด" : "ถังขยะ"}
        </button>
        {canEdit && !trash && (
          <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            <Icon name="upload" /> {busy ? "กำลังเปิด…" : "เปิดไฟล์ .ai"}
          </button>
        )}
        <input ref={fileRef} type="file" accept={AI_ACCEPT} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void openFile(f); }} />
      </div>

      {busy && <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">{busy}</div>}
      {trash && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">ถังขยะ — งานที่ลบไว้ กู้คืนได้ · ลบถาวรแล้วกู้ไม่ได้</div>}

      <DataTable<JobRow>
        tableId={trash ? "block-print-trash" : "block-print-jobs"}
        data={rows ?? []}
        columns={columns}
        loading={rows === null && !err}
        error={err ?? undefined}
        onRetry={() => void load()}
        emptyMessage={trash ? "ถังขยะว่าง" : canEdit ? "ยังไม่มีงาน — กด \"เปิดไฟล์ .ai\" เพื่อเริ่ม" : "ยังไม่มีงานบล็อกพิมพ์"}
        searchPlaceholder="ค้นรหัส / ชื่องาน / ชื่อไฟล์"
        searchableKeys={["code", "name", "source_file_name"]}
        rowActions={rowActions}
        onRowClick={trash ? undefined : (r) => router.push(jobHref(r.id))}
        pageSize={25}
        exportFilename="block-print-jobs"
        exportEntityType="block_print_jobs"
      />

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
