const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Uploads a local file to Cloudinary
 * @param {string} filePath - Absolute path to local file
 * @param {object} options - Custom Cloudinary upload options
 * @returns {Promise<object>} Upload result details
 */
async function uploadToCloudinary(filePath, options = {}) {
  try {
    const uploadOptions = {
      folder: 'toolnest',
      resource_type: 'auto',
      ...options
    };
    const result = await cloudinary.uploader.upload(filePath, uploadOptions);
    return {
      publicId: result.public_id,
      url: result.secure_url,
      resourceType: result.resource_type,
      size: result.bytes,
      format: result.format
    };
  } catch (error) {
    console.error('Cloudinary upload failed:', error);
    throw error;
  }
}

/**
 * Deletes an asset from Cloudinary using publicId
 * @param {string} publicId - Cloudinary asset public id
 * @param {string} [resourceType='image'] - 'image', 'video', or 'raw'
 * @returns {Promise<object>} Deletion result
 */
async function deleteFromCloudinary(publicId, resourceType = 'image') {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return result;
  } catch (error) {
    console.error(`Cloudinary deletion failed for ${publicId}:`, error);
    throw error;
  }
}

module.exports = {
  cloudinary,
  uploadToCloudinary,
  deleteFromCloudinary
};
