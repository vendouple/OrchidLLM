import { createOpenAiProvider } from '../shared/create-openai-provider.js';

const pollinationsProvider = createOpenAiProvider({
    id: 'pollinations',
    displayName: 'Pollinations',
    aliases: ['polly'],
    baseUrl: 'https://gen.pollinations.ai/v1',
    envKeyCandidates: [
        'POLLINATIONS_API_KEY',
        'POLLINATION_API_KEY',
        'POLLINATIONS_KEY',
        'POLLINATIONS_TOKEN'
    ],
    usageCounterType: 'pollinations-pollen',
    endpoints: {
        'chat.completions': '/chat/completions',
        'images.generations': '/images/generations',
        'models.list': '/models'
    }
});

export default pollinationsProvider;
