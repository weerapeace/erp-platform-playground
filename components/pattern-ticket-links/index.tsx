"use client";

/**
 * PatternTicketLinks (ของกลาง) — "ตั๋วงาน Pattern" ที่แนบ Design sheet ใบนี้ (วางในป๊อป Design sheet แท็บข้อมูลงาน)
 *   แถว = ไอคอนประเภท · ชื่องาน · เลขตั๋ว · ช่าง · กำหนดส่ง · สถานะ → กด = เปิดตั๋วนั้น (/design/pattern-tickets?id=… แท็บใหม่)
 *   ปุ่ม "เปิดตั๋วจากใบนี้" (เฉพาะคนเปิดตั๋วได้) → /design/pattern-tickets?ds=<id> = ป๊อปเปิดตั๋วที่แนบใบนี้ไว้ให้แล้ว
 *   ไม่มีสิทธิ์ดูตั๋ว (pattern.view) = ไม่โชว์ส่วนนี้เลย · ข้อมูลผ่าน GET /api/pattern-tickets?view=all&design_sheet_id=
 *
 *   <PatternTicketLinks sheetId={form.id} />
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth";
import { useLang, useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { fmtDate, isOverdue, patternStatus, ticketTitle, todayBangkok, typeColorCls, typeIconOf, typeLabelPair } from "@/lib/pattern-tickets";

type Row = { id: string; ticket_no: string | null; type_key: string; title: string; title_en?: string | null; status: string; priority: string; due_date: string | null; assignee_name: string | null };
type TypeLite = { key: string; label_th: string; label_en: string; icon: string; color: string };

export function PatternTicketLinks({ sheetId }: { sheetId: string }) {
  const t = useT();
  const isEn = useLang().lang === "en";
  const { can, permsReady } = useAuth();
  const allowed = permsReady && can("pattern.view");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [types, setTypes] = useState<TypeLite[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!allowed || !sheetId) return;
    let alive = true;
    setErr(false);
    apiFetch(`/api/pattern-tickets?view=all&design_sheet_id=${encodeURIComponent(sheetId)}`).then(async (res) => {
      const j = await res.json().catch(() => ({}));
      if (!alive) return;
      if (!res.ok || j.error) { setErr(true); setRows([]); return; }
      setRows((j.data ?? []) as Row[]); setTypes((j.types ?? []) as TypeLite[]); setCanCreate(!!j.me?.can_create);
    }).catch(() => { if (alive) { setErr(true); setRows([]); } });
    return () => { alive = false; };
  }, [allowed, sheetId]);

  if (!allowed) return null;
  const today = todayBangkok();

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <h4 className="flex-1 text-sm font-medium text-slate-700">{t("ตั๋วงาน Pattern", "Pattern tickets")}{rows ? ` (${rows.length})` : ""}</h4>
        {canCreate && (
          <a href={`/design/pattern-tickets?ds=${encodeURIComponent(sheetId)}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
            <Icon name="add" /> {t("เปิดตั๋วจากใบนี้", "New ticket from this sheet")}
          </a>
        )}
      </div>
      {rows === null ? <p className="text-xs text-slate-400">{t("กำลังโหลด…", "Loading…")}</p>
        : err ? <p className="text-xs text-red-600">{t("โหลดตั๋วงานไม่สำเร็จ ลองเปิดใหม่อีกครั้ง", "Couldn't load tickets — try reopening")}</p>
        : !rows.length ? <p className="text-xs text-slate-400">{t("ยังไม่มีตั๋วงานที่แนบใบนี้", "No tickets attached to this sheet yet")}</p>
        : (
          <ul className="flex flex-col gap-1.5">
            {rows.map((r) => {
              const ty = types.find((x) => x.key === r.type_key);
              const st = patternStatus(r.status);
              const late = isOverdue(r.due_date, r.status, today);
              return (
                <li key={r.id}>
                  <a href={`/design/pattern-tickets?id=${encodeURIComponent(r.id)}`} target="_blank" rel="noopener noreferrer"
                    className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-1.5 transition hover:border-slate-300 hover:bg-slate-50">
                    <span className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg ${typeColorCls(ty?.color)}`}><Icon value={ty ? typeIconOf(ty) : "i:file"} /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {r.priority === "urgent" && <span className="mr-1 rounded bg-red-50 px-1 text-[11px] text-red-600">{t("ด่วน", "Urgent")}</span>}
                        {ticketTitle(r, isEn)}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {r.ticket_no ?? "—"} · {ty ? typeLabelPair(ty, isEn)[0] : r.type_key}
                        {` · ${r.assignee_name ? `${t("ช่าง", "Maker")} ${r.assignee_name}` : t("ยังไม่มีคนรับ", "Unassigned")}`}
                        {r.due_date ? <span className={late ? "text-red-600" : ""}>{` · ${t("ส่ง", "Due")} ${fmtDate(r.due_date)}`}</span> : null}
                      </span>
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{t(st.th, st.en)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}
