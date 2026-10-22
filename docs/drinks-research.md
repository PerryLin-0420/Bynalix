# 手搖飲營養資料彙整（v1.8.0 規劃用，待檢查）

> 狀態：v1.8.0 已依本文件第三節（扣除未確認者）與第四節實作；數字仍待逐筆對照官網。
>
> 資料取得方式：這次的執行環境無法直接開啟各品牌官網與整理網站（網路政策擋下），
> 以下數字全部來自搜尋結果中的**外送平台菜單標示**（Uber Eats／foodpanda 上的「總糖量／總熱量最高值」，
> 這是依法規要求店家標示的數字）與**營養師整理文章**。每一筆都標了來源類型，
> 進 App 前建議逐筆對照官網或門市標示。

---

## 一、法規背景（決定資料長什麼樣子）

- 自 2021-01-01 起，連鎖飲料店的現調飲料須標示**該杯「總糖量」與「總熱量」**，可用**最高值**標示；
  配料（珍珠、布丁、椰果…）的糖與熱量也要算進去。
- 所以各店公布的通常是：**「某品項 × 某杯型 × 全糖」的一個總熱量、一個總糖量**。
  **沒有**蛋白質／脂肪／碳水，也**沒有**每個甜度各自的數字。
- 「微糖」「無糖」等用語有規範，但**各甜度等於全糖的幾成，法規沒有定義**，各家配方不同。

---

## 二、杯型容量（快捷大小的預設毫升數）

| 品牌 | 中杯 | 大杯 | 備註 | 來源 |
|---|---|---|---|---|
| 50嵐 | 500 | 700 | 外送平台部分品項標 720 ml | Threads 整理、Uber Eats |
| 五桐號 | 500 | 700 | 另有一說官方標 600 ml，**待確認** | Threads 整理 |
| 七盞茶 | 500 | 700 | | Threads 整理 |
| 一沐日 | 熱 600 | 冰 660 | 只有單一杯型 | Threads 整理 |
| 鶴茶樓 | 500 | 660 | | 搜尋整理 |
| 八曜和茶 | — | 660 | 單一杯型 | Threads 整理 |
| 85度C | 小 360 ／ 中 480 | 660 | 咖啡類 | Threads 整理 |
| 其他（CoCo、清心、迷客夏、可不可、麻古、得正、大苑子） | 500？ | 700？ | **未找到明確數字，暫用 500／700** | — |

**建議的快捷鍵預設**：中杯 500、大杯 700、特大杯 1000 ml；品牌有自己的容量時以品牌為準。

---

## 三、飲品清單（大杯、全糖、正常冰；「最高值」）

來源類型：**平台**＝外送平台上的店家標示；**營養師**＝營養師／媒體整理（多半註明取自官網）。

### 50嵐
| 品項 | 容量 | 熱量 kcal | 總糖 g | 來源 | 備註 |
|---|---|---|---|---|---|
| 四季春青茶 | 720 | 183.6 | 43.1 | 平台 | |
| 檸檬綠茶 | 720 | 232.6 | 51.7 | 平台 | 另一來源 217 / 48 |
| 1號 四季春珍波椰 | 700 | 433.8 | 65 | 平台 | 另一來源 467 / 81.2 |
| 珍珠奶茶 | 大 | 668 | 53 | 營養師 | **另一來源 466 kcal，差距大，待確認** |
| 波霸奶茶 | 大 | 678 | 53 | 營養師 | |

### CoCo 都可
| 品項 | 容量 | 熱量 kcal | 總糖 g | 來源 | 備註 |
|---|---|---|---|---|---|
| 百香雙響炮 | 大 | 472 | 82 | 平台 | 含珍珠、椰果 |
| 紅柚雙響炮 | 大 | 427 | 77 | 平台 | |
| 珍珠奶茶 | 大 | 722 | 51 | 平台 | |
| 珍珠鮮奶茶 | 大 | 547 | 57 | 平台 | 糖量含鮮奶乳糖 |

### 清心福全
| 品項 | 容量 | 熱量 kcal | 總糖 g | 來源 | 備註 |
|---|---|---|---|---|---|
| 烏龍綠茶 | 大 | 226 | 51 | 平台／營養師一致 | |
| 梅子綠茶 | 大 | 202 | 46 | 營養師 | |
| 優多綠茶 | 大 | 330 | 72 | 營養師 | 含養樂多 |
| 珍珠奶茶 | 大 | 720 | 50 | 平台 | |
| 蜂蜜奶茶 | 大 | 737 | 72 | 營養師 | 舊版 771 / 75 |

### 迷客夏
| 品項 | 容量 | 熱量 kcal | 總糖 g | 來源 | 備註 |
|---|---|---|---|---|---|
| 娜杯紅茶 | 大 | 128 | 29 | 營養師 | |
| 焙香大麥拿鐵 | 大 | 169 | 25 | 營養師 | 鮮奶 |
| 珍珠大正紅茶拿鐵 | 大 | 407 | 34 | 營養師 | 鮮奶 |
| 珍珠伯爵紅茶拿鐵 | 大 | 426 | 35 | 營養師 | 鮮奶 |
| 珍珠手炒黑糖鮮奶 | 大 | 559 | 55 | 營養師 | 黑糖不一定能調甜度 |

### 可不可熟成紅茶
| 品項 | 容量 | 熱量 kcal | 總糖 g | 來源 | 備註 |
|---|---|---|---|---|---|
| 熟成紅茶 | 大 | 200 | 50 | 營養師 | 中杯 180 / 45 |
| 白玉歐蕾 | 大 | 443 | ? | 營養師 | 另一來源 492，**待確認** |

### 麻古茶坊
| 品項 | 容量 | 熱量 kcal | 總糖 g | 來源 | 備註 |
|---|---|---|---|---|---|
| 金萱雙Q | 大 | 322 | ? | 營養師 | |
| 楊枝甘露 2.0 | 大 | 357 | ? | 營養師 | |
| 波霸奶茶 | 大 | 697 | ? | 營養師 | |
| 芝芝阿華田 | 大 | 753 | ? | 營養師 | 含奶蓋 |
| 番茄梅蜜波波 | 大 | ? | 90 | 營養師 | |

### 得正
| 品項 | 容量 | 熱量 kcal | 總糖 g | 來源 | 備註 |
|---|---|---|---|---|---|
| 紅茶 | 大 | 268 | 57.5 | 營養師 | 中杯 206 / 43.5 |

### 大苑子
| 品項 | 容量 | 熱量 kcal | 總糖 g | 來源 | 備註 |
|---|---|---|---|---|---|
| 水果茶 | 大 | 317 | 70 | 營養師 | 糖量含果糖 |

### 五桐號
| 品項 | 容量 | 熱量 kcal | 總糖 g | 來源 | 備註 |
|---|---|---|---|---|---|
| 經典五桐茶 | ? | 78 | 17.6 | 營養師 | **杯型未註明** |
| 杏仁凍五桐茶 | ? | 194.6 | 36.7 | 營養師 | |
| 五桐奶霜 | ? | 191.7 | 16.1 | 營養師 | |

**沒找到資料**：珍煮丹、一沐日、鶴茶樓、茶湯會、春水堂、龜記、萬波（只有容量或完全沒有）。

---

## 四、配料（加料）

### 4.1 每份估算值（營養師整理，**份量未統一**）

| 配料 | kcal / 份 | 主要成分 | 估算碳水 g | 估算脂肪 g |
|---|---|---|---|---|
| 奶蓋 | 203 | 鮮奶油、奶粉、糖 | 14 | 15 |
| 珍珠／波霸 | 156 | 樹薯粉、糖漿 | 38 | 0 |
| 粉條 | 131 | 澱粉、糖漿 | 32 | 0 |
| 芋圓 | 128 | 芋頭、地瓜粉 | 31 | 0 |
| OREO 脆片 | 116 | 餅乾 | 17 | 5 |
| 布丁 | 110 | 蛋、奶、糖 | 16 | 4 |
| 椰果 | 76 | 椰果、糖漿 | 19 | 0 |
| 蒟蒻 | 71 | 蒟蒻、糖漿 | 18 | 0 |
| 仙草凍 | 57 | 仙草、糖 | 14 | 0 |
| 愛玉 | 45 | 愛玉、糖水 | 11 | 0 |
| 寒天 | 42 | 寒天、糖水 | 10 | 0 |
| 蘆薈 | 31 | 蘆薈、糖水 | 8 | 0 |

- 碳水／脂肪是我依熱量與主要成分**反推的估算**，不是查到的數字。
- 另一位營養師以「一份珍珠 178 g」實測為 261 kcal；CoCo 相關整理則寫珍珠 55、椰果 40 kcal／份。
  **不同店的一份差很多**，所以建議配料數值做成「預設值＋可改」。
- 配料都泡過糖水，**甜度選擇不影響配料的糖**。

### 4.2 加料怎麼進 App（建議）

**問題**：店家公布的「珍珠奶茶 720 kcal」已經把珍珠算進去了。如果使用者再選「加珍珠」，就會重複計算；
如果選「去珍珠」，也沒辦法扣。

**建議做法：飲品＝茶底＋預設配料**

1. 每個飲品存「**茶底**」（不含配料）的全糖數值，以及一組**預設配料**。
   - 例：清心 珍珠奶茶 = 奶茶茶底（720 − 156 = 564 kcal）＋ 預設配料「珍珠 ×1」。
   - 茶底數值＝公布值 − 預設配料的估算值。
2. 選飲品後，下方出現：
   - **毫升數**：快捷鍵 中杯／大杯／特大杯（帶品牌預設毫升數）＋可手動輸入。
   - **甜度**：全糖／少糖／半糖／微糖／一分糖／無糖。
   - **配料**：預設配料先勾好，可取消；可再加其他配料，每種可選 0.5／1／2 份。
3. 計算：
   - 茶底熱量、糖量依毫升數**等比例縮放**（公布值是大杯，換成中杯就 × 500/700）。
   - 甜度**只作用在「可調整的糖」**上；配料不受毫升與甜度影響，按份數加總。

### 4.3 甜度怎麼算

依你的需求「以全糖為主往下算比例」，採**名目比例**：

| 甜度 | 全糖 | 少糖 | 半糖 | 微糖 | 一分糖 | 無糖 |
|---|---|---|---|---|---|---|
| 比例 | 100% | 70% | 50% | 30% | 10% | 0% |

- 少掉的熱量 ＝ 可調整糖量 ×（1 − 比例）× 4 kcal。
- **可調整糖量 ≠ 總糖量**：鮮奶的乳糖、果汁的果糖、養樂多本身的糖都扣不掉。
  - 純茶類：可調整糖 ≈ 總糖。
  - 鮮奶類：可調整糖 ≈ 總糖 − 鮮奶乳糖（約 4.8 g／100 ml 鮮奶）。
  - 水果茶／優多類：需要另外估一個「固定糖」。
  - 黑糖、蜂蜜類：店家常常不能調甜度，標成「不可調」。
- 實際上不少店的「半糖」接近全糖的 70–75%（多篇報導與前店員說法）。如果之後想更貼近現實，
  可以讓每個品牌有自己的甜度對照表；這版先用名目比例。

---

## 五、自訂飲料的「進階飲料」選項

- 新增自訂食物時，分類選「飲料」，會多一個開關「**使用進階飲料設定**」。
- 開啟後要填：
  - 參考杯量（ml）與全糖時的熱量、蛋白質、碳水、脂肪（照店家標示填，標示通常只有熱量和糖）
  - 全糖時的**總糖量**，以及其中**不可調整的糖**（預設 0）
  - 預設配料（可不填）
- 之後選這個項目時，下方的份量區塊就換成「杯型＋甜度＋配料」的進階選單。

資料庫需要的欄位（草案）：`food_database` 加上
`drink_mode`（0＝一般、1＝進階）、`sugar_full_g`、`sugar_fixed_g`、`default_toppings`（JSON），
以及新的 `drink_topping` 表（名稱、kcal、碳水、脂肪、蛋白質、糖）。

---

## 六、需要你決定的事

1. **要收哪些品牌？** 目前有數據的是 50嵐、CoCo、清心、迷客夏、可不可、麻古、得正、大苑子、五桐號。
   要不要等可以連上官網（請把 milksha.com、coco-tea.com、dailydietitian.com.tw 等加進環境允許清單）再補齊、核對？
2. **冰量**要不要算？（少冰／去冰會讓同一杯的茶量變多，店家標示是正常冰）建議先不算。
3. **甜度**先用名目比例（半糖＝50%），可以嗎？
4. **配料**採「茶底＋預設配料」的拆法，可以嗎？
5. **有糖飲料要不要算進飲水？** 目前只有無糖茶、水、氣泡水算。建議：選「無糖」且沒有奶、沒有配料時，才計入飲水。

---

## 參考來源

- 法規：[衛福部公告](https://mohw.gov.tw/cp-16-62996-1.html)、[台灣英文新聞](https://www.taiwannews.com.tw/zh/news/4023689)、[公視新聞](https://news.pts.org.tw/article/542676)
- 50嵐：[nutrition168](https://nutrition168.com/2025/01/08/50lan_bubble_tea/)、[Uber Eats 十全店](https://www.ubereats.com/tw/store/50%E5%B5%90-%E5%8D%81%E5%85%A8%E5%BA%97/kGCFCao2T0avaaYq6seX-g)、[Clarisonic](https://www.clarisonic.com.tw/archives/25634)、[Yahoo 新聞](https://tw.news.yahoo.com/%E9%86%AB%E7%94%9F%E6%80%8E%E9%BA%BC%E8%BE%A6%E7%87%9F%E9%A4%8A%E5%B8%AB%E6%9B%9D%E5%85%89%E7%8F%8D%E5%A5%B6%E7%86%B1%E9%87%8F%E6%8E%92%E8%A1%8C%E6%A6%9C-50-%E5%B5%90%E6%84%8F%E5%A4%96%E4%BD%8E%E5%8D%A1%E6%9C%80%E8%82%A5%E7%9A%84%E4%B8%80%E6%9D%AF%E7%9B%B4%E9%80%BC-1000-%E5%A4%A7%E5%8D%A1-044614830.html)
- CoCo：[Uber Eats 南四店](https://www.ubereats.com/tw/store/coco%E9%83%BD%E5%8F%AF-%E5%8D%97%E5%9B%9B%E5%BA%97/I8hzrNOKQaKNdEZY6KUNCA)、[dailydietitian CoCo](https://dailydietitian.com.tw/coco%E7%86%B1%E9%87%8F%E5%9C%96%E9%91%91/)、[高敏敏 CoCo](https://drremin.pixnet.net/blog/post/51745033)
- 清心福全：[漁人生醫](https://www.fmbiomed.com.tw/zh-TW/blogs/healthy-learning/121047)、[trykabao](https://trykabao.com/boba/b/chingshin/)、[foodpanda](https://www.foodpanda.com.tw/restaurant/y2qm/qing-xin-fu-quan-gao-xiong-gao-ying-da-dian)、[三立](https://health.setn.com/news/943434)
- 迷客夏／可不可：[三立 手搖排行](https://health.setn.com/news/1551210)、[fjb100](https://blog.fjb100.com/article/bubble-tea-calories)、[三立 可不可](https://health.setn.com/news/913772)、[fitopts](https://fitopts.com/milksha/)
- 麻古／得正／大苑子／五桐號：[dailydietitian 麻古](https://dailydietitian.com.tw/%e9%ba%bb%e5%8f%a4%e7%86%b1%e9%87%8f%e5%9c%96%e9%91%91/)、[Threads 麻古](https://www.threads.com/@dailydietitian.tw/post/DPgeAvakez5)、[dailydietitian 得正](https://dailydietitian.com.tw/%e5%be%97%e6%ad%a3%e8%8f%9c%e5%96%ae-%e7%86%b1%e9%87%8f-%e7%b3%96%e9%87%8f-%e5%92%96%e5%95%a1%e5%9b%a0-%e5%83%b9%e7%9b%ae%e8%a1%a8/)、[dailydietitian 大苑子](https://dailydietitian.com.tw/%E5%A4%A7%E8%8B%91%E5%AD%90%E8%8F%9C%E5%96%AE-%E7%86%B1%E9%87%8F-%E7%B3%96%E9%87%8F-%E5%92%96%E5%95%A1%E5%9B%A0-%E5%83%B9%E7%9B%AE%E8%A1%A8/)、[dailydietitian 五桐號](https://dailydietitian.com.tw/%E4%BA%94%E6%A1%90%E8%99%9F%E8%8F%9C%E5%96%AE-%E5%83%B9%E7%9B%AE%E8%A1%A8-%E7%86%B1%E9%87%8F-%E7%B3%96%E9%87%8F-%E5%92%96%E5%95%A1%E5%9B%A0/)
- 杯型容量：[Threads 容量整理](https://www.threads.com/@gozenbo/post/C-uW29nJTGS)、[IKUK](https://www.ikuk.com.tw/blogs/column/2026-summer-bubble-tea-new-drinks-top10-guide)
- 甜度：[ETtoday](https://www.ettoday.net/news/20260605/3178186.htm)、[UpToGo](https://uptogo.com.tw/%E7%BE%8E%E9%A3%9F/%E9%A3%B2%E6%96%99/%E5%8D%8A%E7%B3%96%E8%B7%9F%E5%BE%AE%E7%B3%96%E5%93%AA%E5%80%8B%E6%AF%94%E8%BC%83%E7%94%9C%EF%BC%9F/)、[北教大](https://dsanew.ntue.edu.tw/p/406-1042-47767,r1711.php?Lang=zh-tw)
- 配料：[TVBS 營養好食](https://health.tvbs.com.tw/nutrition/336819)、[自由健康網](https://health.ltn.com.tw/article/breakingnews/3453050)、[天下雜誌](https://www.cw.com.tw/article/5122001)、[良醫健康網](https://health.businessweekly.com.tw/article/ARTL003010006)、[ETtoday 健康](https://health.ettoday.net/news/2286618)


---

## 七、第二批（seed v14，已寫入 App）

第一批之外再補 27 款，並修正一筆命名。原則：**同一來源同時有熱量與總糖量、且數字前後一致**才收；只有熱量或來源互相矛盾的不收。

| 品牌 | 品項 | 熱量 kcal | 總糖 g | 來源 | 備註 |
|---|---|---|---|---|---|
| 50嵐 | 1號 四季春珍波椰 | 433.8 | 65 | 平台 | 預設配料以珍珠＋椰果拆分（三種料各一份會超過標示值，推測組合份量較小） |
| 50嵐 | 紅茶拿鐵 | 354.4 | 55.1 | 平台 | 鮮奶 |
| CoCo | 四季春 | 141 | 33 | 平台 | |
| CoCo | 紅柚雙響炮 | 427 | 77 | 平台 | 含珍珠、椰果 |
| CoCo | 紅柚香檸美式 | 223 | 51 | 圖鑑 | |
| CoCo | 冬韻擂焙珍奶 | 749 | 59 | 平台 | |
| CoCo | 英式鮮奶茶 | 401 | 59 | 平台（南四店） | 另一店 376 / 51，取最高值 |
| 清心福全 | 鮮奶茶 | 375 | 61 | 營養師（引官網） | |
| 清心福全 | 波霸奶茶 | 720 | 50 | 營養師 | 與珍珠奶茶同標示 |
| 迷客夏 | 青檸香茶 | 258 | 59 | 營養師 | |
| 迷客夏 | 柳丁綠茶 | 297 | 66 | 營養師 | |
| 迷客夏 | 冬瓜檸檬 | 364 | 82 | 營養師 | 冬瓜露本身含糖，設 30 g 不可調 |
| 迷客夏 | 芋頭鮮奶 | 463 | 41 | 營養師 | 另一來源 470 / 42 |
| 可不可 | 胭脂紅茶 | 200 | 50 | 營養師 | |
| 可不可 | 雪花冷露 | 247 | 37 | 2022 報導 | |
| 可不可 | 熟成歐蕾 | 311 | 55 | 2022 報導 | |
| 可不可 | 白玉歐蕾 | 443 | 45 | 2022 報導 | 白玉以珍珠估算 |
| 麻古 | 柳橙果粒茶 | 342 | 76 | 營養師（2026） | |
| 麻古 | 楊枝甘露 2.0 | 373 | 66 | 舊版熱量表 | 新版熱量 357，糖量未知，暫用舊版成對數值 |
| 麻古 | 芝芝芒果果粒 | 480 | 70 | 舊版熱量表 | 芝芝以奶蓋估算 |
| 麻古 | 波霸奶茶 | 669 | 51 | 舊版熱量表 | 另一來源 697 |
| 得正 | 春烏龍 | 268 | 57.5 | 菜單整理 | **原「得正 紅茶」即此數字，已更名** |
| 得正 | 輕烏龍 | 268 | 57.5 | 菜單整理 | 與春烏龍同標示 |
| 得正 | 檸檬春烏龍 | 267 | 58 | 菜單整理 | |
| 得正 | 焙烏龍鮮奶 | 409 | 72.6 | 菜單整理 | 單一來源 |
| 得正 | 焙烏龍奶茶 | 575.5 | 62.7 | 菜單整理 | |

新增配料：**茶凍** 40 kcal／份（迷客夏綠茶凍數字）。另有迷客夏標示珍珠一份 163 kcal（約 80 g），與內建 156 相近，維持 156。

**這批沒收的**：50嵐 黃金烏龍（搜尋結果的數字與四季春完全相同，疑似誤植）、50嵐 波霸綠茶（品項名稱不確定是綠茶還是綠奶茶）、50嵐 阿華田（只有舊的中杯半糖）、可不可 春芽綠茶（熱量 180 與糖 50 g 不一致）、麻古 金萱雙Q（扣掉配料後茶底熱量低於糖的熱量）、珍煮丹／萬波 黑糖珍珠鮮奶（只有熱量、沒有糖量）、一沐日、鶴茶樓、茶湯會、龜記（沒有數據）。

### 第二批來源
- 50嵐：[Uber Eats 瑞隆店](https://www.ubereats.com/tw/store/50%E5%B5%90-%E7%91%9E%E9%9A%86%E5%BA%97/eQa_jp6oRT-N1ZwmsctJqg)、[Uber Eats 十全店](https://www.ubereats.com/tw/store/50%E5%B5%90-%E5%8D%81%E5%85%A8%E5%BA%97/kGCFCao2T0avaaYq6seX-g)
- CoCo：[Uber Eats 昌吉](https://www.ubereats.com/tw/store/coco%E9%83%BD%E5%8F%AF-%E6%98%8C%E5%90%89/NC9kjlkXVLaqxmTf7N1uVA)、[Uber Eats 南四店](https://www.ubereats.com/tw/store/coco%E9%83%BD%E5%8F%AF-%E5%8D%97%E5%9B%9B%E5%BA%97/I8hzrNOKQaKNdEZY6KUNCA)、[Uber Eats 寶橋店](https://www.ubereats.com/tw-en/store/coco%E9%83%BD%E5%8F%AF-%E6%96%B0%E5%BA%97%E5%AF%B6%E6%A9%8B%E5%BA%97/bKIqmACGWVubdnBtSQW_3g)、[dailydietitian CoCo](https://dailydietitian.com.tw/coco%E7%86%B1%E9%87%8F%E5%9C%96%E9%91%91/)
- 清心福全：[漁人生醫](https://www.fmbiomed.com.tw/zh-TW/blogs/healthy-learning/121047)、[trykabao](https://trykabao.com/boba/b/chingshin/)
- 迷客夏：[fitopts](https://fitopts.com/milksha/)、[Threads 營養整理](https://www.threads.com/@gary_nutri365/post/DUxldacjx6H)、[foodpanda 北醫店](https://www.foodpanda.com.tw/restaurant/ue2y/mi-ke-xia-milksha-tai-bei-bei-yi-dian)
- 可不可：[官方點餐頁](https://order.ocard.co/kebuke/KoA1RQ)、[三立](https://health.setn.com/news/913772)、[nutrition168](https://nutrition168.com/2025/04/11/kebuke_bubble-_tea/)
- 麻古：[麻古熱量表](https://fitdietinformation.weebly.com/magu.html)、[漁人生醫 麻古](https://www.fmbiomed.com.tw/zh-TW/blogs/healthy-learning/114641)、[dailydietitian 麻古](https://dailydietitian.com.tw/%E9%BA%BB%E5%8F%A4%E7%86%B1%E9%87%8F%E5%9C%96%E9%91%91/)
- 得正：[食尚玩家](https://supertaste.tvbs.com.tw/pack/350077)、[Yahoo 得正熱量圖鑑](https://tw.news.yahoo.com/%E5%BF%85%E5%96%9D%E7%83%8F%E9%BE%8D%E8%8C%B6-%E5%BE%97%E6%AD%A3-%E6%89%8B%E6%90%96%E9%A3%B2%E7%86%B1%E9%87%8F%E5%9C%96%E9%91%91-%E8%A6%BD%E8%A1%A8-074931569.html)、[foodpanda 十全計劃](https://www.foodpanda.com.tw/restaurant/oqzd/de-zheng-oolong-tea-project-gao-xiong-shi-quan-ji-hua)
- 黑糖珍珠鮮奶（未收）：[韓奕](https://www.hanyitea.tw/single-post/calories/)、[三立](https://health.setn.com/news/1023001)


---

## 八、官網核對（seed v15）

執行環境仍無法直接開啟官網，但搜尋引擎有收錄部分品牌的**官方頁面**，以下改用這些頁面的標示。

### 清心福全（官網產品頁 chingshin.tw/product/…）

**重要**：清心官網註明「本產品之最高糖分設定為『少糖』，若點『全糖』，門市調製時將視同『少糖』」，
冬瓜檸檬最高為「半糖」，蜜香奶茶最高為「少蜜」。**官網標示值是在最高甜度下**。
App 的甜度一律以全糖為 100% 按比例計算，所以清心的數值**直接換算成全糖**再寫進內建資料：
全糖糖量 ＝ 不可調的糖 ＋ 配料的糖 ＋（標示的可調糖 ÷ 0.7）；冬瓜檸檬 ÷ 0.5；每多 1 g 糖加 4 kcal。
換算後在 App 選「少糖」（冬瓜檸檬選「半糖」）會剛好回到官網標示值。下表是官網原始標示，換算後的全糖值見程式內的資料。

| 品項 | 大杯糖 g | 大杯熱量 | 中杯糖 g | 中杯熱量 | 最高甜度 | 備註 |
|---|---|---|---|---|---|---|
| 烏龍綠茶 | 51 | 226 | 34 | 149 | 少糖 | 與第一批一致 |
| 極品菁茶 | 51 | 226 | 34 | 149 | 少糖 | 新增 |
| 錫蘭紅茶 | 48 | 211 | 32 | 139 | 少糖 | 新增 |
| 特選普洱 | 46 | 202 | 30 | 133 | 少糖 | 新增 |
| 梅子綠茶 | 46 | 202 | 30 | 133 | 少糖 | 一致 |
| 檸檬紅茶 | 49 | 208 | 32 | 137 | 少糖 | 新增 |
| 冬瓜檸檬 | 61 | 261 | — | — | 半糖 | 新增，無中杯 |
| 優多綠茶／多多綠茶 | 72 | 330 | — | — | 少糖 | 一致，無中杯 |
| 鮮奶茶（紅茶拿鐵） | 61 | 375 | 40 | 247 | 少糖 | 一致 |
| 珍珠鮮奶茶（珍珠紅茶拿鐵） | 58 | 636 | 34 | 401 | 少糖 | 新增 |
| 珍珠蜜香鮮奶普洱 | 70 | 541 | 46 | 356 | 少蜜 | 新增 |
| 咖啡奶茶 | 47 | 364 | 31 | 240 | 少糖 | 新增 |
| 特級奶綠 | 54 | 620 | — | — | 少糖 | 新增 |
| 珍珠奶茶／波霸奶茶 | 50 | 720 | 33 | 475 | 少糖 | 一致 |
| 粉圓奶茶 | 59 | 674 | — | — | 少糖 | 新增 |
| 布丁奶茶 | 70 | 613 | 34 | 355 | 少糖 | 新增；官網另有一版舊表 534 kcal（650 ml），採新版 |
| 蜜香奶茶 | 72 | 737 | 48 | 486 | 少蜜 | **原「蜂蜜奶茶」改為官方名稱** |
| 芝麻奶茶 | 58 | 737 | — | — | 少糖 | 新增 |
| 冰淇淋奶茶 | 71 | 750 | — | — | 少糖 | 新增 |

中杯值目前沒有寫進 App（App 以大杯為基準、依毫升縮放）。以烏龍綠茶為例，按 500 ml 縮放是 161 kcal，官網中杯 149 kcal，差約 8%，
推測清心中杯實際容量小於 500 ml。之後若做品牌杯量，可改用官網中杯值。

### 可不可熟成紅茶（官方線上點餐 order.ocard.co/kebuke）

| 品項 | 大杯糖 g | 大杯熱量 | 中杯糖 g | 中杯熱量 | 備註 |
|---|---|---|---|---|---|
| 熟成紅茶 | 50 | 200 | 45 | 180 | 一致 |
| 麗春紅茶 | 65 | 270 | 51 | 211 | 新增 |
| 春芽綠茶 | 45 | 180 | — | — | 新增（點餐頁描述「春滿四溢的青翠綠茶」） |
| 熟成檸果 | 59 | 257 | 49 | 211 | 新增 |
| 雪花冷露 | 55 | 233 | — | — | **由 247／37（2022 報導）改為官方值** |
| 熟成歐蕾 | 55 | 311 | — | — | 一致 |
| 白玉歐蕾 | 50 | 492 | — | — | **由 443／45（2022 報導）改為官方值**（點餐頁條目為白玉鮮奶茶） |
| 胭脂紅茶 | 50 | 200 | 45 | 180 | 官方頁未找到，維持營養師數字 |

### 找得到官方頁面、但內容沒有被收錄的品牌
- **迷客夏**：官網有「飲料標示」公告（2025-03-21）與 PDF（milksha.com/upload/price/2311280909390000002.pdf），搜尋只看得到標題。
- **麻古茶坊**：官網 drink.php 各區有「熱量表」下載，搜尋看不到內容。
- **茶湯會**：官網有「茶品糖量表」，但只有糖量、沒有熱量，無法直接換算整杯熱量（奶類、配料熱量未知）。
- **大苑子**：官網只有「每份 43 大卡」，沒有杯型與糖量。
- **50嵐、CoCo、得正**：沒有找到含營養標示的官方頁面，維持外送平台／營養師數字。

這些需要能直接開啟官網（或你手動下載 PDF／熱量表放進 repo）才能核對。

### 官網來源
- 清心福全：[烏龍綠茶](https://www.chingshin.tw/product/oolong-green-tea)、[錫蘭紅茶](https://www.chingshin.tw/product/ceylon-black-tea)、[特選普洱](https://www.chingshin.tw/product/finest-puer-tea)、[梅子綠茶](https://www.chingshin.tw/product/plum-green-tea)、[檸檬紅茶](https://www.chingshin.tw/product/lemon-black-tea)、[冬瓜檸檬](https://www.chingshin.tw/product/lemon-winter-melon-tea)、[優多綠茶](https://www.chingshin.tw/product/yogurt-green-tea)、[鮮奶茶](https://www.chingshin.tw/product/fresh-milk-tea)、[珍珠鮮奶茶](https://www.chingshin.tw/product/pearl-tea-with-fresh-milk)、[珍珠蜜香鮮奶普洱](https://www.chingshin.tw/product/pearl-puer-tea-with-fresh-milk-and-honey)、[咖啡奶茶](https://www.chingshin.tw/product/milk-coffee)、[特級奶綠](https://www.chingshin.tw/product/finest-green-milk-tea)、[珍珠奶茶](https://www.chingshin.tw/product/pearl-milk-tea)、[粉圓奶茶](https://www.chingshin.tw/product/mini-pearl-milk-tea)、[布丁奶茶](https://www.chingshin.tw/product/pudding-milk-tea)、[蜜香奶茶](https://www.chingshin.tw/product/honey-milk-tea)、[芝麻奶茶](https://www.chingshin.tw/product/sesame-milk-tea)、[冰淇淋奶茶](https://www.chingshin.tw/product/ice-cream-milk-tea)、[極品菁茶](https://chingshin.tw/product_detail2.php?Key=8)
- 可不可：[台北通化](https://order.ocard.co/kebuke/KoA1RQ)、[板橋陽明](https://order.ocard.co/kebuke/KrYB3m)、[科技大樓](https://order.ocard.co/kebuke/m3JMJQ)、[新竹食品](https://order.ocard.co/kebuke/mEPGLQ)
- 迷客夏：[飲料標示公告](https://www.milksha.com/news_detail.php?Key=269&cID=4)、[現場調製飲料標示 PDF](https://www.milksha.com/upload/price/2311280909390000002.pdf)
- 麻古：[飲料喝喝（含熱量表下載）](https://www.macutea.com.tw/drink.php)
- 茶湯會：[茶品糖量產地標示](https://tp-tea.com/sugar/index.php?index_id=41)
- 大苑子：[鮮榨產品頁](https://www.dayungs.com/home/product/fresh/?lang=en)


---

## 九、外送平台標示（seed v16）

外送平台（Uber Eats、foodpanda）上的菜單依法也要標示總糖量與總熱量，這批改從這裡補。收錄原則：
**兩家以上分店數字一致**，或單一來源的熱量與糖量成對、且熱量不低於糖量 × 4。

### 清心福全：改存全糖值
上一節清心的官網值是少糖（冬瓜檸檬為半糖）的標示，現在直接換算成全糖存進內建資料，App 不再需要額外的「最高甜度」設定。
例：烏龍綠茶 226 kcal／51 g（少糖）→ 全糖 313.4 kcal／72.9 g；珍珠奶茶 720／50 → 780／65（珍珠的 15 g 糖不換算）。

### 新增品項（大杯、全糖或店家最高甜度）

| 品牌 | 品項 | 杯量 ml | 熱量 kcal | 總糖 g | 備註 |
|---|---|---|---|---|---|
| 50嵐 | 黃金烏龍 | 700 | 171.4 | 40.2 | 樂業店；通化店 170／40 |
| 50嵐 | 微檸檬青茶 | 700 | 191.3 | 43.1 | 藍昌店 |
| 50嵐 | 金桔檸檬 | 700 | 244.3 | 51.7 | 藍昌店 |
| 50嵐 | 檸檬梅汁 | 700 | 326.2 | 74.2 | 藍昌店 |
| 50嵐 | 波霸紅茶 | 700 | 472.5 | 52.2 | |
| 50嵐 | 波霸紅茶拿鐵 | 700 | 644.8 | 65.6 | |
| 50嵐 | 阿華田拿鐵 | 700 | 524.2 | 64.1 | 平鎮南豐店；阿華田粉的糖設為不可調 |
| 50嵐 | 冰淇淋奶茶 | 700 | 708.6 | 72.9 | |
| 50嵐 | 冰淇淋阿華田 | 700 | 762 | 79.3 | |
| CoCo | 手採紅茶 | 700 | 141 | 33 | 彰化伸港 |
| CoCo | 蜜香凍綠茶／紅茶 | 700 | 320 | 74 | 預設配料：茶凍 |
| CoCo | 葡萄柚果粒茶 | 700 | 341 | 80 | |
| CoCo | 奶茶三兄弟 | 700 | 622 | 61 | 預設配料：珍珠、布丁、仙草凍 |
| 迷客夏 | 大正紅茶拿鐵 | 700 | 261 | 45 | 臺南大同、南崁忠孝西兩店一致（北醫店 211／34） |
| 迷客夏 | 娜杯紅茶拿鐵 | 700 | 276 | 49 | 臺南大同店 |
| 麻古 | 芝芝金萱 | 700 | 335 | 37 | 同頁有一分糖 261／20 → 解出不可調糖 6.1 g（扣奶蓋後） |
| 麻古 | 柳橙芒果果粒茶 | 700 | 330 | 74 | 一分糖 256／57 → 不可調 55.1 g（果粒） |
| 麻古 | 楊枝甘露 2.0 | 700 | 389 | 74 | 改為「甜感提升」最高值；甜感減低 353／66 |
| 麻古 | 芝芝芒果果粒 | 700 | 516 | 77 | 改為「甜感提升」最高值；甜感減低 479／69 |
| 得正 | 焙烏龍 | 700 | 268 | 57.5 | |
| 得正 | 芝士奶蓋春烏龍 | 700 | 435 | 49 | 全糖少冰 |
| 大苑子 | 翡翠檸檬 | 700 | 329 | 68 | |
| 大苑子 | 愛文芒果冰沙 | 700 | 393 | 81 | |
| 茶湯會 | 翡翠檸檬 | 650 | 334 | 73 | 大杯 22 oz |
| 茶湯會 | 觀音拿鐵 | 650 | 297 | 49 | |
| 茶湯會 | 鐵觀音奶茶 | 650 | 581 | 47 | |
| 茶湯會 | 鐵觀音珍珠奶茶 | 650 | 717 | 42 | 多平台一致 |
| 五桐號 | 經典五桐茶 | 660 | 74.7 | 16.7 | 多店一致 |
| 五桐號 | 杏仁凍五桐茶 | 660 | 192 | 36 | 崛江店（樹林店 700 ml：293／51） |
| 五桐號 | 烏龍奶霜 | 660 | 303.2 | 41.9 | 奶霜比內建「奶蓋」輕，扣掉會讓茶底糖多於熱量，所以奶霜保留在飲品本身，不拆成配料 |
| 五桐號 | 蕎麥奶霜 | 660 | 320.3 | 46 | 同上 |
| 一沐日 | 粉粿牡丹紅柚 | 660 | 288 | 63 | 一沐日只有 660 ml 一種杯量 |
| 一沐日 | 糯香檸檬茶 | 660 | 385 | 87 | |
| 一沐日 | 粉粿桂花檸檬 | 660 | 359 | 76 | 甜度固定 → 全部設為不可調 |
| 一沐日 | 奶蓋島韻紅 | 660 | 426 | 38 | |
| 一沐日 | 蕎麥鮮奶茶 | 660 | 304 | 50 | |
| 一沐日 | 逮丸奶茶 | 660 | 630 | 77 | 草仔粿不在配料表，未拆 |
| 龜記 | 翡翠綠茶 | 660 | 212 | 45 | |
| 龜記 | 紅柚翡翠 | 660 | 285 | 63 | |
| 龜記 | 阿源楊桃綠茶 | 660 | 250 | 60 | |
| 龜記 | 楊桃雷夢 | 660 | 299 | 68 | |
| 萬波 | 島嶼紅茶 | 700 | 246 | 59 | 衡陽、美村南兩店一致 |
| 萬波 | 島嶼檸檬茶王 | 700 | 479 | 95 | |
| 珍煮丹 | 黑糖鮮奶 | 700 | 364 | 42 | 黑糖不可調；大杯 ml 未標示，暫用 700 |
| 珍煮丹 | 黑糖珍珠鮮奶 | 700 | 619 | 70 | 同上；中杯 489／56 |
| 鶴茶樓 | 鶴頂紅茶 | 660 | 174 | 41 | 只有內湖店一家的資料 |
| 鶴茶樓 | 鶴頂那堤 | 660 | 290 | 49 | 同上 |

**這批沒收的**：茶湯會珍珠奶茶（兩個平台 793 與 204 kcal，差太多）、迷客夏珍寶鮮奶（扣掉珍珠後鮮奶的乳糖不夠，數字不合）、
CoCo 芋頭西谷米牛乳（中杯和大杯同一組數字）、CoCo 西谷米奶茶與 50嵐 冰淇淋麵茶紅茶（配料表沒有西谷米、麵茶）、
大苑子 春熙柳丁翡翠（杯型不明）、萬波黑糖珍珠鮮奶（只有中杯）。

### 平台來源
- 50嵐：[foodpanda 藍昌店](https://www.foodpanda.com.tw/restaurant/cpop/50lan-lan-chang-dian)、[foodpanda 通化店](https://www.foodpanda.com.tw/restaurant/e4wh/50lan-tong-hua-dian)、[foodpanda 平鎮南豐店](https://www.foodpanda.com.tw/restaurant/wmb4/50lan-ping-zhen-nan-feng-dian)、[Uber Eats 樂業店](https://www.ubereats.com/tw/store/50%E5%B5%90-%E6%A8%82%E6%A5%AD%E5%BA%97/eLpuvY2OTSyeZsIyy1rloA)、[foodpanda 建工店](https://www.foodpanda.com.tw/restaurant/cwsp/50lan-jian-gong-dian)
- CoCo：[內湖店](https://www.ubereats.com/tw/store/coco%E9%83%BD%E5%8F%AF-%E5%85%A7%E6%B9%96%E5%BA%97/YIrVQkuZThCgCzuh-DZusQ)、[永康自強](https://www.ubereats.com/tw/store/coco%E9%83%BD%E5%8F%AF-%E6%B0%B8%E5%BA%B7%E8%87%AA%E5%BC%B7/ld-tE-5uVRegVk4RDcF8PA)、[新豐尚仁](https://www.ubereats.com/tw/store/coco%E9%83%BD%E5%8F%AF-%E6%96%B0%E8%B1%90%E5%B0%9A%E4%BB%81/W2P0TkJIXwas3K9ceWLsFA)、[彰化伸港](https://www.ubereats.com/tw-en/store/coco%E9%83%BD%E5%8F%AF-%E5%BD%B0%E5%8C%96%E4%BC%B8%E6%B8%AF/yxI5uh0WWO-01P-UTMvxPA)
- 迷客夏：[臺南大同店](https://www.ubereats.com/tw/store/%E8%BF%B7%E5%AE%A2%E5%A4%8F-milksha-%E8%87%BA%E5%8D%97%E5%A4%A7%E5%90%8C%E5%BA%97/mzFbyLvAVU2TCS8t5lmzrg)、[南崁忠孝西店](https://www.foodpanda.com.tw/restaurant/cqda/mi-ke-xia-milksha-nan-kan-zhong-xiao-xi-dian)、[北醫店](https://www.foodpanda.com.tw/restaurant/ue2y/mi-ke-xia-milksha-tai-bei-bei-yi-dian)
- 麻古：[中山南店](https://www.foodpanda.com.tw/restaurant/wddp/ma-gu-cha-fang-zhong-shan-nan-dian)、[宜蘭中山店](https://www.foodpanda.com.tw/restaurant/hnmt/ma-gu-cha-fang-yi-lan-zhong-shan-dian)、[彰化二林店](https://www.foodpanda.com.tw/restaurant/n8mw/ma-gu-cha-fang-zhang-hua-er-lin-dian)、[屏東廣東店](https://www.foodpanda.com.tw/restaurant/zfsk/ma-gu-cha-fang-ping-dong-guang-dong-dian)
- 得正：[科技大樓計劃](https://www.foodpanda.com.tw/restaurant/ufyy/de-zheng-oolong-tea-project-ke-ji-da-lou-ji-hua)、[高雄十全計劃](https://www.foodpanda.com.tw/restaurant/oqzd/de-zheng-oolong-tea-project-gao-xiong-shi-quan-ji-hua)
- 大苑子：[大村店](https://www.ubereats.com/tw/store/%E5%A4%A7%E8%8B%91%E5%AD%90-%E5%A4%A7%E6%9D%91%E5%BA%97/G_P8XkdxWdC-LFx0sf-npw)、[龍井中央店](https://www.foodpanda.com.tw/restaurant/m7ol/da-yuan-zi-long-jing-zhong-yang-dian)
- 茶湯會：[花蓮民國店](https://www.foodpanda.com.tw/restaurant/b4ye/cha-tang-hui-hua-lian-min-guo-dian)、[台中西屯店](https://www.foodpanda.com.tw/en/restaurant/q8ly/cha-tang-hui-tai-zhong-xi-tun-dian)、[Uber Eats 富國店](https://www.ubereats.com/tw-en/store/%E8%8C%B6%E6%B9%AF%E6%9C%83tp-tea-%E5%AF%8C%E5%9C%8B%E5%BA%97/Q3eg1NVPT5OHeARzfNbWRg)
- 五桐號：[中壢SOGO店](https://www.foodpanda.com.tw/restaurant/ptb9/wu-tong-hao-wootea-zhong-li-sogodian)、[高雄崛江店](https://www.ubereats.com/tw/store/%E4%BA%94%E6%A1%90%E8%99%9Fwootea-%E9%AB%98%E9%9B%84%E5%B4%9B%E6%B1%9F%E5%BA%97/HpunMmI4XlyQ5OGzHEVmLA)、[樹林站前店](https://www.ubereats.com/tw/store/%E4%BA%94%E6%A1%90%E8%99%9Fwootea-%E6%A8%B9%E6%9E%97%E7%AB%99%E5%89%8D%E5%BA%97/czL7pmrRWTaPQIpXf5mTqA)
- 一沐日：[台北安居店](https://www.ubereats.com/tw/store/%E4%B8%80%E6%B2%90%E6%97%A5-%E5%8F%B0%E5%8C%97%E5%AE%89%E5%B1%85%E5%BA%97/Zmmme00JXdGIuANaB_Kwmw)、[台北永康店](https://www.ubereats.com/tw/store/%E4%B8%80%E6%B2%90%E6%97%A5-%E5%8F%B0%E5%8C%97%E6%B0%B8%E5%BA%B7%E5%BA%97/GqttOvfFXOeDl2oGHSyivQ)
- 龜記：[天母芝山店](https://ubereats.com/tw/taipei/food-delivery/%E9%BE%9C%E8%A8%98%E8%8C%97%E5%93%81-%E5%A4%A9%E6%AF%8D%E8%8A%9D%E5%B1%B1%E5%BA%97/_MA9jjvUSeePhEr2LZ9_Jg)、[新竹清大店](https://www.ubereats.com/tw/store/%E9%BE%9C%E8%A8%98%E8%8C%97%E5%93%81-%E6%96%B0%E7%AB%B9%E6%B8%85%E5%A4%A7%E5%BA%97/tHyNmazQVH-BqkqU7ZObiA)
- 萬波：[台北衡陽店](https://www.foodpanda.com.tw/restaurant/ri3h/wan-bo-dao-yu-hong-cha-tai-bei-heng-yang-dian)、[台中美村南店](https://www.foodpanda.com.tw/restaurant/ehm1/wan-bo-dao-yu-hong-cha-tai-zhong-mei-cun-nan-dian)
- 珍煮丹：[台中昌平店](https://www.foodpanda.com.tw/restaurant/fz45/zhen-zhu-dan-tai-zhong-chang-ping-dian)、[中和連城店](https://www.ubereats.com/tw/store/%E7%8F%8D%E7%85%AE%E4%B8%B9-%E4%B8%AD%E5%92%8C%E9%80%A3%E5%9F%8E%E5%BA%97/C0hycwcPVgmfFPN5GhSfww)
- 鶴茶樓：[台北內湖店](https://www.foodpanda.com.tw/restaurant/bsc7/he-cha-lou-tai-bei-nei-hu-dian)
