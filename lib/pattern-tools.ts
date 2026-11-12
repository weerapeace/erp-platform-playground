/**
 * 🧰 ทะเบียนเครื่องมือของสตูดิโอแพทเทิร์น (Bag CAD รอบ D · 2026-11-12) — ที่เดียวที่บอกว่าเครื่องมือแต่ละตัวชื่ออะไร (ไทย · อังกฤษ)
 *   ค้นด้วยคำไหนได้ (คำใกล้เคียง เช่น "เผื่อเย็บ" = "offset" = "ตะเข็บ") · ปุ่มลัด · อยู่โหมดไหน · ทำยังไง · มีภาพเคลื่อนไหวตัวอย่างไหม
 *   โหมด: 1 เริ่มต้น (เครื่องมือหลัก + ชื่อไทยบนปุ่ม) · 2 มาตรฐาน (ครบตามงาน) · 3 ขั้นสูง (ฟิสิกส์ / ค่าวัสดุ / ข้อมูลชิ้นละเอียด)
 *   เปลี่ยนโหมด = เปลี่ยนแค่สิ่งที่โชว์ ข้อมูลและรูปชิ้นไม่เปลี่ยน · ทุกเครื่องมือค้นหาได้ทุกโหมด (ถ้าอยู่โหมดสูงกว่า ระบบสลับโหมดให้แล้วบอก)
 *   target = กดผลค้นหาแล้วไปที่ไหน: tool (ถือเครื่องมือบนกระดาน) · guide (ไฮไลต์ส่วนของแผงขวา data-guide) · studio (ปุ่ม/แผงของสตูดิโอ) · view3d
 * ใช้ที่: components/pattern-studio (ช่องค้นหา Ctrl+K · ป้ายโหมด) · components/pattern-sheet/shape-editor (ชื่อบนปุ่ม/คำอธิบายเมื่อชี้) · เทสต์ lib/__tests__/pattern-tools.test.ts
 */
export type ToolLevel = 1 | 2 | 3;
export type StudioLevel = "beg" | "std" | "adv";
export const LEVEL_NUM: Record<StudioLevel, ToolLevel> = { beg: 1, std: 2, adv: 3 };
export const STUDIO_LEVELS: { key: StudioLevel; th: string; en: string; descTh: string; descEn: string }[] = [
  { key: "beg", th: "เริ่มต้น", en: "Beginner", descTh: "เครื่องมือหลัก มีชื่อไทยบนปุ่ม แผงขวาแบบย่อ", descEn: "Core tools with labels, a shorter side panel" },
  { key: "std", th: "มาตรฐาน", en: "Standard", descTh: "เครื่องมือครบตามงานประจำวัน", descEn: "Everything for daily work" },
  { key: "adv", th: "ขั้นสูง", en: "Advanced", descTh: "เพิ่มจำลองทิ้งตัว ค่าวัสดุ ข้อมูลชิ้นละเอียด", descEn: "Adds drape simulation, material values, detailed piece data" },
];
export const isStudioLevel = (v: unknown): v is StudioLevel => v === "beg" || v === "std" || v === "adv";

type Txt = { th: string; en: string };
export type ToolTarget =
  | { kind: "tool"; tool: string }
  | { kind: "guide"; el: string; select?: boolean }
  | { kind: "studio"; id: "check" | "pieces" | "learn" | "template" | "photo" | "dxf" | "lining" | "pocket" | "print" | "trims" | "unit" }
  | { kind: "view3d"; view: "sewn" | "explode" | "steps" | "sim" | "flat" };
/** ภาพเคลื่อนไหวตัวอย่างที่มี (components/pattern-studio/tool-demo) */
export type DemoId = "move" | "rect" | "pen" | "measure" | "sew" | "sewpart" | "allow" | "round";
export type ToolDef = {
  id: string; icon: string; th: string; en: string; key?: string; level: ToolLevel;
  group: "draw" | "sew" | "piece" | "edge" | "check" | "studio" | "view";
  /** คำค้นเพิ่ม (คำใกล้เคียง ไทย/อังกฤษ คั่นด้วยช่องว่าง) */ words: string;
  desc: Txt; steps: Txt[]; target: ToolTarget; demo?: DemoId;
};
export const TOOL_GROUPS: Record<ToolDef["group"], Txt> = {
  draw: { th: "วาดและเลือก", en: "Draw and select" }, sew: { th: "เย็บ", en: "Sewing" }, piece: { th: "ชิ้น (แผงขวา)", en: "Piece (side panel)" },
  edge: { th: "ขอบ (แก้ตะเข็บ B)", en: "Edge (Edit sewing B)" }, check: { th: "ตรวจและผลิต", en: "Check and produce" }, studio: { th: "สตูดิโอ", en: "Studio" }, view: { th: "ภาพ 3 มิติ", en: "3D view" },
};
const T = (th: string, en: string): Txt => ({ th, en });

export const PATTERN_TOOLS: ToolDef[] = [
  // ── วาดและเลือก ──
  { id: "move", icon: "pointer", th: "ย้าย / เลือก", en: "Move / select", key: "V", level: 1, group: "draw", words: "เลือก ย้าย ลาก select move drag ขยับ ย่อขยาย หมุน scale rotate", demo: "move",
    desc: T("กดชิ้นเพื่อเลือกและลากย้าย · จุดจับรอบชิ้น = ย่อขยาย/หมุน", "Click a piece to select and drag it · handles resize or rotate"),
    steps: [T("กด V", "Press V"), T("คลิกชิ้น — แผงขวาโชว์รายละเอียด", "Click a piece — the side panel shows its details"), T("ลากเพื่อย้าย · ลากจุดจับรอบชิ้นเพื่อย่อขยาย", "Drag to move · drag the handles to resize")], target: { kind: "tool", tool: "move" } },
  { id: "rect", icon: "square", th: "สี่เหลี่ยม", en: "Rectangle", key: "R", level: 1, group: "draw", words: "สี่เหลี่ยม กล่อง rectangle rect box square จัตุรัส", demo: "rect",
    desc: T("ลากบนกระดานเพื่อวาดชิ้นสี่เหลี่ยม (Shift = จัตุรัส)", "Drag on the board to draw a rectangle (Shift = square)"),
    steps: [T("กด R", "Press R"), T("กดค้างที่มุมหนึ่ง ลากไปอีกมุม แล้วปล่อย", "Press at one corner, drag to the other, release"), T("พิมพ์ขนาดจริงที่แผงขวา 'ขนาดสำเร็จ'", "Type the exact size under 'Finished size'")], target: { kind: "tool", tool: "rect" } },
  { id: "ellipse", icon: "circle", th: "วงกลม / วงรี", en: "Circle / ellipse", key: "O", level: 1, group: "draw", words: "วงกลม วงรี circle ellipse oval กลม",
    desc: T("ลากเพื่อวาดวงรี (Shift = วงกลม)", "Drag to draw an ellipse (Shift = circle)"), steps: [T("กด O", "Press O"), T("ลากบนกระดาน", "Drag on the board")], target: { kind: "tool", tool: "ellipse" } },
  { id: "pen", icon: "vector-bezier", th: "ปากกา", en: "Pen", key: "P", level: 1, group: "draw", words: "ปากกา เส้นโค้ง bezier pen path polygon หลายเหลี่ยม วาดอิสระ curve", demo: "pen",
    desc: T("คลิกวางจุดมุม · กดค้างแล้วลาก = เส้นโค้ง · คลิกจุดแรกเพื่อปิดรูป", "Click to place corners · press and drag for curves · click the first point to close"),
    steps: [T("กด P", "Press P"), T("คลิกทีละจุดรอบรูป", "Click point by point around the shape"), T("กดค้างแล้วลาก = ดัดเป็นเส้นโค้ง", "Press and drag to bend a curve"), T("คลิกจุดแรก หรือ Enter เพื่อปิดรูป", "Click the first point or Enter to close")], target: { kind: "tool", tool: "pen" } },
  { id: "hand", icon: "hand-stop", th: "เลื่อนดู", en: "Pan", key: "H", level: 1, group: "draw", words: "เลื่อน มือ pan hand scroll ซูม zoom", desc: T("ลากที่ว่างเพื่อเลื่อนกระดาน · ล้อเมาส์ = ซูม", "Drag empty space to pan · mouse wheel zooms"), steps: [T("กด H หรือกด Space ค้าง", "Press H, or hold Space"), T("ลากกระดาน", "Drag the board")], target: { kind: "tool", tool: "hand" } },
  { id: "measure", icon: "ruler-measure", th: "ไม้บรรทัด", en: "Measure", key: "M", level: 1, group: "draw", words: "วัด ไม้บรรทัด ruler measure ระยะ ความยาว length distance วัดตามขอบ วัดโค้ง walk", demo: "measure",
    desc: T("วัดตรง / วัดโค้ง / วัดตามขอบ — ตัวเลขเป็นหน่วยที่เลือก", "Measure straight, along a curve or along an edge — in your chosen unit"),
    steps: [T("กด M", "Press M"), T("เลือกแบบวัด ตรง / โค้ง / ตามขอบ ที่แผงขวา", "Pick straight / curve / along edge in the side panel"), T("ลากจากจุดหนึ่งไปอีกจุด", "Drag from one point to another")], target: { kind: "tool", tool: "measure" } },
  { id: "inner", icon: "line", th: "เส้นในชิ้น", en: "Inner line", key: "L", level: 2, group: "draw", words: "เส้นใน แนวเย็บ แนวพับ ตำแหน่ง internal line ช่องเจาะ slit อะไหล่ hardware",
    desc: T("วาดเส้นข้างในชิ้น: แนวเย็บกระเป๋าปะ แนวพับ ช่องเจาะ ตำแหน่งอะไหล่", "Draw lines inside a piece: pocket seams, folds, slits, hardware spots"),
    steps: [T("กด L", "Press L"), T("คลิกจุดแรกในชิ้น แล้วคลิกจุดที่สอง", "Click the first point inside a piece, then the second"), T("พิมพ์ระยะจากขอบได้ที่แผงขวา", "Type distances from the edges in the side panel")], target: { kind: "tool", tool: "inner" } },
  // ── เย็บ ──
  { id: "sew", icon: "needle-thread", th: "เย็บขอบกับขอบ", en: "Segment sewing", key: "N", level: 1, group: "sew", words: "เย็บ ตะเข็บ seam sew stitch ต่อชิ้น เย็บติด", demo: "sew",
    desc: T("คลิกขอบชิ้นแรก แล้วคลิกขอบที่จะเย็บคู่ — เห็นความยาวทั้งสองก่อนกด", "Click the first edge, then the edge to join — both lengths show before you click"),
    steps: [T("กด N", "Press N"), T("คลิกขอบชิ้นแรก (ขึ้นความยาว + ลูกศร)", "Click the first edge (length and arrow appear)"), T("ชี้ขอบชิ้นที่สองดูความต่าง แล้วคลิก", "Hover the second edge to see the difference, then click"), T("ถ้าทิศผิด กด 'กลับทิศ' ในการ์ดตะเข็บ", "If it's reversed, press 'Reverse' in the seam card")], target: { kind: "tool", tool: "sew" } },
  { id: "sewpart", icon: "line-dashed", th: "เย็บบางช่วงของขอบ", en: "Free sewing", key: "J", level: 2, group: "sew", words: "เย็บบางช่วง free sewing partial ช่วง โคนหู",
    demo: "sewpart", desc: T("เย็บเฉพาะช่วงของขอบ เช่น โคนหูกระเป๋า", "Sew just part of an edge, e.g. where a handle attaches"),
    steps: [T("กด J", "Press J"), T("คลิกจุดเริ่ม แล้วจุดจบบนขอบแรก", "Click the start, then the end on the first edge"), T("คลิกจุดเริ่มบนขอบของอีกชิ้น", "Click the start on the other piece's edge")], target: { kind: "tool", tool: "sewpart" } },
  { id: "sewmany", icon: "arrows-split-2", th: "เย็บ 1 ขอบกับหลายชิ้น", en: "1:N sewing", key: "K", level: 2, group: "sew", words: "หลายขอบ หลายชิ้น 1:n one to many ต่อหลายชิ้น ข้าง ก้น",
    desc: T("ขอบยาวหนึ่งขอบ เย็บต่อกับหลายชิ้นเรียงกัน", "One long edge joined to several pieces in a row"), steps: [T("กด K", "Press K"), T("คลิกขอบหลัก", "Click the main edge"), T("คลิกขอบของชิ้นถัดไปทีละชิ้น · Enter = จบ", "Click each next piece's edge · Enter to finish")], target: { kind: "tool", tool: "sewmany" } },
  { id: "sewedit", icon: "needle", th: "แก้ตะเข็บ / ค่าของขอบ", en: "Edit sewing / edge values", key: "B", level: 1, group: "sew", words: "แก้ตะเข็บ กลับทิศ reverse edit sewing ลบตะเข็บ ค่าของขอบ edge properties",
    desc: T("คลิกตะเข็บหรือขอบ: กลับทิศ ลบ ย้ายช่วง ตั้งค่าของขอบ", "Click a seam or edge: reverse, delete, move the range, set edge values"),
    steps: [T("กด B", "Press B"), T("คลิกเส้นตะเข็บ = การ์ดตะเข็บ · คลิกขอบ = ค่าของขอบ", "Click a seam for its card · click an edge for its values")], target: { kind: "tool", tool: "sewedit" } },
  // ── ชิ้น (แผงขวา) ──
  { id: "size", icon: "ruler", th: "ขนาดสำเร็จ (กว้าง × สูง)", en: "Finished size", level: 1, group: "piece", words: "ขนาด กว้าง สูง size width height dimension resize ย่อขยาย",
    desc: T("พิมพ์กว้าง/สูงจริงของชิ้น (เส้นเย็บ) รับ 7 mm · 260/2", "Type the piece's real width/height (sew line) — accepts 7 mm · 260/2"), steps: [T("เลือกชิ้น", "Select a piece"), T("แผงขวา 'ขนาดสำเร็จ' พิมพ์แล้ว Enter", "Side panel 'Finished size': type and press Enter")], target: { kind: "guide", el: "size", select: true } },
  { id: "allow", icon: "scissors", th: "เผื่อเย็บ", en: "Seam allowance", level: 1, group: "piece", words: "เผื่อเย็บ เผื่อพับ ตะเข็บ offset seam allowance margin เส้นตัด cut line ระยะเผื่อ", demo: "allow",
    desc: T("ระยะเผื่อนอกเส้นเย็บ ทั้งชิ้นหรือรายขอบ — เส้นทึบด้านนอกคือเส้นตัด", "Allowance outside the sew line, per piece or per edge — the outer solid line is the cut"),
    steps: [T("เลือกชิ้น", "Select a piece"), T("แผงขวา 'เผื่อพับ / เผื่อเย็บ' พิมพ์ เช่น 7", "Side panel 'Fold / seam allowance': type e.g. 7"), T("ต่างกันรายขอบ: เปิด 'เผื่อรายขอบ'", "Different per edge: open per-edge allowance")], target: { kind: "guide", el: "allow", select: true } },
  { id: "round", icon: "circle-dashed", th: "มุมโค้ง", en: "Round corners (fillet)", level: 1, group: "piece", words: "มุมโค้ง มุมมน ลบมุม fillet round corner radius รัศมี", demo: "round",
    desc: T("ทำมุมทุกมุมของชิ้นให้มนตามรัศมี", "Round every corner of the piece to a radius"), steps: [T("เลือกชิ้น · ปรับขนาดให้เสร็จก่อน", "Select a piece · finish resizing first"), T("แผงขวา 'มุมโค้ง' ใส่รัศมี แล้วกดปุ่ม", "Side panel 'Round': enter the radius and press the button")], target: { kind: "guide", el: "round", select: true } },
  { id: "tools", icon: "tool", th: "พับครึ่ง · กลับด้าน · เส้นขนาน · เจาะรู", en: "Fold · flip · offset · holes", level: 2, group: "piece", words: "พับครึ่ง กลับด้าน mirror flip unfold fold เส้นขนาน offset parallel เจาะรู hole cutout ทางผ้า grain รอยบาก notch แก้จุด edit points",
    desc: T("คำสั่งของชิ้นที่เลือก: พับครึ่ง กลับด้าน เส้นขนาน เจาะรู ทางผ้า รอยบาก แก้จุด", "Commands for the selected piece: fold, flip, offset, holes, grain, notches, edit points"), steps: [T("เลือกชิ้น", "Select a piece"), T("แผงขวา หัวข้อ 'เครื่องมือ'", "Side panel, 'Tools' section")], target: { kind: "guide", el: "tools", select: true } },
  { id: "mats", icon: "palette", th: "วัสดุของชิ้น", en: "Piece materials", level: 1, group: "piece", words: "วัสดุ ผ้า หนัง material fabric leather pu ตีราคา cost",
    desc: T("ชิ้นนี้ตัดจากวัสดุอะไร (1 ชิ้นหลายวัสดุได้) — ใช้ตีราคาและวางบนผ้า", "What the piece is cut from (several allowed) — used for costing and layout"), steps: [T("เลือกชิ้น", "Select a piece"), T("แผงขวา 'วัสดุ' ค้นหาแล้วเลือก", "Side panel 'Materials': search and pick")], target: { kind: "guide", el: "mats", select: true } },
  { id: "transform", icon: "refresh", th: "หมุน / ย่อขยายเป็นตัวเลข", en: "Transform", level: 2, group: "piece", words: "หมุน ย่อขยาย transform rotate scale องศา percent", desc: T("หมุนเป็นองศา · ย่อขยายเป็น %", "Rotate by degrees · scale by %"), steps: [T("เลือกชิ้น", "Select a piece"), T("แผงขวา 'Transform'", "Side panel 'Transform'")], target: { kind: "guide", el: "transform", select: true } },
  { id: "link", icon: "link", th: "ชิ้นคู่ผูกกัน", en: "Linked pieces", level: 2, group: "piece", words: "ชิ้นคู่ ผูก สมมาตร กระจก link mirror symmetric linked ซ้ายขวา", desc: T("แก้ชิ้นต้นแบบแล้วชิ้นคู่เปลี่ยนตาม (กลับซ้ายขวาได้)", "Edit the source and its pair follows (mirrored if you want)"), steps: [T("เลือกชิ้น", "Select a piece"), T("แผงขวา 'ชิ้นคู่' → สร้างชิ้นคู่ (ผูก)", "Side panel 'Linked' → create a linked pair")], target: { kind: "guide", el: "link", select: true } },
  { id: "info", icon: "id", th: "ข้อมูลชิ้นและการอยู่ทรง", en: "Piece details and stiffness", level: 3, group: "piece", words: "รหัสชิ้น ชนิดชิ้น ซับใน แผ่นเสริม ปาดขอบ สกีฟ อยู่ทรง code role lining bond skive stiff",
    desc: T("รหัสชิ้น ชนิดชิ้น (ตัวนอก/ซับใน/เสริม) แผ่นเสริม ปาดขอบ ความอยู่ทรง", "Piece code, type (outer/lining/reinforcement), backing, skiving, stiffness"), steps: [T("เลือกชิ้น", "Select a piece"), T("แผงขวา 'ข้อมูลชิ้นและการอยู่ทรง'", "Side panel 'Piece details and stiffness'")], target: { kind: "guide", el: "info", select: true } },
  // ── ขอบ ──
  { id: "edge-open", icon: "logout", th: "ขอบเปิดตั้งใจ", en: "Intended opening", level: 1, group: "edge", words: "ขอบเปิด ปากกระเป๋า ช่องล้วง opening mouth ไม่เย็บ", desc: T("บอกว่าขอบนี้ตั้งใจไม่เย็บ (ปากกระเป๋า) — แผงตรวจแบบจะไม่เตือน", "Mark an edge as unsewn on purpose (bag mouth) — the check panel won't flag it"), steps: [T("กด B แล้วคลิกขอบ", "Press B and click the edge"), T("ติ๊ก 'ขอบเปิดตั้งใจ'", "Tick 'Intended opening'")], target: { kind: "tool", tool: "sewedit" } },
  { id: "edge-zip", icon: "paperclip", th: "ซิป / กุ๊น / เดินด้ายทับ ตามขอบ", en: "Zip / binding / topstitch on an edge", level: 2, group: "edge", words: "ซิป กุ๊น หุ้มขอบ เดินด้าย topstitch zipper binding piping ขอบพับ fold edge", desc: T("ตั้งงานขอบ: พับเข้าใน กุ๊น ติดซิป เดินด้ายทับ (ทั้งขอบหรือบางช่วง)", "Edge finishes: fold in, binding, zip, topstitch (whole edge or part)"), steps: [T("กด B แล้วคลิกขอบ", "Press B and click the edge"), T("ติ๊กงานที่ต้องการในค่าของขอบ", "Tick the finish in the edge values")], target: { kind: "tool", tool: "sewedit" } },
  { id: "edge-len", icon: "ruler", th: "ความยาวขอบ / แบ่งขอบ / รอยบาก", en: "Edge length / split / notches", level: 2, group: "edge", words: "ความยาวขอบ แบ่งขอบ รอยบาก notch split edge length change length", desc: T("พิมพ์ความยาวขอบ · วางรอยบากแบ่งเท่ากันหรือตามระยะ", "Type the edge length · place notches evenly or by distance"), steps: [T("กด B แล้วคลิกขอบ", "Press B and click the edge"), T("แก้ความยาว / วางรอยบากในค่าของขอบ", "Change the length / place notches in the edge values")], target: { kind: "tool", tool: "sewedit" } },
  // ── ตรวจและผลิต ──
  { id: "check", icon: "list-check", th: "ตรวจแบบ", en: "Pattern check", level: 1, group: "check", words: "ตรวจ ตรวจแบบ check preflight ผิด error ปัญหา validate ยาวไม่เท่า ลืมเย็บ", desc: T("ตรวจตะเข็บ ขอบที่ยังไม่ได้เย็บ รูปชิ้น วัสดุ — กดแถวไปที่จุดนั้น", "Checks seams, unsewn edges, shapes and materials — click a row to jump there"), steps: [T("กดปุ่ม 'ตรวจแบบ'", "Press 'Check'"), T("กดแต่ละแถวเพื่อไปแก้", "Click each row to fix it")], target: { kind: "studio", id: "check" } },
  { id: "print", icon: "printer", th: "พิมพ์ / ไฟล์ตัด (DXF · SVG · PDF)", en: "Print / cut files", level: 1, group: "check", words: "พิมพ์ ไฟล์ตัด dxf svg pdf print export ส่งออก a4 เครื่องตัด ใบสเปก", desc: T("ตรวจก่อน แล้วพิมพ์ A4 ขนาดจริง หรือดาวน์โหลด DXF / SVG", "Checks first, then prints real-size A4 or downloads DXF / SVG"), steps: [T("กด 'ใบสเปก / พิมพ์ / ไฟล์ตัด'", "Press 'Spec sheet / print / cut files'"), T("ผ่านด่านตรวจแล้วเปิดหน้าพิมพ์", "Pass the check, then open the print page")], target: { kind: "studio", id: "print" } },
  { id: "trims", icon: "link", th: "ซิป / อะไหล่ (ส่งตีราคา)", en: "Zips / hardware", level: 2, group: "check", words: "ซิป อะไหล่ ห่วง หมุด แม่เหล็ก trims hardware zipper ตีราคา", desc: T("ของที่ไม่ใช่ชิ้นตัด ใส่จำนวนต่อใบ แล้วไปตีราคาพร้อมชิ้น", "Non-cut items per bag, sent to costing with the pieces"), steps: [T("กด 'ซิป / อะไหล่'", "Press 'Zips / hardware'")], target: { kind: "studio", id: "trims" } },
  // ── สตูดิโอ ──
  { id: "template", icon: "wand", th: "สร้างจากแม่แบบทรง", en: "Bag template", level: 1, group: "studio", words: "แม่แบบ ทรง template tote กล่อง box ถัง เป้ กระเป๋าสตางค์ wizard ช่องโชว์ หัวใจ", desc: T("ใส่ขนาด → ได้ชิ้นครบพร้อมตะเข็บ", "Enter sizes → all pieces with seams"), steps: [T("กด 'สร้างจากแม่แบบทรง'", "Press 'Create from a bag template'"), T("เลือกทรงและใส่ขนาด", "Pick a style and sizes")], target: { kind: "studio", id: "template" } },
  { id: "pieces", icon: "list", th: "รายการชิ้น (ล็อก · ซ่อน · แยกดู)", en: "Pieces (lock · hide · isolate)", level: 1, group: "studio", words: "รายการชิ้น ล็อก ซ่อน แยกดู lock hide isolate group กลุ่ม", desc: T("ล็อกชิ้นกันแก้ ซ่อน หรือดูชิ้นเดียว ตามกลุ่ม", "Lock, hide or isolate pieces, by group"), steps: [T("กด 'รายการชิ้น'", "Press 'Pieces'")], target: { kind: "studio", id: "pieces" } },
  { id: "learn", icon: "book", th: "เรียนไปทำไป", en: "Learn by doing", level: 1, group: "studio", words: "เรียน บทเรียน สอน lesson tutorial learn วิธีใช้ help ช่วย", desc: T("บทเรียนทำแพทเทิร์นบนแบบฝึก ตรวจจากงานจริง", "Pattern lessons on practice files, checked from your work"), steps: [T("กด 'เรียน'", "Press 'Learn'")], target: { kind: "studio", id: "learn" } },
  { id: "unit", icon: "ruler", th: "หน่วยที่แสดง (มม. / ซม. / นิ้ว)", en: "Display unit", level: 1, group: "studio", words: "หน่วย มิล เซน นิ้ว unit mm cm inch", desc: T("เปลี่ยนหน่วยที่แสดง — ขนาดจริงไม่เปลี่ยน", "Change the display unit — real sizes stay the same"), steps: [T("กด มม. / ซม. / นิ้ว บนแถบสตูดิโอ", "Press mm / cm / in on the studio bar")], target: { kind: "studio", id: "unit" } },
  { id: "photo", icon: "photo", th: "แกะจากรูป", en: "Start from a photo", level: 2, group: "studio", words: "รูป ภาพ ถ่ายรูป ลอกแบบ trace photo image แกะ ai", desc: T("ลอกเส้นจากรูปแพทเทิร์นกระดาษ หรือให้ AI ร่างจากรูปกระเป๋า", "Trace a paper pattern photo, or let AI draft from a bag photo"), steps: [T("กด 'แกะจากรูป'", "Press 'Start from a photo'")], target: { kind: "studio", id: "photo" } },
  { id: "dxf", icon: "file-import", th: "นำเข้า DXF", en: "Import DXF", level: 2, group: "studio", words: "dxf นำเข้า import clo cad ไฟล์", desc: T("นำแพทเทิร์นจากไฟล์ DXF เช่น ที่ส่งออกจาก CLO3D", "Bring in a DXF pattern, e.g. exported from CLO3D"), steps: [T("กด 'นำเข้า DXF'", "Press 'Import DXF'")], target: { kind: "studio", id: "dxf" } },
  { id: "lining", icon: "layers-subtract", th: "สร้างซับใน", en: "Create lining", level: 2, group: "studio", words: "ซับใน lining ชั้นใน", desc: T("คัดลอกตัวกระเป๋าเป็นชั้นซับในพร้อมตะเข็บ", "Copies the body into a lining layer with seams"), steps: [T("กด 'สร้างซับใน'", "Press 'Create lining'")], target: { kind: "studio", id: "lining" } },
  { id: "pocket", icon: "square-plus", th: "เพิ่มช่อง (ช่องใส่ของ / ช่องซิป)", en: "Add pocket", level: 2, group: "studio", words: "ช่อง กระเป๋าปะ ช่องซิป pocket zip pocket patch", desc: T("เพิ่มช่องใส่ของหรือช่องซิปบนชิ้นที่เลือก", "Adds a patch or zip pocket to a piece"), steps: [T("กด 'เพิ่มช่อง'", "Press 'Add pocket'")], target: { kind: "studio", id: "pocket" } },
  // ── ภาพ 3D ──
  { id: "v-sewn", icon: "box", th: "ภาพเย็บติดแล้ว", en: "Sewn view", level: 1, group: "view", words: "3d สามมิติ เย็บติด sewn ภาพ", desc: T("กระเป๋าตอนเย็บติดแล้ว ตามกระดานทันที", "The sewn bag, following the board live"), steps: [T("หัวช่อง 3D → 'เย็บติดแล้ว'", "3D header → 'Sewn'")], target: { kind: "view3d", view: "sewn" } },
  { id: "v-explode", icon: "maximize", th: "แยกชิ้น / ติดหู", en: "Pull apart / attach handles", level: 2, group: "view", words: "แยกชิ้น explode ติดหู handle attach", desc: T("ดึงชิ้นแยกดู · ติดหู / ปิดหลังช่อง", "Pull pieces apart · attach handles"), steps: [T("หัวช่อง 3D → 'แยกชิ้น'", "3D header → 'Pull apart'")], target: { kind: "view3d", view: "explode" } },
  { id: "v-steps", icon: "numbers", th: "ทีละขั้น", en: "Step by step", level: 1, group: "view", words: "ทีละขั้น ลำดับเย็บ steps order", desc: T("ลำดับการเย็บทีละขั้น", "The sewing order, step by step"), steps: [T("หัวช่อง 3D → 'ทีละขั้น'", "3D header → 'Step by step'")], target: { kind: "view3d", view: "steps" } },
  { id: "v-sim", icon: "wind", th: "จำลองทิ้งตัว (ทดลอง)", en: "Drape simulation (experimental)", level: 3, group: "view", words: "ทิ้งตัว จำลอง ฟิสิกส์ simulation physics drape แข็ง นิ่ม", desc: T("ประมาณการทิ้งตัว — ค่าวัสดุยังไม่สอบเทียบ", "Approximate drape — material values not calibrated"), steps: [T("หัวช่อง 3D → 'ทิ้งตัว'", "3D header → 'Drape'")], target: { kind: "view3d", view: "sim" } },
  { id: "v-flat", icon: "layout-grid", th: "ชิ้นแบน", en: "Flat pieces", level: 1, group: "view", words: "ชิ้นแบน flat preview", desc: T("ชิ้นแบนวางบนโต๊ะ ยังไม่ประกอบ", "Flat pieces on the table"), steps: [T("หัวช่อง 3D → 'ชิ้นแบน'", "3D header → 'Flat'")], target: { kind: "view3d", view: "flat" } },
];

export const toolById = (id: string) => PATTERN_TOOLS.find((x) => x.id === id) ?? null;
/** เครื่องมือบนกระดาน (Tool ของ ShapeEditor) → ข้อมูลในทะเบียน */
export const toolOfBoard = (tool: string) => PATTERN_TOOLS.find((x) => x.target.kind === "tool" && x.target.tool === tool && x.group !== "edge") ?? null;
/** ชื่อเต็มสองภาษา + ปุ่มลัด + คำอธิบาย (ใช้เป็นคำอธิบายเมื่อชี้ปุ่ม) */
export function toolTitle(d: ToolDef, lang: "th" | "en"): string {
  const name = `${d.th} · ${d.en}${d.key ? ` (${d.key})` : ""}`;
  return `${name}\n${lang === "en" ? d.desc.en : d.desc.th}`;
}
/** ระดับที่เห็นเครื่องมือได้ */
export const visibleAt = (d: ToolDef, level: ToolLevel) => d.level <= level;

const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/[\s·()/\-_.]+/g, "");
/** ค้นเครื่องมือด้วยไทย / อังกฤษ / คำใกล้เคียง / ปุ่มลัด — เรียงตามความตรง: ชื่อตรง > ชื่อขึ้นต้น > ชื่อมีคำนี้ > คำใกล้เคียง > คำอธิบาย */
export function searchTools(q: string, list: ToolDef[] = PATTERN_TOOLS): ToolDef[] {
  const raw = q.trim().toLowerCase();
  if (!raw) return [];
  const terms = raw.split(/\s+/).map(norm).filter(Boolean);
  const scored = list.map((d) => {
    const names = [norm(d.th), norm(d.en)], words = d.words.split(/\s+/).map(norm), desc = norm(`${d.desc.th} ${d.desc.en}`);
    let total = 0;
    for (const t of terms) {
      let s = 0;
      if (d.key && t === d.key.toLowerCase() && terms.length === 1) s = 95;
      else if (names.some((n) => n === t)) s = 100;
      else if (names.some((n) => n.startsWith(t))) s = 80;
      else if (names.some((n) => n.includes(t))) s = 60;
      else if (words.some((w) => w === t)) s = 55;
      else if (words.some((w) => w.startsWith(t) || (t.length >= 3 && w.includes(t)))) s = 40;
      else if (t.length >= 2 && desc.includes(t)) s = 15;
      if (!s) return { d, s: 0 };
      total += s;
    }
    return { d, s: total };
  });
  return scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.d.level - b.d.level).map((x) => x.d);
}
