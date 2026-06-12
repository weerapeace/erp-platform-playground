"use client";

// ============================================================
// RichTextEditor — กล่องข้อความจัดรูปแบบ (ของกลาง, Tiptap)
// bullet / หัวข้อ / ตัวหนา-เอียง-ขีดเส้นใต้ / ฟอนต์ / ขนาด / สี / ตาราง / รูป (วาง/ลาก → อัปโหลด)
// เก็บเป็น HTML string · ใช้ช่องไหนก็ได้ทั้งระบบ
// ใช้: <RichTextEditor value={html} onChange={setHtml} onUploadImage={fn} />
// ============================================================

import { useEditor, EditorContent, type Editor, ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Mark } from "@tiptap/core";
import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";

// ---- รูปย่อ-ขยายได้: ลากมุมขวาล่าง + กว้างจำได้ (width attribute) ----
function ImageNodeView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const startResize = (e: ReactMouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const startW = imgRef.current?.offsetWidth ?? 200;
    const onMove = (ev: MouseEvent) => updateAttributes({ width: `${Math.max(40, Math.round(startW + (ev.clientX - startX)))}px` });
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
  };
  return (
    <NodeViewWrapper as="span" className="inline-block relative leading-none" style={{ width: (node.attrs.width as string) || "auto", maxWidth: "100%" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={node.attrs.src as string} alt="" draggable={false}
        className={`block max-w-full rounded ${selected ? "ring-2 ring-blue-400" : ""}`} style={{ width: "100%" }} />
      {editor.isEditable && selected && (
        <span onMouseDown={startResize} title="ลากเพื่อย่อ/ขยาย"
          className="absolute right-0 bottom-0 w-3.5 h-3.5 -mr-1 -mb-1 bg-blue-500 border-2 border-white rounded-sm cursor-nwse-resize" />
      )}
    </NodeViewWrapper>
  );
}
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.width || el.getAttribute("width") || null,
        renderHTML: (attrs: { width?: string }) => (attrs.width ? { style: `width:${attrs.width}` } : {}),
      },
    };
  },
  addNodeView() { return ReactNodeViewRenderer(ImageNodeView); },
});

// ---- FontSize: mark ตั้งขนาดตัวอักษร (ต่อจาก textStyle) ----
const FontSize = Mark.create({
  name: "fontSize",
  addOptions() { return { types: ["textStyle"] }; },
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: { fontSize?: string }) => (attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {}),
        },
      },
    }];
  },
});

const FONTS = ["", "Sarabun", "Tahoma", "Arial", "Times New Roman", "Courier New"];
const SIZES = ["", "12px", "14px", "16px", "18px", "20px", "24px", "28px"];
const COLORS = ["#0f172a", "#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#64748b"];

export function RichTextEditor({
  value, onChange, editable = true, placeholder, onUploadImage, minHeight = 160,
}: {
  value: string;
  onChange: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
  /** อัปโหลดรูป (วาง/ลาก) → คืน URL ที่จะใส่ในเนื้อหา · ไม่ส่ง = ปิดการแทรกรูป */
  onUploadImage?: (file: File) => Promise<string>;
  minHeight?: number;
}) {
  const insertFiles = (editor: Editor | null, files: File[]) => {
    if (!onUploadImage || !editor) return;
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    imgs.forEach(async (f) => {
      try { const url = await onUploadImage(f); editor.chain().focus().setImage({ src: url }).run(); }
      catch { /* parent แจ้ง error เอง */ }
    });
  };

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit,
      Underline,
      TextStyle, FontSize, Color, FontFamily,
      ResizableImage.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: true }), TableRow, TableHeader, TableCell,
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: "tiptap-content focus:outline-none px-3 py-2", style: `min-height:${minHeight}px` },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.some((f) => f.type.startsWith("image/")) && onUploadImage) { insertFiles(editor, files); return true; }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        if (files.some((f) => f.type.startsWith("image/")) && onUploadImage) { event.preventDefault(); insertFiles(editor, files); return true; }
        return false;
      },
    },
  });

  // sync ค่าจากภายนอก (เช่นเปิดเอกสารใหม่) — เฉพาะตอนต่างจริง กัน cursor กระโดด
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value || "", { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);
  useEffect(() => { editor?.setEditable(editable); }, [editable, editor]);

  if (!editor) return <div className="border border-slate-200 rounded-lg" style={{ minHeight }} />;

  const Btn = ({ on, active, label, title }: { on: () => void; active?: boolean; label: string; title?: string }) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); on(); }}
      className={`h-7 min-w-7 px-1.5 text-sm rounded border ${active ? "bg-blue-100 border-blue-300 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>
  );

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {editable && (
        <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-slate-200 bg-slate-50">
          <Btn on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} label="B" title="ตัวหนา" />
          <Btn on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} label="I" title="ตัวเอียง" />
          <Btn on={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} label="U" title="ขีดเส้นใต้" />
          <Btn on={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} label="S" title="ขีดทับ" />
          <span className="w-px h-5 bg-slate-200 mx-0.5" />
          <Btn on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} label="H1" />
          <Btn on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} label="H2" />
          <Btn on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} label="•" title="หัวข้อย่อย" />
          <Btn on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} label="1." title="ลำดับเลข" />
          <span className="w-px h-5 bg-slate-200 mx-0.5" />
          <select title="ฟอนต์" onChange={(e) => e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run()}
            className="h-7 px-1 text-xs border border-slate-200 rounded bg-white">
            {FONTS.map((f) => <option key={f} value={f}>{f || "ฟอนต์"}</option>)}
          </select>
          <select title="ขนาด" onChange={(e) => editor.chain().focus().setMark("textStyle", { fontSize: e.target.value || null }).run()}
            className="h-7 px-1 text-xs border border-slate-200 rounded bg-white">
            {SIZES.map((s) => <option key={s} value={s}>{s || "ขนาด"}</option>)}
          </select>
          <span className="inline-flex items-center gap-0.5">
            {COLORS.map((c) => (
              <button key={c} type="button" title="สี" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(c).run(); }}
                className="w-5 h-5 rounded border border-slate-200" style={{ backgroundColor: c }} />
            ))}
            <button type="button" title="ล้างสี" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetColor().run(); }}
              className="h-5 px-1 text-[10px] border border-slate-200 rounded text-slate-500">×สี</button>
          </span>
          <span className="w-px h-5 bg-slate-200 mx-0.5" />
          <Btn on={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} label="⊞" title="แทรกตาราง" />
          {onUploadImage && <Btn on={() => imgInput(editor, onUploadImage)} label="🖼" title="แทรกรูป" />}
          {editor.isActive("image") && <>
            <span className="text-[11px] text-slate-400">ขนาดรูป:</span>
            <Btn on={() => editor.chain().focus().updateAttributes("image", { width: "25%" }).run()} label="เล็ก" />
            <Btn on={() => editor.chain().focus().updateAttributes("image", { width: "50%" }).run()} label="กลาง" />
            <Btn on={() => editor.chain().focus().updateAttributes("image", { width: "75%" }).run()} label="ใหญ่" />
            <Btn on={() => editor.chain().focus().updateAttributes("image", { width: "100%" }).run()} label="เต็ม" />
          </>}
          {editor.isActive("table") && <>
            <Btn on={() => editor.chain().focus().addColumnAfter().run()} label="+คอลัมน์" />
            <Btn on={() => editor.chain().focus().addRowAfter().run()} label="+แถว" />
            <Btn on={() => editor.chain().focus().deleteTable().run()} label="ลบตาราง" />
          </>}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

// คลิกปุ่มรูป → เลือกไฟล์ → อัปโหลด → แทรก
function imgInput(editor: Editor | null, upload: (f: File) => Promise<string>) {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*";
  inp.onchange = async () => {
    const f = inp.files?.[0]; if (!f || !editor) return;
    try { const url = await upload(f); editor.chain().focus().setImage({ src: url }).run(); } catch { /* ignore */ }
  };
  inp.click();
}
