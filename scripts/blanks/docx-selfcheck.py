"""docx.py on a made-up Word file: dump masks every value, apply and passes do what the README says.
Run it after any change to docx.py:  python3 -I scripts/blanks/docx-selfcheck.py
Every name, number and address below is invented."""
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile

DOCX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docx.py")
NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" '
      'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"')
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"


def r(t):
    return f'<w:r><w:t xml:space="preserve">{t}</w:t></w:r>'


def p(*runs, ppr=""):
    return f"<w:p>{ppr}{''.join(runs)}</w:p>"


def fld(kind):
    return f'<w:r><w:fldChar w:fldCharType="{kind}"/></w:r>'


def instr(t):
    return f'<w:r><w:instrText xml:space="preserve">{t}</w:instrText></w:r>'


def picture(attr):
    return (f'<w:r><w:drawing><wp:inline><wp:extent cx="381000" cy="254000"/><wp:docPr id="1" name="Picture 1" descr="photo_kowalczyk.png"/>'
            f'<a:graphic><a:graphicData><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="x.png"/></pic:nvPicPr><pic:blipFill><a:blip {attr}/></pic:blipFill>'
            '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')


NUMBERED = '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>'
# p0 and p1 are what the apply check edits; the rest is what dump must mask.
BODY = [
    p(r("Odpowiedź: "), r("☐ nie ☐ tak")),
    p(r("Cel podróży:"), ppr=NUMBERED),
    p(r("1. Nazwisko / Фамилия: "), r("KOWAL"), r("CZYK")),
    p(r("Имя: "), r("ЯРО"), r("СЛАВ"), r(" Paszport nr XZ1234567")),
    p(r("E-mail: jan.kowalczyk@example.org; tel. +48 600 123 456")),
    p(r("Data urodzenia: 14-02-1987")),
    p(r("☐ Tak "), r("☒"), r(" Nie"), '<w:r><w:sym w:font="Wingdings" w:char="F0A8"/></w:r>', r(" inne")),
    p(r("Punkt listy"), ppr='<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>'),
    p('<w:hyperlink r:id="rId8">' + r("ANNA.NOWAK@example.pl") + "</w:hyperlink>"),
    # A value split over two runs of a link, of a field code, of a deleted revision, of plain text.
    p(r("Poczta: "), '<w:hyperlink r:id="rId10">' + r("zxqhyone.zxqhytwo") + r("@zxqhyhost.zxq") + "</w:hyperlink>"),
    p(fld("begin"), instr(' HYPERLINK "mailto:zxqfieldone.zxqfieldtwo'), instr('@zxqfieldhost.zxq" '), fld("separate"), r("adres"), fld("end")),
    p('<w:del w:id="1" w:author="Zofia Testowa" w:initials="ZT" w:date="2020-01-01T00:00:00Z"><w:r><w:delText>zxqrmone.</w:delText></w:r>'
      '<w:r><w:delText>zxqrmtwo@zxqrmhost.zxq</w:delText></w:r></w:del>'
      '<w:ins w:id="2" w:author="Zofia Testowa" w:date="2020-01-01T00:00:00Z">' + r("wstawka") + "</w:ins>"),
    p(r("Kontakt: "), r("zxqplainone.zxqplaintwo"), r("@zxqplainhost.zxq")),
    p('<w:fldSimple w:instr=" HYPERLINK &quot;mailto:zxqsimple@zxqsimplehost.zxq&quot; ">' + r("strona") + "</w:fldSimple>"),
    # A picture linked from a file outside the package: its path holds a name.
    p(picture('r:link="rId11"')),
    "<w:tbl><w:tr><w:tc>" + p(r("Ulica: "), r("MARSZAŁKOWSKA 99/12")) + "</w:tc><w:tc>" + p(picture('r:embed="rId9"')) + "</w:tc></w:tr></w:tbl>",
    p(r("{{surname:100x12}}")),
    p(r("Linia pełna do wcięcia"), ppr='<w:pPr><w:ind w:left="105" w:right="2994"/></w:pPr>'),
    # A shape's own name, in wps:cNvPr.
    p('<w:r><w:drawing><wp:anchor><wp:extent cx="381000" cy="254000"/><wp:docPr id="3" name="Zxqshapename 2"/><a:graphic><a:graphicData>'
      '<wps:wsp><wps:cNvPr id="3" name="Zxqshapename 2"/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>'),
    p(r("Linia ścisła"), ppr='<w:pPr><w:spacing w:before="2" w:line="154" w:lineRule="exact"/></w:pPr>'),
    # A box a conversion lost: the line starts with spaces, its label in a format of its own.
    p(r("   "), '<w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t>gotówka</w:t></w:r>'),
]
VALUES = ["KOWALCZYK", "ЯРОСЛАВ", "XZ1234567", "jan.kowalczyk@example.org", "600 123 456", "14-02-1987", "ANNA.NOWAK@example.pl",
          "MARSZAŁKOWSKA", "PIOTR", "WIŚNIEWSKI", "1990", "zxqhyone.zxqhytwo@zxqhyhost.zxq",
          "zxqfieldone.zxqfieldtwo@zxqfieldhost.zxq", "zxqrmone.zxqrmtwo@zxqrmhost.zxq",
          "zxqplainone.zxqplaintwo@zxqplainhost.zxq", "zxqsimple@zxqsimplehost.zxq", "Zxqbrzeski", "Testowa"]
RELS = [("rId1", "header", "header1.xml", ""), ("rId2", "numbering", "numbering.xml", ""),
        ("rId8", "hyperlink", "mailto:ANNA.NOWAK@example.pl", "External"),
        ("rId9", "image", "media/image1.png", ""),
        ("rId10", "hyperlink", "mailto:zxqhyone.zxqhytwo@zxqhyhost.zxq", "External"),
        ("rId11", "image", "file:///C:/Users/Zxqbrzeski/Desktop/Zxqbrzeski%20skan.jpg", "External")]


def png(w, h):
    import struct, zlib
    raw = b"".join(b"\0" + b"\xff\0\0" * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def build(path, app="<Pages>1</Pages>", extra=None):
    doc = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {NS}><w:body>{"".join(BODY)}<w:sectPr/></w:body></w:document>'
    rels = "".join(f'<Relationship Id="{i}" Type="{REL}{t}" Target="{g}"' + (f' TargetMode="{m}"' if m else "") + "/>" for i, t, g, m in RELS)
    numbering = (f'<w:numbering {NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/>'
                 '<w:rPr><w:b/><w:position w:val="2"/><w:sz w:val="18"/></w:rPr></w:lvl></w:abstractNum>'
                 '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>'
                 '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>')
    parts = {
        "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/>'
                               '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/>'
                               '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                       f'<Relationship Id="rId1" Type="{REL}officeDocument" Target="word/document.xml"/></Relationships>',
        "word/document.xml": doc,
        "word/header1.xml": f'<w:hdr {NS}>{p(r("Wniosek "), r("PIOTR WIŚNIEWSKI 1990"))}</w:hdr>',
        "word/numbering.xml": numbering,
        "word/_rels/document.xml.rels": f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{rels}</Relationships>',
        "word/media/image1.png": png(30, 20),
        "docProps/core.xml": '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">'
                             "<dc:creator>Zofia Testowa</dc:creator></cp:coreProperties>",
        "docProps/app.xml": f'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">{app}</Properties>',
        **(extra or {}),
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in parts.items():
            z.writestr(name, data)


def docx_py(*args):
    return subprocess.run([sys.executable, "-I", DOCX, *args], capture_output=True, text=True)


failures = []


def check(ok, what):
    print(("ok   " if ok else "FAIL ") + what)
    if not ok:
        failures.append(what)


with tempfile.TemporaryDirectory() as tmp:
    sample, clean, edits, removed = (os.path.join(tmp, n) for n in ("sample.docx", "clean.docx", "edits.json", "removed.txt"))
    build(sample)

    # dump: no 3 characters in a row of any value show, the markers show as they are.
    out = docx_py("dump", sample)
    shown = "\n".join(l for l in out.stdout.splitlines() if not l.startswith(("== parts", "== counts")))
    check(out.returncode == 0, "dump runs" + (f": {out.stderr.strip()[-600:]}" if out.returncode else ""))
    for v in VALUES:
        pieces = sorted({v[i:i + 3] for i in range(len(v) - 2) if v[i:i + 3].strip() and v[i:i + 3] in shown})
        check(not pieces, f"dump masks {v[:3]}…" + (f" (shows {pieces})" if pieces else ""))
    check("{{surname:100x12}}" in shown, "dump prints a marker as it is")

    # apply: two boxes of one run marked, a paragraph under a numbered label not numbered, a marker inside a run, an
    # indent loosened, an exact line height made a minimum, authors blanked.
    with open(edits, "w", encoding="utf-8") as f:
        json.dump({"edits": [{"p": 0, "r": [1], "box": ["answer.no", "answer.yes"]}, {"p": 1, "para": "{{goal:200x12}}"},
                             {"p": 2, "r": [0], "add": "{{who:50x10}}", "after": "Nazwisko /"}, {"p": 18, "ind": {"right": 2794}},
                             {"p": 20, "spacing": {"lineRule": "atLeast"}}, {"p": 21, "r": [0], "replace": " "},
                             {"p": 21, "r": [1], "add": "{{pay.cash}}", "at": "start"}, {"p": 21, "r": [1], "add": "☐", "at": "start"},
                             {"p": 7, "bullet": {"position": 0}}]}, f)
    out = docx_py("apply", sample, edits, clean, "--removed", removed)
    check(out.returncode == 0, "apply runs" + (f": {out.stderr.strip()[-300:]}" if out.returncode else ""))
    if out.returncode == 0:
        z = zipfile.ZipFile(clean)
        xml = z.read("word/document.xml").decode()
        check(all(b"Testowa" not in z.read(n) for n in z.namelist()), "apply blanks every author")
        check('w:initials="ZT"' not in xml, "apply blanks every author's initials")
        goal = xml[xml.rfind("<w:p>", 0, xml.find("{{goal:200x12}}")):xml.find("{{goal:200x12}}")]
        check("{{goal:200x12}}" in xml and "w:numPr" not in goal, "para leaves the label's numbering out")
        texts = re.findall(r"<w:t[^>]*>([^<]*)</w:t>", xml)
        k = texts.index("{{who:50x10}}") if "{{who:50x10}}" in texts else 0
        check(texts[k - 1:k + 2] == ["1. Nazwisko /", "{{who:50x10}}", " Фамилия: "], f"add after puts the marker inside the run (got {texts[k - 1:k + 2]})")
        check('<w:ind w:left="105" w:right="2794"/>' in xml, "ind changes only the indent it names")
        check('<w:spacing w:before="2" w:line="154" w:lineRule="atLeast"/>' in xml, "spacing changes only the attribute it names")
        check("Zxqshapename" not in xml, "apply blanks a shape's own name")
        last = re.findall(r"<w:p>.*?</w:p>", xml)[-1]
        got = re.findall(r"<w:r>(.*?)<w:t[^>]*>([^<]*)</w:t></w:r>", last)
        bold = '<w:rPr><w:b/><w:sz w:val="18"/></w:rPr>'
        check(got == [(bold, "☐"), (bold, "{{pay.cash}}"), ("", " "), (bold, "gotówka")], f"add with r alone takes that run's format at the start (got {got})")
        lvl = re.search(r"<w:rPr>.*?</w:rPr>", z.read("word/numbering.xml").decode())
        check(lvl and lvl.group() == '<w:rPr><w:b/><w:position w:val="0"/><w:sz w:val="18"/></w:rPr>', f"bullet changes only its list level's position (got {lvl and lvl.group()})")
        out = docx_py("passes", clean, os.path.join(tmp, "a.docx"), os.path.join(tmp, "b.docx"))
        said = dict(l.split(" ", 1) for l in out.stdout.splitlines() if " " in l)
        check(out.returncode == 0 and "word" in said, "passes runs and prints the page count")
        try:
            names = json.loads(said.get("markers", "null"))
        except ValueError:
            names = None
        check(names == ["answer.no", "answer.yes", "goal:200x12", "who:50x10", "surname:100x12", "pay.cash"], f"passes prints the markers it wrote (got {names})")

    # passes stops on a blank whose app.xml has no page count.
    build(os.path.join(tmp, "nopages.docx"), app="")
    out = docx_py("passes", os.path.join(tmp, "nopages.docx"), os.path.join(tmp, "a2.docx"), os.path.join(tmp, "b2.docx"))
    check(out.returncode != 0 and "Pages" in out.stderr, "passes stops without <Pages>")

    # apply's "pages" gives such a sample its count, and never overrides the count Word saved.
    pages = os.path.join(tmp, "pages.json")
    with open(pages, "w", encoding="utf-8") as f:
        json.dump({"edits": [], "pages": 3}, f)
    out = docx_py("apply", os.path.join(tmp, "nopages.docx"), pages, os.path.join(tmp, "paged.docx"), "--removed", removed)
    said = docx_py("passes", os.path.join(tmp, "paged.docx"), os.path.join(tmp, "a3.docx"), os.path.join(tmp, "b3.docx")).stdout if out.returncode == 0 else ""
    check("word pages 3" in said, "apply writes \"pages\" into a sample without <Pages>")
    out = docx_py("apply", sample, pages, os.path.join(tmp, "paged2.docx"), "--removed", removed)
    check(out.returncode != 0 and not os.path.exists(os.path.join(tmp, "paged2.docx")), "apply refuses \"pages\" over Word's own <Pages>")

    # A wrong edit stops apply with its place named, before anything is written.
    for i, (edit, says) in enumerate([({"p": 3, "ind": {"right": 100}}, "p3: no w:ind"),
                       ({"p": 18, "ind": {"rigth": 100}}, "p18: no attribute 'rigth'"),
                       ({"p": 18, "ind": {"right": "wide"}}, "p18: w:ind right"),
                       ({"p": 3, "spacing": {"line": 240}}, "p3: no w:spacing"),
                       ({"p": 20, "spacing": {"beforeLines": 1}}, "p20: no attribute 'beforeLines'"),
                       ({"p": 20, "spacing": {"lineRule": "exactly"}}, "p20: w:spacing lineRule"),
                       ({"p": 2, "r": [0], "add": "{{x:10x10}}", "after": "Zxqnowhere"}, "p2 r0: no 'Zxqnowhere'"),
                       ({"p": 2, "r": [0, 1], "add": "{{x:10x10}}", "after": "Nazwisko"}, "p2 r[0, 1]: one run"),
                       ({"p": 0, "r": [0, 1], "box": "answer.no"}, "p0 r[0, 1]: one run"),
                       ({"p": 21, "r": [0, 1], "add": "☐", "at": "start"}, "p21 r[0, 1]: one run"),
                       ({"p": 3, "bullet": {"position": 0}}, "p3: no w:position in the list level"),
                       ({"p": 1, "bullet": {"position": 0}}, "p1: no w:position in the list level"),
                       ({"p": 7, "bullet": {"size": 18}}, "p7: no attribute 'size'"),
                       ({"p": 7, "bullet": {"position": "0"}}, "p7: a list marker's position is half-points")]):
        with open(edits, "w", encoding="utf-8") as f:
            json.dump({"edits": [edit]}, f)
        bad = os.path.join(tmp, f"wrong{i}.docx")
        out = docx_py("apply", sample, edits, bad, "--removed", removed)
        check(out.returncode != 0 and says in out.stderr and "Traceback" not in out.stderr and not os.path.exists(bad),
              f"apply stops on {json.dumps(edit, ensure_ascii=False)} with {says!r}" + (f" (said {out.stderr.strip()[-200:]!r})" if says not in out.stderr else ""))

    # apply refuses comments, the people who wrote them and a glossary; dump names them.
    for part in ("word/comments.xml", "word/people.xml", "word/glossary/document.xml"):
        bad = os.path.join(tmp, "bad.docx")
        build(bad, extra={part: f"<w:comments {NS}/>"})
        out = docx_py("apply", bad, edits, os.path.join(tmp, "bad-clean.docx"), "--removed", removed)
        check(out.returncode != 0 and part in out.stderr and not os.path.exists(os.path.join(tmp, "bad-clean.docx")), f"apply refuses {part}")
        check(f"== apply refuses: {part}" in docx_py("dump", bad).stdout, f"dump names {part}")

print(f"{len(failures)} failed" if failures else "docx.py self-check: all good")
sys.exit(1 if failures else 0)
