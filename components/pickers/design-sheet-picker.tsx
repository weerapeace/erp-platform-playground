"use client";

/**
 * DesignSheetPicker (ของกลาง) — แนบ Design sheet หลายใบ
 *   ป้ายใบที่เลือก (รูปปก + เลข + ชื่อ · × เอาออก) + ปุ่ม "+ แนบ Design sheet" → ป๊อปค้นหา (เลข/ชื่อ) เลือกได้หลายใบ
 *   ค้นผ่าน GET /api/design-sheets (ของเดิม · สิทธิ์ products.view) — ไม่ query เอง
 *
 *   <DesignSheetPicker value={sheets} onChange={setSheets} />        value = DesignSheetCard[] (lib/design-sheet-view)
 *
 * DesignSheetCards = การ์ดแสดงผล (ไม่มีปุ่มแก้) · onOpen ไม่ส่ง = กดไม่ได้ (เช่น พนักงานในตั๋วงาน Pattern)
 * ใช้ที่: ตั๋วงาน Pattern (ป๊อปเปิดตั๋ว / แก้ไขตั๋ว / ลิ้นชัก)
 */
import { useEffect, useState } from "react";
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

function PickModal({ selected, max, onClose, onDone }: { selected: DesignSheetCard[]; max: number; onClose: () => void; onDone: (v: DesignSheetCard[]) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<DesignSheetCard[]>(selected);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    const h = setTimeout(async () => {
      setLoading(true); setErr(null);
      try {
        const res = await apiFetch(`/api/design-sheets?search=${encodeURIComponent(q.trim())}&limit=30&sort_by=updated_at&sort_dir=desc`);
        const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
        if (alive) setRows((j.data ?? []) as ListItem[]);
      } catch (e) { if (alive) setErr((e as Error).message); }
      finally { if (alive) setLoading(false); }
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(h); };
  }, [q, retry]);

  const toggle = (x: ListItem) => setPicked((cur) => cur.some((c) => c.id === x.id) ? cur.filter((c) => c.id !== x.id) : cur.length >= max ? cur : [...cur, toCard(x)]);
  const dirty = picked.map((x) => x.id).join() !== selected.map((x) => x.id).join();

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
        {loading && !rows.length ? <LoadingState label={t("กำลังค้นหา…", "Searching…")} />
          : err ? <ErrorState title={t("ค้นหา Design sheet ไม่สำเร็จ", "Couldn't search design sheets")} hint={err} onRetry={() => setRetry((n) => n + 1)} />
          : !rows.length ? <EmptyState icon={<Icon name="design" />} title={t("ไม่พบ Design sheet", "No design sheets found")} hint={t("ลองพิมพ์เลขใบหรือชื่องานอื่น", "Try another code or name")} />
          : (
            <ul className="flex max-h-[55vh] flex-col gap-1 overflow-y-auto">
              {rows.map((x) => {
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
