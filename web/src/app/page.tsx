'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-white mb-6">
            <span className="bg-gradient-to-r from-purple-400 via-pink-500 to-purple-600 bg-clip-text text-transparent">
              Opero
            </span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8">
            AI copilot for getting things done on complex websites.
            Tell it what you want, and it performs the steps live — with you in control.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-purple-500/50 transition-all duration-300 hover:scale-105"
          >
            Get Started
          </Link>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold text-white mb-2">User in Control</h3>
            <p className="text-gray-400">
              You always see what's happening. Pause, resume, or take over anytime.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
            <div className="text-4xl mb-4">🌐</div>
            <h3 className="text-xl font-semibold text-white mb-2">Real Websites</h3>
            <p className="text-gray-400">
              Works on actual websites, in real time. No mockups or simulations.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
            <div className="text-4xl mb-4">🇮🇳</div>
            <h3 className="text-xl font-semibold text-white mb-2">India First</h3>
            <p className="text-gray-400">
              Built for complex forms, clunky portals, and multilingual support.
            </p>
          </div>
        </div>

        {/* Trust Banner */}
        <div className="mt-16 text-center">
          <p className="text-gray-500 text-sm">
            AI assists, user authorizes. Sensitive details are entered manually by you.
          </p>
        </div>
      </div>
    </main>
  )
}
