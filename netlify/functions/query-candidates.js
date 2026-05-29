const { google } = require('googleapis');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function authenticateGoogleDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      type: 'service_account',
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
    },
    scopes: ['https://www.googleapis.com/auth/documents.readonly'],
  });
  return auth;
}

async function fetchGoogleDoc(docId) {
  const auth = await authenticateGoogleDrive();
  const docs = google.docs({ version: 'v1', auth });
  const response = await docs.documents.get({ documentId: docId });
  return response.data;
}

function googleDocToText(doc) {
  const content = doc.body.content || [];
  let text = '';
  for (const element of content) {
    if (element.paragraph) {
      const paragraphStyle = element.paragraph.paragraphStyle?.namedStyleType || '';
      const paragraphText = element.paragraph.elements
        ?.map(e => e.textRun?.content || '')
        .join('') || '';
      if (paragraphText.trim()) {
        if (paragraphStyle.startsWith('HEADING')) {
          text += '\n' + paragraphText;
        } else {
          text += paragraphText;
        }
      }
    }
  }
  return text;
}

let cachedDoc = null;
let cacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000;

async function getCachedDocText(docId) {
  const now = Date.now();
  if (cachedDoc && cacheTime && (now - cacheTime) < CACHE_DURATION) {
    return cachedDoc;
  }
  const doc = await fetchGoogleDoc(docId);
  cachedDoc = googleDocToText(doc);
  cacheTime = now;
  return cachedDoc;
}

async function extractCandidateData(docText, query, filterType) {
  const filterInstruction = filterType && filterType !== 'all'
    ? `\nOnly return facts of type: ${filterType}.`
    : '';

  const prompt = `You are a political research assistant analyzing Arizona candidate profiles.

Here is the candidate research document:

${docText}

User query: "${query}"${filterInstruction}

Search ALL of these fields for matches to the query:
- Candidate name
- Office / seat / title (e.g., Governor, Attorney General, State Senate, State House)
- Party (D, R, Democrat, Republican)
- District (e.g., LD2, LD13, LD16)
- Any content in the profile (accomplishments, vulnerabilities, quotes, background)

For example:
- "governor" should return candidates running for Governor
- "attorney" or "attorney general" should return the Attorney General candidate
- "LD16" should return all candidates in Legislative District 16
- "water" should return any candidate with water-related facts

If NO candidates match the query at all, return an empty array: []

CRITICAL: Return ONLY a valid JSON array. No markdown. No backticks. No explanation text before or after. Start your response with [ and end with ].

JSON format:
[
  {
    "candidate_name": "Full Name",
    "office": "Full office title (e.g., Governor, Attorney General, State Senate LD2)",
    "party": "D or R or I",
    "district": "LD number or Statewide or blank",
    "facts": [
      {
        "type": "accomplishment|vulnerability|strength|quote|background",
        "category": "Issue area (e.g., Water, Housing, Economy)",
        "text": "The specific fact or quote",
        "source_section": "Section of the profile this came from"
      }
    ]
  }
]

Be thorough. Include all relevant candidates and all relevant facts for each.`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  // Try multiple extraction strategies
  let results;

  // Strategy 1: response is already clean JSON
  try {
    results = JSON.parse(responseText.trim());
    if (Array.isArray(results)) return results;
  } catch {}

  // Strategy 2: extract JSON array from response
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      results = JSON.parse(jsonMatch[0]);
      if (Array.isArray(results)) return results;
    } catch {}
  }

  // Strategy 3: strip markdown fences then parse
  const stripped = responseText.replace(/```json|```/g, '').trim();
  try {
    results = JSON.parse(stripped);
    if (Array.isArray(results)) return results;
  } catch {}

  // Strategy 4: if response contains "no candidates" or similar, return empty
  const noResultPhrases = ['no candidates', 'no results', 'not found', 'no match', 'cannot find', "don't have"];
  if (noResultPhrases.some(p => responseText.toLowerCase().includes(p))) {
    return [];
  }

  throw new Error('No JSON found in response');
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'OK' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { query, filterType } = body;

    if (!query || query.trim().length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Query parameter is required' }) };
    }

    const docId = process.env.GOOGLE_DOC_ID;
    if (!docId) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Google Doc ID not configured' }) };
    }

    const docText = await getCachedDocText(docId);
    const results = await extractCandidateData(docText, query, filterType);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, query, results, resultCount: results.length }),
    };
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
    };
  }
};
