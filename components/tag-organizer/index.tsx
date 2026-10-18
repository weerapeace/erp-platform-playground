"use client";

/**
 * TagOrganizerModal — จัดการแท็กแบบ "ลากวาง" (ของกลาง)
 *
 * เปิดจากปุ่ม "จัดการแท็ก" ในตัวเลือกแท็ก (m2m ที่มีระบบกลุ่ม = product_families) และหน้า /master/tags-manager
 * ความสามารถ:
 *   • ลากแท็กไปวาง "ระหว่าง" แท็ก → ย้ายกลุ่ม (group_id) + เรียงลำดับ (sort_order)
 *   • ลากแท็กไปวาง "ทับกลาง" แท็กอื่น → เป็นแท็กย่อย (Sub) ของแท็กนั้น
 *       = ย้ายเข้าหมวดย่อยชื่อเดียวกับแท็กแม่ (ยังไม่มีก็สร้างให้) เช่น ซิปไนล่อน #3 → ↳ ซิป
 *   • ลากหัวกลุ่มไปวาง "ทับกลาง" หัวกลุ่มอื่น → เป็นหมวดย่อยของกลุ่มนั้น · วางขอบบน/ล่าง = เรียงลำดับ
 *   • ชื่ออังกฤษ (name_en) ทั้งแท็กและกลุ่ม/หมวดย่อย — โชว์คู่ชื่อไทย · แก้ในป๊อปแก้ชื่อ · ปุ่ม 🌐 แปลให้ / แปลที่ยังขาดทีเดียว
 *     แท็กแม่ ↔ หมวดย่อยชื่อเดียวกัน = คู่ผูกกัน → เปลี่ยนชื่อฝั่งไหน อีกฝั่งเปลี่ยนตาม
 *   • เพิ่ม / แก้ชื่อ / ลบ แท็ก และ กลุ่ม (เพิ่ม/แก้ชื่อใช้ป๊อปในตัว ไม่ใช้ window.prompt)
 * บันทึกทันทีต่อการลากแต่ละครั้ง (optimistic + PATCH master-v2 ซึ่งเขียน audit log ให้)
 *
 * โครงกลุ่มมี 2 ชั้น (กลุ่มหลัก → หมวดย่อย) — ไม่ยอมให้ลากจนเกิดชั้นที่ 3 เพราะหน้าจอเลือกแท็กทุกที่โชว์ไม่ได้
 *
 * ⚠️ ชิ้นส่วนในป๊อปเป็น "ฟังก์ชันวาด" (renderX) ไม่ใช่ component ที่ประกาศซ้อนใน component
 *    เดิมเขียนเป็น <TagChip/> ซ้อนข้างใน → ทุกครั้งที่จอวาดใหม่ระหว่างลาก React ถอดชิ้นเก่าทิ้งแล้วสร้างใหม่
 *    → เบราว์เซอร์เสียตัวที่กำลังลาก (วางไม่ติด / เส้นประค้าง)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { translateContent } from "@/lib/content-translate";
import { subGroupOfTag as findSubGroupOfTag, parentTagOfGroup } from "@/lib/tag-hierarchy";
import { TagUsageModal } from "@/components/tag-usage";

type Tag = { id: string; label: string; en: string; group_id: string | null; sort_order: number };
type Grp = {
  id: string; name: string; en: string; parent_group_id: string | null;
  single_select: boolean; sort_order: number; icon: string | null;
};

const TOP = "__top__";    // คีย์ "ระดับบนสุด" (ไม่มีกลุ่มแม่)
const NONE = "__none__";  // คีย์ "แท็กที่ยังไม่มีกลุ่ม"

const GROUP_MODULE = "product_family_groups";
const EN_FIELD = "name_en";   // ชื่ออังกฤษ (product_families.name_en / product_family_groups.name_en)

type Hint =
  | { type: "tag"; container: string; beforeId: string | null }   // วางแท็กก่อน beforeId (null = ท้ายสุด)
  | { type: "tagSub"; parentTagId: string }                       // วางทับกลางแท็ก = เป็นแท็กย่อย
  | { type: "group"; parent: string; beforeId: string | null }    // วางกลุ่มก่อน beforeId ใต้ parent (TOP = ชั้นบน)
  | { type: "groupInto"; targetId: string }                       // วางทับกลางหัวกลุ่ม = เป็นหมวดย่อย
  | null;
type DragInfo = { kind: "tag" | "group"; id: string } | null;
// ป๊อปแก้ชื่อ ไทย+อังกฤษ: แก้แท็ก / แก้กลุ่ม / สร้างกลุ่มใหม่ (parentId = null → กลุ่มหลัก)
type EditState =
  | { mode: "tag"; id: string; th: string; en: string }
  | { mode: "group"; id: string; th: string; en: string }
  | { mode: "newGroup"; parentId: string | null; th: string; en: string }
  | null;
type BulkRow = { kind: "tag" | "group"; id: string; th: string; en: string };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "network");
const JSON_HEADERS = { "Content-Type": "application/json" };

/** ยิง request แล้วโยน error ถ้าไม่สำเร็จ (เดิมไม่เช็ก → บันทึกพลาดแต่จอบอกว่าย้ายแล้ว) */
async function must(p: Promise<Response>): Promise<Record<string, unknown>> {
  const res = await p;
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || j.error) throw new Error(String(j.error ?? res.status));
  return j;
}

export function TagOrganizerModal({
  moduleKey, labelField, onClose, onChanged,
}: {
  moduleKey: string;       // = "product_families"
  labelField: string;      // = "name"
  onClose: () => void;
  onChanged: () => void;    // ให้ parent reload (ตัวเลือกแท็ก/กลุ่ม)
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [groups, setGroups] = useState<Grp[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);   // แจ้งผลสั้น ๆ เช่น "ย้ายเป็นแท็กย่อยแล้ว"
  const [newTag, setNewTag] = useState("");
  const [newTagEn, setNewTagEn] = useState("");
  const [translating, setTranslating] = useState(false);
  const [edit, setEdit] = useState<EditState>(null);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [bulk, setBulk] = useState<BulkRow[] | null>(null);
  const [usageTagId, setUsageTagId] = useState<string | null>(null);   // 🔗 ป๊อปแท็กนี้ลิงก์กับอะไร

  const dragRef = useRef<DragInfo>(null);
  const [drag, setDrag] = useState<DragInfo>(null);   // ให้จอวาดโซนวาง / จางตัวที่กำลังลาก
  const hintRef = useRef<Hint>(null);
  const [hint, setHintState] = useState<Hint>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // dragover ยิงถี่มาก — ตำแหน่งเดิมไม่ต้องวาดใหม่
  const setHint = useCallback((h: Hint) => {
    if (JSON.stringify(hintRef.current) === JSON.stringify(h)) return;
    hintRef.current = h; setHintState(h);
  }, []);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);

  // ---- โหลดข้อมูล ----
  const loadTags = useCallback(async () => {
    const j = await apiFetch(`/api/master-v2/${moduleKey}?limit=500`).then((r) => r.json());
    setTags(((j.data ?? j.rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), label: String(r[labelField] ?? r.name ?? r.id),
      en: String(r[EN_FIELD] ?? "").trim(),
      group_id: r.group_id ? String(r.group_id) : null, sort_order: Number(r.sort_order ?? 100),
    })));
  }, [moduleKey, labelField]);
  const loadGroups = useCallback(async () => {
    const j = await apiFetch(`/api/master-v2/${GROUP_MODULE}?limit=500`).then((r) => r.json());
    setGroups(((j.data ?? []) as Record<string, unknown>[]).map((g) => ({
      id: String(g.id), name: String(g.name ?? ""), en: String(g[EN_FIELD] ?? "").trim(),
      parent_group_id: g.parent_group_id ? String(g.parent_group_id) : null,
      single_select: g.single_select === true, sort_order: Number(g.sort_order ?? 100),
      icon: g.icon ? String(g.icon) : null,
    })));
  }, []);
  useEffect(() => {
    (async () => {
      try { await Promise.all([loadTags(), loadGroups()]); }
      catch (e) { setErr("โหลดแท็กไม่สำเร็จ กรุณาลองใหม่: " + errMsg(e)); }
      finally { setLoading(false); }
    })();
  }, [loadTags, loadGroups]);

  // ---- โครงสร้างกลุ่ม ----
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const byOrder = useCallback(
    (a: { sort_order: number; label?: string; name?: string }, b: { sort_order: number; label?: string; name?: string }) =>
      a.sort_order - b.sort_order || String(a.label ?? a.name ?? "").localeCompare(String(b.label ?? b.name ?? ""), "th"),
    [],
  );
  const isSubGroup = useCallback((g: Grp) => !!g.parent_group_id && groupById.has(g.parent_group_id), [groupById]);
  const parentKeyOf = useCallback((g: Grp) => (isSubGroup(g) ? g.parent_group_id! : TOP), [isSubGroup]);
  const topGroups = useMemo(() => groups.filter((g) => !isSubGroup(g)).slice().sort(byOrder), [groups, isSubGroup, byOrder]);
  const subsOf = useCallback((gid: string) => groups.filter((g) => g.parent_group_id === gid).slice().sort(byOrder), [groups, byOrder]);
  const groupsUnder = useCallback((key: string) => (key === TOP ? topGroups : subsOf(key)), [topGroups, subsOf]);

  const containerKeyOf = useCallback((t: Tag) => (t.group_id && groupById.has(t.group_id) ? t.group_id : NONE), [groupById]);
  const tagsOf = useCallback((key: string) => tags.filter((t) => containerKeyOf(t) === key).slice().sort(byOrder), [tags, containerKeyOf, byOrder]);

  const isUnder = (node: string | null, ancestor: string): boolean => {
    let c = node; const seen = new Set<string>();
    while (c && !seen.has(c)) { seen.add(c); if (c === ancestor) return true; c = groupById.get(c)?.parent_group_id ?? null; }
    return false;
  };
  // แท็กแม่ที่รับแท็กย่อยได้ = อยู่ในกลุ่มหลัก (ชั้น 1) · แท็กในหมวดย่อย/ไม่มีกลุ่ม รับไม่ได้ (จะเกิดชั้น 3 / ไม่มีกลุ่มให้ผูก)
  const canNestUnder = (p: Tag, dragId: string) => {
    if (p.id === dragId) return false;
    const g = groupById.get(containerKeyOf(p));
    return !!g && !isSubGroup(g);
  };
  // หมวดย่อยที่ผูกกับแท็กแม่ = ชื่อตรงกัน + อยู่ใต้กลุ่มเดียวกับแท็กแม่ (กฎกลาง lib/tag-hierarchy)
  const subGroupOfTag = (p: Tag) => findSubGroupOfTag(p.label, containerKeyOf(p) === NONE ? null : p.group_id, groups);
  // กลับทาง: แท็กแม่ของหมวดย่อย — เปลี่ยนชื่อฝั่งไหนก็เปลี่ยนอีกฝั่งตาม
  const tagOfSubGroup = (s: Grp) => (isSubGroup(s) ? parentTagOfGroup(s, tags, (t) => t.label) : null);
  // กลุ่มที่ลากลงไปเป็นหมวดย่อยของ targetId ได้ไหม
  const canGroupInto = (dragId: string, targetId: string) => {
    if (dragId === targetId || isUnder(targetId, dragId)) return false;
    const tg = groupById.get(targetId);
    if (!tg || isSubGroup(tg)) return false;
    return subsOf(dragId).length === 0;   // กลุ่มที่มีหมวดย่อยอยู่ ลงไปเป็นหมวดย่อยไม่ได้ (จะเกิดชั้น 3)
  };

  // ---- persist helpers ----
  const patchTag = (id: string, body: Record<string, unknown>) =>
    apiFetch(`/api/master-v2/${moduleKey}/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) });
  const patchGroup = (id: string, body: Record<string, unknown>) =>
    apiFetch(`/api/master-v2/${GROUP_MODULE}/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) });

  // ---- ลาก ----
  const startDrag = (e: React.DragEvent, info: NonNullable<DragInfo>) => {
    dragRef.current = info;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", info.id); } catch { /* ไม่รองรับ */ }
    // เลื่อน setState ออกไป — เปลี่ยน DOM ระหว่าง dragstart ทำให้เบราว์เซอร์ยกเลิกการลาก
    setTimeout(() => setDrag(info), 0);
  };
  const cleanupDrag = useCallback(() => {
    dragRef.current = null; setDrag(null); hintRef.current = null; setHintState(null);
  }, []);
  // กันค้าง: ปล่อยนอกป๊อป / กด Esc ระหว่างลาก → ล้างโซนวาง
  useEffect(() => {
    if (!drag) return;
    window.addEventListener("dragend", cleanupDrag, true);
    return () => window.removeEventListener("dragend", cleanupDrag, true);
  }, [drag, cleanupDrag]);

  // ลากค้างใกล้ขอบบน/ล่าง → เลื่อนรายการให้เอง
  const autoScroll = (e: React.DragEvent) => {
    const el = scrollRef.current; if (!el || !dragRef.current) return;
    const r = el.getBoundingClientRect(); const edge = 56;
    if (e.clientY < r.top + edge) el.scrollTop -= Math.ceil((r.top + edge - e.clientY) / 3);
    else if (e.clientY > r.bottom - edge) el.scrollTop += Math.ceil((e.clientY - (r.bottom - edge)) / 3);
  };

  // ---- ย้ายแท็ก (ย้ายกลุ่ม + เรียงลำดับ) ----
  const moveTag = async (dragId: string, container: string, beforeId: string | null) => {
    const moving = tags.find((t) => t.id === dragId); if (!moving) return;
    const current = tagsOf(container);
    const list = current.filter((t) => t.id !== dragId);
    let idx = beforeId ? list.findIndex((t) => t.id === beforeId) : list.length;
    if (idx < 0) idx = list.length;
    list.splice(idx, 0, moving);
    // วางที่เดิม → ไม่ต้องบันทึก
    if (containerKeyOf(moving) === container && list.map((t) => t.id).join() === current.map((t) => t.id).join()) return;

    const targetGroupId = container === NONE ? null : container;
    const orderMap = new Map(list.map((t, i) => [t.id, i * 10]));
    setTags((prev) => prev.map((t) =>
      orderMap.has(t.id) ? { ...t, group_id: t.id === dragId ? targetGroupId : t.group_id, sort_order: orderMap.get(t.id)! } : t));

    // บันทึกเฉพาะตัวที่ย้าย + ตัวที่ลำดับเปลี่ยนจริง
    const changed = list.filter((t) => t.id === dragId || t.sort_order !== orderMap.get(t.id));
    setBusy(true); setErr(null);
    try {
      await Promise.all(changed.map((t) => must(patchTag(t.id,
        t.id === dragId ? { group_id: targetGroupId, sort_order: orderMap.get(t.id)! } : { sort_order: orderMap.get(t.id)! }))));
      onChanged();
    } catch (e) { setErr("บันทึกการย้ายแท็กไม่สำเร็จ: " + errMsg(e)); await loadTags(); }
    finally { setBusy(false); }
  };

  // ---- ทำเป็นแท็กย่อย (Sub) — ย้ายเข้าหมวดย่อยชื่อเดียวกับแท็กแม่ ----
  const nestTag = async (dragId: string, parentTagId: string) => {
    const moving = tags.find((t) => t.id === dragId);
    const p = tags.find((t) => t.id === parentTagId);
    if (!moving || !p || !canNestUnder(p, dragId)) return;
    const topId = containerKeyOf(p);
    setBusy(true); setErr(null);
    try {
      let sub = subGroupOfTag(p);
      if (!sub) {
        const sibs = subsOf(topId);
        const order = (sibs.length ? Math.max(...sibs.map((s) => s.sort_order)) : 0) + 10;
        const j = await must(apiFetch(`/api/master-v2/${GROUP_MODULE}`, {
          method: "POST", headers: JSON_HEADERS,
          body: JSON.stringify({ name: p.label, [EN_FIELD]: p.en || null, parent_group_id: topId, single_select: false, sort_order: order }),
        }));
        const id = (j.data as { id?: unknown } | undefined)?.id;
        if (!id) throw new Error("ไม่ได้รหัสหมวดย่อยกลับมา");
        sub = { id: String(id), name: p.label, en: p.en, parent_group_id: topId, single_select: false, sort_order: order, icon: null };
        const created = sub;
        setGroups((prev) => [...prev, created]);
      }
      const subId = sub.id;
      if (moving.group_id === subId) return;   // อยู่ในนั้นอยู่แล้ว
      const inSub = tags.filter((t) => t.group_id === subId && t.id !== dragId);
      const order = (inSub.length ? Math.max(...inSub.map((t) => t.sort_order)) : 0) + 10;
      setTags((prev) => prev.map((t) => (t.id === dragId ? { ...t, group_id: subId, sort_order: order } : t)));
      await must(patchTag(dragId, { group_id: subId, sort_order: order }));
      setNote(`ย้าย “${moving.label}” เป็นแท็กย่อยของ “${p.label}” แล้ว`);
      onChanged();
    } catch (e) {
      setErr("ทำเป็นแท็กย่อยไม่สำเร็จ: " + errMsg(e));
      await Promise.all([loadTags(), loadGroups()]);
    } finally { setBusy(false); }
  };

  // ---- ย้ายกลุ่ม/หมวดย่อย (เรียงลำดับ + เปลี่ยนกลุ่มแม่) ----
  const moveGroup = async (dragId: string, parentKey: string, beforeId: string | null) => {
    const moving = groupById.get(dragId); if (!moving) return;
    const newParent = parentKey === TOP ? null : parentKey;
    if (newParent) {
      if (newParent === dragId || isUnder(newParent, dragId)) return;
      const pg = groupById.get(newParent);
      if (!pg || isSubGroup(pg)) { setErr("ซ้อนหมวดย่อยอีกชั้นไม่ได้ (รองรับ 2 ชั้น: กลุ่ม → หมวดย่อย)"); return; }
      if (subsOf(dragId).length > 0) { setErr(`“${moving.name}” มีหมวดย่อยอยู่ — ย้ายหมวดย่อยออกก่อน ถึงจะไปเป็นหมวดย่อยของกลุ่มอื่นได้`); return; }
    }
    const current = groupsUnder(parentKey);
    const list = current.filter((g) => g.id !== dragId);
    let idx = beforeId ? list.findIndex((g) => g.id === beforeId) : list.length;
    if (idx < 0) idx = list.length;
    list.splice(idx, 0, moving);
    if (parentKeyOf(moving) === parentKey && list.map((g) => g.id).join() === current.map((g) => g.id).join()) return;

    const orderMap = new Map(list.map((g, i) => [g.id, i * 10]));
    setGroups((prev) => prev.map((g) =>
      orderMap.has(g.id) ? { ...g, parent_group_id: g.id === dragId ? newParent : g.parent_group_id, sort_order: orderMap.get(g.id)! } : g));

    const changed = list.filter((g) => g.id === dragId || g.sort_order !== orderMap.get(g.id));
    setBusy(true); setErr(null);
    try {
      await Promise.all(changed.map((g) => must(patchGroup(g.id,
        g.id === dragId ? { parent_group_id: newParent, sort_order: orderMap.get(g.id)! } : { sort_order: orderMap.get(g.id)! }))));
      if (newParent && parentKeyOf(moving) !== parentKey) setNote(`ย้าย “${moving.name}” เป็นหมวดย่อยของ “${groupById.get(newParent)?.name ?? ""}” แล้ว`);
      onChanged();
    } catch (e) { setErr("บันทึกการย้ายกลุ่มไม่สำเร็จ: " + errMsg(e)); await loadGroups(); }
    finally { setBusy(false); }
  };

  const applyDrop = () => {
    const d = dragRef.current; const h = hintRef.current;
    cleanupDrag();
    if (!d || !h) return;
    if (d.kind === "tag" && h.type === "tag") void moveTag(d.id, h.container, h.beforeId);
    else if (d.kind === "tag" && h.type === "tagSub") void nestTag(d.id, h.parentTagId);
    else if (d.kind === "group" && h.type === "group") void moveGroup(d.id, h.parent, h.beforeId);
    else if (d.kind === "group" && h.type === "groupInto") void moveGroup(d.id, h.targetId, null);
  };

  // ---- CRUD แท็ก ----
  const translateNew = async () => {
    const n = newTag.trim(); if (!n) return;
    setTranslating(true); setErr(null);
    try {
      const [en] = await translateContent([n]);
      if (en) setNewTagEn(en); else setErr("แปลไม่ได้ ลองพิมพ์ชื่ออังกฤษเอง");
    } catch (e) { setErr(errMsg(e)); }
    finally { setTranslating(false); }
  };
  const addTag = async () => {
    const n = newTag.trim(); if (!n) return;
    const en = newTagEn.trim();
    setBusy(true); setErr(null);
    try {
      await must(apiFetch(`/api/master-v2/${moduleKey}`, {
        method: "POST", headers: JSON_HEADERS,
        body: JSON.stringify(en ? { [labelField]: n, [EN_FIELD]: en } : { [labelField]: n }),
      }));
      setNewTag(""); setNewTagEn(""); await loadTags(); onChanged();
    } catch (e) { setErr("เพิ่มแท็กไม่สำเร็จ: " + errMsg(e)); }
    finally { setBusy(false); }
  };

  const openEdit = (t: Tag) => { setEdit({ mode: "tag", id: t.id, th: t.label, en: t.en }); setEditErr(null); };
  const openGroupEdit = (g: Grp) => { setEdit({ mode: "group", id: g.id, th: g.name, en: g.en }); setEditErr(null); };
  const openNewGroup = (parentId: string | null) => { setEdit({ mode: "newGroup", parentId, th: "", en: "" }); setEditErr(null); };

  // ค่าเดิมของสิ่งที่กำลังแก้ (ไว้เทียบว่าเปลี่ยนอะไร) + คู่ที่ผูกชื่อกัน (แท็กแม่ ↔ หมวดย่อย) ที่ต้องเปลี่ยนตาม
  type Linked = { kind: "tag" | "group"; id: string; name: string; en: string };
  const editInfo = ((): { orig: { th: string; en: string }; linked: Linked | null } | null => {
    if (!edit) return null;
    if (edit.mode === "newGroup") return { orig: { th: "", en: "" }, linked: null };
    if (edit.mode === "tag") {
      const t = tags.find((x) => x.id === edit.id); if (!t) return null;
      const s = subGroupOfTag(t);
      return { orig: { th: t.label, en: t.en }, linked: s ? { kind: "group", id: s.id, name: s.name, en: s.en } : null };
    }
    const g = groupById.get(edit.id); if (!g) return null;
    const t = tagOfSubGroup(g);
    return { orig: { th: g.name, en: g.en }, linked: t ? { kind: "tag", id: t.id, name: t.label, en: t.en } : null };
  })();
  const editDirty = !!(edit && editInfo && (edit.th.trim() !== editInfo.orig.th || edit.en.trim() !== editInfo.orig.en));
  // ชื่อไทยเปลี่ยน → คู่ต้องเปลี่ยนตาม (ไม่งั้นหลุดกัน) · ชื่ออังกฤษ → ตามด้วยถ้าคู่ยังว่าง/เหมือนของเดิม (ไม่ทับที่ตั้งแยกไว้)
  const linkedPatch = (): Record<string, unknown> => {
    if (!edit || !editInfo?.linked) return {};
    const { orig, linked } = editInfo;
    const th = edit.th.trim(); const en = edit.en.trim();
    const p: Record<string, unknown> = {};
    if (th && th !== orig.th) p[linked.kind === "tag" ? labelField : "name"] = th;
    if (en !== orig.en && (!linked.en || linked.en === orig.en)) p[EN_FIELD] = en || null;
    return p;
  };
  const closeEdit = () => {
    if (editDirty && !window.confirm("คุณมีข้อมูลที่ยังไม่ได้บันทึก\nต้องการออกโดยไม่บันทึกหรือไม่?")) return;
    setEdit(null);
  };
  const translateEdit = async () => {
    if (!edit?.th.trim()) return;
    setTranslating(true); setEditErr(null);
    try {
      const [en] = await translateContent([edit.th.trim()]);
      if (en) setEdit((s) => (s ? { ...s, en } : s)); else setEditErr("แปลไม่ได้ ลองพิมพ์ชื่ออังกฤษเอง");
    } catch (e) { setEditErr(errMsg(e)); }
    finally { setTranslating(false); }
  };
  const saveEdit = async () => {
    if (!edit || !editInfo) return;
    const th = edit.th.trim(); const en = edit.en.trim();
    if (!th) { setEditErr("ต้องใส่ชื่อไทย"); return; }

    if (edit.mode === "newGroup") {
      setBusy(true); setEditErr(null);
      try {
        await must(apiFetch(`/api/master-v2/${GROUP_MODULE}`, {
          method: "POST", headers: JSON_HEADERS,
          body: JSON.stringify({ name: th, [EN_FIELD]: en || null, parent_group_id: edit.parentId, single_select: false, sort_order: 100 }),
        }));
        setEdit(null); await loadGroups(); onChanged();
      } catch (e) { setEditErr("เพิ่มกลุ่มไม่สำเร็จ: " + errMsg(e)); }
      finally { setBusy(false); }
      return;
    }

    const { orig, linked } = editInfo;
    const body: Record<string, unknown> = {};
    if (th !== orig.th) body[edit.mode === "tag" ? labelField : "name"] = th;
    if (en !== orig.en) body[EN_FIELD] = en || null;
    if (!Object.keys(body).length) { setEdit(null); return; }
    const lp = linkedPatch();
    const id = edit.id;
    setBusy(true); setEditErr(null);
    try {
      if (edit.mode === "tag") {
        await must(patchTag(id, body));
        setTags((p) => p.map((x) => (x.id === id ? { ...x, label: th, en } : x)));
      } else {
        await must(patchGroup(id, body));
        setGroups((p) => p.map((g) => (g.id === id ? { ...g, name: th, en } : g)));
      }
      if (linked && Object.keys(lp).length) {
        const nTh = Object.keys(lp).some((k) => k !== EN_FIELD); const nEn = EN_FIELD in lp;
        if (linked.kind === "group") {
          await must(patchGroup(linked.id, lp));
          setGroups((p) => p.map((g) => (g.id === linked.id ? { ...g, name: nTh ? th : g.name, en: nEn ? en : g.en } : g)));
        } else {
          await must(patchTag(linked.id, lp));
          setTags((p) => p.map((t) => (t.id === linked.id ? { ...t, label: nTh ? th : t.label, en: nEn ? en : t.en } : t)));
        }
      }
      setEdit(null); onChanged();
    } catch (e) { setEditErr("บันทึกไม่สำเร็จ: " + errMsg(e)); }
    finally { setBusy(false); }
  };

  const deleteTag = async (t: Tag) => {
    if (!window.confirm(`ลบแท็ก “${t.label}” ?\n(สินค้าที่เคยติดแท็กนี้จะไม่เห็นแท็กนี้แล้ว)`)) return;
    setBusy(true); setErr(null);
    try {
      await must(apiFetch(`/api/master-v2/${moduleKey}/${t.id}`, { method: "DELETE" }));
      setTags((p) => p.filter((x) => x.id !== t.id)); onChanged();
    } catch (e) { setErr("ลบไม่สำเร็จ: " + errMsg(e)); }
    finally { setBusy(false); }
  };

  // ---- ชื่ออังกฤษ: แปลที่ยังขาดทีเดียว → ให้ตรวจก่อนบันทึก ----
  // เรียงตามที่เห็นบนจอ (กลุ่ม → หมวดย่อย · แท็กตามกลุ่ม) ให้ตารางตรวจอ่านง่าย
  const orderedGroups = useMemo(() => topGroups.flatMap((g) => [g, ...subsOf(g.id)]), [topGroups, subsOf]);
  const missingGroupEn = useMemo(() => orderedGroups.filter((g) => !g.en), [orderedGroups]);
  const missingTagEn = useMemo(
    () => [...orderedGroups.flatMap((g) => tagsOf(g.id)), ...tagsOf(NONE)].filter((t) => !t.en),
    [orderedGroups, tagsOf],
  );
  const missingCount = missingGroupEn.length + missingTagEn.length;
  const startBulk = async () => {
    // หมวดย่อยที่ผูกกับแท็กแม่ซึ่งมีชื่ออังกฤษแล้ว → ใช้ชื่อเดียวกัน ไม่ต้องแปลใหม่
    const rows: BulkRow[] = [
      ...missingGroupEn.map((g) => ({ kind: "group" as const, id: g.id, th: g.name, en: tagOfSubGroup(g)?.en ?? "" })),
      ...missingTagEn.map((t) => ({ kind: "tag" as const, id: t.id, th: t.label, en: "" })),
    ];
    if (!rows.length) return;
    const need = rows.filter((r) => !r.en);
    setTranslating(true); setErr(null);
    try {
      const out = await translateContent(need.map((r) => r.th));
      need.forEach((r, i) => { r.en = out[i] ?? ""; });
      setBulk(rows);
    } catch (e) { setErr("แปลไม่สำเร็จ: " + errMsg(e)); }
    finally { setTranslating(false); }
  };
  const saveBulk = async () => {
    if (!bulk) return;
    const rows = bulk.map((r) => ({ ...r, en: r.en.trim() })).filter((r) => r.en);
    const key = (r: BulkRow) => `${r.kind}:${r.id}`;
    setBusy(true); setErr(null);
    const failed = new Set<string>();
    await Promise.all(rows.map(async (r) => {
      try { await must((r.kind === "tag" ? patchTag : patchGroup)(r.id, { [EN_FIELD]: r.en })); }
      catch { failed.add(key(r)); }
    }));
    const ok = rows.filter((r) => !failed.has(key(r)));
    const tagEn = new Map(ok.filter((r) => r.kind === "tag").map((r) => [r.id, r.en]));
    const grpEn = new Map(ok.filter((r) => r.kind === "group").map((r) => [r.id, r.en]));
    setTags((p) => p.map((t) => (tagEn.has(t.id) ? { ...t, en: tagEn.get(t.id)! } : t)));
    setGroups((p) => p.map((g) => (grpEn.has(g.id) ? { ...g, en: grpEn.get(g.id)! } : g)));
    setBusy(false);
    if (ok.length) onChanged();
    if (failed.size) {
      setErr(`บันทึกชื่ออังกฤษไม่สำเร็จ ${failed.size} อัน: ${rows.filter((r) => failed.has(key(r))).map((r) => r.th).join(", ")}`);
      setBulk((b) => (b ? b.filter((r) => failed.has(key(r))) : b));
    } else {
      const parts = [grpEn.size ? `กลุ่ม ${grpEn.size}` : "", tagEn.size ? `แท็ก ${tagEn.size}` : ""].filter(Boolean).join(" + ");
      setBulk(null); setNote(`บันทึกชื่ออังกฤษ ${parts} แล้ว`);
    }
  };

  // ---- CRUD กลุ่ม (เพิ่ม/แก้ชื่อ ใช้ป๊อปแก้ชื่อ ไทย+อังกฤษ ด้านบน) ----
  const toggleSingle = async (g: Grp) => {
    setBusy(true); setErr(null);
    const next = !g.single_select;
    setGroups((p) => p.map((x) => x.id === g.id ? { ...x, single_select: next } : x));
    try { await must(patchGroup(g.id, { single_select: next })); onChanged(); }
    catch (e) { setErr("เปลี่ยนโหมดไม่สำเร็จ: " + errMsg(e)); await loadGroups(); }
    finally { setBusy(false); }
  };
  const deleteGroup = async (g: Grp) => {
    const kids = subsOf(g.id).length; const inside = tagsOf(g.id).length;
    if (!window.confirm(`ลบกลุ่ม “${g.name}” ?\n(แท็ก ${inside} อัน และหมวดย่อย ${kids} อัน จะไม่ถูกลบ แต่จะหลุดออกจากกลุ่มนี้)`)) return;
    setBusy(true); setErr(null);
    try {
      await must(apiFetch(`/api/master-v2/${GROUP_MODULE}/${g.id}?hard=1`, { method: "DELETE" }));
      await Promise.all([loadGroups(), loadTags()]); onChanged();
    } catch (e) { setErr("ลบกลุ่มไม่สำเร็จ: " + errMsg(e)); }
    finally { setBusy(false); }
  };

  // ---- ชิ้นส่วน UI (ฟังก์ชันวาด — ห้ามเปลี่ยนเป็น component ซ้อน ดูหัวไฟล์) ----
  // เส้นบอกตำแหน่งวาง: ลอยทับ ไม่กินที่ (ไม่ทำให้แถวขยับระหว่างลาก)
  const tagBar = (side: "left" | "right") => (
    <span className={`pointer-events-none absolute top-0 bottom-0 w-[3px] rounded bg-blue-500 ${side === "left" ? "-left-[5px]" : "-right-[5px]"}`} />
  );
  const groupLine = (pos: "top" | "bottom") => (
    <div className={`pointer-events-none absolute inset-x-0 h-1 rounded bg-blue-500 ${pos === "top" ? "-top-[6px]" : "-bottom-[6px]"}`} />
  );
  const tagHintBefore = (container: string, beforeId: string | null) =>
    drag?.kind === "tag" && hint?.type === "tag" && hint.container === container && hint.beforeId === beforeId;
  const groupHintBefore = (parent: string, beforeId: string | null) =>
    drag?.kind === "group" && hint?.type === "group" && hint.parent === parent && hint.beforeId === beforeId;

  const renderChip = (t: Tag, container: string, list: Tag[], i: number) => {
    const dragging = drag?.kind === "tag" && drag.id === t.id;
    const subTarget = hint?.type === "tagSub" && hint.parentTagId === t.id;
    const kids = subGroupOfTag(t);
    const kidCount = kids ? tagsOf(kids.id).length : 0;
    const isLast = i === list.length - 1;
    return (
      <span key={t.id} className="relative inline-flex items-center">
        {tagHintBefore(container, t.id) && tagBar("left")}
        <span
          draggable={!busy}
          onDragStart={(e) => startDrag(e, { kind: "tag", id: t.id })}
          onDragEnd={cleanupDrag}
          onDragOver={(e) => {
            const d = dragRef.current; if (d?.kind !== "tag") return;
            e.preventDefault(); e.stopPropagation();
            if (d.id === t.id) { setHint(null); return; }
            const r = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width;
            if (x > 0.28 && x < 0.72 && canNestUnder(t, d.id)) { setHint({ type: "tagSub", parentTagId: t.id }); return; }
            setHint({ type: "tag", container, beforeId: x < 0.5 ? t.id : (list[i + 1]?.id ?? null) });
          }}
          title="ลากไปวางระหว่างแท็ก = ย้าย/เรียง · ลากไปวางทับกลางแท็กอื่น = เป็นแท็กย่อย"
          className={`group relative inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border cursor-grab active:cursor-grabbing transition-colors ${dragging ? "opacity-40" : ""} ${subTarget ? "bg-blue-50 border-blue-500 ring-2 ring-blue-300 text-blue-800" : "bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"}`}
        >
          <span className="text-slate-300 select-none">⠿</span>
          <span className="truncate max-w-[160px]">{t.label}</span>
          {t.en
            ? <span className="truncate max-w-[140px] text-[10px] text-slate-400">· {t.en}</span>
            : <button type="button" onClick={() => openEdit(t)} title="ยังไม่มีชื่ออังกฤษ — กดเพื่อใส่" className="text-[10px] text-amber-500 hover:underline">· ไม่มี EN</button>}
          {kidCount > 0 && <span className="text-[10px] text-slate-400" title={`มีแท็กย่อย ${kidCount} อัน (อยู่ใน ↳ ${t.label})`}>↳{kidCount}</span>}
          <button type="button" onClick={() => openEdit(t)} title="แก้ชื่อ (ไทย / อังกฤษ)" className="text-slate-300 hover:text-blue-600 opacity-0 group-hover:opacity-100">✎</button>
          <button type="button" onClick={() => deleteTag(t)} title="ลบ" className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100">✕</button>
          {subTarget && (
            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-6 z-10 whitespace-nowrap rounded bg-blue-600 text-white text-[10px] px-1.5 py-0.5 shadow">
              ↳ ใส่เป็นแท็กย่อยของ “{t.label}”
            </span>
          )}
        </span>
        {isLast && tagHintBefore(container, null) && tagBar("right")}
      </span>
    );
  };

  // โซนวางแท็ก (ในกลุ่ม/หมวดย่อย/ไม่มีกลุ่ม)
  const renderZone = (container: string) => {
    const list = tagsOf(container);
    return (
      <div
        onDragOver={(e) => {
          if (dragRef.current?.kind !== "tag") return;
          e.preventDefault(); e.stopPropagation();
          // ช่องว่างระหว่างแท็กในกล่องเดิม → คงตำแหน่งที่โชว์อยู่ (กันเส้นกระโดดไปท้ายแถว)
          const h = hintRef.current;
          if (h?.type === "tag" && h.container === container) return;
          setHint({ type: "tag", container, beforeId: null });
        }}
        className={`flex flex-wrap items-center gap-1.5 min-h-[34px] rounded-md p-1.5 transition-colors ${drag?.kind === "tag" ? "bg-blue-50/40 border border-dashed border-blue-200" : "border border-transparent"}`}
      >
        {list.length === 0 && <span className="text-[11px] text-slate-300">{drag?.kind === "tag" ? "วางแท็กที่นี่" : "— ไม่มีแท็ก —"}</span>}
        {list.map((t, i) => renderChip(t, container, list, i))}
      </div>
    );
  };

  // ลากกลุ่มผ่าน "ตัวกล่อง" (ไม่ใช่หัว) → วางก่อน/หลังกล่องนั้น
  const groupBoxOver = (e: React.DragEvent, g: Grp, siblings: Grp[], i: number) => {
    const d = dragRef.current; if (d?.kind !== "group") return;
    e.preventDefault(); e.stopPropagation();
    if (d.id === g.id) { setHint(null); return; }
    const parent = parentKeyOf(g);
    if (parent !== TOP && !canGroupInto(d.id, parent)) { setHint(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const upper = e.clientY < r.top + r.height / 2;
    setHint({ type: "group", parent, beforeId: upper ? g.id : (siblings[i + 1]?.id ?? null) });
  };

  const renderHeader = (g: Grp, isSub: boolean, siblings: Grp[], i: number) => {
    const into = hint?.type === "groupInto" && hint.targetId === g.id;
    return (
      <div
        draggable={!busy}
        onDragStart={(e) => startDrag(e, { kind: "group", id: g.id })}
        onDragEnd={cleanupDrag}
        onDragOver={(e) => {
          const d = dragRef.current; if (!d) return;
          e.preventDefault(); e.stopPropagation();
          // ลากแท็กมาที่หัวกลุ่ม = ใส่ท้ายกลุ่มนั้น
          if (d.kind === "tag") { setHint({ type: "tag", container: g.id, beforeId: null }); return; }
          if (d.id === g.id) { setHint(null); return; }
          const r = e.currentTarget.getBoundingClientRect();
          const y = (e.clientY - r.top) / r.height;
          if (!isSub && y > 0.25 && y < 0.75 && canGroupInto(d.id, g.id)) { setHint({ type: "groupInto", targetId: g.id }); return; }
          const parent = isSub ? g.parent_group_id! : TOP;
          if (isSub && !canGroupInto(d.id, parent)) { setHint(null); return; }
          setHint({ type: "group", parent, beforeId: y < 0.5 ? g.id : (siblings[i + 1]?.id ?? null) });
        }}
        className={`group/h flex items-center gap-2 px-2 py-1.5 cursor-grab active:cursor-grabbing ${isSub ? "rounded-t-md" : "bg-slate-50 rounded-t-lg border-b border-slate-100"} ${into ? "ring-2 ring-blue-400 bg-blue-50" : ""}`}
      >
        <span className="text-slate-300 select-none">⠿</span>
        <span className={`${isSub ? "text-xs text-slate-500" : "text-sm font-medium text-slate-700"}`}>
          {isSub ? "↳ " : (g.icon ? g.icon + " " : "")}{g.name}
        </span>
        {g.en
          ? <span className="text-[10px] text-slate-400 truncate max-w-[160px]">· {g.en}</span>
          : <button type="button" onClick={() => openGroupEdit(g)} title="ยังไม่มีชื่ออังกฤษ — กดเพื่อใส่" className="text-[10px] text-amber-500 hover:underline">· ไม่มี EN</button>}
        <button type="button" onClick={() => toggleSingle(g)} title="สลับโหมดเลือก (หลายรายการ / เลือกได้ 1)"
          className={`text-[10px] rounded px-1 border ${g.single_select ? "text-amber-600 bg-amber-50 border-amber-100" : "text-slate-400 bg-white border-slate-200"}`}>
          {g.single_select ? "เลือกได้ 1" : "หลายรายการ"}
        </button>
        {into && <span className="pointer-events-none text-[10px] rounded bg-blue-600 text-white px-1.5 py-0.5">↳ ใส่เป็นหมวดย่อยของ “{g.name}”</span>}
        <div className="flex-1" />
        <button type="button" onClick={() => openGroupEdit(g)} title="แก้ชื่อกลุ่ม (ไทย / อังกฤษ)" className="text-slate-300 hover:text-blue-600 opacity-0 group-hover/h:opacity-100">✎</button>
        {!isSub && <button type="button" onClick={() => openNewGroup(g.id)} title="เพิ่มหมวดย่อย" className="text-slate-300 hover:text-blue-600 opacity-0 group-hover/h:opacity-100">＋↳</button>}
        <button type="button" onClick={() => deleteGroup(g)} title="ลบกลุ่ม" className="text-slate-300 hover:text-red-500 opacity-0 group-hover/h:opacity-100">🗑️</button>
      </div>
    );
  };

  const body = (
    <div className="space-y-2">
      {topGroups.map((g, gi) => {
        const subs = subsOf(g.id);
        const draggingSelf = drag?.kind === "group" && drag.id === g.id;
        const showIntoStrip = drag?.kind === "group" && canGroupInto(drag.id, g.id);
        return (
          <div key={g.id} className="relative" onDragOver={(e) => groupBoxOver(e, g, topGroups, gi)}>
            {groupHintBefore(TOP, g.id) && groupLine("top")}
            {gi === topGroups.length - 1 && groupHintBefore(TOP, null) && groupLine("bottom")}
            <div className={`border border-slate-200 rounded-lg ${draggingSelf ? "opacity-40" : ""}`}>
              {renderHeader(g, false, topGroups, gi)}
              <div className="p-1.5 space-y-1">
                {renderZone(g.id)}
                {/* หมวดย่อย */}
                {subs.length > 0 && (
                  <div className="pl-3 border-l-2 border-slate-100 ml-1 space-y-2">
                    {subs.map((s, si) => (
                      <div key={s.id} className="relative" onDragOver={(e) => groupBoxOver(e, s, subs, si)}>
                        {groupHintBefore(g.id, s.id) && groupLine("top")}
                        {si === subs.length - 1 && groupHintBefore(g.id, null) && groupLine("bottom")}
                        <div className={`rounded-md bg-slate-50/50 ${drag?.kind === "group" && drag.id === s.id ? "opacity-40" : ""}`}>
                          {renderHeader(s, true, subs, si)}
                          <div className="px-1 pb-1">{renderZone(s.id)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* ลากกลุ่มอยู่ → แถบ "วางที่นี่ = เป็นหมวดย่อย" */}
                {showIntoStrip && (
                  <div
                    onDragOver={(e) => { if (dragRef.current?.kind !== "group") return; e.preventDefault(); e.stopPropagation(); setHint({ type: "groupInto", targetId: g.id }); }}
                    className={`ml-4 rounded-md border border-dashed px-2 py-1.5 text-[11px] transition-colors ${hint?.type === "groupInto" && hint.targetId === g.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-blue-200 text-blue-400"}`}
                  >
                    ↳ วางที่นี่ = เป็นหมวดย่อยของ “{g.name}”
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* ไม่มีกลุ่ม */}
      <div className="border border-dashed border-slate-200 rounded-lg">
        <div className="px-2 py-1.5 text-sm font-medium text-slate-500">ไม่มีกลุ่ม</div>
        <div className="p-1.5">{renderZone(NONE)}</div>
      </div>
    </div>
  );

  const helpText = drag?.kind === "tag"
    ? "วางระหว่างแท็ก = ย้าย/เรียง • วางทับกลางแท็กอื่น = เป็นแท็กย่อย (Sub) • ลากค้างขอบบน/ล่างเพื่อเลื่อน"
    : drag?.kind === "group"
      ? "วางขอบบน/ล่างของกลุ่ม = เรียงลำดับ • วางทับกลางหัวกลุ่ม = เป็นหมวดย่อย • ลากค้างขอบบน/ล่างเพื่อเลื่อน"
      : "ลากแท็กไปวางระหว่างแท็ก = ย้าย/เรียง • ลากทับกลางแท็กอื่น = เป็นแท็กย่อย (Sub) • ลากหัวกลุ่มทับกลางหัวกลุ่มอื่น = เป็นหมวดย่อย • บันทึกอัตโนมัติ";

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="relative bg-white rounded-xl shadow-2xl w-[760px] max-w-[95vw] max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800">🗂️ จัดการแท็ก (ลากเพื่อย้าย/เรียง)</h3>
            <p className={`text-[11px] mt-0.5 ${drag ? "text-blue-600 font-medium" : "text-slate-400"}`}>{helpText}</p>
            {!loading && (tags.length > 0 || orderedGroups.length > 0) && (
              <div className="flex items-center gap-2 mt-1.5 text-[11px] flex-wrap">
                <span className={missingCount ? "text-amber-600" : "text-emerald-600"}>
                  🌐 ชื่ออังกฤษ — แท็ก {tags.length - missingTagEn.length}/{tags.length} · กลุ่ม {orderedGroups.length - missingGroupEn.length}/{orderedGroups.length}
                </span>
                {missingCount > 0 && (
                  <button type="button" onClick={() => void startBulk()} disabled={busy || translating}
                    className="rounded-md border border-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                    {translating && !edit ? "กำลังแปล…" : `แปลที่ยังขาด (${missingCount})`}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {busy && <span className="text-[11px] text-slate-400">กำลังบันทึก…</span>}
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
          </div>
        </div>

        {err && <div className="mx-4 mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2 py-1">{err}</div>}
        {note && <div className="mx-4 mt-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1">✓ {note}</div>}

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3"
          onDragOverCapture={autoScroll}
          // ช่องว่างระหว่างกล่อง: ยังปล่อยได้ = ใช้ตำแหน่งที่เส้นสีฟ้าโชว์อยู่ล่าสุด
          onDragOver={(e) => { if (dragRef.current) e.preventDefault(); }}
          onDrop={(e) => { if (!dragRef.current) return; e.preventDefault(); applyDrop(); }}
        >
          {loading ? <div className="text-sm text-slate-400 py-8 text-center">กำลังโหลด…</div> : body}
        </div>

        <div className="flex items-center gap-2 flex-wrap px-3 py-3 border-t border-slate-100">
          <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="ชื่อแท็กใหม่ (ไทย)…"
            onKeyDown={(e) => { if (e.key === "Enter") void addTag(); }}
            className="flex-1 min-w-[140px] h-9 px-2 text-sm border border-slate-200 rounded-md" />
          <div className="flex items-center flex-1 min-w-[160px] h-9 border border-slate-200 rounded-md overflow-hidden">
            <input value={newTagEn} onChange={(e) => setNewTagEn(e.target.value)} placeholder="ชื่ออังกฤษ (EN)…"
              onKeyDown={(e) => { if (e.key === "Enter") void addTag(); }}
              className="flex-1 min-w-0 h-full px-2 text-sm outline-none" />
            <button type="button" onClick={() => void translateNew()} disabled={!newTag.trim() || translating}
              title="แปลชื่อไทยเป็นอังกฤษให้" className="h-full px-2 text-xs text-slate-500 border-l border-slate-200 hover:bg-slate-50 disabled:opacity-40">
              {translating && !edit && !bulk ? "…" : "🌐 แปลให้"}
            </button>
          </div>
          <button type="button" onClick={() => void addTag()} disabled={busy || !newTag.trim()}
            className="h-9 px-4 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">+ เพิ่มแท็ก</button>
          <button type="button" onClick={() => openNewGroup(null)} disabled={busy}
            className="h-9 px-3 text-sm rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">+ เพิ่มกลุ่ม</button>
        </div>

        {/* ป๊อปแก้ชื่อ ไทย + อังกฤษ (แท็ก / กลุ่ม / หมวดย่อย / เพิ่มกลุ่มใหม่) */}
        {edit && editInfo && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 rounded-xl p-4" onClick={closeEdit}>
            <div className="bg-white rounded-xl shadow-xl p-4 w-[400px] max-w-full space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="font-semibold text-slate-800 text-sm">
                {edit.mode === "tag" ? "✎ แก้ชื่อแท็ก"
                  : edit.mode === "group" ? (groupById.get(edit.id) && isSubGroup(groupById.get(edit.id)!) ? "✎ แก้ชื่อหมวดย่อย" : "✎ แก้ชื่อกลุ่ม")
                  : edit.parentId ? `＋ เพิ่มหมวดย่อยใน “${groupById.get(edit.parentId)?.name ?? ""}”` : "＋ เพิ่มกลุ่มใหม่"}
              </div>
              <label className="block">
                <span className="text-xs text-slate-500">ชื่อไทย</span>
                <input autoFocus value={edit.th} onChange={(e) => setEdit({ ...edit, th: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(); if (e.key === "Escape") closeEdit(); }}
                  className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-md" />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">ชื่ออังกฤษ (EN) <span className="text-slate-400">— ใช้ลงขายต่างประเทศ / ให้ AI เขียนคำอังกฤษ</span></span>
                <div className="mt-1 flex items-center h-9 border border-slate-200 rounded-md overflow-hidden">
                  <input value={edit.en} onChange={(e) => setEdit({ ...edit, en: e.target.value })} placeholder={edit.mode === "tag" ? "เช่น Wallet" : "เช่น Materials"}
                    onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(); if (e.key === "Escape") closeEdit(); }}
                    className="flex-1 min-w-0 h-full px-2 text-sm outline-none" />
                  <button type="button" onClick={() => void translateEdit()} disabled={!edit.th.trim() || translating}
                    className="h-full px-2 text-xs text-slate-500 border-l border-slate-200 hover:bg-slate-50 disabled:opacity-40">
                    {translating ? "กำลังแปล…" : "🌐 แปลให้"}
                  </button>
                </div>
              </label>
              {(() => {
                const lk = editInfo.linked; const lp = linkedPatch(); const keys = Object.keys(lp);
                if (!lk || !keys.length) return null;
                const what = keys.length > 1 ? "ชื่อไทย + อังกฤษ" : keys[0] === EN_FIELD ? "ชื่ออังกฤษ" : "ชื่อไทย";
                return (
                  <p className="text-[11px] text-slate-400">
                    {lk.kind === "group" ? `หมวดย่อย “↳ ${lk.name}”` : `แท็กแม่ “${lk.name}”`} จะเปลี่ยน{what}ตามให้ด้วย (ผูกชื่อกันอยู่)
                  </p>
                );
              })()}
              {editErr && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2 py-1">{editErr}</div>}
              <div className="flex justify-end gap-2">
                {edit.mode === "tag" && (
                  <button type="button" onClick={() => setUsageTagId(edit.id)} title="สินค้าที่ติดแท็กนี้ · หมวดบนเว็บ · กฎ AI"
                    className="mr-auto h-9 px-3 text-xs rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50">🔗 ลิงก์กับอะไรบ้าง</button>
                )}
                <button type="button" onClick={closeEdit} className="h-9 px-4 text-sm rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                <button type="button" onClick={() => void saveEdit()} disabled={busy || !edit.th.trim()}
                  className="h-9 px-4 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "กำลังบันทึก…" : edit.mode === "newGroup" ? "เพิ่ม" : "บันทึก"}</button>
              </div>
            </div>
          </div>
        )}

        {/* ตรวจชื่ออังกฤษที่แปลให้ ก่อนบันทึกทีเดียว */}
        {bulk && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 rounded-xl p-4">
            <div className="bg-white rounded-xl shadow-xl w-[520px] max-w-full max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="font-semibold text-slate-800 text-sm">🌐 ตรวจชื่ออังกฤษที่แปลให้ ({bulk.length})</div>
                <p className="text-[11px] text-slate-400 mt-0.5">ระบบแปลให้แล้ว — แก้คำที่ไม่ตรงได้เลย · ช่องที่เว้นว่างจะไม่บันทึก</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {bulk.map((r, i) => (
                  <div key={`${r.kind}:${r.id}`}>
                    {(i === 0 || bulk[i - 1].kind !== r.kind) && (
                      <div className={`text-[11px] font-medium text-slate-400 ${i ? "pt-2" : ""} pb-1`}>
                        {r.kind === "group" ? "🗂️ กลุ่ม / หมวดย่อย" : "🏷️ แท็ก"}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                    <span className="w-40 shrink-0 truncate text-sm text-slate-700" title={r.th}>
                      {r.kind === "group" && groupById.get(r.id) && isSubGroup(groupById.get(r.id)!) ? "↳ " : ""}{r.th}
                    </span>
                    <input value={r.en} placeholder="(เว้นว่าง = ไม่บันทึก)"
                      onChange={(e) => setBulk((b) => (b ? b.map((x, k) => (k === i ? { ...x, en: e.target.value } : x)) : b))}
                      className="flex-1 min-w-0 h-8 px-2 text-sm border border-slate-200 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
                <button type="button" onClick={() => setBulk(null)} disabled={busy}
                  className="h-9 px-4 text-sm rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                <button type="button" onClick={() => void saveBulk()} disabled={busy || !bulk.some((r) => r.en.trim())}
                  className="h-9 px-4 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                  {busy ? "กำลังบันทึก…" : `บันทึก ${bulk.filter((r) => r.en.trim()).length} รายการ`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 🔗 แท็กนี้ลิงก์กับอะไร — อยู่ในการ์ด (กันคลิกในป๊อปทะลุไปปิดตัวจัดการแท็ก) · ชั้นสูงกว่าตัวจัดการ (z-210) */}
        <TagUsageModal tagId={usageTagId} onClose={() => setUsageTagId(null)} zIndex={230} />
      </div>
    </div>,
    document.body,
  );
}
