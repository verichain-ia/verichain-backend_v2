require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Cliente administrativo - solo para operaciones que requieren bypass de RLS
// IMPORTANTE: Usar con precaución y solo cuando sea absolutamente necesario
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

class SupabaseAdminService {
  constructor() {
    this.client = supabaseAdmin;
  }

  // Método específico para crear usuarios durante registro
  async createUserProfile(userData) {
    const { data, error } = await this.client
      .from('users')
      .insert(userData)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating user profile:', error);
      throw error;
    }
    
    return data;
  }

  // Método para operaciones administrativas
  async getUserForAuth(userId) {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return data;
  }
}

module.exports = new SupabaseAdminService();