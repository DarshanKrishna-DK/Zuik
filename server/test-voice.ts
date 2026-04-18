import 'dotenv/config'
import { transcribeAudio, synthesizeSpeech, detectLanguage, isVoiceServiceConfigured } from './voiceService.js'
import { readFileSync, writeFileSync } from 'fs'

async function testVoiceServices() {
  console.log('🧪 Testing Zuik Voice Services')
  console.log('================================')
  
  // Check service configuration
  const config = isVoiceServiceConfigured()
  console.log('Configuration:')
  console.log(`  Groq Whisper: ${config.groq ? '✅ Ready' : '❌ Missing API key'}`)
  console.log(`  ElevenLabs TTS: ${config.elevenlabs ? '✅ Ready' : '❌ Missing API key'}`)
  console.log()
  
  if (!config.groq && !config.elevenlabs) {
    console.log('❌ No voice services configured')
    console.log('Set GROQ_API_KEY and ELEVENLABS_API_KEY in .env file')
    return
  }
  
  // Test 1: Language Detection
  console.log('🔍 Test 1: Language Detection')
  const testTexts = [
    'Hello, how are you doing today?',
    'नमस्ते, आप कैसे हैं?',
    'Mix of English and हिंदी text',
  ]
  
  for (const text of testTexts) {
    const lang = detectLanguage(text)
    console.log(`  "${text}" → ${lang}`)
  }
  console.log()
  
  // Test 2: Text-to-Speech
  if (config.elevenlabs) {
    console.log('🔊 Test 2: Text-to-Speech')
    try {
      const text = 'Hello from Zuik! This is a test of the ElevenLabs text-to-speech integration.'
      console.log('  Synthesizing:', text)
      
      const audio = await synthesizeSpeech(text, undefined, 'en')
      console.log(`  ✅ Generated ${audio.audioData.length} bytes of audio data`)
      
      // Save test audio file
      writeFileSync('test-output.mp3', audio.audioData)
      console.log('  💾 Saved as test-output.mp3')
      
      // Test Hindi
      const hindiText = 'नमस्ते! यह Zuik का एक टेस्ट है।'
      console.log('  Synthesizing Hindi:', hindiText)
      const hindiAudio = await synthesizeSpeech(hindiText, undefined, 'hi')
      console.log(`  ✅ Generated ${hindiAudio.audioData.length} bytes of Hindi audio`)
      writeFileSync('test-hindi-output.mp3', hindiAudio.audioData)
      console.log('  💾 Saved as test-hindi-output.mp3')
      
    } catch (error) {
      console.log('  ❌ TTS test failed:', error instanceof Error ? error.message : 'Unknown error')
    }
    console.log()
  }
  
  // Test 3: Transcription (if sample audio exists)
  if (config.groq) {
    console.log('🎤 Test 3: Audio Transcription')
    try {
      // Try to transcribe the generated audio file
      if (config.elevenlabs) {
        console.log('  Note: Real transcription test requires audio file input')
        console.log('  TTS → STT roundtrip testing would need WAV conversion')
      } else {
        console.log('  Transcription ready, but no test audio available')
        console.log('  To test: provide an audio file and call transcribeAudio()')
      }
    } catch (error) {
      console.log('  ❌ Transcription test failed:', error instanceof Error ? error.message : 'Unknown error')
    }
    console.log()
  }
  
  console.log('🎉 Voice services test completed!')
  console.log()
  console.log('Next steps:')
  console.log('1. Start the voice server: npm run voice')
  console.log('2. Test the HTTP API at http://localhost:3002')
  console.log('3. Deploy to Railway.app for production')
}

testVoiceServices().catch(console.error)