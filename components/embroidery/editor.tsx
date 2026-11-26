"use client";
/**
 * 🧵 ไฟล์ปัก — หน้าทำงาน (/master/embroidery/<id>)
 *   ซ้าย: ตัวอย่างฝีเข็ม + เล่นลำดับการปัก · ขวา: ขนาดจริง · ความแน่นตามผ้า · ชนิดฝีเข็ม/รหัสด้าย/ลำดับ ตามสี · คำเตือนส่วนที่บาง/เล็ก
 *   ทุกการแก้คำนวณฝีเข็มใหม่ทันทีในเบราว์เซอร์ (lib/embroidery) · ย้อนกลับได้ (ปุ่ม/Ctrl+Z) · บันทึกด้วย SaveBar กลาง
 *   ดาวน์โหลด .DST = สร้างจากที่เห็นบนจอ · ใบสั่งปัก = /print/embroidery/<id> (ใช้ค่าที่บันทึกแล้ว)
 *   จอแคบ: ภาพอยู่บน แผงตั้งค่าเรียงลงมา
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { SaveBar } from "@/components/save-bar";
import { ConfirmDialog } from "@/components/modal";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { ART_ACCEPT } from "@/lib/block-print-ai";
import { skippedNote } from "@/components/block-print/shared";
import type { BlockPiece } from "@/lib/block-print";
import { buildPlan, cleanSettings, colorsOf, designBox, FABRICS, isActive, LIMITS, startWidth, STITCH_TYPES, warningGroups, withSelection, type BoxMm, type EmbSettings, type StitchType } from "@/lib/embroidery";
import { StitchPreview } from "./stitch-preview";
import { readLogoFile, SKIPPED_KEY } from "./list";
import { SelectStep, type PickResult } from "./select-step";
import { API, api, DENSITY, downloadDst, downloadPes, fmtNum, LIST_HREF, planStats, sheetHref, type Design } from "./shared";

type Snap = { pieces: BlockPiece[]; settings: EmbSettings };
type Meta = { name: string; note: string; parent: ParentSkuPickerValue | null };

const inputCls = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-indigo-400 focus:outline-none disabled:bg-slate-50";

export function EmbroideryEditor({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const canEdit = usePermission("embroidery.edit");
  const fileRef = useRef<HTMLInputElement>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [meta, setMeta] = useState<Meta>({ name: "", note: "", parent: null });
  const [saved, setSaved] = useState<string>("");
  const [history, setHistory] = useState<Snap[]>([]);
  const [saving, setSaving] = useState(false);
  const [upto, setUpto] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showJumps, setShowJumps] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [askTrash, setAskTrash] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ key: string; box: BoxMm } | null>(null);
  /** ขั้นเลือกส่วน: pieces = ชิ้นที่จะให้เลือก (ของเดิม หรือจากไฟล์ใหม่) */
  const [picking, setPicking] = useState<{ pieces: BlockPiece[]; fileName?: string; initialOn?: string[] } | null>(null);

  const keyOf = (s: Snap | null, m: Meta) => JSON.stringify([s?.settings, s?.pieces.length, s?.pieces[0]?.d.length, s?.pieces.map((p) => (p.on === false ? 0 : 1)).join(""), m.name, m.note, m.parent?.id ?? null]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await api<Design>(`${API}/${id}`);
      const s: Snap = { pieces: d.pieces, settings: cleanSettings(d.settings, d.pieces) };
      const m: Meta = { name: d.name, note: d.note ?? "", parent: d.parent ? { id: d.parent.id, code: d.parent.code, name: d.parent.name } : null };
      setDesign(d); setSnap(s); setMeta(m); setHistory([]); setSaved(keyOf(s, m));
      try {
        const raw = sessionStorage.getItem(SKIPPED_KEY(id));
        if (raw) { setSkipped(skippedNote(JSON.parse(raw)).filter((t) => !t.startsWith("พื้นหลัง"))); sessionStorage.removeItem(SKIPPED_KEY(id)); }
      } catch { /* ไม่มีที่จำ */ }
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const deferred = useDeferredValue(snap);
  const plan = useMemo(() => (deferred ? buildPlan(deferred.pieces, deferred.settings) : null), [deferred]);
  const box = useMemo(() => (snap ? designBox(snap.pieces) : null), [snap]);
  const dirty = !!snap && keyOf(snap, meta) !== saved;

  /** แก้ค่าตั้ง (จดประวัติไว้ย้อนกลับ) */
  const edit = useCallback((fn: (s: EmbSettings) => EmbSettings) => {
    setSnap((cur) => {
      if (!cur) return cur;
      setHistory((h) => [...h.slice(-49), cur]);
      // ผ่านตัวตรวจทุกครั้ง (กันค่า 0/ติดลบทำให้คำนวณค้าง)
      return { ...cur, settings: cleanSettings(fn(cur.settings), cur.pieces) };
    });
    setUpto(null);
  }, []);
  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      setSnap(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && (e.code === "KeyZ")) { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  // เล่นลำดับการปัก
  useEffect(() => {
    if (!playing || !plan) return;
    let raf = 0;
    const total = plan.cmds.length;
    const step = Math.max(1, Math.round(total / 600));
    const tick = () => {
      setUpto((u) => {
        const n = (u ?? 0) + step;
        if (n >= total) { setPlaying(false); return null; }
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, plan]);

  const save = async (): Promise<boolean> => {
    if (!snap || !plan) return false;
    if (!meta.name.trim()) { toast.error("ต้องใส่ชื่องาน"); return false; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name: meta.name, note: meta.note, parent_sku_id: meta.parent?.id ?? null, settings: snap.settings, ...planStats(buildPlan(snap.pieces, snap.settings)) };
      if (design && snap.pieces !== design.pieces) { body.pieces = snap.pieces; body.source_file_name = design.source_file_name; }
      const d = await api<Design>(`${API}/${id}`, { method: "PATCH", json: body });
      setDesign({ ...d, pieces: snap.pieces });
      setSaved(keyOf(snap, meta));
      toast.success("บันทึกแล้ว");
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); return false; }
    finally { setSaving(false); }
  };
  const discard = () => { void load(); };

  const replaceFile = async (file: File) => {
    try {
      const r = await readLogoFile(file);
      setPicking({ pieces: r.pieces, fileName: file.name });
      setSkipped(skippedNote(r.skipped).filter((t) => !t.startsWith("พื้นหลัง")));
    } catch (e) { toast.error(e instanceof Error ? e.message : "เปิดไฟล์ไม่สำเร็จ"); }
  };
  /** ผลขั้นเลือกส่วน → ใช้กับงานนี้ (ย้อนกลับได้) · แยกหลายงาน: กลุ่มแรกอยู่งานนี้ กลุ่มอื่นสร้างงานใหม่ */
  const applyPick = async (r: PickResult) => {
    const pk = picking; if (!pk || !snap) return;
    setPicking(null);
    const sets = r.mode === "one" ? [{ ids: r.on, label: "" }] : r.sets;
    const mine = withSelection(pk.pieces, sets[0].ids);
    const isNewFile = !!pk.fileName;
    setHistory((h) => [...h.slice(-49), snap]);
    setSnap({ pieces: mine, settings: cleanSettings({ ...snap.settings, width_mm: isNewFile || r.mode === "split" ? startWidth(mine) : snap.settings.width_mm, piece_types: isNewFile ? {} : snap.settings.piece_types }, mine) });
    if (isNewFile && design) setDesign({ ...design, source_file_name: pk.fileName ?? design.source_file_name });
    setSelectedId(null); setUpto(null);
    if (sets.length > 1) {
      try {
        for (const set of sets.slice(1)) {
          const pieces = withSelection(pk.pieces, set.ids);
          const settings = cleanSettings({ ...snap.settings, width_mm: startWidth(pieces), piece_types: {} }, pieces);
          await api<Design>(API, { json: { name: `${meta.name} – ${set.label}`, source_file_name: pk.fileName ?? design?.source_file_name ?? null, parent_sku_id: meta.parent?.id ?? null, pieces, settings, ...planStats(buildPlan(pieces, settings)) } });
        }
        toast.success(`สร้างงานใหม่อีก ${sets.length - 1} งานจากกลุ่มที่เหลือแล้ว (ดูที่หน้ารายการ) · งานนี้ใช้ ${sets[0].label} — กดบันทึก`);
      } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างงานไม่สำเร็จ"); }
    } else toast.success("เปลี่ยนส่วนที่ปักแล้ว — กดบันทึกเพื่อใช้ (ย้อนกลับได้)");
  };

  const toTrash = async () => {
    try {
      await api(`${API}/${id}`, { method: "DELETE" });
      toast.success("ย้ายเข้าถังขยะแล้ว — กู้คืนได้ที่ถังขยะหน้ารายการ");
      router.push(LIST_HREF);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  const openSheet = async () => {
    if (dirty && !(await save())) return;
    window.open(sheetHref(id), "_blank");
  };

  if (err) return <div className="mx-auto max-w-3xl p-6"><div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">{err} <button className="ml-2 underline" onClick={() => void load()}>ลองใหม่</button></div></div>;
  if (!design || !snap || !plan || !box) return <div className="mx-auto max-w-6xl p-6 text-sm text-slate-500">กำลังโหลด…</div>;

  const st = snap.settings;
  const ratio = box.w > 0 ? box.h / box.w : 1;
  const setWidth = (mm: number) => edit((s) => ({ ...s, width_mm: Math.min(LIMITS.width_max, Math.max(LIMITS.width_min, Math.round(mm * 10) / 10)) }));
  const density = DENSITY.find((d) => Math.abs(d.fill - st.fill_spacing) < 0.001 && Math.abs(d.satin - st.satin_spacing) < 0.001)?.key ?? "custom";
  const wgroups = warningGroups(plan, st.width_mm);
  const sel = selectedId ? plan.pieces.find((p) => p.id === selectedId) ?? null : null;
  const activeColors = colorsOf(snap.pieces, true);
  const setTypeMany = (ids: string[], t: StitchType | null) => edit((s) => { const pt = { ...s.piece_types }; for (const i of ids) { if (t) pt[i] = t; else delete pt[i]; } return { ...s, piece_types: pt }; });
  const piecesOfColor = (c: string) => snap.pieces.filter((p) => (p.color ?? "#000000") === c).length;
  const moveColor = (c: string, dir: -1 | 1) => edit((s) => {
    const o = [...s.color_order];
    const vis = o.filter((x) => activeColors.includes(x));
    const other = vis[vis.indexOf(c) + dir];
    if (!other) return s;
    const i = o.indexOf(c), j = o.indexOf(other);
    [o[i], o[j]] = [o[j], o[i]];
    return { ...s, color_order: o };
  });
  const setColor = (c: string, patch: Partial<EmbSettings["colors"][string]>) => edit((s) => ({ ...s, colors: { ...s.colors, [c]: { ...s.colors[c], ...patch } } }));
  const setPieceType = (pid: string, t: StitchType | null) => edit((s) => {
    const pt = { ...s.piece_types };
    if (t) pt[pid] = t; else delete pt[pid];
    return { ...s, piece_types: pt };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-3 pb-24 md:p-6 md:pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={LIST_HREF} className="text-sm text-slate-500 hover:text-slate-800">← ไฟล์ปัก</Link>
        <span className="font-mono text-xs text-slate-400">{design.code}</span>
        <input value={meta.name} disabled={!canEdit} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-slate-900 hover:border-slate-200 focus:border-indigo-400 focus:outline-none" />
        <span className="hidden text-xs text-slate-400 md:inline">{design.source_file_name}</span>
      </div>

      {skipped.length > 0 && (
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ตอนเปิดไฟล์ข้ามบางส่วน: {skipped.join(" · ")}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ───── ภาพตัวอย่าง ───── */}
        <div className="space-y-3">
          <StitchPreview plan={plan} upto={upto ?? undefined} showJumps={showJumps} fabric={st.fabric} selectedId={selectedId} focus={focus}
            onPick={canEdit ? setSelectedId : undefined} height={typeof window !== "undefined" && window.innerWidth < 768 ? 300 : 480} />
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <button type="button" onClick={() => { if (playing) setPlaying(false); else { setUpto(0); setPlaying(true); } }}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 hover:bg-slate-50">
              <Icon name="play" /> {playing ? "หยุด" : "เล่นลำดับการปัก"}
            </button>
            <input type="range" min={0} max={plan.cmds.length} value={upto ?? plan.cmds.length} onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setUpto(v >= plan.cmds.length ? null : v); }} className="min-w-[120px] flex-1" aria-label="ปักถึงฝีที่" />
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={showJumps} onChange={(e) => setShowJumps(e.target.checked)} /> เส้นกระโดด</label>
          </div>

          {sel && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="h-4 w-4 rounded border border-black/10" style={{ background: sel.color }} />
                <b className="font-medium text-slate-800">{sel.name}</b>
                <span className="text-xs text-slate-500">กว้างเฉลี่ย {sel.width.toFixed(1)} มม. · {fmtNum(sel.stitches)} ฝี · ตอนนี้: {STITCH_TYPES.find((t) => t.key === sel.type)?.th}{st.piece_types[sel.id] ? " (ตั้งเอง)" : " (ตามสี)"}</span>
                <button type="button" onClick={() => setSelectedId(null)} className="ml-auto text-xs text-slate-500 hover:text-slate-800">ปิด ×</button>
              </div>
              {sel.warn && <div className={`mt-1 text-xs ${sel.level === "danger" ? "text-red-700" : "text-amber-800"}`}>{sel.warn}</div>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STITCH_TYPES.filter((t) => t.key !== "auto").map((t) => (
                  <button key={t.key} type="button" title={t.hint} onClick={() => setPieceType(sel.id, t.key)}
                    className={`rounded-lg border px-2.5 py-1 text-xs ${st.piece_types[sel.id] === t.key ? "border-indigo-400 bg-white font-medium text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{t.th}</button>
                ))}
                {st.piece_types[sel.id] && <button type="button" onClick={() => setPieceType(sel.id, null)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50">ใช้ตามสี</button>}
              </div>
            </div>
          )}
          {!sel && canEdit && <p className="text-[11px] text-slate-400">คลิกชิ้นในภาพ เพื่อตั้งฝีเข็มเฉพาะชิ้นนั้น</p>}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="ฝีเข็ม" value={fmtNum(plan.stitches)} />
            <Stat label="สีด้าย / เปลี่ยนด้าย" value={`${plan.colors.length} / ${plan.colorChanges}`} />
            <Stat label="ตัดด้าย" value={fmtNum(plan.trims)} />
            <Stat label="เวลาปักโดยประมาณ" value={`~${Math.max(1, Math.round(plan.minutes))} นาที`} />
          </div>

          {wgroups.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-900"><Icon name="warning" /> ส่วนที่อาจปักไม่สวย ({wgroups.length} จุด · {wgroups.reduce((n, g) => n + g.ids.length, 0)} ชิ้น)</div>
              <ul className="space-y-2">
                {wgroups.slice(0, 20).map((g) => (
                  <li key={g.key} className="rounded-md bg-white/70 p-2 text-xs">
                    <div className={g.level === "danger" ? "text-red-700" : "text-amber-800"}>{g.text}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <button type="button" onClick={() => setFocus({ key: `${g.key}:${Date.now()}`, box: g.box })} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 hover:bg-amber-100">ดูในภาพ</button>
                      {canEdit && g.kind !== "wide" && <button type="button" onClick={() => setTypeMany(g.ids, "run")} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 hover:bg-amber-100">เดินเส้นทั้งกลุ่ม</button>}
                      {canEdit && g.kind === "wide" && <button type="button" onClick={() => setTypeMany(g.ids, "fill")} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 hover:bg-amber-100">ถมเต็มทั้งกลุ่ม</button>}
                      {canEdit && <button type="button" onClick={() => setTypeMany(g.ids, "skip")} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 hover:bg-amber-100">ไม่ปักทั้งกลุ่ม</button>}
                      {canEdit && g.fixWidthMm && g.fixWidthMm > st.width_mm && (
                        <button type="button" onClick={() => setWidth(g.fixWidthMm!)} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 hover:bg-amber-100">ขยายงานเป็น {(g.fixWidthMm / 10).toFixed(1)} ซม.</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-amber-700">ทางแก้ที่ดีที่สุด = ขยายขนาดงาน หรือทำเส้น/ตัวหนังสือให้หนาขึ้นในไฟล์ต้นฉบับ</p>
            </div>
          )}
          {Object.keys(st.piece_types).length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
              <div className="mb-1.5 flex items-center font-medium text-slate-700">ชิ้นที่ตั้งฝีเข็มเอง ({Object.keys(st.piece_types).length})
                {canEdit && <button type="button" onClick={() => edit((s) => ({ ...s, piece_types: {} }))} className="ml-auto font-normal text-slate-500 underline">ล้างทั้งหมด</button>}
              </div>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto">
                {Object.entries(st.piece_types).map(([pid, t]) => (
                  <span key={pid} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5">
                    <button type="button" onClick={() => setSelectedId(pid)} className="hover:underline">{snap.pieces.find((p) => p.id === pid)?.name ?? pid}</button>: {STITCH_TYPES.find((x) => x.key === t)?.th}
                    {canEdit && <button type="button" onClick={() => setPieceType(pid, null)} className="text-slate-400 hover:text-red-600" aria-label="ใช้ตามสี">×</button>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ───── แผงตั้งค่า ───── */}
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-slate-500">ขนาดจริงที่ปัก (ซม.)</div>
            <div className="flex items-center gap-2">
              <input type="number" step={0.1} min={LIMITS.width_min / 10} max={LIMITS.width_max / 10} disabled={!canEdit} className={inputCls}
                value={Math.round(st.width_mm) / 10} onChange={(e) => { const v = Number(e.target.value); if (v > 0) setWidth(v * 10); }} aria-label="กว้าง ซม." />
              <span className="text-slate-400">×</span>
              <input type="number" step={0.1} disabled={!canEdit} className={inputCls}
                value={Math.round(st.width_mm * ratio) / 10} onChange={(e) => { const v = Number(e.target.value); if (v > 0 && ratio > 0) setWidth((v * 10) / ratio); }} aria-label="สูง ซม." />
              <Icon name="lock" title="ล็อกสัดส่วน" className="shrink-0 text-slate-400" />
            </div>
            <div className="mt-3 mb-1.5 text-xs font-medium text-slate-500">ความแน่นตามผ้า</div>
            <div className="flex flex-wrap gap-1.5">
              {DENSITY.map((d) => (
                <button key={d.key} type="button" disabled={!canEdit} onClick={() => edit((s) => ({ ...s, fill_spacing: d.fill, satin_spacing: d.satin }))}
                  className={`rounded-lg border px-2.5 py-1 text-xs ${density === d.key ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{d.th}</button>
              ))}
              <button type="button" onClick={() => setAdvanced((a) => !a)} className="ml-auto text-xs text-slate-500 underline">{advanced ? "ซ่อนค่าละเอียด" : "ค่าละเอียด"}</button>
            </div>
            {advanced && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <NumField label="ระยะแถวถมเต็ม (มม.)" value={st.fill_spacing} step={0.05} disabled={!canEdit} onChange={(v) => edit((s) => ({ ...s, fill_spacing: v }))} />
                <NumField label="ระยะฝีซิกแซก (มม.)" value={st.satin_spacing} step={0.05} disabled={!canEdit} onChange={(v) => edit((s) => ({ ...s, satin_spacing: v }))} />
                <NumField label="ความยาวฝีถม (มม.)" value={st.fill_len} step={0.5} disabled={!canEdit} onChange={(v) => edit((s) => ({ ...s, fill_len: v }))} />
                <NumField label="ความยาวฝีเดินเส้น (มม.)" value={st.run_len} step={0.5} disabled={!canEdit} onChange={(v) => edit((s) => ({ ...s, run_len: v }))} />
                <NumField label="ชดเชยผ้าหด (มม.)" value={st.pull_comp} step={0.05} disabled={!canEdit} onChange={(v) => edit((s) => ({ ...s, pull_comp: v }))} />
                <NumField label="ตัดด้ายเมื่อย้ายไกลเกิน (มม.)" value={st.trim_at} step={0.5} disabled={!canEdit} onChange={(v) => edit((s) => ({ ...s, trim_at: v }))} />
              </div>
            )}
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" disabled={!canEdit} checked={st.underlay} onChange={(e) => edit((s) => ({ ...s, underlay: e.target.checked }))} />
              ฝีรองพื้นอัตโนมัติ <span className="text-slate-400">(ผ้าเรียบขึ้น ตัวหนังสือนูนชัด · เพิ่มฝีเข็ม)</span>
            </label>
            <div className="mt-3 mb-1.5 text-xs font-medium text-slate-500">สีพื้นผ้า (ภาพตัวอย่าง + ใบสั่งปัก)</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {FABRICS.map((fb) => (
                <button key={fb.hex} type="button" disabled={!canEdit} title={fb.th} aria-label={`ผ้าสี${fb.th}`} onClick={() => edit((s) => ({ ...s, fabric: fb.hex }))}
                  className={`h-7 w-7 rounded-full border ${st.fabric === fb.hex ? "ring-2 ring-indigo-500 ring-offset-1" : "border-slate-300"}`} style={{ background: fb.hex }} />
              ))}
              <input type="color" disabled={!canEdit} value={st.fabric} onChange={(e) => edit((s) => ({ ...s, fabric: e.target.value }))} className="h-7 w-9 cursor-pointer rounded border border-slate-200" aria-label="สีผ้าอื่น" />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-slate-500">สีด้าย → ชนิดฝีเข็ม (เรียงตามลำดับที่ปัก)</div>
            <ul className="divide-y divide-slate-100">
              {st.color_order.filter((c) => activeColors.includes(c)).map((c, i, vis) => {
                const cs = st.colors[c];
                if (!cs) return null;
                const cb = plan.colors.find((x) => x.color === c);
                return (
                  <li key={c} className={`space-y-1.5 py-2 ${cs.on ? "" : "opacity-50"}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-4 text-center text-xs text-slate-400">{i + 1}</span>
                      <span className="h-5 w-5 shrink-0 rounded border border-black/10" style={{ background: c }} title={c} />
                      <select disabled={!canEdit || !cs.on} value={cs.type} onChange={(e) => setColor(c, { type: e.target.value as StitchType })} className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-1.5 text-sm">
                        {STITCH_TYPES.filter((t) => t.key !== "skip").map((t) => <option key={t.key} value={t.key}>{t.th}</option>)}
                      </select>
                      {canEdit && (
                        <span className="flex shrink-0">
                          <button type="button" disabled={i === 0} onClick={() => moveColor(c, -1)} className="px-1 text-slate-400 hover:text-slate-800 disabled:opacity-30" aria-label="ปักก่อน">▲</button>
                          <button type="button" disabled={i === vis.length - 1} onClick={() => moveColor(c, 1)} className="px-1 text-slate-400 hover:text-slate-800 disabled:opacity-30" aria-label="ปักทีหลัง">▼</button>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pl-6 text-xs text-slate-500">
                      <input disabled={!canEdit} value={cs.thread} placeholder="รหัสด้าย เช่น Madeira 1000" onChange={(e) => setColor(c, { thread: e.target.value })}
                        className="h-7 min-w-0 flex-1 rounded border border-slate-200 px-1.5 text-xs" />
                      {(cs.type === "fill" || cs.type === "auto") && (
                        <label className="inline-flex items-center gap-1" title="มุมแถวถมเต็ม">มุม
                          <input type="number" disabled={!canEdit} value={cs.angle} step={15} onChange={(e) => setColor(c, { angle: ((Math.round(Number(e.target.value) || 0) % 180) + 180) % 180 })}
                            className="h-7 w-14 rounded border border-slate-200 px-1 text-xs" />°</label>
                      )}
                      <label className="inline-flex items-center gap-1"><input type="checkbox" disabled={!canEdit} checked={cs.on} onChange={(e) => setColor(c, { on: e.target.checked })} /> ปัก</label>
                    </div>
                    <div className="pl-6 text-[11px] text-slate-400">{piecesOfColor(c)} ชิ้น · {fmtNum(cb?.stitches ?? 0)} ฝี</div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-[11px] text-slate-400">อัตโนมัติ = ส่วนแคบ (≤ 6 มม.) ใช้ซิกแซก ส่วนกว้างถมเต็ม · สีที่ปักทีหลังจะทับสีก่อน</p>
          </section>

          <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium text-slate-500">ผูกกับสินค้า (Parent SKU)</div>
            <ParentSkuPicker value={meta.parent} onChange={(v) => setMeta((m) => ({ ...m, parent: v }))} disabled={!canEdit} disableCreate />
            <div className="text-xs font-medium text-slate-500">หมายเหตุถึงร้านปัก</div>
            <textarea disabled={!canEdit} rows={2} value={meta.note} onChange={(e) => setMeta((m) => ({ ...m, note: e.target.value }))} placeholder="เช่น ปักบนผ้าแคนวาส ตำแหน่งหน้ากระเป๋า"
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none" />
          </section>

          <section className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadDst(plan, design.code, meta.name)}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700">
              <Icon name="download" /> ดาวน์โหลด .DST
            </button>
            <button type="button" onClick={() => downloadPes(plan, design.code, meta.name)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50" title="Brother">
              <Icon name="download" /> .PES
            </button>
            <button type="button" onClick={() => void openSheet()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
              <Icon name="printer" /> ใบสั่งปัก
            </button>
            {canEdit && (
              <>
                <button type="button" disabled={!history.length} onClick={undo} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40" title="Ctrl+Z">
                  <Icon name="history" /> ย้อนกลับ
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
                  <Icon name="refresh" /> เปิดไฟล์ใหม่
                </button>
                <button type="button" onClick={() => setPicking({ pieces: snap.pieces, initialOn: snap.pieces.filter(isActive).map((p) => p.id) })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
                  <Icon name="link" /> เลือกส่วนที่ปัก
                </button>
                <button type="button" onClick={() => setAskTrash(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-sm text-red-600 hover:bg-red-50">
                  <Icon name="trash" /> ลบ
                </button>
              </>
            )}
            <input ref={fileRef} type="file" accept={ART_ACCEPT} className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void replaceFile(f); }} />
          </section>
          <p className="text-[11px] leading-relaxed text-slate-400">
            ไฟล์ .DST ไม่มีข้อมูลสี — ร้านดูลำดับสีจากใบสั่งปัก · แปลงอัตโนมัติยังไม่มีฝีรองพื้น และซิกแซกวิ่งทิศเดียวต่อชิ้น ควรให้ร้านปักทดสอบก่อนสั่งจริง
          </p>
        </div>
      </div>

      {picking && <SelectStep key={(picking.fileName ?? "") + picking.pieces.length} open pieces={picking.pieces} initialOn={picking.initialOn ?? null}
        onCancel={() => setPicking(null)} onDone={(r) => void applyPick(r)} title={picking.fileName ? `เลือกส่วนที่จะปัก — ${picking.fileName}` : "เลือกส่วนที่จะปัก"} />}
      {canEdit && <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={discard} />}
      <ConfirmDialog open={askTrash} onClose={() => setAskTrash(false)} onConfirm={() => void toTrash()} variant="danger"
        title="ย้ายงานนี้เข้าถังขยะ?" message={<>ย้าย <b>{design.code} {meta.name}</b> เข้าถังขยะ — กู้คืนได้ที่ถังขยะหน้ารายการ</>} confirmText="ย้ายเข้าถังขยะ" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-base font-semibold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

function NumField({ label, value, step, disabled, onChange }: { label: string; value: number; step: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <label className="space-y-0.5">
      <span className="block">{label}</span>
      <input type="number" step={step} value={value} disabled={disabled} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) onChange(v); }}
        className="h-8 w-full rounded border border-slate-200 px-1.5 text-sm" />
    </label>
  );
}
