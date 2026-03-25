import { NextResponse } from 'next/server';
import models from '@/public/models.json';

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';

export async function GET() {
  try {
    // Fetch NVIDIA models
    const nvidiaModels = await fetchNvidiaModels();
    
    // Merge with local models
    const allModels = {
      ...models.categories,
      nvidia: nvidiaModels,
    };
    
    return NextResponse.json({ categories: allModels });
  } catch (error) {
    console.error('Error fetching models:', error);
    // Fallback to local models only
    return NextResponse.json(models);
  }
}

async function fetchNvidiaModels(): Promise<any[]> {
  try {
    const response = await fetch(`${NVIDIA_BASE}/models`, {
      headers: {
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch NVIDIA models');
    }
    
    const data = await response.json();
    
    // Transform NVIDIA models to our format
    return (data.data || []).map((m: any) => ({
      id: `nvidia/${m.id}`,
      name: `NVIDIA ${m.id}`,
      desc: 'NVIDIA NIM Model',
      context: '-',
      capabilities: ['tools'],
      pro: false,
      caching: false,
    }));
  } catch (error) {
    console.error('Error fetching NVIDIA models:', error);
    return [];
  }
}
