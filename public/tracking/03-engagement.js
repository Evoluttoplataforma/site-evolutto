/* ============================================================================
 * 03-engagement.js  —  CAMADA 3: engajamento e interação
 * ----------------------------------------------------------------------------
 * Depende de window.trk (02-dispatch.js).
 *
 * O que faz (cada bloco pode ser ligado/desligado em TRACKING_CONFIG.engagement):
 *   - Scroll depth: 25/50/75/90  → evento "Scroll" com {percent}
 *   - Heartbeat tempo na página (default 30s) → "TimeOnPage" com {seconds}
 *   - Seções visíveis via IntersectionObserver:
 *       <... data-trk-section="hero">  → "SectionView" com {section, time_visible_ms}
 *   - CTA clicks:
 *       <... data-trk-cta="cta-comprar"> → "CTAClick" com {cta, href}
 *   - Form analytics:
 *       FormStart   (primeiro foco em campo)
 *       FormAbandon (sair sem submit, com info do último campo focado)
 *   - Video tracking (<video>):
 *       VideoPlay, VideoProgress {percent: 25|50|75|100}
 * ========================================================================== */

(function () {
  function start() {
    var C = window.TRACKING_CONFIG || {};
    var E = C.engagement || {};
    var DEBUG = !!(C.client && C.client.debug);
    function log() { if (DEBUG) console.log.apply(console, ['[trk:engage]'].concat([].slice.call(arguments))); }
    if (!window.trk || !window.trk.track) { log('trk não pronto, abortando'); return; }
    var track = window.trk.track;

    /* ------------------------------------------------------------------ */
    /* Cleanup registry — limpa todos os observers/listeners/timers       */
    /* no pagehide (evita memory leak em SPA com navegação intensa).      */
    /* ------------------------------------------------------------------ */
    var cleanupFns = [];
    function onCleanup(fn) { if (typeof fn === 'function') cleanupFns.push(fn); }
    window.addEventListener('pagehide', function () {
      for (var i = 0; i < cleanupFns.length; i++) {
        try { cleanupFns[i](); } catch (e) {}
      }
      cleanupFns.length = 0;
    }, { once: true });

    /* ------------------------------------------------------------------ */
    /* SCROLL DEPTH                                                       */
    /* ------------------------------------------------------------------ */
    if (E.scroll !== false) {
      var scrollFired = {};
      var thresholds = [25, 50, 75, 90];
      function getScrollPercent() {
        var h = document.documentElement;
        var b = document.body;
        var st = (h && h.scrollTop) || (b && b.scrollTop) || 0;
        var sh = Math.max(h.scrollHeight, b.scrollHeight);
        var ch = Math.max(h.clientHeight, window.innerHeight || 0);
        var max = sh - ch;
        if (max <= 0) return 0;
        return Math.min(100, Math.round((st / max) * 100));
      }
      var scrollTimer;
      function onScroll() {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function () {
          var p = getScrollPercent();
          for (var i = 0; i < thresholds.length; i++) {
            var t = thresholds[i];
            if (p >= t && !scrollFired[t]) {
              scrollFired[t] = true;
              track('Scroll', { percent: t });
              log('scroll', t + '%');
            }
          }
        }, 200);
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onCleanup(function () {
        window.removeEventListener('scroll', onScroll);
        if (scrollTimer) clearTimeout(scrollTimer);
      });
    }

    /* ------------------------------------------------------------------ */
    /* HEARTBEAT (TimeOnPage)                                             */
    /* ------------------------------------------------------------------ */
    var beat = parseInt(E.heartbeat, 10);
    if (!isNaN(beat) && beat > 0) {
      var elapsed = 0;
      var isActive = true;
      var lastTick = Date.now();
      function onVis()   { isActive = document.visibilityState === 'visible'; lastTick = Date.now(); }
      function onBlur()  { isActive = false; }
      function onFocus() { isActive = true; lastTick = Date.now(); }
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('blur',  onBlur);
      window.addEventListener('focus', onFocus);
      var heartbeatInterval = setInterval(function () {
        if (!isActive) return;
        var now = Date.now();
        var delta = Math.round((now - lastTick) / 1000);
        lastTick = now;
        if (delta < beat * 2) elapsed += delta; // evita pular grandes saltos (sleep do laptop)
        if (elapsed >= beat && elapsed % beat < 2) {
          track('TimeOnPage', { seconds: elapsed, engagement_time_msec: elapsed * 1000 });
          log('heartbeat', elapsed + 's');
        }
      }, beat * 1000);
      onCleanup(function () {
        clearInterval(heartbeatInterval);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('blur',  onBlur);
        window.removeEventListener('focus', onFocus);
      });
    }

    /* ------------------------------------------------------------------ */
    /* SEÇÕES (IntersectionObserver + tempo visível)                       */
    /* ------------------------------------------------------------------ */
    if (E.sections !== false && typeof IntersectionObserver !== 'undefined') {
      var visibleMs = parseInt(E.sectionVisibleMs, 10) || 2000;
      var fired = {};
      var enterTimes = {};
      function sectionKey(el) { return el.getAttribute('data-trk-section'); }

      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var key = sectionKey(entry.target);
          if (!key) return;
          if (entry.isIntersecting) {
            enterTimes[key] = Date.now();
            setTimeout(function () {
              if (fired[key]) return;
              if (enterTimes[key] && Date.now() - enterTimes[key] >= visibleMs) {
                fired[key] = true;
                track('SectionView', { section: key, time_visible_ms: visibleMs });
                log('section', key);
              }
            }, visibleMs + 50);
          } else {
            delete enterTimes[key];
          }
        });
      }, { threshold: 0.5 });

      function attachSections() {
        var els = document.querySelectorAll('[data-trk-section]');
        els.forEach(function (el) { obs.observe(el); });
      }
      attachSections();
      // novas seções injetadas dinamicamente
      var sectionMo = null;
      if (typeof MutationObserver !== 'undefined') {
        sectionMo = new MutationObserver(attachSections);
        sectionMo.observe(document.body || document.documentElement, { childList: true, subtree: true });
      }
      onCleanup(function () {
        try { obs.disconnect(); } catch (e) {}
        if (sectionMo) { try { sectionMo.disconnect(); } catch (e) {} }
      });
    }

    /* ------------------------------------------------------------------ */
    /* CTA CLICKS                                                          */
    /* ------------------------------------------------------------------ */
    if (E.ctaTracking !== false) {
      function onCtaClick(e) {
        var el = e.target && e.target.closest ? e.target.closest('[data-trk-cta]') : null;
        if (!el) return;
        var cta = el.getAttribute('data-trk-cta');
        var href = el.getAttribute('href') || '';
        track('CTAClick', { cta: cta, href: href, text: (el.innerText || '').trim().slice(0, 80) });
        log('cta', cta);
      }
      document.addEventListener('click', onCtaClick, true);
      onCleanup(function () { document.removeEventListener('click', onCtaClick, true); });
    }

    /* ------------------------------------------------------------------ */
    /* FORM ANALYTICS                                                      */
    /* ------------------------------------------------------------------ */
    if (E.formAnalytics !== false) {
      var formState = new WeakMap();
      function ensureState(form) {
        var s = formState.get(form);
        if (!s) {
          s = { started: false, startTs: 0, lastField: '', fieldErrors: 0, fieldTimes: {} };
          formState.set(form, s);
        }
        return s;
      }
      function onFocusIn(e) {
        var el = e.target;
        if (!el || !el.form) return;
        var form = el.form;
        var s = ensureState(form);
        if (!s.started) {
          s.started = true;
          s.startTs = Date.now();
          var formName = form.getAttribute('name') || form.id || '';
          track('FormStart', { form: formName });
          log('form start', formName);
        }
        s.lastField = el.name || el.id || el.type;
        s.fieldTimes[s.lastField] = s.fieldTimes[s.lastField] || Date.now();
      }
      function onInvalid(e) {
        var el = e.target;
        if (!el || !el.form) return;
        var s = ensureState(el.form);
        s.fieldErrors++;
      }
      function onSubmitClear(e) {
        if (e.target && e.target.tagName === 'FORM') formState.delete(e.target);
      }
      // abandono quando sai da página com form iniciado e não submetido.
      // Usa pagehide (cobre bfcache + close), não beforeunload (deprecated em mobile).
      function onPageHideForm() {
        var forms = document.querySelectorAll('form');
        forms.forEach(function (form) {
          var s = formState.get(form);
          if (s && s.started) {
            var formName = form.getAttribute('name') || form.id || '';
            track('FormAbandon', {
              form: formName,
              last_field: s.lastField,
              field_errors: s.fieldErrors,
              time_on_form: Math.round((Date.now() - s.startTs) / 1000)
            });
          }
        });
      }
      document.addEventListener('focusin', onFocusIn);
      document.addEventListener('invalid', onInvalid, true);
      document.addEventListener('submit',  onSubmitClear, true);
      window.addEventListener('pagehide',  onPageHideForm);
      onCleanup(function () {
        document.removeEventListener('focusin', onFocusIn);
        document.removeEventListener('invalid', onInvalid, true);
        document.removeEventListener('submit',  onSubmitClear, true);
        // onPageHideForm é o próprio cleanup pra abandono; depois disso o pagehide
        // já disparou e os listeners não rodam de novo nesta página
      });
    }

    /* ------------------------------------------------------------------ */
    /* VIDEO TRACKING (HTML5)                                              */
    /* ------------------------------------------------------------------ */
    if (E.videoTracking !== false) {
      var vState = new WeakMap();
      function attachVideo(v) {
        if (vState.has(v)) return;
        var src = v.currentSrc || v.src || '';
        var s = { played: false, fired: {}, onPlay: null, onTime: null };
        s.onPlay = function () {
          if (!s.played) {
            s.played = true;
            track('VideoPlay', { src: src, duration: Math.round(v.duration || 0) });
            log('video play', src);
          }
        };
        s.onTime = function () {
          if (!v.duration) return;
          var p = (v.currentTime / v.duration) * 100;
          [25, 50, 75, 100].forEach(function (t) {
            if (p >= t && !s.fired[t]) {
              s.fired[t] = true;
              track('VideoProgress', { src: src, percent: t });
              log('video', t + '%', src);
            }
          });
        };
        v.addEventListener('play', s.onPlay);
        v.addEventListener('timeupdate', s.onTime);
        vState.set(v, s);
      }
      function scan() {
        var vs = document.querySelectorAll('video');
        vs.forEach(attachVideo);
      }
      scan();
      var videoMo = null;
      if (typeof MutationObserver !== 'undefined') {
        videoMo = new MutationObserver(scan);
        videoMo.observe(document.body || document.documentElement, { childList: true, subtree: true });
      }
      onCleanup(function () {
        if (videoMo) { try { videoMo.disconnect(); } catch (e) {} }
        // remove listeners de cada video conhecido
        var vs = document.querySelectorAll('video');
        vs.forEach(function (v) {
          var s = vState.get(v);
          if (!s) return;
          try { v.removeEventListener('play', s.onPlay); } catch (e) {}
          try { v.removeEventListener('timeupdate', s.onTime); } catch (e) {}
        });
      });
    }

    log('engagement on');
  }

  if (window.trk && window.trk.track) start();
  else document.addEventListener('trk:ready', start, { once: true });
})();
