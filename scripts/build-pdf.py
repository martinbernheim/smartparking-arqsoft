"""Genera docs/SmartParking_Parte1.pdf insertando los archivos marcados con <!-- include: ... -->.

Requiere pandoc y Google Chrome. Uso: python scripts/build-pdf.py
"""
import pathlib, re, shutil, subprocess, sys, tempfile

DOCS = pathlib.Path(__file__).resolve().parent.parent / "docs"
SRC = DOCS / "SmartParking_Parte1.md"
OUT = DOCS / "SmartParking_Parte1.pdf"
CHROME = shutil.which("chrome") or r"C:\Program Files\Google\Chrome\Application\chrome.exe"
CSS = """@page{size:A4;margin:16mm 14mm}body{font-family:"Segoe UI",Arial,sans-serif;font-size:10pt;line-height:1.4;color:#111;max-width:none}
h1{font-size:18pt;border-bottom:2px solid #2b5797;padding-bottom:4px}h2{font-size:14pt;color:#2b5797;margin-top:18px;page-break-after:avoid}
h3{font-size:12pt;page-break-after:avoid}h4{font-size:10.5pt;page-break-after:avoid}
table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:8.5pt}th,td{border:1px solid #999;padding:3px 5px;vertical-align:top}
th{background:#e6edf7}tr{page-break-inside:avoid}img{max-width:100%;display:block;margin:6px auto;page-break-inside:avoid}
code{font-family:Consolas,monospace;font-size:8.5pt;background:#f3f3f3;padding:0 2px}pre{background:#f3f3f3;padding:6px;font-size:8pt;white-space:pre-wrap}
hr{border:0;border-top:1px solid #ccc}figcaption{display:none}"""


def expand(text: str) -> str:
    def repl(m):
        body = (DOCS / m.group(1)).read_text(encoding="utf-8")
        # el ADR se anida bajo la sección 4: # -> ###, ## -> ####
        return re.sub(r"^(#+) ", lambda h: "#" * (len(h.group(1)) + 2) + " ", body, flags=re.M)
    text = re.sub(r"<!-- include: (\S+) -->\n.*?\n", repl, text)
    return text


def main():
    md = expand(SRC.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        (tmp / "doc.md").write_text(md, encoding="utf-8")
        (tmp / "style.css").write_text(CSS, encoding="utf-8")
        subprocess.run(["pandoc", str(tmp / "doc.md"), "-f", "gfm", "-t", "html5", "-s",
                        "--metadata", "pagetitle=SmartParking", "-c", str(tmp / "style.css"),
                        "--resource-path", str(DOCS), "--embed-resources", "-o", str(tmp / "doc.html")], check=True)
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        f"--print-to-pdf={OUT}", (tmp / "doc.html").as_uri()], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"PDF generado: {OUT}")


if __name__ == "__main__":
    sys.exit(main())
