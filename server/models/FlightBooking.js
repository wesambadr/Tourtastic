const mongoose = require("mongoose");

const FlightBookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  bookingId: {
    type: String,
    required: true,
    unique: true
  },
  customerName: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    required: true
  },
  customerPhone: String,
  // Root-level passenger details (mirror of flightDetails.passengerDetails for easier access)
  passengerDetails: [{
    firstName: String,
    lastName: String,
    gender: String,
    dob: Date,
    passportNumber: String,
    passportIssueDate: Date,
    passportExpiryDate: Date,
    passportCountry: String,
    nationality: String,
    phone: String,
    email: String,
    type: { type: String, enum: ['adult','child','infant'], default: 'adult' }
  }],
  flightDetails: {
    from: {
      type: String,
      required: true
    },
    to: {
      type: String,
      required: true
    },
    departureDate: {
      type: Date,
      required: true
    },
    passengers: {
      adults: {
        type: Number,
        required: true,
        default: 1
      },
      children: {
        type: Number,
        default: 0
      },
      infants: {
        type: Number,
        default: 0
      }
    },
    // Per-passenger personal details (one entry per ticket/passenger)
    passengerDetails: [{
      firstName: String,
      lastName: String,
      gender: String,
      dob: Date,
      passportNumber: String,
      passportIssueDate: Date,
      passportExpiryDate: Date,
      passportCountry: String,
      nationality: String,
      phone: String,
      email: String,
      type: { type: String, enum: ['adult','child','infant'], default: 'adult' }
    }],
    selectedFlight: {
      flightId: {
        type: String,
        required: true
      },
      airline: {
        type: String,
        required: true
      },
      departureTime: {
        type: Date,
        required: true
      },
      arrivalTime: {
        type: Date,
        required: true
      },
      price: {
        total: {
          type: Number,
          required: true
        },
        currency: {
          type: String,
          required: true,
          default: 'USD'
        }
      },
      class: {
        type: String,
        required: true,
        default: 'economy'
      }
      ,
      // Store entire raw flight object returned from provider so UI can re-render exactly
      raw: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
      }
    }
  },
  status: {
    type: String,
    enum: ["pending", "confirmed", "issued", "done"],
    default: "pending"
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending"
  },
  ticketUrl: {
    type: String
  },
  adminData: {
    assignedTo: String,
    notes: String,
    bookingSource: String,
    bookingReference: String,
    cost: {
      amount: Number,
      currency: String
    },
    profit: Number
  },
  ticketDetails: {
    ticketNumber: String,
    airline: String,
    pnr: String,
    eTicketPath: String,
    additionalDocuments: [{
      name: String,
      path: String,
      uploadedAt: Date
    }]
  },
  paymentDetails: {
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending"
    },
    amount: Number,
    currency: {
      type: String,
      default: "USD"
    },
    method: String,
    reference: String,
    transactions: [{
      date: Date,
      amount: Number,
      type: String, // payment, refund
      reference: String
    }]
  },
  timeline: [{
    status: String,
    date: Date,
    notes: String,
    updatedBy: String
  }],
  ticketHistory: [{
    status: String,
    date: Date,
    notes: String,
    updatedBy: String
  }],
  // Seeru Travel Integration Fields
  seeruOrderId: String,
  seeruStatus: {
    type: String,
    enum: ['pending', 'initiated', 'validated', 'saved', 'new', 'confirmed', 'issued', 'saved_not_issued', 'failed', 'cancelled', 'expired'],
    default: 'pending'
  },
  seeruValidated: {
    type: Boolean,
    default: false
  },
  seeruValidatedAt: Date,
  seeruSavedAt: Date,
  seeruConfirmedAt: Date,
  seeruIssuedAt: Date,
  seeruFailedAt: Date,
  seeruCancelledAt: Date,
  seeruExpiredAt: Date,
  seeruError: String,
  ticketNumber: String,
  pnr: String,
  ticketUrl: String,
  fareKey: String,
  fareBrand: String,
  // Ticket Status Fields
  ticketStatus: {
    type: String,
    enum: ['issued', 'refunded', 'voided', 'exchanged', 'pending'],
    default: 'pending'
  },
  refundedAt: Date,
  voidedAt: Date,
  exchangedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

FlightBookingSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("FlightBooking", FlightBookingSchema);
