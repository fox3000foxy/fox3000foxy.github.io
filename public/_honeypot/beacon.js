// Honeypot beacon for fox3000foxy decoy pages.
// Fires a dedicated GoatCounter event (/honeypot/<route>) when a real browser
// or headless scanner renders this page, so every probe shows up in the
// dashboard separately from regular traffic.
(function () {
	var tries = 0;
	function fire() {
		if (window.goatcounter && window.goatcounter.count) {
			window.goatcounter.count({
				path: "/honeypot" + (window.__DECOY_PATH || location.pathname),
				event: true,
				title: "decoy-" + (window.__DECOY_NAME || "probe"),
			});
			return;
		}
		if (++tries < 20) setTimeout(fire, 250);
	}
	// Wait for DOM + count.js (loaded async) then fire.
	if (document.readyState === "complete") fire();
	else document.addEventListener("readystatechange", function () { if (document.readyState === "complete") fire(); });
})();
