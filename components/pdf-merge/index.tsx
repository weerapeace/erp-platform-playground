"use client";

/**
 * 📑 PdfMergeTool — ของกลาง "รวม PDF หลายไฟล์เป็นไฟล์เดียว" (ทำในเบราว์เซอร์ ไฟล์ไม่ขึ้นเซิร์ฟเวอร์)
 *
 *   <PdfMergeTool storageKey="misc.pdf-merge" />                     ← หน้าเครื่องมือ (/misc/pdf-merge)
 *   <PdfMergeTool initialFiles={[pdf1, pdf2]} storageKey={null} defaultName="ใบสั่งซื้อรวม" onMerged={(blob, name) => …} />
 *
 * ทำได้: ลากไฟล์ PDF / รูป (JPG PNG WEBP HEIC) มาวาง หรือกดเลือก · Ctrl+V วางรูป · การ์ดรูปหน้าแรก ลากสลับลำดับ
 *        โหมด "ทีละหน้า" = ลาก/ลบ/หมุนรายหน้า · ตั้งชื่อไฟล์ · รวมแล้วดาวน์โหลด (มีแถบ % + ยกเลิกได้)
 * ย้อนกลับได้: เอาไฟล์/หน้าออก · ย้ายลำดับ · หมุน · ล้างทั้งหมด → ปุ่ม "ย้อนกลับ" ในแจ้งผลมุมจอ (toast.undo)
 * กู้งานค้าง: storageKey = เก็บไฟล์+ลำดับใน IndexedDB เครื่องนี้ (lib/pdf-merge-store) · null = ไม่เก็บ
 * ของกลางที่ใช้: useFileDrop · useDragReorder/moveItem · UploadProgress · FileTypeIcon · toast · Icon
 * กฎล้วน lib/pdf-merge · ตัวรวม lib/pdf-merge-engine (ไลบรารีใน public/vendor) · คู่มือ docs/pdf-merge.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileDrop } from "@/components/file-drop";
import { moveItem, useDragReorder } from "@/components/sortable-list";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { FileTypeIcon } from "@/components/file-type-icon";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { Spinner } from "@/components/spinner";
import {
  defaultMergeName, groupRuns, mergeSummary, mergedFileName, moveRun, removeRun, rotateBy, rotateRun, runPageLabel, usedFileIds,
  type MergePage,
} from "@/lib/pdf-merge";
import {
  MergeSourceError, buildMergedPdf, downloadBlob, initialPages, pageThumb, prepareSource, releaseSource, type PreparedSource,
} from "@/lib/pdf-merge-engine";
import { clearMergeDraft, loadMergeDraft, saveMergeDraft } from "@/lib/pdf-merge-store";

type Mode = "files" | "pages";
const ACCEPT = ".pdf,application/pdf,image/*,.heic,.heif";
const extOf = (name: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "pdf").toLowerCase();

export type PdfMergeToolProps = {
  /** กู้งานค้าง: คีย์ที่เก็บในเครื่อง · null = ไม่เก็บ (ค่าเริ่ม "pdf-merge") */
  storageKey?: string | null;
  /** ชื่อไฟล์เริ่มต้น (ไม่ต้องมี .pdf) · ค่าเริ่ม "รวมเอกสาร-ปี-เดือน-วัน" */
  defaultName?: string;
  /** ไฟล์ที่ใส่มาให้ตั้งแต่เปิด (หน้าอื่นส่งเอกสารมารวม) — มีค่า = ไม่กู้งานค้าง */
  initialFiles?: File[];
  /** รวมเสร็จ (ดาวน์โหลดไปแล้ว) — ส่งต่อ blob ได้ เช่น เก็บเข้า Drive */
  onMerged?: (blob: Blob, fileName: string) => void;
  className?: string;
};

export function PdfMergeTool({ storageKey = "pdf-merge", defaultName, initialFiles, onMerged, className = "" }: PdfMergeToolProps) {
  const toast = useToast();
  const [files, setFiles] = useState<Map<string, PreparedSource>>(() => new Map());
  const [pages, setPages] = useState<MergePage[]>([]);
  const [name, setName] = useState(() => defaultName ?? defaultMergeName());
  const [mode, setMode] = useState<Mode>("files");
  const [reading, setReading] = useState<UploadProgressState | null>(null);
  const [merging, setMerging] = useState<UploadProgressState | null>(null);
  const [ready, setReady] = useState(!storageKey);   // กู้งานค้างเสร็จแล้ว (ก่อนนั้นห้ามเขียนทับที่เก็บ)
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const filesRef = useRef(files);
  filesRef.current = files;

  /** เปลี่ยนรายการหน้า + (ถ้ามีข้อความ) ปุ่มย้อนกลับ */
  const commit = useCallback((next: MergePage[], undoMsg?: string) => {
    const prev = pagesRef.current;
    setPages(next);
    if (undoMsg) toast.undo(undoMsg, () => setPages(prev));
  }, [toast]);

  // ลากจัดลำดับหลายครั้งติดกัน (เลือกหลายใบแล้วลาก) = ย้อนกลับครั้งเดียวไปจุดก่อนเริ่ม
  const reorderBase = useRef<{ at: number; pages: MergePage[] } | null>(null);
  const reorderTo = (next: MergePage[]) => {
    const now = Date.now();
    if (!reorderBase.current || now - reorderBase.current.at > 800) reorderBase.current = { at: now, pages: pagesRef.current };
    else reorderBase.current.at = now;
    const base = reorderBase.current.pages;
    setPages(next);
    toast.undo("ย้ายลำดับแล้ว", () => setPages(base));
  };

  /* ── เพิ่มไฟล์ ── */
  const addFiles = useCallback(async (list: File[]) => {
    if (!list.length) return;
    const added: PreparedSource[] = [];
    const errors: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      setReading({ label: "กำลังอ่านไฟล์", name: f.name, size: f.size, pct: list.length > 1 ? Math.round((i / list.length) * 100) : null, count: { current: i + 1, total: list.length } });
      try {
        added.push(await prepareSource(f));
      } catch (e) {
        errors.push(e instanceof MergeSourceError ? e.message : `${f.name}: เปิดไฟล์ไม่ได้`);
      }
    }
    setReading(null);
    if (added.length) {
      setFiles((m) => { const n = new Map(m); added.forEach((s) => n.set(s.meta.id, s)); return n; });
      setPages((p) => [...p, ...added.flatMap(initialPages)]);
      const n = added.reduce((a, s) => a + s.meta.pageCount, 0);
      toast.success(`เพิ่ม ${added.length} ไฟล์ · ${n} หน้า`);
    }
    if (errors.length) toast.error(errors.length === 1 ? errors[0] : `เปิดไม่ได้ ${errors.length} ไฟล์ — ${errors.join(" · ")}`);
  }, [toast]);

  const drop = useFileDrop((fs) => { void addFiles(fs); }, {
    accept: ["application/pdf", "image/"],
    disabled: !!reading || !!merging,
    folders: true,
    onReject: () => toast.warning("รวมได้เฉพาะไฟล์ PDF และรูป (JPG / PNG)"),
    onBusy: () => toast.info("รอสักครู่ — กำลังทำงานอยู่"),
  });

  /* ── กู้งานค้าง / ไฟล์ที่ส่งมา ── */
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialFiles?.length) { void addFiles(initialFiles).finally(() => setReady(true)); return; }
    if (!storageKey) return;
    void loadMergeDraft(storageKey).then((d) => {
      if (d && d.pages.length) {
        const m = new Map<string, PreparedSource>();
        d.files.forEach((f) => m.set(f.meta.id, { meta: f.meta, blob: f.blob }));
        const okPages = d.pages.filter((p) => m.has(p.fileId));
        if (okPages.length) {
          setFiles(m);
          setPages(okPages);
          if (d.name) setName(d.name);
          toast.action(`เปิดงานที่ค้างไว้ · ${m.size} ไฟล์ ${okPages.length} หน้า`, "เริ่มใหม่", () => {
            setPages([]);
            void clearMergeDraft(storageKey);
          }, { variant: "info" });
        }
      }
      setReady(true);
    });
  }, [addFiles, initialFiles, storageKey, toast]);

  // เก็บงานค้าง (หน่วงนิดหน่อย กันเขียนถี่ตอนลาก) — เก็บเฉพาะไฟล์ที่ยังใช้อยู่
  useEffect(() => {
    if (!storageKey || !ready) return;
    const t = setTimeout(() => {
      const used = usedFileIds(pages);
      const keep = [...files.values()].filter((f) => used.has(f.meta.id)).map((f) => ({ meta: f.meta, blob: f.blob }));
      void saveMergeDraft(storageKey, { pages, name, files: keep, savedAt: Date.now() });
    }, 500);
    return () => clearTimeout(t);
  }, [pages, name, files, storageKey, ready]);

  // ออกจากหน้า = ปิดไฟล์ที่เปิดค้างไว้วาดรูปตัวอย่าง
  useEffect(() => () => { filesRef.current.forEach((_, id) => releaseSource(id)); abortRef.current?.abort(); }, []);

  /* ── รวม ── */
  const summary = mergeSummary(pages);
  const runs = useMemo(() => groupRuns(pages), [pages]);
  const outName = mergedFileName(name);

  const merge = async () => {
    if (!pages.length) { toast.warning("ยังไม่มีไฟล์ — ลากไฟล์ PDF มาวางก่อน"); return; }
    const ac = new AbortController();
    abortRef.current = ac;
    const label = `${summary.pages} หน้า จาก ${summary.files} ไฟล์`;
    setMerging({ label: "กำลังรวม PDF", name: label, pct: 0 });
    try {
      const blob = await buildMergedPdf(pages, files, {
        title: outName.replace(/\.pdf$/i, ""),
        signal: ac.signal,
        onProgress: ({ done, total }) => setMerging({ label: "กำลังรวม PDF", name: label, pct: Math.round((done / total) * 99), count: { current: Math.min(done + 1, total), total } }),
      });
      downloadBlob(blob, outName);
      toast.success(`ดาวน์โหลดแล้ว · ${outName} (${summary.pages} หน้า)`);
      onMerged?.(blob, outName);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") toast.info("ยกเลิกการรวมแล้ว");
      else toast.error(e instanceof MergeSourceError ? e.message : "รวมไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง", { details: e });
    } finally {
      setMerging(null);
      abortRef.current = null;
    }
  };

  /* ── การกระทำ ── */
  const clearAll = () => {
    if (!pages.length) return;
    commit([], `ล้างทั้งหมดแล้ว (${summary.files} ไฟล์)`);
  };
  const fileDrag = useDragReorder((from, to) => reorderTo(moveRun(pagesRef.current, from, to)), { group: "pdf-merge-files" });
  const pageDrag = useDragReorder((from, to) => reorderTo(moveItem(pagesRef.current, from, to)), { group: "pdf-merge-pages" });
  const busy = !!merging;

  return (
    <div {...drop.guard} className={`flex flex-col gap-3 ${className}`}>
      {/* แถบเครื่องมือ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {([["files", "ทีละไฟล์"], ["pages", "ทีละหน้า"]] as [Mode, string][]).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setMode(k)}
              className={`rounded-md px-3 py-1.5 ${mode === k ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          {pages.length ? `${summary.files} ไฟล์ · รวม ${summary.pages} หน้า · ${mode === "files" ? "ลากการ์ดเพื่อสลับลำดับ" : "ลากหน้าเพื่อสลับ · หมุน/ลบรายหน้าได้"}` : "ไฟล์ไม่ถูกส่งขึ้นเซิร์ฟเวอร์ — รวมในเครื่องนี้"}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <Icon name="add" /> เพิ่มไฟล์
        </button>
        {pages.length > 0 && (
          <button type="button" onClick={clearAll} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-red-200 hover:text-red-600 disabled:opacity-50">
            <Icon name="delete" /> ล้างทั้งหมด
          </button>
        )}
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden"
          onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void addFiles(fs); }} />
      </div>

      {/* ช่องวางไฟล์ */}
      <div {...drop.zone("main")} onClick={() => !busy && inputRef.current?.click()} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        className={`cursor-pointer rounded-xl border-2 border-dashed text-center transition-colors ${drop.over === "main" ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-white hover:border-blue-300"} ${pages.length ? "px-4 py-3 text-sm" : "px-4 py-12"}`}>
        <div className={`flex items-center justify-center gap-2 text-slate-500 ${pages.length ? "" : "flex-col"}`}>
          <span className={pages.length ? "text-lg" : "text-4xl text-slate-400"}><Icon name="upload" /></span>
          <span>ลากไฟล์ PDF หรือรูปมาวางตรงนี้ หรือ <u className="text-blue-600">เลือกไฟล์</u></span>
          {!pages.length && <span className="text-xs text-slate-400">รับ PDF · JPG · PNG · WEBP · HEIC · Ctrl+V วางรูปได้ · ลากทั้งโฟลเดอร์ได้</span>}
        </div>
      </div>
      {reading && <UploadProgress {...reading} />}

      {/* การ์ด */}
      {mode === "files" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {runs.map((r, i) => {
            const src = files.get(r.fileId);
            if (!src) return null;
            const first = pages[r.start];
            return (
              <div key={r.key} {...fileDrag.rowProps(i)} {...fileDrag.holdProps(i)}
                className={`group relative flex cursor-grab flex-col rounded-xl border border-slate-200 bg-white p-2 shadow-sm active:cursor-grabbing ${fileDrag.rowCls(i)}`}>
                <div className="absolute left-2 top-2 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-slate-800/80 px-1.5 text-xs font-medium text-white">{i + 1}</div>
                <div data-no-hold-drag className="absolute right-1.5 top-1.5 z-10 flex gap-1">
                  <IconBtn title="หมุนทั้งไฟล์ 90°" icon="refresh" onClick={() => commit(rotateRun(pages, i), "หมุนแล้ว")} />
                  <IconBtn title="เอาออก" icon="cancel" danger onClick={() => commit(removeRun(pages, i), `เอาออกแล้ว · ${src.meta.name}`)} />
                </div>
                <Thumb src={src} index={first.index} rotation={first.rotation} />
                <div className="mt-2 flex items-start gap-1.5">
                  <FileTypeIcon ext={extOf(src.meta.name)} size={20} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-slate-700" title={src.meta.name}>{src.meta.name}</div>
                    <div className="text-[11px] text-slate-400">{runPageLabel(pages, r, src.meta.pageCount)}</div>
                  </div>
                </div>
                {r.end - r.start > 1 && (
                  <button type="button" data-no-hold-drag onClick={() => setMode("pages")}
                    className="mt-1.5 self-start text-[11px] text-blue-600 hover:underline">แตกดูทีละหน้า</button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {pages.map((p, i) => {
            const src = files.get(p.fileId);
            if (!src) return null;
            const startsFile = i === 0 || pages[i - 1].fileId !== p.fileId;
            return (
              <div key={p.id} {...pageDrag.rowProps(i)} {...pageDrag.holdProps(i)}
                className={`relative flex cursor-grab flex-col rounded-lg border bg-white p-1.5 active:cursor-grabbing ${startsFile ? "border-blue-200" : "border-slate-200"} ${pageDrag.rowCls(i)}`}>
                <div data-no-hold-drag className="absolute right-1 top-1 z-10 flex gap-0.5">
                  <IconBtn small title="หมุน 90°" icon="refresh" onClick={() => commit(pages.map((x, k) => (k === i ? { ...x, rotation: rotateBy(x.rotation) } : x)), "หมุนแล้ว")} />
                  <IconBtn small title="ลบหน้านี้" icon="cancel" danger onClick={() => commit(pages.filter((_, k) => k !== i), `ลบหน้า ${p.index + 1} ของ ${src.meta.name} แล้ว`)} />
                </div>
                <Thumb src={src} index={p.index} rotation={p.rotation} small />
                <div className="mt-1 flex items-center gap-1 text-[11px]">
                  <span className="font-medium text-slate-700">{i + 1}</span>
                  <span className="truncate text-slate-400" title={`${src.meta.name} · หน้า ${p.index + 1}`}>{src.meta.name} · น.{p.index + 1}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ตั้งชื่อ + รวม */}
      {pages.length > 0 && (
        <div className="sticky bottom-0 z-20 -mx-1 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
          {merging ? (
            <UploadProgress {...merging} onCancel={() => abortRef.current?.abort()} />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="pdf-merge-name" className="text-sm text-slate-500">ชื่อไฟล์</label>
              <div className="flex min-w-[180px] flex-1 items-center rounded-lg border border-slate-200 focus-within:border-blue-400">
                <input id="pdf-merge-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setName((v) => v.trim() || defaultMergeName())}
                  className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2 text-sm outline-none" />
                <span className="pr-3 text-sm text-slate-400">.pdf</span>
              </div>
              <button type="button" onClick={() => void merge()} disabled={!!reading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto">
                <Icon name="download" /> รวมแล้วดาวน์โหลด
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IconBtn({ icon, title, onClick, danger, small }: { icon: string; title: string; onClick: () => void; danger?: boolean; small?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`grid place-items-center rounded-md border border-slate-200 bg-white/95 text-slate-500 shadow-sm ${small ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm"} ${danger ? "hover:border-red-200 hover:text-red-600" : "hover:text-blue-600"}`}>
      <Icon name={icon} />
    </button>
  );
}

/** รูปตัวอย่างหน้า (วาดทีละหน้า · หมุนด้วย CSS) */
function Thumb({ src, index, rotation, small }: { src: PreparedSource; index: number; rotation: number; small?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    pageThumb(src.meta, src.blob, index, small ? 120 : 200)
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [src, index, small]);
  const sideways = rotation % 180 !== 0;
  return (
    <div className="relative grid aspect-[3/4] w-full place-items-center overflow-hidden rounded-md bg-slate-100">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" draggable={false}
          className="pointer-events-none max-h-full max-w-full object-contain shadow-sm transition-transform"
          style={{ transform: `rotate(${rotation}deg) scale(${sideways ? 0.75 : 1})` }} />
      ) : failed ? (
        <span className="px-2 text-center text-[11px] text-slate-400">ดูตัวอย่างไม่ได้ (ยังรวมได้)</span>
      ) : (
        <Spinner size={small ? 14 : 18} className="text-slate-400" />
      )}
    </div>
  );
}
