const path = require('path');
const fs = require('fs');

// Image optimization middleware
function imageOptimization(req, res, next) {
  // Set appropriate headers for image optimization
  res.set({
    'Cache-Control': 'public, max-age=31536000', // 1 year for images
    'Vary': 'Accept-Encoding',
    'X-Content-Type-Options': 'nosniff'
  });

  // Add compression support
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (acceptEncoding.includes('gzip')) {
    res.set('Content-Encoding', 'gzip');
  }

  next();
}

// Generate image placeholder (base64 encoded)
function generatePlaceholder(width = 48, height = 48) {
  // Create a simple SVG placeholder
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f3f4f6"/>
      <circle cx="${width/2}" cy="${height/2}" r="${Math.min(width, height)/4}" fill="#9ca3af"/>
      <circle cx="${width/2}" cy="${height/2}" r="${Math.min(width, height)/6}" fill="#f3f4f6"/>
    </svg>
  `;
  
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// Check if image exists and return appropriate response
function checkImageExists(imagePath, res, next) {
  if (!fs.existsSync(imagePath)) {
    return res.status(404).json({ message: 'Image not found' });
  }
  
  // Set last modified header
  const stats = fs.statSync(imagePath);
  res.set('Last-Modified', stats.mtime.toUTCString());
  
  next();
}

// Image resizing middleware (placeholder for future implementation)
function resizeImage(req, res, next) {
  const { width, height, quality } = req.query;
  
  // For now, just pass through
  // In production, you'd implement actual image resizing here
  if (width || height || quality) {
    res.set('X-Image-Resized', 'true');
    res.set('X-Original-Size', 'preserved');
  }
  
  next();
}

// Progressive loading support
function progressiveLoading(req, res, next) {
  const { progressive } = req.query;
  
  if (progressive === 'true') {
    res.set('X-Progressive-Loading', 'enabled');
    res.set('X-Loading-Strategy', 'progressive');
  }
  
  next();
}

module.exports = {
  imageOptimization,
  generatePlaceholder,
  checkImageExists,
  resizeImage,
  progressiveLoading
};
