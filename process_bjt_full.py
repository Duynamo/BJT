import pandas as pd
import json
import pykakasi
import re
import os

kks = pykakasi.kakasi()

def to_ruby(text):
    if not text or pd.isna(text):
        return ""
    result = kks.convert(str(text))
    ruby_html = ""
    for item in result:
        orig = item['orig']
        hira = item['hira']
        if orig == hira or not orig.strip() or re.match(r'^[a-zA-Z0-9]+$', orig):
            ruby_html += orig
        else:
            ruby_html += f"<ruby>{orig}<rt>{hira}</rt></ruby>"
    return ruby_html

def generate_example(word, meaning):
    word = str(word).strip()
    meaning = str(meaning).strip()
    
    if not word: return ""
    
    # Check if already a sentence
    if "。" in word or "！" in word or "?" in word or len(word) > 12 or "「" in word:
        return f"{word}<br><i>{meaning}</i>"
        
    # Heuristics based on word endings
    if word.endswith("する"):
        ex = f"早急に{word}必要があります。"
        mn = f"Cần phải nhanh chóng {meaning}."
    elif word.endswith("ます") or word.endswith("ません"):
        ex = f"その件につきましては、{word}。"
        mn = f"Về vấn đề đó, {meaning}."
    elif word.endswith("い") and len(word) > 1:
        ex = f"今の状況は非常に{word}と考えます。"
        mn = f"Tôi cho rằng tình hình hiện tại rất {meaning}."
    elif word.endswith("な") and len(word) > 1:
        ex = f"それは{word}問題ですね。"
        mn = f"Đó là một vấn đề {meaning} nhỉ."
    elif word.startswith("お") or word.startswith("ご"):
        ex = f"お客様に{word}申し上げます。"
        mn = f"Xin được {meaning} (hoặc thực hiện {meaning}) tới quý khách."
    else:
        # Noun or short phrase
        ex = f"ビジネスにおいて「{word}」は重要なキーワードです。"
        mn = f"Trong thương mại, [{word}] ({meaning}) là một từ khóa quan trọng."
        
    return f"{ex}<br><i>{mn}</i>"

def process():
    file_name = "bjt_full.xlsx"
    xls = pd.ExcelFile(file_name)
    
    # We also load our manual examples as a layer of override for high quality
    manual_examples = {}
    for json_file in ['examples.json', 'examples_csv.json']:
        if os.path.exists(json_file):
            with open(json_file, 'r', encoding='utf-8') as f:
                manual_examples.update(json.load(f))
                
    bjt_data = {}
    total_processed = 0
    
    for group_name in ["Group 1", "Group 2", "Group 3", "Group 4", "Group 5"]:
        if group_name not in xls.sheet_names:
            print(f"Skipping {group_name}, not found.")
            continue
            
        print(f"Processing {group_name}...")
        df = pd.read_excel(xls, sheet_name=group_name)
        
        # Determine column names since they fluctuate (e.g., Nghĩa (VN) vs Nghĩa(VN))
        cols = df.columns.tolist()
        vocab_col = next((c for c in cols if 'từ vựng' in c.lower()), None)
        mean_col = next((c for c in cols if 'nghĩa' in c.lower()), None)
        ex_col = next((c for c in cols if 'ví dụ' in c.lower()), None)
        
        if not vocab_col:
            print(f"  Missing Vocab column in {group_name}")
            continue
            
        bjt_data[group_name] = []
        current_day = 1
        items_count = 0
        words_per_day = 30
        
        for i in range(len(df)):
            row = df.iloc[i].fillna("").to_dict()
            word = str(row.get(vocab_col, '')).strip()
            meaning = str(row.get(mean_col, '')).strip() if mean_col else ""
            
            # Skip empty
            if not word or word.lower() == 'nan':
                continue
                
            # Example sentence logic
            raw_ex = str(row.get(ex_col, '')).strip() if ex_col else ""
            example_html = ""
            
            # 1. Check if the excel had an example
            if raw_ex:
                # Often excel has "Japanese \n Vietnamese". 
                if '\n' in raw_ex:
                    parts = raw_ex.split('\n', 1)
                    example_html = f"{parts[0]}<br><i>{parts[1]}</i>"
                else:
                    example_html = f"{raw_ex}<br><i>{meaning}</i>"
                    
            # 2. Check manual overrides
            elif word in manual_examples:
                ex_obj = manual_examples[word]
                example_html = f"{ex_obj['example']}<br><i>{ex_obj['meaning']}</i>"
                
            # 3. Auto-generate gracefully
            else:
                example_html = generate_example(word, meaning)
                
            # Distribute into Days
            album_name = f"Day {current_day}"
            
            obj = {
                "_album": album_name,
                "tu_vung": word,
                "phien_am": to_ruby(word),
                "tu_loai": "BJT",
                "y_nghia": meaning,
                "song_ngu": [
                    example_html.split('<br>')[0] if '<br>' in example_html else example_html,
                    example_html.split('<br>')[1].replace('<i>','').replace('</i>','') if '<br>' in example_html else ""
                ]
            }
            
            bjt_data[group_name].append(obj)
            
            items_count += 1
            if items_count >= words_per_day:
                items_count = 0
                current_day += 1
                
        total_processed += len(bjt_data[group_name])
        print(f"  Done {group_name}: {len(bjt_data[group_name])} words.")
        
    # Write output
    with open(r'BJT-Web-App\data.js', 'w', encoding='utf-8') as f:
        f.write("const BJT_DATA = ")
        json.dump(bjt_data, f, ensure_ascii=False, indent=4)
        f.write(";\n")
        
    print(f"\nSuccessfully built BJT_DATA with {total_processed} total words!")

if __name__ == "__main__":
    process()
