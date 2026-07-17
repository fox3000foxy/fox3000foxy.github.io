---
title: "Tôi đã tiến hóa mạng nơ-ron qua chọn lọc tự nhiên thay vì gradient descent"
description: "Cách tôi thay thế huấn luyện gradient descent cổ điển bằng thuật toán di truyền NSGA-II để tiến hóa các tác nhân giao dịch DQN: bốn phiên bản, từ overfitting đến tiến hóa Lamarckian trọng số."
date: 2026-07-13
tags: ["ai", "nsga-ii", "dqn", "trading", "typescript"]
authors: ["docteur-turboss"]
lang: "vi"
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "n3ZEkIEsZb3IgqDodGQq8bEetgjW7lgCgrl+k7L1YgZ5ePU/qle5ClFcQjc9WImnNzydKCrf7tKnpz0Ef4KDZQ=="
---

## Vấn đề với chỉ gradient descent

Huấn luyện một tác nhân DQN cho giao dịch thuật toán bằng gradient descent cổ điển có một vấn đề đơn giản để phát biểu và một vấn đề khó để giải quyết: gradient descent tối ưu hóa _một_ mạng về _một_ cực tiểu địa phương, trên _một_ cửa sổ thị trường. Không gì đảm bảo cực tiểu này tổng quát hóa được sang một chế độ thị trường khác, và không có gì trong vòng lặp huấn luyện thúc đẩy sự đa dạng; hai lần chạy từ các seed khác nhau thường hội tụ về các chiến lược gần như giống hệt nhau, với cùng những điểm mù.

Câu trả lời tôi khám phá: thay thế (hay đúng hơn là phủ lên) gradient descent bằng một thuật toán di truyền. Thay vì huấn luyện một tác nhân, bạn tiến hóa một quần thể các tác nhân; mỗi bộ gen mã hóa một kiến trúc và các siêu tham số; và chọn lọc tự nhiên thực hiện việc phân loại, trong khi gradient descent tiếp tục tinh chỉnh từng cá thể trong vòng đời của nó.

Dự án này đã trải qua bốn phiên bản trong một phiên làm việc chuyên sâu duy nhất. Mỗi phiên bản sửa một lỗ hổng cấu trúc của phiên bản trước.

## v1: phiên bản ngây thơ, và tại sao nó chưa đủ

Phiên bản đầu tiên làm những gì bạn mong đợi từ một GA cơ bản: một quần thể bộ gen, một hàm fitness, chọn lọc, lai ghép, đột biến, thế hệ tiếp theo. Mỗi bộ gen mã hóa cấu trúc liên kết mạng (số lớp, độ rộng), các siêu tham số DQN (tốc độ học, suy giảm epsilon, kích thước bộ đệm replay), và một vài lựa chọn kiến trúc (nguồn dữ liệu nào để tiêu thụ, kích thước embedding).

Lỗ hổng chính: fitness được tính trên cùng dữ liệu dùng cho huấn luyện. Một tác nhân có thể ghi nhớ nguyên một cửa sổ thị trường và đạt điểm xuất sắc mà không học được chiến lược tổng quát hóa. Overfitting kinh điển, nhưng được khuếch đại bởi chọn lọc di truyền; GA chủ động chọn lọc các cá thể khai thác lỗ hổng này tốt nhất.

## v2: tách biệt huấn luyện và đánh giá

Sửa lỗi hiển nhiên là tách biệt các giai đoạn: mỗi bộ gen huấn luyện trên một cửa sổ thị trường, sau đó được đánh giá trên một cửa sổ khác, chưa từng thấy trong huấn luyện. Chỉ hiệu suất đánh giá mới được tính vào fitness.

Riêng thay đổi này đã khiến fitness trung bình của quần thể giảm; một dấu hiệu cho thấy một phần lớn những gì trông như hiệu suất trong v1 chỉ là ghi nhớ thuần túy. Thật khó nhìn nhận, nhưng đó chính xác là tín hiệu bạn muốn: một điểm số thấp hơn nhưng trung thực tốt hơn một điểm số thổi phồng, gây hiểu lầm.

## v3: chuyển sang NSGA-II và fitness đa mục tiêu

Tối ưu hóa một điểm fitness duy nhất (ví dụ lợi nhuận) đẩy các tác nhân về mặt cơ học đến việc chấp nhận rủi ro cực đoan để tối đa hóa con số đơn lẻ đó. Giải pháp là chuyển sang NSGA-II (Thuật toán di truyền sắp xếp không bị trội II), đồng thời tối ưu hóa nhiều mục tiêu mà không quy chúng thành một tổng trọng số tùy ý: lợi nhuận, mức sụt giảm tối đa, tỷ lệ Sharpe, độ ổn định giữa các cửa sổ.

NSGA-II xây dựng một mặt Pareto: tập hợp các bộ gen mà không thể cải thiện mục tiêu này mà không làm suy giảm mục tiêu khác. Thay vì ép buộc một sự đánh đổi lợi nhuận-rủi ro duy nhất thông qua trọng số được chọn trước, bạn giữ toàn bộ ranh giới thỏa hiệp và để ngỏ lựa chọn cuối cùng.

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
  // ... xây dựng các mặt tiếp theo bằng cách loại bỏ lặp
  return fronts;
}
```

Bổ sung thứ hai trong v3: một **lưu trữ Pareto bền vững**. Nếu không có nó, một bộ gen tốt được tìm thấy ở thế hệ 12 có thể biến mất ở thế hệ 15 nếu may mắn lai ghép không tái tạo được nó; ngay cả khi nó vẫn tốt hơn mọi thứ thay thế nó. Lưu trữ này giữ lại, qua tất cả các thế hệ, tập hợp tất cả các cá thể không bị trội từng gặp, bất kể quần thể hiện tại.

## v4: tiến hóa Lamarckian và đa dạng môi trường

V3 có một điểm mù cấu trúc: bộ gen mô tả kiến trúc, nhưng các trọng số đã học trong quá trình huấn luyện biến mất ở mỗi thế hệ mới. Một đứa con sinh ra từ lai ghép của hai cha mẹ tốt thừa hưởng kiến trúc của họ, nhưng phải học lại từ đầu; không dấu vết nào của các trọng số đã làm cho cha mẹ nó hoạt động tốt.

V4 giới thiệu **tiến hóa Lamarckian**: các trọng số đã huấn luyện được đưa trở lại vào bộ gen sau huấn luyện, và truyền lại (có đột biến) cho con cháu. Đây là dị giáo sinh học có chủ đích; Lamarck đã sai đối với sinh vật sống -- di truyền các đặc tính thu được không tồn tại trong sinh học -- nhưng không gì ngăn một GA kỹ thuật số gian lận một cách thông minh: ở đây, truyền lại kiến thức thu được giúp tăng tốc hội tụ triệt để, vì mỗi thế hệ khởi động lại từ một khởi tạo đã có thông tin thay vì trọng số ngẫu nhiên.

Ba thay đổi cấu trúc khác trong phiên bản này:

*   **Đa dạng môi trường**: mỗi bộ gen không còn được đánh giá trên một cửa sổ thị trường duy nhất mà trên nhiều cửa sổ, được lấy từ các chế độ khác nhau (tăng, giảm, đi ngang). Một tác nhân xuất sắc trên một cửa sổ và sụp đổ trên cửa sổ khác không còn có thể thống trị mặt Pareto.

*   **Chính quy hóa độ phức tạp FLOPs**: chi phí tính toán của mạng (tính bằng FLOPs) trở thành một mục tiêu đầy đủ trong NSGA-II. Điều này ngăn tiến hóa hội tụ về các kiến trúc khổng lồ chỉ vì chúng có nhiều dung lượng thô hơn, mà không có sự cải thiện hiệu suất chính đáng.

*   **Giao diện `RLBackend` tách rời**: GA không còn biết chi tiết DQN. Nó thao tác một bộ gen và gọi `train()` / `evaluate()` thông qua một giao diện trừu tượng, về mặt lý thuyết cho phép hoán đổi một thuật toán RL khác mà không chạm vào động cơ tiến hóa.

```
interface RLBackend {
  train(genome: Genome, window: MarketWindow): Promise<TrainedWeights>;
  evaluate(genome: Genome, weights: TrainedWeights, window: MarketWindow): Promise<FitnessVector>;
}
```

Điểm kỹ thuật cuối: đánh giá chuyển sang **tương tranh bất đồng bộ có giới hạn**; một nhóm N đánh giá song song thay vì vòng lặp tuần tự, với một giới hạn rõ ràng để tránh bão hòa tài nguyên GPU/CPU khả dụng.

## v4 sửa gì so với v3 trong thực tế

| Lỗi v3 | Sửa v4 |
|---|---|
| Trọng số mất mỗi thế hệ | Tái tiêm Lamarckian trọng số đã huấn luyện |
| Overfitting vào một cửa sổ thị trường duy nhất | Đánh giá trên nhiều cửa sổ, chế độ đa dạng |
| Kiến trúc phát triển không kiểm soát | FLOPs như mục tiêu Pareto rõ ràng |
| GA gắn chặt với chi tiết DQN | Giao diện `RLBackend` trừu tượng |
| Đánh giá tuần tự chậm | Tương tranh bất đồng bộ có giới hạn |

V4 cũng sửa mười lỗi "đối sánh" API cụ thể; các trường hợp mã GA giả định một giao diện cho `TradingAgent` không khớp chính xác với triển khai thực tế. Loại lỗi này vô hình cho đến khi bạn đối chiếu mã với mã nguồn tác nhân thực: v4 chỉ được xác thực sau khi đọc lại từng dòng so sánh với tệp thực.

## Tại sao kết hợp tiến hóa và gradient thay vì chọn một

Bạn có thể tự hỏi tại sao không chỉ dùng RL thuần túy, hoặc tiến hóa thuần túy như NEAT. Câu trả lời trong một câu: gradient xuất sắc cho tinh chỉnh cục bộ (điều chỉnh các trọng số liên tục về một tối ưu lân cận), tiến hóa xuất sắc cho khám phá toàn cục (khám phá các kiến trúc và tổ hợp siêu tham số mà không gradient nào có thể đạt tới, vì không gian tìm kiếm rời rạc không khả vi). Sử dụng cái này mà không có cái kia có nghĩa là tự tước đi một trong hai hình thức khám phá.

Cái giá là độ phức tạp kỹ thuật; bốn phiên bản không phải là xa xỉ, chúng là số lần lặp cần thiết để vòng lặp GA + RL ngừng tự phá hoại (overfitting, mất cá thể tốt, mất trọng số thu được). Nhưng kết quả là một hệ thống khám phá một không gian thiết kế rộng hơn nhiều so với tìm kiếm lưới đơn giản các siêu tham số, trong khi vẫn giữ được hiệu quả cục bộ của gradient descent cho mỗi ứng viên được đánh giá.

## Bước tiếp theo

Kiến trúc tiến hóa đơn cấp này (một quần thể phẳng các bộ gen DQN) đạt đến giới hạn khi số lượng tài sản cần bao phủ tăng lên. Đó là động lực cho việc chuyển sang kiến trúc phân cấp ba cấp (Chuyên viên phân tích tài sản → Quản lý ngành → Phân bổ danh mục đầu tư), với một GA hoạt động độc lập ở mỗi cấp... nhưng đó là chủ đề của một bài viết khác.
