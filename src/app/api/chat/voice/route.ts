import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import ZAI from 'z-ai-web-dev-sdk'

let zaiInstance: any = null

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File | null

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    // Save audio file
    const ext = audioFile.type.includes('webm') ? '.webm' : '.wav'
    const filename = `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })
    
    const filePath = path.join(uploadsDir, filename)
    const buffer = Buffer.from(await audioFile.arrayBuffer())
    await writeFile(filePath, buffer)

    const audioUrl = `/uploads/${filename}`

    // Transcribe using ASR
    let transcription = ''
    try {
      const zai = await getZAI()
      const base64Audio = buffer.toString('base64')
      const response = await zai.audio.asr.create({
        file_base64: base64Audio
      })
      transcription = response.text || ''
    } catch (asrError) {
      console.error('ASR error (non-critical):', asrError)
      // Transcription is optional, don't fail the whole request
    }

    return NextResponse.json({
      success: true,
      audioUrl,
      transcription,
      duration: 0, // Will be filled by client
    })
  } catch (error) {
    console.error('Voice upload error:', error)
    return NextResponse.json({ error: 'Voice upload failed' }, { status: 500 })
  }
}
