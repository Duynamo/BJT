import pandas as pd

url = "https://docs.google.com/spreadsheets/d/1iJrBENRthYzVuK9zPzAZM0J_B3sGXJR9f36w8IA9xM4/export?format=csv&gid=1648383917"

try:
    df = pd.read_csv(url)
    df.to_csv("bjt_data_fixed.csv", index=False, encoding="utf-8-sig")
    
    with open('output_csv.txt', 'w', encoding='utf-8') as f:
        f.write("Columns: " + str(df.columns.tolist()) + "\n")
        f.write("Total rows: " + str(len(df)) + "\n")
        for i in range(min(10, len(df))):
            f.write(f"Row {i}: {df.iloc[i].fillna('').to_dict()}\n")
            
    print("Downloaded successfully.")
except Exception as e:
    print(f"Error downloading: {e}")
