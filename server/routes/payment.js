const express = require("express");
const { handlePaymentCallback, initiatePayment } = require("../controllers/paymentController");

const router = express.Router();

router.post("/callback", handlePaymentCallback);
router.get("/callback", handlePaymentCallback);
router.post("/initiate", initiatePayment);

module.exports = router;