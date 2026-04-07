import re

toeic_path = r"C:\Users\Laptop\OneDrive\Desktop\Toeic Data\Toeic-Web-App\app.js"
bjt_path = r"c:\Users\Laptop\OneDrive\Desktop\BJT Data\BJT-Web-App\app.js"

with open(toeic_path, 'r', encoding='utf-8') as f:
    toeic_lines = f.readlines()

with open(bjt_path, 'r', encoding='utf-8') as f:
    bjt_lines = f.readlines()

# Find where Hardcore Logic starts in TOEIC
toeic_start = -1
for i, line in enumerate(toeic_lines):
    if '// -- HARDCORE MODE LOGIC --' in line:
        toeic_start = i
        break

# Find where Hardcore Logic starts in BJT
bjt_start = -1
for i, line in enumerate(bjt_lines):
    if '// -- HARDCORE MODE LOGIC --' in line:
        bjt_start = i
        break

if toeic_start != -1 and bjt_start != -1:
    hardcore_code = "".join(toeic_lines[toeic_start:])
    hardcore_code = hardcore_code.replace("TOEIC_DATA", "BJT_DATA")
    
    # Fix savePlan() bug where savePlans was meant
    hardcore_code = re.sub(r'savePlan\(\)', 'savePlans()', hardcore_code)

    # Reconstruct BJT file
    new_bjt_code = "".join(bjt_lines[:bjt_start]) + hardcore_code

    with open(bjt_path, 'w', encoding='utf-8') as f:
        f.write(new_bjt_code)
    print("Migration successful")
else:
    print("Could not find trigger comment")
