import { OpenAIEmbeddings } from "@langchain/openai";

// OpenAI 임베딩 인스턴스 생성
export const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_EMBEDDING_KEY,
  modelName: "text-embedding-3-small",
});

// 텍스트를 임베딩으로 변환
export async function generateEmbedding(text: string): Promise<number[]> {
  const embedding = await embeddings.embedQuery(text);
  return embedding;
}

// 여러 텍스트를 한번에 임베딩
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results = await embeddings.embedDocuments(texts);
  return results;
}
