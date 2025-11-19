import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding, generateEmbeddings } from '@/lib/langchain/embeddings'

// POST: 텍스트를 임베딩으로 변환
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text, texts } = body

    if (!text && !texts) {
      return NextResponse.json(
        { error: 'Either text or texts is required' },
        { status: 400 }
      )
    }

    if (text) {
      // 단일 텍스트 임베딩
      const embedding = await generateEmbedding(text)
      return NextResponse.json({ embedding, dimension: embedding.length })
    } else {
      // 여러 텍스트 임베딩
      const embeddings = await generateEmbeddings(texts)
      return NextResponse.json({
        embeddings,
        count: embeddings.length,
        dimension: embeddings[0]?.length || 0,
      })
    }
  } catch (error) {
    console.error('Error generating embeddings:', error)
    return NextResponse.json(
      { error: 'Failed to generate embeddings' },
      { status: 500 }
    )
  }
}

