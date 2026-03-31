import { createOpenAiProvider } from '../shared/create-openai-provider.js';

const cerebrasProvider = createOpenAiProvider({
    id: 'cerebras',
    displayName: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    envKeyCandidates: ['CEREBRAS_API_KEY'],
    usageCounterType: 'tokens',
    endpoints: {
        'chat.completions': '/chat/completions',
        'models.list': '/models'
    }
});

export default cerebrasProvider;
