'use client'

import { askQuestion } from '@/util/api'
import { useState } from 'react'

const Question = () => {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!question.trim()) return // Prevent submission if question is empty

    setLoading(true)
    const { data } = await askQuestion(question)
    setAnswer(data)
    setLoading(false)
    // We're not clearing the question anymore: setQuestion('')
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex items-center space-x-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="flex-grow border border-gray-300 rounded-md p-2 text-lg"
          disabled={loading}
          placeholder="Need insights from your entries? Ask AI now!"
        />
        <button
          disabled={loading}
          type="submit"
          className="bg-blue-400 px-4 py-2 rounded-md text-white hover:bg-blue-500 transition-colors duration-200 whitespace-nowrap"
        >
          Ask
        </button>
      </form>
      {loading && <p>Loading...</p>}
      {answer && (
        <div className="my-4">
          <p className="text-xl">Answer: {answer}</p>
        </div>
      )}
    </div>
  )
}

export default Question
