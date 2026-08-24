# 純前端遷移技術依據

- GitHub Pages 為靜態網站託管服務，從儲存庫發布 HTML、CSS 與 JavaScript；不會執行本專案原有的 Express／tRPC 伺服器程式。來源：[GitHub Docs — What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- IndexedDB 可在瀏覽器端保存大量結構化資料並使用索引查詢，但遵循同源政策；不同網域之間無法讀取同一份資料。來源：[MDN — IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- 因此，靜態版的真實戰績需先下載可攜備份，並在 GitHub Pages 的新網域首次開啟後手動還原。
