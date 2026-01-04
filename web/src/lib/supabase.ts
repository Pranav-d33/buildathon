import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Create a placeholder client if env vars are missing (for build time)
export const supabase: SupabaseClient = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null as unknown as SupabaseClient

// Auth helpers
export async function signInWithOtp(email: string) {
    const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: {
            shouldCreateUser: true,
        },
    })
    return { data, error }
}

export async function verifyOtp(email: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
    })
    return { data, error }
}

export async function signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
}

export async function getUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
}

export async function getSession() {
    const { data: { session }, error } = await supabase.auth.getSession()
    return { session, error }
}
