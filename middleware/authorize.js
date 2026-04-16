// middleware/authorize.js
function hasPermission(user, permissionKey) {
  if (!user || !user.module_permissions) return false;

  const [resource, action] = permissionKey.split(".");
  if (!resource || !action) return false;

  const mod = user.module_permissions[resource];
  if (!mod) return false;

  return !!mod[action]; // true/false
}

function authorize(permissionKey) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!hasPermission(req.user, permissionKey)) {
      return res
        .status(403)
        .json({ message: `Forbidden: missing permission ${permissionKey}` });
    }

    next();
  };
}

module.exports = { authorize, hasPermission };
