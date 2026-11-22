"use client";

// ============================================================
// Creative Task Manager — ตั้งค่า: สิทธิ์ + ตัวเลือกที่จัดการได้ (ประเภทงาน/แพลตฟอร์ม)
// สิทธิ์: เชื่อม /api/admin/roles (ของกลาง). ตัวเลือก: /api/creative-options
// ทุกอย่าง admin-only
// ============================================================

import { useCallback, useEffect, useState, useRef } from "react";
import { StandaloneShell } from "@/components/standalone-shell";
import { useAuth } from "@/components/auth";
import { TASKS_SETTINGS_PERM } from "@/lib/creative-perms";
import { apiFetch } from "@/lib/api";
import { listOptions, createOption, updateOption, deleteOption, type Option } from "../use-options";
import { ColorInput } from "@/components/color-picker";
import { r2ImageUrl } from "@/lib/r2-image";
import { loadMySubView, saveMySubView, DEFAULT_MYSUB_VIEW, type MySubView } from "../my-subtasks-view";
import { getParentSkuFieldOptions, getSubmitRequiredFields, saveSubmitRequiredFields, listTeams, createTeam, updateTeam, deleteTeam, type Team } from "../data";
import { SubtaskTypeManager } from "../subtask-type-manager";
import { LineSettings } from "../line-settings";
import { DriveFolderSettings } from "../drive-folder-settings";
import { BrandDriveFolders } from "../brand-drive-folders";
import { MultiUserPicker } from "../multi-user-picker";
import type { UserPickerValue } from "@/components/pickers";
import { useT } from "@/components/i18n";
import { MenuPermissionMatrix } from "@/components/menu-permissions";
import { CaptionPromptsManager } from "./caption-prompts";
import { ProductModeManager } from "../product-mode-settings";
import { ReadinessRulesManager } from "../readiness-settings";
import { BoardSectionTemplatesManager } from "../board-section-templates-settings";
import { StatusWorkflowManager } from "../status-workflow-settings";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { askConfirm } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { EmptyState, LoadingState } from "@/components/state-views";
import { SettingsNavLayout, type SettingsNavGroup } from "@/components/settings-nav";
import dynamic from "next/dynamic";
import { Icon } from "@/components/icon";

// ประวัติไฟล์ = ตัวเดียวกับมุมมอง "ประวัติไฟล์" ใน Task Manager (โหลดเมื่อเปิดแท็บ — ไม่ถ่วงหน้าตั้งค่า) · เจ้าของขอ 2026-11-12 ให้หาง่ายจากปุ่มตั้งค่า
const FileHistoryView = dynamic(() => import("../file-history-view").then((m) => m.FileHistoryView), { ssr: false, loading: () => <LoadingState /> });

type Tab = "perm" | "task_type" | "platform" | "campaign_category" | "subtype" | "status" | "transition" | "team" | "mysub" | "submit" | "readiness" | "board_sections" | "line" | "drive" | "brand_drive" | "ai_prompt" | "file_history";
const ALL_TABS: Tab[] = ["perm", "task_type", "platform", "campaign_category", "subtype", "status", "transition", "team", "mysub", "submit", "readiness", "board_sections", "line", "drive", "brand_drive", "ai_prompt", "file_history"];

export default function TaskSettingsPage() {
  const t = useT();
  const { can } = useAuth();
  // เข้าหน้าตั้งค่าได้ตามสิทธิ์ "ตั้งค่าแอปจัดการงาน" (หัวหน้า + แอดมิน · ติ๊กเพิ่มรายคนได้) — ตรงกับที่ server ตรวจ (เดิมเช็กตำแหน่ง admin ตรง ๆ)
  const canSettings = can(TASKS_SETTINGS_PERM as Parameters<typeof can>[0]);
  // แท็บ 🔑 สิทธิ์ = แก้ตารางสิทธิ์ของทุกตำแหน่ง → เฉพาะผู้มีสิทธิ์จัดการตำแหน่ง (server ตรวจ admin.roles อีกชั้น)
  const canPermTab = can("admin.roles" as Parameters<typeof can>[0]);
  const [tabRaw, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "perm";
    const q = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    return q && ALL_TABS.includes(q) ? q : "perm";
  });
  // ไม่มีสิทธิ์แท็บสิทธิ์ → เริ่มที่แท็บประเภทงานแทน
  const tab: Tab = tabRaw === "perm" && !canPermTab ? "task_type" : tabRaw;
  const toast = useToast();
  const showToast = useCallback((m: string) => toast.info(m), [toast]);   // แจ้งผ่าน toast กลาง (components/toast)
  // เลือกเมนู → จำใน URL (?tab=) รีเฟรช/ส่งลิงก์แล้วเปิดหัวข้อเดิม
  const selectTab = useCallback((k: Tab) => {
    setTab(k);
    try { const u = new URL(window.location.href); u.searchParams.set("tab", k); window.history.replaceState(null, "", u.toString()); } catch { /* ignore */ }
  }, []);
  // เมนูตั้งค่าจัดหมวด (ของกลาง SettingsNavLayout) — เจ้าของขอ 2026-10-26: เดิม 14 ปุ่มเรียงแถวเดียวดูยาก
  const navGroups: SettingsNavGroup<Tab>[] = [
    { label: t("ผู้ใช้และสิทธิ์", "Users and access"), items: [
      { key: "perm", icon: <Icon value="i:key" />, label: t("สิทธิ์", "Permissions"), desc: t("ใครทำอะไรได้ ต่อตำแหน่ง/รายคน", "Who can do what, by role or person"), hidden: !canPermTab },
      { key: "team", icon: <Icon value="i:users" />, label: t("ทีม", "Teams"), desc: t("คนในแต่ละทีม", "People in each team") },
    ] },
    { label: t("ตัวเลือกในฟอร์มงาน", "Task form options"), items: [
      { key: "task_type", icon: <Icon value="i:tag" />, label: t("ประเภทงาน", "Task types"), desc: t("ตัวเลือกประเภทตอนสร้างงาน", "Type choices when creating a task") },
      { key: "platform", icon: <Icon value="i:device-mobile" />, label: t("แพลตฟอร์ม", "Platforms"), desc: t("ช่องทางที่ลงงาน", "Channels a task is for") },
      { key: "campaign_category", icon: <Icon value="i:folder" />, label: t("หมวดแคมเปญ", "Campaign categories"), desc: t("จัดกลุ่มแคมเปญ", "Group campaigns") },
      { key: "subtype", icon: <Icon value="i:puzzle" />, label: t("ชนิดงานย่อย", "Subtask types"), desc: t("งานย่อยที่เพิ่มในงานได้", "Subtasks you can add to a task") },
    ] },
    { label: t("ขั้นตอนงาน", "Workflow"), items: [
      { key: "status", icon: <Icon value="i:route" />, label: t("สถานะ + เส้นทาง", "Statuses + transitions"), desc: t("ชื่อ สี % ทางไปต่อ และเงื่อนไขก่อนเข้าแต่ละสถานะ", "Names, colors, %, next steps and entry rules per status") },
      { key: "submit", icon: <Icon value="i:package-export" />, label: t("ส่งงาน", "Submitting work"), desc: t("ต้องกรอก/แนบอะไรก่อนส่งงาน", "What must be filled in before submitting") },
      { key: "readiness", icon: <Icon value="i:circle-check" />, label: t("ความพร้อมสินค้า", "Product readiness"), desc: t("เช็กอะไรบ้างใต้ความคืบหน้าในลิ้นชักงาน", "What the task drawer checks under progress") },
      { key: "board_sections", icon: <Icon value="i:wall" />, label: t("เทมเพลตโซนกระดาน", "Board section templates"), desc: t("ชุดโซน bento ของกระดานบรีฟ/แคมเปญ", "Bento zone sets for brief/campaign boards") },
    ] },
    { label: t("การแสดงผล", "Display"), items: [
      { key: "mysub", icon: <Icon value="i:puzzle" />, label: t("งานย่อยของฉัน", "My subtasks"), desc: t("จัดกลุ่ม/เรียงรายการงานย่อยของทุกคน", "Grouping and sorting of everyone's subtask list") },
    ] },
    { label: t("เชื่อมต่อและอัตโนมัติ", "Connections and automation"), items: [
      { key: "line", icon: <Icon value="i:bell" />, label: "LINE", desc: t("แจ้งเตือนงานเข้ากลุ่ม LINE", "Task alerts to a LINE group") },
      { key: "drive", icon: <Icon value="i:folders" />, label: t("โฟลเดอร์ปก", "Cover folder"), desc: t("ที่เก็บรูปปกใน Google Drive", "Where cover images live in Google Drive") },
      { key: "brand_drive", icon: <Icon value="i:tag" />, label: t("โฟลเดอร์ต่อแบรนด์", "Brand folders"), desc: t("Drive แยกตามแบรนด์", "Drive folders per brand") },
      { key: "ai_prompt", icon: <Icon value="i:sparkles" />, label: t("Prompt แคปชั่น AI", "AI caption prompt"), desc: t("คำสั่งให้ AI เขียนแคปชั่น", "Instructions for AI-written captions") },
    ] },
    { label: t("ประวัติ", "History"), items: [
      { key: "file_history", icon: <Icon value="i:folder-open" />, label: t("ประวัติไฟล์", "File history"), desc: t("ตัวแยกไฟล์ลงรูป / ย้ายโฟลเดอร์อะไรไปแล้วบ้าง", "What the file sorter uploaded or moved") },
    ] },
  ];

  return (
    <StandaloneShell title={t("ตั้งค่างาน Creative", "Creative Task Settings")} icon="i:settings" accent="violet">
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("ตั้งค่า", "Settings")}</h1>
            <p className="text-slate-500 mt-1">{t("ตั้งค่าระบบงาน Creative ของทั้งทีม — เลือกหัวข้อจากเมนูด้านซ้าย", "Team-wide settings for Creative tasks — pick a section from the menu")}</p>
          </div>
          <a href="/tasks" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0">← {t("กลับไปงาน", "Back to Tasks")}</a>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-6">
        {!canSettings ? (
          <EmptyState icon={<Icon value="i:lock" />} title={t("หน้านี้สำหรับหัวหน้า / ผู้ดูแลระบบ (สิทธิ์ตั้งค่าแอปจัดการงาน)", "This page needs the task-app settings permission (managers / admins).")} />
        ) : (
        <SettingsNavLayout groups={navGroups} active={tab} onSelect={selectTab}>
        {tab === "perm" ? <MenuPermissionMatrix appKey="tasks" />
          : tab === "status" || tab === "transition" ? <StatusWorkflowManager />
          : tab === "team" ? <TeamManager showToast={showToast} />
          : tab === "mysub" ? <MySubViewManager showToast={showToast} />
          : tab === "ai_prompt" ? <CaptionPromptsManager showToast={showToast} />
          : tab === "submit" ? <><ProductModeManager showToast={showToast} /><SubmitRequiredManager showToast={showToast} /></>
          : tab === "readiness" ? <ReadinessRulesManager showToast={showToast} />
          : tab === "board_sections" ? <BoardSectionTemplatesManager showToast={showToast} />
          : tab === "subtype" ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-3xl mx-auto">
              <div className="px-5 py-4 border-b border-slate-100"><h2 className="font-semibold text-slate-800"><Icon value="i:puzzle" className="mr-1" />{t("ชนิดงานย่อย", "Subtask types")}</h2></div>
              <div className="p-5"><SubtaskTypeManager showToast={showToast} /></div>
            </div>
          )
          : tab === "line" ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-3xl mx-auto">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800"><Icon value="i:bell" className="mr-1" />{t("แจ้งเตือนงานเข้า LINE", "LINE task notifications")}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{t("เตือนเมื่อมีงานใหม่ + งานย่อยส่งมารอตรวจ (ส่งเข้ากลุ่ม LINE) · เป็นการตั้งค่าของทั้งทีม", "Alerts on new tasks + review submissions (to a LINE group) · team-wide setting")}</p>
              </div>
              <div className="p-5"><LineSettings /></div>
            </div>
          )
          : tab === "drive" ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-3xl mx-auto">
              <div className="p-5"><DriveFolderSettings /></div>
            </div>
          )
          : tab === "brand_drive" ? <BrandDriveFolders />
          : tab === "file_history" ? <FileHistoryView />
          : <OptionsManager kind={tab} title={tab === "task_type" ? t("ประเภทงาน", "Task Types") : tab === "campaign_category" ? t("หมวดแคมเปญ", "Campaign categories") : t("แพลตฟอร์ม", "Platforms")} showToast={showToast} />}
        </SettingsNavLayout>
        )}
      </div>

    </StandaloneShell>
  );
}

// ============================================================
// แท็บจัดการตัวเลือก (ประเภทงาน / แพลตฟอร์ม)
// ============================================================
// จัดกลุ่ม/เรียง "งานย่อยของฉัน" (admin ตั้งกลาง ใช้กับทุกคน)
function MySubViewManager({ showToast }: { showToast: (m: string) => void }) {
  const t = useT();
  const [v, setV] = useState<MySubView>(DEFAULT_MYSUB_VIEW);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { loadMySubView().then((x) => { setV(x); setLoading(false); }).catch(() => setLoading(false)); }, []);
  const save = async () => { setSaving(true); try { await saveMySubView(v); showToast(t("บันทึกแล้ว — ใช้กับทุกคน", "Saved — applies to everyone")); } catch (e) { showToast((e as Error).message); } finally { setSaving(false); } };
  const SORTS = [["priority", t("ความสำคัญ", "Priority")], ["deadline", t("กำหนดส่ง", "Deadline")], ["status", t("สถานะ", "Status")], ["none", t("ไม่เรียง", "None")]] as const;
  if (loading) return <div className="py-10 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>;
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 max-w-xl mx-auto space-y-4">
      <div>
        <h2 className="font-semibold text-slate-800"><Icon value="i:puzzle" className="mr-1" />{t("งานย่อยของฉัน", "My subtasks")}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{t('ตั้งครั้งเดียว ใช้กับทุกคน — จัดกลุ่ม + เรียงในรายการ "งานย่อยของฉัน" (คิวงาน + ภาพรวม)', 'Set once for everyone — grouping + sorting of the "My subtasks" list (queue + overview)')}</p>
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-500 mb-1">{t("จัดกลุ่ม", "Group by")}</div>
        <div className="flex gap-2">
          {([["none", t("ไม่จัดกลุ่ม", "None")], ["status", t("ตามสถานะ (กำลังทำบนสุด)", "By status (in-progress first)")]] as const).map(([g, lbl]) => (
            <button key={g} onClick={() => setV({ ...v, groupBy: g })} className={`h-8 px-3 text-sm rounded-lg border ${v.groupBy === g ? "bg-violet-50 border-violet-300 text-violet-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{lbl}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><div className="text-xs font-semibold text-slate-500 mb-1">{t("เรียงลำดับ 1", "Sort 1")}</div>
          <select value={v.sort1} onChange={(e) => setV({ ...v, sort1: e.target.value as MySubView["sort1"] })} className="h-9 w-full border border-slate-200 rounded-lg px-2 text-sm">{SORTS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}</select></div>
        <div><div className="text-xs font-semibold text-slate-500 mb-1">{t("เรียงลำดับ 2", "Sort 2")}</div>
          <select value={v.sort2} onChange={(e) => setV({ ...v, sort2: e.target.value as MySubView["sort2"] })} className="h-9 w-full border border-slate-200 rounded-lg px-2 text-sm">{SORTS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}</select></div>
      </div>
      <div className="flex justify-end"><button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button></div>
    </div>
  );
}

function OptionsManager({ kind, title, showToast }: { kind: string; title: string; showToast: (m: string) => void }) {
  const t = useT();
  const [opts, setOpts] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setLoading(true); try { setOpts(await listOptions(kind)); } catch (e) { showToast((e as Error).message); } finally { setLoading(false); } }, [kind, showToast]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const l = newLabel.trim(); if (!l) return;
    setBusy(true);
    try { await createOption(kind, l); setNewLabel(""); await load(); showToast(t("เพิ่มแล้ว", "Added")); }
    catch (e) { showToast((e as Error).message); } finally { setBusy(false); }
  };
  // ร่างแก้ไขต่อแถว (ชื่อ/สี/ไอคอน) — ไม่ autosave, กดปุ่ม 💾 ค่อยบันทึก (กันสีกระพริบ/ยิง API รัวตอนเลื่อนเลือกสี)
  const [draft, setDraft] = useState<Record<string, Partial<Option>>>({});
  const setField = (o: Option, patch: Partial<Option>) => setDraft((d) => ({ ...d, [o.id]: { ...d[o.id], ...patch } }));
  const clearDraft = (id: string) => setDraft((d) => { const n = { ...d }; delete n[id]; return n; });
  const isDirty = (o: Option) => {
    const d = draft[o.id]; if (!d) return false;
    return (("label" in d) && (d.label ?? "").trim() !== (o.label ?? ""))
      || (("color" in d) && (d.color ?? "") !== (o.color ?? ""))
      || (("icon" in d) && (d.icon ?? "").trim() !== (o.icon ?? ""));
  };
  const saveRow = async (o: Option) => {
    const d = draft[o.id]; if (!d) return;
    const patch: Record<string, unknown> = {};
    if ("label" in d) { const l = (d.label ?? "").trim(); if (!l) { showToast(t("ชื่อห้ามว่าง", "Name is required")); return; } patch.label = l; }
    if ("color" in d) patch.color = d.color || null;
    if ("icon" in d) patch.icon = (d.icon ?? "").trim() || null;
    if (Object.keys(patch).length === 0) { clearDraft(o.id); return; }
    try { await updateOption(o.id, patch); setOpts((p) => p.map((x) => x.id === o.id ? { ...x, ...patch } : x)); clearDraft(o.id); showToast(t("บันทึกแล้ว", "Saved")); }
    catch (e) { showToast((e as Error).message); }
  };
  // แก้รูปไอคอน (บันทึกทันที — เป็นการคลิกครั้งเดียว ไม่มีปัญหา delay)
  const patchMeta = async (o: Option, patch: Partial<Option>) => { setOpts((p) => p.map((x) => x.id === o.id ? { ...x, ...patch } : x)); try { await updateOption(o.id, patch as Record<string, unknown>); showToast(t("บันทึกแล้ว", "Saved")); } catch (e) { showToast((e as Error).message); } };
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const uploadIcon = async (o: Option, file: File) => {
    setUploadingId(o.id);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "platform-icons");
      const j = await apiFetch("/api/admin/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (j.error || !j.r2_key) throw new Error(j.error || t("อัปโหลดไม่สำเร็จ", "Upload failed"));
      await patchMeta(o, { icon_key: j.r2_key });
    } catch (e) { showToast((e as Error).message); } finally { setUploadingId(null); }
  };
  const remove = async (o: Option) => { if (!(await askConfirm({ title: `${t("ลบ", "Delete")} "${o.label}" ?`, variant: "danger" }))) return; try { await deleteOption(o.id); await load(); showToast(t("ลบแล้ว", "Deleted")); } catch (e) { showToast((e as Error).message); } };
  // ลากจัดลำดับ (ของกลาง) — เขียน sort_order = ตำแหน่งใหม่ เฉพาะแถวที่เปลี่ยน
  const reorder = async (from: number, to: number) => {
    const next = moveItem(opts, from, to);
    setOpts(next);   // optimistic
    const jobs = next.map((o, idx) => ({ o, idx })).filter(({ o, idx }) => o.sort_order !== idx);
    try { await Promise.all(jobs.map(({ o, idx }) => updateOption(o.id, { sort_order: idx }))); setOpts(next.map((o, idx) => ({ ...o, sort_order: idx }))); }
    catch (e) { showToast((e as Error).message); await load(); }
  };
  const { rowProps, handleProps, rowCls } = useDragReorder(reorder);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-2xl mx-auto">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{kind === "platform"
          ? t("เพิ่ม/แก้ชื่อ/ลบ/จัดลำดับ + ตั้งสีหรือไอคอน (emoji/รูป) ต่อแพลตฟอร์ม — ชิปในหน้างานจะใช้สี/ไอคอนนี้ · ใส่รูปไอคอนจะแทนที่สี", "Add / rename / delete / reorder + set a color or icon (emoji/image) per platform — task chips use this · an icon image replaces the color")
          : t("เพิ่ม/แก้ชื่อ/ลบ/จัดลำดับ + ตั้งสี/ไอคอน (emoji) ต่อประเภทงาน — ชิปในการ์ด/คิวจะใช้สีนี้ · เปลี่ยนที่นี่แล้วฟอร์มสร้างงาน/เทมเพลตใช้ตามทันที", "Add / rename / delete / reorder + set color/icon (emoji) per task type — cards/queue chips use this · changes apply immediately to task and template forms")}</p>
        <p className="text-[11px] text-slate-400 mt-1"><Icon value="i:bulb" className="mr-1" />{t("แก้ชื่อ/สี/ไอคอน emoji แล้วกดปุ่มบันทึก ที่ท้ายแถว (รูปไอคอน + จัดลำดับ บันทึกทันที)", "Edit name/color/emoji then press Save at the end of the row (icon image + reorder save immediately)")}</p>
      </div>
      <div className="p-5">
        <div className="flex gap-2 mb-4">
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={`${t("เพิ่ม", "Add")} ${title}...`} className="flex-1 h-9 border border-slate-200 rounded-lg px-3 text-sm" />
          <button onClick={add} disabled={busy} className="h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50">＋ {t("เพิ่ม", "Add")}</button>
        </div>
        {loading ? <div className="py-10 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
          : opts.length === 0 ? <div className="py-10 text-center text-slate-400">{t("ยังไม่มีตัวเลือก", "No options yet")}</div>
          : (
            <div className="space-y-1.5">
              {opts.map((o, i) => {
                const d = draft[o.id] ?? {};
                const label = (d.label ?? o.label) as string;
                const color = ("color" in d ? d.color : o.color) as string | null | undefined;
                const icon = ("icon" in d ? d.icon : o.icon) as string | null | undefined;
                const dirty = isDirty(o);
                const iconImg = o.icon_key ? r2ImageUrl(o.icon_key, 48) : null;
                const hex = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
                const active = o.is_active !== false;   // ปิดใช้งาน = ไม่โผล่ในฟอร์ม/ป๊อปเลือกแพลตฟอร์ม (ข้อมูลเก่ายังอ่านชื่อได้)
                return (
                <div key={o.id} {...rowProps(i)} className={`flex items-center gap-2 border rounded-lg px-3 py-2 transition-colors ${active ? "border-slate-200" : "border-dashed border-slate-200 bg-slate-50/70"} ${rowCls(i)}`}>
                  <DragHandle {...handleProps(i)} title={t("ลากเพื่อจัดลำดับ", "Drag to reorder")} />
                  {/* พรีวิวชิปจริง — รูปไอคอน > สี+emoji > slate */}
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border shrink-0 max-w-[140px]" style={hex && !iconImg ? { backgroundColor: `${hex}1a`, color: hex, borderColor: `${hex}55` } : undefined}
                    title={t("ตัวอย่างชิป", "Chip preview")}>
                    {iconImg ? <img src={iconImg} alt="" className="h-3.5 w-3.5 rounded-sm object-contain" /> : icon ? <span className="leading-none inline-flex"><Icon value={icon} /></span> : null}
                    <span className={`truncate ${active ? "" : "line-through opacity-60"}`}>{label || o.label}</span>
                  </span>
                  {!active && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600" title={t("ไม่โผล่ให้เลือกในฟอร์ม/ป๊อปแพลตฟอร์ม — กดปุ่มเปิด/ปิดด้านขวาเพื่อเปิดใช้", "Hidden from pickers — click the on/off button on the right to enable")}>{t("ปิดอยู่", "Off")}</span>}
                  <input value={label} onChange={(e) => setField(o, { label: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && dirty) saveRow(o); }} className="flex-1 min-w-[80px] text-sm bg-transparent outline-none border-b border-transparent focus:border-violet-300 py-0.5" />
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* สีประเภท (มีทั้งประเภทงาน + แพลตฟอร์ม) */}
                    <div title={t("สีประเภท", "Color")}><ColorInput value={color || "#64748b"} onChange={(v) => setField(o, { color: v })} allowText={false} /></div>
                    {/* ไอคอน emoji */}
                    <input value={icon || ""} maxLength={2} placeholder="😀" onChange={(e) => setField(o, { icon: e.target.value })} title={t("ไอคอน emoji", "Emoji icon")} className="w-9 h-7 text-center border border-slate-200 rounded text-sm" />
                    {/* รูปไอคอน (อัปโหลด) — เฉพาะแพลตฟอร์ม (task_type ไม่มีคอลัมน์ icon_key) */}
                    {kind === "platform" && (<>
                      <label className={`h-7 px-2 inline-flex items-center text-[11px] rounded border cursor-pointer ${uploadingId === o.id ? "opacity-50 pointer-events-none" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`} title={t("อัปโหลดรูปไอคอน (แทนสี)", "Upload icon image (replaces color)")}>
                        {uploadingId === o.id ? "..." : iconImg ? <Icon value="i:photo" /> : t("รูป", "Img")}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadIcon(o, f); e.target.value = ""; }} />
                      </label>
                      {iconImg && <button onClick={() => patchMeta(o, { icon_key: null })} title={t("ลบรูปไอคอน", "Remove icon image")} className="text-slate-300 hover:text-red-500 text-xs">⊘</button>}
                    </>)}
                  </div>
                  {dirty && <button onClick={() => saveRow(o)} title={t("บันทึกแถวนี้", "Save this row")} className="h-7 px-2 text-[11px] font-medium text-white bg-violet-600 rounded hover:bg-violet-700 shrink-0"><Icon value="i:device-floppy" className="mr-1" />{t("บันทึก", "Save")}</button>}
                  <span className="text-[10px] text-slate-300 font-mono">{o.key}</span>
                  {/* เปิด/ปิดใช้งาน — ปิด = ซ่อนจากฟอร์มสร้าง/ป๊อปแบรนด์/แถวติ๊กใน drawer แต่ไม่ลบ (งานเก่ายังโชว์ชื่อได้) */}
                  <button onClick={() => patchMeta(o, { is_active: !active })} title={active ? t("เปิดใช้อยู่ — กดเพื่อปิด (ซ่อนจากตัวเลือก ไม่ลบ)", "Enabled — click to disable") : t("ปิดอยู่ — กดเพื่อเปิดใช้", "Disabled — click to enable")}
                    className={`h-7 w-7 inline-flex items-center justify-center rounded border text-xs ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100"}`}>{active ? "✓" : <Icon value="i:ban" />}</button>
                  <button onClick={() => remove(o)} className="text-slate-300 hover:text-red-500 text-sm">✕</button>
                </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

// แท็บสถานะ + เส้นทาง = หน้าจัดการสถานะแบบละเอียด (app/tasks/status-workflow-settings.tsx · 2026-11-22)

// ── ตั้งค่า "ฟิลด์ Parent SKU ที่ต้องกรอกก่อนส่งงาน" (ค่ากลาง) ──
function SubmitRequiredManager({ showToast }: { showToast: (m: string) => void }) {
  const t = useT();
  const [fields, setFields] = useState<string[] | null>(null);
  const [options, setOptions] = useState<{ col: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    getSubmitRequiredFields().then(setFields).catch(() => setFields([]));
    getParentSkuFieldOptions().then(setOptions).catch(() => setOptions([]));
  }, []);
  const toggle = (key: string) => setFields((f) => (f ?? []).includes(key) ? (f ?? []).filter((x) => x !== key) : [...(f ?? []), key]);
  const save = async () => { if (!fields) return; setSaving(true); try { await saveSubmitRequiredFields(fields); showToast(t("บันทึกแล้ว", "Saved")); } catch (e) { showToast((e as Error).message); } finally { setSaving(false); } };
  const labelOf = (col: string) => options.find((o) => o.col === col)?.label ?? col;
  // ลากเรียงลำดับฟิลด์ที่เลือก (ลำดับนี้ = ลำดับที่โชว์ในป๊อปอัปตรวจงาน)
  const dragIdx = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const move = (from: number, to: number) => setFields((f) => { if (!f || from === to || from < 0 || to < 0) return f; const n = [...f]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; });
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-slate-800"><Icon value="i:package-export" className="mr-1" />{t("ฟิลด์บังคับก่อนส่งงาน", "Required before submit")}</h2>
      <p className="text-sm text-slate-500 mt-1 mb-4">{t("เลือกฟิลด์ของ Parent SKU ที่ต้องกรอกครบก่อน (ดึงทุกฟิลด์จากทะเบียนฟิลด์กลาง) — ระบบจะใส่ * และกดส่งงานไม่ได้จนกว่าจะกรอกครบ · ลากจัดลำดับ = ลำดับที่โชว์ในป๊อปอัปตรวจงาน", "Pick Parent SKU fields that must be filled — drag to set the order shown in the review popup")}</p>
      {fields === null ? <p className="text-sm text-slate-400">{t("กำลังโหลด...", "Loading...")}</p> : (
        <>
          {/* ฟิลด์ที่เลือก (ลากเรียงลำดับได้) */}
          {fields.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-slate-500 mb-1.5">{t("ฟิลด์ที่เลือก (ลากเรียงลำดับ):", "Selected (drag to reorder):")}</p>
              <div className="space-y-1">
                {fields.map((col, i) => (
                  <div key={col} draggable
                    onDragStart={(e) => { dragIdx.current = i; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", col); } catch { /* noop */ } }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragIdx.current !== null && overIdx !== i) setOverIdx(i); }}
                    onDrop={(e) => { e.preventDefault(); if (dragIdx.current !== null) move(dragIdx.current, i); dragIdx.current = null; setOverIdx(null); }}
                    onDragEnd={() => { dragIdx.current = null; setOverIdx(null); }}
                    className={`flex items-center gap-2 text-sm rounded-md border px-2.5 py-1.5 bg-white cursor-grab active:cursor-grabbing ${overIdx === i ? "border-violet-400 ring-1 ring-violet-300" : "border-slate-200"}`}>
                    <span className="text-slate-300 text-xs">⠿</span>
                    <span className="w-5 text-[11px] text-slate-400">{i + 1}.</span>
                    <span className="text-slate-700 flex-1">{labelOf(col)} <span className="text-[10px] text-slate-300">{col}</span></span>
                    <button type="button" onClick={() => toggle(col)} title={t("เอาออก", "Remove")} className="text-slate-300 hover:text-rose-500 text-xs">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* เพิ่มฟิลด์ (ติ๊ก) */}
          <p className="text-xs font-medium text-slate-500 mb-1.5">{t("เพิ่มฟิลด์:", "Add fields:")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            {options.length === 0 && <p className="text-sm text-slate-400">{t("ไม่พบฟิลด์ Parent SKU", "No Parent SKU fields found")}</p>}
            {options.map((o) => (
              <label key={o.col} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={fields.includes(o.col)} onChange={() => toggle(o.col)} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
                {o.label} <span className="text-[10px] text-slate-300">{o.col}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <button onClick={save} disabled={saving} className="h-9 px-5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// แท็บจัดการทีม (Creative teams) — ตั้งชื่อ + สมาชิก → ใช้เลือกผู้รับผิดชอบเป็นทีม
// ============================================================
function TeamManager({ showToast }: { showToast: (m: string) => void }) {
  const t = useT();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setTeams(await listTeams()); } catch (e) { showToast((e as Error).message); } finally { setLoading(false); } }, [showToast]);
  useEffect(() => { load(); }, [load]);
  const add = async () => { if (!newName.trim()) return; try { await createTeam({ name: newName.trim() }); setNewName(""); await load(); showToast(t("เพิ่มทีมแล้ว", "Team added")); } catch (e) { showToast((e as Error).message); } };
  const rename = async (tm: Team, name: string) => { if (!name.trim() || name === tm.name) return; try { await updateTeam(tm.id, { name: name.trim() }); setTeams((p) => p.map((x) => x.id === tm.id ? { ...x, name: name.trim() } : x)); } catch (e) { showToast((e as Error).message); } };
  const setMembers = async (tm: Team, members: UserPickerValue[]) => {
    const member_ids = members.map((m) => m.id);
    setTeams((p) => p.map((x) => x.id === tm.id ? { ...x, member_ids, members: members.map((m) => ({ id: m.id, name: m.name })) } : x));
    try { await updateTeam(tm.id, { member_ids }); } catch (e) { showToast((e as Error).message); }
  };
  const remove = async (tm: Team) => { if (!(await askConfirm({ title: `${t("ลบทีม", "Delete team")} "${tm.name}" ?`, variant: "danger" }))) return; try { await deleteTeam(tm.id); await load(); showToast(t("ลบแล้ว", "Deleted")); } catch (e) { showToast((e as Error).message); } };
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-3xl mx-auto">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">{t("ทีม", "Teams")}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{t("สร้างทีม + ใส่สมาชิก → เวลาเลือกผู้รับผิดชอบ เลือก \"ทีม\" แล้วดึงสมาชิกมาใส่ได้เลย (แก้เพิ่ม/ลบรายคนต่อได้)", "Create teams + members → when assigning, pick a team to fill its members (still editable)")}</p>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("ชื่อทีมใหม่...", "New team name...")} className="flex-1 h-9 border border-slate-200 rounded-lg px-3 text-sm" />
          <button onClick={add} className="h-9 px-4 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700">＋ {t("เพิ่มทีม", "Add team")}</button>
        </div>
        {loading ? <div className="py-10 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div>
          : teams.length === 0 ? <p className="text-sm text-slate-400 italic">{t("ยังไม่มีทีม — เพิ่มทีมแรกด้านบน", "No teams yet — add one above")}</p>
          : <div className="space-y-3">{teams.map((tm) => (
            <div key={tm.id} className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-violet-500"><Icon value="i:users" /></span>
                <input defaultValue={tm.name} onBlur={(e) => rename(tm, e.target.value)} className="flex-1 text-sm font-medium bg-transparent outline-none border-b border-transparent focus:border-violet-300 py-0.5" />
                <span className="text-[11px] text-slate-400">{tm.members.length} {t("คน", "members")}</span>
                <button onClick={() => remove(tm)} className="text-slate-300 hover:text-red-500 text-sm">✕</button>
              </div>
              <MultiUserPicker value={tm.members.map((m) => ({ id: m.id, name: m.name } as UserPickerValue))} onChange={(v) => setMembers(tm, v)} disableCreate />
            </div>
          ))}</div>}
      </div>
    </div>
  );
}

// SubtaskTypeManager ย้ายไปไฟล์กลาง ../subtask-type-manager (ใช้ทั้ง Settings + ป๊อปอัปในตัวเลือกงานย่อย)
