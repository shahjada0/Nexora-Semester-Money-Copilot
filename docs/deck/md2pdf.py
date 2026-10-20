"""Markdown -> styled HTML -> PDF (Microsoft Edge headless). Mermaid blocks are rendered in the page.

usage: python md2pdf.py <in.md> <out.pdf> <logo.png> "<doc label>" <edge.exe>
"""
import sys, re, base64, html, pathlib, subprocess, datetime
import markdown

src, out_pdf, logo, label, edge = sys.argv[1:6]
md = pathlib.Path(src).read_text(encoding="utf-8")

# Repo-relative links (../lib/x.ts#L12, results.md) mean nothing in a standalone PDF: keep the text, drop the link.
md = re.sub(r"\[([^\]]+)\]\((?!https?://)[^)]+\)", lambda m: m[1] if m[1].startswith("`") else f"`{m[1]}`", md)

body = markdown.markdown(md, extensions=["tables", "fenced_code", "sane_lists"])
body = re.sub(r'<pre><code class="language-mermaid">(.*?)</code></pre>',
              lambda m: f'<pre class="mermaid">{m[1]}</pre>', body, flags=re.S)
logo64 = base64.b64encode(pathlib.Path(logo).read_bytes()).decode()
today = datetime.date.today().strftime("%d %B %Y")

page = f"""<!doctype html><html><head><meta charset="utf-8"><title>{html.escape(label)}</title>
<style>
@page {{ size: A4; margin: 16mm 15mm 18mm 15mm; }}
:root {{ --ink:#14213d; --muted:#5b6478; --brand:#1f4fd6; --navy:#0d1f57; --line:#dbe2ef; --tint:#f3f6fc; }}
* {{ box-sizing: border-box; }}
body {{ font-family: "Segoe UI", Calibri, Arial, sans-serif; color: var(--ink); font-size: 10.5pt; line-height: 1.5; margin: 0; }}
.cover {{ display:flex; align-items:center; gap:14px; padding: 0 0 12px; border-bottom: 2px solid var(--navy); margin-bottom: 18px; }}
.cover img {{ width: 58px; height: auto; }}
.cover .t {{ font-size: 15pt; font-weight: 700; color: var(--navy); }}
.cover .s {{ font-size: 9pt; color: var(--muted); }}
h1 {{ font-size: 20pt; color: var(--navy); margin: 0 0 10px; line-height:1.2; }}
h2 {{ font-size: 14pt; color: var(--navy); margin: 22px 0 8px; break-after: avoid; }}
h3 {{ font-size: 11.5pt; color: var(--brand); margin: 16px 0 6px; break-after: avoid; }}
p, li {{ orphans: 3; widows: 3; }}
code {{ font-family: Consolas, "Courier New", monospace; font-size: 8.8pt; background: var(--tint); padding: 0 3px; border-radius: 3px; }}
pre {{ background: var(--tint); border: 1px solid var(--line); border-radius: 6px; padding: 9px 11px; white-space: pre-wrap; word-break: break-all; font-size: 8.4pt; break-inside: avoid; }}
pre code {{ background: none; padding: 0; font-size: 8.4pt; }}
pre.mermaid {{ background: #fff; border: 1px solid var(--line); text-align: center; word-break: normal; }}
pre.mermaid svg {{ max-height: 105mm; width: auto; }}
table {{ border-collapse: collapse; width: 100%; margin: 8px 0 12px; font-size: 9pt; break-inside: auto; }}
tr {{ break-inside: avoid; }}
th {{ background: var(--navy); color: #fff; text-align: left; font-weight: 600; }}
th, td {{ border: 1px solid var(--line); padding: 5px 7px; vertical-align: top; }}
tr:nth-child(even) td {{ background: #f8faff; }}
blockquote {{ margin: 8px 0; padding: 6px 12px; border-left: 3px solid var(--brand); background: var(--tint); color: var(--ink); }}
a {{ color: var(--brand); }}
.foot {{ margin-top: 24px; padding-top: 8px; border-top: 1px solid var(--line); font-size: 8.5pt; color: var(--muted); }}
</style></head><body>
<div class="cover"><img src="data:image/png;base64,{logo64}" alt="Nexora logo">
<div><div class="t">Semester Money Copilot by Nexora</div>
<div class="s">2026 FinTechathon International Track (WeBank) · Topic C: Cross-border &amp; Student Finance Assistant · {html.escape(label)} · {today}</div></div></div>
{body}
<div class="foot">Sandbox only: no real money moves. Every bank, university, provider and account is fictional; FX rates are real mid-market rates.</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>if (window.mermaid) mermaid.initialize({{ startOnLoad: true, theme: 'neutral', flowchart: {{ htmlLabels: true }} }});</script>
</body></html>"""

html_path = pathlib.Path(out_pdf).with_suffix(".html")
html_path.write_text(page, encoding="utf-8")
subprocess.run([edge, "--headless", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=15000",
                f"--print-to-pdf={pathlib.Path(out_pdf).resolve()}", html_path.resolve().as_uri()], check=True,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
html_path.unlink()
print("wrote", out_pdf)
