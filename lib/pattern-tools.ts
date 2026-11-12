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
  | { kind: "studio"; id: "check" | "pieces" | "learn" | "template" | "photo" | "dxf" | "lining" | "pocket" | "print" | "trims" | "unit" | "bagparts" }
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
  { id: "polygon", icon: "diamond", th: "หลายเหลี่ยม", en: "Polygon", key: "G", level: 2, group: "draw", words: "หลายเหลี่ยม polygon หกเหลี่ยม แปดเหลี่ยม สามเหลี่ยม hexagon octagon triangle ห้าเหลี่ยม",
    desc: T("ลากเพื่อวาดรูปหลายเหลี่ยมด้านเท่า (3–24 ด้าน) แล้วแก้ทีละจุดได้", "Drag to draw a regular polygon (3–24 sides), then edit point by point"),
    steps: [T("กด G", "Press G"), T("ตั้งจำนวนด้านที่แถบด้านบน", "Set the number of sides in the bar on top"), T("ลากบนกระดาน", "Drag on the board")], target: { kind: "tool", tool: "polygon" } },
  { id: "pen", icon: "vector-bezier", th: "ปากกา", en: "Pen", key: "P", level: 1, group: "draw", words: "ปากกา เส้นโค้ง bezier pen path วาดอิสระ curve", demo: "pen",
    desc: T("คลิกวางจุดมุม · กดค้างแล้วลาก = เส้นโค้ง · คลิกจุดแรกเพื่อปิดรูป", "Click to place corners · press and drag for curves · click the first point to close"),
    steps: [T("กด P", "Press P"), T("คลิกทีละจุดรอบรูป", "Click point by point around the shape"), T("กดค้างแล้วลาก = ดัดเป็นเส้นโค้ง", "Press and drag to bend a curve"), T("คลิกจุดแรก หรือ Enter เพื่อปิดรูป", "Click the first point or Enter to close")], target: { kind: "tool", tool: "pen" } },
  { id: "hand", icon: "hand-stop", th: "เลื่อนดู", en: "Pan", key: "H", level: 1, group: "draw", words: "เลื่อน มือ pan hand scroll ซูม zoom", desc: T("ลากที่ว่างเพื่อเลื่อนกระดาน · ล้อเมาส์ = ซูม", "Drag empty space to pan · mouse wheel zooms"), steps: [T("กด H หรือกด Space ค้าง", "Press H, or hold Space"), T("ลากกระดาน", "Drag the board")], target: { kind: "tool", tool: "hand" } },
  { id: "measure", icon: "ruler-measure", th: "ไม้บรรทัด", en: "Measure", key: "M", level: 1, group: "draw", words: "วัด ไม้บรรทัด ruler measure ระยะ ความยาว length distance วัดตามขอบ วัดโค้ง walk", demo: "measure",
    desc: T("วัดตรง / วัดโค้ง / วัดตามขอบ — ตัวเลขเป็นหน่วยที่เลือก", "Measure straight, along a curve or along an edge — in your chosen unit"),
    steps: [T("กด M", "Press M"), T("เลือกแบบวัด ตรง / โค้ง / ตามขอบ ที่แผงขวา", "Pick straight / curve / along edge in the side panel"), T("ลากจากจุดหนึ่งไปอีกจุด", "Drag from one point to another")], target: { kind: "tool", tool: "measure" } },
  { id: "objsnap", icon: "magnet", th: "ดูดเข้าจุด", en: "Object snap", level: 2, group: "draw", words: "ดูด snap จุดปลาย กึ่งกลาง midpoint endpoint แม่เหล็ก magnet จับจุด",
    desc: T("ตอนวาด วัด หรือวางเส้นใน ตัวชี้จะดูดเข้ามุมชิ้น (สี่เหลี่ยมชมพู) และกึ่งกลางขอบ (สามเหลี่ยมชมพู) — ปิดได้ในเมนูดูดตาราง", "When drawing, measuring or placing inner lines the pointer snaps to corners (pink square) and edge midpoints (pink triangle) — turn off in the grid snap menu"),
    steps: [T("เลือกเครื่องมือวาด หรือไม้บรรทัด", "Pick a drawing tool or the ruler"), T("ชี้ใกล้มุม / กลางขอบ จะเห็นเครื่องหมายชมพู", "Hover near a corner / mid-edge to see the pink mark"), T("ปิด-เปิดในเมนู 'ดูดตาราง' มุมล่าง", "Toggle it in the 'snap' menu at the bottom")], target: { kind: "tool", tool: "measure" } },
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
  { id: "gather", icon: "wind", th: "อัตรารูด", en: "Gather ratio", level: 2, group: "sew", words: "รูด gather ease ย่น อัตรา ratio จับย่น",
    desc: T("ตะเข็บที่ตั้งใจรูด: ใส่อัตรา เช่น 1.5 = ด้านยาวยาวกว่า 1.5 เท่า · ตรวจแบบเตือนถ้าความยาวจริงคลาดเกิน 2%", "A gathered seam: set the ratio, e.g. 1.5 = the long side is 1.5× · the check warns beyond 2%"),
    steps: [T("กด B แล้วคลิกตะเข็บ", "Press B and click the seam"), T("ติ๊ก 'ตั้งใจให้ต่างกัน' แล้วใส่อัตรารูด", "Tick 'Different on purpose' and type the ratio")], target: { kind: "tool", tool: "sewedit" } },
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
  { id: "corner", icon: "target", th: "มุมเฉพาะจุด", en: "Single-corner fillet / chamfer", level: 2, group: "piece", words: "มุมเฉพาะจุด ตัดมุม chamfer fillet corner angle องศา มุมภายใน จุดเดียว",
    desc: T("ดูมุมภายใน (องศา) ของจุดที่เลือก · ทำมุมโค้งหรือตัดมุมเฉพาะจุดนั้น ไม่กระทบมุมอื่น", "See the inside angle of the selected point · round or chamfer just that corner"),
    steps: [T("ดับเบิลคลิกชิ้นเพื่อแก้จุด", "Double-click the piece to edit points"), T("คลิกจุดมุม", "Click a corner point"), T("แผงขวา 'จุดที่ …' พิมพ์รัศมี / ระยะตัดมุม แล้วกด ทำ", "In the side panel type the radius / chamfer and press Apply")], target: { kind: "guide", el: "tools", select: true } },
  { id: "box-corner", icon: "box", th: "มุมกล่อง", en: "Box corner", level: 2, group: "piece", words: "มุมกล่อง box corner ก้นกล่อง ตัดเหลี่ยมมุม ก้นลึก",
    desc: T("ตัดเหลี่ยมที่มุมชิ้น ขาสองข้างเย็บเข้าหากันเป็นก้นกล่อง (ลึกประมาณ 2 เท่าของขนาด) — ระบบต่อตะเข็บในชิ้นให้ และไม่นับขาในความยาวตะเข็บข้าง", "Cut a square at a corner; its legs are sewn together into a box bottom (depth ≈ 2 × size) — the in-piece seam is added and the legs aren't counted in the side seam"),
    steps: [T("เลือกชิ้น แล้วกด แก้จุด", "Select the piece and press Edit points"), T("คลิกจุดมุมล่าง", "Click a bottom corner point"), T("ใส่ขนาด 'มุมกล่อง' แล้วกด ทำ", "Type the 'Box corner' size and press Apply")], target: { kind: "guide", el: "tools", select: true } },
  { id: "pleat", icon: "columns", th: "จีบ", en: "Pleats", level: 2, group: "piece", words: "จีบ pleat จีบทบ จีบกล่อง knife box pleat",
    desc: T("เพิ่มจีบเรียงห่างเท่ากัน: ระบบผ่ากางเพิ่มเนื้อผ้าให้เอง (จีบทบ = 2 × ลึก · จีบกล่อง = 4 × ลึก) + รอยบาก + เส้นพับ/วางทับ — ขอบที่เย็บนับความยาวหลังพับจีบ", "Add evenly spaced pleats: the fabric is spread in for you (knife = 2 × depth · box = 4 × depth) + notches + fold/placement lines — seams count the folded length"),
    steps: [T("เลือกชิ้น", "Select a piece"), T("หัวข้อ 'จีบ' เลือกแนว ชนิด จำนวน ลึก แล้วกด ทำจีบ", "In 'Pleats' pick direction, type, count, depth and press Add pleats")], target: { kind: "guide", el: "bag-shape", select: true } },
  { id: "spread", icon: "arrows-exchange", th: "ผ่าแล้วกาง", en: "Slash & spread", level: 3, group: "piece", words: "ผ่า กาง slash spread บาน flare เพิ่มเนื้อ ขยายชิ้น",
    desc: T("ผ่าชิ้นตามแนวตั้ง/นอนที่ตำแหน่งที่ตั้ง แล้วกางขนาน (เพิ่มเนื้อเท่ากัน) หรือหมุนกาง (ทรงบาน)", "Cut the piece at a set position and spread parallel (even extra) or pivot (flare)"),
    steps: [T("เลือกชิ้น (โหมดขั้นสูง)", "Select a piece (Advanced mode)"), T("หัวข้อ 'ผ่าแล้วกาง' ตั้งแนว ตำแหน่ง ระยะกาง แล้วกด ผ่าแล้วกาง", "In 'Slash & spread' set direction, position, amount and press Spread")], target: { kind: "guide", el: "bag-shape", select: true } },
  { id: "center-line", icon: "line-dashed", th: "เส้นกลางชิ้น", en: "Centre lines", level: 2, group: "piece", words: "เส้นกลาง กึ่งกลาง centre center line แกนกลาง axis",
    desc: T("เพิ่มเส้นกลางแนวตั้ง / แนวนอนของชิ้นเป็นเส้นตำแหน่ง (ไปกับชิ้น พิมพ์ออกใบ)", "Add vertical / horizontal centre lines as position marks (move with the piece, printed)"),
    steps: [T("เลือกชิ้น", "Select a piece"), T("หัวข้อเส้นในชิ้น กด ＋ เส้นกลาง แนวตั้ง / แนวนอน", "Under inner lines press ＋ Centre line Vertical / Horizontal")], target: { kind: "guide", el: "tools", select: true } },
  { id: "dim-pin", icon: "ruler", th: "ปักขนาดบนชิ้น", en: "Pin a dimension", level: 2, group: "piece", words: "ปักขนาด บอกขนาด dimension dim เส้นบอกขนาด ขนาดถาวร",
    desc: T("วัดด้วยไม้บรรทัด แล้วกด 'ปักบนชิ้น' — กลายเป็นเส้นบอกขนาดถาวร ไปกับชิ้น บันทึก และออกใบพิมพ์ / DXF ชั้น DIM", "Measure with the ruler, then press 'Pin' — it becomes a permanent dimension that moves with the piece, is saved, and prints (DXF layer DIM)"),
    steps: [T("กด M แล้ววัดบนชิ้น", "Press M and measure on a piece"), T("รายการ 'การวัด' กด ปักบนชิ้น", "In the measurements list press Pin")], target: { kind: "tool", tool: "measure" } },
  { id: "notch-style", icon: "scissors", th: "แบบรอยบาก", en: "Notch style", level: 2, group: "piece", words: "แบบรอยบาก รอยบากคู่ รอยบากวี notch v-notch double notch ปากฉลาม",
    desc: T("เลือกรอยบากของชิ้น: เดี่ยว · คู่ (ด้านหลัง) · ตัววี — ใบพิมพ์และ DXF ใช้แบบเดียวกัน", "Pick the piece's notch style: single · double (back) · V — print and DXF match"),
    steps: [T("เลือกชิ้น", "Select a piece"), T("หัวข้อเครื่องมือ เลือก 'แบบรอยบาก'", "Under tools pick 'Notch style'")], target: { kind: "guide", el: "notch-style", select: true } },
  { id: "cut-marks", icon: "color-swatch", th: "วิธีวางตัด", en: "Cutting marks", level: 2, group: "piece", words: "วิธีวางตัด ทางผ้าทางเดียว ผ้ามีขน nap one way คว่ำหน้า face down คู่ซ้ายขวา mirror pair",
    desc: T("ติ๊กทางผ้าทางเดียว (ลูกศรเกรนหัวเดียว) · วางคว่ำหน้า · ตัดคู่ซ้าย-ขวา — ขึ้นในตาราง 'วิธีวางตัด' ของใบพิมพ์", "Tick one-way grain (single-headed arrow) · face down · mirrored pair — shown in the print's cutting column"),
    steps: [T("เลือกชิ้น", "Select a piece"), T("ใต้ลูกศรเกรน ติ๊กสิ่งที่ต้องการ", "Under the grain arrow tick what you need")], target: { kind: "guide", el: "cut-marks", select: true } },
  { id: "allow-corner", icon: "square", th: "มุมของเส้นตัด", en: "Cut-line corners", level: 2, group: "piece", words: "มุมเส้นตัด มุมแหลม ตัดมุมเผื่อ bevel miter round corner allowance มุมเผื่อ",
    desc: T("มุมของเส้นตัดรอบนอก: แหลม (ค่าเดิม) · ตัดมุม · โค้ง — มุมแหลมมากจะไม่ยื่นยาว", "Outer cut-line corners: sharp (default) · bevel · round — keeps very sharp corners from sticking out"),
    steps: [T("เลือกชิ้น", "Select a piece"), T("หัวข้อเผื่อ เลือก 'มุมของเส้นตัด'", "Under allowance pick 'Cut-line corners'")], target: { kind: "guide", el: "allow-corner", select: true } },
  { id: "fold-comp", icon: "stack-2", th: "ชดเชยความหนา", en: "Thickness compensation", level: 2, group: "piece", words: "ชดเชย ความหนา thickness compensation วัสดุหนา หนา พับหนา",
    desc: T("ขอบที่พับได้เผื่อเพิ่ม = ค่าต่อทบ × จำนวนทบ · กด 'ตามวัสดุ' ใช้ค่าที่ช่างสอบเทียบของวัสดุ (ไม่ตั้ง = ความหนา) — ไม่ใช้สูตรเดียวกับทุกวัสดุ", "Folded edges get extra allowance = per-fold value × folds · 'From material' uses the material's calibrated value (default = thickness) — no one-size formula"),
    steps: [T("เลือกชิ้นที่มีขอบพับ", "Select a piece with a folded edge"), T("หัวข้อเผื่อ ใส่ 'ชดเชยความหนาต่อทบ' หรือกด ตามวัสดุ", "Under allowance type 'Thickness per fold' or press From material")], target: { kind: "guide", el: "allow", select: true } },
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
  { id: "edge-split", icon: "arrows-split-2", th: "แบ่งขอบ / รวมขอบ", en: "Split / join edges", level: 2, group: "edge", words: "แบ่งขอบ ตัดขอบ split edge join รวมขอบ เพิ่มจุด ตัดครึ่ง แบ่งเท่า",
    desc: T("แบ่งขอบเป็น 2 ขอบที่ระยะที่พิมพ์ หรือแบ่งเท่ากันหลายส่วน · รวมขอบกับขอบถัดไปให้เป็นขอบเดียว — ตะเข็บตามขอบใหม่ให้เอง", "Split an edge at a typed distance or evenly · join an edge with the next one — seams follow the new edges"),
    steps: [T("กด B แล้วคลิกขอบ", "Press B and click the edge"), T("ในหัวข้อ 'แก้ขอบนี้' พิมพ์ระยะแล้วกด แบ่ง", "In 'Edit this edge' type the distance and press Split")], target: { kind: "tool", tool: "sewedit" } },
  { id: "edge-move", icon: "maximize", th: "เลื่อนขอบ (ยืด / หด)", en: "Move edge (extend / trim)", level: 2, group: "edge", words: "เลื่อนขอบ ยืด หด ขยาย extend trim offset edge move edge ดันขอบ",
    desc: T("ดันขอบออก (ยืดชิ้น) หรือดึงเข้า (หดชิ้น) ตามระยะที่พิมพ์ สี่เหลี่ยมยังเป็นสี่เหลี่ยม", "Push an edge out (extend) or pull it in (trim) by a typed distance; rectangles stay rectangles"),
    steps: [T("กด B แล้วคลิกขอบ", "Press B and click the edge"), T("พิมพ์ระยะ แล้วกด ออก / เข้า", "Type the distance, then press Out / In")], target: { kind: "tool", tool: "sewedit" } },
  { id: "edge-bend", icon: "vector-bezier", th: "ดัดขอบเป็นโค้ง", en: "Bend edge into an arc", level: 2, group: "edge", words: "ดัดโค้ง โก่ง arc bend curve edge radius รัศมี ขอบโค้ง ทำเป็นเส้นตรง",
    desc: T("ดัดขอบตรงให้โก่งเป็นส่วนโค้งวงกลมตามระยะโก่ง · บอกรัศมีของขอบโค้ง · ทำกลับเป็นเส้นตรงได้", "Bend a straight edge into a circular arc by a bulge distance · shows the curve radius · make it straight again"),
    steps: [T("กด B แล้วคลิกขอบ", "Press B and click the edge"), T("พิมพ์ระยะโก่ง แล้วกด โก่งออก / โก่งเข้า", "Type the bulge, then press Out / In")], target: { kind: "tool", tool: "sewedit" } },
  { id: "edge-fold2", icon: "layers-subtract", th: "พับขอบสองทบ", en: "Double-fold hem", level: 2, group: "edge", words: "พับสองทบ พับขอบ hem double fold พับซ้อน ขอบพับ",
    desc: T("ตั้งขอบเป็นพับสองทบ: ใบพิมพ์มีเส้นพับแรกกลางเผื่อ และเส้นพับที่สองที่เส้นเย็บ", "Set an edge as a double fold: the print shows the first fold mid-allowance and the second at the sew line"),
    steps: [T("กด B แล้วคลิกขอบ", "Press B and click the edge"), T("ช่อง 'พับขอบ' เลือก พับสองทบ", "In 'Fold' pick Double fold")], target: { kind: "tool", tool: "sewedit" } },
  { id: "dart", icon: "pin", th: "เกล็ด", en: "Dart", level: 2, group: "edge", words: "เกล็ด dart เกล็ดเปิด เกล็ดปิด ตัววี จับเกล็ด",
    desc: T("ทำเกล็ดบนขอบ: กลางห่างต้นขอบ ปากกว้าง ลึก · ปิด = ขีดเส้นพับเย็บ (ผ้า) · เปิด = ตัดตัว V ออก ขาเย็บเข้าหากัน (หนัง/PU) — ปากเกล็ดไม่นับในความยาวตะเข็บ", "Dart on an edge: centre, width, depth · closed = marked fold-and-sew (fabric) · open = cut the V, legs sewn together (leather/PU) — the opening isn't counted in seam length"),
    steps: [T("กด B แล้วคลิกขอบ", "Press B and click the edge"), T("หัวข้อ 'ทรงกระเป๋าบนขอบนี้' ใส่ค่าเกล็ด แล้วกด ทำเกล็ด", "In 'Bag shaping on this edge' set the dart and press Add dart")], target: { kind: "tool", tool: "sewedit" } },
  { id: "gusset", icon: "package", th: "ชิ้นข้างจากขอบ", en: "Gusset from edges", level: 2, group: "edge", words: "ชิ้นข้าง gusset ข้าง ก้น ความลึก แถบข้าง strip ข้างกระเป๋า",
    desc: T("สร้างชิ้นข้างยาวตามขอบจริง (โค้งก็วัดตามโค้ง หักเกล็ด/จีบ) พร้อมรอยบากที่รอยต่อขอบ และต่อตะเข็บให้ทั้งสองฝั่ง", "Make a gusset as long as the real edges (curves measured along the curve, darts/pleats taken off) with notches at edge joins and seams on both sides"),
    steps: [T("กด B แล้วคลิกขอบแรกถัดจากปากกระเป๋า", "Press B and click the first edge after the mouth"), T("ตั้งกว้าง เลือกชิ้นอีกฝั่ง แล้วกด สร้างชิ้นข้าง", "Set the width, pick the other panel, press Make gusset")], target: { kind: "tool", tool: "sewedit" } },
  { id: "band", icon: "droplet", th: "แนวทากาว / ปาดบาง", en: "Glue / skive line", level: 2, group: "edge", words: "ทากาว กาว glue ปาดบาง สกีฟ skive ปาดขอบ แนวกาว",
    desc: T("วางแนวขนานกับขอบเข้าในชิ้นตามกว้างที่ตั้ง — ใบพิมพ์มีเส้นบอก และ DXF แยกชั้น GLUE / SKIVE (เครื่องตัดไม่ตัด)", "Place a line parallel to the edge at the set width — printed, and in the DXF as separate GLUE / SKIVE layers (not cut)"),
    steps: [T("กด B แล้วคลิกขอบ", "Press B and click the edge"), T("ตั้งแนวกว้าง แล้วกด ทากาว หรือ ปาดบาง", "Set the band width, then press Glue or Skive")], target: { kind: "tool", tool: "sewedit" } },
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
  { id: "strap", icon: "shopping-bag", th: "สาย / หูหิ้ว", en: "Strap / handle builder", level: 2, group: "studio", words: "สาย หู หูหิ้ว สายสะพาย strap handle พับครึ่ง 4ทบ ประกบ",
    desc: T("ใส่กว้างสำเร็จ ยาวที่โผล่ โคนเย็บทับ และวิธีพับ (พับครึ่ง · 4 ทบ · พับขอบ · ไม่พับ) ได้ชิ้นสายพร้อมเส้นพับและรอยบากโคน · ประกบ 2 ชั้นได้", "Set finished width, visible length, overlap and fold method (half · 4 layers · edge fold · flat) to get a strap with fold lines and overlap notches · 2 layers optional"),
    steps: [T("กด 'ชิ้นกระเป๋า' แท็บ สาย/หู", "Press 'Bag parts', tab Strap"), T("ตั้งค่า แล้วกด เพิ่มลงกระดาน", "Set values and press Add to the board")], target: { kind: "studio", id: "bagparts" } },
  { id: "bind-pieces", icon: "line-dashed", th: "ชิ้นกุ๊นที่ต้องตัด", en: "Binding strips", level: 2, group: "studio", words: "กุ๊น แถบกุ๊น bias binding ตัดเฉียง หุ้มขอบ แถบ",
    desc: T("รวมความยาวขอบที่ติ๊กกุ๊น + ตะเข็บหุ้มขอบ แล้วแบ่งเป็นแถบที่ต้องตัด (ไม่เกิน 140 ซม./เส้น เผื่อต่อ 2 ซม.) · ผ้าตัดเฉียง 45°", "Totals the edges ticked for binding + bound seams and splits them into strips to cut (≤ 140 cm each, 2 cm per join) · fabric cut on the bias"),
    steps: [T("ติ๊ก 'กุ๊น' ที่ขอบ (B + คลิกขอบ)", "Tick 'Binding' on edges (B + click)"), T("กด 'ชิ้นกระเป๋า' แท็บ กุ๊น แล้วเพิ่มลงกระดาน", "Press 'Bag parts', tab Binding, add to the board")], target: { kind: "studio", id: "bagparts" } },
  { id: "window", icon: "heart", th: "ช่องโชว์บนชิ้น", en: "Display window", level: 2, group: "studio", words: "ช่องโชว์ หน้าต่าง window pvc เมฆ แมว หมี หัวใจ svg แผ่นกั้น divider itabag อิตะแบ็ก",
    desc: T("เจาะรูจริงบนชิ้นที่มีอยู่ (หัวใจ เมฆ แมว หมี วงรี เหลี่ยม SVG เอง) + แผ่น PVC + กรอบ + แผ่นกั้น ตามโครงสร้าง 4 แบบ (PVC ตายตัว · ล้วงด้านบน · ซิป · แยกช่องหลัก)", "Cut a real hole in an existing piece (heart, cloud, cat, bear, oval, rounded, own SVG) + PVC + frame + divider for 4 structures (fixed PVC · slip-in · zip · separate main compartment)"),
    steps: [T("กด 'ชิ้นกระเป๋า' แท็บ ช่องโชว์", "Press 'Bag parts', tab Display window"), T("เลือกชิ้น รูป ขนาด โครงสร้าง แล้วเพิ่มลงกระดาน", "Pick piece, shape, size, structure, then add")], target: { kind: "studio", id: "bagparts" } },
  { id: "tpl-update", icon: "refresh", th: "อัปเดตชุดจากแม่แบบ", en: "Update template set", level: 2, group: "studio", words: "อัปเดต แม่แบบ เปลี่ยนค่า เก็บงานแก้มือ update regenerate ชุดเดิม",
    desc: T("เปิด 'สร้างจากแม่แบบทรง' อีกครั้ง เปลี่ยนค่า แล้วกด 'อัปเดตชุดเดิม' — ชิ้นที่ไม่ได้แก้มือเปลี่ยนตาม ชิ้นที่แก้มือไม่ถูกทับ (ติ๊กทับได้) · หรือวางเป็นชุดใหม่", "Open 'Bag template' again, change values, press 'Update the existing set' — untouched pieces follow, hand-edited ones are kept (or tick overwrite) · or place a new set"),
    steps: [T("กด 'สร้างจากแม่แบบทรง'", "Press 'Bag template'"), T("เปลี่ยนค่า ดูรายการที่จะเปลี่ยน แล้วกด อัปเดตชุดเดิม", "Change values, check the list, press Update the existing set")], target: { kind: "studio", id: "template" } },
  // ── ภาพ 3D ──
  { id: "v-sewn", icon: "box", th: "ภาพเย็บติดแล้ว", en: "Sewn view", level: 1, group: "view", words: "3d สามมิติ เย็บติด sewn ภาพ", desc: T("กระเป๋าตอนเย็บติดแล้ว ตามกระดานทันที", "The sewn bag, following the board live"), steps: [T("หัวช่อง 3D → 'เย็บติดแล้ว'", "3D header → 'Sewn'")], target: { kind: "view3d", view: "sewn" } },
  { id: "v-explode", icon: "maximize", th: "แยกชิ้น / ติดหู", en: "Pull apart / attach handles", level: 2, group: "view", words: "แยกชิ้น explode ติดหู handle attach", desc: T("ดึงชิ้นแยกดู · ติดหู / ปิดหลังช่อง", "Pull pieces apart · attach handles"), steps: [T("หัวช่อง 3D → 'แยกชิ้น'", "3D header → 'Pull apart'")], target: { kind: "view3d", view: "explode" } },
  { id: "v-steps", icon: "numbers", th: "ทีละขั้น", en: "Step by step", level: 1, group: "view", words: "ทีละขั้น ลำดับเย็บ steps order", desc: T("ลำดับการเย็บทีละขั้น", "The sewing order, step by step"), steps: [T("หัวช่อง 3D → 'ทีละขั้น'", "3D header → 'Step by step'")], target: { kind: "view3d", view: "steps" } },
  { id: "v-sim", icon: "wind", th: "จำลองทิ้งตัว (ทดลอง)", en: "Drape simulation (experimental)", level: 3, group: "view", words: "ทิ้งตัว จำลอง ฟิสิกส์ simulation physics drape แข็ง นิ่ม", desc: T("ประมาณการทิ้งตัว — ค่าวัสดุยังไม่สอบเทียบ", "Approximate drape — material values not calibrated"), steps: [T("หัวช่อง 3D → 'ทิ้งตัว'", "3D header → 'Drape'")], target: { kind: "view3d", view: "sim" } },
  { id: "v-flat", icon: "layout-grid", th: "ชิ้นแบน", en: "Flat pieces", level: 1, group: "view", words: "ชิ้นแบน flat preview", desc: T("ชิ้นแบนวางบนโต๊ะ ยังไม่ประกอบ", "Flat pieces on the table"), steps: [T("หัวช่อง 3D → 'ชิ้นแบน'", "3D header → 'Flat'")], target: { kind: "view3d", view: "flat" } },
  { id: "v-camera", icon: "camera", th: "มุมกล้องตั้งฉาก / มีมิติ", en: "Orthographic / perspective", level: 2, group: "view", words: "ตั้งฉาก ortho orthographic perspective มีมิติ มุมกล้อง กล้อง",
    desc: T("ตั้งฉาก = ขนาดเท่ากันทุกระยะ เหมาะดูสัดส่วน/ด้านหน้า-ข้าง · มีมิติ = เหมือนตาเห็น", "Orthographic = same size at any distance, good for proportions/front-side views · perspective = like the eye sees"),
    steps: [T("เปิดภาพ 3D", "Open the 3D view"), T("กด 'ตั้งค่าภาพ' มุมซ้ายบน เลือกมุมกล้อง", "Press 'View options' at the top left and pick the camera")], target: { kind: "view3d", view: "sewn" } },
  { id: "v-display", icon: "layers-subtract", th: "ทึบ / โครงเส้น / โปร่ง", en: "Solid / wireframe / X-ray", level: 2, group: "view", words: "โครงเส้น wireframe wire โปร่ง xray ทึบ solid โปร่งใส",
    desc: T("โปร่ง = เห็นซับใน/ช่องข้างใน · โครงเส้น = เห็นตาข่ายของรูปทรง", "X-ray = see the lining/inner pockets · wireframe = see the mesh"),
    steps: [T("เปิดภาพ 3D", "Open the 3D view"), T("'ตั้งค่าภาพ' → การแสดงผล", "'View options' → Display")], target: { kind: "view3d", view: "sewn" } },
  { id: "v-move", icon: "pointer", th: "ย้าย / หมุนชิ้นใน 3D", en: "Move / turn a piece in 3D", level: 3, group: "view", words: "ย้ายชิ้น หมุนชิ้น 3d move turn จับชิ้น ลากชิ้น",
    desc: T("เลือกชิ้นในภาพ 3D แล้วลากเพื่อย้ายหรือหมุนดู (ดูอย่างเดียว ไม่แก้แพทเทิร์น) · กดคืนตำแหน่งได้", "Select a piece in 3D and drag to move or turn it (view only, the pattern isn't changed) · reset any time"),
    steps: [T("คลิกชิ้นในภาพ 3D", "Click a piece in 3D"), T("'ตั้งค่าภาพ' → ลากเมาส์เพื่อ ย้ายชิ้น / หมุนชิ้น", "'View options' → Drag to Move / Turn piece")], target: { kind: "view3d", view: "sewn" } },
  { id: "v-ref", icon: "ruler", th: "วัตถุเทียบขนาด + ความจุลิตร", en: "Size reference + capacity", level: 2, group: "view", words: "เทียบขนาด a4 มือถือ ขวด บัตร ลิตร ความจุ volume capacity scale",
    desc: T("วางกระดาษ A4 / มือถือ / ขวด 500 มล. / บัตร ขนาดจริงข้างกระเป๋า · มุมล่างขวาบอกความจุประมาณเป็นลิตร", "Put a real-size A4 / phone / 500 ml bottle / card next to the bag · the bottom right shows the approximate capacity in litres"),
    steps: [T("เปิดภาพ 3D", "Open the 3D view"), T("'ตั้งค่าภาพ' → วัตถุเทียบขนาด", "'View options' → Size reference")], target: { kind: "view3d", view: "sewn" } },
  { id: "v-glb", icon: "download", th: "ส่งออกโมเดล GLB", en: "Export GLB model", level: 2, group: "view", words: "glb gltf ส่งออก โมเดล blender export model ไฟล์3d",
    desc: T("บันทึกโมเดลที่เห็นอยู่เป็นไฟล์ GLB (หน่วยเมตร) เปิดใน Blender / CLO / โปรแกรมดูโมเดล / มือถือ", "Save the model you see as a GLB file (metres) for Blender / CLO / model viewers / phones"),
    steps: [T("เปิดภาพ 3D", "Open the 3D view"), T("กดปุ่ม GLB มุมซ้ายบน", "Press GLB at the top left")], target: { kind: "view3d", view: "sewn" } },
  { id: "v-simctl", icon: "pin", th: "ตรึง · หยุดนิ่ง · ความละเอียดตาข่าย", en: "Pin · freeze · mesh detail", level: 3, group: "view", words: "ตรึง pin freeze หยุดนิ่ง ความละเอียด mesh ตาข่าย แขวน",
    desc: T("ในโหมดจำลองทิ้งตัว: ตรึงปากกระเป๋า (แขวนดู) หรือตรึงชิ้นที่เลือก · หยุดนิ่งค้างรูป · ตาข่ายหยาบ/ปกติ/ละเอียด", "In drape simulation: pin the mouth (hang it) or the selected piece · freeze the shape · coarse/normal/fine mesh"),
    steps: [T("เปิดโหมดจำลองทิ้งตัว", "Open drape simulation"), T("ใช้แถวความละเอียด / หยุดนิ่ง / ตรึง ใต้ภาพ", "Use the detail / freeze / pin rows under the view")], target: { kind: "view3d", view: "sim" } },
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
