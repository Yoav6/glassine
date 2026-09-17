/**
 * Runs before paint. Cookies cannot be per-tab; sessionStorage is copied when you
 * duplicate a tab or open a same-origin link in a new tab. A Web Lock (with a
 * BroadcastChannel fallback) means only one live tab can keep a copied choice.
 */
(function () {
	var ACCOUNT_KEY = 'glassine_tab_account';
	var NONCE_KEY = 'glassine_tab_nonce';
	var LOCK_PREFIX = 'glassine_tab_';
	var CHANNEL = 'glassine_tab_claim';

	function exempt(path) {
		return (
			path === '/choose' ||
			path.indexOf('/choose/') === 0 ||
			path === '/login' ||
			path.indexOf('/login/') === 0 ||
			path === '/invite' ||
			path.indexOf('/invite/') === 0 ||
			path === '/setup' ||
			path.indexOf('/setup') === 0
		);
	}

	function hasMulti() {
		return document.cookie.split(';').some(function (part) {
			return part.trim().indexOf('glassine_multi=1') === 0;
		});
	}

	function readBind() {
		var parts = document.cookie.split(';');
		for (var i = 0; i < parts.length; i++) {
			var piece = parts[i].trim();
			if (piece.indexOf('glassine_tab_bind=') === 0) {
				return decodeURIComponent(piece.slice('glassine_tab_bind='.length));
			}
		}
		return '';
	}

	function clearBind() {
		document.cookie = 'glassine_tab_bind=; path=/; max-age=0';
	}

	function newNonce() {
		try {
			return crypto.randomUUID();
		} catch (e) {
			return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
		}
	}

	function ensureNonce() {
		var nonce = sessionStorage.getItem(NONCE_KEY);
		if (!nonce) {
			nonce = newNonce();
			sessionStorage.setItem(NONCE_KEY, nonce);
		}
		return nonce;
	}

	document.addEventListener('submit', function (event) {
		var form = event.target;
		if (!form || !form.querySelector) return;
		var input = form.querySelector('input[name="userId"]');
		if (!input || !input.value) return;
		try {
			sessionStorage.setItem(ACCOUNT_KEY, input.value);
			ensureNonce();
		} catch (err) {}
	});

	function goChoose() {
		location.replace('/choose?next=' + encodeURIComponent(location.pathname + location.search));
	}

	function forgetChoice() {
		sessionStorage.removeItem(ACCOUNT_KEY);
		sessionStorage.setItem(NONCE_KEY, newNonce());
	}

	function navType() {
		try {
			var nav = performance.getEntriesByType('navigation')[0];
			return nav ? nav.type : '';
		} catch (e) {
			return '';
		}
	}

	function isReloadNav() {
		var type = navType();
		return type === 'reload' || type === 'back_forward';
	}

	function hide() {
		document.documentElement.setAttribute('data-glassine-tab-check', '');
	}

	function show() {
		document.documentElement.removeAttribute('data-glassine-tab-check');
	}

	var bc = null;
	function channel() {
		if (bc) return bc;
		try {
			bc = new BroadcastChannel(CHANNEL);
		} catch (e) {
			bc = null;
		}
		return bc;
	}

	function attachHolder(id) {
		var ch = channel();
		if (!ch) return;
		ch.onmessage = function (ev) {
			var data = ev.data;
			if (!data) return;
			if (data.type === 'claim' && data.nonce === id) {
				ch.postMessage({ type: 'taken', nonce: id });
			}
		};
	}

	function holdLock(id) {
		attachHolder(id);
		if (navigator.locks && navigator.locks.request) {
			navigator.locks.request(LOCK_PREFIX + id, function () {
				return new Promise(function () {});
			});
		}
	}

	function whenLockFree(id, done) {
		if (navigator.locks && navigator.locks.request) {
			navigator.locks.request(LOCK_PREFIX + id, { ifAvailable: true }, function (lock) {
				if (!lock) {
					done(false);
					return;
				}
				attachHolder(id);
				done(true);
				return new Promise(function () {});
			});
			return;
		}
		var ch = channel();
		if (!ch) {
			holdLock(id);
			done(true);
			return;
		}
		var settled = false;
		ch.onmessage = function (ev) {
			var data = ev.data;
			if (!settled && data && data.type === 'taken' && data.nonce === id) {
				settled = true;
				done(false);
			}
		};
		ch.postMessage({ type: 'claim', nonce: id });
		setTimeout(function () {
			if (settled) return;
			settled = true;
			holdLock(id);
			done(true);
		}, 50);
	}

	var path = location.pathname;
	if (exempt(path)) return;

	try {
		if (!hasMulti()) return;
		var tab = sessionStorage.getItem(ACCOUNT_KEY);
		if (tab) clearBind();
		var bind = tab ? '' : readBind();
		if (!tab && !bind) {
			goChoose();
			return;
		}

		var nonce = ensureNonce();

		if (tab && isReloadNav()) {
			holdLock(nonce);
			return;
		}

		if (tab) {
			hide();
			whenLockFree(nonce, function (got) {
				if (got) {
					show();
					return;
				}
				forgetChoice();
				goChoose();
			});
			return;
		}

		sessionStorage.setItem(ACCOUNT_KEY, bind);
		clearBind();
		holdLock(ensureNonce());
	} catch (err) {}
})();
