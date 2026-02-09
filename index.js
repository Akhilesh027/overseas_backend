// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");

const Contact = require("./models/Contact");
const Consultation = require("./models/Consultation");

const app = express();
const PORT = process.env.PORT || 5050;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json({ limit: "1mb" }));

/* =========================
   MongoDB Connection
========================= */
async function connectDB() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI missing in .env");
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
}
connectDB();

/* =========================
   Nodemailer Transporter
   ✅ IMPORTANT: Many hosts (Render) block SMTP => ETIMEDOUT.
   ✅ This code will NOT crash your API if mail fails.
========================= */
const transporter =
  process.env.MAIL_ENABLED === "true"
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS, // Gmail App Password
        },
        // timeouts to avoid long hanging requests
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      })
    : null;

// ✅ Verify transporter on server start (optional)
if (transporter) {
  transporter.verify((error) => {
    if (error) console.log("❌ Nodemailer transporter error:", error);
    else console.log("✅ Nodemailer transporter is ready");
  });
} else {
  console.log("ℹ️ MAIL_ENABLED is false — emails will be skipped.");
}

/* =========================
   Helpers
========================= */
const safe = (v) =>
  String(v ?? "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

async function sendAdminMail({ replyTo, subject, html }) {
  // ✅ If SMTP blocked / disabled, don't fail APIs
  if (!transporter) return { skipped: true };

  const to = process.env.MAIL_TO || process.env.MAIL_USER;

  return transporter.sendMail({
    from: `"Clyra Overseas Website" <${process.env.MAIL_USER}>`,
    replyTo,
    to,
    subject,
    html,
  });
}

/* =========================
   Health Check
========================= */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Server is running",
    mailEnabled: process.env.MAIL_ENABLED === "true",
  });
});

/* =========================
   Test Mail Route
========================= */
app.get("/api/test-mail", async (req, res) => {
  try {
    const info = await sendAdminMail({
      replyTo: process.env.MAIL_USER,
      subject: "✅ Nodemailer Test",
      html: "<p>If you received this email, mail is working.</p>",
    });

    res.json({ ok: true, info });
  } catch (err) {
    console.error("❌ Test mail failed:", err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

/* =========================
   Contact Form API (Save DB + Email)
========================= */
app.post("/api/contact", async (req, res) => {
  const name = safe(req.body?.name);
  const email = safe(req.body?.email);
  const phone = safe(req.body?.phone);
  const requirement = safe(req.body?.requirement);

  if (!name || !email || !phone || !requirement) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email address" });
  }

  try {
    // ✅ Save to MongoDB first
    const newContact = await Contact.create({ name, email, phone, requirement });

    // ✅ Email admin (don't break API if mail fails)
    try {
      await sendAdminMail({
        replyTo: email,
        subject: "New Enquiry from Contact Form",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <h3>New Contact Form Submission</h3>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Requirement:</strong> ${requirement}</p>
            <hr/>
            <p style="color:#666;font-size:12px">Saved ID: ${newContact._id}</p>
          </div>
        `,
      });
    } catch (mailErr) {
      console.error("❌ Contact mail failed (SMTP blocked?):", mailErr);
    }

    return res.status(200).json({
      message: "Contact saved successfully",
      contact: newContact,
    });
  } catch (error) {
    console.error("❌ Error processing contact form:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

/* =========================
   Consultation API (Save DB + Email)
========================= */
app.post("/api/consultation", async (req, res) => {
  const name = safe(req.body?.name);
  const email = safe(req.body?.email);
  const phone = safe(req.body?.phone);
  const country = safe(req.body?.country);
  const level = safe(req.body?.level);

  if (!name || !email || !phone || !country || !level) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email address" });
  }

  try {
    // ✅ Save to DB
    const doc = await Consultation.create({ name, email, phone, country, level });

    // ✅ Email admin (don't break API if mail fails)
    try {
      await sendAdminMail({
        replyTo: email,
        subject: "New Consultation Request",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <h3>New Consultation Request</h3>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Country:</strong> ${country}</p>
            <p><strong>Level:</strong> ${level}</p>
            <hr/>
            <p style="color:#666;font-size:12px">Saved ID: ${doc._id}</p>
          </div>
        `,
      });
    } catch (mailErr) {
      console.error("❌ Consultation mail failed (SMTP blocked?):", mailErr);
    }

    return res.status(200).json({
      message: "Consultation request submitted successfully",
      consultation: doc,
    });
  } catch (error) {
    console.error("❌ Error saving consultation data:", error);
    return res.status(500).json({
      message: "Failed to submit consultation request",
      error: error?.message || String(error),
    });
  }
});

/* =========================
   Admin Protected Route (Access Code)
========================= */
app.post("/api/admin-data", async (req, res) => {
  const code = safe(req.body?.code);

  if (!process.env.ACCESS_CODE) {
    return res.status(500).json({ message: "ACCESS_CODE missing in .env" });
  }
  if (code !== process.env.ACCESS_CODE) {
    return res.status(401).json({ message: "Invalid Access Code" });
  }

  try {
    const contacts = await Contact.find().sort({ createdAt: -1 }).lean();
    const consultations = await Consultation.find().sort({ createdAt: -1 }).lean();

    return res.json({
      contactsCount: contacts.length,
      consultationsCount: consultations.length,
      contacts,
      consultations,
    });
  } catch (error) {
    console.error("❌ Error fetching admin data:", error);
    return res.status(500).json({ message: "Server Error" });
  }
});

/* =========================
   Global Error Handler
========================= */
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ message: "Internal Server Error" });
});

/* =========================
   Start Server
========================= */
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
