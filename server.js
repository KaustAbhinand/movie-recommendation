// server.js
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Connect to MySQL
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',       // your MySQL username
  password: 'Abhinand@2005', // replace this
  database: 'movie_recommend'
});

db.connect(err => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to MySQL');
});


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

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
