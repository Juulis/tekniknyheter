/** Redaktionella prioriteringar för Tekniknyheter (Juulis). */

const PRIORITY_TOPICS = [
  {
    id: 'tesla',
    label: 'Tesla',
    category: 'Tesla',
    patterns: [/\btesla\b/i, /\bcybertruck\b/i, /\boptimus\b/i, /\bmodel (3|s|y|x)\b/i, /\bmodel[3yx]\b/i, /\bcrypto?night\b/i, /\bfsd\b/i, /full self[- ]driving/i],
  },
  {
    id: 'ev',
    label: 'Elbilar',
    category: 'Elbilar',
    patterns: [/\belbil/i, /\bevs?\b/i, /electric vehicle/i, /\b(geely|byd|polestar|rivian|lucid|xpeng|zeekr|nio|ioniq|leapmotor)\b/i, /\bladdstolpe|snabbladdning|\bräckvidd/i, /\bbatteri(bil|pack)?\b/i, /charging network/i, /supercharger/i],
  },
  {
    id: 'elon',
    label: 'Elon Musk',
    category: 'Elon Musk',
    patterns: [/\belon\b/i, /\bmusk\b/i],
  },
  {
    id: 'nvidia',
    label: 'NVIDIA',
    category: 'NVIDIA',
    // mainOnly: NVIDIA räknas bara som ämne om det är huvudämnet (tidigt i rubriken eller flera träffar), inte en post i en börslista.
    mainOnly: true,
    patterns: [/\bnvidia\b/i, /\bnvda\b/i, /\bcuda\b/i, /\bh100\b/i, /\bb200\b/i, /\bgpu\b/i],
  },
  {
    id: 'jensen',
    label: 'Jensen Huang',
    category: 'NVIDIA',
    patterns: [/\bjensen\b/i, /\bhuang\b/i],
  },
  {
    id: 'xai',
    label: 'xAI',
    category: 'AI',
    patterns: [/\bxai\b/i, /\bgrok\b/i],
  },
  {
    id: 'spacex',
    label: 'SpaceX',
    category: 'SpaceX',
    patterns: [/\bspacex\b/i, /\bstarship\b/i, /\bfalcon\s*9\b/i, /\bstarlink\b/i],
  },
  {
    id: 'neuralink',
    label: 'Neuralink',
    category: 'Neuralink',
    patterns: [/\bneuralink\b/i],
  },
  {
    id: 'geopolitics',
    label: 'Geopolitik',
    category: 'Geopolitik',
    // Strikt: bara chip/exportkontroll, AI-lagar och EV-regler/tullar. Bara "EU" eller "Kina" i rubriken räcker inte.
    patterns: [/export controls?/i, /chip ban/i, /(?<!\b(?:let|lets|to|can|will|would)\s)\bai act\b/i, /(?:ai|chip|semiconductor|export|digital) (?:policy|regulation|legislation|laws?|rules)|regulat\w* (?:of )?(?:frontier )?ai\b/i, /(?:eu|china|kina|us|usa).{0,40}\b(?:chips?|halvledar\w*|ai|elbil\w*|evs?|electric)\b.{0,40}\b(?:tariffs?|tullar?|ban|sanctions?|restrictions?|regler|reglering|lag)\b/i, /\b(?:tariffs?|tullar?)\b.{0,40}\b(?:evs?|electric|elbil\w*|chips?|semiconductors?)\b/i, /\b(?:evs?|electric|elbil\w*|chips?|semiconductors?)\b.{0,40}\b(?:tariffs?|tullar?)\b/i, /sanctions?.{0,40}\b(?:chips?|nvidia|ai)\b/i],
  },
  {
    id: 'ai',
    label: 'AI',
    category: 'AI',
    patterns: [/\bai\b/i, /\bartificial intelligence\b/i, /\bllm\b/i, /machine learning/i, /openai|anthropic|deepmind/i],
  },
];

const POSITIVE_HINTS = new RegExp(
  [
    'lanserar', 'genombrott', '\\brekord(?!er)', 'växer', 'ökar', 'vinner', 'godkänd', 'klarar', 'förbättrar', 'billigare', 'snabbare',
    'ny milstolpe', 'expand', 'breakthrough', '(?<!off the )(?<!track )(?<!criminal )(?<!voting )(?<!housing )\\brecord\\b', '(breaks?|sets?|shatters?|smash(es)?) (new )?records\\b', 'approves', 'beats', 'surpasses', 'opens', 'launches',
    '\\bsoars?\\b', '\\bsurg(e|es|ed|ing)\\b', '\\bjumps?\\b', '\\brall(y|ies|ied)\\b', '\\bgains?\\b', 'top pick', 'all-time high',
    '\\bunveils?\\b', '\\bsecures?\\b', '\\bmilestone', '\\bboosts?\\b', '\\bwins?\\b', '\\bpartner(s|ship)?\\b', '\\bsuccess',
    '\\bmomentum\\b', '\\btops?\\b', '\\bdebuts?\\b', '\\brolls? out\\b', '\\bapproval\\b', '\\bapproved\\b', '\\bgreen ?light', 'grönt ljus', '\\bupgrad', '\\bexpands?\\b', '\\bdoubles?\\b', '\\bclimbs?\\b', '\\bbullish\\b', '\\blands?\\b', '\\bnow available\\b', '\\bsänker priset\\b', 'nytt rekord', 'ny rekord', '\\bsets? new\\b', '\\bstronger\\b', '\\bstrong (growth|demand|sales|results)\\b', '\\bimpress', '\\bcheaper\\b', '\\bfaster\\b', '\\btriumph', '\\bsurpass', '\\bboom', '\\bpopped\\b', '\\bhits? record', '\\bsets? (a )?record', '\\brises?\\b',
  ].join('|'),
  'i'
);

/** Tydliga positiva signaler (starka): räcker ensamma. Övriga positiva ord (svaga) räknas bara utan förbehåll. */
const STRONG_POS = /\brecord\b|\brecords\b|all-time high|record high|breakthrough|\bbeats?\b|\bsurg(e|es|ed|ing)\b|\bsoars?\b|\blaunch(es|ed)?\b|\bwins?\b|\bapprov(al|ed|es)\b|\bunveils?\b|\bmilestone|\bgreen ?light|lanserar|genombrott|\brekord|grönt ljus|godkänd|vinner|nytt rekord|\bdebuts?\b|\bsecures?\b|\brall(y|ies|ied)\b|\bjumps?\b|sänker priset|billigare/i;
/** Förbehåll: svaga positiva ord räknas inte när rubriken bara spår, tror eller uppskattar. */
const HEDGE = /\bforecasts?\b|\bpredict|\bcould\b|\bmay\b|\bmight\b|\bexpects?\b|\bexpected to\b|\banalysts?\b|\bseeks?\b|\bplans? to\b|\bwould\b|\bhopes?\b|\bprognos|\bspår\b/i;
/** Negativa/skeptiska ord i rubriken: aldrig positiv ton, även om ett positivt ord finns. */
const SKEPTIC = new RegExp(
  [
    '\\bprice hikes?\\b', '\\bhikes?\\b', '\\braises? prices?\\b', '\\bprice (up|increase)', '\\bprices? (up|rise|jump)', 'reality check', '\\bskeptic', '\\bdoubts?\\b', '\\bbubble\\b',
    '\\bwarn(s|ing|ings)?\\b', '\\bconcerns?\\b', '\\brisks?\\b', '\\bprobe[sd]?\\b', '\\blawsuits?\\b', '\\brecall', '\\bcuts?\\b', '\\blayoffs?\\b', '\\bfalls?\\b',
    '\\bplunge[sd]?\\b', '\\bslump', '\\bdowngrade', '\\bdelay', '\\bshortage', '\\bshocking\\b', '\\bpushback\\b', '\\bscrutiny\\b',
    '\\bcautions?\\b', '^editorial\\b', '^opinion\\b', 'op-ed', '\\bcase against\\b', '\\bvoluntary\\b', 'prishöj', 'höjer pris', '\\bvarnar\\b', '\\boro\\b', '\\btvivel', '\\bbubbla\\b', '\\bförsening', '\\bnedgång',
  ].join('|'),
  'i'
);

/** Tydligt negativa rubriker (ord med ordgränser så att t.ex. "bank" inte räknas som "ban"). */
const NEGATIVE_HINTS = new RegExp(
  [
    'krasch', '\\bfaller\\b', '\\bföll\\b', '\\brasar\\b', 'åtal', 'stämmer', '\\bstämd', '\\bböter', 'skandal', 'döds', 'olycka',
    '\\bgripen\\b', '\\bförlust', '\\bkritik', '\\bvarnar\\b', 'fiasko', '\\bkris\\b', 'varsel', 'riskerar', 'kritisera',
    '\\brecall', '\\bban\\b', '\\bbanned\\b', '\\blawsuits?\\b', '\\bsued\\b', '\\bsues\\b', '\\bcrash(es|ed|ing)?\\b', '\\bplunge[sd]?\\b',
    '\\bfraud', '\\bhack(ed|ers?|s)?\\b', '\\bbreach', '\\blayoffs?\\b', '\\blays? off\\b', '\\bjob cuts?\\b', '\\bslowdown\\b',
    '\\bweaken', 'what could go wrong', 'goes wrong',
    '\\bprice hikes?\\b', '\\braises? prices?\\b', '\\bdowngrade', 'prishöj', '\\bshortage', '\\bfalls?\\b', '\\bfell\\b', '\\bfalling\\b', '\\bdrops?\\b', '\\bdropped\\b', '\\bslumps?\\b', '\\btumbles?\\b', '\\bsinks?\\b', '\\bslides?\\b',
    '\\bdeclines?\\b', '\\bplummets?\\b', '\\barrest', '\\bsmuggl', '\\baccus', '\\bprobe[sd]?\\b', '\\binvestigat', '\\bdeadly\\b', '\\bdeath',
    '\\bdies\\b', '\\bkilled\\b', '\\bfatal', '\\binjur', '\\bleaks?\\b', '\\bdamages\\b', '\\bpenalt', '\\bfines?d?\\b', '\\bwarns?\\b',
    '\\bdelays?\\b', '\\bdelayed\\b', '\\bcancel', '\\bshuts? down\\b', '\\bbankrupt', '\\bthreat', '\\bbacklash', '\\boutage', '\\bfails?\\b',
    '\\bfailed\\b', '\\bfailure', '\\bscandal', '\\bcontrovers', '\\babduct', '\\bkidnap', '\\bscam', '\\btroubles?\\b', '\\bcrisis\\b',
  ].join('|'),
  'i'
);

/** Kritik/konflikt: får aldrig ge positiv ton bara för att Musk/Tesla nämns (neutral + liten nedviktning). */
const CONFLICT_HINTS = new RegExp(
  [
    '\\bchalleng(e|es|ed|ing)\\b', '\\bslam(s|med|ming)?\\b', '\\bblast(s|ed|ing)?\\b', '\\bclash(es|ed|ing)?\\b', '\\brebuk(e|es|ed|ing)\\b',
    '\\blash(es|ed|ing)? out\\b', '\\bcriticiz', '\\bcriticis', '\\bcritics?\\b', '\\bmocks?\\b', '\\btroll(s|ed|ing)?\\b', '\\bfeud', '\\bspat\\b',
    '\\bpush(es|ed)? back\\b', '\\btakes? aim\\b', '\\bhits? back\\b', '\\bfires? back\\b', '\\bswipe\\b', '\\bdenounc', '\\bdisput(e|es|ed)\\b',
    '\\bkritik', '\\bkritiserar', '\\bgår till angrepp\\b', '\\battack(s|ed|ing)?\\b', '\\bbickering\\b', '\\bbeef\\b', '\\bwar of words\\b',
  ].join('|'),
  'i'
);

/**
 * Privatliv/skvaller (separationer, relationer, dejting m.m.) ska aldrig få editorialPriority eller positiv ton.
 * Svaga ord (split, partner, relationship) räknas bara tillsammans med en personsignal, så att "stock split" och "partnership" inte slår fel.
 */
const PERSONAL_STRONG =
  /\b(break\s?-?up|breakup|broke up|broken up|breaking up|mom (to|of) (\d|four|three|two)|mother of (\d|four|three|two)|girlfriend|boyfriend|ex-?wife|ex-?husband|ex-?girlfriend|dating|romance|romantic|love life|personal life|privatliv|affair|divorce|baby mama|wedding|engaged to|pregnan\w*|dejt\w*|skilsmässa|förlovad|särbo)\b/i;
const PERSONAL_WEAK = /\bin love\b|\bdumped\b|\blet go\b|\bended (their|the) relationship\b|\bsplit(s|ting)? (from|with|up)\b|\bpartner\b|\bex\b|\bcouple\b|\brelationship\b|\bsplit\b/i;
const PERSON_CUE = /\b(shivon|zilis|grimes|wife|husband|mother of|mom|children|kids|baby|family|girlfriend|boyfriend|sambo|fru)\b/i;

function isPersonalLife(item) {
  const text = topicText(item);
  if (PERSONAL_STRONG.test(text)) return true;
  return PERSONAL_WEAK.test(text) && PERSON_CUE.test(text);
}

/** Brus som utesluts ur urvalet: politiskt "slam", eventlistor/webinars och kryptospådomar. */
const POLITICAL_SLAM =
  /\b(sanders|warren|ocasio|aoc|schumer|pelosi|democrats?|republicans?|gop|senators?|sen\.|congress(man|woman)?)\b.{0,70}\b(slams?|blasts?|rips?|torch(es)?|attacks?|lash(es)?|rebukes?|takes? aim|bashes?|slammed)\b|\b(slams?|blasts?|rips?|bashes?|slammed)\b.{0,70}\b(trump|biden|oligarchs?|republicans?|democrats?)\b/i;
const EVENT_LISTING = /\b(daily news rundown|news rundown|webinar|conference agenda|symposium|\[event\]|register now|call for papers|save the date|masterclass|workshop)\b/i;
const CRYPTO_NOISE = /\b(bitcoin|btc|crypto|ethereum|solana|xrp|dogecoin|memecoin|altcoin|token presale)\b/i;
/** Spekulation som nedviktas och inte väljs om det finns annat: kursspådomar, "could hit", "forecast: $". */
const SPECULATION =
  /price prediction|\bcould (hit|reach|soar|surge|explode|double|triple|skyrocket)\b|\bforecast:? \$|\b(will|to) (hit|reach) \$\d|\bpredicts?\b.{0,40}\b(price|stock|shares)\b|\bstocks? to buy\b|\bbest (ai )?stocks?\b|\bshould you (buy|sell)\b|\b(buy|sell) now\b|\bhere'?s why\b.{0,30}\b(soar|surge|rall(y|ies)|jump)/i;

function isNoise(item) {
  const title = String(item.title || '');
  return POLITICAL_SLAM.test(title) || EVENT_LISTING.test(title) || CRYPTO_NOISE.test(title);
}
function isSpeculative(item) {
  return SPECULATION.test(String(item.title || ''));
}

/** Primärkällor (företagens egna sidor, IR/newsroom, Reuters/AP) får en liten poängbonus och blir primär i kluster. */
const PRIMARY_HOST_RE =
  /(^|\.)(tesla\.com|nvidia\.com|spacex\.com|x\.ai|neuralink\.com|reuters\.com|apnews\.com|(ir|investor|investors|newsroom|news)\.[a-z0-9-]+\.[a-z.]+)$/i;
const PRIMARY_SOURCE_RE = /^(reuters|associated press|ap news|tesla|nvidia|nvidia blog|nvidia newsroom|spacex|neuralink|xai|x\.ai)$|newsroom|investor relations/i;

function hostOfUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

function isPrimarySource(item) {
  if (PRIMARY_SOURCE_RE.test(String(item.source || '').trim())) return true;
  for (const u of [item.url, item.sourceUrl]) {
    const h = hostOfUrl(u);
    if (h && h !== 'news.google.com' && PRIMARY_HOST_RE.test(h)) return true;
  }
  return false;
}

const KEYWORD_TAGS = [
  ['Aktier', /\b(stocks?|shares|nasdaq|s&p|buyback|price target|market cap|valuation|rally|earnings)\b/i],
  ['Rymden', /\b(rocket|launch(es|ed)?|orbit(al)?|astronauts?|satellites?|space station|iss|starship|falcon)\b/i],
  ['Robotar', /\b(robots?|robotics|humanoids?|robotaxis?|optimus)\b/i],
  ['Chip', /\b(chips?|semiconductors?|gpus?|processors?|silicon)\b/i],
  ['Reglering', /\b(regulat\w*|lawmakers?|ftc|fcc|congress|legislation|ai act|policy)\b/i],
  ['Försäljning', /\b(sales|deliver(y|ies)|leveranser|försäljning)\b/i],
  ['Batterier', /\b(batter(y|ies)|batteri\w*)\b/i],
];

/** Varje artikel ska ha minst en tagg: nyckelordstaggar, annars kategorin. */
function fallbackTags(item, category) {
  const text = topicText(item);
  const out = [];
  for (const [label, re] of KEYWORD_TAGS) {
    if (re.test(text)) out.push(label);
    if (out.length >= 2) break;
  }
  if (!out.length) out.push(category || 'Teknik');
  return out;
}

/** Text för ämnesdetektion: endast titel + sammanfattning (aldrig utgivare/källa). */
function topicText(item) {
  return `${item.title || ''} ${item.summary || ''}`;
}

/** Text för sentiment: källa får användas här. */
function textOf(item) {
  return `${item.title || ''} ${item.summary || ''} ${item.source || ''} ${(item.tags || []).join(' ')}`;
}

const MAIN_TOPIC_WINDOW = 30;
// Börsöversikter ("Stock Market Today: Nike, HPE, Nvidia ...") listar många bolag: då måste varje ämne vara huvudämne.
const ROUNDUP_RE = /\b(more stocks|stocks that|today'?s market|market movers|stock market today|stocks? to watch|biggest movers|top movers|pre-?market|market wrap|stocks making|what to watch|dow jones|s&p 500)\b/i;

function matchTopic(topic, text) {
  let best = -1;
  let hits = 0;
  for (const re of topic.patterns) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m;
    while ((m = g.exec(text)) && hits < 40) {
      hits++;
      if (best < 0 || m.index < best) best = m.index;
      if (m[0].length === 0) g.lastIndex++;
    }
  }
  // Börsöversikt med flera bolag uppräknade ("Nvidia, Tesla, Rivian, Nike ... and more"): ingen enskild post är huvudämne.
  if (best >= 0 && hits < 3 && ROUNDUP_RE.test(text.slice(0, 120)) && (text.slice(0, 120).split(',').length - 1) >= 2) return -1;
  if (best >= 0 && (topic.mainOnly || ROUNDUP_RE.test(text.slice(0, 120))) && best > MAIN_TOPIC_WINDOW && hits < 2) return -1;
  return best;
}

function detectTags(item) {
  const text = topicText(item);
  const tags = new Set(Array.isArray(item.tags) ? item.tags.map(String) : []);
  for (const topic of PRIORITY_TOPICS) {
    if (matchTopic(topic, text) >= 0) {
      tags.add(topic.label);
    }
  }
  return [...tags];
}

/** Starka entiteter (vinner över svagare ämnen); vid flera träffar vinner den som står först i titeln. */
const STRONG_TOPICS = new Set(['spacex', 'neuralink', 'nvidia', 'jensen', 'xai', 'tesla', 'elon', 'aiact']);
const WEAK_ORDER = ['ev', 'ai', 'geopolitics'];
const AI_ACT_RE = /(?<!\b(?:let|lets|to|can|will|would)\s)\bai act\b|export controls?|chip (ban|export)|\bEU\b.{0,40}\bai\b.{0,30}(regulat|polic|law)|\bai (regulation|legislation|laws?|rules)\b|regulat\w* (of )?(frontier )?ai\b/i;

function categoryFromText(text) {
  if (!text.trim()) return null;
  let best = null;
  const consider = (id, category, index) => {
    if (index < 0) return;
    if (!best || index < best.index) best = { id, category, index };
  };
  for (const topic of PRIORITY_TOPICS) {
    if (STRONG_TOPICS.has(topic.id)) consider(topic.id, topic.category, matchTopic(topic, text));
  }
  const act = AI_ACT_RE.exec(text);
  if (act) consider('aiact', 'Geopolitik', act.index);
  if (best) return best.category;
  for (const id of WEAK_ORDER) {
    const topic = PRIORITY_TOPICS.find((t) => t.id === id);
    if (topic && matchTopic(topic, text) >= 0) return topic.category;
  }
  return null;
}

function detectCategory(item) {
  if (item.category) return item.category;
  return categoryFromText(String(item.title || '')) || categoryFromText(String(item.summary || '')) || 'Teknik';
}

function sentimentOf(item) {
  if (isNoise(item) || isSpeculative(item)) return 'neutral';
  // Privatliv/skvaller är alltid neutralt, även om en tidigare ton skulle ha satts.
  if (isPersonalLife(item)) return 'neutral';
  if (item.sentiment === 'positive' || item.sentiment === 'negative' || item.sentiment === 'neutral') {
    return item.sentiment;
  }
  // Positiv ton kräver positiva signalord i rubriken (inte i källa, taggar eller att Musk/Tesla nämns).
  // Frågerubriker ("Is China winning ...?") är aldrig positiva.
  const title = String(item.title || '');
  const pos = POSITIVE_HINTS.test(title) && !/\?\s*$/.test(title) && !SKEPTIC.test(title) && (STRONG_POS.test(title) || !HEDGE.test(title));
  const neg = NEGATIVE_HINTS.test(textOf(item));
  const conflict = CONFLICT_HINTS.test(String(item.title || ''));
  if (neg && !pos) return 'negative';
  if (pos && !neg && !conflict) return 'positive';
  return 'neutral';
}

/** Ämnen där tydligt negativa rubriker prioriteras ner extra hårt (Tesla, elbilar, Musk, NVIDIA, AI). */
const SENSITIVE_TAGS = ['Tesla', 'Elbilar', 'Elon Musk', 'NVIDIA', 'Jensen Huang', 'AI', 'xAI'];

const POSITIVE_BONUS = 18;
const NEGATIVE_PENALTY = 30;
const NEGATIVE_PENALTY_SENSITIVE = 80;
const PERSONAL_PENALTY = 60;
const NOISE_PENALTY = 50;
const SPECULATION_PENALTY = 25;
const CORE_POSITIVE_BONUS = 10;
const STRONG_POSITIVE_BONUS = 8;
const PRIMARY_BONUS = 6;
const SWEDISH_BONUS = 4;
const CORE_TAGS = ['Tesla', 'Elbilar', 'Elon Musk', 'xAI', 'SpaceX', 'Neuralink', 'NVIDIA', 'Jensen Huang', 'AI'];
const STRONG_POSITIVE = /record|all-time high|breakthrough|beats?\b|surpass|milestone|soars?\b|rekord|genombrott|milstolpe|grönt ljus|green ?light/i;

/** Ämnespoäng utan ton. Används för att avgöra om något är redaktionellt relevant alls. */
function topicScore(item, tags) {
  let score = 0;

  for (const topic of PRIORITY_TOPICS) {
    if (tags.includes(topic.label)) score += 10;
  }

  if (tags.some((t) => ['Tesla', 'Elon Musk', 'xAI', 'SpaceX', 'Neuralink'].includes(t))) {
    score += 8;
  }
  if (tags.includes('NVIDIA') || tags.includes('Jensen Huang')) score += 8;
  if (tags.includes('AI')) score += 8;
  // Elbilar och AI-policy/geopolitik väger tyngre så att de inte försvinner bakom NVIDIA och SpaceX.
  if (tags.includes('Elbilar')) score += 12;
  if (tags.includes('Geopolitik')) score += 12;

  if (item.priority === true) score += 20;
  // Manuell bonus på rå (ännu ej berikade) poster; berikade poster räknas om från taggar, annars dubblas poängen vid varje enrich().
  if (typeof item.priorityScore === 'number' && item.editorialPriority === undefined) score += item.priorityScore;

  return score;
}

function priorityScore(item) {
  const tags = item.tags || detectTags(item);
  const sentiment = item.sentiment || sentimentOf(item);
  let score = topicScore(item, tags);

  if (sentiment === 'positive') {
    score += POSITIVE_BONUS;
    // Starka positiva nyheter i kärnämnena (Tesla, elbilar, Musk-bolag, NVIDIA, AI) hamnar överst.
    if (tags.some((t) => CORE_TAGS.includes(t))) {
      score += CORE_POSITIVE_BONUS;
      if (STRONG_POSITIVE.test(String(item.title || ''))) score += STRONG_POSITIVE_BONUS;
    }
  } else if (sentiment === 'negative') {
    score -= tags.some((t) => SENSITIVE_TAGS.includes(t)) ? NEGATIVE_PENALTY_SENSITIVE : NEGATIVE_PENALTY;
  } else {
    // Neutralt, men kritik/konflikt ("challenges", "slams" ...) väger lite mindre.
    score += CONFLICT_HINTS.test(String(item.title || '')) ? -9 : 1;
  }

  return score;
}

function uniqueTags(tags, category) {
  const seen = new Set();
  const out = [];
  const cat = String(category || '').toLowerCase();
  for (const tag of tags || []) {
    const t = String(tag).trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    if (cat && key === cat) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function enrich(item) {
  const detected = detectTags(item);
  const category = detectCategory(item);
  let tags = uniqueTags(detected, category);
  if (!tags.length) tags = fallbackTags(item, category);
  const personal = isPersonalLife(item);
  const sentiment = sentimentOf({ ...item, tags });
  // Poängen räknas på alla ämnen inkl. kategorin (uniqueTags tar bort kategorinamnet ur den synliga taggraden).
  const scoreTags = [...new Set([...detected, category])];
  let score = priorityScore({ ...item, tags: scoreTags, sentiment });
  const topic = topicScore(item, scoreTags);
  // Skvaller om privatliv: kraftigt nedviktad och aldrig redaktionell prio.
  if (personal) score -= PERSONAL_PENALTY;
  const noise = isNoise(item);
  const speculative = !noise && isSpeculative(item);
  if (noise) score -= NOISE_PENALTY;
  if (speculative) score -= SPECULATION_PENALTY;
  const primarySource = isPrimarySource(item);
  if (primarySource) score += PRIMARY_BONUS;
  if (item.lang === 'sv') score += SWEDISH_BONUS;
  const editorialPriority = !personal && !noise && !speculative && score >= 12;

  return {
    ...item,
    tags,
    category,
    sentiment,
    priorityScore: score,
    topicScore: topic,
    editorialPriority,
    ...(personal ? { personalLife: true } : {}),
    ...(noise ? { noise: true } : {}),
    ...(speculative ? { speculative: true } : {}),
    ...(primarySource ? { primarySource: true } : {}),
  };
}

function compareEditorial(a, b) {
  const scoreDiff = (b.priorityScore || 0) - (a.priorityScore || 0);
  if (scoreDiff) return scoreDiff;
  return new Date(b.publishedAt) - new Date(a.publishedAt);
}

function matchesEditorialFocus(item, { preferPositive = true } = {}) {
  if (preferPositive && item.sentiment === 'negative' && (item.priorityScore || 0) < 20) {
    return false;
  }
  // Relevans avgörs av ämnet, inte tonen: negativa rubriker rankas ned men göms inte.
  const relevance = typeof item.topicScore === 'number' ? item.topicScore : item.priorityScore || 0;
  return relevance >= 8;
}

module.exports = {
  PRIORITY_TOPICS,
  detectTags,
  enrich,
  compareEditorial,
  matchesEditorialFocus,
  priorityScore,
};
