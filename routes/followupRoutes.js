const express = require("express");
const router = express.Router();
const FollowUpController = require("../controllers/FollowUpController");
const { authJwt } = require("../middleware");

// Unified CRUD & Action endpoints
router.post("/create", authJwt.verifyToken, FollowUpController.create);
router.get("/get-all", authJwt.verifyToken, FollowUpController.getAll);
router.get("/getall", authJwt.verifyToken, FollowUpController.getAll);
router.get("/getById/:id", authJwt.verifyToken, FollowUpController.getById);
router.get("/getbyid/:id", authJwt.verifyToken, FollowUpController.getById);
router.put("/update/:id", authJwt.verifyToken, FollowUpController.update);
router.post("/complete/:id", authJwt.verifyToken, FollowUpController.complete);
router.delete("/delete/:id", authJwt.verifyToken, FollowUpController.delete);
router.delete("/remove/:id", authJwt.verifyToken, FollowUpController.delete);
router.get("/count", authJwt.verifyToken, FollowUpController.getAll);
router.get("/entity/:entityCode/:entityId", authJwt.verifyToken, FollowUpController.getByEntity);

// Lead specific aliases
router.get("/getByLeadId/:leadId", authJwt.verifyToken, (req, res) => {
  req.query.entity = "LEAD";
  req.query.entityId = req.params.leadId;
  return FollowUpController.getAll(req, res);
});

router.get("/countByLeadId/:leadId", authJwt.verifyToken, (req, res) => {
  req.query.entity = "LEAD";
  req.query.entityId = req.params.leadId;
  return FollowUpController.getAll(req, res);
});

// Buyer specific aliases
router.get("/getByBuyerId/:buyerId", authJwt.verifyToken, (req, res) => {
  req.query.entity = "BUYER";
  req.query.entityId = req.params.buyerId;
  return FollowUpController.getAll(req, res);
});

// Seller specific aliases
router.get("/getBySellerId/:sellerId", authJwt.verifyToken, (req, res) => {
  req.query.entity = "SELLER";
  req.query.entityId = req.params.sellerId;
  return FollowUpController.getAll(req, res);
});

module.exports = router;

