import { createOpenAiProvider } from '../shared/create-openai-provider.js';

const navyProvider = createOpenAiProvider({
    id: 'navy',
    displayName: 'NavyAI',
    aliases: ['navyai'],
    baseUrl: 'https://api.navy/v1',
    envKeyCandidates: ['NAVY_API_KEY'],
    usageCounterType: 'tokens',
    endpoints: {
        'chat.completions': '/chat/completions',
        'images.generations': '/images/generations',
        'models.list': '/models'
    },
    additionalAuthHeaders(apiKey) {
        if (!apiKey) return {};
        return {
            'x-api-key': apiKey
        };
    }
});

export default navyProvider;
