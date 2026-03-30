const mongoose = require("mongoose");

const OperatorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  skills: {
    type: [String],   // Example: ["Network", "Software"]
    required: true
  },
  activeTicketCount: {
    type: Number,
    default: 0
  },
  availability: {
    type: Boolean,
    default: true
  }
});

module.exports = mongoose.model("Operator", OperatorSchema);
