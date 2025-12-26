/**
 * Create Supabase Storage Bucket
 * 
 * This script creates the required bucket in Supabase Storage if it doesn't exist.
 * 
 * Usage:
 *   node scripts/createSupabaseBucket.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'tourtastic-files';

async function createBucket() {
  console.log('🪣 Creating Supabase Storage Bucket\n');
  console.log('='.repeat(60));

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing Supabase credentials in .env');
    console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log(`📦 Bucket Name: ${BUCKET_NAME}`);
  console.log(`🔗 Supabase URL: ${SUPABASE_URL}`);
  console.log('');

  try {
    // Check if bucket exists
    console.log('🔍 Checking if bucket exists...');
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Failed to list buckets:', listError.message);
      process.exit(1);
    }

    const existingBucket = buckets.find(b => b.name === BUCKET_NAME);
    
    if (existingBucket) {
      console.log(`✅ Bucket "${BUCKET_NAME}" already exists!`);
      console.log(`   ID: ${existingBucket.id}`);
      console.log(`   Public: ${existingBucket.public}`);
      console.log(`   Created: ${existingBucket.created_at}`);
      console.log('\n✓ No action needed. Bucket is ready to use.');
      process.exit(0);
    }

    // Create bucket
    console.log(`📝 Creating bucket "${BUCKET_NAME}"...`);
    const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: false,  // Private bucket (مهم!)
      fileSizeLimit: 100 * 1024 * 1024, // 100MB
      allowedMimeTypes: null  // السماح بكل أنواع الملفات
    });

    if (error) {
      console.error('❌ Failed to create bucket:', error.message);
      console.error('   Details:', error);
      process.exit(1);
    }

    console.log(`✅ Bucket "${BUCKET_NAME}" created successfully!`);
    console.log(`   Name: ${data.name}`);
    console.log(`   Public: false (Private)`);
    console.log('\n🎉 Success! You can now use Supabase Storage.');
    console.log('\nNext steps:');
    console.log('  1. Run: npm run test:storage');
    console.log('  2. Start server: npm run dev');
    console.log('  3. Test file upload');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

createBucket();
