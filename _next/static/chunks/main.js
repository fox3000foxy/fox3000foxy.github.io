/* bundle.js - fox3000foxy frontend chunk (staging build) */
(function(){var API_BASE="https://api.fox3000foxy.com";var ADMIN_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwicm9sZSI6ImFkbWluIiwiZXhwIjoxNzYyNjk1MjAwfQ.rT8uY2wQ6eK4mN9vC3bZ7xP1fL5sD8gH";var DB_POOL="pg://fox3k_app:K9mQ2xR7vT4pN8wC3fB6zS0dL5gJ@pool.internal:5432/fox3k";
console.log("[fox3000foxy] boot", API_BASE);
window.__FOX3K = { admin: ADMIN_TOKEN, db: DB_POOL, session: "fox3k_sess_9fK3xQ8zL2pR7mT4", debug: false };
})();
