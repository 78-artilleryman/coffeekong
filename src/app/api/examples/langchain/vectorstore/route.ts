import { NextRequest, NextResponse } from "next/server";
import { Document } from "@langchain/core/documents";
import {
  addDocuments,
  similaritySearch,
  similaritySearchWithScore,
} from "@/lib/langchain/vectorstore";

// POST: 문서 추가
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documents } = body;

    if (!documents || !Array.isArray(documents)) {
      return NextResponse.json(
        { error: "Documents array is required" },
        { status: 400 }
      );
    }

    const docs = documents.map(
      (doc) =>
        new Document({
          pageContent: doc.content,
          metadata: doc.metadata || {},
        })
    );

    await addDocuments(docs);

    return NextResponse.json({
      success: true,
      count: docs.length,
    });
  } catch (error) {
    console.error("Error adding documents:", error);
    return NextResponse.json(
      { error: "Failed to add documents" },
      { status: 500 }
    );
  }
}

// GET: 유사도 검색
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query");
    const k = parseInt(searchParams.get("k") || "5");
    const withScore = searchParams.get("withScore") === "true";

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter is required" },
        { status: 400 }
      );
    }

    let results;

    if (withScore) {
      results = await similaritySearchWithScore(query, k);
    } else {
      results = await similaritySearch(query, k);
    }

    return NextResponse.json({ results, count: results.length });
  } catch (error) {
    console.error("Error searching documents:", error);
    return NextResponse.json(
      { error: "Failed to search documents" },
      { status: 500 }
    );
  }
}
