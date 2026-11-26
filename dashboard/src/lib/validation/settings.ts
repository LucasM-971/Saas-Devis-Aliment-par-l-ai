import { z } from 'zod';
import { emailSchema } from './auth';

export const profileSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  email: emailSchema,
});

export const companySchema = z.object({
  name: z.string().min(1, 'Raison sociale requise'),
  siret: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{14}$/.test(v.replace(/\s/g, '')), 'SIRET invalide (14 chiffres)'),
  address: z.string().optional(),
  defaultVatRate: z.coerce.number().min(0, 'Taux invalide').max(1, 'Saisir un ratio (ex. 0.2)'),
  // Mentions légales françaises (facultatives) affichées sur les devis.
  legalForm: z.string().optional(),
  shareCapital: z.string().optional(),
  rcsRm: z.string().optional(),
  apeCode: z.string().optional(),
  vatNumber: z.string().optional(),
  vatExempt: z.boolean().optional(),
  insuranceName: z.string().optional(),
  insuranceContract: z.string().optional(),
  insuranceCoverage: z.string().optional(),
  mediatorName: z.string().optional(),
  mediatorUrl: z
    .string()
    .optional()
    .refine((v) => !v || /^https?:\/\/.+/.test(v), 'URL invalide (commence par http)'),
});

// Formulaire « Ajouter une entreprise » : minimal, sans SIRET (renseigné plus tard si besoin).
export const newCompanySchema = z.object({
  name: z.string().min(1, 'Raison sociale requise'),
  address: z.string().optional(),
  contactEmail: z
    .string()
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Email invalide'),
  contactPhone: z.string().optional(),
});

export type ProfileValues = z.infer<typeof profileSchema>;
export type CompanyValues = z.infer<typeof companySchema>;
export type CompanyFormInput = z.input<typeof companySchema>;
export type NewCompanyValues = z.infer<typeof newCompanySchema>;
