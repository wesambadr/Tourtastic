/**
 * Test script to verify Seeru integration
 * Run: node utils/testSeeru.js
 */

const axios = require('axios');

const SEERU_API_BASE_URL = process.env.SEERU_API_BASE_URL || 'https://sandbox-api.seeru.travel/api';
const SEERU_API_KEY = process.env.SEERU_API_KEY;

console.log('=== Seeru Integration Test ===\n');
console.log('API Base URL:', SEERU_API_BASE_URL);
console.log('API Key Present:', !!SEERU_API_KEY);
console.log('API Key Length:', SEERU_API_KEY?.length || 0);

// Test booking data
const testBooking = {
  price: 500,
  tax: 50,
  currency: 'USD',
  fare_key: 'TEST_FARE_KEY',
  fare_brand: 'ECONOMY',
  trip_id: 'TEST_TRIP_001',
  total_pax_no_inf: 1,
  src: 'TOURTASTIC'
};

const testPassengers = [
  {
    pax_id: 'PAX1',
    type: 'ADT',
    first_name: 'Test',
    last_name: 'User',
    gender: 'M',
    birth_date: '1990-01-01',
    document_type: 'PP',
    document_number: 'TEST123456',
    document_expiry: '2030-01-01',
    nationality: 'US'
  }
];

const testContact = {
  full_name: 'Test User',
  email: 'test@example.com',
  mobile: '+1234567890'
};

console.log('\n=== Test Data ===');
console.log('Booking:', JSON.stringify(testBooking, null, 2));
console.log('Passengers:', JSON.stringify(testPassengers, null, 2));
console.log('Contact:', JSON.stringify(testContact, null, 2));

// Test API connection
async function testConnection() {
  try {
    console.log('\n=== Testing API Connection ===');
    
    const client = axios.create({
      baseURL: SEERU_API_BASE_URL,
      headers: {
        'Authorization': `Bearer ${SEERU_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    // Try to check fare validity
    console.log('\nAttempting to check fare validity...');
    const response = await client.post('/booking/fare', {
      booking: testBooking
    });

    console.log('✅ API Connection Successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ API Connection Failed!');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

testConnection();
