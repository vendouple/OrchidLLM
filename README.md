# OneLLM Playground

A beautiful multi-modal AI playground powered by Pollinations.ai, featuring image generation, text completions, audio/music/video generation, and transcription capabilities.

## Features

### 🎨 Generation Modes

- **Image Generation** - Create stunning images with Flux models
- **Text Completion** - Chat with OpenAI, Gemini, Claude, or Llama models
- **Audio Generation** - Text-to-speech with multiple voices
- **Music Generation** - Create music from text descriptions
- **Video Generation** - Generate short video clips
- **Audio/Video Transcription** - Transcribe audio and video files

### 🔑 Authentication Modes

1. **Demo Mode** - Free tier with 15 requests per day using public API
2. **BYOP (Bring Your Own Pollen)** - Unlimited access with your Pollinations API key
3. **BYOK (Bring Your Own Key)** - Coming soon! OpenAI-compatible endpoint support

### 💎 Design

Built with the **Liquid Glass design system** featuring:
- Apple-inspired glassmorphism aesthetic
- Smooth bounce animations
- Dark/Light theme support
- Responsive mobile design
- Beautiful backdrop blur effects

### 📦 Data & Privacy

- **Local Storage Only** - All history stored in your browser
- **Export Capability** - Download your generation history as JSON
- **No Server Storage** - Data only sent to Pollinations.ai
- **Privacy Focused** - See [Pollinations Privacy Policy](https://pollinations.ai/privacy)

## Getting Started

### Demo Mode

1. Open the application
2. Click "Demo Mode"
3. Start generating! You get 15 free requests per day
4. Quota resets daily

### BYOP Mode

1. Get your API key from [Pollinations](https://enter.pollinations.ai/api/docs)
2. Click "BYOP" on the login screen
3. Enter your API key
4. Enjoy unlimited generations!

## Usage

### Image Generation

1. Select the "Image" mode
2. Enter a detailed prompt
3. Choose a model (Flux, Flux Realism, Flux Anime, etc.)
4. Click "Generate Image"
5. Download or view your creation

### Text Completion

1. Select the "Text" mode
2. Optionally add a system prompt
3. Enter your user prompt
4. Choose a model (OpenAI, Gemini, Claude, Llama)
5. Click "Generate Text"
6. Copy the result to clipboard

### Audio/Music Generation

1. Select "Audio" or "Music" mode
2. Enter text or description
3. Set duration (for music)
4. Generate and play the result
5. Download the audio file

### Video Generation

1. Select "Video" mode
2. Describe your desired video
3. Set duration (3-10 seconds)
4. Generate and watch

### Transcription

1. Select "Transcribe" mode
2. Upload an audio or video file
3. Click "Transcribe"
4. Copy or view the transcription result

## Keyboard Shortcuts

- **Theme Toggle** - Click sun/moon icon in navbar
- **History** - Click history icon to view past generations
- **Export** - Click export icon to download history
- **Logout** - Click logout icon to return to mode selection

## Technical Details

### Stack

- **Framework**: Vanilla JavaScript (No build tools required)
- **Styling**: Custom Liquid Glass CSS system
- **API**: Pollinations.ai
- **Storage**: Browser LocalStorage

### Supported File Formats

**Transcription:**
- Audio: MP3, M4A, WAV, WebM
- Video: MP4, MPEG

### Supported Models

**Image:**
- Flux, Flux Realism, Flux Cably, Flux Anime, Flux 3D, Turbo

**Text:**
- OpenAI, Gemini Fast, Claude Sonnet, Llama 3.1 405B

**Audio:**
- Parler TTS

**Music & Video:**
- Pollinations native models

**Transcription:**
- Whisper Large V3

## Development

### Local Setup

1. Clone the repository
2. Open `index.html` in a modern browser
3. No build step required!

### File Structure

```
OneLLM/
├── index.html    # Main HTML structure
├── app.js        # Application logic
└── styles.css    # Liquid Glass design system
```

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari 14+

Requires support for:
- CSS backdrop-filter
- Dialog element
- Fetch API
- LocalStorage

## Credits

- **Design Inspiration**: [Apple Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/liquid-glass)
- **AI API**: [Pollinations.ai](https://pollinations.ai)
- **Fonts**: Inter & IBM Plex Mono from Google Fonts

## License

MIT License - Feel free to use and modify!

## Support

Having issues? Check:
1. Browser console for errors
2. API key validity (BYOP mode)
3. File format compatibility (Transcription)
4. Daily quota (Demo mode)

---

**Built with ❤️ using Pollinations.ai**
