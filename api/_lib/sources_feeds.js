/** RSS-flöden för live-nyheter. */

const FEEDS = [
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=Tesla+OR+Cybertruck+OR+Optimus+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=NVIDIA+OR+%22Jensen+Huang%22+OR+CUDA+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=%22Elon+Musk%22+OR+xAI+OR+Grok+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=SpaceX+OR+Starship+OR+Starlink+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=Neuralink+when:14d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=%22electric+vehicle%22+OR+EV+OR+elbilar+OR+supercharger+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=AI+regulation+OR+%22AI+Act%22+OR+%22chip+export%22+OR+%22export+controls%22+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=%22artificial+intelligence%22+breakthrough+OR+LLM+OR+%22open+source+AI%22+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News SE',
    url: 'https://news.google.com/rss/search?q=Tesla+OR+elbilar+OR+NVIDIA+OR+AI+when:3d&hl=sv&gl=SE&ceid=SE:sv',
  },
  {
    source: 'Google News SE',
    url: 'https://news.google.com/rss/search?q=site:alltomelbil.se+OR+site:nyteknik.se+OR+site:teknikensvarld.se+OR+site:breakit.se+OR+site:di.se+OR+site:elbilen.se+when:7d&hl=sv&gl=SE&ceid=SE:sv',
  },
  // Svenska källor med fungerande flöden (artiklar och sammanfattningar behålls på svenska, ingen översättning).
  { source: 'Allt om Elbil', lang: 'sv', url: 'https://www.alltomelbil.se/feed/' },
  { source: 'Elbilen.se', lang: 'sv', url: 'https://elbilen.se/feed/' },
  { source: 'SweClockers', lang: 'sv', url: 'https://www.sweclockers.com/feeds/nyheter' },
  { source: 'Computer Sweden', lang: 'sv', url: 'https://computersweden.se/feed/' },
  { source: 'Feber', lang: 'sv', url: 'https://feber.se/rss/' },
  { source: 'Breakit', lang: 'sv', url: 'https://www.breakit.se/feed/artiklar' },
  { source: 'Dagens industri', lang: 'sv', url: 'https://www.di.se/rss' },
];


module.exports = { FEEDS };
