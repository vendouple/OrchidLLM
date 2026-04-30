const fs = require('fs');
const path = require('path');

const providers = [
  { name: 'ElectronHubAI', file: 'electronhubdocs.md', url: 'https://api.electronhub.ai/v1', mods: 'Text, Image, TTS, Transcription' },
  { name: 'MNN AI', file: 'mnnaidocs.md', url: 'https://api.mnnai.ru/v1', mods: 'Text, Image' },
  { name: 'NagaAI', file: 'nagaaidocs.md', url: 'https://api.naga.ac/v1', mods: 'Text, Image, Audio' },
  { name: 'OhMyGPT', file: 'ohmygptdocs.md', url: 'https://api.ohmygpt.com/v1', mods: 'Text, Image, TTS' },
  { name: 'LLM Gateway', file: 'llmgatewaydocs.md', url: 'https://api.llmgateway.io/v1', mods: 'Text, Image' },
  { name: 'LLM7', file: 'llm7docs.md', url: 'https://api.llm7.io/v1', mods: 'Text, Image' },
  { name: 'Zanity AI', file: 'zanitydocs.md', url: 'https://api.zanity.xyz/v1', mods: 'Text, Image' },
  { name: 'Apertis', file: 'apertisdocs.md', url: 'https://api.apertis.ai/v1', mods: 'Text, Image' },
  { name: 'A4F', file: 'a4fdocs.md', url: 'https://api.a4f.co/v1', mods: 'Text, Image, Audio' },
  { name: 'StudioLM', file: 'studiolmdocs.md', url: 'https://api.studiolm.dev/v1', mods: 'Text, Image, TTS' },
  { name: 'Seraphyn AI', file: 'seraphyndocs.md', url: 'https://seraphyn.ai/api/v1', mods: 'Text, Image' },
  { name: 'Infip', file: 'infipdocs.md', url: 'https://api.infip.pro/v1', mods: 'Text, Image' },
  { name: 'Routeway', file: 'routewaydocs.md', url: 'https://api.routeway.ai/v1', mods: 'Text, Image, TTS' },
  { name: 'Scitely', file: 'scitelydocs.md', url: 'https://api.scitely.com/v1', mods: 'Text, Image, Video' },
  { name: 'AwanLLM', file: 'awanllmdocs.md', url: 'https://api.awanllm.com/v1', mods: 'Text' },
  { name: 'SubNP', file: 'subnpdocs.md', url: 'https://api.subnp.com/v1', mods: 'Text, Image' },
  { name: 'OpenCode Zen', file: 'opencodedocs.md', url: 'https://api.opencode.ai/v1', mods: 'Text' },
  { name: 'Z.AI', file: 'zaidocs.md', url: 'https://api.z.ai/v1', mods: 'Text, Image, TTS' },
  { name: 'MegaNova', file: 'meganovadocs.md', url: 'https://api.meganova.ai/v1', mods: 'Text, Image' },
  { name: 'Hubs02225', file: 'hubs02225docs.md', url: '[Placeholder Endpoint]', mods: 'Text' },
  { name: 'Groq', file: 'groqdocs.md', url: 'https://api.groq.com/openai/v1', mods: 'Text' },
  { name: 'Google AI Studio', file: 'googleaistudiodocs.md', url: 'https://generativelanguage.googleapis.com/v1beta/openai/', mods: 'Text, Image' },
  { name: 'Cohere', file: 'coheredocs.md', url: 'https://api.cohere.com/v1', mods: 'Text' },
  { name: 'OpenRouter', file: 'openrouterdocs.md', url: 'https://openrouter.ai/api/v1', mods: 'Text, Image' },
  { name: 'Pydantic AI Gateway', file: 'pydanticdocs.md', url: 'TBD', mods: 'Text' },
  { name: 'Requesty AI', file: 'requestydocs.md', url: 'TBD', mods: 'Text' },
  { name: 'Friendli AI', file: 'friendlidocs.md', url: 'TBD', mods: 'Text' },
  { name: 'Vercel AI Gateway', file: 'vercelaidocs.md', url: 'TBD', mods: 'Text' },
  { name: 'GitHub Models', file: 'githubmodelsdocs.md', url: 'https://models.inference.ai.azure.com', mods: 'Text' },
  { name: 'IBM watsonx.ai', file: 'watsonxdocs.md', url: 'TBD', mods: 'Text' },
  { name: 'AI Horde', file: 'aihordedocs.md', url: 'TBD', mods: 'Text, Image' },
  { name: 'Mistral Codestral', file: 'codestraldocs.md', url: 'https://codestral.mistral.ai/v1', mods: 'Text' }
];

const template = (name, url, mods) => `# ${name} API Documentation

> **Base URL:** \`${url}\`
> **Authentication:** \`Authorization: Bearer <your_api_key>\`
> **Supported Modalities:** ${mods}

${name} acts as a standard OpenAI-compatible API gateway/provider.

## 1. Chat Completions (Text)

\`POST /v1/chat/completions\`

### Request Body (OpenAI Standard)
- \`model\` (string, required): The ID of the model to use.
- \`messages\` (array, required): Array of message objects (\`role\`, \`content\`).
- \`temperature\` (number, optional): Controls randomness.
- \`stream\` (boolean, optional): Set to \`true\` for SSE streaming.

### Example Request
\`\`\`bash
curl ${url}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your_api_key" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello world!"}
    ]
  }'
\`\`\`

${mods.includes('Image') ? `## 2. Image Generation

\`POST /v1/images/generations\`

### Request Body
- \`model\` (string, required): Image generation model.
- \`prompt\` (string, required): Description of the image.
- \`size\` (string, optional): Image dimensions.
` : ''}
## Rate Limits & Specifics
- Always check headers like \`x-ratelimit-remaining\`.
- The aggregator will catch \`429\` errors and fall back appropriately.
`;

const plansDir = path.join(__dirname, '..', 'plans');
if (!fs.existsSync(plansDir)) {
  fs.mkdirSync(plansDir, { recursive: true });
}

providers.forEach(p => {
  const filePath = path.join(plansDir, p.file);
  fs.writeFileSync(filePath, template(p.name, p.url, p.mods));
  console.log(`Created ${p.file}`);
});

// Create specific Xeven worker one
const xevenTemplate = `# Xeven Worker API Documentation

> **Base URL:** \`https://ai-image-api.xeven.workers.dev\`
> **Authentication:** Depends on implementation, typically none or query param
> **Supported Modalities:** Image Only

Xeven worker uses a custom endpoint instead of the standard OpenAI format.

## 1. Image Generation

\`GET /img?prompt={prompt}\`

### Example Request
\`\`\`bash
curl "https://ai-image-api.xeven.workers.dev/img?prompt=A%20cat%20in%20space" --output image.jpg
\`\`\`
`;
fs.writeFileSync(path.join(plansDir, 'xevendocs.md'), xevenTemplate);
console.log('Created xevendocs.md');
