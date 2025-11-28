const path = require('path');
require('dotenv').config();
const supabaseStorage = require('./supabaseStorage');

console.log('[Storage] Using Supabase Storage');

// Upload file from local path
async function uploadFile(localFilePath, destinationPath, contentType) {
  return await supabaseStorage.uploadFile(localFilePath, destinationPath, contentType);
}

// Upload file from buffer
async function uploadBuffer(buffer, destinationPath, contentType) {
  return await supabaseStorage.uploadBuffer(buffer, destinationPath, contentType);
}

// Generate public URL (not recommended for private buckets)
function generatePublicUrl(identifier, options = {}) {
  if (!identifier) return '';
  if (/^https?:\/\//i.test(identifier)) return identifier;
  
  console.warn('generatePublicUrl: Use generateSignedUrl for private Supabase buckets.');
  return identifier;
}

// Generate signed URL for private bucket files
async function generateSignedUrl(identifier, expiresIn = 3600) {
  if (!identifier) return '';
  
  // If it's already a full HTTP URL, return as-is (legacy support)
  if (/^https?:\/\//i.test(identifier)) return identifier;
  
  try {
    return await supabaseStorage.generateSignedUrl(identifier, expiresIn);
  } catch (error) {
    console.warn('Failed to generate signed URL from Supabase:', error.message);
    // Return the identifier as fallback - it might be a local path or already accessible URL
    return identifier;
  }
}

// Delete file
async function deleteFile(identifier) {
  return await supabaseStorage.deleteFile(identifier);
}

// List files in folder
async function listFiles(folderPath) {
  return await supabaseStorage.listFiles(folderPath);
}

module.exports = {
  uploadFile,
  uploadBuffer,
  generatePublicUrl,
  generateSignedUrl,
  deleteFile,
  listFiles,
  supabaseStorage
};
