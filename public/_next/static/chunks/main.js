/* bundle.js - fox3000foxy frontend chunk (staging build) */
(function(){var API_BASE="https://api.fox3000foxy.com";var ADMIN_TOKEN="adm-tok-abc123xyz";var DB_POOL="pg://pool:fakepass@internal:5432";
console.log("[fox3000foxy] boot", API_BASE);
window.__FOX3K = { admin: ADMIN_TOKEN, db: DB_POOL, debug: true };
})();
