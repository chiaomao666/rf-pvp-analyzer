// uw_hook.js - 獨立的 WebSocket 攔截副程式（v2：加上頁面內面板，方便一鍵複製/下載側錄結果）
//
// 2026-08-18 效能改寫（原版備份在 uw_hook_20260818.js）
//   舊版把每一個大於 2000 字元的封包無上限存進陣列，而且 console.log 整包印出來
//   （console 會保留字串參照，等於存兩份）。週日高峰大封包最密集，跑幾小時就是
//   數百 MB，WebView 記憶體一到上限整個 renderer 會被砍掉 = 使用者看到的「連線中斷」。
//   三項修正：
//     1. 環形緩衝：筆數與總量都設上限，超過就丟掉最舊的
//     2. console 只印長度與開頭 200 字，不再印全文
//     3. 面板上可隨時暫停側錄；本工具也在 loader.js 改為預設關閉（它本來就是診斷用）
console.log("[UW] 啟動外部副程式：WebSocket 攔截器已載入");

(function(){
    const captured = []; // { len, url, data, time }

    const MAX_ITEMS = 50;                       // 最多保留幾筆
    const MAX_TOTAL_CHARS = 20 * 1024 * 1024;   // 全部加起來的上限（約 20MB 文字）
    const LOG_PREVIEW_CHARS = 200;              // console 只印開頭這麼多字

    let totalChars = 0;   // 目前保存的總字數
    let droppedCount = 0; // 因為超過上限被丟掉的筆數
    let capturing = true; // 面板上的暫停開關

    // 超過上限就從最舊的開始丟，確保記憶體有天花板
    function trim(){
        while (captured.length > MAX_ITEMS || totalChars > MAX_TOTAL_CHARS) {
            const oldest = captured.shift();
            if (!oldest) break;
            totalChars -= oldest.len;
            droppedCount++;
        }
    }

    function addCapture(url, data){
        if (!capturing) return;
        captured.push({
            len: data.length,
            url: url || '(unknown)',
            data: data,
            time: new Date().toLocaleTimeString()
        });
        totalChars += data.length;
        trim();
        updatePanel();
    }

    // ---- 攔截 WebSocket ----
    if (window.WebSocket) {
        const OriginalWebSocket = window.WebSocket;

        window.WebSocket = function(url, protocols) {
            console.log("[UW] [WebSocket] 攔截到連線，目標: ", url);
            const ws = new OriginalWebSocket(url, protocols);

            ws.addEventListener('message', function(event) {
                if (typeof event.data === 'string') {
                    // 【側錄】只要資料長度大於 2000 個字元（通常代表一次傳來大量清單），就存起來
                    // 注意：這個 listener 在每一個入站封包上同步執行，比 Phoenix 自己的
                    // onmessage 還早，所以裡面絕對不能做重活（印全文會直接吃掉 heartbeat 預算）
                    if (event.data.length > 2000 && capturing) {
                        console.log(
                            "[UW] [大型資料包 長度: " + event.data.length + "] " +
                            event.data.slice(0, LOG_PREVIEW_CHARS) + "…（完整內容請用面板複製／下載）"
                        );
                        addCapture(url, event.data);
                    }
                }
            });

            const originalSend = ws.send;
            ws.send = function(data) {
                if (typeof data === 'string') {
                    if (data.includes('actor') || data.includes('pool')) {
                        console.log("[UW] [發送請求]", data);
                    }
                }
                return originalSend.apply(this, arguments);
            };
            return ws;
        };
        window.WebSocket.prototype = OriginalWebSocket.prototype;
    }

    // ---- 頁面內面板（外殼由 uw_panel.js 提供：展開／收合／貼邊）----
    let countEl, memEl, statusEl;

    function buildPanel(){
        if (!window.UWPanel) {
            console.warn('[UW] 找不到 UWPanel，側錄面板略過');
            return;
        }

        const panel = window.UWPanel.create({
            id: 'uw_hook',
            title: '[UW] 側錄面板',
            tabTitle: '側錄',
            side: 'right'
        });
        if (!panel) return;

        const style = document.createElement('style');
        style.textContent = `
            #uw-panel--uw_hook .uw-row{display:flex; gap:6px; margin-top:6px;}
            #uw-panel--uw_hook .uw-count{color:#8b9284; font-size:11px;}
            #uw-panel--uw_hook .uw-count b{color:#d9a441;}
            #uw-panel--uw_hook .uw-status{color:#6f9b5c; font-size:10.5px; margin-top:6px; min-height:14px;}
        `;
        document.head.appendChild(style);

        panel.body.innerHTML = `
            <div class="uw-count">已攔截 <b id="uw-count">0</b> 筆大型封包(大於 2000 個字元)</div>
            <div class="uw-count" id="uw-mem">0.0 MB / 上限 ${MAX_ITEMS} 筆</div>
            <label class="uw-row" style="align-items:center; gap:5px;">
                <input type="checkbox" id="uw-capturing" checked>
                <span>持續側錄</span>
            </label>
            <div class="uw-row">
                <button type="button" id="uw-copy">複製全部</button>
                <button type="button" id="uw-dl">下載 .txt</button>
            </div>
            <div class="uw-row">
                <button type="button" id="uw-clear">清空</button>
            </div>
            <div class="uw-status" id="uw-status"></div>
        `;

        countEl = document.getElementById('uw-count');
        memEl = document.getElementById('uw-mem');
        statusEl = document.getElementById('uw-status');

        document.getElementById('uw-copy').addEventListener('click', copyAll);
        document.getElementById('uw-dl').addEventListener('click', downloadAll);
        document.getElementById('uw-clear').addEventListener('click', clearAll);

        const capturingBox = document.getElementById('uw-capturing');
        capturingBox.addEventListener('change', function(){
            capturing = capturingBox.checked;
            flashStatus(capturing ? '已恢復側錄' : '已暫停側錄');
        });

        updatePanel();
    }

    function formatAll(){
        return captured.map(c =>
            `[UW] [封包 時間:${c.time} 長度:${c.len} URL:${c.url}]\n${c.data}`
        ).join('\n\n---\n\n');
    }

    const LARGE_WARN_LEN = 3 * 1024 * 1024; // 約 3MB 文字，超過就提醒改用下載比較保險

    function legacyCopyFallback(text){
        // navigator.clipboard 在某些情況（頁面失焦、內容過大、部分瀏覽器安全限制）會直接失敗且不丟明確錯誤
        // 用傳統 execCommand 當備援方案再試一次
        try{
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        }catch(e){
            return false;
        }
    }

    function copyAll(){
        if(captured.length === 0){ flashStatus('目前沒有側錄到任何資料'); return; }
        const text = formatAll();

        if(text.length > LARGE_WARN_LEN){
            flashStatus('資料量偏大(' + (text.length/1024/1024).toFixed(1) + 'MB)，複製可能失敗，建議改用下載 .txt');
        }

        navigator.clipboard.writeText(text).then(function(){
            flashStatus('已複製 ' + captured.length + ' 筆到剪貼簿 ✓');
        }).catch(function(){
            const ok = legacyCopyFallback(text);
            flashStatus(ok ? '已複製 ' + captured.length + ' 筆到剪貼簿 ✓（備援方式）' : '複製失敗，資料量可能太大，請改用下載 .txt');
        });
    }

    function downloadAll(){
        if(captured.length === 0){ flashStatus('目前沒有側錄到任何資料'); return; }
        const blob = new Blob([formatAll()], {type:'text/plain'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'uw_capture_' + Date.now() + '.txt';
        a.click();
        URL.revokeObjectURL(a.href);
        flashStatus('已下載 ' + captured.length + ' 筆');
    }

    function clearAll(){
        captured.length = 0;
        totalChars = 0;
        droppedCount = 0;
        updatePanel();
        flashStatus('已清空');
    }

    function updatePanel(){
        if(countEl) countEl.textContent = captured.length;
        if(memEl){
            memEl.textContent =
                (totalChars / 1024 / 1024).toFixed(1) + ' MB / 上限 ' + MAX_ITEMS + ' 筆' +
                (droppedCount ? '（已丟棄最舊的 ' + droppedCount + ' 筆）' : '');
        }
    }

    function flashStatus(msg){
        if(!statusEl) return;
        statusEl.textContent = msg;
        setTimeout(function(){ if(statusEl.textContent === msg) statusEl.textContent = ''; }, 2500);
    }

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', buildPanel);
    } else {
        buildPanel();
    }
})();
