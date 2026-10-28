import { z } from 'zod';
import { BUSINESS_TYPES, isBusinessType } from '@saldio/shared';

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    legalName: z.string().trim().max(160).optional().or(z.literal('')),
    taxType: z.string().trim().max(30).optional().or(z.literal('')),
    taxId: z
      .string()
      .trim()
      .max(40)
      .optional()
      .or(z.literal('')),
    ownerName: z.string().trim().min(3).max(120),
    username: z
      .string()
      .trim()
      .min(4)
      .max(32)
      .regex(/^[A-Za-z0-9._-]+$/, 'Usuario inválido'),
    email: z.string().trim().email().max(180),
    phone: z.string().trim().min(7).max(30),
    address: z.string().trim().min(5).max(200),
    city: z.string().trim().min(2).max(80),
    businessType: z.enum(BUSINESS_TYPES),
    password: z.string().min(10).max(128),
    confirmPassword: z.string().min(10).max(128),
    planCode: z.string().trim().max(40).optional(),
    termsAccepted: z.union([z.literal('true'), z.literal('on'), z.literal('1'), z.boolean()]),
    dataAccepted: z.union([z.literal('true'), z.literal('on'), z.literal('1'), z.boolean()]),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'La confirmación de contraseña no coincide.',
      });
    }
    if (!isBusinessType(value.businessType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['businessType'],
        message: 'Tipo de negocio inválido.',
      });
    }
    if (value.termsAccepted === false || value.dataAccepted === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['termsAccepted'],
        message: 'Debe aceptar los términos y el tratamiento de datos.',
      });
    }
  });

export type RegisterInput = z.infer<typeof registerSchema>;
