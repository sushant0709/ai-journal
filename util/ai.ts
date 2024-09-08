import { ChatOpenAI } from '@langchain/openai'
import { PromptTemplate } from '@langchain/core/prompts'
import { loadQARefineChain } from 'langchain/chains'
import { MemoryVectorStore } from 'langchain/vectorstores/memory'
import { OpenAIEmbeddings } from '@langchain/openai'
import { RunnableSequence } from '@langchain/core/runnables'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { ZodSchema, z } from 'zod'

import {
  StructuredOutputParser,
  OutputFixingParser,
} from 'langchain/output_parsers'
import { Document } from 'langchain/document'

// Date parsing function
const parseDate = (dateString) => {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (dateString.toLowerCase() === 'today') return today
  if (dateString.toLowerCase() === 'yesterday') return yesterday

  // Add more date parsing logic as needed
  return new Date(dateString)
}

// Zod schema for structured output
const AnswerSchema = z.object({
  answer: z.string(),
  relevantDates: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

const parser = StructuredOutputParser.fromZodSchema(
  z.object({
    mood: z
      .string()
      .describe('the mood of the person who wrote the journal entry.'),
    subject: z.string().describe('the subject of the journal entry.'),
    negative: z
      .boolean()
      .describe(
        'is the journal entry negative? (i.e. does it contain negative emotions?).'
      ),
    summary: z.string().describe('quick summary of the entire entry.'),
    color: z
      .string()
      .describe(
        'a hexidecimal color code that represents the mood of the entry. Example #0101fe for blue representing happiness.'
      ),
    sentimentScore: z
      .number()
      .describe(
        'sentiment of the text and rated on a scale from -10 to 10, where -10 is extremely negative, 0 is neutral, and 10 is extremely positive.'
      ),
  })
)

const getPrompt = async (content) => {
  const format_instructions = parser.getFormatInstructions()

  const prompt = new PromptTemplate({
    template:
      'Analyze the following journal entry. Follow the intrusctions and format your response to match the format instructions, no matter what! \n{format_instructions}\n{entry}',
    inputVariables: ['entry'],
    partialVariables: { format_instructions },
  })

  const input = await prompt.format({
    entry: content,
  })
  return input
}

export const analyzeEntry = async (entry) => {
  const input = await getPrompt(entry.content)
  const model = new ChatOpenAI({ temperature: 0, modelName: 'gpt-3.5-turbo' })
  const output = await model.invoke(input)

  try {
    return parser.parse(output.content)
  } catch (e) {
    const fixParser = OutputFixingParser.fromLLM(
      new ChatOpenAI({ temperature: 0, modelName: 'gpt-3.5-turbo' }),
      parser
    )
    const fix = await fixParser.parse(output.content)
    return fix
  }
}

export const qa = async (question, entries) => {
  // Sort entries by date, most recent first
  const sortedEntries = entries.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  )

  // Create documents with enhanced content
  const docs = sortedEntries.map((entry, index) => {
    if (typeof entry.content !== 'string') {
      console.error('Invalid entry content:', entry)
      return
    }
    const date = new Date(entry.createdAt)
    const formattedDate = date.toISOString().split('T')[0]
    const relativeDay =
      index === 0 ? 'today' : index === 1 ? 'yesterday' : `${index} days ago`
    const dayOfWeek = date.toLocaleString('en-us', { weekday: 'long' })

    return new Document({
      pageContent: `Date: ${formattedDate} (${relativeDay}, ${dayOfWeek})\n${entry.content}`,
      metadata: { date: formattedDate, relativeDay, dayOfWeek, id: entry.id },
    })
  })

  console.log('Docs:', docs)

  // Create embeddings and vector store
  const embeddings = new OpenAIEmbeddings()
  const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings)

  // Create the language model
  const model = new ChatOpenAI({ temperature: 0, modelName: 'gpt-4' })

  // Create a prompt template for the QA system
  const promptTemplate = PromptTemplate.fromTemplate(`
You are an AI assistant helping a user with their journal entries. 
Answer the question based on the following context. If the question is about a specific date or time, pay close attention to the date information in the context.
If you don't know the answer or can't find relevant information in the context, simply state that you don't have enough information to answer accurately.

Context:
{context}

Current date: {current_date}
Question: {question}

Provide your answer in the following JSON format:
{{
  "answer": "Your detailed answer here",
  "relevantDates": ["YYYY-MM-DD", "YYYY-MM-DD"],
  "confidence": 0.9
}}
Note: Replace "Your detailed answer here" with your actual answer. The relevantDates array should contain any dates mentioned in your answer, and the confidence should be a number between 0 and 1 representing your confidence in the answer.
`)

  // Create a retriever
  const retriever = vectorStore.asRetriever({ k: 5 })

  // Create the chain - ensure each step is a function or a valid Runnable
  const chain = RunnableSequence.from([
    async ({ question, current_date }) => {
      // Step 1: Retrieve relevant documents and format context
      const relevantDocs = await retriever.invoke(question)
      const context = relevantDocs.map((doc) => doc.pageContent).join('\n\n')

      // Step 2: Use the prompt template
      return promptTemplate.invoke({
        context,
        question,
        current_date,
      })
    },
    model, // Step 3: Pass the generated prompt to the model
    new StringOutputParser(), // Step 4: Parse the model's output to string
    (output) => {
      // Step 5: Parse the output and return in JSON format
      try {
        const parsedOutput = JSON.parse(output)
        return AnswerSchema.parse(parsedOutput)
      } catch (error) {
        console.error('Error parsing model output:', error)
        return {
          answer:
            'I encountered an error while processing your question. Could you please rephrase it?',
          relevantDates: [],
          confidence: 0,
        }
      }
    },
  ])

  // Execute the chain by passing question and current date dynamically
  const response = await chain.invoke({
    question: String(question),
    current_date: new Date().toISOString().split('T')[0],
  })
  console.log('Response:', response)
  return response.answer
}
