const asyncHandler = require("../middleware/asyncHandler");
const FlightBooking = require("../models/FlightBooking");
const Booking = require("../models/Booking");
const Notification = require("../models/Notification");
const crypto = require('crypto');
const { issueOrder } = require('../utils/seeruAPI');

// Load payment config from environment
const ECASH_PAYMENT_GATEWAY_URL = process.env.ECASH_PAYMENT_GATEWAY_URL || 'https://checkout.ecash-pay.com';
const TERMINAL_KEY = process.env.TERMINAL_KEY || '';
const MERCHANT_KEY = process.env.MERCHANT_KEY || '';
const MERCHANT_SECRET = process.env.MERCHANT_SECRET || '';
const SERVER_PUBLIC_URL = process.env.SERVER_PUBLIC_URL || '';

function md5Upper(input) {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex').toUpperCase();
}

function buildVerificationCode(amount, orderRef) {
  // vc = MD5(mid + secret + amount + orderRef)
  return md5Upper(`${MERCHANT_KEY}${MERCHANT_SECRET}${amount}${orderRef}`);
}

function buildExpectedCallbackToken(transactionNo, amount, orderRef) {
  // token = MD5(mid + secret + transactionNo + amount + orderRef)
  return md5Upper(`${MERCHANT_KEY}${MERCHANT_SECRET}${transactionNo}${amount}${orderRef}`);
}

// @desc    Initiate ECash payment (server-side)
// @route   POST /api/payment/initiate
// @access  Private (requires authenticated user) but can be relaxed as needed
exports.initiatePayment = asyncHandler(async (req, res) => {
  const { amount, orderRef, returnUrl } = req.body || {};
  if (!TERMINAL_KEY || !MERCHANT_KEY || !MERCHANT_SECRET) {
    return res.status(500).json({ success: false, message: 'Payment gateway not configured' });
  }
  if (!amount || !orderRef) {
    return res.status(400).json({ success: false, message: 'Missing amount or orderRef' });
  }

  // Build verification and URLs
  const verificationCode = buildVerificationCode(amount, orderRef);
  const ru = encodeURIComponent(returnUrl || `${SERVER_PUBLIC_URL}/payment/success`);
  // callback must point to server public URL
  const cu = encodeURIComponent(`${SERVER_PUBLIC_URL}/api/payment/callback`);

  const paymentUrl = `${ECASH_PAYMENT_GATEWAY_URL}/Checkout/CardCheckout?tk=${TERMINAL_KEY}&mid=${MERCHANT_KEY}&vc=${verificationCode}&c=SYP&a=${amount}&lang=EN&or=${orderRef}&ru=${ru}&cu=${cu}`;
  return res.status(200).json({ success: true, url: paymentUrl });
});

// @desc    Handle ECash payment callback
// @route   POST /api/payment/callback
// @access  Public
exports.handlePaymentCallback = asyncHandler(async (req, res) => {
  const payload = {
    ...(req.query || {}),
    ...(req.body || {})
  };

  const orderRef = payload.orderRef || payload.orderref || payload.or || payload.order_ref || payload.order || payload.bookingId || payload.booking_id;
  const transactionNo = payload.transactionNo || payload.transactionno || payload.transaction_no || payload.transaction || payload.transNo || payload.trans_no || payload.tn;
  const amountRaw = payload.amount ?? payload.a ?? payload.Amount ?? payload.A;
  const token = payload.token || payload.Token || payload.t;
  const message = payload.message || payload.msg || payload.errorMessage || payload.error_message || payload.Message || null;

  const parseIsSuccess = (v) => {
    if (typeof v === 'boolean') return v;
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return false;
    return ['1', 'true', 'yes', 'y', 'success', 'succeeded', 'ok', 'completed', 'paid'].includes(s);
  };

  const isSuccess = parseIsSuccess(payload.isSuccess ?? payload.success ?? payload.is_success ?? payload.status ?? payload.result);
  const amountStr = amountRaw == null ? '' : String(amountRaw).trim();

  if (!orderRef || !transactionNo || !amountStr || !token) {
    return res.status(400).json({
      success: false,
      message: "Missing required payment information"
    });
  }

  try {
    // Verify callback token
    if (!MERCHANT_KEY || !MERCHANT_SECRET) {
      return res.status(500).json({ success: false, message: 'Payment gateway not configured' });
    }
    const tokenUpper = String(token).toUpperCase();
    const baseAmount = amountStr;
    const noCommas = baseAmount.replace(/,/g, '');
    const trimmedZeros = noCommas.replace(/(\.[0-9]*?)0+$/, '$1').replace(/\.$/, '').replace(/\.0+$/, '');
    const parsed = Number(noCommas);
    const parsedStr = Number.isFinite(parsed) ? String(parsed) : null;

    const amountCandidates = [baseAmount, noCommas, trimmedZeros, parsedStr].filter(v => v != null && String(v).length > 0);
    const expectedTokens = new Set(
      amountCandidates.map(a => buildExpectedCallbackToken(String(transactionNo || ''), String(a), String(orderRef || '')))
    );

    if (!expectedTokens.has(tokenUpper)) {
      return res.status(400).json({ success: false, message: 'Invalid callback token' });
    }

    // Find the booking by orderRef
    let booking = await FlightBooking.findOne({ bookingId: orderRef });
    if (!booking) {
      booking = await Booking.findOne({ bookingId: orderRef });
    }

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const amountNumber = Number(String(amountCandidates[1] ?? amountCandidates[0] ?? amountStr).replace(/,/g, ''));
    const safeAmountNumber = Number.isFinite(amountNumber) ? amountNumber : 0;

    if (!booking.paymentDetails) {
      booking.paymentDetails = {};
    }

    booking.paymentDetails.status = isSuccess ? 'completed' : 'pending';
    booking.paymentDetails.currency = 'SYP';
    booking.paymentDetails.amount = safeAmountNumber;
    booking.paymentDetails.reference = String(transactionNo);
    booking.paymentDetails.transactions = [
      ...(booking.paymentDetails.transactions || []),
      {
        date: new Date(),
        amount: safeAmountNumber,
        type: 'payment',
        reference: String(transactionNo)
      }
    ];

    if (isSuccess) {
      booking.status = "confirmed";
      booking.paymentStatus = "completed";
      
      // Create payment success notification
      await Notification.create({
        userId: booking.userId,
        title: {
          en: "Payment Successful",
          ar: "تمت عملية الدفع بنجاح"
        },
        message: {
          en: `Your payment of ${amount} SYP for booking ${orderRef} has been processed successfully.`,
          ar: `تم معالجة دفعتك البالغة ${amount} ليرة سورية للحجز ${orderRef} بنجاح.`
        },
        type: "payment"
      });

      // Issue ticket from Seeru if order is saved
      if (booking.seeruOrderId) {
        console.log('🎫 Issuing ticket from Seeru after payment confirmation for order:', booking.seeruOrderId);
        issueOrder(booking.seeruOrderId)
          .then(result => {
            if (result.success) {
              console.log('✅ Ticket issued successfully after payment');
              
              // Update booking with ticket details
              booking.seeruStatus = 'issued';
              booking.status = 'issued';
              
              // Save ticket details
              if (!booking.ticketDetails) {
                booking.ticketDetails = {};
              }
              
              booking.ticketDetails.ticketNumber = result.ticketNumber;
              booking.ticketDetails.pnr = result.pnr;
              booking.ticketDetails.eTicketPath = result.ticketUrl;
              booking.seeruIssuedAt = result.issuedAt;
              
              booking.save()
                .then(() => {
                  console.log('✅ Booking updated with ticket details:', {
                    ticketNumber: result.ticketNumber,
                    pnr: result.pnr,
                    ticketUrl: result.ticketUrl
                  });
                })
                .catch(err => {
                  console.error('❌ Error saving ticket details to booking:', err);
                });
            } else {
              console.error('❌ Failed to issue ticket:', result.error);
              booking.seeruStatus = 'issue_failed';
              booking.seeruError = result.error;
              booking.save();
            }
          })
          .catch(error => {
            console.error('❌ Error issuing ticket after payment:', error);
            booking.seeruStatus = 'issue_error';
            booking.seeruError = error.message;
            booking.save();
          });
      }
    } else {
      booking.paymentStatus = "failed";
      // Create payment failure notification
      await Notification.create({
        userId: booking.userId,
        title: {
          en: "Payment Failed",
          ar: "فشلت عملية الدفع"
        },
        message: {
          en: `Your payment for booking ${orderRef} has failed. Please try again or contact support.`,
          ar: `فشلت عملية الدفع للحجز ${orderRef}. يرجى المحاولة مرة أخرى أو الاتصال بالدعم.`
        },
        type: "payment"
      });
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: "Payment callback processed successfully"
    });
  } catch (error) {
    console.error("Payment callback error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process payment callback"
    });
  }
}); 