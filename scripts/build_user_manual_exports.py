from __future__ import annotations

import html
import re
import shutil
import subprocess
import sys
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
MANUAL_MD = ROOT / "docs" / "USER_MANUAL.md"
ASSET_ROOT = ROOT / "docs" / "assets" / "user-manual" / "v0.1.1"
PNG_ROOT = ASSET_ROOT / "docx-png"
OUT_DOCX = ROOT / "docs" / "USER_MANUAL.docx"
OUT_HTML = ROOT / "tmp" / "user-manual-export" / "USER_MANUAL.print.html"
OUT_PDF = ROOT / "docs" / "USER_MANUAL.pdf"


def set_run_font(run, size: float | None = None, bold: bool | None = None):
    run.font.name = "Nirmala UI"
    run._element.rPr.rFonts.set(qn("w:ascii"), "Nirmala UI")
    run._element.rPr.rFonts.set(qn("w:hAnsi"), "Nirmala UI")
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Nirmala UI")
    run._element.rPr.rFonts.set(qn("w:cs"), "Nirmala UI")
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold


def shade_cell(cell, fill: str):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def add_update_fields_setting(doc: Document):
    settings = doc.settings.element
    if settings.find(qn("w:updateFields")) is None:
        update_fields = OxmlElement("w:updateFields")
        update_fields.set(qn("w:val"), "true")
        settings.append(update_fields)


def add_toc_field(paragraph):
    run = paragraph.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    run._r.append(fld_begin)

    instr_run = paragraph.add_run()
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = r'TOC \o "1-3" \h \z \u'
    instr_run._r.append(instr)

    sep_run = paragraph.add_run()
    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    sep_run._r.append(fld_sep)

    placeholder = paragraph.add_run("Table of contents will update automatically when opened in Word.")
    set_run_font(placeholder, 10)

    end_run = paragraph.add_run()
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    end_run._r.append(fld_end)


def add_table_of_contents(doc: Document):
    heading = doc.add_paragraph(style="Heading 1")
    run = heading.add_run("Table of Contents / පටුන")
    set_run_font(run, 17, True)
    paragraph = doc.add_paragraph()
    add_toc_field(paragraph)
    note = doc.add_paragraph()
    add_hyper_text(note, "If Word asks to update fields when opening this document, choose Yes to refresh the table of contents and page numbers.")


def set_cell_text(cell, text: str, bold: bool = False):
    cell.text = ""
    paragraph = cell.paragraphs[0]
    run = paragraph.add_run(text)
    set_run_font(run, 9.5, bold)
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER


def add_hyper_text(paragraph, text: str):
    parts = re.split(r"(`[^`]+`)", text)
    for part in parts:
        if not part:
            continue
        if part.startswith("`") and part.endswith("`"):
            run = paragraph.add_run(part[1:-1])
            set_run_font(run, 9.5)
            run.font.name = "Consolas"
            run._element.rPr.rFonts.set(qn("w:ascii"), "Consolas")
            run._element.rPr.rFonts.set(qn("w:hAnsi"), "Consolas")
        else:
            run = paragraph.add_run(part)
            set_run_font(run, 10.5)


def clean_inline(text: str) -> str:
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = text.replace("**", "")
    return text.strip()


def make_placeholder_png(svg_path: Path) -> Path:
    PNG_ROOT.mkdir(parents=True, exist_ok=True)
    out = PNG_ROOT / (svg_path.stem + ".png")
    if out.exists() and out.stat().st_mtime >= svg_path.stat().st_mtime:
        return out
    text = svg_path.read_text(encoding="utf-8")
    title_match = re.search(r"<title[^>]*>(.*?)</title>", text, re.S)
    title = html.unescape(title_match.group(1)).strip() if title_match else svg_path.stem
    screen = title.split(" - ", 1)[-1]
    image = Image.new("RGB", (1280, 720), "#f5f7f2")
    draw = ImageDraw.Draw(image)
    try:
        title_font = ImageFont.truetype("arial.ttf", 46)
        body_font = ImageFont.truetype("arial.ttf", 28)
        small_font = ImageFont.truetype("arial.ttf", 22)
    except OSError:
        title_font = body_font = small_font = ImageFont.load_default()
    draw.rounded_rectangle((52, 48, 1228, 672), radius=22, fill="#ffffff", outline="#cfd8c5", width=3)
    draw.rounded_rectangle((52, 48, 1228, 136), radius=22, fill="#2f5d46")
    draw.rectangle((52, 106, 1228, 136), fill="#2f5d46")
    draw.text((88, 82), "Tea Leaf Acquiring System", fill="#ffffff", font=body_font)
    draw.rounded_rectangle((92, 184, 342, 604), radius=10, fill="#eef4ea", outline="#d8e2d0")
    draw.rounded_rectangle((382, 184, 1188, 604), radius=10, fill="#fbfcfa", outline="#d8e2d0")
    draw.text((412, 250), screen, fill="#26382f", font=title_font)
    draw.text((412, 322), "User manual screenshot slot", fill="#446657", font=body_font)
    draw.text((412, 394), "Replace this image with a real version 0.1.1 screenshot.", fill="#6b766f", font=small_font)
    for y, color in [(244, "#5f8f69"), (304, "#c8a85f"), (364, "#7c9ab1")]:
        draw.ellipse((134, y - 18, 170, y + 18), fill=color)
        draw.rounded_rectangle((188, y - 10, 300, y + 10), radius=6, fill="#adc1cf")
    image.save(out)
    return out


def configure_document(doc: Document):
    section = doc.sections[0]
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.65)
    section.left_margin = Inches(0.72)
    section.right_margin = Inches(0.72)
    styles = doc.styles
    for style_name, size in [("Normal", 10.5), ("Body Text", 10.5), ("List Bullet", 10), ("List Number", 10)]:
        style = styles[style_name]
        style.font.name = "Nirmala UI"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Nirmala UI")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Nirmala UI")
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Nirmala UI")
        style._element.rPr.rFonts.set(qn("w:cs"), "Nirmala UI")
        style.font.size = Pt(size)
        style.paragraph_format.space_after = Pt(5)
        style.paragraph_format.line_spacing = 1.08
    for style_name, size in [("Title", 22), ("Heading 1", 17), ("Heading 2", 14), ("Heading 3", 12)]:
        style = styles[style_name]
        style.font.name = "Nirmala UI"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Nirmala UI")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Nirmala UI")
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Nirmala UI")
        style._element.rPr.rFonts.set(qn("w:cs"), "Nirmala UI")
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.font.bold = True


def add_docx_table(doc: Document, rows: list[list[str]]):
    if not rows:
        return
    table = doc.add_table(rows=len(rows), cols=max(len(row) for row in rows))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    for r_idx, row in enumerate(rows):
        for c_idx, value in enumerate(row):
            cell = table.cell(r_idx, c_idx)
            set_cell_text(cell, clean_inline(value), bold=(r_idx == 0))
            if r_idx == 0:
                shade_cell(cell, "2F5D46")
                for paragraph in cell.paragraphs:
                    for run in paragraph.runs:
                        run.font.color.rgb = RGBColor(255, 255, 255)
            elif r_idx % 2 == 0:
                shade_cell(cell, "F2F5F0")
    doc.add_paragraph()


def flush_paragraph(doc: Document, lines: list[str]):
    if not lines:
        return
    text = clean_inline(" ".join(line.strip() for line in lines))
    if not text:
        return
    paragraph = doc.add_paragraph()
    add_hyper_text(paragraph, text)


def md_to_docx():
    doc = Document()
    configure_document(doc)
    add_update_fields_setting(doc)
    lines = MANUAL_MD.read_text(encoding="utf-8").splitlines()
    paragraph_lines: list[str] = []
    table_lines: list[str] = []
    in_code = False
    ordered_list_number = 0
    in_ordered_list = False
    main_section_re = re.compile(r"^(?:1\. Desktop App|2\. Android Tablet App|3\. Web App|4\. Common Operations|5\. Versioned Functionality Updates)")

    def flush_table():
        nonlocal table_lines
        if not table_lines:
            return
        rows = []
        for raw in table_lines:
            if re.match(r"^\s*\|?\s*[-: ]+\|", raw):
                continue
            cells = [cell.strip() for cell in raw.strip().strip("|").split("|")]
            rows.append(cells)
        add_docx_table(doc, rows)
        table_lines = []

    title_done = False
    def reset_ordered_list():
        nonlocal ordered_list_number, in_ordered_list
        ordered_list_number = 0
        in_ordered_list = False

    for raw in lines:
        line = raw.rstrip()
        if line.startswith("```"):
            flush_paragraph(doc, paragraph_lines)
            paragraph_lines = []
            flush_table()
            reset_ordered_list()
            in_code = not in_code
            continue
        if in_code:
            if line.strip():
                p = doc.add_paragraph(style="Intense Quote")
                run = p.add_run(line)
                set_run_font(run, 9)
                run.font.name = "Consolas"
            continue
        image_match = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line.strip())
        if image_match:
            flush_paragraph(doc, paragraph_lines)
            paragraph_lines = []
            flush_table()
            reset_ordered_list()
            image_path = (MANUAL_MD.parent / image_match.group(2)).resolve()
            if image_path.exists():
                if image_path.suffix.lower() == ".svg":
                    image_path = make_placeholder_png(image_path)
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.add_run().add_picture(str(image_path), width=Inches(5.9))
                caption = doc.add_paragraph(clean_inline(image_match.group(1)))
                caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in caption.runs:
                    set_run_font(run, 9)
                    run.italic = True
            continue
        if line.startswith("|"):
            flush_paragraph(doc, paragraph_lines)
            paragraph_lines = []
            reset_ordered_list()
            table_lines.append(line)
            continue
        flush_table()
        heading = re.match(r"^(#{1,4})\s+(.*)$", line)
        if heading:
            flush_paragraph(doc, paragraph_lines)
            paragraph_lines = []
            reset_ordered_list()
            level = len(heading.group(1))
            text = clean_inline(heading.group(2))
            if level == 1 and not title_done:
                p = doc.add_paragraph(style="Title")
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run(text)
                set_run_font(run, 22, True)
                subtitle = doc.add_paragraph("Version 0.1.1")
                subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
                set_run_font(subtitle.runs[0], 11)
                doc.add_section(WD_SECTION.NEW_PAGE)
                add_table_of_contents(doc)
                title_done = True
            else:
                if level == 2 and main_section_re.match(text):
                    doc.add_page_break()
                p = doc.add_paragraph(style=f"Heading {min(level, 3)}")
                run = p.add_run(text)
                set_run_font(run, {1: 17, 2: 14, 3: 12}.get(min(level, 3), 11), True)
            continue
        if re.match(r"^\s*[-*]\s+", line):
            flush_paragraph(doc, paragraph_lines)
            paragraph_lines = []
            reset_ordered_list()
            p = doc.add_paragraph(style="List Bullet")
            add_hyper_text(p, clean_inline(re.sub(r"^\s*[-*]\s+", "", line)))
            continue
        if re.match(r"^\s*\d+\.\s+", line):
            flush_paragraph(doc, paragraph_lines)
            paragraph_lines = []
            if not in_ordered_list:
                ordered_list_number = 1
                in_ordered_list = True
            else:
                ordered_list_number += 1
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.28)
            p.paragraph_format.first_line_indent = Inches(-0.22)
            number_run = p.add_run(f"{ordered_list_number}. ")
            set_run_font(number_run, 10.5)
            number_run.bold = True
            add_hyper_text(p, clean_inline(re.sub(r"^\s*\d+\.\s+", "", line)))
            continue
        if not line.strip():
            flush_paragraph(doc, paragraph_lines)
            paragraph_lines = []
            reset_ordered_list()
            continue
        reset_ordered_list()
        paragraph_lines.append(line)
    flush_paragraph(doc, paragraph_lines)
    flush_table()
    for section in doc.sections:
        footer = section.footer.paragraphs[0]
        footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = footer.add_run("Tea Leaf Acquiring System User Manual - Version 0.1.1")
        set_run_font(run, 8.5)
    doc.save(OUT_DOCX)


def md_to_html():
    OUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    src = MANUAL_MD.read_text(encoding="utf-8").splitlines()
    out: list[str] = []
    in_code = False
    list_open = False
    table_open = False

    def close_list():
        nonlocal list_open
        if list_open:
            out.append("</ol>")
            list_open = False

    def close_table():
        nonlocal table_open
        if table_open:
            out.append("</tbody></table>")
            table_open = False

    for raw in src:
        line = raw.rstrip()
        if line.startswith("```"):
            close_list()
            close_table()
            if not in_code:
                out.append("<pre><code>")
                in_code = True
            else:
                out.append("</code></pre>")
                in_code = False
            continue
        if in_code:
            out.append(html.escape(line))
            continue
        image_match = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line.strip())
        if image_match:
            close_list()
            close_table()
            alt = html.escape(image_match.group(1))
            src_path = html.escape(image_match.group(2))
            out.append(f'<figure><img src="{src_path}" alt="{alt}"><figcaption>{alt}</figcaption></figure>')
            continue
        if line.startswith("|"):
            close_list()
            cells = [html.escape(clean_inline(cell)) for cell in line.strip().strip("|").split("|")]
            if re.match(r"^\s*\|?\s*[-: ]+\|", line):
                continue
            if not table_open:
                out.append("<table><tbody>")
                table_open = True
                tag = "th"
            else:
                tag = "td"
            out.append("<tr>" + "".join(f"<{tag}>{cell}</{tag}>" for cell in cells) + "</tr>")
            continue
        close_table()
        heading = re.match(r"^(#{1,4})\s+(.*)$", line)
        if heading:
            close_list()
            level = min(len(heading.group(1)), 4)
            out.append(f"<h{level}>{html.escape(clean_inline(heading.group(2)))}</h{level}>")
            continue
        if re.match(r"^\s*[-*]\s+", line):
            close_list()
            text = html.escape(clean_inline(re.sub(r"^\s*[-*]\s+", "", line)))
            out.append(f"<ul><li>{text}</li></ul>")
            continue
        if re.match(r"^\s*\d+\.\s+", line):
            if not list_open:
                out.append("<ol>")
                list_open = True
            text = html.escape(clean_inline(re.sub(r"^\s*\d+\.\s+", "", line)))
            out.append(f"<li>{text}</li>")
            continue
        if not line.strip():
            close_list()
            continue
        close_list()
        text = html.escape(clean_inline(line))
        text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
        out.append(f"<p>{text}</p>")
    close_list()
    close_table()
    body = "\n".join(out)
    css = """
@page { size: A4; margin: 14mm 13mm 14mm 13mm; }
body { font-family: 'Nirmala UI', 'Segoe UI', Arial, sans-serif; color: #1f2a24; line-height: 1.33; font-size: 10.2pt; }
h1 { text-align: center; font-size: 22pt; margin: 0 0 14pt; color: #000; }
h2 { break-before: auto; font-size: 16pt; margin: 18pt 0 7pt; color: #000; border-bottom: 1px solid #cfd8c5; padding-bottom: 3pt; }
h3 { font-size: 13pt; margin: 13pt 0 5pt; color: #000; }
h4 { font-size: 11.5pt; margin: 10pt 0 4pt; color: #000; }
p { margin: 0 0 6pt; }
ol, ul { margin-top: 0; margin-bottom: 6pt; padding-left: 18pt; }
li { margin-bottom: 2pt; }
table { width: 100%; border-collapse: collapse; margin: 8pt 0 10pt; break-inside: avoid; }
th { background: #2f5d46; color: white; font-weight: 700; }
th, td { border: 1px solid #d9d9d9; padding: 5pt 6pt; vertical-align: middle; }
tr:nth-child(even) td { background: #f2f5f0; }
figure { margin: 9pt auto 11pt; text-align: center; break-inside: avoid; }
img { max-width: 92%; border: 1px solid #cfd8c5; border-radius: 5px; }
figcaption { font-size: 8.8pt; color: #58635d; margin-top: 3pt; font-style: italic; }
code { font-family: Consolas, monospace; font-size: 9pt; background: #eef4ea; padding: 1pt 2pt; }
pre { background: #f5f7f2; padding: 7pt; white-space: pre-wrap; border: 1px solid #d9d9d9; }
"""
    OUT_HTML.write_text(f"<!doctype html><html><head><meta charset='utf-8'><title>User Manual</title><style>{css}</style></head><body>{body}</body></html>", encoding="utf-8")


def print_pdf_with_edge():
    edge = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
    if not edge.exists():
        edge = Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe")
    if not edge.exists():
        raise FileNotFoundError("Microsoft Edge was not found for PDF export")
    if OUT_PDF.exists():
        OUT_PDF.unlink()
    user_data = ROOT / "tmp" / "edge-user-manual-pdf"
    if user_data.exists():
        shutil.rmtree(user_data)
    user_data.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(edge),
        "--headless",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        f"--print-to-pdf={OUT_PDF}",
        "--print-to-pdf-no-header",
        OUT_HTML.as_uri(),
    ]
    subprocess.run(cmd, check=True, cwd=ROOT)


if __name__ == "__main__":
    md_to_docx()
    md_to_html()
    if "--pdf" in sys.argv:
        print_pdf_with_edge()
    print(OUT_DOCX)
    print(OUT_HTML)
    if OUT_PDF.exists():
        print(OUT_PDF)
