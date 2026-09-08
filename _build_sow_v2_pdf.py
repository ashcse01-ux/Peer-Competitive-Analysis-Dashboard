from pathlib import Path
import re

root = Path(r"c:\Users\Ayush Jain\Peer-Competitive-Analysis-Dashboard")
html_path = root / "Competitor Peer Analysis Dashboard SOW V2.0.html"
pdf_path = root / "Competitor Peer Analysis Dashboard SOW V2.0.pdf"
logo_b64 = (root / "_logo_b64.txt").read_text(encoding="utf-8")

html = html_path.read_text(encoding="utf-8")

new_style = """
  <style>
    :root {
      --navy: #1f4679;
      --navy-mid: #365f91;
      --text: #000000;
      --muted: #333333;
      --border: #b0b0b0;
      --white: #ffffff;
    }

    * { box-sizing: border-box; }

    @page {
      size: letter;
      margin: 0.85in 0.9in 1in 0.9in;
    }

    body {
      margin: 0;
      padding: 0;
      color: var(--text);
      font-family: Calibri, Aptos, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      background: #ffffff;
    }

    .page {
      max-width: 8.5in;
      margin: 0 auto;
      background: #fff;
      padding: 0.6in 0.75in 0.9in;
    }

    .cover {
      display: flex;
      flex-direction: column;
      page-break-after: always;
      break-after: page;
    }

    .logo-wrap {
      text-align: center;
      margin-top: 0.4in;
      margin-bottom: 1.1in;
    }

    .logo-wrap img {
      height: 52px;
      width: auto;
    }

    .cover-kicker {
      text-align: center;
      font-family: Cambria, "Times New Roman", Times, serif;
      font-size: 20pt;
      color: #000;
      margin: 0 0 10px;
      font-weight: 400;
    }

    .cover-title {
      text-align: center;
      font-family: Cambria, "Times New Roman", Times, serif;
      font-size: 28pt;
      font-weight: 700;
      color: var(--navy);
      margin: 0 0 1.4in;
      line-height: 1.15;
    }

    .summary-plain {
      margin: 0 0 28px;
    }

    .summary-plain .sum-head {
      font-family: Calibri, Aptos, Arial, sans-serif;
      font-size: 12pt;
      font-weight: 700;
      color: #000;
      margin-bottom: 10px;
    }

    .summary-plain .sum-line {
      font-size: 11pt;
      margin: 0 0 4px;
      color: #000;
    }

    .proprietary {
      font-size: 10pt;
      color: #000;
      margin-top: 28px;
      max-width: 6.6in;
    }

    .doc-footer-screen {
      display: none;
    }

    h2 {
      font-family: Calibri, Aptos, Arial, sans-serif;
      font-size: 14pt;
      font-weight: 700;
      color: var(--navy-mid);
      border-bottom: none;
      margin: 22px 0 10px;
      page-break-after: avoid;
    }

    h3 {
      font-family: Calibri, Aptos, Arial, sans-serif;
      font-size: 12pt;
      font-weight: 700;
      color: var(--navy);
      margin: 16px 0 8px;
      page-break-after: avoid;
    }

    h4 {
      font-size: 11pt;
      font-weight: 700;
      color: #000;
      margin: 12px 0 6px;
    }

    p { margin: 0 0 10px; }
    ul, ol { margin: 0 0 12px; padding-left: 22px; }
    li { margin-bottom: 4px; }

    .summary-box, .eval-box, .callout, .signoff, .card {
      background: transparent;
      border: none;
      padding: 0;
      margin: 0 0 12px;
    }

    .eval-box ul { margin-top: 0; }

    .summary-box table,
    .summary-box td {
      border: none !important;
      background: transparent !important;
      padding: 2px 8px 2px 0;
    }

    .summary-box td:first-child {
      font-weight: 700;
      width: 170px;
      color: #000;
    }

    .brand-bar, .doc-subtitle { display: none; }

    table.data {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0 16px;
      font-size: 10pt;
    }

    table.data th {
      background: #ffffff;
      color: var(--navy);
      text-align: left;
      padding: 6px 8px;
      font-weight: 700;
      border: 1px solid #000;
    }

    table.data td {
      border: 1px solid #000;
      padding: 6px 8px;
      vertical-align: top;
      background: #fff;
    }

    table.data tr:nth-child(even) td { background: #fff; }

    .diagram {
      background: #fff;
      border: 1px solid #999;
      border-radius: 0;
      padding: 10px;
      margin: 10px 0 16px;
      overflow-x: auto;
      page-break-inside: avoid;
    }

    .diagram-caption {
      font-size: 9pt;
      color: #333;
      text-align: center;
      margin-top: 6px;
      font-style: italic;
    }

    .flow-steps {
      counter-reset: step;
      list-style: none;
      padding-left: 0;
    }

    .flow-steps li {
      counter-increment: step;
      position: relative;
      padding: 6px 8px 6px 36px;
      margin-bottom: 6px;
      background: transparent;
      border: none;
      border-bottom: 1px solid #ddd;
      border-radius: 0;
    }

    .flow-steps li::before {
      content: counter(step) ".";
      position: absolute;
      left: 0;
      top: 6px;
      width: auto;
      height: auto;
      border-radius: 0;
      background: transparent;
      color: #000;
      font-weight: 700;
      font-size: 11pt;
      line-height: 1.4;
    }

    .timeline {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin: 10px 0 14px;
    }

    .timeline .slot {
      text-align: center;
      border: 1px solid #000;
      border-top: 3px solid var(--navy);
      padding: 10px 6px;
      background: #fff;
      font-weight: 700;
      font-size: 10pt;
    }

    .timeline .slot span {
      display: block;
      font-weight: 400;
      font-size: 8.5pt;
      color: #333;
      margin-top: 4px;
    }

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin: 10px 0 14px;
    }

    .card h4 {
      margin-top: 0;
      color: var(--navy);
      border-bottom: 1px solid #ccc;
      padding-bottom: 4px;
    }

    .sign-line {
      margin-top: 36px;
      border-top: 1px solid #000;
      width: 280px;
      padding-top: 6px;
      font-size: 10pt;
    }

    .exclu { font-size: 10pt; color: #333; }

    h1.doc-title { display: none; }

    @media print {
      body { background: white; }
      .page { padding: 0; max-width: none; }
      .diagram, table.data { break-inside: avoid; }
      a { color: inherit; text-decoration: none; }
    }

    @media screen {
      body { background: #ececec; }
      .page {
        margin: 16px auto;
        box-shadow: 0 1px 8px rgba(0,0,0,0.12);
        padding: 0.7in 0.85in 0.95in;
      }
      .doc-footer-screen {
        display: block;
        margin-top: 28px;
        padding-top: 8px;
        border-top: 1px solid #ccc;
        font-family: Cambria, "Times New Roman", serif;
        font-size: 8pt;
        text-align: center;
        color: #000;
      }
    }
  </style>
"""

html = re.sub(r"<style>.*?</style>", new_style.strip(), html, count=1, flags=re.S)

cover = f"""
  <div class="page">
    <section class="cover">
      <div class="logo-wrap">
        <img src="data:image/png;base64,{logo_b64}" alt="Fresh Bus" />
      </div>
      <p class="cover-kicker">SOW Document to</p>
      <h1 class="cover-title">Peer Competitor<br />Analysis Dashboard</h1>
      <div class="summary-plain">
        <div class="sum-head">Document Summary</div>
        <p class="sum-line">Author: Ayush Jain</p>
        <p class="sum-line">Last Update Date: 07-September-2026</p>
        <p class="sum-line">CR Version Number: 2.0</p>
        <p class="sum-line">Project Name: Peer Competitor Analysis Dashboard</p>
      </div>
      <p class="proprietary">
        This statement of work is proprietary of Freshbus Private Limited and contains trade secrets and confidential
        information which is solely the property of Freshbus. This statement of work is intended for Freshbus Security
        internal use only. Therefore, it shall not be used, reproduced, copied, disclosed and transmitted, in whole or
        in part, without the express consent of Freshbus.
      </p>
    </section>

"""

html = re.sub(
    r'<body>\s*<div class="page">.*?(?=<!-- ========== TECHNICAL EVALUATION ========== -->)',
    "<body>\n" + cover,
    html,
    count=1,
    flags=re.S,
)

html = html.replace(
    """    <div class="doc-footer">
      This document is the intellectual property of Freshbus Private Limited. Any unauthorized use shall not be entertained.
      &nbsp;|&nbsp; Peer Competitor Analysis Dashboard — SOW V2.0
    </div>
  </div>""",
    """    <div class="doc-footer-screen">
      This document is the intellectual property of Freshbus Private Limited. Any unauthorized use shall not be entertained.
    </div>
  </div>""",
)

html = html.replace("primaryBorderColor: '#0077b6'", "primaryBorderColor: '#1f4679'")
html = html.replace("lineColor: '#0077b6'", "lineColor: '#1f4679'")
html = html.replace("primaryColor: '#e8f4fb'", "primaryColor: '#eef3f8'")
html = html.replace(
    "fontFamily: 'Calibri, Segoe UI, Arial, sans-serif'",
    "fontFamily: 'Calibri, Aptos, Arial, sans-serif'",
)

html_path.write_text(html, encoding="utf-8")
print("HTML updated")

from playwright.sync_api import sync_playwright

file_url = html_path.resolve().as_uri()
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(file_url, wait_until="networkidle")
    page.wait_for_timeout(3000)
    page.pdf(
        path=str(pdf_path),
        format="Letter",
        print_background=True,
        display_header_footer=True,
        header_template="<span></span>",
        footer_template="""
          <div style="width:100%; text-align:center; font-size:8pt; font-family:Cambria, Times New Roman, serif; color:#000; padding:0 0.6in;">
            This document is the intellectual property of Freshbus Private Limited. Any unauthorized use shall not be entertained.
            &nbsp;&nbsp;&nbsp;<span class="pageNumber"></span>
          </div>
        """,
        margin={
            "top": "0.75in",
            "bottom": "0.85in",
            "left": "0.85in",
            "right": "0.85in",
        },
    )
    browser.close()

print("PDF written", pdf_path, "size", pdf_path.stat().st_size)
