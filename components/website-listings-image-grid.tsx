"use client";
/**
 * 🖼 แท็บรูปภาพ ของ ▦ แก้ไขทีละมาก — รูปเว็บของหลายสินค้าในตารางเดียว
 * --------------------------------------------------------------------------
 *   - ทีละสินค้า: Hero คอม · Hero มือถือ · รูปบนเว็บ (≤ 12)   ·   ทีละสี: รูปสี (≤ 8) · Hero สี คอม · Hero สี มือถือ
 *   - ลากรูปจากเครื่องลงช่อง (useFileDrop) · ลากรูปสลับลำดับ/ย้ายข้ามช่อง · ✕ เอาออก · ⬆ อัปโหลด · 📚 คลัง (AssetPicker) · ERP = ใช้รูปจาก ERP · 🗑 ล้างช่อง
 *   - Hero รับรูปหรือวิดีโอ (วิดีโอใช้ตัวอัปกลาง uploadMediaFile ≤ 200 MB) · ช่องอื่นรับเฉพาะรูป
 *   - ช่องที่เปลี่ยน = สีเหลือง · ยังไม่บันทึกจนกดบันทึกที่ป๊อป (ตัวแม่เรียก save() ผ่าน ref)
 * ข้อมูล: GET /api/website/listings/images (แผนที่รูปทั้งร้าน — ตัวเดียวกับ 📸 ลงรูปทีละมาก)
 * บันทึก: POST /api/website/listings/images mode "set" (ตั้งทั้งช่องตามที่เห็น · audit ค่าเดิม · ล้างแคชเว็บ)
 * ไฟล์อัปขึ้นคลังทันทีที่ลง (เหมือนช่องรูปทีละสินค้า) — ผูกกับสินค้าตอนกดบันทึก
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type DragEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { uploadResizedImage } from "@/components/image-attach";
import { uploadMediaFile } from "@/lib/media-upload";
import { AssetPicker } from "@/components/asset-picker";
import { MAX_SKU_WEB_IMAGES, MAX_WEB_IMAGES, isVideoName, type CatalogParent, type HeroPick } from "@/lib/website-image-match";
import type { Listing } from "@/components/website-listings-panel";

type Level = "product" | "color";
type Item = { key: string; kind: "image" | "video" };
type Parent = CatalogParent & { otherShopIds: string[] };
type SlotCol = { id: string; label: string; max: number; hero: boolean };
type ImgRow = { key: string; parentId: string; skuId: string | null; code: string; name: string; erpKey: string | null };

export interface ImageGridHandle {
  dirty: () => number;
  save: () => Promise<{ ok: number; failed: { label: string; error: string }[] }>;
  discard: () => void;
}

const PAGE = 60;
const DRAG_TYPE = "text/x-erp-grid-img";
const keyUrl = (key: string, w = 160) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
const COLS: Record<Level, SlotCol[]> = {
  product: [
    { id: "h:desktop", label: "Hero คอม", max: 1, hero: true },
    { id: "h:mobile", label: "Hero มือถือ", max: 1, hero: true },
    { id: "g", label: `รูปบนเว็บ (≤ ${MAX_WEB_IMAGES})`, max: MAX_WEB_IMAGES, hero: false },
  ],
  color: [
    { id: "s", label: `รูปสี (≤ ${MAX_SKU_WEB_IMAGES})`, max: MAX_SKU_WEB_IMAGES, hero: false },
    { id: "sh:desktop", label: "Hero สี คอม", max: 1, hero: true },
    { id: "sh:mobile", label: "Hero สี มือถือ", max: 1, hero: true },
  ],
};
const itemOf = (key: string): Item => ({ key, kind: isVideoName(key) ? "video" : "image" });
const sameItems = (a: Item[], b: Item[]) => a.length === b.length && a.every((x, i) => x.key === b[i].key);

/** ช่อง (slot) ↔ คีย์: "<parentId>|g" · "<pid>|h:desktop" · "<pid>|s:<skuId>" · "<pid>|sh:<skuId>:desktop" */
const slotKey = (r: ImgRow, c: SlotCol) => (c.id === "s" ? `${r.parentId}|s:${r.skuId}` : c.id.startsWith("sh:") ? `${r.parentId}|sh:${r.skuId}:${c.id.slice(3)}` : `${r.parentId}|${c.id}`);

export const WebsiteListingsImageGrid = forwardRef<
  ImageGridHandle,
  {
    shopId: string;
    level: Level;
    listings: Listing[];
    /** แถวที่เห็น (กรองจากตัวแม่): ติ๊กไว้ · ค้นหา · เฉพาะที่ต้องแก้ */
    rowFilter: (r: { parentId: string; code: string; name: string }) => boolean;
    onDirtyChange: (n: number) => void;
    onOpenFolderUpload: () => void;
    reloadKey: number;
  }
>(function WebsiteListingsImageGrid({ shopId, level, listings, rowFilter, onDirtyChange, onOpenFolderUpload, reloadKey }, ref) {
  const toast = useToast();
  const [parents, setParents] = useState<Parent[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Item[]>>({});
  const [busy, setBusy] = useState<Record<string, number>>({});
  const [limit, setLimit] = useState(PAGE);
  const [picker, setPicker] = useState<string | null>(null);
  const [uploadTo, setUploadTo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const load = async () => {
    setLoadErr(null);
    try {
      const r = await apiFetch(`/api/website/listings/images?shopId=${encodeURIComponent(shopId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "โหลดไม่สำเร็จ");
      setParents(j.parents ?? []);
    } catch (e) {
      setLoadErr((e as Error).message || "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่");
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, reloadKey]);

  const byPid = useMemo(() => new Map((parents ?? []).map((p) => [p.parentId, p])), [parents]);
  const listingBy = useMemo(() => new Map(listings.map((l) => [l.parentId, l])), [listings]);
  const order = useMemo(() => new Map(listings.map((l, i) => [l.parentId, i])), [listings]);

  /** ค่าเดิมของช่อง (จากแผนที่รูป) */
  const origOf = (sk: string): Item[] => {
    const [pid, slot] = [sk.slice(0, sk.indexOf("|")), sk.slice(sk.indexOf("|") + 1)];
    const p = byPid.get(pid);
    if (!p) return [];
    if (slot === "g") return p.webImages.map(itemOf);
    if (slot === "h:desktop" || slot === "h:mobile") {
      const k = p.hero[slot.slice(2) as "desktop" | "mobile"];
      return k ? [itemOf(k)] : [];
    }
    if (slot.startsWith("s:")) return (p.skus.find((s) => s.id === slot.slice(2))?.webImages ?? []).map(itemOf);
    const [, skuId, hs] = slot.split(":");
    const k = p.skus.find((s) => s.id === skuId)?.hero[hs as "desktop" | "mobile"];
    return k ? [itemOf(k)] : [];
  };
  const valOf = (sk: string) => draft[sk] ?? origOf(sk);
  const setSlot = (sk: string, items: Item[]) =>
    setDraft((d) => {
      const n = { ...d };
      if (sameItems(items, origOf(sk))) delete n[sk];
      else n[sk] = items;
      return n;
    });

  const dirty = Object.keys(draft).length;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const rows: ImgRow[] = useMemo(() => {
    const ps = [...(parents ?? [])].sort((a, b) => (order.get(a.parentId) ?? 1e9) - (order.get(b.parentId) ?? 1e9));
    const nameOf = (pid: string, fallback: string) => listingBy.get(pid)?.display?.name || fallback;
    if (level === "product") return ps.map((p) => ({ key: p.parentId, parentId: p.parentId, skuId: null, code: p.code, name: nameOf(p.parentId, p.name), erpKey: listingBy.get(p.parentId)?.erpImageKey ?? null }));
    return ps.flatMap((p) => p.skus.map((s) => ({ key: s.id, parentId: p.parentId, skuId: s.id, code: s.code, name: `${s.label} · ${p.code}`, erpKey: null })));
  }, [parents, level, listingBy, order]);
  const visible = useMemo(() => rows.filter((r) => rowFilter(r)), [rows, rowFilter]);
  const page = visible.slice(0, limit);
  const cols = COLS[level];
  const colOfSlot = (sk: string): SlotCol => {
    const slot = sk.slice(sk.indexOf("|") + 1);
    const id = slot === "g" || slot.startsWith("h:") ? slot : slot.startsWith("s:") ? "s" : `sh:${slot.split(":")[2]}`;
    return [...COLS.product, ...COLS.color].find((c) => c.id === id)!;
  };

  // ---- เพิ่มรูปเข้าช่อง (Hero = แทน) ----
  const addItems = (sk: string, items: Item[]) => {
    const col = colOfSlot(sk);
    const ok = col.hero ? items : items.filter((x) => x.kind === "image");
    if (ok.length < items.length) toast.warning("วิดีโอลงได้เฉพาะช่อง Hero");
    if (!ok.length) return;
    const cur = draftRef.current[sk] ?? origOf(sk);
    if (col.hero) return setSlot(sk, [ok[0]]);
    const merged = [...cur, ...ok.filter((x) => !cur.some((y) => y.key === x.key))];
    if (merged.length > col.max) toast.warning(`ช่องนี้ใส่ได้ ${col.max} รูป — ตัดส่วนเกินออก`);
    setSlot(sk, merged.slice(0, col.max));
  };

  const uploadFiles = async (sk: string, files: File[]) => {
    const col = colOfSlot(sk);
    const list = col.hero ? files.slice(0, 1) : files;
    setBusy((b) => ({ ...b, [sk]: (b[sk] ?? 0) + list.length }));
    for (const f of list) {
      try {
        const video = f.type.startsWith("video/") || isVideoName(f.name);
        if (video && !col.hero) {
          toast.warning("วิดีโอลงได้เฉพาะช่อง Hero");
          continue;
        }
        const key = video ? await uploadMediaFile(f, { folder: "storefront-hero" }) : (await uploadResizedImage(f, { folder: "storefront-products", max: 2000 })).r2_key;
        addItems(sk, [{ key, kind: video ? "video" : "image" }]);
      } catch (e) {
        toast.error(`อัปโหลด ${f.name} ไม่สำเร็จ: ${(e as Error).message}`);
      } finally {
        setBusy((b) => ({ ...b, [sk]: Math.max(0, (b[sk] ?? 1) - 1) }));
      }
    }
  };
  const drop = useFileDrop((files, sk) => void uploadFiles(sk, files), { accept: ["image/", "video/"], onReject: () => toast.warning("ลากได้เฉพาะรูปหรือวิดีโอ") });

  const fromErp = async (r: ImgRow, sk: string) => {
    const [type, id] = r.skuId ? ["skus_v2", r.skuId] : ["parent_skus_v2", r.parentId];
    try {
      const j = await (await apiFetch(`/api/attachments?entity_type=${type}&entity_ids=${id}`)).json();
      const keys = ((j?.by_entity?.[id] ?? []) as { file_path: string | null; content_type: string | null }[])
        .filter((a) => a.file_path && (!a.content_type || a.content_type.startsWith("image/")))
        .map((a) => a.file_path as string);
      if (!keys.length) return toast.info("ใน ERP ยังไม่มีรูปของรายการนี้");
      addItems(sk, keys.map((k) => ({ key: k, kind: "image" })));
    } catch {
      toast.error("โหลดรูป ERP ไม่สำเร็จ");
    }
  };

  // ---- ลากรูปภายในตาราง (เรียง/ย้ายข้ามช่อง) ----
  const onThumbDragStart = (e: DragEvent, sk: string, i: number) => {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ sk, i }));
    e.dataTransfer.effectAllowed = "move";
  };
  const moveTo = (e: DragEvent, sk: string, before: number | null) => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return false;
    e.preventDefault();
    e.stopPropagation();
    const { sk: from, i } = JSON.parse(raw) as { sk: string; i: number };
    const src = [...valOf(from)];
    const [it] = src.splice(i, 1);
    if (!it) return true;
    const col = colOfSlot(sk);
    if (it.kind === "video" && !col.hero) {
      toast.warning("วิดีโอลงได้เฉพาะช่อง Hero");
      return true;
    }
    if (from === sk) {
      const at = before === null ? src.length : before > i ? before - 1 : before;
      src.splice(at, 0, it);
      setSlot(sk, src);
      return true;
    }
    const dst = col.hero ? [] : valOf(sk).filter((x) => x.key !== it.key);
    if (!col.hero && dst.length >= col.max) {
      toast.warning(`ช่องปลายทางเต็มแล้ว (${col.max})`);
      return true;
    }
    dst.splice(before === null ? dst.length : before, 0, it);
    setSlot(from, src);
    setSlot(sk, dst);
    return true;
  };

  // ---- บันทึก (ตัวแม่เรียก) ----
  useImperativeHandle(ref, () => ({
    dirty: () => Object.keys(draftRef.current).length,
    discard: () => setDraft({}),
    save: async () => {
      const d = draftRef.current;
      const items = new Map<string, { parentId: string; gallery?: string[]; skus?: Record<string, string[]>; hero?: Record<string, HeroPick | null>; skuHero?: Record<string, Record<string, HeroPick | null>> }>();
      const pick = (x: Item[]): HeroPick | null => (x[0] ? (x[0].kind === "video" ? { key: x[0].key, kind: "video" } : x[0].key) : null);
      for (const [sk, list] of Object.entries(d)) {
        const pid = sk.slice(0, sk.indexOf("|"));
        const slot = sk.slice(sk.indexOf("|") + 1);
        const it = items.get(pid) ?? { parentId: pid };
        if (slot === "g") it.gallery = list.map((x) => x.key);
        else if (slot.startsWith("h:")) it.hero = { ...(it.hero ?? {}), [slot.slice(2)]: pick(list) };
        else if (slot.startsWith("s:")) it.skus = { ...(it.skus ?? {}), [slot.slice(2)]: list.map((x) => x.key) };
        else {
          const [, skuId, hs] = slot.split(":");
          it.skuHero = { ...(it.skuHero ?? {}), [skuId]: { ...(it.skuHero?.[skuId] ?? {}), [hs]: pick(list) } };
        }
        items.set(pid, it);
      }
      if (!items.size) return { ok: 0, failed: [] };
      try {
        const r = await apiFetch("/api/website/listings/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopIds: [shopId], mode: "set", items: [...items.values()] }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || "บันทึกรูปไม่สำเร็จ");
        const bad = new Set(((j.failed ?? []) as { parentId: string }[]).map((f) => f.parentId));
        setDraft((cur) => Object.fromEntries(Object.entries(cur).filter(([sk]) => bad.has(sk.slice(0, sk.indexOf("|"))))));
        void load();
        return { ok: items.size - bad.size, failed: [...bad].map((pid) => ({ label: byPid.get(pid)?.code ?? pid, error: "บันทึกรูปไม่สำเร็จ" })) };
      } catch (e) {
        return { ok: 0, failed: [{ label: "รูปภาพ", error: (e as Error).message }] };
      }
    },
  }));

  const cell = (r: ImgRow, c: SlotCol) => {
    const sk = slotKey(r, c);
    const items = valOf(sk);
    const changed = sk in draft;
    const n = busy[sk] ?? 0;
    return (
      <td
        key={c.id}
        {...drop.zone(sk)}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes(DRAG_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          } else drop.zone(sk).onDragOver(e);
        }}
        onDrop={(e) => {
          if (!moveTo(e, sk, null)) drop.zone(sk).onDrop(e);
        }}
        className={`relative border-b border-slate-100 px-2 py-1.5 align-top ${changed ? "bg-amber-50" : ""}`}
      >
        <FileDropHint show={drop.over === sk} label={c.hero ? "วางเพื่อตั้ง Hero" : "วางเพื่อเพิ่มรูป"} />
        <div className="flex flex-wrap items-start gap-1.5">
          {items.map((it, i) => (
            <div
              key={`${it.key}-${i}`}
              draggable
              onDragStart={(e) => onThumbDragStart(e, sk, i)}
              onDragOver={(e) => Array.from(e.dataTransfer.types).includes(DRAG_TYPE) && e.preventDefault()}
              onDrop={(e) => moveTo(e, sk, i)}
              className="group relative h-16 w-12 shrink-0 cursor-grab overflow-hidden rounded-md border border-slate-200 bg-slate-100"
              title={it.key.split("/").pop()}
            >
              {it.kind === "video" ? (
                <div className="flex h-full w-full items-center justify-center bg-slate-800 text-lg text-white">🎬</div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={keyUrl(it.key)} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />
              )}
              {!c.hero && i === 0 && <span className="absolute left-0.5 top-0.5 rounded bg-black/55 px-1 text-[9px] text-white">1</span>}
              <button
                type="button"
                onClick={() => setSlot(sk, items.filter((_, j) => j !== i))}
                aria-label="เอาออก"
                title="เอาออกจากเว็บ (ไฟล์ยังอยู่ในคลัง)"
                className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-slate-900/80 text-[10px] text-white group-hover:flex"
              >
                ✕
              </button>
            </div>
          ))}
          {n > 0 && <div className="flex h-16 w-12 items-center justify-center rounded-md border border-dashed border-blue-300 text-[10px] text-blue-600">⏳ {n}</div>}
          {items.length < c.max || c.hero ? (
            <div className="flex flex-wrap items-center gap-1 self-center text-[10px]">
              <button type="button" onClick={() => { setUploadTo(sk); fileRef.current?.click(); }} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-600 hover:border-blue-300 hover:text-blue-700" title={c.hero ? "อัปโหลดรูปหรือวิดีโอ" : "อัปโหลดรูป"}>
                ⬆ อัป
              </button>
              <button type="button" onClick={() => setPicker(sk)} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-600 hover:border-blue-300 hover:text-blue-700" title="เลือกจากคลัง">
                📚 คลัง
              </button>
              {!c.hero && (
                <button type="button" onClick={() => void fromErp(r, sk)} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-600 hover:border-blue-300 hover:text-blue-700" title="ใช้รูปจาก ERP">
                  ERP
                </button>
              )}
            </div>
          ) : null}
          {items.length > 1 && (
            <button type="button" onClick={() => setSlot(sk, [])} className="self-center text-[10px] text-slate-400 hover:text-rose-600" title="ล้างช่องนี้ (กลับไปใช้รูป ERP)">
              🗑
            </button>
          )}
        </div>
        {!items.length && !c.hero && <p className="mt-0.5 text-[10px] text-slate-400">ว่าง = ใช้รูป ERP</p>}
      </td>
    );
  };

  if (loadErr)
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {loadErr}{" "}
        <button type="button" onClick={() => void load()} className="ml-1 underline">
          ลองใหม่
        </button>
      </div>
    );
  if (!parents)
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );

  const pickerCol = picker ? colOfSlot(picker) : null;
  return (
    <div {...drop.guard} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2">
        <span className="text-xs text-slate-600">ลากรูป/วิดีโอจากเครื่องลงช่องได้เลย · ลากรูปสลับลำดับหรือย้ายข้ามช่อง · รูปแรก = รูปหลัก</span>
        <button
          type="button"
          onClick={() => (dirty ? toast.info("บันทึกหรือยกเลิกรูปที่แก้ก่อน แล้วค่อยลงทั้งโฟลเดอร์") : onOpenFolderUpload())}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:border-slate-400"
        >
          📁 ลงทั้งโฟลเดอร์ (จับคู่ชื่อไฟล์)
        </button>
      </div>
      {!visible.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">ไม่พบแถว ลองเปลี่ยนคำค้นหรือเอาตัวกรองออก</div>
      ) : (
        <div className="max-h-[62vh] overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 w-56 min-w-[14rem] border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-medium text-slate-500">
                  {level === "product" ? "สินค้า" : "สี"} ({visible.length})
                </th>
                {cols.map((c) => (
                  <th key={c.id} className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[11px] font-medium text-slate-500" style={{ minWidth: c.hero ? 130 : 360 }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.map((r) => (
                <tr key={r.key}>
                  <td className="sticky left-0 z-[5] border-b border-slate-100 bg-white px-3 py-1.5 align-top">
                    <div className="flex items-start gap-2">
                      {r.erpKey && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={keyUrl(r.erpKey, 96)} alt="" title="รูปปกใน ERP (ใช้เมื่อช่องเว็บว่าง)" className="h-10 w-10 shrink-0 rounded object-cover opacity-70" loading="lazy" />
                      )}
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-slate-800">{r.code}</div>
                        <div className="max-w-[11rem] truncate text-[11px] text-slate-500" title={r.name}>
                          {r.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  {cols.map((c) => cell(r, c))}
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length > page.length && (
            <div className="border-t border-slate-100 p-2 text-center">
              <button type="button" onClick={() => setLimit((x) => x + PAGE)} className="text-xs text-blue-600 hover:underline">
                แสดงเพิ่มอีก {Math.min(PAGE, visible.length - page.length)} แถว (เห็น {page.length}/{visible.length})
              </button>
            </div>
          )}
        </div>
      )}
      <AssetPicker
        open={!!picker}
        onClose={() => setPicker(null)}
        onSelect={(assets) => {
          if (picker) addItems(picker, assets.filter((a) => a.r2_key).map((a) => ({ key: a.r2_key as string, kind: a.asset_type === "video" ? "video" : "image" })));
          setPicker(null);
        }}
        multiple={!pickerCol?.hero}
        {...(pickerCol?.hero ? { kinds: ["image", "video"] } : { typeFilter: "image" })}
        title={pickerCol?.hero ? "เลือกรูปหรือวิดีโอ Hero" : "เลือกรูปบนเว็บ (เลือกได้หลายรูป)"}
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept="image/*,video/mp4,video/webm,.mp4,.m4v,.webm,.mov"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (uploadTo && files.length) void uploadFiles(uploadTo, files);
        }}
      />
    </div>
  );
});
