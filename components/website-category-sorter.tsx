"use client";

/**
 * 🗂 WebsiteCategorySorter — มุมมอง "🗂 จัดหมวด" ในแท็บสินค้าบนเว็บ (/website/<ร้าน>) · จัดหมวดทั้งร้านแบบเร็ว
 *   ขั้น 1 ⚡ ใส่หมวดหลักทีเดียวจากหมวดใน ERP — สินค้าที่ยังไม่ได้จัด จัดกลุ่มตามหมวด ERP · เลือกหมวดเว็บให้แต่ละกลุ่ม (กฎเดิม/เดาให้ก่อน · แก้ได้)
 *      → POST listings action "applyErpMap" (จำกฎ field_map.category.rules ไว้ใช้กับสินค้าใหม่ + ใส่หมวดให้ตัวที่ยังไม่ได้จัด)
 *   ขั้น 2 🗂 กระดาน — ซ้าย = ต้นไม้หมวด + จำนวน (กอง "ยังไม่ได้จัด" / "ยังไม่มีหมวดย่อย") · ขวา = รูปสินค้าในกองที่เลือก
 *      คลิก = เลือก · Shift+คลิก = เลือกเป็นช่วง · ดับเบิลคลิก = เปิดตั้งค่าเว็บของสินค้า (drawer เดิมของหน้า)
 *      ชิป "ย้าย N ตัวไป" (ปุ่มลัด 1–9) · ลากไปวางบนหมวดทางซ้าย · ✕ เอาออกจากหมวดนี้ · ↩ ย้อน (Ctrl+Z) · + เพิ่มหมวด/หมวดย่อย
 *      → POST listings action "setCategories" (บันทึกทันที + audit · null = กลับเป็นยังไม่ได้จัด) · "addCategory" (เพิ่มหมวด)
 * กติกาการย้าย = lib/website-category-sort (pure + เทสต์) · ต้นไม้หมวด = lib/website-category-tree · ป๊อปเพิ่มหมวด = ตัวเดียวกับแท็บ 📂 หมวดหมู่
 */
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import {
  categoryTree,
  categoryChoiceLabel,
  childCategories,
} from "@/lib/website-category-tree";
import {
  NONE,
  nosubNode,
  nodeMain,
  mainOf,
  guessWebCategory,
  groupByErp,
  isUnsorted,
  sortedCats,
  inNode,
  quickTargets,
  moveToTarget,
  removeFromNode,
  withSub,
  sameList,
  addToTarget,
  canAddTo,
  crossFamily,
  moveOut,
  lacksSub,
  shortcutTargets,
} from "@/lib/website-category-sort";
import { useUserPref } from "@/lib/use-user-pref";
import { SearchPick } from "@/components/search-pick";
import type {
  CategoryDef,
  Listing,
  ShopInfo,
} from "@/components/website-listings-panel";

// ป๊อปเพิ่มหมวดของแท็บ 📂 หมวดหมู่ (โหลดเมื่อกด — ไฟล์นั้นใหญ่)
const NewCategoryModal = dynamic(
  () =>
    import("@/components/website-categories-panel").then(
      (m) => m.NewCategoryModal,
    ),
  { ssr: false },
);

/** ชนิดข้อมูลตอนลากรูปสินค้า (กันรับของที่ลากมาจากที่อื่น) */
const DRAG_MIME = "application/x-erp-web-sort";
const imgUrl = (key: string, w: number) =>
  `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
const nameOf = (l: Listing) =>
  l.display?.name || l.webName || l.mapped?.name || l.erpName;
const imageOf = (l: Listing) => l.display?.imageKey ?? l.erpImageKey;

type Snap = {
  parentId: string;
  webCategories: string[] | null;
  categories: string[];
};
type UndoStep = { label: string; items: Snap[] };
type Row = {
  node: string;
  label: string;
  icon: string;
  depth: 0 | 1;
  muted?: boolean;
};

function Mini({ l }: { l: Listing }) {
  const key = imageOf(l);
  return (
    <span className="inline-block w-7 h-7 rounded-full overflow-hidden bg-slate-100 ring-2 ring-white">
      {key && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgUrl(key, 64)}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      )}
    </span>
  );
}

export function WebsiteCategorySorter({
  shop,
  listings,
  setListings,
  categories,
  reload,
  onOpen,
  paused = false,
}: {
  shop: ShopInfo;
  listings: Listing[];
  setListings: Dispatch<SetStateAction<Listing[]>>;
  categories: CategoryDef[];
  reload: () => Promise<void> | void;
  /** ดับเบิลคลิกรูป = เปิด drawer ตั้งค่าเว็บของสินค้า */
  onOpen: (parentId: string) => void;
  /** มีหน้าต่างอื่นเปิดทับอยู่ (drawer) = ปิดปุ่มลัดคีย์บอร์ด */
  paused?: boolean;
}) {
  const toast = useToast();
  const cats = categories;
  const catOf = (k: string) => cats.find((c) => c.key === k);
  const labelOf = (k: string) => {
    if (k === NONE) return "ยังไม่ได้จัด";
    const m = nodeMain(k);
    if (m) return `${catOf(m)?.label ?? m} · ยังไม่มีหมวดย่อย`;
    return catOf(k)?.label ?? k;
  };
  const treeRows = useMemo(() => categoryTree(cats), [cats]);

  /* ───────── บันทึก + ↩ ย้อน ───────── */
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<UndoStep[]>([]);
  const post = async (body: Record<string, unknown>) => {
    const r = await apiFetch("/api/website/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: shop.id, ...body }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok)
      throw new Error(typeof j.error === "string" ? j.error : "");
    return j;
  };
  const saveCats = async (
    items: { parentId: string; categories: string[] | null }[],
    category: string,
  ) => {
    for (let i = 0; i < items.length; i += 500)
      await post({
        action: "setCategories",
        items: items.slice(i, i + 500),
        category,
      });
  };
  const setLocal = (
    next: Map<string, { webCategories: string[] | null; categories: string[] }>,
  ) =>
    setListings((ls) =>
      ls.map((l) =>
        next.has(l.parentId) ? { ...l, ...next.get(l.parentId)! } : l,
      ),
    );
  const snap = (l: Listing): Snap => ({
    parentId: l.parentId,
    webCategories: l.webCategories,
    categories: l.categories ?? [],
  });
  const restore = (items: Snap[]) =>
    setLocal(
      new Map(
        items.map((s) => [
          s.parentId,
          { webCategories: s.webCategories, categories: s.categories },
        ]),
      ),
    );

  /** เปลี่ยนหมวดหลายตัว (optimistic · พลาด = คืนค่าเดิม) */
  const change = async (
    ids: string[],
    fn: (list: string[]) => string[],
    label: string,
    auditKey: string,
  ) => {
    const idSet = new Set(ids);
    const rows = listings
      .filter((l) => idSet.has(l.parentId))
      .map((l) => ({ l, cur: sortedCats(l), nx: fn(sortedCats(l)) }))
      .filter((x) => !sameList(x.cur, x.nx));
    if (!rows.length) {
      toast.info("ไม่มีอะไรเปลี่ยน — สินค้าที่เลือกอยู่หมวดนั้นแล้ว");
      return;
    }
    const step: UndoStep = {
      label: label.replace("{n}", String(rows.length)),
      items: rows.map(({ l }) => snap(l)),
    };
    setLocal(
      new Map(
        rows.map(({ l, nx }) => [
          l.parentId,
          { webCategories: nx, categories: nx },
        ]),
      ),
    );
    setSel((s) => {
      const n = new Set(s);
      rows.forEach(({ l }) => n.delete(l.parentId));
      return n;
    });
    setBusy(true);
    try {
      await saveCats(
        rows.map(({ l, nx }) => ({ parentId: l.parentId, categories: nx })),
        auditKey,
      );
      setUndo((u) => [...u.slice(-19), step]);
      toast.success(`${step.label} แล้ว`);
    } catch {
      restore(step.items);
      toast.error("บันทึกไม่สำเร็จ — คืนค่าเดิมแล้ว");
    } finally {
      setBusy(false);
    }
  };

  const undoLast = async () => {
    const step = undo[undo.length - 1];
    if (!step || busy) return;
    setBusy(true);
    try {
      await saveCats(
        step.items.map((s) => ({
          parentId: s.parentId,
          categories: s.webCategories,
        })),
        "undo",
      );
      restore(step.items);
      setUndo((u) => u.slice(0, -1));
      toast.success(`ย้อนแล้ว: ${step.label}`);
    } catch {
      toast.error("ย้อนไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  /* ───────── ขั้น 1 ⚡ ใส่หมวดหลักจากหมวด ERP ───────── */
  const [rules, setRules] = useState<Record<string, string> | null>(null);
  const [defCat, setDefCat] = useState("");
  useEffect(() => {
    let off = false;
    apiFetch(`/api/website/field-map?shop=${encodeURIComponent(shop.slug)}`)
      .then((r) => r.json())
      .then((j) => {
        if (off) return;
        const c = j?.fieldMap?.category ?? {};
        setRules(
          c.rules && typeof c.rules === "object"
            ? (c.rules as Record<string, string>)
            : {},
        );
        setDefCat(typeof c.default === "string" ? c.default : "");
      })
      .catch(() => {
        if (!off) setRules({});
      });
    return () => {
      off = true;
    };
  }, [shop.slug]);

  const unsorted = useMemo(() => listings.filter(isUnsorted), [listings]);
  const groups = useMemo(() => groupByErp(unsorted), [unsorted]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const ruleOf = (name: string) =>
    rules?.[name] && catOf(rules[name]) ? rules[name] : "";
  const pickOf = (name: string) =>
    picks[name] ?? (ruleOf(name) || guessWebCategory(name, cats));
  const pickTag = (name: string) =>
    picks[name] !== undefined
      ? "แก้แล้ว"
      : ruleOf(name)
        ? "กฎเดิม"
        : guessWebCategory(name, cats)
          ? "เดาให้"
          : "";
  const planned = groups.filter((g) => g.name && pickOf(g.name));
  const step1Count = planned.reduce((n, g) => n + g.items.length, 0);
  const [open1, setOpen1] = useState(true);
  const [confirm1, setConfirm1] = useState(false);

  const applyStep1 = async () => {
    setConfirm1(false);
    const map = Object.fromEntries(
      groups.filter((g) => g.name).map((g) => [g.name, pickOf(g.name)]),
    );
    setBusy(true);
    try {
      const j = await post({ action: "applyErpMap", map });
      const done = new Set<string>(
        Array.isArray(j.parentIds) ? j.parentIds : [],
      );
      const hit = listings.filter((l) => done.has(l.parentId));
      setLocal(
        new Map(
          hit.map((l) => {
            const key = map[(l.erpCategory ?? "").trim()];
            const nx = key ? withSub([], key, cats) : [];
            return [l.parentId, { webCategories: nx, categories: nx }];
          }),
        ),
      );
      if (hit.length)
        setUndo((u) => [
          ...u.slice(-19),
          { label: `ใส่หมวดจาก ERP ${hit.length} ตัว`, items: hit.map(snap) },
        ]);
      if (j.rules && typeof j.rules === "object") setRules(j.rules);
      setPicks({});
      toast.success(
        `ใส่หมวดให้ ${Number(j.count) || 0} ตัวแล้ว · จำกฎไว้ใช้กับสินค้าใหม่แล้ว`,
      );
    } catch (e) {
      toast.error(
        e instanceof Error && e.message ? e.message : "ใส่หมวดไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  };

  /* ───────── ขั้น 2 🗂 กระดาน ───────── */
  const listOf = useMemo(
    () => new Map(listings.map((l) => [l.parentId, sortedCats(l)])),
    [listings],
  );
  const rows = useMemo(() => {
    const out: Row[] = [
      { node: NONE, label: "⚠️ ยังไม่ได้จัด", icon: "", depth: 0 },
    ];
    for (const { cat, depth } of treeRows) {
      out.push({
        node: cat.key,
        label: cat.label,
        icon: (cat as CategoryDef).icon ?? "",
        depth,
      });
      if (depth === 0 && childCategories(cats, cat.key).length)
        out.push({
          node: nosubNode(cat.key),
          label: "ยังไม่มีหมวดย่อย",
          icon: "",
          depth: 1,
          muted: true,
        });
    }
    return out;
  }, [treeRows, cats]);
  const counts = useMemo(() => {
    const m = new Map<string, number>(rows.map((r) => [r.node, 0]));
    for (const l of listings) {
      const list = listOf.get(l.parentId) ?? [];
      for (const r of rows)
        if (inNode(list, r.node, cats)) m.set(r.node, (m.get(r.node) ?? 0) + 1);
    }
    return m;
  }, [rows, listings, listOf, cats]);

  const [node, setNode] = useState<string>(NONE);
  // เปิดครั้งแรก: ไม่มีกองยังไม่ได้จัด = ไปกอง "ยังไม่มีหมวดย่อย" กองแรกที่มีของ
  const [nodeInit, setNodeInit] = useState(false);
  useEffect(() => {
    if (nodeInit || !listings.length) return;
    setNodeInit(true);
    if ((counts.get(NONE) ?? 0) > 0) return;
    const pile =
      rows.find((r) => nodeMain(r.node) && (counts.get(r.node) ?? 0) > 0) ??
      rows[1];
    if (pile) setNode(pile.node);
  }, [nodeInit, listings.length, counts, rows]);
  // หมวดที่เปิดอยู่ถูกลบ → กลับกองยังไม่ได้จัด
  useEffect(() => {
    if (!rows.some((r) => r.node === node)) setNode(NONE);
  }, [rows, node]);

  const [q, setQ] = useState("");
  // 🔃 เรียงในกอง (ต่อคน): ยังไม่มีหมวดย่อยขึ้นก่อน (ค่าเริ่ม) / ตามเดิม — เฉพาะหมวดที่มีหมวดย่อย
  const [sortMode, setSortMode] = useUserPref<"nosub" | "default">("website_sorter_sort", "nosub", (v) => (v === "nosub" || v === "default" ? v : null));
  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = listings.filter(
      (l) =>
        inNode(listOf.get(l.parentId) ?? [], node, cats) &&
        (!t || `${nameOf(l)} ${l.erpName} ${l.code}`.toLowerCase().includes(t)),
    );
    const main = node === NONE || nodeMain(node) ? null : mainOf(cats, node);
    if (sortMode !== "nosub" || !main || !childCategories(cats, main).length) return list;
    const lacks = (l: Listing) => (lacksSub(listOf.get(l.parentId) ?? [], main, cats) ? 0 : 1);
    return [...list].sort((a, b) => lacks(a) - lacks(b));
  }, [listings, listOf, node, cats, q, sortMode]);

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => {
    setSel(new Set());
    setLast(null);
  }, [node]);
  const picked = items
    .filter((l) => sel.has(l.parentId))
    .map((l) => l.parentId);
  const allSel = items.length > 0 && picked.length === items.length;
  const clickItem = (e: React.MouseEvent, i: number, id: string) => {
    if (e.shiftKey && last !== null) {
      const [a, b] = last < i ? [last, i] : [i, last];
      setSel((s) => {
        const n = new Set(s);
        items.slice(a, b + 1).forEach((l) => n.add(l.parentId));
        return n;
      });
    } else
      setSel((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      });
    setLast(i);
  };

  const curMain = node === NONE ? null : (nodeMain(node) ?? mainOf(cats, node));
  const isSub = node !== NONE && !nodeMain(node) && mainOf(cats, node) !== node;
  const targets = useMemo(() => quickTargets(node, cats), [node, cats]);
  // ⭐ หมวดโปรด (ต่อคน ต่อร้าน) — ปุ่มบนแถบต่อจากปลายทางปกติ (ปุ่มลัดเลขต่อกัน) · ปัก/ถอนจากช่องค้นหาหมวดอื่น
  const [favRaw, setFavs] = useUserPref<string[]>(`website_sorter_favs_${shop.id}`, [], (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null));
  const favs = useMemo(() => favRaw.filter((k) => cats.some((c) => c.key === k)), [favRaw, cats]);
  const favSet = useMemo(() => new Set(favs), [favs]);
  const toggleFav = (k: string) => setFavs(favs.includes(k) ? favs.filter((x) => x !== k) : [...favs, k]);
  const keyTargets = useMemo(() => shortcutTargets(targets, favs, node), [targets, favs, node]);
  const favChips = keyTargets.slice(targets.length);
  // ↪ ย้าย / ＋ เพิ่ม: ask = ถามทุกครั้ง · move / add = จำคำตอบไว้ (ต่อคน · เปลี่ยนที่ปุ่ม ⚙ บนแถบ)
  const [pickMode, setPickMode] = useUserPref<"ask" | "move" | "add">("website_sorter_pick_mode", "ask", (v) => (v === "ask" || v === "move" || v === "add" ? v : null));
  const [askFor, setAskFor] = useState<{ ids: string[]; target: string } | null>(null);
  const [remember, setRemember] = useState(false);
  const addTo = (ids: string[], target: string) => {
    void change(
      ids,
      (list) => addToTarget(list, target, cats),
      `เพิ่ม {n} ตัวเข้า ${labelOf(target)}`,
      target,
    );
  };
  const move = (ids: string[], target: string) => {
    if (!ids.length || busy || target === node) return;
    // มาจากกองยังไม่ได้จัด / ไปกองพิเศษ = ย้ายอย่างเดียว · ไม่งั้นถาม (หรือใช้คำตอบที่จำไว้)
    if (canAddTo(node, target)) {
      if (pickMode === "add") return addTo(ids, target);
      if (pickMode === "move") return moveOutNow(ids, target);
      setRemember(false);
      setAskFor({ ids, target });
      return;
    }
    moveNow(ids, target);
  };
  // ↪ ย้ายที่ผู้ใช้เลือกเอง = ออกจากที่อยู่ตอนนี้จริง (ข้ามตระกูล = ออกจากทั้งตระกูลเดิม · lib moveOut)
  const moveOutNow = (ids: string[], target: string) => {
    const from = node;
    void change(
      ids,
      (list) => moveOut(list, from, target, cats),
      `ย้าย {n} ตัวไป ${labelOf(target)}`,
      target,
    );
  };
  const answer = (how: "move" | "add") => {
    const a = askFor;
    setAskFor(null);
    if (!a) return;
    if (remember) setPickMode(how);
    if (how === "add") addTo(a.ids, a.target);
    else moveOutNow(a.ids, a.target);
  };
  const moveNow = (ids: string[], target: string) => {
    const from = node;
    void change(
      ids,
      (list) => moveToTarget(list, from, target, cats),
      `ย้าย {n} ตัวไป ${labelOf(target)}`,
      target,
    );
  };
  const removeHere = (ids: string[]) => {
    if (!ids.length || busy || node === NONE) return;
    const from = node;
    void change(
      ids,
      (list) => removeFromNode(list, from, cats),
      `เอา {n} ตัวออกจาก ${labelOf(from)}`,
      from,
    );
  };

  // ⌨️ เลข 1–9 = ย้ายไปชิปนั้น · Esc = ยกเลิกเลือก · Ctrl+Z = ย้อน (ไม่ทำงานตอนพิมพ์ในช่อง/มีหน้าต่างเปิดทับ)
  const [newCat, setNewCat] = useState<{ parent: string | null } | null>(null);
  const blocked = paused || confirm1 || !!newCat || !!askFor;
  useEffect(() => {
    if (blocked) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.closest("input, textarea, select, [contenteditable='true']")) return;
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        if (!undo.length) return;
        e.preventDefault();
        void undoLast();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") {
        setSel(new Set());
        return;
      }
      const n = Number(e.key);
      if (
        Number.isInteger(n) &&
        n >= 1 &&
        n <= 9 &&
        keyTargets[n - 1] &&
        picked.length
      ) {
        e.preventDefault();
        move(picked, keyTargets[n - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ป๊อปถาม: M = ย้าย · A = เพิ่ม (Esc = ยกเลิก จัดการโดยป๊อปกลาง)
  useEffect(() => {
    if (!askFor) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "m" || k === "a") {
        e.preventDefault();
        answer(k === "m" ? "move" : "add");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // 🖱 ลากรูปไปวางบนหมวดทางซ้าย (ลากตัวที่เลือกอยู่ = ย้ายทั้งชุด)
  const [dropNode, setDropNode] = useState<string | null>(null);
  const dragStart = (e: React.DragEvent, id: string) => {
    const ids = sel.has(id) ? picked : [id];
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  };
  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (target === node || !e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dropNode !== target) setDropNode(target);
    },
    onDragLeave: () => setDropNode((d) => (d === target ? null : d)),
    onDrop: (e: React.DragEvent) => {
      setDropNode(null);
      if (target === node) return;
      e.preventDefault();
      try {
        const ids = JSON.parse(e.dataTransfer.getData(DRAG_MIME) || "[]");
        if (Array.isArray(ids))
          move(
            ids.filter((x): x is string => typeof x === "string"),
            target,
          );
      } catch {
        /* ไม่ใช่ของเรา */
      }
    },
  });

  const createCat = async (c: { key: string; label: string }) => {
    const parent = newCat?.parent ?? null;
    setNewCat(null);
    try {
      await post({
        action: "addCategory",
        newCategory: { key: c.key, label: c.label, parent },
      });
      await reload();
      toast.success(
        `เพิ่มหมวด “${c.label}” แล้ว — เลือกสินค้าแล้วกดชิป หรือลากไปวางได้เลย`,
      );
    } catch (e) {
      toast.error(
        e instanceof Error && e.message ? e.message : "เพิ่มหมวดไม่สำเร็จ",
      );
    }
  };

  const chipCls =
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-40";
  const selectCls =
    "rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100";

  return (
    <div className="space-y-4">
      {/* ⚡ ขั้น 1 — โชว์เมื่อยังมีสินค้าที่ยังไม่ได้จัด */}
      {groups.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60">
          <button
            type="button"
            onClick={() => setOpen1((v) => !v)}
            className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <span>
              <span className="font-semibold text-slate-800">
                ⚡ ขั้น 1 · ใส่หมวดหลักทีเดียวจากหมวดใน ERP
              </span>{" "}
              <span className="text-xs text-amber-800">
                ยังไม่ได้จัด {unsorted.length} ตัว
              </span>
            </span>
            <span className="text-xs text-slate-500">
              {open1 ? "▾ ซ่อน" : "▸ เปิด"}
            </span>
          </button>
          {open1 && (
            <div className="px-4 pb-4 space-y-2">
              <p className="text-xs text-slate-600">
                เลือกหมวดบนเว็บให้แต่ละหมวดใน ERP (ระบบเลือกให้ก่อนแล้ว แก้ได้)
                แล้วกดปุ่มเดียว ใส่ให้ทั้งกลุ่ม · ระบบจะจำกฎไว้ สินค้าใหม่ในหมวด
                ERP เดียวกันเข้าหมวดนี้เอง
                {defCat && catOf(defCat) && (
                  <>
                    {" "}
                    · ตอนนี้ตัวที่ยังไม่ได้จัด เว็บโยนไปหมวด “{labelOf(defCat)}”
                    ทั้งหมด (ค่าเริ่มต้น)
                  </>
                )}
              </p>
              <div className="rounded-lg border border-amber-100 bg-white divide-y divide-slate-100">
                {groups.map((g) => (
                  <div
                    key={g.name || "__none"}
                    className="flex flex-wrap items-center gap-2 px-3 py-2"
                  >
                    <span className="flex -space-x-2 shrink-0">
                      {g.items.slice(0, 4).map((l) => (
                        <Mini key={l.parentId} l={l} />
                      ))}
                    </span>
                    <span className="flex-1 min-w-[8rem]">
                      <span className="block text-sm text-slate-800">
                        {g.name || "ไม่มีหมวดใน ERP"}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {g.items.length} ตัว
                      </span>
                    </span>
                    <span className="text-slate-300">→</span>
                    {g.name ? (
                      <span className="flex items-center gap-1.5">
                        <select
                          value={pickOf(g.name)}
                          onChange={(e) =>
                            setPicks((p) => ({
                              ...p,
                              [g.name]: e.target.value,
                            }))
                          }
                          className={`${selectCls} w-52 !text-sm !py-1.5`}
                        >
                          <option value="">— ยังไม่ใส่ (จัดเองในขั้น 2)</option>
                          {treeRows.map(({ cat }) => (
                            <option key={cat.key} value={cat.key}>
                              {categoryChoiceLabel(cat)}
                            </option>
                          ))}
                        </select>
                        <span className="w-12 text-[10px] text-slate-400">
                          {pickTag(g.name)}
                        </span>
                      </span>
                    ) : (
                      <span className="w-[16.375rem] text-xs text-slate-400">
                        จัดเองในขั้น 2 ↓
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs text-slate-500">
                  {rules === null
                    ? "กำลังโหลดกฎเดิม…"
                    : `จะใส่หมวดให้ ${step1Count} ตัว · ย้อนได้`}
                </span>
                <button
                  type="button"
                  disabled={busy || rules === null || !step1Count}
                  onClick={() => setConfirm1(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
                >
                  ⚡ ใส่หมวดให้ {step1Count} ตัว
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 🗂 ขั้น 2 — กระดาน */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
          <div>
            <p className="font-semibold text-slate-800">
              🗂 ขั้น 2 · กระดานจัดหมวดย่อย
            </p>
            <p className="text-xs text-slate-500">
              คลิกรูปเพื่อเลือก (Shift+คลิก = เลือกเป็นช่วง) → กดชิปหรือเลข 1–9
              · ลากไปวางบนหมวดทางซ้ายก็ได้ · ดับเบิลคลิก = เปิดตั้งค่าสินค้า
            </p>
          </div>
          <button
            type="button"
            disabled={!undo.length || busy}
            onClick={() => void undoLast()}
            title={
              undo.length
                ? `ย้อน: ${undo[undo.length - 1].label} (Ctrl+Z)`
                : "ยังไม่มีอะไรให้ย้อน"
            }
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-slate-400 disabled:opacity-40"
          >
            ↩ ย้อน{undo.length ? ` (${undo.length})` : ""}
          </button>
        </header>

        <div className="grid md:grid-cols-[15rem_minmax(0,1fr)]">
          {/* ซ้าย: ต้นไม้หมวด (วางรูปที่ลากมาได้) */}
          <nav className="border-b md:border-b-0 md:border-r border-slate-100 p-2 max-h-[18rem] md:max-h-[70vh] overflow-y-auto">
            {rows.map((r) => {
              const n = counts.get(r.node) ?? 0;
              const on = r.node === node;
              const over = dropNode === r.node;
              return (
                <button
                  key={r.node}
                  type="button"
                  onClick={() => setNode(r.node)}
                  {...dropProps(r.node)}
                  className={`w-full flex items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-sm transition ${r.depth ? "pl-6" : "pl-2"} ${
                    on
                      ? "bg-slate-900 text-white"
                      : over
                        ? "bg-blue-50 ring-2 ring-blue-400 text-blue-800"
                        : r.node === NONE && n
                          ? "text-amber-800 hover:bg-amber-50"
                          : r.muted
                            ? "text-slate-400 italic hover:bg-slate-50"
                            : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {r.icon && <span>{r.icon}</span>}
                  <span className="flex-1 truncate">{r.label}</span>
                  <span
                    className={`text-xs tabular-nums ${on ? "text-white/80" : r.node === NONE && n ? "font-semibold" : "text-slate-400"}`}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setNewCat({ parent: null })}
              className="mt-1 w-full rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:border-slate-500 hover:text-slate-700"
            >
              + เพิ่มหมวด
            </button>
          </nav>

          {/* ขวา: รูปสินค้าในกองที่เลือก */}
          <div className="p-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <p className="text-sm font-medium text-slate-800 mr-auto">
                {node === NONE
                  ? "⚠️ ยังไม่ได้จัด"
                  : curMain && curMain !== node
                    ? `${labelOf(curMain)} › ${nodeMain(node) ? "ยังไม่มีหมวดย่อย" : labelOf(node)}`
                    : labelOf(node)}{" "}
                <span className="font-normal text-slate-400">
                  · {items.length} ตัว
                </span>
              </p>
              {curMain && childCategories(cats, curMain).length > 0 && !nodeMain(node) && (
                <>
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    เรียง
                    <select value={sortMode} onChange={(e) => setSortMode(e.target.value === "default" ? "default" : "nosub")} className="h-7 rounded-lg border border-slate-200 px-1.5 text-xs">
                      <option value="nosub">ยังไม่มีหมวดย่อยขึ้นก่อน</option>
                      <option value="default">ตามเดิม</option>
                    </select>
                  </label>
                  {(counts.get(nosubNode(curMain)) ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setNode(nosubNode(curMain))}
                      title="ดูเฉพาะตัวที่ยังไม่มีหมวดย่อย"
                      className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-800 hover:border-amber-500"
                    >
                      ⚠ ยังไม่มีหมวดย่อย {counts.get(nosubNode(curMain))}
                    </button>
                  )}
                </>
              )}
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาในกองนี้"
                className="w-44 rounded-lg border border-slate-200 px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                disabled={!items.length}
                onClick={() =>
                  setSel(
                    allSel ? new Set() : new Set(items.map((l) => l.parentId)),
                  )
                }
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400 disabled:opacity-40"
              >
                {allSel ? "ยกเลิกเลือก" : `เลือกทั้งหมด (${items.length})`}
              </button>
            </div>

            {/* ชิปย้าย (เลข = ปุ่มลัด) */}
            <div
              className={`sticky top-0 z-10 -mx-3 mb-2 border-y px-3 py-2 ${picked.length ? "bg-blue-50 border-blue-100" : "bg-slate-50 border-slate-100"}`}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-slate-600">
                  {picked.length ? (
                    <>
                      {node === NONE || pickMode === "move" ? "ย้าย" : pickMode === "add" ? "เพิ่ม" : "ย้าย/เพิ่ม"} <b className="text-blue-700">{picked.length}</b>{" "}
                      ตัวไป:
                    </>
                  ) : (
                    "เลือกสินค้าก่อน แล้วกดหมวดที่จะย้ายไป:"
                  )}
                </span>
                {targets.map((k, i) => (
                  <button
                    key={k}
                    type="button"
                    disabled={!picked.length || busy}
                    onClick={() => move(picked, k)}
                    className={`${chipCls} border-slate-300 bg-white text-slate-700 enabled:hover:border-blue-500 enabled:hover:text-blue-700`}
                  >
                    {i < 9 && (
                      <kbd className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-500">
                        {i + 1}
                      </kbd>
                    )}
                    {catOf(k)?.icon ? `${catOf(k)?.icon} ` : ""}
                    {labelOf(k)}
                  </button>
                ))}
                {isSub && curMain && (
                  <button
                    type="button"
                    disabled={!picked.length || busy}
                    onClick={() => move(picked, nosubNode(curMain))}
                    className={`${chipCls} border-dashed border-slate-300 bg-white text-slate-500 enabled:hover:border-slate-500`}
                  >
                    ↩ ยังไม่มีหมวดย่อย
                  </button>
                )}
                {/* ⭐ หมวดโปรด (ปุ่มลัดเลขต่อจากปลายทางปกติ) */}
                {favChips.map((k, j) => {
                  const i = targets.length + j;
                  return (
                    <button
                      key={`fav-${k}`}
                      type="button"
                      disabled={!picked.length || busy}
                      onClick={() => move(picked, k)}
                      title="หมวดโปรด — ถอนได้ที่ ⭐ ในช่องค้นหาหมวดอื่น"
                      className={`${chipCls} border-amber-300 bg-amber-50 text-amber-800 enabled:hover:border-amber-500`}
                    >
                      {i < 9 && <kbd className="rounded bg-white px-1 font-mono text-[10px] text-amber-700">{i + 1}</kbd>}⭐ {labelOf(k)}
                    </button>
                  );
                })}
                <SearchPick
                  className="w-44"
                  placeholder="หมวดอื่น… พิมพ์ค้นหา"
                  disabled={busy}
                  options={treeRows
                    .filter(({ cat }) => cat.key !== node)
                    .map(({ cat }) => ({ value: cat.key, label: categoryChoiceLabel(cat), hint: cat.key, indent: !!cat.parent }))}
                  starred={favSet}
                  onToggleStar={toggleFav}
                  onPick={(k) => {
                    if (!picked.length) return toast.info("เลือกสินค้าก่อน แล้วค่อยเลือกหมวด");
                    move(picked, k);
                  }}
                  emptyText="ไม่พบหมวด — กด + หมวดย่อยใหม่ ได้"
                />
                {node !== NONE && (
                  <button
                    type="button"
                    onClick={() => setPickMode(pickMode === "ask" ? "move" : pickMode === "move" ? "add" : "ask")}
                    title="เลือกหมวดแล้วจะทำอะไร — กดเพื่อสลับ: ถามทุกครั้ง → ย้ายเสมอ → เพิ่มเสมอ"
                    className={`${chipCls} border-slate-300 bg-white text-slate-600 hover:border-slate-500`}
                  >
                    ⚙ {pickMode === "ask" ? "ถามย้าย/เพิ่ม" : pickMode === "move" ? "ย้ายเสมอ" : "เพิ่มเสมอ"}
                  </button>
                )}
                {node !== NONE && (
                  <button
                    type="button"
                    disabled={!picked.length || busy}
                    onClick={() => removeHere(picked)}
                    className={`${chipCls} border-red-200 bg-white text-red-600 enabled:hover:border-red-400`}
                  >
                    ✕ เอาออกจากหมวดนี้
                  </button>
                )}
                {curMain && (
                  <button
                    type="button"
                    onClick={() => setNewCat({ parent: curMain })}
                    className="ml-auto text-xs text-blue-600 hover:underline"
                  >
                    + หมวดย่อยใหม่ใน {labelOf(curMain)}
                  </button>
                )}
              </div>
            </div>

            {items.length === 0 ? (
              <div className="py-14 text-center text-sm text-slate-400">
                {q.trim()
                  ? "ไม่พบสินค้าที่ค้นหาในกองนี้"
                  : node === NONE
                    ? "🎉 จัดหมวดครบทุกตัวแล้ว"
                    : "ยังไม่มีสินค้าในกองนี้ — ลากรูปมาวางที่หมวดนี้ทางซ้ายได้"}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-2 select-none">
                {items.map((l, i) => {
                  const on = sel.has(l.parentId);
                  const key = imageOf(l);
                  const list = listOf.get(l.parentId) ?? [];
                  const extra = list.filter((k) => k !== curMain && k !== node);
                  return (
                    <button
                      key={l.parentId}
                      type="button"
                      draggable
                      onDragStart={(e) => dragStart(e, l.parentId)}
                      onClick={(e) => clickItem(e, i, l.parentId)}
                      onDoubleClick={() => onOpen(l.parentId)}
                      title={`${nameOf(l)} · ${l.code}${l.erpCategory ? ` · หมวด ERP: ${l.erpCategory}` : ""}`}
                      className={`relative overflow-hidden rounded-lg border bg-white text-left transition ${on ? "border-blue-500 ring-2 ring-blue-300" : "border-slate-200 hover:border-slate-400"} ${l.published ? "" : "opacity-70"}`}
                    >
                      <div className="aspect-square bg-slate-100">
                        {key && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imgUrl(key, 240)}
                            alt=""
                            draggable={false}
                            className="pointer-events-none h-full w-full object-cover"
                            loading="lazy"
                          />
                        )}
                      </div>
                      {on && (
                        <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-[11px] text-white">
                          ✓
                        </span>
                      )}
                      {!l.published && (
                        <span className="absolute right-1 top-1 rounded bg-slate-800/75 px-1 text-[9px] text-white">
                          ซ่อน
                        </span>
                      )}
                      <div className="p-1.5">
                        <p className="min-h-[1.75rem] text-[11px] leading-tight text-slate-700 line-clamp-2">
                          {nameOf(l)}
                        </p>
                        {node === NONE ? (
                          <p className="mt-0.5 truncate text-[10px] text-slate-400">
                            ERP: {l.erpCategory || "—"}
                          </p>
                        ) : (
                          <>
                            {curMain && !nodeMain(node) && lacksSub(list, curMain, cats) && (
                              <p className="mt-0.5 truncate text-[10px] text-amber-700">⚠ ยังไม่มีหมวดย่อย</p>
                            )}
                            {extra.length > 0 && (
                              <p className="mt-0.5 truncate text-[10px] text-blue-700">
                                {extra.map(labelOf).join(" · ")}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirm1}
        onClose={() => setConfirm1(false)}
        onConfirm={() => void applyStep1()}
        title={`ใส่หมวดให้ ${step1Count} ตัว?`}
        message={
          <div className="space-y-2 text-sm">
            <ul className="space-y-0.5">
              {planned.map((g) => (
                <li key={g.name}>
                  {g.name}{" "}
                  <span className="text-slate-400">({g.items.length})</span> →{" "}
                  <b>{labelOf(pickOf(g.name))}</b>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              ระบบจะจำกฎนี้ไว้ (สินค้าใหม่ในหมวด ERP เดียวกันเข้าหมวดนี้เอง) ·
              ใส่แล้วกด ↩ ย้อน ได้
            </p>
          </div>
        }
        confirmText="⚡ ใส่หมวด"
        loading={busy}
      />
      <ERPModal
        open={!!askFor}
        onClose={() => setAskFor(null)}
        title={askFor ? `ไปที่ "${labelOf(askFor.target)}" — ย้ายหรือเพิ่ม? (${askFor.ids.length} ตัว)` : ""}
        size="sm"
        resizable={false}
      >
        {askFor && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">สินค้าอยู่ได้หลายหมวด — เลือกว่าจะทำแบบไหน</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" autoFocus onClick={() => answer("move")} className="rounded-xl border border-slate-300 p-3 text-left hover:border-blue-500 hover:bg-blue-50">
                <div className="text-sm font-semibold text-slate-800">
                  ↪ ย้าย <kbd className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-500">M</kbd>
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-500">
                  {crossFamily(node, askFor.target, cats)
                    ? `ออกจาก ${labelOf(nodeMain(node) ?? mainOf(cats, node))} ไปอยู่ ${labelOf(askFor.target)} แทน`
                    : mainOf(cats, askFor.target) !== askFor.target
                      ? `เปลี่ยนหมวดย่อยเป็น ${labelOf(askFor.target)} (หมวดย่อยเดิมออก · ยังอยู่ ${labelOf(mainOf(cats, askFor.target))})`
                      : `ออกจาก ${labelOf(node)} ไปอยู่ ${labelOf(askFor.target)} แทน`}
                </div>
              </button>
              <button type="button" onClick={() => answer("add")} className="rounded-xl border border-slate-300 p-3 text-left hover:border-blue-500 hover:bg-blue-50">
                <div className="text-sm font-semibold text-slate-800">
                  ＋ เพิ่ม <kbd className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-500">A</kbd>
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-500">คงหมวดเดิมไว้ + อยู่ใน {labelOf(askFor.target)} ด้วย</div>
              </button>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              จำคำตอบนี้ ไม่ต้องถามอีก (เปลี่ยนได้ที่ปุ่ม ⚙ บนแถบ)
            </label>
          </div>
        )}
      </ERPModal>
      {newCat && (
        <NewCategoryModal
          open
          onClose={() => setNewCat(null)}
          taken={cats.map((c) => c.key)}
          parentLabel={newCat.parent ? labelOf(newCat.parent) : null}
          suggestPrefix={newCat.parent ?? ""}
          onCreate={(c) => void createCat(c)}
        />
      )}
    </div>
  );
}
