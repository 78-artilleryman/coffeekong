import { ChatOpenAI } from '@langchain/openai'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'

// OpenAI Chat 모델 초기화
export const chatModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-4o-mini', // 또는 'gpt-4', 'gpt-4o' 등
  temperature: 0.7,
})

// 간단한 채팅 체인
export async function simpleChat(userMessage: string) {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a helpful assistant.'],
    ['user', '{input}'],
  ])

  const chain = prompt.pipe(chatModel).pipe(new StringOutputParser())

  const response = await chain.invoke({
    input: userMessage,
  })

  return response
}

// RAG 체인 (Retrieval-Augmented Generation)
export async function ragChat(question: string, context: string) {
  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      'You are a helpful assistant. Use the following context to answer the question. If you cannot find the answer in the context, say so.\n\nContext: {context}',
    ],
    ['user', '{question}'],
  ])

  const chain = prompt.pipe(chatModel).pipe(new StringOutputParser())

  const response = await chain.invoke({
    context,
    question,
  })

  return response
}

