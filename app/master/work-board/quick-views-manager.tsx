"use client";

/**
 * ป๊อป ⚙️ จัดการมุมมองด่วน — แก้ในร่าง กด 💾 บันทึก ถึงจะเก็บจริง (ปิดตอนยังไม่บันทึก = ERPModal ถามก่อน)
 *   👥 มุมมองของทีม: แอดมินแก้ได้ + ตั้ง "ใครเห็นปุ่มนี้" (ทุกคน / เฉพาะตำแหน่ง / เฉพาะคน) · คนอื่นดูได้ + ซ่อนสำหรับตัวเอง + ทำสำเนาเป็นของฉัน
 *   👤 มุมมองของฉัน: ใครก็สร้าง/แก้/ลบได้ เห็นคนเดียว
 * ที่เก็บ = ./use-quick-views · ฟอร์ม 1 มุมมอง = ./quick-views-editor
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { roleLabel } from "@/components/auth";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { QuickViewForm, type QvBrand } from "./quick-views-editor";
import { QV_DEFAULT_TEAM, qvNew, type QuickView, type QvMine, type TeamView } from "./quick-views";

type Sel = { kind: "team" | "mine"; id: string };
type UserLite = { id: string; name: string; role: string | null };
const ROLES = ["admin", "manager", "staff"];
const copyView = (v: QuickView, p: Partial<QuickView> = {}): QuickView => ({
  ...JSON.parse(JSON.stringify(v)) as QuickView, ...qvNew(), ...stripId(v), ...p,
});
function stripId(v: QuickView): Omit<QuickView, "id"> { const { id: _id, ...rest } = JSON.parse(JSON.stringify(v)) as QuickView; void _id; return rest; }
const audText = (v: TeamView) => (v.aud === "all" ? "ทุกคน" : v.aud === "roles" ? (v.roles.length ? v.roles.map(roleLabel).join(", ") : "ยังไม่เลือก") : `${v.users.length} คน`);

export function QuickViewsManager({ open, onClose, isAdmin, team, mine, onSave, brands, colOptions, defaultCols, focus, newMine }: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  team: TeamView[];
  mine: QvMine;
  onSave: (next: { team?: TeamView[]; mine?: QvMine }) => Promise<boolean>;
  brands: QvBrand[];
  colOptions: [string, string][];
  defaultCols?: string[];           // คอลัมน์ที่ตารางปกติโชว์อยู่ (ตั้งต้นตอนมุมมองกำหนดคอลัมน์เอง)
  focus?: Sel | null;               // เปิดมาที่มุมมองนี้
  newMine?: QuickView | null;       // มาจาก "＋ บันทึกเป็นมุมมอง" — เพิ่มเป็นของฉันในร่าง (ยังไม่บันทึก)
}) {
  const [dTeam, setDTeam] = useState<TeamView[]>(team);
  const [dMine, setDMine] = useState<QvMine>(mine);
  const [sel, setSel] = useState<Sel | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [users, setUsers] = useState<UserLite[] | null>(null);
  // เปิดป๊อป = เริ่มร่างใหม่จากค่าที่บันทึกไว้
  useEffect(() => {
    if (!open) return;
    const m: QvMine = JSON.parse(JSON.stringify(mine));
    if (newMine) m.views = [...m.views, newMine];
    setDTeam(JSON.parse(JSON.stringify(team)));
    setDMine(m);
    setSel(newMine ? { kind: "mine", id: newMine.id } : focus ?? (team[0] ? { kind: "team", id: team[0].id } : null));
    setSavedAt(null);
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  const teamDirty = JSON.stringify(dTeam) !== JSON.stringify(team);
  const mineDirty = JSON.stringify(dMine) !== JSON.stringify(mine);
  const dirty = teamDirty || mineDirty;
  const cur: QuickView | TeamView | undefined = sel?.kind === "team" ? dTeam.find((v) => v.id === sel.id) : dMine.views.find((v) => v.id === sel?.id);
  const curTeam = sel?.kind === "team" ? (cur as TeamView | undefined) : undefined;
  const canEditCur = sel?.kind === "mine" || isAdmin;

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
  const save = async () => {
    setBusy(true);
    const ok = await onSave({ team: teamDirty ? dTeam : undefined, mine: mineDirty ? dMine : undefined });
    setBusy(false);
    if (ok) { const d = new Date(); setSavedAt(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`); }
  };
  const cancelEdits = () => { setDTeam(JSON.parse(JSON.stringify(team))); setDMine(JSON.parse(JSON.stringify(mine))); };

  const dragTeam = useDragReorder((from, to) => setDTeam((t) => moveItem(t, from, to)), { group: "qv-team" });
  const dragMine = useDragReorder((from, to) => setDMine((m) => ({ ...m, views: moveItem(m.views, from, to) })), { group: "qv-mine" });
  const rowCls = (on: boolean) => `flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[13px] ${on ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`;
  const pill = (on: boolean) => `h-7 rounded-full border px-3 text-xs ${on ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  const userName = useMemo(() => new Map((users ?? []).map((u) => [u.id, u.name])), [users]);

  return (
    <ERPModal open={open} onClose={onClose} size="xl" storageKey="wb-quick-views" defaultExpanded={false} hasUnsavedChanges={dirty}
      title="⚙️ จัดการมุมมองด่วน" description="ปุ่มบนแถบแท็บรอจ่าย — แก้แล้วกด 💾 บันทึก ถึงจะเก็บจริง"
      footer={<>
        <span className={`mr-auto text-[12px] ${dirty ? "text-amber-700" : "text-slate-500"}`}>
          {dirty ? `✏️ มีที่แก้ยังไม่บันทึก${teamDirty ? " · มุมมองทีม (ทุกคนเห็นหลังบันทึก)" : ""}${mineDirty ? " · มุมมองของฉัน" : ""}` : savedAt ? `✓ บันทึกแล้ว ${savedAt}` : "ไม่มีที่แก้"}
        </span>
        <button type="button" onClick={cancelEdits} disabled={!dirty || busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 disabled:opacity-40">ยกเลิกที่แก้</button>
        <button type="button" onClick={() => void save()} disabled={!dirty || busy} className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "กำลังบันทึก…" : "💾 บันทึก"}</button>
      </>}>
      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span>👥 มุมมองของทีม {isAdmin ? "(ลาก ⠿ เรียง)" : "(แอดมินตั้ง)"}</span>
            </div>
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
              {dMine.views.length === 0 && <p className="text-[11px] text-slate-400">ยังไม่มี — กด ＋ หรือ "ทำสำเนาเป็นของฉัน" จากมุมมองทีม</p>}
              {dMine.views.map((v, i) => (
                <div key={v.id} {...dragMine.rowProps(i)} onClick={() => setSel({ kind: "mine", id: v.id })}
                  className={`${rowCls(sel?.kind === "mine" && sel.id === v.id)} ${dragMine.rowCls(i)}`}>
                  <DragHandle {...dragMine.handleProps(i)} />
                  <span className="shrink-0">{v.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{v.name}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{v.layout === "cards" ? "การ์ด" : "ตาราง"}</span>
                </div>
              ))}
            </div>
            <button type="button" onClick={addMine} className="mt-1.5 h-7 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">＋ มุมมองของฉัน</button>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          {!cur ? <p className="text-sm text-slate-400">เลือกมุมมองทางซ้าย</p> : <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${sel?.kind === "team" ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"}`}>{sel?.kind === "team" ? "👥 มุมมองของทีม" : "👤 มุมมองของฉัน"}</span>
              <span className="ml-auto flex flex-wrap gap-1.5">
                {sel?.kind === "team" && <button type="button" onClick={copyToMine} className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">ทำสำเนาเป็นของฉัน</button>}
                {sel?.kind === "mine" && isAdmin && <button type="button" onClick={shareToTeam} className="h-7 rounded-md border border-violet-200 bg-white px-2.5 text-xs text-violet-700 hover:bg-violet-50" title="ย้ายเป็นมุมมองของทีม (แล้วตั้งว่าใครเห็นได้)">แชร์เป็นมุมมองทีม</button>}
                {canEditCur && <button type="button" onClick={delCur} className="h-7 rounded-md border border-rose-200 bg-white px-2.5 text-xs text-rose-600 hover:bg-rose-50">ลบ</button>}
              </span>
            </div>
            {sel?.kind === "team" && !isAdmin && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">มุมมองของทีม — แอดมินเป็นคนตั้ง · คุณกด 👁 ซ่อนปุ่มนี้สำหรับตัวเองได้ หรือ &quot;ทำสำเนาเป็นของฉัน&quot; เพื่อปรับเอง</p>}

            {curTeam && isAdmin && (
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
            )}

            <QuickViewForm view={cur} onChange={patchCur} isAdmin={isAdmin} brands={brands} colOptions={colOptions} defaultCols={defaultCols} readOnly={!canEditCur} />
          </>}
        </div>
      </div>
    </ERPModal>
  );
}
