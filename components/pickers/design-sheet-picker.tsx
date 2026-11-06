"use client";

/**
 * DesignSheetPicker (ของกลาง) — แนบ Design sheet หลายใบ
 *   ป้ายใบที่เลือก (รูปปก + เลข + ชื่อ · × เอาออก) + ปุ่ม "+ แนบ Design sheet" → ป๊อปเลือกหลายใบ
 *   ป๊อป: โหลดครบทุกใบ · แท็บแยกตามแบรนด์ (จากข้อมูลจริง + จำนวน) · ค้นหาเลข/ชื่อ · ซ่อนใบที่ยกเลิกเป็นค่าเริ่มต้น · ที่ติ๊กไว้ไม่หายตอนสลับแท็บ
 *   ค้นผ่าน GET /api/design-sheets (ของเดิม · สิทธิ์ products.view) — ไม่ query เอง
 *
 *   <DesignSheetPicker value={sheets} onChange={setSheets} />        value = DesignSheetCard[] (lib/design-sheet-view)
 *
 * DesignSheetCards = การ์ดแสดงผล (ไม่มีปุ่มแก้) · onOpen ไม่ส่ง = กดไม่ได้ (เช่น พนักงานในตั๋วงาน Pattern)
 * ใช้ที่: ตั๋วงาน Pattern (ป๊อปเปิดตั๋ว / แก้ไขตั๋ว / ลิ้นชัก)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { designSheetStatus } from "@/components/design-sheet-view";
import { apiFetch } from "@/lib/api";
import type { DesignSheetCard } from "@/lib/design-sheet-view";

type ListItem = { id: string; code: string; name: string; status: string; brand_name: string | null; cover_url: string | null };
const toCard = (x: ListItem): DesignSheetCard => ({ id: x.id, code: x.code, name: x.name, status: x.status, brand_name: x.brand_name, cover_url: x.cover_url });

/** โหลดการ์ดจาก id (เช่น เปิดตั๋วจากหน้า Design sheet ที่ส่งมาแค่ id) */
export async function fetchDesignSheetCards(ids: string[]): Promise<DesignSheetCard[]> {
  if (!ids.length) return [];
  const res = await apiFetch(`/api/design-sheets?ids=${encodeURIComponent(ids.join(","))}&limit=${ids.length}`);
  const j = await res.json().catch(() => ({}));
  const rows = (j.data ?? []) as ListItem[];
  return ids.flatMap((id) => { const r = rows.find((x) => x.id === id); return r ? [toCard(r)] : []; });
}

export function DesignSheetPicker({ value, onChange, disabled, max = 20 }: {
  value: DesignSheetCard[];
  onChange: (v: DesignSheetCard[]) => void;
  disabled?: boolean;
  max?: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const remove = (id: string) => onChange(value.filter((x) => x.id !== id));
  return (
    <div className="flex flex-col gap-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((s) => (
            <span key={s.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1 pl-1 pr-1.5 text-sm">
              <Cover url={s.cover_url} size="h-7 w-7" />
              <span className="min-w-0 truncate"><span className="text-xs text-slate-400">{s.code}</span> <span className="text-slate-700">{s.name}</span></span>
              {!disabled && (
                <button type="button" onClick={() => remove(s.id)} aria-label={t("เอาออก", "Remove")} className="text-slate-400 hover:text-red-600"><Icon name="cancel" /></button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && value.length < max && (
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex w-fit items-center gap-1 rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-400 hover:bg-slate-50">
          <Icon name="add" /> {t("แนบ Design sheet", "Attach design sheet")}
        </button>
      )}
      {open && <PickModal selected={value} max={max} onClose={() => setOpen(false)} onDone={(v) => { onChange(v); setOpen(false); }} />}
    </div>
  );
}

/** ใบที่ยกเลิกแล้ว — ซ่อนเป็นค่าเริ่มต้นในป๊อปเลือก */
const CANCELLED = "cancelled";
const NO_BRAND = "__none__";
/** โหลดสูงสุด (API จำกัด 500/ครั้ง) — ตอนนี้มี ~90 ใบ · เกินนี้โชว์ข้อความให้ค้นหาแทน */
const LOAD_LIMIT = 500;

function PickModal({ selected, max, onClose, onDone }: { selected: DesignSheetCard[]; max: number; onClose: () => void; onDone: (v: DesignSheetCard[]) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<DesignSheetCard[]>(selected);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<string>("");          // "" = ทั้งหมด · NO_BRAND = ไม่ระบุแบรนด์ · อื่น ๆ = ชื่อแบรนด์
  const [hideCancelled, setHideCancelled] = useState(true);

  // โหลดครบทุกใบครั้งเดียว (เดิมตัดที่ 30 ใบ → ใบเก่าไม่ขึ้น) แล้วกรอง/ค้นหา/แยกแท็บในหน้าจอ
  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    apiFetch(`/api/design-sheets?limit=${LOAD_LIMIT}&sort_by=updated_at&sort_dir=desc`).then(async (res) => {
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      if (alive) { setRows((j.data ?? []) as ListItem[]); setTotal(Number(j.total ?? 0)); }
    }).catch((e) => { if (alive) setErr((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [retry]);

  const brandKey = (x: ListItem) => x.brand_name?.trim() || NO_BRAND;
  const visible = useMemo(() => rows.filter((x) => !hideCancelled || x.status !== CANCELLED), [rows, hideCancelled]);
  // แท็บแบรนด์ — สร้างจากข้อมูลจริง (แบรนด์ใหม่ขึ้นเอง) เรียงจากใบมากไปน้อย · ไม่ระบุแบรนด์ไว้ท้าย
  const tabs = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of visible) m.set(brandKey(x), (m.get(brandKey(x)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => Number(a[0] === NO_BRAND) - Number(b[0] === NO_BRAND) || b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [visible]);
  const s = q.trim().toLowerCase();
  const shown = useMemo(() => visible.filter((x) => (!tab || brandKey(x) === tab) && (!s || `${x.code} ${x.name}`.toLowerCase().includes(s))), [visible, tab, s]);
  // แท็บ "ทั้งหมด" = แบ่งหัวข้อตามแบรนด์ (ลำดับเดียวกับแท็บ)
  const groups = useMemo(() => {
    if (tab) return [{ key: tab, items: shown }];
    return tabs.map(([k]) => ({ key: k, items: shown.filter((x) => brandKey(x) === k) })).filter((g) => g.items.length);
  }, [tab, tabs, shown]);
  const brandLabel = (k: string) => (k === NO_BRAND ? t("ไม่ระบุแบรนด์", "No brand") : k);
  const cancelledCount = rows.length - rows.filter((x) => x.status !== CANCELLED).length;

  useEffect(() => { if (tab && !tabs.some(([k]) => k === tab)) setTab(""); }, [tab, tabs]);   // ซ่อนยกเลิกแล้วแท็บว่าง → กลับทั้งหมด

  const toggle = (x: ListItem) => setPicked((cur) => cur.some((c) => c.id === x.id) ? cur.filter((c) => c.id !== x.id) : cur.length >= max ? cur : [...cur, toCard(x)]);
  const dirty = picked.map((x) => x.id).join() !== selected.map((x) => x.id).join();

  const tabBtn = (key: string, label: string, n: number) => (
    <button key={key || "_all"} type="button" onClick={() => setTab(key)}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${tab === key ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
      {label} <span className="tabular-nums opacity-70">{n}</span>
    </button>
  );

  return (
    <ERPModal open onClose={onClose} size="md" title={t("แนบ Design sheet", "Attach design sheet")} hasUnsavedChanges={dirty}
      footer={
        <div className="flex w-full items-center gap-2">
          <span className="text-xs text-slate-500">{t(`เลือกแล้ว ${picked.length} ใบ`, `${picked.length} selected`)}</span>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" onClick={() => onDone(picked)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">{t("ใช้ที่เลือก", "Use selected")}</button>
        </div>
      }>
      <div className="flex flex-col gap-2 p-1">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหาเลขใบ (DS-…) หรือชื่องาน", "Search code (DS-…) or name")}
          className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
        {!loading && !err && rows.length > 0 && (
          <>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {tabBtn("", t("ทั้งหมด", "All"), visible.length)}
              {tabs.map(([k, n]) => tabBtn(k, brandLabel(k), n))}
            </div>
            {cancelledCount > 0 && (
              <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={hideCancelled} onChange={(e) => setHideCancelled(e.target.checked)} className="h-3.5 w-3.5 accent-blue-600" />
                {t(`ซ่อนที่ยกเลิกแล้ว (${cancelledCount})`, `Hide cancelled (${cancelledCount})`)}
              </label>
            )}
          </>
        )}
        {loading && !rows.length ? <LoadingState label={t("กำลังโหลด Design sheet…", "Loading design sheets…")} />
          : err ? <ErrorState title={t("โหลด Design sheet ไม่สำเร็จ", "Couldn't load design sheets")} hint={err} onRetry={() => setRetry((n) => n + 1)} />
          : !shown.length ? <EmptyState icon={<Icon name="design" />} title={t("ไม่พบ Design sheet", "No design sheets found")} hint={t("ลองพิมพ์คำอื่น เปลี่ยนแท็บแบรนด์ หรือเอาติ๊ก \"ซ่อนที่ยกเลิก\" ออก", "Try another word, another brand tab, or show cancelled")} />
          : (
            <div className="flex max-h-[55vh] flex-col overflow-y-auto">
              {groups.map((g) => (
                <div key={g.key}>
                  {!tab && <div className="sticky top-0 z-[1] bg-white/95 py-1 text-xs font-medium text-slate-500">{brandLabel(g.key)} <span className="tabular-nums text-slate-400">({g.items.length})</span></div>}
                  <ul className="flex flex-col gap-1 pb-2">
                    {g.items.map((x) => {
                      const on = picked.some((c) => c.id === x.id);
                      const st = designSheetStatus(x.status);
                      return (
                        <li key={x.id}>
                          <button type="button" onClick={() => toggle(x)}
                            className={`grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left transition ${on ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-200" : "border-slate-200 hover:border-slate-300"}`}>
                            <Cover url={x.cover_url} size="h-11 w-11" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-800">{x.name}</span>
                              <span className="block truncate text-xs text-slate-500">{x.code}{x.brand_name ? ` · ${x.brand_name}` : ""}</span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
                              <input type="checkbox" readOnly checked={on} tabIndex={-1} className="h-4 w-4 accent-blue-600" />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {total > rows.length && (
                <p className="py-2 text-center text-xs text-slate-400">{t(`โชว์ ${rows.length} ใบล่าสุดจาก ${total} ใบ`, `Showing the latest ${rows.length} of ${total}`)}</p>
              )}
            </div>
          )}
      </div>
    </ERPModal>
  );
}

/** การ์ด Design sheet (แสดงผล) — onOpen ไม่ส่ง = กดไม่ได้ */
export function DesignSheetCards({ sheets, onOpen }: { sheets: DesignSheetCard[]; onOpen?: (s: DesignSheetCard) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {sheets.map((s) => {
        const st = designSheetStatus(s.status);
        const body = (
          <>
            <Cover url={s.cover_url} size="h-14 w-14" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-800">{s.name}</span>
              <span className="block truncate text-xs text-slate-500">{s.code}{s.brand_name ? ` · ${s.brand_name}` : ""}</span>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
            </span>
            {onOpen && <Icon name="view" className="shrink-0 text-slate-400" />}
          </>
        );
        const cls = "flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 text-left";
        return onOpen
          ? <button key={s.id} type="button" onClick={() => onOpen(s)} className={`${cls} transition hover:border-slate-300 hover:shadow-sm`}>{body}</button>
          : <div key={s.id} className={cls}>{body}</div>;
      })}
    </div>
  );
}

function Cover({ url, size }: { url: string | null; size: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100 text-slate-400 ${size}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon name="image" />}
    </span>
  );
}
