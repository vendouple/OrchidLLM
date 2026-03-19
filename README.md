# OneLLM Playground

A Material 3 Expressive chat application UI for interacting with multiple AI models including text, image, video, audio, and transcription models.

## ✨ Features

### Core Features
- **Multi-Model Support**: Text, Image, Video, Audio Input/Output, and Transcription models
- **Material 3 Expressive Design**: Modern, animated UI following Google's M3 Expressive guidelines
- **Chat History**: Persistent chat history stored in browser localStorage
- **Temporary Chat Mode**: Create temporary conversations that don't save to history
- **Model Capabilities**: Visual indicators for model features (vision, reasoning, audio, search, code execution)
- **Enhance Feature**: Prompt enhancement for non-text models using text AI models

### UI Components
- **Collapsible Sidebar**: History navigation with smooth animations
- **Model Picker**: Dropdown menu with model categories and capability chips
- **Settings Panel**: Configure system prompts, theme, demo mode, and manage chat history
- **Light/Dark Mode**: Toggle between light and dark themes with smooth transitions
- **File Upload**: Support for attaching multiple files to conversations
- **Demo Mode**: Rate limiting (20 requests per day) for demonstration purposes

### Design Highlights
- **Expressive Animations**: Smooth transitions, hover effects, and micro-interactions
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **Custom Scrollbars**: Styled scrollbars matching the M3 color scheme
- **Ambient Background**: Animated gradient background for visual depth
- **Accessibility**: ARIA labels, keyboard navigation, and semantic HTML

## 🎨 Model Capabilities

Each model displays capability icons:
- 👁️ **Vision** (`visibility`) - Image/video understanding
- 🧠 **Reasoning** (`psychology`) - Advanced reasoning capabilities
- 🎙️ **Audio Input** (`mic`) - Process audio input
- 🔍 **Search** - Web search integration
- 🔊 **Audio Output** (`volume_up`) - Generate audio/speech
- 💻 **Code Execution** (`code`) - Execute code snippets

## 🚀 Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- No build tools required - runs entirely in the browser

### Installation

1. Clone the repository:
```bash
git clone https://github.com/vendouple/OneLLM.git
cd OneLLM
```

2. Open `index.html` in your web browser or serve with a local server:
```bash
python3 -m http.server 8000
# Navigate to http://localhost:8000
```

## 📁 Project Structure

```
OneLLM/
├── index.html      # Main HTML structure
├── styles.css      # Material 3 Expressive styling
├── app.js          # Application logic and state management
└── README.md       # This file
```

## 🎯 Usage

### Starting a Conversation
1. Click "New Chat" to start a new conversation
2. Toggle "Temporary Chat" to create a conversation that won't be saved
3. Type your message in the composer
4. Click "Send" or press Enter to submit

### Switching Models
1. Click the "Models" button in the chat header
2. Select a model category (Text, Image, Video, etc.)
3. Choose a specific model from the list
4. Each model shows its capabilities with icon badges

### Using Enhance Feature
1. Select a non-text model (Image, Video, Audio)
2. The "Enhance Prompt" button will appear
3. Click to enable enhancement and select an enhancement model
4. Your prompts will be improved before sending to the model

### Managing Chat History
1. Click the settings icon in the header
2. Export your chat history as JSON
3. Import previously exported history
4. Clear all chats and reset demo usage

## 🎨 Customization

### Color Scheme
Edit CSS variables in `styles.css`:
```css
:root {
  --m3-primary: #2f6dff;
  --m3-surface: #ffffff;
  --m3-text: #171924;
  /* ... more variables */
}
```

### Adding New Models
Edit `MODEL_GROUPS` in `app.js`:
```javascript
const MODEL_GROUPS = {
  Text: ["GPT-4.1 Mini", "Your Model"],
  // ... other categories
};
```

### Model Capabilities
Edit `MODEL_CAPABILITIES` in `app.js`:
```javascript
const MODEL_CAPABILITIES = {
  "Your Model": ["visibility", "code", "search"],
  // ... other models
};
```

## 📱 Responsive Design

- **Desktop** (>960px): Full sidebar with chat interface
- **Tablet** (640px-960px): Collapsible sidebar, adjusted layout
- **Mobile** (<640px): Optimized for small screens with full-width composer

## 🔧 Browser Compatibility

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support (iOS 14+)
- Opera: ✅ Full support

## 🎓 Material 3 Expressive

This project implements Material 3 Expressive design principles:
- Larger corner radius for approachability
- Expressive animations with custom easing
- Elevated color schemes with gradients
- Interactive micro-animations
- Smooth state transitions

Learn more: [Building with M3 Expressive](https://m3.material.io/blog/building-with-m3-expressive)

## 🙏 Powered By

This application is powered by [Pollinations.ai](https://pollinations.ai) - providing access to various AI models for text, image, video, and audio generation.

## 📄 License

This project is open source and available under the MIT License.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🐛 Known Limitations

- Frontend-only demo (no actual API integration yet)
- Chat history limited by browser localStorage quota
- Demo mode counter resets daily based on local time

## 🔮 Future Enhancements

- [ ] LaTeX rendering for mathematical expressions
- [ ] Markdown formatting support
- [ ] Code syntax highlighting
- [ ] Mermaid diagram rendering
- [ ] Real API integration with Pollinations.ai
- [ ] Voice input/output
- [ ] Image preview in chat
- [ ] Export conversations as PDF/HTML
- [ ] Multi-language support

---

Built with ❤️ using vanilla HTML, CSS, and JavaScript
