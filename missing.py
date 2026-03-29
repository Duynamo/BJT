import pandas as pd
import json

df = pd.read_excel('敬語・ビジネス日本語(Database).xlsx', sheet_name=0)
missing_examples = []

for i in range(len(df)):
    row = df.iloc[i].fillna("").to_dict()
    word = str(row.get('Unnamed: 1', '')).strip()
    example = str(row.get('Unnamed: 5', '')).strip()
    
    # filter out empty rows or Day X rows
    if word and not word.lower().startswith('day ') and not example:
        missing_examples.append({"word": word})

with open('missing.json', 'w', encoding='utf-8') as f:
    json.dump(missing_examples, f, ensure_ascii=False, indent=2)

print("Saved missing to missing.json")
