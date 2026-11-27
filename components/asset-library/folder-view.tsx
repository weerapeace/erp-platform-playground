"use client";
// คลังไฟล์: มุมมองโฟลเดอร์ (เจ้าของเลือก 2026-11-27 · ข้อเสนอ 1-4)
//   FolderPath  = เส้นทาง "ทั้งหมด › Coquette › Handdrawn" + ← ย้อนขึ้น + สลับ "โฟลเดอร์ | รูปทั้งหมด"
//   FolderStrip = อัลบั้มย่อยของที่เปิดอยู่เป็นการ์ดโฟลเดอร์ (ปก 4 รูปล่าสุด · ⋯ เมนู · ลากรูปวาง = ใส่อัลบั้ม)
// ข้อมูล: อัลบั้มจาก /api/assets/collections (parent_id) · ปก /api/assets/collections/covers
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { withImageWidth } from "@/lib/r2-image";
import { AlbumRowMenu, ASSET_DRAG_TYPE, type AlbumAction } from "./album-tree-actions";
import type { AssetCollection } from "@/app/api/assets/collections/route";

export type FolderMode = "folder" | "files";
const SHOW_FIRST = 12;

/** เส้นทางจากชั้นบนสุดถึงอัลบั้มนี้ (กันวนซ้ำ) */
function pathOf(collections: AssetCollection[], id: string | null): AssetCollection[] {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const out: AssetCollection[] = [];
  const seen = new Set<string>();
  let cur = id ? byId.get(id) : undefined;
  while (cur && !seen.has(cur.id)) { out.unshift(cur); seen.add(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
  return out;
}

export function FolderPath({ collections, currentId, onOpen, mode, onMode }: {
  collections: AssetCollection[]; currentId: string | null; onOpen: (id: string | null) => void;
  mode: FolderMode; onMode: (m: FolderMode) => void;
}) {
  const t = useT();
  const path = useMemo(() => pathOf(collections, currentId), [collections, currentId]);
  const up = path.length > 1 ? path[path.length - 2].id : null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[13px]">
      {path.length > 0 && (
        <button type="button" onClick={() => onOpen(up)} title={t("ย้อนขึ้น", "Up one level")} className="h-7 w-7 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center"><Icon value="i:arrow-left" /></button>
      )}
      <button type="button" onClick={() => onOpen(null)} className={`${path.length ? "text-slate-500 hover:text-indigo-600" : "font-medium text-slate-800"}`}>{t("ทั้งหมด", "All")}</button>
      {path.map((c, i) => (
        <span key={c.id} className="flex items-center gap-1.5 min-w-0">
          <span className="text-slate-300">›</span>
          {i === path.length - 1
            ? <span className="font-medium text-slate-800 truncate max-w-[16rem]">{c.name}</span>
            : <button type="button" onClick={() => onOpen(c.id)} className="text-slate-500 hover:text-indigo-600 truncate max-w-[12rem]">{c.name}</button>}
        </span>
      ))}
      <span className="ml-auto inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[12px]">
        {(["folder", "files"] as const).map((m) => (
          <button key={m} type="button" onClick={() => onMode(m)}
            className={`h-6 px-2.5 rounded-md ${mode === m ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-500 hover:text-slate-700"}`}>
            {m === "folder" ? <><Icon value="i:folder" /> {t("โฟลเดอร์", "Folders")}</> : t("รูปทั้งหมด", "Files only")}
          </button>
        ))}
      </span>
    </div>
  );
}

export function FolderStrip({ collections, currentId, onOpen, canManage, canDrop, onAction, onDropAssets }: {
  collections: AssetCollection[]; currentId: string | null; onOpen: (id: string) => void;
  canManage?: boolean; canDrop?: boolean;
  onAction?: (kind: AlbumAction, album: AssetCollection) => void;
  onDropAssets?: (album: AssetCollection, ids: string[]) => void;
}) {
  const t = useT();
  const kids = useMemo(() => collections.filter((c) => (c.parent_id ?? null) === currentId)
    .sort((a, b) => Number(!!a.sample) - Number(!!b.sample) || a.name.localeCompare(b.name, "th")), [collections, currentId]);
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [currentId]);
  const shown = all ? kids : kids.slice(0, SHOW_FIRST);
  const idsKey = shown.map((c) => c.id).join(",");
  const [covers, setCovers] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!idsKey) return;
    let off = false;
    const need = idsKey.split(",").filter((id) => !(id in covers));
    if (!need.length) return;
    (async () => {
      for (let i = 0; i < need.length; i += 40) {
        const j = await apiFetch(`/api/assets/collections/covers?ids=${need.slice(i, i + 40).join(",")}`).then((r) => r.json()).catch(() => ({ data: {} }));
        if (!off) setCovers((c) => ({ ...c, ...(j.data ?? {}) }));
      }
    })();
    return () => { off = true; };
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps -- covers ใช้เป็นแคช ไม่ต้องโหลดซ้ำ
  const [over, setOver] = useState<string | null>(null);
  if (!kids.length) return null;
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-[12px] text-slate-500">{currentId ? t("อัลบั้มย่อย", "Sub-albums") : t("อัลบั้ม", "Albums")} {kids.length}</p>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))" }}>
        {shown.map((c) => {
          const imgs = covers[c.id] ?? [];
          return (
            <div key={c.id} role="button" tabIndex={0} onClick={() => onOpen(c.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(c.id); }}
              className={`group/albumrow relative rounded-xl border bg-white p-1.5 cursor-pointer hover:border-slate-300 ${over === c.id ? "border-indigo-400 ring-2 ring-indigo-300 bg-indigo-50" : "border-slate-200"}`}
              onDragOver={(e) => { if (!canDrop || !Array.from(e.dataTransfer.types).includes(ASSET_DRAG_TYPE)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(c.id); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((v) => (v === c.id ? null : v)); }}
              onDrop={(e) => {
                setOver(null);
                const raw = e.dataTransfer.getData(ASSET_DRAG_TYPE);
                if (!raw) return;
                e.preventDefault(); e.stopPropagation();
                try { onDropAssets?.(c, JSON.parse(raw) as string[]); } catch { /* ข้อมูลลากเสีย */ }
              }}>
              <div className="grid grid-cols-2 gap-0.5 aspect-[4/3] rounded-lg overflow-hidden bg-slate-100">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="bg-slate-50 flex items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {imgs[i] ? <img src={withImageWidth(imgs[i], 160) ?? imgs[i]} alt="" loading="lazy" className="max-w-full max-h-full object-contain" /> : i === 0 && !imgs.length ? <Icon value="i:folder" className="text-2xl text-slate-300" /> : null}
                  </div>
                ))}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[12px]">
                <Icon value="i:folder" className="shrink-0 text-slate-400" />
                <span className="flex-1 min-w-0 truncate text-slate-700" title={c.name}>{c.name}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{c.count}</span>
                {canManage && onAction && <span onClick={(e) => e.stopPropagation()}><AlbumRowMenu album={c} onAction={(k) => onAction(k, c)} /></span>}
              </div>
            </div>
          );
        })}
      </div>
      {kids.length > SHOW_FIRST && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1.5 text-[12px] text-indigo-600 hover:underline">
          {all ? t("ย่อ", "Show less") : `${t("ดูอีก", "Show")} ${kids.length - SHOW_FIRST} ${t("อัลบั้ม", "more")}`}
        </button>
      )}
    </div>
  );
}
