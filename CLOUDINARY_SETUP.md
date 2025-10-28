# Cloudinary Setup Guide

This guide will help you migrate from base64 image storage to Cloudinary for better performance and scalability.

## Prerequisites

1. A Cloudinary account (sign up at https://cloudinary.com)
2. Node.js and npm installed
3. MongoDB database running

## Setup Steps

### 1. Create Cloudinary Account

1. Go to https://cloudinary.com and sign up for a free account
2. Once logged in, go to your Dashboard
3. Note down your:
   - Cloud Name
   - API Key
   - API Secret

### 2. Configure Environment Variables

Add the following to your `.env` file:

```env
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

### 3. Install Dependencies

The Cloudinary package is already installed. If you need to reinstall:

```bash
npm install cloudinary
```

### 4. Run Migration Script

To migrate existing base64 images to Cloudinary:

```bash
# Basic migration
node scripts/migrate-to-cloudinary.js

# Migration with base64 cleanup (removes base64 data after successful migration)
node scripts/migrate-to-cloudinary.js --remove-base64
```

### 5. Test the Integration

1. Start your server: `npm start`
2. Open the client application
3. Try uploading a new product image
4. Verify the image appears correctly
5. Test deleting an image

## API Changes

### New Endpoints

- `POST /products/:id/image` - Upload image to Cloudinary
- `DELETE /products/:id/image` - Delete image from Cloudinary
- `GET /products/:id/image` - Get Cloudinary image URL
- `POST /products/:id/image/migrate` - Migrate base64 image to Cloudinary

### Removed Endpoints

- `POST /products/:id/image/base64` - No longer needed
- `GET /products/:id/image/base64` - No longer needed
- `DELETE /products/:id/image/base64` - No longer needed

## Database Schema Changes

The Product model has been updated:

**Before:**
```javascript
image: String, // Base64 encoded image data
image_mime_type: String, // MIME type
```

**After:**
```javascript
image_url: String, // Cloudinary image URL
image_public_id: String, // Cloudinary public ID for management
```

## Benefits of Cloudinary

1. **Performance**: Images are served from CDN with automatic optimization
2. **Scalability**: No database size limits for images
3. **Features**: Automatic format conversion, resizing, and optimization
4. **Cost**: Free tier includes 25GB storage and 25GB bandwidth
5. **Reliability**: Professional image hosting with 99.9% uptime

## Troubleshooting

### Common Issues

1. **Invalid Cloudinary credentials**: Double-check your environment variables
2. **Migration fails**: Ensure you have sufficient Cloudinary storage quota
3. **Images not loading**: Check if the Cloudinary URLs are accessible
4. **Upload errors**: Verify file size limits (10MB max)

### Debug Mode

To enable debug logging, set `NODE_ENV=development` in your environment.

## Rollback Plan

If you need to rollback to base64 storage:

1. Restore the original Product model
2. Restore the original image controllers
3. Update client-side code to use base64 endpoints
4. Run a script to download images from Cloudinary and convert to base64

## Support

For Cloudinary-specific issues, consult:
- Cloudinary Documentation: https://cloudinary.com/documentation
- Cloudinary Support: https://support.cloudinary.com
