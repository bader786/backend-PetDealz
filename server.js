require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const session = require("express-session");

const app = express();
app.use(express.json());
const corsOptions = {
    origin: (origin, callback) => {
      callback(null, origin || "*");  // Allow all origins dynamically
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
  };
  app.use(cors(corsOptions));
  

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
    format: async () => "jpg",
    public_id: (req, file) => `${req.session.userId}_${Date.now()}`,
  },
});

const upload = multer({ storage });

// ================================
// 📌 Session Configuration
// ================================
app.use(session({
    secret: process.env.SESSION_SECRET, 
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }  // Set to true if using HTTPS
}));

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
const authenticateSession = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Access denied. Please log in." });
  }
  req.user = { userId: req.session.userId };
  next();
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

    // ✅ Store user session instead of JWT
    req.session.userId = user._id;

    res.json({ message: "Login successful" });
  } catch (error) {
    res.status(500).json({ error: "Error logging in: " + error.message });
  }
});

// ================================
// 📌 Logout Route
// ================================
app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: "Error logging out" });
    res.json({ message: "Logged out successfully" });
  });
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
app.post("/post-listing", authenticateSession, upload.array("media", 6), async (req, res) => {
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
app.get("/my-listings", authenticateSession, async (req, res) => {
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
