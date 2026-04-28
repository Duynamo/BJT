import pandas as pd
from pykakasi import kakasi
import os
import time
import json
from deep_translator import GoogleTranslator
import google.generativeai as genai

# --- Cấu hình Danh sách API Keys ---
# Nhập 15 keys của bạn vào danh sách này
API_KEYS = [
    'AIzaSyCE6tmu6Hc86rIemkZ5NOl34cDQU4wVUGE',
    'AIzaSyBl3S0jVmqHxE5JaZQiINLb_1Hd5hksaHU',
    'AIzaSyDeiLa5tO5af6Q7WLC5eAGJyLYqpBe5vlQ',
    'AIzaSyBAS-A3igtzOCtP04lOIMWF5Ckae0vLlis',
    'AIzaSyA438y_Ia-mX-vJ3YQacRSQiTQNaTM3Bek',
    'AIzaSyDO4pumRSF3HL_EETgDoWvi53xzD7T3J8g',
    'AIzaSyC8jjKoLsUkyeldRr5yzTg7ZlQ4aO250dg',
    'AIzaSyC8jjKoLsUkyeldRr5yzTg7ZlQ4aO250dg',
    # Thêm tiếp các key khác vào đây...
]

current_key_index = 0

def configure_gemini():
    """Hàm cấu hình lại thư viện với Key hiện tại"""
    global current_key_index
    genai.configure(api_key=API_KEYS[current_key_index])
    return genai.GenerativeModel('gemini-2.5-flash')

# Khởi tạo model lần đầu tiên
model = configure_gemini()

# ==========================================
# 2. CẤU HÌNH FILE VÀ CỘT DỮ LIỆU
# ==========================================
input_filename = 'bjt_full.xlsx'
output_filename = 'bjt_full_with_furigana.xlsx'
sheets_to_process = [f'Group {i}' for i in range(1, 7)] # Quét từ Group 1 đến Group 6
vocab_column_header = 'Từ vựng'
furigana_column_header = 'Furigana'
meaning_column_header = 'Nghĩa'
example_column_header = 'Ví dụ'

BATCH_SIZE = 15 # Gom 15 từ vựng vào 1 lần gọi API

# ==========================================
# 3. CÁC HÀM XỬ LÝ CHÍNH
# ==========================================

def generate_examples_batch(vocab_list):
    """Gửi danh sách từ vựng lên Gemini và xoay vòng key nếu bị lỗi"""
    global current_key_index, model
    
    if not vocab_list:
        return {}

    prompt = f"""
    Bạn là một chuyên gia tiếng Nhật thương mại. 
    Tôi có danh sách từ vựng BJT sau: {json.dumps(vocab_list, ensure_ascii=False)}
    Hãy viết cho mỗi từ một câu ví dụ tiếng Nhật (phù hợp với môi trường công sở, trình độ BJT).
    TRẢ VỀ KẾT QUẢ CHỈ DƯỚI DẠNG JSON HỢP LỆ. 
    Định dạng mong muốn: {{"từ_vựng_1": "câu_ví_dụ_1", "từ_vựng_2": "câu_ví_dụ_2"}}
    Tuyệt đối không giải thích, không in thêm bất kỳ văn bản nào ngoài JSON.
    """
    
    # Cho phép số lần thử lại bằng đúng số lượng Key bạn có nhân 2 để đảm bảo
    max_retries = len(API_KEYS) * 2 
    
    for attempt in range(max_retries):
        try:
            response = model.generate_content(prompt)
            raw_text = response.text.strip()
            
            # Làm sạch dữ liệu JSON phòng trường hợp AI bọc trong thẻ markdown
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            if raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
                
            result_dict = json.loads(raw_text.strip())
            return result_dict
        
        except Exception as e:
            if "429" in str(e) or "Resource has been exhausted" in str(e): # Lỗi Rate Limit
                print(f"      [!] Key số {current_key_index + 1} quá tải. Đang chuyển sang Key tiếp theo...")
                # Xoay vòng index sang key tiếp theo (nếu đến cuối thì quay lại 0)
                current_key_index = (current_key_index + 1) % len(API_KEYS)
                model = configure_gemini() # Cấu hình lại model với key mới
                time.sleep(1) # Nghỉ 1 nhịp rất ngắn rồi chạy ngay lập tức
            else:
                print(f"      [!] Lỗi API/Parse JSON (Lần thử {attempt + 1}/{max_retries}): {e}")
                time.sleep(3)
    return {}

def process_excel():
    if not os.path.exists(input_filename):
        print(f"Lỗi: Không tìm thấy file '{input_filename}'.")
        return

    kks_instance = kakasi()
    translator = GoogleTranslator(source='ja', target='vi')

    try:
        with pd.ExcelWriter(output_filename, engine='openpyxl') as writer:
            print(f"Đang bắt đầu xử lý file '{input_filename}'...")
            xls = pd.ExcelFile(input_filename)
            
            for sheet_name in xls.sheet_names:
                print(f"\n--- Đang xử lý sheet: '{sheet_name}' ---")
                df = pd.read_excel(xls, sheet_name=sheet_name)

                if sheet_name in sheets_to_process:
                    if vocab_column_header not in df.columns:
                        print("  -> Lỗi: Không tìm thấy cột 'Từ vựng'. Bỏ qua sheet này.")
                        df.to_excel(writer, sheet_name=sheet_name, index=False)
                        continue

                    # Khởi tạo cột nếu chưa có và ép kiểu object để tránh lỗi float64
                    for col in [furigana_column_header, meaning_column_header, example_column_header]:
                        if col not in df.columns:
                            df[col] = ''
                        df[col] = df[col].astype('object')

                    # BƯỚC 1: Xử lý Furigana, Dịch nghĩa & Lọc từ thiếu ví dụ
                    words_needing_examples = []
                    
                    for index, row in df.iterrows():
                        vocab = row[vocab_column_header]
                        current_meaning = row[meaning_column_header]
                        current_example = row[example_column_header]

                        if isinstance(vocab, str) and vocab.strip():
                            # Xử lý Furigana
                            df.at[index, furigana_column_header] = ''.join([item['hira'] for item in kks_instance.convert(vocab)])

                            # Xử lý dịch thuật (nếu trống)
                            if pd.isna(current_meaning) or str(current_meaning).strip() == '':
                                try:
                                    df.at[index, meaning_column_header] = translator.translate(vocab)
                                except Exception:
                                    pass
                            
                            # Đưa từ vựng thiếu ví dụ vào danh sách chờ xử lý AI
                            if pd.isna(current_example) or str(current_example).strip() == '':
                                words_needing_examples.append(vocab)
                        else:
                            df.at[index, furigana_column_header] = ''
                    
                    # BƯỚC 2: Gửi danh sách từ vựng lên Gemini theo từng Batch
                    if words_needing_examples:
                        print(f"  -> Cần tạo ví dụ cho {len(words_needing_examples)} từ vựng. Đang kết nối AI...")
                        
                        example_dictionary = {}
                        # Cắt danh sách thành các mảng nhỏ (batch)
                        for i in range(0, len(words_needing_examples), BATCH_SIZE):
                            batch = words_needing_examples[i:i + BATCH_SIZE]
                            print(f"     * Đang xử lý cụm {i//BATCH_SIZE + 1} ({len(batch)} từ)...")
                            
                            batch_results = generate_examples_batch(batch)
                            example_dictionary.update(batch_results)
                            
                            # Nghỉ 2 giây giữa các batch để đường truyền ổn định
                            time.sleep(2) 
                        
                        # BƯỚC 3: Ghi dữ liệu ví dụ từ AI vào DataFrame
                        for index, row in df.iterrows():
                            vocab = row[vocab_column_header]
                            if vocab in example_dictionary and str(df.at[index, example_column_header]).strip() == '':
                                df.at[index, example_column_header] = example_dictionary[vocab]
                                
                    print(f"  -> Hoàn thành sheet '{sheet_name}'.")
                else:
                    print(f"  -> Sheet này không nằm trong danh sách xử lý, sao chép nguyên trạng.")

                # Lưu DataFrame vào file Excel mới
                df.to_excel(writer, sheet_name=sheet_name, index=False)

        print(f"\n[THÀNH CÔNG] File hoàn chỉnh đã được lưu tại '{output_filename}'.")

    except Exception as e:
        print(f"\n[LỖI NGHIÊM TRỌNG] Quá trình xử lý bị gián đoạn: {e}")

if __name__ == '__main__':
    print("=====================================================")
    print("  TỰ ĐỘNG HÓA TẠO FURIGANA, DỊCH NGHĨA VÀ VÍ DỤ BJT  ")
    print("=====================================================")
    process_excel()