import { StateGraph, START, END } from "@langchain/langgraph";
import { OpenAI } from "openai";
import { ChatOpenAI } from "@langchain/openai";
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
    speaker?: string; // LLM이 추론한 화자
  }>;

  // 최종 결과
  transcriptId?: bigint;
  error?: string;
}

// OpenAI 클라이언트 (Whisper 사용)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ChatGPT 클라이언트 (화자 분리용)
const chatModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "gpt-4o-mini", // 빠르고 저렴
  temperature: 0, // 일관성 위해
});

// 1. 파일 저장 및 source 생성
async function saveSourceFile(
  state: TranscriptionState
): Promise<Partial<TranscriptionState>> {
  try {
    const checksum = crypto
      .createHash("sha256")
      .update(state.audioFile)
      .digest("hex");

    const sizeBytes = BigInt(state.audioFile.length);
    const timestamp = Date.now();
    const storagePath = `audio/${timestamp}-${state.fileName}`;

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

    // 세그먼트 변환 (화자 정보는 아직 없음)
    const segments =
      response.segments?.map(
        (seg: { id: number; start: number; end: number; text: string }) => ({
          id: seg.id,
          start: seg.start,
          end: seg.end,
          text: seg.text,
          speaker: undefined, // 나중에 LLM이 채워줌
        })
      ) || [];

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

// 3. 🤖 GPT로 화자 분리
async function identifySpeakersWithLLM(
  state: TranscriptionState
): Promise<Partial<TranscriptionState>> {
  try {
    if (!state.segments || state.segments.length === 0) {
      console.log("⚠️ 세그먼트가 없어 화자 분리 건너뜀");
      return {};
    }

    console.log(`🤖 GPT로 화자 분리 시작...`);

    // 세그먼트를 텍스트로 변환
    const segmentsText = state.segments
      .map((seg, idx) => `[${idx}] ${seg.text}`)
      .join("\n");

    // GPT에게 화자 분리 요청
    const prompt = `다음은 음성 전사 결과입니다. 각 문장의 화자를 구분해주세요.

규칙:
1. 화자는 A, B, C, D... 순서로 표시
2. 대화 패턴, 질문-답변 구조, 말투 등으로 판단
3. 이름이 언급되면 그것도 고려
4. 불확실하면 이전 화자 유지

전사 텍스트:
${segmentsText}

응답 형식 (JSON):
[
  {"index": 0, "speaker": "A"},
  {"index": 1, "speaker": "B"},
  ...
]

JSON만 반환하세요:`;

    const response = await chatModel.invoke(prompt);
    const content = response.content as string;

    // JSON 파싱
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("GPT 응답에서 JSON을 찾을 수 없습니다");
    }

    const speakerAssignments = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      speaker: string;
    }>;

    // 세그먼트에 화자 정보 추가
    const updatedSegments = state.segments.map((seg) => {
      const assignment = speakerAssignments.find((a) => a.index === seg.id);
      return {
        ...seg,
        speaker: assignment?.speaker || "Unknown",
      };
    });

    const speakerCount = new Set(updatedSegments.map((s) => s.speaker)).size;
    console.log(`✅ GPT 화자 분리 완료: ${speakerCount}명 감지`);

    return {
      segments: updatedSegments,
    };
  } catch (error) {
    console.error("GPT 화자 분리 오류:", error);
    // 에러가 나도 전사본은 저장하도록 (화자 정보 없이)
    console.log("⚠️ 화자 정보 없이 계속 진행");
    return {};
  }
}

// 4. 전사본 저장 (화자 정보 포함)
async function saveTranscript(
  state: TranscriptionState
): Promise<Partial<TranscriptionState>> {
  try {
    if (!state.sourceId || !state.transcriptText) {
      throw new Error("필수 데이터가 없습니다");
    }

    console.log(`💾 전사본 저장 중...`);

    const wcCount = state.transcriptText.split(/\s+/).length;

    // 화자별 발화 정보
    const speakers = state.segments?.length
      ? Array.from(
          new Set(
            state.segments
              .map((s) => s.speaker)
              .filter((speaker): speaker is string => speaker !== undefined)
          )
        )
      : [];

    const diarization = speakers.length
      ? {
          method: "llm", // GPT로 분석했음을 표시
          speakers: speakers,
          utterances: state.segments?.length || 0,
        }
      : undefined;

    const transcript = await prisma.transcripts.create({
      data: {
        source_id: state.sourceId,
        model: "whisper-1-with-gpt-diarization",
        language: state.language || null,
        text_full: state.transcriptText,
        wc_count: wcCount,
        segments: state.segments || undefined,
        diarization: diarization,
      },
    });

    // 세그먼트 저장 (화자 정보 포함!)
    if (state.segments && state.segments.length > 0) {
      await prisma.transcript_segments.createMany({
        data: state.segments.map((seg) => ({
          transcript_id: transcript.id,
          idx: seg.id,
          start_ms: Math.round(seg.start * 1000),
          end_ms: Math.round(seg.end * 1000),
          text: seg.text,
          speaker_label: seg.speaker || null, // 🎯 GPT가 추론한 화자!
        })),
      });
      console.log(
        `✅ ${state.segments.length}개 세그먼트 저장 완료 (GPT 화자 정보 포함)`
      );
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

// 5. 청크 생성
async function createChunks(
  state: TranscriptionState
): Promise<Partial<TranscriptionState>> {
  try {
    if (!state.sourceId || !state.transcriptText || !state.transcriptId) {
      throw new Error("필수 데이터가 없습니다");
    }

    console.log(`📦 텍스트 청크 생성 중...`);

    const chunkSize = 1000;
    const chunks: string[] = [];

    for (let i = 0; i < state.transcriptText.length; i += chunkSize) {
      chunks.push(state.transcriptText.slice(i, i + chunkSize));
    }

    for (let i = 0; i < chunks.length; i++) {
      await prisma.chunks.create({
        data: {
          source_id: state.sourceId,
          transcript_id: state.transcriptId,
          chunk_index: i,
          content: chunks[i],
          content_tokens: Math.ceil(chunks[i].length / 4),
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
export function createLLMDiarizationGraph() {
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
  workflow.addNode("identifySpeakers", identifySpeakersWithLLM); // 🆕 GPT 화자 분리
  workflow.addNode("saveTranscript", saveTranscript);
  workflow.addNode("createChunks", createChunks);

  // 엣지 추가 (순차 실행)
  // @ts-expect-error - LangGraph 타입 이슈
  workflow.addEdge(START, "saveSource");
  // @ts-expect-error - LangGraph 타입 이슈
  workflow.addEdge("saveSource", "transcribe");
  // @ts-expect-error - LangGraph 타입 이슈
  workflow.addEdge("transcribe", "identifySpeakers"); // Whisper → GPT
  // @ts-expect-error - LangGraph 타입 이슈
  workflow.addEdge("identifySpeakers", "saveTranscript");
  // @ts-expect-error - LangGraph 타입 이슈
  workflow.addEdge("saveTranscript", "createChunks");
  // @ts-expect-error - LangGraph 타입 이슈
  workflow.addEdge("createChunks", END);

  return workflow.compile();
}

// 간편 사용 함수
export async function transcribeWithLLMDiarization(
  audioFile: Buffer,
  fileName: string,
  mimeType: string,
  userId?: string,
  tags?: string[]
) {
  const graph = createLLMDiarizationGraph();

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

  const segments = result.segments || [];
  const speakers = Array.isArray(segments)
    ? segments
        .map((s: { speaker?: string }) => s.speaker)
        .filter((speaker): speaker is string => speaker !== undefined)
    : [];
  const speakerCount = new Set(speakers).size;

  return {
    sourceId: result.sourceId,
    transcriptId: result.transcriptId,
    text: result.transcriptText,
    language: result.language,
    segments: result.segments,
    speakerCount,
  };
}
