import os

toeic_app = r"c:\Users\Laptop\OneDrive\Desktop\Toeic Data\Toeic-Web-App\app.js"
bjt_app = r"c:\Users\Laptop\OneDrive\Desktop\BJT Data\BJT-Web-App\app.js"

toeic_css = r"c:\Users\Laptop\OneDrive\Desktop\Toeic Data\Toeic-Web-App\style.css"
bjt_css = r"c:\Users\Laptop\OneDrive\Desktop\BJT Data\BJT-Web-App\style.css"

with open(toeic_app, 'r', encoding='utf-8') as f:
    js_content = f.read()

# Replace strings
js_content = js_content.replace('TOEIC_DATA', 'BJT_DATA')
js_content = js_content.replace('TOEIC_', 'BJT_')
js_content = js_content.replace('Microsoft Eric', 'Microsoft Nanami')
js_content = js_content.replace('Microsoft Emma', 'Microsoft Keita')
js_content = js_content.replace('en-US', 'ja-JP')

with open(bjt_app, 'w', encoding='utf-8') as f:
    f.write(js_content)

with open(toeic_css, 'r', encoding='utf-8') as f:
    css_content = f.read()

# Replace font
css_content = css_content.replace("'Inter'", "'Noto Sans JP'")
css_content += "\n\nruby { ruby-position: over; }\nrt { color: var(--text-secondary); font-size: 0.6em; }\n"

with open(bjt_css, 'w', encoding='utf-8') as f:
    f.write(css_content)

print("Frontend copied and successfully modified!")
