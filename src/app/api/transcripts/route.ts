import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: 전사본 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    const transcripts = await prisma.transcripts.findMany({
      take: limit,
      skip: offset,
      orderBy: {
        created_at: "desc",
      },
      include: {
        sources: {
          select: {
            id: true,
            title: true,
            source_type: true,
            mime_type: true,
            duration_sec: true,
            created_at: true,
            tags: true,
          },
        },
        _count: {
          select: {
            transcript_segments: true,
            chunks: true,
          },
        },
      },
    });

    // BigInt를 문자열로 변환
    const serialized = transcripts.map((t) => ({
      id: t.id.toString(),
      sourceId: t.source_id.toString(),
      model: t.model,
      language: t.language,
      textPreview: t.text_full.substring(0, 200) + "...",
      textLength: t.text_full.length,
      wordCount: t.wc_count,
      createdAt: t.created_at,
      source: {
        ...t.sources,
        id: t.sources.id.toString(),
      },
      segmentCount: t._count.transcript_segments,
      chunkCount: t._count.chunks,
    }));

    return NextResponse.json({
      transcripts: serialized,
      pagination: {
        limit,
        offset,
        total: serialized.length,
      },
    });
  } catch (error) {
    console.error("전사본 조회 오류:", error);
    return NextResponse.json({ error: "전사본 조회 실패" }, { status: 500 });
  }
}
