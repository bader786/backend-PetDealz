require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();
app.use(express.json());
app.use(cors());

// ================================
// 📌 MongoDB Connection
// ================================
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ================================
// 📌 Cloudinary Configuration
// ================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "petdealz", // Folder in Cloudinary
    format: async (req, file) => "jpg", // Convert to JPG
    public_id: (req, file) => `${req.body.userId}_${Date.now()}`,
  },
});

const upload = multer({ storage });

// ================================
// 📌 User Schema & Model
// ================================
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
});
const User = mongoose.model("User", UserSchema);

// ================================
// 📌 Signup & Login
// ================================
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();
    res.json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: "Error registering user" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword)
      return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ error: "Error logging in" });
  }
});

// ================================
// 📌 Pet Listing Schema & Model
// ================================
const listingSchema = new mongoose.Schema({
  userId: String,
  title: String,
  description: String,
  category: String,
  location: String,
  price: Number,
  media: [String], // Store Cloudinary URLs
  dateTime: { type: Date, default: Date.now },
});
const Listing = mongoose.model("Listing", listingSchema);

// ================================
// 📌 Post a Listing with Image Upload
// ================================
app.post("/post-listing", upload.array("media", 6), async (req, res) => {
  try {
    const { userId, title, description, category, location, price } = req.body;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Please upload at least one image." });
    }

    const mediaUrls = req.files.map(file => file.path); // Cloudinary URLs
    
    const newListing = new Listing({ userId, title, description, category, location, price, media: mediaUrls });
    await newListing.save();

    res.json({ message: "Listing posted successfully!", listing: newListing });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================================
// 📌 Fetch Listings for a User
// ================================
app.get("/my-listings/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const listings = await Listing.find({ userId });
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: "Error fetching listings" });
  }
});

// ================================
// 📌 Start Server
// ================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
