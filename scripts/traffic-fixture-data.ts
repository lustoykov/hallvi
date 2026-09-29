// What the traffic fixture draws from: real browsers' user agents, the
// crawlers and scanners that find every public site, where visitors come
// from, and the pages of four kinds of application.
//
// User agents are written exactly as each browser sends them — Chrome's
// reduced string, Safari's frozen system version — with the versions current
// in autumn 2026.
//
// Every address block is a residential, mobile or hosting network that DB-IP
// Lite (CC BY 4.0, September 2026) places in one country across the whole
// block, so the country Hallvi looks up is the one the generator meant. After
// a DB-IP update, check them again with the fixture's `ranges` command.

export const SHAPES = ["busy", "spa", "tiny", "api"] as const;
export type Shape = (typeof SHAPES)[number];
export type Device = "desktop" | "mobile" | "tablet";

export interface Country {
  /** Hours from UTC in September; near enough for a daily rhythm. */
  offset: number;
  language: string;
  v4: string[];
  v6: string[];
}

// Residential and mobile networks: Comcast, Charter, AT&T, Verizon and
// T-Mobile in the US, BT and Virgin Media in Britain, Deutsche Telekom,
// Vodafone and Telefonica in Germany, and so on.
export const COUNTRIES: Record<string, Country> = {
  US: {
    offset: -5,
    language: "en-US,en;q=0.9",
    v4: [
      "23.24.0.0/16",
      "23.84.0.0/16",
      "12.56.0.0/16",
      "63.0.0.0/16",
      "172.56.0.0/16",
    ],
    v6: ["2001:558::/32", "2600:6c04::/32", "2607:fb90::/36"],
  },
  GB: {
    offset: 1,
    language: "en-GB,en;q=0.9",
    v4: ["5.80.0.0/16", "62.30.0.0/16", "2.120.0.0/16"],
    v6: ["2a00:2380::/32", "2a02:88b2::/32"],
  },
  DE: {
    offset: 2,
    language: "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["2.160.0.0/16", "2.200.0.0/16", "2.208.0.0/16"],
    v6: ["2003::/32", "2a00::/32"],
  },
  FR: {
    offset: 2,
    language: "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["2.3.0.0/16", "62.147.0.0/16", "37.64.0.0/16", "5.48.0.0/16"],
    v6: ["2a01:cb00::/32", "2a01:e00::/32"],
  },
  NL: {
    offset: 2,
    language: "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["31.149.0.0/16", "24.132.0.0/16"],
    v6: ["2a00:9a40::/32"],
  },
  CA: {
    offset: -5,
    language: "en-CA,en;q=0.9,fr-CA;q=0.8",
    v4: ["24.114.0.0/16", "50.101.0.0/16", "23.16.0.0/16", "24.37.0.0/16"],
    v6: ["2605:8d80::/32"],
  },
  IN: {
    offset: 5.5,
    language: "en-IN,en;q=0.9,hi;q=0.8",
    v4: ["47.8.0.0/16", "182.70.0.0/16", "106.194.0.0/16", "59.88.0.0/16"],
    v6: ["2405:204::/32", "2405:200:1000::/36"],
  },
  BR: {
    offset: -3,
    language: "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["177.32.0.0/16", "152.240.0.0/16", "177.30.0.0/16"],
    v6: ["2804:20::/32"],
  },
  AU: {
    offset: 10,
    language: "en-AU,en;q=0.9",
    v4: ["1.120.0.0/16", "1.40.0.0/16", "106.68.0.0/16"],
    v6: ["2001:8000::/32"],
  },
  ES: {
    offset: 2,
    language: "es-ES,es;q=0.9,en;q=0.8",
    v4: ["2.136.0.0/16", "37.11.0.0/16", "2.155.0.0/16"],
    v6: ["2a02:9000::/32"],
  },
  IT: {
    offset: 2,
    language: "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["2.112.0.0/16", "2.224.0.0/16", "2.32.0.0/16"],
    v6: ["2a01:2000::/32"],
  },
  PL: {
    offset: 2,
    language: "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["5.184.0.0/16"],
    v6: ["2a00:f40::/32"],
  },
  SE: {
    offset: 2,
    language: "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["2.248.0.0/16", "37.2.0.0/16"],
    v6: ["2001:2040::/32"],
  },
  JP: {
    offset: 9,
    language: "ja,en-US;q=0.9,en;q=0.8",
    v4: ["58.88.0.0/16", "14.8.0.0/16", "1.112.0.0/16"],
    v6: ["2001:380::/32"],
  },
  KR: {
    offset: 9,
    language: "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["1.96.0.0/16", "1.226.0.0/16"],
    v6: ["2400:108::/32"],
  },
  SG: {
    offset: 8,
    language: "en-SG,en;q=0.9,zh-CN;q=0.8",
    v4: ["116.14.0.0/16", "27.104.0.0/16"],
    v6: ["2400:d800::/32"],
  },
  BG: {
    offset: 3,
    language: "bg-BG,bg;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["79.100.0.0/16", "46.10.0.0/17"],
    v6: ["2a02:6800::/32"],
  },
  UA: {
    offset: 3,
    language: "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["5.248.0.0/16", "37.52.0.0/16"],
    v6: ["2a02:8a8::/32"],
  },
  TR: {
    offset: 3,
    language: "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["78.166.0.0/16", "5.24.0.0/16"],
    v6: ["2a00:1d32::/32"],
  },
  ID: {
    offset: 7,
    language: "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["114.120.0.0/16", "114.4.0.0/16"],
    v6: ["2400:82e0::/32"],
  },
  VN: {
    offset: 7,
    language: "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["27.64.0.0/16", "14.160.0.0/16"],
    v6: ["2401:d800::/32"],
  },
  MX: {
    offset: -6,
    language: "es-MX,es;q=0.9,en;q=0.8",
    v4: ["148.212.0.0/16"],
    v6: ["2001:1208::/32"],
  },
  NG: {
    offset: 1,
    language: "en-NG,en;q=0.9",
    v4: ["102.88.0.0/16", "105.114.0.0/16"],
    v6: [],
  },
  ZA: {
    offset: 2,
    language: "en-ZA,en;q=0.9",
    v4: ["41.144.0.0/16", "41.1.0.0/16"],
    v6: ["2c0e:2200::/32"],
  },
  AR: {
    offset: -3,
    language: "es-AR,es;q=0.9,en;q=0.8",
    v4: ["24.232.0.0/16", "179.36.0.0/16"],
    v6: [],
  },
  CH: {
    offset: 2,
    language: "de-CH,de;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["46.14.0.0/16"],
    v6: ["2001:91f::/32"],
  },
  AT: {
    offset: 2,
    language: "de-AT,de;q=0.9,en-US;q=0.8,en;q=0.7",
    v4: ["46.74.0.0/16"],
    v6: ["2001:850::/32"],
  },
  BE: {
    offset: 2,
    language: "nl-BE,nl;q=0.9,fr-BE;q=0.8,en;q=0.7",
    v4: ["37.62.0.0/16", "78.20.0.0/16"],
    v6: ["2a02:a000::/32"],
  },
  PH: {
    offset: 8,
    language: "en-PH,en;q=0.9,fil;q=0.8",
    v4: ["49.144.0.0/16", "110.55.0.0/16"],
    v6: ["2001:4450::/32"],
  },
  CN: {
    offset: 8,
    language: "zh-CN,zh;q=0.9,en;q=0.8",
    v4: ["1.50.0.0/16", "1.26.0.0/16"],
    v6: ["240e::/32"],
  },
};

/** Who reads each kind of site, as weights per country. */
export const AUDIENCES: Record<string, Record<string, number>> = {
  web: {
    US: 25,
    IN: 9,
    GB: 7,
    DE: 7,
    FR: 4,
    CA: 4,
    NL: 3,
    BR: 3.5,
    AU: 3,
    ES: 2.5,
    IT: 2.5,
    PL: 2.5,
    SE: 1.5,
    JP: 1.5,
    KR: 1,
    SG: 1,
    BG: 1.5,
    UA: 1.2,
    TR: 1.2,
    ID: 1.5,
    VN: 1.5,
    MX: 1.5,
    NG: 1,
    ZA: 1,
    AR: 1,
    CH: 1,
    AT: 1,
    BE: 1,
    PH: 1.5,
    CN: 0.3,
  },
  // Hacker News reads from North America and northern Europe.
  hn: {
    US: 44,
    GB: 8,
    DE: 7,
    CA: 6,
    IN: 4,
    FR: 3,
    NL: 3,
    AU: 3,
    SE: 2,
    CH: 2,
    PL: 1.5,
    ES: 1.5,
    BR: 1.5,
    IT: 1,
    JP: 1,
    SG: 1,
    BG: 1,
    AT: 1,
    BE: 1,
    UA: 0.5,
  },
  // A European business tool.
  europe: {
    DE: 18,
    GB: 14,
    FR: 10,
    NL: 8,
    BG: 8,
    US: 8,
    PL: 6,
    ES: 6,
    IT: 6,
    SE: 4,
    AT: 3,
    CH: 3,
    BE: 3,
    UA: 3,
  },
  // A Sofia developer's own site.
  personal: {
    BG: 25,
    US: 20,
    DE: 10,
    GB: 8,
    NL: 5,
    FR: 4,
    IN: 4,
    CA: 3,
    PL: 3,
    SE: 2,
    UA: 2,
    TR: 2,
    ES: 2,
    IT: 2,
    AU: 2,
    CH: 1,
  },
};

/** Hosting and company networks that bots, scanners and servers use. */
export const NETWORKS: Record<
  string,
  { country: string; v4: string[]; v6: string[] }
> = {
  googlebot: {
    country: "US",
    v4: [
      "66.249.64.0/24",
      "66.249.65.0/24",
      "66.249.66.0/24",
      "66.249.68.0/24",
      "66.249.69.0/24",
      "66.249.70.0/24",
      "66.249.72.0/24",
      "66.249.73.0/24",
      "66.249.75.0/24",
      "66.249.77.0/24",
      "66.249.79.0/24",
    ],
    v6: ["2001:4860:4801:10::/64"],
  },
  bingbot: {
    country: "US",
    v4: ["40.77.167.0/24", "157.55.39.0/24", "207.46.13.0/24"],
    v6: [],
  },
  openai: {
    country: "US",
    v4: ["20.171.206.0/23", "52.230.152.0/24"],
    v6: [],
  },
  azure: { country: "US", v4: ["4.148.0.0/16"], v6: [] },
  aws: {
    country: "US",
    v4: ["3.80.0.0/16", "52.70.0.0/15", "18.204.0.0/14", "3.12.0.0/16"],
    v6: ["2600:1f18::/32"],
  },
  apple: { country: "US", v4: ["17.241.0.0/16", "17.22.0.0/16"], v6: [] },
  ahrefs: { country: "FR", v4: ["54.36.148.0/23"], v6: [] },
  semrush: { country: "US", v4: ["185.191.171.0/24"], v6: [] },
  yandex: {
    country: "RU",
    v4: ["5.255.231.0/24", "95.108.192.0/18"],
    v6: [],
  },
  twitter: { country: "US", v4: ["199.16.156.0/22"], v6: [] },
  meta: {
    country: "US",
    v4: ["69.171.224.0/19", "66.220.144.0/20"],
    v6: ["2620:0:1c00::/40"],
  },
  moz: { country: "US", v4: ["216.244.66.0/24"], v6: [] },
  uptimerobot: {
    country: "US",
    v4: ["69.162.124.224/28", "216.144.248.16/28"],
    v6: [],
  },
  censys: {
    country: "US",
    v4: ["167.94.138.0/24", "162.142.125.0/24"],
    v6: [],
  },
  paloalto: {
    country: "US",
    v4: ["198.235.24.0/24", "205.210.31.0/24"],
    v6: [],
  },
  ipvolume: {
    country: "NL",
    v4: ["80.82.77.0/24", "185.242.226.0/24"],
    v6: [],
  },
  chinanet: { country: "CN", v4: ["222.186.0.0/16"], v6: [] },
  huawei: { country: "CN", v4: ["120.46.0.0/15"], v6: [] },
  alibaba: { country: "HK", v4: ["47.242.0.0/15"], v6: [] },
  digitalocean: {
    country: "US",
    v4: ["45.55.0.0/16", "64.23.128.0/17"],
    v6: ["2604:a880:400::/48"],
  },
  "digitalocean-nl": { country: "NL", v4: ["178.62.128.0/17"], v6: [] },
  ovh: { country: "FR", v4: ["37.187.0.0/17", "5.135.128.0/19"], v6: [] },
  hetzner: {
    country: "DE",
    v4: ["5.9.0.0/17", "2.28.0.0/16"],
    v6: ["2a06:be80::/32"],
  },
  selectel: { country: "RU", v4: ["87.228.0.0/17"], v6: [] },
};

export interface Browser {
  device: Device;
  weight: number;
  /** `{v}` is replaced by one of `versions`, chosen by weight. */
  ua: string;
  versions: [string, number][];
  /** Chromium's client hints: the brand and platform it names. */
  hints?: { brand: string; platform: string };
  engine: "chromium" | "gecko" | "webkit";
  /** Safari before 16.4 sent no Sec-Fetch-* headers. */
  noFetchMetadata?: true;
}

const chrome: [string, number][] = [
  ["152", 55],
  ["151", 28],
  ["153", 8],
  ["150", 6],
  ["149", 3],
];
const firefox: [string, number][] = [
  ["155.0", 60],
  ["154.0", 24],
  ["140.0", 10],
  ["153.0", 6],
];
const safari: [string, number][] = [
  ["26.6", 42],
  ["27.0", 30],
  ["26.5", 16],
  ["26.4", 12],
];

export const BROWSERS: Browser[] = [
  {
    device: "desktop",
    weight: 34,
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{v}.0.0.0 Safari/537.36",
    versions: chrome,
    hints: { brand: "Google Chrome", platform: "Windows" },
    engine: "chromium",
  },
  {
    device: "desktop",
    weight: 16,
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{v}.0.0.0 Safari/537.36",
    versions: chrome,
    hints: { brand: "Google Chrome", platform: "macOS" },
    engine: "chromium",
  },
  {
    device: "desktop",
    weight: 11,
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{v}.0.0.0 Safari/537.36 Edg/{v}.0.0.0",
    versions: chrome,
    hints: { brand: "Microsoft Edge", platform: "Windows" },
    engine: "chromium",
  },
  {
    // Also every iPad, which asks for desktop pages by default.
    device: "desktop",
    weight: 14,
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/{v} Safari/605.1.15",
    versions: safari,
    engine: "webkit",
  },
  {
    device: "desktop",
    weight: 5,
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:{v}) Gecko/20100101 Firefox/{v}",
    versions: firefox,
    engine: "gecko",
  },
  {
    device: "desktop",
    weight: 1.5,
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:{v}) Gecko/20100101 Firefox/{v}",
    versions: firefox,
    engine: "gecko",
  },
  {
    device: "desktop",
    weight: 2,
    ua: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:{v}) Gecko/20100101 Firefox/{v}",
    versions: firefox,
    engine: "gecko",
  },
  {
    device: "desktop",
    weight: 3,
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{v}.0.0.0 Safari/537.36",
    versions: chrome,
    hints: { brand: "Google Chrome", platform: "Linux" },
    engine: "chromium",
  },
  {
    device: "desktop",
    weight: 1,
    ua: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{v}.0.0.0 Safari/537.36",
    versions: chrome,
    hints: { brand: "Google Chrome", platform: "Chrome OS" },
    engine: "chromium",
  },
  {
    device: "mobile",
    weight: 44,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/{v} Mobile/15E148 Safari/604.1",
    versions: safari,
    engine: "webkit",
  },
  {
    device: "mobile",
    weight: 3,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/{v} Mobile/15E148 Safari/604.1",
    versions: [["18.6", 1]],
    engine: "webkit",
  },
  {
    device: "mobile",
    weight: 36,
    ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{v}.0.0.0 Mobile Safari/537.36",
    versions: chrome,
    hints: { brand: "Google Chrome", platform: "Android" },
    engine: "chromium",
  },
  {
    device: "mobile",
    weight: 6,
    ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/{v} Chrome/136.0.0.0 Mobile Safari/537.36",
    versions: [
      ["29.0", 70],
      ["28.0", 30],
    ],
    engine: "chromium",
  },
  {
    device: "mobile",
    weight: 5,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/{v} Mobile/15E148 Safari/604.1",
    versions: [
      ["152.0.7401.53", 60],
      ["151.0.7362.80", 40],
    ],
    engine: "webkit",
  },
  {
    device: "mobile",
    weight: 1,
    ua: "Mozilla/5.0 (Android 15; Mobile; rv:{v}) Gecko/{v} Firefox/{v}",
    versions: firefox.slice(0, 2),
    engine: "gecko",
  },
  {
    device: "mobile",
    weight: 2,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram {v} (iPhone16,2; iOS 26_0; en_US; en; scale=3.00; 1290x2796; 745190313)",
    versions: [["399.0.0.23.84", 1]],
    engine: "webkit",
  },
  {
    device: "mobile",
    weight: 1.5,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/{v}",
    versions: [["9.31.2215", 1]],
    engine: "webkit",
  },
  {
    // iPhones that stopped at iOS 15 still browse, without fetch metadata.
    device: "mobile",
    weight: 0.8,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/{v} Mobile/15E148 Safari/604.1",
    versions: [["15.6.6", 1]],
    engine: "webkit",
    noFetchMetadata: true,
  },
  {
    device: "tablet",
    weight: 60,
    ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{v}.0.0.0 Safari/537.36",
    versions: chrome,
    hints: { brand: "Google Chrome", platform: "Android" },
    engine: "chromium",
  },
  {
    device: "tablet",
    weight: 40,
    ua: "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/{v} Mobile/15E148 Safari/604.1",
    versions: [["152.0.7401.53", 1]],
    engine: "webkit",
  },
];

export type BotWork =
  | "crawl"
  | "preview"
  | "survey"
  | "probe"
  | "monitor"
  | "feed"
  | "tool"
  | "render";

export interface Bot {
  name: string;
  ua: string[];
  network: string;
  /** Requests a day per shape, or bursts for probes; none for absent. */
  daily: Partial<Record<Shape, number>>;
  work: BotWork;
  headers?: [string, string][];
}

// Scanners mostly borrow an old browser's name; a few say who they are.
const scannerAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 6.0; HTC One M9 Build/MRA41S) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.98 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko",
  "Mozilla/5.0 zgrab/0.x",
  "python-requests/2.32.3",
  "Go-http-client/1.1",
  "l9explore/1.2.2",
  "Mozilla/5.0 (l9scan/2.0.0; +https://leakix.net)",
];

export const BOTS: Bot[] = [
  {
    name: "Googlebot",
    ua: [
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7401.68 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    ],
    network: "googlebot",
    daily: { busy: 230, spa: 35, tiny: 9, api: 8 },
    work: "crawl",
    headers: [["from", "googlebot(at)googlebot.com"]],
  },
  {
    name: "bingbot",
    ua: [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36",
    ],
    network: "bingbot",
    daily: { busy: 110, spa: 20, tiny: 6, api: 4 },
    work: "crawl",
  },
  {
    name: "GPTBot",
    ua: [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    ],
    network: "openai",
    daily: { busy: 70, spa: 10, tiny: 5, api: 6 },
    work: "crawl",
  },
  {
    name: "OAI-SearchBot",
    ua: [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
    ],
    network: "openai",
    daily: { busy: 20, spa: 4, tiny: 1, api: 2 },
    work: "crawl",
  },
  {
    name: "ChatGPT-User",
    ua: [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
    ],
    network: "openai",
    daily: { busy: 15, spa: 3, api: 5 },
    work: "crawl",
  },
  {
    name: "ClaudeBot",
    ua: [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    ],
    network: "aws",
    daily: { busy: 45, spa: 6, tiny: 3, api: 3 },
    work: "crawl",
  },
  {
    name: "PerplexityBot",
    ua: [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
    ],
    network: "aws",
    daily: { busy: 10, api: 2 },
    work: "crawl",
  },
  {
    name: "Applebot",
    ua: [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
    ],
    network: "apple",
    daily: { busy: 15, spa: 3, tiny: 1 },
    work: "crawl",
  },
  {
    name: "YandexBot",
    ua: ["Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)"],
    network: "yandex",
    daily: { busy: 12, tiny: 2 },
    work: "crawl",
  },
  {
    name: "DuckDuckBot",
    ua: ["DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)"],
    network: "azure",
    daily: { busy: 6, tiny: 1 },
    work: "crawl",
  },
  {
    name: "AhrefsBot",
    ua: ["Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)"],
    network: "ahrefs",
    daily: { busy: 140, spa: 15, tiny: 10, api: 5 },
    work: "crawl",
  },
  {
    name: "SemrushBot",
    ua: [
      "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
    ],
    network: "semrush",
    daily: { busy: 70, spa: 8, tiny: 5 },
    work: "crawl",
  },
  {
    name: "DotBot",
    ua: [
      "Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot; help@moz.com)",
    ],
    network: "moz",
    daily: { busy: 25, tiny: 3 },
    work: "crawl",
  },
  {
    name: "UptimeRobot",
    ua: [
      "Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
    ],
    network: "uptimerobot",
    // One check every five minutes.
    daily: { busy: 288, spa: 288, api: 288 },
    work: "monitor",
  },
  // Link previews, when someone shares a page.
  {
    name: "Slackbot",
    ua: ["Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"],
    network: "aws",
    daily: { busy: 4, spa: 3, tiny: 0.3, api: 1 },
    work: "preview",
  },
  {
    name: "Twitterbot",
    ua: ["Twitterbot/1.0"],
    network: "twitter",
    daily: { busy: 5, spa: 1, tiny: 0.3 },
    work: "preview",
  },
  {
    name: "facebookexternalhit",
    ua: [
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "WhatsApp/2.23.20.0",
    ],
    network: "meta",
    daily: { busy: 4, spa: 1, tiny: 0.5 },
    work: "preview",
  },
  {
    name: "LinkedInBot",
    ua: [
      "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
    ],
    network: "azure",
    daily: { busy: 3, spa: 1, tiny: 0.5 },
    work: "preview",
  },
  {
    name: "Discordbot",
    ua: ["Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"],
    network: "aws",
    daily: { busy: 2, spa: 1 },
    work: "preview",
  },
  // Feed readers poll the feed all day.
  {
    name: "Feedly",
    ua: ["Feedly/1.0 (+http://www.feedly.com/fetcher.html; 14 subscribers; )"],
    network: "aws",
    daily: { busy: 24, tiny: 12 },
    work: "feed",
  },
  {
    name: "NewsBlur",
    ua: [
      "NewsBlur Feed Fetcher - 3 subscribers - https://www.newsblur.com/site/6120451/blog (Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1 Safari/605.1.15)",
    ],
    network: "digitalocean",
    daily: { busy: 12, tiny: 6 },
    work: "feed",
  },
  // A screenshot or link-checking service. It sends a browser's full fetch
  // metadata; only its name gives it away.
  {
    name: "HeadlessChrome",
    ua: [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/152.0.0.0 Safari/537.36",
    ],
    network: "hetzner",
    daily: { busy: 12, spa: 4 },
    work: "render",
  },
  // People and scripts trying things by hand.
  {
    name: "curl",
    ua: ["curl/8.5.0", "curl/7.81.0", "curl/8.7.1", "Wget/1.21.4"],
    network: "*",
    daily: { busy: 10, spa: 6, tiny: 3, api: 6 },
    work: "tool",
  },
  {
    name: "python-requests",
    ua: ["python-requests/2.32.3", "python-requests/2.31.0", "axios/1.7.9"],
    network: "*",
    daily: { busy: 8, spa: 4, tiny: 2, api: 5 },
    work: "tool",
  },
  // Surveys of the whole address space; they ask for the front page.
  {
    name: "CensysInspect",
    ua: [
      "Mozilla/5.0 (compatible; CensysInspect/1.1; +https://about.censys.io/)",
    ],
    network: "censys",
    daily: { busy: 6, spa: 6, tiny: 6, api: 6 },
    work: "survey",
  },
  {
    name: "Expanse",
    ua: [
      "Expanse, a Palo Alto Networks company, searches across the global IPv4 space multiple times per day to identify customers&#39; presences on the Internet. If you would like to be excluded from our scans, please contact us at scaninfo@paloaltonetworks.com",
    ],
    network: "paloalto",
    daily: { busy: 4, spa: 4, tiny: 4, api: 4 },
    work: "survey",
  },
  // Scanners looking for something to break into; `daily` counts bursts.
  {
    name: "scanner",
    ua: scannerAgents,
    network: "scanners",
    daily: { busy: 12, spa: 10, tiny: 8, api: 10 },
    work: "probe",
  },
];

/** Where scanners come from. */
export const SCANNER_NETWORKS = [
  "ipvolume",
  "chinanet",
  "huawei",
  "alibaba",
  "digitalocean",
  "digitalocean-nl",
  "ovh",
  "hetzner",
  "selectel",
  "aws",
];

/** Paths scanners try, whatever the site is. */
export const PROBES = [
  "/wp-login.php",
  "/xmlrpc.php",
  "/wp-admin/setup-config.php",
  "/wp-includes/wlwmanifest.xml",
  "/.env",
  "/.env.production",
  "/api/.env",
  "/.git/config",
  "/.git/HEAD",
  "/.aws/credentials",
  "/config.json",
  "/phpinfo.php",
  "/info.php",
  "/phpmyadmin/",
  "/admin/",
  "/administrator/index.php",
  "/cgi-bin/luci/;stok=/locale",
  "/boaform/admin/formLogin",
  "/HNAP1/",
  "/owa/auth/logon.aspx",
  "/autodiscover/autodiscover.json",
  "/actuator/env",
  "/actuator/health",
  "/server-status",
  "/.DS_Store",
  "/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php",
  "/solr/admin/info/system",
  "/_ignition/execute-solution",
  "/telescope/requests",
  "/.vscode/sftp.json",
  "/sftp-config.json",
  "/backup.zip",
  "/db.sql",
  "/wp-config.php.bak",
  "/containers/json",
  "/v2/_catalog",
  "/remote/login",
  "/global-protect/login.esp",
  "/+CSCOE+/logon.html",
  "/?XDEBUG_SESSION_START=phpstorm",
  '/index.php?lang=../../../../../../../../usr/local/lib/php/pearcmd&+config-create+/&/<?echo(md5("hi"));?>+/tmp/index1.php',
];

export interface Source {
  name: string;
  weight: number;
  /** What the browser sends as Referer; null sends none. */
  referrers: [string | null, number][];
  /** A query string on the landing address, "" for none. */
  queries?: [string, number][];
  /** Which sections of the site visitors from here land in. */
  lands: Record<string, number>;
  /** The share of visitors on phones. */
  mobile: number;
  audience: string;
}

const google: [string | null, number][] = [
  ["https://www.google.com/", 80],
  ["https://www.google.co.uk/", 5],
  ["https://www.google.de/", 5],
  ["https://www.google.co.in/", 5],
  ["android-app://com.google.android.googlequicksearchbox/", 5],
];

/** Sources for sites people find; each shape takes the ones it has. */
export const SOURCES: Record<string, Omit<Source, "weight" | "lands">> = {
  direct: { name: "direct", referrers: [[null, 1]], mobile: 0.4, audience: "" },
  google: {
    name: "google",
    referrers: google,
    // Google's shopping results tag organic links with srsltid.
    queries: [
      ["", 94],
      ["srsltid=AfmBOoqT3vZr9a7k2xQe1Lw8bN5yHc0dPsgU6jFmR4tE", 6],
    ],
    mobile: 0.45,
    audience: "",
  },
  bing: {
    name: "bing",
    referrers: [["https://www.bing.com/", 1]],
    mobile: 0.2,
    audience: "",
  },
  duckduckgo: {
    name: "duckduckgo",
    referrers: [["https://duckduckgo.com/", 1]],
    mobile: 0.3,
    audience: "",
  },
  github: {
    name: "github",
    referrers: [["https://github.com/", 1]],
    mobile: 0.12,
    audience: "",
  },
  hn: {
    name: "hn",
    referrers: [["https://news.ycombinator.com/", 1]],
    mobile: 0.3,
    audience: "hn",
  },
  x: {
    name: "x",
    referrers: [["https://t.co/", 1]],
    queries: [
      ["", 70],
      ["utm_source=twitter&utm_medium=social&utm_campaign=autumn-launch", 30],
    ],
    mobile: 0.72,
    audience: "",
  },
  reddit: {
    name: "reddit",
    referrers: [
      ["https://www.reddit.com/", 80],
      ["android-app://com.reddit.frontpage/", 20],
    ],
    mobile: 0.68,
    audience: "",
  },
  linkedin: {
    name: "linkedin",
    referrers: [
      ["https://www.linkedin.com/", 70],
      ["https://lnkd.in/", 15],
      ["android-app://com.linkedin.android/", 15],
    ],
    queries: [
      ["", 60],
      ["utm_source=linkedin&utm_medium=social", 40],
    ],
    mobile: 0.6,
    audience: "",
  },
  chatgpt: {
    name: "chatgpt",
    referrers: [["https://chatgpt.com/", 1]],
    // ChatGPT tags every link it gives out.
    queries: [["utm_source=chatgpt.com", 1]],
    mobile: 0.3,
    audience: "",
  },
  perplexity: {
    name: "perplexity",
    referrers: [["https://www.perplexity.ai/", 1]],
    mobile: 0.3,
    audience: "",
  },
  bluesky: {
    name: "bluesky",
    referrers: [["https://bsky.app/", 1]],
    mobile: 0.6,
    audience: "",
  },
  devto: {
    name: "devto",
    referrers: [["https://dev.to/", 1]],
    mobile: 0.35,
    audience: "",
  },
  producthunt: {
    name: "producthunt",
    referrers: [["https://www.producthunt.com/", 1]],
    queries: [["ref=producthunt", 1]],
    mobile: 0.35,
    audience: "",
  },
  instagram: {
    name: "instagram",
    referrers: [["https://l.instagram.com/", 1]],
    queries: [
      [
        "utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=PAZXh0bgNhZW0CMTEAAabc1234fixtureTokenXYZ",
        1,
      ],
    ],
    mobile: 0.95,
    audience: "",
  },
  // A password-reset link opened from an email: the token is the kind of
  // query string that must never reach a log, and the next page's requests
  // carry it in their Referer.
  reset: {
    name: "reset",
    referrers: [[null, 1]],
    queries: [["token={token}", 1]],
    mobile: 0.5,
    audience: "",
  },
  // The newsletter's issue number is filled in per send.
  newsletter: {
    name: "newsletter",
    referrers: [
      [null, 85],
      ["https://mail.google.com/", 15],
    ],
    queries: [
      ["utm_source=newsletter&utm_medium=email&utm_campaign={issue}", 1],
    ],
    mobile: 0.55,
    audience: "",
  },
};

export interface Page {
  path: string;
  section: string;
  weight: number;
}

export interface Asset {
  path: string;
  dest: "style" | "script" | "font" | "image" | "manifest";
  type: string;
  /** Bytes as sent: compressed for text. */
  size: number;
  /** Named with a build hash, cached for good and changed on release. */
  hashed?: boolean;
}

export interface Endpoint {
  method: string;
  path: string;
  weight: number;
  type: string;
  size: number;
  /** Typical milliseconds. */
  ms: number;
  /** Other statuses and their shares; the rest succeed. */
  fails?: [number, number][];
  /** The success status when not 200. */
  ok?: number;
}

export interface ShapeData {
  describe: string;
  audience: string;
  /** Browsers a day at the start of the window, before the week's rhythm. */
  visitors: number;
  /** Growth per day, as a factor. */
  growth: number;
  /** Sunday to Saturday. */
  weekday: number[];
  /** Local hour weights, midnight to 23:00. */
  hours: number[];
  /** People who come back: how many, and their mean chance a day. */
  regulars: { count: number; chance: number };
  sources: { source: string; weight: number; lands: Record<string, number> }[];
  pages: Page[];
  /** Which section a visitor moves to next, from each section. */
  moves: Record<string, Record<string, number>>;
  assets: Record<string, Asset[]>;
  api: Endpoint[];
  /** What the application answers with its own server name. */
  upstream: [string, string][];
  /** Paths that fail for a while after a release. */
  bug: string[];
}

const office = [
  0.5, 0.3, 0.2, 0.2, 0.2, 0.4, 0.8, 1.6, 2.6, 3.1, 3.2, 3.1, 2.7, 2.9, 3.1,
  3.0, 2.8, 2.3, 1.6, 1.2, 1.1, 1.0, 0.8, 0.6,
];
const evening = [
  0.9, 0.55, 0.35, 0.25, 0.22, 0.3, 0.55, 1.0, 1.6, 2.1, 2.4, 2.5, 2.4, 2.4,
  2.5, 2.5, 2.3, 2.0, 1.8, 1.9, 2.0, 1.9, 1.6, 1.2,
];

const blogPosts = [
  "self-hosting-without-tears",
  "introducing-workspaces",
  "how-we-cut-our-cloud-bill-in-half",
  "postgres-row-level-security-in-practice",
  "shipping-a-cli-in-go",
  "what-we-learned-from-1000-signups",
  "the-case-for-boring-technology",
  "designing-calm-notifications",
  "sqlite-in-production",
  "a-year-of-remote-work",
  "release-notes-september",
  "hiring-our-first-designer",
];

/** The post that reaches the front page of Hacker News. */
export const HN_POST = `/blog/${blogPosts[0]}`;

const siteAssets: Asset[] = [
  {
    path: "/assets/site-{hash}.css",
    dest: "style",
    type: "text/css; charset=utf-8",
    size: 9_800,
    hashed: true,
  },
  {
    path: "/assets/site-{hash}.js",
    dest: "script",
    type: "text/javascript; charset=utf-8",
    size: 21_400,
    hashed: true,
  },
  {
    path: "/assets/vendor-{hash}.js",
    dest: "script",
    type: "text/javascript; charset=utf-8",
    size: 48_200,
    hashed: true,
  },
  {
    path: "/fonts/inter-var-{hash}.woff2",
    dest: "font",
    type: "font/woff2",
    size: 48_256,
    hashed: true,
  },
  {
    path: "/images/logo.svg",
    dest: "image",
    type: "image/svg+xml",
    size: 1_830,
  },
  { path: "/favicon.ico", dest: "image", type: "image/x-icon", size: 15_086 },
];

export const SHAPE_DATA: Record<Shape, ShapeData> = {
  busy: {
    describe:
      "a small software company's site: pages, a blog, docs and an app behind a login",
    audience: "web",
    visitors: 420,
    growth: 1.012,
    weekday: [0.66, 1.0, 1.06, 1.05, 1.03, 0.93, 0.62],
    hours: evening,
    regulars: { count: 700, chance: 0.12 },
    sources: [
      { source: "direct", weight: 30, lands: { home: 7, blog: 1, app: 1 } },
      {
        source: "google",
        weight: 27,
        lands: { blog: 5, docs: 4, home: 2, pricing: 1 },
      },
      { source: "bing", weight: 3, lands: { blog: 3, docs: 2, home: 1 } },
      { source: "duckduckgo", weight: 3, lands: { docs: 3, blog: 2 } },
      { source: "github", weight: 6, lands: { docs: 4, home: 2 } },
      { source: "x", weight: 4, lands: { blog: 4, home: 1 } },
      { source: "reddit", weight: 4, lands: { blog: 5 } },
      { source: "linkedin", weight: 3, lands: { blog: 2, home: 1, about: 1 } },
      { source: "chatgpt", weight: 4, lands: { docs: 4, pricing: 2, home: 1 } },
      { source: "perplexity", weight: 1, lands: { docs: 2, pricing: 1 } },
      { source: "hn", weight: 1, lands: { blog: 4, home: 1 } },
      { source: "bluesky", weight: 1.5, lands: { blog: 3 } },
      { source: "devto", weight: 1, lands: { blog: 3 } },
      { source: "newsletter", weight: 1.5, lands: { blog: 4, pricing: 1 } },
      { source: "reset", weight: 0.4, lands: { reset: 1 } },
    ],
    pages: [
      { path: "/", section: "home", weight: 1 },
      { path: "/pricing", section: "pricing", weight: 1 },
      { path: "/reset-password", section: "reset", weight: 1 },
      { path: "/features", section: "home", weight: 0.6 },
      { path: "/customers", section: "home", weight: 0.3 },
      { path: "/changelog", section: "home", weight: 0.3 },
      { path: "/about", section: "about", weight: 1 },
      { path: "/careers", section: "about", weight: 0.4 },
      { path: "/contact", section: "about", weight: 0.3 },
      { path: "/security", section: "about", weight: 0.2 },
      { path: "/privacy", section: "about", weight: 0.15 },
      { path: "/terms", section: "about", weight: 0.1 },
      { path: "/blog", section: "blog", weight: 1.2 },
      ...blogPosts.map((slug, index) => ({
        path: `/blog/${slug}`,
        section: "blog",
        weight: 1 / (1 + index * 0.35),
      })),
      { path: "/docs", section: "docs", weight: 1.2 },
      ...[
        "getting-started",
        "installation",
        "configuration",
        "api",
        "api/authentication",
        "api/webhooks",
        "guides/import",
        "guides/teams",
        "faq",
      ].map((page, index) => ({
        path: `/docs/${page}`,
        section: "docs",
        weight: 1 / (1 + index * 0.25),
      })),
      { path: "/login", section: "auth", weight: 1 },
      { path: "/signup", section: "auth", weight: 0.5 },
      { path: "/app", section: "app", weight: 1 },
      { path: "/app/projects", section: "app", weight: 0.8 },
      { path: "/app/projects/{id}", section: "app", weight: 1.4 },
      { path: "/app/settings", section: "app", weight: 0.2 },
      { path: "/app/billing", section: "app", weight: 0.1 },
      { path: "/checkout", section: "app", weight: 0.08 },
    ],
    moves: {
      home: { pricing: 3, home: 2, docs: 1.5, blog: 1, auth: 1.5, about: 0.5 },
      pricing: { auth: 3, home: 1, docs: 1, about: 0.4 },
      blog: { blog: 3, home: 1.2, pricing: 0.8, docs: 0.5 },
      docs: { docs: 6, pricing: 0.5, home: 0.5, auth: 0.5 },
      about: { home: 2, about: 1, blog: 1 },
      auth: { app: 6, home: 0.5 },
      reset: { auth: 1 },
      app: { app: 1 },
    },
    assets: {
      "*": siteAssets,
      home: [
        {
          path: "/images/hero-{hash}.avif",
          dest: "image",
          type: "image/avif",
          size: 86_120,
          hashed: true,
        },
      ],
      blog: [
        {
          path: "/images/blog/cover.avif",
          dest: "image",
          type: "image/avif",
          size: 64_540,
        },
      ],
      docs: [
        {
          path: "/assets/docs-{hash}.js",
          dest: "script",
          type: "text/javascript; charset=utf-8",
          size: 12_900,
          hashed: true,
        },
      ],
      app: [
        {
          path: "/assets/app-{hash}.js",
          dest: "script",
          type: "text/javascript; charset=utf-8",
          size: 96_300,
          hashed: true,
        },
        {
          path: "/assets/app-{hash}.css",
          dest: "style",
          type: "text/css; charset=utf-8",
          size: 14_100,
          hashed: true,
        },
      ],
    },
    api: [
      {
        method: "GET",
        path: "/api/session",
        weight: 3,
        type: "application/json",
        size: 412,
        ms: 18,
      },
      {
        method: "GET",
        path: "/api/projects",
        weight: 2,
        type: "application/json",
        size: 5_900,
        ms: 46,
      },
      {
        method: "GET",
        path: "/api/projects/{id}",
        weight: 2,
        type: "application/json",
        size: 3_100,
        ms: 38,
      },
      {
        method: "GET",
        path: "/api/projects/{id}/activity",
        weight: 1,
        type: "application/json",
        size: 8_200,
        ms: 95,
      },
      {
        method: "GET",
        path: "/api/notifications",
        weight: 1.5,
        type: "application/json",
        size: 740,
        ms: 22,
      },
      {
        method: "POST",
        path: "/api/projects/{id}/tasks",
        weight: 0.6,
        type: "application/json",
        size: 380,
        ms: 64,
        ok: 201,
        fails: [[422, 0.04]],
      },
      {
        method: "POST",
        path: "/api/checkout",
        weight: 0.1,
        type: "application/json",
        size: 220,
        ms: 380,
        fails: [[402, 0.08]],
      },
    ],
    upstream: [["X-Powered-By", "Express"]],
    // A release breaks the pricing page's new template for a while.
    bug: ["/pricing", "/checkout", "/api/checkout"],
  },
  spa: {
    describe:
      "a single-page project tracker: one document, then routes change in the browser",
    audience: "europe",
    visitors: 45,
    growth: 1.008,
    weekday: [0.4, 1.0, 1.08, 1.07, 1.05, 0.9, 0.38],
    hours: office,
    regulars: { count: 360, chance: 0.42 },
    sources: [
      { source: "direct", weight: 45, lands: { home: 3, auth: 4, app: 3 } },
      { source: "google", weight: 22, lands: { home: 5, auth: 1 } },
      { source: "linkedin", weight: 6, lands: { home: 3 } },
      { source: "github", weight: 5, lands: { home: 3 } },
      { source: "x", weight: 3, lands: { home: 3 } },
      { source: "producthunt", weight: 3, lands: { home: 3 } },
      { source: "chatgpt", weight: 3, lands: { home: 3 } },
      { source: "bing", weight: 2, lands: { home: 3 } },
      { source: "newsletter", weight: 3, lands: { app: 2, home: 1 } },
    ],
    pages: [
      { path: "/", section: "home", weight: 1 },
      { path: "/pricing", section: "home", weight: 0.4 },
      { path: "/login", section: "auth", weight: 1 },
      { path: "/signup", section: "auth", weight: 0.35 },
      { path: "/app", section: "app", weight: 1.2 },
      { path: "/app/inbox", section: "app", weight: 0.8 },
      { path: "/app/projects", section: "app", weight: 0.9 },
      { path: "/app/projects/{id}", section: "app", weight: 1.6 },
      { path: "/app/projects/{id}/board", section: "app", weight: 1.3 },
      { path: "/app/projects/{id}/settings", section: "app", weight: 0.15 },
      { path: "/app/settings", section: "app", weight: 0.2 },
      { path: "/app/settings/billing", section: "app", weight: 0.08 },
      { path: "/app/team", section: "app", weight: 0.2 },
    ],
    moves: {
      home: { auth: 3, home: 1 },
      auth: { app: 6 },
      app: { app: 1 },
    },
    assets: {
      "*": [
        {
          path: "/assets/index-{hash}.js",
          dest: "script",
          type: "text/javascript; charset=utf-8",
          size: 128_700,
          hashed: true,
        },
        {
          path: "/assets/vendor-{hash}.js",
          dest: "script",
          type: "text/javascript; charset=utf-8",
          size: 61_300,
          hashed: true,
        },
        {
          path: "/assets/index-{hash}.css",
          dest: "style",
          type: "text/css; charset=utf-8",
          size: 11_800,
          hashed: true,
        },
        {
          path: "/fonts/inter-{hash}.woff2",
          dest: "font",
          type: "font/woff2",
          size: 47_900,
          hashed: true,
        },
        {
          path: "/favicon.svg",
          dest: "image",
          type: "image/svg+xml",
          size: 1_210,
        },
      ],
      // Routes load their own chunk the first time they are shown.
      board: [
        {
          path: "/assets/Board-{hash}.js",
          dest: "script",
          type: "text/javascript; charset=utf-8",
          size: 22_100,
          hashed: true,
        },
      ],
      settings: [
        {
          path: "/assets/Settings-{hash}.js",
          dest: "script",
          type: "text/javascript; charset=utf-8",
          size: 9_400,
          hashed: true,
        },
      ],
    },
    api: [
      {
        method: "GET",
        path: "/api/me",
        weight: 3,
        type: "application/json",
        size: 530,
        ms: 16,
      },
      {
        method: "GET",
        path: "/api/projects",
        weight: 2,
        type: "application/json",
        size: 4_800,
        ms: 41,
      },
      {
        method: "GET",
        path: "/api/projects/{id}",
        weight: 2,
        type: "application/json",
        size: 2_700,
        ms: 35,
      },
      {
        method: "GET",
        path: "/api/projects/{id}/tasks",
        weight: 2.5,
        type: "application/json",
        size: 18_400,
        ms: 88,
      },
      {
        method: "GET",
        path: "/api/inbox",
        weight: 1,
        type: "application/json",
        size: 6_100,
        ms: 57,
      },
      {
        method: "GET",
        path: "/api/notifications/unread",
        weight: 2,
        type: "application/json",
        size: 96,
        ms: 9,
      },
      {
        method: "POST",
        path: "/api/projects/{id}/tasks",
        weight: 0.7,
        type: "application/json",
        size: 610,
        ms: 72,
        ok: 201,
        fails: [[422, 0.03]],
      },
      {
        method: "PATCH",
        path: "/api/tasks/{id}",
        weight: 1.2,
        type: "application/json",
        size: 590,
        ms: 48,
        fails: [[409, 0.02]],
      },
    ],
    upstream: [["Server", "nginx/1.30.5"]],
    bug: ["/api/projects/"],
  },
  tiny: {
    describe: "a personal site: a few pages, some posts and a CV",
    audience: "personal",
    visitors: 1.1,
    growth: 1.0,
    weekday: [0.9, 1.05, 1.05, 1.05, 1.05, 1.0, 0.85],
    hours: evening,
    regulars: { count: 4, chance: 0.12 },
    sources: [
      { source: "direct", weight: 40, lands: { home: 3, posts: 1 } },
      { source: "google", weight: 28, lands: { posts: 4, home: 1 } },
      { source: "github", weight: 15, lands: { home: 3, projects: 2 } },
      { source: "linkedin", weight: 12, lands: { home: 2, cv: 1 } },
      { source: "duckduckgo", weight: 3, lands: { posts: 3 } },
      { source: "bing", weight: 2, lands: { posts: 3 } },
    ],
    pages: [
      { path: "/", section: "home", weight: 1 },
      { path: "/about", section: "home", weight: 0.6 },
      { path: "/projects", section: "projects", weight: 1 },
      { path: "/contact", section: "home", weight: 0.2 },
      { path: "/posts", section: "posts", weight: 0.8 },
      ...[
        "notes-on-sqlite",
        "moving-to-sofia",
        "my-2026-setup",
        "learning-rust-in-a-month",
        "building-a-keyboard",
        "hello-world",
      ].map((slug, index) => ({
        path: `/posts/${slug}`,
        section: "posts",
        weight: 1 / (1 + index * 0.5),
      })),
      // A PDF opened in the browser is a document navigation too.
      { path: "/cv.pdf", section: "cv", weight: 1 },
    ],
    moves: {
      home: { projects: 2, posts: 2, cv: 1, home: 1 },
      projects: { home: 1, posts: 1 },
      posts: { posts: 2, home: 1 },
      cv: { home: 1 },
    },
    assets: {
      "*": [
        {
          path: "/style.css",
          dest: "style",
          type: "text/css; charset=utf-8",
          size: 2_900,
        },
        {
          path: "/favicon.ico",
          dest: "image",
          type: "image/x-icon",
          size: 4_286,
        },
      ],
      home: [
        { path: "/me.jpg", dest: "image", type: "image/jpeg", size: 41_800 },
      ],
      posts: [
        {
          path: "/posts/cover.jpg",
          dest: "image",
          type: "image/jpeg",
          size: 88_400,
        },
      ],
    },
    api: [],
    upstream: [["Server", "nginx/1.30.5"]],
    bug: [],
  },
  api: {
    describe:
      "a JSON API with a docs site, used by a mobile app, integrations and webhooks",
    audience: "web",
    visitors: 30,
    growth: 1.01,
    weekday: [0.8, 1.0, 1.05, 1.05, 1.02, 0.97, 0.78],
    hours: evening,
    regulars: { count: 30, chance: 0.2 },
    sources: [
      { source: "google", weight: 40, lands: { docs: 4 } },
      { source: "direct", weight: 30, lands: { docs: 3 } },
      { source: "github", weight: 20, lands: { docs: 3 } },
      { source: "chatgpt", weight: 10, lands: { docs: 3 } },
    ],
    pages: [
      { path: "/docs", section: "docs", weight: 1.5 },
      ...[
        "quickstart",
        "authentication",
        "items",
        "errors",
        "rate-limits",
        "webhooks",
        "changelog",
      ].map((page, index) => ({
        path: `/docs/${page}`,
        section: "docs",
        weight: 1 / (1 + index * 0.3),
      })),
    ],
    moves: { docs: { docs: 1 } },
    assets: {
      "*": [
        {
          path: "/docs/assets/docs-{hash}.css",
          dest: "style",
          type: "text/css; charset=utf-8",
          size: 7_300,
          hashed: true,
        },
        {
          path: "/docs/assets/docs-{hash}.js",
          dest: "script",
          type: "text/javascript; charset=utf-8",
          size: 18_600,
          hashed: true,
        },
        {
          path: "/favicon.ico",
          dest: "image",
          type: "image/x-icon",
          size: 4_286,
        },
      ],
    },
    // What the API's own clients call, by weight.
    api: [
      {
        method: "GET",
        path: "/v1/config",
        weight: 3,
        type: "application/json",
        size: 1_240,
        ms: 12,
      },
      {
        method: "GET",
        path: "/v1/me",
        weight: 4,
        type: "application/json",
        size: 610,
        ms: 14,
        fails: [[401, 0.03]],
      },
      {
        method: "GET",
        path: "/v1/items",
        weight: 10,
        type: "application/json",
        size: 14_800,
        ms: 52,
        fails: [[429, 0.01]],
      },
      {
        method: "GET",
        path: "/v1/items/{id}",
        weight: 8,
        type: "application/json",
        size: 2_100,
        ms: 24,
        fails: [[404, 0.03]],
      },
      {
        method: "POST",
        path: "/v1/items",
        weight: 2.5,
        type: "application/json",
        size: 2_050,
        ms: 61,
        ok: 201,
        fails: [
          [422, 0.05],
          [429, 0.01],
        ],
      },
      {
        method: "PATCH",
        path: "/v1/items/{id}",
        weight: 2,
        type: "application/json",
        size: 2_080,
        ms: 55,
        fails: [
          [409, 0.02],
          [422, 0.02],
        ],
      },
      {
        method: "DELETE",
        path: "/v1/items/{id}",
        weight: 0.6,
        type: "",
        size: 0,
        ms: 33,
        ok: 204,
        fails: [[404, 0.05]],
      },
      {
        method: "GET",
        path: "/v1/items/{id}/history",
        weight: 1,
        type: "application/json",
        size: 6_900,
        ms: 140,
      },
      {
        method: "GET",
        path: "/v1/search",
        weight: 2.5,
        type: "application/json",
        size: 9_300,
        ms: 180,
      },
      {
        method: "POST",
        path: "/v1/sync",
        weight: 3,
        type: "application/json",
        size: 3_400,
        ms: 95,
      },
      {
        method: "POST",
        path: "/v1/auth/token",
        weight: 1,
        type: "application/json",
        size: 890,
        ms: 120,
        fails: [[401, 0.12]],
      },
      {
        method: "GET",
        path: "/v1/reports/{id}",
        weight: 0.4,
        type: "application/json",
        size: 44_100,
        ms: 820,
        fails: [[504, 0.01]],
      },
    ],
    upstream: [],
    bug: ["/v1/reports/", "/v1/sync"],
  },
};

/** The API's own clients: how many of each, and how busy. */
export const API_CLIENTS: {
  ua: string;
  count: number;
  /** The chance a client is active on a given day. */
  active: number;
  /** Requests on a day it is active, on average. */
  daily: number;
  /** Phones use people's networks; servers a hosting network. */
  from: string;
}[] = [
  {
    ua: "Tasklane/3.14.0 (com.tasklane.ios; build:31400; iOS 18.6.0) Alamofire/5.10.2",
    count: 130,
    active: 0.55,
    daily: 38,
    from: "people",
  },
  { ua: "okhttp/4.12.0", count: 120, active: 0.5, daily: 34, from: "people" },
  {
    ua: "tasklane-python/2.3.0",
    count: 6,
    active: 0.9,
    daily: 160,
    from: "aws",
  },
  {
    ua: "tasklane-node/1.9.1",
    count: 5,
    active: 0.9,
    daily: 120,
    from: "hetzner",
  },
  {
    ua: "Go-http-client/2.0",
    count: 2,
    active: 1,
    daily: 220,
    from: "digitalocean",
  },
  { ua: "Zapier", count: 1, active: 1, daily: 90, from: "aws" },
];

/** Webhook senders post to the API; they are clients, not browsers. */
export const WEBHOOKS = [
  {
    ua: "Stripe/1.0 (+https://stripe.com/docs/webhooks)",
    path: "/v1/webhooks/stripe",
    daily: 45,
  },
  {
    ua: "GitHub-Hookshot/f3a9c1e",
    path: "/v1/webhooks/github",
    daily: 25,
  },
];

/** How long people stay on a section's pages, and the chance they go on. */
export const SECTIONS: Record<string, { dwell: number; stay: number }> = {
  home: { dwell: 25, stay: 0.55 },
  pricing: { dwell: 45, stay: 0.5 },
  blog: { dwell: 95, stay: 0.3 },
  docs: { dwell: 70, stay: 0.62 },
  about: { dwell: 30, stay: 0.4 },
  auth: { dwell: 20, stay: 0.85 },
  reset: { dwell: 35, stay: 0.9 },
  app: { dwell: 50, stay: 0.84 },
  posts: { dwell: 110, stay: 0.3 },
  projects: { dwell: 40, stay: 0.45 },
  cv: { dwell: 60, stay: 0.2 },
};

/** Screen widths in CSS pixels, as the script reports them. */
export const WIDTHS: Record<Device, number[]> = {
  desktop: [1280, 1366, 1440, 1440, 1536, 1680, 1920, 1920, 2560],
  mobile: [360, 375, 390, 393, 393, 412, 414, 430],
  tablet: [768, 810, 820, 1024],
};
