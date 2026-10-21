// IOC country codes (used by kendo federations, e.g. BUL, SRB, GER).

export interface Country {
  /** IOC code, e.g. "BUL". */
  code: string
  /** English name, e.g. "Bulgaria". */
  name: string
  /** Other spellings people type: ISO alpha-3 code when it differs, native/local names, common short forms. Lowercase not required. */
  aliases: string[]
}

export const COUNTRIES: readonly Country[] = [
  { code: "AFG", name: "Afghanistan", aliases: [] },
  { code: "ALB", name: "Albania", aliases: ["Shqipëria", "Shqiperia"] },
  { code: "ALG", name: "Algeria", aliases: ["DZA", "Algérie", "Al Jazair"] },
  { code: "ASA", name: "American Samoa", aliases: ["ASM"] },
  { code: "AND", name: "Andorra", aliases: ["Principat d'Andorra"] },
  { code: "ANG", name: "Angola", aliases: ["AGO"] },
  { code: "ANT", name: "Antigua and Barbuda", aliases: ["ATG", "Antigua & Barbuda"] },
  { code: "ARG", name: "Argentina", aliases: [] },
  { code: "ARM", name: "Armenia", aliases: ["Hayastan", "Հայաստան"] },
  { code: "ARU", name: "Aruba", aliases: ["ABW"] },
  { code: "AUS", name: "Australia", aliases: [] },
  { code: "AUT", name: "Austria", aliases: ["Österreich", "Osterreich"] },
  { code: "AZE", name: "Azerbaijan", aliases: ["Azərbaycan", "Azerbaycan"] },
  { code: "BAH", name: "Bahamas", aliases: ["BHS", "The Bahamas"] },
  { code: "BRN", name: "Bahrain", aliases: ["BHR"] },
  { code: "BAN", name: "Bangladesh", aliases: ["BGD"] },
  { code: "BAR", name: "Barbados", aliases: ["BRB"] },
  { code: "BLR", name: "Belarus", aliases: ["Беларусь", "Belarus'", "Byelorussia"] },
  { code: "BEL", name: "Belgium", aliases: ["België", "Belgie", "Belgique", "Belgien"] },
  { code: "BIZ", name: "Belize", aliases: ["BLZ"] },
  { code: "BEN", name: "Benin", aliases: ["Bénin"] },
  { code: "BER", name: "Bermuda", aliases: ["BMU"] },
  { code: "BHU", name: "Bhutan", aliases: ["BTN"] },
  { code: "BOL", name: "Bolivia", aliases: ["Plurinational State of Bolivia"] },
  { code: "BIH", name: "Bosnia and Herzegovina", aliases: ["Bosnia", "Bosna i Hercegovina", "BiH"] },
  { code: "BOT", name: "Botswana", aliases: ["BWA"] },
  { code: "BRA", name: "Brazil", aliases: ["Brasil"] },
  { code: "IVB", name: "British Virgin Islands", aliases: ["VGB", "BVI"] },
  { code: "BRU", name: "Brunei", aliases: ["Brunei Darussalam", "Negara Brunei Darussalam"] },
  { code: "BUL", name: "Bulgaria", aliases: ["България", "BGR", "Balgariya"] },
  { code: "BUR", name: "Burkina Faso", aliases: ["BFA", "Burkina"] },
  { code: "BDI", name: "Burundi", aliases: [] },
  { code: "CPV", name: "Cabo Verde", aliases: ["Cape Verde"] },
  { code: "CAM", name: "Cambodia", aliases: ["KHM", "Kampuchea"] },
  { code: "CMR", name: "Cameroon", aliases: ["Cameroun"] },
  { code: "CAN", name: "Canada", aliases: [] },
  { code: "CAY", name: "Cayman Islands", aliases: ["CYM"] },
  { code: "CAF", name: "Central African Republic", aliases: ["CAR", "Centrafrique"] },
  { code: "CHA", name: "Chad", aliases: ["TCD", "Tchad"] },
  { code: "CHI", name: "Chile", aliases: ["CHL"] },
  { code: "CHN", name: "China", aliases: ["中国", "PRC", "People's Republic of China", "Zhongguo"] },
  { code: "TPE", name: "Chinese Taipei", aliases: ["Taiwan", "Republic of China"] },
  { code: "COL", name: "Colombia", aliases: [] },
  { code: "COM", name: "Comoros", aliases: ["Comores", "Union of the Comoros"] },
  { code: "CGO", name: "Congo", aliases: ["Republic of the Congo", "Congo-Brazzaville", "Congo Republic", "COG"] },
  { code: "COD", name: "DR Congo", aliases: ["DRC", "Congo DR", "Congo-Kinshasa", "Democratic Republic of the Congo"] },
  { code: "COK", name: "Cook Islands", aliases: [] },
  { code: "CRC", name: "Costa Rica", aliases: ["CRI"] },
  { code: "CIV", name: "Côte d'Ivoire", aliases: ["Ivory Coast", "Cote d'Ivoire", "Cote dIvoire"] },
  { code: "CRO", name: "Croatia", aliases: ["HRV", "Hrvatska"] },
  { code: "CUB", name: "Cuba", aliases: [] },
  { code: "CYP", name: "Cyprus", aliases: ["Kypros", "Kıbrıs"] },
  { code: "CZE", name: "Czechia", aliases: ["Czech Republic", "Česko", "Ceska republika", "Česká republika"] },
  { code: "DEN", name: "Denmark", aliases: ["DNK", "Danmark"] },
  { code: "DJI", name: "Djibouti", aliases: [] },
  { code: "DMA", name: "Dominica", aliases: ["Commonwealth of Dominica"] },
  { code: "DOM", name: "Dominican Republic", aliases: ["República Dominicana", "Republica Dominicana"] },
  { code: "ECU", name: "Ecuador", aliases: [] },
  { code: "EGY", name: "Egypt", aliases: ["Misr"] },
  { code: "ESA", name: "El Salvador", aliases: ["SLV"] },
  { code: "GEQ", name: "Equatorial Guinea", aliases: ["GNQ", "Guinea Ecuatorial", "Guinée équatoriale"] },
  { code: "ERI", name: "Eritrea", aliases: [] },
  { code: "EST", name: "Estonia", aliases: ["Eesti"] },
  { code: "SWZ", name: "Eswatini", aliases: ["Swaziland", "eSwatini"] },
  { code: "ETH", name: "Ethiopia", aliases: [] },
  { code: "FIJ", name: "Fiji", aliases: [] },
  { code: "FIN", name: "Finland", aliases: ["Suomi"] },
  { code: "FRA", name: "France", aliases: [] },
  { code: "GAB", name: "Gabon", aliases: [] },
  { code: "GAM", name: "Gambia", aliases: ["The Gambia"] },
  { code: "GEO", name: "Georgia", aliases: ["Sakartvelo", "საქართველო"] },
  { code: "GER", name: "Germany", aliases: ["Deutschland", "DEU"] },
  { code: "GHA", name: "Ghana", aliases: [] },
  { code: "GBR", name: "Great Britain", aliases: ["United Kingdom", "UK", "England", "Scotland", "Wales", "Britain"] },
  { code: "GRE", name: "Greece", aliases: ["Ελλάδα", "Ellada", "Hellas", "GRC"] },
  { code: "GRN", name: "Grenada", aliases: [] },
  { code: "GUM", name: "Guam", aliases: ["Guåhan", "Guahan"] },
  { code: "GUA", name: "Guatemala", aliases: ["GTM"] },
  { code: "GUI", name: "Guinea", aliases: ["GIN", "Guinée", "Guinea-Conakry"] },
  { code: "GBS", name: "Guinea-Bissau", aliases: ["GNB", "Guiné-Bissau", "Guinea Bissau"] },
  { code: "GUY", name: "Guyana", aliases: [] },
  { code: "HAI", name: "Haiti", aliases: ["HTI", "Haïti"] },
  { code: "HON", name: "Honduras", aliases: [] },
  { code: "HKG", name: "Hong Kong, China", aliases: ["Hong Kong", "HK"] },
  { code: "HUN", name: "Hungary", aliases: ["Magyarország", "Magyarorszag"] },
  { code: "ISL", name: "Iceland", aliases: ["Ísland", "Island"] },
  { code: "IND", name: "India", aliases: ["Bharat"] },
  { code: "INA", name: "Indonesia", aliases: ["IDN"] },
  { code: "IRI", name: "Iran", aliases: ["IRN", "Islamic Republic of Iran", "Iran, Islamic Republic of", "Persia"] },
  { code: "IRQ", name: "Iraq", aliases: [] },
  { code: "IRL", name: "Ireland", aliases: ["Éire", "Eire"] },
  { code: "ISR", name: "Israel", aliases: ["ישראל", "Yisrael"] },
  { code: "ITA", name: "Italy", aliases: ["Italia"] },
  { code: "JAM", name: "Jamaica", aliases: [] },
  { code: "JPN", name: "Japan", aliases: ["日本", "Nippon", "Nihon"] },
  { code: "JOR", name: "Jordan", aliases: ["Al Urdun"] },
  { code: "KAZ", name: "Kazakhstan", aliases: ["Қазақстан", "Kazakstan", "Qazaqstan"] },
  { code: "KEN", name: "Kenya", aliases: [] },
  { code: "KIR", name: "Kiribati", aliases: [] },
  { code: "KOR", name: "Korea", aliases: ["South Korea", "Republic of Korea", "Korea, Republic of", "Korea Republic", "한국", "ROK"] },
  { code: "KOS", name: "Kosovo", aliases: ["Kosova", "Kosovë", "Republic of Kosovo", "XKX"] },
  { code: "KUW", name: "Kuwait", aliases: [] },
  { code: "KGZ", name: "Kyrgyzstan", aliases: ["Кыргызстан", "Kirgizstan", "Kyrgyz Republic"] },
  { code: "LAO", name: "Laos", aliases: ["Lao PDR", "Lao People's Democratic Republic"] },
  { code: "LAT", name: "Latvia", aliases: ["Latvija", "LVA"] },
  { code: "LBN", name: "Lebanon", aliases: [] },
  { code: "LES", name: "Lesotho", aliases: ["LSO"] },
  { code: "LBR", name: "Liberia", aliases: [] },
  { code: "LBA", name: "Libya", aliases: [] },
  { code: "LIE", name: "Liechtenstein", aliases: [] },
  { code: "LTU", name: "Lithuania", aliases: ["Lietuva"] },
  { code: "LUX", name: "Luxembourg", aliases: ["Lëtzebuerg", "Luxemburg"] },
  { code: "MAC", name: "Macau, China", aliases: ["Macau", "Macao"] },
  { code: "MAD", name: "Madagascar", aliases: ["MDG"] },
  { code: "MAW", name: "Malawi", aliases: ["MWI"] },
  { code: "MAS", name: "Malaysia", aliases: ["MYS"] },
  { code: "MDV", name: "Maldives", aliases: [] },
  { code: "MLI", name: "Mali", aliases: [] },
  { code: "MLT", name: "Malta", aliases: [] },
  { code: "MHL", name: "Marshall Islands", aliases: [] },
  { code: "MTN", name: "Mauritania", aliases: ["MRT"] },
  { code: "MRI", name: "Mauritius", aliases: ["MUS"] },
  { code: "MEX", name: "Mexico", aliases: ["México"] },
  { code: "FSM", name: "Micronesia", aliases: ["Federated States of Micronesia"] },
  { code: "MDA", name: "Moldova", aliases: ["Republica Moldova", "Republic of Moldova"] },
  { code: "MON", name: "Monaco", aliases: [] },
  { code: "MGL", name: "Mongolia", aliases: ["Монгол", "Mongol Uls"] },
  { code: "MNE", name: "Montenegro", aliases: ["Crna Gora"] },
  { code: "MAR", name: "Morocco", aliases: ["Maroc", "Al Maghrib"] },
  { code: "MOZ", name: "Mozambique", aliases: ["Moçambique", "Mocambique"] },
  { code: "MYA", name: "Myanmar", aliases: ["Burma", "MMR"] },
  { code: "NAM", name: "Namibia", aliases: [] },
  { code: "NRU", name: "Nauru", aliases: [] },
  { code: "NEP", name: "Nepal", aliases: [] },
  { code: "NED", name: "Netherlands", aliases: ["NLD", "Nederland", "Holland"] },
  { code: "NZL", name: "New Zealand", aliases: ["Aotearoa"] },
  { code: "NCA", name: "Nicaragua", aliases: ["NIC"] },
  { code: "NIG", name: "Niger", aliases: ["NER"] },
  { code: "NGR", name: "Nigeria", aliases: ["NGA"] },
  { code: "PRK", name: "North Korea", aliases: ["DPRK", "Korea DPR", "Korea, DPR", "Democratic People's Republic of Korea"] },
  { code: "MKD", name: "North Macedonia", aliases: ["Macedonia", "FYR Macedonia", "Makedonija", "Македонија", "Republic of North Macedonia"] },
  { code: "NOR", name: "Norway", aliases: ["Norge", "Noreg"] },
  { code: "OMA", name: "Oman", aliases: [] },
  { code: "PAK", name: "Pakistan", aliases: [] },
  { code: "PLW", name: "Palau", aliases: [] },
  { code: "PLE", name: "Palestine", aliases: ["PSE", "Palestinian"] },
  { code: "PAN", name: "Panama", aliases: [] },
  { code: "PNG", name: "Papua New Guinea", aliases: [] },
  { code: "PAR", name: "Paraguay", aliases: [] },
  { code: "PER", name: "Peru", aliases: ["Perú"] },
  { code: "PHI", name: "Philippines", aliases: ["PHL", "Pilipinas"] },
  { code: "POL", name: "Poland", aliases: ["Polska"] },
  { code: "POR", name: "Portugal", aliases: ["PRT"] },
  { code: "PUR", name: "Puerto Rico", aliases: [] },
  { code: "QAT", name: "Qatar", aliases: [] },
  { code: "ROU", name: "Romania", aliases: ["România"] },
  { code: "RUS", name: "Russia", aliases: ["Russian Federation", "Россия", "Rossiya"] },
  { code: "RWA", name: "Rwanda", aliases: [] },
  { code: "SKN", name: "Saint Kitts and Nevis", aliases: ["St Kitts and Nevis", "St. Kitts & Nevis", "KNA"] },
  { code: "LCA", name: "Saint Lucia", aliases: ["St Lucia", "St. Lucia"] },
  { code: "VIN", name: "Saint Vincent and the Grenadines", aliases: ["St Vincent and the Grenadines", "St. Vincent", "VCT"] },
  { code: "SAM", name: "Samoa", aliases: ["WSM"] },
  { code: "SMR", name: "San Marino", aliases: [] },
  { code: "STP", name: "São Tomé and Príncipe", aliases: ["Sao Tome and Principe", "Sao Tome"] },
  { code: "KSA", name: "Saudi Arabia", aliases: ["SAU", "Kingdom of Saudi Arabia"] },
  { code: "SEN", name: "Senegal", aliases: [] },
  { code: "SRB", name: "Serbia", aliases: ["Србија", "Srbija"] },
  { code: "SEY", name: "Seychelles", aliases: [] },
  { code: "SLE", name: "Sierra Leone", aliases: [] },
  { code: "SGP", name: "Singapore", aliases: [] },
  { code: "SVK", name: "Slovakia", aliases: ["Slovensko"] },
  { code: "SLO", name: "Slovenia", aliases: ["SVN", "Slovenija"] },
  { code: "SOL", name: "Solomon Islands", aliases: ["SLB"] },
  { code: "SOM", name: "Somalia", aliases: [] },
  { code: "RSA", name: "South Africa", aliases: ["ZAF", "Suid-Afrika"] },
  { code: "SSD", name: "South Sudan", aliases: [] },
  { code: "ESP", name: "Spain", aliases: ["España", "Espana"] },
  { code: "SRI", name: "Sri Lanka", aliases: ["LKA", "Ceylon"] },
  { code: "SUD", name: "Sudan", aliases: [] },
  { code: "SUR", name: "Suriname", aliases: [] },
  { code: "SWE", name: "Sweden", aliases: ["Sverige"] },
  { code: "SUI", name: "Switzerland", aliases: ["CHE", "Schweiz", "Suisse", "Svizzera", "Svizra"] },
  { code: "SYR", name: "Syria", aliases: ["Syrian Arab Republic"] },
  { code: "TJK", name: "Tajikistan", aliases: ["Тоҷикистон", "Tajikstan"] },
  { code: "TAN", name: "Tanzania", aliases: ["TZA", "United Republic of Tanzania"] },
  { code: "THA", name: "Thailand", aliases: ["ประเทศไทย", "Prathet Thai"] },
  { code: "TLS", name: "Timor-Leste", aliases: ["East Timor", "Timor Leste"] },
  { code: "TOG", name: "Togo", aliases: [] },
  { code: "TGA", name: "Tonga", aliases: [] },
  { code: "TTO", name: "Trinidad and Tobago", aliases: ["Trinidad", "Tobago"] },
  { code: "TUN", name: "Tunisia", aliases: [] },
  { code: "TUR", name: "Türkiye", aliases: ["Turkey", "Turkiye"] },
  { code: "TKM", name: "Turkmenistan", aliases: ["Türkmenistan"] },
  { code: "TUV", name: "Tuvalu", aliases: [] },
  { code: "UGA", name: "Uganda", aliases: [] },
  { code: "UKR", name: "Ukraine", aliases: ["Україна", "Ukraina", "Ukrayina"] },
  { code: "UAE", name: "United Arab Emirates", aliases: ["ARE", "Emirates"] },
  { code: "USA", name: "United States", aliases: ["United States of America", "US", "U.S.", "U.S.A."] },
  { code: "URU", name: "Uruguay", aliases: [] },
  { code: "UZB", name: "Uzbekistan", aliases: ["O'zbekiston", "Uzbekiston"] },
  { code: "VAN", name: "Vanuatu", aliases: [] },
  { code: "VEN", name: "Venezuela", aliases: [] },
  { code: "VIE", name: "Vietnam", aliases: ["VNM", "Viet Nam", "Việt Nam"] },
  { code: "ISV", name: "Virgin Islands, US", aliases: ["USVI", "US Virgin Islands", "VIR", "Virgin Islands (US)"] },
  { code: "YEM", name: "Yemen", aliases: [] },
  { code: "ZAM", name: "Zambia", aliases: ["ZMB"] },
  { code: "ZIM", name: "Zimbabwe", aliases: ["ZWE"] },
]

function normalizeKey(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
}

// Built once at module load. Aliases are added first and never overwrite each other;
// IOC codes and English names are added last so they always win on a collision.
const LOOKUP: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>()
  for (const country of COUNTRIES) {
    for (const alias of country.aliases) {
      const key = normalizeKey(alias)
      if (!map.has(key)) map.set(key, country.code)
    }
  }
  for (const country of COUNTRIES) {
    map.set(normalizeKey(country.code), country.code)
    map.set(normalizeKey(country.name), country.code)
  }
  return map
})()

const NAMES: ReadonlyMap<string, string> = new Map(
  COUNTRIES.map((country) => [country.code, country.name] as const),
)

/** Map any input (IOC code, ISO alpha-3 code, English name, alias; case/diacritics-insensitive, trimmed) to the IOC code, or null if unknown. */
export function toIocCode(input: string): string | null {
  const key = normalizeKey(input)
  if (key.length === 0) return null
  const code = LOOKUP.get(key)
  return code === undefined ? null : code
}

/** English name for an IOC code, or null. */
export function countryName(code: string): string | null {
  const name = NAMES.get(code.trim().toUpperCase())
  return name === undefined ? null : name
}
