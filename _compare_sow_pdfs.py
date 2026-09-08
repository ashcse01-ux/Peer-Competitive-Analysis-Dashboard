import fitz
from pathlib import Path

root = Path(r"c:\Users\Ayush Jain\Peer-Competitive-Analysis-Dashboard")
v1 = root / "Competitor Peer Analysis Dashboard SOW V1.0.pdf"
v2 = root / "Competitor Peer Analysis Dashboard SOW V2.0.pdf"

for label, path in [("V1", v1), ("V2", v2)]:
    doc = fitz.open(path)
    print(f"=== {label}: {path.name} pages={len(doc)} size={path.stat().st_size}")
    page = doc[0]
    print(f"  page0 size={page.rect}")
    # text sample
    text = page.get_text()[:500].replace("\n", " | ")
    print(f"  text: {text}")
    # fonts
    fonts = set()
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for l in b.get("lines", []):
            for s in l.get("spans", []):
                fonts.add((s.get("font"), round(s.get("size", 0), 1), s.get("color")))
    print("  fonts:", sorted(fonts)[:12])
    pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
    out = root / f"_sow_{label.lower()}_final_p1.png"
    pix.save(out)
    print(f"  preview: {out}")
    if len(doc) > 1:
        pix2 = doc[1].get_pixmap(matrix=fitz.Matrix(1.2, 1.2))
        out2 = root / f"_sow_{label.lower()}_final_p2.png"
        pix2.save(out2)
        print(f"  preview2: {out2}")
    doc.close()
