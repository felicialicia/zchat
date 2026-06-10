import { v2 as cloudinaryV2 } from 'cloudinary'

// Configure Cloudinary
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinaryV2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })
}

export default cloudinaryV2
