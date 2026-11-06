"use client";

/**
 * ตั๋วงานช่าง Pattern — หน้ารวมงาน
 *   บนสุด: แผ่นประเภทงาน (TypeTiles) — กด = เปิดตั๋วประเภทนั้น (คนเปิดตั๋วได้) / กรองรายการ (คนอื่น) · ผู้จัดการเปลี่ยนไอคอนได้
 *   ล่าง: ตัวเลขสรุป · กรองประเภทงาน · มุมมอง (งานของฉัน / ทั้งหมด / เสร็จแล้ว) · ค้นหา · รายการตั๋ว
 *   รายการตั๋ว → กด = ลิ้นชักรายละเอียด (TicketDrawer)
 * ข้อมูลผ่าน /api/pattern-tickets เท่านั้น · กติกาสถานะ lib/pattern-tickets.ts
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth";
import { LangToggle, useLang, useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import { fmtDate, isOverdue, patternStatus, ticketTitle, todayBangkok, typeIconOf } from "@/lib/pattern-tickets";
import { TypeIconBox } from "./type-icon-picker";
import { TicketDrawer } from "./ticket-drawer";
import { CreateTicketModal } from "./create-modal";
import { TypeTiles } from "./type-tiles";
import { TypeSettingsModal } from "./type-settings";
import type { Me, TicketRow, TicketType } from "./types";

type View = "mine" | "open" | "done";

export function PatternTicketsView() {
  const t = useT();
  const isEn = useLang().lang === "en";
  const { can, permsReady } = useAuth();
  const [view, setView] = useState<View>("mine");
  const [type, setType] = useState<string>("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [types, setTypes] = useState<TicketType[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  /** null = ป๊อปปิด · "" = เปิดโดยยังไม่เลือกประเภท · key = เปิดโดยเลือกประเภทนั้นไว้ */
  const [creating, setCreating] = useState<string | null>(null);
  const [typeSettingsOpen, setTypeSettingsOpen] = useState(false);   // ⚙ ตั้งค่าประเภทงาน (ผู้จัดการ)
  const [openCounts, setOpenCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch(`/api/pattern-tickets?view=${view === "done" ? "done" : "open"}`);
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setRows(j.data ?? []); setTypes(j.types ?? []); setMe(j.me ?? null); setOpenCounts(j.open_counts ?? {});
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [view]);
  useEffect(() => { void load(); }, [load]);

  // เปิดตั๋วจากลิงก์ ?id= · เปิดตั๋วใหม่จากหน้า Design sheet ?ds=<id> (แนบใบนั้นไว้ให้)
  const [presetSheets, setPresetSheets] = useState<string[] | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("id");
    if (id) setOpenId(id);
    const ds = sp.get("ds");
    if (ds) setPresetSheets([ds]);
  }, []);
  const presetHandled = useRef(false);   // เปิดป๊อปจาก ?ds= ครั้งเดียว (me โหลดใหม่ไม่เปิดซ้ำ)
  useEffect(() => {
    if (!presetSheets || !me || presetHandled.current) return;
    presetHandled.current = true;
    if (me.can_create) setCreating("");
    else setPresetSheets(null);   // ไม่มีสิทธิ์เปิดตั๋ว = เห็นแค่รายการ
    const u = new URL(window.location.href);
    u.searchParams.delete("ds");
    window.history.replaceState(null, "", u.toString());
  }, [presetSheets, me]);
  const openTicket = (id: string | null) => {
    setOpenId(id);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("id", id); else u.searchParams.delete("id");
    window.history.replaceState(null, "", u.toString());
  };

  const typeOf = useMemo(() => new Map(types.map((x) => [x.key, x])), [types]);
  const today = todayBangkok();

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (type && r.type_key !== type) return false;
      if (view === "mine" && me?.id) {
        // ช่าง = งานที่ฉันรับ + งานที่ยังไม่มีคนรับ · ผู้สั่ง = ตั๋วที่ฉันเปิด
        const mineAsWorker = me.can_work && (r.assignee_id === me.id || !r.assignee_id);
        const mineAsRequester = r.requester_id === me.id;
        if (!mineAsWorker && !mineAsRequester) return false;
      }
      if (s && ![r.title, r.title_en, r.ticket_no, r.sku_code, r.assignee_name, r.requester_name].some((v) => (v ?? "").toLowerCase().includes(s))) return false;
      return true;
    });
  }, [rows, type, view, me, q]);

  const stats = useMemo(() => {
    const open = rows.filter((r) => r.status !== "done" && r.status !== "cancelled");
    return {
      fresh: open.filter((r) => r.status === "new").length,
      doing: open.filter((r) => r.status === "doing").length,
      review: open.filter((r) => r.status === "review" || r.status === "fix").length,
      late: open.filter((r) => isOverdue(r.due_date, r.status, today)).length,
    };
  }, [rows, today]);

  if (permsReady && !can("pattern.view")) {
    return <div className="p-10"><EmptyState icon={<Icon name="lock" />} title={t("คุณไม่มีสิทธิ์ดูตั๋วงาน Pattern", "You don't have access to pattern tickets")} hint={t("ขอสิทธิ์ \"ดูตั๋วงาน Pattern\" จากผู้ดูแลระบบ", "Ask an admin for the \"View pattern tickets\" permission")} /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
      {/* หัวหน้า */}
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-slate-800">{t("ตั๋วงานช่าง Pattern", "Pattern job tickets")}</h1>
          <p className="text-sm text-slate-500">{t("งานแบบตัด บล็อก แบบเย็บ สกรีน เลเซอร์ ฯลฯ — ฝ่ายออกแบบเปิดตั๋ว ช่างกดรับแล้วส่งตรวจ", "Cutting, block, sewing, screen, laser jobs and more — design opens a ticket, the pattern maker takes it and submits for review")}</p>
        </div>
        {/* โหมด English — ปุ่มกลาง (สลับภาษาทั้งระบบ · จำต่อบัญชีผ่าน LangSync) */}
        <LangToggle />
      </div>

      {/* แผ่นประเภทงาน — เฉพาะคนที่เปิดตั๋วได้ (pattern.create: ผู้จัดการ/แอดมิน/ฝ่ายออกแบบ) · พนักงานเห็นแค่รายการตั๋ว */}
      <TypeTiles types={types} counts={openCounts} me={me}
        onPick={(key) => setCreating(key)}
        onTypeSaved={(nt) => setTypes((cur) => cur.map((x) => (x.key === nt.key ? { ...x, ...nt } : x)))}
        onOpenSettings={() => setTypeSettingsOpen(true)} />
      {typeSettingsOpen && <TypeSettingsModal onClose={() => setTypeSettingsOpen(false)} onChanged={() => void load()} />}

      {/* ตัวเลขสรุป */}
      <h2 className="mb-2 text-sm font-medium text-slate-700">{t("ตั๋วงาน", "Tickets")}</h2>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: t("รอรับงาน", "New"), v: stats.fresh, cls: "text-slate-800" },
          { label: t("กำลังทำ", "In progress"), v: stats.doing, cls: "text-blue-700" },
          { label: t("รอตรวจ / ต้องแก้", "Review / revision"), v: stats.review, cls: "text-amber-700" },
          { label: t("เลยกำหนด", "Overdue"), v: stats.late, cls: stats.late ? "text-red-600" : "text-slate-800" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="text-xs text-slate-500">{m.label}</div>
            <div className={`text-2xl font-semibold tabular-nums ${m.cls}`}>{view === "done" ? "–" : m.v}</div>
          </div>
        ))}
      </div>

      {/* กรองประเภทงาน */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Chip on={!type} onClick={() => setType("")}>{t("ทุกประเภท", "All types")}</Chip>
        {types.filter((x) => x.is_active).map((x) => (
          <Chip key={x.key} on={type === x.key} onClick={() => setType(type === x.key ? "" : x.key)}>
            <Icon value={typeIconOf(x)} /> {t(x.label_th, x.label_en)}
          </Chip>
        ))}
      </div>

      {/* มุมมอง + ค้นหา */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Chip on={view === "mine"} onClick={() => setView("mine")}>{t("งานของฉัน", "My work")}</Chip>
        <Chip on={view === "open"} onClick={() => setView("open")}>{t("งานค้างทั้งหมด", "All open")}</Chip>
        <Chip on={view === "done"} onClick={() => setView("done")}>{t("เสร็จ / ยกเลิก", "Done / cancelled")}</Chip>
        <div className="ml-auto flex w-full items-center gap-2 sm:w-64">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหา เลขตั๋ว / ชื่องาน / SKU / ช่าง", "Search ticket / title / SKU / maker")}
            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
        </div>
      </div>

      {/* รายการ */}
      {loading && !rows.length ? <LoadingState label={t("กำลังโหลดตั๋วงาน…", "Loading tickets…")} />
        : err ? <ErrorState title={t("โหลดตั๋วงานไม่สำเร็จ", "Couldn't load tickets")} hint={err} onRetry={() => void load()} retrying={loading} />
        : !shown.length ? (
          <EmptyState icon={<Icon name="list" />}
            title={view === "mine" ? t("ยังไม่มีงานของคุณ", "Nothing assigned to you") : t("ไม่มีตั๋วในมุมนี้", "No tickets here")}
            hint={t("ลองเปลี่ยนประเภท/มุมมอง หรือกด \"งานค้างทั้งหมด\"", "Try another type or view, or open \"All open\"")}
            action={me?.can_create ? { label: t("เปิดตั๋วงาน", "New ticket"), onClick: () => setCreating(type) } : undefined} />
        ) : (
          <div className="flex flex-col gap-1.5">
            {shown.map((r) => {
              const ty = typeOf.get(r.type_key);
              const st = patternStatus(r.status);
              const late = isOverdue(r.due_date, r.status, today);
              const done = r.checklist?.filter((c) => c.done).length ?? 0;
              const total = r.checklist?.length ?? 0;
              return (
                <button key={r.id} type="button" onClick={() => openTicket(r.id)}
                  className={`grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-left transition hover:border-slate-300 ${openId === r.id ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200"}`}>
                  <TypeIconBox value={ty ? typeIconOf(ty) : "i:file"} color={ty?.color ?? "slate"} box={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {r.priority === "urgent" && <span className="mr-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">{t("ด่วน", "Urgent")}</span>}
                      {ticketTitle(r, isEn)}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {r.ticket_no ?? "—"} · {ty ? t(ty.label_th, ty.label_en) : r.type_key}
                      {r.sku_code ? ` · ${r.sku_code}` : ""}
                      {total ? ` · ${t("เช็กลิสต์", "Checklist")} ${done}/${total}` : ""}
                      {` · ${r.assignee_name ? `${t("ช่าง", "Maker")} ${r.assignee_name}` : t("ยังไม่มีคนรับ", "Unassigned")}`}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{t(st.th, st.en)}</span>
                    {r.due_date && (
                      <span className={`text-[11px] tabular-nums ${late ? "font-medium text-red-600" : "text-slate-500"}`}>
                        <Icon name="clock" /> {fmtDate(r.due_date)}{late ? ` ${t("เลยกำหนด", "overdue")}` : ""}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

      {openId && (
        <TicketDrawer id={openId} types={types} onClose={() => openTicket(null)} onChanged={() => void load()} />
      )}
      {creating !== null && (
        <CreateTicketModal key={creating || "_"} types={types} initialType={creating || undefined} initialSheetIds={presetSheets ?? undefined}
          onClose={() => { setCreating(null); setPresetSheets(null); }}
          onCreated={(id) => { setCreating(null); setPresetSheets(null); void load(); openTicket(id); }} />
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${on ? "border-blue-300 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
      {children}
    </button>
  );
}
