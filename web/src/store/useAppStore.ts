import { create } from 'zustand'

type User = {
  id: string
  name: string
  email: string
  phone?: string
  state?: string
  address?: string
}

type Task = {
  id: string
  type: 'RTI' | 'SCHOLARSHIP' | 'GENERIC'
  status: 'idle' | 'planning' | 'executing' | 'paused' | 'completed' | 'error'
  steps: any[]
  currentStep: number
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

type AppState = {
  user: User | null
  task: Task | null
  messages: Message[]
  isConnected: boolean
  setUser: (user: User | null) => void
  setTask: (task: Task | null) => void
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  clearMessages: () => void
  setConnected: (connected: boolean) => void
  updateTaskStatus: (status: Task['status']) => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  task: null,
  messages: [],
  isConnected: false,
  setUser: (user) => set({ user }),
  setTask: (task) => set({ task }),
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        },
      ],
    })),
  clearMessages: () => set({ messages: [] }),
  setConnected: (isConnected) => set({ isConnected }),
  updateTaskStatus: (status) =>
    set((state) => ({
      task: state.task ? { ...state.task, status } : null,
    })),
}))
