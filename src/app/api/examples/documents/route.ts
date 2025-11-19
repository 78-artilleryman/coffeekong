import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET: 문서 목록 조회
export async function GET(request: NextRequest) {
  try {
    const documents = await prisma.document.findMany({
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({ documents })
  } catch (error) {
    console.error('Error fetching documents:', error)
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    )
  }
}

// POST: 새 문서 생성 (벡터 임베딩 포함)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { content, metadata } = body

    if (!content) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      )
    }

    // 실제 사용시에는 OpenAI 등의 서비스를 사용하여 임베딩을 생성해야 합니다
    // 여기서는 예시로 더미 임베딩을 사용합니다
    // const embedding = await generateEmbedding(content) // 실제 구현 필요

    const document = await prisma.document.create({
      data: {
        content,
        metadata: metadata || {},
        // embedding: embedding, // 실제 임베딩 데이터
      },
    })

    return NextResponse.json({ document }, { status: 201 })
  } catch (error) {
    console.error('Error creating document:', error)
    return NextResponse.json(
      { error: 'Failed to create document' },
      { status: 500 }
    )
  }
}

