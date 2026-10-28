"use client";

/**
 * ⏰ ตั้งเวลาเผยแพร่ + 🎪 ธีมแคมเปญ + 🎄 ของตกแต่ง + 👀 ป้ายคนดู/ขายแล้ว (แท็บดีไซน์ ชุด 5) — หน้าจอใน ERP › เว็บไซต์ › ดีไซน์
 *
 * useThemeSchedules      รายการตั้งเวลา/แคมเปญของร้าน (/api/website/theme/schedules)
 * SchedulePublishModal   ⏰ ตั้งเวลาเผยแพร่ร่างที่เห็นอยู่ (+ หน้าแรกที่ร่างไว้)
 * ScheduleBanner         แถบเตือน "ตั้งเวลาเผยแพร่ไว้ …" + ยกเลิก
 * CampaignTab            แท็บ 🎪 แคมเปญ: งานตั้งเวลา · แคมเปญ (บันทึกทันที) · ของตกแต่ง + ป้าย (อยู่ในร่างธีม)
 * ตรรกะ/ตรวจค่า = lib/website-theme-schedule.ts · ตัวทำงานจริง = lib/website-theme-schedule-db.ts
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { ERPDateTime24 } from "@/components/form";
import { FestiveSetting, ProofSetting } from "@/components/website-site-design-setting";
import { DEFAULT_SITE_PAGE, type FestiveLook, type ProofLook } from "@/lib/website-site-design";
import type { SavedTheme } from "@/lib/website-saved-themes";
import type { SiteTheme } from "@/lib/website-theme";
import {
  CAMPAIGN_STATE_LABEL,
  applyCampaign,
  campaignState,
  fmtThaiDateTime,
  isoToThaiLocal,
  overlappingCampaigns,
  sanitizeCampaignInput,
  thaiLocalToIso,
  type ThemeSchedule,
} from "@/lib/website-theme-schedule";
import { webForm } from "@/lib/website-form-styles";
import { DesignCard } from "@/components/website-design/design-card";

const API = "/api/website/theme/schedules";
const inputCls = webForm.inputBasic;
const labelCls = webForm.labelRoomy;

const FESTIVE_NAME: Record<string, string> = { snow: "❄️ หิมะ", petals: "🌸 กลีบดอกไม้", confetti: "🎊 กระดาษสี", hearts: "❤️ หัวใจ", water: "💧 หยดน้ำ", leaves: "🍂 ใบไม้", stars: "✨ ประกาย", lantern: "🏮 โคมแดง", flags: "🚩 ธงราว" };
const STATE_CLS: Record<string, string> = { active: "bg-emerald-50 text-emerald-700", upcoming: "bg-blue-50 text-blue-700", ended: "bg-slate-100 text-slate-500", cancelled: "bg-slate-100 text-slate-400" };

export function useThemeSchedules(shopSlug: string) {
  const [list, setList] = useState<ThemeSchedule[] | null>(null);
  const reload = useCallback(() => {
    apiFetch(`${API}?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => setList(Array.isArray(j.schedules) ? j.schedules : []))
      .catch(() => setList([]));
  }, [shopSlug]);
  useEffect(() => reload(), [reload]);
  return { list, reload };
}

/** พรุ่งนี้ 00:00 (เวลาไทย) */
const tomorrowMidnight = () => `${isoToThaiLocal(new Date(Date.now() + 864e5).toISOString()).slice(0, 10)}T00:00`;

/** ⏰ ตั้งเวลาเผยแพร่ร่างที่เห็นอยู่ */
export function SchedulePublishModal({ open, onClose, shopId, theme, pending, onDone }: { open: boolean; onClose: () => void; shopId: string; theme: unknown; pending: ThemeSchedule | null; onDone: () => void }) {
  const toast = useToast();
  const [when, setWhen] = useState(tomorrowMidnight);
  const [includeHome, setIncludeHome] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setWhen(tomorrowMidnight());
    setIncludeHome(false);
    setNote("");
    setErr("");
  }, [open]);
  const submit = async () => {
    const at = thaiLocalToIso(when);
    if (!at) return setErr("เลือกวันและเวลาก่อน");
    if (Date.parse(at) < Date.now() + 60e3) return setErr("เวลาต้องอยู่ในอนาคตอย่างน้อย 1 นาที");
    setBusy(true);
    try {
      const r = await apiFetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId, kind: "publish", theme, at, includeHome, note }) });
      const j = await r.json();
      if (!j.ok) return setErr(j.error ?? "ตั้งเวลาไม่สำเร็จ");
      toast.success(`ตั้งเวลาแล้ว — ระบบจะเผยแพร่ ${fmtThaiDateTime(at)} น.`);
      onDone();
      onClose();
    } catch {
      setErr("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title="⏰ ตั้งเวลาเผยแพร่"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700">ยกเลิก</button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">{busy ? "กำลังบันทึก…" : "ยืนยันตั้งเวลา"}</button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">ระบบเก็บหน้าตาที่เห็นในพรีวิวตอนนี้ไว้ แล้วเผยแพร่ให้เองตามเวลาที่เลือก (เว็บเปลี่ยนภายใน ~1–2 นาทีหลังถึงเวลา)</p>
        <div>
          <label className={labelCls}>วันและเวลา (เวลาไทย · 24 ชม.)</label>
          <ERPDateTime24 value={when} onChange={(v) => { setWhen(v); setErr(""); }} defaultTime="00:00" />
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 mt-0.5 accent-blue-600" checked={includeHome} onChange={(e) => { setIncludeHome(e.target.checked); setErr(""); }} />
          <span>
            เผยแพร่ <b>หน้าแรกที่ร่างไว้</b> พร้อมกันด้วย
            <span className="block text-[11px] text-slate-400">เช่น เปลี่ยนแบนเนอร์หน้าแรกตอนเปิดโปร (ต้องบันทึกร่างหน้าแรกไว้ก่อน)</span>
          </span>
        </label>
        <div>
          <label className={labelCls}>หมายเหตุ (ไม่บังคับ)</label>
          <input className={inputCls} value={note} maxLength={300} placeholder="เปิดโปร 11.11" onChange={(e) => setNote(e.target.value)} />
        </div>
        {pending && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">มีที่ตั้งไว้แล้ว ({fmtThaiDateTime(pending.startsAt)}) — ยืนยันแล้วจะแทนที่อันเดิม</p>}
        <p className="text-[11px] text-slate-400">ถ้ากดเผยแพร่อย่างอื่นก่อนถึงเวลา ชุดที่ตั้งไว้จะทับตอนถึงเวลา · เผยแพร่แล้วย้อนได้ที่แท็บประวัติ</p>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </ERPModal>
  );
}

/** แถบ "ตั้งเวลาเผยแพร่ไว้ …" (บนหน้าดีไซน์) */
export function ScheduleBanner({ pending, onCancel }: { pending: ThemeSchedule | null; onCancel: (s: ThemeSchedule) => void }) {
  if (!pending) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800" data-schedule-banner>
      <span>⏰ ตั้งเวลาเผยแพร่ <b>{pending.includeHome ? "ธีม + หน้าแรก" : "ธีม"}</b> ไว้ {fmtThaiDateTime(pending.startsAt)} น.{pending.note ? ` · ${pending.note}` : ""}</span>
      <button type="button" onClick={() => onCancel(pending)} className="ml-auto text-xs underline hover:no-underline">ยกเลิกการตั้งเวลา</button>
    </div>
  );
}

/** ⏰ ยกเลิกงานตั้งเวลา (ถามก่อน) */
export async function cancelSchedule(s: ThemeSchedule, toast: ReturnType<typeof useToast>): Promise<boolean> {
  if (!(await askConfirm({ title: "ยกเลิกการตั้งเวลา?", message: `เว็บจะไม่เผยแพร่ตอน ${fmtThaiDateTime(s.startsAt)} น. (ร่างยังอยู่ แก้ต่อได้)`, confirmText: "ยกเลิกการตั้งเวลา", cancelText: "เก็บไว้" }))) return false;
  try {
    const j = await (await apiFetch(`${API}?id=${encodeURIComponent(s.id)}`, { method: "DELETE" })).json();
    if (!j.ok) {
      toast.error(j.error ?? "ยกเลิกไม่สำเร็จ");
      return false;
    }
    toast.success("ยกเลิกการตั้งเวลาแล้ว");
    return true;
  } catch {
    toast.error("เชื่อมต่อไม่ได้");
    return false;
  }
}

interface CampaignDraft {
  id?: string;
  name: string;
  starts: string;
  ends: string;
  savedThemeId: string;
  festiveOn: boolean;
  festive: FestiveLook;
  note: string;
}
const emptyDraft = (): CampaignDraft => {
  const d = tomorrowMidnight();
  return { name: "", starts: d, ends: `${isoToThaiLocal(new Date(Date.parse(thaiLocalToIso(d) ?? "") + 7 * 864e5).toISOString()).slice(0, 10)}T23:59`, savedThemeId: "", festiveOn: false, festive: { ...DEFAULT_SITE_PAGE.festive, kind: "confetti" }, note: "" };
};
const draftOf = (c: ThemeSchedule): CampaignDraft => ({
  id: c.id,
  name: c.name,
  starts: isoToThaiLocal(c.startsAt),
  ends: isoToThaiLocal(c.endsAt),
  savedThemeId: c.look?.savedThemeId ?? "",
  festiveOn: !!c.festive,
  festive: c.festive ?? { ...DEFAULT_SITE_PAGE.festive, kind: "confetti" },
  note: c.note,
});
const payloadOf = (d: CampaignDraft) => ({ id: d.id, name: d.name, startsAt: thaiLocalToIso(d.starts), endsAt: thaiLocalToIso(d.ends), savedThemeId: d.savedThemeId || null, festive: d.festiveOn ? d.festive : null, note: d.note });

/** 🎪 ป๊อปสร้าง/แก้แคมเปญ */
function CampaignModal({ open, onClose, shopId, initial, list, savedThemes, onSaved }: { open: boolean; onClose: () => void; shopId: string; initial: CampaignDraft; list: ThemeSchedule[]; savedThemes: SavedTheme[]; onSaved: () => void }) {
  const toast = useToast();
  const [d, setD] = useState(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setD(initial);
      setErr("");
    }
  }, [open, initial]);
  const set = (p: Partial<CampaignDraft>) => {
    setD((cur) => ({ ...cur, ...p }));
    setErr("");
  };
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const p = payloadOf(d);
  const overlaps = p.startsAt && p.endsAt ? overlappingCampaigns(list, { id: d.id, startsAt: p.startsAt, endsAt: p.endsAt }) : [];
  const mine = savedThemes.filter((t) => t.shopId === shopId);
  const other = savedThemes.filter((t) => t.shopId !== shopId);
  const savedGone = !!d.savedThemeId && !savedThemes.some((t) => t.id === d.savedThemeId);
  const submit = async () => {
    const v = sanitizeCampaignInput(p);
    if (!v.ok) return setErr(v.error);
    setBusy(true);
    try {
      const r = await apiFetch(API, { method: d.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId, kind: "campaign", ...p }) });
      const j = await r.json();
      if (!j.ok) return setErr(j.error ?? "บันทึกไม่สำเร็จ");
      toast.success(d.id ? "แก้แคมเปญแล้ว" : "สร้างแคมเปญแล้ว — เว็บเปลี่ยนเองเมื่อถึงวันเริ่ม");
      onSaved();
      onClose();
    } catch {
      setErr("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={d.id ? "🎪 แก้แคมเปญ" : "🎪 แคมเปญใหม่"}
      size="md"
      hasUnsavedChanges={dirty}
      defaultExpanded={false}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700">ยกเลิก</button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึกแคมเปญ"}</button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelCls}>ชื่อแคมเปญ</label>
          <input className={inputCls} value={d.name} maxLength={80} placeholder="11.11 ลดใหญ่" onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>เริ่ม (เวลาไทย)</label>
            <ERPDateTime24 value={d.starts} onChange={(starts) => set({ starts })} defaultTime="00:00" />
          </div>
          <div>
            <label className={labelCls}>จบ (เวลาไทย)</label>
            <ERPDateTime24 value={d.ends} onChange={(ends) => set({ ends })} defaultTime="23:59" />
          </div>
        </div>
        <div>
          <label className={labelCls}>หน้าตาช่วงแคมเปญ (จาก 💾 ธีมที่บันทึกไว้ · แท็บสี)</label>
          <select className={inputCls} value={d.savedThemeId} onChange={(e) => set({ savedThemeId: e.target.value })}>
            <option value="">ไม่เปลี่ยนสี/หน้าตา</option>
            {savedGone && <option value={d.savedThemeId}>(ธีมเดิมที่ตั้งไว้ — ถูกลบจากรายการแล้ว แคมเปญยังใช้สำเนาเดิม)</option>}
            {mine.length > 0 && (
              <optgroup label="ธีมของร้านนี้">
                {mine.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} · {t.scope === "full" ? "ทั้งชุด" : "เฉพาะสี"}</option>
                ))}
              </optgroup>
            )}
            {other.length > 0 && (
              <optgroup label="ธีมจากร้านอื่น">
                {other.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} · {t.scope === "full" ? "ทั้งชุด" : "เฉพาะสี"}{t.shopName ? ` (${t.shopName})` : ""}</option>
                ))}
              </optgroup>
            )}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">{savedThemes.length ? "ระบบเก็บสำเนาธีมไว้ตอนบันทึก (แก้/ลบธีมต้นทางทีหลังไม่กระทบแคมเปญ) · โลโก้ เมนู ท้ายเว็บ ป้าย ป๊อปอัป คงตามธีมปกติ" : "ยังไม่มีธีมที่บันทึกไว้ — ไปแท็บสี › 💾 บันทึกธีมนี้ไว้ ก่อน (หรือใช้แค่ของตกแต่ง)"}</p>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={d.festiveOn} onChange={(e) => set({ festiveOn: e.target.checked })} />
            🎄 ของตกแต่งเฉพาะช่วงแคมเปญ (ไม่ติ๊ก = ตามธีมปกติ)
          </label>
          {d.festiveOn && (
            <div className="mt-2 pl-6">
              <FestiveSetting value={d.festive} onChange={(festive) => set({ festive })} />
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>หมายเหตุ (ไม่บังคับ)</label>
          <input className={inputCls} value={d.note} maxLength={300} onChange={(e) => set({ note: e.target.value })} />
        </div>
        {overlaps.length > 0 && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">ช่วงเวลาทับกับ {overlaps.map((o) => `"${o.name}"`).join(", ")} — ช่วงที่ทับ เว็บใช้แคมเปญที่เริ่มทีหลัง</p>}
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </ERPModal>
  );
}

/** 🎪 แท็บแคมเปญ — งานตั้งเวลา · แคมเปญ · ของตกแต่ง · ป้ายคนดู/ขายแล้ว */
export function CampaignTab({
  shopId,
  theme,
  schedules,
  reload,
  onSchedule,
  onPage,
  onPreview,
  previewing,
}: {
  shopId: string;
  theme: SiteTheme;
  schedules: ThemeSchedule[] | null;
  reload: () => void;
  onSchedule: () => void;
  onPage: (p: { festive?: FestiveLook; proof?: ProofLook }) => void;
  onPreview: (c: { id: string; name: string; theme: SiteTheme } | null) => void;
  previewing: string | null;
}) {
  const toast = useToast();
  const [saved, setSaved] = useState<SavedTheme[]>([]);
  const [editing, setEditing] = useState<CampaignDraft | null>(null);
  useEffect(() => {
    apiFetch("/api/website/saved-themes")
      .then((r) => r.json())
      .then((j) => setSaved(Array.isArray(j.themes) ? j.themes : []))
      .catch(() => setSaved([]));
  }, []);
  const list = useMemo(() => schedules ?? [], [schedules]);
  const pending = list.find((s) => s.kind === "publish" && s.status === "pending") ?? null;
  const history = list.filter((s) => s.kind === "publish" && s.status !== "pending").slice(0, 5);
  const campaigns = list.filter((s) => s.kind === "campaign");
  const removeCampaign = async (c: ThemeSchedule) => {
    if (!(await askConfirm({ title: `ลบแคมเปญ "${c.name}"?`, message: campaignState(c) === "active" ? "แคมเปญนี้กำลังทำงานอยู่ — ลบแล้วเว็บกลับเป็นธีมปกติภายใน ~1 นาที" : "ลบแล้วกู้คืนไม่ได้ (มีบันทึกในประวัติการใช้งาน)", variant: "danger", confirmText: "ลบแคมเปญ" }))) return;
    try {
      const j = await (await apiFetch(`${API}?id=${encodeURIComponent(c.id)}`, { method: "DELETE" })).json();
      if (!j.ok) return toast.error(j.error ?? "ลบไม่สำเร็จ");
      toast.success("ลบแคมเปญแล้ว");
      if (previewing === c.id) onPreview(null);
      reload();
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    }
  };
  return (
    <div className="space-y-4">
      {/* ── ⏰ ตั้งเวลาเผยแพร่ ── */}
      <DesignCard title="⏰ ตั้งเวลาเผยแพร่" hint="แต่งร่างไว้ล่วงหน้า แล้วให้ระบบเผยแพร่เองตามเวลา (มีปุ่มเดียวกันที่แถบล่าง ข้างปุ่มเผยแพร่)" right={<><button type="button" onClick={onSchedule} className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50">ตั้งเวลาเผยแพร่ร่างนี้</button></>}>
        {schedules === null ? (
          <p className="text-xs text-slate-400">กำลังโหลด…</p>
        ) : (
          <>
            <ScheduleBanner pending={pending} onCancel={async (s) => (await cancelSchedule(s, toast)) && reload()} />
            {!pending && <p className="text-xs text-slate-400">ยังไม่มีที่ตั้งเวลาไว้</p>}
            {history.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-slate-500">
                {history.map((h) => (
                  <li key={h.id}>
                    {h.status === "done" ? "✅ เผยแพร่แล้ว" : "⚠️ เผยแพร่ไม่สำเร็จ"} · ตั้งไว้ {fmtThaiDateTime(h.startsAt)} น.{h.versionNo ? ` · เวอร์ชัน ${h.versionNo}` : ""} · {h.includeHome ? "ธีม + หน้าแรก" : "ธีม"}
                    {h.createdByName ? ` · โดย ${h.createdByName}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </DesignCard>

      {/* ── 🎪 แคมเปญ ── */}
      <DesignCard title="🎪 ธีมแคมเปญตามช่วงวันที่" hint={<>ช่วงแคมเปญ เว็บใช้หน้าตา/ของตกแต่งที่เลือก พอหมดช่วงกลับธีมปกติเอง · <b>บันทึกแล้วมีผลทันที</b>ไม่ต้องกดเผยแพร่ · ระหว่างแคมเปญแก้ธีมปกติได้ตามเดิม</>} right={<><button type="button" onClick={() => setEditing(emptyDraft())} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">+ แคมเปญใหม่</button></>}>
        {campaigns.length === 0 ? (
          <p className="text-xs text-slate-400">ยังไม่มีแคมเปญ</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
            {campaigns.map((c) => {
              const st = campaignState(c);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5" data-campaign={st}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 font-medium">
                      {c.name} <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${STATE_CLS[st]}`}>{CAMPAIGN_STATE_LABEL[st]}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {fmtThaiDateTime(c.startsAt)} – {fmtThaiDateTime(c.endsAt)} · {c.look ? `ธีม ${c.look.name}` : "สีเดิม"} · {c.festive && c.festive.kind !== "none" ? FESTIVE_NAME[c.festive.kind] : c.festive ? "ไม่ตกแต่ง" : "ตกแต่งตามธีมปกติ"}
                    </p>
                  </div>
                  {st !== "ended" && (
                    <>
                      <button type="button" onClick={() => onPreview(previewing === c.id ? null : { id: c.id, name: c.name, theme: applyCampaign(theme, c) })} className={`text-xs px-2.5 py-1 rounded-lg border ${previewing === c.id ? "border-blue-500 text-blue-700 bg-blue-50" : "border-slate-300 text-slate-600 hover:border-slate-500"}`}>
                        👁 {previewing === c.id ? "กำลังดู" : "ดูตัวอย่าง"}
                      </button>
                      <button type="button" onClick={() => setEditing(draftOf(c))} className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 hover:border-slate-500">แก้</button>
                    </>
                  )}
                  <button type="button" onClick={() => void removeCampaign(c)} className="text-xs px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50">ลบ</button>
                </li>
              );
            })}
          </ul>
        )}
      </DesignCard>

      {/* ── 🎄 ของตกแต่ง (ธีมปกติ) ── */}
      <DesignCard title="🎄 ของตกแต่งเทศกาล (ธีมปกติ)" hint="ติดไว้ตลอดจนกว่าจะเอาออก · อยากให้มีแค่ช่วงเทศกาล = ตั้งในแคมเปญแทน · อยู่ในร่างธีม (กดบันทึกร่าง/เผยแพร่)">
        <FestiveSetting value={theme.page.festive} onChange={(festive) => onPage({ festive })} />
      </DesignCard>

      {/* ── 👀🔥 ป้ายคนดู / ขายแล้ว ── */}
      <DesignCard title="👀 ป้ายคนดู / 🔥 ขายแล้ว" hint="โชว์ใต้ราคาในหน้าสินค้า · อยู่ในร่างธีม (กดบันทึกร่าง/เผยแพร่)">
        <ProofSetting value={theme.page.proof} onChange={(proof) => onPage({ proof })} />
      </DesignCard>

      {editing && <CampaignModal open onClose={() => setEditing(null)} shopId={shopId} initial={editing} list={list} savedThemes={saved} onSaved={reload} />}
    </div>
  );
}
