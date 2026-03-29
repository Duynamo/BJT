import pandas as pd
import urllib.request

url = "https://docs.google.com/spreadsheets/d/1iJrBENRthYzVuK9zPzAZM0J_B3sGXJR9f36w8IA9xM4/export?format=xlsx"
file_name = "bjt_full.xlsx"

print("Downloading...")
urllib.request.urlretrieve(url, file_name)
print("Downloaded. Reading sheets...")

xls = pd.ExcelFile(file_name)
for sheet_name in xls.sheet_names:
    df = pd.read_excel(xls, sheet_name=sheet_name)
    print(f"\nSheet: {sheet_name}")
    print("Columns:", df.columns.tolist())
    print("Total rows:", len(df))
    if len(df) > 0:
        print("First row:", df.iloc[0].dropna().to_dict())
