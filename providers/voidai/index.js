import { createOpenAiProvider } from '../shared/create-openai-provider.js';

const voidAiProvider = createOpenAiProvider({
    id: 'voidai',
    displayName: 'VoidAI',
    baseUrl: 'https://api.voidai.app/v1',
    envKeyCandidates: ['VOIDAI_API_KEY'],
    usageCounterType: 'tokens',
    endpoints: {
        'chat.completions': '/chat/completions',
        'images.generations': '/images/generations',
        'models.list': '/models'
    }
});

export default voidAiProvider;
