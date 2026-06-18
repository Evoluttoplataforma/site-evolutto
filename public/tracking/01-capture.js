/* ============================================================================
 * 01-capture.js  —  CAMADA 1: captura, persistência e propagação
 * ----------------------------------------------------------------------------
 * O que faz:
 *   1) Captura UTMs + 11 click IDs + ctwa_clid da URL
 *   2) Persiste em cookies first-touch (ft_*) e last-touch (lt_*)
 *   3) Mantém localStorage trk_journey com últimos N toques (multi-touch)
 *   4) Cria trk_visitor_id (UUID v4, 2 anos) e trk_session_id (sessão)
 *   5) Fallback: infere utm_source/medium pelo referrer (orgânico)
 *   6) Coleta device fingerprint leve (screen/viewport/lang/tz/platform/...)
 *   7) Monta _fbc do fbclid; lê _fbp nativo do Pixel
 *   8) Expõe SHA-256 real via Web Crypto API (assinatura assíncrona)
 *   9) Propaga params em links (internos = tudo; externos = só UTM+fb)
 *
 * API exposta:
 *   window.__trk.get()         → snapshot completo da captura
 *   window.__trk.getCookie()
 *   window.__trk.getJourney()  → array dos últimos N toques
 *   window.__trk.getDevice()   → device fingerprint
 *   window.__trk.sha256(str)   → Promise<string> (Web Crypto)
 *   evento custom 'trk:capture-ready' no document
 * ========================================================================== */

(function () {
  var CFG = (window.TRACKING_CONFIG && window.TRACKING_CONFIG.capture) || {};
  var DEBUG = !!(window.TRACKING_CONFIG && window.TRACKING_CONFIG.client && window.TRACKING_CONFIG.client.debug);
  function log() { if (DEBUG) console.log.apply(console, ['[trk:capture]'].concat([].slice.call(arguments))); }
  function warn() { if (DEBUG) console.warn.apply(console, ['[trk:capture]'].concat([].slice.call(arguments))); }

  /* ---------------------------------------------------------------------- */
  /* Domínio raiz (trata .com.br, .co.uk, .com.au, etc.)                     */
  /* ---------------------------------------------------------------------- */
  function detectRootDomain() {
    var host = window.location.hostname;
    if (host === 'localhost' || /^[\d.]+$/.test(host)) return '';
    var parts = host.split('.');
    if (parts.length <= 2) return '.' + host;
    var twoLevelTlds = ['com.br','co.uk','com.au','co.jp','co.kr','com.mx','com.ar','co.nz','co.za','com.sg','com.pt','net.br','org.br','gov.br','edu.br'];
    var tail2 = parts.slice(-2).join('.');
    if (twoLevelTlds.indexOf(tail2) !== -1 && parts.length >= 3) {
      return '.' + parts.slice(-3).join('.');
    }
    return '.' + parts.slice(-2).join('.');
  }

  var COOKIE_DOMAIN = detectRootDomain();
  var MAX_AGE = 63072000; // 2 anos

  /* ---------------------------------------------------------------------- */
  /* Cleanup registry — limpa observers/listeners no pagehide (evita leak)  */
  /* ---------------------------------------------------------------------- */
  var cleanupFns = [];
  function onCleanup(fn) { if (typeof fn === 'function') cleanupFns.push(fn); }
  window.addEventListener('pagehide', function () {
    for (var i = 0; i < cleanupFns.length; i++) {
      try { cleanupFns[i](); } catch (e) {}
    }
    cleanupFns.length = 0;
  }, { once: true });

  /* ---------------------------------------------------------------------- */
  /* Parâmetros que o kit conhece                                           */
  /* ---------------------------------------------------------------------- */
  var UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'];

  var CLICK_PARAMS = [
    'gclid', 'gbraid', 'wbraid',         // Google Ads (incl. iOS 14.5+)
    'gad_campaignid', 'gad_source',      // Google Ads (extras)
    'fbclid',                            // Meta
    'ctwa_clid',                         // Click to WhatsApp Ads (Meta)
    'ttclid',                            // TikTok
    'msclkid',                           // Microsoft Ads
    'li_fat_id',                         // LinkedIn
    'twclid',                            // X / Twitter
    'sck',                               // Kwai
  ];

  var FB_PARAMS = ['fbp', 'fbc'];

  var ALL_URL_PARAMS = UTM_PARAMS.concat(CLICK_PARAMS, FB_PARAMS);
  var SAFE_TO_PROPAGATE = UTM_PARAMS.concat(FB_PARAMS); // pra links EXTERNOS
  var FB_REGEX = /^fb\.[0-2]\.\d+\..+$/;

  var PROPAGATION_BLOCKLIST = [
    'facebook.com','instagram.com','twitter.com','x.com','linkedin.com','tiktok.com',
    'youtube.com','pinterest.com','whatsapp.com','wa.me','t.me','telegram.org','reddit.com',
    'google.com','bing.com','yahoo.com','duckduckgo.com','yandex.com','baidu.com',
    'wikipedia.org','chatgpt.com','chat.openai.com','claude.ai','gemini.google.com',
    'bard.google.com','poe.com','character.ai','github.com','stackoverflow.com',
    'kwai.com','snapchat.com'
  ];

  var REFERRER_MAPPINGS = {
    'google.com':       { utm_source: 'google',     utm_medium: 'organic' },
    'bing.com':         { utm_source: 'bing',       utm_medium: 'organic' },
    'yahoo.com':        { utm_source: 'yahoo',      utm_medium: 'organic' },
    'duckduckgo.com':   { utm_source: 'duckduckgo', utm_medium: 'organic' },
    'yandex.com':       { utm_source: 'yandex',     utm_medium: 'organic' },
    'baidu.com':        { utm_source: 'baidu',      utm_medium: 'organic' },
    'instagram.com':    { utm_source: 'instagram',  utm_medium: 'social' },
    'youtube.com':      { utm_source: 'youtube',    utm_medium: 'social' },
    'facebook.com':     { utm_source: 'facebook',   utm_medium: 'social' },
    'twitter.com':      { utm_source: 'twitter',    utm_medium: 'social' },
    'x.com':            { utm_source: 'twitter',    utm_medium: 'social' },
    'linkedin.com':     { utm_source: 'linkedin',   utm_medium: 'social' },
    'tiktok.com':       { utm_source: 'tiktok',     utm_medium: 'social' },
    'pinterest.com':    { utm_source: 'pinterest',  utm_medium: 'social' },
    'whatsapp.com':     { utm_source: 'whatsapp',   utm_medium: 'messaging' },
    'wa.me':            { utm_source: 'whatsapp',   utm_medium: 'messaging' },
    't.me':             { utm_source: 'telegram',   utm_medium: 'messaging' },
    'telegram.org':     { utm_source: 'telegram',   utm_medium: 'messaging' },
    'reddit.com':       { utm_source: 'reddit',     utm_medium: 'social' },
    'gemini.google.com':{ utm_source: 'gemini',     utm_medium: 'ai' },
    'chat.openai.com':  { utm_source: 'chatgpt',    utm_medium: 'ai' },
    'chatgpt.com':      { utm_source: 'chatgpt',    utm_medium: 'ai' },
    'claude.ai':        { utm_source: 'claude',     utm_medium: 'ai' },
    'poe.com':          { utm_source: 'poe',        utm_medium: 'ai' },
    'wikipedia.org':    { utm_source: 'wikipedia',  utm_medium: 'referral' },
    'github.com':       { utm_source: 'github',     utm_medium: 'referral' }
  };

  /* ---------------------------------------------------------------------- */
  /* Helpers cookie/URL                                                     */
  /* ---------------------------------------------------------------------- */
  function setCookie(name, value, maxAge) {
    var d = COOKIE_DOMAIN ? '; domain=' + COOKIE_DOMAIN : '';
    var age = (typeof maxAge === 'number') ? maxAge : MAX_AGE;
    document.cookie = name + '=' + encodeURIComponent(value) +
                      '; max-age=' + age +
                      '; path=/' + d +
                      '; SameSite=Lax; Secure';
  }
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function getParam(name, urlStr) {
    try { return new URL(urlStr || window.location.href).searchParams.get(name); }
    catch (e) { return null; }
  }
  function isValidFb(v) { return typeof v === 'string' && FB_REGEX.test(v); }

  function uuidV4() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* visitor_id + session_id                                                */
  /* ---------------------------------------------------------------------- */
  function ensureVisitorId() {
    var vid = getCookie('trk_visitor_id');
    if (!vid) {
      vid = uuidV4();
      setCookie('trk_visitor_id', vid, MAX_AGE);
      log('novo visitor_id', vid);
    }
    return vid;
  }
  function ensureSessionId() {
    try {
      var k = 'trk_session_id';
      var s = sessionStorage.getItem(k);
      if (!s) {
        s = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
        sessionStorage.setItem(k, s);
      }
      return s;
    } catch (e) { return ''; }
  }

  /* ---------------------------------------------------------------------- */
  /* SHA-256 real (Web Crypto API) — promise                                */
  /* ---------------------------------------------------------------------- */
  function sha256(str) {
    if (!str) return Promise.resolve('');
    var s = String(str).trim().toLowerCase();
    if (!(window.crypto && window.crypto.subtle)) return Promise.resolve('');
    var buf = new TextEncoder().encode(s);
    return window.crypto.subtle.digest('SHA-256', buf).then(function (hash) {
      var bytes = new Uint8Array(hash);
      var hex = '';
      for (var i = 0; i < bytes.length; i++) {
        var h = bytes[i].toString(16);
        hex += h.length === 1 ? '0' + h : h;
      }
      return hex;
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Device fingerprint leve                                                */
  /* ---------------------------------------------------------------------- */
  function detectDevice() {
    if (CFG.deviceFingerprint === false) return {};
    var ua = navigator.userAgent || '';
    var isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
    var isTablet = /iPad|Android(?!.*Mobile)/i.test(ua);
    var deviceType = isTablet ? 'tablet' : (isMobile ? 'mobile' : 'desktop');
    var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    var lang = (navigator.language || navigator.userLanguage || '').toLowerCase();
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
    return {
      device_type: deviceType,
      platform: platform,
      language: lang,
      timezone: tz,
      screen_w: screen.width || 0,
      screen_h: screen.height || 0,
      viewport_w: window.innerWidth || 0,
      viewport_h: window.innerHeight || 0,
      color_depth: screen.colorDepth || 0,
      pixel_ratio: window.devicePixelRatio || 1,
      connection_type: conn.effectiveType || '',
      cookies_enabled: !!navigator.cookieEnabled,
      do_not_track: navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes'
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Referrer helpers                                                       */
  /* ---------------------------------------------------------------------- */
  function isInternalReferrer(referrer) {
    if (!referrer) return false;
    try {
      var r = new URL(referrer);
      var cur = window.location.hostname.replace(/^www\./, '');
      var ref = r.hostname.replace(/^www\./, '');
      return ref === cur || ref.endsWith('.' + cur) || cur.endsWith('.' + ref);
    } catch (e) { return false; }
  }
  function inferUtmFromReferrer(referrer) {
    if (!referrer) return null;
    try {
      var host = new URL(referrer).hostname.replace(/^www\./, '');
      for (var domain in REFERRER_MAPPINGS) {
        if (host === domain || host.endsWith('.' + domain)) return REFERRER_MAPPINGS[domain];
      }
    } catch (e) {}
    return null;
  }

  /* ---------------------------------------------------------------------- */
  /* Persistência — FT (first-touch, trava) + LT (last-touch, sobrescreve)  */
  /* ---------------------------------------------------------------------- */
  function persistFtLt(name, value) {
    if (value === null || value === undefined || value === '') return;
    // last-touch SEMPRE sobrescreve
    setCookie('lt_' + name, value);
    // first-touch só seta uma vez
    if (CFG.firstTouch !== false) {
      if (!getCookie('ft_' + name)) {
        setCookie('ft_' + name, value);
        log('FT salvo', name, value);
      } else {
        log('FT travado', name);
      }
    } else {
      setCookie('ft_' + name, value);
    }
  }

  function processCookies() {
    // 1) Click IDs vindos da URL
    CLICK_PARAMS.forEach(function (p) {
      var v = getParam(p);
      if (v) persistFtLt(p, v);
    });

    // 2) UTMs vindos da URL
    var urlHasUtm = UTM_PARAMS.some(function (p) { return !!getParam(p); });
    if (urlHasUtm) {
      UTM_PARAMS.forEach(function (p) {
        var v = getParam(p);
        if (v !== null) persistFtLt(p, v);
      });
    } else if (CFG.referrerMapping !== false) {
      // 3) Fallback: inferir do referrer
      var ref = document.referrer;
      if (ref && !isInternalReferrer(ref)) {
        var map = inferUtmFromReferrer(ref);
        if (map) {
          Object.keys(map).forEach(function (p) { persistFtLt(p, map[p]); });
          log('UTM via referrer', map);
        }
      }
    }

    // 4) Se ainda não tem source/medium, marca como direct
    if (!getCookie('ft_utm_source')) persistFtLt('utm_source', 'direct');
    if (!getCookie('ft_utm_medium')) persistFtLt('utm_medium', 'none');

    // 5) _fbc a partir do fbclid (formato fb.1.timestamp.fbclid) se não existir
    var fbclid = getParam('fbclid');
    if (fbclid && !getCookie('_fbc')) {
      var fbcVal = 'fb.1.' + Date.now() + '.' + fbclid;
      setCookie('_fbc', fbcVal);
    }

    // 6) Metadados de sessão (úteis pro servidor)
    if (!getCookie('trk_first_visit')) setCookie('trk_first_visit', new Date().toISOString());
    if (!getCookie('trk_landing_page')) setCookie('trk_landing_page', window.location.href);
    var ref2 = document.referrer || '';
    if (!getCookie('trk_origin_page') && ref2 && !isInternalReferrer(ref2)) {
      setCookie('trk_origin_page', ref2);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* trk_journey — últimos N toques no localStorage                         */
  /* ---------------------------------------------------------------------- */
  function readJourney() {
    try {
      var raw = localStorage.getItem('trk_journey');
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function writeJourney(arr) {
    try { localStorage.setItem('trk_journey', JSON.stringify(arr)); } catch (e) {}
  }
  function appendJourneyTouch() {
    var maxTouches = (typeof CFG.journeyMaxTouches === 'number') ? CFG.journeyMaxTouches : 20;
    var arr = readJourney();
    var prev = arr.length ? arr[arr.length - 1] : null;
    var touch = {
      ts: new Date().toISOString(),
      utm_source: getCookie('lt_utm_source') || '',
      utm_medium: getCookie('lt_utm_medium') || '',
      utm_campaign: getCookie('lt_utm_campaign') || '',
      utm_content: getCookie('lt_utm_content') || '',
      utm_term: getCookie('lt_utm_term') || '',
      page: window.location.pathname + window.location.search,
      referrer: document.referrer || '',
      gclid: getParam('gclid') || '',
      fbclid: getParam('fbclid') || '',
      ttclid: getParam('ttclid') || ''
    };
    // só adiciona se mudou source/medium/campaign ou referrer (não polui com pageviews iguais)
    var diff = !prev ||
               prev.utm_source !== touch.utm_source ||
               prev.utm_medium !== touch.utm_medium ||
               prev.utm_campaign !== touch.utm_campaign ||
               prev.referrer !== touch.referrer;
    if (diff) {
      arr.push(touch);
      if (arr.length > maxTouches) arr = arr.slice(arr.length - maxTouches);
      writeJourney(arr);
      log('journey +1 toque (total ' + arr.length + ')');
    }
    return arr;
  }

  /* ---------------------------------------------------------------------- */
  /* Snapshot completo de dados capturados                                  */
  /* ---------------------------------------------------------------------- */
  function getTrackingData() {
    var data = {};

    // FT / LT separados
    UTM_PARAMS.forEach(function (p) {
      data['ft_' + p] = getCookie('ft_' + p);
      data['lt_' + p] = getCookie('lt_' + p);
    });
    CLICK_PARAMS.forEach(function (p) {
      data['ft_' + p] = getCookie('ft_' + p);
      data['lt_' + p] = getCookie('lt_' + p);
      // shortcut: o valor "atual" preferido é o LT (ou FT se LT vazio)
      data[p] = getCookie('lt_' + p) || getCookie('ft_' + p) || '';
    });
    UTM_PARAMS.forEach(function (p) {
      data[p] = getCookie('lt_' + p) || getCookie('ft_' + p) || '';
    });

    // Meta cookies
    var fbpUrl = getParam('fbp');
    data.fbp = isValidFb(fbpUrl) ? fbpUrl : (getCookie('_fbp') || '');

    var fbcUrl = getParam('fbc'), fbcMeta = getCookie('_fbc'), fbclid = getParam('fbclid');
    if (isValidFb(fbcUrl)) data.fbc = fbcUrl;
    else if (isValidFb(fbcMeta)) data.fbc = fbcMeta;
    else if (fbclid) data.fbc = 'fb.1.' + Date.now() + '.' + fbclid;
    else data.fbc = '';

    // TikTok ttp
    data.ttp = getCookie('_ttp') || '';

    // GA client_id (vem do _ga cookie quando GA4 carregar)
    data.ga_client_id = (function () {
      var ga = getCookie('_ga');
      // _ga formato: "GA1.1.123456789.1234567890" → pega últimas duas partes
      if (ga) {
        var parts = ga.split('.');
        if (parts.length >= 4) return parts.slice(-2).join('.');
      }
      return '';
    })();

    // Identidade do visitante / sessão
    data.visitor_id = ensureVisitorId();
    data.session_id = ensureSessionId();

    // Página atual
    data.page_url = window.location.href;
    data.page_path = window.location.pathname;
    data.page_hostname = window.location.hostname;
    data.page_title = document.title || '';
    data.referrer = document.referrer || '';
    data.user_agent = navigator.userAgent;

    // Metadados de sessão persistidos
    data.landing_page = getCookie('trk_landing_page') || '';
    data.origin_page = getCookie('trk_origin_page') || '';
    data.first_visit = getCookie('trk_first_visit') || '';

    // Device fingerprint
    var device = detectDevice();
    Object.keys(device).forEach(function (k) { data[k] = device[k]; });

    // Jornada (referência ao array atual)
    data.journey = readJourney();

    return data;
  }

  /* ---------------------------------------------------------------------- */
  /* Propagação em links                                                    */
  /* ---------------------------------------------------------------------- */
  function isInternalDestination(href) {
    try {
      var u = new URL(href, window.location.href);
      var root = COOKIE_DOMAIN.replace(/^\./, '');
      return u.hostname === window.location.hostname ||
             (root && (u.hostname === root || u.hostname.endsWith('.' + root)));
    } catch (e) { return false; }
  }
  function shouldPropagateTo(href) {
    try {
      var u = new URL(href, window.location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      for (var i = 0; i < PROPAGATION_BLOCKLIST.length; i++) {
        var b = PROPAGATION_BLOCKLIST[i];
        if (u.hostname === b || u.hostname.endsWith('.' + b)) return false;
      }
      return true;
    } catch (e) { return false; }
  }
  function paramsForDest(href) {
    return isInternalDestination(href) ? ALL_URL_PARAMS : SAFE_TO_PROPAGATE;
  }
  // Se `roots` for um array de Elements, só varre âncoras dentro desses subtrees
  // (otimização pra MutationObserver — antes re-escaneava o DOM todo a cada
  // mutação, virava CPU bomb em SPA grande). Sem `roots`, varre o documento
  // inteiro (usado no boot inicial).
  function collectAnchors(roots) {
    if (!roots || !roots.length) return document.querySelectorAll('a[href]');
    var out = [];
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      if (!root || root.nodeType !== 1) continue;
      if (root.tagName === 'A' && root.hasAttribute && root.hasAttribute('href')) out.push(root);
      if (root.querySelectorAll) {
        var inside = root.querySelectorAll('a[href]');
        for (var j = 0; j < inside.length; j++) out.push(inside[j]);
      }
    }
    return out;
  }
  function propagateToLinks(data, roots) {
    var anchors = collectAnchors(roots);
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i], href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' ||
          href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) continue;
      if (!shouldPropagateTo(href)) continue;
      try {
        var u = new URL(href, window.location.href), changed = false;
        paramsForDest(href).forEach(function (p) {
          if (data[p] && !u.searchParams.has(p)) {
            u.searchParams.set(p, data[p]);
            changed = true;
          }
        });
        if (changed) a.setAttribute('href', u.toString());
      } catch (e) {}
    }
  }
  function attachClickInterceptor() {
    function handler(e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' ||
          href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return;
      if (!shouldPropagateTo(href)) return;
      try {
        var data = getTrackingData(), u = new URL(href, window.location.href);
        paramsForDest(href).forEach(function (p) {
          if (data[p]) u.searchParams.set(p, data[p]);
        });
        a.setAttribute('href', u.toString());
      } catch (e) {}
    }
    document.addEventListener('click', handler, true);
    onCleanup(function () { document.removeEventListener('click', handler, true); });
  }

  /* ---------------------------------------------------------------------- */
  /* Init                                                                    */
  /* ---------------------------------------------------------------------- */
  function init() {
    processCookies();
    appendJourneyTouch();
    var data = getTrackingData();
    propagateToLinks(data);
    attachClickInterceptor();

    if (typeof MutationObserver !== 'undefined') {
      var t = null;
      var pendingRoots = [];
      var obs = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n && n.nodeType === 1) pendingRoots.push(n);
          }
        }
        if (!pendingRoots.length) return;
        if (t) clearTimeout(t);
        t = setTimeout(function () {
          t = null;
          var roots = pendingRoots.slice();
          pendingRoots.length = 0;
          propagateToLinks(getTrackingData(), roots);
        }, 150);
      });
      obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
      onCleanup(function () {
        obs.disconnect();
        if (t) { clearTimeout(t); t = null; }
        pendingRoots.length = 0;
      });
    }

    // expõe pra camada 2
    window.__trk = window.__trk || {};
    window.__trk.get = getTrackingData;
    window.__trk.getCookie = getCookie;
    window.__trk.setCookie = setCookie;
    window.__trk.getJourney = readJourney;
    window.__trk.getDevice = detectDevice;
    window.__trk.sha256 = sha256;
    window.__trk.uuid = uuidV4;
    window.__trk.cookieDomain = COOKIE_DOMAIN;
    window.__trk.ready = true;

    document.dispatchEvent(new CustomEvent('trk:capture-ready', { detail: data }));
    log('pronto | domínio', COOKIE_DOMAIN, '| visitor', data.visitor_id);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
