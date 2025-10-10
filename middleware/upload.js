
// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// const ensureDir = (dir) => {
//   if (!fs.existsSync(dir)) {
//     fs.mkdirSync(dir, { recursive: true });
//     console.log(`Created upload directory: ${dir}`);
//   }
// };

// const makeStorage = (folder) =>
//   multer.diskStorage({
//     destination: (req, file, cb) => {
//       const uploadDir = path.resolve(__dirname, "..", "uploads", folder);
//       ensureDir(uploadDir);
//       cb(null, uploadDir);
//     },
//     filename: (req, file, cb) => {
//       const uniqueName = `${file.fieldname}-${Date.now()}-${Math.round(
//         Math.random() * 1e9
//       )}${path.extname(file.originalname)}`;
//       cb(null, uniqueName);
//     },
//   });

// const propertyFileFilter = (req, file, cb) => {
//   if (file.fieldname === "ownershipDoc") {
//     if (
//       ["application/pdf", "image/jpeg", "image/png", "image/jpg"].includes(
//         file.mimetype
//       )
//     )
//       cb(null, true);
//     else cb(new Error("Only PDF, JPG, PNG allowed for ownershipDoc"));
//   } else if (file.fieldname === "photos") {
//     if (["image/jpeg", "image/png", "image/jpg"].includes(file.mimetype))
//       cb(null, true);
//     else cb(new Error("Only JPG, PNG allowed for photos"));
//   } else cb(null, true);
// };

// const upload = multer({
//   storage: makeStorage("properties"),
//   limits: { fileSize: 10 * 1024 * 1024 },
//   fileFilter: propertyFileFilter,
// });

// const uploadSystem = multer({
//   storage: makeStorage("system"),
//   limits: { fileSize: 5 * 1024 * 1024 },
//   fileFilter: (req, file, cb) => {
//     if (
//       ["image/png", "image/x-icon", "image/jpeg", "image/jpg"].includes(
//         file.mimetype
//       )
//     )
//       cb(null, true);
//     else cb(new Error("Only PNG, JPG, ICO allowed for system settings"));
//   },
// });

// const uploadAvatar = multer({
//   storage: makeStorage("avatars"),
//   limits: { fileSize: 5 * 1024 * 1024 },
//   fileFilter: (req, file, cb) => {
//     if (["image/jpeg", "image/png", "image/jpg", "image/gif"].includes(file.mimetype)) {
//       cb(null, true);
//     } else {
//       cb(new Error("Only JPG, PNG, GIF allowed for avatars"));
//     }
//   },
// });

// const allowedImageMimes = ["image/jpeg", "image/png", "image/jpg", "image/webp", "image/gif"];

// const blogFileFilter = (req, file, cb) => {
//   if (file.fieldname === "featuredImage") {
//     if (allowedImageMimes.includes(file.mimetype)) cb(null, true);
//     else cb(new Error("Only JPG/PNG/WEBP/GIF allowed for featured image"));
//   } else {
//     cb(null, true);
//   }
// };

// const uploadBlog = multer({
//   storage: makeStorage("blog"),
//   limits: {
//     fileSize: 8 * 1024 * 1024
//   },
//   fileFilter: blogFileFilter,
// });

// const handleUploadErrors = (err, req, res, next) => {
//   if (err instanceof multer.MulterError) {
//     if (err.code === "LIMIT_FILE_SIZE") {
//       return res.status(400).json({
//         success: false,
//         message: "File too large. Maximum size exceeded.",
//       });
//     }
//     return res.status(400).json({
//       success: false,
//       message: err.message,
//     });
//   } else if (err) {
//     return res.status(400).json({
//       success: false,
//       message: err.message,
//     });
//   }
//   next();
// };

// module.exports = {
//   upload,
//   uploadSystem,
//   uploadAvatar,
//   uploadBlog,
//   handleUploadErrors,
// };



// middleware/upload.js
require("dotenv").config();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ======= CONFIG =======
const UPLOAD_ROOT = process.env.UPLOAD_ROOT || "/var/www/uploads";
const UPLOAD_PUBLIC_BASE = process.env.UPLOAD_PUBLIC_BASE || "/uploads";

// Ensure a directory exists
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created upload directory: ${dir}`);
  }
};

// Sanitize filename (optional but good practice)
const sanitize = (name) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");

// Build a per-folder storage engine writing under UPLOAD_ROOT/<folder>
const makeStorage = (folder) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(UPLOAD_ROOT, folder);
      ensureDir(uploadDir);
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || "";
      const base = path.basename(file.originalname, ext);
      const uniqueName = `${file.fieldname}-${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}-${sanitize(base)}${ext.toLowerCase()}`;
      cb(null, uniqueName);
    },
  });

// Convert absolute file path under UPLOAD_ROOT to public URL under UPLOAD_PUBLIC_BASE
const toPublicUrl = (absFilePath) => {
  // Normalize slashes first
  const normalized = absFilePath.replace(/\\/g, "/");
  const normalizedRoot = UPLOAD_ROOT.replace(/\\/g, "/").replace(/\/+$/, "");
  const publicBase = UPLOAD_PUBLIC_BASE.replace(/\/+$/, "");
  // Replace prefix
  return normalized.replace(normalizedRoot, publicBase);
};

// Common middleware to attach publicUrl to req.file / req.files
const attachPublicUrls = (req, res, next) => {
  const addUrl = (f) => {
    if (f && f.path) f.publicUrl = toPublicUrl(f.path);
  };

  if (req.file) addUrl(req.file);

  if (req.files) {
    if (Array.isArray(req.files)) {
      req.files.forEach(addUrl);
    } else {
      // fields upload: { fieldName: [files] }
      Object.values(req.files).forEach((arr) => arr.forEach(addUrl));
    }
  }
  next();
};

// ======= FILTERS =======
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
    if (["image/jpeg", "image/png", "image/jpg", "image/webp", "image/gif"].includes(file.mimetype))
      cb(null, true);
    else cb(new Error("Only JPG/PNG/WEBP/GIF allowed for photos"));
  } else cb(null, true);
};

const allowedImageMimes = [
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/x-icon",
];

const systemFileFilter = (req, file, cb) => {
  if (["image/png", "image/x-icon", "image/jpeg", "image/jpg", "image/webp"].includes(file.mimetype))
    cb(null, true);
  else cb(new Error("Only PNG, JPG, WEBP, ICO allowed for system settings"));
};

const avatarFileFilter = (req, file, cb) => {
  if (["image/jpeg", "image/png", "image/jpg", "image/gif", "image/webp"].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG/PNG/WEBP/GIF allowed for avatars"));
  }
};

const blogFileFilter = (req, file, cb) => {
  if (file.fieldname === "featuredImage") {
    if (allowedImageMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG/PNG/WEBP/GIF/ICO allowed for featured image"));
  } else {
    cb(null, true);
  }
};

// ======= UPLOADERS =======
const upload = multer({
  storage: makeStorage("properties"),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: propertyFileFilter,
});

const uploadSystem = multer({
  storage: makeStorage("system"),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: systemFileFilter,
});

const uploadAvatar = multer({
  storage: makeStorage("avatars"),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: avatarFileFilter,
});

const uploadBlog = multer({
  storage: makeStorage("blog"),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: blogFileFilter,
});

// ✅ Hero images uploader (JPG/PNG/WEBP/GIF/ICO)
const uploadHero = multer({
  storage: makeStorage("hero"),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (allowedImageMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG/PNG/WEBP/GIF/ICO allowed for hero images"));
  },
});

// ======= ERROR HANDLER =======
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size exceeded.",
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  next();
};

module.exports = {
  // storages
  upload, // properties
  uploadSystem, // system settings (logo, favicon)
  uploadAvatar, // user avatars
  uploadBlog, // blog featured image
  uploadHero, // ✅ hero images
  // helpers/middlewares
  attachPublicUrls,
  handleUploadErrors,
  // exports for reuse if needed
  toPublicUrl,
  UPLOAD_ROOT,
  UPLOAD_PUBLIC_BASE,
};

