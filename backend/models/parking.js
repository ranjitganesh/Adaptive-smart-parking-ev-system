const mongoose = require("mongoose");

const parkingSchema = new mongoose.Schema({
  carCount: Number,
  availableSlots: Number,
  status: String,
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Parking", parkingSchema);