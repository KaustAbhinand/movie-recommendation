require('dotenv').config();
const mysql = require('mysql2');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// create the connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root', // your MySQL username
  password: 'Abhinand@2005', // replace with your password
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

// test query
/*connection.query('SELECT * FROM users', (err, rows) => {
  if (err) throw err;
  console.log(rows);
  connection.end();
}); */

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));


app.post('/signup', (req, res) => {
  const { name, username, age, email, password } = req.body;
  const query = 'INSERT INTO users (name, username, age, email, password) VALUES (?, ?, ?, ?, ?)';
  db.query(query, [name, username, age, email, password], (err) => {
    if (err) {
      console.error(err);
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
      console.error(err);
      return res.status(500).json({ message: 'Server error' });
    }
    if (results.length > 0) {
      res.status(200).json({ message: 'Login successful', user: results[0] });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  });
});

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post("/recommend", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "No query provided" });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    const prompt = `
    You are a movie recommendation assistant. 
    Based on the query: "${query}", suggest 10 movies.
    For each movie, include:
    - Title
    - Genre
    - A one-line description.
    - IMDB rating.
    - Year of release.
    - Include a poster of the film, if possible.
    Format them as a numbered list.
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    res.json({ recommendation: text });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

//  Start server
//app.listen(3000, () => console.log("🚀 Server running at http://localhost:3000"));
app.listen(3000, () => console.log('Server running on http://localhost:3000'));

