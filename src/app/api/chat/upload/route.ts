import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import cloudinary from '@/lib/cloudinary'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const channelId = formData.get('channelId') as string | null
    const userId = formData.get('userId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    }

    const isImage = file.type.startsWith('image/')
    const buffer = Buffer.from(await file.arrayBuffer())

    let fileUrl = ''

    // Try Cloudinary first (production), fallback to local storage (development)
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const base64Data = `data:${file.type};base64,${buffer.toString('base64')}`

        const result = await cloudinary.uploader.upload(base64Data, {
          folder: 'zchat/uploads',
          resource_type: isImage ? 'image' : 'auto',
          max_file_size: 10 * 1024 * 1024,
        })

        fileUrl = result.secure_url
      } catch (cloudinaryError) {
        console.error('Cloudinary upload error, falling back to local:', cloudinaryError)
        // Fallback to local storage
        const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
        await mkdir(uploadsDir, { recursive: true })
        const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const filePath = path.join(uploadsDir, filename)
        await writeFile(filePath, buffer)
        fileUrl = `/uploads/${filename}`
      }
    } else {
      // Local storage for development
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
      await mkdir(uploadsDir, { recursive: true })
      const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const filePath = path.join(uploadsDir, filename)
      await writeFile(filePath, buffer)
      fileUrl = `/uploads/${filename}`
    }

    return NextResponse.json({
      success: true,
      url: fileUrl,
      isImage,
      fileName: file.name,
      fileSize: file.size,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
