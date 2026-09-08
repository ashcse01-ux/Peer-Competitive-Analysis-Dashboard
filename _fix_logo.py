from pathlib import Path
import base64
import re
from PIL import Image

root = Path(r"c:\Users\Ayush Jain\Peer-Competitive-Analysis-Dashboard")
src = root / "_freshbus_logo.png"
im = Image.open(src).convert("RGBA")
pixels = im.load()
w, h = im.size
for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        if r < 40 and g < 40 and b < 40:
            pixels[x, y] = (0, 0, 0, 0)
im.save(src)

b64 = base64.b64encode(src.read_bytes()).decode("ascii")
(root / "_logo_b64.txt").write_text(b64, encoding="utf-8")

html_path = root / "Competitor Peer Analysis Dashboard SOW V2.0.html"
html = html_path.read_text(encoding="utf-8")
html2, n = re.subn(
    r'(src="data:image/png;base64,)[A-Za-z0-9+/=]+(")',
    r"\g<1>" + b64 + r"\2",
    html,
    count=1,
)
html_path.write_text(html2, encoding="utf-8")
print("html logo replacements", n)
print("logo cleaned", src.stat().st_size)
