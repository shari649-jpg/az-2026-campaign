const { google } = require('googleapis');
const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Document cache
let cachedDocText = null;
let cacheTime = 0;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

/**
 * Authenticate with Google Drive using service account credentials
 */
async function authenticateGoogleDrive() {
  const credentials = {
    type: 'service_account',
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  };

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/documents.readonly',
    ],
  });

  return google.docs({ version: 'v1', auth });
}

/**
 * Fetch the Google Doc
 */
async function fetchGoogleDoc(docId) {
  try {
    const docs = await authenticateGoogleDrive();
    const response = await docs.documents.get({ documentId: docId });
    return response.data;
  } catch (error) {
    console.error('Error fetching Google Doc:', error);
    throw new Error(`Failed to fetch Google Doc: ${error.message}`);
  }
}

/**
 * Convert Google Doc structure to plain text
 */
function googleDocToText(googleDoc) {
  let text = '';

  function processElement(element) {
    if (element.heading1) {
      text += `# ${element.heading1.content.map(c => c.textRun?.content || '').join('')}\n\n`;
    } else if (element.heading2) {
      text += `## ${element.heading2.content.map(c => c.textRun?.content || '').join('')}\n\n`;
    } else if (element.heading3) {
      text += `### ${element.heading3.content.map(c => c.textRun?.content || '').join('')}\n\n`;
    } else if (element.heading4) {
      text += `#### ${element.heading4.content.map(c => c.textRun?.content || '').join('')}\n\n`;
    } else if (element.heading5) {
      text += `##### ${element.heading5.content.map(c => c.textRun?.content || '').join('')}\n\n`;
    } else if (element.paragraph) {
      const content = element.paragraph.elements
        .map(el => el.textRun?.content || '')
        .join('');
      
      if (element.paragraph.bullet) {
        text += `- ${content}\n`;
      } else if (content.trim()) {
        text += `${content}\n`;
      }
    } else if (element.table) {
      text += '[Table content]\n';
    }
  }

  if (googleDoc.body && googleDoc.body.content) {
    googleDoc.body.content.forEach(processElement);
  }

  return text;
}

/**
 * Get cached document (or fetch if not cached or cache expired)
 */
async function getCachedDocText(docId) {
  const now = Date.now();
  
  // Check if cache is still valid
  if (cachedDocText && (now - cacheTime) < CACHE_DURATION) {
    console.log('Using cached document');
    return cachedDocText;
  }

  console.log('Fetching fresh document from Google Drive');
  const googleDoc = await fetchGoogleDoc(docId);
  cachedDocText = googleDocToText(googleDoc);
  cacheTime = now;
  
  return cachedDocText;
}

/**
 * Use Claude Haiku to extract relevant candidate info from the query
 * Haiku is faster and cheaper than Opus
 */
async function extractCandidateData(docText, query, filterType = null) {
  const filterInstruction = filterType 
    ? `\nFilter results by type: ${filterType} (accomplishment, vulnerability, quote, background, or strength).`
    : '';

  const prompt = `You are a political research assistant analyzing candidate profiles.

Here is a candidate research document:

${docText}

User query: "${query}"${filterInstruction}

Extract ALL relevant facts, accomplishments, vulnerabilities, strengths, quotes, and background information that directly answer this query.

Return ONLY valid JSON (no markdown, no backticks). Format:
[
  {
    "candidate_name": "Candidate Name",
    "office": "Office",
    "party": "D/R/I",
    "district": "District if applicable",
    "facts": [
      {
        "type": "accomplishment|vulnerability|strength|quote|background",
        "category": "Issue area",
        "text": "The fact",
        "source_section": "Profile section"
      }
    ]
  }
]

Be thorough. Include all relevant information. Make facts specific and sourced.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', // Using Haiku instead of Opus
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const results = JSON.parse(jsonMatch[0]);
    return results;
  } catch (error) {
    console.error('Error extracting candidate data:', error);
    throw new Error(`Failed to extract data: ${error.message}`);
  }
}

/**
 * Main handler function
 */
exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle OPTIONS (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'OK' }),
    };
  }

  try {
    // Parse request
    const body = JSON.parse(event.body || '{}');
    const { query, filterType } = body;

    if (!query || query.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query parameter is required' }),
      };
    }

    // Get Google Doc (cached or fresh)
    const docId = process.env.GOOGLE_DOC_ID;
    if (!docId) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Google Doc ID not configured' }),
      };
    }

    const docText = await getCachedDocText(docId);

    // Extract candidate data using Claude Haiku
    const results = await extractCandidateData(docText, query, filterType);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        query,
        results,
        resultCount: results.length,
      }),
    };
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
};
