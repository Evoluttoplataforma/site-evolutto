/* ============================================================================
 * trk-helpers.js  —  helpers de conveniência (no-op se feature desligada)
 * ----------------------------------------------------------------------------
 * Depende de window.trk (02-dispatch.js) e TRACKING_CONFIG.business.
 *
 * Cada helper checa a flag correspondente em business.hasXxx antes de disparar.
 * Se a flag estiver false, NÃO dispara nada e (em debug) avisa no console.
 * Isso impede instalação errada (ex: chamar trk.purchase() numa LP que não é
 * e-commerce) de poluir os dados das plataformas.
 *
 * API adicionada em window.trk:
 *   trk.contact({channel?, message?})
 *   trk.schedule({service?, date?, value?})
 *   trk.viewContent({content_id, content_name?, value?, currency?})
 *   trk.addToCart({items, value, currency?})
 *   trk.initiateCheckout({value, currency?, num_items?})
 *   trk.purchase({value, currency?, order_id, items?})
 *   trk.completeRegistration({method?, value?})
 *   trk.startTrial({plan?, value?, currency?})
 *   trk.subscribe({list?, value?})
 *   trk.openWhatsApp({number?, message?})  → atalho UX (não rastreia sozinho)
 * ========================================================================== */

(function () {
  function ready() {
    var C = window.TRACKING_CONFIG || {};
    var B = C.business || {};
    var H = C.helpers || {};
    var DEBUG = !!(C.client && C.client.debug);
    function warn(name) {
      if (DEBUG) console.warn('[trk:helpers]', name + '() ignorado: feature desligada em business');
    }
    if (!window.trk || !window.trk.track) return;

    /* ----------------------------------------------------------------- */
    /* CONTACT (WhatsApp / contato)                                      */
    /* ----------------------------------------------------------------- */
    window.trk.contact = function (data) {
      if (!B.hasWhatsApp && !B.hasForm) { warn('contact'); return null; }
      var props = {};
      if (data && data.channel) props.channel = data.channel; else props.channel = B.hasWhatsApp ? 'whatsapp' : 'form';
      if (data && data.message) props.message = data.message;
      return window.trk.track('Contact', props, data);
    };

    /* ----------------------------------------------------------------- */
    /* SCHEDULE (agendamento)                                            */
    /* ----------------------------------------------------------------- */
    window.trk.schedule = function (data) {
      if (!B.hasScheduling) { warn('schedule'); return null; }
      var props = {};
      if (data) {
        if (data.service) props.service = data.service;
        if (data.date)    props.scheduled_at = data.date;
        if (data.value)   { props.value = data.value; props.currency = data.currency || 'BRL'; }
      }
      return window.trk.track('Schedule', props, data);
    };

    /* ----------------------------------------------------------------- */
    /* VIEW CONTENT (visualizar produto/conteúdo)                        */
    /* ----------------------------------------------------------------- */
    window.trk.viewContent = function (data) {
      if (!B.hasEcommerce && !B.hasRegistration && !B.hasNewsletter) { warn('viewContent'); return null; }
      var props = { currency: (data && data.currency) || 'BRL' };
      if (data) {
        if (data.content_id)   props.content_ids  = [data.content_id];
        if (data.content_name) props.content_name = data.content_name;
        if (data.content_type) props.content_type = data.content_type;
        if (data.value != null) props.value = data.value;
        if (data.items) props.items = data.items;
      }
      return window.trk.track('ViewContent', props, data && data.userData);
    };

    /* ----------------------------------------------------------------- */
    /* ADD TO CART                                                        */
    /* ----------------------------------------------------------------- */
    window.trk.addToCart = function (data) {
      if (!B.hasEcommerce) { warn('addToCart'); return null; }
      var props = { currency: (data && data.currency) || 'BRL' };
      if (data) {
        if (data.value != null) props.value = data.value;
        if (data.items) { props.items = data.items; props.num_items = data.items.length; }
        if (data.content_id) props.content_ids = [data.content_id];
      }
      return window.trk.track('AddToCart', props, data && data.userData);
    };

    /* ----------------------------------------------------------------- */
    /* INITIATE CHECKOUT                                                  */
    /* ----------------------------------------------------------------- */
    window.trk.initiateCheckout = function (data) {
      if (!B.hasEcommerce) { warn('initiateCheckout'); return null; }
      var props = { currency: (data && data.currency) || 'BRL' };
      if (data) {
        if (data.value != null) props.value = data.value;
        if (data.num_items)     props.num_items = data.num_items;
        if (data.items)         props.items = data.items;
      }
      return window.trk.track('InitiateCheckout', props, data && data.userData);
    };

    /* ----------------------------------------------------------------- */
    /* PURCHASE                                                           */
    /* ----------------------------------------------------------------- */
    window.trk.purchase = function (data) {
      if (!B.hasEcommerce) { warn('purchase'); return null; }
      if (!data || data.value == null) {
        if (DEBUG) console.warn('[trk:helpers] purchase() exige { value }');
        return null;
      }
      var props = { currency: data.currency || 'BRL', value: data.value };
      if (data.order_id) props.order_id = data.order_id;
      if (data.items)    props.items = data.items;
      return window.trk.track('Purchase', props, data.userData);
    };

    /* ----------------------------------------------------------------- */
    /* COMPLETE REGISTRATION                                              */
    /* ----------------------------------------------------------------- */
    window.trk.completeRegistration = function (data) {
      if (!B.hasRegistration) { warn('completeRegistration'); return null; }
      var props = {};
      if (data) {
        if (data.method) props.method = data.method;
        if (data.value != null) { props.value = data.value; props.currency = data.currency || 'BRL'; }
      }
      return window.trk.track('CompleteRegistration', props, data && data.userData);
    };

    /* ----------------------------------------------------------------- */
    /* START TRIAL                                                        */
    /* ----------------------------------------------------------------- */
    window.trk.startTrial = function (data) {
      if (!B.hasRegistration) { warn('startTrial'); return null; }
      var props = {};
      if (data) {
        if (data.plan) props.plan = data.plan;
        if (data.value != null) { props.value = data.value; props.currency = data.currency || 'BRL'; }
      }
      return window.trk.track('StartTrial', props, data && data.userData);
    };

    /* ----------------------------------------------------------------- */
    /* SUBSCRIBE                                                          */
    /* ----------------------------------------------------------------- */
    window.trk.subscribe = function (data) {
      if (!B.hasNewsletter && !B.hasRegistration) { warn('subscribe'); return null; }
      var props = {};
      if (data) {
        if (data.list) props.list = data.list;
        if (data.value != null) { props.value = data.value; props.currency = data.currency || 'BRL'; }
      }
      return window.trk.track('Subscribe', props, data && data.userData);
    };

    /* ----------------------------------------------------------------- */
    /* openWhatsApp — atalho UX (não dispara conversão por si só)        */
    /* ----------------------------------------------------------------- */
    window.trk.openWhatsApp = function (opts) {
      opts = opts || {};
      var num = (opts.number || H.whatsappNumber || '').replace(/\D/g, '');
      if (!num) { if (DEBUG) console.warn('[trk:helpers] whatsappNumber vazio'); return null; }
      var msg = encodeURIComponent(opts.message || H.whatsappMessage || '');
      var url = 'https://wa.me/' + num + (msg ? '?text=' + msg : '');
      // dispara Contact ANTES de abrir (UX)
      if (B.hasWhatsApp) window.trk.contact({ channel: 'whatsapp' });
      window.open(url, '_blank');
      return url;
    };

    if (DEBUG) console.log('[trk:helpers] prontos para preset', B.type);
  }

  if (window.trk && window.trk.track) ready();
  else document.addEventListener('trk:ready', ready, { once: true });
})();
