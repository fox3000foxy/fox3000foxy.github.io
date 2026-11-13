---
title: "Laupok đã tạo AI chơi Super Mario World một mình -- nó chạy thế nào"

date: 2026-07-11
tags:
  - ai
  - lua
  - emulation
  - reverse-engineering
authors:
  - fox3000foxy
author_pubkey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoFS9I15CAZojXYc6NMqggEYGct9o9b3JnWdXWOtlzgs2lclmqw8adtWgXUeeBMRHvm5LoajQ+OcImaAyA8jwYA=="
author_sig: "nPArIJEOvTpg8Vny35DiiATREIB5NXbyL7T2x2rw7H7Slb9Q4A6lHjkhIF/gzqbuPKyUqrIVLMmb9ENmmF/EXQ=="
---

# Laupok đã tạo AI chơi Super Mario World một mình -- nó chạy thế nào

Laupok đã tạo một trí tuệ nhân tạo chơi **Super Mario World** hoàn toàn tự chủ. Nó khởi đầu từ con số không : không script định sẵn, không frame ghi sẵn. AI tự học, bằng đột biến ngẫu nhiên và chọn lọc tự nhiên, để qua màn game. Dự án chạy trên **BizHawk**, trình giả lập đa nền tảng, qua script Lua khoảng **4200 dòng**.

Điều khiến dự án này cuốn hút là nó dựa trên khái niệm sinh học áp vào tin học : **thuyết tiến hóa của Darwin**, **mạng nơ-ron nhân tạo**, và nhất là một thuật toán cụ thể tên **NEAT** (NeuroEvolution of Augmenting Topologies). AI ban đầu không biết gì về game. Nó thử hành động ngẫu nhiên, thất bại hàng nghìn lần, và dần dần hiểu cách tiến lên, nhảy, và sống sót.

Trong bài này, ta sẽ mổ xẻ tất cả -- khái niệm theo khái niệm, dòng mã theo dòng mã.

![Laupok giới thiệu thuật toán NEAT trước camera](/images/laupok-mario-ai/neat-title.jpg)

---

## Setup : BizHawk, Lua, và Super Mario World

### Trình giả lập BizHawk

BizHawk là trình giả lập open source hỗ trợ cả đống console -- NES, SNES, Genesis, PS1, Game Boy, và nhiều nữa. Đặc biệt ở chỗ nó cho chạy **script Lua** song song với game. Các script này truy cập **bộ nhớ RAM** của giả lập, nghĩa là chúng có thể đọc -- và sửa -- bất kỳ dữ liệu nào của game thời gian thực.

Cụ thể, nghĩa là ta có thể :
- Đọc vị trí Mario trong màn
- Biết sprite (kẻ thù, vật phẩm) nào trên màn hình
- Biết trạng thái mỗi tile (khối) quanh Mario
- Điều khiển tay cầm -- bấm bất kỳ nút nào

Đó chính xác là những gì cần để AI chơi.

### Địa chỉ bộ nhớ của Super Mario World

Trong RAM Super Mario World, mỗi dữ liệu nằm ở địa chỉ cụ thể. Giống khu phố : mỗi địa chỉ là một "ngôi nhà" chứa một thông tin. Ví dụ :

| Địa chỉ | Dữ liệu |
|---------|--------|
| `0x94`-`0x95` | Vị trí X của Mario (16-bit, little-endian) |
| `0x96`-`0x97` | Vị trí Y của Mario |
| `0x14C8`+`i` | Trạng thái sprite `i` (>7 = sống) |
| `0xE4`+`i` | Vị trí X thấp của sprite `i` |
| `0x14E0`+`i` | Vị trí X cao của sprite `i` |
| `0xD8`+`i` | Vị trí Y thấp của sprite `i` |
| `0x14D4`+`i` | Vị trí Y cao của sprite `i` |
| `0x170B`+`i` | Kiểu extended sprite `i` |
| `0x0100` | Trạng thái game (12 = qua màn) |
| `0x13D4` | Tạm dừng đang bật |
| `0x0071` | Animation chết của Mario (9 = chết) |
| `0x1C800`+... | Bảng tile của màn |

Vị trí sprite dùng hai byte : một byte "thấp" và một byte "cao", vì vị trí có thể vượt 255 pixel. Công thức luôn là `thấp + cao × 256`.

Với tile, phức tạp hơn : địa chỉ cơ sở là `0x1C800`, và ta tính offset theo tọa độ `x` và `y` của tile trong thế giới, với bước 16 pixel mỗi tile.

![Super Mario World với overlay gỡ lỗi hiện địa chỉ bộ nhớ sprite và vị trí Mario](/images/laupok-mario-ai/memory-debug.jpg)

---

## Nền tảng : thuật toán di truyền và mạng nơ-ron

Trước khi lặn vào mã, cần hiểu hai khái niệm nền. Không có chúng, phần còn lại vô nghĩa.

### Thuật toán di truyền

Thuật toán di truyền là mô phỏng **thuyết tiến hóa**. Ý tưởng cốt lõi : ta tạo **quần thể** cá thể, mỗi cá thể có đặc điểm hơi khác nhau (các "gen"). Ta cho chúng "sống" trong môi trường. Kẻ xoay xở tốt nhất sống sót và sinh sản. Kẻ kém biến mất.

Laupok minh họa bằng phép tương tự **Kirby** :
- Quần thể Kirby xuất hiện trên địa hình có gai và cà chua
- Gai trừ điểm sinh mệnh, cà chua hồi lại
- Mỗi Kirby có gen : kích thước, tốc độ, điểm sinh mệnh, hành vi (chạy trốn, tìm cà chua, lao bừa)

![Chuỗi xoắn ADN với nhãn "đứa bé", "kích thước", "tốc độ", "màu sắc" -- các gen tạo nên cá thể](/images/laupok-mario-ai/dna-genes.jpg)

- Sau 15 giây, ta xem ai sống lâu nhất
- Kirby giỏi nhất sinh sản với các Kirby khác : con thừa hưởng nửa gen từ đứa giỏi nhất và nửa từ đứa "tệ nhất"
- Các con chịu **đột biến** ngẫu nhiên (to hơn chút, nhanh hơn chút...)
- Kirby cũ bị thay bằng Kirby mới
- Chạy lại

Sau 180 thế hệ (~15 giờ), Kirby đi từ 15 giây sống sót lên **15 phút**. Chúng thành nhỏ (vùng va chạm giảm), nhanh, và luôn chạy trốn nguy hiểm.

![Mô phỏng Kirby thế hệ 0 : các vòng tròn màu rải ngẫu nhiên trên nền đen, kích thước tương đương](/images/laupok-mario-ai/kirby-gen0.jpg)

![Mô phỏng Kirby thế hệ 1866 : Kirby nhỏ hơn, nhanh hơn, và lánh nguy hiểm có hệ thống](/images/laupok-mario-ai/kirby-gen1866.jpg)

![Thống kê mô phỏng Kirby : fitness, điểm sinh mệnh, hành vi mỗi cá thể xếp theo hiệu năng](/images/laupok-mario-ai/kirby-stats.jpg)

Điểm then chốt : **ta không định nghĩa lời giải**. Thuật toán **tự tìm ra**. Và đó chính xác là thứ khiến nó mạnh với bài toán nơi ta không biết tổ hợp tham số nào tối ưu.

### Mạng nơ-ron nhân tạo

Mạng nơ-ron là mô hình toán rút gọn của não người. Nó gồm :
- **Nơ-ron đầu vào** (input) : những gì mạng "thấy"
- **Nơ-ron đầu ra** (output) : những gì mạng "quyết"
- **Kết nối** (trọng số) : mỗi kết nối có **trọng số** khuếch đại hay làm suy tín hiệu

Nguyên tắc đơn giản : mỗi nơ-ron đầu vào gửi giá trị của nó. Nó được nhân với trọng số kết nối, rồi cộng với các tín hiệu khác. Nếu kết quả vượt ngưỡng nào đó (**hàm kích hoạt**), nơ-ron đầu ra kích hoạt.

Trong phép tương tự của Laupok với Mario và đầu chuột :
- Nơ-ron đầu vào = khoảng cách giữa Mario và đầu chuột
- Trọng số kết nối = độ nhạy của Mario
- Nơ-ron đầu ra = Mario hét hay không

Đầu chuột càng gần, giá trị đầu vào càng cao. Nếu trọng số mạnh, tín hiệu gửi ra mạnh, và Mario sẽ hét. Sửa trọng số, ta sửa độ nhạy của Mario.

![Demo "Mario sợ hãi" : Mario đối mặt Boo với thanh synapse hiện trọng số kết nối giữa đầu vào và đầu ra](/images/laupok-mario-ai/mario-fear-demo.jpg)

Trong mạng nơ-ron thật của AI, đó là cùng logic, nhưng ở quy mô lớn :
- **99 nơ-ron đầu vào** (11×9 tile của tầm nhìn Mario)
- **8 nơ-ron đầu ra** (A, B, X, Y, Lên, Xuống, Trái, Phải)
- Nơ-ron **ẩn** (hidden) ở giữa
- Hàng trăm kết nối với trọng số đa dạng

---

## NEAT : thuật toán thay đổi mọi thứ

### Vấn đề của thuật toán di truyền cổ điển

Nếu kết hợp thuật toán di truyền với mạng nơ-ron một cách ngây thơ, ta gặp vấn đề : ta tạo 100 mạng nơ-ron hoàn toàn khác nhau, mà không biết so sánh chúng. Mỗi cái có nơ-ron riêng, kết nối riêng, trọng số riêng. Làm sao biết hai mạng "gần" hay "xa"?

Đó là lúc **NEAT** -- NeuroEvolution of Augmenting Topologies -- xuất hiện. Do **Kenneth Stanley** và **Risto Miikkulainen** phát minh năm 2002, đó là thuật toán giải đúng bài toán này.

### Các loài

Cơ chế mấu chốt đầu tiên của NEAT là các **loài**. Khi một mạng nơ-ron trở nên quá khác mạng khác, nó được xếp vào loài khác. Độ tương đồng tính qua ba tham số :

1. **Excess** (`EXCES_COEF = 0.50`) : số kết nối không liên quan gì giữa hai mạng (đổi mới khác nhau)
2. **Disjoint** : tương tự, nhưng cho kết nối nằm ở giữa
3. **Chênh lệch trọng số** (`POIDSDIFF_COEF = 0.92`) : chênh lệch trọng số trung bình giữa các kết nối chung đổi mới

Công thức điểm :

```
score = (EXCES_COEF × disjoint) / max(nbConnexions1 + nbConnexions2, 1)
      + POIDSDIFF_COEF × diffPoids
```

Nếu điểm này dưới `DIFF_LIMITE` (1.0), hai mạng cùng loài. Ngược lại, tạo loài mới.

### Các đổi mới

Đó là thiên tài của NEAT. Mỗi khi kết nối được tạo, nó nhận số **đổi mới** duy nhất và toàn cục. Số này theo mạng nơ-ron ngay cả khi nó sinh sản.

Cụ thể, khi đứa bé sinh từ lai ghép, nó thừa hưởng đổi mới của bố mẹ. Nếu hai mạng chung đổi mới, nghĩa là chúng có kết nối tới từ cùng tổ tiên. Đó là thứ cho phép so sánh mạng kích thước khác nhau.

### Lai ghép

Khi hai mạng nơ-ron sinh sản, **lai ghép** chạy như sau :

![Laupok giải thích khái niệm lai ghép với chữ "CROSSOVER" phủ trên](/images/laupok-mario-ai/crossover-label.jpg)

1. Mạng hiệu năng nhất thành "bố mẹ trội"
2. Đứa bé thừa hưởng mọi kết nối của bên trội
3. Với mỗi kết nối chung đổi mới, bố mẹ kia có thể thay thế (50% cơ hội)
4. Chỉ kết nối đang hoạt động của bố mẹ không trội mới được thay

Việc này đảm bảo đứa bé luôn ít nhất giỏi bằng bố mẹ giỏi nhất.

### Đột biến

Sau lai ghép, đứa bé chịu đột biến với xác suất cấu hình được :

![Laupok giải thích đột biến với chữ "(sửa nhỏ = đột biến)" phủ trên](/images/laupok-mario-ai/mutation-label.jpg)

| Đột biến | Xác suất | Hiệu ứng |
|----------|------------|-------|
| Reset trọng số kết nối | 25% | Trọng số ngẫu nhiên hoàn toàn |
| Đột biến trọng số | 95% | Trọng số thay đổi ±0.80 |
| Thêm kết nối | 85% | Kết nối mới giữa hai nơ-ron chưa nối |
| Thêm nơ-ron | 39% | Nơ-ron ẩn chèn giữa hai nơ-ron đã nối |

Tỷ lệ thêm nơ-ron quan trọng : đó là thứ cho phép mạng **lớn lên**. Ban đầu, chỉ có đầu vào và đầu ra. Dần dần, nơ-ron ẩn xuất hiện, khiến mạng ngày càng phức tạp.

---

## Mã nguồn : walkthrough đầy đủ

### Các hằng số

Script bắt đầu bằng khối hằng số định nghĩa mọi tham số :

```lua
-- Tầm nhìn của Mario quanh nó
TAILLE_TILE = 16
TAILLE_VUE_W = TAILLE_TILE * 11  -- 176 pixel chiều rộng
TAILLE_VUE_H = TAILLE_TILE * 9   -- 144 pixel chiều cao
NB_TILE_W = TAILLE_VUE_W / TAILLE_TILE  -- 11 tile
NB_TILE_H = TAILLE_VUE_H / TAILLE_TILE  -- 9 tile

-- Mạng nơ-ron
NB_INPUT = NB_TILE_W * NB_TILE_H  -- 99 input (tile nhìn thấy)
NB_OUTPUT = 8  -- A, B, X, Y, Lên, Xuống, Trái, Phải
NB_INDIVIDU_POPULATION = 100  -- cá thể cho mỗi quần thể
NB_NEURONE_MAX = 100000  -- giới hạn nơ-ron ẩn

-- Fitness
FITNESS_LEVEL_FINI = 1000000  -- giá trị khi qua màn
NB_FRAME_RESET_BASE = 33  -- frame không tiến triển trước reset
NB_FRAME_RESET_PROGRES = 300  -- frame nếu phát hiện tiến triển

-- Loài
EXCES_COEF = 0.50
POIDSDIFF_COEF = 0.92
DIFF_LIMITE = 1.00

-- Đột biến
CHANCE_MUTATION_RESET_CONNEXION = 0.25
POIDS_CONNEXION_MUTATION_AJOUT = 0.80
CHANCE_MUTATION_POIDS = 0.95
CHANCE_MUTATION_CONNEXION = 0.85
CHANCE_MUTATION_NEURONE = 0.39
```

`NB_INPUT` là 99 vì tầm nhìn Mario là 11×9 tile. Mỗi tile là một nơ-ron đầu vào. Nếu tile trống, nó bằng 0. Nếu là khối, nó bằng 1. Nếu là kẻ thù, nó bằng -1.

8 đầu ra khớp các nút tay cầm SNES : A, B, X, Y, Lên, Xuống, Trái, Phải. Ta loại Start, Select, L và R để giới hạn quyết định của nó ở mức cần thiết.

### Cấu trúc dữ liệu

Script định nghĩa ba cấu trúc chính :

```lua
function newNeurone()
    local neurone = {}
    neurone.valeur = 0    -- giá trị hiện tại của nơ-ron
    neurone.id = 0        -- định danh duy nhất
    neurone.type = ""     -- "input", "output", hay "hidden"
    return neurone
end

function newConnexion()
    local connexion = {}
    connexion.entree = 0     -- ID nơ-ron nguồn
    connexion.sortie = 0     -- ID nơ-ron đích
    connexion.actif = true   -- có thể tắt nếu nơ-ron ẩn được chèn
    connexion.poids = 0      -- trọng số kết nối
    connexion.innovation = 0 -- số đổi mới duy nhất
    connexion.allume = false -- để hiển thị : true nếu tín hiệu đi qua
    return connexion
end

function newReseau()
    local reseau = {
        nbNeurone = 0,        -- số nơ-ron ẩn
        fitness = 1,          -- hiệu năng (khoảng cách đi được)
        idEspeceParent = 0,   -- thuộc loài nào
        lesNeurones = {},     -- bảng nơ-ron
        lesConnexions = {}    -- bảng kết nối
    }
    -- Khởi tạo với input
    for j = 1, NB_INPUT, 1 do
        ajouterNeurone(reseau, j, "input", 1)
    end
    -- Rồi tới output
    for j = NB_INPUT + 1, NB_INPUT + NB_OUTPUT, 1 do
        ajouterNeurone(reseau, j, "output", 0)
    end
    return reseau
end
```

Ban đầu, mỗi mạng chỉ chứa input và output : không nơ-ron ẩn, không kết nối. Thuật toán sẽ quyết có cần chúng hay không.

### Đột biến chi tiết

#### Đột biến trọng số

```lua
function mutationPoidsConnexions(unReseau)
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            if math.random() < CHANCE_MUTATION_RESET_CONNEXION then
                -- 25% : reset toàn bộ trọng số
                unReseau.lesConnexions[i].poids = genererPoids()
            else
                -- 75% : thay đổi ±0.80
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

Trọng số ban đầu luôn là 1 hay -1 (`genererPoids()`). Thay đổi ±0.80 có thể khiến nó dao động giữa giá trị âm và dương, thay đổi triệt để hành vi mạng.

#### Thêm kết nối

```lua
function mutationAjouterConnexion(unReseau)
    local liste = {}
    -- Ngẫu nhiên hóa danh sách nơ-ron
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
                -- Kết nối hợp lệ : input→output, hidden→hidden, hidden→output
                if (n1.type == "input" and n2.type == "output") or
                   (n1.type == "hidden" and n2.type == "hidden") or
                   (n1.type == "hidden" and n2.type == "output") then
                    -- Kiểm tra chưa có kết nối
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

Ta không thể nối output tới input (sẽ tạo chu trình), và không thể nối hai nơ-ron đã nối. Ngẫu nhiên hóa đảm bảo ta khám phá các khả năng khác nhau mỗi lần.

#### Thêm nơ-ron

Đây là đột biến thú vị nhất :

```lua
function mutationAjouterNeurone(unReseau)
    if #unReseau.lesConnexions == 0 then return nil end
    if unReseau.nbNeurone == NB_NEURONE_MAX then return nil end

    -- Ngẫu nhiên hóa kết nối
    local listeRandom = {}
    for i = 1, #unReseau.lesConnexions, 1 do
        local pos = math.random(1, #listeRandom+1)
        table.insert(listeRandom, pos, i)
    end

    for i = 1, #listeRandom, 1 do
        if unReseau.lesConnexions[listeRandom[i]].actif then
            -- Tắt kết nối hiện có
            unReseau.lesConnexions[listeRandom[i]].actif = false
            unReseau.nbNeurone = unReseau.nbNeurone + 1
            local indice = unReseau.nbNeurone + NB_INPUT + NB_OUTPUT

            -- Tạo nơ-ron ẩn
            ajouterNeurone(unReseau, indice, "hidden", 1)

            -- Nối đầu vào tới nơ-ron ẩn
            ajouterConnexion(unReseau,
                unReseau.lesConnexions[listeRandom[i]].entree,
                indice, genererPoids())

            -- Nối nơ-ron ẩn tới đầu ra
            ajouterConnexion(unReseau,
                indice,
                unReseau.lesConnexions[listeRandom[i]].sortie,
                genererPoids())
            break
        end
    end
end
```

Cơ chế : lấy kết nối hiện có, **tắt** nó, và chèn nơ-ron ẩn vào giữa. Kết nối gốc được thay bằng hai kết nối mới : vào→ẩn và ẩn→ra. Như thể ta "cắt" dây để chèn công tắc.

Đó là thứ khiến NEAT thành "augmenting topologies" : mạng **lớn dần** theo thời gian. Nó khởi đầu đơn giản và chỉ phức tạp khi cần.

### feedForward

Đây là hàm lan truyền tín hiệu qua mạng :

```lua
function feedForward(unReseau)
    -- Reset nơ-ron đầu ra
    for i = 1, #unReseau.lesConnexions, 1 do
        if unReseau.lesConnexions[i].actif then
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].valeur = 0
            unReseau.lesNeurones[unReseau.lesConnexions[i].sortie].allume = false
        end
    end

    -- Lan truyền
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

Mỗi kết nối đang hoạt động gửi `giá_trị_vào × trọng_số` tới nơ-ron đầu ra. Giá trị được **cộng dồn**. Cờ `allume` chỉ để hiển thị trực quan mạng.

### Đọc bộ nhớ game

Hàm `getLesInputs()` là thứ dịch thế giới Super Mario World thành dữ liệu mạng hiểu được :

```lua
function getLesInputs()
    local lesInputs = {}
    -- Khởi tạo về 0 (xám = không có gì)
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            lesInputs[getIndiceLesInputs(i, j)] = 0
        end
    end

    -- Sprite (kẻ thù) = -1 (đen)
    local lesSprites = getLesSprites()
    for i = 1, #lesSprites, 1 do
        local input = convertirPositionPourInput(getLesSprites()[i])
        if input.x > 0 and input.x < (TAILLE_VUE_W / TAILLE_TILE) + 1 then
            lesInputs[getIndiceLesInputs(input.x, input.y)] = -1
        end
    end

    -- Tile (khối) = giá trị tile (trắng nếu > 0)
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

Lưới input là khung nhìn căn giữa Mario : 11 tile chiều rộng, 9 chiều cao. Mỗi tile bằng :
- **0** (xám) : không có gì
- **1** (trắng) : khối đặc
- **-1** (đen) : kẻ thù

Kẻ thù được đọc từ hai danh sách trong RAM : sprite thường (`0x14C8`-`0x14F8`) và extended sprite (`0x170B`-`0x173B`). Với mỗi sprite sống (trạng thái > 7), ta tính vị trí theo tile tương đối với Mario và đặt -1 vào ô tương ứng.

### Fitness : AI biết mình tiến triển thế nào

```lua
function majReseau(unReseau, marioBase)
    local mario = getPositionMario()

    if not niveauFini and memory.readbyte(0x0100) == 12 then
        -- Qua màn!
        unReseau.fitness = FITNESS_LEVEL_FINI
        niveauFini = true
    elseif marioBase.x < mario.x then
        -- Mario tiến sang phải
        unReseau.fitness = unReseau.fitness + (mario.x - marioBase.x)
        marioBase.x = mario.x
    end

    -- Cập nhật input
    local lesInputs = getLesInputs()
    for i = 1, NB_INPUT, 1 do
        unReseau.lesNeurones[i].valeur = lesInputs[i]
    end
end
```

Fitness đơn giản : là **khoảng cách đi sang phải**. Nếu Mario tiến 10 pixel, fitness tăng 10. Nếu Mario lùi, không gì xảy ra (không phạt). Nếu qua màn (địa chỉ `0x0100` == 12), fitness thành 1 000 000.

Cố ý đơn giản. Chỉ tiến sang phải được tính : giết kẻ thù không cho gì, chết không mất gì.

### Reset thông minh

Nếu Mario không động đậy 33 frame, ta reset màn và chuyển cá thể tiếp theo. Nhưng nếu Mario đã tiến triển (fitness hiện khác lúc bắt đầu), ta chờ 300 frame -- điều này cho mạng cơ hội "hiểu" điều nó làm tốt.

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

Điều kiện `memory.readbyte(0x0071) ~= 9` kiểm tra Mario không trong animation chết. Reset thành vô ích khi Mario đã trong animation chết.

### Vòng lặp chính

Vòng lặp chạy ở 30 fps (tốc độ bình thường của Super Mario World) :

```lua
while true do
    local fitnessAvant = laPopulation[idPopulation].fitness

    -- Hiển thị (mạng, thông tin)
    if forms.ischecked(estAccelere) then
        emu.limitframerate(false)  -- tăng tốc
    else
        emu.limitframerate(true)   -- 30 fps
    end

    -- 3 hàm sống còn
    majReseau(laPopulation[idPopulation], marioBase)
    feedForward(laPopulation[idPopulation])
    appliquerLesBoutons(laPopulation[idPopulation])

    emu.frameadvance()
    nbFrame = nbFrame + 1

    -- Reset nếu không tiến triển
    -- ...
    -- Thế hệ mới nếu mọi cá thể đã thử
    -- ...
end
```

Ba hàm sống còn là `majReseau`, `feedForward`, và `appliquerLesBoutons`. Nếu tắt một trong ba, Mario không động đậy nữa.

### Lai ghép

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

Đứa bé thừa hưởng từ bố mẹ giỏi hơn. Với mỗi kết nối chung đổi mới, bố mẹ kia có 50% cơ hội thay thế -- nhưng **chỉ nếu kết nối đang hoạt động**. Đây là sửa quan trọng : không có nó, nơ-ron ẩn vô ích có thể được tạo.

### Chọn lọc theo loài

```lua
function nouvelleGeneration(laPopulation, lesEspeces)
    local laNouvellePopulation = newPopulation()
    local nbIndividuACreer = NB_INDIVIDU_POPULATION

    -- Tính fitness trung bình cho mỗi loài
    for i = 1, #lesEspeces, 1 do
        lesEspeces[i].fitnessMoyenne = 0
        for j = 1, #lesEspeces[i].lesReseaux, 1 do
            lesEspeces[i].fitnessMoyenne =
                lesEspeces[i].fitnessMoyenne + lesEspeces[i].lesReseaux[j].fitness
        end
        lesEspeces[i].fitnessMoyenne =
            lesEspeces[i].fitnessMoyenne / #lesEspeces[i].lesReseaux
    end

    -- Mỗi loài tạo số con tỷ lệ với fitness trung bình
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

Ý tưởng : loài có fitness trung bình 10 000 được tạo nhiều con hơn hẳn loài có fitness trung bình 1. Đó là **chọn lọc tự nhiên** trong hành động.

`choisirParent` dùng chọn lọc roulette : cá thể càng fit càng có cơ hội được chọn làm bố mẹ.

### Lưu và tải

Quần thể được lưu trong tệp `.pop` :

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

Lưu gồm cả cá thể giỏi nhất của mọi quần thể trước. Nếu cá thể giỏi nhất quần thể cũ giỏi hơn cá thể giỏi nhất quần thể mới, ta lấy lại cái cũ làm nền. Đó là dạng **ưu tú** : không bao giờ mất cái giỏi nhất.

### Vẽ mạng

Laupok thêm trình trực quan hóa mạng nơ-ron phủ lên game :

```lua
function dessinerUnReseau(unReseau)
    -- Input : lưới 11×9 quanh Mario
    for i = 1, NB_TILE_W, 1 do
        for j = 1, NB_TILE_H, 1 do
            local xT = ENCRAGE_X_INPUT + (i - 1) * TAILLE_INPUT
            local yT = ENCRAGE_Y_INPUT + (j - 1) * TAILLE_INPUT
            local couleurFond = "gray"
            if unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur < 0 then
                couleurFond = "black"   -- kẻ thù
            elseif unReseau.lesNeurones[getIndiceLesInputs(i, j)].valeur > 0 then
                couleurFond = "white"   -- khối
            end
            gui.drawRectangle(xT, yT, TAILLE_INPUT, TAILLE_INPUT, "black", couleurFond)
        end
    end

    -- Output : 8 nút
    for i = 1, NB_OUTPUT, 1 do
        local xT = ENCRAGE_X_OUTPUT
        local yT = ENCRAGE_Y_OUTPUT + ESPACE_Y_OUTPUT * (i - 1)
        if sigmoid(unReseau.lesNeurones[i + NB_INPUT].valeur) then
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "white")
        else
            gui.drawRectangle(xT, yT, TAILLE_OUTPUT_W, TAILLE_OUTPUT_H, "white", "black")
        end
    end

    -- Kết nối
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

Cực hữu ích để hiểu mạng đang làm gì. Kết nối đang hoạt động màu trắng, không hoạt động bán trong suốt. Input là lưới ô trắng/đen/xám. Output hiện nút nào đang nhấn.

---

## Kết quả

### AI đã học được gì

Qua hàng giờ (và hàng ngày) chạy, AI tự phát hiện :

1. **Tiến sang phải** : hành vi cơ bản nhất, nhưng đòi giữ nút Phải
2. **Nhảy qua kẻ thù** : bằng cách nối input "phát hiện kẻ thù" tới nút A hay B
3. **Tránh chướng ngại** : vài mạng học lùi tạm để tiến tốt hơn
4. **Qua màn** : cá thể giỏi nhất đã qua được màn đầu tiên của Super Mario World

![Mario do AI điều khiển đối mặt Boo trong màn Super Mario World -- mạng nơ-ron quyết hành động thời gian thực](/images/laupok-mario-ai/mario-ai-playing.jpg)

### Giới hạn

Dự án có giới hạn :

- **Một màn duy nhất** : AI huấn luyện trên một màn cụ thể. Nó không khái quát tự động sang màn khác
- **Thời gian huấn luyện** : cần hàng chục giờ để đạt kết quả ưng ý
- **Không hiểu** : AI không "hiểu" điều nó làm. Nó tối ưu hàm fitness (khoảng cách đi được) qua đột biến ngẫu nhiên
- **T-bagging** : Laupok ghi nhận Mario có xu hướng nhảy tại chỗ khi thấy kẻ thù, đơn giản vì việc đó tăng fitness (nó tiến chút khi nhảy)

---

## Cách tái tạo thí nghiệm

Laupok đã chia sẻ mọi thứ. Các bước :

1. **Tải BizHawk** trên [tasvideos.org](https://tasvideos.org/BizHawk) (mục Download)
2. **Lấy ROM USA Super Mario World** (bản sao riêng từ băng của chính bạn)
3. **Tải script Lua** từ [Pastebin](https://pastebin.com/Jcvdqhqm) -- đổi tên thành `mario.lua`
4. **Đặt script cùng thư mục với ROM**
5. **Chạy BizHawk**, mở ROM
6. **Trong console Lua** : `dofile("mario.lua")` hay qua menu Script > Open Script
7. **Lưu state** ở đầu màn (menu Savestate > Save State) và đặt tên `debut.state`
8. **Chạy lại script** -- chạy được

Script gồm form với tùy chọn :
- **Tăng tốc** : tắt giới hạn 30 fps để đi nhanh hơn
- **Hiện mạng** : hiện mạng nơ-ron phủ lên
- **Hiện thông tin** : hiện dải băng với thế hệ, fitness, số loài
- **Tạm dừng** : dừng thực thi
- **Lưu/Tải** : bền vững quần thể hiện tại vào tệp `.pop`

---

## Nguồn và tham chiếu

| Tài nguyên | Link |
|-----------|------|
| Video chính của Laupok | [j'ai créé une IA qui joue à mario toute seule](https://www.youtube.com/watch?v=F63GNXGHVwM) |
| Video review mã + setup | [comment setup l'ia + code source review](https://www.youtube.com/watch?v=u5xCl1bSe6o) |
| Mã nguồn đầy đủ | [Pastebin Jcvdqhqm](https://pastebin.com/Jcvdqhqm) |
| Bài gốc NEAT | Stanley và Miikkulainen, "Evolving Neural Networks through Augmenting Topologies", 2002 |
| Hướng dẫn của N8Programs | [NEAT implementation walkthrough](https://n8programs.github.io/) (JavaScript, nhưng khái niệm giống hệt) |
| 16blings (cảm hứng của Laupok) | [AI plays Super Mario World](https://www.youtube.com/watch?v=qv6IFaOz3bA) |
| BizHawk | [tasvideos.org/BizHawk](https://tasvideos.org/BizHawk) |
| Bộ nhớ Super Mario World | [SMW Central - RAM Map](https://www.smwcentral.net/?p=section&a=details&id=21702) |

---

## Kết luận

Điều Laupok làm là lấy thuật toán học thuật (NEAT, 2002), viết lại bằng Lua cho trình giả lập (BizHawk), và áp vào Super Mario World. Kết quả : AI học từ con số không để chơi game, không kiến thức trước nào, chỉ bằng đột biến ngẫu nhiên và chọn lọc tự nhiên.

Đó là ví dụ tuyệt đẹp về sức mạnh thuật toán di truyền. Công thức gói trong ba thành phần : chọn lọc tự nhiên, chút Lua, và nhiều kiên nhẫn. Không deep learning, không GPU, không dữ liệu huấn luyện khổng lồ.

Mã được comment, chia sẻ, và Laupok làm hai video giải thích -- một cho khái niệm lớn, một cho mã. Nếu chủ đề khiến bạn hứng thú, hãy lặn vào. Nó dễ tiếp cận hơn vẻ ngoài.
