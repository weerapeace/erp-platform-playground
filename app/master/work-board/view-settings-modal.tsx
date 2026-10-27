"use client";

/**
 * ป๊อป ⚙️ ตั้งค่ามุมมอง (บอร์ดจ่ายงาน) — ทุกอย่างที่ปรับหน้าตาตารางอยู่ที่เดียว 4 แท็บ
 *   ⭐ มุมมองด่วน (แท็บย่อย: กรอง · แสดงเป็น · เรียง/กลุ่ม · ใครเห็น) · 🎛 หน้าตา · 🧩 ส่วนหัว · ▥ คอลัมน์ปกติ
 * ปรับแล้วตารางด้านหลังเห็นผลทันที (มุมมองที่เลือก = onPreview · หน้าตา = ร่างของ useTableDisplay)
 *   → 💾 บันทึกทีเดียว · ปิดตอนยังไม่บันทึก = ERPModal ถามก่อน แล้วกลับเป็นแบบเดิม
 * เปิดมาเจอแท็บ / แท็บย่อย / มุมมองที่ใช้ล่าสุด (จำต่อคน "wb_view_settings_ui") · ลากหัวป๊อปย้ายได้ (ERPModal)
 *   👥 มุมมองของทีม: แอดมินแก้ได้ + ตั้ง "ใครเห็นปุ่มนี้" · คนอื่นดูได้ + ซ่อนสำหรับตัวเอง + ทำสำเนาเป็นของฉัน
 *   👤 มุมมองของฉัน: ใครก็สร้าง/แก้/ลบได้ เห็นคนเดียว
 * ที่เก็บมุมมอง = ./use-quick-views · ฟอร์ม 1 มุมมอง = ./quick-views-editor · หน้าตา = ./table-display-panel
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { roleLabel } from "@/components/auth";
import { useUserPref } from "@/lib/use-user-pref";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { QuickViewForm, type QvBrand, type QvFormSection } from "./quick-views-editor";
import { QV_DEFAULT_TEAM, QV_TEMPLATES, qvNew, type QuickView, type QvMine, type QvTemplate, type TeamView } from "./quick-views";
import { DisplaySettings, type DisplayTab } from "./table-display-panel";
import type { TableDisplay } from "./table-display";

type Sel = { kind: "team" | "mine"; id: string };
type UserLite = { id: string; name: string; role: string | null };
export type VsTab = "views" | DisplayTab;
type VsSub = QvFormSection | "aud";
type VsUi = { tab: VsTab; sub: VsSub; sel: Sel | null };
const UI_DEFAULT: VsUi = { tab: "views", sub: "filter", sel: null };
const VS_TABS: [VsTab, string][] = [["views", "⭐ มุมมองด่วน"], ["look", "🎛 หน้าตา"], ["head", "🧩 ส่วนหัว"], ["cols", "▥ คอลัมน์ปกติ"]];
const VS_SUBS: [VsSub, string][] = [["filter", "🔎 กรอง"], ["display", "▦ แสดงเป็น"], ["sort", "↕ เรียง / กลุ่ม"], ["aud", "👁 ใครเห็น"]];
const parseUi = (v: unknown): VsUi | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const tab = VS_TABS.some(([k]) => k === o.tab) ? (o.tab as VsTab) : "views";
  const sub = VS_SUBS.some(([k]) => k === o.sub) ? (o.sub as VsSub) : "filter";
  const s = o.sel as Record<string, unknown> | null | undefined;
  const sel = s && (s.kind === "team" || s.kind === "mine") && typeof s.id === "string" ? { kind: s.kind, id: s.id } as Sel : null;
  return { tab, sub, sel };
};
const ROLES = ["admin", "manager", "staff"];
const copyView = (v: QuickView, p: Partial<QuickView> = {}): QuickView => ({
  ...JSON.parse(JSON.stringify(v)) as QuickView, ...qvNew(), ...stripId(v), ...p,
});
function stripId(v: QuickView): Omit<QuickView, "id"> { const { id: _id, ...rest } = JSON.parse(JSON.stringify(v)) as QuickView; void _id; return rest; }
const audText = (v: TeamView) => (v.aud === "all" ? "ทุกคน" : v.aud === "roles" ? (v.roles.length ? v.roles.map(roleLabel).join(", ") : "ยังไม่เลือก") : `${v.users.length} คน`);

export function ViewSettingsModal({ open, onClose, isAdmin, team, mine, onSave, brands, colOptions, defaultCols, disp, currentCols, cardGroups, openTab, focus, openSel, newMine, onPreview, countOf, total }: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  team: TeamView[];
  mine: QvMine;
  onSave: (next: { team?: TeamView[]; mine?: QvMine }) => Promise<boolean>;
  brands: QvBrand[];
  colOptions: [string, string][];
  defaultCols?: string[];           // คอลัมน์ที่ตารางปกติโชว์อยู่ (ตั้งต้นตอนมุมมองกำหนดคอลัมน์เอง)
  disp: TableDisplay;               // หน้าตาตาราง (ร่างระหว่างเปิดป๊อป)
  currentCols: string[];
  cardGroups: [string, [string, string][]][];
  openTab?: VsTab | null;           // เปิดมาที่แท็บนี้ (ไม่ส่ง = แท็บที่ใช้ล่าสุด)
  focus?: Sel | null;               // มุมมองที่ตารางใช้อยู่ (ถ้ายังไม่เคยเลือกในป๊อป)
  openSel?: Sel | null;             // เปิดมาที่มุมมองนี้แน่ ๆ (เมนูลัด "แก้มุมมองนี้") — ทับที่จำไว้
  newMine?: QuickView | null;       // มาจาก "＋ บันทึกเป็นมุมมอง" — เพิ่มเป็นของฉันในร่าง (ยังไม่บันทึก)
  onPreview?: (v: QuickView | null) => void;   // มุมมองที่กำลังแก้ → ตารางด้านหลังโชว์ตามทันที · null = กลับมุมมองเดิม
  countOf?: (v: QuickView) => number;          // นับใบที่ตรงมุมมอง (สด ๆ ตอนแก้เงื่อนไข)
  total?: number;                              // ใบรอจ่ายทั้งหมด
}) {
  const toast = useToast();
  const [dTeam, setDTeam] = useState<TeamView[]>(team);
  const [dMine, setDMine] = useState<QvMine>(mine);
  const [sel, setSel] = useState<Sel | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [users, setUsers] = useState<UserLite[] | null>(null);
  const [ui, setUi] = useUserPref<VsUi>("wb_view_settings_ui", UI_DEFAULT, parseUi);
  const [tab, setTab] = useState<VsTab>("views");
  const [sub, setSub] = useState<VsSub>("filter");
  // เปิดป๊อป = เริ่มร่างใหม่จากค่าที่บันทึกไว้ · กลับไปแท็บ/มุมมองที่ใช้ล่าสุด
  useEffect(() => {
    if (!open) return;
    const t: TeamView[] = JSON.parse(JSON.stringify(team));
    const m: QvMine = JSON.parse(JSON.stringify(mine));
    if (newMine) m.views = [...m.views, newMine];
    setDTeam(t);
    setDMine(m);
    const has = (s: Sel | null | undefined): s is Sel => !!s && (s.kind === "team" ? t.some((v) => v.id === s.id) : m.views.some((v) => v.id === s.id));
    setSel(newMine ? { kind: "mine", id: newMine.id } : has(openSel) ? openSel : has(ui.sel) ? ui.sel : has(focus) ? focus : t[0] ? { kind: "team", id: t[0].id } : null);
    setTab(newMine ? "views" : openTab ?? ui.tab);
    setSub(ui.sub);
    disp.beginStage();
    setSavedAt(null);
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  // จำแท็บ/แท็บย่อย/มุมมองที่เลือกไว้ (ต่อคน) — เปิดครั้งหน้าเจอที่เดิม · เก็บตอนปิด/บันทึก (ไม่ยิงทุกครั้งที่กดแท็บ)
  const rememberUi = () => {
    const next: VsUi = { tab, sub, sel };
    if (JSON.stringify(next) !== JSON.stringify(ui)) setUi(next);
  };

  const teamDirty = JSON.stringify(dTeam) !== JSON.stringify(team);
  const mineDirty = JSON.stringify(dMine) !== JSON.stringify(mine);
  const dispDirty = disp.stageDirty || !!disp.editingShared;
  const dirty = teamDirty || mineDirty || dispDirty;
  const cur: QuickView | TeamView | undefined = sel?.kind === "team" ? dTeam.find((v) => v.id === sel.id) : dMine.views.find((v) => v.id === sel?.id);
  const curTeam = sel?.kind === "team" ? (cur as TeamView | undefined) : undefined;
  const canEditCur = sel?.kind === "mine" || isAdmin;
  const audOk = !!curTeam && isAdmin;
  const subShown: VsSub = sub === "aud" && !audOk ? "filter" : sub;

  // ตารางด้านหลังโชว์มุมมองที่กำลังแก้ (เฉพาะตอนอยู่แท็บมุมมองด่วน) — แท็บอื่น = มุมมองเดิมของตาราง
  const curJson = JSON.stringify(cur ?? null);
  useEffect(() => {
    if (!open) return;
    onPreview?.(tab === "views" && cur ? (JSON.parse(curJson) as QuickView) : null);
  }, [open, tab, curJson]);   // eslint-disable-line react-hooks/exhaustive-deps

  // รายชื่อผู้ใช้ (ไว้เลือก "เฉพาะคน") — โหลดเมื่อแอดมินเลือกแบบนี้ครั้งแรก
  useEffect(() => {
    if (!open || !isAdmin || users || curTeam?.aud !== "users") return;
    apiFetch("/api/creative-users?limit=50").then((r) => r.json()).then((j) => setUsers((j?.data ?? []) as UserLite[])).catch(() => setUsers([]));
  }, [open, isAdmin, users, curTeam?.aud]);

  const patchCur = (patch: Partial<TeamView>) => {
    if (!sel) return;
    if (sel.kind === "team") setDTeam((ts) => ts.map((v) => (v.id === sel.id ? { ...v, ...patch } : v)));
    else setDMine((m) => ({ ...m, views: m.views.map((v) => (v.id === sel.id ? { ...v, ...patch } : v)) }));
  };
  const toggleHidden = (id: string) => setDMine((m) => ({ ...m, hidden: m.hidden.includes(id) ? m.hidden.filter((x) => x !== id) : [...m.hidden, id] }));
  const addTeam = () => { const v: TeamView = { ...qvNew({ name: "มุมมองทีมใหม่" }), aud: "all", roles: [], users: [] }; setDTeam((t) => [...t, v]); setSel({ kind: "team", id: v.id }); };
  const addMine = () => { const v = qvNew({ name: "มุมมองของฉัน" }); setDMine((m) => ({ ...m, views: [...m.views, v] })); setSel({ kind: "mine", id: v.id }); };
  const copyToMine = () => { if (!cur) return; const v = copyView(cur, { name: `${cur.name} (ของฉัน)` }); setDMine((m) => ({ ...m, views: [...m.views, v] })); setSel({ kind: "mine", id: v.id }); };
  const shareToTeam = () => {
    if (!cur || sel?.kind !== "mine") return;
    const v: TeamView = { ...copyView(cur), aud: "all", roles: [], users: [] };
    setDTeam((t) => [...t, v]); setDMine((m) => ({ ...m, views: m.views.filter((x) => x.id !== cur.id) })); setSel({ kind: "team", id: v.id });
  };
  const delCur = () => {
    if (!sel) return;
    if (sel.kind === "team") { const rest = dTeam.filter((v) => v.id !== sel.id); setDTeam(rest); setSel(rest[0] ? { kind: "team", id: rest[0].id } : null); }
    else { const rest = dMine.views.filter((v) => v.id !== sel.id); setDMine((m) => ({ ...m, views: rest })); setSel(rest[0] ? { kind: "mine", id: rest[0].id } : dTeam[0] ? { kind: "team", id: dTeam[0].id } : null); }
  };
  // 💾 บันทึกทีเดียว: มุมมอง (ทีม/ของฉัน) → ชุดกลาง (แอดมินที่กำลังแก้) → หน้าตาของฉัน
  // บันทึกแล้วมีปุ่ม "ย้อนกลับ" 10 วินาที (คืนมุมมอง + หน้าตาเป็นแบบก่อนบันทึก · ชุดกลางของแอดมินไม่ย้อน)
  const save = async () => {
    setBusy(true);
    let ok = true;
    rememberUi();
    const prev = { team: JSON.parse(JSON.stringify(team)) as TeamView[], mine: JSON.parse(JSON.stringify(mine)) as QvMine, disp: disp.getSaved() };
    const did = { team: teamDirty, mine: mineDirty, disp: disp.stageDirty };
    if (teamDirty || mineDirty) ok = await onSave({ team: teamDirty ? dTeam : undefined, mine: mineDirty ? dMine : undefined });
    if (ok && disp.editingShared) await disp.saveShared();
    if (ok && disp.stageDirty) disp.commitStage();
    setBusy(false);
    if (!ok) return;
    const d = new Date(); setSavedAt(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    if (!did.team && !did.mine && !did.disp) return;
    const msg = did.team ? "บันทึกแล้ว — ทุกคนที่เห็นมุมมองทีมจะได้แบบใหม่" : did.mine ? "บันทึกมุมมองของคุณแล้ว" : "บันทึกหน้าตาตารางแล้ว";
    toast.action(msg, "ย้อนกลับ", () => {
      void (async () => {
        if (did.team || did.mine) await onSave({ team: did.team ? prev.team : undefined, mine: did.mine ? prev.mine : undefined });
        if (did.disp) disp.restoreSaved(prev.disp);
        toast.info("ย้อนกลับเป็นแบบก่อนบันทึกแล้ว");
      })();
    });
  };
  const cancelEdits = () => {
    setDTeam(JSON.parse(JSON.stringify(team))); setDMine(JSON.parse(JSON.stringify(mine)));
    disp.resetStage();
    if (disp.editingShared) disp.cancelEditShared();
  };
  // ปิดป๊อป (ยืนยันทิ้งที่แก้แล้ว ถ้ามี) = ทิ้งร่างทั้งหมด ตารางกลับเป็นแบบเดิม
  // ＋ จากแม่แบบ → มุมมองของฉันใหม่ (แม่แบบที่ต้องเลือกแบรนด์ = เลือกจากรายการแบรนด์ก่อน)
  const tplAnchor = useRef<HTMLButtonElement>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplBrand, setTplBrand] = useState<QvTemplate | null>(null);
  const addFromTemplate = (t: QvTemplate, brand?: string) => {
    const v = qvNew(t.make(brand));
    setDMine((m) => ({ ...m, views: [...m.views, v] }));
    setSel({ kind: "mine", id: v.id });
    setSub("filter");
    setTplOpen(false); setTplBrand(null);
  };
  const close = () => {
    rememberUi();
    disp.discardStage();
    if (disp.editingShared) disp.cancelEditShared();
    onPreview?.(null);
    onClose();
  };

  const dragTeam = useDragReorder((from, to) => setDTeam((t) => moveItem(t, from, to)), { group: "qv-team" });
  const dragMine = useDragReorder((from, to) => setDMine((m) => ({ ...m, views: moveItem(m.views, from, to) })), { group: "qv-mine" });
  const rowCls = (on: boolean) => `flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[13px] ${on ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`;
  const pill = (on: boolean) => `h-7 rounded-full border px-3 text-xs ${on ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  const userName = useMemo(() => new Map((users ?? []).map((u) => [u.id, u.name])), [users]);
  const dirtyParts = [teamDirty && "มุมมองทีม (ทุกคนเห็นหลังบันทึก)", mineDirty && "มุมมองของฉัน", disp.stageDirty && "หน้าตา", disp.editingShared && "ชุดกลาง"].filter(Boolean);

  const viewsBody = (
    <div className="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-[11px] font-medium text-slate-500">👥 มุมมองของทีม {isAdmin ? "(ลาก ⠿ เรียง)" : "(แอดมินตั้ง)"}</div>
          <div className="space-y-1">
            {dTeam.map((v, i) => {
              const hid = dMine.hidden.includes(v.id);
              return (
                <div key={v.id} {...(isAdmin ? dragTeam.rowProps(i) : {})} onClick={() => setSel({ kind: "team", id: v.id })}
                  className={`${rowCls(sel?.kind === "team" && sel.id === v.id)} ${isAdmin ? dragTeam.rowCls(i) : ""}`}>
                  {isAdmin && <DragHandle {...dragTeam.handleProps(i)} />}
                  <button type="button" onClick={(e) => { e.stopPropagation(); toggleHidden(v.id); }} title={hid ? "ซ่อนอยู่ (เฉพาะฉัน) — กดเพื่อโชว์" : "กดเพื่อซ่อนปุ่มนี้ (เฉพาะฉัน)"}
                    className={`shrink-0 text-sm ${hid ? "opacity-30" : ""}`}>👁</button>
                  <span className="shrink-0">{v.icon}</span>
                  <span className={`min-w-0 flex-1 truncate ${hid ? "text-slate-400 line-through" : "text-slate-800"}`}>{v.name}</span>
                  {countOf && <span className="shrink-0 tabular-nums text-[11px] text-slate-400" title="จำนวนใบที่ตรงมุมมองนี้ตอนนี้">{countOf(v)}</span>}
                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500" title="ใครเห็นปุ่มนี้">{audText(v)}</span>
                </div>
              );
            })}
          </div>
          {isAdmin && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button type="button" onClick={addTeam} className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">＋ มุมมองทีม</button>
              <button type="button" onClick={() => setDTeam(JSON.parse(JSON.stringify(QV_DEFAULT_TEAM)))} className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-500 hover:bg-slate-50" title="คืนมุมมองทีมตั้งต้นทั้งหมด (ยังไม่บันทึกจนกด 💾)">คืนค่าตั้งต้น</button>
            </div>
          )}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-medium text-slate-500">👤 มุมมองของฉัน (เห็นคนเดียว · ลาก ⠿ เรียง)</div>
          <div className="space-y-1">
            {dMine.views.length === 0 && <p className="text-[11px] text-slate-400">ยังไม่มี — กด ＋ หรือ &quot;ทำสำเนาเป็นของฉัน&quot; จากมุมมองทีม</p>}
            {dMine.views.map((v, i) => (
              <div key={v.id} {...dragMine.rowProps(i)} onClick={() => setSel({ kind: "mine", id: v.id })}
                className={`${rowCls(sel?.kind === "mine" && sel.id === v.id)} ${dragMine.rowCls(i)}`}>
                <DragHandle {...dragMine.handleProps(i)} />
                <span className="shrink-0">{v.icon}</span>
                <span className="min-w-0 flex-1 truncate text-slate-800">{v.name}</span>
                {countOf && <span className="shrink-0 tabular-nums text-[11px] text-slate-400" title="จำนวนใบที่ตรงมุมมองนี้ตอนนี้">{countOf(v)}</span>}
                <span className="shrink-0 text-[10px] text-slate-400">{v.layout === "cards" ? "การ์ด" : "ตาราง"}</span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button type="button" onClick={addMine} className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">＋ มุมมองของฉัน</button>
            <button ref={tplAnchor} type="button" onClick={() => { setTplOpen((o) => !o); setTplBrand(null); }}
              className="h-7 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs text-blue-700 hover:bg-blue-100">＋ จากแม่แบบ ▾</button>
          </div>
          <FloatingDropdown anchorRef={tplAnchor} open={tplOpen} onClose={() => { setTplOpen(false); setTplBrand(null); }} minWidth={240}>
            <div className="max-h-[var(--fd-max-h)] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
              {tplBrand ? <>
                <button type="button" onClick={() => setTplBrand(null)} className="w-full px-3 py-1.5 text-left text-[12px] text-slate-500 hover:bg-slate-50">‹ {tplBrand.name} — เลือกแบรนด์</button>
                {brands.map((b) => (
                  <button key={b.name || "__none__"} type="button" onClick={() => addFromTemplate(tplBrand, b.name || "__none__")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color || "#94a3b8" }} />{b.name || "ไม่ระบุแบรนด์"}<span className="ml-auto text-[11px] text-slate-400">{b.n}</span>
                  </button>
                ))}
              </> : <>
                <div className="px-3 pb-1 text-[11px] text-slate-400">สร้างมุมมองของฉันจากแม่แบบ (แก้ต่อได้)</div>
                {QV_TEMPLATES.map((t) => (
                  <button key={t.key} type="button" onClick={() => (t.brand ? setTplBrand(t) : addFromTemplate(t))} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50">
                    <span>{t.icon}</span>{t.name}{t.brand && <span className="ml-auto text-slate-400">›</span>}
                  </button>
                ))}
              </>}
            </div>
          </FloatingDropdown>
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        {!cur ? <p className="text-sm text-slate-400">เลือกมุมมองทางซ้าย</p> : <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${sel?.kind === "team" ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"}`}>{sel?.kind === "team" ? "👥 มุมมองของทีม" : "👤 มุมมองของฉัน"}</span>
            <span className="text-[11px] text-slate-400">ตารางด้านหลังโชว์มุมมองนี้อยู่</span>
            <span className="ml-auto flex flex-wrap gap-1.5">
              {sel?.kind === "team" && <button type="button" onClick={copyToMine} className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">ทำสำเนาเป็นของฉัน</button>}
              {sel?.kind === "mine" && isAdmin && <button type="button" onClick={shareToTeam} className="h-7 rounded-md border border-violet-200 bg-white px-2.5 text-xs text-violet-700 hover:bg-violet-50" title="ย้ายเป็นมุมมองของทีม (แล้วตั้งว่าใครเห็นได้)">แชร์เป็นมุมมองทีม</button>}
              {canEditCur && <button type="button" onClick={delCur} className="h-7 rounded-md border border-rose-200 bg-white px-2.5 text-xs text-rose-600 hover:bg-rose-50">ลบ</button>}
            </span>
          </div>
          {sel?.kind === "team" && !isAdmin && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">มุมมองของทีม — แอดมินเป็นคนตั้ง · คุณกด 👁 ซ่อนปุ่มนี้สำหรับตัวเองได้ หรือ &quot;ทำสำเนาเป็นของฉัน&quot; เพื่อปรับเอง</p>}

          {countOf && (
            <div className="rounded-md bg-blue-50 px-2.5 py-1.5 text-[13px] text-blue-800">
              🔎 มุมมองนี้เจอ <b className="tabular-nums">{countOf(cur)}</b> ใบ{total != null ? <> จาก <span className="tabular-nums">{total}</span></> : null}
              <span className="ml-1 text-[11px] text-blue-600/80">(นับสดตามที่แก้ · ยังไม่รวมแบรนด์ที่กดชิปบนแถบ)</span>
            </div>
          )}
          {/* แท็บย่อย — ฟอร์มยาวแบ่งเป็นช่วง ไม่ต้องเลื่อนหา */}
          <div className="flex flex-wrap gap-1">
            {VS_SUBS.filter(([k]) => k !== "aud" || audOk).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setSub(k)} className={pill(subShown === k)}>{l}</button>
            ))}
          </div>

          {subShown === "aud" && curTeam ? (
            <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-2.5">
              <div className="mb-1.5 text-[12px] font-medium text-slate-700">👁 ใครเห็นปุ่มนี้</div>
              <div className="flex flex-wrap gap-1">
                {([["all", "ทุกคน"], ["roles", "เฉพาะตำแหน่ง"], ["users", "เฉพาะคน"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => patchCur({ aud: k })} className={pill(curTeam.aud === k)}>{l}</button>
                ))}
              </div>
              {curTeam.aud === "roles" && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {ROLES.map((r) => <button key={r} type="button" onClick={() => patchCur({ roles: curTeam.roles.includes(r) ? curTeam.roles.filter((x) => x !== r) : [...curTeam.roles, r] })} className={pill(curTeam.roles.includes(r))}>{roleLabel(r)}</button>)}
                </div>
              )}
              {curTeam.aud === "users" && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {users === null ? <span className="text-[11px] text-slate-400">กำลังโหลดรายชื่อ…</span>
                    : users.map((u) => <button key={u.id} type="button" onClick={() => patchCur({ users: curTeam.users.includes(u.id) ? curTeam.users.filter((x) => x !== u.id) : [...curTeam.users, u.id] })} className={pill(curTeam.users.includes(u.id))}>{u.name}{u.role ? <span className="ml-1 text-slate-400">· {roleLabel(u.role)}</span> : null}</button>)}
                  {curTeam.users.filter((id) => users && !userName.has(id)).length > 0 && <span className="text-[11px] text-slate-400">+ {curTeam.users.filter((id) => !userName.has(id)).length} คนที่ปิดบัญชีแล้ว</span>}
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-slate-500">คนที่เห็นยังกด 👁 ซ่อนปุ่มนี้สำหรับตัวเองได้ (ไม่กระทบคนอื่น) · ใช้จัดหน้าตาเท่านั้น ไม่ใช่การกันสิทธิ์</p>
            </div>
          ) : (
            <QuickViewForm view={cur} onChange={patchCur} isAdmin={isAdmin} brands={brands} colOptions={colOptions} defaultCols={defaultCols}
              readOnly={!canEditCur} section={subShown === "aud" ? "filter" : subShown} />
          )}
        </>}
      </div>
    </div>
  );

  return (
    <ERPModal open={open} onClose={close} size="xl" storageKey="wb-view-settings" defaultExpanded={false} backdrop="light" hasUnsavedChanges={dirty}
      title="⚙️ ตั้งค่ามุมมอง" description="ปรับแล้วตารางด้านหลังเปลี่ยนทันที · กด 💾 บันทึก ถึงจะเก็บ · ลากหัวป๊อปย้ายไปดูตารางได้"
      footer={<>
        <span className={`mr-auto text-[12px] ${dirty ? "text-amber-700" : "text-slate-500"}`}>
          {dirty ? `✏️ ยังไม่บันทึก: ${dirtyParts.join(" · ")}` : savedAt ? `✓ บันทึกแล้ว ${savedAt}` : "ไม่มีที่แก้"}
        </span>
        <button type="button" onClick={cancelEdits} disabled={!dirty || busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 disabled:opacity-40">ยกเลิกที่แก้</button>
        <button type="button" onClick={() => void save()} disabled={!dirty || busy} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "กำลังบันทึก…" : "💾 บันทึก"}</button>
      </>}>
      {/* แท็บหลัก — ติดบนเวลาเลื่อนในป๊อป */}
      <div className="sticky -top-5 z-10 -mx-6 -mt-5 mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-6 pt-3">
        {VS_TABS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 pb-2 pt-1 text-sm ${tab === k ? "border-blue-600 font-medium text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</button>
        ))}
      </div>
      {tab === "views" ? viewsBody
        : <DisplaySettings d={disp} isAdmin={isAdmin} colOptions={colOptions} currentCols={currentCols} cardGroups={cardGroups} tab={tab} />}
    </ERPModal>
  );
}
