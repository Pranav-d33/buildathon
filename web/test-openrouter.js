// Quick test script to verify OpenRouter API key and model
const fs = require('fs')
const path = require('path')

// Read .env file manually
const envPath = path.join(__dirname, '.env')
const envContent = fs.readFileSync(envPath, 'utf-8')
const envVars = {}
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
        envVars[match[1].trim()] = match[2].trim()
    }
})

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'google/gemini-flash-1.5'

async function testOpenRouter() {
    const apiKey = envVars.OPENROUTER_API_KEY

    console.log('API Key present:', !!apiKey)
    console.log('API Key length:', apiKey?.length || 0)
    console.log('API Key prefix:', apiKey?.substring(0, 7) + '...')

    console.log('\nTesting OpenRouter API...')

    try {
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://opero.app',
                'X-Title': 'Opero',
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'user', content: 'Say "Hello, Opero!" if you can read this.' }
                ],
            }),
        })

        console.log('Response status:', response.status, response.statusText)

        const responseText = await response.text()
        console.log('Response body:', responseText.substring(0, 500))

        if (response.ok) {
            const data = JSON.parse(responseText)
            console.log('\n✅ SUCCESS! Model response:', data.choices[0]?.message?.content)
        } else {
            console.log('\n❌ FAILED! Check the error above.')
        }
    } catch (error) {
        console.error('❌ Error:', error.message)
    }
}

testOpenRouter()
