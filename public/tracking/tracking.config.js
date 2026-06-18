/* ============================================================================
 * tracking.config.js  —  o ÚNICO arquivo que você edita por cliente.
 * ----------------------------------------------------------------------------
 * REGRA DE OURO: nenhum ID de pixel/token vive no código do kit. Tudo aqui.
 * Plataforma com ID vazio ("") fica DESLIGADA — o script dela nem carrega.
 *
 * Compatibilidade: navegadores modernos (ES2017+) — Chrome, Edge, Firefox,
 * Safari dos últimos 5 anos. O kit usa Promise, async/await leve via .then(),
 * crypto.subtle, TextEncoder, MutationObserver e IntersectionObserver.
 * Pode ser servido como JS estático, importado num bundle ou colado inline.
 * ========================================================================== */

window.TRACKING_CONFIG = {

  /* ----------------------------------------------------------------------
   * CLIENT — identificação e modos de operação
   * ---------------------------------------------------------------------- */
  client: {
    name: 'evolutto',           // ex: "cliente-x"  (slug, sem espaços — vai no payload)
    debug: false,       // true = logs verbosos no console + DevTools commands
    shadow: false,      // true = captura tudo MAS NÃO dispara (modo seguro pra testar)
  },

  /* ----------------------------------------------------------------------
   * BUSINESS — define quais eventos fazem sentido pra esse projeto.
   * O preset trava helpers irrelevantes (e-commerce numa LP de form, etc.)
   * pra evitar disparos errados que poluem inteligência das plataformas.
   *
   * Presets disponíveis (veja docs/PRESETS.md):
   *   lead-gen-form        (LP com form de contato/orçamento)
   *   lead-gen-whatsapp    (LP que joga pro WhatsApp)
   *   lead-gen-hibrido     (form + WhatsApp na mesma página)
   *   agendamento          (Calendly / RD Station Agenda)
   *   saas                 (trial / cadastro)
   *   ecommerce            (carrinho / checkout / compra)
   *   conteudo             (blog / newsletter / infoproduto)
   *   custom               (combinações atípicas — marque hasXxx manualmente)
   * ---------------------------------------------------------------------- */
  business: {
    type: 'lead-gen-form',     // preset principal
    hasWhatsApp: false,        // habilita trk.contact() + ctwa_clid + número WA
    hasForm: true,             // habilita form analytics + form auto-detect
    hasScheduling: false,      // habilita trk.schedule()
    hasEcommerce: false,       // habilita viewContent/addToCart/purchase
    hasRegistration: false,    // habilita CompleteRegistration/StartTrial
    hasNewsletter: false,      // habilita Subscribe
    primaryConversion: 'Lead', // qual evento é o "principal" do projeto
  },

  /* ----------------------------------------------------------------------
   * META (Facebook/Instagram) — Pixel no browser + CAPI no servidor
   * ---------------------------------------------------------------------- */
  meta: {
    pixelId: '434582544603444', // Evolutto
    capi: false,               // server-side (n8n) ligar depois
    advancedMatching: true,    // true = manda em/ph/fn/ln/etc. no fbq automaticamente
    ctwa: false,               // sem WhatsApp por enquanto
  },

  /* ----------------------------------------------------------------------
   * GOOGLE ADS — conversão no browser + Enhanced + Offline no servidor
   * ---------------------------------------------------------------------- */
  googleAds: {
    conversionId: 'AW-820638560',
    leadLabel: 'bTbnCNbb0MMZEODmp4cD', // MQL Consultoria
    enhancedConversions: true, // true = manda email/phone hash p/ matching
    // V1.0.0: branch de Offline Conversions no n8n é skeleton (precisa OAuth2).
    // Mantenha false ate completar o fluxo OAuth do Google Ads Customer Match
    // no n8n-flow-main.json (Branch 5). Ver docs/ROADMAP.md.
    offlineConversions: false,
  },

  /* ----------------------------------------------------------------------
   * GA4
   * ---------------------------------------------------------------------- */
  ga4: {
    measurementId: 'G-Y3C4XJD784',
    apiSecret: '',             // só se quiser GA4 server-side via Measurement Protocol
    engagementTracking: true,  // true = manda engagement_time_msec/session_engaged
  },

  /* ----------------------------------------------------------------------
   * TIKTOK
   * ---------------------------------------------------------------------- */
  tiktok: {
    pixelId: '',               // ex: "CXXXXXXXXXXXXXXXXX"
    eventsApi: false,          // true = n8n também envia via Events API server-side
  },

  /* ----------------------------------------------------------------------
   * MICROSOFT CLARITY (heatmap/replay — não é conversão)
   * ---------------------------------------------------------------------- */
  clarity: {
    projectId: 'sr5oqtmos6',     // Clarity Evolutto
  },

  /* ----------------------------------------------------------------------
   * SERVER (camada 3) — webhook do n8n DESTE cliente
   * ---------------------------------------------------------------------- */
  server: {
    endpoint: '',              // ex: "https://webhook.dominio.com.br/webhook/CLIENTE"
    sendOnEvents: ['Lead', 'PageView', 'Contact', 'Schedule', 'Purchase',
                   'AddToCart', 'InitiateCheckout', 'ViewContent',
                   'CompleteRegistration', 'StartTrial', 'Subscribe',
                   'Scroll', 'TimeOnPage', 'SectionView', 'CTAClick',
                   'FormStart', 'FormAbandon', 'VideoPlay', 'VideoProgress'],
    retryOnFail: 3,            // tentativas locais antes de desistir
  },

  /* ----------------------------------------------------------------------
   * CAPTURE (camada 1) — comportamento de captura/persistência
   * ---------------------------------------------------------------------- */
  capture: {
    firstTouch: true,           // mantém ft_* travado (não sobrescreve)
    referrerMapping: true,      // infere utm_source do referrer (orgânico)
    geo: true,                  // enriquece cidade/estado/país via ipapi.co
    journeyMaxTouches: 20,      // últimos N toques mantidos no trk_journey
    deviceFingerprint: true,    // screen/viewport/lang/tz/platform/device_type
    ctwaCapture: true,          // captura ctwa_clid da URL
    leadStorageKey: '__wl_lead',// localStorage onde a LP guarda dados do lead
  },

  /* ----------------------------------------------------------------------
   * ENGAGEMENT (camada 3)
   * ---------------------------------------------------------------------- */
  engagement: {
    scroll: true,               // dispara Scroll em 25/50/75/90
    heartbeat: 30,              // segundos — TimeOnPage acumulado (0 = desliga)
    sections: true,             // observa <... data-trk-section="nome">
    sectionVisibleMs: 2000,     // tempo visível pra considerar SectionView
    ctaTracking: true,          // observa <... data-trk-cta="nome">
    formAnalytics: true,        // tempo/campo/abandono no form
    videoTracking: true,        // play + 25/50/75/100 em <video>
  },

  /* ----------------------------------------------------------------------
   * CONSENT (LGPD/cookie banner) — desligado por padrão
   * ---------------------------------------------------------------------- */
  consent: {
    required: false,            // true = espera trk.consent('granted') p/ carregar pixels
    defaultGranted: false,      // valor inicial enquanto usuário não escolheu
    cookieName: 'trk_consent',  // onde guarda a escolha
  },

  /* ----------------------------------------------------------------------
   * HELPERS — config de helpers de conveniência
   * ---------------------------------------------------------------------- */
  helpers: {
    whatsappNumber: '',         // ex: "5511999999999"  — usado em trk.contact()
    whatsappMessage: 'Olá! Vim pelo site.', // mensagem padrão
  },

  /* ----------------------------------------------------------------------
   * INTEGRATIONS — opcionais
   * ---------------------------------------------------------------------- */
  integrations: {
    calendly: false,            // escuta postMessage do Calendly → Schedule
    typeform: false,            // escuta postMessage do Typeform → Lead
    tally:    false,            // escuta postMessage do Tally → Lead
  },

  /* ----------------------------------------------------------------------
   * CROSS-DOMAIN — passa visitor_id entre domínios via querystring
   * ---------------------------------------------------------------------- */
  crossDomain: {
    enabled: false,
    domains: [],                // ex: ['site-a.com.br', 'checkout-b.com.br']
  },
};

/* Versão do kit — vai no payload pro servidor como `_v` */
window.TRACKING_KIT_VERSION = '1.0.0';
