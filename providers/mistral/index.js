import { createOpenAiProvider } from '../shared/create-openai-provider.js';

const mistralProvider = createOpenAiProvider({
    id: 'mistral',
    displayName: 'Mistral',
    aliases: ['mistralai'],
    baseUrl: 'https://api.mistral.ai/v1',
    envKeyCandidates: ['MISTRAL_API_KEY'],
    usageCounterType: 'tokens',
    endpoints: {
        'chat.completions': '/chat/completions',
        'models.list': '/models'
    }
});

export default mistralProvider;
