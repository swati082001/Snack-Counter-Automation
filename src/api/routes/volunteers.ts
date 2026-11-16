import { FastifyInstance } from 'fastify';
import { Availability, Office } from '../../domain/types';
import { setVolunteerStatus } from '../../volunteers/volunteerStatus';
import { AppDeps } from '../appDeps';
import { availabilitySchema, bodySchema, idParamsSchema, officeSchema } from '../schemas';

export function registerVolunteerRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.put<{ Params: { id: string }; Body: { availability: Availability; currentOffice: Office } }>(
    '/volunteers/:id/status',
    {
      schema: {
        params: idParamsSchema,
        body: bodySchema({ availability: availabilitySchema, currentOffice: officeSchema }, [
          'availability',
          'currentOffice',
        ]),
      },
    },
    async (request) => setVolunteerStatus(deps.volunteers, request.params.id, request.body),
  );

  app.get('/volunteers', async () => deps.volunteers.list());
}
