"use client";
/**
 * 🖨 ไฟล์พิมพ์ (PNG ตัวจริง) ของลายในคลัง — ไฟล์เดียวกับที่หน้าจัดเรียงใช้ (lib/print-store · R2 nesting-prints/)
 *   - PrintFileSlot    — ช่องบนการ์ดลาย (คลังไฟล์ → รายละเอียด): ดู / อัป-แทนที่ / ใช้ไฟล์จาก Drive / ดาวน์โหลด
 *   - DrivePrintPicker — เลือก PNG จากโฟลเดอร์ Drive ของการ์ด → เซิร์ฟเวอร์คัดลอกเข้าคลัง (ไม่ต้องอัปซ้ำ)
 *                        ใช้ทั้งบนการ์ดลายและหน้าจัดเรียง (การ์ดลายที่ไฟล์ไม่อยู่ในเครื่อง)
 * อัป: ไฟล์เล็ก (≤ 4 MB) ผ่านเว็บ · ไฟล์ใหญ่ส่งตรงเข้า R2 (ลิงก์ชั่วคราว) · PNG เท่านั้น — PDF งานพิมพ์อยู่ Drive (lib/print-file-policy)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { useFileDrop } from "@/components/file-drop";
import { formatBytes } from "@/lib/assets";
import { withImageWidth } from "@/lib/r2-image";
import { SMALL_UPLOAD_BYTES } from "@/lib/media-upload-limits";
import { PRINT_SOURCE_PNG_ONLY, isPngBytes } from "@/lib/print-file-policy";
import type { AssetPrintInfo, DrivePng } from "@/app/api/assets/[id]/print-file/route";
import type { PrintFile } from "@/lib/print-store";

export type { PrintFile };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await apiFetch(path, init);
  const j = (await r.json().catch(() => ({}))) as { data?: T; error?: string | null };
  if (!r.ok || j.error) throw new Error(j.error || `(${r.status})`);
  return j.data as T;
}

/** อ่านข้อมูลไฟล์พิมพ์ของลาย (drive = รวมรายการ PNG ในโฟลเดอร์ Drive ของการ์ด) */
export const getAssetPrintInfo = (assetId: string, drive = false) =>
  call<AssetPrintInfo>(`/api/assets/${assetId}/print-file${drive ? "?drive=1" : ""}`);

/** คัดลอก PNG จาก Drive ของการ์ดเข้าคลัง → ไฟล์ที่ผูกกับลายแล้ว */
export const copyPrintFromDrive = async (assetId: string, fileId: string) =>
  (await call<{ file: PrintFile }>(`/api/assets/${assetId}/print-file`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "from_drive", file_id: fileId }) })).file;

/** อัป PNG เป็นไฟล์พิมพ์ของลาย (เล็ก = ผ่านเว็บ · ใหญ่ = ส่งตรงเข้าคลัง) */
async function uploadPrint(assetId: string, file: File, onProgress: (pct: number) => void): Promise<PrintFile> {
  const path = `/api/assets/${assetId}/print-file`;
  if (file.size <= SMALL_UPLOAD_BYTES) {
    const fd = new FormData();
    fd.append("file", file, file.name);
    return (await call<{ file: PrintFile }>(path, { method: "POST", body: fd })).file;
  }
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const up = await call<{ exists: boolean; put_url: string | null }>(path, json({ action: "open", sha }));
  if (!up.exists && up.put_url) {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", up.put_url!);
      xhr.setRequestHeader("Content-Type", "image/png");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`(${xhr.status})`)));
      xhr.onerror = () => reject(new Error("ส่งไฟล์เข้าคลังไม่สำเร็จ — เน็ตหลุด หรือที่เก็บไฟล์ไม่ยอมรับ"));
      xhr.send(file);
    });
  }
  return (await call<{ file: PrintFile }>(path, json({ action: "confirm", sha, name: file.name }))).file;
}

export function PrintFileSlot({ assetId, previewUrl, readOnly = false, onChanged }: {
  assetId: string;
  previewUrl?: string | null;     // รูปการ์ด (ใช้เป็นรูปย่อ — ไม่โหลด PNG ตัวจริงที่อาจใหญ่มาก)
  readOnly?: boolean;
  onChanged?: (file: PrintFile) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [info, setInfo] = useState<AssetPrintInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setInfo(await getAssetPrintInfo(assetId)); } catch (e) { setErr((e as Error).message); }
  }, [assetId]);
  useEffect(() => { void load(); }, [load]);

  const saved = (file: PrintFile, msg: string) => {
    toast.success(msg);
    onChanged?.(file);
    void load();
  };
  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!isPngBytes(head)) { toast.error(t(PRINT_SOURCE_PNG_ONLY.th, PRINT_SOURCE_PNG_ONLY.en)); return; }
    setBusy(t("กำลังอัป…", "Uploading…"));
    try {
      const f = await uploadPrint(assetId, file, (p) => setBusy(t(`กำลังส่งเข้าคลัง ${p}%`, `Sending to the library ${p}%`)));
      saved(f, t("เก็บไฟล์พิมพ์เข้าคลังแล้ว — หน้าจัดเรียงทุกเครื่องใช้ไฟล์นี้ได้เลย", "Print file saved — every computer's nesting page can use it now"));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const drop = useFileDrop((files) => void upload(files[0]), { accept: "image/png", disabled: readOnly || !!busy });

  const has = !!info?.file && info.exists;
  const chip = has
    ? <span className="ml-auto rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">{t("มีในคลังแล้ว", "In the library")}</span>
    : <span className="ml-auto rounded-md bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{t("ยังไม่มี", "None yet")}</span>;
  const btn = "h-7 px-2.5 text-[11px] border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1";

  return (
    <div className="mt-3 pt-3 border-t border-slate-100" {...(readOnly ? {} : drop.zone("print"))}>
      <p className="text-[12px] font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
        🖨 {t("ไฟล์พิมพ์ (PNG ตัวจริง)", "Print file (real PNG)")}
        <span className="text-[10px] font-normal text-slate-400">{t("— หน้าจัดเรียงใช้ไฟล์นี้ทุกเครื่อง", "— the nesting page uses this file on every computer")}</span>
        {info && chip}
      </p>
      {err && <p className="text-[11px] text-rose-600">{err}</p>}
      {!info && !err && <p className="text-[11px] text-slate-400">{t("กำลังโหลด…", "Loading…")}</p>}

      {info && has && (
        <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-2">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {previewUrl ? <img src={withImageWidth(previewUrl, 96) ?? previewUrl} alt="" className="h-full w-full object-contain" /> : <span className="text-slate-300">🖨</span>}
          </span>
          <div className="min-w-0 text-[12px]">
            <div className="truncate font-medium text-slate-700" title={info.file!.name}>{info.file!.name}</div>
            <div className="text-slate-500">{formatBytes(info.file!.size)}</div>
            <div className="text-[11px] text-slate-400">
              {info.file!.saved_at && t(`เก็บเมื่อ ${new Date(info.file!.saved_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}`, `Saved ${new Date(info.file!.saved_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`)}
              {info.jobs > 0 && t(` · ใช้ใน ${info.jobs} งานจัดเรียง`, ` · used in ${info.jobs} nesting job(s)`)}
            </div>
          </div>
        </div>
      )}

      {info && !has && !readOnly && (
        <div onClick={() => input.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed px-3 py-3 text-center text-[12px] ${drop.over === "print" ? "border-violet-400 bg-violet-50" : "border-slate-300 text-slate-500 hover:border-slate-400"}`}>
          ⬆ {t("ลาก PNG มาวาง หรือคลิกเลือกไฟล์", "Drop a PNG here or click to choose")}
          <div className="text-[11px] text-slate-400">{t("PNG เท่านั้น · ไฟล์ใหญ่ได้ · PDF งานพิมพ์ไปที่ Drive", "PNG only · large files OK · print PDFs go to Drive")}</div>
        </div>
      )}
      {info && !has && readOnly && <p className="text-[11px] text-slate-400">{t("ยังไม่มีไฟล์พิมพ์", "No print file yet")}</p>}

      {info && (
        <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
          {!readOnly && has && <button type="button" className={btn} disabled={!!busy} onClick={() => input.current?.click()}>⇄ {t("แทนที่", "Replace")}</button>}
          {!readOnly && info.has_folder && <button type="button" className={btn} disabled={!!busy} onClick={() => setPickOpen(true)}>📁 {t("ใช้ไฟล์จาก Drive", "Use a file from Drive")}</button>}
          {has && info.get_url && <a href={info.get_url} target="_blank" rel="noreferrer" className={btn}>⬇ {t("ดาวน์โหลด", "Download")}</a>}
          {busy && <span className="text-[11px] text-sky-700">{busy}</span>}
        </div>
      )}
      <input ref={input} type="file" accept="image/png" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      {pickOpen && (
        <DrivePrintPicker assetId={assetId} onClose={() => setPickOpen(false)}
          onPicked={(f) => { setPickOpen(false); saved(f, t("คัดลอกไฟล์จาก Drive เข้าคลังแล้ว", "Copied the file from Drive into the library")); }} />
      )}
    </div>
  );
}

/** เลือก PNG จากโฟลเดอร์ Drive ของการ์ด → คัดลอกเข้าคลัง (บอกว่าไฟล์ไหนเป็นไฟล์เดียวกับในคลัง / ซ้ำกันเอง) */
export function DrivePrintPicker({ assetId, title, onClose, onPicked }: {
  assetId: string;
  title?: string;
  onClose: () => void;
  onPicked: (file: PrintFile) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [info, setInfo] = useState<AssetPrintInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);

  useEffect(() => {
    getAssetPrintInfo(assetId, true).then(setInfo).catch((e) => setErr((e as Error).message));
  }, [assetId]);

  const pick = async (f: DrivePng) => {
    setCopying(f.id);
    try { onPicked(await copyPrintFromDrive(assetId, f.id)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setCopying(null); }
  };

  const files = info?.drive?.files ?? [];
  const seen = new Map<string, number>();
  const rows = files.map((f, i) => {
    const first = f.sha ? seen.get(f.sha) : undefined;
    if (f.sha && first === undefined) seen.set(f.sha, i);
    return { f, same: first === undefined && !!f.sha && info?.file?.sha === f.sha && info.exists, dupOf: first };
  });

  return (
    <ERPModal open onClose={onClose} size="md" title={`📁 ${t("ใช้ไฟล์จาก Drive", "Use a file from Drive")}${title ? ` · ${title}` : ""}`}>
      <p className="mb-2 text-[12px] text-slate-500">{t("เลือก PNG จากโฟลเดอร์ Drive ของลายนี้ — ระบบคัดลอกเข้าคลังให้ ไม่ต้องอัปซ้ำ", "Pick a PNG from this artwork's Drive folder — it's copied into the library, no re-upload needed")}</p>
      {err && <p className="text-[12px] text-rose-600">{err}</p>}
      {!info && !err && <p className="text-[12px] text-slate-400">{t("กำลังอ่านโฟลเดอร์ Drive…", "Reading the Drive folder…")}</p>}
      {info && !info.has_folder && <p className="text-[12px] text-slate-500">{t("ลายนี้ยังไม่มีโฟลเดอร์ Drive — เพิ่มได้ที่การ์ดลายในคลังไฟล์ (ไฟล์ต้นฉบับบน Drive)", "This artwork has no Drive folder yet — add one on its library card (Source files on Drive)")}</p>}
      {info && info.has_folder && info.drive && !info.drive.configured && <p className="text-[12px] text-slate-500">{t("ยังไม่ได้ตั้งค่า Google Drive", "Google Drive is not set up")}</p>}
      {info && info.has_folder && info.drive?.configured && !files.length && <p className="text-[12px] text-slate-500">{t("ในโฟลเดอร์ไม่มีไฟล์ PNG", "There are no PNG files in the folder")}</p>}
      <div className="divide-y divide-slate-100">
        {rows.map(({ f, same, dupOf }) => (
          <div key={f.id} className="flex items-center gap-2.5 py-2 text-[12px]">
            <span className="text-slate-400">🖼</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-slate-700" title={f.name}>{f.name}</span>
              <span className="text-[11px] text-slate-400">
                {f.size != null ? formatBytes(f.size) : ""}{f.modified ? ` · ${new Date(f.modified).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}` : ""}
              </span>
            </span>
            {dupOf !== undefined ? <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{t("ซ้ำกับไฟล์ด้านบน", "Duplicate of a file above")}</span>
              : same ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">{t("ไฟล์เดียวกับในคลัง", "Same as the library file")}</span>
              : (
                <button type="button" onClick={() => void pick(f)} disabled={!!copying}
                  className="h-7 shrink-0 rounded-md border border-violet-300 bg-violet-50 px-2.5 text-[11px] text-violet-700 hover:bg-violet-100 disabled:opacity-50">
                  {copying === f.id ? t("กำลังคัดลอก…", "Copying…") : t("ใช้ไฟล์นี้", "Use this file")}
                </button>
              )}
          </div>
        ))}
      </div>
    </ERPModal>
  );
}
