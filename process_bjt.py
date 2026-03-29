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
        if orig == hira or not orig.strip() or re.match(r'^[a-zA-Z0-9]+$', orig):
            ruby_html += orig
        else:
            ruby_html += f"<ruby>{orig}<rt>{hira}</rt></ruby>"
    return ruby_html

def process():
    df = pd.read_csv('bjt_data_fixed.csv')
    
    # Load manual examples if exist
    examples_dict = {}
    if os.path.exists('examples_csv.json'):
        with open('examples_csv.json', 'r', encoding='utf-8') as f:
            examples_dict = json.load(f)
            
    bjt_data = {}
    current_day = 1
    items_count = 0
    words_per_day = 30
    
    for i in range(len(df)):
        row = df.iloc[i].fillna("").to_dict()
        word = str(row.get('Từ vựng', '')).strip()
        meaning = str(row.get('Nghĩa(VN)', '')).strip()
        
        if not word:
            continue
            
        # Distribute into Days automatically
        album_name = f"Day {current_day}"
        
        # Check generated examples
        example = ""
        if word in examples_dict:
            ex_obj = examples_dict[word]
            example = f"{ex_obj['example']}<br><i>{ex_obj['meaning']}</i>"
            
        if not example:
            # simple fallback
            example_text = f"ビジネスの場面で「{word}」は重要なキーワードになります。"
            example_mean = f"Trong tình huống kinh doanh, [{word}] là một từ khóa quan trọng."
            if "。" in word or len(word) > 10: # already a sentence
                example_text = word
                example_mean = meaning
            example = f"{example_text}<br><i>{example_mean}</i>"
            
        obj = {
            "_album": album_name,
            "tu_vung": word,
            "phien_am": to_ruby(word),
            "tu_loai": "BJT",
            "y_nghia": meaning,
            "song_ngu": [
                example.split('<br>')[0] if '<br>' in example else example,
                example.split('<br>')[1].replace('<i>','').replace('</i>','') if '<br>' in example else ""
            ]
        }
        
        if "BJT_Vocab" not in bjt_data:
            bjt_data["BJT_Vocab"] = []
            
        bjt_data["BJT_Vocab"].append(obj)
        items_count += 1
        
        # Next day bucket
        if items_count >= words_per_day:
            items_count = 0
            current_day += 1
            
    # Write to data.js
    with open(r'BJT-Web-App\data.js', 'w', encoding='utf-8') as f:
        f.write("const BJT_DATA = ")
        json.dump(bjt_data, f, ensure_ascii=False, indent=4)
        f.write(";\n")
        
    print(f"Processed into BJT_DATA with {len(bjt_data['BJT_Vocab'])} words.")

if __name__ == "__main__":
    process()
