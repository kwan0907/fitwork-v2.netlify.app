import { createClient } from '@supabase/supabase-js'

// 這是從你原本 index.html 提取的連線資訊
const SUPABASE_URL = 'https://ajnunehxtiofcphdyhqn.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqbnVuZWh4dGlvZmNwaGR5aHFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMzk4MzcsImV4cCI6MjA5MTcxNTgzN30.vn74xMzEm-fj7Gzhosxvn5UQWozAf_8LrDHXG3kycT4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)