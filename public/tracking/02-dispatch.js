/* ============================================================================
 * 02-dispatch.js  —  CAMADA 2: enriquece + carrega pixels + dispara eventos
 * ----------------------------------------------------------------------------
 * Depende de 01-capture.js (window.__trk) e de window.TRACKING_CONFIG.
 *
 * O que faz:
 *   - enriquecimento async: external_id (SHA-256 do email), geo (ipapi),
 *     dados do lead vindos do localStorage
 *   - carrega SÓ os pixels configurados (id vazio = não carrega → leve)
 *   - dispara eventos no browser com event_id compartilhado
 *   - serializa track() via promise chain (ordem garantida em SPA)
 *   - PRESET GATING: track() rejeita eventos que não pertencem ao preset
 *   - GA4 Purchase recebe transaction_id (deduplicacao nativa)
 *   - SPA-aware: re-dispara PageView em pushState/popState/hashchange
 *   - form auto-detect via data-trk-event (opt-in, sem cagada)
 *   - consent gate opcional
 *   - anti-bot (webdriver, crawlers, headless)
 *   - modo shadow (captura tudo, NÃO dispara)
 *   - DevTools commands (debug:true)
 *   - retry local 3x com backoff
 *   - cleanup completo no pagehide (timers, listeners, observers)
 *   - payload versionado (_v vem de window.TRACKING_KIT_VERSION)
 *
 * API pública:
 *   trk.pageView()                  → dispara PageView em todos os canais on
 *   trk.lead(userData, props)       → dispara Lead
 *   trk.track(name, props, ud)      → evento custom (gated pelo preset)
 *   trk.consent('granted'|'denied') → atualiza consentimento
 *   trk.allowedEvents()             → lista eventos permitidos pelo preset atual
 *   trk.pixelsReady                 → Promise que resolve após CDNs carregarem
 * ========================================================================== */

(function () {
  var C = window.TRACKING_CONFIG || {};
  var V = window.TRACKING_KIT_VERSION || '1.0.0';
  var DEBUG = !!(C.client && C.client.debug);
  var SHADOW = !!(C.client && C.client.shadow);

  function log() { if (DEBUG) console.log.apply(console, ['[trk:dispatch]'].concat([].slice.call(arguments))); }
  function warn() { if (DEBUG) console.warn.apply(console, ['[trk:dispatch]'].concat([].slice.call(arguments))); }
  function on(id) { return !!(id && String(id).trim()); }

  /* ---------------------------------------------------------------------- */
  /* Cleanup registry — qualquer listener/observer/timer registra um disposer */
  /* aqui pra ser limpo em pagehide (evita memory leak em SPA).             */
  /* ---------------------------------------------------------------------- */
  var cleanupFns = [];
  function onCleanup(fn) { if (typeof fn === 'function') cleanupFns.push(fn); }
  function runCleanup() {
    for (var i = 0; i < cleanupFns.length; i++) {
      try { cleanupFns[i](); } catch (e) {}
    }
    cleanupFns.length = 0;
  }
  window.addEventListener('pagehide', runCleanup, { once: true });

  /* ---------------------------------------------------------------------- */
  /* Anti-bot: detecta crawlers/headless/prerender                          */
  /* ---------------------------------------------------------------------- */
  function isBot() {
    var ua = (navigator.userAgent || '').toLowerCase();
    if (navigator.webdriver === true) return 'webdriver';
    var patterns = [
      'googlebot','bingbot','yandexbot','duckduckbot','baiduspider',
      'facebookexternalhit','facebot','twitterbot','linkedinbot','slackbot',
      'whatsapp','telegrambot','discordbot','applebot','pinterestbot',
      'embedly','quora link preview','outbrain','prerender','headlesschrome',
      'phantomjs','puppeteer','playwright','selenium','crawler','spider','bot/'
    ];
    for (var i = 0; i < patterns.length; i++) {
      if (ua.indexOf(patterns[i]) !== -1) return patterns[i];
    }
    return null;
  }

  var BOT = isBot();
  if (BOT) {
    // expõe pra debug mas não dispara nada
    window.trk = {
      _bot: BOT,
      pageView: function () { log('bot bloqueado:', BOT); },
      lead:     function () { log('bot bloqueado:', BOT); },
      track:    function () { log('bot bloqueado:', BOT); },
      consent:  function () {},
      version:  V
    };
    log('bot detectado:', BOT, '— eventos desligados');
    return;
  }

  /* ---------------------------------------------------------------------- */
  /* Preset gating — define quais eventos o preset permite                  */
  /* Sempre permitidos (engagement / page): PageView e família.             */
  /* Eventos de conversão dependem das flags business.hasXxx.               */
  /* type='custom' libera tudo (escape hatch — use por sua conta).          */
  /* ---------------------------------------------------------------------- */
  var ENGAGEMENT_EVENTS = [
    'PageView','Scroll','TimeOnPage','SectionView','CTAClick',
    'FormStart','FormAbandon','VideoPlay','VideoProgress'
  ];
  function buildAllowedEvents() {
    var B = C.business || {};
    var set = {};
    ENGAGEMENT_EVENTS.forEach(function (e) { set[e] = true; });
    // custom = libera geral (responsabilidade do operador)
    if (B.type === 'custom') {
      ['Lead','Contact','Schedule','ViewContent','AddToCart','InitiateCheckout',
       'Purchase','CompleteRegistration','StartTrial','Subscribe']
        .forEach(function (e) { set[e] = true; });
      return set;
    }
    if (B.hasForm)         { set.Lead = true; }
    if (B.hasWhatsApp)     { set.Contact = true; set.Lead = true; }
    if (B.hasScheduling)   { set.Schedule = true; set.Lead = true; }
    if (B.hasEcommerce)    { set.ViewContent = set.AddToCart = set.InitiateCheckout = set.Purchase = true; set.Lead = true; }
    if (B.hasRegistration) { set.CompleteRegistration = set.StartTrial = true; set.Lead = true; set.Subscribe = true; }
    if (B.hasNewsletter)   { set.Subscribe = true; set.Lead = true; }
    return set;
  }
  var ALLOWED = buildAllowedEvents();
  function isAllowed(eventName) { return !!ALLOWED[eventName]; }

  /* ---------------------------------------------------------------------- */
  /* Consent gate                                                            */
  /* ---------------------------------------------------------------------- */
  var consentCookieName = (C.consent && C.consent.cookieName) || 'trk_consent';
  function getConsent() {
    if (!(C.consent && C.consent.required)) return 'granted';
    var v = window.__trk.getCookie(consentCookieName);
    if (v === 'granted' || v === 'denied') return v;
    return (C.consent && C.consent.defaultGranted) ? 'granted' : 'pending';
  }
  function setConsent(value) {
    if (value !== 'granted' && value !== 'denied') return;
    window.__trk.setCookie(consentCookieName, value, 63072000);
    log('consent:', value);
    if (value === 'granted') {
      initPixels();
      track('PageView'); // dispara PageView que ficou esperando
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Util                                                                    */
  /* ---------------------------------------------------------------------- */
  function uuid() { return window.__trk.uuid(); }
  function loadScript(src) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.async = true; s.src = src;
      s.onload  = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Geo via ipapi (best-effort, não trava o dispatch)                      */
  /* ATENÇÃO: plano gratuito do ipapi.co é ~1k req/dia/IP. Use plano pago   */
  /* ou self-hosted (GeoLite2 + Cloudflare Worker) em produção com volume. */
  /* ---------------------------------------------------------------------- */
  var GEO = { geo_country: 'BR' };
  function fetchGeo(cb) {
    if (!(C.capture && C.capture.geo)) return cb();
    fetch('https://ipapi.co/json/')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        GEO = {
          geo_city:    d.city || '',
          geo_state:   d.region_code || d.region || '',
          geo_zip:     d.postal || '',
          geo_country: d.country_code || 'BR',
          ip_address:  d.ip || ''
        };
        cb();
      })
      .catch(function () { cb(); });
  }

  /* ---------------------------------------------------------------------- */
  /* Lead enrichment                                                         */
  /* ---------------------------------------------------------------------- */
  function leadFromStorage() {
    try {
      var key = (C.capture && C.capture.leadStorageKey) || '__wl_lead';
      var l = JSON.parse(localStorage.getItem(key)) || {};
      return {
        name:  (l.name || l.nome || '').trim(),
        email: (l.email || '').trim(),
        phone: (l.whatsapp || l.phone || l.telefone || '').replace(/\D/g, '')
      };
    } catch (e) { return {}; }
  }

  function snapshot(userData) {
    var base = window.__trk && window.__trk.get ? window.__trk.get() : {};
    var lead = leadFromStorage();
    var ud = userData || {};
    var name = (ud.name || lead.name || '');
    var parts = name.split(' ');
    var email = (ud.email || lead.email || '').trim().toLowerCase();
    var phone = (ud.phone || lead.phone || '').replace(/\D/g, '');
    return Object.assign({}, base, GEO, {
      email: email,
      phone: phone,
      first_name: parts[0] || '',
      last_name: parts.slice(1).join(' ') || '',
      external_id: '',  // preenchido async com SHA-256 do email
      client_name: (C.client && C.client.name) || ''
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Carga condicional dos pixels                                           */
  /* ---------------------------------------------------------------------- */
  // pixelsReady resolve quando TODOS os CDNs configurados terminam de carregar
  // (ou consent ainda não foi dado). track() não aguarda ele — fbq/gtag/ttq
  // têm stubs que enfileiram chamadas até a CDN resolver. Mas operadores podem
  // aguardar pra garantir que dependências externas estão prontas:
  //     window.trk.pixelsReady.then(() => trk.lead({...}))
  var pixelsInitialized = false;
  var pixelsReadyResolve;
  var pixelsReady = new Promise(function (resolve) { pixelsReadyResolve = resolve; });

  function initPixels() {
    if (pixelsInitialized) return pixelsReady;
    if (getConsent() !== 'granted') {
      log('pixels aguardando consent');
      return pixelsReady;
    }
    pixelsInitialized = true;
    var loaders = [];

    // Meta Pixel
    if (on(C.meta && C.meta.pixelId)) {
      // Stub síncrono do fbq enfileira chamadas antes do CDN responder.
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return;
        n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n;
        n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v;
        s = b.getElementsByTagName(e)[0];
        if (s && s.parentNode) s.parentNode.insertBefore(t, s);
        else (b.head || b.documentElement).appendChild(t);
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', String(C.meta.pixelId));
      log('Meta Pixel on', C.meta.pixelId);
    }

    // Google Ads + GA4 via gtag (compartilham o mesmo script)
    var hasGa4 = on(C.ga4 && C.ga4.measurementId);
    var hasGAds = on(C.googleAds && C.googleAds.conversionId);
    var gtagId = hasGa4 ? C.ga4.measurementId : (hasGAds ? C.googleAds.conversionId : '');
    if (gtagId) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { dataLayer.push(arguments); };
      gtag('js', new Date());
      loaders.push(loadScript('https://www.googletagmanager.com/gtag/js?id=' + gtagId));
      if (hasGa4) gtag('config', C.ga4.measurementId, { send_page_view: false });
      if (hasGAds) gtag('config', C.googleAds.conversionId);
      log('gtag on', gtagId);
    }

    // TikTok
    if (on(C.tiktok && C.tiktok.pixelId)) {
      !function (w, d, t) {
        w.TiktokAnalyticsObject = t;
        var ttq = w[t] = w[t] || [];
        ttq.methods = ['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];
        ttq.setAndDefer = function (e, n) { e[n] = function () { e.push([n].concat([].slice.call(arguments, 0))); }; };
        for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
        ttq.load = function (e) {
          var n = 'https://analytics.tiktok.com/i18n/pixel/events.js';
          ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = n;
          ttq._t = ttq._t || {}; ttq._t[e] = +new Date;
          var o = d.createElement('script'); o.async = !0; o.src = n + '?sdkid=' + e;
          var a = d.getElementsByTagName('script')[0];
          if (a && a.parentNode) a.parentNode.insertBefore(o, a);
          else (d.head || d.documentElement).appendChild(o);
        };
        ttq.load(String(C.tiktok.pixelId));
      }(window, document, 'ttq');
      log('TikTok on', C.tiktok.pixelId);
    }

    // Microsoft Clarity
    if (on(C.clarity && C.clarity.projectId)) {
      (function (c, l, a, r, i, t, y) {
        c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
        y = l.getElementsByTagName(r)[0];
        if (y && y.parentNode) y.parentNode.insertBefore(t, y);
        else (l.head || l.documentElement).appendChild(t);
      })(window, document, 'clarity', 'script', String(C.clarity.projectId));
      log('Clarity on', C.clarity.projectId);
    }

    // pixelsReady resolve quando todos os loadScript marcados (gtag por enquanto)
    // resolverem. Meta/TikTok/Clarity usam o padrão antigo de injetar script
    // direto pela stub, então não temos hook de load — mas as stubs já enfileiram.
    Promise.all(loaders).then(function () {
      pixelsReadyResolve(true);
      log('CDNs prontos');
    });
    return pixelsReady;
  }

  /* ---------------------------------------------------------------------- */
  /* Mapeamento de nome de evento por plataforma                            */
  /* ---------------------------------------------------------------------- */
  var EVENT_MAP = {
    PageView:             { meta: 'PageView',             ga4: 'page_view',            tiktok: 'Pageview' },
    Lead:                 { meta: 'Lead',                 ga4: 'generate_lead',        tiktok: 'SubmitForm' },
    Contact:              { meta: 'Contact',              ga4: 'contact',              tiktok: 'Contact' },
    Schedule:             { meta: 'Schedule',             ga4: 'schedule',             tiktok: 'Schedule' },
    ViewContent:          { meta: 'ViewContent',          ga4: 'view_item',            tiktok: 'ViewContent' },
    AddToCart:            { meta: 'AddToCart',            ga4: 'add_to_cart',          tiktok: 'AddToCart' },
    InitiateCheckout:     { meta: 'InitiateCheckout',     ga4: 'begin_checkout',       tiktok: 'InitiateCheckout' },
    Purchase:             { meta: 'Purchase',             ga4: 'purchase',             tiktok: 'CompletePayment' },
    CompleteRegistration: { meta: 'CompleteRegistration', ga4: 'sign_up',              tiktok: 'CompleteRegistration' },
    StartTrial:           { meta: 'StartTrial',           ga4: 'start_trial',          tiktok: 'StartTrial' },
    Subscribe:            { meta: 'Subscribe',            ga4: 'subscribe',            tiktok: 'Subscribe' },
    Scroll:               { meta: null,                   ga4: 'scroll',               tiktok: null },
    TimeOnPage:           { meta: null,                   ga4: 'time_on_page',         tiktok: null },
    SectionView:          { meta: null,                   ga4: 'section_view',         tiktok: null },
    CTAClick:             { meta: null,                   ga4: 'cta_click',            tiktok: null },
    FormStart:            { meta: null,                   ga4: 'form_start',           tiktok: null },
    FormAbandon:          { meta: null,                   ga4: 'form_abandon',         tiktok: null },
    VideoPlay:            { meta: null,                   ga4: 'video_play',           tiktok: null },
    VideoProgress:        { meta: null,                   ga4: 'video_progress',       tiktok: null }
  };

  /* ---------------------------------------------------------------------- */
  /* Disparo browser                                                         */
  /* ---------------------------------------------------------------------- */
  function fireBrowser(eventName, props, eventId, data) {
    var map = EVENT_MAP[eventName] || {};

    // Meta
    if (map.meta && on(C.meta && C.meta.pixelId) && window.fbq) {
      if (C.meta.advancedMatching !== false && (data.email || data.phone)) {
        try {
          fbq('setUserProperties', String(C.meta.pixelId), {
            em: data.email || undefined,
            ph: data.phone || undefined,
            fn: data.first_name || undefined,
            ln: data.last_name || undefined,
            external_id: data.external_id || undefined,
            ct: data.geo_city || undefined,
            st: data.geo_state || undefined,
            zp: data.geo_zip || undefined,
            country: data.geo_country || undefined
          });
        } catch (e) {}
      }
      fbq('track', map.meta, props || {}, { eventID: eventId });
      log('fbq', map.meta, eventId);
    }

    // GA4
    if (map.ga4 && on(C.ga4 && C.ga4.measurementId) && window.gtag) {
      var gaProps = Object.assign({
        // event_id em GA4 não dedupa nada — é informativo, pra correlacionar
        // com Supabase. Dedup REAL no GA4 só rola pra Purchase, via transaction_id.
        event_id: eventId,
        send_to: C.ga4.measurementId,
        page_location: data.page_url,
        page_title: data.page_title,
        page_referrer: data.referrer
      }, props || {});
      if (C.ga4.engagementTracking !== false) {
        gaProps.engagement_time_msec = props && props.engagement_time_msec ? props.engagement_time_msec : 100;
      }
      // Purchase dedup nativo via transaction_id — sempre preencher.
      if (eventName === 'Purchase' && !gaProps.transaction_id) {
        gaProps.transaction_id = (props && (props.transaction_id || props.order_id)) || eventId;
      }
      gtag('event', map.ga4, gaProps);
    }

    // Google Ads conversão (só em eventos de conversão por padrão)
    var conversionEvents = ['Lead', 'Purchase', 'CompleteRegistration', 'StartTrial', 'Subscribe', 'Contact', 'Schedule'];
    if (conversionEvents.indexOf(eventName) !== -1 &&
        on(C.googleAds && C.googleAds.conversionId) &&
        on(C.googleAds.leadLabel) && window.gtag) {
      var conv = { send_to: C.googleAds.conversionId + '/' + C.googleAds.leadLabel };
      if (props && props.value) { conv.value = props.value; conv.currency = props.currency || 'BRL'; }
      if (props && (props.transaction_id || props.order_id)) conv.transaction_id = props.transaction_id || props.order_id;
      gtag('event', 'conversion', conv);
      // Enhanced Conversions
      if (C.googleAds.enhancedConversions !== false && (data.email || data.phone)) {
        gtag('set', 'user_data', {
          email: data.email || undefined,
          phone_number: data.phone || undefined,
          address: {
            first_name: data.first_name || undefined,
            last_name: data.last_name || undefined,
            city: data.geo_city || undefined,
            region: data.geo_state || undefined,
            postal_code: data.geo_zip || undefined,
            country: data.geo_country || undefined
          }
        });
      }
    }

    // TikTok
    if (map.tiktok && on(C.tiktok && C.tiktok.pixelId) && window.ttq) {
      var ttProps = Object.assign({ event_id: eventId }, props || {});
      window.ttq.track(map.tiktok, ttProps);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Disparo servidor (POST único pro n8n)                                  */
  /* ---------------------------------------------------------------------- */
  var EVENT_QUEUE = [];
  var LAST_EVENT = null;

  function fireServer(eventName, props, eventId, data) {
    var ep = C.server && C.server.endpoint;
    if (!on(ep)) return;
    var allow = (C.server && C.server.sendOnEvents) || ['Lead', 'PageView'];
    if (allow.indexOf(eventName) === -1) return;

    var payload = Object.assign({}, data, {
      _v: V,
      event_name: eventName,
      event_id: eventId,
      event_time: Math.floor(Date.now() / 1000),
      properties: props || {}
    });

    LAST_EVENT = payload;
    EVENT_QUEUE.push({ name: eventName, id: eventId, ts: Date.now() });
    if (EVENT_QUEUE.length > 50) EVENT_QUEUE.shift();

    var maxRetry = (C.server && typeof C.server.retryOnFail === 'number') ? C.server.retryOnFail : 3;
    var attempt = 0;
    var retryTimer = null;
    onCleanup(function () { if (retryTimer) clearTimeout(retryTimer); });

    function send() {
      attempt++;
      fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).then(function (r) {
        if (r.ok) { log('server OK', eventName, eventId); return; }
        if (attempt < maxRetry) retryTimer = setTimeout(send, attempt * 1000);
        else warn('server FAIL', eventName, eventId, r.status);
      }).catch(function (e) {
        if (attempt < maxRetry) retryTimer = setTimeout(send, attempt * 1000);
        else warn('server ERR', eventName, eventId, e && e.message);
      });
    }
    send();
  }

  /* ---------------------------------------------------------------------- */
  /* track() — o coração                                                    */
  /* ----------------------------------------------------------------------
   * Serializado via promise chain: cada track() espera o anterior resolver
   * o SHA-256 antes de disparar. Garante ordem em SPA com vários track()
   * consecutivos (PageView, Lead, etc.). O eventId é gerado SYNC pra que o
   * caller possa correlacionar imediatamente.
   * -------------------------------------------------------------------- */
  var trackChain = Promise.resolve();

  function track(eventName, props, userData) {
    var eventId = uuid();

    // Preset gating: rejeita eventos que o preset não permite.
    // Isso vale também pra trk.track('Purchase') chamado direto sem helper.
    if (!isAllowed(eventName)) {
      warn('track() ignorado por preset:', eventName, '(preset:', (C.business && C.business.type) || 'desconhecido', ')');
      return null;
    }

    var data = snapshot(userData);
    var withId = data.email ? window.__trk.sha256(data.email) : Promise.resolve('');

    trackChain = trackChain.then(function () {
      return withId.then(function (hash) {
        data.external_id = hash;

        if (SHADOW) {
          log('SHADOW mode — captura mas não dispara', eventName, eventId, data);
          LAST_EVENT = Object.assign({}, data, {
            _v: V, _shadow: true, event_name: eventName, event_id: eventId, properties: props || {}
          });
          return;
        }

        fireBrowser(eventName, props, eventId, data);
        fireServer(eventName, props, eventId, data);
      }).catch(function (e) {
        warn('track erro', eventName, e && e.message);
      });
    });

    return eventId;
  }

  /* ---------------------------------------------------------------------- */
  /* SPA: re-dispara PageView em mudança de rota                            */
  /* ---------------------------------------------------------------------- */
  var lastPath = '';
  var spaTimer = null;
  var originalPushState = null;
  var originalReplaceState = null;

  function spaPageView() {
    var path = window.location.pathname + window.location.search;
    if (path !== lastPath) {
      lastPath = path;
      // pequeno atraso pra title/DOM atualizarem
      if (spaTimer) clearTimeout(spaTimer);
      spaTimer = setTimeout(function () { spaTimer = null; track('PageView'); }, 50);
    }
  }
  function attachSpaListeners() {
    lastPath = window.location.pathname + window.location.search;
    originalPushState = history.pushState;
    history.pushState = function () { var r = originalPushState.apply(this, arguments); spaPageView(); return r; };
    originalReplaceState = history.replaceState;
    history.replaceState = function () { var r = originalReplaceState.apply(this, arguments); spaPageView(); return r; };
    window.addEventListener('popstate', spaPageView);
    window.addEventListener('hashchange', spaPageView);

    onCleanup(function () {
      window.removeEventListener('popstate', spaPageView);
      window.removeEventListener('hashchange', spaPageView);
      if (spaTimer) { clearTimeout(spaTimer); spaTimer = null; }
      if (originalPushState)    history.pushState    = originalPushState;
      if (originalReplaceState) history.replaceState = originalReplaceState;
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Form auto-detect (opt-in via data-trk-event)                           */
  /* ---------------------------------------------------------------------- */
  function pickFormData(form) {
    var fields = {};
    var emailEl = form.querySelector('input[type="email"], input[name*="email" i]');
    var phoneEl = form.querySelector('input[type="tel"], input[name*="phone" i], input[name*="whats" i], input[name*="celular" i], input[name*="telefone" i]');
    var nameEl  = form.querySelector('input[name*="name" i], input[name*="nome" i]');
    if (emailEl) fields.email = emailEl.value;
    if (phoneEl) fields.phone = phoneEl.value;
    if (nameEl)  fields.name  = nameEl.value;
    return fields;
  }
  function attachFormAutoDetect() {
    function onSubmit(e) {
      var form = e.target;
      if (!form || form.tagName !== 'FORM') return;
      var eventName = form.getAttribute('data-trk-event');
      if (!eventName) return; // opt-in: sem atributo, não dispara
      var userData = pickFormData(form);
      var props = {};
      var v = form.getAttribute('data-trk-value');
      if (v) { props.value = parseFloat(v); props.currency = form.getAttribute('data-trk-currency') || 'BRL'; }
      track(eventName, props, userData);
      log('form auto', eventName, userData);
    }
    document.addEventListener('submit', onSubmit, true);
    onCleanup(function () { document.removeEventListener('submit', onSubmit, true); });
  }

  /* ---------------------------------------------------------------------- */
  /* DevTools commands (debug:true)                                          */
  /* ---------------------------------------------------------------------- */
  function exposeDevTools() {
    window.__trk.last     = function () { console.log(LAST_EVENT); return LAST_EVENT; };
    window.__trk.queue    = function () { console.table(EVENT_QUEUE); return EVENT_QUEUE; };
    window.__trk.replay   = function () { if (!LAST_EVENT) return null; return track(LAST_EVENT.event_name, LAST_EVENT.properties, { email: LAST_EVENT.email, phone: LAST_EVENT.phone }); };
    window.__trk.config   = function () { console.log(C); return C; };
    window.__trk.cookies  = function () { var all = document.cookie.split('; ').filter(function (c) { return /^(ft_|lt_|trk_|_fb|_ttp|_ga)/.test(c); }); console.log(all.join('\n')); return all; };
    window.__trk.journey  = function () { var j = window.__trk.getJourney(); console.table(j); return j; };
    window.__trk.allowed  = function () { var k = Object.keys(ALLOWED); console.table(k); return k; };
    window.__trk.test     = function () { console.log('[trk] disparando PageView de teste...'); return track('PageView', { test: true }); };
    window.__trk.shadow   = function (on) { C.client = C.client || {}; C.client.shadow = !!on; console.log('shadow=', !!on); };
  }

  /* ---------------------------------------------------------------------- */
  /* Validações no boot (alerta se config tá inconsistente)                 */
  /* ---------------------------------------------------------------------- */
  function validateConfig() {
    if (!C.client || !C.client.name) warn('client.name vazio');
    var b = C.business || {};
    if (b.hasWhatsApp && !(C.helpers && C.helpers.whatsappNumber)) warn('hasWhatsApp=true mas whatsappNumber vazio');
    if (b.type === 'ecommerce' && !b.hasEcommerce) warn('type=ecommerce mas hasEcommerce=false');
    if (b.type === 'lead-gen-whatsapp' && !b.hasWhatsApp) warn('type=lead-gen-whatsapp mas hasWhatsApp=false');
    if (b.type === 'agendamento' && !b.hasScheduling) warn('type=agendamento mas hasScheduling=false');
    if (b.type === 'saas' && !b.hasRegistration) warn('type=saas mas hasRegistration=false');
    if (C.meta && C.meta.capi && !(C.server && C.server.endpoint)) warn('meta.capi=true mas server.endpoint vazio');
    if (C.googleAds && C.googleAds.offlineConversions) {
      warn('googleAds.offlineConversions=true — confirme que completou OAuth2 do Google Ads no n8n (Branch 5)');
    }
    if (DEBUG) log('config OK | preset:', b.type, '| eventos permitidos:', Object.keys(ALLOWED).join(','));
  }

  /* ---------------------------------------------------------------------- */
  /* Boot                                                                    */
  /* ---------------------------------------------------------------------- */
  function boot() {
    validateConfig();
    initPixels(); // só carrega se consent=granted (ou consent.required=false)
    attachSpaListeners();
    if ((C.business && C.business.hasForm) !== false) attachFormAutoDetect();
    if (DEBUG) exposeDevTools();

    fetchGeo(function () {
      // API pública
      window.trk = {
        track:    track,
        pageView: function (props) { return track('PageView', props); },
        lead:     function (userData, props) { return track('Lead', props, userData); },
        consent:  setConsent,
        allowedEvents: function () { return Object.keys(ALLOWED); },
        pixelsReady: pixelsReady,
        version:  V,
        config:   C
      };

      // Dispara PageView automático se não tá esperando consent
      if (getConsent() === 'granted') track('PageView');
      else log('PageView aguardando consent');

      document.dispatchEvent(new CustomEvent('trk:ready', { detail: { version: V } }));
      log('trk pronto v' + V + (SHADOW ? ' [SHADOW]' : ''));
    });
  }

  if (window.__trk && window.__trk.ready) boot();
  else document.addEventListener('trk:capture-ready', boot, { once: true });
})();
