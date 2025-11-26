require('dotenv').config();
const mysql = require('mysql2');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// create the connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Abhinand@2005',
  database: 'movie_recommend'
});

// connect to MySQL
db.connect((err) => {
  if (err) {
    console.error('❌ Connection error:', err.message);
    return;
  }
  console.log('✅ Connected to MySQL database!');
});

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Basic signup/login endpoints (unchanged)
app.post('/signup', (req, res) => {
  const { name, username, age, email, password } = req.body;
  const query = 'INSERT INTO users (name, username, age, email, password) VALUES (?, ?, ?, ?, ?)';
  db.query(query, [name, username, age, email, password], (err) => {
    if (err) {
      console.error('Signup error:', err);
      return res.status(500).json({ message: 'Error creating account' });
    }
    res.status(200).json({ message: 'Account created successfully' });
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
  db.query(query, [username, password], (err, results) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ message: 'Server error' });
    }
    if (results.length > 0) {
      res.status(200).json({ message: 'Login successful', user: results[0] });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  });
});

// ===========================
// GEMINI + TMDB INTEGRATION
// ===========================
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const TMDB_KEY = process.env.TMDB_API_KEY;
const GEMINI_MODEL_ENV = process.env.GEMINI_MODEL;

console.log('Startup: GEMINI_KEY present?', !!GEMINI_KEY, 'TMDB_KEY present?', !!TMDB_KEY, 'GEMINI_MODEL env:', GEMINI_MODEL_ENV);

if (!GEMINI_KEY) {
  console.warn('⚠️  GEMINI_API_KEY not set — /recommend will fail until provided.');
}

const genAI = new GoogleGenerativeAI(GEMINI_KEY);

// Function to fetch poster from TMDB (uses global fetch if available)
async function getPoster(movieName) {
  if (!TMDB_KEY || !movieName) return null;
  if (typeof fetch !== 'function') {
    console.warn('fetch not available in Node runtime — skipping poster fetch');
    return null;
  }
  try {
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(movieName)}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error('TMDB fetch failed:', response.status, response.statusText);
      return null;
    }
    const data = await response.json();
    if (data && Array.isArray(data.results) && data.results.length > 0 && data.results[0].poster_path) {
      return `https://image.tmdb.org/t/p/w500${data.results[0].poster_path}`;
    }
    return null;
  } catch (err) {
    console.error("TMDB error:", err && err.message ? err.message : err);
    return null;
  }
}

// Helper: attempt to extract first JSON array from text
function extractJsonArray(text) {
  if (!text || typeof text !== 'string') return null;
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

app.post("/recommend", async (req, res) => {
  try {
    const { query } = req.body;
    console.log('[/recommend] received query:', query);
    if (!query) return res.status(400).json({ error: "No query provided" });

    // Choose model via env override or sensible default
    const modelName = GEMINI_MODEL_ENV || "gemini-2.5-pro";
    console.log('[/recommend] using model:', modelName);

    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
Suggest 10 movies based on: "${query}".
Reply ONLY in structured JSON with this exact format (array of objects):

[
  {
    "title": "Movie Title (YEAR)",
    "genre": "Genre(s)",
    "description": "Short description (1-2 sentences)",
    "rating": "X.X/10",
    "year": "YYYY"
  }
]

If you cannot find a field, return an empty string for it. Do not return any extra commentary.
`;

    let result;
    try {
      result = await model.generateContent(prompt);
    } catch (genErr) {
      console.error('GenerateContent error:', genErr && genErr.message ? genErr.message : genErr);
      // If 404 model error, give actionable message
      if (genErr && genErr.status === 404) {
        return res.status(500).json({ error: 'Model not found or not supported for this endpoint. Run listmodules.mjs to list models.' });
      }
      return res.status(500).json({ error: 'Generation failed', details: String(genErr).slice(0,1000) });
    }

    // inspect result object for debugging
    let text = '';
    try {
      if (result && result.response && typeof result.response.text === 'function') {
        text = result.response.text();
      } else {
        // fallback: try to stringify result
        text = JSON.stringify(result).slice(0, 100000);
      }
    } catch (e) {
      text = String(result);
    }

    console.log('[/recommend] raw LLM response (first 2000 chars):\n', (text || '').slice(0, 2000));

    // Try parsing JSON robustly
    let movies = null;
    try {
      movies = JSON.parse(text);
    } catch (err) {
      const jsonPart = extractJsonArray(text);
      if (jsonPart) {
        try {
          movies = JSON.parse(jsonPart);
        } catch (err2) {
          console.error("JSON parse error (extracted):", err2);
          // return raw text to client for debugging
          return res.status(502).json({ error: "LLM returned invalid JSON (extracted)", raw: text.slice(0, 20000) });
        }
      } else {
        console.error("JSON parse error (original):", err);
        // return raw text to client for debugging
        return res.status(502).json({ error: "LLM returned invalid JSON", raw: text.slice(0, 20000) });
      }
    }

    // Validate structure
    if (!Array.isArray(movies)) {
      console.error('Parsed result is not an array, sample:', movies);
      return res.status(502).json({ error: "LLM returned JSON but it is not an array", sample: movies });
    }

    // Attach posters concurrently (posters optional)
    const moviesWithPosters = await Promise.all(
      movies.map(async (m) => {
        const title = (m && (m.title || m.name)) ? String(m.title || m.name).trim() : '';
        const poster = title ? await getPoster(title) : null;
        return { ...m, poster };
      })
    );

    console.log('[/recommend] returning', moviesWithPosters.length, 'movies');
    res.json({ movies: moviesWithPosters });

  } catch (err) {
    console.error("Unexpected Error:", err && err.message ? err.message : err);
    res.status(500).json({ error: "Failed to fetch recommendations", message: String(err).slice(0,1000) });
  }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));