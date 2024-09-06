import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import Page from '../app/page'

// Mock @clerk/nextjs/server for the auth function
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: 'user_2NNEqL2nrIRdJ194ndJqAHwEfxC' }),
}))

// Mock @clerk/nextjs for other Clerk functions
vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children }) => <div>{children}</div>,
  useUser: () => ({
    isSignedIn: true,
    user: {
      id: 'user_2NNEqL2nrIRdJ194ndJqAHwEfxC',
      fullName: 'Charles Harris',
    },
  }),
}))

vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'inter' }),
}))

test(`Home`, async () => {
  const PageComponent = await Page()
  render(PageComponent)
  expect(screen.getByText('The best Journal app, period.')).toBeTruthy()
})
