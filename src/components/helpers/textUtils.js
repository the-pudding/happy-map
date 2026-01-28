export function convertCountries(c) {
  if (!c || c === 'nan') return "--"; // Handle empty, null, undefined, or string 'nan'

  const country_map = {
        'AFG': 'Afghanistan',
        'ALB': 'Albania',
        'ARE': 'United Arab Emirates',
        'ARG': 'Argentina',
        'ARM': 'Armenia',
        'ASM': 'American Samoa',
        'AUS': 'Australia',
        'AUT': 'Austria',
        'BEL': 'Belgium',
        'BGD': 'Bangladesh',
        'BGR': 'Bulgaria',
        'BHS': 'Bahamas',
        'BRA': 'Brazil',
        'BRB': 'Barbados',
        'CAN': 'Canada',
        'CHL': 'Chile',
        'COL': 'Colombia',
        'CRI': 'Costa Rica',
        'CYP': 'Cyprus',
        'CZE': 'Czech Republic',
        'DEU': 'Germany',
        'DNK': 'Denmark',
        'DOM': 'Dominican Republic',
        'DZA': 'Algeria',
        'ECU': 'Ecuador',
        'EGY': 'Egypt',
        'ESP': 'Spain',
        'EST': 'Estonia',
        'ETH': 'Ethiopia',
        'FIN': 'Finland',
        'FRA': 'France',
        'GBR': 'United Kingdom',
        'GHA': 'Ghana',
        'GMB': 'Gambia',
        'GRC': 'Greece',
        'GTM': 'Guatemala',
        'HKG': 'Hong Kong',
        'HRV': 'Croatia',
        'IDN': 'Indonesia',
        'IND': 'India',
        'IRL': 'Ireland',
        'IRQ': 'Iraq',
        'ISL': 'Iceland',
        'ISR': 'Israel',
        'ITA': 'Italy',
        'JAM': 'Jamaica',
        'JPN': 'Japan',
        'KAZ': 'Kazakhstan',
        'KEN': 'Kenya',
        'KNA': 'Saint Kitts and Nevis',
        'KOR': 'South Korea',
        'KWT': 'Kuwait',
        'LKA': 'Sri Lanka',
        'LTU': 'Lithuania',
        'LVA': 'Latvia',
        'MAC': 'Macao',
        'MAR': 'Morocco',
        'MDA': 'Moldova',
        'MEX': 'Mexico',
        'MKD': 'North Macedonia',
        'MLT': 'Malta',
        'MUS': 'Mauritius',
        'MYS': 'Malaysia',
        'NGA': 'Nigeria',
        'NIC': 'Nicaragua',
        'NLD': 'Netherlands',
        'NOR': 'Norway',
        'NPL': 'Nepal',
        'NZL': 'New Zealand',
        'PAK': 'Pakistan',
        'PER': 'Peru',
        'PHL': 'Philippines',
        'POL': 'Poland',
        'PRI': 'Puerto Rico',
        'PRT': 'Portugal',
        'ROU': 'Romania',
        'RUS': 'Russia',
        'SAU': 'Saudi Arabia',
        'SGP': 'Singapore',
        'SLV': 'El Salvador',
        'SRB': 'Serbia',
        'SUR': 'Suriname',
        'SVN': 'Slovenia',
        'SWE': 'Sweden',
        'TCA': 'Turks and Caicos Islands',
        'THA': 'Thailand',
        'TTO': 'Trinidad and Tobago',
        'TUN': 'Tunisia',
        'TUR': 'Turkey',
        'TWN': 'Taiwan',
        'UGA': 'Uganda',
        'UKR': 'Ukraine',
        'UMI': 'United States Minor Outlying Islands',
        'URY': 'Uruguay',
        'USA': 'United States',
        'VEN': 'Venezuela',
        'VIR': 'U.S. Virgin Islands',
        'VNM': 'Vietnam',
        'ZAF': 'South Africa',
        'ZMB': 'Zambia'
    };

    return country_map[c] || "--";
}


export function getFontSize(type, currentZoom) {
    if (type === "l1") {
      switch (Math.floor(currentZoom)) {
        case 0:
          return 5;
        case 1:
          return 11;
        case 2:
          return 12;
        case 3:
          return 14;
        case 4:
          return 25;
        case 5:
          return 30;
        case 6:
          return 22;
        default:
          return 11;
      }
    } else if (type === "l2") {
      switch (Math.floor(currentZoom)) {
        case 2:
          return 9;
        case 3:
          return 12;
        case 4:
          return 19;
        case 5:
          return 23;
        case 6:
          return 28;
        default:
          return 9;
      }
    } else if (type === "l3") {
      switch (Math.floor(currentZoom)) {
        case 2:
          return 9;
        case 3:
          return 11;
        case 4:
          return 13;
        case 5:
          return 18;
        case 6:
          return 22;
        default:
          return 9;
      }
    }
    return 10;
  }

export function matchesFilters(p, filters) {
  const isUS = p[4] === "USA";
  if (isUS && !filters.location.us) return false;
  if (!isUS && !filters.location.nonUs) return false;

  const age = p[3];
  if (isNaN(age)) return false;
  if (age < 20 && !filters.age.range1) return false;
  else if (age >= 20 && age < 30 && !filters.age.range2) return false;
  else if (age >= 30 && age < 40 && !filters.age.range3) return false;
  else if (age >= 40 && age < 50 && !filters.age.range4) return false;
  else if (age >= 50 && age < 60 && !filters.age.range5) return false;
  else if (age >= 60 && age < 70 && !filters.age.range6) return false;
  else if (age >= 70 && age < 100 && !filters.age.range7) return false;
  else if (age >= 100) return false;

  const sex = p[5];
  if (sex === "m" && !filters.sex.m) return false;
  else if (sex === "f" && !filters.sex.f) return false;
  else if (sex !== "m" && sex !== "f" && !filters.sex.o) return false;

  const isParent = p[7] === "y";
  if (isParent && !filters.parent.yes) return false;
  if (!isParent && !filters.parent.no) return false;

  const marital = p[6].toLowerCase();
  if (marital.includes("single") && !filters.marital.single) return false;
  else if (marital.includes("married") && !filters.marital.married) return false;
  else if (marital.includes("divorced") && !filters.marital.divorced) return false;

  return true;
}

export function getIconName(p) {
  const age = p[3];
  const sexChar = p[5];
  let ageGroup = "young";
  if (age > 60) ageGroup = "older";
  else if (age > 40) ageGroup = "old";
  else if (age > 25) ageGroup = "mid";
  const sex = sexChar === "m" ? "male" : "female";
  const variant = (p._stableId || 0) % 6;
  return `${ageGroup}-${sex}-${variant}`;
}

export function getLabelSize(type, zoom) {
  if (type === "l1") {
    if (zoom < 1) return 10;
    if (zoom < 2) return 12;
    if (zoom < 3) return 16;
    if (zoom < 4) return 22;
    if (zoom < 5) return 30;
    return 40;
  }
  if (type === "l2") {
    if (zoom < 4) return 12;
    if (zoom < 5) return 18;
    return 24;
  }
  // l3
  if (zoom < 5) return 10;
  if (zoom < 6) return 14;
  return 18;
}

export function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex]
    ];
  }
  return array;
}

export function getInitialZoom() {
  if (typeof window === "undefined") return 2;
  const w = window.innerWidth;
  return w < 500 ? 0 : w < 900 ? 1 : 2;
}

export const DEFAULT_FILTERS = {
  location: { us: true, nonUs: true },
  age: {
    range1: true,
    range2: true,
    range3: true,
    range4: true,
    range5: true,
    range6: true,
    range7: true
  },
  sex: { m: true, f: true, o: true },
  parent: { yes: true, no: true },
  marital: { single: true, married: true, divorced: true }
};

export const OUTLINE_OFFSETS = [
  [-2, -2],
  [-2, 0],
  [-2, 2],
  [0, -2],
  [0, 2],
  [2, -2],
  [2, 0],
  [2, 2],
  [0, 3]  // Extra offset for drop shadow
];
