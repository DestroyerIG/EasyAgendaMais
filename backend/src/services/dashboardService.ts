import { dashboardRepository } from '../repositories/dashboardRepository.js';
import { getLocalDate } from '../utils/date.js';

export const dashboardService = {
  async getDashboard(businessId: string) {
    const today = getLocalDate();
    const data = await dashboardRepository.getDashboardData(businessId, today as unknown as Date);

    return {
      appointmentsToday: data.appointmentsToday,
      earningsToday: data.earningsToday,
      expensesToday: data.expensesToday,
      profitToday: data.earningsToday - data.expensesToday,
      totalClients: data.totalClients,
      weeklyEarnings: data.weeklyEarnings,
    };
  },
};
