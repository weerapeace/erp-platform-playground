"use client";
/**
 * ProductDriveFiles — กล่อง "ไฟล์แนบ" ของสินค้า (Parent SKU / SKU ลูก) ที่เก็บใน Google Drive
 *   ไฟล์ใหญ่ได้ถึง 5GB (เดิม Supabase 50MB) · มีแถบความคืบหน้า · ภาพตัวอย่างเท่าที่ Drive ทำให้ (รูป · PDF · PSD · AI)
 *   "เลือกจากโฟลเดอร์กลาง" = DriveFilePicker → สร้างทางลัดในโฟลเดอร์สินค้า (ไฟล์จริงอยู่ที่เดียว)
 *   เอาออก = ทางลัด → ลบแค่ทางลัด · ไฟล์ที่อัปเอง → ถังขยะ Drive (กู้ได้) · ไม่แตะไฟล์กลางเด็ดขาด
 *   ไฟล์เดิมที่เคยแนบ (Supabase) โชว์ต่อด้านล่างพร้อมป้าย "ไฟล์เดิม" — เปิด/ลบได้ ไม่รับอัปเพิ่ม
 *   ยังไม่ได้เชื่อม Drive = กลับไปใช้ช่องไฟล์แนบเดิม (RecordFilesField) ทั้งหมด
 * ประกอบจากของกลาง: DriveUploadBox · DriveFolderFiles(thumbs) · DriveFilePicker · ImageLightbox · ConfirmDialog · RecordFilesField
 *   Parent SKU: กลุ่ม "จากใบงานออกแบบ" = ไฟล์ในโฟลเดอร์ Drive ของใบงานที่ผูก Parent นี้ (ดูอย่างเดียว · อ่านสด ไม่ก๊อป · เจ้าของขอ 2026-11-20)
 * API: /api/product-drive/[entity]/[id] (+ /link, /files/[fileId], /sheets) · ใช้ที่: MasterCRUD (fileAttachments.storage="drive") · doc: docs/product-drive-files.md
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { ConfirmDialog } from "@/components/modal";
import { ImageLightbox } from "@/components/image-lightbox";
import { DriveUploadBox } from "@/components/drive-upload-box";
import { DriveFolderFiles, driveThumbUrl, type DriveFile } from "@/components/drive-folder-files";
import { DriveFilePicker } from "@/components/drive-file-picker";
import { RecordFilesField } from "@/components/record-files";

export type ProductDriveEntity = "parent_skus_v2" | "skus_v2";

const SHORTCUT = "application/vnd.google-apps.shortcut";

async function readJson(res: Response): Promise<{ data?: unknown; error?: string | null }> {
  const t = await res.text();
  try { return t ? JSON.parse(t) : {}; } catch { return { error: t.slice(0, 120) || `HTTP ${res.status}` }; }
}

export function ProductDriveFiles({ entity, entityId, canEdit, actor, title = "ไฟล์แนบ" }: {
  entity: ProductDriveEntity;
  entityId: string;
  canEdit: boolean;
  actor?: string;
  title?: string;
}) {
  const toast = useToast();
  const base = `/api/product-drive/${entity}/${entityId}`;
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [delTarget, setDelTarget] = useState<DriveFile | null>(null);
  const [lightbox, setLightbox] = useState(-1);
  type SheetFiles = { id: string; code: string | null; name: string | null; folder_url: string; files: DriveFile[] };
  const [sheetFiles, setSheetFiles] = useState<SheetFiles[]>([]);
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [sheetBox, setSheetBox] = useState<{ images: DriveFile[]; index: number } | null>(null);
  useEffect(() => {
    if (entity !== "parent_skus_v2") return;
    let alive = true;
    apiFetch(`${base}/sheets`).then(readJson).then((j) => {
      if (!alive) return;
      setSheetFiles(((j.data ?? {}) as { sheets?: SheetFiles[] }).sheets ?? []);
      setSheetErr(j.error ?? null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [base, entity]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await readJson(await apiFetch(base));
      const d = (j.data ?? {}) as { configured?: boolean; folder_url?: string | null; brand_id?: string | null; files?: DriveFile[] };
      setConfigured(d.configured !== false);
      setFolderUrl(d.folder_url ?? null);
      setBrandId(d.brand_id ?? null);
      setFiles(d.files ?? []);
      setErr(j.error ?? null);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  const startUpload = async (file: File) => {
    const res = await apiFetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, mime: file.type, size: file.size }) });
    const j = await readJson(res);
    if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
    return j.data as { upload_url: string; folder_url: string };
  };

  const onPick = async (picked: DriveFile[], pickedBrand: string | null) => {
    setLinking(true);
    try {
      const res = await apiFetch(`${base}/link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_ids: picked.map((f) => f.id), brand_id: pickedBrand }) });
      const j = await readJson(res);
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      const d = j.data as { linked: number; skipped: number; failed: string[] };
      if (d.linked) toast.success(`แนบแล้ว ${d.linked} ไฟล์ (ทางลัดจากโฟลเดอร์กลาง)`);
      if (d.skipped) toast.info(`${d.skipped} ไฟล์แนบไว้แล้ว — ข้าม`);
      if (d.failed.length) toast.error(`แนบไม่ได้: ${d.failed.join(", ")}`);
      setPickOpen(false);
      await load();
    } catch (e) { toast.error(`แนบไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setLinking(false); }
  };

  const doRemove = async () => {
    const f = delTarget; setDelTarget(null);
    if (!f) return;
    try {
      const res = await apiFetch(`${base}/files/${encodeURIComponent(f.id)}`, { method: "DELETE" });
      const j = await readJson(res);
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setFiles((cur) => cur.filter((x) => x.id !== f.id));
      toast.success(f.mimeType === SHORTCUT ? "เอาทางลัดออกแล้ว (ไฟล์กลางยังอยู่)" : "ย้ายไฟล์ลงถังขยะ Drive แล้ว (กู้คืนได้)");
    } catch (e) { toast.error(`เอาออกไม่สำเร็จ: ${(e as Error).message}`); }
  };

  const previewable = useMemo(() => files.filter((f) => f.hasThumbnail !== false || f.shortcutTargetId), [files]);

  // ยังไม่เชื่อม Drive = ช่องไฟล์แนบเดิม (Supabase) ทำงานเหมือนเดิมทุกอย่าง
  if (!loading && !configured) {
    return <RecordFilesField entityType={entity} entityId={entityId} actor={actor} readonly={!canEdit} title={title} />;
  }

  const badge = (f: DriveFile) => f.mimeType === SHORTCUT
    ? <span className="rounded bg-indigo-50 px-1.5 text-indigo-700">ลิงก์จากโฟลเดอร์กลาง</span>
    : <span className="rounded bg-slate-100 px-1.5 text-slate-600">อัปเอง</span>;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-700"><Icon name="folder" /> {title}</p>
          <p className="text-[11px] text-slate-400">เก็บใน Google Drive · ไฟล์ใหญ่ได้ถึง 5GB</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {canEdit && (
            <button type="button" onClick={() => setPickOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 hover:bg-indigo-100">
              <Icon name="folders" /> เลือกจากโฟลเดอร์กลาง
            </button>
          )}
          {folderUrl && (
            <a href={folderUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
              <Icon name="open" /> เปิดโฟลเดอร์
            </a>
          )}
        </div>
      </div>

      {err && <p className="text-[11px] text-amber-600">{err}</p>}

      <DriveUploadBox
        folderUrl={folderUrl}
        canUpload={canEdit}
        startUpload={startUpload}
        onUploaded={() => void load()}
        hint="หรือลากมาวาง · ไฟล์ใหญ่ได้ถึง 5GB · ขึ้นโฟลเดอร์ของสินค้านี้ใน Drive"
        list={
          <DriveFolderFiles files={files} loading={loading} thumbs title="ใน Drive"
            emptyText="ยังไม่มีไฟล์ — แนบไฟล์แรกหรือเลือกจากโฟลเดอร์กลาง แล้วระบบสร้างโฟลเดอร์ใน Drive ให้"
            badge={badge}
            onPreview={(f) => { const i = previewable.findIndex((x) => x.id === f.id); if (i >= 0) setLightbox(i); }}
            onRemove={canEdit ? setDelTarget : undefined} />
        }
      />

      {/* ไฟล์จากใบงานออกแบบที่ผูก Parent นี้ — ดูอย่างเดียว (อัป/ลบที่ใบงาน) */}
      {sheetFiles.map((sh) => {
        const pv = sh.files.filter((f) => f.hasThumbnail !== false || f.shortcutTargetId);
        return (
          <div key={sh.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-600">
              <Icon value="i:link" className="text-slate-400" />
              <span className="min-w-0 truncate">จากใบงานออกแบบ <b className="font-medium">{sh.code}</b> {sh.name}</span>
              <span className="flex-1" />
              <a href={`/master/design-dashboard/sheet/${sh.id}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline">เปิดใบงาน</a>
              <a href={sh.folder_url} target="_blank" rel="noreferrer" className="text-[11px] text-slate-500 hover:underline">เปิดโฟลเดอร์</a>
            </div>
            <DriveFolderFiles files={sh.files} loading={false} thumbs title={`${sh.files.length} ไฟล์ · ดูอย่างเดียว อัปเพิ่มที่ใบงาน`}
              onPreview={(f) => { const i = pv.findIndex((x) => x.id === f.id); if (i >= 0) setSheetBox({ images: pv, index: i }); }} />
          </div>
        );
      })}
      {sheetErr && <p className="text-[11px] text-amber-600">{sheetErr}</p>}

      {/* ไฟล์เดิมก่อนย้ายมา Drive — เปิด/ลบได้ ไม่รับอัปเพิ่ม · ไม่มี = ไม่โชว์ */}
      <RecordFilesField entityType={entity} entityId={entityId} actor={actor} readonly={!canEdit} noUpload hideWhenEmpty
        title="ไฟล์เดิม (เก็บที่เดิม ก่อนย้ายมา Drive)" />

      <DriveFilePicker open={pickOpen} onClose={() => setPickOpen(false)} brandId={brandId} busy={linking} onPick={onPick} />

      <ImageLightbox images={previewable.map((f) => ({ url: driveThumbUrl(f.id, 1600), label: f.name }))} index={lightbox}
        onClose={() => setLightbox(-1)} onIndex={setLightbox} />

      {sheetBox && (
        <ImageLightbox images={sheetBox.images.map((f) => ({ url: driveThumbUrl(f.id, 1600), label: f.name }))} index={sheetBox.index}
          onClose={() => setSheetBox(null)} onIndex={(i) => setSheetBox((b) => (b ? { ...b, index: i } : b))} />
      )}

      {delTarget && (
        <ConfirmDialog open variant="danger" title="เอาไฟล์ออก?"
          confirmText={delTarget.mimeType === SHORTCUT ? "เอาทางลัดออก" : "ย้ายลงถังขยะ"}
          message={delTarget.mimeType === SHORTCUT
            ? `เอาทางลัด "${delTarget.name}" ออกจากสินค้านี้ — ไฟล์จริงในโฟลเดอร์กลางยังอยู่ ไม่ถูกลบ`
            : `ย้าย "${delTarget.name}" ลงถังขยะของ Google Drive (กู้คืนได้จากถังขยะ Drive)`}
          onConfirm={doRemove} onClose={() => setDelTarget(null)} />
      )}
    </div>
  );
}
