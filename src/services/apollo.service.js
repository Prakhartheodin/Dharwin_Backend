/**
 * Apollo.io API client for HR contact search and enrichment.
 */

import config from '../config/config.js';

/**
 * Parse an error message from an Apollo API error response.
 * @param {Object|null} data
 * @param {string} text
 * @param {string} statusText
 * @returns {string}
 */
function parseErrorMessage(data, text, statusText) {
  return (data && (data.message || data.error || data.detail)) || text || statusText;
}

/**
 * Returns true if the location string refers to a remote-only position and
 * therefore carries no useful city/country signal for Apollo filtering.
 * @param {string|null|undefined} location
 * @returns {boolean}
 */
function isRemoteLocation(location) {
  if (!location) return true;
  return /^remote$/i.test(location.trim()) || /\bremote\b/i.test(location) && location.trim().length < 20;
}

const HR_TITLES = [
  'HR Manager',
  'Human Resources Manager',
  'Human Resources Business Partner',
  'HR Business Partner',
  'Talent Acquisition',
  'Talent Acquisition Manager',
  'Talent Acquisition Specialist',
  'Recruiter',
  'Technical Recruiter',
  'Recruiting Manager',
  'CHRO',
  'Chief People Officer',
  'VP of People',
  'VP of Human Resources',
  'Head of HR',
  'Head of Talent',
  'People Operations Manager',
  'People Partner',
];

const HR_SENIORITIES = ['owner', 'founder', 'c_suite', 'partner', 'vp', 'head', 'director', 'manager', 'senior'];

/** Strip common legal suffixes so "Acme Corp." → "Acme" matches better in Apollo. */
function normaliseCompanyName(name) {
  return name
    .replace(/[,.]?\s*(Inc\.?|LLC\.?|Ltd\.?|Corp\.?|Co\.?|GmbH|S\.A\.?|PLC\.?|Solutions?|Technologies?|Services?|Consulting|Systems?|Group|Global|International)$/i, '')
    .trim();
}

/**
 * Build a prioritised list of company name variants to try against Apollo.
 * Handles patterns like "Soais- Ardent ERP", "Acme | HR Division", "TechCorp / India".
 * Returns unique non-empty strings, shortest first (most specific last).
 */
function buildCompanyVariants(rawName) {
  const seen = new Set();
  const add = (v) => { const t = v.trim(); if (t.length >= 2) seen.add(t); };

  add(rawName);
  const clean = normaliseCompanyName(rawName);
  add(clean);

  // Split on common division separators: " - ", "- ", " | ", " / ", ": ", " — "
  const sepMatch = clean.match(/^(.+?)\s*[-–—|/]\s*(.+)$/);
  if (sepMatch) {
    const before = normaliseCompanyName(sepMatch[1]);
    const after  = normaliseCompanyName(sepMatch[2]);
    add(before);                        // "Soais"
    add(after);                         // "Ardent ERP"
    add(`${before} ${after}`);          // "Soais Ardent ERP"
  }

  // Also try dropping everything after the first comma: "Acme, Inc Global" → "Acme"
  const commaPart = clean.split(',')[0].trim();
  if (commaPart !== clean) add(normaliseCompanyName(commaPart));

  // Deduplicate, return longest first (broadest match)
  return [...seen].sort((a, b) => b.length - a.length);
}

/**
 * Extract a simple city or country token Apollo can match on.
 * e.g. "New York, NY, USA" → "new york"
 *      "London, UK"        → "london"
 *      "Germany"           → "germany"
 */
function extractLocationToken(location) {
  if (!location || isRemoteLocation(location)) return null;
  // Take the first comma-separated part, lowercase, strip state abbreviations
  const first = location.split(',')[0].trim().toLowerCase();
  // Drop 2-letter state codes that are not useful on their own
  if (/^[a-z]{2}$/.test(first)) return null;
  return first;
}

async function apolloPeopleSearch(body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    let res;
    try {
      res = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.apollo.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') return { ok: false, error: 'Apollo search timed out.' };
      return { ok: false, error: fetchErr.message };
    }
    clearTimeout(timeoutId);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    if (!res.ok) {
      console.error('[Apollo] people search HTTP', res.status, text.slice(0, 400));
      return { ok: false, error: parseErrorMessage(data, text, res.statusText) || `HTTP ${res.status}` };
    }
    return { ok: true, people: data?.people || [] };
  } catch (err) {
    clearTimeout(timeoutId);
    return { ok: false, error: err.message };
  }
}

/**
 * Search for HR contacts at a company via Apollo.io mixed_people search.
 * Tries a location-scoped search first; falls back to company-only if that returns 0.
 * @param {string} companyName
 * @param {string|null} [location]
 * @param {string|null} [companyDomain]
 * @returns {Promise<{ success: boolean, people?: Array, error?: string }>}
 */
async function searchHRContacts(companyName, location = null, companyDomain = null) {
  if (!config.apollo.apiKey) {
    return { success: false, error: 'APOLLO_IO_API_KEY is not set.' };
  }

  const variants = companyDomain ? [companyName] : buildCompanyVariants(companyName);
  const locationToken = extractLocationToken(location);

  console.info('[Apollo] company variants to try:', variants);

  const baseBody = {
    person_titles: HR_TITLES,
    include_similar_titles: true,
    person_seniorities: HR_SENIORITIES,
    per_page: 15,
    page: 1,
  };

  if (companyDomain) {
    baseBody.q_organization_domains_list = [companyDomain];
  }

  // Helper: try a single company keyword and return people or null
  const trySearch = async (keyword, withLocation) => {
    const body = { ...baseBody };
    if (!companyDomain) body.q_keywords = keyword;
    if (withLocation && locationToken) body.person_locations = [locationToken];
    const r = await apolloPeopleSearch(body);
    if (!r.ok) return { error: r.error };
    console.info(`[Apollo] "${keyword}" + location=${withLocation} → ${r.people.length} results`);
    return { people: r.people };
  };

  // --- Pass 1: each variant WITH location ---
  if (locationToken) {
    for (const v of variants) {
      const r = await trySearch(v, true);
      if (r.error) return { success: false, error: r.error };
      if (r.people.length > 0) {
        return { success: true, people: r.people.filter((p) => !!p.id).slice(0, 10) };
      }
    }
  }

  // --- Pass 2: each variant WITHOUT location ---
  for (const v of variants) {
    const r = await trySearch(v, false);
    if (r.error) return { success: false, error: r.error };
    if (r.people.length > 0) {
      return { success: true, people: r.people.filter((p) => !!p.id).slice(0, 10) };
    }
  }

  // --- Pass 3: bare keyword with "HR recruiter" appended, no title/seniority filters ---
  if (!companyDomain) {
    const primaryVariant = variants[variants.length - 1]; // shortest = most stripped
    const body3 = { q_keywords: `${primaryVariant} HR recruiter`, include_similar_titles: true, per_page: 10, page: 1 };
    console.info('[Apollo] pass-3 bare keyword:', body3.q_keywords);
    const r3 = await apolloPeopleSearch(body3);
    if (!r3.ok) return { success: false, error: r3.error };
    console.info('[Apollo] pass-3 total:', r3.people.length);
    if (r3.people.length > 0) {
      return { success: true, people: r3.people.filter((p) => !!p.id).slice(0, 10) };
    }
  }

  return { success: true, people: [] };
}

/**
 * Enrich Apollo contacts by person IDs via bulk_match.
 * Phone numbers are only requested when webhookUrl is a valid HTTPS URL
 * (Apollo rejects non-HTTPS webhook URLs).
 * @param {string[]} personIds - Array of Apollo person ID strings
 * @param {string|null} webhookUrl - HTTPS URL for async phone delivery; null in dev
 * @returns {Promise<{ success: boolean, matches?: Array, error?: string }>}
 */
async function enrichContacts(personIds, webhookUrl) {
  if (!config.apollo.apiKey) {
    return { success: false, error: 'APOLLO_IO_API_KEY is not set.' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const canRevealPhone = typeof webhookUrl === 'string' && webhookUrl.startsWith('https://');

  const body = {
    details: personIds.map((id) => ({ id })),
    reveal_personal_emails: false,
    ...(canRevealPhone ? { reveal_phone_number: true, webhook_url: webhookUrl } : {}),
  };

  console.info('[Apollo] enrichContacts — ids:', personIds.length, '| phone reveal:', canRevealPhone);

  try {
    let res;
    try {
      res = await fetch('https://api.apollo.io/api/v1/people/bulk_match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': config.apollo.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return { success: false, error: 'Apollo enrichment timed out after 15 seconds.' };
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* ignore JSON parse error */
    }

    if (!res.ok) {
      const message = parseErrorMessage(data, text, res.statusText);
      console.error('[Apollo] enrichContacts failed — status:', res.status, '| body:', text.slice(0, 500));
      return { success: false, error: message };
    }

    const response = data || {};
    const matches = response.matches || [];
    if (matches[0]) {
      const m = matches[0];
      console.info(
        '[Apollo] enrichContacts sample[0] fields:',
        JSON.stringify({
          id: m.id,
          name: `${m.first_name} ${m.last_name}`,
          email: m.email,
          linkedin_url: m.linkedin_url,
          city: m.city,
          state: m.state,
          country: m.country,
          phone_numbers: Array.isArray(m.phone_numbers) ? m.phone_numbers.length : 'none',
        })
      );
    } else {
      console.info('[Apollo] enrichContacts — 0 matches returned');
    }
    return { success: true, matches };
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[Apollo] enrichContacts threw:', err.message);
    return { success: false, error: err.message || String(err) };
  }
}

export default { searchHRContacts, enrichContacts };
