const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require("path");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");

// Load env vars
dotenv.config();

// Connect to Database only if connection string is provided
if (process.env.MONGODB_URI) {
  connectDB();
} else {
  console.warn('MONGODB_URI is not set. API will run without a database connection.');
}

// Route files
const authRoutes = require("./routes/auth");
const destinationRoutes = require("./routes/destinations");
const bookingRoutes = require("./routes/bookings");
const newsletterRoutes = require("./routes/newsletter");
const adminRoutes = require("./routes/admin");
const settingsRoutes = require("./routes/settings");
const adminController = require("./controllers/adminController");
const cartRoutes = require("./routes/cart");
const userRoutes = require("./routes/users");
const paymentRoutes = require("./routes/payment");
const airports = require('./routes/airports');
const notificationRoutes = require('./routes/notificationRoutes');
const flightRoutes = require('./routes/flights');
const contactRoutes = require('./routes/contact');
const supportRoutes = require('./routes/support');
const storageRoutes = require('./routes/storage');

const app = express();

// Body parser middleware
app.use(express.json());

// Behind proxies/load balancers (Render, Vercel)
app.set('trust proxy', 1);

// Enable CORS with specific options (MUST be before sessions)
const allowedOrigins = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'https://tourtastic.vercel.app'
];

// Regex for matching Vercel Preview URLs
const vercelRegex = /^https:\/\/.*\.vercel\.app$/;

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || vercelRegex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS error: Not allowed origin - ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Session-ID'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

// Session middleware for anonymous cart support
const sessionOptions = {
  secret: process.env.SESSION_SECRET || 'your-session-secret-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    // Cross-site cookies for Vercel (frontend) -> Render (backend)
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};
if (process.env.MONGODB_URI) {
  sessionOptions.store = MongoStore.create({ mongoUrl: process.env.MONGODB_URI });
}
app.use(session(sessionOptions));

// Health check endpoints (support both root and /api for platform routing)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: process.env.MONGODB_URI ? 'connected' : 'not configured'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: process.env.MONGODB_URI ? 'connected' : 'not configured'
  });
});

// Mount routers
app.use("/api/auth", authRoutes);
app.use("/api/destinations", destinationRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/admin", adminRoutes);
app.use('/api/settings', settingsRoutes);

// Public development-only endpoint: return flight bookings without auth when explicitly requested.
// This is useful for local dev environments where the frontend may not have an admin session yet.
// IMPORTANT: This route is intentionally lightweight and should NOT be enabled in production.
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/admin/flight-bookings/public', async (req, res, next) => {
    try {
      // Reuse the controller logic to return mapped flight bookings
      return adminController.getAllFlightBookings(req, res, next);
    } catch (err) {
      next(err);
    }
  });
}
app.use("/api/cart", cartRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payment", paymentRoutes);
app.use('/api/airports', airports);
app.use('/api/notifications', notificationRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/storage', storageRoutes);

// Serve static files from the uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Basic route for testing API is running
app.get("/", (req, res) => res.send("Tourtastic API Running"));

// Use error handler middleware
app.use(errorHandler);

// In Vercel Serverless, export the Express app without binding a port
// In local/dev environments or Render, start the HTTP server
let server;
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  const HOST = process.env.HOST || '0.0.0.0';
  
  server = app.listen(PORT, HOST, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode`);
    console.log(`Listening on ${HOST}:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Handle unhandled promise rejections only when a server is running
  process.on("unhandledRejection", (err) => {
    console.error(`Unhandled Rejection: ${err.message}`);
    if (server) server.close(() => process.exit(1));
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    if (server) {
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    }
  });
}

module.exports = app;
