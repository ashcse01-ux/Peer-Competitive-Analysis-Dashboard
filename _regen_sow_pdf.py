from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(r"c:\Users\Ayush Jain\Peer-Competitive-Analysis-Dashboard")
html_path = root / "Competitor Peer Analysis Dashboard SOW V2.0.html"
pdf_path = root / "Competitor Peer Analysis Dashboard SOW V2.0.pdf"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(html_path.resolve().as_uri(), wait_until="networkidle")
    page.wait_for_timeout(3500)
    page.pdf(
        path=str(pdf_path),
        format="Letter",
        print_background=True,
        display_header_footer=True,
        header_template="<span></span>",
        footer_template="""
          <div style="width:100%; font-size:8pt; font-family:Cambria, Times New Roman, serif; color:#000; padding:0 0.55in; display:flex; justify-content:space-between; align-items:center;">
            <span style="flex:1; text-align:left;">This document is the intellectual property of Freshbus Private Limited. Any unauthorized use shall not be entertained.</span>
            <span style="width:40px; text-align:right;" class="pageNumber"></span>
          </div>
        """,
        margin={
            "top": "0.7in",
            "bottom": "0.8in",
            "left": "0.85in",
            "right": "0.85in",
        },
    )
    browser.close()

import fitz
doc = fitz.open(pdf_path)
print(f"pages={len(doc)} size={pdf_path.stat().st_size}")
for i in range(min(3, len(doc))):
    t = doc[i].get_text()[:160].replace("\n", " | ")
    print(f"p{i+1}: {t}")
pix = doc[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
pix.save(root / "_sow_v2_final_p1.png")
pix = doc[1].get_pixmap(matrix=fitz.Matrix(1.2, 1.2))
pix.save(root / "_sow_v2_final_p2.png")
doc.close()
print("done", pdf_path)
