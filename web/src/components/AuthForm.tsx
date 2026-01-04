'use client'

import { useState } from 'react'
import { signInWithOtp, verifyOtp } from '@/lib/supabase'

type AuthStep = 'email' | 'otp' | 'success'

interface AuthFormProps {
    onSuccess?: () => void
}

export default function AuthForm({ onSuccess }: AuthFormProps) {
    const [step, setStep] = useState<AuthStep>('email')
    const [email, setEmail] = useState('')
    const [otp, setOtp] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        const { error } = await signInWithOtp(email)

        if (error) {
            setError(error.message)
        } else {
            setStep('otp')
        }
        setLoading(false)
    }

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        const { data, error } = await verifyOtp(email, otp)

        if (error) {
            setError(error.message)
        } else if (data.user) {
            setStep('success')
            onSuccess?.()
        }
        setLoading(false)
    }

    if (step === 'success') {
        return (
            <div className="text-center py-8">
                <div className="text-4xl mb-4">✅</div>
                <h3 className="text-xl font-semibold text-white">You're signed in!</h3>
                <p className="text-gray-400 mt-2">Redirecting to dashboard...</p>
            </div>
        )
    }

    return (
        <div className="w-full max-w-md mx-auto">
            {step === 'email' ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                    <div>
                        <label className="block text-gray-300 text-sm mb-2">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                            required
                        />
                    </div>

                    {error && (
                        <p className="text-red-400 text-sm">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50"
                    >
                        {loading ? 'Sending...' : 'Send OTP'}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <p className="text-gray-400 text-sm text-center mb-4">
                        We sent a code to <span className="text-white">{email}</span>
                    </p>

                    <div>
                        <label className="block text-gray-300 text-sm mb-2">Enter OTP</label>
                        <input
                            type="text"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            placeholder="123456"
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-center text-2xl tracking-widest"
                            maxLength={6}
                            required
                        />
                    </div>

                    {error && (
                        <p className="text-red-400 text-sm">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50"
                    >
                        {loading ? 'Verifying...' : 'Verify OTP'}
                    </button>

                    <button
                        type="button"
                        onClick={() => setStep('email')}
                        className="w-full py-2 text-gray-400 hover:text-white transition-colors"
                    >
                        ← Use different email
                    </button>
                </form>
            )}
        </div>
    )
}
