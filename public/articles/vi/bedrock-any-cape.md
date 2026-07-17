---
title: "Cách lấy bất kỳ áo choàng nào trên Minecraft Bedrock"
description: "Một launcher bên thứ ba, một phiên bản cũ của game, và một bộ chọn áo choàng chưa bao giờ học cách nói không. Hướng dẫn đầy đủ kèm theo giải thích khả năng về lý do tại sao nó hoạt động."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "1rQhaBRY50fdgfGZghvP11tyoL2ACF0IOrui7Bp2Jbq/17EMjTrP33rOHrl+BDwS9I7d9z+u4DBtk5Z8Zi0sIg=="
---

# Cách lấy bất kỳ áo choàng nào trên Minecraft Bedrock

Trên Java, có rất nhiều cách quanh co để sở hữu một áo choàng mà bạn không nên có (xem bài viết `cape-mod`). Trên Bedrock, game thì khác, xác thực thì khác, nhưng vẫn có một cách -- không cần mod, không cần động chạm vào bất kỳ gói mạng nào. Chỉ cần một launcher bên thứ ba và một phiên bản game đủ cũ để không có xác thực như mong đợi.

Đây là cách làm, và sau đó chúng ta sẽ xem điều gì có lẽ đang xảy ra bên trong.

## Những gì bạn cần

- Một tài khoản Microsoft đã sở hữu Minecraft Bedrock (tài khoản của bạn dùng được)
- Đã cài đặt launcher Minecraft chính thức
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), một launcher bên thứ ba mã nguồn mở cho phép bạn cài đặt và chạy bất kỳ phiên bản lịch sử nào của Bedrock
- .NET 8.0 Desktop Runtime
- Đã bật chế độ nhà phát triển trên Windows

## Bước 1 -- Cài đặt Bedrock ít nhất một lần với launcher chính thức

Trước khi làm bất cứ điều gì khác, mở launcher Minecraft chính thức, vào tab **Minecraft: Bedrock Edition**, và nhấn **Install**. Bedrock phải được cài đặt và chạy ít nhất một lần qua kênh chính thức trước khi đụng tới BedrockLauncher.

![Cài đặt Bedrock Edition từ launcher chính thức](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Bước 2 -- Tải BedrockLauncher

Vào trang phát hành GitHub của dự án. Lấy file zip của phiên bản mới nhất được liệt kê trong **Assets**.

![Trang phát hành GitHub của BedrockLauncher](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Bước 3 -- Giải nén file lưu trữ

Sau khi tải xuống file zip, giải nén nó vào thư mục `Downloads` (hoặc bất kỳ đâu, miễn là bạn tìm thấy thư mục sau này).

![Giải nén file lưu trữ BedrockLauncher](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Bước 4 -- Chạy file thực thi

Vào thư mục đã giải nén và chạy `BedrockLauncher.exe`.

![Chạy BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Bước 5 -- Cài đặt .NET Desktop Runtime và bật chế độ nhà phát triển

Khi chạy lần đầu, Windows rất có thể sẽ yêu cầu **.NET 8.0 Desktop Runtime** -- cài đặt nó. Bạn cũng cần bật **chế độ nhà phát triển** trong `Cài đặt > Hệ thống > Dành cho nhà phát triển`, vì BedrockLauncher cài đặt game dưới dạng gói rời rạc (file thô, không phải gói Store có chữ ký thật), và Windows từ chối kiểu cài đặt này nếu không có chế độ đó.

![Cài đặt .NET Runtime và bật chế độ nhà phát triển](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Bước 6 -- Tạo cài đặt mới

Mở lại BedrockLauncher, đăng nhập bằng tài khoản Microsoft của bạn, vào tab **Installations**, rồi nhấn **New installation**.

![Tạo cài đặt mới trong BedrockLauncher](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Bước 7 -- Chọn phiên bản cũ

Đặt tên cho cài đặt, rồi trong danh sách phiên bản, chọn một phiên bản **cũ** -- thường là `1.16.x` hoặc sớm hơn. Nhấn **Create**.

![Chọn phiên bản cũ, ở đây là 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Bước 8 -- Chạy cài đặt

Nhấn **Play**. Quá trình trích xuất file có thể mất đến mười phút tùy vào máy -- launcher sẽ có vẻ bị treo ("Không phản hồi"), điều này bình thường, cứ để nó chạy.

![Đang trích xuất, launcher có vẻ không phản hồi](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Bước 9 -- Chọn áo choàng

Khi game đã chạy, đăng nhập bằng tài khoản, tạo nhân vật mới và vào trình chỉnh sửa skin, tab **Áo choàng**. Ở đó bạn sẽ thấy danh sách đầy đủ của tất cả các áo choàng tồn tại trong game -- bao gồm cả những cái bạn chưa từng sở hữu (áo choàng sự kiện khuyến mãi, lễ hội đã qua, Mob Vote, v.v.). Chọn bất kỳ cái nào bạn muốn.

**Đừng chạm vào phần còn lại của ngoại hình skin ở giai đoạn này**, chỉ để lại áo choàng.

![Chọn áo choàng trong trình chỉnh sửa nhân vật](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Bước 10 -- Cài lại phiên bản chính thức

Trở về launcher chính thức, tab **Cài đặt**, và nhấn **Gỡ cài đặt** trên cài đặt Bedrock chính, rồi cài lại (hoặc nhấn **Kiểm tra cập nhật**). Chạy Minecraft Bedrock lần này từ launcher chính thức.

![Gỡ cài đặt và cài lại từ launcher chính thức](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

Vậy là xong -- áo choàng của bạn đã có ở đó, trên phiên bản chính thức, trên hồ sơ thật của bạn.

## Điều gì có lẽ đang xảy ra

Tôi chưa đào sâu vào mã nguồn đóng của Bedrock (không giống Java có thể dịch ngược được), vì vậy những gì sau đây là lời giải thích **có khả năng**, không phải là sự chắc chắn tuyệt đối. Nhưng hành vi quan sát được khá khớp với giả thuyết sau.

### Bộ chọn áo choàng chưa bao giờ là kiểm soát truy cập

Trên Bedrock, màn hình chọn áo choàng rất có khả năng hiển thị **danh sách đầy đủ tất cả các áo choàng tồn tại trong game**, không chỉ những cái tài khoản của bạn sở hữu. Trên các client gần đây, một bộ lọc ứng dụng (phía client hoặc qua cuộc gọi mạng đến dịch vụ entitlement Xbox/Microsoft) làm mờ hoặc ẩn những áo choàng bạn không sở hữu.

Điểm mấu chốt là bộ lọc này có lẽ được thêm vào **sau này**, trên một phiên bản game đủ mới. Một phiên bản như 1.16.x có trước bộ lọc này, hoặc sử dụng cơ chế xác minh khác (hoặc không có): tất cả những gì có trong danh sách đều có thể chọn được, có entitlement hay không.

### Áo choàng được lưu ở đâu chính xác?

Đây là phần giải thích tại sao lựa chọn này tồn tại sau khi cài lại. Lựa chọn skin/áo choàng trên Bedrock không chỉ là một file cục bộ vứt đi -- nó có lẽ được đồng bộ lên hồ sơ Xbox Live liên kết với tài khoản Microsoft của bạn (cùng hệ thống quản lý skin của bạn trên các nền tảng Bedrock khác -- di động, máy chơi game, v.v.). Khi bạn chọn một áo choàng trong client cũ, nó rất có khả năng gửi lựa chọn đó đến dịch vụ hồ sơ, giống hệt như một client mới nhất sẽ làm với áo choàng hợp lệ -- bởi vì từ góc độ của client, không có sự khác biệt nào giữa áo choàng "bạn sở hữu" và áo choàng "được chọn". Dịch vụ hồ sơ, về phần mình, tin tưởng client ở điểm này: nó ghi lại lựa chọn mà không xác minh lại xem entitlement có thực sự tồn tại đằng sau hay không, ít nhất là không vào thời điểm ghi.

Kết quả: khi bạn chạy lại game chính thức mới nhất, nó lấy skin/áo choàng hiện tại của bạn từ dịch vụ hồ sơ -- và dịch vụ trung thành trả về những gì đã được lưu, bao gồm cả áo choàng không hợp lệ. Kiểm tra entitlement, nếu có, có lẽ xảy ra vào lúc **chọn** trong giao diện mới (đó là lý do có bộ lọc trên client mới), không phải vào lúc **hiển thị** những gì đã được lưu trên hồ sơ.

### Sự tương đồng với Java

Đây cùng là loại lỗ hổng logic giống như `cape-mod` trên Java: một dịch vụ tin tưởng dữ liệu mà không kiểm tra lại nguồn gốc của nó ở mỗi bước. Trên Java, đó là chữ ký RSA hợp lệ được phát lại trên hồ sơ sai. Trên Bedrock, đó có lẽ là một lựa chọn áo choàng được chấp nhận bởi một client cũ không bao giờ có bộ lọc đúng, và sau đó được truyền đi mà không xác minh lại vào trạng thái bền vững của tài khoản. Trong cả hai trường hợp, vấn đề không nằm ở điểm vào (mod Java, client Bedrock cũ) -- mà là ở chỗ lớp đáng lẽ phải xác minh lại entitlement ở hạ nguồn đã không làm điều đó, hoặc chỉ làm một lần, sai chỗ.

## Tại sao nó vẫn hoạt động

Hai giải thích có thể, không loại trừ lẫn nhau:

1. **Mojang có lẽ không coi đây là ưu tiên.** Cần một launcher bên thứ ba, quy trình nhiều bước, và kết quả hoàn toàn là thẩm mỹ -- không lợi thế về gameplay, không dữ liệu của ai bị xâm phạm.
2. **Vá đúng cách sẽ yêu cầu xác minh lại entitlement ở mỗi lần đọc hồ sơ**, không chỉ khi chọn -- tức là thêm một cuộc gọi mạng ở mỗi lần hiển thị skin, cho một vấn đề chỉ liên quan đến thẩm mỹ.

## Kết luận

Hướng dẫn này gọn trong mười ảnh chụp màn hình, nhưng nó minh họa một nguyên tắc có thể thấy ở mọi nơi trong bảo mật phần mềm: ngay khi một hệ thống cũ (một phiên bản client cũ, một API cũ, một dịch vụ không bao giờ được cập nhật) vẫn có thể viết vào một trạng thái chia sẻ, kiểm soát truy cập của hiện tại chỉ bảo vệ những gì đi qua hiện tại. Bất cứ thứ gì vẫn có thể nói chuyện với API cũ đều vượt qua bộ lọc mới hơn -- không phải vì bộ lọc bị hỏng, mà bởi vì nó chưa từng được áp dụng cho phiên bản trước đó.

---

**Tài nguyên**

- **BedrockLauncher** : [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Bài viết liên quan** : Cape Mod, phiên bản Java tương đương qua tiêm chữ ký RSA

**3 điểm chính**

1. Bộ chọn áo choàng của phiên bản Bedrock cũ có lẽ hiển thị danh sách đầy đủ tất cả áo choàng trong game, không có bộ lọc entitlement.
2. Lựa chọn sau đó được đồng bộ lên hồ sơ Xbox Live của bạn như bất kỳ áo choàng hợp lệ nào -- dịch vụ hồ sơ tin tưởng client.
3. Kiểm tra entitlement, nếu có, xảy ra lúc chọn trong giao diện gần đây -- không phải lúc đọc những gì đã được lưu trên tài khoản.
