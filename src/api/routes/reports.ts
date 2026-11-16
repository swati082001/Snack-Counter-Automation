import { FastifyInstance } from 'fastify';
import { monthlyReport } from '../../reporting/reporter';
import { AppDeps } from '../appDeps';

export function registerReportRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get<{ Querystring: { month: string } }>(
    '/reports/monthly',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['month'],
          // The YYYY-MM format itself is checked by the reporter (ValidationError, 400).
          properties: { month: { type: 'string' } },
        },
      },
    },
    async (request) => monthlyReport(request.query.month, await deps.purchases.list(), deps.config),
  );
}
