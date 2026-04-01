import re

with open('/Users/necxa/new design system/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

style_match = re.search(r'<style>(.*?)</style>', html, flags=re.DOTALL)
if style_match:
    css = style_match.group(1).strip()
    # Let's add specific grid helpers for planner to style.css
    css += """
/* ─── PLANNER GRIDS ─── */
.planner-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 24px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1.2fr; gap: 12px; align-items: end; }
.form-group label { display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px; }
.form-group select, .form-group input { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 12px; font-size: 13px; color: var(--text-primary); outline: none; font-family: inherit; }
.form-group select:focus, .form-group input:focus { border-color: var(--accent); }
.btn-primary { background: var(--accent); color: white; border: none; border-radius: var(--radius-sm); padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s; height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.btn-primary:hover { opacity: 0.9; }
.status-pill { background: #FFFBEB; color: #B45309; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; border: 1px solid #FEF3C7; }
.progress-container { width: 100%; background: var(--bg); border-radius: 10px; height: 6px; overflow: hidden; margin-top: 4px; }
.progress-bar { height: 100%; border-radius: 10px; }
.action-box { background: var(--text-primary); border-radius: var(--radius); padding: 20px; color: white; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; }
.action-box h2 { font-size: 14px; font-weight: 700; color: var(--accent-light); margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; }
.action-box p { font-size: 12px; color: #A8ABBE; margin-bottom: 16px; line-height: 1.5; }
.action-box ul { list-style: none; margin-bottom: 24px; font-size: 11px; color: #CBD5E1; }
.action-box li { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.action-box li i { color: var(--green); }
.btn-white { background: white; color: var(--text-primary); border: none; border-radius: var(--radius-sm); padding: 12px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.15s; }
.btn-white:hover { background: var(--bg); }
.btn-outline { background: rgba(255,255,255,0.05); color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-sm); padding: 10px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.btn-outline:hover { background: rgba(255,255,255,0.1); }
"""
    with open('/Users/necxa/new design system/style.css', 'w', encoding='utf-8') as f:
        f.write(css)
    
    new_html = html[:style_match.start()] + '<link rel="stylesheet" href="style.css">' + html[style_match.end():]
    with open('/Users/necxa/new design system/index.html', 'w', encoding='utf-8') as f:
        f.write(new_html)
