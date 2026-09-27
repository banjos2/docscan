"""Strip the filled-in overlay (/Fm0) from a completed ANKETA.pdf, leaving the blank form.

Usage: python scripts/make_template.py <filled.pdf> public/anketa-template.pdf
"""
import re
import sys

import pymupdf

src, dst = sys.argv[1], sys.argv[2]
doc = pymupdf.open(src)
for page in doc:
    for xref in page.get_contents():
        doc.update_stream(xref, re.sub(rb"/Fm0\s+Do", b"", doc.xref_stream(xref)))
    doc.xref_set_key(page.xref, "Resources/XObject/Fm0", "null")
doc.save(dst, garbage=4, deflate=True, clean=True)

# The overlay was the only Form XObject and the only Arial text: neither may survive.
out = pymupdf.open(dst)
forms = [x for x in range(1, out.xref_length()) if out.xref_get_key(x, "Subtype") == ("name", "/Form")]
arial = {
    s["font"]
    for p in out
    for b in p.get_text("dict")["blocks"]
    for l in b.get("lines", [])
    for s in l["spans"]
    if "Arial" in s["font"]
}
assert not forms and not arial and len(out) == 4, (forms, arial, len(out))
print("ok: blank template with", len(out), "pages")
