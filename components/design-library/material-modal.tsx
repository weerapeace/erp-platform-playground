"use client";

/**
 * 📚 Design Library — ป๊อปเลือกวัสดุ 3 แท็บ (รอบ 7 · เจ้าของเลือก 2026-11-14)
 *   แผง = แผงผ้า (ของกลาง SwatchBrowser) เริ่มด้วยแผงที่ติดแท็กของหมวด · ล้างตัวกรองดูทุกแผงได้
 *   รายการ = SKU ที่ติดแท็กของหมวด แบ่งหมวดย่อยเป็นปุ่ม (แท็กในกลุ่มชื่อเดียวกับแท็ก เช่น กลุ่ม "ซิป" → ซิปไนล่อน #3 / #5)
 *            + ปุ่มลัดคำค้นของหมวด (เช่น เบอร์ด้าย THREAD-30)
 *   ค้นทั้งหมด = วัตถุดิบทุกตัว
 *   รายการ/ค้น ใช้ของกลาง MaterialSearchPanel ตัวเดียวกับหน้า BOM (ไม่สร้างตัวค้นที่ 2)
 * แท็ก/ปุ่มลัดของหมวด ผู้ดูแลตั้งที่ "ตัวเลือก" → หมวด (lib/design-library categoryTags / categoryChips)
 */
import { useEffect, useMemo, useState } from "react";
import nextDynamic from "next/dynamic";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { MaterialSearchPanel, type MaterialChip } from "@/components/material-picker";
import type { SwatchSpotPick } from "@/components/sku-swatch-browser";
import { apiFetch } from "@/lib/api";
import type { CategoryChip } from "@/lib/design-library";

const SwatchBrowser = nextDynamic(() => import("@/components/sku-swatch-browser").then((m) => m.SwatchBrowser), { ssr: false });

type TagRow = { id: string; name: string; group_id: string | null };
type TagTree = { tags: TagRow[]; groups: { id: string; name: string }[] };
let TREE: Promise<TagTree> | null = null;
/** แท็ก + กลุ่มแท็กกลาง (โหลดครั้งเดียวต่อหน้า) — ชุดเดียวกับตัวกรองแท็กกลาง */
export function loadTagTree(): Promise<TagTree> {
  if (!TREE) {
    TREE = Promise.all([
      apiFetch(`/api/master-v2/product_families?limit=500`).then((r) => r.json()),
      apiFetch(`/api/master-v2/product_family_groups?limit=500`).then((r) => r.json()),
    ]).then(([a, b]) => ({
      tags: ((a.data ?? []) as Record<string, unknown>[]).map((t) => ({ id: String(t.id), name: String(t.name ?? ""), group_id: t.group_id ? String(t.group_id) : null })),
      groups: ((b.data ?? []) as Record<string, unknown>[]).map((g) => ({ id: String(g.id), name: String(g.name ?? "") })),
    })).catch(() => { TREE = null; return { tags: [], groups: [] }; });
  }
  return TREE;
}

export type MaterialPicked =
  | { kind: "swatch"; spot: SwatchSpotPick }
  | { kind: "sku"; sku: { id: string; code: string; name: string; image_key: string | null } };
type Tab = "board" | "list" | "search";

export function MaterialPickModal({ open, onClose, title, tags, chips = [], defaultTab, onPick, noBoard = false, footerNote }: {
  open: boolean; onClose: () => void; title: string;
  /** แท็กของหมวด (ชื่อ) */
  tags: string[];
  chips?: CategoryChip[];
  defaultTab: Tab;
  onPick: (m: MaterialPicked) => void;
  /** ไม่มีแท็บแผง (เช่น ส่วนที่ต้องเป็น SKU เท่านั้น) */
  noBoard?: boolean;
  /** ข้อความ/ปุ่มเพิ่มใต้แท็บรายการ (เช่น ติดแท็กอะไหล่จากชื่อ) */
  footerNote?: React.ReactNode;
}) {
  const hasList = tags.length > 0 || chips.length > 0;
  const tabs: { key: Tab; label: string; icon: string }[] = [
    ...(noBoard ? [] : [{ key: "board" as const, label: "แผงผ้า", icon: "i:layout-grid" }]),
    ...(hasList ? [{ key: "list" as const, label: tags.length ? `รายการ · ${tags.join(", ")}` : "รายการ", icon: "i:tags" }] : []),
    { key: "search", label: "ค้นทั้งหมด", icon: "i:search" },
  ];
  const first = tabs.find((t) => t.key === defaultTab)?.key ?? tabs[0].key;
  const [tab, setTab] = useState<Tab>(first);
  const [tree, setTree] = useState<TagTree | null>(null);
  useEffect(() => { if (open) { setTab(first); void loadTagTree().then(setTree); } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  const tagKey = tags.join(",");
  const tagIds = useMemo(() => (tree ? tree.tags.filter((t) => tags.includes(t.name)).map((t) => t.id) : []), [tree, tagKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const listChips = useMemo<MaterialChip[]>(() => {
    const out: MaterialChip[] = chips.map((c, i) => ({ key: `s${i}`, label: c.label, search: c.search }));
    if (tree) for (const t of tags) {
      const g = tree.groups.find((x) => x.name === t);
      if (g) for (const sub of tree.tags.filter((x) => x.group_id === g.id && x.name !== t)) out.push({ key: `t${sub.id}`, label: sub.name, tags: [sub.name] });
    }
    return out;
  }, [tree, tagKey, chips]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pickSku = (c: { id: string; code: string; name: string; image_key: string | null }) => onPick({ kind: "sku", sku: { id: c.id, code: c.code, name: c.name, image_key: c.image_key } });

  return (
    <ERPModal open={open} onClose={onClose} title={title} size="xl" storageKey="design-library-material"
      description={tab === "board" ? "เปิดแผง → กดชิ้นที่ต้องการ → “เลือกชิ้นนี้”" : "กดการ์ดเพื่อเลือก · ไม่เจอลองแท็บ “ค้นทั้งหมด”"}>
      <div className="flex flex-wrap gap-1 mb-3">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`h-9 px-3.5 text-[13px] rounded-full border inline-flex items-center gap-1.5 ${tab === t.key ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <Icon value={t.icon} />{t.label}
          </button>
        ))}
      </div>
      {tab === "board" && (tags.length && !tree
        ? <div className="py-10 text-center text-[13px] text-slate-400">กำลังโหลดแผง…</div>
        : <SwatchBrowser key={tagIds.join(",")} initialTagIds={tagIds} onPickSpot={(p) => onPick({ kind: "swatch", spot: p })} />)}
      {tab === "list" && (
        <div className="space-y-2">
          {tags.length > 0 && tree && tagIds.length === 0 && <p className="text-[12px] text-amber-700">ยังไม่มีแท็กชื่อ “{tags.join(", ")}” ในระบบ — ผู้ดูแลแก้แท็กของหมวดได้ที่ “ตัวเลือก”</p>}
          <MaterialSearchPanel active={open && tab === "list"} allowedTags={tags.length ? tags : undefined} chips={listChips} defaultChip={!tags.length && chips.length ? "s0" : ""} thumbSize={64} wide
            emptyText={`ไม่พบวัสดุที่ติดแท็ก ${tags.join(", ") || "นี้"} — ลองแท็บ “ค้นทั้งหมด”`} onItem={pickSku} />
          {footerNote}
        </div>
      )}
      {tab === "search" && <MaterialSearchPanel active={open && tab === "search"} thumbSize={64} wide onItem={pickSku} />}
    </ERPModal>
  );
}
