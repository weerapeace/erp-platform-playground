"use client";

/**
 * 🔣 หน้าไอคอนทั้งระบบ (/admin/icons) — ตั้งค่าทะเบียนไอคอนกลาง (lib/icon-registry)
 *   1) เลือกโหมด: อีโมจิแบบเดิม / ไอคอนเส้น / ไอคอนเส้น + สี
 *   2) เปลี่ยนไอคอนของแต่ละ "ความหมาย" (ทุกที่ที่ใช้ความหมายนั้นเปลี่ยนตาม) · อัปโหลดไอคอนของฉันได้
 *   3) จับคู่อีโมจิที่ระบบยังไม่รู้จัก (เช่น ในเมนู) เข้ากับความหมาย
 * แก้แล้วเมนูข้างเปลี่ยนให้ดูทันที (ลองดู) — ยังไม่มีผลกับคนอื่นจนกว่าจะกดบันทึก
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { SaveBar } from "@/components/save-bar";
import { askConfirm } from "@/components/modal/ask-dialog";
import { Icon, ICON_SETTINGS_API, commitIconSettings, iconImageUrl, previewIconSettings } from "@/components/icon";
import { IconPickerModal } from "@/components/icon/icon-picker-modal";
import {
  DEFAULT_ICON_SETTINGS, ICON_GROUP_LABEL, ICON_MEANINGS, ICON_MODE_LABEL,
  cleanIconSettings, displayEmoji, emojisOfMeaning, meaningIconValue, meaningOfEmoji, normEmoji,
  type IconGroup, type IconMeaning, type IconMode, type IconSettings,
} from "@/lib/icon-registry";

type MenuRow = { icon: string | null; label: string };
const GROUP_ORDER = Object.keys(ICON_GROUP_LABEL) as IconGroup[];
const MODE_SAMPLE = ["save", "edit", "delete", "warning", "done", "package", "truck", "chart"];
const MODE_HINT: Record<IconMode, string> = {
  emoji: "เหมือนที่ใช้อยู่ตอนนี้ ไม่มีอะไรเปลี่ยน",
  line: "ไอคอนเส้นสีเดียวตามตัวหนังสือ ดูสะอาด ไม่รก",
  color: "ไอคอนเส้น + สีตามความหมาย (เตือน=เหลือง ลบ=แดง ผ่าน=เขียว)",
};
const isEmojiLike = (s: string) => /\p{Extended_Pictographic}/u.test(s);
const same = (a: IconSettings, b: IconSettings) => JSON.stringify(a) === JSON.stringify(b);

export function IconsAdmin() {
  const toast = useToast();
  const { user } = useAuth();
  const [base, setBase] = useState<IconSettings>(DEFAULT_ICON_SETTINGS);
  const [draft, setDraft] = useState<IconSettings>(DEFAULT_ICON_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [menu, setMenu] = useState<MenuRow[]>([]);
  const [editing, setEditing] = useState<IconMeaning | null>(null);
  const [newEmoji, setNewEmoji] = useState("");
  const [newMeaning, setNewMeaning] = useState("");

  const load = async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const [s, m] = await Promise.all([
        apiFetch(ICON_SETTINGS_API).then((r) => r.json()),
        apiFetch("/api/menu").then((r) => r.json()).catch(() => ({ data: [] })),
      ]);
      if (s.error) throw new Error(s.error);
      setSetupNeeded(!!s.setup_needed);
      const clean = cleanIconSettings(s.data);
      setBase(clean);
      setDraft(clean);
      setMenu(Array.isArray(m.data) ? m.data : []);
    } catch {
      setLoadErr("โหลดค่าตั้งค่าไอคอนไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const dirty = !same(draft, base);
  // ลองดูทั้งระบบ (เมนูข้างเปลี่ยนตาม) ระหว่างแก้ · ออกจากหน้า = กลับค่าที่บันทึก
  useEffect(() => { previewIconSettings(dirty ? draft : null); }, [draft, dirty]);
  useEffect(() => () => previewIconSettings(null), []);

  const save = async () => {
    setSaving(true);
    setSaveErr(null);
    try {
      const r = await apiFetch(ICON_SETTINGS_API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: draft, actor: user?.email ?? undefined }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "บันทึกไม่สำเร็จ");
      const next = cleanIconSettings(j.data);
      commitIconSettings(next);
      setBase(next);
      setDraft(next);
      setSavedAt(new Date());
      toast.success("บันทึกแล้ว — ทุกคนเห็นไอคอนแบบใหม่เมื่อเปิดหน้าใหม่");
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  // เมนูที่ใช้แต่ละความหมาย (ตามการจับคู่ใน draft)
  const menuByMeaning = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const it of menu) {
      const m = it.icon ? meaningOfEmoji(it.icon, draft) : null;
      if (m) map.set(m.key, [...(map.get(m.key) ?? []), it.label]);
    }
    return map;
  }, [menu, draft]);
  // อีโมจิในเมนูที่ยังไม่รู้ความหมาย
  const unknownMenuEmoji = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const it of menu) {
      const e = it.icon?.trim();
      if (!e || !isEmojiLike(e) || /^(i|c|img):/.test(e) || meaningOfEmoji(e, draft)) continue;
      map.set(normEmoji(e), [...(map.get(normEmoji(e)) ?? []), it.label]);
    }
    return [...map.entries()];
  }, [menu, draft]);

  const setOverride = (key: string, v: string | null) =>
    setDraft((d) => {
      const overrides = { ...d.overrides };
      if (v) overrides[key] = v; else delete overrides[key];
      return { ...d, overrides };
    });
  const mapEmoji = (emoji: string, key: string | null) =>
    setDraft((d) => {
      const emojiMap = { ...d.emojiMap };
      if (key) emojiMap[normEmoji(emoji)] = key; else delete emojiMap[normEmoji(emoji)];
      return { ...d, emojiMap };
    });
  const removeCustom = async (id: string) => {
    const usedBy = ICON_MEANINGS.filter((m) => draft.overrides[m.key] === `c:${id}`);
    const ok = await askConfirm({
      title: "ลบไอคอนของฉัน?",
      message: usedBy.length
        ? `ไอคอนนี้ใช้อยู่กับ ${usedBy.map((m) => m.label).join(", ")} — ลบแล้วจุดเหล่านั้นกลับไปใช้ไอคอนเริ่มต้น`
        : "ไอคอนนี้ยังไม่ได้ใช้ที่ไหน",
      variant: "danger",
      confirmText: "ลบ",
    });
    if (!ok) return;
    setDraft((d) => {
      const overrides = { ...d.overrides };
      for (const m of usedBy) delete overrides[m.key];
      return { ...d, overrides, custom: d.custom.filter((c) => c.id !== id) };
    });
  };

  const iconMode: IconMode = draft.mode === "emoji" ? "line" : draft.mode; // คอลัมน์ "ไอคอนใหม่" โชว์แบบไอคอนเสมอ
  const columns: MiniColumn<IconMeaning>[] = [
    { key: "label", header: "ความหมาย", width: "1.4fr", sortValue: (m) => m.label, cell: (m) => <span className="text-slate-800">{m.label}</span> },
    {
      key: "emoji", header: "อีโมจิเดิม", width: "1fr",
      cell: (m) => <span className="text-lg tracking-wide" title="อีโมจิที่ระบบนับว่าเป็นความหมายนี้">{emojisOfMeaning(m.key, draft).join(" ")}</span>,
    },
    {
      key: "icon", header: "ไอคอนที่ใช้", width: "7rem", align: "center",
      cell: (m) => (
        <span className="inline-flex items-center gap-1.5 text-[22px] text-slate-700">
          <Icon name={m.key} settings={draft} mode={iconMode} />
          {draft.overrides[m.key] && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">เปลี่ยนแล้ว</span>}
        </span>
      ),
    },
    {
      key: "used", header: "ใช้ในเมนู", width: "1.6fr", sortValue: (m) => menuByMeaning.get(m.key)?.length ?? 0,
      cell: (m) => {
        const names = menuByMeaning.get(m.key) ?? [];
        return names.length ? <span className="text-xs text-slate-500 line-clamp-2" title={names.join(" · ")}>{names.length} เมนู · {names.slice(0, 3).join(", ")}{names.length > 3 ? " …" : ""}</span> : <span className="text-xs text-slate-300">—</span>;
      },
    },
    {
      key: "act", header: "", width: "6rem", align: "right",
      cell: (m) => (
        <button type="button" onClick={() => setEditing(m)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">เปลี่ยน</button>
      ),
    },
  ];

  if (loading) return <div className="max-w-6xl mx-auto px-6 py-10 text-sm text-slate-400">กำลังโหลดไอคอน…</div>;
  if (loadErr)
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-3">
          <Icon name="warning" /> {loadErr}
          <button type="button" onClick={() => void load()} className="ml-auto px-3 py-1 rounded-lg border border-red-200 bg-white text-red-700">ลองใหม่</button>
        </div>
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <h1 className="text-2xl font-semibold text-slate-800">ไอคอนทั้งระบบ</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">
        เลือกว่าระบบจะแสดงอีโมจิแบบเดิมหรือไอคอนเส้น · เปลี่ยนไอคอนของแต่ละความหมายได้ (ทุกที่ที่ใช้เปลี่ยนตาม) · อัปโหลดไอคอนเองได้ ·
        ระหว่างแก้ เมนูข้างจะเปลี่ยนให้ลองดูทันที — คนอื่นยังเห็นแบบเดิมจนกว่าจะกดบันทึก
      </p>
      {setupNeeded && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2">
          <Icon name="warning" /> ลองเลือก/ดูตัวอย่างได้ แต่ยังบันทึกไม่ได้ — ระบบยังไม่มีช่องเก็บค่าไอคอนในฐานข้อมูล (ต้องเพิ่มก่อน 1 ครั้ง)
        </div>
      )}

      {/* 1. โหมด */}
      <div className="text-xs font-medium text-slate-500 mb-1.5">แสดงไอคอนแบบไหน</div>
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        {(Object.keys(ICON_MODE_LABEL) as IconMode[]).map((mode) => {
          const on = draft.mode === mode;
          return (
            <button key={mode} type="button" onClick={() => setDraft((d) => ({ ...d, mode }))}
              className={`text-left rounded-xl border p-3 transition-colors ${on ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300 bg-white"}`}>
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <span className={`w-4 h-4 rounded-full border-2 ${on ? "border-blue-600 bg-blue-600 shadow-[inset_0_0_0_2px_white]" : "border-slate-300"}`} />
                {ICON_MODE_LABEL[mode]}
              </div>
              <div className="flex items-center gap-2.5 text-xl text-slate-600 my-2.5">
                {MODE_SAMPLE.map((k) => <Icon key={k} name={k} settings={draft} mode={mode} />)}
              </div>
              <div className="text-xs text-slate-500">{MODE_HINT[mode]}</div>
            </button>
          );
        })}
      </div>

      {/* 2. ความหมาย */}
      <MiniTable
        title="ความหมายของไอคอน"
        rows={ICON_MEANINGS}
        columns={columns}
        rowKey={(m) => m.key}
        searchText={(m) => `${m.label} ${m.key} ${emojisOfMeaning(m.key, draft).join(" ")} ${(menuByMeaning.get(m.key) ?? []).join(" ")}`}
        searchPlaceholder="ค้นหา เช่น บันทึก, 📦, จัดซื้อ"
        groupBy={(m) => ICON_GROUP_LABEL[m.group]}
        groupOrder={(g) => GROUP_ORDER.findIndex((k) => ICON_GROUP_LABEL[k] === g)}
        defaultGrouped
        countUnit="ความหมาย"
        dense
        footnote="เปลี่ยนไอคอนของความหมายไหน = เมนูและหน้าจอที่ใช้ความหมายนั้นเปลี่ยนตามทั้งระบบ (หน้าที่ยังไม่ได้ย้ายมาใช้ของกลาง จะทยอยตามมา)"
      />

      {/* 3. ไอคอนของฉัน */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-sm font-semibold text-slate-800">ไอคอนของฉัน</div>
          <span className="text-xs text-slate-400">เพิ่มได้จากปุ่ม “เปลี่ยน” ในตาราง → แท็บไอคอนของฉัน</span>
        </div>
        <p className="text-xs text-slate-500 mb-3">ไอคอนที่อัปโหลดเอง (รูป PNG/SVG หรือวางโค้ด SVG) — ใช้ซ้ำได้หลายความหมาย · แก้ชื่อ/สีได้ที่นี่</p>
        {draft.custom.length === 0 ? (
          <p className="text-sm text-slate-400">ยังไม่มี</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {draft.custom.map((c) => {
              const usedBy = ICON_MEANINGS.filter((m) => draft.overrides[m.key] === `c:${c.id}`);
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2">
                  <span className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-2xl text-slate-700 shrink-0">
                    <Icon value={`c:${c.id}`} settings={draft} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <input value={c.label} onChange={(e) => setDraft((d) => ({ ...d, custom: d.custom.map((x) => (x.id === c.id ? { ...x, label: e.target.value.slice(0, 60) } : x)) }))}
                      placeholder="ชื่อไอคอน" className="w-full h-7 px-2 rounded border border-transparent hover:border-slate-200 focus:border-slate-300 text-sm" />
                    <div className="flex items-center gap-2 px-2 text-[11px] text-slate-500">
                      <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                        <input type="checkbox" checked={c.tint} onChange={(e) => setDraft((d) => ({ ...d, custom: d.custom.map((x) => (x.id === c.id ? { ...x, tint: e.target.checked } : x)) }))} />
                        ระบายสีตามตัวหนังสือ
                      </label>
                      <span className="truncate">{usedBy.length ? `ใช้กับ ${usedBy.map((m) => m.label).join(", ")}` : "ยังไม่ได้ใช้"}</span>
                    </div>
                  </div>
                  <a href={iconImageUrl(c.src, 512)} target="_blank" rel="noopener" className="text-slate-400 hover:text-slate-700 text-lg" title="ดูรูปเต็ม"><Icon value="i:eye" /></a>
                  <button type="button" onClick={() => void removeCustom(c.id)} className="text-slate-400 hover:text-red-600 text-lg" title="ลบไอคอนนี้"><Icon value="i:trash" /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. จับคู่อีโมจิเพิ่ม */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800 mb-1">จับคู่อีโมจิเพิ่ม</div>
        <p className="text-xs text-slate-500 mb-3">อีโมจิที่ระบบยังไม่รู้ว่าหมายถึงอะไร จะโชว์เป็นอีโมจิเดิมเสมอ — จับคู่กับความหมายแล้วจะเปลี่ยนเป็นไอคอนตามโหมดที่เลือก</p>
        {unknownMenuEmoji.length > 0 && (
          <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <div className="text-xs font-medium text-amber-800 mb-2">อีโมจิในเมนูที่ยังไม่ได้จับคู่ ({unknownMenuEmoji.length})</div>
            <div className="space-y-1.5">
              {unknownMenuEmoji.map(([e, names]) => (
                <div key={e} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-xl w-8 text-center">{displayEmoji(e)}</span>
                  <span className="text-xs text-slate-500 flex-1 min-w-[140px] truncate" title={names.join(" · ")}>{names.join(", ")}</span>
                  <select value="" onChange={(ev) => ev.target.value && mapEmoji(e, ev.target.value)} className="h-8 px-2 rounded-lg border border-slate-200 text-sm bg-white">
                    <option value="">หมายถึง…</option>
                    {ICON_MEANINGS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} placeholder="วางอีโมจิ เช่น 🧷" className="h-9 w-36 px-3 rounded-lg border border-slate-200 text-sm" />
          <select value={newMeaning} onChange={(e) => setNewMeaning(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="">หมายถึง…</option>
            {ICON_MEANINGS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <button type="button" disabled={!newEmoji.trim() || !newMeaning}
            onClick={() => { mapEmoji(newEmoji, newMeaning); setNewEmoji(""); setNewMeaning(""); }}
            className="h-9 px-3 rounded-lg text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40">จับคู่</button>
        </div>
        {Object.keys(draft.emojiMap).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(draft.emojiMap).map(([e, k]) => {
              const m = ICON_MEANINGS.find((x) => x.key === k);
              return (
                <span key={e} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-slate-50 border border-slate-200 text-sm">
                  <span className="text-lg">{displayEmoji(e)}</span> →<Icon name={k} settings={draft} mode={iconMode} /> {m?.label}
                  <button type="button" onClick={() => mapEmoji(e, null)} className="ml-1 w-6 h-6 rounded text-slate-400 hover:text-red-600 hover:bg-white" title="เลิกจับคู่"><Icon value="i:x" /></button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      <SaveBar dirty={dirty} saving={saving} error={saveErr} savedAt={savedAt} onSave={save} onDiscard={() => setDraft(base)}
        note="บันทึกแล้วมีผลกับทุกคน (เปิดหน้าใหม่ถึงจะเห็น)" />

      {editing && (
        <IconPickerModal
          open
          onClose={() => setEditing(null)}
          title={`เลือกไอคอนให้ “${editing.label}”`}
          value={meaningIconValue(editing, draft)}
          defaultValue={`i:${editing.icon}`}
          settings={draft}
          onPick={(v) => setOverride(editing.key, v && v !== `i:${editing.icon}` ? v : null)}
          onAddCustom={(c) => setDraft((d) => ({ ...d, custom: [...d.custom, c] }))}
        />
      )}
    </div>
  );
}
