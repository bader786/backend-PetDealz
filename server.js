require("dotenv").config(); // Load environment variables
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const { GridFSBucket } = require("mongodb");
const { ObjectId } = require("mongoose").Types;

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "https://petdealz.vercel.app",
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
  })
);
app.options("*", cors());

// ================================
// 📌 MongoDB Connection
// ================================
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const conn = mongoose.connection;

let gridFSBucket;
conn.once("open", () => {
  gridFSBucket = new GridFSBucket(conn.db, { bucketName: "uploads" });
  console.log("✅ GridFS Initialized");
});

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
// 📌 Signup Endpoint
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

// ================================
// 📌 Login Endpoint
// ================================
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
  media: [String], // Store image IDs from GridFS
  dateTime: { type: Date, default: Date.now },
});
const Listing = mongoose.model("Listing", listingSchema);

// ================================
// 📌 File Upload Setup (Multer)
// ================================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ================================
// 📌 Upload Images to GridFS
// ================================
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const uploadStream = gridFSBucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
    });

    uploadStream.end(req.file.buffer);

    uploadStream.on("finish", () => {
      res.json({ message: "File uploaded successfully!", fileId: uploadStream.id.toString() });
    });

  } catch (error) {
    res.status(500).json({ error: "Error uploading file" });
  }
});

// ================================
// 📌 Retrieve Images from GridFS
// ================================
app.get("/image/:id", async (req, res) => {
  try {
    const fileId = req.params.id;
    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: "Invalid file ID" });
    }

    const file = await conn.db.collection("uploads.files").findOne({ _id: new ObjectId(fileId) });
    if (!file) return res.status(404).json({ error: "File not found" });

    const readStream = gridFSBucket.openDownloadStream(file._id);
    res.set("Content-Type", file.contentType);
    readStream.pipe(res);

  } catch (error) {
    res.status(500).json({ error: "Error retrieving image" });
  }
});

// ================================
// 📌 Middleware: Validate Description (No Phone Numbers Allowed)
// ================================
const validateDescription = (req, res, next) => {
  const { description } = req.body;
  const phoneRegex = /\b\d{10,}\b/;
  if (phoneRegex.test(description)) {
    return res.status(400).json({ error: "Phone numbers are not allowed in the description." });
  }
  next();
};

// ================================
// 📌 Post a Listing
// ================================
app.post("/post-listing", upload.array("media", 6), validateDescription, async (req, res) => {
    try {
      const { userId, title, description, category, location, price } = req.body;
      const files = req.files;
  
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "Please upload at least one image." });
      }
  
      const media = files.map(file => file.id?.toString()); // Ensure we store valid ObjectId
      const newListing = new Listing({ userId, title, description, category, location, price, media });
  
      await newListing.save();
      res.json({ message: "Listing posted successfully!", listing: newListing });
  
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
// ================================
// 📌 Fetch All Listings
// ================================
app.get("/get-listings", async (req, res) => {
    try {
      const listings = await Listing.find();
      const updatedListings = listings.map(listing => ({
        ...listing._doc,
        media: listing.media.map(fileId => fileId ? `https://backend-petdealz.onrender.com/image/${fileId}` : 'default.jpg')
      }));
      res.json(updatedListings);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  

// ================================
// 📌 Start Server
// ================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
