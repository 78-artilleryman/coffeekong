import { StateGraph } from "@langchain/langgraph";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

// 그래프 상태 정의
interface GraphState {
  messages: BaseMessage[];
  context?: string;
}

// LangGraph 예시: 간단한 대화 흐름
export function createConversationGraph() {
  const model = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-4o-mini",
  });

  // 노드 함수들
  async function callModel(state: GraphState): Promise<Partial<GraphState>> {
    const response = await model.invoke(state.messages);
    return {
      messages: [...state.messages, response],
    };
  }

  // 그래프 빌드
  const workflow = new StateGraph<GraphState>({
    channels: {
      messages: {
        value: (prev: BaseMessage[], next: BaseMessage[]) => [...prev, ...next],
        default: () => [],
      },
      context: {
        value: (prev?: string, next?: string) => next ?? prev,
        default: () => undefined,
      },
    },
  });

  // 노드 추가
  workflow.addNode("model", callModel);

  // 엣지 추가
  // workflow.addEdge(START, "model");
  // workflow.addEdge("model", END);

  // 컴파일
  return workflow.compile();
}

// RAG 그래프 예시
export function createRAGGraph() {
  const model = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-4o-mini",
  });

  // 검색 노드
  async function retrieve(): Promise<Partial<GraphState>> {
    // 여기서 벡터 검색을 수행
    // const results = await similaritySearch(lastMessage)
    const context = "검색된 컨텍스트...";
    return { context };
  }

  // 생성 노드
  async function generate(state: GraphState): Promise<Partial<GraphState>> {
    const systemMessage = `다음 컨텍스트를 사용하여 질문에 답하세요:\n\n${
      state.context || ""
    }`;
    const messages = [new HumanMessage(systemMessage), ...state.messages];

    const response = await model.invoke(messages);
    return {
      messages: [...state.messages, response],
    };
  }

  // 그래프 빌드
  const workflow = new StateGraph<GraphState>({
    channels: {
      messages: {
        value: (prev: BaseMessage[], next: BaseMessage[]) => [...prev, ...next],
        default: () => [],
      },
      context: {
        value: (prev?: string, next?: string) => next ?? prev,
        default: () => undefined,
      },
    },
  });

  workflow.addNode("retrieve", retrieve);
  workflow.addNode("generate", generate);

  // workflow.addEdge(START, "retrieve");
  // workflow.addEdge("retrieve", "generate");
  // workflow.addEdge("generate", END);

  return workflow.compile();
}
