"use client";

/**
 * 🎨 ทะเบียนสีกลาง — ตั้ง "หน้าตาจุดสี" ของแต่ละชื่อสี (ของกลาง)
 * --------------------------------------------------------------------------
 * ข้อมูล = พจนานุกรมสี (erp_color_dictionary) ผ่าน /api/color-swatches · ตรรกะกลาง = lib/color-swatch.ts
 * - ซ้าย: รายชื่อสี (MiniTable) — เริ่มที่ "ต้องตั้ง" = สีที่สินค้าบนเว็บใช้อยู่แต่ยังไม่มีจุดสี
 * - ขวา: แก้สีที่เลือก — สีเดียว / หลายสีแบ่งช่อง (2–4) / รูปลาย (อัปโหลด · คลังรูป · ✂️ ครอปจากรูป SKU ที่ใช้สีนี้ = ImageCropPicker)
 * - ชื่อสีผสม ("กรมท่า-ครีม-ขาว") ประกอบจากสีย่อยให้เอง → ตั้งสีย่อยครบก็ขึ้นเอง หรือกด "ตั้งเองเฉพาะชื่อนี้"
 *
 * ใช้: <ColorSwatchButton /> (ปุ่ม + ป๊อปอัป) หรือ <ColorSwatchManager /> ฝังในหน้า
 * focusNames = เปิดมาโชว์ "เฉพาะสีเหล่านี้" (เช่น สีของสินค้าที่กำลังแก้ · ชื่อผสมพ่วงสีย่อยให้) — สลับแท็บ ทั้งหมด ได้
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { MiniTable } from "@/components/mini-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ColorInput } from "@/components/color-picker";
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";
import { ImageEyedropper } from "@/components/image-eyedropper";
import { ImageCropPicker, type CropSourceGroup } from "@/components/image-crop-picker";
import {
  SwatchIndex, swatchCss, splitColorName, hasSwatch, normColorName, isHex,
  SWATCH_KIND_LABEL, MAX_SPLIT, type SwatchEntry, type SwatchKind,
} from "@/lib/color-swatch";

interface Used { name: string; skus: number; shops: string[]; images?: string[] }
type Status = "set" | "auto" | "unset";
interface Row {
  key: string;
  name: string;
  /** แถวของชื่อนี้ในพจนานุกรม (null = ยังไม่มีคำนี้) */
  entry: SwatchEntry | null;
  compound: boolean;
  skus: number;
  shops: Set<string>;
  css: string | null;
  status: Status;
  missing: string[];
  /** รูปปก SKU ที่ใช้สีนี้ (ไว้ดูดสี) */
  images: string[];
}
interface Draft { th: string; en: string; kind: SwatchKind | null; colors: string[]; imageKey: string | null; isNew: boolean }

const STATUS_UI: Record<Status, { label: string; cls: string }> = {
  set: { label: "ตั้งแล้ว", cls: "bg-emerald-50 text-emerald-700" },
  auto: { label: "ผสมอัตโนมัติ", cls: "bg-blue-50 text-blue-700" },
  unset: { label: "ยังไม่ตั้ง", cls: "bg-amber-50 text-amber-700" },
};
const thumb = (k: string) => keyUrl(k, 96) ?? "";
const isAscii = (s: string) => /^[\x20-\x7E]+$/.test(s);

function Dot({ css, size = 22 }: { css: string | null; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{
        width: size, height: size,
        background: css ?? "repeating-linear-gradient(45deg,#f1f5f9 0 4px,#e2e8f0 4px 8px)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)",
      }}
    />
  );
}

/** สร้างแถวจากพจนานุกรม + ชื่อสีที่ใช้อยู่จริง */
function buildRows(entries: SwatchEntry[], used: Used[]): Row[] {
  const idx = new SwatchIndex(entries);
  const rows = new Map<string, Row>();
  const blank = (name: string, entry: SwatchEntry | null, compound = false): Row => ({
    key: normColorName(name), name, entry, compound, skus: 0, shops: new Set(), css: null, status: "unset", missing: [], images: [],
  });
  for (const e of entries) rows.set(normColorName(e.th), blank(e.th, e));

  const tally = (name: string, u: Used) => {
    const e = idx.find(name);
    const key = e ? normColorName(e.th) : normColorName(name);
    if (!rows.has(key)) rows.set(key, blank(name, null));
    const r = rows.get(key)!;
    r.skus += u.skus;
    u.shops.forEach((s) => r.shops.add(s));
    for (const im of u.images ?? []) if (r.images.length < 8 && !r.images.includes(im)) r.images.push(im);
  };
  for (const u of used) {
    const parts = splitColorName(u.name);
    if (!parts.length || idx.find(u.name)) { tally(u.name, u); continue; }
    // ชื่อผสม: แถวของชื่อเต็ม (ประกอบอัตโนมัติ) + นับให้สีย่อยด้วย จะได้รู้ว่าสีย่อยไหนสำคัญ
    const key = normColorName(u.name);
    if (!rows.has(key)) rows.set(key, blank(u.name, null, true));
    const r = rows.get(key)!;
    r.skus += u.skus;
    u.shops.forEach((s) => r.shops.add(s));
    for (const im of u.images ?? []) if (r.images.length < 8 && !r.images.includes(im)) r.images.push(im);
    parts.forEach((p) => tally(p, u));
  }

  for (const r of rows.values()) {
    if (hasSwatch(r.entry)) {
      r.status = "set";
      r.css = swatchCss({ colors: r.entry.colors, imageKey: r.entry.kind === "image" ? r.entry.imageKey : null }, thumb);
    } else if (r.compound) {
      const spec = idx.resolve(r.name);
      r.status = spec ? "auto" : "unset";
      r.css = spec ? swatchCss(spec, thumb) : null;
      r.missing = spec ? [] : idx.missingParts(r.name);
    }
  }
  return [...rows.values()];
}

/** แถวที่เกี่ยวกับชื่อสีชุดนี้ (ชื่อตรง/ชื่อในพจนานุกรม + สีย่อยของชื่อผสม) */
function focusKeysFor(names: string[], entries: SwatchEntry[]): Set<string> {
  const idx = new SwatchIndex(entries);
  const keyOf = (n: string) => normColorName(idx.find(n)?.th ?? n);
  const out = new Set<string>();
  for (const n of names) {
    out.add(keyOf(n));
    if (!idx.find(n)) splitColorName(n).forEach((p) => out.add(keyOf(p)));
  }
  return out;
}

export function ColorSwatchManager({ onDirtyChange, focusNames }: { onDirtyChange?: (dirty: boolean) => void; focusNames?: string[] }) {
  const toast = useToast();
  const [entries, setEntries] = useState<SwatchEntry[]>([]);
  const [used, setUsed] = useState<Used[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // ค่าคงที่ตามเนื้อหา (ผู้เรียกส่ง array ใหม่ทุกครั้งก็ไม่คำนวณแถวซ้ำ)
  const focusSig = (focusNames ?? []).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const focus = useMemo(() => focusNames ?? [], [focusSig]);
  const hasFocus = focus.length > 0;
  const [filter, setFilter] = useState<"focus" | "todo" | "done" | "all">(hasFocus ? "focus" : "todo");
  const [shop, setShop] = useState("");
  const [selKey, setSelKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // 💧 กำลังดูดสีให้ช่องไหน (index ใน draft.colors)
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  // ✂️ ครอปรูปลายจากรูป SKU ที่ใช้สีนี้ (โหลดรูปตอนกดเปิด)
  const [cropOpen, setCropOpen] = useState(false);
  const [cropGroups, setCropGroups] = useState<CropSourceGroup[] | null>(null);
  const [cropErr, setCropErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch("/api/color-swatches").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setEntries(j.data.entries ?? []);
      setUsed(j.data.used ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  // focusNames ใส่เป็นแถวด้วยเสมอ (สีที่ยังไม่มีในทะเบียน/ยังไม่ถูกนับ ก็ยังกดตั้งได้ · นับ 0 SKU ไม่กระทบยอด)
  const rows = useMemo(() => buildRows(entries, [...used, ...focus.map((name) => ({ name, skus: 0, shops: [] }))]), [entries, used, focus]);
  const shops = useMemo(() => [...new Set(rows.flatMap((r) => [...r.shops]))].sort(), [rows]);
  const todoCount = rows.filter((r) => r.status === "unset" && r.skus > 0).length;
  const focusKeys = useMemo(() => focusKeysFor(focus, entries), [focus, entries]);
  const shown = rows.filter((r) => {
    if (filter === "focus") return focusKeys.has(r.key);
    if (shop && !r.shops.has(shop)) return false;
    if (filter === "todo") return r.status === "unset" && r.skus > 0;
    if (filter === "done") return r.status !== "unset";
    return true;
  });
  const sel = rows.find((r) => r.key === selKey) ?? null;
  // เปิดจากสินค้า → เลือกสีแรกที่ยังไม่ตั้งให้เลย (ตั้งต่อได้ทันที)
  const [autoPicked, setAutoPicked] = useState(false);

  const draftFor = (r: Row): Draft => {
    const e = r.entry;
    if (e) return { th: e.th, en: e.en, kind: e.kind ?? "solid", colors: e.colors, imageKey: e.imageKey, isNew: false };
    // ชื่อผสมกด "ตั้งเอง" → เริ่มจากสีย่อยที่ตั้งไว้แล้ว
    const partColors = r.compound ? splitColorName(r.name).slice(0, MAX_SPLIT).map((p) => new SwatchIndex(entries).find(p)?.colors[0] ?? "") : [];
    return {
      th: r.name, en: isAscii(r.name) ? r.name : "",
      kind: r.compound ? "split" : "solid",
      colors: r.compound ? partColors : [], imageKey: null, isNew: true,
    };
  };

  const select = (r: Row) => {
    if (dirty && r.key !== selKey) { setPendingKey(r.key); return; }
    setSelKey(r.key);
    setDraft(r.compound && !r.entry ? null : draftFor(r));
    setDirty(false);
  };
  const edit = (patch: Partial<Draft>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setDirty(true); };
  const openCrop = async () => {
    if (!sel) return;
    const names = [...new Set([sel.name, sel.entry?.th, sel.entry?.en, draft?.th, draft?.en].map((s) => (s ?? "").trim()).filter(Boolean))];
    setCropOpen(true);
    setCropGroups(null);
    setCropErr(null);
    try {
      const j = await apiFetch(`/api/color-swatches?images=${encodeURIComponent(names.join("|"))}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      type G = { skuId: string; code: string; name: string; color: string; onWeb: boolean; images: string[] };
      setCropGroups(((j.data?.groups ?? []) as G[]).map((g) => ({ key: g.skuId, label: g.code || g.color, sub: g.name, badge: g.onWeb ? "บนเว็บ" : undefined, images: g.images })));
    } catch (e) {
      setCropErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    }
  };
  useEffect(() => {
    if (!hasFocus || autoPicked || loading || selKey) return;
    const first = rows.filter((r) => focusKeys.has(r.key)).sort((a, b) => Number(a.status !== "unset") - Number(b.status !== "unset"))[0];
    setAutoPicked(true);
    if (first) select(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFocus, autoPicked, loading, selKey, rows, focusKeys]);

  const save = async (clear = false) => {
    if (!draft) return;
    const body = clear ? { th: draft.th, en: draft.en, kind: null } : { th: draft.th, en: draft.en, kind: draft.kind, colors: draft.colors, imageKey: draft.imageKey };
    setSaving(true);
    try {
      const j = await apiFetch("/api/color-swatches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (j.error) { toast.error(j.error); return; }
      toast.success(clear ? `ล้างจุดสี "${draft.th}" แล้ว` : `บันทึกจุดสี "${draft.th}" แล้ว — เว็บร้านอัปเดตแล้ว`);
      setDirty(false);
      setSelKey(normColorName(draft.th));
      await load();
      if (clear) setDraft((d) => (d ? { ...d, kind: "solid", colors: [], imageKey: null, isNew: false } : d));
      else setDraft((d) => (d ? { ...d, isNew: false } : d));
    } catch {
      toast.error("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  };

  const draftCss = draft
    ? draft.kind === "image"
      ? draft.imageKey ? swatchCss({ colors: [], imageKey: draft.imageKey }, thumb) : null
      : draft.colors.filter(isHex).length ? swatchCss({ colors: draft.colors.filter(isHex), imageKey: null }, thumb) : null
    : null;
  // ทุกช่องสีต้องกรอกถูก (ช่องว่างที่กด "+ เพิ่มสี" ค้างไว้ = ยังไม่ครบ ไม่ปล่อยให้หายเงียบตอนบันทึก)
  const draftValid = !!draft && (!draft.isNew || draft.en.trim().length > 0) && (
    draft.kind === "image" ? !!draft.imageKey
      : draft.kind === "split" ? draft.colors.length >= 2 && draft.colors.every(isHex)
      : isHex(draft.colors[0])
  );

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        เกิดข้อผิดพลาดในการโหลดรายชื่อสี ({loadError}) <button className="ml-2 underline" onClick={load}>ลองใหม่</button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {([
            ...(hasFocus ? ([["focus", `🎯 สีของสินค้านี้ (${rows.filter((r) => focusKeys.has(r.key)).length})`]] as const) : []),
            ["todo", `ต้องตั้ง (${todoCount})`],
            ["done", "ตั้งแล้ว"],
            ["all", "ทั้งหมด"],
          ] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={`px-2.5 py-1 rounded-full text-xs border ${filter === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
          {shops.length > 1 && filter !== "focus" && (
            <select value={shop} onChange={(e) => setShop(e.target.value)} className="ml-auto text-xs border border-slate-200 rounded-md px-2 py-1 bg-white">
              <option value="">ทุกร้าน</option>
              {shops.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
        <MiniTable<Row>
          rows={shown}
          rowKey={(r) => r.key}
          dense
          maxHeightClass="max-h-[55vh]"
          countUnit="สี"
          searchText={(r) => `${r.name} ${r.entry?.en ?? ""}`}
          searchPlaceholder="ค้นหาชื่อสี ไทย/อังกฤษ…"
          onRowClick={select}
          emptyText={loading ? "กำลังโหลด…" : filter === "todo" ? "🎉 สีที่ใช้บนเว็บตั้งครบแล้ว" : filter === "focus" ? "ไม่พบชื่อสีของสินค้านี้ในทะเบียน — ลองค้นในแท็บ ทั้งหมด" : "ไม่มีรายการ"}
          columns={[
            { key: "dot", header: "", width: "2.25rem", cell: (r) => <Dot css={r.css} /> },
            {
              key: "name", header: "ชื่อสี", width: "minmax(0,1.6fr)", sortValue: (r) => r.name, sortLabel: "ชื่อสี",
              cell: (r) => (
                <div className={`min-w-0 ${r.key === selKey ? "font-semibold text-blue-700" : ""}`}>
                  <div className="truncate">{r.name}</div>
                  {r.entry?.en && r.entry.en !== r.name && <div className="text-[11px] text-slate-400 truncate">{r.entry.en}</div>}
                  {r.missing.length > 0 && <div className="text-[11px] text-amber-600 truncate">ขาด: {r.missing.join(", ")}</div>}
                </div>
              ),
            },
            {
              key: "kind", header: "แบบ", width: "6.5rem",
              cell: (r) => <span className="text-xs text-slate-500">{r.compound && !r.entry ? "ผสม" : r.entry?.kind ? SWATCH_KIND_LABEL[r.entry.kind].replace(" (แบ่งช่อง)", "") : "—"}</span>,
            },
            { key: "skus", header: "บนเว็บ", align: "right", width: "4.5rem", sortValue: (r) => r.skus, sortLabel: "จำนวน SKU", cell: (r) => <span className="text-xs text-slate-500">{r.skus ? `${r.skus} SKU` : "—"}</span> },
            { key: "status", header: "สถานะ", width: "6.5rem", sortValue: (r) => r.status, cell: (r) => <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_UI[r.status].cls}`}>{STATUS_UI[r.status].label}</span> },
          ]}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 h-fit">
        {!sel ? (
          <p className="text-sm text-slate-500">เลือกชื่อสีทางซ้ายเพื่อตั้งหน้าตาจุดสี<br /><span className="text-xs text-slate-400">สีผสม เช่น “กรมท่า-ครีม-ขาว” ไม่ต้องตั้งเอง — ตั้งสีย่อยครบแล้วระบบแบ่งช่องให้</span></p>
        ) : !draft ? (
          /* ชื่อผสมที่ยังไม่ตั้งทับ — โชว์ว่าประกอบจากอะไร */
          <div className="space-y-3">
            <div className="flex items-center gap-3"><Dot css={sel.css} size={56} /><div className="font-semibold text-slate-800">{sel.name}</div></div>
            <div className="text-xs text-slate-600 space-y-1">
              <div className="font-medium">ประกอบจากสีย่อย:</div>
              {splitColorName(sel.name).slice(0, MAX_SPLIT).map((p) => {
                const r = rows.find((x) => x.key === normColorName(new SwatchIndex(entries).find(p)?.th ?? p));
                return (
                  <button key={p} type="button" onClick={() => r && select(r)} className="flex items-center gap-2 hover:underline">
                    <Dot css={r?.css ?? null} size={14} /> {p} {r?.status === "unset" && <span className="text-amber-600">(ยังไม่ตั้ง — กดเพื่อตั้ง)</span>}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => { setDraft(draftFor(sel)); setDirty(true); }} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50">✏️ ตั้งเองเฉพาะชื่อนี้</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Dot css={draftCss} size={56} />
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 truncate">{draft.th}</div>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">ขนาดจริง <Dot css={draftCss} size={14} /> <Dot css={draftCss} size={28} /></div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">ชื่ออังกฤษ{draft.isNew && <span className="text-red-500"> *</span>}</label>
              <input value={draft.en} onChange={(e) => edit({ en: e.target.value })} placeholder="เช่น Natural Cream"
                className={`w-full text-sm border rounded-md px-2 py-1.5 bg-white ${draft.isNew && !draft.en.trim() ? "border-red-300" : "border-slate-200"}`} />
              {draft.isNew && <p className="text-[11px] text-slate-400 mt-0.5">ยังไม่มีคำนี้ในพจนานุกรมสี — ใช้แปลชื่อสีด้วย</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">แบบ</label>
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs bg-white">
                {(["solid", "split", "image"] as SwatchKind[]).map((k) => (
                  <button key={k} type="button"
                    onClick={() => edit({ kind: k, colors: k === "split" && draft.colors.length < 2 ? [...draft.colors, "", ""].slice(0, Math.max(2, draft.colors.length)) : draft.colors })}
                    className={`px-2.5 py-1 ${draft.kind === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                    {SWATCH_KIND_LABEL[k].replace(" (แบ่งช่อง)", "")}
                  </button>
                ))}
              </div>
            </div>

            {draft.kind === "solid" && (
              <div className="flex items-center gap-1.5">
                <div className="flex-1"><ColorInput value={draft.colors[0] ?? ""} onChange={(v) => edit({ colors: [v] })} invalid={!isHex(draft.colors[0])} /></div>
                {sel.images.length > 0 && <button type="button" onClick={() => setDropSlot(0)} title="ดูดสีจากรูปสินค้า (SKU ที่ใช้สีนี้)" className="h-8 px-2 rounded border border-slate-200 bg-white text-sm hover:border-blue-400">💧</button>}
              </div>
            )}
            {draft.kind !== "image" && sel.images.length > 0 && (
              <p className="text-[11px] text-slate-400">💧 = ดูดสีจากรูปสินค้าที่ใช้สีนี้ ({sel.images.length} รูป) แล้วกดจุดบนรูป</p>
            )}
            {draft.kind !== "image" && sel.images.length === 0 && (
              <p className="text-[11px] text-slate-400">ยังไม่มีรูป SKU ของสีนี้บนเว็บ — ดูดสีจากรูปไม่ได้</p>
            )}
            {draft.kind === "split" && (
              <div className="space-y-1.5">
                {draft.colors.map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 w-4">{i + 1}</span>
                    <div className="flex-1"><ColorInput value={c} onChange={(v) => edit({ colors: draft.colors.map((x, j) => (j === i ? v : x)) })} invalid={!isHex(c)} /></div>
                    {sel.images.length > 0 && <button type="button" onClick={() => setDropSlot(i)} title="ดูดสีจากรูปสินค้า" className="h-8 px-1.5 rounded border border-slate-200 bg-white text-xs hover:border-blue-400">💧</button>}
                    {draft.colors.length > 2 && <button type="button" onClick={() => edit({ colors: draft.colors.filter((_, j) => j !== i) })} className="text-slate-400 hover:text-red-500 text-xs px-1" aria-label="ลบสีนี้">✕</button>}
                  </div>
                ))}
                {draft.colors.length < MAX_SPLIT && <button type="button" onClick={() => edit({ colors: [...draft.colors, ""] })} className="text-xs text-blue-600 hover:underline">+ เพิ่มสี</button>}
                <p className="text-[11px] text-slate-400">2 สี = แบ่งครึ่งเฉียง · 3–4 สี = แบ่งเป็นชิ้น</p>
              </div>
            )}
            {draft.kind === "image" && (
              <div className="space-y-1.5">
                <ImageUploadField label="รูปลาย" hint="รูปจัตุรัส ครอปเฉพาะลาย" value={draft.imageKey} onChange={(k) => edit({ imageKey: k })} height={64} />
                <button type="button" onClick={openCrop} className="w-full h-8 rounded-lg border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700 hover:bg-blue-100">
                  ✂️ ครอปจากรูปสินค้า (เลือก SKU · เลือกรูป)
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
              <button type="button" disabled={!dirty || !draftValid || saving} onClick={() => save(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white disabled:opacity-40">
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </button>
              {hasSwatch(sel.entry) && (
                <button type="button" disabled={saving} onClick={() => save(true)} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100">ล้างจุดสี</button>
              )}
              {dirty && <span className="text-[11px] text-amber-600 ml-auto">ยังไม่บันทึก</span>}
            </div>
          </div>
        )}
      </div>

      <ImageEyedropper
        open={dropSlot !== null && !!sel && sel.images.length > 0}
        images={sel?.images ?? []}
        title={`💧 ดูดสีจากรูปสินค้า — ${sel?.name ?? ""}${draft && draft.kind === "split" && dropSlot !== null ? ` (สีที่ ${dropSlot + 1})` : ""}`}
        onClose={() => setDropSlot(null)}
        onPick={(hex) => {
          if (draft && dropSlot !== null) {
            const next = draft.kind === "split" ? draft.colors.map((x, j) => (j === dropSlot ? hex : x)) : [hex];
            edit({ colors: next });
          }
          setDropSlot(null);
        }}
      />

      <ImageCropPicker
        open={cropOpen}
        onClose={() => setCropOpen(false)}
        groups={cropGroups}
        error={cropErr}
        title={`✂️ ครอปรูปลาย — ${sel?.name ?? ""}`}
        description="เลือก SKU และรูปทางซ้าย → ลากกรอบไปตรงลายที่ต้องการ · จับมุมกรอบลากเพื่อย่อ/ขยาย · ผลลัพธ์ = รูปลายจัตุรัสของจุดสีนี้"
        emptyText="ยังไม่มี SKU ที่ใช้สีนี้และมีรูป — อัปโหลดรูปลายเอง หรือเลือกจากคลังรูปแทน"
        folder="color-swatches"
        outSize={320}
        onDone={(k) => edit({ imageKey: k })}
      />

      <ConfirmDialog
        open={!!pendingKey}
        onClose={() => setPendingKey(null)}
        onConfirm={() => {
          const r = rows.find((x) => x.key === pendingKey);
          setPendingKey(null);
          setDirty(false);
          if (r) { setSelKey(r.key); setDraft(r.compound && !r.entry ? null : draftFor(r)); }
        }}
        title="ยังไม่ได้บันทึก"
        message="คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?"
        confirmText="ออกโดยไม่บันทึก"
        cancelText="อยู่ต่อ"
      />
    </div>
  );
}

/** ปุ่ม + ป๊อปอัปทะเบียนสี — วางได้ทุกที่ที่มีการตั้งค่าจุดสี */
export function ColorSwatchButton({
  label = "🎨 ตั้งสีของจุดสี",
  className,
  focusNames,
  title,
  onClosed,
}: {
  label?: string;
  className?: string;
  focusNames?: string[];
  /** ข้อความตอนชี้ปุ่ม */
  title?: string;
  /** ปิดป๊อปแล้ว (เช่น หน้ารายการสินค้าโหลดจุดสี/ป้ายเตือนใหม่) */
  onClosed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={title}
        className={className ?? "text-xs px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}>
        {label}
      </button>
      <ERPModal
        open={open}
        onClose={() => { setOpen(false); setDirty(false); onClosed?.(); }}
        title="🎨 ทะเบียนสี — หน้าตาจุดสี"
        description="ตั้งครั้งเดียว ใช้ทุกร้าน ทุกสินค้าที่มีสีชื่อนี้ (จุดสีบนการ์ด · ปุ่มเลือกสีหน้าสินค้า)"
        size="xl"
        hasUnsavedChanges={dirty}
      >
        {open && <ColorSwatchManager onDirtyChange={setDirty} focusNames={focusNames} />}
      </ERPModal>
    </>
  );
}
