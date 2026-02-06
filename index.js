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

/* =========================
   Middleware
========================= */
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
========================= */
// ✅ Use Gmail App Password (recommended)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER, // ex: clyraoverseas06@gmail.com
    pass: process.env.MAIL_PASS, // Gmail App Password
  },
});

// ✅ Verify transporter on server start
transporter.verify((error) => {
  if (error) {
    console.log("❌ Nodemailer transporter error:", error);
  } else {
    console.log("✅ Nodemailer transporter is ready");
  }
});

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

/* =========================
   Health Check
========================= */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Server is running" });
});

/* =========================
   Test Mail Route (Check Nodemailer)
========================= */
app.get("/api/test-mail", async (req, res) => {
  try {
    const info = await transporter.sendMail({
      from: `"Clyra Overseas Website" <${process.env.MAIL_USER}>`,
      to: process.env.MAIL_TO || process.env.MAIL_USER,
      subject: "✅ Nodemailer Test",
      text: "If you received this email, Nodemailer is working.",
    });

    res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error("❌ Test mail failed:", err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

/* =========================
   Contact Form API (Save DB + Send Email)
========================= */
app.post("/api/contact", async (req, res) => {
  const name = safe(req.body?.name);
  const email = safe(req.body?.email);
  const phone = safe(req.body?.phone);
  const requirement = safe(req.body?.requirement);

  // ✅ basic validation
  if (!name || !email || !phone || !requirement) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email address" });
  }

  try {
    // ✅ Save to MongoDB first
    const newContact = await Contact.create({ name, email, phone, requirement });

    // ✅ Send email (use authenticated from + replyTo user)
    await transporter.sendMail({
      from: `"Clyra Overseas Website" <${process.env.MAIL_USER}>`,
      replyTo: email,
      to: process.env.MAIL_TO || process.env.MAIL_USER,
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

    return res
      .status(200)
      .json({ message: "Email sent & data saved successfully" });
  } catch (error) {
    console.error("❌ Error processing contact form:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

/* =========================
   Consultation API (Save DB)
========================= */
// ✅ Consultation API (Save DB + Send Email)
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

    // ✅ Send email to admin
    await transporter.sendMail({
      from: `"Clyra Overseas Website" <${process.env.MAIL_USER}>`,
      replyTo: email,
      to: process.env.MAIL_TO || process.env.MAIL_USER,
      subject: "New Consultation Request",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h3>New Consultation Request</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
         
          <hr/>
        </div>
      `,
    });

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
   ✅ returns contacts + consultations data
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
    // ✅ Get data
    const contacts = await Contact.find().sort({ createdAt: -1 }).lean();
    const consultations = await Consultation.find().sort({ createdAt: -1 }).lean();

    // ✅ Optional: include counts
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
   Global Error Handler (Optional)
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
