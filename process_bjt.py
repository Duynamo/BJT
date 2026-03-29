import pandas as pd
import json
import pykakasi
import os
import re

kks = pykakasi.kakasi()

def to_ruby(text):
    if not text:
        return ""
    result = kks.convert(text)
    ruby_html = ""
    for item in result:
        orig = item['orig']
        hira = item['hira']
        # If the original and hiragana are the same (like kana or punctuation), no ruby needed
        if orig == hira or not orig.strip():
            ruby_html += orig
        else:
            ruby_html += f"<ruby>{orig}<rt>{hira}</rt></ruby>"
    return ruby_html

def process():
    df = pd.read_excel('敬語・ビジネス日本語(Database).xlsx', sheet_name=0)
    
    # Try to load generated examples if exists
    examples_dict = {}
    if os.path.exists('examples.json'):
        with open('examples.json', 'r', encoding='utf-8') as f:
            examples_dict = json.load(f)
            
    bjt_data = {}
    current_album = "Day 1"
    
    for i in range(len(df)):
        row = df.iloc[i].fillna("").to_dict()
        col1 = str(row.get('Unnamed: 1', '')).strip()
        reading = str(row.get('Unnamed: 2', '')).strip()
        meaning = str(row.get('Unnamed: 4', '')).strip()
        example = str(row.get('Unnamed: 5', '')).strip()
        
        if not col1:
            continue
            
        if col1.lower().startswith('day '):
            current_album = col1
            continue
            
        # Vocabulary found
        word = col1
        
        # Check generated examples
        if not example and word in examples_dict:
            ex_obj = examples_dict[word]
            example = f"{ex_obj['example']}<br><i>{ex_obj['meaning']}</i>"
            
        # If STILL no example, we put a default simple one placeholder, 
        # but our generated examples should cover it
        if not example:
            example = f"このビジネス状況では「{word}」という言葉をよく使います。<br><i>Trong tình huống kinh doanh này từ [{word}] được sử dụng thường xuyên.</i>"
            
        # Audio text: the plain text to read
        plain_example = re.sub(r'<[^>]+>', '', example).split('Trong')[0].split('(')[0].strip()
            
        obj = {
            "_album": current_album,
            "tu_vung": word,
            "phien_am": to_ruby(word), # Furigana shown on the back
            "tu_loai": "BJT",
            "y_nghia": meaning,
            "song_ngu": [
                example.split('<br>')[0] if '<br>' in example else example, # EN/JP
                example.split('<br>')[1].replace('<i>','').replace('</i>','') if '<br>' in example else ""  # VI
            ]
        }
        
        # BJT words grouped under "BJT_Vocab" category
        if "BJT_Vocab" not in bjt_data:
            bjt_data["BJT_Vocab"] = []
            
        bjt_data["BJT_Vocab"].append(obj)
        
    # Write to data.js
    with open(r'BJT-Web-App\data.js', 'w', encoding='utf-8') as f:
        f.write("const BJT_DATA = ")
        json.dump(bjt_data, f, ensure_ascii=False, indent=4)
        f.write(";\n")
        
    print(f"Processed into BJT_DATA with {len(bjt_data['BJT_Vocab'])} words.")

if __name__ == "__main__":
    process()
