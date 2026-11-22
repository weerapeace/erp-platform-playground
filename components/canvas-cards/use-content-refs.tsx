"use client";
/**
 * 🔗 Ref ของคอนเทนต์ ↔ กระดาน (เจ้าของสั่ง 2026-11-22) — ใช้ใน useCardKit (กระดานแคมเปญ · กระดานบรีฟของงาน)
 *   ① เลือกการ์ดคอนเทนต์ + ลิงก์/รูปบนกระดาน → แถบลอย "เชื่อมเป็น Ref" → วาดเส้นติด + ใส่ใน "Ref ตัวอย่างที่อยากได้" ของโพสต์ (ย้อนกลับได้)
 *   ② ลากเส้นลูกศรเองจากการ์ดไปหาลิงก์/รูป → นับเป็น Ref เหมือนกัน
 *   ③ Ref ที่เพิ่มใน drawer (รูป/ลิงก์) → วางข้างการ์ด + เส้นเชื่อม (ตอนซิงก์การ์ด: เปิดกระดาน / ปิด drawer)
 *   ④ ลบเส้นหรือลบของบนกระดาน → ถาม "เอาออกจาก Ref ด้วยไหม" · ตอบไม่ = จำไว้ที่การ์ด (refDismissed) จะไม่วางกลับมาอีก
 * ที่เก็บ Ref = erp_creative_content.ref_links / ref_image_keys (ชุดเดียวกับกล่อง "รายการงานที่ต้องการ" · สูงสุด 6)
 * ป้ายบนกระดาน: ของ = customData { refOf, refKey, refType } · เส้น = customData { refArrow, refKey } (ไม่มี kind → ไม่นับเป็นการ์ด)
 */
import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useToast } from "@/components/toast";
import { askConfirm } from "@/components/modal/ask-dialog";
import { r2ImageUrl } from "@/lib/r2-image";
import { getContent, updateContent } from "@/app/tasks/data";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import { MAX_BRIEF_REFS } from "@/app/tasks/content/brief-ref-slots";

type El = Record<string, unknown> & { id: string; type?: string; isDeleted?: boolean; customData?: Record<string, unknown>; link?: string | null; fileId?: string | null; x?: number; y?: number; width?: number; height?: number; startBinding?: { elementId?: string } | null; endBinding?: { elementId?: string } | null };
type Refs = { links: { url: string; label?: string }[]; images: string[] };
type Item = { el: El; key: string; type: "link" | "image" };

const cd = (e: El) => (e.customData ?? {}) as Record<string, unknown>;
const isContentCard = (e: El) => !e.isDeleted && cd(e).kind === "content" && e.type === "rectangle";
/** r2 key จาก URL /api/r2-image?key=… */
const keyFromUrl = (u: string | null): string | null => {
  if (!u) return null;
  try { return new URL(u, "http://x").searchParams.get("key"); } catch { return null; }
};

export function useContentRefs(sketchRef: MutableRefObject<CanvasSketchControls | null>, opts: { pushToast: (t: "success" | "error" | "info", m: string) => void; onChanged?: () => void; t: (th: string, en: string) => string }) {
  // ค่าที่เปลี่ยนทุกรอบเก็บใน ref → ฟังก์ชันที่คืนไปคงที่ (กันการซิงก์การ์ดวนซ้ำ)
  const optsRef = useRef(opts); optsRef.current = opts;
  const pushToast = useCallback((ty: "success" | "error" | "info", m: string) => optsRef.current.pushToast(ty, m), []);
  const onChanged = useCallback(() => optsRef.current.onChanged?.(), []);
  const t = useCallback((th: string, en: string) => optsRef.current.t(th, en), []);
  const toastApi = useToast();
  const toastRef = useRef(toastApi); toastRef.current = toastApi;
  const toast = useMemo(() => ({ undo: (m: string, fn: () => void | Promise<void>) => toastRef.current.undo(m, fn) }), []);
  const [linkSel, setLinkSel] = useState<{ cid: string; cardId: string; items: Item[] } | null>(null);
  const handledArrows = useRef<Set<string>>(new Set());
  const handledDeleted = useRef<Set<string>>(new Set());
  const busy = useRef(false);

  /** ของบนกระดาน → คีย์ Ref (ลิงก์ = URL · รูป = r2 key) · การ์ด/ของที่ไม่ใช่ลิงก์-รูป = null */
  const itemOf = useCallback((e: El): Item | null => {
    if (e.isDeleted || cd(e).kind) return null;
    if (e.type === "image" && e.fileId) {
      const key = keyFromUrl(sketchRef.current?.getFileUrl(String(e.fileId)) ?? null);
      return key ? { el: e, key, type: "image" } : null;
    }
    const link = typeof e.link === "string" ? e.link.trim() : "";
    if (link && /^https?:\/\//i.test(link)) return { el: e, key: link, type: "link" };
    return null;
  }, [sketchRef]);

  const readRefs = async (cid: string): Promise<Refs> => {
    const c = await getContent(cid);
    return { links: (c.ref_links ?? []).map((l) => ({ ...l })), images: [...(c.ref_image_keys ?? [])] };
  };
  const writeRefs = (cid: string, r: Refs) => updateContent(cid, { ref_links: r.links, ref_image_keys: r.images });

  /** เชื่อมของเข้ากับการ์ด: ใส่ Ref + ป้าย + เส้น (arrowIds = เส้นที่ผู้ใช้ลากเองแล้ว ไม่ต้องวาดใหม่) */
  const link = useCallback(async (cid: string, cardId: string, items: Item[], arrowIds?: Record<string, string>) => {
    const sk = sketchRef.current; if (!sk || !items.length || busy.current) return;
    busy.current = true;
    try {
      const before = await readRefs(cid);
      const next: Refs = { links: [...before.links], images: [...before.images] };
      const added: Item[] = [];
      for (const it of items) {
        const total = next.links.length + next.images.length;
        const has = it.type === "link" ? next.links.some((l) => l.url === it.key) : next.images.includes(it.key);
        if (!has && total >= MAX_BRIEF_REFS) { pushToast("info", t(`Ref เต็มแล้ว (สูงสุด ${MAX_BRIEF_REFS})`, `Refs are full (max ${MAX_BRIEF_REFS})`)); break; }
        if (!has) { if (it.type === "link") next.links.push({ url: it.key }); else next.images.push(it.key); }
        added.push(it);
      }
      if (!added.length) return;
      await writeRefs(cid, next);
      const tagged = new Set(added.map((a) => a.el.id));
      sk.patchElements((e) => (tagged.has(String(e.id)) ? { customData: { ...((e.customData as Record<string, unknown>) ?? {}), refOf: cid, refKey: added.find((a) => a.el.id === e.id)!.key, refType: added.find((a) => a.el.id === e.id)!.type } } : null));
      const newArrows: string[] = [];
      for (const it of added) {
        const own = arrowIds?.[it.el.id];
        if (own) {
          handledArrows.current.add(own);
          sk.patchElements((e) => (e.id === own ? { customData: { ...((e.customData as Record<string, unknown>) ?? {}), refArrow: cid, refKey: it.key } } : null));
        } else {
          const id = await sk.connect(cardId, it.el.id, { refArrow: cid, refKey: it.key });
          if (id) { handledArrows.current.add(id); newArrows.push(id); }
        }
      }
      onChanged?.();
      toast.undo(t(`ใส่ใน Ref แล้ว ${added.length} รายการ`, `Added ${added.length} ref(s)`), async () => {
        try { await writeRefs(cid, before); } catch (e) { pushToast("error", (e as Error).message); }
        sk.patchElements((e) => {
          if (newArrows.includes(String(e.id))) return { isDeleted: true };
          if (tagged.has(String(e.id))) { const c = { ...((e.customData as Record<string, unknown>) ?? {}) }; delete c.refOf; delete c.refKey; delete c.refType; return { customData: c }; }
          return null;
        });
        onChanged?.();
      });
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { busy.current = false; setLinkSel(null); }
  }, [sketchRef, pushToast, onChanged, t, toast]);

  /** ① เลือกการ์ด + ของ → เตรียมแถบ "เชื่อมเป็น Ref" */
  const onSelection = useCallback((ids: string[]) => {
    const sk = sketchRef.current;
    if (!sk || ids.length < 2) { setLinkSel(null); return; }
    const want = new Set(ids);
    const els = (sk.getElements() as El[]).filter((e) => want.has(String(e.id)));
    const card = els.find(isContentCard);
    if (!card) { setLinkSel(null); return; }
    const cid = String(cd(card).id ?? "");
    const items = els.map(itemOf).filter((x): x is Item => !!x && cd(x.el).refOf !== cid);
    setLinkSel(items.length ? { cid, cardId: card.id, items } : null);
  }, [sketchRef, itemOf]);

  /** ②④ เส้นที่ลากเอง / ของที่ถูกลบ */
  const onContentChange = useCallback((all: Record<string, unknown>[]) => {
    const els = all as El[];
    const byId = new Map(els.map((e) => [e.id, e]));
    // ② ลากเส้นจากการ์ดไปหาลิงก์/รูป
    for (const a of els) {
      if (a.type !== "arrow" || a.isDeleted || cd(a).refArrow || handledArrows.current.has(a.id)) continue;
      const s = a.startBinding?.elementId ? byId.get(a.startBinding.elementId) : undefined;
      const e = a.endBinding?.elementId ? byId.get(a.endBinding.elementId) : undefined;
      if (!s || !e) continue;
      const card = isContentCard(s) ? s : isContentCard(e) ? e : null;
      const other = card === s ? e : s;
      const it = card && other ? itemOf(other) : null;
      if (!card || !it) continue;
      handledArrows.current.add(a.id);
      const cid = String(cd(card).id ?? "");
      if (cd(it.el).refOf === cid) continue;
      void link(cid, card.id, [it], { [it.el.id]: a.id });
      return;
    }
    // ④ ลบเส้น/ของที่เป็น Ref
    const gone = els.filter((e) => e.isDeleted && (cd(e).refOf || cd(e).refArrow) && !handledDeleted.current.has(e.id));
    if (!gone.length) return;
    gone.forEach((e) => handledDeleted.current.add(e.id));
    const byCid = new Map<string, Set<string>>();
    for (const e of gone) {
      const cid = String(cd(e).refOf ?? cd(e).refArrow ?? ""); const key = String(cd(e).refKey ?? "");
      if (!cid || !key) continue;
      // การ์ดถูกลบไปด้วย = ไม่ต้องถาม · ของยังอยู่ (ลบแค่เส้นแล้วเชื่อมใหม่) ก็ยังถามตามที่ขอ
      if (!els.some((c) => isContentCard(c) && String(cd(c).id) === cid)) continue;
      const set = byCid.get(cid) ?? new Set<string>(); set.add(key); byCid.set(cid, set);
    }
    for (const [cid, keys] of byCid) void (async () => {
      const yes = await askConfirm({ title: t("เอาออกจาก Ref ด้วยไหม?", "Remove from the refs too?"), confirmText: t("เอาออกจาก Ref", "Remove from refs"), cancelText: t("เก็บไว้ใน Ref", "Keep in refs"),
        message: t(`ลบ ${keys.size} รายการบนกระดาน — จะเอาออกจาก “Ref ตัวอย่างที่อยากได้” ของโพสต์ด้วยไหม`, `${keys.size} item(s) removed from the board — also remove them from the post's refs?`) });
      const sk = sketchRef.current;
      if (!yes) {
        // จำไว้ที่การ์ด ไม่วางกลับมาตอนซิงก์
        sk?.patchElements((e) => (isContentCard(e as El) && String(cd(e as El).id) === cid ? { customData: { ...((e.customData as Record<string, unknown>) ?? {}), refDismissed: [...new Set([...(((e.customData as Record<string, unknown>)?.refDismissed as string[]) ?? []), ...keys])] } } : null));
        return;
      }
      try {
        const before = await readRefs(cid);
        const next: Refs = { links: before.links.filter((l) => !keys.has(l.url)), images: before.images.filter((k) => !keys.has(k)) };
        await writeRefs(cid, next);
        onChanged?.();
        toast.undo(t(`เอาออกจาก Ref แล้ว ${keys.size} รายการ`, `Removed ${keys.size} ref(s)`), async () => {
          try { await writeRefs(cid, before); } catch (e) { pushToast("error", (e as Error).message); }
          const back = gone.filter((g) => String(cd(g).refOf ?? cd(g).refArrow) === cid).map((g) => g.id);
          back.forEach((id) => handledDeleted.current.delete(id));
          sk?.restoreElements(back);
          onChanged?.();
        });
      } catch (e) { pushToast("error", (e as Error).message); }
    })();
  }, [itemOf, link, sketchRef, t, toast, pushToast, onChanged]);

  /** ③ Ref ใน drawer ที่ยังไม่อยู่บนกระดาน → วางข้างการ์ด + เส้น (refsByCid มาจากรอบซิงก์การ์ด) */
  const placeMissing = useCallback(async (refsByCid: Map<string, Refs>) => {
    const sk = sketchRef.current; if (!sk || busy.current) return;
    busy.current = true;
    try {
      for (const [cid, refs] of refsByCid) {
        const els = sk.getElements() as El[];
        const card = els.find((e) => isContentCard(e) && String(cd(e).id) === cid && !cd(e).platform) ?? els.find((e) => isContentCard(e) && String(cd(e).id) === cid);
        if (!card) continue;
        const present = new Set(els.filter((e) => !e.isDeleted && cd(e).refOf === cid).map((e) => String(cd(e).refKey)));
        const dismissed = new Set(((cd(card).refDismissed as string[]) ?? []));
        const links = refs.links.map((l) => l.url).filter((u) => !present.has(u) && !dismissed.has(u));
        const images = refs.images.filter((k) => !present.has(k) && !dismissed.has(k));
        if (!links.length && !images.length) continue;
        const mine = els.filter((e) => !e.isDeleted && cd(e).refOf === cid);
        const x = (card.x ?? 0) + (card.width ?? 260) + 80;
        let y = mine.length ? Math.max(...mine.map((e) => (e.y ?? 0) + (e.height ?? 0))) + 24 : (card.y ?? 0);
        for (const key of images) {
          await sk.insert([{ type: "image", x, y, width: 180, height: 180, _imageUrl: r2ImageUrl(key, 600), customData: { refOf: cid, refKey: key, refType: "image" } }], { scene: true });
          const placed = (sk.getElements() as El[]).find((e) => !e.isDeleted && cd(e).refOf === cid && cd(e).refKey === key);
          if (placed) { const aid = await sk.connect(card.id, placed.id, { refArrow: cid, refKey: key }); if (aid) handledArrows.current.add(aid); y = (placed.y ?? y) + (placed.height ?? 180) + 24; }
        }
        if (links.length) {
          const ids = await sk.placeLinks(links, { x, y }, (url) => ({ refOf: cid, refKey: url, refType: "link" }));
          for (let i = 0; i < ids.length; i++) { const aid = await sk.connect(card.id, ids[i], { refArrow: cid, refKey: links[i] }); if (aid) handledArrows.current.add(aid); }
        }
      }
    } catch (e) { console.error("[content-refs] place failed", e); }
    finally { busy.current = false; }
  }, [sketchRef]);

  const bar = linkSel ? (
    <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-lg">
      <span className="text-xs text-slate-500">{t(`เลือกลิงก์/รูป ${linkSel.items.length} ชิ้น`, `${linkSel.items.length} link/image(s) selected`)}</span>
      <button type="button" onClick={() => void link(linkSel.cid, linkSel.cardId, linkSel.items)} className="h-8 rounded-full bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700">
        {t("เชื่อมเป็น Ref", "Link as ref")}
      </button>
    </div>
  ) : null;

  return useMemo(() => ({ onSelection, onContentChange, placeMissing, bar }), [onSelection, onContentChange, placeMissing, bar]);
}
