const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

// Initialize Supabase client with service role key (server-only)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'tourtastic-files';
const SIGNED_URL_EXPIRY = parseInt(process.env.SUPABASE_SIGNED_URL_EXPIRY || '3600', 10); // 1 hour default

// Import local storage as fallback
const localStorage = require('./localStorageBackup');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️ Supabase is not fully configured. Using Local Storage as fallback.');
}

// Create Supabase client (with service_role key for server-side operations)
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

/**
 * Normalize destination path for Supabase Storage
 * @param {string} destinationPath - The destination path for the file
 * @returns {object} - { folder, fileName, fullPath }
 */
const normalizeDestination = (destinationPath = '') => {
  if (!destinationPath) {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    return { folder: '', fileName: uniqueName, fullPath: uniqueName };
  }
  
  const normalized = destinationPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/');
  const fileName = parts.pop() || `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const folder = parts.join('/');
  const fullPath = folder ? `${folder}/${fileName}` : fileName;
  
  return { folder, fileName, fullPath };
};

/**
 * Upload a file from disk to Supabase Storage
 * @param {string} localFilePath - Path to the local file
 * @param {string} destinationPath - Destination path in Supabase Storage (e.g., 'destinations/image.jpg')
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<string>} - Returns the storage path (not public URL, since bucket is private)
 */
async function uploadFile(localFilePath, destinationPath, contentType) {
  if (!supabase) {
    throw new Error('Supabase client is not initialized. Check your environment variables.');
  }

  const fs = require('fs');
  const fileBuffer = fs.readFileSync(localFilePath);
  
  return await uploadBuffer(fileBuffer, destinationPath, contentType);
}

/**
 * Detect MIME type from file extension
 * @param {string} filePath - File path or name
 * @returns {string} - MIME type
 */
function detectMimeType(filePath) {
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  
  const mimeTypes = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'csv': 'text/csv',
    
    // Videos
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    
    // Archives
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Upload a buffer to Supabase Storage (with Local Storage fallback)
 * @param {Buffer} buffer - File buffer
 * @param {string} destinationPath - Destination path in Supabase Storage
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<string>} - Returns the storage path
 */
async function uploadBuffer(buffer, destinationPath, contentType) {
  // Try Supabase first if configured
  if (supabase) {
    try {
      const { fullPath } = normalizeDestination(destinationPath);
      
      // Detect MIME type from extension if not provided or is generic
      let finalContentType = contentType;
      if (!contentType || contentType === 'application/octet-stream') {
        finalContentType = detectMimeType(fullPath);
      }

      const { data, error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(fullPath, buffer, {
          contentType: finalContentType,
          upsert: true, // Overwrite if exists
          cacheControl: '3600'
        });

      if (error) {
        throw new Error(`Supabase upload failed: ${error.message}`);
      }

      console.log('✅ File uploaded to Supabase Storage');
      // Return the storage path (not a public URL since bucket is private)
      // Format: supabase://bucket-name/path/to/file.jpg
      return `supabase://${SUPABASE_BUCKET}/${data.path}`;
    } catch (error) {
      console.warn('⚠️ Supabase upload failed, falling back to Local Storage:', error.message);
      // Fall through to local storage
    }
  }

  // Fallback to Local Storage
  console.log('📁 Using Local Storage for file upload');
  return await localStorage.uploadBuffer(buffer, destinationPath, contentType);
}

/**
 * Generate a signed URL for a private file (with Local Storage support)
 * @param {string} identifier - Storage path or identifier (e.g., 'supabase://bucket/path' or 'local://path/to/file.jpg')
 * @param {number} expiresIn - Expiry time in seconds (default: 3600 = 1 hour)
 * @returns {Promise<string>} - Signed URL
 */
async function generateSignedUrl(identifier, expiresIn = SIGNED_URL_EXPIRY) {
  if (!identifier) return '';

  // If it's already a full HTTP URL (legacy Cloudinary), return as-is
  if (/^https?:\/\//i.test(identifier)) {
    return identifier;
  }

  // Handle local:// format (Local Storage)
  if (identifier.startsWith('local://')) {
    return await localStorage.generateSignedUrl(identifier, expiresIn);
  }

  // Handle supabase:// format
  if (identifier.startsWith('supabase://')) {
    if (!supabase) {
      console.warn('⚠️ Supabase not configured, using Local Storage fallback');
      // Convert supabase path to local path and use local storage
      const parts = identifier.replace('supabase://', '').split('/');
      parts.shift(); // Remove bucket name
      const filePath = parts.join('/');
      return `/uploads/${filePath}`;
    }

    try {
      // Format: supabase://bucket-name/path/to/file.jpg
      const parts = identifier.replace('supabase://', '').split('/');
      parts.shift(); // Remove bucket name
      const filePath = parts.join('/');

      const { data, error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .createSignedUrl(filePath, expiresIn);

      if (error) {
        throw new Error(`Failed to generate signed URL: ${error.message}`);
      }

      console.log('✅ Signed URL generated from Supabase');
      return data.signedUrl;
    } catch (err) {
      console.warn('⚠️ Supabase signed URL failed, using Local Storage fallback:', err.message);
      // Fallback to local storage
      const parts = identifier.replace('supabase://', '').split('/');
      parts.shift(); // Remove bucket name
      const filePath = parts.join('/');
      return `/uploads/${filePath}`;
    }
  }

  // Default: treat as local path
  if (identifier.startsWith('/uploads/')) return identifier;
  if (identifier.startsWith('uploads/')) return `/${identifier}`;
  return `/uploads/${identifier}`;
}

/**
 * Generate public URL for a file (with Local Storage support)
 * @param {string} identifier - Storage path or identifier
 * @returns {string} - Public URL
 */
function generatePublicUrl(identifier) {
  if (!identifier) return '';

  // If it's already a full HTTP URL, return as-is
  if (/^https?:\/\//i.test(identifier)) {
    return identifier;
  }

  // Handle local:// format
  if (identifier.startsWith('local://')) {
    return localStorage.generatePublicUrl(identifier);
  }

  // Handle supabase:// format
  if (identifier.startsWith('supabase://')) {
    if (!supabase) {
      console.warn('⚠️ Supabase not configured, using Local Storage fallback');
      const parts = identifier.replace('supabase://', '').split('/');
      parts.shift(); // Remove bucket name
      const filePath = parts.join('/');
      return `/uploads/${filePath}`;
    }

    try {
      const parts = identifier.replace('supabase://', '').split('/');
      parts.shift(); // Remove bucket name
      const filePath = parts.join('/');

      const { data } = supabase.storage
        .from(SUPABASE_BUCKET)
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.warn('⚠️ Supabase public URL failed, using Local Storage fallback');
      const parts = identifier.replace('supabase://', '').split('/');
      parts.shift(); // Remove bucket name
      const filePath = parts.join('/');
      return `/uploads/${filePath}`;
    }
  }

  // Default: treat as local path
  if (identifier.startsWith('/uploads/')) return identifier;
  if (identifier.startsWith('uploads/')) return `/${identifier}`;
  return `/uploads/${identifier}`;
}

/**
 * Delete a file from Supabase Storage (with Local Storage support)
 * @param {string} identifier - Storage path or identifier
 * @returns {Promise<void>}
 */
async function deleteFile(identifier) {
  if (!identifier) return;

  // Handle local:// format
  if (identifier.startsWith('local://')) {
    return await localStorage.deleteFile(identifier);
  }

  // Handle supabase:// format
  if (identifier.startsWith('supabase://')) {
    if (!supabase) {
      console.warn('⚠️ Supabase not configured, using Local Storage fallback');
      const parts = identifier.replace('supabase://', '').split('/');
      parts.shift(); // Remove bucket name
      const filePath = parts.join('/');
      return await localStorage.deleteFile(`local://${filePath}`);
    }

    try {
      const parts = identifier.replace('supabase://', '').split('/');
      parts.shift(); // Remove bucket name
      const filePath = parts.join('/');

      const { error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .remove([filePath]);

      if (error) {
        throw new Error(`Failed to delete file: ${error.message}`);
      }

      console.log('✅ File deleted from Supabase');
    } catch (error) {
      console.warn('⚠️ Supabase delete failed, using Local Storage fallback:', error.message);
      const parts = identifier.replace('supabase://', '').split('/');
      parts.shift(); // Remove bucket name
      const filePath = parts.join('/');
      return await localStorage.deleteFile(`local://${filePath}`);
    }
  }
}

/**
 * List files in a folder (with Local Storage support)
 * @param {string} folderPath - Folder path (e.g., 'destinations/')
 * @returns {Promise<Array>} - Array of file objects
 */
async function listFiles(folderPath = '') {
  // Try Supabase first if configured
  if (supabase) {
    try {
      const { data, error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .list(folderPath, {
          limit: 1000,
          offset: 0,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
        throw new Error(`Failed to list files: ${error.message}`);
      }

      console.log('✅ Files listed from Supabase');
      return data || [];
    } catch (error) {
      console.warn('⚠️ Supabase list files failed, using Local Storage fallback:', error.message);
      // Fall through to local storage
    }
  }

  // Fallback to Local Storage
  console.log('📁 Listing files from Local Storage');
  return await localStorage.listFiles(folderPath);
}

module.exports = {
  uploadFile,
  uploadBuffer,
  generateSignedUrl,
  generatePublicUrl, // Included but NOT recommended for private buckets
  deleteFile,
  listFiles,
  supabase,
  SUPABASE_BUCKET
};
