---
title: "Laupok đã tạo một AI tự chơi Super Mario World -- cách nó hoạt động"
description: "Phân tích chi tiết dự án của Laupok: một AI dựa trên NEAT học chơi Super Mario World một cách tự chủ. Thuật toán di truyền, mạng nơ-ron, tiến hóa nơ-ron mở rộngtopologies, và 4200 dòng Lua."
date: 2026-07-11authors:
  - fox3000foxy
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A=="
author_sig: "X2lK6mQqcMqj3hNGN05ZbQmuW9F58zyFTJVn+H9YUkI4hR3KD9iyBvG9eDul9nIcLw4lBMFzowIqsfcTIsyTFw=="
---

# Laupok đã tạo một AI tự chơi Super Mario World -- cách nó hoạt động

Laupok đã tạo ra một trí tuệ nhân tạo tự chơi **Super Mario World** hoàn toàn tự chủ. Không có đầu vào được lập trình sẵn, không có khung hình được ghi lại. AI tự học, thông qua đột biến ngẫu nhiên và chọn lọc tự nhiên, để vượt qua các màn chơi. Dự án chạy trên **BizHawk**, một trình giả lập đa nền tảng, thông qua một script Lua khoảng **4200 dòng**.

Điều khiến dự án này trở nên hấp dẫn là nó dựa trên các khái niệm sinh học được áp dụng vào tin học: **thuyết tiến hóa** của Darwin, **mạng nơ-ron nhân tạo**, và quan trọng nhất là một thuật toán cụ thể gọi là **NEAT** (NeuroEvolution of Augmenting Topologies - Tiến hóa nơ-ron mở rộngtopologies). Ban đầu, AI không biết gì về trò chơi. Nó thử những thứ ngẫu nhiên, thất bại hàng nghìn lần, và dần dần tìm ra cách di chuyển, nhảy, và sinh tồn.

Trong bài viết này, chúng ta sẽ phân tích tất cả -- từng khái niệm, từng dòng code.

![Laupok giới thiệu thuật toán NEAT trên camera](/images/laupok-mario-ai/neat-title.jpg)

---

## Môi trường: BizHawk, Lua, và Super Mario World

### Trình giả lập BizHawk

BizHawk là một trình giả lập mã nguồn mở hỗ trợ rất nhiều loại máy chơi game -- NES, SNES, Genesis, PS1, Game Boy, và nhiều hơn nữa. Tính năng quan trọng của nó là có thể chạy **script Lua** cùng với trò chơi. Các script này có quyền truy cập vào **RAM** (bộ nhớ truy cập ngẫu nhiên) của trình giả lập, nghĩa là chúng có thể đọc -- và sửa -- bất kỳ dữ liệu trò nào trong thời gian thực.

Cụ thể, điều này có nghĩa là bạn có thể:
- Đọc vị trí của Mario trong màn chơi
- Biết哪些sprite (kẻ thù, vật phẩm) đang ở trên màn hình
- Biết trạng thái của mỗi ô (khối) xung quanh Mario
- Điều khiển bộ điều khiển -- nhấn bất kỳ nút nào

Đây chính xác là những gì bạn cần để tạo một AI chơi game.

### Địa chỉ bộ nhớ của Super Mario World

Trong RAM của Super Mario World, mỗi dữ liệu được lưu trữ tại một địa chỉ cụ thể. Nó giống như một khu phố: mỗi địa chỉ tương ứng với một "ngôi nhà" chứa một thông tin. Ví dụ:

| Địa chỉ | Dữ liệu |
|---------|------|
| `0x94`-`0x95` | Vị trí X của Mario (16-bit, little-endian) |
| `0x96`-`0x97` | Vị trí Y của Mario |
| `0x14C8`+`i` | Trạng thái sprite `i` (>7 = sống) |
| `0xE4`+`i` | Vị trí X thấp của sprite `i` |
| `0x14E0`+`i` | Vị trí X cao của sprite `i` |
| `0xD8`+`i` | Vị trí Y thấp của sprite `i` |
| `0x14D4`+`i` | Vị trí Y cao của sprite `i` |
| `0x170B`+`i` | Loại sprite mở rộng `i` |
| `0x0100` | Trạng thái trò chơi (12 = màn chơi hoàn thành) |
| `0x13D4` | Đang tạm dừng |
| `0x0071` | Hoạt ảnh chết của Mario (9 = chết) |
| `0x1C800`+... | Bảng ô màn chơi |

Vị trí sprite sử dụng hai byte: byte "thấp" và byte "cao", vì vị trí có thể vượt quá 255 pixel. Công thức luôn là `thấp + cao × 256`.

Đối với ô thì phức tạp hơn: địa chỉ cơ sở là `0x1C800`, và bạn tính toán độ dịch dựa trên tọa độ `x` và `y` của ô trong thế giới, với bước 16 pixel mỗi ô.

![Super Mario World với lớp phủ debug hiển thị địa chỉ bộ nhớ sprite và vị trí Mario](/images/laupok-mario-ai/memory-debug.jpg)

---

## Cơ bản: thuật toán di truyền và mạng nơ-ron

Trước khi đi sâu vào code, bạn cần hiểu hai khái niệm cơ bản. Không có chúng, mọi thứ khác đều vô nghĩa.

### Thuật toán di truyền

Thuật toán di truyền là một mô phỏng của **thuyết tiến hóa**. Ý tưởng cốt lõi: bạn tạo ra một **quần thể** gồm các cá thể, mỗi cá thể có các đặc tính hơi khác nhau ("gen"). Bạn để chúng "sống" trong một môi trường. Những cá thể hoạt động tốt nhất sẽ tồn tại và sinh sản. Những cá thể hoạt động kém sẽ bị loại bỏ.

Laupok minh họa điều này với một phép so sánh **Kirby**:
- Một quần thể Kirby xuất hiện trên một bãi đất có gai và cà chua
- Gai làm giảm điểm máu, cà chua khôi phục lại
- Mỗi Kirby có gen: kích thước, tốc độ, máu, hành vi (chạy trốn, tìm cà chua, chạy mù quáng)

![Xoắn kép DNA với các nhãn "em bé", "kích thước", "tốc độ", "màu sắc" -- các gen tạo nên một cá thể](/images/laupok-mario-ai/dna-genes.jpg)

- Sau 15 giây, bạn kiểm tra ai tồn tại lâu nhất
- Kirby tốt nhất giao phối với các Kirby khác: con cái kế thừa một nửa gen tốt nhất và một nửa gen "tệ nhất"
- Con cái trải qua các **đột biến** ngẫu nhiên (to hơn một chút, nhanh hơn một chút...)
- Kirby cũ được thay thế bằng Kirby mới
- Bạn bắt đầu lại

Sau 180 thế hệ (~15 giờ), Kirby tiến hóa từ khả năng sống sót 15 giây lên **15 phút**. Chúng trở nên nhỏ gọn (hitbox nhỏ hơn), nhanh chóng, và liên tục chạy trốn nguy hiểm.

![Mô phỏng Kirby thế hệ 0: các vòng tròn màu sắc phân tán ngẫu nhiên trên nền đen, tất cả có kích thước tương tự](/images/laupok-mario-ai/kirby-gen0.jpg)

![Mô phỏng Kirby thế hệ 1866: Kirby nhỏ hơn, nhanh hơn, và liên tục chạy trốn nguy hiểm](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Thống kê mô phỏng Kirby: fitness, máu, hành vi của mỗi cá thể được xếp hạng theo hiệu suất](/images/laupok-mario-ai/kirby-stats.jpg)

Điểm mấu chốt: **bạn không định nghĩa giải pháp**. Thuật toán **tự tìm ra nó**. Và đó chính xác là điều khiến nó mạnh mẽ đối với các bài toán mà bạn không biết tổ hợp tham số tối ưu sẽ như thế nào.

### Mạng nơ-ron nhân tạo

Mạng nơ-ron là một mô hình toán học đơn giản hóa của não người. Nó bao gồm:
- **Nơ-ron đầu vào**: những gì mạng "thấy"
- **Nơ-ron đầu ra**: những gì mạng "quyết định"
- **Kết nối (trọng số)**: mỗi kết nối có một **trọng số** khuếch đại hoặc giảm tín hiệu

Nguyên tắc đơn giản: mỗi nơ-ron đầu vào gửi giá trị của nó. Nó được nhân với trọng số kết nối, rồi cộng dồn với các tín hiệu khác. Nếu kết quả vượt quá một ngưỡng nhất định (**hàm kích hoạt**), nơ-ron đầu ra sẽ kích hoạt.

Trong phép so sánh của Laupok với Mario và con trỏ chuột:
- Nơ-ron đầu vào = khoảng cách giữa Mario và con trỏ
- Trọng số kết nối = độ nhạy của Mario
- Nơ-ron đầu ra = Mario có la hay không

Con trỏ càng gần, giá trị đầu vào càng cao. Nếu trọng số mạnh, tín hiệu đầu ra mạnh, và Mario sẽ la. Bằng cách thay đổi trọng số, bạn thay đổi độ nhạy của Mario.

![Demo "Mario sợ hãi": Mario đối mặt với Boo với thanh nối xơ hiển thị trọng số kết nối giữa đầu vào và đầu ra](/images/laupok-mario-ai/mario-fear-demo.jpg)

Trong mạng nơ-ron thực tế của AI, đó là cùng một logic, nhưng ở quy mô lớn hơn nhiều:
- **99 nơ-ron đầu vào** (11×9 ô trong tầm nhìn của Mario)
- **8 nơ-ron đầu ra** (A, B, X, Y, Lên, Xuống, Trái, Phải)
- **Nơ-ron ẩn** ở giữa
- Hàng trăm kết nối với các trọng số khác nhau

---

## NEAT: thuật toán thay đổi mọi thứ

### Vấn đề với thuật toán di truyền cơ bản

Nếu bạn kết hợp một cách đơn giản thuật toán di truyền với mạng nơ-ron, bạn sẽ gặp vấn đề: bạn tạo ra 100 mạng nơ-ron hoàn toàn khác nhau, và bạn không thể so sánh chúng. Mỗi mạng có nơ-ron, kết nối, và trọng số riêng. Làm sao bạn biết hai mạng là "tương tự" hay "khác biệt"?

Đây là nơi **NEAT** xuất hiện -- NeuroEvolution of Augmenting Topologies (Tiến hóa nơ-ron mở rộngtopologies). Được phát minh bởi **Kenneth Stanley** và **Risto Miikkulainen** vào năm 2002, nó giải quyết chính xác vấn đề này.

### Các loài

Cơ chế then chốt đầu tiên của NEAT là **các loài**. Khi một mạng nơ-ron trở nên quá khác biệt so với mạng khác, nó được phân loại vào một loài khác. Độ tương tự được tính toán thông qua ba tham số:

1. **Vượt trội** (`EXCES_COEF = 0.50`): số lượng kết nối không có điểm chung giữa hai mạng (các đổi mới khác nhau)
2. **Rời rạc**: tương tự, nhưng đối với các kết nối ở giữa
3. **Chênh lệch trọng số** (`POIDSDIFF_COEF = 0.92`): chênh lệch trọng số trung bình giữa các kết nối chia sẻ cùng một đổi mới

Công thức tính điểm:

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

Nếu điểm này thấp hơn `DIFF_LIMITE` (1.0), hai mạng thuộc cùng một loài. Nếu không, một loài mới sẽ được tạo.

### Các đổi mới

Đây là điểm thiên tài của NEAT. Mỗi khi một kết nối được tạo, nó nhận một số **đổi mới** duy nhất, toàn cục. Số này đi theo mạng nơ-ron ngay cả khi nó sinh sản.

Cụ thể, khi một cá thể con được tạo thông qua lai, nó kế thừa các đổi mới của cha mẹ. Nếu hai mạng chia sẻ cùng một đổi mới, điều đó có nghĩa là chúng có một kết nối từ cùng một tổ tiên. Đây là điều cho phép so sánh các mạng có kích thước khác nhau.

### Lai

Khi hai mạng nơ-ron sinh sản, **lai** hoạt động như sau:

![Laupok giải thích khái niệm lai với văn bản "CROSSOVER" được chồng lên](/images/laupok-mario-ai/crossover-label.jpg)

1. Mạng có hiệu suất tốt hơn trở thành "cha mẹ trội"
2. Cá thể con kế thừa tất cả các kết nối từ cha mẹ trội
3. Đối với mỗi kết nối chia sẻ cùng một đổi mới, cha mẹ khác có thể thay thế nó (50% khả năng)
4. Chỉ các kết nối đang hoạt động từ cha mẹ không trội mới có thể thay thế

Điều này đảm bảo cá thể con luôn ít nhất tốt bằng cha mẹ tốt nhất.

### Đột biến

Sau khi lai, cá thể con trải qua các đột biến với xác suất có thể cấu hình:

![Laupok giải thích đột biến với văn bản "(small modif = mutation)" được chồng lên](/images/laupok-mario-ai/mutation-label.jpg)

| Đột biến | Xác suất | Hiệu ứng |
|----------|----------|-----------|
| Đặt lại trọng số kết nối | 25% | Trọng số được ngẫu nhiên hóa hoàn toàn |
| Đột biến trọng số | 95% | Trọng số thay đổi ±0.80 |
| Thêm kết nối | 85% | Kết nối mới giữa hai nơ-ron chưa được liên kết |
| Thêm nơ-ron | 39% | Một nơ-ron ẩn được chèn vào giữa hai nơ-ron đã liên kết |

Tỷ lệ thêm nơ-ron rất quan trọng: đó là điều cho phép mạng **phát triển**. Ban đầu, chỉ có đầu vào và đầu ra. Dần dần, các nơ-ron ẩn xuất hiện, khiến mạng ngày càng phức tạp hơn.

---

## Code: phân tích toàn bộ

### Hằng số

Script bắt đầu với một khối hằng số định nghĩa tất cả các cài đặt:

```lua
-- Mario's view around him
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 pixels wide
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 pixels tall
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tiles
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tiles

-- Neural network
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 inputs (visible tiles)
NB_OUTPUT = 8  -- A, B, X, Y, Up, Down, Left, Right
NB_INDIVIDU_POPULATION = 100  -- individuals per population
NB_NEURONE_MAX = 100000  -- max hidden neurons

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- value when level is finished
NB_FRAME_RESET_BASE = 33  -- frames without progress before reset
NB_FRAME_RESET_PROGRES = 300  -- frames if progress detected

-- Species
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- Mutations
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` là 99 vì tầm nhìn của Mario là 11×9 ô. Mỗi ô là một nơ-ron đầu vào. Ô trống = 0. Khối = 1. Kẻ thù = -1.

8 đầu ra tương ứng với các nút điều khiển SNES: A, B, X, Y, Lên, Xuống, Trái, Phải. Start, Select, L và R bị loại trừ để chúng không "làm mất tập trung" của Mario.

### Cấu trúc dữ liệu

Script định nghĩa ba cấu trúc chính:

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- current neuron value
    neurone.id = 0        -- unique identifier
    neurone.type = ""     -- "input", "output", or "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- source neuron ID
    connexion.sortie = 0     -- destination neuron ID
    connexion.actif = true   -- can be disabled if a hidden neuron is inserted
    connexion.poids = 0      -- connection weight
    connexion.innovation = 0 -- unique innovation number
    connexion.allume = false -- for display: true if signal passes
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- number of hidden neurons
        fitness = 1,          -- performance (distance traveled)
        idEspeceParent = 0,   -- which species it belongs to
        lesNeurones = {},     -- neuron array
        lesConnexions = {}    -- connection array
    }
    -- Initialize with inputs
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Then outputs
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

Ban đầu, mỗi mạng chỉ có đầu vào và đầu ra. Không có nơ-ron ẩn, không có kết nối. Thuật toán quyết định xem có cần chúng hay không.

### Đột biến chi tiết

#### Đột biến trọng số

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25%: total weight reset
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75%: variation of ±0.80
                if math.random() >= 0.5 then
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids - POIDS_CONNEXION_MUTATION_AJOUT
                else
                    unReseau.lesConnexions[i].poids =
                        unReseau.lesConnexions[i].poids + POIDS_CONNEXION_MUTATION_AJOUT
                end
            end
        end
    end
end
```

Trọng số ban đầu luôn là 1 hoặc -1 (`genererPoids()`). Biên độ ±0.80 có thể đẩy nó giữa các giá trị âm và dương, thay đổi hành vi của mạng một cách triệt để.

#### Thêm kết nối

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Shuffle the neuron list
    for i, v in ipairs(unReseau.lesNeurones) do
        local pos = math.random(1, #liste+1)
        table.insert(liste, pos, v)
    end

    local traitement = false
    for i = 1, #liste, 1 do
        for j = 1, #liste, 1 do
            if i ~= j then
                local n1 = liste[i]
                local n2 = liste[j]
                -- Valid connection: input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Check no connection already exists
                    local dejaConnexion = false
                    for k = 1, #unReseau.lesConnexions, 1 do
                        if unReseau.lesConnexions[k].entree == n1.id
                            and unReseau.lesConnexions[k].sortie == n2.id then
                            dejaConnexion = true
                            break
                        end
                    end
                    if dejaConnexion == false then
                        traitement = true
                        ajouterConnexion(unReseau, n1.id, n2.id)
                    end
                end
            end
            if traitement then break end
        end
        if traitement then break end
    end
end
```

Bạn không thể kết nối đầu ra với đầu vào (điều đó sẽ tạo ra vòng lặp), và bạn không thể kết nối hai nơ-ron đã được liên kết. Việc xáo trộn đảm bảo các khả năng khác nhau được khám phá mỗi lần.

#### Thêm nơ-ron

Đây là đột biến thú vị nhất:

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Shuffle connections
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Disable the existing connection
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Create the hidden neuron
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Connect input to hidden neuron
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Connect hidden neuron to output
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

Cơ chế: bạn lấy một kết nối hiện có, **vô hiệu hóa nó**, và chèn một nơ-ron ẩn vào giữa. Kết nối gốc được thay thế bằng hai kết nối mới: đầu vào→ẩn và ẩn→đầu ra. Nó giống như cắt một dây điện để chèn vào một công tắc.

Đây chính là điều khiến NEAT "mở rộngtopologies": mạng **phát triển** theo thời gian. Nó bắt đầu đơn giản và trở nên phức tạp chỉ khi cần thiết.

### Hàm feedForward

Đây là hàm truyền tín hiệu qua mạng:

```lua
function feedForward(unReseau)
    -- Reset output neurons
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- Propagation
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local avantTraitement = unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur =
                unReseau.lesNeurones[unReseau.lesConnexions[i].entree].valeur *
                unReseau.lesConnexions[i].poids +
                unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur

            if avantTraitement ~= unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur then
                unReseau.lesConnexions[i].allume = true
            else
                unReseau.lesConnexions[i].allume = false
            end
        end
    end
end
```

Mỗi kết nối đang hoạt động gửi `giá trị đầu vào × trọng số` đến nơ-ron đầu ra. Giá trị được **cộng dồn** (cộng lại). Cờ `allume` chỉ dùng cho hiển thị mạng trực quan.

### Đọc bộ nhớ trò chơi

Hàm `getLesInputs()` chuyển đổi thế giới Super Mario World thành dữ liệu mà mạng có thể hiểu được:

```lua
function getLesInputs()
    local lesInputs = {}
    -- Initialize to 0 (gray = nothing)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Sprites (enemies) = -1 (black)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Tiles (blocks) = tile value (white if > 0)
    local lesTiles = getLesTiles()
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local indice = getIndiceLesInputs(i, j)
            if lesTiles[indice] ~= 0 then
                lesInputs[indice] = lesTiles[indice]
            end
        end
    end

    return lesInputs
end
```

Lưới đầu vào là một tầm nhìn tập trung vào Mario: rộng 11 ô, cao 9 ô. Giá trị của mỗi ô:
- **0** (xám): không có gì
- **1** (trắng): khối rắn
- **-1** (đen): kẻ thù

Kẻ thù được đọc từ hai danh sách trong RAM: sprite bình thường (`0x14C8`-`0x14F8`) và sprite mở rộng (`0x170B`-`0x173B`). Đối với mỗi sprite đang sống (trạng thái > 7), vị trí ô của nó so với Mario được tính toán và -1 được đặt vào ô tương ứng.

### Fitness: cách AI biết nó đang tiến bộ

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Level finished!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario moved right
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Update inputs
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

Fitness rất đơn giản: đó là **quãng đường di chuyển về phía bên phải**. Nếu Mario di chuyển 10 pixel, fitness tăng thêm 10. Nếu Mario di chuyển sang trái, không có gì xảy ra (không bị phạt). Nếu màn chơi hoàn thành (địa chỉ `0x0100` == 12), fitness trở thành 1.000.000.

Nó cố ý đơn giản. Không có điểm thưởng khi giết kẻ thù, không có hình phạt khi chết. Chỉ đơn giản: di chuyển sang phải.

### Đặt lại thông minh

Nếu Mario không di chuyển trong 33 khung hình, màn chơi được đặt lại và chúng ta chuyển sang cá thể tiếp theo. Nhưng nếu Mario đã tiến bộ (fitness hiện tại khác với lúc đầu), chúng ta đợi 300 khung hình -- cho mạng cơ hội "hiểu" những gì nó đã làm đúng.

```lua
if fitnessAvant == laPopulation[idPopulation].fitness
   and memory.readbyte(0x13D4) == 0 then
    nbFrameStop = nbFrameStop + 1
    local nbFrameReset = NB_FRAME_RESET_BASE
    if fitnessInit ~= laPopulation[idPopulation].fitness
       and memory.readbyte(0x0071) ~= 9 then
        nbFrameReset = NB_FRAME_RESET_PROGRES
    end
    if nbFrameStop > nbFrameReset then
        nbFrameStop = 0
        lancerNiveau()
        idPopulation = idPopulation + 1
        -- ...
    end
end
```

Điều kiện `memory.readbyte(0x0071) ~= 9` kiểm tra xem Mario có đang trong hoạt ảnh chết hay không. Không có ý nghĩa gì khi đặt lại khi Mario đã chết.

### Vòng lặp chính

Vòng lặp chạy ở 30 fps (tốc độ bình thường của Super Mario World):

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Display (network, info)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- speed up
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- The 3 vital functions
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Reset if no progress
    -- ...
    -- New generation if all individuals tested
    -- ...
end
```

Ba hàm quan trọng là `majReseau`, `feedForward`, và `appliquerLesBoutons`. Vô hiệu hóa bất kỳ hàm nào trong số này, Mario sẽ ngừng di chuyển.

### Lai

```lua
function crossover(unReseau1, unReseau2)
    local leReseau = newReseau()
    local leBon = unReseau1
    local leNul = unReseau2

    if leBon.fitness < leNul.fitness then
        leBon = unReseau2
        leNul = unReseau1
    end

    leReseau = copier(leBon)

    for i = 1, #leReseau.lesConnexions, 1 do
        for j = 1, #leNul.lesConnexions, 1 do
            if leReseau.lesConnexions[i].innovation == leNul.lesConnexions[j].innovation
               and leNul.lesConnexions[j].actif then
                if math.random() > 0.5 then
                    leReseau.lesConnexions[i] = leNul.lesConnexions[j]
                end
            end
        end
    end
    leReseau.fitness = 1
    return leReseau
end
```

Cá thể con kế thừa từ cha mẹ tốt hơn. Đối với mỗi kết nối chia sẻ cùng một đổi mới, cha mẹ khác có 50% khả năng thay thế nó -- nhưng **chỉ khi kết nối đang hoạt động**. Đây là một sửa đổi quan trọng: nếu không, các nơ-ron ẩn vô dụng có thể được tạo ra.

### Chọn loài

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Calculate average fitness per species
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Each species creates a number of children proportional to its average fitness
    for i = 1, #lesEspeces, 1 do
        local nbEnfant = math.ceil(
            #lesEspeces[i].lesReseaux *
            lesEspeces[i].fitnessMoyenne / fitnessMoyenneGlobal)

        for j = 1, nbEnfant, 1 do
            local unReseau = crossover(
                choisirParent(lesEspeces[i].lesReseaux),
                choisirParent(lesEspeces[i].lesReseaux))
            mutation(unReseau)
            laNouvellePopulation[indiceNouvelleEspece] = copier(unReseau)
        end
    end
end
```

Ý tưởng: một loài có fitness trung bình 10.000 sẽ tạo ra nhiều con cái hơn nhiều so với một loài có fitness trung bình 1. Đây là **chọn lọc tự nhiên** đang hoạt động.

`choisirParent` sử dụng chọn lọc bằng roulette: fitness của cá thể càng cao, khả năng nó được chọn làm cha mẹ càng lớn.

### Lưu và tải

Quần thể được lưu vào các tệp `.pop`:

```lua
function sauvegarderUnReseau(unReseau, fichier)
    io.write(unReseau.nbNeurone .. "\n")
    io.write(#unReseau.lesConnexions .. "\n")
    io.write(unReseau.fitness .. "\n")
    for i = 1, unReseau.nbNeurone, 1 do
        local indice = NB_INPUT + NB_OUTPUT + i
        io.write(unReseau.lesNeurones[indice].id .. "\n")
    end
    for i = 1, #unReseau.lesConnexions, 1 do
        local actif = 1
        if unReseau.lesConnexions[i].actif ~= true then actif = 0 end
        io.write(actif .. "\n" ..
            unReseau.lesConnexions[i].entree .. "\n" ..
            unReseau.lesConnexions[i].sortie .. "\n" ..
            unReseau.lesConnexions[i].poids .. "\n" ..
            unReseau.lesConnexions[i].innovation .. "\n")
    end
end
```

Việc lưu cũng bao gồm cá thể tốt nhất từ tất cả các quần thể trước đó. Nếu cá thể tốt nhất của quần thể cũ tốt hơn quần thể mới, chúng ta quay lại sử dụng quần thể cũ làm cơ sở. Đây là một hình thức **elitism**: cá thể tốt nhất không bao giờ bị mất.

### Hiển thị trực quan mạng

Laupok đã thêm một trình hiển thị trực quan mạng nơ-ron được chồng lên trò chơi:

```lua
function dessinerUnReseau(unReseau)
    -- Inputs: 11×9 grid around Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- enemy
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- block
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Outputs: 8 buttons
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Connections
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            local alpha = 25
            if unReseau.lesConnexions[i].allume then alpha = 255 end
            local couleur = forms.createcolor(255, 255, 255, alpha)
            gui.drawLine(
                lesPositions[unReseau.lesConnexions[i].entree].x,
                lesPositions[lesConnexions[i].entree].y,
                lesPositions[unReseau.lesConnexions[i].sortie].x,
                lesPositions[lesConnexions[i].sortie].y,
                couleur)
        end
    end
end
```

Nó cực kỳ hữu ích để hiểu những gì mạng đang làm. Các kết nối đang hoạt động có màu trắng, các kết nối không hoạt động có độ trong suốt một phần. Đầu vào là một lưới các ô trắng/đen/xám. Đầu ra hiển thị những nút nào đang được nhấn.

---

## Kết quả

### Những gì AI đã học được

Sau nhiều giờ (và nhiều ngày) thực thi, AI đã tự khám phá ra:

1. **Di chuyển sang phải**: hành vi cơ bản nhất, nhưng yêu cầu giữ nút Phải
2. **Nhảy qua kẻ thù**: bằng cách kết nối đầu vào "phát hiện kẻ thù" với nút A hoặc B
3. **Tránh chướng ngại vật**: một số mạng đã học cách tạm thời rút lui để tiến xa hơn
4. **Hoàn thành màn chơi**: cá thể tốt nhất có thể vượt qua màn chơi đầu tiên của Super Mario World

![Mario được điều khiển bởi AI đối mặt với Boo trong một màn Super Mario World -- mạng nơ-ron quyết định hành động trong thời gian thực](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Hạn chế

Dự án có những hạn chế của nó:

- **Một màn chơi**: AI được huấn luyện trên một màn chơi cụ thể. Nó không tự động khái quát hóa sang các màn chơi khác
- **Thời gian huấn luyện**: cần hàng chục giờ để đạt được kết quả thỏa mãn
- **Không hiểu biết**: AI không "hiểu" những gì nó đang làm. Nó tối ưu hóa một hàm fitness (quãng đường di chuyển) thông qua các đột biến ngẫu nhiên
- **T-bagging**: Laupok nhận thấy Mario có xu hướng nhảy tại chỗ khi nhìn thấy kẻ thù, đơn giản vì điều đó làm tăng fitness (nó tiến bộ một chút trong khi nhảy)

---

## Cách tái hiện thí nghiệm

Laupok đã chia sẻ tất cả. Đây là các bước:

1. **Tải BizHawk** từ [tasvideos.org](https://tasvideos.org/BizHawk) (phần Download)
2. **Lấy ROM USA của Super Mario World** (bản sao riêng từ cartridge của bạn)
3. **Tải script Lua** từ [Pastebin](https://pastebin.com/Jcvdqhqm) -- đổi tên thành `mario.lua`
4. **Đặt script cùng thư mục với ROM**
5. **Khởi chạy BizHawk**, mở ROM
6. **Trong cửa sổ Lua console**: `dofile("mario.lua")` hoặc qua menu Script > Open Script
7. **Lưu trạng thái** tại đầu màn chơi (menu Savestate > Save State) và đặt tên `debut.state`
8. **Khởi chạy lại script** -- nó hoạt động

Script bao gồm một biểu mẫu với các tùy chọn:
- **Accelerate**: tắt giới hạn 30 fps để chạy nhanh hơn
- **Show network**: hiển thị mạng nơ-ron chồng lên trò chơi
- **Show info**: hiển thị banner với thế hệ, fitness, và số lượng loài
- **Pause**: tạm dừng thực thi
- **Save/Load**: lưu quần thể hiện tại vào tệp `.pop`

---

## Nguồn và tham khảo

| Tài nguyên | Liên kết |
|----------|------|
| Video chính của Laupok | [Tôi đã tạo AI tự chơi Mario](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Video giới thiệu code + hướng dẫn | [Cách thiết lập AI + giới thiệu source code](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Source code đầy đủ | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Bài báo NEAT gốc | Stanley & Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| Hướng dẫn N8Programs | [Giới thiệu triển khai NEAT](https://n8programs.github.io/) (JavaScript, nhưng các khái niệm giống hệt) |
| 16blings (nguồn cảm hứng của Laupok) | [AI chơi Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Bộ nhớ Super Mario World | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Kết luận

Những gì Laupok đã làm là lấy một thuật toán học thuật (NEAT, 2002), viết lại bằng Lua cho một trình giả lập (BizHawk), và áp dụng nó vào Super Mario World. Kết quả: một AI tự học chơi trò chơi từ đầu, không có kiến thức trước, chỉ thông qua các đột biến ngẫu nhiên và chọn lọc tự nhiên.

Đó là một ví dụ tuyệt đẹp về sức mạnh của thuật toán di truyền. Không có học sâu, không có GPU, không có hàng triệu dữ liệu huấn luyện. Chỉ có chọn lọc tự nhiên, một chút Lua, và rất nhiều kiên nhẫn.

Code được bình luận, chia sẻ, và Laupok đã làm hai video giải thích -- một cho các khái niệm lớn, một cho code. Nếu chủ đề này interest bạn, hãy đi sâu vào. Nó dễ tiếp cận hơn vẻ ngoài của nó.
