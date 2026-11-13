---
title: "Cách lấy bất kỳ cape nào trên Minecraft Bedrock"
description: "Một launcher bên thứ ba, một phiên bản game cũ, và một bộ chọn cape chưa bao giờ học cách nói không. Hướng dẫn đầy đủ kèm lời giải thích có thể lý giải vì sao nó hoạt động."
date: 2026-07-14
tags:
  - minecraft
  - bedrock
  - tutorial
  - reverse-engineering
authors:
  - 9stown
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "96uNFpYygzAOYfY5sK4+V5+kx6QBdYTXC1rJfyHt9NffhRYl0d/lmvyNJqBTVCliPTMqt93GLHycWunJQlHrRA=="
---

# Cách lấy bất kỳ cape nào trên Minecraft Bedrock

Trên Java, có đầy cách lắt léo để có một chiếc cape lẽ ra bạn không được có (xem bài về `cape-mod`). Trên Bedrock, game khác, xác thực khác, nhưng vẫn có cách -- bạn chỉ cần một launcher bên thứ ba và một phiên bản game đủ cũ để bỏ qua bước kiểm tra mà ai cũng tưởng là đương nhiên.

Đây là cách làm, rồi sau đó ta xem chuyện gì có thể đang diễn ra bên dưới.

## Những gì bạn cần

- Một tài khoản Microsoft đã sở hữu Minecraft Bedrock (tài khoản của bạn là đủ tốt)
- Launcher Minecraft chính thức đã cài
- [BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher), một launcher bên thứ ba open source cho phép cài và chạy bất kỳ phiên bản Bedrock lịch sử nào
- .NET 8.0 Desktop Runtime
- Chế độ nhà phát triển bật trên Windows

## Bước 1 -- Cài Bedrock ít nhất một lần bằng launcher chính thức

Trước khi làm gì khác, mở launcher Minecraft chính thức, vào tab **Minecraft: Bedrock Edition**, và bấm **Install**. Bedrock phải được cài và chạy ít nhất một lần qua đường chính thức trước khi đụng tới BedrockLauncher.

![Cài Bedrock Edition từ launcher chính thức](/images/bedrock-cape/bedrock-cape-01-install-bedrock.png)

## Bước 2 -- Tải BedrockLauncher

Tới trang releases GitHub của dự án. Lấy file zip của phiên bản mới nhất liệt kê trong **Assets**.

![Trang releases GitHub của BedrockLauncher](/images/bedrock-cape/bedrock-cape-02-github-release.png)

## Bước 3 -- Giải nén

Khi zip đã tải xong, giải nén vào thư mục `Downloads` của bạn (hoặc bất cứ đâu, miễn bạn tìm lại được thư mục sau đó).

![Giải nén file BedrockLauncher](/images/bedrock-cape/bedrock-cape-03-extract-zip.png)

## Bước 4 -- Chạy file thực thi

Vào thư mục đã giải nén và chạy `BedrockLauncher.exe`.

![Chạy BedrockLauncher.exe](/images/bedrock-cape/bedrock-cape-04-run-exe.png)

## Bước 5 -- Cài .NET Desktop Runtime và bật chế độ nhà phát triển

Lần chạy đầu tiên, Windows rất có thể sẽ đòi **.NET 8.0 Desktop Runtime** -- hãy cài nó. Bạn cũng cần bật **chế độ nhà phát triển** trong `Cài đặt > Hệ thống > Dành cho nhà phát triển`, vì BedrockLauncher cài game dưới dạng gói loose (tệp thô, không phải gói có chữ ký Store thật), và Windows từ chối kiểu cài đặt đó nếu thiếu chế độ này.

![Cài runtime .NET và bật chế độ nhà phát triển](/images/bedrock-cape/bedrock-cape-05-dotnet-devmode.png)

## Bước 6 -- Tạo bản cài mới

Chạy lại BedrockLauncher, đăng nhập bằng tài khoản Microsoft, vào tab **Installations**, rồi bấm **New installation**.

![Tạo bản cài mới trong BedrockLauncher](/images/bedrock-cape/bedrock-cape-06-new-installation.png)

## Bước 7 -- Chọn một phiên bản cũ

Đặt tên cho bản cài, rồi trong danh sách phiên bản, chọn một phiên bản **cũ** -- thường là `1.16.x` hoặc cũ hơn. Bấm **Create**.

![Chọn phiên bản cũ, ở đây là 1.16.0.2](/images/bedrock-cape/bedrock-cape-07-pick-old-version.png)

## Bước 8 -- Chạy bản cài

Bấm **Play**. Giải nén tệp có thể mất tới mười phút tùy máy -- launcher sẽ trông như bị treo (« Not Responding »), đó là bình thường, cứ để nó chạy.

![Đang giải nén, launcher trông như không phản hồi](/images/bedrock-cape/bedrock-cape-08-launch-extracting.png)

## Bước 9 -- Chọn cape

Khi game đã chạy, đăng nhập bằng tài khoản của bạn, tạo nhân vật mới và vào trình chỉnh skin, tab **Capes**. Ở đó, bạn sẽ thấy danh sách đầy đủ mọi cape tồn tại trong Minecraft -- kể cả những cái bạn chưa từng có (cape sự kiện promo, lễ hội cũ, Mob Vote, v.v.). Chọn cái bạn muốn.

**Đừng đụng vào phần còn lại của ngoại hình skin ở bước này**, chỉ để cape thôi.

![Chọn cape trong trình chỉnh nhân vật](/images/bedrock-cape/bedrock-cape-09-choose-cape.png)

## Bước 10 -- Cài lại phiên bản chính thức

Quay lại launcher chính thức, tab **Installation**, và bấm **Uninstall** trên bản cài Bedrock chính, rồi cài lại (hoặc bấm **Check for Updates**). Lần này chạy Minecraft Bedrock từ launcher chính thức.

![Gỡ và cài lại từ launcher chính thức](/images/bedrock-cape/bedrock-cape-10-reinstall-official.png)

Và xong -- cape của bạn ở đó, trên phiên bản chính thức, trên hồ sơ thật của bạn.

## Chuyện có thể đang diễn ra

Tôi chưa thọc tay vào mã nguồn đóng của Bedrock (không như Java có thể dịch ngược), nên những gì sau đây là lời giải thích **có thể**, không phải chắc chắn tuyệt đối. Nhưng hành vi quan sát được khớp khá tốt với giả thuyết sau.

### Bộ chọn cape chưa bao giờ là kiểm soát truy cập

Trên Bedrock, màn hình chọn cape rất có thể hiển thị **danh sách đầy đủ các cape tồn tại trong game**, không chỉ những cái tài khoản của bạn sở hữu. Trên client mới, một bộ lọc ứng dụng (phía client hoặc qua gọi mạng tới dịch vụ entitlements Xbox/Microsoft) làm mờ hoặc ẩn các cape bạn không sở hữu.

Điểm mấu chốt là bộ lọc này có thể được thêm **sau này**, trên một phiên bản game đủ mới. Một phiên bản như 1.16.x ra đời trước bộ lọc đó, hoặc dùng cơ chế kiểm tra khác (thậm chí không có) : mọi thứ trong danh sách đều thành có thể chọn, có entitlement hay không.

### Cape được lưu ở đâu, chính xác?

Đây là phần giải thích vì sao nó sống sót sau khi cài lại. Lựa chọn skin/cape trên Bedrock không chỉ là tệp cục bộ dùng một lần rồi vứt -- nó có thể được đồng bộ lên hồ sơ Xbox Live gắn với tài khoản Microsoft của bạn (cùng hệ thống quản lý skin của bạn trên các nền tảng Bedrock khác -- di động, console, v.v.). Khi bạn chọn một cape trong client cũ, nó rất có thể gửi lựa chọn đó tới dịch vụ hồ sơ, y hệt như client cập nhật làm với một cape hợp lệ -- vì từ góc nhìn client, không có khác biệt nào giữa cape « của bạn » và cape « được chọn ». Dịch vụ hồ sơ thì tin client ở điểm này : nó ghi lại lựa chọn mà không kiểm tra lại entitlement thực sự đằng sau có tồn tại hay không, ít nhất không phải lúc ghi.

Kết quả : khi bạn chạy lại game chính thức cập nhật, nó đi lấy skin/cape hiện tại trên dịch vụ hồ sơ -- và dịch vụ trả về trung thành những gì đã ghi, kể cả cape không hợp lệ. Bước kiểm tra entitlement, nếu tồn tại, có thể chỉ diễn ra lúc **chọn** trong UI (vì vậy có bộ lọc trên client mới), và bỏ qua bước **hiển thị** những gì đã ghi trên hồ sơ.

### Song song với Java

Đây là cùng họ lỗ hổng logic với `cape-mod` trên Java : một dịch vụ tin vào một dữ liệu mà không kiểm tra lại nguồn gốc ở mỗi bước. Trên Java, đó là chữ ký RSA hợp lệ nhưng replay sang hồ sơ sai. Trên Bedrock, đó có thể là một lựa chọn cape được client cũ chấp nhận trong khi nó chưa từng có bộ lọc đúng, rồi lan truyền không kiểm tra lại về trạng thái bền vững của tài khoản. Trong cả hai trường hợp, vấn đề không phải điểm vào (mod Java, client Bedrock cũ) -- mà là lớp lẽ ra phải kiểm tra lại entitlement ở phía sau đã không làm, hoặc chỉ làm một lần, sai chỗ.

## Vì sao nó vẫn hoạt động

Hai lời giải thích có thể, không loại trừ nhau :

1. **Mojang có thể không coi đây là ưu tiên.** Cần launcher bên thứ ba, thao tác nhiều bước, và kết quả thuần túy thẩm mỹ -- không lợi thế gameplay, không dữ liệu của người khác bị xâm phạm.
2. **Vá đúng cách sẽ đòi kiểm tra lại entitlements mỗi lần đọc hồ sơ**, không chỉ lúc chọn -- nghĩa là thêm một gọi mạng mỗi lần hiển thị skin, cho một vấn đề chỉ liên quan tới thẩm mỹ.

## Kết luận

Hướng dẫn này gói trong mười ảnh chụp màn hình, nhưng nó minh họa một nguyên tắc gặp ở khắp nơi trong bảo mật phần mềm : hễ một hệ thống lịch sử (phiên bản client cũ, API legacy, dịch vụ chưa từng cập nhật) còn có thể ghi vào một trạng thái chung, kiểm soát truy cập của hiện tại chỉ bảo vệ những gì đi qua hiện tại. Mọi thứ còn nói được với API cũ đều lách qua bộ lọc mới hơn -- bộ lọc hoạt động trên phiên bản mới, nhưng chưa từng được áp lên phiên bản đi trước nó.

---

**Tài nguyên**

- **BedrockLauncher** : [github.com/bedrockLauncher/BedrockLauncher](https://github.com/bedrockLauncher/BedrockLauncher)
- **Bài liên quan** : Cape Mod, bản tương đương Java bằng tiêm chữ ký RSA

**3 điểm chính**

1. Bộ chọn cape của phiên bản Bedrock cũ có thể hiển thị danh sách đầy đủ cape của game, không lọc entitlement.
2. Lựa chọn sau đó được đồng bộ lên hồ sơ Xbox Live của bạn như bất kỳ cape hợp lệ nào -- dịch vụ hồ sơ tin client.
3. Bước kiểm tra entitlement, nếu tồn tại, diễn ra lúc chọn trong UI mới -- không phải lúc đọc những gì đã ghi trên tài khoản.
