import pandas as pd
import json

df = pd.read_csv("bjt_data_fixed.csv")
words = df['Từ vựng'].dropna().tolist()

with open('new_words.json', 'w', encoding='utf-8') as f:
    json.dump(words, f, ensure_ascii=False)
