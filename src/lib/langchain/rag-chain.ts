// LangGraph를 사용한 RAG 질의응답 워크플로우
import { StateGraph, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { prisma } from "@/lib/prisma";

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

// LangGraph 상태 정의
const RAGState = Annotation.Root({
  transcriptId: Annotation<bigint>(),
  question: Annotation<string>(),
  history: Annotation<Array<{ role: string; content: string }>>(),
  useWebSearch: Annotation<boolean>(),
  context: Annotation<
    | {
        transcriptText: string;
        title: string;
        systemPrompt: string;
      }
    | undefined
  >(),
  answer: Annotation<string | undefined>(),
  error: Annotation<string | undefined>(),
});

type RAGWorkflowState = typeof RAGState.State;

// LangGraph 노드 1: 전사본 컨텍스트 준비
async function retrieveContextStep(
  state: RAGWorkflowState
): Promise<Partial<RAGWorkflowState>> {
  console.log(`📖 전사본 컨텍스트 준비 중...`);

  const transcript = await prisma.transcripts.findUnique({
    where: { id: state.transcriptId },
    include: {
      sources: {
        select: {
          title: true,
        },
      },
    },
  });

  if (!transcript) {
    return { error: "전사본을 찾을 수 없습니다" };
  }

  const fullText = transcript.text_full;
  const title = transcript.sources?.title || "전사본";

  // 문자 제한 (50000자)
  const MAX_CHARS = 50000;
  const truncatedText =
    fullText.length > MAX_CHARS
      ? fullText.substring(0, MAX_CHARS) + "..."
      : fullText;

  let systemPrompt: string;
  if (state.useWebSearch) {
    // 하이브리드 모드 시스템 프롬프트
    systemPrompt = `당신은 음성 전사본 분석과 인터넷 검색을 결합하는 AI 어시스턴트입니다.

전사본 제목: ${title}
전사본 내용:
"""
${truncatedText}
"""

사용자의 질문에 답할 때:
1. 먼저 전사본 내용을 확인하여 관련 정보를 찾으세요
2. 전사본에 부족한 부분이나 최신 정보가 필요하면 인터넷 검색을 활용하세요
3. 전사본 내용과 인터넷 정보를 구분하여 답변하세요 (예: "전사본에서는...", "최신 정보에 따르면...")
4. 한국어로 답변하세요`;
  } else {
    // 전사본 전용 모드 시스템 프롬프트
    systemPrompt = `당신은 음성 전사본 내용을 분석하는 AI 어시스턴트입니다.

전사본 제목: ${title}
전사본 내용:
"""
${truncatedText}
"""

위 전사본의 내용을 바탕으로 사용자의 질문에 정확하고 상세하게 답변해주세요.
- 전사본에 없는 내용은 추측하지 말고 "전사본에 해당 정보가 없습니다"라고 답변하세요.
- 답변할 때는 전사본의 어느 부분에서 찾았는지 간단히 언급하면 좋습니다.
- 한국어로 답변하세요.`;
  }

  return {
    context: {
      transcriptText: truncatedText,
      title,
      systemPrompt,
    },
  };
}

// LangGraph 노드 2: OpenAI로 답변 생성
async function generateWithOpenAIStep(
  state: RAGWorkflowState
): Promise<Partial<RAGWorkflowState>> {
  console.log(`📄 OpenAI GPT 전사본 전용 모드...`);

  if (!state.context) {
    return { error: "컨텍스트가 준비되지 않았습니다" };
  }

  // 대화 이력을 LangChain 메시지 형식으로 변환
  const langchainHistory = state.history.slice(-5).map((msg) => {
    if (msg.role === "user") {
      return { role: "user" as const, content: msg.content };
    } else {
      return { role: "assistant" as const, content: msg.content };
    }
  });

  // 이전 대화가 있으면 프롬프트에 포함
  let userQuestion = state.question;
  if (langchainHistory.length > 0) {
    const historyText = langchainHistory
      .map((msg) => `${msg.role === "user" ? "사용자" : "AI"}: ${msg.content}`)
      .join("\n");
    userQuestion = `이전 대화:
${historyText}

사용자 질문: ${state.question}`;
  }

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", state.context.systemPrompt],
    new MessagesPlaceholder("history"),
    ["user", "{question}"],
  ]);

  const model = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-4o-mini",
    temperature: 0.7,
  });

  const outputParser = new StringOutputParser();
  const chain = RunnableSequence.from([prompt, model, outputParser]);

  const answer = await chain.invoke({
    question: userQuestion,
    history: [],
  });

  console.log(`✅ GPT 응답: ${answer.substring(0, 50)}...`);
  return { answer };
}

// LangGraph 노드 3: Perplexity로 답변 생성
async function generateWithPerplexityStep(
  state: RAGWorkflowState
): Promise<Partial<RAGWorkflowState>> {
  console.log(`🌐 Perplexity 하이브리드 모드...`);

  if (!state.context) {
    return { error: "컨텍스트가 준비되지 않았습니다" };
  }

  if (!PERPLEXITY_API_KEY) {
    return { error: "Perplexity API 키가 설정되지 않았습니다" };
  }

  // 대화 이력 구성
  const conversationHistory = state.history.slice(-5).map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  const messages = [
    { role: "system", content: state.context.systemPrompt },
    ...conversationHistory,
    { role: "user", content: state.question },
  ];

  const response = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: "sonar",
      messages: messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Perplexity API 에러 상세:", errorData);
    return {
      error: `Perplexity API 오류: ${response.statusText}`,
    };
  }

  const data = await response.json();
  const answer = data.choices[0].message.content;

  console.log(`✅ Perplexity 응답: ${answer.substring(0, 50)}...`);
  return { answer };
}

// 라우터 함수 (조건부 분기)
function routeByWebSearch(state: RAGWorkflowState): string {
  if (state.error) {
    return "__end__";
  }
  return state.useWebSearch ? "perplexity" : "openai";
}

// LangGraph 워크플로우 생성
function createRAGGraph() {
  const workflow = new StateGraph(RAGState);

  // 노드 추가
  workflow.addNode("retrieveContext", retrieveContextStep);
  workflow.addNode("openai", generateWithOpenAIStep);
  workflow.addNode("perplexity", generateWithPerplexityStep);

  // 엣지 추가
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("__start__", "retrieveContext");

  // 조건부 분기: 웹 검색 여부에 따라 분기
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addConditionalEdges("retrieveContext", routeByWebSearch, {
    openai: "openai",
    perplexity: "perplexity",
    __end__: "__end__",
  });

  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("openai", "__end__");
  // @ts-expect-error - LangGraph 타입 시스템의 복잡성으로 인한 타입 오류
  workflow.addEdge("perplexity", "__end__");

  return workflow.compile();
}

// LangGraph를 사용한 통합 RAG 실행 함수
export async function runRAG(
  transcriptId: bigint,
  question: string,
  history: Array<{ role: string; content: string }> = [],
  useWebSearch: boolean = false
): Promise<string> {
  console.log(
    `💬 LangGraph RAG 실행: ${question.substring(
      0,
      50
    )}... (웹 검색: ${useWebSearch})`
  );

  const graph = createRAGGraph();

  const initialState: Partial<RAGWorkflowState> = {
    transcriptId,
    question,
    history,
    useWebSearch,
  };

  try {
    const result = await graph.invoke(initialState);
    if (result.error) {
      throw new Error(result.error);
    }
    if (!result.answer) {
      throw new Error("답변을 생성할 수 없습니다");
    }
    return result.answer;
  } catch (error) {
    console.error("RAG 워크플로우 오류:", error);
    throw error;
  }
}
