---
name: Bio-Precision Design System
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#3f484a'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#6f797a'
  outline-variant: '#bfc8c9'
  surface-tint: '#20686f'
  primary: '#004349'
  on-primary: '#ffffff'
  primary-container: '#0d5c63'
  on-primary-container: '#90d2da'
  inverse-primary: '#8fd1d9'
  secondary: '#006b5f'
  on-secondary: '#ffffff'
  secondary-container: '#62fae3'
  on-secondary-container: '#007165'
  tertiary: '#2f3f3f'
  on-tertiary: '#ffffff'
  tertiary-container: '#465656'
  on-tertiary-container: '#b9cbca'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#abeef6'
  primary-fixed-dim: '#8fd1d9'
  on-primary-fixed: '#002023'
  on-primary-fixed-variant: '#004f55'
  secondary-fixed: '#62fae3'
  secondary-fixed-dim: '#3cddc7'
  on-secondary-fixed: '#00201c'
  on-secondary-fixed-variant: '#005047'
  tertiary-fixed: '#d4e6e5'
  tertiary-fixed-dim: '#b8cac9'
  on-tertiary-fixed: '#0e1e1e'
  on-tertiary-fixed-variant: '#3a4a49'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-display:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 48px
  container-max-width: 1200px
---

## CSS 變數合約 (CSS Variable Contract)

本節定義所有樣式的**唯一真實來源**。每個元件都必須引用這些 CSS 自訂屬性，**禁止**在任何 HTML、CSS 或 TypeScript 中直接硬編碼 hex 色碼。Claude 在生成或修改本專案的任何程式碼時，必須嚴格遵守此合約。

### 主控 Brand Token

單一變數控制整體品牌識別。變更 `--brand-primary` 應能影響所有衍生的 token。

```css
:root {
  --brand-primary: #004349;   /* 主控 token — 深藍綠品牌錨點 */
}
```

### 背景層 (`--bg-main`)

App shell 的背景。僅套用於 `<body>` 與全寬容器——不可套用於卡片或元件。

```css
:root {
  --bg-main:       linear-gradient(to bottom, #0d5c63, #004349);
  --bg-main-start: #0d5c63;
  --bg-main-end:   #004349;
}
```

### 表層 (`--surface`)

卡片與元件的填色。所有 `.glass-elevated` 元素必須使用 `--surface-elevated`；禁止直接寫 `rgba(255,255,255,…)`。

```css
:root {
  --surface:               #ffffff;
  --surface-elevated:      rgba(255, 255, 255, 0.70);   /* glass-elevated 填色 */
  --surface-border:        rgba(0, 67, 73, 0.10);       /* 1px 卡片描邊 */
  --surface-shadow:        rgba(0, 67, 73, 0.05);       /* 環境陰影 */
  --surface-container:     #eceef0;
  --surface-container-low: #f2f4f6;
}
```

### 文字 Token 層次（重大缺失補齊）

文字 token 具有**情境依賴性**：在 `--bg-main`（深色）與 `--surface`（淺色）上適用不同的 token 集合。所有文字顏色**必須**使用 `--text-*` token；禁止使用行內 `style="color: #…"`。

```css
:root {
  /* --- 用於 --bg-main 之上（深色漸層 App shell）--- */
  --text-on-bg:       #ffffff;                   /* 標題、主要標籤 */
  --text-on-bg-muted: rgba(255, 255, 255, 0.80); /* 副標題、說明文字 */
  --text-on-bg-faint: rgba(255, 255, 255, 0.50); /* 停用、佔位文字 */

  /* --- 用於 --surface 之上（淺色卡片層）--- */
  --text-on-surface:       #191c1e;  /* 內文、主要數值 */
  --text-on-surface-sub:   #3f484a;  /* 次要標籤 */
  --text-on-surface-muted: #6f797a;  /* 單位、時間戳、說明 */
  --text-accent:           #004349;  /* 品牌藍綠文字（淺色卡片上）*/
  --text-accent-mid:       #0d5c63;  /* 較柔和的強調色（圖表、趨勢線）*/

  /* --- 用於品牌色元素之上（按鈕、Chip、FAB）--- */
  --text-on-brand: #ffffff;
}
```

### 使用規則一覽

| 情境 | 背景 token | 應使用的文字 token |
|---|---|---|
| App shell / 頂部導覽 | `--bg-main` | `--text-on-bg`、`--text-on-bg-muted` |
| 卡片 / 面板 | `--surface` 或 `--surface-elevated` | `--text-on-surface`、`--text-on-surface-sub`、`--text-on-surface-muted`、`--text-accent` |
| 按鈕 / Chip / FAB | `--color-primary` / `--color-secondary` | `--text-on-brand` |
| 圖表線條與數據點 | — | stroke/fill = `--text-accent-mid` |

### 互動色彩 Token

```css
:root {
  --color-primary:             #004349;
  --color-primary-container:   #0d5c63;
  --color-secondary:           #006b5f;
  --color-secondary-container: #62fae3;
  --color-error:               #ba1a1a;
  --color-outline:             #6f797a;
  --color-outline-variant:     #bfc8c9;
}
```

---

## 品牌風格 (Brand & Style)

本設計系統的工程目標是填補臨床精準度與以使用者為中心的易用性之間的落差。整體風格詮釋一種**現代古典主義**——如醫學期刊般可靠、具權威感，又像高效能運動員般靈動且充滿能量。

視覺美學汲取自**極簡主義**，並融入一絲**觸覺質感**：乾淨的版面配置與充足的留白，輔以帶有細膩立體感的元素，營造出「實驗室玻璃」效果。此方法確保複雜的生物數據看起來有條不紊，且不令人感到壓迫。目標受眾包括注重健康的個人以及重視數據可信度、偏好精緻且成熟（非幼稚化）介面的專業人士。

## 色彩 (Colors)

調色盤源自 DNA 標誌中的深藍綠色與青色點綴，刻意遠離高對比的黃色系，轉向更沉穩、專業的色彩光譜。

- **Primary（深藍綠）：** 用於主要操作、導覽列標題及具有權威感的文字。
- **Secondary（青色／土耳其藍）：** 用於趨勢標示、數據進度條及互動狀態。
- **Tertiary（薄荷霧）：** 用於細緻的背景色與柔和的介面分隔線。
- **Surface（臨床白）：** 以乾淨的 `#F8FAFC` 作為卡片底色，確保數據的可讀性。
- **語意色彩：** 針對各生物數據類別指定特定色調，以利使用者快速辨識——綠色代表營養、琥珀色代表活動量、靛藍色代表體重、紅色代表心臟／生命體徵。

## 字體排版 (Typography)

本系統採用 **Manrope** 字型，其幾何形態兼具親和感，在標題與內文中均提供出色的可讀性。

系統特別引入「Data Display」層級，專門用於呈現大尺寸生物特徵數值（如體重或熱量計數），以強調統計數據的重要性。**JetBrains Mono** 則謹慎地用於標籤與時間戳，強化應用程式「日誌」與「科學」的特質，賦予介面現代且技術感十足的視覺風格。

## 版面配置與間距 (Layout & Spacing)

本設計系統採用**流式網格 (Fluid Grid)** 模型，以 8px 為基礎單位（緊湊型元件採用 4px 次單位）。

- **行動裝置：** 單欄版面，左右各留 20px 邊距。卡片寬度為全寬減去邊距。
- **平板：** 6 欄網格，溝槽 (gutter) 為 16px。
- **桌機：** 12 欄網格，容器最大寬度為 1200px。

「類別區塊」之間的間距應寬鬆（32px 以上），以避免視覺雜亂；「數據卡片」內部的間距則應緊湊（8–12px），以確保相關指標聚合在一起。

## 層次感與深度 (Elevation & Depth)

深度感透過**色調層次 (Tonal Layers)** 與**柔和環境陰影 (Soft Ambient Shadows)** 來傳達。

主應用程式背景採用極細緻的由上至下漸層。互動卡片採用「玻璃浮起 (Glass-Elevated)」風格：使用主色較淺色調的 1px 邊框，搭配低透明度的陰影（顏色：Primary，模糊半徑：12px，Alpha：0.05）。這呈現出光線穿透醫療級設備的質感。各表層應呈現「堆疊」感，而非懸浮於空中。

## 形狀 (Shapes)

形狀語言統一採用**圓角（Level 2）**風格。

標準卡片使用 1rem（16px）圓角，以呈現現代感與親和力。按鈕與主要輸入欄位同樣採用 16px 圓角半徑。標籤與 Chip 等較小元素則使用「膠囊形（全圓角）」，以區別其作為次要互動 metadata 的性質。完全避免使用尖銳的 0px 直角，以維持品牌 DNA 啟發下的「生物有機」感。

## 元件 (Components)

- **數據卡片 (Data Cards)：** 應加上 1px 的 `tertiary_color` 描邊。分類標籤使用 `label-mono`，主要指標數值使用 `data-display`。
- **主要按鈕 (Primary Buttons)：** 使用 `primary_color` 實心填色搭配白色文字，採 16px 圓角半徑，懸停時呈現細緻的內發光效果。
- **生物特徵 Chip (Biometric Chips)：** 用於營養／活動量標籤。背景色為對應語意色彩的 10% 透明度，文字則使用 100% 不透明度。
- **進度環 (Progress Rings)：** 使用 `secondary_color` 作為進度軌道，以淺灰/青混色作為背景軌道，並使用圓形筆觸端點 (rounded stroke-caps) 以呈現更柔和的視覺效果。
- **輸入欄位 (Input Fields)：** 使用細緻的背景填色（`neutral_color`）取代厚重的邊框。邊框僅在焦點 (focus) 狀態時出現，並使用 `secondary_color`。
- **導覽列 (Navigation)：** 行動裝置採用簡潔的底部導覽列，搭配單色圖示，以小型 `secondary_color` 圓點或底線標示當前選中的頁面狀態。
