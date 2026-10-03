"""Convert "Statistics: From First Principles to Regression" to the website's book-reader format.

    python scripts/books/statistics/export.py --src <statsbook source folder> \
        --out src/data/books/statistics-first-principles-to-regression \
        --figures-out <folder for R2> [--docx "<released .docx>"]

The source folder is the unzipped `statsbook-v3.1-source.zip` (private R2 bucket `drhm-sources`, under
`stats/`): `src/` (pandoc markdown, one file per chapter), `answers/`, `refs/` and `tools/build.py`.
This writes the one format the reader reads (docs/book-reader-plan.md):

    <out>/book.json               title, version, date, PDF link, outline (Part -> section, with word counts)
    <out>/sections/<id>.json      one section's blocks, in reading order

and copies every figure the book uses to --figures-out, named for R2
(`books/statistics-first-principles-to-regression/figures/`). Figures never go into git.

Nothing here changes a word of the book. The markdown goes through pandoc's own parser (the same one that
built the PDF and the Word file, `-f markdown-implicit_figures`), the document is cut into blocks at the book's
own labels, and each block is rendered by pandoc. Appendix A, Appendix B and the References are assembled
exactly as `tools/build.py` assembles them. Checkpoint questions are paired with their model answers from
`answers/` so the reader can offer "try, then reveal"; the same answers are still printed in Appendix A.

A raw caret, a record path or a broken § reference stops the export. With --docx, the book's words are also
compared with the released Word file; any difference beyond the known ones is printed.
"""
import argparse
import collections
import html as _html
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import zipfile

import yaml

FORMAT = 1
BOOK_ID = "stats"
SLUG = "statistics-first-principles-to-regression"
FILES = "https://files.drharshmaheshwari.com"
READ_URL = f"/doctors/books/{SLUG}/read/"
FIGURE_BASE = f"{FILES}/books/{SLUG}/figures/"

TITLE = "Statistics: From First Principles to Regression"
SUBTITLE = "An introductory book, written as an unbroken chain of logic"
AUTHOR = "Dr. Harsh Maheshwari"
VERSION = "3.1"
DATE = "2026-09-28"  # build.py: "Version 3.1 · 28 September 2026"
LICENCE = "CC BY-NC-SA 4.0"
PDF = f"{FILES}/books/Statistics-From_First_Principles_to_Regression_v3.1.pdf"  # src/content/books/<slug>.md

CHAPTER_FILES = [f"ch{n:02d}" for n in range(1, 15)] + ["ch15a", "ch15b", "ch16", "ch17"]

# Appendix B names, for each function, the package R's find() reported on the machine that built v3.1.
# build.py asks R, which names the first attached package that defines the name, so a package that masks
# a base function wins (cov -> pROC). Without R these ten rows would differ, so they are pinned to what
# the released book prints, and listed so they can be corrected in the next edition.
V31_APPENDIX_B_PACKAGES = {
    "ageadjust.direct": "epitools", "as.matrix": "Matrix", "calibrate": "survey", "cov": "pROC",
    "power.prop.test": "base R", "power.t.test": "base R", "Surv": "rms", "unname": "Matrix",
    "update": "Matrix", "vif": "rms",
}

# The book's own block labels (STYLE.md "Section template") -> a role the reader styles by.
LABELS = [
    (r"Definition", "definition"),
    (r"Simplified Explanation", "explanation"),
    (r"Illustration / Example(?:: .+)?", "example"),
    (r"Derivation(?:: .+)?", "derivation"),
    (r"Worked Calculation.*", "calculation"),
    (r"In R(?: \(optional\))?", "r"),
    (r"Common Misreading", "misreading"),
    (r"Must-Know Notes \(MD-level\)", "mustknow"),
    (r"Output\.?", "output"),
    (r"Checkpoint \d+\.\d+", "checkpoint"),
]

CARETS = collections.Counter()
PROBLEMS = []   # stop the export
NOTES = []      # reported only


# ---------------------------------------------------------------- pandoc

def _pandoc():
    exe = shutil.which("pandoc")
    if exe:
        return exe
    try:
        import pypandoc
        return pypandoc.get_pandoc_path()
    except Exception:
        sys.exit("pandoc is required: install pandoc, or pip install pypandoc_binary pyyaml")


PANDOC = _pandoc()
API = None


def md_to_ast(text):
    """pandoc's own parse of the book's markdown, as pandoc-types JSON."""
    global API
    p = subprocess.run([PANDOC, "-f", "markdown-implicit_figures", "-t", "json"], input=text,
                       capture_output=True, text=True, check=True)
    doc = json.loads(p.stdout)
    API = API or doc["pandoc-api-version"]
    return doc["blocks"]


FRAGS = []  # lists of AST blocks, rendered together at the end


def _classes(blocks):
    """The book fences program output as ```text; the reader styles a code box of class `output`."""
    for b in blocks:
        if b["t"] == "CodeBlock" and b["c"][0][1] == ["text"]:
            b["c"][0][1] = ["output"]
    return blocks


def frag(blocks):
    FRAGS.append(_classes(blocks))
    return {"_h": len(FRAGS) - 1}


def _tidy(h):
    h = h.replace('<figcaption aria-hidden="true">', "<figcaption>")
    h = re.sub(r"<colgroup>.*?</colgroup>", "", h, flags=re.S)          # the reader sizes tables itself
    h = re.sub(r'<a href="#cb\d+-\d+" aria-hidden="true" tabindex="-1"></a>', "", h)  # per-line anchors
    h = re.sub(r' id="cb\d+(?:-\d+)?"', "", h)                          # repeat across sections on one page
    return h


def render_frags():
    """Every fragment through one pandoc run, split back apart by marker comments."""
    out_blocks = []
    for i, blocks in enumerate(FRAGS):
        out_blocks.append({"t": "RawBlock", "c": ["html", f"<!--BLK:{i}-->"]})
        out_blocks.extend(blocks)
    out_blocks.append({"t": "RawBlock", "c": ["html", f"<!--BLK:{len(FRAGS)}-->"]})
    doc = {"pandoc-api-version": API, "meta": {}, "blocks": out_blocks}
    p = subprocess.run([PANDOC, "-f", "json", "-t", "html5", "--wrap=none"], input=json.dumps(doc),
                       capture_output=True, text=True, check=True)
    out, parts = p.stdout, []
    for i in range(len(FRAGS)):
        a = out.index(f"<!--BLK:{i}-->") + len(f"<!--BLK:{i}-->")
        b = out.index(f"<!--BLK:{i + 1}-->")
        parts.append(_tidy(out[a:b].strip()))
    return parts


# ---------------------------------------------------------------- AST helpers

def plain(x):
    """Plain text of inlines (or any pandoc node)."""
    if isinstance(x, list):
        return "".join(plain(i) for i in x)
    if not isinstance(x, dict):
        return ""
    t, c = x["t"], x.get("c")
    if t == "Str":
        return c
    if t in ("Space", "SoftBreak"):
        return " "
    if t == "LineBreak":
        return " "
    if t == "Code":
        return c[1]
    if t in ("Emph", "Strong", "Strikeout", "Superscript", "Subscript", "SmallCaps"):
        return plain(c)
    if t in ("Link", "Span"):
        return plain(c[1])
    if t == "Quoted":
        q = "“”" if c[0]["t"] == "DoubleQuote" else "‘’"
        return q[0] + plain(c[1]) + q[1]
    if t == "Image":
        return plain(c[1])
    if t == "Math":
        return c[1]
    if t in ("Para", "Plain"):
        return plain(c)
    return ""


def inline_html(inlines):
    """Inlines as HTML without a <p> wrapper (headings, captions, titles)."""
    return frag([{"t": "Plain", "c": inlines}])


def is_label(b):
    """A paragraph made only of bold text that is one of the book's block labels -> (text, role)."""
    if b["t"] != "Para" or len(b["c"]) != 1 or b["c"][0]["t"] != "Strong":
        return None
    text = plain(b["c"][0]["c"]).strip()
    for rx, role in LABELS:
        if re.fullmatch(rx, text):
            return text, role
    return None


def is_image(b):
    return b["t"] == "Para" and len(b["c"]) == 1 and b["c"][0]["t"] == "Image"


def split_number(inlines):
    """'4.2.1 Bar Diagram' -> ('4.2.1', inlines of the title)."""
    first = inlines[0]
    if first["t"] == "Str" and re.fullmatch(r"\d+(?:\.\d+)*", first["c"]):
        rest = inlines[1:]
        while rest and rest[0]["t"] in ("Space", "SoftBreak"):
            rest = rest[1:]
        return first["c"], rest
    return None, inlines


# ---------------------------------------------------------------- figures

class Figures:
    """Resolves a figure's markdown path to a file: the source folder if it holds the PNG, else the
    released Word file's own copy (its n-th picture is the book's n-th figure)."""

    def __init__(self, src, docx):
        self.src, self.docx = src, docx
        self.order = []          # markdown paths in book order
        self.names = {}          # path -> published name
        self.docx_media = None
        if docx:
            z = zipfile.ZipFile(docx)
            rels = dict(re.findall(r'Id="(rId\d+)"[^>]*?Target="(media/[^"]+)"', z.read("word/_rels/document.xml.rels").decode()))
            rels.update({a: b for b, a in re.findall(r'Target="(media/[^"]+)"[^>]*?Id="(rId\d+)"', z.read("word/_rels/document.xml.rels").decode())})
            used = re.findall(r'<a:blip r:embed="(rId\d+)"', z.read("word/document.xml").decode())
            self.docx_media = [(z, "word/" + rels[r]) for r in used]

    def name(self, path):
        if path not in self.names:
            base = os.path.basename(path)
            self.names[path] = base
            if base in self.names.values() and list(self.names.values()).count(base) > 1:
                PROBLEMS.append(f"two figures would be published as {base}")
        return self.names[path]

    def note(self, path):
        self.order.append(path)
        return self.name(path)

    def export(self, out_dir):
        os.makedirs(out_dir, exist_ok=True)
        sizes, from_docx = {}, 0
        if self.docx_media is not None and len(self.docx_media) != len(self.order):
            PROBLEMS.append(f"the Word file holds {len(self.docx_media)} pictures, the markdown {len(self.order)}")
        for i, path in enumerate(self.order):
            dst = os.path.join(out_dir, self.names[path])
            if path in sizes:
                continue
            local = os.path.join(self.src, path)
            if os.path.exists(local):
                shutil.copyfile(local, dst)
            elif self.docx_media is not None and i < len(self.docx_media):
                z, member = self.docx_media[i]
                with open(dst, "wb") as fh:
                    fh.write(z.read(member))
                from_docx += 1
            else:
                PROBLEMS.append(f"no file for figure {path}")
                continue
            with open(dst, "rb") as fh:
                head = fh.read(24)
            sizes[path] = struct.unpack(">II", head[16:24]) if head[:8] == b"\x89PNG\r\n\x1a\n" else (0, 0)
        return sizes, from_docx


# ---------------------------------------------------------------- appendices and references (build.py)

def load_build(src):
    """build.py's own appendix and reference code, run without its Word/PDF steps and without R."""
    code = open(os.path.join(src, "tools", "build.py"), encoding="utf-8").read()
    for line in ("from docx import Document", "from docx.shared import Pt, RGBColor", "from docx.oxml.ns import qn",
                 "from docx.oxml import OxmlElement"):
        code = code.replace(line, "")
    code = code.replace('ROOT = "/home/claude/statsbook"\nos.chdir(ROOT)\n', "")
    code = code.replace('if __name__ == "__main__":\n    main()', "")
    ns = {"__name__": "statsbook_build"}
    cwd = os.getcwd()
    os.chdir(src)
    try:
        exec(compile(code, "build.py", "exec"), ns)
        front = ns["read"]("src/00-front.md")
        main_txt = "\n\n".join(ns["read"](f) for f in ns["CH"])
        appendix_a = ns["appendix_a"]()
        appendix_b, _ = ns["appendix_b"]()
        refs, _, _ = ns["references"](front + main_txt + appendix_a)
    finally:
        os.chdir(cwd)
    for p in ns["problems"]:
        if "Rscript" in p:
            continue  # no R here: Appendix B's package column is pinned below
        PROBLEMS.append("build.py: " + p)
    return front, main_txt, appendix_a, pin_packages(appendix_b), refs


def pin_packages(md):
    def row(m):
        fn, pkg = m.group(1), m.group(2)
        return f"| `{fn}()` | {V31_APPENDIX_B_PACKAGES.get(fn, pkg)} |"
    out, seen = [], set()
    for line in md.split("\n"):
        m = re.match(r"\| `([^`]+)\(\)` \| ([^|]+?) \|(.*)$", line)
        if m:
            fn = m.group(1)
            seen.add(fn)
            line = f"| `{fn}()` | {V31_APPENDIX_B_PACKAGES.get(fn, m.group(2))} |{m.group(3)}"
        out.append(line)
    missing = set(V31_APPENDIX_B_PACKAGES) - seen
    if missing:
        PROBLEMS.append(f"Appendix B has no row for {sorted(missing)}")
    return "\n".join(out)


# ---------------------------------------------------------------- answers (for the checkpoints)

def read_answers(src):
    """{'5.1': [answer blocks for question 1, for question 2, ...]} from answers/chNN.md."""
    answers = {}
    for name in CHAPTER_FILES:
        text = open(os.path.join(src, "answers", f"{name}.md"), encoding="utf-8").read()
        cp, qs = None, None
        for b in md_to_ast(text):
            if b["t"] == "Header":
                m = re.fullmatch(r"Checkpoint (\d+\.\d+)", plain(b["c"][2]).strip())
                if m:
                    cp, qs = m.group(1), []
                    answers[cp] = qs
                else:
                    cp = None
                continue
            if cp is None:
                continue
            if b["t"] == "Para" and b["c"] and b["c"][0]["t"] == "Strong" and re.fullmatch(r"\d+\.", plain(b["c"][0]["c"]).strip()):
                qs.append({"q": plain(b["c"]), "a": []})
            elif qs:
                qs[-1]["a"].append(b)
            else:
                PROBLEMS.append(f"answers/{name}.md: text before the first question of Checkpoint {cp}")
    return answers


# ---------------------------------------------------------------- sections

class Book:
    def __init__(self, figures):
        self.figures = figures
        self.parts = []            # {'id','title','sections':[section]}
        self.numbers = set()       # every heading number, for § checks
        self.sec_of = {}           # '4.2' -> section id

    def part(self, pid, title):
        p = {"id": pid, "title": title, "sections": []}
        self.parts.append(p)
        return p


def new_section(part, sid, label, title_inlines, title_text):
    s = {"format": FORMAT, "id": sid, "label": label, "title": inline_html(title_inlines) if title_inlines else _html.escape(title_text, quote=False),
         "part": part["id"], "blocks": []}
    part["sections"].append(s)
    return s


class Cutter:
    """Cuts a stream of pandoc blocks into the reader's blocks at the book's own labels."""

    def __init__(self, book, answers, section_cb=None):
        self.book, self.answers = book, answers
        self.sec = None
        self.group = None  # {'label','role','blocks'}
        self.cp_n = 0

    def flush(self):
        g, self.group = self.group, None
        if not g or (not g["blocks"] and not g["label"]):
            return
        blocks, role, label = g["blocks"], g["role"], g["label"]
        if not blocks:  # a label with only a figure under it still prints its label
            self.sec["blocks"].append({"t": "prose", "label": label, "role": role, "html": ""})
            return
        if role == "mustknow" and len(blocks) == 1 and blocks[0]["t"] == "BulletList":
            self.sec["blocks"].append({"t": "mustknow", "label": label,
                                       "points": [{"html": frag(item)} for item in blocks[0]["c"]]})
        else:
            self.sec["blocks"].append({"t": "prose", "label": label, "role": role, "html": frag(blocks)})

    def add(self, b):
        self.group = self.group or {"label": "", "role": "text", "blocks": []}
        self.group["blocks"].append(b)

    def feed(self, blocks):
        i = 0
        while i < len(blocks):
            b = blocks[i]
            lab = is_label(b)
            if lab and lab[1] == "checkpoint":
                self.flush()
                i = self.checkpoint(lab[0], blocks, i)
                continue
            if lab:
                self.flush()
                self.group = {"label": lab[0], "role": lab[1], "blocks": []}
            elif b["t"] == "Header":
                self.flush()
                self.heading(b)
            elif is_image(b):
                i = self.figure(blocks, i)
                continue
            else:
                self.add(b)
            i += 1
        self.flush()

    def heading(self, b):
        level, _, inlines = b["c"]
        num, title = split_number(inlines)
        if num:
            self.book.numbers.add(num)
        self.sec["blocks"].append({"t": "heading", "level": level, "num": num or "", "html": inline_html(title)})

    def figure(self, blocks, i):
        keep = self.group  # a figure interrupts a labelled block; what follows continues it, unlabelled
        self.group = None
        if keep:
            self.group = keep
            self.flush()
        image = blocks[i]["c"][0]["c"]
        alt, path = plain(image[1]), image[2][0]
        cap, nxt = [], blocks[i + 1] if i + 1 < len(blocks) else None
        if nxt and nxt["t"] == "Para" and len(nxt["c"]) == 1 and nxt["c"][0]["t"] == "Emph" and plain(nxt["c"][0]["c"]).startswith("Figure "):
            cap, i = nxt["c"][0]["c"], i + 1
        else:
            PROBLEMS.append(f"{self.sec['id']}: figure {path} has no caption")
        self.sec["blocks"].append({"t": "figure", "src": self.book.figures.note(path), "path": path, "alt": alt,
                                   "caption": inline_html(cap)})
        if keep:
            self.group = {"label": "", "role": keep["role"], "blocks": []}
        return i + 1

    def checkpoint(self, text, blocks, i):
        cid = text.split()[1]
        questions, note = [], None
        j = i + 1
        if j < len(blocks) and blocks[j]["t"] == "OrderedList":
            questions = blocks[j]["c"][1]
            j += 1
        else:
            PROBLEMS.append(f"{self.sec['id']}: {text} has no list of questions")
        if j < len(blocks) and blocks[j]["t"] == "Para" and plain(blocks[j]["c"]).startswith("(Answers in the Appendix"):
            note, j = blocks[j]["c"], j + 1
        ans = self.answers.get(cid)
        if ans is None or len(ans) != len(questions):
            PROBLEMS.append(f"{self.sec['id']}: {text} has {len(questions)} questions and {0 if ans is None else len(ans)} answers")
            ans = [{"a": []} for _ in questions]
        out = []
        for q, a in zip(questions, ans):
            self.cp_n += 1
            out.append({"n": self.cp_n, "prompt": frag(q), "answer": frag(a["a"])})
        self.sec["blocks"].append({"t": "checkpoint", "id": cid, "label": text, "questions": out,
                                   "note": inline_html(note) if note else ""})
        return j


# ---------------------------------------------------------------- the whole book

def build_book(src, figures):
    front_md, main_md, app_a_md, app_b_md, refs_md = load_build(src)
    answers = read_answers(src)
    book = Book(figures)

    # Front matter: "## Introduction" with its ### sections.
    intro = book.part("front", "Introduction")
    cut, buf, roman = None, [], 0
    for b in md_to_ast(front_md):
        if b["t"] == "Header" and b["c"][0] == 2:
            continue
        if b["t"] == "Header" and b["c"][0] == 3:
            if cut:
                cut.feed(buf)
            buf, roman = [], roman + 1
            title = plain(b["c"][2])
            sec = new_section(intro, "front-" + re.sub(r"[^a-z]+", "-", title.lower()).strip("-")[:30],
                              "i ii iii iv v vi vii".split()[roman - 1], b["c"][2], title)
            cut = Cutter(book, answers)
            cut.sec = sec
            continue
        if cut is None:
            PROBLEMS.append("front matter: text before the first ### heading")
            continue
        buf.append(b)
    cut.feed(buf)

    # Chapters.
    chapter, cut, buf, chap_no = None, None, [], 0
    for b in md_to_ast(main_md):
        if b["t"] == "Header" and b["c"][0] == 1:
            if cut:
                cut.feed(buf)
            buf = []
            m = re.fullmatch(r"Chapter (\d+): (.+)", plain(b["c"][2]).strip())
            if not m:
                PROBLEMS.append(f"unexpected H1: {plain(b['c'][2])}")
                continue
            chap_no = int(m.group(1))
            chapter = book.part(str(chap_no), plain(b["c"][2]).strip())
            # The chapter's opening text has no heading of its own; the reader needs one to list and number it.
            sec = new_section(chapter, f"c{chap_no:02d}", str(chap_no), None, "Overview")
            cut = Cutter(book, answers)
            cut.sec = sec
            book.numbers.add(str(chap_no))
            book.sec_of[str(chap_no)] = sec["id"]
            continue
        if b["t"] == "Header" and b["c"][0] == 2:
            cut.feed(buf)
            buf = []
            num, title = split_number(b["c"][2])
            mm = re.fullmatch(r"(\d+)\.(\d+)", num or "")
            if not mm or int(mm.group(1)) != chap_no:
                PROBLEMS.append(f"chapter {chap_no}: unexpected H2 {plain(b['c'][2])}")
                continue
            sec = new_section(chapter, f"c{chap_no:02d}-s{int(mm.group(2)):02d}", num, title, plain(title))
            cut.sec = sec
            book.numbers.add(num)
            book.sec_of[num] = sec["id"]
            continue
        buf.append(b)
    cut.feed(buf)

    # Appendix A: one section per chapter, from answers/ (build.py's own assembly).
    part = book.part("A", "Appendix A: Checkpoint Answers")
    sec = new_section(part, "appa", "A", None, "Checkpoint Answers")
    cut, buf = Cutter(book, {}), []
    cut.sec = sec
    for b in md_to_ast(app_a_md):
        if b["t"] == "Header" and b["c"][0] == 1:
            continue
        if b["t"] == "Header" and b["c"][0] == 2:
            cut.feed(buf)
            buf = []
            m = re.fullmatch(r"Chapter (\d+): (.+)", plain(b["c"][2]).strip())
            sec = new_section(part, f"appa-{int(m.group(1)):02d}", f"A{int(m.group(1))}", None, plain(b["c"][2]).strip())
            cut.sec = sec
            continue
        buf.append(b)
    cut.feed(buf)
    # Appendix B and References: one section each.
    for pid, title, label, sid, md in (("B", "Appendix B: R Quick Reference", "B", "appb", app_b_md),
                                       ("R", "References", "R", "refs", refs_md)):
        part = book.part(pid, title)
        sec = new_section(part, sid, label, None, title.split(": ")[-1])
        cut = Cutter(book, {})
        cut.sec = sec
        cut.feed([b for b in md_to_ast(md) if not (b["t"] == "Header" and b["c"][0] == 1)])
    return book


# ---------------------------------------------------------------- resolve html, cross-references, checks

XREF = re.compile(r"§(\d+(?:\.\d+)*)")
SKIP = {"a", "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "button"}


def link_xrefs(h, book, where):
    """§4.5.6 becomes a link to the section that holds it; the reader scrolls on to the heading."""
    out, stack = [], []
    for tok in re.split(r"(<[^>]+>)", h):
        if tok.startswith("<"):
            m = re.match(r"<(/?)(\w+)", tok)
            if m and not tok.endswith("/>") and m.group(2) not in ("br", "img", "hr", "col"):
                if m.group(1):
                    if stack:
                        stack.pop()
                else:
                    stack.append(m.group(2) in SKIP)
            out.append(tok)
            continue
        if any(stack):
            out.append(tok)
            continue

        def rep(m):
            num = m.group(1)
            parts = num.split(".")
            key = ".".join(parts[:2]) if len(parts) > 1 else parts[0]
            if num not in book.numbers and key not in book.sec_of:
                PROBLEMS.append(f"{where}: § reference to {num} matches no heading")
                return m.group(0)
            if num not in book.numbers:
                PROBLEMS.append(f"{where}: § reference to {num} matches no heading")
            sid = book.sec_of.get(key) or book.sec_of.get(parts[0])
            return f'<a class="xref" href="#{sid}" data-sec="{sid}" data-num="{num}">§{num}</a>'
        out.append(XREF.sub(rep, tok))
    return "".join(out)


def words(h):
    return len(re.findall(r"[A-Za-z0-9][\w'’.-]*", _html.unescape(re.sub(r"<[^>]+>", " ", h))))


def leak_check(where, h):
    code_free = re.sub(r"<code\b[^>]*>.*?</code>", "", re.sub(r"<pre\b[^>]*>.*?</pre>", "", h, flags=re.S), flags=re.S)
    text = _html.unescape(re.sub(r"<[^>]+>", "", code_free))
    # The book writes powers as plain text, e^(−λ), and says so in its front matter, so a caret is the book's own
    # notation here (the obesity series treats it as a leak). What would be a fault is pandoc turning one into a
    # superscript: those are listed below.
    for m in re.finditer(r"[\^~]", text):
        CARETS[m.group(0)] += 1
    for m in re.finditer(r"<su[bp]>[^<]*</su[bp]>", h):
        PROBLEMS.append(f"{where}: pandoc made a sub/superscript: {m.group(0)[:60]} (the book writes these as plain text)")
    for p in sorted(set(re.findall(r"(?<![/\w.])(?:src|answers|refs|figs|media0|tools)/[\w./-]+", text))):
        PROBLEMS.append(f"{where}: source path reached the page: {p}")


def resolve(obj, rendered):
    if isinstance(obj, dict):
        if set(obj) == {"_h"}:
            return rendered[obj["_h"]]
        return {k: resolve(v, rendered) for k, v in obj.items()}
    if isinstance(obj, list):
        return [resolve(v, rendered) for v in obj]
    return obj


def finish(book, sizes):
    rendered = render_frags()
    outline, sections = [], []
    for part in book.parts:
        o = {"id": part["id"], "title": part["title"], "sections": []}
        for s in part["sections"]:
            s = resolve(s, rendered)
            for b in s["blocks"]:
                if b["t"] == "figure":
                    w, h = sizes.get(b.pop("path"), (0, 0))
                    b["w"], b["h"] = w, h
            # Cross-references and checks run on every piece of HTML in the section.
            n_words, n_q = 0, 0

            def walk(x):
                nonlocal n_words
                if isinstance(x, dict):
                    for k, v in list(x.items()):
                        if k in ("html", "prompt", "answer", "caption", "note") and isinstance(v, str):
                            # The References cite other books' sections (NIST §1.3.5.7), not this book's.
                            x[k] = v if s["id"] == "refs" else link_xrefs(v, book, s["id"])
                            leak_check(s["id"], x[k])
                            n_words += words(x[k])
                        else:
                            walk(v)
                elif isinstance(x, list):
                    for v in x:
                        walk(v)
            walk(s["blocks"])
            n_q = sum(len(b["questions"]) for b in s["blocks"] if b["t"] == "checkpoint")
            s["blocks"] = [b for b in s["blocks"]]
            o["sections"].append({"id": s["id"], "label": s["label"], "title": s["title"], "words": n_words, "practice": n_q})
            sections.append(s)
        outline.append(o)
    return outline, sections


def meta_book(outline, total_words, landing):
    return {
        "format": FORMAT, "id": BOOK_ID, "slug": SLUG, "url": READ_URL, "series": "", "number": 0,
        "title": TITLE, "subtitle": SUBTITLE, "hue": 258,
        "colours": {"ink": "#3f2194", "accent": "#5b35c8", "accent2": "#b8378f", "tint": "#f4f0fd", "tint2": "#e6dcfa", "rule": "#cfc0f2"},
        "version": VERSION, "date": DATE, "author": AUTHOR, "licence": LICENCE, "pdf": PDF, "figureBase": FIGURE_BASE,
        "about": {"why": landing["why"], "howToRead": "", "prerequisites": None},
        "blurb": landing["blurb"], "requires": [], "words": total_words,
        "outline": outline, "references": [], "glossary": [],
    }


def landing_text(site_root):
    """The book's page text (src/content/books/<slug>.md), which is Harsh's own description of the book."""
    path = os.path.join(site_root, "src", "content", "books", f"{SLUG}.md")
    raw = open(path, encoding="utf-8").read()
    body = raw.split("---", 2)[2].strip()
    paras = [p.strip() for p in body.split("\n\n") if p.strip() and not p.startswith("#") and not p.startswith("-")]
    desc = re.search(r'^description: "(.*)"$', raw, re.M).group(1)
    return {"why": "".join(f"<p>{_html.escape(p)}</p>" for p in paras[:2]), "blurb": desc}


# ---------------------------------------------------------------- datasets (the In R boxes read data/<file>.csv)

DATA_URL = f"/doctors/books/{SLUG}/data/"
DATA_README = """Datasets for "Statistics: From First Principles to Regression" (version 3.1)
Dr. Harsh Maheshwari - drharshmaheshwari.com

These are SYNTHETIC teaching data. No row describes a real person, child, woman, household, village or
district; names such as "District A", "PHC Urban" and every ID are invented.

How to use them
  Unzip so that the folder `data` sits in your R working directory. Then the book's code works as printed:
      cl <- read.csv("data/clinic_children.csv")
  Empty cells are missing values (NA in R). The files have no comment lines.

What is here
  *.csv          the datasets the In R boxes read (each book section that uses one is listed on the datasets page)
  make_data.R    the script that built them, with a fixed seed for every dataset. From the folder that holds
                 `data`, run: Rscript data/make_data.R (about 3 minutes; needs the survival package).
                 It writes every file except paired_hb_ifa.csv, a ten-row table typed by hand.
                 Several datasets are engineered so that a named model reproduces the book's printed numbers;
                 the script's header explains how.

Licence
  CC BY-NC-SA 4.0, the same as the book: free to copy, share and adapt for non-commercial use, with credit,
  under the same licence. https://creativecommons.org/licenses/by-nc-sa/4.0/
"""


def datasets(src, sections, public_dir):
    """Copies data/*.csv, make_data.R and a README to the site's public folder, zips them, and returns the list for
    the datasets page: file, rows, columns, and the book sections whose R code reads it."""
    import csv
    out = []
    data = os.path.join(src, "data")
    os.makedirs(public_dir, exist_ok=True)
    for f in sorted(os.listdir(public_dir)):
        os.remove(os.path.join(public_dir, f))
    code = {}   # file -> sections
    for sec in sections:
        for b in sec["blocks"]:
            if b["t"] == "prose" and b["role"] == "r":
                for name in set(re.findall(r"data/([\w.-]+\.csv)", _html.unescape(re.sub(r"<[^>]+>", "", b["html"])))):
                    code.setdefault(name, [])
                    if sec["id"] not in [x["id"] for x in code[name]]:
                        code[name].append({"id": sec["id"], "label": sec["label"], "title": re.sub(r"<[^>]+>", "", sec["title"])})
    for f in sorted(os.listdir(data)):
        if not f.endswith(".csv"):
            continue
        with open(os.path.join(data, f), encoding="utf-8", newline="") as fh:
            rows = list(csv.reader(fh))
        out.append({"file": f, "rows": len(rows) - 1, "columns": rows[0], "sections": code.get(f, [])})
        shutil.copyfile(os.path.join(data, f), os.path.join(public_dir, f))
    for name in code:
        if not any(d["file"] == name for d in out):
            PROBLEMS.append(f"the book's R code reads data/{name}, which is not in the source's data folder")
    # A dataset no In R box reads is worked by hand in the book; data/README.md says where.
    readme = {m.group(1): m.group(2).strip() for m in re.finditer(r"^\| `([\w.-]+\.csv)` \| ([^|]+) \|", open(os.path.join(data, "README.md"), encoding="utf-8").read(), re.M)}
    for d in out:
        if not d["sections"]:
            d["note"] = readme.get(d["file"], "")
            if not d["note"]:
                PROBLEMS.append(f"data/{d['file']} is not read by any In R box and README.md does not say where it is used")
    shutil.copyfile(os.path.join(data, "make_data.R"), os.path.join(public_dir, "make_data.R"))
    with open(os.path.join(public_dir, "README.txt"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(DATA_README)
    # A fixed timestamp makes the zip identical each time it is built from the same files.
    with zipfile.ZipFile(os.path.join(public_dir, "statsbook-datasets.zip"), "w", zipfile.ZIP_DEFLATED) as z:
        for f in ["README.txt", "make_data.R"] + [d["file"] for d in out]:
            info = zipfile.ZipInfo(f"data/{f}", date_time=(2026, 9, 28, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            with open(os.path.join(public_dir, f), "rb") as fh:
                z.writestr(info, fh.read())
    return out


# ---------------------------------------------------------------- compare with the released Word file

def compare_docx(docx, book, sections):
    """The book's words as exported against the released Word file, in order. List numerals are left out (the
    reader draws its own); the Word file's table-of-contents placeholder is the one known difference."""
    p = subprocess.run([PANDOC, "-f", "docx", "-t", "plain", "--wrap=none", docx], capture_output=True, text=True, check=True)
    tok = lambda t: [w for w in re.findall(r"[^\W_]+(?:[.'’][^\W_]+)*", t.lower()) if not w.isdigit()]
    part_title = {p["id"]: p["title"] for p in book.parts}
    ours = []

    def walk(x, keys):
        if isinstance(x, dict):
            for k, v in x.items():
                if isinstance(v, str) and k in keys:
                    ours.append(_html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"</?(?:strong|em|a|code|span|sub|sup)\b[^>]*>", "", v))))
                else:
                    walk(v, keys)
        elif isinstance(x, list):
            for v in x:
                walk(v, keys)
    for s in sections:
        if re.fullmatch(r"c\d\d", s["id"]) or s["id"] in ("appa", "appb", "refs"):
            ours.append(part_title[s["part"]])                      # the chapter's or appendix's own heading
        if re.fullmatch(r"c\d\d", s["id"]):
            s = {**s, "title": ""}                                  # "Overview" is the reader's, not the book's
        # A checkpoint's answer sits beside its question here and again in Appendix A; the book prints it once.
        # A section's own label is a number (4.2) or, in the front matter and appendices, a marker of ours.
        keys = ("html", "prompt", "caption", "note", "title", "alt", "num") + (("answer",) if s["part"] == "A" else ())
        walk({k: v for k, v in s.items() if k != "label" and not (k == "title" and re.fullmatch(r"c\d\d", s["id"]))}
             | ({"label": s["label"]} if re.fullmatch(r"[\d.]+", s["label"]) else {}), keys)
        walk([b for b in s["blocks"] if b["t"] in ("prose", "mustknow", "checkpoint")], ("label",))
    theirs, mine = tok(p.stdout), tok(" ".join(ours))
    tc, mc = collections.Counter(theirs), collections.Counter(mine)
    diff = {k: (tc[k], mc[k]) for k in set(tc) | set(mc) if tc[k] != mc[k]}
    total = sum(abs(a - b) for a, b in diff.values())
    print(f"compared with the Word file: {len(theirs)} words there, {len(mine)} here; "
          f"{len(diff)} distinct words differ by {total} in all")
    for k, (a, b) in sorted(diff.items(), key=lambda kv: -abs(kv[1][0] - kv[1][1]))[:12]:
        print(f"    {k:18} Word file {a:5}   here {b:5}")
    return total


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="the unzipped statsbook source folder (src/, answers/, refs/, tools/)")
    ap.add_argument("--out", required=True, help="the website's src/data/books/<slug> folder")
    ap.add_argument("--figures-out", required=True, help="folder to fill with figures, for upload to R2")
    ap.add_argument("--docx", help="the released Word file: used for figures missing from --src, and to compare the words")
    ap.add_argument("--site", default=os.getcwd(), help="the website repository (for the book's page text and its public/ folder)")
    args = ap.parse_args()

    figures = Figures(args.src, args.docx)
    book = build_book(args.src, figures)
    sizes, from_docx = figures.export(args.figures_out)
    outline, sections = finish(book, sizes)
    total = sum(s["words"] for p in outline for s in p["sections"])
    sets = datasets(args.src, sections, os.path.join(args.site, "public", "doctors", "books", SLUG, "data"))

    if args.docx:
        compare_docx(args.docx, book, sections)
    print(f"literal carets in prose: {CARETS['^']}, tildes: {CARETS['~']} (the book's own notation)")
    for n in NOTES[:20]:
        print("note:", n)
    if len(NOTES) > 20:
        print(f"note: ... and {len(NOTES) - 20} more")
    if PROBLEMS:
        print("\nTHE EXPORT STOPPED:")
        for p in PROBLEMS[:60]:
            print("  -", p)
        sys.exit(1)

    shutil.rmtree(args.out, ignore_errors=True)
    os.makedirs(os.path.join(args.out, "sections"))
    for s in sections:
        with open(os.path.join(args.out, "sections", f"{s['id']}.json"), "w", encoding="utf-8") as fh:
            json.dump(s, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(args.out, "datasets.json"), "w", encoding="utf-8") as fh:
        json.dump(sets, fh, ensure_ascii=False, indent=1)
    with open(os.path.join(args.out, "book.json"), "w", encoding="utf-8") as fh:
        json.dump(meta_book(outline, total, landing_text(args.site)), fh, ensure_ascii=False, indent=1)
    print(f"{len(sections)} sections, {total} words, {len(sizes)} figures ({from_docx} taken from the Word file) -> {args.out}; {len(sets)} datasets -> public/doctors/books/{SLUG}/data/")


if __name__ == "__main__":
    main()
