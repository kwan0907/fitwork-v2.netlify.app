# BZ 正式版回退點（2026-11-18）

## 原版已保存

- Netlify 原正式部署：`6ab6b8ecf22c140008bd7824`，程式 commit `db25301f1451579f6a078fb07d0a6862f2026bfc`。
- 原部署獨立連結：<https://6ab6b8ecf22c140008bd7824--dynamic-gumption-005003.netlify.app/>，上架前已驗證 HTTP 200。Netlify 舊部署連結可能受平台保留期限影響，長期回退以 Git 標籤為準。
- Git 標籤 `bz-original-netlify-20261118` 指向原 Netlify 正式版程式。
- Git 標籤 `bz-original-main-20261118` 指向上架前 Git `main` commit `904e2cf68ed4d586f8b2052f565eee73261f7550`。
- Git 分支 `backup/bz-original-main-20261118` 亦保存該 `main` 版本。

## 回退方法

如新正式版有問題，從最新 `main` 開一個回退 PR，將檔案還原到所需標籤後合併，交由 Git 連續部署重新發佈。這保留版本歷史，毋須強制推送或修改生產資料庫。

```bash
git fetch origin --tags
git switch -c rollback/bz-original origin/main
git restore --source=bz-original-netlify-20261118 --staged --worktree .
git commit -m "Restore original BZ frontend"
git push origin rollback/bz-original
```

上述標籤會還原原 Netlify 正式介面；如要回到上架前 Git `main`（較原 Netlify 部署新幾個 commit），將 `--source` 換成 `bz-original-main-20261118`。提交回退 PR 後，要核對 Netlify 及 Vercel 實際生產網址、登入、客戶數與交易數。回退前後均不清空、不重建 Supabase；部署回退不會倒轉期間新增的業務資料。
