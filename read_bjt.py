import pandas as pd
import json

df = pd.read_excel('敬語・ビジネス日本語(Database).xlsx', sheet_name=0)
with open('output.txt', 'w', encoding='utf-8') as f:
    f.write("Columns: " + str(df.columns.tolist()) + "\n")
    f.write("Total rows: " + str(len(df)) + "\n")
    
    # Just print the first 20 rows to see the column meaning
    for i in range(min(20, len(df))):
        # replace nan with None or omit
        row_dict = df.iloc[i].dropna().to_dict()
        f.write(f"Row {i}: {json.dumps(row_dict, ensure_ascii=False)}\n")

# We want to identify the columns for Kanji, Reading, Meaning, Example. 
# We'll see from the output first.
