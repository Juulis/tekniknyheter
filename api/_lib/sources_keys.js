const JACCARD_THRESHOLD = 0.5;
// Lägre tröskel gäller bara klustring (aldrig för att tappa en nyhet) och kräver samma kategori, minst tre gemensamma ord och en gemensam nyckelentitet.
const CLUSTER_THRESHOLD = 0.3;
const LOOSE_THRESHOLD = 0.15;
const MAX_RELATED = 3;
const KEY_ENTITY_RE =
  /\b(tesla|cybertruck|optimus|nvidia|nvda|jensen|huang|musk|spacex|starship|starlink|grok|xai|openai|anthropic|neuralink|maduro|trump|google|alphabet|amd|intel|tsmc|waymo|rivian|byd|ford|gm|shield|polestar|honda|storedot|norway|denmark|uk|europe|canada|china|kina|spain|spanien|iss|lockheed|boeing|foxconn|hon\s*hai)\b/gi;

function keyEntities(title) {
  return new Set((String(title || '').toLowerCase().match(KEY_ENTITY_RE) || []));
}

function sharedCount(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

// Entitet + händelse-nyckel: samma händelse hos flera utgivare blir ett kort även när rubrikerna skiljer sig mycket.
const EVENT_ENTITIES = [
  ['tesla', /\btesla\b/],
  ['nvidia', /\bnvidia\b|\bnvda\b|\bjensen\b/],
  ['spacex', /\bspacex\b|\bstarship\b|\bstarlink\b/],
  ['neuralink', /\bneuralink\b/],
  ['grok', /\bgrok\b|\bxai\b/],
  ['foxconn', /\bfoxconn\b|\bhon\s*hai\b/],
  ['ev', /\bevs?\b|electric (vehicle|car)s?|\belbilar?\b/],
];
const EVENT_KINDS = [
  ['uk-record', (t) => /\buk\b|britain|british/.test(t) && /record|surge|hit/.test(t) && /sales|registrations?/.test(t)],
  [
    'ath',
    (t) =>
      /all[- ]time high|record high|record close|new high|rekordnivå|stock milestone/.test(t) ||
      (/\brecord\b|\brekord/.test(t) && /shares|stock|value|market cap|trillion|nasdaq|aktie|börs|milstolpe|lyft|\$\d/.test(t) && /\bhits?\b|\bnew\b|\bfirst\b|fresh|nytt|rekordlyft|since/.test(t)),
  ],
  [
    'deliveries',
    (t) =>
      (/deliver(y|ies)|leveranser/.test(t) && /\bq[1-4]\b|quarter|kvartal|estimate|beat|record|vehicles|expectations|bilar/.test(t)) ||
      (/\bsold\b.{0,25}(evs?|vehicles|cars)\b/.test(t) && /expect|estimate/.test(t)) ||
      (/\bsales\b/.test(t) && /beat|\btops?\b|topped|estimates|expectations|momentum|rebound/.test(t) && /\bq[1-4]\b|quarter|\bev sales\b|vehicle|stock|shares/.test(t)),
  ],
  ['stock-move', (t) => /\b(stock|shares)\b/.test(t) && /\b(jumps?|surges?|popped|pops|crosses|soars?|climbs?)\b/.test(t) && /launch|milestone|friday|key level|lockup|resistance/.test(t)],
  ['europe-sales', (t) => (/registrations?|\bsales\b|market share|försäljning|rekordår|elbilar/.test(t) && /\b(europe|european|europa|norway|france|spain|sweden|denmark|germany|tyskland)\b/.test(t) && /\b(rise|rises|rose|growth|streak|recovery|breaks?|rebound|up|record|hit|surge|share|rekord|billigare|pivotal|affordable)\b/.test(t))],
  ['revenue', (t) => (/beats?|beat |ökade|intäkterna|sales estimates|revenue|estimates due/.test(t) && /sales|intäk|revenue|estimates|47\s*procent|47%/.test(t)) || (/key supplier/.test(t) && /booming ai|celebrates/.test(t))],
  ['driveaway', (t) => /supercharg/.test(t) && /drive[- ]?away|\bflee\b|flyktläge|plugged in|emergency|nödläge/.test(t)],
  ['venezuela', (t) => /maduro|venezuela/.test(t)],
  ['shield', (t) => /shield tv/.test(t)],
  ['iss', (t) => /(crew|astronauts?).{0,50}(iss\b|space station)|(iss\b|space station).{0,50}(crew|astronauts?)/.test(t)],
  ['ai-launch', (t) => /\blaunch(es|ed)?\b/.test(t) && /google/.test(t) && /(satellite|chips?|orbit|data cent)/.test(t)],
];

// Händelser som nämner flera bolag/personer: nyckeln gäller oavsett entitet.
const GLOBAL_KINDS = [
  // Foxconn/Hon Hai-intäkter (och Nvidia-"key supplier"-vinkling av samma händelse).
  ['foxconn-sales', (t) => (/\bfoxconn\b|\bhon\s*hai\b/.test(t) && /intäk|sales|beats?|estimates|revenue|ökade|47\s*%|47\s*procent/.test(t)) || (/\bnvidia\b/.test(t) && /key supplier/.test(t) && /booming|celebrates/.test(t))],
  ['si-rebrand', (t) => /(spacex|musk|grok).{0,80}(rebrand|name change|rename)|(rebrand|rename).{0,60}(spacex|musk)|spacexsi|\bsi\b.{0,25}\bai\b|\bai\b.{0,30}\bsi\b|(spacex|musk).{0,60}super ?intelligence|super ?intelligence.{0,60}(spacex|musk)/.test(t)],
  ['altucher-experts', (t) => /altucher/.test(t)],
  ['launches-13h', (t) => /\b13 hours\b/.test(t) && /launch|rockets?/.test(t)],
  ['china-ev-tariff', (t) => /(china|chinese|kinesisk|kina|kinabil).{0,50}(tariff|tull)|(tariff|tull).{0,50}(china|chinese|kinesisk|kina|kinabil)/.test(t)],
];


module.exports = {
  JACCARD_THRESHOLD,
  CLUSTER_THRESHOLD,
  LOOSE_THRESHOLD,
  MAX_RELATED,
  KEY_ENTITY_RE,
  keyEntities,
  sharedCount,
  EVENT_ENTITIES,
  EVENT_KINDS,
  GLOBAL_KINDS,
};
