"use client";

/**
 * หน้าจัดเรียงงานพิมพ์ (1 งาน) — ERP เก็บงาน (/api/nesting-jobs) · ตัวช่วยในเครื่องคำนวณ (lib/nesting-helper)
 *
 * ขั้นตอน: เลือกลายจากคลัง Artwork (ได้ขนาด) → ลากไฟล์ PNG ตัวจริงใส่ทีละลาย → จัดเรียง (ตัวช่วยคิด)
 *        → ลากแก้ตำแหน่งได้ (ตรวจชน/เลยขอบทุกครั้ง) → ดาวน์โหลด PDF/EPS → บันทึกงานลง ERP
 * ย้ายหน้าจอมาจากหน้าเว็บของตัวช่วย (tools/nesting-app/web/static/app.js) ให้ใช้ของกลาง ERP
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useT, useLang } from "@/components/i18n";
import { useAuth } from "@/components/auth";
import { StandaloneShell } from "@/components/standalone-shell";
import { AssetPicker } from "@/components/asset-picker";
import { SaveBar } from "@/components/save-bar";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { usePushToast } from "@/components/toast";
import { ErrorState, LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import { HELPER_ROWS_VERSION, HELPER_SPLIT_VERSION, helperApi, helperDownload, helperLink, versionAtLeast, type SplitResult } from "@/lib/nesting-helper";
import type { AssetDetail, AssetRow, AssetSize } from "@/app/api/assets/shared";
import {
  ROTATE_LOCK_ANGLES, createNestingJob, getAssetSplits, getNestingJob, listPrintTypes, saveAssetSplit, toMm, updateNestingJob,
  type JobDraft, type NestingItem, type NestingJobRow, type NestingResult, type NestingStatus, type PrintType, type PublishResult, type SplitParams,
} from "./data";
import { HelperChip, HelperSetupCard, useHelperStatus } from "./helper-status";
import { ItemsPanel, type AssetPreview } from "./items-panel";
import { STATUS_STYLE } from "./list-view";
import { SETTINGS_DEFAULTS, fmt, fmtLen, natural, newKey, readSettings, rebalanceFill, sizeOf, type FileInfo, type Settings, type Unit } from "./nest-utils";
import { SettingsPanel, sheetFromPrintType } from "./settings-panel";
import { SheetView, rotated90, type HelperPart, type Placed } from "./sheet-view";
import { PublishModal } from "./publish-modal";
import { SplitModal } from "./split-modal";
import { JobSummary } from "./job-summary";

// การ์ดในคลังไฟล์ (ของกลาง) — โหลดเมื่อกดดูเท่านั้น (คลังไฟล์ตัวใหญ่ ไม่ให้หน้าจัดเรียงช้า)
const AssetDetailPopup = dynamic(() => import("@/components/asset-library").then((m) => m.AssetDetailPopup), { ssr: false });

type Summary = {
  used_length_mm: number; utilization: number; saving: number | null; placed: number; total: number;
  fill_mode: boolean; filled: number; per_part: { exact: number; filled: number }[];
  sheets: { width_mm: number; height_mm: number; used_length_mm: number; pieces: number; utilization: number; header: [string, string] }[];
};
type CheckResult = { close: { sheet: number; a: number; b: number; gap_mm: number }[]; outside: { sheet: number; index: number }[]; summary: Summary };
type HelperJob = {
  id: string; status: "running" | "done" | "error"; message: string; layout_version: number; warnings: string[];
  progress: { seconds: number; time_limit_s: number; generations: number; evaluations: number; best_length_mm: number | null; filled: number; stop_reason: string; stage: string };
  settings: { sheet_width_mm: number; sheet_height_mm: number | null; margin_mm: number; spacing_mm: number; cut_contour: boolean; header: boolean };
  parts?: HelperPart[]; sheets?: Placed[][]; summary?: Summary;
};
type Run = {
  hid: string; job: HelperJob | null; base: Placed[][] | null; edit: Placed[][] | null; summary: Summary | null;
  check: CheckResult | null; version: number; running: boolean; keys: string[]; snap: string; error: string | null;
};

const BG = [["#ffffff", "พื้นขาว", "White background"], ["#1b1b1b", "พื้นดำ", "Black background"], ["#d32f2f", "พื้นแดง", "Red background"], ["#2e7d32", "พื้นเขียว", "Green background"]] as const;

function makeDraft(name: string, status: NestingStatus, printTypeId: string | null, settings: Settings, items: NestingItem[], result: NestingResult | null): JobDraft {
  return { name: name.trim(), status, print_type_id: printTypeId, settings: settings as unknown as Record<string, unknown>, items, result };
}

/** สิ่งที่มีผลกับผลจัดเรียง (เปลี่ยนแล้วผลบนจอ "เก่า") — ไม่รวมข้อความหัวงาน/หน่วยที่แสดง */
function nestSnapshot(settings: Settings, items: NestingItem[]): string {
  const { header_text: _h, unit: _u, ...rest } = settings;
  return JSON.stringify({ rest, items: items.map((i) => [i.file?.sha, i.title, i.size, i.qty, i.fill_pct, i.lock ?? null, !!i.rows]) });
}

const stem = (name: string) => name.replace(/\.[^.]+$/, "");
const round2 = (n: number) => Math.round(n * 100) / 100;

/** ขนาดลายในงาน → ไซส์ของลายในคลัง (ตรงกับที่เลือกจาก dropdown ได้ป้ายชื่อเดิม) · ไม่ตรง = สร้างจากขนาดจริง (cm) */
function assetSizeOf(it: NestingItem, sizes: AssetSize[]): AssetSize | null {
  const v = it.size.value;
  if ((it.size.mode !== "width" && it.size.mode !== "height") || !v) return null;
  const hit = sizes.find((z) => z.unit !== "px" && Math.abs(toMm((it.size.mode === "width" ? z.w : z.h) ?? -1, z.unit) - v) < 0.05);
  if (hit) return hit;
  return it.size.mode === "width" ? { label: "", w: round2(v / 10), h: null, unit: "cm" } : { label: "", w: null, h: round2(v / 10), unit: "cm" };
}

type Pub = { asset_id: string | null; drive_folder_url: string | null; published_at: string | null };

const DEFAULT_SPLIT: SplitParams = { gap_mm: 3, joins: [] };
/** ขนาดที่จะพิมพ์ ÷ ขนาดจริงของภาพ (ชิ้นที่แยกได้ = ขนาดเท่าเดิมในภาพ) */
const scaleOf = (it: NestingItem, info: FileInfo) => { const sz = sizeOf(it, info); return sz ? sz.w / natural(info).w : 1; };
/** การ์ดชิ้นที่แยกมาจากภาพเดียวกัน (ภาพต้นฉบับ + ชื่องานเดิม) */
const sameSplit = (a: NestingItem, b: NestingItem) =>
  !!a.piece && !!b.piece && a.piece.source.sha === b.piece.source.sha && a.piece.parent.title === b.piece.parent.title;

export function NestingEditor({ id }: { id: string }) {
  const t = useT();
  const { lang } = useLang();
  const { can } = useAuth();
  const toast = usePushToast();
  const { status: helper, recheck } = useHelperStatus();
  const ready = helper.state === "ready";
  const canRun = can("nesting.run");
  const canSplit = helper.state === "ready" && versionAtLeast(helper.version, HELPER_SPLIT_VERSION);   // ล็อกลาย + แยกชิ้น (ตัวช่วย v1.3.0+)

  // ---------------------------------------------------------------- งาน (เก็บใน ERP)
  const [jobId, setJobId] = useState<string | null>(id === "new" ? null : id);
  const [loading, setLoading] = useState(id !== "new");
  const [loadError, setLoadError] = useState<string>();
  const [name, setName] = useState("");
  const [status, setStatus] = useState<NestingStatus>("draft");
  const [printTypeId, setPrintTypeId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(SETTINGS_DEFAULTS);
  const [items, setItems] = useState<NestingItem[]>([]);
  const [result, setResult] = useState<NestingResult | null>(null);
  const [savedSnap, setSavedSnap] = useState(() => JSON.stringify(makeDraft("", "draft", null, SETTINGS_DEFAULTS, [], null)));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [printTypes, setPrintTypes] = useState<PrintType[]>([]);
  const [pub, setPub] = useState<Pub>({ asset_id: null, drive_folder_url: null, published_at: null });   // ส่งเข้าคลังแล้ว (ไม่นับเป็นการแก้งาน)
  const [publishOpen, setPublishOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [itemsBig, setItemsBig] = useState(false);   // หน้าต่างใหญ่จัดการลาย (ตารางแถวละลาย)
  const nameRef = useRef<HTMLInputElement>(null);

  const draft = useMemo(() => makeDraft(name, status, printTypeId, settings, items, result), [name, status, printTypeId, settings, items, result]);
  const dirty = JSON.stringify(draft) !== savedSnap;

  const applyJob = useCallback((job: NestingJobRow) => {
    const s = readSettings(job.settings);
    let its = job.items;
    if (!s.fill_auto) {   // งานเก่า (ก่อนมีระบบแบ่งที่เหลือ): % ที่ใส่ไว้ = พิมพ์เอง คงไว้ทั้งหมด
      its = its.map((i) => ({ ...i, fill_pin: (i.fill_pct || 0) > 0 }));
      s.fill_auto = true;
    }
    setName(job.name); setStatus(job.status); setPrintTypeId(job.print_type_id); setSettings(s); setItems(its); setResult(job.result);
    setSavedSnap(JSON.stringify(makeDraft(job.name, job.status, job.print_type_id, s, its, job.result)));
    setPub({ asset_id: job.asset_id, drive_folder_url: job.drive_folder_url, published_at: job.published_at });
  }, []);

  useEffect(() => { listPrintTypes().then(setPrintTypes).catch(() => setPrintTypes([])); }, []);
  // โหมดเติม: ลายที่ไม่ได้พิมพ์ % เอง แบ่งที่เหลือให้เองทันที (เพิ่ม/ลบ/แยกลาย ก็แบ่งใหม่ให้)
  useEffect(() => { if (settings.fill) setItems((list) => rebalanceFill(list)); }, [items, settings.fill]);
  const load = useCallback(async () => {
    if (id === "new") return;
    setLoading(true); setLoadError(undefined);
    try { applyJob(await getNestingJob(id)); } catch (e) { setLoadError((e as Error).message); } finally { setLoading(false); }
  }, [id, applyJob]);
  useEffect(() => { void load(); }, [load]);

  // ---------------------------------------------------------------- รูปลายจากคลัง + ไฟล์จริงในตัวช่วย
  const [previews, setPreviews] = useState<Record<string, AssetPreview>>({});
  const [infos, setInfos] = useState<Record<string, FileInfo>>({});
  const [missing, setMissing] = useState<Record<string, string>>({});
  const askedAssets = useRef(new Set<string>());
  const askedFiles = useRef(new Set<string>());
  const [busy, setBusy] = useState<string | null>(null);   // ข้อความตอนรอ (อัปไฟล์ / ทำ PDF)

  useEffect(() => {
    for (const it of items) {
      const aid = it.asset_id;
      if (!aid || askedAssets.current.has(aid)) continue;
      askedAssets.current.add(aid);
      apiFetch(`/api/assets/${aid}`).then((r) => r.json()).then((j: { data?: AssetDetail | null }) => {
        if (j.data) setPreviews((p) => ({ ...p, [aid]: { url: j.data!.url, sizes: j.data!.sizes ?? [] } }));
      }).catch(() => { /* ไม่มีสิทธิ์คลัง = ไม่มีรูปตัวอย่าง ไม่เป็นไร */ });
    }
  }, [items]);

  useEffect(() => {
    if (!ready) return;
    for (const it of items) {
      const sha = it.file?.sha;
      if (!sha || askedFiles.current.has(sha)) continue;
      askedFiles.current.add(sha);
      helperApi<FileInfo & { missing?: boolean }>(`/api/files/${sha}`, lang)
        .then((info) => {
          if (info.missing) setMissing((m) => ({ ...m, [sha]: info.error ?? "missing" }));  // ไฟล์อยู่อีกเครื่อง → ให้ลากใหม่
          else setInfos((m) => ({ ...m, [sha]: { ...info, sha } }));
        })
        .catch((e) => setMissing((m) => ({ ...m, [sha]: (e as Error).message })));
    }
  }, [items, ready, lang]);

  const [splits, setSplits] = useState<Record<string, SplitParams>>({});
  const askedSplits = useRef(new Set<string>());
  useEffect(() => {
    const ids = [...new Set(items.map((i) => i.asset_id).filter((x): x is string => !!x && !askedSplits.current.has(x)))];
    if (!ids.length) return;
    for (const x of ids) askedSplits.current.add(x);
    getAssetSplits(ids).then((m) => setSplits((cur) => ({ ...cur, ...m }))).catch(() => { /* อ่านไม่ได้ = ไม่แยกอัตโนมัติ */ });
  }, [items]);

  const uploadToHelper = async (files: File[]): Promise<FileInfo[]> => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f, f.name);
    const r = await helperApi<{ files: FileInfo[] }>("/api/files", lang, { method: "POST", body: fd });
    const ok = r.files.filter((f) => f.sha && !f.error);
    for (const f of r.files) if (f.error) toast("error", `${f.name ?? ""}: ${f.error}`);
    setInfos((m) => ({ ...m, ...Object.fromEntries(ok.map((f) => [f.sha, f])) }));
    setMissing((m) => { const n = { ...m }; for (const f of ok) delete n[f.sha]; return n; });
    for (const f of ok) askedFiles.current.add(f.sha);
    return ok;
  };

  const withBusy = async (text: string, fn: () => Promise<void>) => {
    setBusy(text);
    try { await fn(); } catch (e) { toast("error", (e as Error).message); } finally { setBusy(null); }
  };

  const needHelper = () => {
    if (ready) return false;
    toast("error", t("ยังติดต่อตัวช่วยในเครื่องนี้ไม่ได้ — ดูวิธีติดตั้งด้านบน", "The helper on this computer is not reachable — see the setup steps above"));
    return true;
  };

  /** ผลแยกชิ้นจากตัวช่วย → การ์ดชิ้นละใบ (ขนาดเท่าเดิมในภาพ · จำนวน/ล็อกตามการ์ดเดิม) */
  const makePieces = (src: NestingItem, srcInfo: FileInfo, res: SplitResult, params: SplitParams, qtys?: number[], keep?: NestingItem[]): NestingItem[] => {
    const pieces = res.pieces ?? [];
    const s = scaleOf(src, srcInfo);
    const n = pieces.length;
    setInfos((m) => ({ ...m, ...Object.fromEntries(pieces.map((pc) => [pc.sha, pc as unknown as FileInfo])) }));
    setMissing((m) => { const x = { ...m }; for (const pc of pieces) delete x[pc.sha]; return x; });
    for (const pc of pieces) askedFiles.current.add(pc.sha);
    return pieces.map((pc, k): NestingItem => ({
      key: newKey(), asset_id: src.asset_id, title: `${src.title} · ${k + 1}`,
      size: src.size.mode === "natural" ? { mode: "natural", value: null } : { mode: "width", value: round2(pc.w_mm * s) },
      qty: qtys?.[k] ?? src.qty, fill_pct: settings.fill ? round2((src.fill_pct || 0) / n) : 0,
      file: { name: pc.name, sha: pc.sha }, lock: keep ? keep[k]?.lock ?? null : src.lock ?? null,
      piece: { ...params, source: src.file!, index: k, count: n, parent: { title: src.title, size: src.size, qty: src.qty } },
    }));
  };
  /** การ์ดภาพเดิม (ก่อนแยก) จากการ์ดชิ้นใดชิ้นหนึ่ง */
  const parentOf = (it: NestingItem, group: NestingItem[], file = it.piece!.source): NestingItem => ({
    key: newKey(), asset_id: it.asset_id, title: it.piece!.parent.title, size: it.piece!.parent.size, qty: it.piece!.parent.qty,
    fill_pct: round2(group.reduce((a, x) => a + (x.fill_pct || 0), 0)), file, lock: it.lock ?? null, piece: null,
  });
  const replaceGroup = (group: NestingItem[], next: NestingItem[]) => {
    const keys = new Set(group.map((g) => g.key));
    setItems((list) => list.flatMap((x) => (x.key === group[0].key ? next : keys.has(x.key) ? [] : [x])));
  };

  const attachFile = (key: string, file: File) => {
    if (needHelper()) return;
    void withBusy(t("กำลังอ่านและตรวจไฟล์…", "Reading and checking the file…"), async () => {
      const [info] = await uploadToHelper([file]);
      if (!info) return;
      const it = items.find((x) => x.key === key);
      const nf = { name: file.name, sha: info.sha };
      const group = it?.piece ? items.filter((x) => sameSplit(x, it)).sort((a, b) => a.piece!.index - b.piece!.index) : it ? [it] : [];
      const params: SplitParams | undefined = it?.piece ? { gap_mm: it.piece.gap_mm, joins: it.piece.joins } : it?.asset_id ? splits[it.asset_id] : undefined;
      if (it && params && !info.error) {
        // การ์ดชิ้น = ลากไฟล์ต้นฉบับมาใหม่ → แยกใหม่ตามค่าเดิม (ได้ชิ้นเดิมทุกครั้ง) · การ์ดจากคลังที่จำการแยกไว้ = แยกให้เอง
        const src: NestingItem = it.piece ? { ...parentOf(it, group, nf), key: it.key } : { ...it, file: nf, title: it.title || stem(file.name) };
        try {
          if (!canSplit) throw new Error(t("ตัวช่วยต้องเป็น v1.3.0 ขึ้นไป", "The helper must be v1.3.0 or later"));
          const res = await helperApi<SplitResult>(`/api/files/${info.sha}/split`, lang, { method: "POST", body: { ...params, apply: true, name: file.name } });
          const same = it.piece && group.length === (res.pieces?.length ?? 0);
          replaceGroup(group, makePieces(src, info, res, params, same ? group.map((g) => g.qty) : undefined, same ? group : undefined));   // ชิ้นเดิมครบ = คงจำนวน/ล็อกรายชิ้น
          toast("success", it.piece ? t("สร้างชิ้นที่แยกไว้ใหม่จากไฟล์ต้นฉบับแล้ว", "Rebuilt the split pieces from the original file")
            : t(`แยกเป็น ${res.pieces?.length ?? 0} ชิ้นตามที่จำไว้กับลายนี้ — กด “รวมกลับเป็นภาพเดียว” ได้`, `Split into ${res.pieces?.length ?? 0} pieces as remembered for this artwork — you can merge them back`));
          return;
        } catch (e) {
          toast("warning", t(`แยกชิ้นตามที่จำไว้ไม่ได้ — ใช้ทั้งภาพแทน (${(e as Error).message})`, `Couldn't split as remembered — using the whole image (${(e as Error).message})`));
          if (it.piece) { replaceGroup(group, [src]); return; }
        }
      }
      setItems((list) => list.map((x) => (x.key === key ? { ...x, file: nf, title: x.title || stem(file.name) } : x)));
    });
  };

  // ---------------------------------------------------------------- แยกชิ้น (หน้าต่าง) / รวมกลับ
  const [splitKey, setSplitKey] = useState<string | null>(null);
  const splitItem = splitKey ? items.find((x) => x.key === splitKey) ?? null : null;
  const splitInfo = splitItem?.file ? infos[splitItem.file.sha] : undefined;
  const savedSplit = splitItem?.asset_id ? splits[splitItem.asset_id] : undefined;
  const splitInitial = useMemo(() => savedSplit ?? DEFAULT_SPLIT, [savedSplit]);

  const applySplit = async (key: string, res: SplitResult, params: SplitParams, qtys: number[], remember: boolean) => {
    const it = items.find((x) => x.key === key);
    const info = it?.file ? infos[it.file.sha] : undefined;
    if (!it || !info) return;
    const pieces = makePieces(it, info, res, params, qtys);
    replaceGroup([it], pieces);
    setSplitKey(null);
    let saved = false;
    if (remember && it.asset_id) {
      try { await saveAssetSplit(it.asset_id, params); setSplits((m) => ({ ...m, [it.asset_id!]: params })); saved = true; }
      catch (e) { toast("error", t(`แยกแล้ว แต่จำไว้กับลายในคลังไม่ได้: ${(e as Error).message}`, `Split done, but couldn't remember it in the library: ${(e as Error).message}`)); }
    }
    toast("success", saved ? t(`แยกเป็น ${pieces.length} ชิ้นแล้ว · จำไว้กับลายในคลังแล้ว`, `Split into ${pieces.length} pieces · remembered in the library`)
      : t(`แยกเป็น ${pieces.length} ชิ้นแล้ว`, `Split into ${pieces.length} pieces`));
  };
  const forgetSplit = async (assetId: string) => {
    try {
      await saveAssetSplit(assetId, null);
      setSplits((m) => { const x = { ...m }; delete x[assetId]; return x; });
      toast("success", t("เลิกจำการแยกของลายนี้แล้ว", "This artwork's split is no longer remembered"));
    } catch (e) { toast("error", (e as Error).message); }
  };
  const mergeBack = (key: string) => {
    const it = items.find((x) => x.key === key);
    if (!it?.piece) return;
    const group = items.filter((x) => sameSplit(x, it));
    replaceGroup(group, [parentOf(it, group)]);
  };

  const addFiles = (files: File[]) => {
    if (needHelper()) return;
    void withBusy(t(`กำลังอ่านและตรวจ ${files.length} ไฟล์…`, `Reading and checking ${files.length} file(s)…`), async () => {
      const ok = await uploadToHelper(files);
      setItems((list) => [...list, ...ok.map((info): NestingItem => ({
        key: newKey(), asset_id: null, title: stem(info.name ?? "image.png"), size: { mode: "natural", value: null },
        qty: 1, fill_pct: 0, file: { name: info.name ?? "image.png", sha: info.sha },
      }))]);
    });
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  const addFromLibrary = (assets: AssetRow[]) => {
    setPreviews((p) => ({ ...p, ...Object.fromEntries(assets.map((a) => [a.id, { url: a.url, sizes: a.sizes ?? [] }])) }));
    for (const a of assets) askedAssets.current.add(a.id);
    setItems((list) => [...list, ...assets.map((a): NestingItem => {
      const s = (a.sizes ?? []).find((z) => z.unit !== "px" && (z.w || z.h));
      return {
        key: newKey(), asset_id: a.id, title: a.title || stem(a.file_name), qty: 1, fill_pct: 0, file: null,
        size: !s ? { mode: "natural", value: null } : s.w ? { mode: "width", value: toMm(s.w, s.unit) } : { mode: "height", value: toMm(s.h ?? 0, s.unit) },
      };
    })]);
  };

  // ---------------------------------------------------------------- จัดเรียง (ตัวช่วยคิด)
  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const [sheetIdx, setSheetIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [bg, setBg] = useState("#ffffff");
  const [showSpacing, setShowSpacing] = useState(false);
  const curSnap = nestSnapshot(settings, items);
  const stale = !!run && run.snap !== curSnap;

  const checkTimer = useRef<number | undefined>(undefined);
  const requestCheck = useCallback((delay = 200) => {
    window.clearTimeout(checkTimer.current);
    checkTimer.current = window.setTimeout(async () => {
      const r = runRef.current;
      if (!r?.edit || r.running) return;
      try {
        const c = await helperApi<CheckResult>(`/api/jobs/${r.hid}/check`, lang, { method: "POST", body: { sheets: r.edit } });
        setRun((prev) => (prev && prev.hid === r.hid ? { ...prev, check: c } : prev));
      } catch (e) { toast("error", (e as Error).message); }
    }, delay);
  }, [lang, toast]);

  const validate = (): string | null => {
    if (!items.length) return t("เพิ่มลายก่อน (เลือกจากคลังหรือลากไฟล์ PNG)", "Add artwork first (pick from the library or drop PNG files)");
    if (!(settings.sheet_width_mm > 0)) return t("ใส่ความกว้างแผ่นก่อน", "Enter the sheet width first");
    if (settings.sheet_height_mm != null && !(settings.sheet_height_mm > 0)) return t("ใส่ความยาวแผ่นก่อน", "Enter the sheet length first");
    const rollFill = settings.fill && settings.sheet_height_mm == null;
    if (rollFill && settings.fill_roll === "length" && !(settings.fill_length_mm > 0)) return t("แผ่นม้วน + เติมเต็ม: ใส่ความยาวที่จะเติมก่อน", "Roll + fill: enter the fill length first");
    if (rollFill && settings.fill_roll === "used" && !items.some((it) => it.qty > 0))
      return t("เติมช่องว่างไม่ยืดม้วน: ต้องมีลายที่ใส่จำนวนอย่างน้อย 1 ชิ้น (หรือเลือก “เติมถึงความยาว”)", "Fill gaps without lengthening the roll: at least one artwork needs a quantity of 1 or more (or choose “Fill up to a length”)");
    const rowsVer = helper.state === "ready" && versionAtLeast(helper.version, HELPER_ROWS_VERSION);
    if ((items.some((it) => it.rows) || (rollFill && settings.fill_roll === "used")) && !rowsVer)
      return t(`เรียงเป็นแถวรายลาย / เติมช่องว่างไม่ยืดม้วน ต้องใช้ตัวช่วย v${HELPER_ROWS_VERSION} ขึ้นไป — คลิกขวาไอคอนกรรไกรข้างนาฬิกา → “ตรวจหาเวอร์ชันใหม่”`,
        `Per-artwork rows / filling gaps without lengthening the roll need helper v${HELPER_ROWS_VERSION} or later — right-click the scissors icon next to the clock → “Check for updates”`);
    for (const it of items) {
      const sha = it.file?.sha;
      if (!sha || missing[sha]) return t(`"${it.title}" ยังไม่มีไฟล์พิมพ์ในเครื่องนี้ — ลาก PNG ตัวจริงมาใส่`, `"${it.title}" has no print file on this computer — drop the real PNG on it`);
      if (infos[sha]?.error) return t(`"${it.title}" ใช้ไม่ได้: ${infos[sha].error}`, `"${it.title}" is unusable: ${infos[sha].error}`);
      if (it.size.mode !== "natural" && !(Number(it.size.value) > 0)) return t(`"${it.title}" ยังไม่ได้ใส่ขนาด`, `"${it.title}" has no size yet`);
      if (!settings.fill && it.qty < 1) return t(`"${it.title}" จำนวนต้องอย่างน้อย 1`, `"${it.title}" needs a quantity of at least 1`);
    }
    if (items.some((it) => it.lock) && !canSplit)
      return t(`ล็อกลายต้องใช้ตัวช่วย v${HELPER_SPLIT_VERSION} ขึ้นไป — คลิกขวาไอคอนกรรไกรข้างนาฬิกา → “ตรวจหาเวอร์ชันใหม่”`,
        `Locking needs helper v${HELPER_SPLIT_VERSION} or later — right-click the scissors icon next to the clock → “Check for updates”`);
    if (settings.fill) {
      const total = items.reduce((a, it) => a + (it.fill_pct || 0), 0);
      if (Math.abs(total - 100) > 0.01) return t(`เปอร์เซ็นต์ที่เติมรวมกันต้องได้ 100% (ตอนนี้ ${Math.round(total * 100) / 100}%)`, `Fill percentages must add up to 100% (now ${Math.round(total * 100) / 100}%)`);
    }
    return null;
  };

  const startNest = async () => {
    if (needHelper()) return;
    const err = validate();
    if (err) { toast("error", err); return; }
    const body = {
      settings: { ...settings, job_name: name.trim(), resample_to_dpi: settings.resample_to_dpi || null,
        fill_length_mm: settings.fill_roll === "used" && settings.sheet_height_mm == null ? null : settings.fill_length_mm },
      items: items.map((it) => ({
        sha: it.file!.sha, name: `${it.title || stem(it.file!.name)}.png`, qty: it.qty,
        size: { mode: it.size.mode, value: it.size.mode === "natural" ? null : it.size.value },
        fill_pct: settings.fill ? it.fill_pct : 0,
        lock_box: !!it.lock?.box, rotate: it.lock ? ROTATE_LOCK_ANGLES[it.lock.rotate] : null,
        rows: settings.layout !== "rows" && !!it.rows,   // ไม่ได้ล็อกการหมุน = ตัวช่วยเลือก 0° / 90° ให้เอง
      })),
    };
    try {
      const { id: hid } = await helperApi<{ id: string }>("/api/nest", lang, { method: "POST", body });
      setRun({ hid, job: null, base: null, edit: null, summary: null, check: null, version: -1, running: true,
        keys: items.map((i) => i.key), snap: curSnap, error: null });
      setSheetIdx(0); setSelected(null);
    } catch (e) { toast("error", (e as Error).message); }
  };

  // รอผลจากตัวช่วย (ถามทุกครึ่งวินาทีระหว่างคิด — ได้ผลรอบแรกเร็ว แล้วดีขึ้นเรื่อย ๆ)
  const runningHid = run?.running ? run.hid : null;
  useEffect(() => {
    if (!runningHid) return;
    let alive = true;
    let timer: number | undefined;
    const tick = async () => {
      const r = runRef.current;
      if (!alive || !r || r.hid !== runningHid) return;
      try {
        const data = await helperApi<HelperJob>(`/api/jobs/${r.hid}?since=${r.version}`, lang);
        if (!alive) return;
        setRun((prev) => {
          if (!prev || prev.hid !== runningHid) return prev;
          const next: Run = { ...prev, job: { ...(prev.job ?? {}), ...data, parts: data.parts ?? prev.job?.parts } as HelperJob, running: data.status === "running" };
          if (data.sheets) {
            next.base = data.sheets;
            next.edit = structuredClone(data.sheets);
            next.summary = data.summary ?? null;
            next.version = data.layout_version;
            next.check = null;
          }
          if (data.status === "error") next.error = data.message;
          return next;
        });
        if (data.status === "running") timer = window.setTimeout(tick, 500);
        else if (data.status === "done") {
          toast("success", t(`จัดเรียงเสร็จ · ${data.progress.stop_reason}`, `Nesting finished · ${data.progress.stop_reason}`));
          requestCheck(0);
        }
      } catch (e) {
        if (alive) setRun((prev) => (prev ? { ...prev, running: false, error: (e as Error).message } : prev));
      }
    };
    void tick();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [runningHid, lang, t, toast, requestCheck]);

  const summary = run?.check?.summary ?? run?.summary ?? null;
  // ผลล่าสุด → เก็บลงงาน (บันทึกพร้อมงาน) — เฉพาะผลที่ตรงกับค่าตั้งปัจจุบัน
  useEffect(() => {
    if (!summary || stale) return;
    setResult({ used_length_mm: summary.used_length_mm, sheets: summary.sheets.length, placed: summary.placed,
      total: summary.total, utilization: summary.utilization, filled: summary.filled });
  }, [summary, stale]);

  const sheets = run?.edit ?? null;
  const idx = sheets && sheetIdx < sheets.length ? sheetIdx : 0;
  const parts = run?.job?.parts ?? [];
  const jobSettings = run?.job?.settings;

  const movePiece = (i: number, x: number, y: number) => {
    setRun((prev) => {
      if (!prev?.edit) return prev;
      const edit = prev.edit.map((sh, si) => (si === idx ? sh.map((p, pi) => (pi === i ? { ...p, x, y } : p)) : sh));
      return { ...prev, edit };
    });
    requestCheck();
  };
  const rotateSelected = useCallback(() => {
    const r = runRef.current;
    if (selected == null || !r?.edit || r.running) return;
    const pl = r.edit[idx]?.[selected];
    const part = pl ? r.job?.parts?.[pl.tid] : undefined;
    if (!pl || !part) return;
    const np = rotated90(pl, part);
    setRun((prev) => prev?.edit ? { ...prev, edit: prev.edit.map((sh, si) => (si === idx ? sh.map((p, pi) => (pi === selected ? np : p)) : sh)) } : prev);
    requestCheck();
  }, [selected, idx, requestCheck]);

  // ลูกศรขยับทีละ 0.5 mm (Shift = 5 mm) · R หมุน · Esc ยกเลิกเลือก
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest?.("input, textarea, select") || selected == null) return;
      const step = e.shiftKey ? 5 : 0.5;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const r = runRef.current;
      if (mv[e.key] && r?.edit && !r.running) {
        e.preventDefault();
        const pl = r.edit[idx]?.[selected];
        if (pl) movePiece(selected, Math.round((pl.x + mv[e.key][0]) * 100) / 100, Math.round((pl.y + mv[e.key][1]) * 100) / 100);
      } else if (e.key === "r" || e.key === "R") rotateSelected();
      else if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const [confirm, setConfirm] = useState<null | { kind: "reset" } | { kind: "nest" } | { kind: "export"; what: "pdf" | "eps" | "report" | "folder" }>(null);

  /** สรุปก่อนยืนยันจัดเรียง (กดจากหน้าต่างจัดการรูป) */
  const nestConfirmText = () => {
    const pcs = items.reduce((a, i) => a + i.qty, 0);
    const sheet = settings.sheet_height_mm == null
      ? t(`แผ่นม้วนกว้าง ${fmtLen(settings.sheet_width_mm, settings.unit, lang)}`, `roll ${fmtLen(settings.sheet_width_mm, settings.unit, lang)} wide`)
      : t(`แผ่น ${fmtLen(settings.sheet_width_mm, settings.unit, lang)} × ${fmtLen(settings.sheet_height_mm, settings.unit, lang)}`, `sheet ${fmtLen(settings.sheet_width_mm, settings.unit, lang)} × ${fmtLen(settings.sheet_height_mm, settings.unit, lang)}`);
    const what = t(`${items.length} รูป · ${pcs} ชิ้น${settings.fill ? " + เติมที่ว่าง" : ""} · ${sheet}`, `${items.length} images · ${pcs} pcs${settings.fill ? " + fill gaps" : ""} · ${sheet}`);
    return run ? `${what} — ${t("ผลจัดเรียงเดิมบนจอ (รวมที่ลากแก้เอง) จะถูกแทนที่", "the current result on screen (including pieces you moved) will be replaced")}` : what;
  };

  const doExport = async (what: "pdf" | "eps" | "report" | "folder") => {
    const r = runRef.current;
    if (!r?.edit || r.running) return;
    const text = what === "eps" ? t("กำลังสั่ง Illustrator ทำ EPS… (ประมาณ 10–30 วินาที)", "Asking Illustrator to make the EPS… (about 10–30 seconds)")
      : t("กำลังสร้างไฟล์ PDF…", "Creating the PDF…");
    await withBusy(text, async () => {
      await helperApi(`/api/jobs/${r.hid}/export`, lang, { method: "POST",
        body: { sheets: r.edit, eps: what === "eps", job_name: name.trim(), header_text: settings.header_text, lang } });
      if (what === "pdf" || what === "eps") {
        const file = await helperDownload(`/api/jobs/${r.hid}/download?kind=${what}`, lang);
        toast("success", t(`ดาวน์โหลด ${file} แล้ว`, `Downloaded ${file}`));
      } else if (what === "report") window.open(helperLink(`/api/jobs/${r.hid}/report`, lang), "_blank");
      else await helperApi(`/api/jobs/${r.hid}/open-folder`, lang, { method: "POST" });
    });
  };
  const exportFiles = (what: "pdf" | "eps" | "report" | "folder") => {
    const c = runRef.current?.check;
    if (c && (c.close.length || c.outside.length)) setConfirm({ kind: "export", what });
    else void doExport(what);
  };

  // ---------------------------------------------------------------- บันทึกงานลง ERP
  const persist = async (): Promise<string> => {
    const job = jobId ? await updateNestingJob(jobId, draft) : await createNestingJob(draft);
    setSavedSnap(JSON.stringify(draft));
    setSavedAt(new Date());
    if (!jobId) {
      setJobId(job.id);
      window.history.replaceState(null, "", `/tasks/nesting/${job.id}`);  // เปลี่ยน URL โดยไม่โหลดหน้าใหม่ (ผลจัดเรียงบนจอไม่หาย)
    }
    return job.id;
  };
  const save = async () => {
    if (!name.trim()) { setSaveError(t("ใส่ชื่องานก่อนบันทึก", "Enter a job name before saving")); nameRef.current?.focus(); return; }
    setSaving(true); setSaveError(null);
    try {
      await persist();
      toast("success", t("บันทึกงานแล้ว", "Job saved"));
    } catch (e) { setSaveError((e as Error).message); } finally { setSaving(false); }
  };
  /** ก่อนส่งเข้าคลัง: งานต้องอยู่ใน ERP ล่าสุด (ชื่องาน = ชื่อโฟลเดอร์บน Drive) */
  const ensureSaved = async (): Promise<string | null> => {
    if (!name.trim()) {
      toast("error", t("ใส่ชื่องานก่อนส่ง — ชื่องานจะเป็นชื่อโฟลเดอร์บน Drive", "Enter a job name first — it becomes the folder name on Drive"));
      nameRef.current?.focus();
      return null;
    }
    if (jobId && !dirty) return jobId;
    try { return await persist(); } catch (e) { toast("error", (e as Error).message); return null; }
  };
  const discard = () => {
    const d = JSON.parse(savedSnap) as JobDraft;
    setName(d.name); setStatus(d.status); setPrintTypeId(d.print_type_id); setSettings(readSettings(d.settings)); setItems(d.items); setResult(d.result);
  };

  // ---------------------------------------------------------------- ส่วนแสดงผล
  const u: Unit = settings.unit;
  const patchSettings = (p: Partial<Settings>) => {
    const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as Partial<Settings>;
    setSettings((s) => ({ ...s, ...clean }));
  };
  const resultByKey = useMemo(() => {
    const out: Record<string, string> = {};
    if (!summary || stale || !run) return out;
    run.keys.forEach((k, i) => {
      const r = summary.per_part?.[i];
      if (!r) return;
      out[k] = summary.fill_mode ? t(`ได้ ${r.exact + r.filled} ชิ้น (เป๊ะ ${r.exact} + เติม ${r.filled})`, `Got ${r.exact + r.filled} pcs (exact ${r.exact} + fill ${r.filled})`)
        : t(`วางแล้ว ${r.exact} ชิ้น`, `Placed ${r.exact} pcs`);
    });
    return out;
  }, [summary, stale, run, t]);

  const buildMeta = () => {
    const sheetsInfo = summary?.sheets ?? [];
    const sizes: AssetSize[] = sheetsInfo.map((sh, i) => ({
      label: sheetsInfo.length > 1 ? `แผ่น ${i + 1}` : "ขนาดแผ่น", w: round2(sh.width_mm / 10), h: round2(sh.height_mm / 10), unit: "cm",
    }));
    const merged = new Map<string, { asset_id: string; title: string; url: string | null; size: AssetSize | null; qty: number }>();
    const add = (it: NestingItem, qty: number) => {
      if (!it.asset_id || qty <= 0) return;
      const size = assetSizeOf(it, previews[it.asset_id]?.sizes ?? []);
      const mk = `${it.asset_id}|${JSON.stringify(size)}`;
      const cur = merged.get(mk);
      if (cur) cur.qty += qty;
      else merged.set(mk, { asset_id: it.asset_id, title: it.title, url: previews[it.asset_id]?.url ?? null, size, qty });
    };
    const sets = new Map<string, { it: NestingItem; qty: number }>();
    (run?.keys ?? []).forEach((k, i) => {
      const it = items.find((x) => x.key === k);
      const r = summary?.per_part?.[i];
      if (!it?.asset_id || !r) return;
      const qty = r.exact + r.filled;
      if (!it.piece) { add(it, qty); return; }
      const sk = `${it.piece.source.sha}|${it.piece.parent.title}`;
      const cur = sets.get(sk);
      sets.set(sk, { it: { ...it, title: it.piece.parent.title, size: it.piece.parent.size }, qty: cur ? Math.min(cur.qty, qty) : qty });
    });
    for (const { it, qty } of sets.values()) add(it, qty);
    return { sizes, print_items: [...merged.values()] };
  };
  const onPublished = (r: PublishResult) => {
    applyJob(r.job);
    setPublishOpen(false);
    toast("success", r.created
      ? t("ส่งเข้าคลังงานพิมพ์แล้ว — สร้างการ์ดใหม่ในคลังไฟล์", "Sent to the print library — a new card was created in the file library")
      : t(`ส่งใหม่แล้ว — อัปเดตการ์ดเดิม${r.replaced ? ` · ย้ายไฟล์เก่า ${r.replaced} ไฟล์ลงถังขยะ Drive` : ""}`,
        `Sent again — the same card was updated${r.replaced ? ` · ${r.replaced} old file(s) moved to the Drive trash` : ""}`));
  };

  const progressText = (() => {
    const p = run?.job?.progress;
    if (!p) return t("กำลังเริ่ม…", "Starting…");
    if (p.stage) return `${p.stage}…`;
    if (p.best_length_mm == null) return t("กำลังเริ่ม…", "Starting…");
    return `${t(`กำลังหาแบบที่ดีกว่า · รุ่นที่ ${p.generations} · ลองแล้ว ${p.evaluations} แบบ`, `Looking for a better layout · generation ${p.generations} · ${p.evaluations} tried`)} · `
      + (p.filled ? t(`ดีสุดตอนนี้เติมได้ ${p.filled} ชิ้น`, `best so far fills ${p.filled} pcs`) : t(`ดีสุดตอนนี้ ${fmtLen(p.best_length_mm, u, lang)}`, `best so far ${fmtLen(p.best_length_mm, u, lang)}`));
  })();

  const check = run?.check;
  const closePairs = (check?.close ?? []).filter((c) => c.sheet === idx).map((c) => ({ a: c.a, b: c.b, gap: fmtLen(c.gap_mm, u, lang) }));
  const outside = new Set((check?.outside ?? []).filter((o) => o.sheet === idx).map((o) => o.index));
  const sheetH = jobSettings ? (jobSettings.sheet_height_mm ?? summary?.sheets[idx]?.height_mm ?? 100) : 100;
  const header = jobSettings?.header && settings.header_text ? summary?.sheets[idx]?.header ?? null : null;
  const done = !!run && !run.running && run.job?.status === "done" && !!sheets;

  if (loading) return <StandaloneShell title={t("จัดเรียงงานพิมพ์", "Print nesting")} icon="✂️" accent="violet"><LoadingState /></StandaloneShell>;
  if (loadError) return <StandaloneShell title={t("จัดเรียงงานพิมพ์", "Print nesting")} icon="✂️" accent="violet"><ErrorState hint={loadError} onRetry={() => void load()} /></StandaloneShell>;

  return (
    <StandaloneShell title={t("จัดเรียงงานพิมพ์", "Print nesting")} icon="✂️" accent="violet">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <Link href="/tasks/nesting" className="text-sm text-slate-500 hover:text-slate-800">← {t("งานจัดเรียงทั้งหมด", "All nesting jobs")}</Link>
        <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
          placeholder={t("ตั้งชื่องาน เช่น Calypso 1 cm", "Job name, e.g. Calypso 1 cm")}
          className="h-9 min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 text-sm font-medium" />
        <select value={status} onChange={(e) => setStatus(e.target.value as NestingStatus)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm">
          {(Object.keys(STATUS_STYLE) as NestingStatus[]).map((k) => <option key={k} value={k}>{lang === "en" ? STATUS_STYLE[k].en : STATUS_STYLE[k].th}</option>)}
        </select>
        <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs" title={t("หน่วยที่แสดง", "Display unit")}>
          {(["mm", "cm"] as Unit[]).map((x) => (
            <button key={x} type="button" onClick={() => patchSettings({ unit: x })}
              className={`px-2.5 py-1.5 ${u === x ? "bg-violet-100 font-semibold text-violet-700" : "text-slate-600"}`}>{x}</button>
          ))}
        </div>
        {pub.published_at && (
          <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
            ✓ {t(`ส่งเข้าคลังแล้ว ${new Date(pub.published_at).toLocaleDateString("th-TH")}`, `In the print library since ${new Date(pub.published_at).toLocaleDateString("en-GB")}`)}
            {pub.asset_id && can("assets.view") && (
              <button type="button" onClick={() => setCardOpen(true)} className="font-medium underline">{t("เปิดการ์ด", "Open card")}</button>
            )}
            {pub.drive_folder_url && (
              <a href={pub.drive_folder_url} target="_blank" rel="noreferrer" className="font-medium underline">Drive ↗</a>
            )}
          </span>
        )}
        <HelperChip status={helper} />
      </div>

      <div className="flex flex-col gap-4 px-6 py-4 lg:flex-row">
        <aside className="w-full shrink-0 space-y-4 lg:w-[380px]">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">{t("แผ่นงาน", "Sheet")}</h3>
            <SettingsPanel settings={settings} onChange={patchSettings} printTypes={printTypes} printTypeId={printTypeId}
              onPrintType={(pt) => { setPrintTypeId(pt?.id ?? null); if (pt) patchSettings(sheetFromPrintType(pt)); }} />
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 flex items-start gap-2 text-sm font-semibold text-slate-800">
              <span className="flex-1">{t("ลายที่จะจัด", "Artwork to nest")} <span className="font-normal text-slate-400">
                · {t(`${items.length} ลาย · ${items.reduce((a, i) => a + i.qty, 0)} ชิ้น`, `${items.length} designs · ${items.reduce((a, i) => a + i.qty, 0)} pcs`)}{settings.fill ? t(" + เติม", " + fill") : ""}</span></span>
            </h3>
            <ItemsPanel items={items} infos={infos} missing={missing} previews={previews} settings={settings} resultByKey={resultByKey}
              busy={!!busy} onChange={setItems} onAttach={attachFile} onAddFiles={addFiles} onPickLibrary={() => setPickerOpen(true)}
              canSplit={canSplit} onSplit={setSplitKey} onMergeBack={mergeBack} />
          </section>
          {canRun && (
            <div className="sticky bottom-2 rounded-xl border border-slate-200 bg-white p-3">
              <button type="button" onClick={() => setItemsBig(true)} disabled={!!busy}
                title={t("เปิดหน้าต่างใหญ่ จัดการรูปเป็นตาราง (ค้นหา · ลากสลับลำดับ · แก้ทุกช่อง)", "Open a large window to manage images as a table (search · drag to reorder · edit everything)")}
                className="mb-2 w-full rounded-lg border border-violet-300 bg-violet-50 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60">
                🖼 {t("จัดการรูป", "Manage images")}
              </button>
              <button type="button" onClick={() => void startNest()} disabled={!!run?.running || !!busy}
                className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                {run?.running ? t("กำลังจัดเรียง…", "Nesting…") : run ? t("จัดเรียงใหม่", "Nest again") : t("จัดเรียง", "Nest")}
              </button>
              <div className="mt-1 text-center text-[11px] text-slate-400">
                {settings.layout === "rows" ? t("เรียงเป็นแถว — คำนวณเสร็จทันที", "Rows — calculated instantly")
                  : settings.time_limit_s > 0 ? t(`คิดนานสุด ${settings.time_limit_s} วินาที (ถ้าไม่ดีขึ้นแล้วจะหยุดก่อนเอง)`, `Thinks for up to ${settings.time_limit_s} s (stops early once it stops improving)`)
                    : t("จัดแบบเร็ว (ไม่ค้นหาแบบที่ดีกว่า)", "Quick layout (no search for a better one)")}
              </div>
            </div>
          )}
        </aside>

        <main className="min-w-0 flex-1 space-y-3">
          <HelperSetupCard status={helper} onRecheck={() => void recheck()} />
          {busy && <div className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">⏳ {busy}</div>}
          {run?.error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{run.error}</div>}
          {stale && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            {t("ค่าตั้งหรือไฟล์เปลี่ยนไปหลังจัดเรียง — ผลบนจอยังเป็นของเดิม กด “จัดเรียงใหม่” เพื่ออัปเดต", "Settings or files changed after nesting — the result on screen is still the old one. Press “Nest again” to update")}
          </div>}
          {!stale && !!run?.job?.warnings?.length && (
            <ul className="list-disc rounded-lg border border-amber-200 bg-amber-50 py-2 pl-8 pr-4 text-sm text-amber-800">
              {run.job.warnings.map((w, k) => <li key={k}>{w}</li>)}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              [t("ยาวที่ใช้", "Length used"), summary ? `${fmtLen(summary.used_length_mm, u, lang)}${summary.sheets.length > 1 ? ` · ${t(`${summary.sheets.length} แผ่น`, `${summary.sheets.length} sheets`)}` : ""}` : "—"],
              [t("ใช้พื้นที่", "Utilization"), summary ? `${fmt(summary.utilization, 1, lang)}%` : "—"],
              summary?.fill_mode ? [t("เติมเพิ่ม", "Filled extra"), t(`${summary.filled} ชิ้น`, `${summary.filled} pcs`)]
                : [t("ประหยัดกว่าเรียงแบบกรอบ", "Saved vs. rectangles"), summary?.saving == null ? "—" : `${fmt(summary.saving, 1, lang)}%`],
              [t("วางแล้ว", "Placed"), summary ? `${summary.placed}/${summary.total}` : "—"],
            ].map(([label, value], k) => (
              <div key={k} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs text-slate-500">{label}</div>
                <div className="text-lg font-semibold text-slate-900">{value}</div>
              </div>
            ))}
          </div>

          {summary && !stale && !run?.running && sheets && parts.length > 0 && (
            <JobSummary parts={parts} titles={(run?.keys ?? []).map((k) => items.find((x) => x.key === k)?.title ?? "")}
              perPart={summary.per_part ?? []} sheets={sheets} unit={u} />
          )}

          {run?.running && (
            <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-800">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" />
              <span className="flex-1">{progressText}</span>
              <button type="button" className="underline" onClick={() => void helperApi(`/api/jobs/${run.hid}/stop`, lang, { method: "POST" }).catch(() => {})}>
                {t("พอแล้ว ใช้ผลนี้", "Good enough, use this")}
              </button>
            </div>
          )}

          {sheets && parts.length > 0 && jobSettings ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                {sheets.length > 1 && sheets.map((_, i) => (
                  <button key={i} type="button" onClick={() => { setSheetIdx(i); setSelected(null); }}
                    className={`rounded-lg border px-2.5 py-1 ${i === idx ? "border-violet-400 bg-violet-50 font-semibold text-violet-700" : "border-slate-300"}`}>
                    {t(`แผ่น ${i + 1}`, `Sheet ${i + 1}`)}
                  </button>
                ))}
                <span className="flex-1" />
                {selected != null && done && (
                  <button type="button" onClick={rotateSelected} className="rounded-lg border border-slate-300 px-2.5 py-1">{t("หมุน 90°", "Rotate 90°")}</button>
                )}
                {done && <span className="text-slate-400">{t("ลากชิ้นเพื่อขยับเอง · ลูกศรขยับทีละ 0.5 mm · R หมุน", "Drag pieces to move them · arrow keys move 0.5 mm · R rotates")}</span>}
                <span>{t("พื้น", "Background")}</span>
                {BG.map(([c, th, en]) => (
                  <button key={c} type="button" title={t(th, en)} aria-label={t(th, en)} onClick={() => setBg(c)}
                    className={`h-5 w-5 rounded-full border ${bg === c ? "ring-2 ring-violet-500 ring-offset-1" : "border-slate-300"}`} style={{ background: c }} />
                ))}
                {jobSettings.header && (
                  <label className="flex items-center gap-1" title={t("ติ๊กออก = ซ่อนข้อความหัวงานทั้งบนจอและในไฟล์ (ไม่ต้องจัดเรียงใหม่)", "Untick = hide the header text on screen and in the file (no need to nest again)")}>
                    <input type="checkbox" checked={settings.header_text} onChange={(e) => patchSettings({ header_text: e.target.checked })} />
                    {t("ข้อความหัวงาน", "Header text")}
                  </label>
                )}
                <label className="flex items-center gap-1"><input type="checkbox" checked={showSpacing} onChange={(e) => setShowSpacing(e.target.checked)} />{t("แสดงระยะห่าง", "Show spacing")}</label>
                <button type="button" aria-label={t("ซูมออก", "Zoom out")} onClick={() => setZoom((z) => Math.max(0.3, z / 1.4))} className="h-7 w-7 rounded border border-slate-300">−</button>
                <button type="button" onClick={() => setZoom(1)} className="h-7 rounded border border-slate-300 px-2">{t("พอดี", "Fit")}</button>
                <button type="button" aria-label={t("ซูมเข้า", "Zoom in")} onClick={() => setZoom((z) => Math.min(8, z * 1.4))} className="h-7 w-7 rounded border border-slate-300">+</button>
              </div>
              {summary?.sheets[idx]?.header && (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
                  <b>{summary.sheets[idx].header[0]}</b><br /><span className="text-slate-600">{summary.sheets[idx].header[1]}</span>
                </div>
              )}
              <SheetView parts={parts} placements={sheets[idx] ?? []} width={jobSettings.sheet_width_mm} height={sheetH}
                roll={jobSettings.sheet_height_mm == null} margin={jobSettings.margin_mm} cutContour={jobSettings.cut_contour}
                header={header} bg={bg} showSpacing={showSpacing} zoom={zoom} running={!!run?.running}
                closePairs={closePairs} outside={outside} selected={selected} onSelect={setSelected} onMove={movePiece}
                rollText={t("ม้วนต่อ — ลากชิ้นลงมาได้ ความยาวแผ่นจะยืดตาม", "Roll continues — drag pieces down here and the sheet gets longer")} />
              {check && (check.close.length > 0 || check.outside.length > 0) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {check.close.length > 0 && <span className="rounded bg-red-50 px-2 py-1 text-red-700">
                    {t(`ชิดกันเกินระยะ ${check.close.length} คู่ — ใกล้สุด ${fmtLen(Math.min(...check.close.map((c) => c.gap_mm)), u, lang, u === "cm" ? 3 : 2)} (ตั้งไว้ ${fmtLen(jobSettings.spacing_mm, u, lang)})`,
                      `${check.close.length} pair(s) closer than the spacing — closest ${fmtLen(Math.min(...check.close.map((c) => c.gap_mm)), u, lang, u === "cm" ? 3 : 2)} (set to ${fmtLen(jobSettings.spacing_mm, u, lang)})`)}
                  </span>}
                  {check.outside.length > 0 && <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">{t(`เลยขอบแผ่น ${check.outside.length} ชิ้น`, `${check.outside.length} pcs over the sheet edge`)}</span>}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!done || !!busy} onClick={() => exportFiles("pdf")}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">{t("ดาวน์โหลด PDF", "Download PDF")}</button>
                {canRun && (
                  <button type="button" disabled={!done || !!busy || stale} onClick={() => setPublishOpen(true)}
                    title={stale ? t("ค่าตั้งเปลี่ยนหลังจัดเรียง — จัดเรียงใหม่ก่อนส่ง", "Settings changed after nesting — nest again before sending") : undefined}
                    className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50">
                    📤 {pub.published_at ? t("ส่งเข้าคลังใหม่", "Send to library again") : t("ส่งเข้าคลังงานพิมพ์", "Send to print library")}
                  </button>
                )}
                <button type="button" disabled={!done || !!busy} onClick={() => exportFiles("eps")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">EPS</button>
                <button type="button" disabled={!done || !!busy} onClick={() => exportFiles("report")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">{t("รายงาน", "Report")}</button>
                <button type="button" disabled={!done || !!busy} onClick={() => exportFiles("folder")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">{t("เปิดโฟลเดอร์ไฟล์", "Open output folder")}</button>
                <span className="flex-1" />
                <button type="button" disabled={!done} onClick={() => setConfirm({ kind: "reset" })} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">{t("คืนค่าที่ระบบจัด", "Reset to computed layout")}</button>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <div className="text-base font-medium text-slate-700">{t("เริ่มจากเพิ่มลายทางซ้าย", "Start by adding artwork on the left")}</div>
              <div className="mt-1 text-sm text-slate-500">{t("เลือกลายจากคลัง หรือลากไฟล์ PNG · ใส่จำนวนและขนาด แล้วกด “จัดเรียง” — ผลจะขึ้นตรงนี้",
                "Pick artwork from the library or drop PNG files · enter quantities and sizes, then press “Nest” — the result appears here")}</div>
            </div>
          )}
          {canRun && (
            <SaveBar dirty={dirty} saving={saving} error={saveError} savedAt={savedAt} onSave={save} onDiscard={jobId ? discard : undefined}
              saveLabel={t("💾 บันทึกงาน", "💾 Save job")}
              note={t("บันทึกค่าตั้ง + รายการลาย + ผลล่าสุด (ไฟล์ PNG อยู่ในเครื่องนี้)", "Saves settings, artwork list and the latest result (PNG files stay on this computer)")} />
          )}
        </main>
      </div>

      {run && sheets && (
        <PublishModal open={publishOpen} onClose={() => setPublishOpen(false)} jobName={name} printTypes={printTypes}
          defaultPrintTypeId={printTypeId} helperVersion={helper.state === "ready" ? helper.version : null} hid={run.hid} sheets={sheets}
          headerText={settings.header_text} publishedAt={pub.published_at} ensureSaved={ensureSaved} buildMeta={buildMeta} onPublished={onPublished}
          warn={check && (check.close.length || check.outside.length)
            ? t("มีชิ้นที่ชิดเกินระยะหรือเลยขอบแผ่น — งานจริงอาจชนกันหรือพิมพ์ตกขอบ", "Some pieces are too close or over the sheet edge — the print may overlap or run off the edge") : null} />
      )}
      {cardOpen && pub.asset_id && <AssetDetailPopup assetId={pub.asset_id} onClose={() => setCardOpen(false)} />}
      <ERPModal open={itemsBig} onClose={() => setItemsBig(false)} size="xl" defaultExpanded
        title={`🖼 ${t("จัดการรูป", "Manage images")} · ${t(`${items.length} ลาย · ${items.reduce((a, i) => a + i.qty, 0)} ชิ้น`, `${items.length} designs · ${items.reduce((a, i) => a + i.qty, 0)} pcs`)}`}
        description={t("แก้ได้ทุกช่องเหมือนการ์ด · ลาก ⠿ เพื่อสลับลำดับ · ลากไฟล์ PNG มาวางที่แถวเพื่อใส่ไฟล์", "Edit everything as on the cards · drag ⠿ to reorder · drop a PNG on a row to attach it")}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setItemsBig(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">{t("เสร็จ", "Done")}</button>
            {canRun && (   // ปิดหน้าต่างแล้วจัดเรียงเลย (ผลขึ้นในหน้าหลัก)
              <button type="button" onClick={() => setConfirm({ kind: "nest" })} disabled={!!run?.running || !!busy}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                {run?.running ? t("กำลังจัดเรียง…", "Nesting…") : run ? t("จัดเรียงใหม่", "Nest again") : t("จัดเรียง", "Nest")}
              </button>
            )}
          </div>
        }>
        <ItemsPanel variant="table" items={items} infos={infos} missing={missing} previews={previews} settings={settings} resultByKey={resultByKey}
          busy={!!busy} onChange={setItems} onAttach={attachFile} onAddFiles={addFiles} onPickLibrary={() => setPickerOpen(true)}
          canSplit={canSplit} onSplit={setSplitKey} onMergeBack={mergeBack} />
      </ERPModal>
      {splitItem && splitInfo && (
        <SplitModal open onClose={() => setSplitKey(null)} item={splitItem} info={splitInfo} scale={scaleOf(splitItem, splitInfo)}
          initial={splitInitial} saved={!!savedSplit} canRemember={!!splitItem.asset_id && canRun} unit={settings.unit}
          onApply={(res, params, qtys, remember) => applySplit(splitItem.key, res, params, qtys, remember)}
          onForget={() => forgetSplit(splitItem.asset_id!)} />
      )}
      <AssetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} multiple typeFilter="image" defaultSource="artwork"
        title={t("เลือกลายจากคลัง Artwork", "Pick artwork from the library")}
        onSelect={(assets) => { addFromLibrary(assets); setPickerOpen(false); }} />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        variant={confirm?.kind === "reset" ? "danger" : "default"}
        title={confirm?.kind === "reset" ? t("คืนค่าที่ระบบจัด", "Reset to computed layout")
          : confirm?.kind === "nest" ? (run ? t("จัดเรียงใหม่เลยไหม?", "Nest again now?") : t("เริ่มจัดเรียงเลยไหม?", "Start nesting now?"))
          : t("มีชิ้นที่ชิดเกินหรือเลยขอบ", "Some pieces are too close or over the edge")}
        message={confirm?.kind === "reset"
          ? t("ตำแหน่งที่ลากแก้เองทั้งหมดจะถูกยกเลิก กลับไปใช้ผลที่ระบบจัดให้", "Every piece you moved by hand goes back to the computed layout")
          : confirm?.kind === "nest" ? nestConfirmText()
          : t("ถ้าส่งออกตอนนี้ งานจริงอาจชนกันหรือพิมพ์ตกขอบ ต้องการส่งออกต่อหรือไม่?", "If you export now, pieces may overlap or print off the edge. Export anyway?")}
        confirmText={confirm?.kind === "reset" ? t("คืนค่า", "Reset") : confirm?.kind === "nest" ? (run ? t("จัดเรียงใหม่", "Nest again") : t("จัดเรียง", "Nest")) : t("ส่งออกต่อ", "Export anyway")}
        cancelText={t("ยกเลิก", "Cancel")}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c?.kind === "reset") {
            setRun((prev) => prev?.base ? { ...prev, edit: structuredClone(prev.base), check: null } : prev);
            requestCheck(0);
          } else if (c?.kind === "nest") {   // จากหน้าต่างจัดการรูป: ปิดหน้าต่างแล้วจัดเรียง (ผลขึ้นหน้าหลัก)
            setItemsBig(false);
            void startNest();
          } else if (c?.kind === "export") void doExport(c.what);
        }}
      />
    </StandaloneShell>
  );
}
