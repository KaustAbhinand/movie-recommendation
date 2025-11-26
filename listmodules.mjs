
import 'dotenv/config';

async function listModels() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error(' Missing GEMINI_API_KEY in environment.');
    process.exit(1);
  }

  const url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(key)}`;

  try {
    const resp = await fetch(url, { method: 'GET' });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`❌ API returned ${resp.status} ${resp.statusText}:\n`, body);
      return;
    }

    const data = await resp.json();

    if (!data || !Array.isArray(data.models)) {
      console.log('ℹ️ Response did not include a models array — full response:');
      console.dir(data, { depth: 5 });
      return;
    }

    console.log(' Available Gemini Models:\n');
    data.models.forEach(m => console.log('•', m.name));
  } catch (err) {
    console.error(' Error listing models:', err);
  }
}

listModels();
// ...existing code...