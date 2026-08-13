/**
 * url-change-notice.js
 * 共通コンポーネント：GitHubユーザー名変更に伴うURL変更のお知らせポップアップ
 *
 * 【使い方】
 * 各サイトのトップページ（index.html）の </body> 直前に
 * 以下の1行を追加するだけで動作します。他のファイルの編集は不要です。
 *
 *   <script src="url-change-notice.js"></script>
 *
 * 【お知らせ内容を後で更新したいとき】
 * 下の NOTICE_VERSION の値を変えてください。
 * 一度閉じたユーザーにも「新しいお知らせ」として再表示されます。
 */
 (function () {
  "use strict";

  var NOTICE_VERSION = "1";
  var STORAGE_KEY = "ghn-url-notice-dismissed-v" + NOTICE_VERSION;

  // TODO: 実際のポストURLに置き換えてください
  var X_POST_URL = "https://x.com/yu_cielkun/status/2087860973000638822?s=20";

  var NOTICE_TITLE = "【重要】URL変更完了のお知らせ";
  var NOTICE_BODY =
    "当サイトおよび公開中の各種ツールのURL変更が完了しました。<br>" +
    "現在は新しいURLで公開されています。<br>ブックマークや保存済みリンクをご利用の方は、" +
    "新しいURLへ登録し直していただけますと幸いです。<br>" +
    "旧URLへアクセスした場合は、自動的に新しいURLへ転送されます。<br>" +
    '<a href="' + X_POST_URL + '" target="_blank" rel="noopener noreferrer" class="ghn-link">' +
    "<strong>新しいURLはこちらのポスト</strong></a>に掲載しています。<br>" +
    "こちらのお知らせは周知のため、約1週間掲載いたします。<br>" +
    "今後ともよろしくお願いいたします。";

  var CSS = "" +
    ".ghn-overlay{" +
    "position:fixed;top:20vh;left:50%;" +
    "width:min(92vw,420px);z-index:2147483000;" +
    "transform:translate(-50%,0);" +
    "font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Yu Gothic',sans-serif;" +
    "transition:opacity .18s ease,transform .18s ease;" +
    "}" +
    ".ghn-overlay.ghn-hidden{" +
    "opacity:0;transform:translate(-50%,-6px);pointer-events:none;" +
    "}" +
    ".ghn-box{" +
    "position:relative;background:#fff;color:#222;" +
    "border-radius:10px;border-left:5px solid #16a34a;" +
    "box-shadow:0 10px 30px rgba(0,0,0,.24);" +
    "padding:16px 34px 14px 16px;" +
    "}" +
    ".ghn-title{margin:0 0 6px;font-size:14px;font-weight:700;color:#16a34a;}" +
    ".ghn-body{margin:0;font-size:13px;line-height:1.7;}" +
    ".ghn-body strong{color:#16a34a;}" +
    ".ghn-link{color:#16a34a;text-decoration:underline;}" +
    ".ghn-link:hover,.ghn-link:focus-visible{opacity:.75;}" +
    ".ghn-close{" +
    "position:absolute;top:4px;right:6px;width:28px;height:28px;" +
    "border:none;background:transparent;color:#999;" +
    "font-size:20px;line-height:1;cursor:pointer;border-radius:50%;" +
    "}" +
    ".ghn-close:hover,.ghn-close:focus-visible{background:#f1f1f1;color:#333;}" +
    ".ghn-reopen{" +
    "position:fixed;top:0vh;right:0;z-index:2147483000;" +
    "background:#16a34a;color:#fff;border:none;" +
    "border-radius:8px 0 0 8px;padding:10px 12px;" +
    "font-size:14px;cursor:pointer;display:none;" +
    "box-shadow:-2px 2px 10px rgba(0,0,0,.2);" +
    "}" +
    ".ghn-reopen.ghn-show{display:block;}" +
    "@media (prefers-reduced-motion:reduce){.ghn-overlay{transition:none;}}" +
    "@media (max-width:420px){.ghn-box{padding:14px 30px 12px 14px;}}";

  function init() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var overlay = document.createElement("div");
    overlay.className = "ghn-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML =
      '<div class="ghn-box">' +
      '<button type="button" class="ghn-close" aria-label="お知らせを閉じる">&times;</button>' +
      '<p class="ghn-title">' + NOTICE_TITLE + "</p>" +
      '<p class="ghn-body">' + NOTICE_BODY + "</p>" +
      "</div>";

    var reopenBtn = document.createElement("button");
    reopenBtn.type = "button";
    reopenBtn.className = "ghn-reopen";
    reopenBtn.setAttribute("aria-label", "URL変更のお知らせを開く");
    reopenBtn.textContent = "URLを変更しました";

    document.body.appendChild(overlay);
    document.body.appendChild(reopenBtn);

    var dismissed = false;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      dismissed = false;
    }
    if (dismissed) {
      overlay.classList.add("ghn-hidden");
      reopenBtn.classList.add("ghn-show");
    }

    overlay.querySelector(".ghn-close").addEventListener("click", function () {
      overlay.classList.add("ghn-hidden");
      reopenBtn.classList.add("ghn-show");
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch (e) {}
    });

    reopenBtn.addEventListener("click", function () {
      overlay.classList.remove("ghn-hidden");
      reopenBtn.classList.remove("ghn-show");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
