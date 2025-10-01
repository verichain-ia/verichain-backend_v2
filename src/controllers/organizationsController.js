const supabaseService = require('../services/supabaseService');
const supabaseAdmin = require('../services/supabaseAdmin');
const crypto = require('crypto');

const organizationsController = {
  // Crear organización
  async create(req, res) {
    try {
      const { 
        name, 
        email, 
        phone, 
        address, 
        website, 
        description,
        logo_url,
        admin_email 
      } = req.body;

      // Validaciones
      if (!name || !email) {
        return res.status(400).json({
          success: false,
          error: 'Name and email are required'
        });
      }

      // Generar API key única
      const apiKey = `org_${crypto.randomBytes(32).toString('hex')}`;

      // Crear organización
      const { data, error } = await supabaseAdmin.client
        .from('organizations')
        .insert({
          id: crypto.randomUUID(),
          name,
          email,
          phone,
          address,
          website,
          description,
          logo_url,
          api_key: apiKey,
          status: 'pending', // pending, active, suspended
          settings: {
            require_approval: true,
            auto_issue: false,
            notification_emails: [email]
          },
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Si se proporciona admin_email, asignar como admin
      if (admin_email) {
        await supabaseAdmin.client
          .from('users')
          .update({ 
            organization_id: data.id,
            role: 'org_admin' 
          })
          .eq('email', admin_email);
      }

      res.status(201).json({
        success: true,
        data: {
          ...data,
          api_key: undefined // No devolver API key en respuesta normal
        },
        api_key: apiKey // Devolver solo en creación
      });
    } catch (error) {
      console.error('Create organization error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Listar organizaciones con paginación y filtros
  async list(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        status, 
        search 
      } = req.query;

      const offset = (page - 1) * limit;

      let query = supabaseService.supabase
        .from('organizations')
        .select('*', { count: 'exact' });

      // Filtros
      if (status) {
        query = query.eq('status', status);
      }

      if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
      }

      // Paginación
      const { data, error, count } = await query
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.json({
        success: true,
        data,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('List organizations error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Obtener organización por ID
  async getById(req, res) {
    try {
      const { id } = req.params;

      const { data, error } = await supabaseService.supabase
        .from('organizations')
        .select(`
          *,
          certificates:certificates(count),
          users:users(count)
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: 'Organization not found'
          });
        }
        throw error;
      }

      // Obtener estadísticas
      const { data: stats } = await supabaseService.supabase
        .from('certificates')
        .select('blockchain_status')
        .eq('organization_id', id);

      const statistics = {
        total_certificates: stats?.length || 0,
        confirmed: stats?.filter(c => c.blockchain_status === 'confirmed').length || 0,
        pending: stats?.filter(c => c.blockchain_status === 'pending').length || 0
      };

      res.json({
        success: true,
        data: {
          ...data,
          statistics,
          api_key: undefined // Nunca exponer API key
        }
      });
    } catch (error) {
      console.error('Get organization error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Actualizar organización
  async update(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Remover campos que no se deben actualizar
      delete updates.id;
      delete updates.api_key;
      delete updates.created_at;

      // Validar que el usuario tenga permisos
      const userRole = req.user?.role;
      const userOrgId = req.user?.organization_id;

      if (userRole !== 'super_admin' && userOrgId !== id) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions'
        });
      }

      const { data, error } = await supabaseAdmin.client
        .from('organizations')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({
            success: false,
            error: 'Organization not found'
          });
        }
        throw error;
      }

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Update organization error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Eliminar organización (soft delete)
  async delete(req, res) {
    try {
      const { id } = req.params;

      // Solo super admin puede eliminar
      if (req.user?.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          error: 'Only super admins can delete organizations'
        });
      }

      // Verificar que no tenga certificados activos
      const { data: certificates } = await supabaseService.supabase
        .from('certificates')
        .select('id')
        .eq('organization_id', id)
        .limit(1);

      if (certificates && certificates.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete organization with existing certificates'
        });
      }

      // Soft delete - cambiar status
      const { error } = await supabaseAdmin.client
        .from('organizations')
        .update({ 
          status: 'deleted',
          deleted_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      res.json({
        success: true,
        message: 'Organization deleted successfully'
      });
    } catch (error) {
      console.error('Delete organization error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Regenerar API Key
  async regenerateApiKey(req, res) {
    try {
      const { id } = req.params;

      // Verificar permisos
      if (req.user?.role !== 'super_admin' && req.user?.organization_id !== id) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions'
        });
      }

      const newApiKey = `org_${crypto.randomBytes(32).toString('hex')}`;

      const { data, error } = await supabaseAdmin.client
        .from('organizations')
        .update({ 
          api_key: newApiKey,
          api_key_regenerated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        api_key: newApiKey,
        message: 'API key regenerated successfully'
      });
    } catch (error) {
      console.error('Regenerate API key error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  // Obtener estadísticas de la organización
  async getStats(req, res) {
    try {
      const { id } = req.params;
      const { period = '30days' } = req.query;

      // Calcular fecha de inicio según el período
      const now = new Date();
      let startDate = new Date();
      
      switch(period) {
        case '7days':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30days':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90days':
          startDate.setDate(now.getDate() - 90);
          break;
        case 'year':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
      }

      // Obtener certificados del período
      const { data: certificates } = await supabaseService.supabase
        .from('certificates')
        .select('*')
        .eq('organization_id', id)
        .gte('created_at', startDate.toISOString());

      // Obtener verificaciones
      const { data: verifications } = await supabaseService.supabase
        .from('verifications')
        .select('*, certificates!inner(*)')
        .eq('certificates.organization_id', id)
        .gte('created_at', startDate.toISOString());

      // Calcular estadísticas
      const stats = {
        period,
        certificates: {
          total: certificates?.length || 0,
          confirmed: certificates?.filter(c => c.blockchain_status === 'confirmed').length || 0,
          pending: certificates?.filter(c => c.blockchain_status === 'pending').length || 0,
          failed: certificates?.filter(c => c.blockchain_status === 'failed').length || 0
        },
        verifications: {
          total: verifications?.length || 0,
          unique_certificates: new Set(verifications?.map(v => v.certificate_id)).size || 0
        },
        timeline: generateTimeline(certificates, period)
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get organization stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};

// Función auxiliar para generar timeline
function generateTimeline(certificates, period) {
  if (!certificates || certificates.length === 0) return [];

  const timeline = {};
  
  certificates.forEach(cert => {
    const date = new Date(cert.created_at);
    let key;
    
    if (period === '7days' || period === '30days') {
      key = date.toISOString().split('T')[0]; // Por día
    } else if (period === '90days') {
      key = `${date.getFullYear()}-W${getWeekNumber(date)}`; // Por semana
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // Por mes
    }
    
    if (!timeline[key]) {
      timeline[key] = { issued: 0, confirmed: 0 };
    }
    
    timeline[key].issued++;
    if (cert.blockchain_status === 'confirmed') {
      timeline[key].confirmed++;
    }
  });

  return Object.entries(timeline).map(([date, data]) => ({
    date,
    ...data
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

module.exports = organizationsController;