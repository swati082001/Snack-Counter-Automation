import { FastifyInstance } from 'fastify';
import { Office, PurchaseInput, RefillState } from '../../domain/types';
import { AppDeps } from '../appDeps';
import { bodySchema, currencySchema, idParamsSchema, idSchema, officeSchema, refillStateSchema } from '../schemas';

interface IdParams {
  id: string;
}

const itemSchema = {
  type: 'object',
  required: ['name', 'quantity'],
  properties: {
    name: { type: 'string' },
    quantity: { type: 'integer' },
    lineTotalMinor: { type: 'integer' },
  },
  additionalProperties: false,
};

const volunteerBody = bodySchema({ volunteerId: idSchema }, ['volunteerId']);

// Each handler only parses input, calls the coordinator and returns its result.
export function registerRefillRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { coordinator } = deps;

  // Simulates the /empty chat command.
  app.post<{ Body: { office: Office; reportedBy: string } }>(
    '/refills',
    { schema: { body: bodySchema({ office: officeSchema, reportedBy: idSchema }, ['office', 'reportedBy']) } },
    async (request, reply) => {
      const { refill, created } = await coordinator.reportEmpty(request.body.office, request.body.reportedBy);
      return reply.status(created ? 201 : 200).send(refill);
    },
  );

  app.get<{ Params: IdParams }>('/refills/:id', { schema: { params: idParamsSchema } }, async (request) =>
    coordinator.getRefill(request.params.id),
  );

  app.get<{ Querystring: { office?: Office; state?: RefillState } }>(
    '/refills',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { office: officeSchema, state: refillStateSchema },
          additionalProperties: false,
        },
      },
    },
    async (request) => deps.refills.list(request.query),
  );

  app.post<{ Params: IdParams; Body: { volunteerId: string } }>(
    '/refills/:id/accept',
    { schema: { params: idParamsSchema, body: volunteerBody } },
    async (request) => coordinator.acceptOffer(request.params.id, request.body.volunteerId),
  );

  app.post<{ Params: IdParams; Body: { volunteerId: string } }>(
    '/refills/:id/decline',
    { schema: { params: idParamsSchema, body: volunteerBody } },
    async (request) => coordinator.declineOffer(request.params.id, request.body.volunteerId),
  );

  app.post<{ Params: IdParams; Body: PurchaseInput & { volunteerId: string } }>(
    '/refills/:id/purchase',
    {
      schema: {
        params: idParamsSchema,
        body: bodySchema(
          {
            volunteerId: idSchema,
            amountMinor: { type: 'integer' },
            currency: currencySchema,
            items: { type: 'array', items: itemSchema },
            receiptRef: { type: 'string' },
          },
          ['volunteerId', 'amountMinor', 'currency', 'items', 'receiptRef'],
        ),
      },
    },
    async (request, reply) => {
      const { volunteerId, ...input } = request.body;
      const result = await coordinator.submitPurchase(request.params.id, volunteerId, input);
      return reply.status(201).send(result);
    },
  );

  app.post<{ Params: IdParams; Body: { byEmployeeId: string; reason: string } }>(
    '/refills/:id/cancel',
    {
      schema: {
        params: idParamsSchema,
        body: bodySchema({ byEmployeeId: idSchema, reason: { type: 'string' } }, ['byEmployeeId', 'reason']),
      },
    },
    async (request) => coordinator.cancelRefill(request.params.id, request.body.byEmployeeId, request.body.reason),
  );
}
