// LangGraph를 사용한 전사 워크플로우
import { StateGraph, Annotation } from "@langchain/langgraph";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const ASSEMBLYAI_API_URL = "https://api.assemblyai.com/v2";

// LangGraph 상태 정의 (Annotation 사용)
const TranscriptionState = Annotation.Root({
  audioFile: Annotation<Buffer>(),
  fileName: Annotation<string>(),
  mimeType: Annotation<string>(),
  userId: Annotation<string | undefined>(),
  tags: Annotation<string[] | undefined>(),
  speakerCount: Annotation<number | undefined>(),
  sourceId: Annotation<bigint | undefined>(),
  audioUrl: Annotation<string | undefined>(),
  transcriptId: Annotation<string | undefined>(),
  transcriptResult: Annotation<AssemblyAIResponse | undefined>(),
  savedTranscriptId: Annotation<bigint | undefined>(),
  finalResult: Annotation<
    | {
        sourceId: bigint;
        transcriptId: bigint;
        text: string;
        language: string;
        segments: Array<{
          id: number;
          start: number;
          end: number;
          text: string;
          speaker: string;
        }>;
        speakerCount: number;
      }
    | undefined
  >(),
  error: Annotation<string | undefined>(),
});

type TranscriptionWorkflowState = typeof TranscriptionState.State;

interface AssemblyAIUtterance {
  start: number;
  end: number;
  text: string;
  speaker: string;
}

interface AssemblyAIResponse {
  id: string;
  status: string;
  text: string;
  language_code: string;
  error?: string;
  utterances?: AssemblyAIUtterance[];
}

// 1. Source 생성 단계 (LangGraph 노드)
async function createSourceStep(
  state: TranscriptionWorkflowState
): Promise<Partial<TranscriptionWorkflowState>> {
  console.log(`📦 Source 생성 중...`);

  const checksum = crypto
    .createHash("sha256")
    .update(state.audioFile)
    .digest("hex");
  const sizeBytes = BigInt(state.audioFile.length);
  const timestamp = Date.now();
  const storagePath = `audio/${timestamp}-${state.fileName}`;

  // 기존 파일 확인
  const existingSource = await prisma.sources.findUnique({
    where: { checksum_sha256: checksum },
  });

  if (existingSource) {
    console.log(`♻️ 기존 Source 재사용: ID ${existingSource.id}`);
    return { sourceId: existingSource.id };
  }

  // 새로 생성
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
  return { sourceId: source.id };
}

// 2. AssemblyAI에 파일 업로드 단계
async function uploadAudioStep(
  state: TranscriptionWorkflowState
): Promise<Partial<TranscriptionWorkflowState>> {
  console.log(`📤 AssemblyAI에 파일 업로드 중...`);

  const uint8Array = new Uint8Array(state.audioFile);

  const response = await fetch(`${ASSEMBLYAI_API_URL}/upload`, {
    method: "POST",
    headers: {
      authorization: ASSEMBLYAI_API_KEY!,
      "Content-Type": "application/octet-stream",
    },
    body: uint8Array,
  });

  if (!response.ok) {
    throw new Error(`파일 업로드 실패: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`✅ 파일 업로드 완료: ${data.upload_url}`);
  return { audioUrl: data.upload_url };
}

// 3. 전사 요청 단계
async function createTranscriptStep(
  state: TranscriptionWorkflowState
): Promise<Partial<TranscriptionWorkflowState>> {
  console.log(
    `🎤 전사 요청 중... (화자 분리: ${
      state.speakerCount ? "활성화" : "비활성화"
    })`
  );

  const response = await fetch(`${ASSEMBLYAI_API_URL}/transcript`, {
    method: "POST",
    headers: {
      authorization: ASSEMBLYAI_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: state.audioUrl,
      speaker_labels: state.speakerCount ? true : false,
      speakers_expected: state.speakerCount,
      language_code: "ko",
    }),
  });

  if (!response.ok) {
    throw new Error(`전사 요청 실패: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`✅ 전사 요청 완료: ${data.id}`);
  return { transcriptId: data.id };
}

// 4. 전사 결과 폴링 단계
async function pollTranscriptStep(
  state: TranscriptionWorkflowState
): Promise<Partial<TranscriptionWorkflowState>> {
  console.log(`⏳ 전사 결과 대기 중...`);

  while (true) {
    const response = await fetch(
      `${ASSEMBLYAI_API_URL}/transcript/${state.transcriptId}`,
      {
        headers: {
          authorization: ASSEMBLYAI_API_KEY!,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`전사 결과 조회 실패: ${response.statusText}`);
    }

    const data = (await response.json()) as AssemblyAIResponse;

    if (data.status === "completed") {
      console.log(`✅ 전사 완료!`);
      return { transcriptResult: data };
    } else if (data.status === "error") {
      throw new Error(`전사 실패: ${data.error}`);
    }

    // 2초마다 확인
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

// 5. DB에 저장 단계
async function saveTranscriptStep(
  state: TranscriptionWorkflowState
): Promise<Partial<TranscriptionWorkflowState>> {
  console.log(`💾 전사본 저장 중...`);

  if (!state.transcriptResult || !state.sourceId) {
    throw new Error("전사 결과 또는 Source ID가 없습니다");
  }

  const text = state.transcriptResult.text;
  const language = state.transcriptResult.language_code || "ko";
  const wcCount = text.split(/\s+/).length;

  const utterances = state.transcriptResult.utterances || [];
  const speakers: string[] = utterances.length
    ? Array.from(new Set(utterances.map((u: AssemblyAIUtterance) => u.speaker)))
    : [];

  const diarization = speakers.length
    ? {
        method: "assemblyai",
        speakers: speakers,
        utterances: utterances.length,
      }
    : undefined;

  // 전사본 생성
  const transcript = await prisma.transcripts.create({
    data: {
      source_id: state.sourceId,
      model: "assemblyai-best",
      language: language,
      text_full: text,
      wc_count: wcCount,
      diarization: diarization,
    },
  });

  // 세그먼트 저장
  if (utterances.length > 0) {
    await prisma.transcript_segments.createMany({
      data: utterances.map((utterance: AssemblyAIUtterance, idx: number) => ({
        transcript_id: transcript.id,
        idx: idx,
        start_ms: utterance.start,
        end_ms: utterance.end,
        text: utterance.text,
        speaker_label: utterance.speaker,
      })),
    });
    console.log(
      `✅ ${utterances.length}개 세그먼트 저장 완료 (화자 정보 포함)`
    );
  }

  console.log(`✅ 전사본 저장 완료: ID ${transcript.id}`);
  return { savedTranscriptId: transcript.id };
}

// 6. 청크 생성 단계
async function createChunksStep(
  state: TranscriptionWorkflowState
): Promise<Partial<TranscriptionWorkflowState>> {
  console.log(`📦 텍스트 청크 생성 중...`);

  if (!state.transcriptResult || !state.sourceId || !state.savedTranscriptId) {
    throw new Error("필수 데이터가 없습니다");
  }

  const text = state.transcriptResult.text;
  const language = state.transcriptResult.language_code || "ko";
  const chunkSize = 1000;
  const chunks: string[] = [];

  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  await prisma.chunks.createMany({
    data: chunks.map((chunk, i) => ({
      source_id: state.sourceId!,
      transcript_id: state.savedTranscriptId!,
      chunk_index: i,
      content: chunk,
      content_tokens: Math.ceil(chunk.length / 4),
      lang: language,
    })),
  });

  console.log(`✅ ${chunks.length}개 청크 생성 완료`);

  // 최종 결과 생성
  const utterances = state.transcriptResult.utterances || [];
  const segments = utterances.map((u: AssemblyAIUtterance, idx: number) => ({
    id: idx,
    start: u.start / 1000,
    end: u.end / 1000,
    text: u.text,
    speaker: u.speaker,
  }));

  const speakers = utterances.length
    ? Array.from(new Set(utterances.map((u: AssemblyAIUtterance) => u.speaker)))
    : [];

  return {
    finalResult: {
      sourceId: state.sourceId,
      transcriptId: state.savedTranscriptId,
      text: text,
      language: language,
      segments,
      speakerCount: speakers.length,
    },
  };
}

// LangGraph 워크플로우 생성
function createTranscriptionGraph() {
  const workflow = new StateGraph(TranscriptionState);

  // 노드 추가
  workflow.addNode("createSource", createSourceStep);
  workflow.addNode("uploadAudio", uploadAudioStep);
  workflow.addNode("createTranscript", createTranscriptStep);
  workflow.addNode("pollTranscript", pollTranscriptStep);
  workflow.addNode("saveTranscript", saveTranscriptStep);
  workflow.addNode("createChunks", createChunksStep);

  // 엣지 추가 - 순차 실행
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("__start__", "createSource");
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("createSource", "uploadAudio");
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("uploadAudio", "createTranscript");
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("createTranscript", "pollTranscript");
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("pollTranscript", "saveTranscript");
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("saveTranscript", "createChunks");
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("createChunks", "__end__");

  return workflow.compile();
}

// 전사 워크플로우 반환 타입
export type TranscriptionResult = {
  sourceId: bigint;
  transcriptId: bigint;
  text: string;
  language: string;
  segments: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
    speaker: string;
  }>;
  speakerCount: number;
};

// LangGraph를 사용한 전사 워크플로우
export async function runTranscriptionWorkflow(
  audioFile: Buffer,
  fileName: string,
  mimeType: string,
  userId?: string,
  tags?: string[],
  speakerCount?: number
): Promise<TranscriptionResult> {
  console.log(`🚀 LangGraph로 전사 워크플로우 시작...`);

  const graph = createTranscriptionGraph();

  const initialState: Partial<TranscriptionWorkflowState> = {
    audioFile,
    fileName,
    mimeType,
    userId,
    tags,
    speakerCount,
  };

  try {
    const result = await graph.invoke(initialState);
    console.log(`✅ 전사 워크플로우 완료!`);

    if (!result.finalResult) {
      throw new Error("전사 결과를 생성할 수 없습니다");
    }

    return result.finalResult;
  } catch (error) {
    console.error("전사 워크플로우 오류:", error);
    throw error;
  }
}
