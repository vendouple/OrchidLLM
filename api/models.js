/**
 * /api/models - Model Catalog
 * 
 * Returns available models from local catalog and NVIDIA NIM
 */

import { getBaseUrl } from '../lib/auth.js';

const POLLINATIONS_BASE = 'https://gen.pollinations.ai/v1';
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // Try to fetch local models.json first
        let localModels = { categories: {} };
        try {
            const baseUrl = getBaseUrl(req);
            const localResponse = await fetch(`${baseUrl}/models.json`);
            if (localResponse.ok) {
                localModels = await localResponse.json();
            }
        } catch (e) {
            console.log('Could not fetch local models.json');
        }
        
        // Try to fetch NVIDIA models
        let nvidiaModels = [];
        try {
            const nvidiaResponse = await fetch(`${NVIDIA_BASE}/models`, {
                headers: {
                    'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`
                }
            });
            
            if (nvidiaResponse.ok) {
                const nvidiaData = await nvidiaResponse.json();
                nvidiaModels = (nvidiaData.data || []).map(m => ({
                    id: `nvidia/${m.id}`,
                    name: `NVIDIA ${m.id}`,
                    desc: 'NVIDIA NIM Model',
                    context: '-',
                    capabilities: ['tools'],
                    pro: false,
                    caching: false
                }));
            }
        } catch (e) {
            console.log('Could not fetch NVIDIA models');
        }
        
        // Merge models
        const allModels = {
            ...localModels.categories,
            ...(nvidiaModels.length > 0 ? { nvidia: nvidiaModels } : {})
        };
        
        res.status(200).json({ categories: allModels });
    } catch (error) {
        console.error('Models error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
