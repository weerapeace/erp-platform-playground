"use client";

/**
 * หน้าต่าง "ส่งเข้าคลังงานพิมพ์" (เฟส 3) — ใช้ ERPModal กลาง
 *
 * 1) ตัวช่วยทำไฟล์ (PDF + รูปตัวอย่าง [+ EPS]) ตามตำแหน่งบนจอตอนนี้
 * 2) ERP เปิดช่องอัปโหลดในโฟลเดอร์ [ไฟล์ส่งร้านพิมพ์]/<YYYY-MM-DD>/<ประเภท> - <ชื่องาน> (เจ้าของสั่ง 2026-11-16)
 *    ปลายทางตั้งต้น = ของระบบ · เปลี่ยนเองได้ (วางลิงก์โฟลเดอร์ · จำในเครื่องนี้) · หาไม่เจอ = ให้เลือกใหม่ · ผู้ดูแลตั้งเป็นค่าเริ่มของทุกคนได้
 * 3) ตัวช่วยส่งไฟล์ขึ้น Drive ตรงจากเครื่อง (ไฟล์ใหญ่ได้ — ไม่ผ่านเซิร์ฟเวอร์ ERP ที่รับได้แค่ 4 MB)
 * 4) ERP ทับไฟล์รอบก่อน + สร้าง/อัปเดตการ์ดในคลังไฟล์ หมวดงานพิมพ์ + จำไว้ในงาน + ลิงก์แชร์ "ทุกคนที่มีลิงก์ดูได้" (คัดลอกให้เอง)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT, useLang } from "@/components/i18n";
import { ERPModal } from "@/components/modal";
import { downscaleImageWidth, shrinkImageToFit } from "@/lib/image-resize";
import { HELPER_DRIVE_VERSION, helperApi, helperFile, versionAtLeast, type DrivePush } from "@/lib/nesting-helper";
import {
  getDriveRoot, openDriveUploads, publishToLibrary, setDefaultDriveRoot, todayFolder,
  type DriveFolderRef, type DriveRootInfo, type PrintType, type PublishResult,
} from "./data";
import type { Placed } from "./sheet-view";
import { Icon } from "@/components/icon";

type ExportSheet = { pdf: string; preview?: string; eps?: string };
type Phase = "idle" | "export" | "drive" | "upload" | "card";

// ปลายทางที่เลือกเอง — จำในเครื่องนี้ (ความสะดวกรายคน · อ่านไม่ได้ = ใช้ตั้งต้นของระบบ)
const ROOT_PREF = "nesting-send-root";
const readRoot = (): DriveFolderRef | null => {
  try { const v = JSON.parse(localStorage.getItem(ROOT_PREF) ?? "null"); return v && typeof v.id === "string" ? v as DriveFolderRef : null; } catch { return null; }
};
const writeRoot = (v: DriveFolderRef | null) => { try { if (v) localStorage.setItem(ROOT_PREF, JSON.stringify(v)); else localStorage.removeItem(ROOT_PREF); } catch { /* ไม่จำ */ } };
/** ข้อความจากเซิร์ฟเวอร์เมื่อหาโฟลเดอร์ปลายทางไม่เจอ / ไม่มีสิทธิ์เขียน (publish-shared RootMissingError / RootNoWriteError) */
const ROOT_MISSING = "หาโฟลเดอร์ปลายทางบน Drive ไม่เจอ";
const NO_WRITE = "ระบบยังไม่มีสิทธิ์สร้างโฟลเดอร์ใน";

const CARD_MAX_BYTES = 3.5 * 1024 * 1024;   // รูปการ์ดอัปผ่านเซิร์ฟเวอร์ ERP (ลิมิต body ~4 MB)
const mb = (n: number) => (n / 1024 / 1024).toFixed(n >= 100 * 1024 * 1024 ? 0 : 1);

/** อ่านขนาดรูป (px) — ไว้เก็บลงการ์ด */
async function imageSize(f: File): Promise<{ width: number; height: number } | null> {
  try { const b = await createImageBitmap(f); const s = { width: b.width, height: b.height }; b.close(); return s; } catch { return null; }
}

export function PublishModal({
  open, onClose, jobName, printTypes, defaultPrintTypeId, helperVersion, hid, sheets, headerText, warn, publishedAt,
  ensureSaved, buildMeta, onPublished,
}: {
  open: boolean;
  onClose: () => void;
  jobName: string;
  printTypes: PrintType[];
  defaultPrintTypeId: string | null;
  helperVersion: string | null;          // null = ติดต่อตัวช่วยไม่ได้
  hid: string;                            // งานในตัวช่วย
  sheets: Placed[][];                     // ตำแหน่งบนจอตอนนี้ (รวมที่ลากแก้)
  headerText: boolean;
  warn: string | null;                    // มีชิ้นชิด/เลยขอบ
  publishedAt: string | null;
  ensureSaved: () => Promise<string | null>;   // บันทึกงานก่อนส่ง → id งาน (null = บันทึกไม่ได้)
  buildMeta: () => { sizes: unknown[]; print_items: unknown[] };
  onPublished: (r: PublishResult) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const [code, setCode] = useState("");
  const [folderName, setFolderName] = useState("");
  const [rootInfo, setRootInfo] = useState<DriveRootInfo | null>(null);
  const [pick, setPick] = useState<DriveFolderRef | null>(null);     // ปลายทางที่เลือกเอง (null = ตั้งต้นของระบบ)
  const [pickMissing, setPickMissing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [link, setLink] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [done, setDone] = useState<PublishResult | null>(null);
  const [copied, setCopied] = useState(false);
  const driveOn = rootInfo?.configured !== false;
  const [withPreview, setWithPreview] = useState(true);
  const [withEps, setWithEps] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [push, setPush] = useState<DrivePush | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const busy = phase !== "idle";
  const canPush = !!helperVersion && versionAtLeast(helperVersion, HELPER_DRIVE_VERSION);

  // เปิดหน้าต่าง → ประเภทตามงาน (ไม่มีใช้ตัวแรก) + ชื่อโฟลเดอร์ = ชื่องาน + ตรวจปลายทาง (ตั้งต้น / ที่จำไว้ในเครื่อง) ว่ายังอยู่
  useEffect(() => {
    if (!open) return;
    const pt = printTypes.find((p) => p.id === defaultPrintTypeId) ?? printTypes[0];
    setCode(pt?.code ?? "");
    setFolderName(jobName.trim());
    setPhase("idle"); setPush(null); setError(null); setDone(null); setCopied(false);
    setChanging(false); setLink(""); setLinkErr(null); setPickMissing(false);
    const mine = readRoot();
    setPick(mine);
    let alive = true;
    getDriveRoot(mine?.id).then((r) => {
      if (!alive) return;
      setRootInfo(r);
      if (mine && !r.folder) { setPickMissing(true); setPick(null); writeRoot(null); }   // โฟลเดอร์ที่จำไว้หายไป → ให้เลือกใหม่
      else if (mine && r.folder) setPick(r.folder);
    }).catch(() => { if (alive) setRootInfo(null); });
    return () => { alive = false; };
  }, [open, defaultPrintTypeId, printTypes, jobName]);

  const date = useMemo(() => todayFolder(), [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const nameOrDefault = folderName.trim() || jobName.trim() || t("งานพิมพ์", "Print job");
  const subName = code ? `${code} - ${nameOrDefault}` : nameOrDefault;
  const target = pick ?? (rootInfo?.default?.found ? rootInfo.default : null);
  const rootMissing = !pick && rootInfo?.configured && rootInfo.default && !rootInfo.default.found;
  const [noWrite, setNoWrite] = useState(false);   // ส่งแล้วเซิร์ฟเวอร์ตอบว่าเขียนไม่ได้ (เผื่อสิทธิ์เปลี่ยนหลังตรวจ)
  const cantWrite = !!target && (target.can_write === false || noWrite);
  const saEmail = rootInfo?.service_email ?? "";
  const [emailCopied, setEmailCopied] = useState(false);
  /** ตรวจปลายทางใหม่ (หลังเจ้าของไปแชร์สิทธิ์ใน Drive แล้ว) */
  const recheck = async () => {
    setLinkBusy(true); setNoWrite(false); setError(null);
    try {
      const r = await getDriveRoot(pick?.id);
      setRootInfo(r);
      if (pick && r.folder) setPick(r.folder);
    } catch (e) { setLinkErr((e as Error).message); } finally { setLinkBusy(false); }
  };
  const dest = [target?.name || t("(ยังไม่ได้เลือกโฟลเดอร์)", "(no folder chosen)"), date, subName];

  /** ตรวจลิงก์โฟลเดอร์ที่วาง → ใช้เป็นปลายทาง (จำในเครื่องนี้) */
  const applyLink = async () => {
    const v = link.trim();
    if (!v) { setLinkErr(t("วางลิงก์โฟลเดอร์ Google Drive ก่อน", "Paste a Google Drive folder link first")); return; }
    setLinkBusy(true); setLinkErr(null);
    try {
      const r = await getDriveRoot(v);
      if (!r.folder) { setLinkErr(t("หาโฟลเดอร์นี้ไม่เจอ หรือยังไม่ได้แชร์ให้ระบบ — ตรวจลิงก์อีกครั้ง", "Couldn't find this folder, or it isn't shared with the system — check the link")); return; }
      setPick(r.folder); writeRoot(r.folder); setPickMissing(false); setChanging(false); setLink(""); setNoWrite(false);
    } catch (e) { setLinkErr((e as Error).message); } finally { setLinkBusy(false); }
  };
  const useDefault = () => { setPick(null); writeRoot(null); setChanging(false); };
  const makeDefault = async () => {
    if (!pick) return;
    setLinkBusy(true); setLinkErr(null);
    try {
      const f = await setDefaultDriveRoot(pick.id);
      setRootInfo((r) => (r ? { ...r, default: { ...f, found: true, local_path: "" } } : r));
      setPick(null); writeRoot(null);
    } catch (e) { setLinkErr((e as Error).message); } finally { setLinkBusy(false); }
  };
  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); }
  };

  const send = async () => {
    setError(null);
    cancelled.current = false;
    try {
      const id = await ensureSaved();
      if (!id) return;
      setPhase("export");
      const ex = await helperApi<{ sheets: ExportSheet[] }>(`/api/jobs/${hid}/export`, lang, {
        method: "POST", body: { sheets, eps: withEps, job_name: jobName.trim(), header_text: headerText, lang },
      });
      const first = ex.sheets[0]?.preview;
      if (!first) throw new Error(t("ตัวช่วยไม่ได้ทำรูปตัวอย่างแผ่น — ลองกดส่งใหม่", "The helper didn't make a sheet preview — try sending again"));
      const files = ex.sheets.flatMap((s) => [s.pdf, withPreview ? s.preview : undefined, withEps ? s.eps : undefined])
        .filter((f): f is string => !!f);

      setPhase("drive");
      const where = { print_type_code: code, folder_name: nameOrDefault, date, root_folder_id: pick?.id ?? null };
      const up = await openDriveUploads(id, { ...where, files });

      setPhase("upload");
      let st = await helperApi<DrivePush>(`/api/jobs/${hid}/drive-push`, lang, {
        method: "POST", body: { uploads: up.uploads.map((u) => ({ file: u.key, url: u.upload_url })) },
      });
      setPush(st);
      while (st.state === "running") {
        await new Promise((r) => setTimeout(r, 800));
        st = await helperApi<DrivePush>(`/api/jobs/${hid}/drive-push`, lang);
        setPush(st);
      }
      if (st.state === "error") throw new Error(st.error || t("ส่งไฟล์ขึ้น Drive ไม่สำเร็จ", "Upload to Drive failed"));

      setPhase("card");
      const raw = await helperFile(`/api/jobs/${hid}/files/${first}`, lang, `${jobName.trim() || "print"}.png`);
      let preview = await downscaleImageWidth(raw, 1600);
      if (preview.size > CARD_MAX_BYTES) {   // แผ่นยาว/ลายแน่น → PNG ยังใหญ่ → ย่อเป็น WebP ให้ไม่เกินลิมิตอัปผ่านเซิร์ฟเวอร์
        const fit = await shrinkImageToFit(preview, CARD_MAX_BYTES);
        if (!fit) throw new Error(t("รูปตัวอย่างแผ่นใหญ่เกินไป ย่อไม่ได้ — แจ้งผู้ดูแล", "The sheet preview is too large to shrink — tell an admin"));
        preview = fit.file;
      }
      const dim = await imageSize(preview);
      const r = await publishToLibrary(id, preview, {
        ...where, file_ids: st.files.map((f) => f.id).filter(Boolean),
        ...buildMeta(), width: dim?.width, height: dim?.height,
      });
      setDone(r);
      if (r.share_url) void copyLink(r.share_url);   // คัดลอกลิงก์ให้เลย ส่งร้านพิมพ์ได้ทันที
      onPublished(r);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith(ROOT_MISSING)) { if (pick) { setPickMissing(true); setPick(null); writeRoot(null); } setChanging(true); }
      if (msg.startsWith(NO_WRITE)) setNoWrite(true);
      setError(cancelled.current ? t("ยกเลิกการส่งแล้ว", "Sending cancelled") : msg);
    } finally {
      setPhase("idle");
    }
  };

  const cancel = () => {
    if (phase === "upload") {
      cancelled.current = true;
      void helperApi(`/api/jobs/${hid}/drive-push/cancel`, lang, { method: "POST" }).catch(() => {});
    } else if (!busy) onClose();
  };

  const current = push?.files.find((f) => f.sent < f.size) ?? push?.files[push.files.length - 1];
  const pct = push && push.total > 0 ? Math.round((push.sent / push.total) * 100) : 0;
  const phaseText: Record<Exclude<Phase, "idle">, string> = {
    export: withEps ? t("กำลังทำไฟล์ PDF + EPS… (EPS ใช้ Illustrator ประมาณ 10–30 วินาที)", "Making the PDF + EPS… (EPS uses Illustrator, about 10–30 seconds)")
      : t("กำลังทำไฟล์ PDF…", "Making the PDF…"),
    drive: t("กำลังเตรียมโฟลเดอร์บน Drive…", "Preparing the Drive folder…"),
    upload: current ? t(`กำลังส่ง ${current.file} · ${mb(push!.sent)} / ${mb(push!.total)} MB`, `Uploading ${current.file} · ${mb(push!.sent)} / ${mb(push!.total)} MB`)
      : t("กำลังส่งไฟล์ขึ้น Drive…", "Uploading to Drive…"),
    card: t("กำลังสร้างการ์ดในคลังงานพิมพ์…", "Creating the card in the print library…"),
  };

  const blocked = !canPush
    ? (helperVersion
      ? t(`ตัวช่วยในเครื่องนี้ (v${helperVersion}) ยังส่งขึ้น Drive ไม่ได้ — คลิกขวาไอคอนกรรไกรข้างนาฬิกา → “ตรวจหาเวอร์ชันใหม่” (ต้อง v${HELPER_DRIVE_VERSION} ขึ้นไป)`,
        `The helper on this computer (v${helperVersion}) can't upload to Drive yet — right-click the scissors icon next to the clock → “Check for updates” (needs v${HELPER_DRIVE_VERSION} or later)`)
      : t("ติดต่อตัวช่วยในเครื่องนี้ไม่ได้", "Cannot reach the helper on this computer"))
    : !driveOn ? t("ยังไม่ได้ตั้งค่า Google Drive ของระบบ — แจ้งผู้ดูแล", "Google Drive isn't set up for the system yet — ask an admin")
      : !code ? t("ยังไม่มีประเภทงานพิมพ์ — ตั้งที่คลังไฟล์ → ปุ่มจัดการประเภทงานพิมพ์", "No print types yet — set them up in the file library → Manage print types button")
        : rootInfo && !target ? t("เลือกโฟลเดอร์ปลายทางก่อนส่ง", "Choose a destination folder before sending")
          : cantWrite ? t("ระบบยังเขียนลงโฟลเดอร์ปลายทางไม่ได้ — ดูวิธีแก้ด้านล่าง", "The system can't write to the destination folder yet — see below")
            : null;

  return (
    <ERPModal open={open} onClose={cancel} size="md" closeOnBackdrop={!busy} defaultExpanded={false}
      title={t("ส่งเข้าคลังงานพิมพ์", "Send to the print library")}
      description={t("ไฟล์ขึ้น Google Drive + ได้การ์ดในคลังไฟล์ หมวดงานพิมพ์", "Files go to Google Drive and a card appears in the file library's print section")}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancel} disabled={busy && phase !== "upload"}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">
            {phase === "upload" ? t("หยุดส่ง", "Stop upload") : done ? t("เสร็จ", "Done") : t("ยกเลิก", "Cancel")}
          </button>
          <button type="button" onClick={() => void send()} disabled={busy || !!blocked}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
            {busy ? t("กำลังส่ง…", "Sending…") : publishedAt ? t("ส่งใหม่ (ทับของเดิม)", "Send again (replace)") : t("ส่งเข้าคลัง", "Send to library")}
          </button>
        </div>
      }>
      <div className="space-y-4 text-sm">
        {blocked && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">{blocked}</div>}
        {publishedAt && !busy && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-800">
            {t(`งานนี้เคยส่งแล้วเมื่อ ${new Date(publishedAt).toLocaleString("th-TH")} — ส่งใหม่จะย้ายไฟล์เดิมที่ชื่อซ้ำลงถังขยะ Drive (กู้คืนได้ 30 วัน) และอัปเดตการ์ดเดิม`,
              `This job was sent on ${new Date(publishedAt).toLocaleString("en-GB")} — sending again moves the old files with the same names to the Drive trash (restorable for 30 days) and updates the same card`)}
          </div>
        )}
        {warn && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800"><Icon value="i:alert-triangle" className="mr-1" />{warn}</div>}

        <div>
          <div className="mb-1 text-xs text-slate-500">{t("ประเภทงานพิมพ์", "Print type")}</div>
          <div className="flex flex-wrap gap-2">
            {printTypes.map((p) => (
              <button key={p.id} type="button" disabled={busy} onClick={() => setCode(p.code)}
                className={`rounded-lg border px-3 py-1 text-xs ${p.code === code ? "border-violet-400 bg-violet-50 font-semibold text-violet-700" : "border-slate-300 text-slate-600"}`}>
                {p.code}{p.name && p.name !== p.code ? ` · ${p.name}` : ""}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs text-slate-500">{t("โฟลเดอร์ปลายทาง", "Destination folder")}</div>
          {(rootMissing || pickMissing) && !pick && (
            <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <Icon value="i:alert-triangle" className="mr-1" />{pickMissing ? t("หาโฟลเดอร์ที่เลือกไว้ไม่เจอ (ถูกย้าย/ลบ?) — เลือกโฟลเดอร์ใหม่", "The folder you chose earlier is gone (moved/deleted?) — choose a new one")
                : t("หาโฟลเดอร์ส่งร้านพิมพ์ตั้งต้นไม่เจอ (ถูกย้าย/เปลี่ยนชื่อ?) — เลือกโฟลเดอร์ใหม่ก่อนส่ง", "The default print-shop folder is missing (moved/renamed?) — choose a new one before sending")}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <Icon value="i:folder" className="mr-1" />{target ? target.name : rootInfo ? t("— ยังไม่ได้เลือก —", "— not chosen —") : t("กำลังตรวจ…", "Checking…")}
              {pick && <span className="ml-1 text-[11px] text-violet-600">{t("(เลือกเอง · จำในเครื่องนี้)", "(your choice · remembered here)")}</span>}
            </div>
            {target?.url && <a href={target.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-violet-700 underline">{t("เปิด", "Open")}</a>}
            <button type="button" disabled={busy} onClick={() => setChanging((v) => !v)}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {t("เปลี่ยน", "Change")}
            </button>
          </div>
          {cantWrite && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <div><Icon value="i:alert-triangle" className="mr-1" />{t(`ระบบเห็นโฟลเดอร์ "${target!.name}" แต่ยังไม่มีสิทธิ์สร้างโฟลเดอร์ข้างใน — ใน Google Drive คลิกขวาโฟลเดอร์นี้ → แชร์ → เพิ่มบัญชีด้านล่างเป็น "ผู้จัดการเนื้อหา" (Content manager) แล้วกด "ตรวจอีกครั้ง"`,
                `The system can see "${target!.name}" but can't create folders in it — in Google Drive right-click the folder → Share → add the account below as "Content manager", then press "Check again"`)}</div>
              {saEmail && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-700">{saEmail}</span>
                  <button type="button" onClick={() => { void navigator.clipboard.writeText(saEmail).then(() => setEmailCopied(true)).catch(() => {}); }}
                    className="shrink-0 rounded border border-red-300 bg-white px-2 py-1 text-[11px]">{emailCopied ? t("คัดลอกแล้ว", "Copied") : t("คัดลอก", "Copy")}</button>
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap gap-3">
                <button type="button" disabled={linkBusy} onClick={() => void recheck()} className="font-medium underline">{linkBusy ? t("กำลังตรวจ…", "Checking…") : t("ตรวจอีกครั้ง", "Check again")}</button>
                <button type="button" onClick={() => setChanging(true)} className="underline">{t("หรือเลือกโฟลเดอร์อื่น", "or choose another folder")}</button>
              </div>
            </div>
          )}
          {(changing || ((rootMissing || pickMissing) && !pick)) && (
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-2">
                <input value={link} disabled={busy || linkBusy} onChange={(e) => { setLink(e.target.value); setLinkErr(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyLink(); } }}
                  placeholder={t("วางลิงก์โฟลเดอร์ Google Drive", "Paste a Google Drive folder link")} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-xs" />
                <button type="button" disabled={busy || linkBusy} onClick={() => void applyLink()}
                  className="shrink-0 rounded-lg border border-violet-300 bg-violet-50 px-3 text-xs text-violet-700 hover:bg-violet-100 disabled:opacity-50">
                  {linkBusy ? t("กำลังตรวจ…", "Checking…") : t("ใช้โฟลเดอร์นี้", "Use this folder")}
                </button>
              </div>
              {linkErr && <div className="text-xs text-red-600">{linkErr}</div>}
              <div className="text-[11px] text-slate-500">{t("ระบบตรวจว่ามีโฟลเดอร์จริงและแชร์ให้ระบบแล้ว · จำไว้ในเครื่องนี้", "The system checks the folder exists and is shared with it · remembered on this computer")}</div>
            </div>
          )}
          {pick && (
            <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]">
              {rootInfo?.default?.found && <button type="button" disabled={busy} onClick={useDefault} className="text-slate-500 underline">{t(`กลับไปใช้ตั้งต้น (${rootInfo.default.name})`, `Back to the default (${rootInfo.default.name})`)}</button>}
              {rootInfo?.can_set_default && (
                <button type="button" disabled={busy || linkBusy} onClick={() => void makeDefault()} className="text-violet-700 underline">
                  {t("ตั้งเป็นค่าเริ่มของทุกคน", "Make it everyone's default")}
                </button>
              )}
            </div>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">{t("ชื่อโฟลเดอร์งาน (ตั้งจากชื่องาน แก้ได้ · มีประเภทนำหน้าให้เอง)", "Job folder name (from the job name, editable · type is added in front)")}</span>
          <input value={folderName} disabled={busy} maxLength={100} onChange={(e) => setFolderName(e.target.value)}
            placeholder={jobName || t("งานพิมพ์", "Print job")} className="h-9 w-full rounded-lg border border-slate-300 px-3" />
        </label>

        <div>
          <div className="mb-1 text-xs text-slate-500">{t("จะสร้างที่", "Will be created at")}</div>
          <div className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"><Icon value="i:folder" className="mr-1" />{dest.join(" / ")}</div>
        </div>

        <div>
          <div className="mb-1 text-xs text-slate-500">{t("ไฟล์ที่ส่ง", "Files to send")}</div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-slate-500"><input type="checkbox" checked disabled />{t("PDF สำหรับพิมพ์ (ไฟล์ใหญ่ได้ ไม่จำกัด 4 MB)", "Print PDF (large files are fine — no 4 MB limit)")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={withPreview} disabled={busy} onChange={(e) => setWithPreview(e.target.checked)} />{t("รูปตัวอย่างแผ่น (PNG)", "Sheet preview (PNG)")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={withEps} disabled={busy} onChange={(e) => setWithEps(e.target.checked)} />{t("EPS (ต้องมี Illustrator ในเครื่องนี้)", "EPS (needs Illustrator on this computer)")}</label>
          </div>
        </div>

        {busy && (
          <div className="rounded-lg bg-violet-50 px-3 py-2 text-violet-800">
            <div><Icon value="i:hourglass" className="mr-1" />{phaseText[phase as Exclude<Phase, "idle">]}</div>
            {phase === "upload" && push && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-1.5 rounded-full bg-violet-600 transition-all" style={{ width: `${pct}%` }} /></div>
            )}
          </div>
        )}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</div>}
        {done && !busy && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
            <div className="font-medium"><Icon value="i:circle-check" className="mr-1" />{done.share_url
              ? (copied ? t("ส่งแล้ว · คัดลอกลิงก์ให้แล้ว (ทุกคนที่มีลิงก์ดูได้)", "Sent · link copied (anyone with the link can view)") : t("ส่งแล้ว · ลิงก์แชร์ (ทุกคนที่มีลิงก์ดูได้)", "Sent · share link (anyone with the link can view)"))
              : t("ส่งแล้ว", "Sent")}</div>
            {done.share_error && (
              <div className="mt-1 text-xs text-amber-700">{t(`เปิดลิงก์แชร์ให้คนนอกไม่ได้ (Shared drive อาจตั้งห้ามแชร์ออกนอกองค์กร) — ไฟล์ขึ้น Drive แล้ว: ${done.share_error}`, `Couldn't open an anyone-with-the-link share (the Shared drive may block outside sharing) — files are on Drive: ${done.share_error}`)}</div>
            )}
            {(done.share_url || done.folder_url) && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 font-mono text-xs text-slate-700">{done.share_url || done.folder_url}</span>
                <button type="button" onClick={() => void copyLink((done.share_url || done.folder_url)!)} className="shrink-0 rounded border border-emerald-300 bg-white px-2 py-1 text-xs">{t("คัดลอก", "Copy")}</button>
                <a href={(done.share_url || done.folder_url)!} target="_blank" rel="noreferrer" className="shrink-0 rounded border border-emerald-300 bg-white px-2 py-1 text-xs">{t("เปิด", "Open")}</a>
              </div>
            )}
          </div>
        )}
      </div>
    </ERPModal>
  );
}
