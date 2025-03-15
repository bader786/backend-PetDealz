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
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB connection error:", err));

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
    folder: "petdealz",
    format: async (req, file) => "jpg",
    public_id: (req, file) => `${req.user.userId}_${Date.now()}`,
  },
});

const upload = multer({ storage });

// ================================
// 📌 User Schema & Model
// ================================
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
});
const User = mongoose.model("User", UserSchema);

// ================================
// 📌 Authentication Middleware
// ================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.header("Authorization");
    console.log("Auth Header Received:", authHeader); // Debugging

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Access denied. Please log in." });
    }

    const token = authHeader.split(" ")[1];
    console.log("Extracted Token:", token); // Debugging

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.log("Token Verification Failed:", err.message); // Debugging
            return res.status(403).json({ error: "Invalid or expired token." });
        }
        console.log("User Authenticated:", user); // Debugging
        req.user = user; // Storing user info in request
        next();
    });
};


// ================================
// 📌 Signup & Login
// ================================
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already exists." });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();

    res.json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: "Error registering user: " + error.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "2h" });
    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ error: "Error logging in: " + error.message });
  }
});

// ================================
// 📌 Pet Listing Schema & Model
// ================================
const listingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  description: String,
  category: String,
  location: String,
  price: { type: Number, required: true },
  media: [String],
  dateTime: { type: Date, default: Date.now },
});
const Listing = mongoose.model("Listing", listingSchema);

// ================================
// 📌 Post a Listing with Image Upload
// ================================
app.post("/post-listing", authenticateToken, upload.array("media", 6), async (req, res) => {
  try {
    const { title, description, category, location, price } = req.body;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Please upload at least one image." });
    }

    const mediaUrls = req.files.map(file => file.path);
    const newListing = new Listing({ userId: req.user.userId, title, description, category, location, price, media: mediaUrls });
    await newListing.save();

    res.json({ message: "Listing posted successfully!", listing: newListing });
  } catch (error) {
    res.status(500).json({ error: "Error posting listing: " + error.message });
  }
});

// ================================
// 📌 Fetch Listings for a User
// ================================
app.get("/my-listings", authenticateToken, async (req, res) => {
  try {
    const listings = await Listing.find({ userId: req.user.userId });
    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: "Error fetching listings: " + error.message });
  }
});

// ================================
// 📌 Start Server
// ================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
