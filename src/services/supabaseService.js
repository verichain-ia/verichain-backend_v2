require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Cliente público para operaciones generales (respeta RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class SupabaseService {
  constructor() {
    this.supabase = supabase;
  }
  
  // ... resto del código existente
}

module.exports = new SupabaseService();