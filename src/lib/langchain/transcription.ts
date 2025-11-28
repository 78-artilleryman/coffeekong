import { StateGraph, START, END } from "@langchain/langgraph";
import { OpenAI } from "openai";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// 전사 워크플로우 상태 정의
export interface TranscriptionState {
  // 입력
  audioFile: Buffer;
  fileName: string;
  mimeType: string;
  userId?: string;
  tags?: string[];

  // 중간 처리
  sourceId?: bigint;
  storagePath?: string;
  checksum?: string;

  // Whisper AI 결과
  transcriptText?: string;
  language?: string;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;

  // 최종 결과
  transcriptId?: bigint;
  error?: string;
}

// OpenAI 클라이언트 (Whisper 사용)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 1. 파일 저장 및 source 생성
async function saveSourceFile(
  state: TranscriptionState
): Promise<Partial<TranscriptionState>> {
  try {
    // 체크섬 생성
    const checksum = crypto
      .createHash("sha256")
      .update(state.audioFile)
      .digest("hex");

    // 파일 크기
    const sizeBytes = BigInt(state.audioFile.length);

    // 저장 경로 생성 (실제로는 S3나 Supabase Storage 사용)
    const timestamp = Date.now();
    const storagePath = `audio/${timestamp}-${state.fileName}`;

    // TODO: 실제 파일 스토리지에 저장
    // await uploadToStorage(storagePath, state.audioFile);

    // DB에 source 레코드 생성
    const source = await prisma.sources.create({
      data: {
        source_type: "audio",
        title: state.fileName,
        mime_type: state.mimeType,
        size_bytes: sizeBytes,
        checksum_sha256: checksum,
        storage_path: storagePath,
        created_by: state.userId || null,
        tags: state.tags || [],
      },
    });

    console.log(`✅ Source 생성 완료: ID ${source.id}`);

    return {
      sourceId: source.id,
      storagePath,
      checksum,
    };
  } catch (error) {
    console.error("파일 저장 오류:", error);
    return {
      error: `파일 저장 실패: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

// 2. Whisper AI로 전사
async function transcribeAudio(
  state: TranscriptionState
): Promise<Partial<TranscriptionState>> {
  try {
    if (!state.audioFile) {
      throw new Error("오디오 파일이 없습니다");
    }

    console.log(`🎤 Whisper AI 전사 시작...`);

    // Buffer를 Uint8Array로 변환한 후 File 생성
    const uint8Array = new Uint8Array(state.audioFile);
    const file = new File([uint8Array], state.fileName, {
      type: state.mimeType,
    });

    // Whisper API 호출 (세그먼트 포함)
    const response = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    console.log(`✅ Whisper AI 전사 완료`);
    console.log(`  - 언어: ${response.language}`);
    console.log(`  - 텍스트 길이: ${response.text.length}자`);

    // 세그먼트 변환
    const segments =
      response.segments?.map((seg) => ({
        id: seg.id,
        start: seg.start,
        end: seg.end,
        text: seg.text,
      })) || [];

    return {
      transcriptText: response.text,
      language: response.language,
      segments,
    };
  } catch (error) {
    console.error("Whisper 전사 오류:", error);
    return {
      error: `전사 실패: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

// 3. 전사본 저장
async function saveTranscript(
  state: TranscriptionState
): Promise<Partial<TranscriptionState>> {
  try {
    if (!state.sourceId || !state.transcriptText) {
      throw new Error("필수 데이터가 없습니다");
    }

    console.log(`💾 전사본 저장 중...`);

    // 단어 수 계산
    const wcCount = state.transcriptText.split(/\s+/).length;

    // transcripts 테이블에 저장
    const transcript = await prisma.transcripts.create({
      data: {
        source_id: state.sourceId,
        model: "whisper-1",
        language: state.language || null,
        text_full: state.transcriptText,
        wc_count: wcCount,
        segments: state.segments || undefined,
      },
    });

    // 세그먼트 저장 (별도 테이블)
    if (state.segments && state.segments.length > 0) {
      await prisma.transcript_segments.createMany({
        data: state.segments.map((seg) => ({
          transcript_id: transcript.id,
          idx: seg.id,
          start_ms: Math.round(seg.start * 1000),
          end_ms: Math.round(seg.end * 1000),
          text: seg.text,
        })),
      });
      console.log(`✅ ${state.segments.length}개 세그먼트 저장 완료`);
    }

    console.log(`✅ 전사본 저장 완료: ID ${transcript.id}`);

    return {
      transcriptId: transcript.id,
    };
  } catch (error) {
    console.error("전사본 저장 오류:", error);
    return {
      error: `저장 실패: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

// 4. 청크 생성 (RAG용)
async function createChunks(
  state: TranscriptionState
): Promise<Partial<TranscriptionState>> {
  try {
    if (!state.sourceId || !state.transcriptText || !state.transcriptId) {
      throw new Error("필수 데이터가 없습니다");
    }

    console.log(`📦 텍스트 청크 생성 중...`);

    // 간단한 청크 분할 (1000자 단위)
    const chunkSize = 1000;
    const chunks: string[] = [];

    for (let i = 0; i < state.transcriptText.length; i += chunkSize) {
      chunks.push(state.transcriptText.slice(i, i + chunkSize));
    }

    // DB에 청크 저장
    for (let i = 0; i < chunks.length; i++) {
      await prisma.chunks.create({
        data: {
          source_id: state.sourceId,
          transcript_id: state.transcriptId,
          chunk_index: i,
          content: chunks[i],
          content_tokens: Math.ceil(chunks[i].length / 4), // 대략적인 토큰 수
          lang: state.language || null,
        },
      });
    }

    console.log(`✅ ${chunks.length}개 청크 생성 완료`);

    return {};
  } catch (error) {
    console.error("청크 생성 오류:", error);
    return {
      error: `청크 생성 실패: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

// LangGraph 워크플로우 생성
export function createTranscriptionGraph() {
  const workflow = new StateGraph<TranscriptionState>({
    channels: {
      audioFile: null,
      fileName: null,
      mimeType: null,
      userId: null,
      tags: null,
      sourceId: null,
      storagePath: null,
      checksum: null,
      transcriptText: null,
      language: null,
      segments: null,
      transcriptId: null,
      error: null,
    },
  });

  // 노드 추가
  workflow.addNode("saveSource", saveSourceFile);
  workflow.addNode("transcribe", transcribeAudio);
  workflow.addNode("saveTranscript", saveTranscript);
  workflow.addNode("createChunks", createChunks);

  // 엣지 추가 (순차 실행)
  // @ts-expect-error - LangGraph 타입 이슈
  workflow.addEdge(START, "saveSource");
  // @ts-expect-error - LangGraph 타입 이슈
  workflow.addEdge("saveSource", "transcribe");
  // @ts-expect-error - LangGraph 타입 이슈
  workflow.addEdge("transcribe", "saveTranscript");
  // @ts-expect-error - LangGraph 타입 이슈
  workflow.addEdge("saveTranscript", "createChunks");
  // @ts-expect-error - LangGraph 타입 이슈
  workflow.addEdge("createChunks", END);

  return workflow.compile();
}

// 간편 사용 함수
export async function transcribeAudioFile(
  audioFile: Buffer,
  fileName: string,
  mimeType: string,
  userId?: string,
  tags?: string[]
) {
  const graph = createTranscriptionGraph();

  const result = await graph.invoke({
    audioFile,
    fileName,
    mimeType,
    userId,
    tags,
  });

  if (result.error) {
    throw new Error(String(result.error));
  }

  return {
    sourceId: result.sourceId,
    transcriptId: result.transcriptId,
    text: result.transcriptText,
    language: result.language,
    segments: result.segments,
  };
}
