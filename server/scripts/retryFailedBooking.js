/**
 * Script to retry Seeru processing for failed bookings
 * Usage: node scripts/retryFailedBooking.js <bookingId>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const FlightBooking = require('../models/FlightBooking');
const { 
  checkFareValidity, 
  saveBooking, 
  issueOrder 
} = require('../utils/seeruAPI');
const {
  transformBookingToSeeru,
  transformPassengersToSeeru,
  transformContactToSeeru
} = require('../utils/seeruBookingHelper');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';

async function retryFailedBooking(bookingId) {
  try {
    console.log(`\n🔄 Retrying booking: ${bookingId}\n`);

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find booking
    const booking = await FlightBooking.findOne({ bookingId });
    if (!booking) {
      console.error('❌ Booking not found');
      process.exit(1);
    }

    console.log(`📋 Booking Status: ${booking.status}`);
    console.log(`💳 Payment Status: ${booking.paymentStatus}`);
    console.log(`🔗 Seeru Status: ${booking.seeruStatus}`);
    console.log(`⚠️ Seeru Error: ${booking.seeruError}`);

    // Check if payment is confirmed
    if (booking.paymentStatus !== 'completed') {
      console.error('❌ Payment not confirmed. Cannot issue ticket.');
      process.exit(1);
    }

    // If no Seeru order, process from scratch
    if (!booking.seeruOrderId) {
      console.log('\n📝 No Seeru order found. Processing from scratch...\n');

      // Step 1: Check fare validity
      console.log('Step 1: Checking fare validity...');
      const bookingData = transformBookingToSeeru(booking);
      const fareCheck = await checkFareValidity(bookingData);

      if (!fareCheck.success) {
        console.error('❌ Fare check failed:', fareCheck.error);
        process.exit(1);
      }
      console.log('✅ Fare check passed');

      // Step 2: Save booking
      console.log('\nStep 2: Saving booking with Seeru...');
      const passengers = transformPassengersToSeeru(booking.passengers || []);
      const contact = transformContactToSeeru(booking.contact || {});
      const saveResult = await saveBooking(bookingData, passengers, contact);

      if (!saveResult.success) {
        console.error('❌ Save booking failed:', saveResult.error);
        process.exit(1);
      }
      console.log('✅ Booking saved. Order ID:', saveResult.orderId);

      booking.seeruOrderId = saveResult.orderId;
      booking.seeruStatus = 'saved';
      booking.seeruValidated = true;
      await booking.save();
    }

    // Step 3: Issue ticket
    console.log('\nStep 3: Issuing ticket...');
    const issueResult = await issueOrder(booking.seeruOrderId);

    if (!issueResult.success) {
      console.error('❌ Ticket issuance failed:', issueResult.error);
      process.exit(1);
    }

    console.log('✅ Ticket issued successfully!');
    console.log(`   Order ID: ${booking.seeruOrderId}`);

    // Update booking
    booking.seeruStatus = 'issued';
    booking.seeruError = null;
    await booking.save();

    console.log('\n✅ Booking updated successfully!\n');
    console.log('📊 Final Status:');
    console.log(`   Booking Status: ${booking.status}`);
    console.log(`   Payment Status: ${booking.paymentStatus}`);
    console.log(`   Seeru Status: ${booking.seeruStatus}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get booking ID from command line
const bookingId = process.argv[2];
if (!bookingId) {
  console.error('Usage: node scripts/retryFailedBooking.js <bookingId>');
  console.error('Example: node scripts/retryFailedBooking.js BK-1003');
  process.exit(1);
}

retryFailedBooking(bookingId);
