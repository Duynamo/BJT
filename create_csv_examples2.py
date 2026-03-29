import json
import os

with open('examples_csv.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

new_data = {
    "セールポイント": {"example": "この車の最大のセールポイントは燃費の良さです。", "meaning": "Điểm bán hàng (ưu điểm thu hút khách) lớn nhất của xe này là khả năng tiết kiệm nhiên liệu."},
    "長持ちする": {"example": "品質が良く、長持ちする製品を開発する。", "meaning": "Phát triển các sản phẩm bền lâu vì chất lượng tốt."},
    "取り込む": {"example": "顧客の意見を製品開発に取り込む。", "meaning": "Tiếp thu (áp dụng) ý kiến của khách hàng vào phát triển sản phẩm."},
    "段取り": {"example": "会議をスムーズに行うため、事前の段取りを徹底する。", "meaning": "Thực hiện triệt để công đoạn (sắp xếp chi tiết) chuẩn bị từ trước để hội nghị diễn ra êm đẹp."},
    "出願": {"example": "新しい技術の特許を出願しました。", "meaning": "Chúng tôi đã nộp đơn đăng ký cấp bằng sáng chế công nghệ mới."},
    "二本立て": {"example": "サービスは月額制と従量制の二本立てで提供する。", "meaning": "Dịch vụ được cung cấp chạy song song 2 nhánh: thu theo tháng và trả theo lượng sử dụng."},
    "比率が伸びる": {"example": "ネット通販の売上比率が急速に伸びている。", "meaning": "Tỷ trọng doanh số bán lẻ online đang tăng tốc cực kỳ nhanh."},
    "直行する": {"example": "明日は朝から取引先へ直行します。", "meaning": "Sáng mai tôi sẽ đi thẳng tới phía đối tác mà không lên công ty."},
    "場合によっては。。。かも": {"example": "場合によっては、スケジュールを前倒しするかもしれません。", "meaning": "Tùy thuộc vào hoàn cảnh có thể là... lịch trình sẽ bị hoãn sớm đi chẳng hạn."},
    "他社に先駆けして": {"example": "他社に先駆けして、自動運転技術を市場に投入した。", "meaning": "Chúng tôi tung ra thị trường công nghệ lái tự động trước các công ty khác (tiên phong)."},
    "予測背景": {"example": "売上低下の予測背景には、不況の影響がある。", "meaning": "Nền tảng gây dự đoán tụt giảm doanh số là do hậu quả suy thoái kinh tế."},
    "刺身に目がない": {"example": "彼は新鮮な刺身には目がない。", "meaning": "Anh ấy rất thích (thích đến mờ mắt / ghiền) món cá sống sashimi."},
    "日本通の方": {"example": "彼らは日本通の方で、日本の文化に詳しい。", "meaning": "Họ là những người am hiểu sành sỏi về Nhật và rất nắm rõ văn hóa Nhật."},
    "カジュアルなお店": {"example": "打ち合わせの後、カジュアルなお店で食事をした。", "meaning": "Sau khi bàn bạc gặp gỡ, chúng tôi đã dùng bữa tại một cửa tiệm có phong cách đời thường casual."},
    "日用品": {"example": "日用品のコストを抑えるよう、価格を見直す。", "meaning": "Điều chỉnh xem xét lại chi phí để cắt giảm các món đồ nhu yếu phẩm hàng ngày."},
    "侮れない　あなどれない": {"example": "彼らの技術力は非常に高く、全く侮れない（あなどれない）。", "meaning": "Năng lượng làm việc của họ rất cao, không thể khinh thường (coi nhẹ) được."},
    "避けて通れない": {"example": "IT化の波は、どの企業にとっても避けて通れない課題だ。", "meaning": "Làn sóng hóa IT là đề tài mà bất kỳ doanh nghiệp nào cũng không né ngơ (không thể lơ được)."},
    "初っ端　しょっぱら": {"example": "ミーティングの初っ端（しょっぱら）で、厳しい指摘を受けた。", "meaning": "Ngay từ lúc vừa bắt đầu (phát súng đầu tiên) của cuộc họp, tôi đã bị chỉ trích gay gắt."},
    "学校出たての学生": {"example": "学校出たての学生にもわかりやすい研修資料を作る。", "meaning": "Làm ra tài liệu thực tập sao cho kể cả hs SV vừa mới tốt nghiệp ra trường cũng hiểu."},
    "入社早々　にゅうしゃそうそう": {"example": "入社早々（にゅうしゃそうそう）、大きなプロジェクトを任された。", "meaning": "Vừa vào công ty sớm đã giao cho việc làm dự án lớn."},
    "短期融資": {"example": "設備の資金不足をカバーするため、銀行から短期融資を受けた。", "meaning": "Để đắp vốn thiếu trang bị thiết bị, công ty vay tín dụng vay tiêu dùng kỳ hạn ngắn (vay ngắn hạn)."},
    "短期貸し借り": {"example": "業者間での短期貸し借りを行って資金を調整する。", "meaning": "Thực hiện vay tài sản tạm thời giữa các doanh nghiệp để thu xếp duy trì vốn."},
    "手を打とう」": {"example": "問題が大きくなる前に、早めに手を打とう。", "meaning": "Trước khi sự việc nghiêm trọng, chúng ta hãy can thiệp ra tay thỏa thuận giải quyết sớm."},
    "スポットを当てる": {"example": "このドキュメンタリー番組は、職人の技術にスポットを当てている。", "meaning": "Chương trình phim tài liệu này nhắm tâm điểm chú ý (rọi đèn) vào kỹ năng của những người thợ làm nghề."},
    "近場": {"example": "今年の社員旅行は、予算の都合で近場の温泉にした。", "meaning": "Kỳ đi chơi du lịch công ty năm nay lo ngân sách nên chúng tôi đã dọn suối nước nóng loanh quanh gần đây."},
    "主力に入れる": {"example": "来年の販売戦略では、エコ家電を主力に入れる。", "meaning": "Trong dự án bán hàng năm sau, những sản phẩm Điện thân thiện sẽ đưa lên hàng ngũ sản phẩm chủ lực."},
    "査収": {"example": "添付書類をご査収ください。", "meaning": "Vui lòng kiểm tra kiểm thu tài liệu được nhận (gửi đính kèm)."},
    "厭わない": {"example": "目標達成のためなら、どんな労力も厭わない（いとわない）。", "meaning": "Nếu là để hoàn thành được mục tiêu, tôi không quản ngại (không chối từ) bất kỳ gánh nặng nỗ lực nào."},
    "人からならぬ": {"example": "プロジェクトの成功は、彼女の人からならぬ努力のおかげだ。", "meaning": "Thành công của dự án là nhờ vào sự cống hiến đặc biệt (không phải người bthuong) của cô ấy."},
    "人からならぬおせわになりました。": {"example": "本当にお世話になりました。", "meaning": "Bạn đã rất vất vả giúp đỡ tôi nhiều hơn những người bình thường."},
    "機材スペース": {"example": "新しい機材スペースを確保するために、オフィスのレイアウトを変更する。", "meaning": "Chúng tôi sửa đổi bố cục VP nhằm lấy không gian diện tích đặt thiết bị (máy móc) mới."},
    "デスクトップ": {"example": "仕事用に性能の良いデスクトップパソコンを購入した。", "meaning": "Đã mua con PC DeskTop phục vụ chạy việc khỏe."},
    "貸付": {"example": "低金利での貸付を受けるため、申請書を提出した。", "meaning": "Vì nhận vay nợ với lãi rẻ nên tôi đã nộp giấy thẩm định."},
    "用意周到": {"example": "彼のプレゼンはいつも用意周到で隙がない。", "meaning": "Trình bày PowerPoint của anh ấy lúc nào cũng có sự chuẩn bị chu đáo thấu đáo."},
    "メンテナンス": {"example": "サーバーのメンテナンスのため、深夜にシステムが停止する。", "meaning": "Do bảo trì hệ thống nên máy chủ Server sẽ ngưng hđ buổi đêm."},
    "外壁の塗装　（がいへきのとそう）": {"example": "事務所の外壁の塗装を業者に依頼した。", "meaning": "Đã thuê người sơn sửa tường sơn ngoại thất Tòa nhà."},
    "アフターサービス": {"example": "当社は販売後のアフターサービスに力を入れています。", "meaning": "Tập đoàn công ty chúng tôi chú trọng dịch vụ hậu mãi Customer Care Service."},
    "聞き耳を持たず": {"example": "再三の警告にもかかわらず、彼は聞き耳を持たずトラブルを繰り返した。", "meaning": "Bất chấp nhiều lần cảnh báo, anh ấy hoàn toàn cự tuyệt (không có nghe)."},
    "拒否感": {"example": "新しいシステムの導入に対し、一部の社員から強い拒否感が示された。", "meaning": "Đối với việc ứng dụng Hệ điều hành mới, vài cá nhân đã ra tay phản kháng chối rũ cảm giác bị từ chối."},
    "生き残れない": {"example": "変化に対応できなければ、この激しい競争市場では生き残れない。", "meaning": "Nếu không ứng phó được những chuyển biến thì chẳng thể sống dai trong thị trường cực kỳ bạo liệt này."},
    "詰め替え": {"example": "環境保護のため、シャンプーの詰め替え用製品を推進する。", "meaning": "Để bảo tồn rác nhựa mtrg, Thúc đẩy mua bán spham bịch chiết gội đầu Refill."},
    "主力製品": {"example": "当社の主力製品は、スマートフォン向けの半導体です。", "meaning": "Sản phẩm trụ cột chính của công ty chúng là bóng bán dẫn của ĐT di động."},
    "お客様のお金を落とす": {"example": "お客様により多くのお金を落としてもらうため、新サービスを展開する。", "meaning": "Khai phá dv mới để quý khách chi móc thêm hầu bao tiêu tiền thả xèng."},
    "翌年": {"example": "赤字を計上したが、翌年にはV字回復を果たした。", "meaning": "Mặc dù tính ra là lỗ đấy, nhưng năm sau thì gỡ lại đền đáp."},
    "昨年": {"example": "昨年の業績が好調だったため、特別ボーナスが支給された。", "meaning": "Vì năm ngoái tiến độ kte tốt nên phần thưởng ưu tú được cung cấp."},
    "原点に立ち返る": {"example": "経営が苦しい時こそ、原点に立ち返る必要がある。", "meaning": "Trở lại lúc đầu điểm xuất phát."},
    "重点を置く": {"example": "これからは海外市場の開拓に重点を置く方針だ。", "meaning": "Kể từ vạch ra chính sách nhằm Đẩy Mạng Nhấn Trọng Điểm thu hút vào MTrg nước ngoài."},
    "形にする": {"example": "皆のアイデアをまとめ、一つの形にするのが私の仕事です。", "meaning": "Công việc của tôi là gộp ý kiến của mn để Nhào nặng lên thành hình."},
    "長い目で": {"example": "若手社員の育成は、長い目で見る必要がある。", "meaning": "Để ý cẩn thận bằng Lòng kiên nhẫn tầm nhìn xa lâu dài."},
    "右肩上がり": {"example": "当社の売上は、過去5年間ずっと右肩上がりで成長している。", "meaning": "Doanh thu lên không trung bình bay thẳng tắp vát chéo tiến lên nhú nhú."},
    "統廃合（とうはいごう）": {"example": "コスト削減のため、地方支店の統廃合が進められている。", "meaning": "Nhất quán sáp nhập tổng sát loại bỏ."},
    "買い控え（かいびかえ）": {"example": "消費税増税への懸念から、消費者の買い控えが起きている。", "meaning": "Người dùng hạn chế Mua chần chừ nhịn chờ xún xuống."},
    "作り置き": {"example": "忙しい平日のために、週末に料理を作り置きしておく。", "meaning": "Đồ Nấu chuẩn bị cất lưu kho dư giả cất riêng tồn kho."},
    "薄利多売（はくりたばい）": {"example": "あのスーパーは薄利多売のビジネスモデルで成功している。", "meaning": "Chạy doanh thu Lợi nhuận nhỏ nhưng bán ồ ạt sỉ bán đại trà."},
    "主眼を置く": {"example": "今回の製品開発は、安全性の向上に主眼を置いている。", "meaning": "Sản phẩm dev chóp mông là đặt tầm nhìn vào việc Cải tiến."},
    "プロフェッショナル": {"example": "彼はプロフェッショナルとして、常に高いクオリティの仕事をする。", "meaning": "A ấy là Thợ Gốc Master Professional tay điêu luyện."}
}

data.update(new_data)
with open('examples_csv.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Second batch of generated CSV examples appended. Total current:", len(data))
