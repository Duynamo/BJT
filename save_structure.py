import pandas as pd

file_name = "bjt_full.xlsx"
xls = pd.ExcelFile(file_name)

with open('structure.txt', 'w', encoding='utf-8') as f:
    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name)
        f.write(f"\nSheet: {sheet_name}\n")
        f.write(f"Columns: {df.columns.tolist()}\n")
        f.write(f"Total rows: {len(df)}\n")
        if len(df) > 0:
            row = df.iloc[0].dropna().to_dict()
            f.write(f"First row: {row}\n")
            
print("Structure saved.")
