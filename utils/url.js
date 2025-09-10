// utils/url.js
function publicFileUrl(req, relPath) {
  // relPath like: 'properties/abc.jpg' or 'properties\\abc.jpg'
  const clean = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}/uploads/${clean}`;
}

function fileRelPathFromUpload(file, subdir = 'properties') {
  // ALWAYS store "properties/<filename>"
  return `${subdir}/${file.filename}`;
}

module.exports = { publicFileUrl, fileRelPathFromUpload };
