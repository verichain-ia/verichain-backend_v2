const supabaseService = require('../services/supabaseService');

const metricsController = {
  async getDashboardMetrics(req, res) {
    try {
      // Get certificates metrics
      const metrics = await supabaseService.getMetrics();
      
      // Get organizations count
      const { data: organizations } = await supabaseService.supabase
        .from('organizations')
        .select('id');
      
      // Get recent verifications
      const { data: recentVerifications } = await supabaseService.supabase
        .from('verifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      res.json({
        success: true,
        data: {
          certificates: {
            total: metrics.total,
            confirmed: metrics.confirmed,
            pending: metrics.pending,
            thisMonth: metrics.thisMonth
          },
          organizations: {
            total: organizations?.length || 0
          },
          verifications: {
            total: metrics.verifications,
            recent: recentVerifications || []
          },
          analytics: {
            conversionRate: metrics.total > 0 ? ((metrics.confirmed / metrics.total) * 100).toFixed(2) : 0,
            averageVerificationsPerCert: metrics.total > 0 ? (metrics.verifications / metrics.total).toFixed(2) : 0
          }
        }
      });
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  async getCertificateMetrics(req, res) {
    try {
      const metrics = await supabaseService.getMetrics();
      
      // Get metrics by status
      const { data: certificates } = await supabaseService.supabase
        .from('certificates')
        .select('blockchain_status, created_at');
      
      // Group by month
      const monthlyData = {};
      certificates?.forEach(cert => {
        const date = new Date(cert.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { total: 0, confirmed: 0, pending: 0 };
        }
        
        monthlyData[monthKey].total++;
        if (cert.blockchain_status === 'confirmed') {
          monthlyData[monthKey].confirmed++;
        } else {
          monthlyData[monthKey].pending++;
        }
      });
      
      res.json({
        success: true,
        data: {
          summary: metrics,
          monthly: monthlyData,
          lastUpdated: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting certificate metrics:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  async getOrganizationMetrics(req, res) {
    try {
      const { data: organizations } = await supabaseService.supabase
        .from('organizations')
        .select('*, certificates(count)');
      
      const orgMetrics = organizations?.map(org => ({
        id: org.id,
        name: org.name,
        certificatesIssued: org.certificates?.length || 0,
        status: org.status || 'active',
        createdAt: org.created_at
      }));
      
      res.json({
        success: true,
        data: {
          total: organizations?.length || 0,
          active: organizations?.filter(o => o.status === 'active').length || 0,
          organizations: orgMetrics || []
        }
      });
    } catch (error) {
      console.error('Error getting organization metrics:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  async getVerificationMetrics(req, res) {
    try {
      const { data: verifications } = await supabaseService.supabase
        .from('verifications')
        .select('*, certificates(id, student_name, course_name)');
      
      // Group by date
      const dailyVerifications = {};
      verifications?.forEach(ver => {
        const date = new Date(ver.created_at).toISOString().split('T')[0];
        if (!dailyVerifications[date]) {
          dailyVerifications[date] = 0;
        }
        dailyVerifications[date]++;
      });
      
      // Get top verified certificates
      const certVerifications = {};
      verifications?.forEach(ver => {
        const certId = ver.certificate_id;
        if (!certVerifications[certId]) {
          certVerifications[certId] = {
            count: 0,
            certificate: ver.certificates
          };
        }
        certVerifications[certId].count++;
      });
      
      const topCertificates = Object.values(certVerifications)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      res.json({
        success: true,
        data: {
          total: verifications?.length || 0,
          daily: dailyVerifications,
          topCertificates,
          lastVerification: verifications?.[0] || null
        }
      });
    } catch (error) {
      console.error('Error getting verification metrics:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};

module.exports = metricsController;