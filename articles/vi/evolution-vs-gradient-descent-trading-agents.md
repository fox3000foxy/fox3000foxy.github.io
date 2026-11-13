---
title: "Tôi đã tiến hóa một mạng nơ-ron bằng chọn lọc tự nhiên thay vì gradient descent"
description: "Cách tôi thay thế huấn luyện cổ điển bằng gradient descent bằng thuật toán di truyền NSGA-II để tiến hóa các tác nhân DQN giao dịch: bốn phiên bản, từ overfitting đến tiến hóa Lamarck trọng số."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "LFouzcuXzxTRlGULcLa3z+GxzGxu+giPnnZV4Kj9I3fd+0qAFFDLTQFO740M9wr3YnsIslalFbnT9sJLhI4PAg=="
---
## Vấn đề với chỉ gradient descent

Huấn luyện một tác nhân DQN cho giao dịch thuật toán bằng gradient descent cổ điển đặt ra một vấn đề dễ phát biểu nhưng khó giải: gradient tối ưu _một_ mạng về _một_ cực tiểu cục bộ, trên _một_ cửa sổ thị trường. Không có gì đảm bảo cực tiểu đó khái quát hóa sang một chế độ thị trường khác, và không có gì trong vòng huấn luyện thúc đẩy sự đa dạng; hai lần chạy khởi đầu từ các seed khác nhau thường hội tụ về các chiến lược gần như giống hệt nhau, với cùng những điểm mù.

Câu trả lời tôi đã khám phá: thay thế (hay đúng hơn là chồng thêm) gradient descent bằng một thuật toán di truyền. Thay vì huấn luyện một tác nhân, ta tiến hóa một quần thể tác nhân; mỗi cá thể là một genome mã hóa một kiến trúc và các siêu tham số; và để chọn lọc tự nhiên làm việc sàng lọc, trong khi gradient tiếp tục tinh chỉnh từng cá thể trong chính đời sống của nó.

Runner này đã trải qua bốn phiên bản trong một phiên làm việc cường độ cao duy nhất. Mỗi phiên bản sửa một khiếm khuyết cấu trúc của phiên bản trước.

## v1: phiên bản ngây thơ, và vì sao nó chưa đủ

Phiên bản đầu tiên làm đúng những gì mong đợi ở một GA cơ bản: một quần thể genome, một hàm fitness, chọn lọc, lai ghép, đột biến, thế hệ tiếp theo. Mỗi genome mã hóa topo mạng (số lớp, độ rộng), các siêu tham số DQN (learning rate, epsilon decay, kích thước replay buffer), và vài lựa chọn kiến trúc (tiêu thụ nguồn dữ liệu nào, kích thước embedding bao nhiêu).

Khiếm khuyết chính: fitness được tính trên cùng dữ liệu với huấn luyện. Một tác nhân có thể ghi nhớ nguyên văn một cửa sổ thị trường và đạt điểm xuất sắc mà không hề học được chiến lược khái quát nào. Overfitting kinh điển, nhưng bị khuếch đại bởi chọn lọc di truyền; GA chủ động chọn ra những cá thể khai thác tốt nhất kẽ hở này.

## v2: tách huấn luyện và đánh giá

Cách sửa hiển nhiên là tách các pha: mỗi genome huấn luyện trên một cửa sổ thị trường, rồi được đánh giá trên một cửa sổ khác, chưa từng thấy trong lúc huấn luyện. Chỉ hiệu năng đánh giá mới tính vào fitness.

Riêng thay đổi này đã làm fitness trung bình của quần thể tụt xuống; dấu hiệu cho thấy phần lớn những gì trông như hiệu năng ở v1 chỉ là ghi nhớ thuần túy. Đau khi nhìn, nhưng đó chính xác là tín hiệu ta muốn: một điểm thấp hơn nhưng trung thực đáng giá hơn một điểm phồng và đánh lừa.

## v3: chuyển sang NSGA-II và fitness đa mục tiêu

Tối ưu một điểm fitness duy nhất (ví dụ lợi nhuận) đẩy một cách máy móc về các tác nhân chấp nhận rủi ro cực đoan để tối đa hóa đúng con số đó. Giải pháp là chuyển sang NSGA-II (Non-dominated Sorting Genetic Algorithm II), tối ưu đồng thời nhiều mục tiêu mà không rút gọn chúng thành một tổng có trọng số tùy tiện: lợi nhuận, drawdown tối đa, tỷ lệ Sharpe, độ ổn định liên cửa sổ.

NSGA-II xây dựng một mặt Pareto: tập hợp các genome mà không thể cải thiện một mục tiêu nào mà không làm xấu mục tiêu khác. Thay vì ép một thỏa hiệp duy nhất giữa lợi nhuận và rủi ro qua một trọng số chọn trước, ta giữ toàn bộ biên thỏa hiệp và để ngỏ lựa chọn cuối cùng.

```
function nonDominatedSort(population: Genome[]): Genome[][] {
  const fronts: Genome[][] = [[]];
  for (const p of population) {
    p.dominationCount = 0;
    p.dominatedSet = [];
    for (const q of population) {
      if (dominates(p, q)) p.dominatedSet.push(q);
      else if (dominates(q, p)) p.dominationCount++;
    }
    if (p.dominationCount === 0) {
      p.rank = 0;
      fronts[0].push(p);
    }
  }
  // ... xây dựng các front tiếp theo bằng loại bỏ lặp
  return fronts;
}
```

Bổ sung thứ hai của v3: một **archive Pareto bền vững**. Không có nó, một genome tốt tìm thấy ở thế hệ 12 có thể biến mất ở thế hệ 15 nếu sự ngẫu nhiên của lai ghép không tái tạo nó; dù nó vẫn tốt hơn mọi thứ đã thay thế nó. Archive giữ lại, xuyên suốt mọi thế hệ, tập hợp các cá thể không bị chi phối từng gặp, độc lập với quần thể hiện tại.

## v4: tiến hóa Lamarck và đa dạng môi trường

v3 có một điểm mù cấu trúc: genome mô tả kiến trúc, nhưng các trọng số học được trong lúc huấn luyện biến mất ở mỗi thế hệ mới. Một hậu duệ sinh từ lai ghép của hai bố mẹ tốt thừa hưởng kiến trúc của chúng, nhưng phải học lại từ con số không; không còn dấu vết nào của các trọng số từng khiến bố mẹ nó hiệu quả.

v4 đưa vào **tiến hóa Lamarck**: các trọng số đã huấn luyện được bơm ngược vào genome sau huấn luyện, và truyền lại (kèm đột biến) cho đời sau. Đây là một dị giáo sinh học có chủ ý; Lamarck đã sai đối với sinh vật sống, di truyền tính trạng tập nhiễm không tồn tại trong sinh học; nhưng không có gì cấm một GA số gian lận một cách thông minh: ở đây, truyền lại cái đã học tăng tốc hội tụ triệt để, vì mỗi thế hệ khởi đầu từ một điểm đã có thông tin thay vì trọng số ngẫu nhiên.

Ba thay đổi cấu trúc khác trong phiên bản này:

*   **Đa dạng môi trường**: mỗi genome không còn được đánh giá trên một cửa sổ thị trường duy nhất mà trên nhiều cửa sổ, rút từ các chế độ khác nhau (tăng, giảm, đi ngang). Một tác nhân xuất sắc trên một cửa sổ mà sụp đổ trên cửa sổ khác không thể chi phối mặt Pareto nữa.

*   **Chính quy hóa bằng độ phức tạp FLOPs**: chi phí tính toán của mạng (tính bằng FLOPs) trở thành một mục tiêu riêng trong NSGA-II. Việc này tránh để tiến hóa hội tụ về các kiến trúc khổng lồ chỉ vì chúng có dung lượng thô lớn hơn, mà hiệu năng tăng thêm không xứng đáng.

*   **Interface** `RLBackend` **tách rời**: GA không còn biết chi tiết của DQN. Nó thao tác genome và gọi `train()` / `evaluate()` qua một interface trừu tượng, về lý thuyết cho phép gắn một thuật toán RL khác mà không đụng tới động cơ tiến hóa.


```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Điểm kỹ thuật cuối: đánh giá chuyển sang **đồng thời async có giới hạn**; một pool N đánh giá song song thay vì vòng lặp tuần tự, với giới hạn rõ ràng để không bão hòa tài nguyên GPU/CPU hiện có.

## Những gì v4 sửa so với v3 trong thực tế

Khiếm khuyết v3 Sửa chữa v4 Trọng số mất ở mỗi thế hệ Bơm ngược Lamarck các trọng số đã huấn luyện Overfitting vào một cửa sổ thị trường duy nhất Đánh giá trên nhiều cửa sổ, chế độ đa dạng Kiến trúc phình to không giới hạn FLOPs thành mục tiêu Pareto rõ ràng GA gắn chặt với chi tiết DQN Interface `RLBackend` trừu tượng Đánh giá tuần tự chậm Đồng thời async có giới hạn

v4 cũng sửa mười bug "grounding" API cụ thể; những trường hợp mã GA giả định một interface cho `TradingAgent` không khớp chính xác với triển khai thực tế. Loại bug này vô hình chừng nào chưa đối chiếu mã với mã nguồn thực của tác nhân: v4 chỉ được xác nhận sau khi đọc lại từng dòng trước tệp thực.

## Vì sao pha trộn tiến hóa và gradient thay vì chọn một trong hai

Người ta có thể hỏi sao không làm RL thuần, hay tiến hóa thuần kiểu NEAT. Câu trả lời gói trong một câu: gradient xuất sắc trong tinh chỉnh cục bộ (chỉnh các trọng số liên tục về một cực trị gần), tiến hóa xuất sắc trong khám phá toàn cục (khám phá các kiến trúc và tổ hợp siêu tham số mà không gradient nào chạm tới, vì không gian tìm kiếm rời rạc không khả vi). Dùng một mà thiếu kia, là tự tước một trong hai dạng khám phá.

Cái giá phải trả là độ phức tạp kỹ thuật; bốn phiên bản không phải xa xỉ, mà là số vòng lặp cần thiết để vòng lặp GA + RL ngừng tự phá mình (overfitting, mất cá thể tốt, mất trọng số đã học). Nhưng kết quả là một hệ thống khám phá không gian thiết kế rộng hơn nhiều so với một grid search siêu tham số đơn thuần, trong khi vẫn giữ hiệu quả cục bộ của gradient cho mỗi ứng viên được đánh giá.

## Bước tiếp theo

Kiến trúc tiến hóa một tầng này (một quần thể phẳng các genome DQN) chạm giới hạn khi số tài sản cần phủ tăng lên. Đó là điều thúc đẩy chuyển sang kiến trúc phân cấp ba tầng (Asset Analysts → Sector Managers → Portfolio Allocator), với một GA vận hành độc lập ở mỗi tầng... nhưng đó là chủ đề của một bài khác.
