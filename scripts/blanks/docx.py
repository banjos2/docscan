"""A customer's Word blank: look at a filled sample with its values masked, turn it into a clean blank with markers,
make the two passes make-form converts to PDF. Standard library only; run with -I so nothing next to a sample is imported.

  python3 -I scripts/blanks/docx.py dump <in.docx>
  python3 -I scripts/blanks/docx.py apply <in.docx> <edits.json> <out.docx> --removed <removed.txt>
  python3 -I scripts/blanks/docx.py passes <clean.docx> <a.docx> <b.docx>
    (prints "word pages N" from docProps/app.xml and "markers [...]", the markers written, as JSON)

edits.json: {"edits": [{"part": "word/document.xml", "p": 12, "r": [3, 4], "replace": "{{surname:180x12}}"},
                       {"p": 13, "r": [2], "clear": true}, {"p": 20, "r": [1], "box": "sex.F"},
                       {"p": 30, "add": "{{tick}}", "at": "start"}, {"p": 41, "para": "{{org:380x30}}"},
                       {"p": 50, "r": [7], "add": "{{sponsorWho:140x11}}", "after": "(specify)"},
                       {"p": 50, "ind": {"right": 2794}}, {"p": 60, "spacing": {"lineRule": "atLeast"}},
                       {"p": 70, "r": [0], "checkbox": "sex.M"}, {"p": 71, "r": [0], "checkbox": "", "size": 16},
                       {"p": 80, "row": {"val": 1009}}],
             "media": ["word/media/image2.jpeg"], "pages": 4}
p and r are the paragraph and run numbers dump prints; "part" defaults to word/document.xml. One kind per edit.
replace: the runs' text goes, the first run holds the marker in its own format. clear: the runs lose text, field codes
and drawings (a tick drawn over a box), keep tabs and breaks. box: the run's box glyph gets the marker right after it;
a run with several boxes takes a list, "box": ["q.no", "q.yes"], one marker per box in order ("" for a box left out).
add: a marker run at the start or the end of a paragraph that has no value; with "r" and "after", inside that run right
after the text "after" (a label and the next heading printed in one run); with "r" alone, at the start or the end but in
that run's format (a box a conversion lost: "add": "□" before its marker, set like the label's words). para: a
paragraph of its own right after the label's, for a field below a label that has no empty line under it. ind: the
paragraph's w:ind attributes (left, right, start, end, firstLine, hanging) in twips, a little more room for a line full
to its indent whose last word the markers of pass A would push to the next line (B must keep its breaks: check the
render), or a restored box moved off its column's rule. spacing: its
w:spacing attributes (before, after, line in twips; lineRule auto, exact or atLeast), atLeast for an exact line
height lower than its text, which the converter clips at the top. row: the w:trHeight attributes (val in twips, above 0;
hRule) of the table row p is in, for a field that needs a second line in an exact row (take the room from a
neighbouring row, above or below, with empty space, so no other row moves). bullet: {"position": 0} for the list level of the
paragraph p whose marker has a w:position of its own, which the converter draws as a tiny superscript box (the level
is shared: every paragraph of that list changes). checkbox: r is the begin run of a legacy check-box field ([chk]); the
whole field goes, checked state and all, and a text ☐ in that run's font and size (no bold, spacing or scale; "size" in
half-points sets another) takes its place, the marker right after it ("" for none). apply stops while a legacy check-box field is left; dump counts the checked ones, never says which.
media: images to drop with their drawings.
pages: only for a sample whose docProps/app.xml has no <Pages> (Word never saved it): the page count for make-form.
apply also blanks every author and initials, and refuses a sample with comments, people.xml or a glossary.
After any change here: python3 -I scripts/blanks/docx-selfcheck.py
"""
import json
import re
import struct
import sys
import unicodedata
import zipfile
from xml.dom import minidom

# The parts whose paragraphs a reader sees.
STORY = re.compile(r"word/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$")
# Box glyphs as text, and the Wingdings / Wingdings 2 codes of boxes as w:sym.
BOX_CHARS = set("☐☑☒□■▢▣◻◼❏❐❑❒⬜\uf0a8\uf06f\uf0fe\uf0fd\uf078\uf0a3")
BOX_SYMS = {"F0A8", "F06F", "F0FE", "F0FD", "F078", "F0A3", "F0A2", "F071", "F072"}
MARKER = re.compile(r"\{\{[^{}]+\}\}")
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
# Comments, the people who wrote them and a glossary's building blocks: apply doesn't clean them, so it refuses a
# sample that has them (delete them in Word and save it again).
REFUSED = re.compile(r"word/(comments\w*\.xml|people\.xml|glossary/)")


def refused(names):
    return [n for n in names if REFUSED.match(n)]


def elements(node, name=None):
    return [c for c in node.childNodes if c.nodeType == c.ELEMENT_NODE and (name is None or c.nodeName == name)]


def text_of(el):
    return "".join(n.data for n in el.childNodes if n.nodeType == n.TEXT_NODE)


def owner(node, name="w:p"):
    n = node.parentNode
    while n is not None and n.nodeName != name:
        n = n.parentNode
    return n


def paragraphs(doc):
    return doc.getElementsByTagName("w:p")


# A paragraph's own runs: those whose nearest paragraph is this one (a text box's runs belong to its own paragraphs).
def runs(p):
    return [r for r in p.getElementsByTagName("w:r") if owner(r) is p]


def is_box_sym(el):
    return (el.getAttribute("w:char") or "").upper() in BOX_SYMS


def pt(emu):
    return f"{int(emu) / 12700:.0f}"


# A drawing as dump shows it: a picture by its file, a shape by its geometry, with its size and whether it floats.
def drawing(el, rels):
    ext = el.getElementsByTagName("wp:extent")
    size = f" {pt(ext[0].getAttribute('cx'))}x{pt(ext[0].getAttribute('cy'))}pt" if ext else ""
    size += " anchored" if el.getElementsByTagName("wp:anchor") else ""
    # A VML fallback's <v:imagedata o:title=""/> is part of a shape's fill, not a picture.
    ids = [i for b in el.getElementsByTagName("a:blip") + el.getElementsByTagName("v:imagedata") if (i := b.getAttribute("r:embed") or b.getAttribute("r:id") or b.getAttribute("r:link"))]
    text = " +text" if el.getElementsByTagName("w:txbxContent") else ""
    if ids:
        return f"[image {','.join(sorted({shown_target(rels[i]) if i in rels else '?' for i in ids}))}{size}{text}]"
    geo = [g.getAttribute("prst") for g in el.getElementsByTagName("a:prstGeom")] or [g.nodeName for g in el.getElementsByTagName("*") if g.nodeName in ("v:rect", "v:oval", "v:line", "v:shape", "v:roundrect")]
    return f"[shape {','.join(sorted(set(geo))) or '?'}{size}{text}]"


def box_tag(c):
    return f"[{c}]" if c in "☐□" else f"[box {ord(c):04X}]"


# A relationship's target as dump shows it: a file outside the package (a linked picture, a link) is a path or an
# address someone typed, so every letter and digit of it is masked.
def shown_target(rel):
    t = rel.getAttribute("Target")
    if rel.getAttribute("TargetMode") != "External":
        return mask(t)
    scheme = re.match(r"[a-z]+:", t)
    return (scheme.group() if scheme else "") + "".join(shape_char(c) for c in t[len(scheme.group()) if scheme else 0:])


# A run as pieces: ("text", s) the reader sees, ("tag", label) for a box, symbol or drawing, which ends a word, and
# ("note", label) for a link, field or deletion, which doesn't: a value split over two such runs is still one word.
def pieces(run, rels=None):
    out = []
    if owner(run, "w:hyperlink") is not None:
        out.append(("note", "[link]"))
    for el in elements(run):
        n = el.nodeName
        if n in ("w:t", "w:delText", "w:instrText"):
            if n != "w:t":
                out.append(("note", "[del]" if n == "w:delText" else "[instr]"))
            for c in text_of(el):
                out.append(("tag", box_tag(c)) if c in BOX_CHARS else ("text", c))
        elif n == "w:tab":
            out.append(("text", "\t"))
        elif n in ("w:br", "w:cr"):
            out.append(("text", "\n"))
        elif n == "w:noBreakHyphen":
            out.append(("text", "-"))
        elif n == "w:sym":
            out.append(("tag", f"[{'☐ ' if is_box_sym(el) else ''}sym {el.getAttribute('w:font')} {el.getAttribute('w:char')}]"))
        elif n in ("w:drawing", "w:pict", "w:object", "mc:AlternateContent"):
            out.append(("tag", drawing(el, rels or {})))
        elif n == "w:fldChar":
            out.append(("note", "[chk]" if el.getElementsByTagName("w:checkBox") else "[fld]"))
    return out


# The run's text with its box glyphs; a box drawn as a symbol reads as ☐.
def run_text(run):
    return "".join(s if k == "text" else (s[1] if s in ("[☐]", "[□]") else "☐" if s.startswith(("[box", "[☐")) else "") for k, s in pieces(run))


def shape_char(c):
    if c.isdigit():
        return "9"
    if not c.isalpha():
        return c
    cyr = "CYRILLIC" in unicodedata.name(c, "")
    return ("Б" if cyr else "A") if c.isupper() else ("б" if cyr else "a")


def sensitive(word):
    return "@" in word or re.search(r"\d{3,}", word) or any(a.isupper() and b.isupper() for a, b in zip(word, word[1:]))


# Masks the paragraph's text as a whole before it is cut back into runs: a value split over runs is one word.
def masked_runs(run_pieces):
    width = {"text": len, "tag": lambda s: 1, "note": lambda s: 0}
    joined = "".join(s if k == "text" else "\0" * width[k](s) for rp in run_pieces for k, s in rp)
    chars = list(joined)
    # Our markers are neither masked nor part of the word next to them.
    words = MARKER.sub(lambda m: "\0" * len(m.group()), joined)
    for m in re.finditer(r"[^\s\0]+", words):
        if sensitive(m.group()):
            chars[m.start():m.end()] = [shape_char(c) for c in m.group()]
    out, i = [], 0
    for rp in run_pieces:
        s = ""
        for k, piece in rp:
            s += "".join(chars[i:i + len(piece)]) if k == "text" else piece
            i += width[k](piece)
        out.append(s.replace("\t", "\\t").replace("\n", "\\n"))
    return out


def mask(text):
    return masked_runs([[("text", text)]])[0]


def where(p, tables):
    tc = owner(p, "w:tc")
    if tc is None:
        return ""
    tr, tbl = owner(tc, "w:tr"), owner(tc, "w:tbl")
    return f" [t{tables.index(tbl)} r{elements(tbl, 'w:tr').index(tr)} c{elements(tr, 'w:tc').index(tc)}]"


# The list level a paragraph's own numbering points at, None for a paragraph that isn't in a list; in doc, the parsed
# numbering apply edits, if given.
def levels(z, doc=None):
    if "word/numbering.xml" not in z.namelist():
        return lambda p: None
    doc = doc or minidom.parseString(z.read("word/numbering.xml"))
    abstract = {a.getAttribute("w:abstractNumId"): a for a in doc.getElementsByTagName("w:abstractNum")}
    nums = {n.getAttribute("w:numId"): elements(n, "w:abstractNumId")[0].getAttribute("w:val") for n in doc.getElementsByTagName("w:num")}

    def level(p):
        ppr = elements(p, "w:pPr")
        num = elements(ppr[0], "w:numPr") if ppr else []
        if not num:
            return None
        num_id, ilvl = elements(num[0], "w:numId"), elements(num[0], "w:ilvl")
        a = abstract.get(nums.get(num_id[0].getAttribute("w:val") if num_id else ""))
        lvl = [l for l in (elements(a, "w:lvl") if a else []) if l.getAttribute("w:ilvl") == (ilvl[0].getAttribute("w:val") if ilvl else "0")]
        return lvl[0] if lvl else None

    return level


def list_label(lvl):
    if lvl is None:
        return ""
    fmt = elements(lvl, "w:numFmt")
    if not fmt or fmt[0].getAttribute("w:val") != "bullet":
        return "[num]"
    fonts = lvl.getElementsByTagName("w:rFonts")
    font = fonts[0].getAttribute("w:ascii") if fonts else ""
    text = elements(lvl, "w:lvlText")
    glyph = text[0].getAttribute("w:val") if text else ""
    return f"[bullet {font} {' '.join(f'{ord(c):04X}' for c in glyph)}]"


def rels_of(z, part):
    path = re.sub(r"([^/]+)$", r"_rels/\1.rels", part)
    if path not in z.namelist():
        return {}, path
    doc = minidom.parseString(z.read(path))
    return {r.getAttribute("Id"): r for r in doc.getElementsByTagName("Relationship")}, path


def target_path(part, target):
    if target.startswith("/"):
        return target[1:]
    parts = part.split("/")[:-1]
    for seg in target.split("/"):
        if seg == "..":
            parts.pop()
        elif seg != ".":
            parts.append(seg)
    return "/".join(parts)


def pixels(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return struct.unpack("<HH", data[6:10])
    if data[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(data):
            marker, size = data[i + 1], struct.unpack(">H", data[i + 2:i + 4])[0]
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            i += 2 + size
    return None


# Each drawing, VML image or embedded object that refers to an image, with the image's part name.
def image_uses(z, part, doc):
    rels, _ = rels_of(z, part)
    for el in doc.getElementsByTagName("a:blip") + doc.getElementsByTagName("v:imagedata"):
        rid = el.getAttribute("r:embed") or el.getAttribute("r:id") or el.getAttribute("r:link")
        rel = rels.get(rid)
        if rel is not None and rel.getAttribute("TargetMode") != "External":
            yield el, rid, target_path(part, rel.getAttribute("Target"))


# A legacy box's state: w:checked, else w:default; an on/off without w:val is on.
def is_checked(box):
    state = elements(box, "w:checked") or elements(box, "w:default")
    return bool(state) and state[0].getAttribute("w:val") not in ("0", "false", "off")


def dump(path):
    z = zipfile.ZipFile(path)
    level = levels(z)
    names = z.namelist()
    uses = {}
    counts = {}
    for part in sorted(n for n in names if STORY.match(n)):
        doc = minidom.parseString(z.read(part))
        tables = list(doc.getElementsByTagName("w:tbl"))
        ps = list(paragraphs(doc))
        rels, _ = rels_of(z, part)
        print(f"== {part}")
        for i, p in enumerate(ps):
            texts = masked_runs([pieces(r, rels) for r in runs(p)])
            print(f"p{i}{where(p, tables)}: {list_label(level(p))}" + "".join(f"[r{j}]{t}" for j, t in enumerate(texts) if t))
        for el, rid, target in image_uses(z, part, doc):
            ext = owner(el, "wp:inline") or owner(el, "wp:anchor")
            size = ""
            if ext is not None and ext.getElementsByTagName("wp:extent"):
                e = ext.getElementsByTagName("wp:extent")[0]
                size = f", {int(e.getAttribute('cx')) / 12700:.0f}x{int(e.getAttribute('cy')) / 12700:.0f} pt{' anchored' if ext.nodeName == 'wp:anchor' else ''}"
            p = owner(el)
            uses.setdefault(target, []).append(f"{part} p{ps.index(p) if p in ps else '?'}{size}")
        for rid, rel in rels.items():
            if rel.getAttribute("TargetMode") == "External":
                print(f"   external link {rid}: {shown_target(rel)}")
        for tag in ("w:ins", "w:del", "w:instrText", "w:fldSimple", "w:hyperlink", "mc:AlternateContent", "w:sdt", "w:ffData", "w:txbxContent"):
            counts[tag] = counts.get(tag, 0) + len(doc.getElementsByTagName(tag))
        # Which legacy boxes are checked is the client's choice: only how many.
        counts["checked"] = counts.get("checked", 0) + sum(map(is_checked, doc.getElementsByTagName("w:checkBox")))
    print("== images")
    for n in names:
        if re.search(r"\.(png|jpe?g|gif|bmp|tiff?|emf|wmf|svg)$", n, re.I):
            data = z.read(n)
            px = pixels(data)
            print(f"{n}: {len(data)} bytes, {f'{px[0]}x{px[1]} px' if px else '? px'}, used: {'; '.join(uses.get(n, [])) or 'nowhere in the story parts'}")
    print("== parts: " + " ".join(names))
    if refused(names):
        print("== apply refuses: " + " ".join(refused(names)))
    # Names and initials of whoever made a tracked change: apply blanks them.
    counts["author"] = sum(len(re.findall(rb':(?:author|initials)=', z.read(n))) for n in names if n.endswith((".xml", ".rels")))
    print("== counts: " + " ".join(f"{k}={v}" for k, v in counts.items()))
    if "word/settings.xml" in names:
        s = minidom.parseString(z.read("word/settings.xml"))
        print(f"== settings: docVar={len(s.getElementsByTagName('w:docVar'))} attachedTemplate={len(s.getElementsByTagName('w:attachedTemplate'))}")


def set_text(run, text):
    for el in elements(run):
        if el.nodeName != "w:rPr":
            run.removeChild(el)
    doc = run.ownerDocument
    for piece in re.split(r"([\t\n])", text):
        if piece in ("\t", "\n"):
            run.appendChild(doc.createElementNS(W, "w:tab" if piece == "\t" else "w:br"))
        elif piece:
            t = run.appendChild(doc.createElementNS(W, "w:t"))
            t.setAttribute("xml:space", "preserve")
            t.appendChild(doc.createTextNode(piece))


def clone_with(run, text):
    r = run.cloneNode(True)
    set_text(r, text)
    return r


# The attributes the ind, spacing (w:pPr) and row (w:trHeight) edits may set; anything else would write an invalid one.
PPR_ATTRS = {"ind": ("left", "right", "start", "end", "firstLine", "hanging"), "spacing": ("before", "after", "line", "lineRule"),
             "row": ("val", "hRule")}
LINE_RULES = ("auto", "exact", "atLeast")
# The edit kinds, one per edit; "after", "at", "size", "part", "p" and "r" go with them.
EDIT_KINDS = ("replace", "clear", "ind", "spacing", "row", "bullet", "add", "para", "checkbox", "box")


def one_run(e, part, rs):
    if len(rs) != 1:
        sys.exit(f"{part} p{e['p']} r{e.get('r', [])}: one run for this edit, \"r\": [n]")
    return rs[0]


def apply(src, edits_path, dst, removed_path):
    z = zipfile.ZipFile(src)
    if refused(z.namelist()):
        sys.exit(f"{src}: {', '.join(refused(z.namelist()))}: apply doesn't clean comments, their authors or a glossary;"
                 " delete them in Word (Review > Delete all comments) and save the sample again")
    spec = json.load(open(edits_path, encoding="utf-8"))
    removed = []
    docs = {}

    def doc_of(part):
        if part not in docs:
            docs[part] = minidom.parseString(z.read(part))
        return docs[part]

    def erase(text):
        text = " ".join(text.split())
        if text:
            removed.append(text)
            removed.extend(w for w in text.split() if len(w) >= 3 and sensitive(w))

    # Every edit finds its runs by the numbers dump printed before anything moves.
    resolved = []
    for e in spec.get("edits", []):
        part = e.get("part", "word/document.xml")
        # One kind each: apply would carry out the first and drop the rest without a word.
        kinds = [k for k in EDIT_KINDS if k in e]
        if len(kinds) > 1:
            sys.exit(f"{part} p{e.get('p')}: one kind per edit, not {' and '.join(kinds)}")
        ps = list(paragraphs(doc_of(part)))
        rs = runs(ps[e["p"]])
        resolved.append((e, part, ps[e["p"]], [rs[i] for i in e.get("r", [])]))
    links = {}
    for e, part, p, rs in resolved:
        # A link around a value points at it too (mailto:): the runs leave the link, the link and its target go.
        for r in rs:
            h = owner(r, "w:hyperlink")
            if h is not None and h.parentNode is not None:
                links.setdefault(part, set()).add(h.getAttribute("r:id"))
                for c in list(h.childNodes):
                    h.parentNode.insertBefore(c, h)
                h.parentNode.removeChild(h)
        if "replace" in e:
            erase("".join(run_text(r) for r in rs))
            set_text(rs[0], e["replace"])
            for r in rs[1:]:
                r.parentNode.removeChild(r)
        elif e.get("clear"):
            # Text, field codes and drawings (a tick drawn over a box); tabs and breaks keep the layout.
            for r in rs:
                erase(run_text(r) + "".join(text_of(i) for i in elements(r, "w:instrText")))
                for el in elements(r):
                    if el.nodeName not in ("w:rPr", "w:tab", "w:br", "w:cr"):
                        r.removeChild(el)
        elif "ind" in e or "spacing" in e or "row" in e:
            # ind: a line full to its indent, which the markers of pass A would push the last word off: a little more
            # room; B keeps its line breaks while the room added is less than the next word (check the render). Also a
            # line whose restored box would sit on its column's rule: the indent of the column's list markers.
            # spacing: an exact line height lower than its text, which the converter clips at the top: atLeast.
            # row: the height of the table row p is in (w:trHeight), for a field that needs a second line in an exact
            # row; the room comes from a neighbouring row, above or below, with empty space, so no other row moves.
            tag = next(t for t in ("ind", "spacing", "row") if t in e)
            el = "trHeight" if tag == "row" else tag
            at = f"{part} p{e['p']}"
            holders = [pr for tr in [owner(p, "w:tr")] if tr is not None for pr in elements(tr, "w:trPr")] if tag == "row" else elements(p, "w:pPr")
            own = [i for pr in holders for i in elements(pr, "w:" + el)]
            if not own:
                sys.exit(f"{at}: no w:{el} to change")
            for name, value in e[tag].items():
                if name not in PPR_ATTRS[tag]:
                    sys.exit(f"{at}: no attribute {name!r} for w:{el}; {tag} sets {', '.join(PPR_ATTRS[tag])}")
                if name in ("lineRule", "hRule") and value not in LINE_RULES:
                    sys.exit(f"{at}: w:{el} {name} is {', '.join(LINE_RULES)}, not {value!r}")
                if name not in ("lineRule", "hRule") and (not isinstance(value, int) or isinstance(value, bool)):
                    sys.exit(f"{at}: w:{el} {name} is twips, a whole number, not {value!r}")
                if tag == "row" and name == "val" and value <= 0:
                    sys.exit(f"{at}: a row's height is above 0 twips, not {value!r}")
                own[0].setAttribute(f"w:{name}", str(value))
        elif "bullet" in e:
            # A list marker raised by a w:position of its own: LibreOffice draws it as a superscript, a box bullet comes
            # out at 58 % of its size above the line. Position 0 puts it on the line at its own size.
            at = f"{part} p{e['p']}"
            lvl = levels(z, doc_of("word/numbering.xml") if "word/numbering.xml" in z.namelist() else None)(p)
            own = [i for rpr in elements(lvl, "w:rPr") for i in elements(rpr, "w:position")] if lvl is not None else []
            if not own:
                sys.exit(f"{at}: no w:position in the list level of this paragraph")
            for name, value in e["bullet"].items():
                if name != "position":
                    sys.exit(f"{at}: no attribute {name!r} for a list marker; bullet sets position")
                if not isinstance(value, int) or isinstance(value, bool):
                    sys.exit(f"{at}: a list marker's position is half-points, a whole number, not {value!r}")
                own[0].setAttribute("w:val", str(value))
        elif "add" in e and "after" in e:
            # A marker inside a run, right after its text "after": a label and the next heading printed in one run.
            r = one_run(e, part, rs)
            text = run_text(r)
            k = text.find(e["after"])
            if r.parentNode is None or k < 0:
                sys.exit(f"{part} p{e['p']} r{e['r'][0]}: no {e['after']!r} in the run, or the run was edited already")
            k += len(e["after"])
            for s in (text[:k], e["add"], text[k:]):
                if s:
                    r.parentNode.insertBefore(clone_with(r, s), r)
            r.parentNode.removeChild(r)
        elif "add" in e:
            # A marker where the sample has no value: a run of its own at the start or the end of the paragraph, in the
            # format of the run next to it, or with "r" of that run (a box the conversion lost, set like the label's words).
            own = runs(p)
            near = (own[0] if e.get("at") == "start" else own[-1]) if own else None
            like = one_run(e, part, rs) if "r" in e else near
            r = clone_with(like, e["add"]) if like is not None else p.ownerDocument.createElementNS(W, "w:r")
            if like is None:
                set_text(r, e["add"])
            if near is None:
                p.appendChild(r)
            elif e.get("at") == "start":
                near.parentNode.insertBefore(r, near)
            else:
                near.parentNode.insertBefore(r, near.nextSibling)
        elif "para" in e:
            # A marker under a label with no empty line below it: a paragraph of its own, set like the label's.
            own = runs(p)
            new = p.ownerDocument.createElementNS(W, "w:p")
            for ppr in elements(p, "w:pPr"):
                ppr = new.appendChild(ppr.cloneNode(True))
                # Not the label's list number: a numbered paragraph would take the next number and shift the rest.
                for num in elements(ppr, "w:numPr"):
                    ppr.removeChild(num)
            r = clone_with(own[-1], e["para"]) if own else p.ownerDocument.createElementNS(W, "w:r")
            if not own:
                set_text(r, e["para"])
            new.appendChild(r)
            p.parentNode.insertBefore(new, p.nextSibling)
        elif "checkbox" in e:
            # A legacy check-box field (FORMCHECKBOX, [chk] in dump): its checked state, default and result are the
            # client's choice. The field goes whole, from its begin run to its end; a text ☐ in the begin run's format
            # takes its place, the marker right after it ("" for a box left without one).
            r = one_run(e, part, rs)
            at = f"{part} p{e['p']} r{e['r'][0]}"
            if not isinstance(e["checkbox"], str):
                sys.exit(f"{at}: checkbox is one tick marker's name, \"\" for none, not {e['checkbox']!r}")
            if "size" in e and (not isinstance(e["size"], int) or isinstance(e["size"], bool) or e["size"] <= 0):
                sys.exit(f"{at}: a box's size is half-points, a whole number, not {e['size']!r}")
            if r.parentNode is None or not any(f.getAttribute("w:fldCharType") == "begin" and f.getElementsByTagName("w:checkBox") for f in elements(r, "w:fldChar")):
                sys.exit(f"{at}: not the begin run of a check-box field ([chk] in dump)")
            own = runs(p)
            field, depth = [], 0
            for o in own[own.index(r):]:
                field.append(o)
                depth += sum({"begin": 1, "end": -1}.get(f.getAttribute("w:fldCharType"), 0) for f in elements(o, "w:fldChar"))
                if depth == 0:
                    break
            if depth:
                sys.exit(f"{at}: the check-box field doesn't end in its paragraph")
            for o in field:
                erase(run_text(o) + "".join(text_of(i) for i in elements(o, "w:instrText")))
            # The ☐ keeps the run's font and size, not its bold, spacing or scale (a legacy box is a plain square), so the
            # converted boxes look alike; "size" (half-points) sets another, for a run smaller than the blank's other boxes.
            # The field's own w:size goes with it: a blank may draw one box at 6 pt and another at 9 pt among 8 pt ones.
            box = clone_with(r, "☐")
            for rpr in elements(box, "w:rPr"):
                box.removeChild(rpr)
            rpr = box.insertBefore(r.ownerDocument.createElementNS(W, "w:rPr"), box.firstChild)
            fonts = [f for old in elements(r, "w:rPr") for f in elements(old, "w:rFonts")]
            if fonts:
                rpr.appendChild(fonts[0].cloneNode(True))
            sizes = [str(e["size"])] if "size" in e else [s.getAttribute("w:val") for old in elements(r, "w:rPr") for s in elements(old, "w:sz")]
            for name in ("w:sz", "w:szCs") if sizes else ():
                rpr.appendChild(r.ownerDocument.createElementNS(W, name)).setAttribute("w:val", sizes[0])
            for s in (box, clone_with(box, "{{" + e["checkbox"] + "}}") if e["checkbox"] else None):
                if s is not None:
                    r.parentNode.insertBefore(s, r)
            for o in field:
                o.parentNode.removeChild(o)
        elif "box" in e:
            r = one_run(e, part, rs)
            at = f"{part} p{e['p']} r{e['r'][0]}"
            if r.parentNode is None:
                sys.exit(f"{at}: one box edit per run; for several boxes in it list their markers in order, \"\" for a box left out")
            # One name, or a list for the run's boxes in order.
            names = e["box"] if isinstance(e["box"], list) else [e["box"]]
            text = run_text(r)
            boxes = [k for k, c in enumerate(text) if c in "☐□"]
            if len(boxes) < len(names):
                sys.exit(f"{at}: {len(names)} markers for {len(boxes)} boxes in the run")
            # The blank's own box glyph stays (a symbol box becomes ☐), the marker follows it in a run of its own.
            cut, start = [], 0
            for k, name in zip(boxes, names):
                cut += [text[start:k], text[k], "{{" + name + "}}" if name else ""]
                start = k + 1
            new = [clone_with(r, s) for s in cut + [text[start:]] if s]
            for n in new:
                r.parentNode.insertBefore(n, r)
            r.parentNode.removeChild(r)
        else:
            sys.exit(f"unknown edit {e}")

    # A legacy check-box field left over would keep its checked state in the blank and draw unlike the ☐ boxes.
    for part in [n for n in z.namelist() if STORY.match(n)]:
        left = len(doc_of(part).getElementsByTagName("w:checkBox"))
        if left:
            sys.exit(f"{part}: {left} legacy check-box field(s) left ([chk] in dump); each becomes ☐ with a \"checkbox\" edit")

    # The images the edits name go with the drawings that show them; a photo or a signature is never kept.
    drop = set(spec.get("media", []))
    drop |= {n for n in z.namelist() if n.startswith("docProps/thumbnail")}
    for part in [n for n in z.namelist() if n.endswith(".xml") and not n.startswith("[")]:
        rels, rels_path = rels_of(z, part)
        gone = [rid for rid, rel in rels.items() if target_path(part, rel.getAttribute("Target")) in drop and rel.getAttribute("TargetMode") != "External"]
        if not gone:
            continue
        if STORY.match(part):
            for el, rid, _ in list(image_uses(z, part, doc_of(part))):
                if rid in gone:
                    box = next((a for a in (owner(el, "mc:AlternateContent"), owner(el, "w:drawing"), owner(el, "w:pict"), owner(el, "w:object")) if a is not None), el)
                    if box.parentNode is not None:
                        box.parentNode.removeChild(box)
        for rel in doc_of(rels_path).getElementsByTagName("Relationship"):
            if rel.getAttribute("Id") in gone:
                rel.parentNode.removeChild(rel)
    root_rels = doc_of("_rels/.rels")
    for rel in root_rels.getElementsByTagName("Relationship"):
        if rel.getAttribute("Target").lstrip("/") in drop:
            rel.parentNode.removeChild(rel)

    for part, ids in links.items():
        rels, rels_path = rels_of(z, part)
        for rel in doc_of(rels_path).getElementsByTagName("Relationship"):
            if rel.getAttribute("Id") in ids:
                erase(rel.getAttribute("Target"))
                rel.parentNode.removeChild(rel)

    # Alt text and a picture's own name often hold the file name it was inserted from; a shape or a group repeats the
    # name in its own cNvPr (wps:, wpg:), whatever its prefix.
    for part in [n for n in z.namelist() if STORY.match(n)]:
        for el in doc_of(part).getElementsByTagName("*"):
            if el.nodeName.split(":")[-1] in ("docPr", "cNvPr"):
                for a in ("descr", "title", "name"):
                    if el.getAttribute(a):
                        erase(el.getAttribute(a))
                        el.setAttribute(a, "")
        # The VML copy of a drawing repeats that name as its id; an image fill keeps its file name in o:title.
        for el in doc_of(part).getElementsByTagName("*"):
            if el.nodeName.startswith("v:") and el.nodeName != "v:shapetype":
                for a in ("id", "alt", "o:title"):
                    if el.getAttribute(a):
                        erase(el.getAttribute(a))
                        el.removeAttribute(a)

    # A tracked change keeps who made it, by name and initials, in whatever part it is in.
    for part in [n for n in z.namelist() if n.endswith((".xml", ".rels"))]:
        if re.search(rb':(author|initials)=', z.read(part)):
            for el in doc_of(part).getElementsByTagName("*"):
                for a in [a for a in el.attributes.keys() if a.split(":")[-1] in ("author", "initials") and el.getAttribute(a)]:
                    erase(el.getAttribute(a))
                    el.setAttribute(a, "")

    def clear_text(part, keep=lambda el: False):
        if part not in z.namelist():
            return
        for n in list(doc_of(part).getElementsByTagName("*")):
            if not keep(n):
                for t in [c for c in n.childNodes if c.nodeType == c.TEXT_NODE and c.data.strip()]:
                    erase(t.data)
                    n.removeChild(t)

    # The dates the sample was made and saved go too: they tell when a client's papers were done. A date element
    # can't be empty, so it goes whole.
    clear_text("docProps/core.xml", lambda el: el.nodeName == "cp:revision")
    if "docProps/core.xml" in z.namelist():
        for el in [e for name in ("dcterms:created", "dcterms:modified") for e in doc_of("docProps/core.xml").getElementsByTagName(name)]:
            el.parentNode.removeChild(el)
    clear_text("docProps/app.xml", lambda el: el.nodeName not in ("Company", "Manager", "HyperlinkBase") and owner(el, "TitlesOfParts") is None)
    # A sample Word never saved (a converter's output) has no page count for make-form to check against: the edits
    # give it, one page per section that starts a page. A count Word saved is never overridden.
    if "pages" in spec:
        app = doc_of("docProps/app.xml") if "docProps/app.xml" in z.namelist() else None
        if app is None or app.getElementsByTagName("Pages"):
            sys.exit(f"{src}: \"pages\" is only for a sample whose docProps/app.xml has no <Pages>")
        root = app.documentElement
        root.appendChild(app.createElementNS(root.namespaceURI, "Pages")).appendChild(app.createTextNode(str(int(spec["pages"]))))
    clear_text("docProps/custom.xml")
    for n in z.namelist():
        if n.startswith("customXml/") and n.endswith(".xml") and "/_rels/" not in n:
            clear_text(n)

    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as out:
        for info in z.infolist():
            if info.filename in drop:
                continue
            data = docs[info.filename].toxml(encoding="UTF-8") if info.filename in docs else z.read(info.filename)
            out.writestr(info.filename, data)
    with open(removed_path, "w", encoding="utf-8") as f:
        f.write("\n".join(removed) + "\n")
    print(f"{len(resolved)} edits, {len(drop & set(z.namelist()))} images removed, {len(removed)} removed lines in {removed_path}")


# A: every marker in monospace at 1% width (1 pt among other text), so the pages keep B's layout and the marker shows
# where its field goes.
# B: no marker text. Either way a marker drops the raised/lowered position and letter spacing of the value it replaced,
# and its paragraph mark drops its position: a lowered empty end of an exact-height line pulls the line's first word
# down in LibreOffice, and a condensed 1% run comes out narrower than nothing and is not drawn. A paragraph that holds
# only its marker is left-aligned, so the field starts where the line does, not mid-cell.
def passes(src, a, b):
    z = zipfile.ZipFile(src)
    # The page count Word saved, for make-form to hold LibreOffice's pages against.
    app = z.read("docProps/app.xml") if "docProps/app.xml" in z.namelist() else b""
    pages = re.search(rb"<Pages>(\d+)</Pages>", app)
    if not pages:
        sys.exit(f"{src}: no <Pages> in docProps/app.xml to check the pages against; open the blank in Word and save it")
    out = {"a": {}, "b": {}}
    written = []
    for part in [n for n in z.namelist() if STORY.match(n)]:
        for key in out:
            doc = minidom.parseString(z.read(part))
            for i, p in enumerate(paragraphs(doc)):
                for r in runs(p):
                    text = run_text(r)
                    if "{{" not in text and "}}" not in text:
                        continue
                    if not MARKER.fullmatch(text):
                        sys.exit(f"{part} p{i}: a marker must be the whole text of its run")
                    if key == "a":
                        written.append(text[2:-2])
                    marks = [m for ppr in elements(p, "w:pPr") for m in elements(ppr, "w:rPr")]
                    for mark in marks:
                        for el in elements(mark, "w:position"):
                            mark.removeChild(el)
                    # Alone in its paragraph, a marker in A takes the paragraph mark's size: B's empty line is as tall
                    # as its mark, and the marker's baseline is then the one the field's text goes on.
                    alone = not any(run_text(o).strip() for o in runs(p) if o is not r)
                    # Alone, its field starts where the line does: centred, the marker and its field would start mid-cell.
                    # B's line shows nothing either way. ponytail: a centring from the paragraph's style isn't seen.
                    for jc in [j for ppr in elements(p, "w:pPr") for j in elements(ppr, "w:jc")] if alone else []:
                        if jc.getAttribute("w:val") not in ("left", "start", "both"):
                            jc.setAttribute("w:val", "left")
                    if key == "a" and alone:
                        for el in elements(r, "w:rPr"):
                            r.removeChild(el)
                        r.insertBefore(marks[0].cloneNode(True) if marks else doc.createElementNS(W, "w:rPr"), r.firstChild)
                    rpr = elements(r, "w:rPr")
                    rpr = rpr[0] if rpr else r.insertBefore(doc.createElementNS(W, "w:rPr"), r.firstChild)
                    own = {"w:rFonts": "", "w:w": "1"} if alone else {"w:rFonts": "", "w:sz": "2", "w:szCs": "2", "w:w": "1"}
                    own = own if key == "a" else {}
                    for el in elements(rpr):
                        if el.nodeName in ("w:position", "w:spacing", *own):
                            rpr.removeChild(el)
                    for name, val in own.items():
                        el = rpr.appendChild(doc.createElementNS(W, name))
                        if val:
                            el.setAttribute("w:val", val)
                        else:  # a monospace font has no fi ligature, whose glyph a PDF may map back to the wrong text
                            for k in ("ascii", "hAnsi", "cs", "eastAsia"):
                                el.setAttribute(f"w:{k}", "Liberation Mono")
                    if key == "b":
                        set_text(r, "")
            out[key][part] = doc.toxml(encoding="UTF-8")
    for key, dst in (("a", a), ("b", b)):
        with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zo:
            for info in z.infolist():
                zo.writestr(info.filename, out[key].get(info.filename) or z.read(info.filename))
    print(f"word pages {pages.group(1).decode()}")
    # Every marker written, for make-form to find each one on A's pages.
    print("markers " + json.dumps(written, ensure_ascii=False))


if __name__ == "__main__":
    cmd, *args = sys.argv[1:] or [""]
    if cmd == "dump" and len(args) == 1:
        dump(args[0])
    elif cmd == "apply" and len(args) == 5 and args[3] == "--removed":
        apply(args[0], args[1], args[2], args[4])
    elif cmd == "passes" and len(args) == 3:
        passes(*args)
    else:
        sys.exit(__doc__)
