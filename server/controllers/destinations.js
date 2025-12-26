const Destination = require('../models/Destination');
const asyncHandler = require('../middleware/async');
const { uploadBuffer, generateSignedUrl } = require('../utils/gcsStorage');
require('dotenv').config();

/**
 * Convert storage path to signed URL for frontend
 */
async function convertToSignedUrl(destination) {
  if (!destination) return destination;
  
  const dest = destination.toObject ? destination.toObject() : { ...destination };
  
  if (dest.image && !/^https?:\/\//i.test(dest.image)) {
    try {
      dest.image = await generateSignedUrl(dest.image, 3600);
    } catch (err) {
      console.error('Failed to generate signed URL for destination image:', err);
      // Keep original path if signed URL generation fails
    }
  }
  
  return dest;
}

// @desc    Get all destinations
// @route   GET /api/destinations
// @access  Public
exports.getDestinations = asyncHandler(async (req, res, next) => {
  try {
    const destinations = await Destination.find();
    
    // Convert all images to signed URLs
    const destinationsWithUrls = await Promise.all(
      destinations.map(d => convertToSignedUrl(d))
    );
    
    res.status(200).json({
      success: true,
      count: destinationsWithUrls.length,
      data: destinationsWithUrls
    });
  } catch (error) {
    console.error('getDestinations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch destinations',
      message: error.message
    });
  }
});

// @desc    Get single destination
// @route   GET /api/destinations/:id
// @access  Public
exports.getDestination = asyncHandler(async (req, res, next) => {
  const destination = await Destination.findById(req.params.id);
  
  if (!destination) {
    return res.status(404).json({
      success: false,
      error: 'Destination not found'
    });
  }

  // Convert image to signed URL
  const destinationWithUrl = await convertToSignedUrl(destination);

  res.status(200).json({
    success: true,
    data: destinationWithUrl
  });
});

// @desc    Create new destination
// @route   POST /api/destinations
// @access  Private/Admin
exports.createDestination = asyncHandler(async (req, res, next) => {
  // helper: parse JSON-encoded strings coming from multipart/form-data
  const parseIfJson = (val) => {
    if (!val) return val;
    if (typeof val !== 'string') return val;
    try { return JSON.parse(val); } catch (err) { return val; }
  };

  // start with raw body
  const data = { ...req.body };

  // normalize known nested fields that may arrive as JSON strings
  data.name = parseIfJson(req.body.name || req.body['name']);
  data.country = parseIfJson(req.body.country || req.body['country']);
  data.description = parseIfJson(req.body.description || req.body['description']);
  data.topAttractions = parseIfJson(req.body.topAttractions || req.body['topAttractions']);
  data.localCuisine = parseIfJson(req.body.localCuisine || req.body['localCuisine']);
  data.shopping = parseIfJson(req.body.shopping || req.body['shopping']);
  data.bestTimeToVisit = parseIfJson(req.body.bestTimeToVisit || req.body['bestTimeToVisit']);

  // quickInfo may be sent in bracket notation or as separate fields
  const qTime = req.body['quickInfo[timeZone]'] || req.body['quickInfo.timeZone'] || req.body.timeZone || req.body.time_zone;
  const qAirport = req.body['quickInfo[airport]'] || req.body['quickInfo.airport'] || req.body.airport || req.body.airport_code;
  if (qTime) {
    data.quickInfo = data.quickInfo || {};
    data.quickInfo.timeZone = qTime;
  }
  if (qAirport) {
    data.quickInfo = data.quickInfo || {};
    data.quickInfo.airport = qAirport;
  }

  // Helper to find image file in req.file or req.files
  const findImageFile = () => {
    if (req.file && req.file.buffer) return req.file;
    if (Array.isArray(req.files) && req.files.length > 0) {
      const found = req.files.find(f => f.fieldname === 'destinationImage' || f.fieldname === 'image');
      return found || req.files[0];
    }
    return null;
  };

  const uploadedFile = findImageFile();
  if (uploadedFile && uploadedFile.buffer) {
    try {
      const ext = (uploadedFile.originalname && uploadedFile.originalname.split('.').pop()) || 'jpg';
      const prefix = process.env.UPLOAD_PREFIX_DESTINATIONS || 'destinations';
      const destPath = `${prefix}/${Date.now()}-${Math.round(Math.random()*1e9)}.${ext}`;
      const publicUrl = await uploadBuffer(uploadedFile.buffer, destPath, uploadedFile.mimetype || 'image/jpeg');
      data.image = publicUrl;
    } catch (uploadErr) {
      console.error('Upload failed in createDestination:', uploadErr);
      return res.status(500).json({ success: false, error: 'Image upload failed', details: String(uploadErr) });
    }
  }

  // Normalize localized fields to the shape { en, ar }
  const ensureLocalized = (val) => {
    if (!val) return { en: '', ar: '' };
    if (typeof val === 'string') return { en: val, ar: val };
    if (typeof val === 'object') {
      // if object missing en/ar, try to fill from available keys
      return {
        en: val.en || val.en === '' ? val.en : (val?.en ?? val?.en) || '',
        ar: val.ar || val.ar === '' ? val.ar : (val?.ar ?? val?.ar) || ''
      };
    }
    return { en: '', ar: '' };
  };

  // Ensure arrays of localized items are normalized
  const ensureLocalizedList = (list) => {
    if (!list) return [];
    if (!Array.isArray(list)) return [];
    return list.map(item => {
      if (typeof item === 'string') return { en: item, ar: item };
      if (typeof item === 'object') return { en: item.en || item, ar: item.ar || item };
      return { en: '', ar: '' };
    });
  };

  data.name = ensureLocalized(data.name);
  data.country = ensureLocalized(data.country);
  data.description = ensureLocalized(data.description);
  data.bestTimeToVisit = ensureLocalized(data.bestTimeToVisit);
  data.topAttractions = ensureLocalizedList(data.topAttractions);
  data.localCuisine = ensureLocalizedList(data.localCuisine);
  data.shopping = ensureLocalizedList(data.shopping);

  // Normalize quickInfo.airport to a single string (airport code)
  if (!data.quickInfo) data.quickInfo = { airport: '', timeZone: '' };
  if (data.quickInfo && data.quickInfo.airport) {
    const airportVal = data.quickInfo.airport;
    if (typeof airportVal === 'string') {
      data.quickInfo.airport = airportVal;
    } else if (typeof airportVal === 'object' && airportVal !== null) {
      data.quickInfo.airport = airportVal.code || airportVal.en || airportVal.ar || '';
    } else {
      data.quickInfo.airport = String(airportVal || '');
    }
  } else {
    data.quickInfo.airport = data.quickInfo.airport || '';
  }

  // Basic server-side validation: require image and name/country
  const missingFields = [];
  if (!data.image) missingFields.push('image');
  if (!data.name || !data.name.en) missingFields.push('name.en');
  if (!data.country || !data.country.en) missingFields.push('country.en');

  if (missingFields.length > 0) {
    console.warn('createDestination missing required fields:', missingFields);
    return res.status(400).json({ success: false, error: 'Missing required fields', missingFields });
  }

  try {
    const destination = await Destination.create(data);
    const destinationWithUrl = await convertToSignedUrl(destination);
    res.status(201).json({ success: true, data: destinationWithUrl });
  } catch (dbErr) {
    console.error('Failed to create destination:', dbErr);
    return res.status(500).json({ success: false, error: 'Failed to create destination', details: String(dbErr) });
  }
});

// @desc    Update destination
// @route   PUT /api/destinations/:id
// @access  Private/Admin
exports.updateDestination = asyncHandler(async (req, res, next) => {
  let destination = await Destination.findById(req.params.id);

  if (!destination) {
    return res.status(404).json({
      success: false,
      error: 'Destination not found'
    });
  }

  const data = { ...req.body };

  // If new image uploaded, upload buffer to Supabase Storage and replace image URL
  if (req.file && req.file.buffer) {
    try {
      const ext = (req.file.originalname && req.file.originalname.split('.').pop()) || 'jpg';
      const prefix = process.env.UPLOAD_PREFIX_DESTINATIONS || 'destinations';
      const destPath = `${prefix}/${Date.now()}-${Math.round(Math.random()*1e9)}.${ext}`;
      const publicUrl = await uploadBuffer(req.file.buffer, destPath, req.file.mimetype || 'image/jpeg');
      data.image = publicUrl;
    } catch (err) {
      console.error('Upload failed in updateDestination:', err);
      return res.status(500).json({ success: false, error: 'Image upload failed', details: String(err) });
    }
  }

  destination = await Destination.findByIdAndUpdate(req.params.id, data, {
    new: true,
    runValidators: true
  });

  const destinationWithUrl = await convertToSignedUrl(destination);
  res.status(200).json({
    success: true,
    data: destinationWithUrl
  });
});

// @desc    Delete destination
// @route   DELETE /api/destinations/:id
// @access  Private/Admin
exports.deleteDestination = asyncHandler(async (req, res, next) => {
  const destination = await Destination.findById(req.params.id);

  if (!destination) {
    return res.status(404).json({
      success: false,
      error: 'Destination not found'
    });
  }

  await destination.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Update destination's popular status
// @route   PATCH /api/destinations/:id/popular
// @access  Private/Admin
exports.updateDestinationPopular = asyncHandler(async (req, res, next) => {
  const destination = await Destination.findByIdAndUpdate(
    req.params.id,
    { popular: req.body.popular },
    {
      new: true,
      runValidators: true
    }
  );

  if (!destination) {
    return res.status(404).json({
      success: false,
      error: 'Destination not found'
    });
  }

  res.status(200).json({
    success: true,
    data: destination
  });
}); 