// module.exports = { upload, handleUploadErrors };
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure upload directory exists
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created upload directory: ${dir}`);
  }
};

// Common storage generator
const makeStorage = (folder) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.resolve(__dirname, "..", "uploads", folder);
      ensureDir(uploadDir);
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${file.fieldname}-${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });

// Property uploads (ownershipDoc + photos)
const propertyFileFilter = (req, file, cb) => {
  if (file.fieldname === "ownershipDoc") {
    if (
      ["application/pdf", "image/jpeg", "image/png", "image/jpg"].includes(
        file.mimetype
      )
    )
      cb(null, true);
    else cb(new Error("Only PDF, JPG, PNG allowed for ownershipDoc"));
  } else if (file.fieldname === "photos") {
    if (["image/jpeg", "image/png", "image/jpg"].includes(file.mimetype))
      cb(null, true);
    else cb(new Error("Only JPG, PNG allowed for photos"));
  } else cb(null, true);
};

const upload = multer({
  storage: makeStorage("properties"),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: propertyFileFilter,
});

// System settings uploads (logo + favicon)
const uploadSystem = multer({
  storage: makeStorage("system"),
  limits: { fileSize: 5 * 1024 * 1024 }, // logos usually smaller
  fileFilter: (req, file, cb) => {
    if (
      ["image/png", "image/x-icon", "image/jpeg", "image/jpg"].includes(
        file.mimetype
      )
    )
      cb(null, true);
    else cb(new Error("Only PNG, JPG, ICO allowed for system settings"));
  },
});
// Avatar uploads (profile pictures)
const uploadAvatar = multer({
  storage: makeStorage("avatars"),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (["image/jpeg", "image/png", "image/jpg", "image/gif"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, GIF allowed for avatars"));
    }
  },
});

// Common error handler
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size exceeded.",
      });
    }
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  next();
};

module.exports = {
  upload,
  uploadSystem,
  uploadAvatar, // ✅ new
  handleUploadErrors,
};
