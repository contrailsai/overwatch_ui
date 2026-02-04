'use client'

import { Sidebar } from '@/components/Sidebar'

export default function TakedownsLayout({ children }) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {children}
      </main>
    </div>
  )
}
