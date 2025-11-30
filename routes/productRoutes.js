import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import Product from "../models/product.js";

const router = Router();

// ✅ CRÉER LE DOSSIER UPLOADS S'IL N'EXISTE PAS
const uploadsDir = "uploads";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("✅ Uploads directory created");
}

// stockage local ./uploads (legacy) - still available
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Vérifier à nouveau au moment de l'upload
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, "_");
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    console.log("=== FILE RECEIVED ===");
    console.log("fieldname:", file.fieldname);
    console.log("originalname:", file.originalname);
    console.log("mimetype:", file.mimetype);
    console.log("====================");
    
    // Accepter image/* et les types spécifiques
    if (file.mimetype === 'image/*' || /image\/(png|jpe?g|webp|gif)/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only images are allowed. Received mimetype: ${file.mimetype}`));
    }
  }
});

// memory storage for GridFS uploads
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// CRUD
router.get("/", async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
});

router.get("/:id", async (req, res) => {
  const p = await Product.findById(req.params.id);
  if (!p) return res.status(404).json({ message: "Not found" });
  res.json(p);
});

router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { name, description = "", price } = req.body;
    if (!name || price == null) {
      return res.status(400).json({ message: "name and price required" });
    }
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    
    console.log("✅ Product created with image:", imageUrl);
    
    const product = await Product.create({
      name,
      description,
      price: Number(price),
      imageUrl
    });
    res.status(201).json(product);
  } catch (e) {
    console.error("❌ Error creating product:", e);
    res.status(500).json({ message: e.message });
  }
});

// -----------------------
// GridFS upload (store image in MongoDB / Atlas)
// POST /api/products/grid  (form-data field: image)
// -----------------------
router.post("/grid", memoryUpload.single("image"), async (req, res) => {
  try {
    const { name, description = "", price } = req.body;
    if (!name || price == null) {
      return res.status(400).json({ message: "name and price required" });
    }

    let imageFileId = null;
    if (req.file && req.file.buffer) {
      if (!mongoose.connection.db) {
        return res.status(500).json({ message: "DB not ready" });
      }
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "images" });
      const uploadStream = bucket.openUploadStream(req.file.originalname, { contentType: req.file.mimetype });
      uploadStream.end(req.file.buffer);
      await new Promise((resolve, reject) => {
        uploadStream.on("finish", (fileDoc) => {
          imageFileId = fileDoc._id;
          resolve();
        });
        uploadStream.on("error", reject);
      });
    }

    const product = await Product.create({
      name,
      description,
      price: Number(price),
      imageFileId,
      imageUrl: imageFileId ? `/api/products/image/${imageFileId}` : ""
    });
    res.status(201).json(product);
  } catch (e) {
    console.error("❌ Error creating product (GridFS):", e);
    res.status(500).json({ message: e.message });
  }
});

// stream image from GridFS
router.get("/image/:id", async (req, res) => {
  try {
    if (!mongoose.connection.db) return res.status(500).json({ message: "DB not ready" });
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "images" });
    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.on("error", (err) => {
      console.error("GridFS download error:", err);
      res.status(404).json({ message: "Not found" });
    });
    downloadStream.pipe(res);
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: "Invalid id" });
  }
});

router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const { name, description, price } = req.body;
    const update = {};
    if (name != null) update.name = name;
    if (description != null) update.description = description;
    if (price != null) update.price = Number(price);
    if (req.file) update.imageUrl = `/uploads/${req.file.filename}`;
    const product = await Product.findByIdAndUpdate(req.params.id, update, {
      new: true
    });
    if (!product) return res.status(404).json({ message: "Not found" });
    res.json(product);
  } catch (e) {
    console.error("❌ Error updating product:", e);
    res.status(500).json({ message: e.message });
  }
});

router.delete("/:id", async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
});

export default router;