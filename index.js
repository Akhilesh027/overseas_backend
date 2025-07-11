const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const Contact = require("./models/Contact"); // Import the Contact model
const Consultation = require("./models/Consultation");

const app = express();
const PORT = 5050;

// Middleware
app.use(cors());
app.use(express.json());

// ✅ MongoDB Connection
mongoose
  .connect("mongodb+srv://akhileshreddy811:FdXjNbsTpx2wxfBc@cluster0.j8bppou.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "akhileshreddy027@gmail.com",
    pass: "falz qjnf dgnb wjsy", // App password
  },
});

// ✅ Contact Form API with DB Save
app.post("/api/contact", async (req, res) => {
  const { name, email, phone, requirement } = req.body;

  const mailOptions = {
    from: "akhileshreddy027@gmail.com",
    to: "akhileshreddy027@gmail.com",
    subject: "New Enquiry from Contact Form",
    html: `
      <h3>New Contact Form Submission</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Requirement:</strong> ${requirement}</p>
    `,
  };

  try {
    // Save to MongoDB
    const newContact = new Contact({ name, email, phone, requirement });
    await newContact.save();

    // Send email
    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "Email sent & data saved successfully" });
  } catch (error) {
    console.error("Error processing contact form:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
});

// POST API to save consultation requests
app.post("/api/consultation", async (req, res) => {
  const { name, email, phone, country, level } = req.body;

  if (!name || !email || !phone || !country || !level) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const newConsultation = new Consultation({ name, email, phone, country, level });
    await newConsultation.save();

    res.status(200).json({ message: "Consultation request submitted successfully" });
  } catch (error) {
    console.error("Error saving consultation data:", error);
    res.status(500).json({ message: "Failed to submit consultation request" });
  }
});
const ACCESS_CODE = "CLYRA2025";

// Protected route to fetch both Contact and Consultation data
app.post("/api/admin-data", async (req, res) => {
  const { code } = req.body;

  if (code !== ACCESS_CODE) {
    return res.status(401).json({ message: "Invalid Access Code" });
  }

  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    const consultations = await Consultation.find().sort({ createdAt: -1 });

    res.json({ contacts, consultations });
  } catch (error) {
    console.error("Error fetching admin data:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
