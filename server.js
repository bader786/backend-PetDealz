require('dotenv').config(); // Load environment variables
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const multer = require('multer'); // Added for file uploads

const app = express();
app.use(express.json());
app.use(cors({ 
    origin: "https://petdealz.vercel.app", 
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization"
}));
app.options('*', cors()); // Handle preflight requests globally

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// User Schema & Model
const UserSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String
});

const User = mongoose.model('User', UserSchema);

// Signup Endpoint
app.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword });
        await newUser.save();
        res.json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error registering user' });
    }
});

// Login Endpoint
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'User not found' });
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) return res.status(400).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ message: 'Login successful', token });
    } catch (error) {
        res.status(500).json({ error: 'Error logging in' });
    }
});

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));


// ============================
// 📌 New Sell Listing Feature
// ============================

// Listing Schema
const listingSchema = new mongoose.Schema({
    userId: String,
    title: String,
    description: String,
    category: String,
    location: String,
    price: Number,
    media: [{
        filename: String,
        contentType: String,
        path: String
    }],
    dateTime: { type: Date, default: Date.now }
});

const Listing = mongoose.model("Listing", listingSchema);

// Multer Storage Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});
const upload = multer({ storage });

// Middleware to Validate Description (No Phone Numbers Allowed)
const validateDescription = (req, res, next) => {
    const { description } = req.body;
    const phoneRegex = /\b\d{10,}\b/;
    if (phoneRegex.test(description)) {
        return res.status(400).json({ error: "Phone numbers are not allowed in the description." });
    }
    next();
};

// API to Post a Listing
app.post("/post-listing", upload.array("media", 6), validateDescription, async (req, res) => {
    try {
        const { userId, title, description, category, location, price } = req.body;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: "Please upload at least one image or video." });
        }
        if (files.length > 6) {
            return res.status(400).json({ error: "You can upload a maximum of 6 images/videos." });
        }

        const media = files.map(file => ({
            filename: file.filename,
            contentType: file.mimetype,
            path: file.path
        }));

        const newListing = new Listing({ userId, title, description, category, location, price, media });
        await newListing.save();

        res.json({ message: "Listing posted successfully!", listing: newListing });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API to Fetch All Listings
app.get("/get-listings", async (req, res) => {
    try {
        const listings = await Listing.find();
        res.json(listings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
