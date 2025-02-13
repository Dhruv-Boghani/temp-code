const express = require('express');
const staticRoutes = require('./staticRoutes.js');
const mongoose = require('mongoose');
const { Product, Shop, Stock, DailySale, TodayData } = require('./model.js');
require('dotenv').config();
const session = require('express-session');
const flash = require('express-flash');


const app = express();
const PORT = process.env.PORT || 8000;
const mongoURI = process.env.LOCALHOST_MONGO_URI|| process.env.MONGO_URI;  // For local MongoDB



mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true})
    .then(() => console.log('✅ MongoDB Connected Successfully'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));


//ejs
app.set('view engine', 'ejs');


// middleware
app.use(express.static('public'));  // Serve static files from the "public" folder
app.use(express.json());
app.use(express.urlencoded({ extended: true}));
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

app.use(flash());



// Routes
app.use('/', staticRoutes);





app.listen(PORT , () => {
    console.log(`✅ Server is running on port ${PORT}`)
})
