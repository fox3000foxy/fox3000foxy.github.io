(function () {
	var tries = 0;
	function fire() {
		if (window.goatcounter && window.goatcounter.count) {
			window.goatcounter.count({
				path: location.pathname,
				event: true,
				title: document.title || "page",
			});
			return;
		}
		if (++tries < 20) setTimeout(fire, 250);
	}
	if (document.readyState === "complete") fire();
	else document.addEventListener("readystatechange", function () { if (document.readyState === "complete") fire(); });
})();
