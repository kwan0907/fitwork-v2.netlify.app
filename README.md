# FITWORK PRO

FITWORK PRO 是 Fitwork 的店務管理 Web App，使用 Vue 3 + Vite 建立，並以 Supabase 處理登入及資料。

## 主要模組

- 總覽 Dashboard
- 宣傳及獎賞
- 客戶管理
- 運動／課堂記錄
- 零售及庫存
- 記帳
- 設定及資料同步

## 技術

- Vue 3
- Vite
- Pinia
- Supabase
- Chart.js / vue-chartjs

## 本機開發（VS Code / Mac）

開始修改前，先同步 GitHub 最新版本：

```bash
git pull --ff-only
npm install
npm run dev
```

完成修改並測試後：

```bash
git add .
git commit -m "描述今次修改"
git push
```

如果 `git pull --ff-only` 出現 conflict、divergent branches 或其他 error，先停止修改並處理同步問題，避免覆蓋 GitHub 上較新的版本。

## Build

```bash
npm run build
```

正式版本以 GitHub `main` branch 為主要版本來源。大型修改建議先在獨立 branch 完成及檢查，再合併到 `main`。

## 重要檔案

- `src/App.vue` — App shell、登入及主要導覽
- `src/stores/mainStore.js` — 主要狀態及資料同步
- `src/supabase.js` — Supabase client
- `src/views/` — 各主要功能頁面
- `public/manifest.json` — PWA / 加入主畫面設定
- `.github/workflows/keep-alive.yml` — Supabase keep-alive workflow
