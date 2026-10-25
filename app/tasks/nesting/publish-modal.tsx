"use client";

/**
 * หน้าต่าง "ส่งเข้าคลังงานพิมพ์" (เฟส 3) — ใช้ ERPModal กลาง
 *
 * 1) ตัวช่วยทำไฟล์ (PDF + รูปตัวอย่าง [+ EPS]) ตามตำแหน่งบนจอตอนนี้
 * 2) ERP เปิดช่องอัปโหลดในโฟลเดอร์ [แม่งานพิมพ์]/Printed/<ประเภท>/<โฟลเดอร์ย่อย>/<ชื่องาน>
 * 3) ตัวช่วยส่งไฟล์ขึ้น Drive ตรงจากเครื่อง (ไฟล์ใหญ่ได้ — ไม่ผ่านเซิร์ฟเวอร์ ERP ที่รับได้แค่ 4 MB)
 * 4) ERP ทับไฟล์รอบก่อน + สร้าง/อัปเดตการ์ดในคลังไฟล์ หมวดงานพิมพ์ + จำไว้ในงาน
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT, useLang } from "@/components/i18n";
import { ERPModal } from "@/components/modal";
import { downscaleImageWidth, shrinkImageToFit } from "@/lib/image-resize";
import { HELPER_DRIVE_VERSION, helperApi, helperFile, versionAtLeast, type DrivePush } from "@/lib/nesting-helper";
import { listDriveGroups, openDriveUploads, publishToLibrary, type PrintType, type PublishResult } from "./data";
import type { Placed } from "./sheet-view";

type ExportSheet = { pdf: string; preview?: string; eps?: string };
type Phase = "idle" | "export" | "drive" | "upload" | "card";

const GROUP_PREF = "nesting-drive-group:";
const readPref = (code: string) => { try { return localStorage.getItem(GROUP_PREF + code) ?? ""; } catch { return ""; } };
const writePref = (code: string, v: string) => { try { localStorage.setItem(GROUP_PREF + code, v); } catch { /* ไม่มีที่เก็บ = ไม่จำ */ } };

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
  const [group, setGroup] = useState("");
  const [groups, setGroups] = useState<string[]>([]);
  const [subpath, setSubpath] = useState("");
  const [driveOn, setDriveOn] = useState(true);
  const [withPreview, setWithPreview] = useState(true);
  const [withEps, setWithEps] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [push, setPush] = useState<DrivePush | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const busy = phase !== "idle";
  const canPush = !!helperVersion && versionAtLeast(helperVersion, HELPER_DRIVE_VERSION);

  // เปิดหน้าต่าง → ประเภทตามงาน (ไม่มีใช้ตัวแรก) + โฟลเดอร์ย่อยที่ใช้ล่าสุดของประเภทนั้น
  useEffect(() => {
    if (!open) return;
    const pt = printTypes.find((p) => p.id === defaultPrintTypeId) ?? printTypes[0];
    setCode(pt?.code ?? "");
    setGroup(pt ? readPref(pt.code) : "");
    setPhase("idle"); setPush(null); setError(null);
  }, [open, defaultPrintTypeId, printTypes]);

  useEffect(() => {
    if (!open || !code) return;
    let alive = true;
    listDriveGroups(code).then((g) => { if (alive) { setGroups(g.folders); setSubpath(g.subpath); setDriveOn(g.configured); } })
      .catch(() => { if (alive) setGroups([]); });
    return () => { alive = false; };
  }, [open, code]);

  const dest = useMemo(() => [...(subpath || code).split(/[\\/]+/), group.trim(), jobName.trim() || t("งานพิมพ์", "Print job")]
    .filter(Boolean), [subpath, code, group, jobName, t]);

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
      const g = group.trim();
      const up = await openDriveUploads(id, { print_type_code: code, group: g, files });
      writePref(code, g);

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
        print_type_code: code, group: g, file_ids: st.files.map((f) => f.id).filter(Boolean),
        ...buildMeta(), width: dim?.width, height: dim?.height,
      });
      onPublished(r);
    } catch (e) {
      setError(cancelled.current ? t("ยกเลิกการส่งแล้ว", "Sending cancelled") : (e as Error).message);
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
      : !code ? t("ยังไม่มีประเภทงานพิมพ์ — ตั้งที่คลังไฟล์ → ⚙️ จัดการประเภทงานพิมพ์", "No print types yet — set them up in the file library → ⚙️ Manage print types")
        : null;

  return (
    <ERPModal open={open} onClose={cancel} size="md" closeOnBackdrop={!busy} defaultExpanded={false}
      title={`📤 ${t("ส่งเข้าคลังงานพิมพ์", "Send to the print library")}`}
      description={t("ไฟล์ขึ้น Google Drive + ได้การ์ดในคลังไฟล์ หมวดงานพิมพ์", "Files go to Google Drive and a card appears in the file library's print section")}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancel} disabled={busy && phase !== "upload"}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">
            {phase === "upload" ? t("หยุดส่ง", "Stop upload") : t("ยกเลิก", "Cancel")}
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
        {warn && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">⚠ {warn}</div>}

        <div>
          <div className="mb-1 text-xs text-slate-500">{t("ประเภทงานพิมพ์", "Print type")}</div>
          <div className="flex flex-wrap gap-2">
            {printTypes.map((p) => (
              <button key={p.id} type="button" disabled={busy} onClick={() => { setCode(p.code); setGroup(readPref(p.code)); }}
                className={`rounded-lg border px-3 py-1 text-xs ${p.code === code ? "border-violet-400 bg-violet-50 font-semibold text-violet-700" : "border-slate-300 text-slate-600"}`}>
                {p.code}{p.name && p.name !== p.code ? ` · ${p.name}` : ""}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">{t("โฟลเดอร์ย่อย (เลือกที่มี หรือพิมพ์ชื่อใหม่ · ไม่ใส่ก็ได้)", "Subfolder (pick one or type a new name · optional)")}</span>
          <input list="nesting-drive-groups" value={group} disabled={busy} maxLength={80} onChange={(e) => setGroup(e.target.value)}
            placeholder={t("เช่น goodgoods", "e.g. goodgoods")} className="h-9 w-full rounded-lg border border-slate-300 px-3" />
          <datalist id="nesting-drive-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        </label>

        <div>
          <div className="mb-1 text-xs text-slate-500">{t("ปลายทางบน Drive", "Destination on Drive")}</div>
          <div className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">📁 {dest.join(" / ")}</div>
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
            <div>⏳ {phaseText[phase as Exclude<Phase, "idle">]}</div>
            {phase === "upload" && push && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-1.5 rounded-full bg-violet-600 transition-all" style={{ width: `${pct}%` }} /></div>
            )}
          </div>
        )}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</div>}
      </div>
    </ERPModal>
  );
}
