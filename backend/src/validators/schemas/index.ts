/**
 * Barrel — re-exporta todos os schemas por domínio.
 * Mantém backward-compat com `import { ... } from '../validators/schemas/index.js'`
 */

export {
	registerSchema,
	oauthSessaoSchema,
	oauthCompletarSchema,
	loginSchema,
	verifyEmailSchema,
	verifyEmailSessionSchema,
	resendVerificationSchema,
} from './authSchemas.js';
export { createAppointmentSchema, updateAppointmentSchema, updateStatusSchema } from './appointmentSchemas.js';
export { createClientSchema, updateClientSchema } from './clientSchemas.js';
export { addExpenseSchema, updateExpenseSchema } from './financeSchemas.js';
export { createServiceSchema, updateServiceSchema } from './serviceSchemas.js';
export { createProfessionalSchema, updateProfessionalSchema } from './professionalSchemas.js';
export {
	updateBusinessSettingsSchema,
	updateBusinessProfileSchema,
	updateAccountProfileSchema,
	updateAccountPasswordSchema,
} from './businessSettingsSchemas.js';
export { createCheckoutSessionSchema } from './subscriptionSchemas.js';
export {
	createBillingCheckoutSessionSchema,
	billingActionBodySchema,
	billingPixPaymentParamsSchema,
} from './billingSchemas.js';
export {
	adminMetricsQuerySchema,
	adminTenantListQuerySchema,
	adminTenantFiltrosSchema,
	adminSubscriptionListQuerySchema,
	adminAuditLogQuerySchema,
	adminActionParamsSchema,
	adminActionBodySchema,
	adminOverridePlanBodySchema,
	adminOverrideStatusBodySchema,
	adminCancelSubscriptionBodySchema,
} from './adminSchemas.js';
