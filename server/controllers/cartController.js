const asyncHandler = require("../middleware/asyncHandler");
const Booking = require("../models/Booking");
const FlightBooking = require("../models/FlightBooking");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { checkFareValidityIfEnabled, processSeeruBookingIfEnabled } = require('../utils/seeruBookingHelper');

// Helper function to generate a unique flight booking ID
async function generateFlightBookingId() {
  const lastBooking = await FlightBooking.findOne().sort({ createdAt: -1 });
  let nextIdNumber = 1001;
  if (lastBooking && lastBooking.bookingId) {
    const lastIdNumber = parseInt(lastBooking.bookingId.split("-")[1]);
    if (!isNaN(lastIdNumber)) {
      nextIdNumber = lastIdNumber + 1;
    }
  }
  return `FB-${nextIdNumber}`;
}

// @desc    Add flight to cart (works for both authenticated and anonymous users)
// @route   POST /api/cart
// @access  Public
exports.addFlightToCart = asyncHandler(async (req, res) => {
  const { flightDetails } = req.body;

  if (!flightDetails) {
    return res.status(400).json({
      success: false,
      message: "Flight details are required"
    });
  }

  // Validate required fields
  if (!flightDetails.from || !flightDetails.to || !flightDetails.departureDate) {
    return res.status(400).json({
      success: false,
      message: "Missing required flight details: from, to, or departureDate"
    });
  }

  if (!flightDetails.selectedFlight || !flightDetails.selectedFlight.flightId || 
      !flightDetails.selectedFlight.airline) {
    return res.status(400).json({
      success: false,
      message: "Missing required selected flight details"
    });
  }

  // Validate price - handle both number and object formats
  if (!flightDetails.selectedFlight.price && 
      flightDetails.selectedFlight.price !== 0) {
    return res.status(400).json({
      success: false,
      message: "Missing flight price"
    });
  }

  if (req.user) {
    // Check for existing booking to prevent duplicates
    const existingBooking = await FlightBooking.findOne({
      userId: req.user.id,
      status: "pending",
      'flightDetails.selectedFlight.flightId': flightDetails.selectedFlight?.flightId,
      'flightDetails.departureDate': new Date(flightDetails.departureDate)
    });

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: "This flight is already in your cart"
      });
    }

    // Authenticated user - save to database
    const bookingId = await generateFlightBookingId();
    
    // Prepare flight details with proper date conversion
    const processedFlightDetails = {
      ...flightDetails,
      departureDate: new Date(flightDetails.departureDate),
      selectedFlight: {
        ...flightDetails.selectedFlight,
        departureTime: new Date(flightDetails.selectedFlight.departureTime || flightDetails.departureDate),
        arrivalTime: new Date(flightDetails.selectedFlight.arrivalTime || flightDetails.departureDate),
        price: {
          total: Number(flightDetails.selectedFlight.price.total),
          currency: flightDetails.selectedFlight.price.currency || 'USD'
        }
      }
    };
    
    const flightBooking = await FlightBooking.create({
      bookingId,
      userId: req.user.id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      flightDetails: processedFlightDetails,
      status: "pending"
    });

    // Step 1: Check fare validity with Seeru (POST /booking/fare)
    // This is done asynchronously to not block the response
    console.log('📝 Booking created locally. Checking fare validity with Seeru...');
    console.log('📋 Booking ID:', flightBooking.bookingId);
    
    checkFareValidityIfEnabled(flightBooking)
      .then(result => {
        console.log('✅ Fare validity check completed:', result);
      })
      .catch(error => {
        console.error('❌ Error checking fare validity:', error);
        // Don't throw error - booking is already saved locally
      });

    res.status(201).json({
      success: true,
      data: flightBooking,
    });
  } else {
    // Anonymous user - save to session
    if (!req.session.cart) {
      req.session.cart = [];
    }

    // Check for duplicates in session
    const existingItem = req.session.cart.find(item => 
      item.flightDetails?.selectedFlight?.flightId === flightDetails.selectedFlight?.flightId &&
      new Date(item.flightDetails?.departureDate).getTime() === new Date(flightDetails.departureDate).getTime()
    );

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: "This flight is already in your cart"
      });
    }

    const cartItem = {
      id: 'temp_' + Date.now(),
      type: 'flight',
      flightDetails: {
        ...flightDetails,
        departureDate: new Date(flightDetails.departureDate),
        selectedFlight: {
          ...flightDetails.selectedFlight,
          departureTime: new Date(flightDetails.selectedFlight.departureTime || flightDetails.departureDate),
          arrivalTime: new Date(flightDetails.selectedFlight.arrivalTime || flightDetails.departureDate),
          price: {
            total: Number(flightDetails.selectedFlight.price.total),
            currency: flightDetails.selectedFlight.price.currency || 'USD'
          }
        }
      },
      addedAt: new Date()
    };

    req.session.cart.push(cartItem);

    res.status(201).json({
      success: true,
      data: cartItem,
      sessionId: req.sessionId
    });
  }
});

// @desc    Get cart items (works for both authenticated and anonymous users)
// @route   GET /api/cart
// @access  Public
exports.getCartItems = asyncHandler(async (req, res) => {
  let cartItems = [];

  if (req.user) {
    // Authenticated user - get full FlightBooking objects from database
    const flightBookings = await FlightBooking.find({
      userId: req.user.id,
      status: "pending"
    }).sort({ createdAt: -1 });

    cartItems = flightBookings;
  } else {
    // Anonymous user - get from session and convert to FlightBooking-like format
    if (req.session.cart) {
      cartItems = req.session.cart.map(item => ({
        _id: item.id,
        bookingId: item.id,
        flightDetails: item.flightDetails,
        status: 'pending',
        createdAt: item.addedAt,
        paymentDetails: { status: 'pending' }
      }));
    }
  }

  res.status(200).json({
    success: true,
    data: cartItems,
    sessionId: req.sessionId
  });
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/:id
// @access  Public
exports.removeFromCart = asyncHandler(async (req, res) => {
  if (req.user) {
    // Authenticated user - remove from database
    let booking = await Booking.findOne({
      bookingId: req.params.id,
      userId: req.user.id
    });

    if (!booking) {
      booking = await FlightBooking.findOne({
        bookingId: req.params.id,
        userId: req.user.id
      });
    }

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    await booking.deleteOne();
  } else {
    // Anonymous user - remove from session
    if (req.session.cart) {
      req.session.cart = req.session.cart.filter(item => item.id !== req.params.id);
    }
  }

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Checkout cart items (requires authentication)
// @route   POST /api/cart/checkout
// @access  Private
exports.checkout = asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required for checkout"
    });
  }

  try {
    // Get both regular bookings and flight bookings
    const [regularBookings, flightBookings] = await Promise.all([
      Booking.find({
        userId: req.user.id,
        status: "pending"
      }),
      FlightBooking.find({
        userId: req.user.id,
        status: "pending"
      })
    ]);

    const totalItems = regularBookings.length + flightBookings.length;

    if (totalItems === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty"
      });
    }

    // Update status for all items
    await Promise.all([
      ...regularBookings.map(async (item) => {
        item.status = "confirmed";
        await item.save();
        
        // Create notification for regular booking
        await Notification.create({
          userId: req.user.id,
          title: {
            en: "Booking Confirmed",
            ar: "تم تأكيد الحجز"
          },
          message: {
            en: `Your ${item.type} booking for ${item.destination || 'your selected destination'} has been confirmed.`,
            ar: `تم تأكيد حجز ${item.type} الخاص بك لـ ${item.destination || 'الوجهة المختارة'}.`
          },
          type: "booking"
        });
      }),
      ...flightBookings.map(async (item) => {
        item.status = "confirmed";
        await item.save();
        
        // Create notification for flight booking
        await Notification.create({
          userId: req.user.id,
          title: {
            en: "Flight Booking Confirmed",
            ar: "تم تأكيد حجز الرحلة"
          },
          message: {
            en: `Your flight from ${item.flightDetails.from} to ${item.flightDetails.to} has been confirmed.`,
            ar: `تم تأكيد حجز رحلتك من ${item.flightDetails.from} إلى ${item.flightDetails.to}.`
          },
          type: "booking"
        });
      })
    ]);

    res.status(200).json({
      success: true,
      message: "Checkout completed successfully"
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to confirm booking"
    });
  }
});

// Helper functions to format booking data for cart display
function formatRegularBooking(booking) {
  return {
    id: booking.bookingId,
    type: booking.type.toLowerCase(),
    name: getBookingName(booking),
    image: getBookingImage(booking.type),
    details: getBookingDetails(booking),
    price: booking.amount,
    quantity: booking.details.quantity || 1,
    bookingType: 'regular'
  };
}

function formatFlightBooking(booking) {
  const departureDate = booking.flightDetails?.departureDate 
    ? new Date(booking.flightDetails.departureDate).toLocaleDateString()
    : 'Date not set';
    
  let price = 0;
  if (booking.flightDetails?.selectedFlight?.price?.total) {
    price = Number(booking.flightDetails.selectedFlight.price.total);
  }

  return {
    id: booking.bookingId,
    type: 'flight',
    name: `Flight: ${booking.flightDetails?.from || ''} to ${booking.flightDetails?.to || ''}`,
    image: getBookingImage('flight'),
    details: `Departure: ${departureDate}`,
    price: price,
    quantity: 1,
    bookingType: 'flight'
  };
}

function getBookingName(booking) {
  switch (booking.type) {
    case "Hotel":
      return `${booking.details.hotelName}`;
    case "Tour Package":
      return `${booking.destination} Tour`;
    default:
      return booking.type;
  }
}

function getBookingDetails(booking) {
  switch (booking.type) {
    case "Hotel":
      return `${booking.details.nights} nights - ${new Date(booking.bookingDate).toLocaleDateString()}`;
    case "Tour Package":
      return `${booking.details.duration} - ${new Date(booking.bookingDate).toLocaleDateString()}`;
    default:
      return `${new Date(booking.bookingDate).toLocaleDateString()}`;
  }
}

function getBookingImage(type) {
  const imageMap = {
    'hotel': '/uploads/hotel-placeholder.jpg',
    'tour package': '/uploads/tour-placeholder.jpg',
    'flight': '/uploads/flight-placeholder.jpg',
    'car rental': '/uploads/car-placeholder.jpg'
  };
  return imageMap[type.toLowerCase()] || '/uploads/default-placeholder.jpg';
}
