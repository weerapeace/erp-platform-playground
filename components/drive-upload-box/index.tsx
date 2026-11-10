"use client";

/**
 * DriveUploadBox — ของกลาง: กล่อง "ลากไฟล์มาวาง / กดแนบ → อัปขึ้นโฟลเดอร์ Google Drive" + รายการไฟล์ในโฟลเดอร์
 *   ไฟล์ใหญ่ได้ (AI / PSD / PDF ถึง 5GB) — ส่งทีละชิ้นผ่าน lib/drive-chunk-upload (เบราว์เซอร์ส่งตรงเข้า Google ไม่ได้เพราะ CORS)
 *   ประกอบจากของกลาง: useFileDrop (ลากวาง) · UploadProgress (แถบ % + ไฟล์ที่ n/ทั้งหมด) · DriveFolderFiles (ไฟล์ในโฟลเดอร์)
 *
 * ใช้: <DriveUploadBox folderUrl={…} startUpload={(file) => …} onUploaded={…} />
 *   startUpload = ให้ API ของโมดูลนั้น หา/สร้างโฟลเดอร์ + เปิด resumable session → คืน { upload_url, folder_url }
 *     (โมดูลคุมเองว่าโฟลเดอร์อยู่ไหน + ใครอัปได้ + ลงประวัติ — เช่น /api/design-sheets/[id]/drive)
 * ใช้ที่: ใบงานออกแบบ (แท็บข้อมูลงาน) · doc: docs/drive-upload-box.md
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { DriveFolderFiles } from "@/components/drive-folder-files";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { uploadFileToDrive } from "@/lib/drive-chunk-upload";

export type DriveUploadStart = { upload_url: string; folder_url: string };

export function DriveUploadBox({ folderUrl, startUpload, onUploaded, canUpload = true, title, hint, emptyText }: {
  /** ลิงก์โฟลเดอร์ที่รู้อยู่แล้ว (โชว์รายการไฟล์) · ว่าง = ยังไม่มี (สร้างตอนอัปไฟล์แรก) */
  folderUrl?: string | null;
  /** เริ่มอัป 1 ไฟล์: หา/สร้างโฟลเดอร์ + เปิด session ที่ API ของโมดูล · โยน Error = แจ้งข้อความนั้น */
  startUpload: (file: File) => Promise<DriveUploadStart>;
  /** อัปเสร็จ (อย่างน้อย 1 ไฟล์) — folderUrl = โฟลเดอร์ที่ไฟล์ลงไป */
  onUploaded?: (info: { folderUrl: string; count: number }) => void;
  /** false = ดูรายการไฟล์ได้อย่างเดียว */
  canUpload?: boolean;
  title?: string;
  /** ข้อความข้างปุ่มแนบ (บอกชนิด/ขนาดไฟล์) */
  hint?: string;
  emptyText?: string;
}) {
  const t = useT();
  const toast = useToast();
  const [folder, setFolder] = useState<string | null>(folderUrl ?? null);
  const [reloadKey, setReloadKey] = useState(0);
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (folderUrl) setFolder(folderUrl); }, [folderUrl]);

  const uploadFiles = async (files: File[]) => {
    const list = files.filter((f) => f.size > 0);
    if (!list.length) return;
    let ok = 0;
    let lastFolder = folder;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      setUp({ name: f.name, size: f.size, pct: 0, label: t("กำลังอัปขึ้น Drive", "Uploading to Drive"), count: { current: i + 1, total: list.length } });
      try {
        const s = await startUpload(f);
        lastFolder = s.folder_url || lastFolder;
        await uploadFileToDrive(f, s.upload_url, (sent, total) => setUp((u) => (u ? { ...u, pct: total ? Math.round((sent / total) * 100) : 0 } : u)));
        ok++;
      } catch (e) {
        toast.error(t(`อัป ${f.name} ไม่สำเร็จ: ${(e as Error).message}`, `Upload of ${f.name} failed: ${(e as Error).message}`));
      }
    }
    setUp(null);
    if (ok) {
      toast.success(t(`อัปขึ้น Drive แล้ว ${ok} ไฟล์`, `Uploaded ${ok} file(s) to Drive`));
      if (lastFolder) setFolder(lastFolder);
      setReloadKey((k) => k + 1);
      if (lastFolder) onUploaded?.({ folderUrl: lastFolder, count: ok });
    }
  };
  const drop = useFileDrop((fs) => void uploadFiles(fs), {
    disabled: !canUpload || !!up,
    onBusy: () => toast.info(t("รออัปไฟล์ก่อนหน้าให้เสร็จก่อน", "Wait for the current upload to finish")),
  });

  return (
    <div className="flex flex-col gap-2">
      {folder
        ? <DriveFolderFiles folder={folder} title={title ?? t("ไฟล์ในโฟลเดอร์", "Files in the folder")} reloadKey={reloadKey} />
        : <p className="text-[11px] text-slate-400">{emptyText ?? t("ยังไม่มีไฟล์ — แนบไฟล์แรกแล้วระบบสร้างโฟลเดอร์ใน Drive ให้", "No files yet — the Drive folder is created with the first upload")}</p>}
      {canUpload && (
        <div {...drop.zone("files")} className="relative rounded-lg border border-dashed border-slate-300 p-3">
          <FileDropHint show={drop.over === "files"} label={t("วางไฟล์เพื่ออัปขึ้น Drive", "Drop to upload to Drive")} />
          {up ? <UploadProgress {...up} /> : (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-600 hover:bg-slate-50">
                <Icon name="upload" /> {t("แนบไฟล์", "Attach files")}
              </button>
              <span>{hint ?? t("หรือลากมาวาง · ไฟล์ใหญ่ได้ถึง 5GB", "or drag here · up to 5GB per file")}</span>
            </div>
          )}
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => { void uploadFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </div>
      )}
    </div>
  );
}
