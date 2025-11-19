import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST: 벡터 유사도 검색
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, limit = 5 } = body

    if (!query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    // 실제 사용시에는 쿼리를 임베딩으로 변환해야 합니다
    // const queryEmbedding = await generateEmbedding(query)

    // pgvector를 사용한 유사도 검색
    // Prisma에서는 raw query를 사용해야 합니다
    const documents = await prisma.$queryRaw`
      SELECT 
        id,
        content,
        metadata,
        embedding <-> ${[/* queryEmbedding */]}::vector AS distance
      FROM documents
      WHERE embedding IS NOT NULL
      ORDER BY distance
      LIMIT ${limit}
    `

    return NextResponse.json({ documents })
  } catch (error) {
    console.error('Error searching documents:', error)
    return NextResponse.json(
      { error: 'Failed to search documents' },
      { status: 500 }
    )
  }
}

