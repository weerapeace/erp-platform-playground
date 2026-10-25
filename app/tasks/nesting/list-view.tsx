"use client";

/**
 * หน้ารายการ "จัดเรียงงานพิมพ์" — ตารางกลาง (DataTable) + ป้ายสถานะตัวช่วยในเครื่อง + วิธีติดตั้ง
 * กดแถว = เปิดหน้าจัดเรียง (/tasks/nesting/<id>) · งานใหม่ = /tasks/nesting/new
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useT, useLang } from "@/components/i18n";
import { useAuth } from "@/components/auth";
import { StandaloneShell } from "@/components/standalone-shell";
import { DataTable } from "@/components/data-table";
import { ConfirmDialog } from "@/components/modal";
import { usePushToast } from "@/components/toast";
import { HelperChip, HelperSetupCard, useHelperStatus } from "./helper-status";
import { deleteNestingJob, listNestingJobs, type NestingJobRow, type NestingStatus } from "./data";
import { fmtLen, type Unit } from "./nest-utils";

export const STATUS_STYLE: Record<NestingStatus, { th: string; en: string; cls: string }> = {
  draft: { th: "ร่าง", en: "Draft", cls: "bg-blue-50 text-blue-700" },
  done: { th: "เสร็จ", en: "Done", cls: "bg-emerald-50 text-emerald-700" },
  printed: { th: "ส่งพิมพ์แล้ว", en: "Sent to print", cls: "bg-purple-50 text-purple-700" },
};

export function NestingListView() {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const { can } = useAuth();
  const toast = usePushToast();
  const { status, recheck } = useHelperStatus();
  const [rows, setRows] = useState<NestingJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [delTarget, setDelTarget] = useState<NestingJobRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try { setRows(await listNestingJobs()); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const columns = useMemo<ColumnDef<NestingJobRow>[]>(() => [
    {
      id: "name", accessorKey: "name", header: t("ชื่องาน", "Job name"), size: 260,
      cell: ({ row }) => <span className="font-medium text-slate-800">{row.original.name}</span>,
    },
    {
      id: "print_type", header: t("แผ่น", "Sheet"), size: 150,
      accessorFn: (r) => r.print_type ? `${r.print_type.code} ${r.print_type.name}` : "",
      cell: ({ row }) => {
        const s = row.original.settings as { sheet_width_mm?: number; sheet_height_mm?: number | null; unit?: Unit };
        const u: Unit = s.unit === "mm" ? "mm" : "cm";
        const size = s.sheet_width_mm ? `${fmtLen(s.sheet_width_mm, u, lang)} × ${s.sheet_height_mm ? fmtLen(s.sheet_height_mm, u, lang) : t("ม้วน", "roll")}` : "";
        return <span className="text-slate-600">{row.original.print_type?.code ?? ""} <span className="text-xs text-slate-400">{size}</span></span>;
      },
    },
    {
      id: "length", header: t("ยาวที่ใช้", "Length used"), size: 110,
      accessorFn: (r) => r.result?.used_length_mm ?? null,
      cell: ({ row }) => {
        const r = row.original.result;
        const u: Unit = (row.original.settings as { unit?: Unit }).unit === "mm" ? "mm" : "cm";
        return r ? <span>{fmtLen(r.used_length_mm, u, lang)}{r.sheets > 1 ? <span className="text-xs text-slate-400"> · {r.sheets} {t("แผ่น", "sheets")}</span> : null}</span>
          : <span className="text-slate-300">—</span>;
      },
    },
    {
      id: "pieces", header: t("ชิ้น", "Pieces"), size: 90,
      accessorFn: (r) => r.result?.placed ?? r.items.reduce((a, i) => a + i.qty, 0),
      cell: ({ row }) => {
        const r = row.original.result;
        return r ? <span>{r.placed}/{r.total}</span> : <span className="text-slate-400">{row.original.items.reduce((a, i) => a + i.qty, 0)}</span>;
      },
    },
    {
      id: "status", accessorKey: "status", header: t("สถานะ", "Status"), size: 120,
      meta: { filterable: true, filterType: "select", filterOptions: (Object.keys(STATUS_STYLE) as NestingStatus[]).map((k) => ({ value: k, label: lang === "en" ? STATUS_STYLE[k].en : STATUS_STYLE[k].th })) },
      cell: ({ row }) => {
        const st = STATUS_STYLE[row.original.status];
        return <span className={`rounded-md px-2 py-0.5 text-xs ${st.cls}`}>{lang === "en" ? st.en : st.th}</span>;
      },
    },
    {
      id: "published_at", accessorKey: "published_at", header: t("ส่งเข้าคลังงานพิมพ์", "In print library"), size: 150,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.published_at) return <span className="text-slate-300">—</span>;
        return (
          <span className="text-emerald-700">
            ✓ {new Date(r.published_at).toLocaleDateString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium" })}
            {r.drive_folder_url && (
              <a href={r.drive_folder_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ml-2 text-xs underline">Drive ↗</a>
            )}
          </span>
        );
      },
    },
    { id: "updated_by_name", accessorKey: "updated_by_name", header: t("แก้ล่าสุดโดย", "Last edited by"), size: 140 },
    {
      id: "updated_at", accessorKey: "updated_at", header: t("แก้ล่าสุด", "Last edited"), size: 150,
      cell: ({ row }) => <span className="text-slate-500">{new Date(row.original.updated_at).toLocaleString(lang === "en" ? "en-GB" : "th-TH", { dateStyle: "medium", timeStyle: "short" })}</span>,
    },
  ], [t, lang]);

  const confirmDelete = async () => {
    if (!delTarget) return;
    setDeleting(true);
    try {
      await deleteNestingJob(delTarget.id);
      toast("success", t(`ลบงาน "${delTarget.name}" แล้ว`, `Job "${delTarget.name}" deleted`));
      setDelTarget(null);
      void load();
    } catch (e) { toast("error", (e as Error).message); } finally { setDeleting(false); }
  };

  return (
    <StandaloneShell title={t("จัดเรียงงานพิมพ์", "Print nesting")} icon="✂️" accent="violet">
      <div className="border-b border-slate-200 bg-white px-8 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("จัดเรียงงานพิมพ์", "Print nesting")}</h1>
            <p className="mt-1 text-slate-500">{t("จัดภาพลงแผ่นพิมพ์ตามเส้นขอบจริงให้เปลืองแผ่นน้อยที่สุด แล้วส่งออก PDF/EPS พร้อมเส้นตัด",
              "Nest artwork on print sheets by its real outline to save material, then export PDF/EPS with cut lines")}</p>
          </div>
          <div className="flex items-center gap-3">
            <HelperChip status={status} />
            {can("nesting.run") && (
              <button type="button" onClick={() => router.push("/tasks/nesting/new")}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
                + {t("งานใหม่", "New job")}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-5 px-8 py-6">
        <HelperSetupCard status={status} onRecheck={() => void recheck()} />
        <DataTable<NestingJobRow>
          tableId="nesting-jobs"
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={() => void load()}
          searchableKeys={["name", "updated_by_name"]}
          searchPlaceholder={t("ค้นชื่องาน / คนแก้", "Search job name / editor")}
          emptyMessage={t("ยังไม่มีงานจัดเรียง — กด “+ งานใหม่” เพื่อเริ่ม", "No nesting jobs yet — press “+ New job” to start")}
          views={[
            { id: "all", label: t("ทั้งหมด", "All") },
            { id: "draft", label: t("ร่าง", "Draft"), filter: (r) => r.status === "draft" },
            { id: "done", label: t("เสร็จ", "Done"), filter: (r) => r.status === "done" },
            { id: "printed", label: t("ส่งพิมพ์แล้ว", "Sent to print"), filter: (r) => r.status === "printed" },
          ]}
          onRowClick={(r) => router.push(`/tasks/nesting/${r.id}`)}
          rowActions={[
            { id: "open", label: t("เปิด", "Open"), onClick: (r) => router.push(`/tasks/nesting/${r.id}`) },
            ...(can("nesting.delete") ? [{ id: "delete", label: t("ลบ", "Delete"), variant: "danger" as const, onClick: (r: NestingJobRow) => setDelTarget(r) }] : []),
          ]}
        />
      </div>
      <ConfirmDialog
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={() => void confirmDelete()}
        loading={deleting}
        variant="danger"
        title={t("ลบงานจัดเรียง", "Delete nesting job")}
        message={t(`ลบงาน "${delTarget?.name ?? ""}" ออกจากรายการ? (ไฟล์ PDF/EPS ที่ส่งออกไปแล้วไม่ถูกลบ)`,
          `Remove "${delTarget?.name ?? ""}" from the list? (PDF/EPS files already exported are kept)`)}
        confirmText={t("ลบ", "Delete")}
        cancelText={t("ยกเลิก", "Cancel")}
      />
    </StandaloneShell>
  );
}
