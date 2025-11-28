/**
 * Simple test script to verify file upload functionality
 * Usage: node test-upload.js
 */

const fs = require('fs');
const path = require('path');
const { uploadBuffer, generateSignedUrl, generatePublicUrl } = require('./utils/supabaseStorage');

async function testFileUpload() {
  console.log('🧪 Starting file upload test...\n');

  try {
    // Test 1: Create a test file
    console.log('📝 Test 1: Creating test file...');
    const testContent = Buffer.from('This is a test file for upload testing');
    const testFileName = `test-${Date.now()}.txt`;
    const destinationPath = `destinations/${testFileName}`;
    
    console.log(`   File: ${testFileName}`);
    console.log(`   Destination: ${destinationPath}\n`);

    // Test 2: Upload the file
    console.log('📤 Test 2: Uploading file...');
    const uploadResult = await uploadBuffer(testContent, destinationPath, 'text/plain');
    console.log(`   ✅ Upload result: ${uploadResult}\n`);

    // Test 3: Generate signed URL
    console.log('🔗 Test 3: Generating signed URL...');
    const signedUrl = await generateSignedUrl(uploadResult);
    console.log(`   ✅ Signed URL: ${signedUrl}\n`);

    // Test 4: Generate public URL
    console.log('🌐 Test 4: Generating public URL...');
    const publicUrl = generatePublicUrl(uploadResult);
    console.log(`   ✅ Public URL: ${publicUrl}\n`);

    // Test 5: Verify file exists
    console.log('🔍 Test 5: Verifying file exists...');
    if (uploadResult.startsWith('local://')) {
      const filePath = uploadResult.replace('local://', '');
      const fullPath = path.join(__dirname, 'uploads', filePath);
      
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        console.log(`   ✅ File exists at: ${fullPath}`);
        console.log(`   📊 File size: ${stats.size} bytes\n`);
      } else {
        console.log(`   ❌ File not found at: ${fullPath}\n`);
      }
    }

    console.log('✅ All tests passed!\n');
    console.log('📝 Summary:');
    console.log(`   - Upload path: ${uploadResult}`);
    console.log(`   - Signed URL: ${signedUrl}`);
    console.log(`   - Public URL: ${publicUrl}`);
    console.log(`   - Access at: http://localhost:5000${publicUrl}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testFileUpload().then(() => {
  console.log('\n🎉 Test completed successfully!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});
