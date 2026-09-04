# Orbit AI

**🚀 [開啟 Orbit AI](https://jaypengx-collab.github.io/Orbit/)**

Orbit AI 是一個跑在瀏覽器裡的課表儀表板。它不只是把課表「顯示」出來，而是持續計算「現在」這個時間點對應到哪一堂課、還剩幾分鐘、下一堂在哪裡上——打開頁面就是答案，不用自己對照時間表換算。整個專案是純前端、單機運作的靜態網站：沒有帳號系統、沒有後端資料庫、**沒有建置流程**，課表資料就存在使用者自己瀏覽器的儲存空間裡，唯一會對外連線的情境，是使用者主動選擇用 AI 從課表照片辨識課程資料時。

這份 README 有三層讀者：想直接用的人（跳到〈快速開始〉）、想知道每個功能怎麼操作的人（〈使用指南〉），以及要改程式碼的人類或 AI（〈專案守則〉之後的所有章節，包含逐一列出**每一個函式**和**每一條 CSS 選擇器**對應到畫面上哪個位置的完整索引）。

---

## 目錄

- [快速開始](#快速開始)
- [使用指南](#使用指南)
  - [主畫面：現在與下一堂](#主畫面現在與下一堂)
  - [編輯課表](#編輯課表)
  - [單雙週是怎麼判斷的](#單雙週是怎麼判斷的)
  - [外觀系統](#外觀系統)
  - [事件倒數](#事件倒數)
  - [時間模擬](#時間模擬)
  - [AI 辨識課表照片](#ai-辨識課表照片)
  - [備份、匯出與跨裝置轉移](#備份匯出與跨裝置轉移)
- [資料存在哪裡、存了什麼](#資料存在哪裡存了什麼)
- [專案守則：給人類與 AI 的維護原則](#專案守則給人類與-ai-的維護原則)
- [程式怎麼組織的](#程式怎麼組織的)
- [畫面每秒都在算什麼（tick loop）](#畫面每秒都在算什麼tick-loop)
- [技術索引：每一個函式 ↔ 每一段 UI／CSS](#技術索引每一個函式--每一段-uicss)
  - [A. CSS 自訂屬性與主題機制](#a-css-自訂屬性與主題機制)
  - [B. UI 區塊 ↔ CSS 選擇器完整對照表](#b-ui-區塊--css-選擇器完整對照表)
  - [C. 函式完整索引（依 js/app.js 區塊）](#c-函式完整索引依-jsappjs-區塊)
  - [D. localStorage 鍵值](#d-localstorage-鍵值)
  - [E. 響應式斷點總覽](#e-響應式斷點總覽)
- [響應式與無障礙細節](#響應式與無障礙細節)
- [隱私](#隱私)
- [限制](#限制)
- [目前狀態](#目前狀態)

---

## 快速開始

**線上使用**：直接開 [jaypengx-collab.github.io/Orbit](https://jaypengx-collab.github.io/Orbit/)，什麼都不用裝。這個網址由 GitHub Pages 提供，`main` 分支一有更新，`.github/workflows/static.yml` 就會自動重新部署整個 repository。

**本機執行**：Orbit AI 沒有任何建置流程——沒有 `npm install`，沒有打包步驟，`index.html`、`css/styles.css`、`js/app.js` 這三個檔案本身就是完整的應用程式。

```bash
git clone https://github.com/jaypengx-collab/Orbit.git
cd Orbit
python -m http.server 8843
```

再開瀏覽器連到 `http://localhost:8843/`。用本機伺服器而不是直接雙擊 `index.html`，是因為部分瀏覽器對 `file://` 協定下的 `localStorage` 與資源載入行為比較保守，用伺服器開比較不會踩雷。不管哪種方式，`css/` 和 `js/` 資料夾都必須跟 `index.html` 放在同一層，畫面才會有樣式、程式才會執行。

---

## 使用指南

### 主畫面：現在與下一堂

打開 Orbit AI，最上面永遠是「現在」：目前課程名稱、授課教師、教室、這堂課還剩多少時間（進度條 + 倒數數字），下方接著是下一堂課的預告，再往下是整天的課表清單，點任何一節都能叫出詳細資訊卡。這堂課下課、換下一堂、甚至今天所有課都上完該切到下一個上課日，全部是畫面自己在背景每秒重新計算後換上去的，不需要重新整理，也不需要手動點「下一堂」。

如果現在是午休、打掃時間之類「非上課」的區段，主畫面會換成顯示那個時段的名稱與倒數，而不是硬套一個假的課程資訊。右上角有工具選單（＋按鈕），裡面是編輯課表、時間模擬、樣式工具三個入口。

### 編輯課表

點右上角工具選單裡的編輯課表圖示，會展開一個可折疊的設定面板，裡面分別可以：

- 建一份「教師 / 課程」清單，每筆記錄課程名稱、教師、教室三個欄位，之後排課時是從這份清單裡選課，而不是每節課重新打一次名字
- 把清單裡的課排進星期一到星期日的每一節（排課用的是一個獨立的抽屜式介面，一次選一天，逐節指定）
- 設定每節課的鐘聲時間（第幾節幾點開始、幾點結束），系統會擋掉時間格式錯誤或跟其他節重疊的輸入
- 加入午休、打掃這類特殊時段
- 加入倒數事件

編輯器會記住你上一次儲存的狀態，只要目前表單內容跟那個狀態不一樣，就視為「有未儲存的變更」；這時候如果你想關閉編輯器、或是要做匯出/匯入，都會先跳出確認，避免手滑蓋掉還沒存的修改。

### 單雙週是怎麼判斷的

如果學校課表有單週、雙週兩種排法，Orbit AI 不需要你手動切換——它用當下日期算出 ISO 週數（每年第幾週），週數是偶數還奇數就對應到雙週或單週（可以用「單雙週對調」開關反過來，配合學校實際的起算方式）。排課時，同一節如果單雙週上不同課，可以用 `國文/公民` 這種斜線寫法一次填兩科，系統會自動依照當下算出的單雙週去挑對應那一半來顯示。

### 外觀系統

外觀設定跟課表資料是分開存的，改配色不會動到課表內容，反之亦然。可以選預設配色、或自己調主色（次要色會依主色自動推算出可讀的搭配組合，不用每個顏色都自己挑）。調色時有「預覽」跟「確定套用」兩個階段，預覽時畫面會即時變化，但要按下確定才會真的存檔；另外還有幾個自訂樣式儲存槽，可以把喜歡的配色存起來，之後一鍵切換。

### 事件倒數

倒數事件是獨立於課表之外的清單，每筆記錄名稱和日期（可以是單一天，也可以是一段日期區間，例如連續三天的考試週），畫面上會顯示最近即將到來的事件與剩餘天數，可以左右滑動切換多個事件。

### 時間模擬

因為主畫面永遠是照「現在」在算，要測試「第三節下課前一分鐘會長怎樣」這種情境，總不能真的等到那個時間。時間模擬面板讓你直接指定任意星期、任意時間，整個畫面（包含進度條、倒數、下一堂預告、特殊時段判斷）就會照那個假設的時間重新算一次並顯示出來，離開模擬模式後才會恢復用真實時間。這也是這個專案在沒有自動化測試的情況下，用來手動驗證課表邏輯是否正確的主要方法。

### AI 辨識課表照片

如果手上只有一張課表照片或截圖，不想一節一節手動輸入，可以用內建的 AI 辨識功能。整個流程是：

1. 選一張照片，系統先把它畫進畫布並限制在合理的長邊像素（避免傳太大張圖片，也避免辨識變慢）
2. 圖片轉成 JPEG 後連同一段結構化提示詞一起送給 Gemini，提示詞要求模型只讀「看得到」的內容——沒寫清楚的鐘聲時間就回空陣列，不要用一般學校的常見時間去猜；辨識不到教師或教室就留空，不要瞎掰
3. 為了兼顧準確度跟穩定性，系統會依序嘗試好幾個 Gemini 模型，前面的模型失敗或無法使用時自動換下一個試
4. 回傳的 JSON 會先經過跟手動輸入資料一樣的驗證與正規化流程，再顯示成一份可以檢查、可以修改的預覽
5. 使用者確認沒問題後才真正匯入，覆蓋或合併到現有課表——AI 的辨識結果不會未經確認就直接生效

這一步需要使用者自己申請並填入 Gemini API Key，也需要網路連線；沒有 Key 或沒有網路，其他所有功能完全不受影響，因為這從頭到尾都是可以跳過的選用功能。

### 備份、匯出與跨裝置轉移

因為資料只存在單一瀏覽器裡，換裝置、換瀏覽器、或只是想留一份存檔，都需要靠匯出/匯入。匯出時，系統會把課表資料去掉可以重算出來的重複欄位、攤平成陣列，再用不含容器標頭的 raw DEFLATE 壓縮一次，最後用一組印刷體字元組成的編碼表（Base91，比一般 Base64 更緊湊）把壓縮後的位元組轉成一段可以複製貼上的文字。這段文字貼到另一台裝置的匯入欄位、按下匯入，系統一樣會先解析出差異、列出「哪些東西會被改動」讓你看過，才會真的套用進去，不會無聲無息蓋掉原本的課表。

---

## 資料存在哪裡、存了什麼

所有東西都收在瀏覽器 `localStorage` 底下同一把鍵（`classFocusData`），內容是一個 JSON 物件，主要欄位包括：

| 欄位 | 內容 |
| --- | --- |
| `teacherDB` | 課程 → `[課程名稱, 教師, 教室]` 的對照表 |
| `locationDB` | 課程 → 教室的對照（供快速查表用） |
| `weeklySchedule` | 每個星期（用 `Date.getDay()` 的 0–6 編號，0 是星期日）對應到當天每一節排的課 |
| `bellTimes` | 每節課的 `[開始時間, 結束時間]` 陣列 |
| `breakTimes` | 特殊時段，每筆是 `{name, start, end}` |
| `countdownEvents` | 倒數事件，每筆是 `{name, startDate, endDate}` |
| `reverseWeek` | 單雙週對調開關 |
| `proAccent` / `proSecondary` / `proTertiary` | 外觀主色與衍生色 |
| `styleSlots` | 自訂樣式儲存槽 |

Gemini API Key 刻意存在另一把獨立的鍵（`orbitAiGeminiApiKey`），跟課表資料分開，匯出課表備份不會連 Key 一起帶走。每筆存檔還會夾帶一個內部的 schema 版本標記（`ORBIT_APP_ID`/`ORBIT_STORAGE_SCHEMA`），程式啟動讀取資料時會先檢查這個標記，資料格式跟目前版本對不上的話會先做相容性處理，避免舊資料讓程式壞掉。完整鍵值清單見〈[D. localStorage 鍵值](#d-localstorage-鍵值)〉。

---

## 專案守則：給人類與 AI 的維護原則

**這個專案刻意保持零依賴、可以直接複製資料夾就跑的架構——這不是還沒來得及導入工具鏈，是有意的選擇，目的是讓任何人（包含 AI 助理）打開這三個檔案就能讀懂整個系統，不需要先搞懂建置設定、模組解析、或框架慣例。**

因此，修改這個專案時最重要的一條規則是：**乾淨地重寫，不要疊補丁（clean rewrite, not patching on top）**。具體來說：

- 改一個函式的行為時，直接把那個函式改成它「應該長的樣子」，而不是在舊邏輯外面包一層新的 if/else、新的旗標、新的例外分支去繞過舊行為。如果新需求讓某段邏輯整個過時了，就刪掉它，不要留著「以防萬一」。
- 不要為了相容不存在的舊資料格式而加防禦性程式碼。這個專案只有一份 schema，`normalizeSettingsData` / `loadData` 已經是唯一的資料正規化入口——新欄位一樣要走這條路，不要另開一條「暫時」的相容路徑。
- 不要加回 `npm`／打包工具／前端框架，也不要把 `js/app.js` 拆回多個 `<script>` 標籤——這正是專案早期就解決過的效能問題（見〈[程式怎麼組織的](#程式怎麼組織的)〉），拆回去等於把卡頓帶回來。
- 新功能該放進語意最接近的既有區塊（見下方〈程式怎麼組織的〉的十二個區塊對照表），並注意區塊順序——後面的區塊可以用前面定義好的東西，反過來不行，`bootstrap.js` 之前的所有東西都要先定義完。
- 任何要寫進 `localStorage` 的新資料欄位，都應該比照現有 `data.js` 區塊裡 `normalize*` / `validate*` / `sanitize*` 系列函式的寫法：先驗證再存，並考慮舊資料讀進來時不要爆炸。
- 改樣式時記得同時檢查手機寬度下的呈現（見〈[E. 響應式斷點總覽](#e-響應式斷點總覽)〉），這個專案在響應式細節上投入不少心力，新樣式不該只在桌機寬度下好看。CSS 是「一路線性疊加」的寫法（見檔案開頭註解），沒有 `@layer`，後面的規則本來就會贏過前面的——新規則放在語意相近的既有區塊附近，不要靠提高特異性（`!important`、更長的選擇器）去硬贏。
- 沒有自動化測試套件，改到課表計算或倒數邏輯之後，用時間模擬面板實際切換幾個邊界時間點（節與節交界、午休前後、當天最後一節下課後）確認行為符合預期，是目前唯一可靠的驗證方式。

下面〈[技術索引](#技術索引每一個函式--每一段-uicss)〉章節把 `js/app.js` 裡**每一個函式**、`css/styles.css` 裡**每一條選擇器**都列出來、標明對應到畫面上的哪個元件，目的就是讓你（人類或 AI）動手改之前，能先準確定位「這個功能現在是哪個函式在管、哪段 CSS 在畫」，而不是用猜的、也不需要整個檔案讀過一遍才能開始改。

---

## 程式怎麼組織的

專案只有三個會被瀏覽器讀取的檔案：`index.html`（畫面標記）、`css/styles.css`（樣式，約 860 行）、`js/app.js`（所有邏輯，約 5,300 行）。這不是偷懶，是刻意的——早期版本把邏輯拆成十幾個 `<script>` 各自對應一個功能，每次載入都要發十幾個 HTTP 請求，啟動時甚至還會用同步請求把每個檔案重新抓一次來算版本雜湊，首次打開明顯卡頓；後來合併成一個檔案、版本雜湊計算也改成非同步，啟動速度才真正解決。

`js/app.js` 裡沒有模組系統，所有函式跟變數共用同一個全域作用域，靠檔案內部的先後順序保證誰用得到誰。原本各自獨立的檔案現在變成用註解標出的區塊，順序保留原本的相依關係：

| 區塊（原始檔名） | 大致行號 | 內容 |
| --- | --- | --- |
| `data.js` | 1–302 | 資料的讀寫、驗證、正規化，`localStorage` 存取（`loadData`/`saveData`），所有 `DEFAULT_*` 預設值 |
| `schedule.js` | 303–414 | 把設定資料組成「執行中課表」`runtimeSchedule`，星期／ISO 週次計算，星期導覽列渲染 |
| `appearance.js` | 415–781 | 主題色（`--pro-accent`/`--pro-secondary`）計算與套用、樣式面板、樣式庫儲存槽 |
| `dashboard.js` | 782–1342 | 主畫面即時更新的核心，`update()` 狀態機、倒數卡片、詳細資訊 modal |
| `editor-backup.js` | 1343–2398 | 備份匯出／匯入、v2 傳輸格式（DEFLATE + Base91）的編碼解碼、設定差異比對 |
| `editor-core.js` | 2399–3024 | 課表編輯器主流程、fold 展開收合、未儲存變更偵測、拖曳排序共用邏輯 |
| `editor-teachers.js` | 3025–3349 | 教師／課程清單編輯、排課抽屜（assign sheet） |
| `editor-schedule.js` | 3350–3569 | 每週排課網格、節次時間、特殊時段的增刪與排序 |
| `dashboard-render.js` | 3570–3844 | 主畫面實際的 DOM 渲染（`renderList`）、標題自動縮字（`fitNowTitleText`）、**每秒觸發一次的 `mainClockTick`** |
| `gemini-ocr.js` | 3845–4609 | 圖片前處理、Gemini API 呼叫、AI 結果正規化與匯入預覽 |
| `bootstrap.js` | 4610–4623 | 啟動流程：讀資料、建課表、套用主題、開每秒一次的計時器、渲染第一幀 |
| `testsim-runtime.js` | 4624–5301 | 時間模擬狀態機（IIFE），monkey-patch `update`/`toggleTestPanel` 加入模擬邏輯 |

這個順序不是隨便排的：`bootstrap.js` 一定要在其他功能模組都定義完之後才能執行（它會呼叫前面定義的函式），而它自己又要排在 `testsim-runtime.js` 之前，因為時間模擬需要覆蓋掉 bootstrap 啟動的那個計時器。

---

## 畫面每秒都在算什麼（tick loop）

主畫面不是靠使用者操作觸發更新，而是 `bootstrap.js` 啟動時就掛了一個每秒執行一次的計時器：

```js
setInterval(mainClockTick, 1000);
```

`mainClockTick()`（`dashboard-render.js`）每秒觸發的完整呼叫鏈：

```
mainClockTick()
  → 若時間模擬正在播放：TEST_TIME_SEC += 1（並更新模擬滑桿）
  → update()                              ← 實際上已被 testsim-runtime.js 的 patchUpdate() 包了一層
      → 偵測「剛離開模擬模式」→ suppressListAnimationForThisFrame()
      → syncCrossDayBeforeRender()        ← 模擬時鐘跨過午夜時，把 TEST_DAY 往前推一天
      → 原始 update()（dashboard.js）：
          → updateExamCountdown()          ← 更新倒數卡片
          → 取得目前時間（真實或模擬）、星期、單雙週
          → 從 runtimeSchedule[今天] 找出目前課／下一堂課／是否在特殊時段
          → 判斷今天課是否已全部結束，需要的話把 viewDay 自動切到下一個上課日
          → 直接用 getElementById 寫入：週次徽章、狀態點、計時數字、進度條寬度、
            現在課名／教師／教室、下一堂課名／資訊，並呼叫 fitNowTitleText() 自動縮字
          → 若「目前顯示狀態」跟上一輪不同 → renderList(week, curIdx, nxtIdx, curDay, isDayFinished)
              → 重建整份課表列表，套用 is-now / is-next 樣式與進場動畫
              → keepActiveClassVisible()  ← 自動捲動讓目前／下一堂那一列進入可視範圍
      → 依模擬旗標決定要不要鎖住/解鎖時間輸入框（arm/disarm end-of-day）
      → applyDashboardState()             ← 切換 .dashboard 上的狀態 class（放學/非上課時段/今日無課等）
      → syncTestingBody()、persistTestState()（寫回 orbitTestState）、finishBoot()
```

因為每一輪都是重新算、不是在舊狀態上小修小補，所以「這堂課下課了」「換了一天」這類跨越邊界的情況不需要特別寫例外邏輯——時間一過某個節點，這輪算出來的結果自然就不一樣了。

---

## 技術索引：每一個函式 ↔ 每一段 UI／CSS

> 以下四個小節是完整的技術參考，刻意保留英文（函式名稱、CSS 選擇器、DOM id 本身就是英文，用英文描述可以跟原始碼直接比對，減少人類與 AI 讀取時的翻譯落差）。行號以目前版本為準，程式碼變動後可能會有些微偏移；找不到時請用函式名稱／選擇器字串直接在檔案裡搜尋。

### A. CSS 自訂屬性與主題機制

Orbit AI 沒有分離的淺色主題——`html{color-scheme:dark}` 是寫死的，整份 `styles.css` 都是深色優先設計，沒有 `prefers-color-scheme` 或 `[data-theme]` 分支。「換主題」實際上是使用者調的**強調色**（accent color），JS 把它以 inline style 的方式寫在 `<body>` 上，其他所有顏色都是靠 `color-mix()` 從這兩個值推導出來的。

**`:root` 上定義的靜態 design tokens：**

| 變數 | 行號 | 作用 |
| --- | --- | --- |
| `--orbit-panel` | 19 | 基礎深色面板色，供 glass/well 材質的 `color-mix` 混色使用 |
| `--orbit-panel-strong` | 20 | 較深/較強的面板色變體（選單、編輯器、模擬面板） |
| `--orbit-coral` | 21 | 固定珊瑚色（如 `.style-cancel-btn` 文字色） |
| `--orbit-white` | 22 | 近白色文字色（`.editor-close`） |
| `--orbit-muted` | 23 | 灰階次要文字色（提示文字、meta 文字） |
| `--orbit-radius-lg` / `--orbit-radius-md` | 24–25 | 大／中圓角（26px／16px） |
| `--v31-hub-size` | 26 | 圓形選單開關按鈕 `#btn-menu` 的尺寸（46px） |
| `--v31-radius-xl` | 27 | 開機載入遮罩的圓角 |
| `--pro-accent` | 30 | **使用者可調的主色**，JS 以 inline style 覆寫在 `<body>` 上 |
| `--pro-secondary` | 31 | **使用者可調的次色**，JS 以 inline style 覆寫在 `<body>` 上 |
| `--pro-accent-text` / `--pro-secondary-text` | 32–33 | 疊在主色／次色色塊上要用的前景文字色 |
| `--pro-accent-readable` / `--pro-secondary-readable` | 34–35 | 作為「文字本身顏色」時對比度調整過的主色／次色 |
| `--card` / `--txt` / `--sub` | 44–46 | 半透明卡片底色、主要文字色、次要文字色 |
| `--glass-blur` / `--glass-sat` / `--glass-bright` | 55–57 | 玻璃材質的模糊半徑（20px）、飽和度（130%）、亮度（104%） |
| `--glass-fill` / `--glass-fill-strong` | 58–59 | 玻璃材質的半透明填色（一般／強化版） |
| `--glass-edge-shadow` / `--glass-shadow` / `--glass-shadow-soft` | 66–72 | 純用內陰影堆疊出的「Liquid Glass」邊緣光暈效果（不是漸層邊框） |
| `--well-fill` / `--well-shadow` | 73–74 | 凹陷「well」材質（現在／計時器托盤、清單列、輸入框）的填色與陰影 |
| `--ease-glass` | 75 | 幾乎所有面板/彈出視窗共用的緩動曲線 |

**`body` 上重新宣告的主題衍生別名**（第 84–104 行；之所以要在 `body` 上重宣告一次而不是留在 `:root`，是因為 JS 只在 `<body>` 上覆寫 `--pro-accent`/`--pro-secondary`，`var()` 的解析發生在「宣告該屬性的元素本身」，若別名留在 `:root` 解析，就永遠讀不到使用者調過的顏色）：

`--orbit-line`、`--accent`、`--bd`、`--ok`、`--warn`、`--odd-bg`/`--odd-txt`（單週徽章）、`--even-bg`/`--even-txt`（雙週徽章）、`--day-today-border`/`--day-tomorrow-border`（導覽列今日/明日外框）、`--status-tag-next-bg`/`-fg`、`--status-tag-now-bg`/`-fg`（課表列「現在/下一節」標籤）、`--pro-action-bg`/`--pro-action-bg-2`/`--pro-action-text`（主要操作按鈕漸層）、`--pro-blend`（主色與次色各半混合，給需要第三種可辨識色調的地方用，例如時間模擬工具圖示）。

**JS 執行期才寫入、CSS 只消費的變數**：`--current-class-color`（現在課程的標題/教室/標籤顏色）、`--class-color`（課表列左側色條）、`--row-i`（`renderList` 為每列設定的進場動畫延遲索引）、`--avatar-hue`（教師卡片頭像色相，依科目字串雜湊決定）、`--slot-primary`/`--slot-secondary`（樣式庫儲存槽的漸層色）。

`@media (display-mode:standalone)`（第 848–860 行）刻意放在整份檔案的**最後面**：當使用者把網頁加到 iOS/Android 主畫面、以獨立 App 模式開啟時，會把幾乎所有玻璃材質元件的 `backdrop-filter` 強制關掉（`!important`），繞開 iOS Safari 在 standalone 模式下已知的模糊圖層錯誤疊圖 bug，同時把 `--glass-fill`/`--glass-fill-strong` 調得更不透明來補償失去的模糊效果。

---

### B. UI 區塊 ↔ CSS 選擇器完整對照表

依畫面由上到下的區域分組；每一列的「UI 元素」欄位是 `index.html` 裡實際帶有該 class／id 的元素，「說明」欄位描述它的視覺行為。

#### B0. 重置與動畫關鍵影格

| 選擇器 | 行號 | 說明 |
| --- | --- | --- |
| `*` | 10 | box-sizing 重置，關閉行動裝置的點擊高亮閃爍 |
| `@keyframes fadeInUp` | 12 | **已定義但目前沒有任何規則使用**（廢棄／舊版殘留） |
| `@keyframes orbit-boot-spin` | 13 | 旋轉動畫，供 `.dashboard-boot-spinner` 使用 |
| `@keyframes orbit-row-in` | 14 | 課表列進場動畫（淡入＋上移＋縮放＋模糊消除），供 `.animate-list .row` 使用 |
| `@keyframes orbit-card-in` | 15 | **已定義但目前沒有任何規則使用**（廢棄／舊版殘留，可能被 `orbit-row-in` 取代） |

#### B1. 頁面外殼

| 選擇器 | 行號 | UI 元素 | 說明 |
| --- | --- | --- | --- |
| `html` | 79 | 根節點 | 強制深色 `color-scheme`，關閉頁面捲動 |
| `body` | 80–116 | `<body class="orbit-booting">` | 宣告主題衍生變數；多層放射漸層背景；所有主要區塊的 flex 容器 |
| `body::before` | 117–125 | body 的裝飾層 | 網格線紋理疊加，向下漸淡，`pointer-events:none` |
| `.test-banner` / `#test-banner` | 128 | 「模擬中」紅色頂部通知列 | 預設 `display:none`，時間模擬進行中由 JS 顯示 |

#### B2. Dashboard 主卡片（現在播放的課）

| 選擇器 | 行號 | UI 元素 | 說明 |
| --- | --- | --- | --- |
| `.dashboard` | 133–150 | 整張頂部卡片 | flex column 玻璃卡片，高度依視窗夾在 `clamp(272px,41dvh,320px)` |
| `.dashboard-boot-loader` / `.dashboard-boot-spinner` | 152–155 | 開機載入中的轉圈動畫 | 只有 `body.orbit-booting` 時顯示，蓋住尚未就緒的卡片 |
| `.dashboard > .label-row` | 158 | 卡片頂部列（週次徽章／倒數／工具選單） | grid：`auto minmax(0,1fr) 38px` |
| `.label` / `#week-display-main` | 159–161 | `<span id="week-display-main">` 週次文字 | 徽章樣式，超過 58px 省略號截斷 |
| `.label-odd` / `.label-even` | 162–165 | 單週／雙週樣式（JS 動態加上的 class） | 底線式標籤，分別用 `--pro-accent`／`--pro-secondary` |
| `.status-dot` / `#dot` / `.status-active` / `.status-wait` | 166–169 | `<div id="dot">`（目前標記為 `display:none`，尚未在畫面上實際使用） | 發光圓點，遺留樣式 |
| `.exam-countdown` / `#exam-countdown` | 171–189 | 倒數事件卡片（可左右滑動） | grid 版面，`touch-action:pan-y`／`cursor:grab` 支援手勢滑動 |
| `.exam-countdown-copy` / `-label` / `-date` | 180–182 | 倒數事件名稱與日期文字 | 直向排列，省略號截斷 |
| `.exam-countdown-value` / `#exam-countdown-value` | 183 | `<div id="exam-countdown-value">` 例如 `D-000` | 大型等寬字體數字 |
| `.exam-countdown-dots` / `#exam-countdown-dots` / `.exam-countdown-dot` | 185–188 | 多個倒數事件的分頁小圓點 | JS 產生，`.active` 標記目前選中的事件 |
| `.top-actions` / `#top-actions-menu` | 191–218 | 右上角工具選單（＋按鈕與展開的三個功能鈕） | `#btn-menu` 是開關（旋轉 45° 變成「×」），展開後顯示 `#btn-edit`/`#btn-test`/`#btn-style` |
| `#btn-test.sim-running` | 217 | 時間模擬按鈕在模擬進行中的狀態 | 混合色發光提示 |
| `body.editor-open .top-actions` | 218 | 編輯器開啟時的工具列 | 隱藏，避免蓋在編輯器上 |
| `.now-stack` | 221–229 | `<div class="now-stack">` 包住現在課名與 meta 標籤 | 凹陷 well 材質，2 欄 grid |
| `.now-stack.is-status` | 228–229 | 顯示「非上課狀態」文字時的版面（如今日課程已結束） | 單欄置中 |
| `.title-now` / `#now-name` | 230–234 | `<div id="now-name">` 現在課程的大標題 | 37px 粗體，顏色取 `--current-class-color` |
| `#now-teacher` / `#now-place` / `#now-class-label` | 236–241 | 教師／教室／單雙週標籤三個 meta 小標籤 | 預設隱藏，JS 加上 `.show` 才顯示 |
| `.time-card` | 248–252 | 進度條＋計時器卡片 | 凹陷 well 材質 |
| `#progress-wrap` / `#progress-bar` | 253–255 | 課堂/下課進度條 | 預設隱藏，`.is-class` 時漸層方向改變 |
| `#timer-group` / `#timer-val` / `.timer-label` | 256–258 | 倒數計時數字與「上課／下課」文字 | 等寬字體大數字徽章 |
| `.time-card.v3-11-next-module` | 261–280 | **合併版面**：JS 開機時把 `.next-box` 移進 `.time-card` 內 | CSS grid `"progress progress" / "next timer"`，把進度條、下一堂預告、計時器合成一張卡 |
| `.next-box` / `.next-content` / `.title-next` / `#next-name` / `#next-meta-text` | 273–286 | 下一堂課預告區塊 | `<div id="next-name">` 兩行截斷、置中換行 |
| `.dashboard.v3-15-day-finished` / `.v3-16-outside-class-range` / `.orbit-no-school-day` / `.orbit-no-upcoming-class` | 232–311 | **JS 動態切換在 `.dashboard` 上的狀態 class**，對應「今天課上完了」「不在上課時段」「今天沒課」「這堂課後沒有下一堂」等情境 | 依狀態隱藏/重排 `.next-box`、`.time-card`、`.now-meta-row`、`.timer-container` 等，讓卡片版面隨情境自然收斂 |

#### B3. 星期導覽列

| 選擇器 | 行號 | UI 元素 | 說明 |
| --- | --- | --- | --- |
| `.nav-bar` | 316–322 | `<div class="nav-bar">`（HTML 內為空，由 JS 填入每個星期按鈕） | 玻璃材質橫條，flex row |
| `.nav-item` | 323–338 | 每個星期分頁按鈕（JS 產生） | `.is-today`／`.is-tomorrow` 外框提示，`.active` 目前選中的星期為實心漸層 |

#### B4. 課表清單

| 選擇器 | 行號 | UI 元素 | 說明 |
| --- | --- | --- | --- |
| `#schedule-list` / `.list-container` | 343–353 | 可捲動的當日課表清單 | 自訂細滾動條 |
| `.animate-list .row` / `@keyframes orbit-row-in` | 355–357 | 清單重新渲染時的進場動畫 | 依 `--row-i` 交錯延遲；`prefers-reduced-motion` 時停用 |
| `.row` | 359–407 | 每一節課的清單項目（JS 產生） | 76px 高卡片，`.row-name` 左側色條取 `--class-color` |
| `.row-meta` / `.meta-chip` / `.meta-time` / `.meta-location` | 372–375 | 節次時間／教室等次要資訊小標籤 | |
| `.period-badge` | 376 | 節次編號徽章 | |
| `.status-tag` / `.is-now .status-tag` / `.is-next .status-tag` | 377–379 | 「現在」／「下一節」小標籤 | |
| `.week-label` / `.label-odd` / `.label-even` | 380–382 | 單雙週徽章（課表列上） | |
| `.row.is-now` / `.row.is-next` | 386–401 | **目前正在上／即將上的那一列** | 漸層背景＋粗左邊框＋陰影，是整個清單裡最顯眼的兩種狀態 |

#### B5. 課程詳細資訊彈出視窗

| 選擇器 | 行號 | UI 元素 | 說明 |
| --- | --- | --- | --- |
| `#overlay` / `.modal-overlay` | 412–413 | 點課表列後的深色遮罩 | 徑向漸層＋模糊 |
| `body.modal-open` 影響的 `.dashboard`/`.nav-bar`/`#schedule-list` | 414 | 彈窗開啟時背景三大區塊 | 模糊、變暗、縮小、不可互動 |
| `#sheet` / `.modal-sheet` | 416–434 | 底部彈出的詳細資訊卡 | 玻璃材質，關閉時 `translateY(100%)` + `visibility:hidden` 雙重保險（因應 iOS Safari standalone 模式的已知 bug） |
| `.test-panel-handle` | 435–437 | 卡片頂端的拖曳把手（多個面板共用元件） | 拖曳時加寬並帶主色 |
| `#m-title` / `#m-teacher` | 441–442 | 課程名稱與教師 | |
| `#split-info-card` / `.split-grid` / `.split-col` | 443–449 | 單雙週不同課時的「本週／下週」對照卡 | 只有該課是 `/` 分隔的單雙週課時才顯示 |
| `.stat-grid` / `.stat-card` / `#m-count` / `#m-type-val` / `#m-location-card`/`#m-location-val` | 450–454 | 每週節數／類型／教室三個統計方塊 | |
| `#m-occ-list` / `.occ-row` | 455–463 | 這門課在一週中所有出現的節次列表 | 可捲動，最高 118px |
| `#modal-close-btn` / `.close-btn` | 464–466 | 「完成」按鈕 | 滿版漸層按鈕 |

#### B6. 課表編輯器

編輯器是整個 CSS 檔案裡篇幅最大的一段（第 468–699 行），涵蓋 `#editor-sheet` 本體與裡面每一個 fold（可折疊區塊）、共用的確認對話框、以及排課抽屜。

| 選擇器 | 行號 | UI 元素 | 說明 |
| --- | --- | --- | --- |
| `#editor-sheet` / `.editor-sheet` | 471–496 | 整個編輯器全螢幕面板 | 從底部滑入，同樣有 `translateY`+`visibility` 雙重保險 |
| `.editor-inner` | 487–496 | 面板內實際的捲動卡片 | `.is-layered` 模式下只顯示 `.editor-fold.active` 那一個（抽屜式單頁瀏覽） |
| `.editor-header` / `.editor-title` / `.editor-close` | 498–504 | 標題列與 × 關閉鈕 | 多個面板共用（編輯器／模擬／樣式面板皆用同一套 class） |
| `.editor-fold` / `.editor-fold-summary` / `.editor-fold-body` | 506–522 | `<details>` 折疊區塊：選項／倒數活動／科目與教師／課表／節次時間／特殊時段／匯入匯出 | 自訂展開箭頭，`[open]` 時箭頭旋轉、內容區加上分隔線 |
| `.editor-drill-actions` / `.editor-drill-btn` | 516–518 | 「課表」區塊裡快速跳到 科目/節次/時段/倒數 的按鈕 | |
| `.editor-confirm-overlay` / `.editor-confirm-sheet` / `.editor-confirm-title` / `.editor-confirm-msg` / `.editor-confirm-actions` / `.editor-confirm-btn` | 524–540 | **共用確認對話框元件**，用在：未儲存變更提示（`#editor-confirm-sheet`）、Gemini API 金鑰輸入（`#ocr-apikey-sheet`）、排課覆蓋確認（`#assign-sheet`） | 置中彈出，`.primary`／`.danger` 兩種按鈕語氣 |
| `.toggle-row` / `.toggle-switch` / `#toggle-reverse` | 542–548 | 「單雙週對調」iOS 風格開關 | `.on` 時滑塊右移、軌道變主色 |
| `#teacher-list` / `.teacher-card` / `.teacher-avatar` / `.tc-subject` / `.tc-teacher` | 550–561 | 科目／教師清單每一張卡片 | 左側頭像色相取 `--avatar-hue`（依科目字串雜湊決定） |
| `.teacher-drag-handle` / `.countdown-drag-handle` | 559–561 | 拖曳排序把手（教師卡片／倒數事件共用） | |
| `.bell-row` / `.break-row` / `.editor-input` | 563–569 | 節次時間／特殊時段的輸入列，以及所有一般文字輸入框的共用樣式 | |
| `.add-btn` / `.delete-btn` | 571–576 | 「新增」與刪除按鈕 | |
| `#schedule-grid` / `.schedule-day-row` / `.schedule-periods` / `.period-select` | 578–585 | 每週排課網格，每天一列，每節一個下拉選單 | |
| `#bell-list` / `#break-list` / `.bell-num` / `.bell-inputs` / `.time-input` / `.time-sep` | 587–597 | 節次時間／特殊時段清單，每列含「第 N 節」徽章與開始/結束時間輸入 | |
| `#countdown-event-list` / `.countdown-event-row` / `.countdown-event-header` / `.countdown-event-fields` / `.countdown-date-range` | 599–617 | 倒數活動編輯清單 | |
| `.settings-transfer-box` / `#settings-transfer-text` / `.settings-transfer-actions` / `.settings-transfer-btn` / `#settings-transfer-status` | 619–627 | 匯入／匯出文字框與按鈕 | |
| `#ocr-import-box` / `#ocr-import-image` / `#ocr-import-detect` / `#ocr-import-result` | 629–652 | AI 圖片匯入整個區塊：選檔、預覽縮圖、辨識按鈕、辨識結果預覽 | `#ocr-import-result` 的內容由 `js/gemini-ocr.js` 的 `ImportPreview` 從樣板動態產生 |
| `#ocr-apikey-sheet` | 654–656 | Gemini API 金鑰輸入對話框 | 沿用 `.editor-confirm-sheet` 樣式 |
| `.save-btn` / `#save-toast` | 658–662 | 編輯器底部「儲存」按鈕與「已儲存」提示 toast | 儲存按鈕黏在捲動區底部 |
| `#assign-sheet` / `.assign-day-tabs` / `.assign-grid` / `.assign-box` | 664–685 | 排課抽屜：選星期分頁 → 每節一個可點的方塊 | `.assign-box.occupied`（已被別科佔用）／`.assign-box.assigned`（指派給目前科目） |
| `.order-position-label` / `.order-position` | 687–691 | 拖曳排序旁邊可直接輸入數字調整順序的欄位 | |
| `.editor-hint` / `.editor-hint-title` / `.editor-hint-body` | 693–696 | 提示說明框（如「雙週科目／教師」用法提示） | |

#### B7. 時間模擬面板

| 選擇器 | 行號 | UI 元素 | 說明 |
| --- | --- | --- | --- |
| `#debug-panel` / `.test-panel` | 706–725 | 「時間模擬」底部面板 | 沿用共用的 header／fold 樣式 |
| `#sim-indicator` / `.test-status-pill` | 727 | 「模擬中」小標籤 | |
| `#app-version` / `#test-refresh-btn` | 729–731 | 版本雜湊顯示與「更新」按鈕 | |
| `#test-time-slider` | 733–738 | 時間滑桿（自訂 WebKit／Firefox 的滑塊樣式） | |
| `#test-play-pause-btn` / `.sim-btn` | 742–751 | 「開始／暫停」按鈕 | `.active` 時實心填色（代表正在播放） |
| `#test-exit-btn` / `.test-exit-btn` | 753–755 | 「結束模擬」按鈕 | 紅色警示語氣，`:disabled` 時刻意保持不透明（不淡化） |

#### B8. 樣式面板

| 選擇器 | 行號 | UI 元素 | 說明 |
| --- | --- | --- | --- |
| `#style-panel` / `.style-panel` | 763–772 | 「樣式工具」底部面板 | |
| `#style-primary-input` / `#style-secondary-input` / `.style-color-well` | 771, 802–804 | 主色／次色的原生色彩選擇器 | |
| `#style-preset-grid` / `.style-preset-chip` / `.style-preset-swatch` | 774–787, 797–801 | 五組內建預設色（Orbit Color／餘燼／潟湖／墨夜／柑橘） | 每個都是固定的雙色漸層小樣本 |
| `#style-slot-grid` / `.style-slot` / `.style-slot-swatch` / `.style-slot-save` | 805–815 | 「我的樣式」五個自訂儲存槽 | `.has-style` 已存有配色；空槽會畫一條對角線表示「空」 |
| `#style-preview-state` / `.style-preview-status` / `.style-preview-status-dot` | 794, 817–819 | 「預覽中，尚未儲存」狀態列 | 只在預覽模式顯示 |
| `.style-apply-btn` / `.style-cancel-btn` | 781–782, 823–824 | 「預覽並儲存／儲存樣式」與「離開預覽」按鈕 | |

#### B9. Standalone（加到主畫面）模式覆寫

| 選擇器 | 行號 | 說明 |
| --- | --- | --- |
| `@media (display-mode:standalone){ ... }` | 848–860 | 見〈[A. CSS 自訂屬性與主題機制](#a-css-自訂屬性與主題機制)〉最後一段——關閉幾乎所有玻璃材質元件的 `backdrop-filter`，繞開 iOS standalone 模式的已知渲染 bug |

---

### C. 函式完整索引（依 js/app.js 區塊）

以下按〈[程式怎麼組織的](#程式怎麼組織的)〉的十二個區塊列出**每一個**函式。行號為目前版本的大致位置。

#### `data.js`（資料存取與驗證）

| 函式 | 行號 | 說明 |
| --- | --- | --- |
| `isValidTime(value)` | 77 | 檢查字串是否為合法的 `HH:MM`（0–23 時、0–59 分） |
| `isValidTimeRange(start, end)` | 82 | 確認 `start`/`end` 皆合法時間，且 `end` 嚴格晚於 `start` |
| `validateTimeIntervals(bellTimes, breakTimes)` | 90 | 合併節次與特殊時段成排序後的區間清單，找出任何重疊就丟出中文錯誤訊息並指名衝突的兩個標籤 |
| `normalizeCountdownEvent(value)` | 111 | 把單筆原始物件轉成 `{name,startDate,endDate}`；支援舊版單一 `date` 欄位；起訖顛倒時自動互換；無效則回傳 `null` |
| `formatCountdownEventDate(event)` | 129 | 把倒數事件日期格式化成 `YYYY.MM.DD` 或區間 `YYYY.MM.DD–MM.DD` |
| `normalizeCountdownEvents(value)` | 138 | 對陣列逐筆跑 `normalizeCountdownEvent`，最多保留 12 筆；輸入型別根本不是陣列時才退回預設值 |
| `getDefaultData()` | 150 | 用所有 `DEFAULT_*` 常數＋`getStoredGeminiApiKey()` 組出一份全新的預設 `applicationData` |
| `sanitizeBreakTimes(bellTimes, breakTimes=[])` | 168 | 過濾出合法、且跟節次／彼此不衝突的特殊時段；再補回仍然合適的 `DEFAULT_BREAK_TIMES` 項目 |
| `loadData()` | 199 | 讀取 `localStorage['classFocusData']`，驗證必要欄位與型別，回傳完整正規化後的資料物件；解析或格式失敗一律回退到 `getDefaultData()` |
| `saveData(d)` | 292 | 把 `d` 連同內部 `__orbit` schema 標記寫回 `localStorage['classFocusData']`，寫入失敗靜默吞掉 |

**重要全域常數：** `ORBIT_INITIAL_MARKUP`（頁面初始 HTML 快照，供 `testsim-runtime.js` 算版本雜湊用）、`REVERSE_WEEK_LOGIC_DEFAULT`、`DEFAULT_STYLE_PRIMARY`/`DEFAULT_STYLE_SECONDARY`、`window.MANUALLY_TEST`/`TEST_DAY`/`TEST_TIME_SEC`/`IS_SIMULATING`（模擬模式旗標）、`DEFAULT_TEACHER_DB`/`DEFAULT_LOCATION_DB`/`DEFAULT_WEEKLY_SCHEDULE`/`DEFAULT_BELL_TIMES`/`DEFAULT_BREAK_TIMES`/`DEFAULT_COUNTDOWN_EVENT(S)`（出廠預設課表）、`ORBIT_APP_ID`/`ORBIT_STORAGE_SCHEMA`（資料格式標記）、`dayNames`（「日一二三四五六」）。

#### `schedule.js`（課表計算）

| 函式 | 行號 | 說明 |
| --- | --- | --- |
| `buildSchedule()` | 306 | 從 `applicationData` 重建全域 `runtimeSchedule`（0–6 天），並呼叫 `renderNavBar()` |
| `renderNavBar()` | 330 | 渲染 `.nav-bar` 的星期分頁按鈕（`onclick="handleNav(d)"`），週一到週五固定顯示，週六日只在有課時才顯示 |
| `parseTime(t)` | 362 | `"HH:MM"` 轉成從午夜起算的分鐘數 |
| `pad2(n)` | 367 | 數字左補零到兩位數 |
| `getISOWeekNumber(date)` | 371 | 計算 ISO-8601 週數 |
| `getWeekType()` | 379 | 回傳「單」或「雙」，若 `applicationData.reverseWeek` 則反轉 |
| `getWeekLabelHtml(w)` | 386 | 把週次字串包成 `<span class="week-label ...">` 徽章 |
| `getNextSchoolDay(day)` | 390 | 從 `day` 往後找下一個有課的星期，找不到則退回週一～週四或週一 |
| `processSplitName(c, week)` | 399 | 針對用 `/` 分隔的單雙週課，依 `week` 回傳對應那一半的科目/教師/週次標籤 |

**全域狀態：** `runtimeSchedule`（依星期組好的課表，每天一個課程區塊陣列）、`viewDay`（目前顯示的星期分頁）、`lastListKey`（避免重複渲染的備忘鍵）、`autoAdvancedAfterFinishedDay`、`lastAutoScrollKey`。

#### `appearance.js`（主題與樣式面板）

| 函式 | 行號 | 說明 |
| --- | --- | --- |
| `normalizeProAccent(value)` / `normalizeProSecondary(value)` / `normalizeProTertiary(value)` | 413–421 | 驗證並轉大寫 `#RRGGBB`，無效則退回對應預設色 |
| `getReadableTextColor(value)` | 434 | 計算 WCAG 相對亮度，回傳 `#10171A` 或 `#FFFFFF` 中對比度較好的一個 |
| `getReadableSurfaceColor(value)` | 446 | 若顏色本身在近黑底色上對比度足夠就直接回傳，否則回傳淺色備援 `#F4FBFF` |
| `normalizeStyleSlots(value)` | 459 | 把輸入正規化成固定 5 個樣式儲存槽 `{name,primary,secondary}` |
| `deriveProSupportColors(primary)` | 472 | 把主色轉成 HSL，推導次色（色相 +28°）與第三色（+190°），手算 HSL→RGB |
| `applyProAccent(data=applicationData)` | 530 | 把主色/次色（含可讀性變體）以 CSS 自訂屬性寫到 `document.body` 上 |
| `setStyleMode()` | 542 | 加上 `pro-style` body class、套用主色、渲染樣式面板、重新排版 |
| `refreshStyleModeLayout()` | 548 | 兩層 `requestAnimationFrame`：重置捲動對齊鍵、呼叫 `update()`、`fitNowTitleText(true)` |
| `renderStylePanel()` | 560 | 從 `applicationData` 重置 `stylePanelDraft`，填入色彩輸入框，清除 dirty 旗標，渲染樣式槽 |
| `getStyleDraftFromControls()` | 573 | 讀取目前色彩輸入框的值，合併成草稿物件 |
| `previewStyleSettings()` | 583 | 從輸入框更新草稿、視覺套用、標記面板為 dirty |
| `setStylePanelMode(mode)` | 588 | 在「編輯器內容」與「預覽狀態」兩種顯示模式間切換 |
| `enterStylePreview()` / `exitStylePreview()` | 545–551 | 進入／離開樣式預覽模式 |
| `applyStyleVisual(style)` | 606 | 加上 `pro-style` class、套用指定色彩、呼叫 `update()` |
| `confirmStyleSettings()` | 613 | 組出含草稿色彩的完整設定複本存進 `pendingStyleSaveData`，呼叫 `applyPendingStyleSave()` |
| `applyPendingStyleSave()` | 626 | 透過 `applyEditorSettingsData` 提交（存檔＋重建＋toast），重設樣式模式，關閉面板 |
| `renderStyleSlots()` | 638 | 渲染 5 個樣式槽按鈕到 `#style-slot-grid`（`onclick="loadStyleSlot"`/`"saveStyleSlot"`） |
| `saveStyleSlot(index)` / `saveStyleSlotDraft(index)` / `applyPendingStyleSlotSave()` | 592–610 | 把目前草稿色彩存進指定樣式槽；若該槽已有內容先跳出覆蓋確認 |
| `loadStyleSlot(index)` / `applyPendingStyleSlot()` | 616–623 | 若槽位已命名則跳出確認，確認後把該槽色彩填回輸入框並預覽 |
| `toggleStylePanel()` / `openStylePanel(resetDraft=true)` / `closeStylePanel()` | 632–656 | 樣式面板開關；關閉前若有未套用的預覽先跳出確認 |
| `showStyleDiscardConfirm()` / `discardStyleChangesAndClose()` | 664–668 | 詢問是否捨棄未套用的樣式預覽；確認後還原並關閉 |
| `applyStylePreset(name)` | 760 | 套用 `PRO_PALETTE_PRESETS` 裡指定的預設配色並預覽 |

**全域常數／狀態：** `PRO_PALETTE_PRESETS`（default/rose/ocean/midnight/graphite 五組配色）、`stylePanelDraft`、`testPanelOpen`、`pendingAfterEditorDiscard`、`pendingEditorImportData`、`pendingEditorSaveData`、`editorBaselineData`、`pendingBellDelete`、`pendingTeacherDelete`、`pendingStyleSaveData`、`pendingStyleSlotIndex`、`pendingStyleSlotSaveIndex`。

#### `dashboard.js`（主畫面狀態機）

| 函式 | 行號 | 說明 |
| --- | --- | --- |
| `toggleTestPanel()` / `closeTestPanel()` / `openTestPanel()` | 698–720 | 時間模擬面板開關；編輯器開著且 dirty 時先提示 |
| `syncTestToolbar()` | 813 | 依全域模擬旗標切換 `#btn-test` 的 `active`/`manual-test-on`/`sim-running` class |
| `bindSheetDragToDismiss(panelId, closeFn)` | 825 | 幫底部彈出面板的把手接上「往下拖曳關閉」手勢；掛在 `debug-panel`、`style-panel`、`sheet` 上 |
| `decorateSpecialTimeName(name)` | 886 | 修剪特殊時段名稱字串 |
| `handleNav(d)` | 890 | 設定 `viewDay=d` 並呼叫 `update()` |
| `setToolHubState(open)` / `toggleActionMenu()` | 802–812 | 開關右上角工具選單，處理 ARIA 屬性 |
| （文件層級 `click`／`keydown` 監聽） | 817–832 | 點選單外關閉選單；Escape 依優先順序關閉目前開著的面板；點 edit/test/style 按鈕後自動收合選單 |
| `getCountdownEvents(data=applicationData)` | 937 | 回傳 `normalizeCountdownEvents(data.countdownEvents)` |
| `showCountdownEvent(index)` | 940 | 設定 `activeCountdownIndex`（取餘數循環）並刷新倒數卡片 |
| `updateExamCountdown()` | 945 | 渲染倒數卡片的名稱／日期／分頁點／數值（`N天`／`今天`／`進行中`／`已結束`），沒有事件時隱藏卡片 |
| （倒數卡片指標事件） | 898–909 | 倒數卡片上的水平滑動手勢，觸發 `showCountdownEvent` |
| `update()` | 1022 | **每輪 tick 的主渲染函式**——完整流程見〈[畫面每秒都在算什麼](#畫面每秒都在算什麼tick-loop)〉 |
| `keepActiveClassVisible(list, isDayFinished, scrollKey)` | 1227 | 自動捲動讓「現在／下一節」那列進入可視範圍，每個 `scrollKey` 只執行一次，使用者正在手動捲動時不搶焦點 |
| `getNaturalListMaxScroll(list)` | 1263 | 回傳 `scrollHeight - clientHeight`（不小於 0） |
| `setElementVisible(id, visible)` | 1268 | 切換 `#id` 的 `show` class |
| `setOverlayVisible(overlayId, panelId, visible, bodyClass)` | 1273 | 同時切換遮罩與面板的顯示狀態、`aria-hidden`、可選的 body class |
| `closeModal()` | 1279 | 關閉課程詳細資訊彈窗，把焦點還給 `modalPreviousFocus` |
| `setSplitWeekClass(id, subject, teacher)` | 1285 | 填入單雙週資訊元素的科目文字與較小的教師文字 |
| `openModal(c)` | 1295 | 開啟課程詳細資訊彈窗：顯示教室卡片、列出這門課一週內所有出現的節次、顯示單雙週資訊（若適用）、填入標題／教師／節數 |

#### `editor-backup.js`（備份、匯出匯入、v2 傳輸格式）

| 函式 | 行號 | 說明 |
| --- | --- | --- |
| `collectEditorFormState()` | 1345 | 讀取編輯器裡每個 DOM 控制項（教師卡片、排課網格、節次列、特殊時段列、單雙週開關、倒數事件列），組成原始設定物件 |
| `editorFormSnapshotString()` | 1413 | 把編輯器目前 DOM 狀態序列化成 JSON 字串，供 dirty-check 比對 |
| `isEditorDirty()` | 1455 | 編輯器開啟中，且目前快照跟 `editorBaselineSnapshot` 不同則為 true |
| `runTransferAction(action)` / `requestTransferAction(action)` | 1328–1372 | 執行匯出（含覆蓋警告）或匯入預覽；若編輯器 dirty，先詢問「先存再轉移／不存直接轉移／取消」 |
| `cloneSettingsData(data)` | 1518 | 用 `JSON.parse(JSON.stringify(...))` 深拷貝 |
| `base91Encode(bytes)` / `base91Decode(str)` | 1391–1409 | 用自訂 91 符號字母表做 Base91 編解碼 |
| `encodeTransferPayloadV2(data)` / `decodeTransferPayloadV2(array)` | 1425–1433 | 把設定物件攤平成精簡的定位陣列（v2 匯出格式），或反向還原 |
| `encodeTransferDataV2(data)` / `decodeTransferDataV2(value)` | 1451–1457 | JSON 化 → `CompressionStream('deflate-raw')` 壓縮 → Base91 編碼 → 包上 `[ORBIT]…[/ORBIT]` 標記；或反向解碼 |
| `encodeTransferData(data)` / `decodeTransferData(text)` | 1465–1469 | 匯出／匯入的對外入口，檢查瀏覽器是否支援壓縮串流 API，不支援則丟錯 |
| `normalizeSettingsData(raw, {requireMarker=false})` | 1709 | **設定資料的完整驗證/正規化函式**（存檔與匯入路徑共用）：檢查必要欄位型別、`weeklySchedule` 是否對應到真實存在的 `teacherDB` 項目、驗證時間區間，回傳乾淨物件 |
| `settingsDataForExport()` | 1820 | 排序節次後，回傳蓋上 `__orbit` 標記的正規化目前表單狀態 |
| `setTransferStatus(message, isError=false)` | 1830 | 寫入 `#settings-transfer-status` 的文字與顏色 |
| `copyTransferText(text)` | 1836 | 用 Clipboard API 複製，失敗則退回隱藏 `<textarea>` + `execCommand('copy')` |
| `exportEditorSettings(data=settingsDataForExport())` | 1855 | 把 `data` 編碼進匯出文字框、複製、回報狀態 |
| `formatDiffValue(value)` / `formatClassRef(key, data)` / `pushDiff(lines, title, items)` / `dayDiffLabel(day)` | 1594–1610 | 差異比對文字產生的小工具函式 |
| `describeSettingsDiff(current, next, {isImport=false})` | 1887 | 產生完整的人類可讀差異文字（教師、地點、節次時間、特殊時段、排課、倒數事件、單雙週對調、Gemini 金鑰有無、色彩、樣式槽），最多截到 70 行 |
| `previewImportEditorSettings()` | 2063 | 解碼貼上的傳輸文字（特別處理字面值 `"reset"`：清空 `localStorage` 並重新整理頁面），算出與目前設定的差異，有實質變動才開啟匯入確認 |
| `mergeImportedSettings(current, imported, preserveStyle=false)` | 2088 | 把匯入資料併入目前設定（依 key 或依科目/教師名稱比對課程、重新映射排課格、合併特殊時段與倒數事件並解決衝突，優先採用匯入內容） |
| `showEditorImportModeConfirm(current, next, preserveStyle=false)` / `beginEditorImport(...)` / `showEditorImportConfirm(...)` | 1861–1904 | 提供「合併匯入」vs「直接匯入」的確認流程 |
| `applyEditorSettingsData(next, {closeAfter=false, statusMessage=''})` | 2318 | **設定的中央提交管線**：寫入 `applicationData`、儲存 Gemini 金鑰、正規化色彩/樣式槽、`saveData()`、`applyProAccent()`、`buildSchedule()`、重新渲染所有編輯器子區塊、重設 baseline、清除 `lastListKey`、呼叫 `update()`、顯示存檔 toast |
| `applyPendingImportSettings()` | 2346 | 透過上面的管線套用 `pendingEditorImportData`，清空傳輸文字框與 OCR 匯入 UI |
| `resetOCRImporterUI()` | 2361 | 清空 AI 圖片匯入的檔案選擇、預覽圖、檔名、狀態文字、結果面板 |
| `applyPendingSaveEditor()` | 2386 | 透過提交管線套用 `pendingEditorSaveData`，並重新執行任何排隊中的匯出/匯入動作 |

**全域常數：** `TRANSFER_MAGIC_V2='[ORBIT]'`、`TRANSFER_MAGIC_V2_END='[/ORBIT]'`、`BASE91_ALPHABET`（91 字元可列印符號集）、`BASE91_DECODE_MAP`。

#### `editor-core.js`（編輯器主流程）

| 函式 | 行號 | 說明 |
| --- | --- | --- |
| `formatClassLabel(subject, teacher, needsTeacher)` | 2403 | 產生簡短標籤：單純科目，或科目歧義/空白時的「科目（教師）」 |
| `getEditorTeacherEntriesFromDom()` / `getEditorClassLabelFromDom(key)` | 1989–2008 | 從畫面上即時讀取 `.teacher-card` 輸入值 |
| `getEditorBellPeriodCount()` | 2443 | 目前渲染出的 `.bell-row` 數量 |
| `editorTimeToMinutes(value)` | 2448 | `HH:MM` 轉分鐘，無效值回傳 `9999`（排序時排到最後） |
| `sortEditorPeriodsByTime()` | 2454 | 依開始時間重新排序 `.bell-row`，並連動搬移每天對應的 `.period-select` 下拉選單 |
| `refreshPeriodSelectOptions()` | 2487 | 從目前教師清單重建所有排課用 `<select class="period-select">` 的選項 |
| `esc(s)` | 2508 | HTML escape（`&`、`"`、`<`、`>`） |
| `openEditor()` | 2518 | 開啟編輯器：關閉其他面板、渲染所有子區塊、排序 fold、把控制項移進對應層、開啟課表 fold、儲存 baseline 快照 |
| `orderEditorFolds()` | 2548 | 把編輯器的 `<details>` fold 重新排到固定順序（存檔按鈕之前） |
| `renderCountdownEvent()` / `addCountdownEventRow(event, index)` / `refreshCountdownMoveButtons()` | 2122–2167 | 重建倒數事件編輯列表；每列附拖曳把手與順序輸入框，最多 12 筆 |
| `getEditorScrollContainer(handle)` / `autoScrollEditorWhileDragging(handle, clientY)` | 2175–2186 | 找到拖曳把手最近的可捲動祖先容器；指標接近邊緣時自動捲動 |
| `bindEditorDragReorder(row, handleSelector, siblingsSelector, onMove)` | 2660 | **通用的指標拖曳排序邏輯**：隨指標移動在 DOM 手足間搬移 `row`，過程中自動捲動並呼叫 `onMove` |
| `bindCountdownDrag(row)` | 2718 | 對倒數事件列套用上面的通用拖曳邏輯 |
| `moveEditorControlsIntoLayers()` | 2725 | 重組編輯器 DOM 成「分層」模式：把單雙週開關內嵌進課表 fold，標記匯入匯出 fold 為常駐工具 |
| `ensureEditorBackButtons()` | 2746 | 在每個 fold（除了課表／傳輸／選項）內容最上方插入「返回課表」按鈕 |
| `clearTransferField()` | 2764 | 清空並失焦傳輸文字框，清除狀態文字 |
| `openEditorFold(id, force=false)` | 2772 | 開啟指定 fold、關閉其他（傳輸 fold 除外，永遠開著） |
| `setEditorConfirmContent(...)` / `showEditorConfirmSheet()` | 2316–2355 | 填入並接線共用確認對話框的標題／訊息／差異文字／按鈕 |
| `getEditorUnsavedDiff()` | 2842 | 回傳 baseline 與目前表單狀態之間的差異描述 |
| `showEditorDiscardConfirm()` | 2853 | 顯示捨棄變更確認框（有未套用的匯入資料時訊息不同） |
| `showEditorSaveConfirm(diffText)` / `hideEditorDiscardConfirm()` | 2394–2406 | 顯示存檔確認框；清除所有排隊中的待確認動作並隱藏對話框 |
| `discardEditorChangesAndClose()` | 2908 | 關閉編輯器；若因捨棄而排隊等待開啟的面板（test/style）則接著開啟 |
| `getUnconsumedImportWarningText()` / `hasDuplicateTransferData()` / `hasUnconsumedImportData()` / `notifyDiscardedImportData()` | 2435–2471 | 判斷是否有貼上但尚未匯入的文字、AI 辨識預覽等未消費的匯入資料，並顯示對應警告 |
| `closeEditor(force)` | 2973 | 關閉編輯器：AI 辨識進行中則阻擋；dirty 或有未消費匯入資料時提示確認（除非 `force`） |
| `syncEditorToggles()` / `toggleReverse()` | 2525–2531 | 依 `applicationData.reverseWeek` 設定開關樣式；表單內切換開關（存檔時才真正生效） |

#### `editor-teachers.js`（教師／課程清單）

| 函式 | 行號 | 說明 |
| --- | --- | --- |
| `renderEditorTeachers()` | 3027 | 從 `applicationData.teacherOrder`/`teacherDB`/`locationDB` 重建 `#teacher-list` |
| `generateTeacherKey()` | 3043 | 產生隨機未使用的 `c` + 6 碼 base36 內部 id（使用者看不到） |
| `makeTeacherCard(key, subject, teacher, location)` | 3055 | 建立一張可編輯教師卡片（科目/教師/教室輸入、頭像、拖曳把手、順序輸入、指派/刪除按鈕） |
| `subjectAvatarHue(subject)` | 3089 | 科目字串雜湊到 10 個固定色相之一（`TEACHER_AVATAR_HUES`） |
| `updateTeacherCardAvatar(card)` | 3097 | 依目前科目文字設定卡片頭像的首字與 `--avatar-hue` |
| `closeAssignSheet()` / `openAssignSheet(key)` | 2613–2620 | 關閉／開啟「排這門課到哪些節次」的抽屜；開啟時建立整份日/節草稿狀態 |
| `renderAssignmentDay(day)` | 3154 | 依草稿狀態渲染某一天的節次指派網格 |
| `assignToSlot(key, day, period)` / `confirmAssignment()` | 2672–2693 | 切換／設定草稿裡的某個節次；若已被別科佔用先跳出覆蓋確認 |
| `applyAssignments()` | 3240 | 把草稿寫回真正的 `.period-select` 下拉選單（觸發 `change` 事件），關閉抽屜 |
| `assignTeacherFromMenu(button)` | 3254 | 為 `button` 所在的教師卡片開啟排課抽屜 |
| `moveEditorRowToPosition(row, value, selector)` / `refreshTeacherMoveButtons()` | 2716–2730 | 把 `row` 移到指定順序位置；更新每張卡片的順序輸入框上限/數值 |
| `addTeacherRow()` | 3286 | 新增一張帶新 key 的空白教師卡片 |
| `getTeacherDeleteKey(card)` / `getTeacherDeleteImpacts(key)` | 2744–2747 | 讀取卡片原始 key；列出目前排課中所有用到 `key` 的日/節（供刪除確認顯示） |
| `applyTeacherCardDelete(btn)` / `confirmTeacherCardDelete()` / `deleteTeacherCard(btn)` | 2758–2779 | 刪除教師卡片並清除課表中對應的排課格；若該課有被排進課表，先跳出確認 |

#### `editor-schedule.js`（排課網格、節次、特殊時段）

| 函式 | 行號 | 說明 |
| --- | --- | --- |
| `renderEditorSchedule(weeklyScheduleOverride)` | 3353 | 從（覆寫值或）`applicationData.weeklySchedule` 重建 `#schedule-grid` 的每日排課列與下拉選單 |
| `renderEditorBells()` / `makeBellRow(number, startValue, endValue)` / `refreshBellNumbers()` | 2836–2856 | 重建節次時間清單；建立單一節次列；增刪後重新編號 |
| `addBellRow()` | 3415 | 新增一節，預設接續上一節結束時間後 50 分鐘 |
| `getBellDeleteImpacts(index)` / `applyBellRowDelete(btn)` / `confirmBellRowDelete()` / `deleteBellRow(btn)` | 2883–2919 | 列出哪些天在該節有排課（供刪除確認）；刪除節次列並移除課表中對應欄位；有排課時先確認 |
| `renderEditorBreaks()` / `makeBreakRow(name, start, end)` / `addBreakRow()` / `sortEditorBreaksByTime()` / `deleteBreakRow(btn)` | 2940–2971 | 特殊時段清單的渲染、新增列、依時間排序、刪除 |
| `saveEditor()` | 3537 | 排序節次/特殊時段、驗證時間區間（衝突時顯示對話框）、正規化表單狀態、算出與 baseline 的差異、開啟存檔確認框 |
| `showEditorTimeConflict(message)` | 3554 | 顯示時間重疊錯誤的確認框，並附一個跳轉到相關 fold（節次或特殊時段）的按鈕 |

#### `dashboard-render.js`（主畫面渲染與 tick）

| 函式 | 行號 | 說明 |
| --- | --- | --- |
| `syncTestPlayPauseUi()` | 3573 | 依 `MANUALLY_TEST`/`IS_SIMULATING` 更新時間模擬面板的開始/暫停按鈕文字與樣式 |
| （accordion IIFE） | 3049 | 讓編輯器的 `<details>` fold 在非分層模式下同時只開一個，分層模式下避免原生開合閃爍 |
| （捲動輸入偵測 IIFE） | 3089 | 使用者一碰觸/滾輪操作課表清單，立刻設定 `userScrolledDuringAlign=true`（比 `scroll` 事件更早觸發） |
| `fitNowTitleText(force=false)` | 3669 | 用二分搜尋縮小「現在課程」標題字體，讓它跟 meta 標籤並排時剛好塞得下寬度；依快取鍵記憶結果，`force` 時強制重算 |
| `createMetaChip(text, cls='')` | 3737 | 建立 `<span class="meta-chip ...">` |
| `getClassColor(key)` | 3743 | 回傳目前應套用的強調色（樣式面板 dirty 時用草稿色，否則用 `applicationData.proAccent`） |
| `renderList(week, curIdx, nxtIdx, curDay, isDayFinished)` | 3751 | 重建 `viewDay` 的課表列表，標記 is-now/is-next、接上點擊/鍵盤事件開啟 `openModal`、重新觸發進場動畫，最後呼叫 `keepActiveClassVisible` |
| （resize/orientationchange/load 監聽） | 3243 | 視窗尺寸變化時重跑 `fitNowTitleText(true)` |
| `mainClockTick()` | 3836 | **`setInterval` 每秒觸發的函式**——完整流程見〈[畫面每秒都在算什麼](#畫面每秒都在算什麼tick-loop)〉 |

#### `gemini-ocr.js`（AI 圖片辨識）

| 函式／方法 | 行號 | 說明 |
| --- | --- | --- |
| `class ImagePreprocessor` → `.process(file)` | 3262 | 把選取的圖片載入 `<img>`，驗證型別／最小解析度（≥240×160），畫進同尺寸 `<canvas>` |
| `capCanvasDimension(canvas, maxDimension=1600)` | 3875 | 若畫布最長邊超過上限就等比縮小（回傳新畫布），否則原樣回傳 |
| `getStoredGeminiApiKey()` / `setStoredGeminiApiKey(key)` | 3306–3310 | 讀取／寫入（或移除）`localStorage` 裡的 Gemini 金鑰 |
| `class AIVisionProcessor` constructor | 3318 | 設定 `geminiModels = ['gemini-3.6-flash','gemini-3.7-flash','gemini-2.5-flash','gemini-3.5-flash-lite']`（依序嘗試的備援順序） |
| `.buildPrompt()` | 3326 | 回傳送給 Gemini 的完整結構化擷取提示詞（schema ＋規則） |
| `.buildGenerationConfig(model)` | 3359 | 建立 Gemini 的 `generationConfig`（JSON mime type、temperature 0.1、8192 max tokens；2.x 系列關閉思考預算，3.x 系列設為低思考等級） |
| `.recognizeSchedule(canvas, apiKey, onProgress)` | 3365 | 把畫布編碼成 base64 JPEG，依序對每個模型送出 `fetch` 請求，回報進度；網路錯誤／404／429／503／5xx 會重試，金鑰無效或不可重試的錯誤立即丟出 |
| `.parseResponse(responseData)` | 3411 | 取出模型回傳文字、去除 markdown 圍欄、抓出最外層 `{...}` JSON 物件並解析，交給 `normalizeAIOutput` |
| `.normalizeAIOutput(aiResult)` | 3429 | 把 AI 原始 JSON 轉成內部 schema：正規化時間、用產生的 `oc<N>` key 建出 `teacherDB`/`locationDB`、透過 key map 重映射 `weeklySchedule`、建立供指派預覽用的 `recognizedBlocks`、正規化 `countdownEvents` |
| `class DataValidator` → `.validate(candidate)` | 3549 | 檢查正規化後的候選資料至少有一門課或一筆倒數事件、`bellTimes` 型別／數值合法、`weeklySchedule` 型別合法 |
| `class ImportPreview` constructor / `.render(candidate, validation)` | 3567–3572 | 建立整份 OCR 匯入預覽 UI（可編輯的節次列、特殊時段列、課程卡片、日/節指派網格、倒數事件列），即時重新驗證指派下拉選單標籤，把送出鈕接到「收集編輯後資料 → 呼叫 onImport」 |
| `mountOCRImporter({input, runButton, imagePreview, status, result, onImport})` | 4439 | 接線 OCR 匯入器的選檔與「執行辨識」流程：前處理成畫布 → 縮圖 → 缺金鑰則提示輸入 → 呼叫 `AIVisionProcessor.recognizeSchedule` → 驗證 → 渲染 `ImportPreview` |
| `promptGeminiApiKey()` | 4498 | 顯示一次性的 Gemini 金鑰輸入視窗（Promise），確認後透過 `setStoredGeminiApiKey` 存檔，取消則回傳空字串 |
| `activateOCRImporter()` | 4543 | 首次需要時才延遲接線 OCR 匯入器（用 `ocrImporterPromise` 記憶避免重複初始化）；匯入時正規化編輯後資料（沒有相關訊號時保留既有特殊時段／單雙週對調／外觀樣式），呼叫 `beginEditorImport` |
| （檔案輸入的 `pointerdown`/`change` 監聽） | 3886 | 首次互動時延遲啟用 OCR 匯入器並載入選取的檔案 |

**全域常數：** `GEMINI_API_KEY_STORAGE_KEY = 'orbitAiGeminiApiKey'`。
**全域狀態：** `isOcrProcessing`（辨識進行中，會阻擋編輯器關閉）、`ocrImporterPromise`、`ocrImporterController`。

#### `bootstrap.js`（啟動流程）

只在載入時同步執行一次，緊接在上面所有函式都定義完之後：

```js
applicationData = loadData();
buildSchedule();
setStyleMode('pro');           // 包在 try/catch 裡
setInterval(mainClockTick, 1000);
syncTestPlayPauseUi();
syncTestToolbar();
update();
```

也就是：讀取存檔設定 → 算出執行中課表 → 套用視覺主題 → 啟動每秒一次的計時器 → 同步工具列狀態 → 渲染第一幀畫面。

#### `testsim-runtime.js`（時間模擬狀態機，IIFE）

這個區塊是對前面已定義好的模擬相關行為做延伸／monkey-patch，並負責讓模擬狀態能在重新整理頁面後還原。

| 函式 | 行號 | 說明 |
| --- | --- | --- |
| `fetchTextAsync(url)` | 4646 | 加上快取破壞參數的 `fetch()`，回傳回應文字，非 2xx 則丟錯 |
| `el(id)` | 4654 | `document.getElementById` 的簡寫 |
| `getAppVersionAsync()` | 4657 | 抓取頁面 HTML＋`css/styles.css`＋`js/app.js` 串接起來，清空 `#app-version` 內容後算類 FNV-1a 32-bit 雜湊，轉成 base36 大寫回傳（抓取失敗則退回對 `ORBIT_INITIAL_MARKUP` 算雜湊） |
| `syncAppVersion()` | 4676 | 把「版本 `<雜湊值>`」（或「版本 未知」）寫進 `#app-version` |
| `clampInt(value, min, max, fallback)` / `normalizeDay(day)` / `normalizeSeconds(seconds)` | 3966–3976 | 數值解析與邊界夾制的小工具 |
| `selectedDay()` | 4702 | 讀取 `#test-day-input` 的值（經 `normalizeDay`） |
| `resetRenderState()` | 4705 | 模擬日期改變時重置 `viewDay`／`autoAdvancedAfterFinishedDay`／`lastListKey`／`lastAutoScrollKey` |
| `writeDay(day)` | 4711 | 設定 `window.TEST_DAY`、更新日期選單、呼叫 `resetRenderState` |
| `persistTestState()` / `restoreTestState()` | 3996–4015 | 把模擬狀態（日期、秒數、播放中旗標、日終鎖定旗標、暫停於日終旗標、暫停時的秒數/日期）存進／讀出 `localStorage['orbitTestState']` |
| `unlockTestControls()` | 4771 | 把滑桿/時/分輸入框的範圍解鎖成完整 0–24 小時 |
| `setStartOfDayInputs()` / `setEndOfDayInputs()` / `forceStartOfDayInputs()` | 4058–4077 | 把時間輸入設為 `00:00`／`24:00`；`force` 版本會在多個動畫影格/計時器裡重複寫入，跟其他競爭寫入搶最終結果 |
| `clearSavedPausedTime()` / `clearSliderEndpointLock()` | 4085–4089 | 清除暫停時記下的秒數/日期；清除滑桿端點鎖定 |
| `getTypedTargetSeconds()` / `selectedTargetSeconds()` | 4092–4100 | 讀取時/分輸入框算出目標秒數（24 時代表日終）；依暫停狀態/滑桿端點/輸入框決定最終「目標」秒數 |
| `setSimSeconds(seconds, opts)` | 4844 | 設定（正規化後的）`window.TEST_TIME_SEC`，可選擇同步寫回輸入框/滑桿 |
| `syncTestChrome()` / `refreshTestUi()` | 4116–4122 | 同步所有模擬相關 UI 狀態；呼叫 `window.update()` 並記錄 `lastSimSecond` |
| `pauseForEditing()` | 4865 | 若處於任何模擬模式，強制切成「手動測試中但非播放中」並同步 UI（使用者開始輸入/聚焦時呼叫） |
| `setDefaultsToCurrentTime(force)` | 4872 | 用真實目前時間預填模擬的星期/時/分/滑桿輸入（與全域變數，除非已在手動測試中且未強制） |
| `mergeNextClassWithTimer()` | 4889 | 一次性 DOM 重組：把 `.next-box` 搬進 `.time-card` 內（若尚未巢狀化） |
| `patchPanelOpeners()` | 4896 | monkey-patch `window.toggleTestPanel`/`openTestPanel`，開啟面板前後預填目前時間輸入（只執行一次） |
| `syncCrossDayBeforeRender()` | 4909 | 偵測模擬時鐘播放中跨過午夜，據此把 `TEST_DAY` 往前推進 |
| `getTestAwareNow()` | 4928 | 回傳反映真實時間，或（手動測試模式下）把 `TEST_TIME_SEC` 套進今天日期的 `Date` |
| `applyDashboardState()` | 4938 | 依目前模擬/真實時間 vs. 今日課表，切換 `.dashboard` 上的狀態 class（`v3-15-day-finished`／`v3-16-outside-class-range`／`orbit-no-school-day`／`orbit-no-upcoming-class`） |
| `syncTestingBody()` | 4972 | 依測試模式旗標切換 `body.testing` class |
| `finishBoot()` | 4976 | 移除 `body` 的 `orbit-booting` class |
| `suppressListAnimationForThisFrame()` | 4979 | 短暫（跨兩個動畫影格）加上 `body.orbit-suppress-list-animation`，離開測試模式時避免清單重新播放進場動畫造成突兀感 |
| `patchUpdate()` | 4988 | monkey-patch `window.update`（只執行一次）：包一層在原本的 `update` 外面——離開測試模式時抑制清單動畫、渲染前先處理跨日、呼叫原始 `update`，之後依需要鎖定日終/日初輸入、刷新輸入框顯示、套用 dashboard 狀態 class、持久化模擬狀態、結束開機狀態 |
| `enableExitButton()` | 5025 | 啟用並完全不透明化 `#test-exit-btn` |
| `window.updateInputDisplay()` | 5032 | 把 `TEST_TIME_SEC` 寫進時/分輸入框（任一輸入框正在聚焦時跳過） |
| `window.syncTestFromSlider()` | 5049 | 處理滑桿拖曳：拖到最大端點鎖定日終（若原本正在播放則推進一天並暫停於跨日點），否則依滑桿值設定模擬時間 |
| `window.syncTestFromInputs()` | 5094 | 處理時/分輸入框變更：`h>=24` 鎖定日終，否則依輸入值設定模擬秒數 |
| `window.syncTestDayChange()` | 5114 | 處理星期選單變更：重置到當日開始秒數並刷新 |
| `startManualEndpointRun(day)` | 5124 | 從接近日終的秒數（`END_OF_DAY_SECONDS - 5秒`）開始播放，並鎖定日終狀態 |
| `window.toggleTestPlayPause(event)` | 5135 | **播放/暫停狀態機**：從暫停時記下的秒數恢復、從手動跨日暫停恢復、從日初附近或剛好日終開始播放、或一般性地開始/停止播放（暫停時記下當時秒數/日期） |
| `window.exitTestMode()` | 5194 | 完全重置所有模擬相關全域旗標、清除 `localStorage['orbitTestState']`、清空模擬狀態 UI、關閉模擬面板、呼叫 `update()` |
| `window.forceAppRefresh()` | 5216 | 先用 `fetch(url, {cache:'reload'})` 對頁面本身與 `VERSIONED_ASSETS`（`css/styles.css`、`js/app.js`）發出網路強制重新抓取的請求，確保 HTTP 快取是最新的，再用帶 `?refresh=<timestamp>` 查詢字串的 `location.replace` 重新載入頁面——避免版本雜湊沒變時瀏覽器直接吃磁碟快取的舊檔案 |
| `bindPlayButton()` / `bindExitButtons()` / `bindInputPauses()` | 4448–4471 | 綁定開始/暫停按鈕（先複製節點移除原本 inline `onclick` 再綁事件，避免重複綁定）、結束模擬按鈕、時/分/星期輸入框的聚焦暫停行為 |
| `init()` | 5275 | **模組初始化**：合併下一堂課方塊進計時卡、解鎖控制項、同步版本顯示、還原（或依目前時間預填）模擬狀態、patch 面板開關與 `update`、綁定按鈕與輸入監聽、同步 UI/dashboard 狀態、結束開機、呼叫 `window.update()` |
| （立即呼叫 `init()`） | 4512 | IIFE 結尾立即執行 |

**模組內部（閉包）狀態：** `END_OF_DAY_MINUTES`／`END_OF_DAY_SECONDS`／`START_LEAD_SECONDS`／`DAY_START_SECONDS`（常數）；`lastSimSecond`、`endOfDayArmed`、`pausedAtManualRollover`、`savedPausedSecond`、`savedPausedDay`、`sliderEndpointLock`、`lastTestingState`、`updatePatched`、`panelPatched`、`defaultsInitialized`、`TEST_STATE_STORAGE_KEY='orbitTestState'`、`VERSIONED_ASSETS=['css/styles.css','js/app.js']`。

---

### D. localStorage 鍵值

| 鍵 | 誰寫入 | 內容 |
| --- | --- | --- |
| `classFocusData` | `saveData()`（`data.js`） | 完整的 `applicationData` 設定物件（`teacherDB`、`teacherOrder`、`locationDB`、`weeklySchedule`、`bellTimes`、`breakTimes`、`countdownEvents`、`reverseWeek`、`proAccent`/`proSecondary`/`proTertiary`、`styleSlots`、`geminiApiKey`）＋內部 `__orbit:{app,schema}` 標記；由 `loadData()` 讀回 |
| `orbitAiGeminiApiKey` | `setStoredGeminiApiKey()`（`gemini-ocr.js`） | 使用者的原始 Gemini API 金鑰字串（已去除前後空白），供 OCR 請求使用；由 `getStoredGeminiApiKey()` 讀回 |
| `orbitTestState` | `persistTestState()`（`testsim-runtime.js`） | 模擬狀態快照 `{day, seconds, simulating, endOfDayArmed, pausedAtManualRollover, savedPausedSecond, savedPausedDay}`，讓手動測試模式可以撐過頁面重新整理；由 `restoreTestState()` 讀回，`exitTestMode()` 與非模擬狀態時會移除 |

（`previewImportEditorSettings()` 裡若使用者在匯入欄位貼上字面值 `"reset"`，會直接呼叫 `localStorage.clear()` 清空所有鍵值再重新整理頁面——這不是走上面任何一把具名鍵，而是整個清空。）

---

### E. 響應式斷點總覽

| 斷點 | 出現次數 | 大致影響範圍 |
| --- | --- | --- |
| `max-width:430px` | 8 處 | body 邊距、dashboard 尺寸、倒數卡片/now-stack 版面、nav-bar 邊距、課表列高度/邊距、editor-inner 圓角、assign-sheet |
| `max-width:480px` | 8 處 | nav-bar 尺寸、課表列尺寸（多處）、assign-sheet、順序輸入尺寸、編輯器手機版重排、樣式面板手機版重排 |
| `max-width:360px` | 4 處 | dashboard 高度、倒數卡片尺寸、now-teacher/place/label 邊距、time-card 合併網格 |
| `max-height:700px` | 5 處 | dashboard 高度、標題字體大小、time-card 邊距、課表列邊距、模擬面板間距 |
| `max-width:390px` | 3 處 | 確認對話框按鈕排列、樣式預設色網格 |
| `max-width:400px` | 2 處 | 模擬面板標題邊距、樣式預設色 2 欄版面 |
| `min-width:480px` | 1 處 | 詳細資訊彈窗最大寬度上限 |
| `min-width:390px` | 1 處 | 確認對話框按鈕從直排改橫排 |
| `hover:hover` | 1 處 | 課表列 hover 上浮效果（僅限支援 hover 的裝置） |
| `prefers-reduced-motion:reduce` | 1 處 | 停用課表列進場動畫 |
| `display-mode:standalone` | 1 處 | 全面關閉 `backdrop-filter`＋提高玻璃材質不透明度（iOS PWA bug 因應） |
| `@supports not (backdrop-filter:blur(1px))` | 1 處 | `.dashboard` 的實色備援背景 |

---

## 響應式與無障礙細節

手機上會換成觸控優先的版面：按鈕加大、課程卡片重排、底部彈出式選單取代側邊欄。也處理了 iOS 的安全區域（瀏海、手勢列），並且尊重系統的「減少動態效果」偏好——開了這個系統設定，畫面上的轉場動畫會相應收斂，而不是一律播放（見〈[E. 響應式斷點總覽](#e-響應式斷點總覽)〉的 `prefers-reduced-motion:reduce` 那一列）。

---

## 隱私

一般使用（建課表、看主畫面、備份匯出匯入）完全在瀏覽器本機進行，沒有任何資料離開你的裝置。唯一的例外是主動使用 AI 辨識功能時：你選的那張照片會被送到 Google 的 Gemini API 做分析，所以上傳前請自己留意照片裡有沒有不想讓外部服務看到的內容。Gemini API Key 只存在瀏覽器本機，不會被寫進原始碼，也不會跟著課表備份一起匯出；不使用 AI 功能的話，完全不需要申請或輸入任何 Key。

---

## 限制

- 資料綁在單一瀏覽器，沒有雲端同步；清掉瀏覽器的網站資料會連課表一起清掉，建議偶爾匯出備份留底。
- 沒有帳號系統，也就沒有多人協作或跨裝置即時同步。
- AI 辨識的準確度取決於照片清晰度與課表版型，不是每次都能完美讀出所有欄位，匯入前務必看過預覽再確認。
- AI 功能需要網路連線與自備的 API Key，離開這兩個條件就無法使用（但其他功能完全不受影響）。
- 沒有自動化測試，正確性主要靠時間模擬手動驗證。

---

## 目前狀態

課表顯示、每週排課、單雙週切換、鐘聲時間、特殊時段、事件倒數、外觀自訂、時間模擬、備份匯出入、AI 圖片辨識，這些功能目前都是完整可用、彼此獨立運作的——課表相關功能完全不依賴網路或 AI，AI 只是眾多輸入課表資料的方式之一。專案仍在持續做程式碼精簡（近期的改動方向包括移除死碼、合併重複的 CSS 規則、把備份格式壓得更小），之後可能會補上輕量的自動化測試，或是在不強迫使用者註冊帳號的前提下，研究看看有沒有值得做的雲端同步方式。

---

**[jaypengx-collab.github.io/Orbit](https://jaypengx-collab.github.io/Orbit/)** — 開瀏覽器就能用。
