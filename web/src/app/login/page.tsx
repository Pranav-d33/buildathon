'use client'

import AuthForm from '@/components/AuthForm'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
    const router = useRouter()

    const handleAuthSuccess = () => {
        setTimeout(() => {
            router.push('/dashboard')
        }, 1500)
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
            <div className="w-full max-w-md px-6">
                <div className="text-center mb-8">
                    <Link href="/">
                        <h1 className="text-4xl font-bold text-white mb-2">
                            <span className="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                                Opero
                            </span>
                        </h1>
                    </Link>
                    <p className="text-gray-400">Sign in to get started</p>
                </div>

                <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8 border border-white/20">
                    <AuthForm onSuccess={handleAuthSuccess} />
                </div>

                <p className="text-center text-gray-500 text-sm mt-6">
                    No password needed. We'll send you a secure code.
                </p>
            </div>
        </main>
    )
}
