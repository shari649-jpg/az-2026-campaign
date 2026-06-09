exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "https://az-coalition-2026-election.netlify.app",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { action, url, text, manualMeta } = JSON.parse(event.body);

    if (action === "fetch_and_analyze") {
      let pageText = "";
      let fetchOk = false;

      try {
        const pageRes = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
          redirect: "follow",
        });

        if (pageRes.ok) {
          const html = await pageRes.text();
          pageText = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s{3,}/g, "\n\n")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .trim();

          if (pageText.length > 300) fetchOk = true;
        }
      } catch (fetchErr) {
        fetchOk = false;
      }

      if (!fetchOk) {
        return {
          statusCode: 422,
          headers: { "Access-Control-Allow-Origin": "https://az-coalition-2026-election.netlify.app", "Content-Type": "application/json" },
          body: JSON.stringify({ error: "scrape_failed" }),
        };
      }

      const analysisRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `You are a political research analyst. Analyze this article and extract structured information.

Article text:
${pageText.substring(0, 8000)}

RESPOND ONLY WITH VALID JSON. No markdown, no backticks, no explanation.
Format:
{
  "title": "article headline",
  "publication": "outlet name",
  "date": "publication date",
  "reporter": "reporter name or names",
  "summary": "2-3 sentence summary of the article",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "people": [{"name": "Full Name", "role": "title or role"}],
  "quotes": [{"text": "exact quote text without attribution", "speaker": "name"}],
  "issueArea": "one of: education/vouchers, utility rates, housing, water, elections, healthcare, economy/jobs, immigration, other"
}`,
          }],
        }),
      });

      const analysisData = await analysisRes.json();
      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "https://az-coalition-2026-election.netlify.app", "Content-Type": "application/json" },
        body: JSON.stringify({ result: analysisData }),
      };
    }

    if (action === "analyze_text") {
      const meta = manualMeta || {};
      const analysisRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `You are a political research analyst. Analyze this article and extract structured information.

Known publication info (use if provided, otherwise extract from text):
Title: ${meta.title || "extract from text"}
Publication: ${meta.pub || "extract from text"}
Date: ${meta.date || "extract from text"}
Reporter: ${meta.reporter || "extract from text"}

Article text:
${text.substring(0, 8000)}

RESPOND ONLY WITH VALID JSON. No markdown, no backticks, no explanation.
Format:
{
  "title": "article headline",
  "publication": "outlet name",
  "date": "publication date",
  "reporter": "reporter name or names",
  "summary": "2-3 sentence summary of the article",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "people": [{"name": "Full Name", "role": "title or role"}],
  "quotes": [{"text": "exact quote text without attribution", "speaker": "name"}],
  "issueArea": "one of: education/vouchers, utility rates, housing, water, elections, healthcare, economy/jobs, immigration, other"
}`,
          }],
        }),
      });

      const analysisData = await analysisRes.json();
      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "https://az-coalition-2026-election.netlify.app", "Content-Type": "application/json" },
        body: JSON.stringify({ result: analysisData }),
      };
    }

    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "https://az-coalition-2026-election.netlify.app" },
      body: JSON.stringify({ error: "Unknown action" }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "https://az-coalition-2026-election.netlify.app", "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
