const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config({ path: "./config/config.env" });
const ApiError = require("./utils/ApiError");
const predictRoute = require("./routes/predictRoute");
const trainRoute = require("./routes/trainRoute");

const app = express();
const PORT = process.env.PORT_NUMBER || 5000;

// CORS Configuration
app.use(
  cors({
    origin: [
      "http://localhost:3001",
      "http://localhost:3000",
      "http://localhost:80",
    ],
    credentials: true, // Remove this if you don't need credentials support
  })
);

// Middleware
app.use(bodyParser.json()); // Parse JSON bodies
app.use(bodyParser.urlencoded({ extended: true }));

// Route Definitions
app.use("/api/v1", predictRoute);
app.use("/api/v2", trainRoute);

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Error Handler Middleware
app.use((err, req, res, next) => {
  console.error(err.stack); // Log the error for debugging
  res.setHeader("Content-Type", "application/json");

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      statusCode: err.statusCode,
      message: err.message,
      error: err.error || null,
    });
  }

  return res.status(500).json({
    message: "Internal Server Error",
    error: err.message, // Provide error message for better debugging
  });
});
