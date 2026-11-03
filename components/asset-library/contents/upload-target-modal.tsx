"use client";

/**
 * ป๊อป "ลงอัลบั้มไหน?" — ลากไฟล์/ทั้งโฟลเดอร์มาวางที่หน้า Contents (หรือกดเลือกโฟลเดอร์) แล้วเลือก
 *   ● สร้างอัลบั้มใหม่ (ชื่อตั้งต้น = ชื่อโฟลเดอร์ · ลากมาหลายโฟลเดอร์ = แยก 1 โฟลเดอร์ต่อ 1 อัลบั้มได้)
 *   ● ใส่อัลบั้มที่มีอยู่ (ค้นหาได้ · ไม่โชว์อัลบั้มที่ปิดแล้ว)
 * ไม่อัปเอง — ส่งแผน (อัลบั้ม → ไฟล์) ให้หน้ารวมสร้างอัลบั้ม/เริ่มอัป (startAlbumUploadTask)
 * ใช้ของกลาง: ERPModal · ERPForm* · BrandSelect · FileThumb
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormField, ERPInput } from "@/components/form";
import { BrandSelect } from "@/components/brand-select";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { formatBytes } from "@/lib/assets";
import type { BrandOption } from "@/app/tasks/data";
import type { ContentAlbum } from "./api";
import { FileThumb, StageBadge, topFolderOf } from "./album-bits";

export type UploadPlan =
  | { mode: "new"; brandId: string | null; groups: { name: string; files: File[] }[] }
  | { mode: "existing"; album: ContentAlbum; files: File[] };

const LOOSE = "";
const shootName = () => `ถ่าย ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}`;

export function UploadTargetModal({ files, albums, brands, defaultBrandId, onClose, onConfirm }: {
  files: File[];
  albums: ContentAlbum[];
  brands: BrandOption[];
  defaultBrandId?: string | null;
  onClose: () => void;
  onConfirm: (plan: UploadPlan) => void;
}) {
  const t = useT();
  // จัดกลุ่มตามโฟลเดอร์ชั้นบนสุด (ไฟล์เดี่ยว = กลุ่ม "")
  const groups = useMemo(() => {
    const m = new Map<string, File[]>();
    for (const f of files) { const k = topFolderOf(f); (m.get(k) ?? m.set(k, []).get(k)!).push(f); }
    return [...m.entries()].map(([folder, fs]) => ({ folder, files: fs }));
  }, [files]);
  const folders = groups.filter((g) => g.folder !== LOOSE);
  const videos = files.filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(f.name)).length;
  const total = files.reduce((n, f) => n + f.size, 0);
  const openAlbums = albums.filter((a) => a.status.stage !== "closed");

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [split, setSplit] = useState(folders.length > 1);
  const [name, setName] = useState(folders.length === 1 && groups.length === 1 ? folders[0].folder : shootName());
  const [brandId, setBrandId] = useState(defaultBrandId ?? "");
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!openAlbums.length) setMode("new"); }, [openAlbums.length]);

  const shownAlbums = openAlbums.filter((a) => !q.trim() || a.name.toLowerCase().includes(q.trim().toLowerCase()) || (a.brand_name ?? "").toLowerCase().includes(q.trim().toLowerCase()));
  // แยกตามโฟลเดอร์: ไฟล์เดี่ยวที่ไม่อยู่ในโฟลเดอร์ไหน = อัลบั้มชื่อที่พิมพ์
  const newGroups = split && folders.length > 1
    ? groups.map((g) => ({ name: g.folder || name.trim() || shootName(), files: g.files }))
    : [{ name: name.trim(), files }];

  const confirm = () => {
    setErr(null);
    if (mode === "existing") {
      const album = openAlbums.find((a) => a.id === pick);
      if (!album) { setErr(t("เลือกอัลบั้มก่อน", "Pick an album")); return; }
      onConfirm({ mode: "existing", album, files });
      return;
    }
    if (newGroups.some((g) => !g.name)) { setErr(t("ใส่ชื่ออัลบั้มก่อน", "Enter an album name")); return; }
    if (!brandId) { setErr(t("เลือกแบรนด์ก่อน — ระบบใช้แบรนด์เลือกโฟลเดอร์ Google Drive ที่เก็บไฟล์", "Pick a brand — it decides the Google Drive folder")); return; }
    onConfirm({ mode: "new", brandId, groups: newGroups });
  };

  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="content-album-upload-target" title={t("ลงอัลบั้มไหน?", "Which album?")}
      description={t(`${files.length} ไฟล์ · รูป ${files.length - videos} · วิดีโอ ${videos} · ${formatBytes(total)}${folders.length ? ` · ${folders.length} โฟลเดอร์` : ""}`, `${files.length} files · ${files.length - videos} photos · ${videos} videos · ${formatBytes(total)}${folders.length ? ` · ${folders.length} folders` : ""}`)}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={confirm} className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700"><Icon name="upload" />
          {mode === "new" && newGroups.length > 1 ? t(`สร้าง ${newGroups.length} อัลบั้ม แล้วเริ่มอัป`, `Create ${newGroups.length} albums & upload`) : t(`เริ่มอัป ${files.length} ไฟล์`, `Upload ${files.length} files`)}</button>
      </>}>
      {err && <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><Icon name="warning" />{err}</div>}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {(["new", "existing"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} disabled={m === "existing" && !openAlbums.length}
              className={`flex items-center gap-2 p-3 rounded-xl border text-left text-sm disabled:opacity-40 ${mode === m ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
              <Icon name={m === "new" ? "add" : "library"} size={18} />
              <span className="font-medium">{m === "new" ? t("สร้างอัลบั้มใหม่", "New album") : t(`ใส่อัลบั้มที่มีอยู่ (${openAlbums.length})`, `Existing album (${openAlbums.length})`)}</span>
            </button>
          ))}
        </div>

        {mode === "new" ? (
          <div className="space-y-3">
            {folders.length > 1 && (
              <label className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5" checked={split} onChange={(e) => setSplit(e.target.checked)} />
                <span>{t(`แยก 1 โฟลเดอร์ = 1 อัลบั้ม (${folders.length} อัลบั้ม: ${folders.map((f) => f.folder).join(", ")})`, `One album per folder (${folders.length}: ${folders.map((f) => f.folder).join(", ")})`)}</span>
              </label>
            )}
            {(!split || folders.length <= 1 || groups.some((g) => g.folder === LOOSE)) && (
              <ERPFormField label={split && folders.length > 1 ? t("ชื่ออัลบั้มของไฟล์ที่ไม่อยู่ในโฟลเดอร์", "Album name for loose files") : t("ชื่ออัลบั้ม", "Album name")} required>
                <ERPInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t("เช่น ถ่ายกระเป๋า Heart Bag คอลใหม่", "e.g. Heart Bag new collection shoot")} />
              </ERPFormField>
            )}
            <ERPFormField label={t("แบรนด์", "Brand")} required hint={t("ไฟล์ตัวจริงขึ้นโฟลเดอร์ Google Drive ของแบรนด์นี้ · ตั้งผู้รับผิดชอบ/วันที่ต้องลงทีหลังในอัลบั้มได้", "Originals go to this brand's Google Drive · set owners/dates later")}>
              <BrandSelect brands={brands} value={brandId} onChange={setBrandId} emptyLabel={t("— เลือกแบรนด์ —", "— Pick a brand —")} />
            </ERPFormField>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นชื่ออัลบั้ม / แบรนด์", "Search album / brand")}
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div className="max-h-[45vh] overflow-y-auto space-y-1.5 pr-0.5" role="radiogroup">
              {shownAlbums.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">{t("ไม่เจออัลบั้ม", "No albums found")}</p> : shownAlbums.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={pick === a.id} onClick={() => setPick(a.id)}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left ${pick === a.id ? "border-violet-400 bg-violet-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  <FileThumb r2Key={a.cover_key} type="image" width={96} className="w-12 h-12 rounded shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800 truncate">{a.name}</span>
                    <span className="block text-xs text-slate-500 truncate">{[a.brand_name, t(`${a.file_count} ไฟล์`, `${a.file_count} files`)].filter(Boolean).join(" · ")}</span>
                  </span>
                  <StageBadge stage={a.status.stage} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </ERPModal>
  );
}
