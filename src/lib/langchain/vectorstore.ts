import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase'
import { OpenAIEmbeddings } from '@langchain/openai'
import { createClient } from '@supabase/supabase-js'
import { Document } from '@langchain/core/documents'

// Supabase 클라이언트 생성 (서버 사이드에서만 사용)
const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// OpenAI 임베딩
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'text-embedding-3-small',
})

// Supabase Vector Store 초기화
export async function getVectorStore() {
  return await SupabaseVectorStore.fromExistingIndex(embeddings, {
    client: supabaseClient,
    tableName: 'documents',
    queryName: 'match_documents', // Supabase에서 생성해야 하는 함수
  })
}

// 문서 추가
export async function addDocuments(docs: Document[]) {
  const vectorStore = await getVectorStore()
  await vectorStore.addDocuments(docs)
}

// 유사도 검색
export async function similaritySearch(query: string, k: number = 5) {
  const vectorStore = await getVectorStore()
  const results = await vectorStore.similaritySearch(query, k)
  return results
}

// 유사도 검색 with 스코어
export async function similaritySearchWithScore(query: string, k: number = 5) {
  const vectorStore = await getVectorStore()
  const results = await vectorStore.similaritySearchWithScore(query, k)
  return results
}

