"use client";

/**
 * 🔁 ตรวจรูปซ้ำในคลังก่อนอัปโหลด (ของกลาง) — ถาม "ใช้รูปเดิม / อัปโหลดใหม่" เพื่อไม่ให้ไฟล์ซ้ำกินพื้นที่
 *
 *   const r = await uploadImagesWithDupCheck(files, { folder: "storefront-products", max: 2000, target: "แถวสี TTM002", existingKeys });
 *   if (!r) return;                 // กดยกเลิก → ไม่อัปอะไรเลย
 *   addImages(r.keys);              // key ของรูปเดิม (ใช้ซ้ำ) + รูปที่เพิ่งอัป เรียงตามไฟล์ที่เลือก
 *
 * ขั้นตอน: ย่อรูป → คำนวณลายนิ้วมือในเบราว์เซอร์ → ถามคลัง (/api/assets/find-duplicates) โดยยังไม่ส่งไฟล์
 *   ไม่ซ้ำ = อัปทันทีไม่ถาม · ซ้ำ 1 รูป = ป๊อปเทียบรูปใหม่กับรูปเดิม · ซ้ำหลายรูป = ป๊อปสรุปทุกรูป (เลือกรายรูป / ทั้งหมด)
 *   รูปเดิมที่อยู่ในช่องนี้แล้ว (existingKeys) → เสนอ "ข้าม"
 * ตรวจซ้ำไม่สำเร็จ (เน็ต/คลังมีปัญหา) = อัปตามปกติ ไม่ขวางงาน
 * ตรวจ 2 ระดับ:
 *   1) ไฟล์เดียวกันทุกจุด (sha256 ทั้งไฟล์หลังย่อ และไฟล์ต้นฉบับ)
 *   2) หน้าตาเหมือนกันแต่คนละไฟล์ (lib/image-hash — เซฟใหม่ / ย่อคนละขนาด / รูปปก SKU จาก Odoo)
 *      คลังคัดจากรูปทรง+สี → เบราว์เซอร์เทียบรายละเอียดกับรูปเดิมจริงอีกชั้น (ตัวเลขขนาดบนรูปต่าง = ไม่ถาม)
 *      รูปใหม่ละเอียดกว่ารูปเดิมชัดเจน → ตั้งต้นเป็น "อัปโหลดใหม่" (ไม่ให้รูปบนเว็บชัดน้อยลง)
 *
 * ของกลาง: ERPModal (components/modal) · mountDialog · prepareResizedImage/uploadPreparedImage (components/image-attach) · <Icon> · tr()
 */
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { apiFetch } from "@/lib/api";
import { sha256Hex, formatBytes } from "@/lib/assets";
import { DETAIL_MAX, DETAIL_SURE, detailGap, detailGridOfBlob, lookHashOfBlob } from "@/lib/image-hash";
import { r2ImageUrl } from "@/lib/r2-image";
import { formatDate } from "@/lib/date";
import { tr } from "@/lib/lang";
import { ERPModal } from "@/components/modal";
import { mountDialog } from "@/components/modal/ask-dialog";
import { Icon } from "@/components/icon";
import { prepareResizedImage, uploadPreparedImage } from "@/components/image-attach";
import { imageStepProgress, type UploadProgressState } from "@/components/upload-progress";
import type { DuplicateAsset } from "@/lib/asset-duplicates-server";

export type { DuplicateAsset };

/** ไฟล์ที่จะอัป (file) + ไฟล์ต้นฉบับก่อนย่อ (original · ถ้ามี) — ตรวจซ้ำทั้งสองแบบ */
export type UploadCandidate = { file: File; original?: File };
export type DuplicateCheckOptions = {
  /** บอกผู้ใช้ว่ากำลังอัปเข้าที่ไหน เช่น "แถวสี TTM002 · แทน" */
  target?: string;
  /** r2_key ที่อยู่ในช่องนี้แล้ว — รูปเดิมที่อยู่ตรงนี้แล้วจะเสนอ "ข้าม" */
  existingKeys?: string[];
};
type Decision = "reuse" | "new" | "skip";
type Size = { width: number; height: number };

/** รูปใหม่ละเอียดกว่ารูปเดิมเกินนี้ (ด้านยาว) = แนะนำอัปใหม่ */
const SHARPER = 1.15;

/**
 * ถามคลังว่าไฟล์ไหนซ้ำ แล้วให้ผู้ใช้เลือก — คืนแผนต่อไฟล์ (reuse = ใช้รูปเดิมในคลัง · null = อัปใหม่) · ไฟล์ที่กด "ข้าม" ไม่อยู่ในผล
 * คืน null = กดยกเลิก (ไม่ต้องอัปอะไร)
 */
export async function askDuplicateUploads<T extends UploadCandidate>(items: T[], opts: DuplicateCheckOptions = {}): Promise<{ item: T; reuse: DuplicateAsset | null }[] | null> {
  const plain = items.map((item) => ({ item, reuse: null as DuplicateAsset | null }));
  if (!items.length) return plain;
  let found: Record<string, DuplicateAsset> = {};
  let lookFound: (DuplicateAsset | null)[] = [];
  let sums: { file: string; original: string | null }[] = [];
  let looks: Awaited<ReturnType<typeof lookHashOfBlob>>[] = [];
  try {
    [sums, looks] = await Promise.all([
      Promise.all(items.map(async (c) => ({
        file: await sha256Hex(await c.file.arrayBuffer()),
        original: c.original && c.original !== c.file ? await sha256Hex(await c.original.arrayBuffer()) : null,
      }))),
      Promise.all(items.map((c) => (c.file.type.startsWith("image/") ? lookHashOfBlob(c.file) : Promise.resolve(null)))),
    ]);
    const checksums = sums.flatMap((s) => (s.original ? [s.file, s.original] : [s.file]));
    const res = await apiFetch("/api/assets/find-duplicates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checksums, looks: looks.map((l) => (l ? { phash: l.phash, color: l.color } : null)) }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
    found = (j.data ?? {}) as Record<string, DuplicateAsset>;
    lookFound = Array.isArray(j.looks) ? (j.looks as (DuplicateAsset | null)[]) : [];
  } catch (e) {
    console.warn("[duplicate-upload] ตรวจรูปซ้ำไม่สำเร็จ — อัปตามปกติ", e);
    return plain;
  }
  const exactOf = (i: number) => found[sums[i].file] ?? (sums[i].original ? found[sums[i].original!] : undefined) ?? null;
  // รูปหน้าตาเหมือน: เทียบรายละเอียดกับรูปเดิมจริงอีกชั้น (ตัวเลขขนาด/ตัวหนังสือบนรูป) — ไม่ผ่านหรือเทียบไม่ได้ = ไม่ถาม (กันเสนอรูปผิด)
  const detail: (number | undefined)[] = [];
  await Promise.all(items.map(async (c, i) => {
    const m = !exactOf(i) ? lookFound[i] : null;
    if (!m) return;
    try {
      // รูปเดิมขนาด 960 คุณภาพ 90 — รูป 480 (คุณภาพปกติ) เพี้ยนจนรูปซ้ำจริงหลุดไปโซนก้ำกึ่งบ่อย
      const res = await fetch(`${r2ImageUrl(m.r2_key, 960)}&q=90`);
      const [a, b] = await Promise.all([detailGridOfBlob(c.file), res.ok ? res.blob().then(detailGridOfBlob) : null]);
      detail[i] = a && b ? detailGap(a, b) : undefined;
      if (detail[i] === undefined || detail[i]! > DETAIL_MAX) lookFound[i] = null;
    } catch { lookFound[i] = null; }
  }));
  const matches = items.map((_, i) => exactOf(i) ?? lookFound[i] ?? null);
  if (!matches.some(Boolean)) return plain;

  const here = new Set(opts.existingKeys ?? []);
  const rows: DupRow[] = [];
  items.forEach((c, i) => {
    const m = matches[i];
    const l = looks[i];
    if (m) rows.push({
      index: i, file: c.file, match: m, here: here.has(m.r2_key), kind: m.look ? "look" : "same",
      newSize: l ? { width: l.width, height: l.height } : undefined, unsure: !!m.look && (detail[i] ?? 0) > DETAIL_SURE,
    });
  });
  const decisions = await mountDialog<Decision[] | null>((done) => (
    <DuplicateUploadDialog rows={rows} newCount={items.length - rows.length} target={opts.target} done={done} />
  ));
  if (!decisions) return null;
  const byIndex = new Map(rows.map((r, k) => [r.index, { row: r, d: decisions[k] }]));
  const out: { item: T; reuse: DuplicateAsset | null }[] = [];
  items.forEach((item, i) => {
    const hit = byIndex.get(i);
    if (!hit) out.push({ item, reuse: null });
    else if (hit.d === "reuse") out.push({ item, reuse: hit.row.match });
    else if (hit.d === "new") out.push({ item, reuse: null });
  });
  return out;
}

/**
 * ทางลัดที่ใช้บ่อย: ย่อรูป → ตรวจซ้ำ (ถามถ้าเจอ) → อัปเฉพาะที่ต้องอัป
 * คืน keys เรียงตามไฟล์ที่เลือก (รูปเดิม + รูปใหม่) · null = กดยกเลิก · ไฟล์ที่อัปพังจะเรียก onError แล้วข้ามไป
 */
export async function uploadImagesWithDupCheck(
  files: File[],
  opts: DuplicateCheckOptions & {
    folder: string; max?: number; onError?: (file: File, err: Error) => void;
    /** ขั้น/รูปที่กำลังทำ → โชว์ด้วย <UploadProgress {...p} /> (components/upload-progress) · ผู้เรียกล้างเองตอนเสร็จ */
    onProgress?: (p: UploadProgressState) => void;
  },
): Promise<{ keys: string[]; uploaded: number; reused: number; skipped: number } | null> {
  const imgs = files.filter((f) => f.type.startsWith("image/"));
  const cands: (UploadCandidate & { original: File })[] = [];
  for (const [i, f] of imgs.entries()) {
    opts.onProgress?.(imageStepProgress("prepare", f, i + 1, imgs.length));
    try { cands.push({ file: await prepareResizedImage(f, opts.max ?? 1600), original: f }); }
    catch (e) { opts.onError?.(f, e as Error); }
  }
  if (cands.length) opts.onProgress?.(imageStepProgress("check", cands[0].original, 1, cands.length));
  const plan = await askDuplicateUploads(cands, opts);
  if (!plan) return null;
  const keys: string[] = [];
  let uploaded = 0, reused = 0;
  const toSend = plan.filter((p) => !p.reuse).length;
  for (const { item, reuse } of plan) {
    if (reuse) { keys.push(reuse.r2_key); reused++; continue; }
    opts.onProgress?.(imageStepProgress("upload", item.original, uploaded + 1, toSend));
    try { keys.push((await uploadPreparedImage(item.file, { folder: opts.folder, fileName: item.original.name })).r2_key); uploaded++; }
    catch (e) { opts.onError?.(item.original, e as Error); }
  }
  return { keys, uploaded, reused, skipped: cands.length - plan.length };
}

/* ───────── ป๊อปถาม: ซ้ำ 1 รูป = เทียบเต็ม (แบบ A) · ซ้ำหลายรูป = สรุปทุกรูป (แบบ B) ───────── */

/** แถวในป๊อป (export ไว้ให้หน้าตัวอย่าง/playground เปิดป๊อปด้วยข้อมูลจำลองได้)
 *  kind: same = ไฟล์เดียวกันทุกจุด · look = หน้าตาเหมือนกันแต่คนละไฟล์ · newSize = ขนาดรูปที่จะอัป (ถ้ารู้)
 *  unsure = หน้าตาเหมือนแต่รายละเอียดต่างนิดหน่อย (ตัวหนังสือ/ลายผิว) → ตั้งต้น "อัปใหม่" + เตือนให้ตรวจ */
export type DupRow = { index: number; file: File; match: DuplicateAsset; here: boolean; kind?: "same" | "look"; newSize?: Size; unsure?: boolean };
export type DupDecision = Decision;

const dims = (w?: number | null, h?: number | null) => (w && h ? `${w}×${h}` : "");
const join = (xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" · ");
/** รูปใหม่ละเอียดกว่ารูปเดิมชัดเจน (เฉพาะรูปหน้าตาเหมือน — ไฟล์เดียวกันละเอียดเท่ากันอยู่แล้ว) */
const sharperThanExisting = (r: DupRow) =>
  r.kind === "look" && !!r.newSize && !!r.match.width && !!r.match.height &&
  Math.max(r.newSize.width, r.newSize.height) > SHARPER * Math.max(r.match.width, r.match.height);
const defaultDecision = (r: DupRow): Decision => (r.here ? "skip" : sharperThanExisting(r) || r.unsure ? "new" : "reuse");

export function DuplicateUploadDialog({ rows, newCount, target, done }: { rows: DupRow[]; newCount: number; target?: string; done: (v: Decision[] | null) => void }) {
  const [choice, setChoice] = useState<Decision[]>(() => rows.map(defaultDecision));
  const previews = useMemo(() => rows.map((r) => URL.createObjectURL(r.file)), [rows]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const [newDims, setNewDims] = useState<Record<number, string>>({});
  const onNewLoad = (k: number) => (e: SyntheticEvent<HTMLImageElement>) => {
    const im = e.currentTarget;
    setNewDims((d) => ({ ...d, [k]: dims(im.naturalWidth, im.naturalHeight) }));
  };

  const single = rows.length === 1;
  const r0 = rows[0];
  const look0 = r0.kind === "look";
  const where = target ? tr(`กำลังอัปเข้า ${target}`, `Uploading to ${target}`) : "";
  const title = single
    ? (r0.here
      ? (look0 ? tr("รูปหน้าตาเหมือนกันอยู่ตรงนี้แล้ว", "A look-alike image is already here") : tr("รูปนี้อยู่ตรงนี้แล้ว", "This image is already here"))
      : (look0 ? tr("เจอรูปหน้าตาเหมือนกันในคลัง", "A look-alike image is in the library") : tr("รูปนี้มีอยู่ในคลังแล้ว", "This image is already in the library")))
    : tr(`เจอรูปซ้ำ ${rows.length} จาก ${rows.length + newCount} รูป`, `${rows.length} of ${rows.length + newCount} images already exist`);

  const btn = "h-9 px-4 text-sm font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors";
  const btnGhost = `${btn} text-slate-700 border border-slate-200 hover:bg-slate-50`;
  const btnMain = `${btn} text-white bg-blue-600 hover:bg-blue-700`;

  const savedBytes = rows.reduce((s, r, k) => s + (choice[k] !== "new" ? r.file.size : 0), 0);
  const nNew = newCount + choice.filter((c) => c === "new").length;
  const nReuse = choice.filter((c) => c === "reuse").length;
  const nSkip = choice.filter((c) => c === "skip").length;
  const anyLook = rows.some((r) => r.kind === "look");

  // แบบ A: ปุ่มหลัก = ทางที่แนะนำ (รูปใหม่ชัดกว่า → อัปโหลดใหม่ · ไม่งั้น ใช้รูปเดิม / ข้าม)
  const keepBtn = (main: boolean) => (
    <button type="button" className={main ? btnMain : btnGhost} autoFocus={main} onClick={() => done([r0.here ? "skip" : "reuse"])}>
      <Icon name={r0.here ? "done" : "library"} /> {r0.here ? tr("ข้าม (มีอยู่แล้ว)", "Skip (already here)") : tr("ใช้รูปเดิม", "Use existing")}
    </button>
  );
  const newBtn = (main: boolean) => (
    <button type="button" className={main ? btnMain : btnGhost} autoFocus={main} onClick={() => done(["new"])}>
      <Icon name="upload" /> {r0.here ? tr("อัปซ้ำอีกรูป", "Add again") : tr("อัปโหลดใหม่", "Upload new")}
    </button>
  );
  const preferNew = single && defaultDecision(r0) === "new";
  const footer = single ? (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className={btnGhost} onClick={() => done(null)}>{tr("ยกเลิก", "Cancel")}</button>
      {preferNew ? <>{keepBtn(false)}{newBtn(true)}</> : <>{newBtn(false)}{keepBtn(true)}</>}
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="mr-auto text-xs text-slate-500">
        {join([
          tr(`อัปใหม่ ${nNew} รูป`, `${nNew} new`),
          nReuse > 0 && tr(`ใช้รูปเดิม ${nReuse} รูป`, `${nReuse} reused`),
          nSkip > 0 && tr(`ข้าม ${nSkip}`, `${nSkip} skipped`),
          savedBytes > 0 && tr(`ประหยัด ${formatBytes(savedBytes)}`, `saves ${formatBytes(savedBytes)}`),
        ])}
      </span>
      <button type="button" className={btnGhost} onClick={() => done(null)}>{tr("ยกเลิก", "Cancel")}</button>
      <button type="button" className={btnMain} autoFocus onClick={() => done(choice)}>{tr("ดำเนินการต่อ", "Continue")}</button>
    </div>
  );

  return (
    <ERPModal open onClose={() => done(null)} title={title} description={single ? where : join([where, newCount > 0 && tr(`อีก ${newCount} รูปไม่ซ้ำ จะอัปตามปกติ`, `${newCount} other image(s) will upload as usual`)])}
      size="lg" defaultExpanded={false} resizable={false} storageKey="duplicate-upload" zIndex={300} footer={footer}>
      {single ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 items-start">
          <figure className="min-w-0">
            <figcaption className="text-xs text-slate-500 mb-1">{tr("รูปที่กำลังจะอัป", "Image to upload")}</figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previews[0]} alt="" onLoad={onNewLoad(0)} className="w-full aspect-square object-contain bg-slate-50 rounded-lg border border-slate-200" />
            <div className="mt-1.5 text-sm text-slate-800 truncate">{r0.file.name}</div>
            <div className="text-xs text-slate-500">{join([newDims[0], formatBytes(r0.file.size)])}</div>
          </figure>
          <div className="self-center text-lg text-slate-400 select-none" aria-hidden>{look0 ? "≈" : "="}</div>
          <figure className="min-w-0">
            <figcaption className="text-xs text-slate-500 mb-1">{tr("รูปเดิมในคลัง", "Existing image in library")}</figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r2ImageUrl(r0.match.r2_key, 480) ?? ""} alt="" className="w-full aspect-square object-contain bg-slate-50 rounded-lg border border-slate-200" />
            <MatchInfo m={r0.match} />
          </figure>
          <div className="col-span-3 space-y-1">
            <MatchBadge row={r0} />
            <SharperHint row={r0} />
          </div>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap gap-2 mb-2">
            <button type="button" className={`${btnGhost} h-8 text-xs`} onClick={() => setChoice(rows.map((r) => (r.here ? "skip" : "reuse")))}>
              <Icon name="library" /> {tr("ใช้รูปเดิมทั้งหมดที่ซ้ำ", "Use existing for all")}
            </button>
            <button type="button" className={`${btnGhost} h-8 text-xs`} onClick={() => setChoice(rows.map(() => "new"))}>
              <Icon name="upload" /> {tr("อัปใหม่ทั้งหมด", "Upload all as new")}
            </button>
          </div>
          <ul className="divide-y divide-slate-100 border-y border-slate-100">
            {rows.map((r, k) => {
              const opts: [Decision, string][] = r.here
                ? [["skip", tr("ข้าม", "Skip")], ["new", tr("อัปซ้ำอีกรูป", "Add again")]]
                : [["reuse", tr("ใช้รูปเดิม", "Use existing")], ["new", tr("อัปใหม่", "Upload new")]];
              return (
                <li key={k} className="py-2.5 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previews[k]} alt="" title={tr("รูปที่กำลังจะอัป", "Image to upload")} className="w-14 h-14 object-cover rounded-md border border-slate-200 bg-slate-50" />
                    <span className="text-slate-400 text-sm" aria-hidden>{r.kind === "look" ? "≈" : "="}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r2ImageUrl(r.match.r2_key, 160) ?? ""} alt="" title={tr("รูปเดิมในคลัง", "Existing image")} className="w-14 h-14 object-cover rounded-md border border-slate-200 bg-slate-50" />
                  </div>
                  {/* จอแคบ: ข้อความกว้างอย่างน้อย 9rem → ปุ่มเลือกตกลงบรรทัดใหม่ (ไม่เบียดทับกัน) */}
                  <div className="min-w-[9rem] flex-1">
                    <div className="text-sm text-slate-800 truncate">{r.file.name} <span className="text-xs text-slate-500">· {formatBytes(r.file.size)}</span></div>
                    <MatchBadge row={r} />
                    <SharperHint row={r} />
                    <div className="text-xs text-slate-500 truncate">
                      {r.match.usedIn.length ? tr(`ใช้อยู่: ${r.match.usedIn.join(", ")}`, `Used in: ${r.match.usedIn.join(", ")}`) : join([r.match.file_name, formatDate(r.match.created_at)])}
                    </div>
                  </div>
                  <div className="ml-auto inline-flex rounded-lg border border-slate-200 overflow-hidden shrink-0" role="group">
                    {opts.map(([v, label]) => (
                      <button key={v} type="button" aria-pressed={choice[k] === v}
                        onClick={() => setChoice((c) => c.map((x, i) => (i === k ? v : x)))}
                        className={`h-8 px-3 text-xs font-medium transition-colors ${choice[k] === v ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        {anyLook
          ? tr("ใช้รูปเดิม = ไม่เพิ่มไฟล์ใหม่ ไม่กินพื้นที่เก็บไฟล์ · \"หน้าตาเหมือนกัน\" = ระบบเทียบจากหน้าตารูป ถ้าดูแล้วเป็นคนละรูป กด อัปโหลดใหม่",
            "Using the existing image adds no new file · \"Looks the same\" is matched by appearance — if they are different images, choose Upload new")
          : tr("ใช้รูปเดิม = ไม่เพิ่มไฟล์ใหม่ ไม่กินพื้นที่เก็บไฟล์ · ระบบตรวจแบบไฟล์เดียวกันทุกจุด", "Using the existing image adds no new file · matched by identical file content")}
      </p>
    </ERPModal>
  );
}

function MatchBadge({ row }: { row: DupRow }) {
  const chip = "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md my-0.5";
  return (
    <span className="inline-flex flex-wrap gap-1">
      {row.here && <span className={`${chip} bg-blue-50 text-blue-700`}><Icon name="info" /> {tr("มีในช่องนี้แล้ว", "Already here")}</span>}
      {row.kind === "look"
        ? <span className={`${chip} bg-amber-50 text-amber-700`}><Icon name="view" /> {tr("หน้าตาเหมือนกัน (คนละไฟล์)", "Looks the same (different file)")}</span>
        : !row.here && <span className={`${chip} bg-emerald-50 text-emerald-700`}><Icon name="done" /> {tr("ไฟล์เดียวกันทุกจุด", "Identical file")}</span>}
    </span>
  );
}

/** เหตุผลที่ตั้งต้นเป็น "อัปใหม่" สำหรับรูปหน้าตาเหมือน (รูปใหม่ชัดกว่า / รายละเอียดต่างนิดหน่อย) */
function SharperHint({ row }: { row: DupRow }) {
  const hint = "text-xs text-amber-700 flex items-start gap-1";
  if (row.kind === "look" && row.unsure) {
    return (
      <div className={hint}>
        <Icon name="warning" /> {tr("รายละเอียดต่างกันนิดหน่อย (เช่นตัวเลข/ตัวหนังสือบนรูป) — ตรวจดูก่อนใช้รูปเดิม", "Small details differ (e.g. text or numbers on the image) — check before reusing")}
      </div>
    );
  }
  if (!sharperThanExisting(row)) return null;
  const n = dims(row.newSize?.width, row.newSize?.height), o = dims(row.match.width, row.match.height);
  return (
    <div className={hint}>
      <Icon name="warning" /> {tr(`รูปใหม่ละเอียดกว่า (${n} เทียบกับ ${o}) — แนะนำอัปโหลดใหม่`, `The new image is sharper (${n} vs ${o}) — uploading it is recommended`)}
    </div>
  );
}

function MatchInfo({ m }: { m: DuplicateAsset }) {
  return (
    <div className="mt-1.5 space-y-0.5">
      <div className="text-sm text-slate-800 truncate">{m.file_name || m.title || "—"}</div>
      <div className="text-xs text-slate-500">{join([dims(m.width, m.height), m.size_bytes != null && formatBytes(m.size_bytes)])}</div>
      <div className="text-xs text-slate-500">{join([m.created_at && tr(`อัปเมื่อ ${formatDate(m.created_at)}`, `Added ${formatDate(m.created_at)}`), m.uploaded_by && tr(`โดย ${m.uploaded_by.split("@")[0]}`, `by ${m.uploaded_by.split("@")[0]}`)])}</div>
      {m.tags.length > 0 && <div className="text-xs text-slate-500">{tr("แท็ก", "Tags")}: {m.tags.join(", ")}</div>}
      {m.usedIn.length > 0 && (
        <div className="text-xs text-slate-600">
          {tr("ใช้อยู่", "Used in")}: {m.usedIn.join(", ")}{m.usedCount > m.usedIn.length ? tr(` และอีก ${m.usedCount - m.usedIn.length} ที่`, ` and ${m.usedCount - m.usedIn.length} more`) : ""}
        </div>
      )}
    </div>
  );
}
