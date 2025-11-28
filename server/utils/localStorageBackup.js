const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = path.join(__dirname, '../uploads');
const TEMP_DIR = path.join(__dirname, '../temp');

[UPLOADS_DIR, TEMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

/**
 * Upload a file from disk to local storage
 * @param {string} localFilePath - Path to the local file
 * @param {string} destinationPath - Destination path in local storage (e.g., 'destinations/image.jpg')
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<string>} - Returns the storage path
 */
async function uploadFile(localFilePath, destinationPath, contentType) {
  try {
    const fileBuffer = fs.readFileSync(localFilePath);
    return await uploadBuffer(fileBuffer, destinationPath, contentType);
  } catch (error) {
    console.error('❌ Local storage upload error:', error.message);
    throw new Error(`Local storage upload failed: ${error.message}`);
  }
}

/**
 * Upload a buffer to local storage
 * @param {Buffer} buffer - File buffer
 * @param {string} destinationPath - Destination path in local storage
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<string>} - Returns the storage path
 */
async function uploadBuffer(buffer, destinationPath, contentType) {
  try {
    const { fullPath } = normalizeDestination(destinationPath);
    const fullStoragePath = path.join(UPLOADS_DIR, fullPath);
    
    // Create directory if it doesn't exist
    const dir = path.dirname(fullStoragePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write file to disk
    fs.writeFileSync(fullStoragePath, buffer);
    
    console.log(`✅ File uploaded to local storage: ${fullPath}`);
    
    // Return the storage path (relative path that can be served)
    return `local://${fullPath}`;
  } catch (error) {
    console.error('❌ Local storage upload error:', error.message);
    throw new Error(`Local storage upload failed: ${error.message}`);
  }
}

/**
 * Normalize destination path for local storage
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
 * Generate a signed URL for a file (local storage doesn't need signing, just return the path)
 * @param {string} identifier - Storage path or identifier (e.g., 'local://path/to/file.jpg')
 * @param {number} expiresIn - Expiry time in seconds (ignored for local storage)
 * @returns {Promise<string>} - File path or URL
 */
async function generateSignedUrl(identifier, expiresIn = 3600) {
  if (!identifier) return '';
  
  // If it's already a full HTTP URL, return as-is
  if (/^https?:\/\//i.test(identifier)) {
    return identifier;
  }
  
  // Extract path from local:// format
  let filePath = identifier;
  if (identifier.startsWith('local://')) {
    filePath = identifier.replace('local://', '');
  }
  
  // Return the file path (will be served by Express static middleware)
  return `/uploads/${filePath}`;
}

/**
 * Generate public URL for a file
 * @param {string} identifier - Storage path or identifier
 * @returns {string} - Public URL
 */
function generatePublicUrl(identifier) {
  if (!identifier) return '';
  
  // If it's already a full HTTP URL, return as-is
  if (/^https?:\/\//i.test(identifier)) {
    return identifier;
  }
  
  // Extract path from local:// format
  let filePath = identifier;
  if (identifier.startsWith('local://')) {
    filePath = identifier.replace('local://', '');
  }
  
  // Return the file path (will be served by Express static middleware)
  return `/uploads/${filePath}`;
}

/**
 * Delete a file from local storage
 * @param {string} identifier - Storage path or identifier
 * @returns {Promise<void>}
 */
async function deleteFile(identifier) {
  if (!identifier) return;
  
  try {
    // Extract path from local:// format
    let filePath = identifier;
    if (identifier.startsWith('local://')) {
      filePath = identifier.replace('local://', '');
    }
    
    const fullPath = path.join(UPLOADS_DIR, filePath);
    
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`✅ File deleted from local storage: ${filePath}`);
    }
  } catch (error) {
    console.error('❌ Local storage delete error:', error.message);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * List files in a folder
 * @param {string} folderPath - Folder path (e.g., 'destinations/')
 * @returns {Promise<Array>} - Array of file objects
 */
async function listFiles(folderPath = '') {
  try {
    const fullPath = path.join(UPLOADS_DIR, folderPath);
    
    if (!fs.existsSync(fullPath)) {
      return [];
    }
    
    const files = fs.readdirSync(fullPath, { withFileTypes: true });
    
    return files.map(file => ({
      name: file.name,
      id: file.name,
      created_at: fs.statSync(path.join(fullPath, file.name)).birthtime,
      metadata: {
        size: fs.statSync(path.join(fullPath, file.name)).size
      }
    }));
  } catch (error) {
    console.error('❌ Local storage list files error:', error.message);
    throw new Error(`Failed to list files: ${error.message}`);
  }
}

module.exports = {
  uploadFile,
  uploadBuffer,
  generateSignedUrl,
  generatePublicUrl,
  deleteFile,
  listFiles,
  UPLOADS_DIR,
  TEMP_DIR
};
