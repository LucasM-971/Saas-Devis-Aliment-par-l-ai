import { z } from 'zod';

export const emailSchema = z.string().min(1, 'Email requis').email('Email invalide');
export const passwordSchema = z.string().min(8, 'Au moins 8 caractères');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis'),
  stayLogged: z.boolean().optional(),
});

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    rgpd: z.literal(true, { error: 'Vous devez accepter les conditions' }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export const forgotSchema = z.object({ email: emailSchema });

export const resetSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotValues = z.infer<typeof forgotSchema>;
export type ResetValues = z.infer<typeof resetSchema>;
