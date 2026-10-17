const mongoose = require("mongoose");
try {
  require("dotenv").config();
} catch (_) {}


const connectDB = async () => {
  const mongoURI =
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017/smartparking";

  try {
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("✅ MongoDB Connected Successfully to:", mongoURI.replace(/\/\/[^@]+@/, "//***:***@"));
  } catch (err) {
    console.error("⚠️ MongoDB Connection Notice:", err.message);
    console.warn("ℹ️ Running in memory / offline mode for database logging.");
  }
};

module.exports = connectDB;