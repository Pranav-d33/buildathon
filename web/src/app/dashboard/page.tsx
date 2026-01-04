'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function Dashboard() {
    const [userProfile] = useState({
        name: '',
        email: '',
        phone: '',
        state: '',
        address: '',
    })

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <div className="container mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <Link href="/" className="text-2xl font-bold text-white">
                        <span className="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                            Opero
                        </span>
                    </Link>
                    <div className="flex gap-4">
                        <span className="text-gray-400 text-sm">
                            Extension: <span className="text-red-400">Not Connected</span>
                        </span>
                    </div>
                </div>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Left Column - Task Options */}
                    <div className="lg:col-span-2 space-y-6">
                        <h2 className="text-2xl font-semibold text-white mb-4">What would you like to do?</h2>

                        {/* RTI Task Card */}
                        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 hover:border-purple-500/50 transition-all duration-300 cursor-pointer group">
                            <div className="flex items-start gap-4">
                                <div className="text-4xl">📝</div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-semibold text-white group-hover:text-purple-400 transition-colors">
                                        File an RTI Application
                                    </h3>
                                    <p className="text-gray-400 mt-2">
                                        Get information from any government department. Opero will guide you through the RTI portal.
                                    </p>
                                    <button className="mt-4 px-6 py-2 bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors">
                                        Start RTI →
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Scholarship Task Card */}
                        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 hover:border-purple-500/50 transition-all duration-300 cursor-pointer group">
                            <div className="flex items-start gap-4">
                                <div className="text-4xl">🎓</div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-semibold text-white group-hover:text-purple-400 transition-colors">
                                        Find Scholarships
                                    </h3>
                                    <p className="text-gray-400 mt-2">
                                        Discover scholarships you're eligible for based on your profile.
                                    </p>
                                    <button className="mt-4 px-6 py-2 bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors">
                                        Check Eligibility →
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Generic Task Card */}
                        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 hover:border-purple-500/50 transition-all duration-300 cursor-pointer group">
                            <div className="flex items-start gap-4">
                                <div className="text-4xl">✨</div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-semibold text-white group-hover:text-purple-400 transition-colors">
                                        Other Tasks
                                    </h3>
                                    <p className="text-gray-400 mt-2">
                                        Tell Opero what you need help with on any website.
                                    </p>
                                    <button className="mt-4 px-6 py-2 bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors">
                                        Describe Task →
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - User Profile */}
                    <div className="space-y-6">
                        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
                            <h3 className="text-lg font-semibold text-white mb-4">Your Profile</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-gray-400 text-sm">Name</label>
                                    <input
                                        type="text"
                                        placeholder="Enter your name"
                                        className="w-full mt-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                                        defaultValue={userProfile.name}
                                    />
                                </div>
                                <div>
                                    <label className="text-gray-400 text-sm">Email</label>
                                    <input
                                        type="email"
                                        placeholder="Enter your email"
                                        className="w-full mt-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                                        defaultValue={userProfile.email}
                                    />
                                </div>
                                <div>
                                    <label className="text-gray-400 text-sm">Phone</label>
                                    <input
                                        type="tel"
                                        placeholder="Enter your phone"
                                        className="w-full mt-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                                        defaultValue={userProfile.phone}
                                    />
                                </div>
                                <div>
                                    <label className="text-gray-400 text-sm">State</label>
                                    <select
                                        className="w-full mt-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500"
                                        defaultValue={userProfile.state}
                                    >
                                        <option value="">Select State</option>
                                        <option value="Maharashtra">Maharashtra</option>
                                        <option value="Delhi">Delhi</option>
                                        <option value="Karnataka">Karnataka</option>
                                        <option value="Tamil Nadu">Tamil Nadu</option>
                                        <option value="Gujarat">Gujarat</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-gray-400 text-sm">Address</label>
                                    <textarea
                                        placeholder="Enter your address"
                                        rows={3}
                                        className="w-full mt-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                                        defaultValue={userProfile.address}
                                    />
                                </div>
                                <button className="w-full py-2 bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors">
                                    Save Profile
                                </button>
                            </div>
                        </div>

                        <p className="text-gray-500 text-xs text-center">
                            Sensitive details like Aadhaar are entered manually on websites, not stored here.
                        </p>
                    </div>
                </div>
            </div>
        </main>
    )
}
