// ============================================================================
// KITCHEN ANNOUNCEMENTS — all 22 scheduled Indian languages + English
// ============================================================================
// Offline announcement builder for the chef panel's spoken order alerts.
// No translation API: every phrase is hand-written here, so announcements are
// instant and work with the network down.
//
// ── WHY ROMANIZED FALLBACKS EXIST ───────────────────────────────────────────
// The browser's speechSynthesis can only pronounce a language if the OPERATING
// SYSTEM has a voice pack installed for it. A stock Windows install ships
// English only — Tamil, Hindi, Telugu and the rest are opt-in downloads under
// Settings → Time & Language → Speech. Setting `utterance.lang = 'ta-IN'`
// without a Tamil voice does NOT make Chrome speak Tamil: it falls back to the
// default English voice, hands it Tamil script, and that voice either stays
// silent or reads meaningless noise. That is exactly why picking a language in
// the dropdown appeared to "not convert" — the setting was fine, the device
// simply had no voice to speak it with.
//
// So every language carries TWO renderings:
//   • `native`  — used when a real voice for that language is installed.
//   • `roman`   — a Latin-script transliteration spoken by the English (India)
//                 voice. "Pudhiya order, order number four two" is perfectly
//                 intelligible to a Tamil speaker and needs zero setup.
//
// The result: all 23 languages produce usable audio on an untouched Windows
// machine, and automatically upgrade to native pronunciation on any device
// where the chef installs the proper voice pack.
// ============================================================================

export interface AnnouncableOrder {
  order_number?: string | null;
  items?: Array<{ item_name: string; quantity: number }> | null;
}

interface Phrases {
  /** "New order" */
  newOrder: string;
  /** "Order number" */
  orderNumber: string;
  /** "items" */
  items: string;
}

export interface AnnounceLanguage {
  /** BCP-47 tag used for voice matching and utterance.lang */
  code: string;
  /** Endonym + English name, as shown in the picker */
  label: string;
  flag: string;
  native: Phrases;
  /** Latin-script fallback, spoken by an English voice */
  roman: Phrases;
}

// English first (the default), then the 22 scheduled languages of India
// in the order they appear in the Eighth Schedule's common listing.
export const ANNOUNCE_LANGUAGES: AnnounceLanguage[] = [
  {
    code: 'en-IN', label: 'English', flag: '🌐',
    native: { newOrder: 'New order', orderNumber: 'Order number', items: 'items' },
    roman:  { newOrder: 'New order', orderNumber: 'Order number', items: 'items' },
  },
  {
    code: 'hi-IN', label: 'हिन्दी · Hindi', flag: '🪷',
    native: { newOrder: 'नया ऑर्डर', orderNumber: 'ऑर्डर नंबर', items: 'आइटम' },
    roman:  { newOrder: 'Naya order', orderNumber: 'Order number', items: 'item' },
  },
  {
    code: 'bn-IN', label: 'বাংলা · Bengali', flag: '🐟',
    native: { newOrder: 'নতুন অর্ডার', orderNumber: 'অর্ডার নম্বর', items: 'আইটেম' },
    roman:  { newOrder: 'Notun order', orderNumber: 'Order number', items: 'item' },
  },
  {
    code: 'ta-IN', label: 'தமிழ் · Tamil', flag: '🌺',
    native: { newOrder: 'புதிய ஆர்டர்', orderNumber: 'ஆர்டர் எண்', items: 'பொருட்கள்' },
    roman:  { newOrder: 'Pudhiya order', orderNumber: 'Order number', items: 'porutkal' },
  },
  {
    code: 'te-IN', label: 'తెలుగు · Telugu', flag: '🌾',
    native: { newOrder: 'కొత్త ఆర్డర్', orderNumber: 'ఆర్డర్ నంబర్', items: 'వస్తువులు' },
    roman:  { newOrder: 'Kotta order', orderNumber: 'Order number', items: 'vastuvulu' },
  },
  {
    code: 'mr-IN', label: 'मराठी · Marathi', flag: '🦁',
    native: { newOrder: 'नवीन ऑर्डर', orderNumber: 'ऑर्डर नंबर', items: 'वस्तू' },
    roman:  { newOrder: 'Navin order', orderNumber: 'Order number', items: 'vastu' },
  },
  {
    code: 'kn-IN', label: 'ಕನ್ನಡ · Kannada', flag: '🌻',
    native: { newOrder: 'ಹೊಸ ಆರ್ಡರ್', orderNumber: 'ಆರ್ಡರ್ ಸಂಖ್ಯೆ', items: 'ವಸ್ತುಗಳು' },
    roman:  { newOrder: 'Hosa order', orderNumber: 'Order number', items: 'vastugalu' },
  },
  {
    code: 'ml-IN', label: 'മലയാളം · Malayalam', flag: '🌴',
    native: { newOrder: 'പുതിയ ഓർഡർ', orderNumber: 'ഓർഡർ നമ്പർ', items: 'ഇനങ്ങൾ' },
    roman:  { newOrder: 'Puthiya order', orderNumber: 'Order number', items: 'inangal' },
  },
  {
    code: 'gu-IN', label: 'ગુજરાતી · Gujarati', flag: '🦚',
    native: { newOrder: 'નવો ઓર્ડર', orderNumber: 'ઓર્ડર નંબર', items: 'વસ્તુઓ' },
    roman:  { newOrder: 'Navo order', orderNumber: 'Order number', items: 'vastuo' },
  },
  {
    code: 'pa-IN', label: 'ਪੰਜਾਬੀ · Punjabi', flag: '🌾',
    native: { newOrder: 'ਨਵਾਂ ਆਰਡਰ', orderNumber: 'ਆਰਡਰ ਨੰਬਰ', items: 'ਚੀਜ਼ਾਂ' },
    roman:  { newOrder: 'Navan order', orderNumber: 'Order number', items: 'cheezan' },
  },
  {
    code: 'or-IN', label: 'ଓଡ଼ିଆ · Odia', flag: '🛕',
    native: { newOrder: 'ନୂଆ ଅର୍ଡର', orderNumber: 'ଅର୍ଡର ନମ୍ବର', items: 'ଜିନିଷ' },
    roman:  { newOrder: 'Nua order', orderNumber: 'Order number', items: 'jinisha' },
  },
  {
    code: 'as-IN', label: 'অসমীয়া · Assamese', flag: '🦏',
    native: { newOrder: 'নতুন অৰ্ডাৰ', orderNumber: 'অৰ্ডাৰ নম্বৰ', items: 'সামগ্ৰী' },
    roman:  { newOrder: 'Notun order', orderNumber: 'Order number', items: 'samagri' },
  },
  {
    code: 'ur-IN', label: 'اردو · Urdu', flag: '🌙',
    native: { newOrder: 'نیا آرڈر', orderNumber: 'آرڈر نمبر', items: 'اشیاء' },
    roman:  { newOrder: 'Naya order', orderNumber: 'Order number', items: 'ashiya' },
  },
  {
    code: 'ne-NP', label: 'नेपाली · Nepali', flag: '🏔️',
    native: { newOrder: 'नयाँ अर्डर', orderNumber: 'अर्डर नम्बर', items: 'वस्तुहरू' },
    roman:  { newOrder: 'Nayan order', orderNumber: 'Order number', items: 'vastuharu' },
  },
  {
    code: 'sa-IN', label: 'संस्कृतम् · Sanskrit', flag: '🕉️',
    native: { newOrder: 'नूतनः आदेशः', orderNumber: 'आदेशसङ्ख्या', items: 'वस्तूनि' },
    roman:  { newOrder: 'Nutanah adeshah', orderNumber: 'Adesha sankhya', items: 'vastuni' },
  },
  {
    code: 'kok-IN', label: 'कोंकणी · Konkani', flag: '🥥',
    native: { newOrder: 'नवो ऑर्डर', orderNumber: 'ऑर्डर नंबर', items: 'वस्तू' },
    roman:  { newOrder: 'Novo order', orderNumber: 'Order number', items: 'vostu' },
  },
  {
    code: 'mai-IN', label: 'मैथिली · Maithili', flag: '🐘',
    native: { newOrder: 'नव ऑर्डर', orderNumber: 'ऑर्डर नंबर', items: 'सामान' },
    roman:  { newOrder: 'Nav order', orderNumber: 'Order number', items: 'samaan' },
  },
  {
    code: 'doi-IN', label: 'डोगरी · Dogri', flag: '⛰️',
    native: { newOrder: 'नमां ऑर्डर', orderNumber: 'ऑर्डर नंबर', items: 'चीजां' },
    roman:  { newOrder: 'Naman order', orderNumber: 'Order number', items: 'cheezan' },
  },
  {
    code: 'brx-IN', label: 'बड़ो · Bodo', flag: '🌿',
    native: { newOrder: 'गोदान अर्डार', orderNumber: 'अर्डार नामबार', items: 'बेसादफोर' },
    roman:  { newOrder: 'Godan order', orderNumber: 'Order number', items: 'besad' },
  },
  {
    code: 'sd-IN', label: 'سنڌي · Sindhi', flag: '⛵',
    native: { newOrder: 'نئون آرڊر', orderNumber: 'آرڊر نمبر', items: 'شيون' },
    roman:  { newOrder: 'Naon order', orderNumber: 'Order number', items: 'shayoon' },
  },
  {
    code: 'ks-IN', label: 'کٲشُر · Kashmiri', flag: '🍁',
    native: { newOrder: 'نٲو آرڈر', orderNumber: 'آرڈر نمبر', items: 'چیزٕ' },
    roman:  { newOrder: 'Nav order', orderNumber: 'Order number', items: 'cheez' },
  },
  {
    code: 'mni-IN', label: 'মৈতৈলোন্ · Manipuri', flag: '🌸',
    native: { newOrder: 'অনৌবা ওর্ডর', orderNumber: 'ওর্ডর নম্বর', items: 'পোৎ' },
    roman:  { newOrder: 'Anouba order', orderNumber: 'Order number', items: 'pot' },
  },
  {
    code: 'sat-IN', label: 'ᱥᱟᱱᱛᱟᱲᱤ · Santali', flag: '🪘',
    native: { newOrder: 'ᱱᱟᱶᱟ ᱚᱨᱰᱟᱨ', orderNumber: 'ᱚᱨᱰᱟᱨ ᱱᱟᱢᱵᱟᱨ', items: 'ᱡᱤᱱᱤᱥ' },
    roman:  { newOrder: 'Nawa order', orderNumber: 'Order number', items: 'jinis' },
  },
];

export const findLanguage = (code: string): AnnounceLanguage =>
  ANNOUNCE_LANGUAGES.find(l => l.code === code) ?? ANNOUNCE_LANGUAGES[0];

// ============================================================================
// ORDER NUMBER → SPOKEN DIGITS
// ============================================================================
/**
 * "OZ000042" → "4 2"
 *
 * Digits are spoken INDIVIDUALLY, separated by spaces so the synthesiser
 * pauses between them. Over kitchen noise "four two" survives far better than
 * "forty-two": a chef who mishears one digit of a grouped number has no way to
 * tell, whereas separate digits stay legible even if one is lost. It also
 * dodges a real correctness trap — most non-English voices cannot read large
 * grouped numerals and will silently switch to English or skip them entirely.
 */
export const spokenOrderNumber = (orderNumber?: string | null): string => {
  const digits = String(orderNumber || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return String(orderNumber || '').split('').join(' ');
  return digits.split('').join(' ');
};

// ============================================================================
// ANNOUNCEMENT TEXT
// ============================================================================
/**
 * Build the spoken text for one order in one language.
 *
 * Item names stay in their original English form in both renderings — they are
 * proper nouns on the menu board ("Masala Dosa"), and a chef matches them
 * against a printed ticket, so translating them would hurt rather than help.
 *
 * @param romanized when true, use the Latin-script fallback (see file header)
 */
export const buildAnnouncement = (
  order: AnnouncableOrder,
  code: string,
  romanized: boolean,
): string => {
  const lang = findLanguage(code);
  const p = romanized ? lang.roman : lang.native;

  const list = order.items ?? [];
  const count = list.length;
  const items = list.map(i => `${i.quantity} ${i.item_name}`).join(', ');
  const no = spokenOrderNumber(order.order_number);

  // Trailing repeat of the order number is deliberate — railway-platform
  // style. The first utterance catches attention, the repeat is the one the
  // chef actually writes down.
  return `${p.newOrder}. ${p.orderNumber} ${no}. ${count} ${p.items}: ${items}. ${p.orderNumber} ${no}.`;
};

// ============================================================================
// VOICE SELECTION
// ============================================================================

/**
 * Rank voices so the clearest one wins.
 *
 * Vendor-neutral scoring: the bundled "natural"/"neural" voices are markedly
 * more intelligible than the legacy formant ones, and a locale-exact match
 * beats a language-only match. `localService` voices are preferred last as a
 * tiebreak only — remote voices sound better but go silent without a network,
 * which is the wrong failure mode for a kitchen, so we only fall back to them.
 */
const scoreVoice = (v: SpeechSynthesisVoice, code: string): number => {
  let score = 0;
  const name = v.name.toLowerCase();
  if (v.lang.replace('_', '-').toLowerCase() === code.toLowerCase()) score += 100;
  if (/natural|neural|online/.test(name)) score += 40;
  if (/google|microsoft/.test(name)) score += 20;
  if (v.localService) score += 10;
  if (v.default) score += 5;
  return score;
};

export interface VoiceChoice {
  voice: SpeechSynthesisVoice | undefined;
  /** true → caller must render the romanized text */
  romanized: boolean;
  /** lang tag to stamp on the utterance */
  lang: string;
}

/**
 * Pick the best way to actually SAY something in `code` on this device.
 *
 * 1. A voice for the exact locale, or any voice for the same base language
 *    ("ta-LK" can read "ta-IN") → speak the native script.
 * 2. Otherwise → speak the romanized text with the best English voice,
 *    preferring Indian English for its closer vowel set.
 *
 * Returning `voice: undefined` is valid; the caller still speaks, letting the
 * platform default handle it.
 */
export const chooseVoice = (
  voices: SpeechSynthesisVoice[],
  code: string,
): VoiceChoice => {
  const base = code.split('-')[0].toLowerCase();

  const native = voices
    .filter(v => v.lang.replace('_', '-').toLowerCase().split('-')[0] === base)
    .sort((a, b) => scoreVoice(b, code) - scoreVoice(a, code))[0];

  if (native) return { voice: native, romanized: false, lang: native.lang.replace('_', '-') };

  const english = voices
    .filter(v => v.lang.replace('_', '-').toLowerCase().startsWith('en'))
    .sort((a, b) => {
      // en-IN first — its pronunciation of romanized Indian words is closest.
      const aIn = a.lang.toLowerCase().includes('in') ? 1000 : 0;
      const bIn = b.lang.toLowerCase().includes('in') ? 1000 : 0;
      return (bIn + scoreVoice(b, 'en-IN')) - (aIn + scoreVoice(a, 'en-IN'));
    })[0];

  return { voice: english, romanized: true, lang: english?.lang.replace('_', '-') ?? 'en-IN' };
};

/** Does this device have a real voice for `code`? Drives the UI hint. */
export const hasNativeVoice = (voices: SpeechSynthesisVoice[], code: string): boolean => {
  const base = code.split('-')[0].toLowerCase();
  return voices.some(v => v.lang.replace('_', '-').toLowerCase().split('-')[0] === base);
};
