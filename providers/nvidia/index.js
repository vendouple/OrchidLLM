import { createOpenAiProvider } from '../shared/create-openai-provider.js';

const nvidiaProvider = createOpenAiProvider({
    id: 'nvidia',
    displayName: 'NVIDIA NIM',
    aliases: ['nim'],
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    envKeyCandidates: ['NVIDIA_API_KEY'],
    usageCounterType: 'requests',
    endpoints: {
        'chat.completions': '/chat/completions',
        'models.list': '/models'
    }
});

export default nvidiaProvider;
