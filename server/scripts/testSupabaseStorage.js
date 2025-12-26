/**
 * Test Script: Supabase Storage
 * 
 * This script tests the Supabase storage implementation without affecting production data.
 * 
 * Usage:
 *   node scripts/testSupabaseStorage.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const supabaseStorage = require('../utils/supabaseStorage');

// Test results
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

// Helper: Log test result
function logTest(name, passed, error = null) {
  results.total++;
  if (passed) {
    results.passed++;
    console.log(`✅ ${name}`);
  } else {
    results.failed++;
    console.error(`❌ ${name}`);
    if (error) console.error(`   Error: ${error.message || error}`);
  }
  results.tests.push({ name, passed, error: error ? error.message : null });
}

// Test 1: Configuration Check
async function testConfiguration() {
  try {
    const hasUrl = !!process.env.SUPABASE_URL;
    const hasKey = !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
    const hasBucket = !!process.env.SUPABASE_BUCKET;
    
    if (!hasUrl || !hasKey || !hasBucket) {
      throw new Error('Missing Supabase configuration in .env');
    }
    
    logTest('Configuration Check', true);
    console.log(`   Bucket: ${process.env.SUPABASE_BUCKET}`);
    console.log(`   URL: ${process.env.SUPABASE_URL}`);
  } catch (err) {
    logTest('Configuration Check', false, err);
  }
}

// Test 2: Upload a test file from buffer
async function testUploadBuffer() {
  try {
    const testContent = Buffer.from('Test file content - ' + Date.now());
    const testPath = `test/${Date.now()}-test.txt`;
    
    const result = await supabaseStorage.uploadBuffer(testContent, testPath, 'text/plain');
    
    if (!result || !result.includes('supabase://')) {
      throw new Error('Upload returned unexpected result: ' + result);
    }
    
    logTest('Upload Buffer', true);
    console.log(`   Path: ${result}`);
    return result;
  } catch (err) {
    logTest('Upload Buffer', false, err);
    return null;
  }
}

// Test 3: Generate signed URL
async function testSignedUrl(filePath) {
  if (!filePath) {
    logTest('Generate Signed URL', false, new Error('No file path provided'));
    return null;
  }
  
  try {
    const signedUrl = await supabaseStorage.generateSignedUrl(filePath, 3600);
    
    if (!signedUrl || !signedUrl.startsWith('https://')) {
      throw new Error('Signed URL is invalid: ' + signedUrl);
    }
    
    logTest('Generate Signed URL', true);
    console.log(`   URL: ${signedUrl.substring(0, 80)}...`);
    return signedUrl;
  } catch (err) {
    logTest('Generate Signed URL', false, err);
    return null;
  }
}

// Test 4: Download file via signed URL
async function testDownloadViaSignedUrl(signedUrl) {
  if (!signedUrl) {
    logTest('Download via Signed URL', false, new Error('No signed URL provided'));
    return;
  }
  
  try {
    const axios = require('axios');
    const response = await axios.get(signedUrl, { timeout: 10000 });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    if (!response.data) {
      throw new Error('Empty response');
    }
    
    logTest('Download via Signed URL', true);
    console.log(`   Size: ${response.data.length} bytes`);
  } catch (err) {
    logTest('Download via Signed URL', false, err);
  }
}

// Test 5: List files in test folder
async function testListFiles() {
  try {
    const files = await supabaseStorage.listFiles('test');
    
    if (!Array.isArray(files)) {
      throw new Error('List files returned non-array: ' + typeof files);
    }
    
    logTest('List Files', true);
    console.log(`   Found: ${files.length} file(s)`);
  } catch (err) {
    logTest('List Files', false, err);
  }
}

// Test 6: Delete test file
async function testDeleteFile(filePath) {
  if (!filePath) {
    logTest('Delete File', false, new Error('No file path provided'));
    return;
  }
  
  try {
    await supabaseStorage.deleteFile(filePath);
    logTest('Delete File', true);
  } catch (err) {
    logTest('Delete File', false, err);
  }
}

// Test 7: Upload an actual image file
async function testUploadImage() {
  try {
    // Create a minimal 1x1 PNG image
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
      0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    
    const testPath = `test/images/${Date.now()}-test.png`;
    const result = await supabaseStorage.uploadBuffer(pngBuffer, testPath, 'image/png');
    
    if (!result || !result.includes('supabase://')) {
      throw new Error('Image upload returned unexpected result: ' + result);
    }
    
    logTest('Upload Image', true);
    console.log(`   Path: ${result}`);
    return result;
  } catch (err) {
    logTest('Upload Image', false, err);
    return null;
  }
}

// Test 8: Stress test - Upload multiple files
async function testBatchUpload() {
  try {
    const count = 5;
    const uploads = [];
    
    for (let i = 0; i < count; i++) {
      const content = Buffer.from(`Batch test file ${i} - ${Date.now()}`);
      const path = `test/batch/${Date.now()}-${i}.txt`;
      uploads.push(supabaseStorage.uploadBuffer(content, path, 'text/plain'));
    }
    
    const results = await Promise.all(uploads);
    
    if (results.length !== count || results.some(r => !r || !r.includes('supabase://'))) {
      throw new Error('Some batch uploads failed');
    }
    
    logTest('Batch Upload', true);
    console.log(`   Uploaded: ${count} files`);
    
    // Cleanup
    for (const result of results) {
      try {
        await supabaseStorage.deleteFile(result);
      } catch (err) {
        console.warn(`   Cleanup warning: ${err.message}`);
      }
    }
  } catch (err) {
    logTest('Batch Upload', false, err);
  }
}

// Main test runner
async function runTests() {
  console.log('🧪 Supabase Storage Test Suite\n');
  console.log('='.repeat(60));
  
  let testFilePath = null;
  let signedUrl = null;
  let testImagePath = null;
  
  // Run tests sequentially
  await testConfiguration();
  
  testFilePath = await testUploadBuffer();
  
  if (testFilePath) {
    signedUrl = await testSignedUrl(testFilePath);
  }
  
  if (signedUrl) {
    await testDownloadViaSignedUrl(signedUrl);
  }
  
  await testListFiles();
  
  testImagePath = await testUploadImage();
  
  await testBatchUpload();
  
  // Cleanup test files
  console.log('\n🧹 Cleaning up test files...');
  if (testFilePath) {
    await testDeleteFile(testFilePath);
  }
  if (testImagePath) {
    await testDeleteFile(testImagePath);
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests:  ${results.total}`);
  console.log(`✅ Passed:    ${results.passed}`);
  console.log(`❌ Failed:    ${results.failed}`);
  console.log(`Success Rate: ${Math.round((results.passed / results.total) * 100)}%`);
  console.log('='.repeat(60));
  
  if (results.failed > 0) {
    console.log('\n⚠️  Some tests failed. Check the errors above.');
    console.log('Common issues:');
    console.log('  - Missing or incorrect Supabase credentials');
    console.log('  - Bucket does not exist or is misconfigured');
    console.log('  - Network connectivity issues');
    console.log('  - Insufficient permissions on service role key');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed! Supabase Storage is ready to use.');
    process.exit(0);
  }
}

// Run tests
runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
