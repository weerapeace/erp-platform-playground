"use client";

/**
 * 🎬 แท็บ Video Shot ในศูนย์เรียนรู้ — คลังช็อตตัวอย่างจากลิงก์ (ตัดช่วงเริ่ม-จบ · ไม่ดาวน์โหลดไฟล์)
 *   แถบบน: วางลิงก์ → เพิ่มช็อต · ชุดช็อต (Shot list) เลือก/สร้าง/แก้/ลบ · ค้น + กรองขนาดภาพ/การเคลื่อนกล้อง/แพลตฟอร์ม
 *   PC: ซ้าย = รายการช็อต · ขวา = เล่นช่วง + รายละเอียด · มือถือ: รายการ → แตะแล้วเปิดเต็มจอ (ปุ่มย้อนกลับ)
 *   learn.manage: เพิ่ม/แก้/ลบ (ถังขยะ กู้คืนได้)/จัดลำดับในชุด · learn.view: ดูอย่างเดียว
 */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { ConfirmDialog } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { VideoSegmentPlayer } from "@/components/video-segment";
import { formatDateTime } from "@/lib/date";
import { CAMERA_MOVES, moveInOrder, moveLabel, rangeText, SHOT_PLATFORMS, SHOT_SIZES, shotMatches, shotWatchUrl, sizeLabel, youtubeThumb, type ShotPlatform, type VideoShot, type VideoShotList } from "@/lib/video-shot";
import { ShotEditor, ShotListEditor } from "./shot-editor";
import { useShots, useShotWrite } from "./use-shots";

const ALL = "__all__", NONE = "__none__";
const PCOL: Record<ShotPlatform, string> = { youtube: "bg-rose-50 text-rose-700", tiktok: "bg-slate-100 text-slate-700", pinterest: "bg-red-50 text-red-700", instagram: "bg-fuchsia-50 text-fuchsia-700" };
const sel = "h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px]";

function Thumb({ s }: { s: VideoShot }) {
  const src = s.thumb_url || (s.platform === "youtube" && s.video_id ? youtubeThumb(s.video_id) : null);
  const [bad, setBad] = useState(false);
  return (
    <span className="relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-800 text-white/80">
      {src && !bad ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} className="h-full w-full object-cover" />
      ) : <Icon name="player-play" />}
    </span>
  );
}

function ShotTrash({ onChanged }: { onChanged: () => void | Promise<void> }) {
  const { shots, lists, loading, error, reload } = useShots(true);
  const w = useShotWrite(async () => { await reload(); await onChanged(); });
  const [confirm, setConfirm] = useState<{ kind: "shot"; v: VideoShot } | { kind: "list"; v: VideoShotList } | null>(null);
  if (loading) return <LoadingState rows={3} />;
  if (error) return <ErrorState title="โหลดถังขยะไม่ได้" hint={error} onRetry={() => void reload()} />;
  if (!shots.length && !lists.length) return <EmptyState icon={<Icon name="trash" />} title="ถังขยะว่าง" hint="ช็อตและชุดช็อตที่ลบจะมาอยู่ที่นี่ก่อน กู้คืนได้ทุกเมื่อ" />;
  const row = "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5";
  const restoreBtn = "inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100";
  const purgeBtn = "inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-600";
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500">ลบไว้ {shots.length} ช็อต · {lists.length} ชุด · กด “กู้คืน” เพื่อเอากลับ</p>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {lists.map((l) => (
          <div key={l.id} className={row}>
            <Icon name="list" />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-slate-800">ชุด: {l.name}</div><div className="text-xs text-slate-400">ลบเมื่อ {formatDateTime(l.deleted_at)}</div></div>
            <button type="button" onClick={() => void w.restoreList(l)} className={restoreBtn}><Icon name="arrow-back-up" /> กู้คืน</button>
            <button type="button" onClick={() => setConfirm({ kind: "list", v: l })} className={purgeBtn}><Icon name="trash-x" /> ลบถาวร</button>
          </div>
        ))}
        {shots.map((s) => (
          <div key={s.id} className={row}>
            <Thumb s={s} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-slate-800">{s.title}</div><div className="text-xs text-slate-400">{SHOT_PLATFORMS[s.platform].label} · ลบเมื่อ {formatDateTime(s.deleted_at)}</div></div>
            <button type="button" onClick={() => void w.restore(s)} className={restoreBtn}><Icon name="arrow-back-up" /> กู้คืน</button>
            <button type="button" onClick={() => setConfirm({ kind: "shot", v: s })} className={purgeBtn}><Icon name="trash-x" /> ลบถาวร</button>
          </div>
        ))}
      </div>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} variant="danger" confirmText="ลบถาวร"
        title={confirm?.kind === "list" ? `ลบชุด "${confirm.v.name}" ถาวร?` : `ลบช็อต "${confirm?.kind === "shot" ? confirm.v.title : ""}" ถาวร?`}
        message={confirm?.kind === "list" ? "ช็อตในชุดไม่หาย (จะกลายเป็น “ไม่อยู่ในชุด”) · ลบแล้วกู้คืนชุดไม่ได้" : "ลบแล้วกู้คืนไม่ได้ (คลิปต้นทางไม่ถูกแตะ)"}
        onConfirm={async () => { const c = confirm; setConfirm(null); if (!c) return; if (c.kind === "list") await w.purgeList(c.v); else await w.purge(c.v); }} />
    </div>
  );
}

export function ShotsTab() {
  const { shots, lists, canManage, loading, error, reload } = useShots(false);
  const w = useShotWrite(reload);
  const [trash, setTrash] = useState(false);
  const [listSel, setListSel] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [size, setSize] = useState("");
  const [move, setMove] = useState("");
  const [plat, setPlat] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [editing, setEditing] = useState<{ shot: VideoShot | null; url?: string } | null>(null);
  const [listEdit, setListEdit] = useState<VideoShotList | "new" | null>(null);
  const [del, setDel] = useState<VideoShot | null>(null);
  const [delList, setDelList] = useState<VideoShotList | null>(null);

  const liveListIds = useMemo(() => new Set(lists.map((l) => l.id)), [lists]);
  const inList = (s: VideoShot) => (s.list_id && liveListIds.has(s.list_id) ? s.list_id : NONE);
  const pool = useMemo(() => shots.filter((s) => listSel === ALL || inList(s) === listSel), [shots, listSel, liveListIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => pool
    .filter((s) => !size || s.shot_size === size)
    .filter((s) => !move || s.camera_move === move)
    .filter((s) => !plat || s.platform === plat)
    .filter((s) => shotMatches(s, q)), [pool, size, move, plat, q]);
  const ordering = canManage && listSel !== ALL && !q && !size && !move && !plat;
  const current = shots.find((s) => s.id === openId) ?? null;
  const curList = lists.find((l) => l.id === listSel) ?? null;

  useEffect(() => {
    if (loading || openId || !shown.length) return;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) setOpenId(shown[0].id);
  }, [loading, openId, shown]);

  const moveShot = async (s: VideoShot, dir: -1 | 1) => {
    const ids = shown.map((x) => x.id);
    const next = moveInOrder(ids, s.id, dir);
    if (next) await w.reorder(next, ids);
  };

  const startAdd = () => { setEditing({ shot: null, url: paste.trim() || undefined }); setPaste(""); };

  if (loading) return <LoadingState rows={5} />;
  if (error) return <ErrorState title="โหลดคลังช็อตไม่ได้" hint={error} onRetry={() => void reload()} />;
  if (trash) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setTrash(false)} className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800"><Icon name="arrow-left" /> กลับไปคลังช็อต</button>
        <ShotTrash onChanged={reload} />
      </div>
    );
  }

  const listChips = [
    { id: ALL, name: "ทั้งหมด", n: shots.length },
    ...lists.map((l) => ({ id: l.id, name: l.name, n: shots.filter((s) => s.list_id === l.id).length })),
    { id: NONE, name: "ไม่อยู่ในชุด", n: shots.filter((s) => inList(s) === NONE).length },
  ];

  const list = (
    <div className="space-y-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นช็อต ชื่อ แท็ก โน้ต" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px]" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <select value={size} onChange={(e) => setSize(e.target.value)} className={sel} aria-label="กรองขนาดภาพ">
          <option value="">ทุกขนาดภาพ</option>{SHOT_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={move} onChange={(e) => setMove(e.target.value)} className={sel} aria-label="กรองการเคลื่อนกล้อง">
          <option value="">ทุกการเคลื่อนกล้อง</option>{CAMERA_MOVES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={plat} onChange={(e) => setPlat(e.target.value)} className={sel} aria-label="กรองแพลตฟอร์ม">
          <option value="">ทุกแพลตฟอร์ม</option>{(Object.keys(SHOT_PLATFORMS) as ShotPlatform[]).map((k) => <option key={k} value={k}>{SHOT_PLATFORMS[k].label}</option>)}
        </select>
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-slate-400">{q || size || move || plat ? "ไม่พบช็อตที่ตรงกับตัวกรอง ลองล้างตัวกรอง" : "ชุดนี้ยังไม่มีช็อต"}</p>
      ) : (
        <div className="space-y-1">
          {shown.map((s, i) => (
            <div key={s.id} className={`flex items-center gap-2 rounded-xl border px-2 py-2 ${s.id === openId ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
              <button type="button" onClick={() => setOpenId(s.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <Thumb s={s} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-800">{ordering && <span className="mr-1 text-slate-400">{i + 1}.</span>}{s.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                    <span className={`rounded px-1.5 py-px ${PCOL[s.platform]}`}>{SHOT_PLATFORMS[s.platform].label}</span>
                    {rangeText(s.start_sec, s.end_sec) && <span>{rangeText(s.start_sec, s.end_sec)}</span>}
                    {sizeLabel(s.shot_size) && <span>· {sizeLabel(s.shot_size)}</span>}
                    {moveLabel(s.camera_move) && <span>· {moveLabel(s.camera_move)?.split(" ")[0]}</span>}
                  </span>
                </span>
              </button>
              {ordering && (
                <span className="flex shrink-0 flex-col">
                  <button type="button" onClick={() => void moveShot(s, -1)} disabled={i === 0} className="px-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30" aria-label="เลื่อนขึ้น" title="เลื่อนขึ้น"><Icon name="chevron-up" /></button>
                  <button type="button" onClick={() => void moveShot(s, 1)} disabled={i === shown.length - 1} className="px-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30" aria-label="เลื่อนลง" title="เลื่อนลง"><Icon name="chevron-down" /></button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const detail = current ? (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpenId(null)} className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800 lg:hidden"><Icon name="arrow-left" /> กลับไปรายการช็อต</button>
      <VideoSegmentPlayer key={current.id + current.updated_at} url={current.url} start={current.start_sec} end={current.end_sec} thumb={current.thumb_url} title={current.title} />
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-start gap-2">
          <h3 className="min-w-0 flex-1 text-[15px] font-semibold text-slate-900">{current.title}</h3>
          {canManage && (
            <span className="flex shrink-0 gap-1.5">
              <button type="button" onClick={() => setEditing({ shot: current })} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[12px] text-slate-700 hover:bg-slate-50"><Icon name="edit" /> แก้</button>
              <button type="button" onClick={() => setDel(current)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[12px] text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Icon name="trash" /> ลบ</button>
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
          {sizeLabel(current.shot_size) && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">ขนาด: {sizeLabel(current.shot_size)}</span>}
          {moveLabel(current.camera_move) && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">กล้อง: {moveLabel(current.camera_move)}</span>}
          {current.list_id && liveListIds.has(current.list_id) && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">ชุด: {lists.find((l) => l.id === current.list_id)?.name}</span>}
          {current.tags.map((t) => <button key={t} type="button" onClick={() => setQ(t)} className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 hover:bg-amber-100">#{t}</button>)}
        </div>
        {current.note && <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">{current.note}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span>เพิ่มโดย {current.created_by ?? "-"} · แก้ล่าสุด {formatDateTime(current.updated_at)}</span>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(shotWatchUrl(current.platform, current.url, current.video_id, current.start_sec)); }} className="inline-flex items-center gap-1 text-indigo-600 hover:underline"><Icon name="copy" /> คัดลอกลิงก์</button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <input value={paste} onChange={(e) => setPaste(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") startAdd(); }}
            placeholder="วางลิงก์ YouTube / TikTok / Pinterest แล้วกด เพิ่มช็อต" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-[13px]" />
          <button type="button" onClick={startAdd} className="inline-flex h-9 items-center gap-1 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"><Icon name="plus" /> เพิ่มช็อต</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {listChips.filter((c) => c.id !== NONE || c.n > 0).map((c) => (
          <button key={c.id} type="button" onClick={() => { setListSel(c.id); setOpenId(null); }}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] ${listSel === c.id ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {c.id !== ALL && c.id !== NONE && <Icon name="list" />}{c.name}<span className="text-slate-400">{c.n}</span>
          </button>
        ))}
        {canManage && <button type="button" onClick={() => setListEdit("new")} className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1 text-[12px] text-slate-500 hover:bg-slate-50"><Icon name="plus" /> ชุดใหม่</button>}
        {canManage && <button type="button" onClick={() => setTrash(true)} className="ml-auto inline-flex items-center gap-1 text-[12px] text-slate-400 hover:text-slate-700"><Icon name="trash" /> ถังขยะช็อต</button>}
      </div>
      {curList && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          <span className="min-w-0 flex-1">{curList.description || "ชุดช็อตสำหรับวางแผนถ่าย — เลื่อนขึ้น/ลง เพื่อเรียงลำดับถ่าย"}</span>
          {canManage && <button type="button" onClick={() => setListEdit(curList)} className="inline-flex items-center gap-1 hover:text-indigo-700"><Icon name="edit" /> แก้ชุด</button>}
          {canManage && <button type="button" onClick={() => setDelList(curList)} className="inline-flex items-center gap-1 hover:text-rose-600"><Icon name="trash" /> ลบชุด</button>}
        </div>
      )}

      {shots.length === 0 ? (
        <EmptyState icon={<Icon name="movie" />} title="เริ่มเก็บช็อตแรก"
          hint={canManage ? "copy ลิงก์คลิปที่ถ่ายสวย ๆ มาวางด้านบน แล้วตัดเฉพาะช่วงที่อยากให้ทีมดู" : "ยังไม่มีช็อตในคลัง — รอหัวหน้าเพิ่มก่อนนะ"} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className={`${current ? "hidden lg:block" : ""} lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto`}>{list}</aside>
          <main className={current ? "" : "hidden lg:block"}>
            {detail ?? <p className="py-16 text-center text-[13px] text-slate-400">เลือกช็อตจากรายการด้านซ้าย</p>}
          </main>
        </div>
      )}

      {editing && (
        <ShotEditor shot={editing.shot} lists={lists} initialUrl={editing.url}
          defaultListId={listSel !== ALL && listSel !== NONE ? listSel : null}
          onClose={() => setEditing(null)}
          onSave={async (d) => {
            if (editing.shot) return !!(await w.update(editing.shot, d));
            const s = await w.create(d); if (s) setOpenId(s.id); return !!s;
          }} />
      )}
      {listEdit && (
        <ShotListEditor list={listEdit === "new" ? null : listEdit} onClose={() => setListEdit(null)}
          onSave={async (name, description) => {
            if (listEdit === "new") { const l = await w.createList(name, description); if (l) setListSel(l.id); return !!l; }
            return w.updateList(listEdit, { name, description });
          }} />
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} variant="danger" confirmText="ย้ายเข้าถังขยะ"
        title={`ลบช็อต "${del?.title ?? ""}"?`} message="ช็อตนี้จะย้ายเข้าถังขยะ — กู้คืนได้จาก “ถังขยะช็อต” หรือกด “ย้อนกลับ” ที่แจ้งผล (บทเรียนที่ใช้ลิงก์นี้ไม่กระทบ)"
        onConfirm={async () => { const d = del; setDel(null); if (d && (await w.remove(d))) setOpenId(null); }} />
      <ConfirmDialog open={!!delList} onClose={() => setDelList(null)} variant="danger" confirmText="ย้ายเข้าถังขยะ"
        title={`ลบชุด "${delList?.name ?? ""}"?`} message="ชุดนี้จะย้ายเข้าถังขยะ ช็อตในชุดยังอยู่ครบ (ย้ายไปอยู่ “ไม่อยู่ในชุด” ชั่วคราว) กู้ชุดคืนแล้วกลับมาเหมือนเดิม"
        onConfirm={async () => { const d = delList; setDelList(null); if (d && (await w.removeList(d))) setListSel(ALL); }} />
    </div>
  );
}
